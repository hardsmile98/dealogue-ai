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
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import { AiLibraryService } from '../../library/library.service.js';
import type { BlockCandidate, BlockPool, HistoryMessage, LibraryBlock, LibraryExample, PlaybookSnapshot, SlotsSnapshot } from '../agent.types.js';
import type { RecentTurnSummary } from '../planner/planner.js';
import { shuffleWeighted } from '../lib/random.js';
import type { Rng } from '../lib/random.js';
import { chooseBlocks, orderFor, targetOf } from '../library/targeting.js';
import type { PromptCategory, PromptFact } from '../composer/prompt-builder.js';

export interface TurnContext {
  playbook: PlaybookSnapshot;
  stages: { stage: string; goal: string }[];
  facts: PromptFact[];
  categories: PromptCategory[];
  notes: string[];
  examples: LibraryExample[];
  /** Кандидаты по видам: конкретный вариант выбирается после ответа модели. */
  blockPools: BlockPool[];
  /** Предварительный выбор — для промпта и проверки «блок вообще есть». */
  blocks: LibraryBlock[];
  /** Язык аккаунта — к нему отступает подбор, если на языке клиента текстов нет. */
  accountLanguage: string;
  /** Языки, на которых в библиотеке вообще есть тексты; клиент на другом языке уходит менеджеру. */
  libraryLanguages: string[];
  hasDiscountBlock: boolean;
  /** Виды блоков, все варианты которых в этом чате уже отправлены. */
  exhaustedBlockKinds: string[];
}

/**
 * Что из библиотеки участвовало в ходе: нужно после отправки — для счётчиков,
 * пометки «диагностика ушла» и выбора следующего касания. Отдельно от
 * `TurnContext`, потому что подтверждённый черновик (этап 5) собирает то же
 * самое из базы, а не из промпта.
 */
export interface TurnLibraryRefs {
  exampleIds: string[];
  /** id блоков-фраз, предложенных ходу. */
  phraseBlockIds: string[];
  /** id шаблонов диагностики, предложенных ходу. */
  diagnosticIds: string[];
  hasDiscountBlock: boolean;
}

/** Блоки берём те, что реально попали в ход, — выбор мог смениться после ответа модели. */
export function refsOf(ctx: TurnContext, blocks: LibraryBlock[] = ctx.blocks): TurnLibraryRefs {
  return {
    exampleIds: ctx.examples.map((e) => e.id),
    phraseBlockIds: blocks.filter((b) => b.source === 'phrase').map((b) => b.id),
    diagnosticIds: blocks.filter((b) => b.source === 'diagnostic').map((b) => b.id),
    hasDiscountBlock: ctx.hasDiscountBlock,
  };
}

function toCandidate(
  row: { id: string; title: string; text: string; categoryKey: string | null; gender: string | null; language: string; weight: number },
  title?: string,
): BlockCandidate & { weight: number } {
  return {
    id: row.id,
    title: title ?? row.title,
    text: row.text,
    categoryKey: row.categoryKey,
    gender: row.gender,
    language: row.language,
    weight: row.weight,
  };
}

export interface LoadContextParams {
  accountId: string;
  stage: FunnelStage;
  touchKind: TouchKind | null;
  slots: SlotsSnapshot;
  usedExampleIds: string[];
  sentBlockIds: string[];
  /** Язык аккаунта — последняя ступень в цепочке подбора. */
  accountLanguage: string;
  rng: Rng;
}

