import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import type { FunnelStage, PhraseKind, TouchKind } from '../../domain/types.js';
import { AiCategoryEntity } from '../../entities/ai-category.entity.js';
import { AiDiagnosticEntity } from '../../entities/ai-diagnostic.entity.js';
import { AiFactEntity } from '../../entities/ai-fact.entity.js';
import { AiNoteEntity } from '../../entities/ai-note.entity.js';
import { AiPhraseEntity } from '../../entities/ai-phrase.entity.js';
import { AiLibraryService } from '../../library/library.service.js';
import type { HistoryMessage, LibraryBlock, LibraryExample, PlaybookSnapshot, SlotsSnapshot } from '../agent.types.js';
import { buildAllowlists } from '../guard/guard.js';
import type { Allowlists } from '../guard/guard.js';
import { pickWeighted } from '../lib/random.js';
import type { Rng } from '../lib/random.js';
import type { PromptCategory, PromptFact } from '../composer/prompt-builder.js';

export interface TurnContext {
  playbook: PlaybookSnapshot;
  stages: { stage: string; goal: string }[];
  facts: PromptFact[];
  categories: PromptCategory[];
  notes: string[];
  examples: LibraryExample[];
  blocks: LibraryBlock[];
  allow: Allowlists;
  /** Есть ли в библиотеке тексты на английском — иначе английский лид уходит менеджеру. */
  hasEnglishTexts: boolean;
  hasDiscountBlock: boolean;
}

export interface LoadContextParams {
  accountId: string;
  stage: FunnelStage;
  touchKind: TouchKind | null;
  slots: SlotsSnapshot;
  usedExampleIds: string[];
  sentBlockIds: string[];
  personaLinks: { url: string }[];
  rng: Rng;
}

const HISTORY_LIMIT = 40;
const EXAMPLES_PER_KIND = 2;
const EXAMPLES_MAX = 6;

/** Собирает для хода всё из библиотеки: плейбук, образцы, блоки, факты, заметки, историю. */
@Injectable()
export class TurnContextService {
  constructor(
    @InjectRepository(AiPhraseEntity)
    private readonly phrases: Repository<AiPhraseEntity>,
    @InjectRepository(AiDiagnosticEntity)
    private readonly diagnostics: Repository<AiDiagnosticEntity>,
    @InjectRepository(AiFactEntity)
    private readonly facts: Repository<AiFactEntity>,
    @InjectRepository(AiCategoryEntity)
    private readonly categories: Repository<AiCategoryEntity>,
    @InjectRepository(AiNoteEntity)
    private readonly notes: Repository<AiNoteEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    private readonly library: AiLibraryService,
  ) {}

  async load(params: LoadContextParams): Promise<TurnContext> {
    const { accountId, stage, slots } = params;
    const [playbooks, phrases, facts, categories, notes, diagnostics] = await Promise.all([
      this.library.listPlaybooks(accountId),
      this.phrases.find({ where: { accountId, enabled: true }, order: { sortOrder: 'ASC' } }),
      this.facts.find({ where: { accountId, enabled: true }, order: { sortOrder: 'ASC' } }),
      this.categories.find({ where: { accountId, enabled: true }, order: { sortOrder: 'ASC' } }),
      this.notes.find({ where: { accountId, enabled: true }, order: { createdAt: 'ASC' } }),
      this.diagnostics.find({ where: { accountId, enabled: true }, order: { sortOrder: 'ASC' } }),
    ]);

    const playbookRow = playbooks.find((p) => p.stage === stage) ?? playbooks[0];
    const playbook: PlaybookSnapshot = {
      stage,
      goal: playbookRow?.goal ?? '',
      instructions: playbookRow?.instructions ?? '',
      requiredBlockKinds: playbookRow?.requiredBlockKinds ?? [],
      allowedBlockKinds: playbookRow?.allowedBlockKinds ?? [],
      exampleKinds: playbookRow?.exampleKinds ?? [],
      noQuestions: playbookRow?.noQuestions ?? false,
      enabled: playbookRow?.enabled ?? true,
    };

    const language = slots.language || 'ru';
    const fits = (row: { language: string; gender: string | null; categoryKey: string | null }): boolean =>
      row.language === language && (row.gender === null || row.gender === slots.gender) && (row.categoryKey === null || row.categoryKey === slots.requestCategoryKey);

    // --- образцы ------------------------------------------------------------
    const exampleKinds: PhraseKind[] = [...playbook.exampleKinds];
    if (params.touchKind && isPhraseKind(params.touchKind) && !exampleKinds.includes(params.touchKind)) exampleKinds.unshift(params.touchKind);
    const examples: LibraryExample[] = [];
    for (const kind of exampleKinds) {
      const pool = phrases.filter((p) => p.usage === 'example' && p.kind === kind && fits(p) && conditionsOk(p, slots));
      if (pool.length === 0) continue;
      // Сначала неиспользованные и точнее подходящие (с категорией / полом), потом любые.
      const fresh = pool.filter((p) => !params.usedExampleIds.includes(p.id));
      const ranked = rankSpecific(fresh.length > 0 ? fresh : pool);
      const chosen: AiPhraseEntity[] = [];
      const candidates = [...ranked];
      while (chosen.length < EXAMPLES_PER_KIND && candidates.length > 0) {
        const picked = pickWeighted(params.rng, candidates.slice(0, Math.max(3, EXAMPLES_PER_KIND)));
        if (!picked) break;
        chosen.push(picked);
        candidates.splice(candidates.indexOf(picked), 1);
      }
      for (const item of chosen) examples.push({ id: item.id, kind: item.kind, title: item.title, text: item.text });
      if (examples.length >= EXAMPLES_MAX) break;
    }

    // --- блоки ---------------------------------------------------------------
    const blockKinds = new Set<string>([...playbook.requiredBlockKinds, ...playbook.allowedBlockKinds]);
    const blocks: LibraryBlock[] = [];
    for (const kind of blockKinds) {
      const pool = phrases.filter((p) => p.usage === 'block' && p.kind === kind && fits(p));
      const fresh = pool.filter((p) => !params.sentBlockIds.includes(p.id));
      const picked = pickWeighted(params.rng, rankSpecific(fresh.length > 0 ? fresh : pool));
      if (picked) blocks.push({ kind, id: picked.id, title: picked.title || kind, text: picked.text, source: 'phrase' });
    }
    if (params.touchKind === 'diagnostics' || stage === 'diagnostics') {
      const template = this.chooseDiagnostic(diagnostics, slots, language, params.sentBlockIds, params.rng);
      if (template) {
        blocks.push({ kind: 'diagnostics', id: template.id, title: `Диагностика: ${template.title}`, text: template.text, source: 'diagnostic' });
      }
    }

    const noteTexts = notes
      .filter((n) => n.scope === 'global' || n.scope === `stage:${stage}` || (slots.requestCategoryKey && n.scope === `category:${slots.requestCategoryKey}`))
      .map((n) => n.text);

    const hasEnglishTexts = phrases.some((p) => p.language === 'en') || diagnostics.some((d) => d.language === 'en');
    const hasDiscountBlock = phrases.some((p) => p.usage === 'block' && p.kind === 'discount');

    return {
      playbook,
      stages: playbooks.filter((p) => p.enabled).map((p) => ({ stage: p.stage, goal: p.goal })),
      facts: facts.map((f) => ({ group: f.group, title: f.title, value: f.value })),
      categories: categories.map((c) => ({ key: c.key, title: c.title, description: c.description })),
      notes: noteTexts,
      examples,
      blocks,
      allow: buildAllowlists(facts, params.personaLinks, blocks),
      hasEnglishTexts,
      hasDiscountBlock,
    };
  }

