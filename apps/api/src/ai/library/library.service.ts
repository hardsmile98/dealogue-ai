import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FindOptionsWhere, ObjectLiteral } from 'typeorm';
import type { FunnelStage, PhraseKind } from '../domain/types.js';
import type {
  CategoryInput,
  CopyLibraryInput,
  DiagnosticInput,
  DiagnosticsQuery,
  FactInput,
  NoteInput,
  PhraseInput,
  PhrasesQuery,
  UpdateCategoryInput,
  UpdateDiagnosticInput,
  UpdateFactInput,
  UpdateNoteInput,
  UpdatePhraseInput,
  UpdatePlaybookInput,
} from './library.schema.js';
import { AiCategoryEntity } from '../entities/ai-category.entity.js';
import { AiDiagnosticEntity } from '../entities/ai-diagnostic.entity.js';
import { AiFactEntity } from '../entities/ai-fact.entity.js';
import { AiNoteEntity } from '../entities/ai-note.entity.js';
import { AiPhraseEntity } from '../entities/ai-phrase.entity.js';
import type { LibrarySource } from '../entities/ai-phrase.entity.js';
import { AiPlaybookEntity } from '../entities/ai-playbook.entity.js';
import { normalizeText, splitIntoMessages } from './lib/split-messages.js';
import type { LibraryOverviewDto, SeedResultDto, UpsertStats } from './library.types.js';
import { DEFAULT_PLAYBOOKS } from './seed/default-playbooks.js';
import { LIBRARY_SEED } from './seed/library-seed.js';
import type { SeedCategory, SeedDiagnostic, SeedFact, SeedPhrase, SeedPlaybook } from './seed/seed.types.js';

type UpsertMode = 'skip' | 'replace';

/**
 * Библиотека аккаунта: категории, примеры и блоки, факты, диагностики,
 * плейбуки, заметки. Все операции — в пределах одного accountId; владение
 * аккаунтом проверяет контроллер.
 */
@Injectable()
export class AiLibraryService {
  constructor(
    @InjectRepository(AiCategoryEntity) private readonly categories: Repository<AiCategoryEntity>,
    @InjectRepository(AiPhraseEntity) private readonly phrases: Repository<AiPhraseEntity>,
    @InjectRepository(AiFactEntity) private readonly facts: Repository<AiFactEntity>,
    @InjectRepository(AiDiagnosticEntity) private readonly diagnostics: Repository<AiDiagnosticEntity>,
    @InjectRepository(AiPlaybookEntity) private readonly playbooks: Repository<AiPlaybookEntity>,
    @InjectRepository(AiNoteEntity) private readonly notes: Repository<AiNoteEntity>,
  ) {}

  // --- категории ------------------------------------------------------------

  listCategories(accountId: string): Promise<AiCategoryEntity[]> {
    return this.categories.find({ where: { accountId }, order: { sortOrder: 'ASC', title: 'ASC' } });
  }

  async createCategory(accountId: string, input: CategoryInput): Promise<AiCategoryEntity> {
    await this.assertUniqueKey(this.categories, accountId, input.key);
    return this.categories.save(this.categories.create({ accountId, ...input }));
  }

  async updateCategory(accountId: string, id: string, input: UpdateCategoryInput): Promise<AiCategoryEntity> {
    const row = await this.requireOwned(this.categories, accountId, id, 'Категория');
    if (input.key && input.key !== row.key) await this.assertUniqueKey(this.categories, accountId, input.key);
    Object.assign(row, input);
    return this.categories.save(row);
  }

  async deleteCategory(accountId: string, id: string): Promise<void> {
    const row = await this.requireOwned(this.categories, accountId, id, 'Категория');
    await this.categories.delete({ id: row.id });
  }

  // --- фразы ------------------------------------------------------------------

