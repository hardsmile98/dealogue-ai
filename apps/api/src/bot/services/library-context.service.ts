import { Injectable } from '@nestjs/common';
import type { MilestoneBody } from '../core/copied-chat.js';
import { extractUrls, normalizeUrl } from '../core/hard-checks.js';
import type { LibraryAvailability, PhraseQuery } from '../core/plan.js';
import type { PlanMilestone } from '../core/types.js';
import type { BotLibraryItemEntity } from '../entities/bot-library-item.entity.js';
import type { LibraryKind, Milestone, Stage } from '../library/kinds.js';
import { renderPersona } from '../library/persona.js';
import type { Persona } from '../library/persona.js';
import { selectDiagnostic } from '../library/select-diagnostic.js';
import type { LibrarySample } from '../prompts/blocks.js';
import { BotLibraryRepository } from '../repositories/bot-library.repository.js';

/** Сколько вариантов фразы шага видит ответчик. */
const PHRASE_VARIANTS = 3;

/**
 * Библиотека одного аккаунта, загруженная на ход: выбор вех, фразы шагов
 * воронки, разрешённые суммы и адреса для жёстких проверок.
 */
export class LibraryContext implements LibraryAvailability {
  constructor(
    private readonly items: readonly BotLibraryItemEntity[],
    private readonly persona: Persona,
  ) {}

  milestone(
    key: Milestone,
    query: {
      category: string | null;
      gender: 'f' | 'm' | null;
      language: string;
    },
  ): PlanMilestone | null {
    if (key === 'diagnostic') {
      const item = selectDiagnostic(this.enabled('diagnostic'), query);
      return item ? this.planMilestone(key, item) : null;
    }
    // Ссылки без страниц в образе — бессмыслица: вместо них уходит сообщение об ожидании.
    const kind: LibraryKind =
      key === 'links' && this.persona.links.length === 0 ? 'wait' : key;
    const candidates = this.enabled(kind).filter(
      (item) => item.language === query.language,
    );
    if (candidates.length === 0) return null;
    // У ожидания без запроса свой вариант. Ссылки «без запроса» («сделал
    // общий анализ, результаты ниже») идут только рядом с самой
    // диагностикой, поэтому вехой «ссылки» уходит общий вариант.
    const preferredCategory =
      kind === 'wait' && query.category === null ? 'no_request' : null;
    const exact = candidates.filter(
      (item) =>
        item.category === preferredCategory &&
        (item.gender === null || item.gender === query.gender),
    );
    const general = candidates.filter(
      (item) =>
        item.category === null &&
        (item.gender === null || item.gender === query.gender),
    );
    const pool =
      exact.length > 0 ? exact : general.length > 0 ? general : candidates;
    return this.planMilestone(key, pool[0] as BotLibraryItemEntity);
  }

  /** Веха для плана: какой элемент библиотеки уйдёт её телом. */
  private planMilestone(
    key: Milestone,
    item: BotLibraryItemEntity,
  ): PlanMilestone {
    return { key, itemId: item.id, title: item.title, kind: item.kind };
  }

  phrases(kind: LibraryKind, query: PhraseQuery): string[] {
    const pool = this.enabled(kind).filter(
      (item) =>
        item.category === query.category &&
        (item.gender === null || item.gender === query.gender),
    );
    const own = pool.filter((item) => item.language === query.language);
    // На языке клиента фразы нет — русская, ответчик переведёт.
    const chosen =
      own.length > 0 ? own : pool.filter((item) => item.language === 'ru');
    return chosen
      .slice(0, PHRASE_VARIANTS)
      .map((item) => renderPersona(item.text, this.persona));
  }

  /**
   * Довести клиента на этом языке до цен можно, только если на нём есть
   * все вехи: ссылки (или ожидание), диагностика, описание практик, цены.
   * Иначе воронка встанет посередине — сразу менеджер.
   */
  supportsLanguage(language: string): boolean {
    const has = (kind: LibraryKind) =>
      this.enabled(kind).some((item) => item.language === language);
    return (
      (has('links') || has('wait')) &&
      has('diagnostic') &&
      has('offer') &&
      has('prices')
    );
  }

  /** Тело вехи с подставленным образом; null, если элемент пропал. */
  body(itemId: string): string | null {
    const item = this.items.find((candidate) => candidate.id === itemId);
    return item ? renderPersona(item.text, this.persona) : null;
  }

  /**
   * Источник фактов о практике для ответчика и проверяющего: раздел «о себе
   * и о работе», а после вариантов — и сам текст вариантов, который клиент
   * уже получил. Иначе на «как проходит работа?» модель видит только
   * концовку вариантов в истории и достраивает остальное сама.
   */
  about(
    language: string,
    stage: Stage = 'intake',
    gender: 'f' | 'm' | null = null,
  ): LibrarySample[] {
    const samples: LibrarySample[] = this.items
      .filter(
        (item) =>
          item.enabled && item.kind === 'about' && item.language === language,
      )
      .map((item) => ({
        kind: item.kind,
        title: item.title,
        text: renderPersona(item.text, this.persona),
      }));
    if (stage === 'offer') {
      const offer = this.milestone('offer', {
        category: null,
        gender,
        language,
      });
      const text = offer ? this.body(offer.itemId) : null;
      if (text) {
        samples.push({
          kind: 'offer',
          title: 'Какие варианты работы есть (ты уже отправил их клиенту)',
          text,
        });
      }
    }
    return samples;
  }

  /**
   * Запасная фраза, когда текст ответчика вырезан целиком и фразы шага
   * нет: нейтральное «понял вас» в роде образа. Фразы библиотеки для этого
   * не годятся: приветствие здоровается второй раз, «эмпатия» в таблицах —
   * «вы выбрали комплекс», это после цен.
   */
  fallbackPhrase(language: string): string {
    if (language === 'en') return 'I hear you 🙏';
    return this.persona.gender === 'f' ? 'Поняла вас 🙏' : 'Понял вас 🙏';
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
    return kinds.flatMap(([kind, key]) =>
      this.enabled(kind).map((item) => ({
        key,
        text: renderPersona(item.text, this.persona),
      })),
    );
  }

  allowedUrls(): Set<string> {
    const urls = new Set<string>(
      this.persona.links.map((link) => normalizeUrl(link.url)),
    );
    for (const item of this.items) {
      for (const url of extractUrls(item.text)) urls.add(url);
    }
    return urls;
  }

  private enabled(kind: LibraryKind): BotLibraryItemEntity[] {
    return this.items.filter((item) => item.enabled && item.kind === kind);
  }
}

/** Загрузка библиотеки аккаунта на один ход. */
@Injectable()
export class LibraryContextService {
  constructor(private readonly items: BotLibraryRepository) {}

  async load(accountId: string, persona: Persona): Promise<LibraryContext> {
    return new LibraryContext(await this.items.list(accountId), persona);
  }
}