const HISTORY_LIMIT = 40;
const RECENT_TURNS = 6;
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
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
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

    const accountLanguage = params.accountLanguage || 'ru';
    const target = targetOf(slots, accountLanguage);

    // --- образцы ------------------------------------------------------------
    const exampleKinds: PhraseKind[] = [...playbook.exampleKinds];
    if (params.touchKind && isPhraseKind(params.touchKind) && !exampleKinds.includes(params.touchKind)) exampleKinds.unshift(params.touchKind);
    const examples: LibraryExample[] = [];
    for (const kind of exampleKinds) {
      const pool = shuffleWeighted(params.rng, phrases.filter((p) => p.usage === 'example' && p.kind === kind && conditionsOk(p, slots)));
      // Порядок: сначала ближе к клиенту (категория, пол, язык), внутри яруса — случайно.
      const ordered = orderFor(pool, target);
      if (ordered.length === 0) continue;
      const fresh = ordered.filter((p) => !params.usedExampleIds.includes(p.id));
      const chosen = (fresh.length > 0 ? fresh : ordered).slice(0, EXAMPLES_PER_KIND);
      for (const item of chosen) examples.push({ id: item.id, kind: item.kind, title: item.title, text: item.text });
      if (examples.length >= EXAMPLES_MAX) break;
    }

    // --- блоки ---------------------------------------------------------------
    // Пулы вариантов, уже перемешанные по весам. Конкретный вариант выбирает
    // TurnGeneration после ответа модели — по обновлённой карточке клиента.
    const blockKinds = new Set<string>([...playbook.requiredBlockKinds, ...playbook.allowedBlockKinds]);
    const blockPools: BlockPool[] = [];
    const exhaustedBlockKinds: string[] = [];
    for (const kind of blockKinds) {
      const all = phrases.filter((p) => p.usage === 'block' && p.kind === kind);
      const fresh = all.filter((p) => !params.sentBlockIds.includes(p.id));
      // Блок в чате уже уходил — второй раз не предлагаем (цены и ссылки не повторяют).
      if (all.length > 0 && fresh.length === 0) {
        exhaustedBlockKinds.push(kind);
        continue;
      }
      if (fresh.length === 0) continue;
      blockPools.push({ kind, source: 'phrase', items: shuffleWeighted(params.rng, fresh).map((row) => toCandidate(row)) });
    }
    if (params.touchKind === 'diagnostics' || stage === 'diagnostics') {
      // Диагностику, в отличие от блоков-фраз, при исчерпании повторяем.
      const fresh = diagnostics.filter((d) => !params.sentBlockIds.includes(d.id));
      const pool = fresh.length > 0 ? fresh : diagnostics;
      if (pool.length > 0) {
        const items = shuffleWeighted(params.rng, pool).map((d) => toCandidate(d, `Диагностика: ${d.title}`));
        blockPools.push({ kind: 'diagnostics', source: 'diagnostic', items });
      }
    }

    const noteTexts = notes
      .filter((n) => n.scope === 'global' || n.scope === `stage:${stage}` || (slots.requestCategoryKey && n.scope === `category:${slots.requestCategoryKey}`))
      .map((n) => n.text);

    const libraryLanguages = [...new Set([...phrases.map((p) => p.language), ...diagnostics.map((d) => d.language)])];
    const hasDiscountBlock = phrases.some((p) => p.usage === 'block' && p.kind === 'discount');

    return {
      playbook,
      stages: playbooks.filter((p) => p.enabled).map((p) => ({ stage: p.stage, goal: p.goal })),
      facts: facts.map((f) => ({ group: f.group, title: f.title, value: f.value })),
      categories: categories.map((c) => ({ key: c.key, title: c.title, description: c.description })),
      notes: noteTexts,
      examples,
      blockPools,
      // Для промпта и Planner'а: как выбор выглядит по карточке до хода.
      blocks: chooseBlocks(blockPools, target),
      libraryLanguages,
      hasDiscountBlock,
      exhaustedBlockKinds,
      accountLanguage,
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

  /** Последние ходы чата — Planner по ним видит, что бот уже пробовал. */
  async recentTurns(chatId: string, limit = RECENT_TURNS): Promise<RecentTurnSummary[]> {
    const rows = await this.turns.find({ where: { chatId }, order: { createdAt: 'DESC' }, take: limit });
    return rows.reverse().map((t) => ({
      stageBefore: t.stageBefore,
      stageAfter: t.stageAfter,
      clientIntent: typeof t.analysis?.clientIntent === 'string' ? (t.analysis.clientIntent as string) : null,
      trigger: t.trigger,
    }));
  }

}

/** Подпись клиента в Telegram — сырьё для выводов модели об имени и поле. */
export function peerOf(chat: { peerName: string | null; peerUsername: string | null }): { name: string | null; username: string | null } {
  return { name: chat.peerName, username: chat.peerUsername };
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

function isPhraseKind(value: string): value is PhraseKind {
  return ['birth_nudge', 'reengage', 'offer', 'offer_question', 'price_question', 'discount', 'reminder', 'price'].includes(value);
}