  /** Последние сообщения чата в виде истории для модели (без сообщений пачки). */
  async loadHistory(chatId: string, excludeIds: string[] = [], limit = HISTORY_LIMIT): Promise<HistoryMessage[]> {
    const rows = await this.messages.find({
      where: { chatId },
      order: { sentAt: 'DESC', telegramMessageId: 'DESC' },
      take: limit + excludeIds.length,
    });
    return rows
      .filter((row) => !excludeIds.includes(row.id))
      .slice(0, limit)
      .reverse()
      .map(toHistoryMessage);
  }

  /** Диагностика: категория+пол → категория → универсальная+пол → универсальная; язык совпадает. */
  chooseDiagnostic(
    all: AiDiagnosticEntity[],
    slots: SlotsSnapshot,
    language: string,
    sentIds: string[],
    rng: Rng,
  ): AiDiagnosticEntity | null {
    const byLanguage = all.filter((d) => d.language === language);
    const tiers: ((d: AiDiagnosticEntity) => boolean)[] = [
      (d) => d.categoryKey !== null && d.categoryKey === slots.requestCategoryKey && d.gender === slots.gender,
      (d) => d.categoryKey !== null && d.categoryKey === slots.requestCategoryKey && d.gender === null,
      (d) => d.categoryKey === null && d.gender !== null && d.gender === slots.gender,
      (d) => d.categoryKey === null && d.gender === null,
    ];
    for (const tier of tiers) {
      const pool = byLanguage.filter(tier);
      if (pool.length === 0) continue;
      const fresh = pool.filter((d) => !sentIds.includes(d.id));
      return pickWeighted(rng, fresh.length > 0 ? fresh : pool) ?? null;
    }
    return null;
  }
}

export function toHistoryMessage(row: TelegramMessageEntity): HistoryMessage {
  return {
    id: row.id,
    telegramMessageId: row.telegramMessageId,
    role: row.direction === 'in' ? 'client' : row.aiTurnId ? 'bot' : 'manager',
    text: row.text,
    sentAt: row.sentAt,
    readAt: row.readAt,
    mediaKind: row.mediaKind,
    turnId: row.aiTurnId,
  };
}

function conditionsOk(phrase: AiPhraseEntity, slots: SlotsSnapshot): boolean {
  const c = phrase.conditions ?? {};
  if (c.requiresRequest && !slots.requestSummary) return false;
  return true;
}

/** Более конкретные (с категорией, с полом) — вперёд. */
function rankSpecific<T extends { categoryKey: string | null; gender: string | null; weight: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => specificity(b) - specificity(a));
}

function specificity(item: { categoryKey: string | null; gender: string | null }): number {
  return (item.categoryKey ? 2 : 0) + (item.gender ? 1 : 0);
}

function isPhraseKind(value: string): value is PhraseKind {
  return ['birth_nudge', 'reengage', 'offer', 'offer_question', 'price_question', 'discount', 'reminder', 'price'].includes(value);
}
