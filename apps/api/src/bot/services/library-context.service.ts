import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { MilestoneBody } from '../core/copied-chat.js';
import { extractUrls, normalizeUrl } from '../core/hard-checks.js';
import type { LibraryAvailability } from '../core/plan.js';
import type { PlanMilestone } from '../core/types.js';
import { BotExampleEntity } from '../entities/bot-example.entity.js';
import { BotLibraryItemEntity } from '../entities/bot-library-item.entity.js';
import type { LibraryKind, Milestone, Stage } from '../library/kinds.js';
import { renderPersona } from '../library/persona.js';
import type { Persona } from '../library/persona.js';
import { selectDiagnostic } from '../library/select-diagnostic.js';
import type { ExampleSample, LibrarySample } from '../prompts/blocks.js';

/** Какие виды библиотеки идут ответчику как образцы тона на этапе. */
const SAMPLE_KINDS: Record<Stage, LibraryKind[]> = {
  intake: ['greeting', 'ask_birth_data', 'no_birth_data', 'ask_request', 'empathy'],
  links: ['wait', 'price_deflect', 'empathy'],
  diagnostic: ['return_question', 'nudge', 'price_deflect', 'empathy'],
  offer: ['nudge', 'objection', 'empathy'],
  prices: [],
};

/** Образцы длиннее этого в промпт не идут — это тела, а не тон. */
const SAMPLE_MAX_LENGTH = 700;

/**
 * Библиотека одного аккаунта, загруженная на ход: выбор вех, образцы для
 * промптов, разрешённые суммы и адреса для жёстких проверок.
 */
export class LibraryContext implements LibraryAvailability {
  constructor(
    private readonly items: readonly BotLibraryItemEntity[],
    private readonly examples: readonly BotExampleEntity[],
    private readonly persona: Persona,
  ) {}

  milestone(key: Milestone, query: { category: string | null; gender: 'f' | 'm' | null; language: string }): PlanMilestone | null {
    if (key === 'diagnostic') {
      const item = selectDiagnostic(this.enabled('diagnostic'), query);
      return item ? { key, itemId: item.id, title: item.title } : null;
    }
    // Ссылки без страниц в образе — бессмыслица: вместо них уходит сообщение об ожидании.
    const kind: LibraryKind = key === 'links' && this.persona.links.length === 0 ? 'wait' : key;
    const candidates = this.enabled(kind).filter((item) => item.language === query.language);
    if (candidates.length === 0) return null;
    // Ссылки и ожидание: при отсутствии запроса есть свой вариант («сделал общий анализ»).
    const preferredCategory = (key === 'links') && query.category === null ? 'no_request' : null;
    const exact = candidates.filter((item) => item.category === preferredCategory && (item.gender === null || item.gender === query.gender));
    const general = candidates.filter((item) => item.category === null && (item.gender === null || item.gender === query.gender));
    const pool = exact.length > 0 ? exact : general.length > 0 ? general : candidates;
    const item = pool[0] as BotLibraryItemEntity;
    return { key, itemId: item.id, title: item.title };
  }

  supportsLanguage(language: string): boolean {
    return this.enabled('diagnostic').some((item) => item.language === language);
  }

  /** Тело вехи с подставленным образом; null, если элемент пропал. */
  body(itemId: string): string | null {
    const item = this.items.find((candidate) => candidate.id === itemId);
    return item ? renderPersona(item.text, this.persona) : null;
  }

  samples(stage: Stage, language: string): LibrarySample[] {
    const kinds = SAMPLE_KINDS[stage];
    return this.items
      .filter((item) => item.enabled && kinds.includes(item.kind) && item.language === language && item.text.length <= SAMPLE_MAX_LENGTH)
      .slice(0, 12)
      .map((item) => ({ kind: item.kind, title: item.title, text: renderPersona(item.text, this.persona) }));
  }

  about(language: string): LibrarySample[] {
    return this.items
      .filter((item) => item.enabled && item.kind === 'about' && item.language === language)
      .map((item) => ({ kind: item.kind, title: item.title, text: renderPersona(item.text, this.persona) }));
  }

  /** Подходы к возражению по категории, по порядку. */
  objectionApproaches(category: string, language: string): LibrarySample[] {
    return this.items
      .filter((item) => item.enabled && item.kind === 'objection' && item.category === category && item.language === language)
      .map((item) => ({ kind: item.kind, title: item.title, text: item.text }));
  }

  stageExamples(stage: Stage): ExampleSample[] {
    return this.examples
      .filter((example) => example.enabled && example.stage === stage)
      .slice(0, 5)
      .map((example) => ({ situation: example.situation, client: example.client, practitioner: example.practitioner }));
  }

  /** Запасная фраза, когда текст ответчика вырезан целиком: в знакомстве — приветствие из библиотеки, дальше — короткая эмпатия. */
  fallbackPhrase(language: string, stage: Stage): string {
    const kinds: LibraryKind[] = stage === 'intake' ? ['greeting', 'empathy'] : stage === 'links' ? ['wait', 'empathy'] : ['empathy'];
    for (const kind of kinds) {
      const item = this.enabled(kind).find((candidate) => candidate.language === language && candidate.text.length <= 300);
      if (item) return renderPersona(item.text, this.persona);
    }
    return language === 'en' ? 'I hear you 🙏' : 'Понял вас 🙏';
  }

  /** Тела вех — чтобы найти их в переписке, скопированной из реального чата. «Ожидание» уходит вместо «ссылок», когда ссылок нет. */
  milestoneBodies(): MilestoneBody[] {
    const kinds: [LibraryKind, Milestone][] = [
      ['links', 'links'],
      ['wait', 'links'],
      ['diagnostic', 'diagnostic'],
      ['offer', 'offer'],
      ['prices', 'prices'],
    ];
    return kinds.flatMap(([kind, key]) => this.enabled(kind).map((item) => ({ key, text: renderPersona(item.text, this.persona) })));
  }

  allowedUrls(): Set<string> {
    const urls = new Set<string>(this.persona.links.map((link) => normalizeUrl(link.url)));
    for (const item of this.items) {
      for (const url of extractUrls(item.text)) urls.add(url);
    }
    return urls;
  }

  private enabled(kind: LibraryKind): BotLibraryItemEntity[] {
    return this.items.filter((item) => item.enabled && item.kind === kind);
  }
}

@Injectable()
export class LibraryContextService {
  constructor(
    @InjectRepository(BotLibraryItemEntity)
    private readonly items: Repository<BotLibraryItemEntity>,
    @InjectRepository(BotExampleEntity)
    private readonly examples: Repository<BotExampleEntity>,
  ) {}

  async load(accountId: string, persona: Persona): Promise<LibraryContext> {
    const [items, examples] = await Promise.all([
      this.items.find({ where: { accountId }, order: { kind: 'ASC', sort: 'ASC', createdAt: 'ASC' } }),
      this.examples.find({ where: { accountId, enabled: true }, order: { stage: 'ASC', sort: 'ASC' } }),
    ]);
    return new LibraryContext(items, examples, persona);
  }
}