  listPhrases(accountId: string, query: PhrasesQuery = {}): Promise<AiPhraseEntity[]> {
    const where: FindOptionsWhere<AiPhraseEntity> = { accountId };
    if (query.usage) where.usage = query.usage;
    if (query.kind) where.kind = query.kind as PhraseKind;
    if (query.categoryKey) where.categoryKey = query.categoryKey;
    if (query.gender) where.gender = query.gender;
    if (query.language) where.language = query.language;
    if (query.enabled) where.enabled = query.enabled === 'true';
    return this.phrases.find({ where, order: { kind: 'ASC', sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  createPhrase(accountId: string, input: PhraseInput, source: LibrarySource = 'manual'): Promise<AiPhraseEntity> {
    return this.phrases.save(
      this.phrases.create({ accountId, ...input, kind: input.kind as PhraseKind, text: normalizeText(input.text), source }),
    );
  }

  async updatePhrase(accountId: string, id: string, input: UpdatePhraseInput): Promise<AiPhraseEntity> {
    const row = await this.requireOwned(this.phrases, accountId, id, 'Фраза');
    Object.assign(row, input, input.text !== undefined ? { text: normalizeText(input.text) } : {});
    return this.phrases.save(row);
  }

  async deletePhrase(accountId: string, id: string): Promise<void> {
    const row = await this.requireOwned(this.phrases, accountId, id, 'Фраза');
    await this.phrases.delete({ id: row.id });
  }

  // --- факты ------------------------------------------------------------------

  listFacts(accountId: string): Promise<AiFactEntity[]> {
    return this.facts.find({ where: { accountId }, order: { group: 'ASC', sortOrder: 'ASC', title: 'ASC' } });
  }

  async createFact(accountId: string, input: FactInput): Promise<AiFactEntity> {
    await this.assertUniqueKey(this.facts, accountId, input.key);
    return this.facts.save(this.facts.create({ accountId, ...input }));
  }

  async updateFact(accountId: string, id: string, input: UpdateFactInput): Promise<AiFactEntity> {
    const row = await this.requireOwned(this.facts, accountId, id, 'Факт');
    if (input.key && input.key !== row.key) await this.assertUniqueKey(this.facts, accountId, input.key);
    Object.assign(row, input);
    return this.facts.save(row);
  }

  async deleteFact(accountId: string, id: string): Promise<void> {
    const row = await this.requireOwned(this.facts, accountId, id, 'Факт');
    await this.facts.delete({ id: row.id });
  }

  // --- диагностики --------------------------------------------------------------

  listDiagnostics(accountId: string, query: DiagnosticsQuery = {}): Promise<AiDiagnosticEntity[]> {
    const where: FindOptionsWhere<AiDiagnosticEntity> = { accountId };
    if (query.categoryKey) where.categoryKey = query.categoryKey;
    if (query.gender) where.gender = query.gender;
    if (query.language) where.language = query.language;
    if (query.enabled) where.enabled = query.enabled === 'true';
    return this.diagnostics.find({ where, order: { sortOrder: 'ASC', title: 'ASC' } });
  }

  async createDiagnostic(accountId: string, input: DiagnosticInput, source: LibrarySource = 'manual'): Promise<AiDiagnosticEntity> {
    await this.assertUniqueKey(this.diagnostics, accountId, input.key);
    return this.diagnostics.save(this.diagnostics.create({ accountId, ...input, text: normalizeText(input.text), source }));
  }

  async updateDiagnostic(accountId: string, id: string, input: UpdateDiagnosticInput): Promise<AiDiagnosticEntity> {
    const row = await this.requireOwned(this.diagnostics, accountId, id, 'Диагностика');
    if (input.key && input.key !== row.key) await this.assertUniqueKey(this.diagnostics, accountId, input.key);
    Object.assign(row, input, input.text !== undefined ? { text: normalizeText(input.text) } : {});
    return this.diagnostics.save(row);
  }

  async deleteDiagnostic(accountId: string, id: string): Promise<void> {
    const row = await this.requireOwned(this.diagnostics, accountId, id, 'Диагностика');
    await this.diagnostics.delete({ id: row.id });
  }

  // --- плейбуки -----------------------------------------------------------------

  /** Всегда полный набор: недостающие этапы создаются из умолчаний. */
  async listPlaybooks(accountId: string): Promise<AiPlaybookEntity[]> {
    const existing = await this.playbooks.find({ where: { accountId } });
    const byStage = new Map(existing.map((row) => [row.stage, row]));
    const missing = DEFAULT_PLAYBOOKS.filter((p) => !byStage.has(p.stage));
    if (missing.length > 0) {
      const created = await this.playbooks.save(missing.map((p) => this.playbooks.create({ accountId, ...p })));
      for (const row of created) byStage.set(row.stage, row);
    }
    return DEFAULT_PLAYBOOKS.map((p) => byStage.get(p.stage)).filter((row): row is AiPlaybookEntity => Boolean(row));
  }

  async updatePlaybook(accountId: string, stage: FunnelStage, input: UpdatePlaybookInput): Promise<AiPlaybookEntity> {
    const rows = await this.listPlaybooks(accountId);
    const row = rows.find((r) => r.stage === stage);
    if (!row) throw new NotFoundException('Этап не найден');
    Object.assign(row, input);
    return this.playbooks.save(row);
  }

  async resetPlaybooks(accountId: string, stage?: FunnelStage): Promise<AiPlaybookEntity[]> {
    const rows = await this.listPlaybooks(accountId);
    for (const row of rows) {
      if (stage && row.stage !== stage) continue;
      const preset = DEFAULT_PLAYBOOKS.find((p) => p.stage === row.stage);
      if (preset) Object.assign(row, preset, { enabled: true });
    }
    await this.playbooks.save(rows);
    return this.listPlaybooks(accountId);
  }

  // --- заметки -------------------------------------------------------------------

  listNotes(accountId: string): Promise<AiNoteEntity[]> {
    return this.notes.find({ where: { accountId }, order: { createdAt: 'DESC' } });
  }

  createNote(accountId: string, input: NoteInput, source: 'manual' | 'from_rating' = 'manual'): Promise<AiNoteEntity> {
    return this.notes.save(this.notes.create({ accountId, ...input, source }));
  }

  async updateNote(accountId: string, id: string, input: UpdateNoteInput): Promise<AiNoteEntity> {
    const row = await this.requireOwned(this.notes, accountId, id, 'Заметка');
    Object.assign(row, input);
    return this.notes.save(row);
  }

  async deleteNote(accountId: string, id: string): Promise<void> {
    const row = await this.requireOwned(this.notes, accountId, id, 'Заметка');
    await this.notes.delete({ id: row.id });
  }

  // --- обзор, сид, копирование, разбиение -------------------------------------------

  async overview(accountId: string): Promise<LibraryOverviewDto> {
    const [categories, phrases, facts, diagnostics, notes, playbooks] = await Promise.all([
      this.categories.count({ where: { accountId } }),
      this.phrases.find({ where: { accountId, enabled: true }, select: { id: true, usage: true, kind: true, language: true } }),
      this.facts.count({ where: { accountId } }),
      this.diagnostics.find({
        where: { accountId, enabled: true },
        select: { id: true, categoryKey: true, language: true },
      }),
      this.notes.count({ where: { accountId } }),
      this.listPlaybooks(accountId),
    ]);
    const enabledBlocks = new Set(phrases.filter((p) => p.usage === 'block').map((p) => p.kind));
    const enabledExamples = new Set(phrases.filter((p) => p.usage === 'example').map((p) => p.kind));
    const missingBlocks: LibraryOverviewDto['missingBlocks'] = [];
    const missingExamples: LibraryOverviewDto['missingExamples'] = [];
    for (const playbook of playbooks) {
      if (!playbook.enabled) continue;
      for (const kind of playbook.requiredBlockKinds) {
        if (!enabledBlocks.has(kind)) missingBlocks.push({ stage: playbook.stage, kind });
      }
      for (const kind of playbook.exampleKinds) {
        if (!enabledExamples.has(kind)) missingExamples.push({ stage: playbook.stage, kind });
      }
    }
    const diagnosticsByLanguage: LibraryOverviewDto['diagnosticsByLanguage'] = {};
    for (const row of diagnostics) {
      const bucket = (diagnosticsByLanguage[row.language] ??= { total: 0, universal: 0 });
      bucket.total += 1;
      if (!row.categoryKey) bucket.universal += 1;
    }
    const seeded = await this.phrases.findOne({
      where: { accountId, source: 'seed' },
      order: { createdAt: 'DESC' },
      select: { id: true, createdAt: true },
    });
    const allPhrases = await this.phrases.count({ where: { accountId } });
    const allBlocks = await this.phrases.count({ where: { accountId, usage: 'block' } });
    const allDiagnostics = await this.diagnostics.count({ where: { accountId } });
    return {
      counts: {
        categories,
        phrases: allPhrases - allBlocks,
        blocks: allBlocks,
        facts,
        diagnostics: allDiagnostics,
        notes,
      },
      missingBlocks,
      missingExamples,
      diagnosticsByLanguage,
      seededAt: seeded?.createdAt.toISOString() ?? null,
    };
  }

  /** Стандартная библиотека из docs/source (раздел 13 ТЗ). Идемпотентно по ключам. */
  async seed(accountId: string, mode: UpsertMode): Promise<SeedResultDto> {
    return {
      categories: await this.upsertCategories(accountId, LIBRARY_SEED.categories, mode),
      phrases: await this.upsertPhrases(accountId, LIBRARY_SEED.phrases, mode, 'seed'),
      facts: await this.upsertFacts(accountId, LIBRARY_SEED.facts, mode),
      diagnostics: await this.upsertDiagnostics(accountId, LIBRARY_SEED.diagnostics, mode, 'seed'),
      playbooks: await this.upsertPlaybooks(accountId, DEFAULT_PLAYBOOKS, mode),
    };
  }

  /** Скопировать выбранное из другого аккаунта того же владельца. */
  async copyFrom(targetAccountId: string, sourceAccountId: string, input: CopyLibraryInput): Promise<SeedResultDto> {
    if (targetAccountId === sourceAccountId) throw new BadRequestException('Аккаунт-источник совпадает с целевым');
    const empty: UpsertStats = { created: 0, updated: 0, skipped: 0 };
    const result: SeedResultDto = {
      categories: empty,
      phrases: empty,
      facts: empty,
      diagnostics: empty,
      playbooks: empty,
      notes: empty,
    };
    if (input.categories) {
      const rows = await this.listCategories(sourceAccountId);
      result.categories = await this.upsertCategories(targetAccountId, rows, input.mode);
    }
    if (input.phrases) {
      const rows = await this.listPhrases(sourceAccountId);
      result.phrases = await this.upsertPhrases(targetAccountId, rows, input.mode, 'copied');
    }
    if (input.facts) {
      const rows = await this.listFacts(sourceAccountId);
      result.facts = await this.upsertFacts(targetAccountId, rows, input.mode);
    }
    if (input.diagnostics) {
      const rows = await this.listDiagnostics(sourceAccountId);
      result.diagnostics = await this.upsertDiagnostics(targetAccountId, rows, input.mode, 'copied');
    }
    if (input.playbooks) {
      const rows = await this.listPlaybooks(sourceAccountId);
      result.playbooks = await this.upsertPlaybooks(targetAccountId, rows, input.mode);
    }
    if (input.notes) {
      const rows = await this.listNotes(sourceAccountId);
      let created = 0;
      for (const row of rows) {
        await this.notes.save(this.notes.create({ accountId: targetAccountId, text: row.text, scope: row.scope, enabled: row.enabled, source: 'manual' }));
        created += 1;
      }
      result.notes = { created, updated: 0, skipped: 0 };
    }
    return result;
  }

  previewSplit(text: string): { messages: string[]; lengths: number[] } {
    const messages = splitIntoMessages(text);
    return { messages, lengths: messages.map((m) => m.length) };
  }

  // --- внутреннее -----------------------------------------------------------

  private async upsertCategories(accountId: string, items: SeedCategory[], mode: UpsertMode): Promise<UpsertStats> {
    const stats = { created: 0, updated: 0, skipped: 0 };
    const existing = new Map((await this.listCategories(accountId)).map((row) => [row.key, row]));
    for (const item of items) {
      const row = existing.get(item.key);
      const fields = {
        groupKey: item.groupKey,
        title: item.title,
        description: item.description,
        clarifyingFactKey: item.clarifyingFactKey ?? null,
        clarifyingQuestion: item.clarifyingQuestion ?? null,
        enabled: item.enabled,
        sortOrder: item.sortOrder,
      };
      if (!row) {
        await this.categories.save(this.categories.create({ accountId, key: item.key, ...fields }));
        stats.created += 1;
      } else if (mode === 'replace') {
        Object.assign(row, fields);
        await this.categories.save(row);
        stats.updated += 1;
      } else {
        stats.skipped += 1;
      }
    }
    return stats;
  }

  private async upsertPhrases(
    accountId: string,
    items: SeedPhrase[],
    mode: UpsertMode,
    source: LibrarySource,
  ): Promise<UpsertStats> {
    const stats = { created: 0, updated: 0, skipped: 0 };
    const existing = new Map((await this.listPhrases(accountId)).map((row) => [`${row.kind} ${row.title}`, row]));
    for (const item of items) {
      const row = existing.get(`${item.kind} ${item.title}`);
      const fields = {
        usage: item.usage,
        kind: item.kind,
        categoryKey: item.categoryKey ?? null,
        gender: item.gender ?? null,
        language: item.language,
        title: item.title,
        text: normalizeText(item.text),
        conditions: item.conditions ?? {},
        enabled: item.enabled,
        sortOrder: item.sortOrder,
      };
      if (!row) {
        await this.phrases.save(this.phrases.create({ accountId, ...fields, source }));
        stats.created += 1;
      } else if (mode === 'replace') {
        Object.assign(row, fields);
        await this.phrases.save(row);
        stats.updated += 1;
      } else {
        stats.skipped += 1;
      }
    }
    return stats;
  }

  private async upsertFacts(accountId: string, items: SeedFact[], mode: UpsertMode): Promise<UpsertStats> {
    const stats = { created: 0, updated: 0, skipped: 0 };
    const existing = new Map((await this.listFacts(accountId)).map((row) => [row.key, row]));
    for (const item of items) {
      const row = existing.get(item.key);
      const fields = { group: item.group, title: item.title, value: item.value, enabled: item.enabled, sortOrder: item.sortOrder };
      if (!row) {
        await this.facts.save(this.facts.create({ accountId, key: item.key, ...fields }));
        stats.created += 1;
      } else if (mode === 'replace') {
        Object.assign(row, fields);
        await this.facts.save(row);
        stats.updated += 1;
      } else {
        stats.skipped += 1;
      }
    }
    return stats;
  }

  private async upsertDiagnostics(
    accountId: string,
    items: SeedDiagnostic[],
    mode: UpsertMode,
    source: LibrarySource,
  ): Promise<UpsertStats> {
    const stats = { created: 0, updated: 0, skipped: 0 };
    const existing = new Map((await this.listDiagnostics(accountId)).map((row) => [row.key, row]));
    for (const item of items) {
      const row = existing.get(item.key);
      const fields = {
        title: item.title,
        categoryKey: item.categoryKey ?? null,
        gender: item.gender ?? null,
        language: item.language,
        text: normalizeText(item.text),
        enabled: item.enabled,
        sortOrder: item.sortOrder,
      };
      if (!row) {
        await this.diagnostics.save(this.diagnostics.create({ accountId, key: item.key, ...fields, source }));
        stats.created += 1;
      } else if (mode === 'replace') {
        Object.assign(row, fields);
        await this.diagnostics.save(row);
        stats.updated += 1;
      } else {
        stats.skipped += 1;
      }
    }
    return stats;
  }

  private async upsertPlaybooks(accountId: string, items: SeedPlaybook[], mode: UpsertMode): Promise<UpsertStats> {
    const stats = { created: 0, updated: 0, skipped: 0 };
    const before = await this.playbooks.count({ where: { accountId } });
    const rows = await this.listPlaybooks(accountId);
    stats.created = rows.length - before;
    if (mode === 'replace') {
      for (const row of rows) {
        const item = items.find((p) => p.stage === row.stage);
        if (!item) continue;
        Object.assign(row, {
          goal: item.goal,
          instructions: item.instructions,
          requiredBlockKinds: item.requiredBlockKinds,
          allowedBlockKinds: item.allowedBlockKinds,
          exampleKinds: item.exampleKinds,
          noQuestions: item.noQuestions,
        });
        stats.updated += 1;
      }
      await this.playbooks.save(rows);
    } else {
      stats.skipped = before;
    }
    return stats;
  }

  private async requireOwned<T extends ObjectLiteral & { id: string; accountId: string }>(
    repo: Repository<T>,
    accountId: string,
    id: string,
    label: string,
  ): Promise<T> {
    const row = await repo.findOne({ where: { id, accountId } as FindOptionsWhere<T> });
    if (!row) throw new NotFoundException(`${label} не найдена`);
    return row;
  }

  private async assertUniqueKey<T extends ObjectLiteral & { key: string; accountId: string }>(
    repo: Repository<T>,
    accountId: string,
    key: string,
  ): Promise<void> {
    const exists = await repo.exists({ where: { accountId, key } as FindOptionsWhere<T> });
    if (exists) throw new BadRequestException(`Ключ «${key}» уже используется`);
  }
}
