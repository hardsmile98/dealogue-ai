import type { FactGroup, FunnelStage, Gender, PhraseConditions, PhraseKind, PhraseUsage } from '../domain/types.js';
import type { AiCategoryEntity } from '../entities/ai-category.entity.js';
import type { AiDiagnosticEntity } from '../entities/ai-diagnostic.entity.js';
import type { AiFactEntity } from '../entities/ai-fact.entity.js';
import type { AiNoteEntity } from '../entities/ai-note.entity.js';
import type { AiPhraseEntity, LibrarySource } from '../entities/ai-phrase.entity.js';
import type { AiPlaybookEntity } from '../entities/ai-playbook.entity.js';

/** DTO библиотеки — зеркало apps/web/src/shared/api/contracts/ai.ts. */

export interface CategoryDto {
  id: string;
  key: string;
  groupKey: string;
  title: string;
  description: string;
  clarifyingFactKey: string | null;
  clarifyingQuestion: string | null;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface PhraseDto {
  id: string;
  usage: PhraseUsage;
  kind: PhraseKind;
  categoryKey: string | null;
  gender: Gender | null;
  language: string;
  title: string;
  text: string;
  conditions: PhraseConditions;
  enabled: boolean;
  weight: number;
  sortOrder: number;
  sentCount: number;
  repliedCount: number;
  source: LibrarySource;
  updatedAt: string;
}

export interface FactDto {
  id: string;
  group: FactGroup;
  key: string;
  title: string;
  value: string;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface DiagnosticDto {
  id: string;
  key: string;
  title: string;
  categoryKey: string | null;
  gender: Gender | null;
  language: string;
  text: string;
  /** На сколько сообщений разрежется текст. */
  messagesCount: number;
  enabled: boolean;
  weight: number;
  sortOrder: number;
  sentCount: number;
  repliedCount: number;
  source: LibrarySource;
  updatedAt: string;
}

export interface PlaybookDto {
  id: string;
  stage: FunnelStage;
  goal: string;
  instructions: string;
  requiredBlockKinds: PhraseKind[];
  allowedBlockKinds: PhraseKind[];
  exampleKinds: PhraseKind[];
  noQuestions: boolean;
  enabled: boolean;
  updatedAt: string;
}

export interface NoteDto {
  id: string;
  text: string;
  scope: string;
  source: string;
  enabled: boolean;
  createdAt: string;
}

export interface LibraryOverviewDto {
  counts: {
    categories: number;
    phrases: number;
    blocks: number;
    facts: number;
    diagnostics: number;
    notes: number;
  };
  /** Обязательные блоки, которых нет ни одного включённого. */
  missingBlocks: { stage: FunnelStage; kind: PhraseKind }[];
  /** Виды примеров из плейбуков, у которых нет ни одного включённого. */
  missingExamples: { stage: FunnelStage; kind: PhraseKind }[];
  diagnosticsByLanguage: Record<string, { total: number; universal: number }>;
  seededAt: string | null;
}

export interface SeedResultDto {
  categories: UpsertStats;
  phrases: UpsertStats;
  facts: UpsertStats;
  diagnostics: UpsertStats;
  playbooks: UpsertStats;
  notes?: UpsertStats;
}

export interface UpsertStats {
  created: number;
  updated: number;
  skipped: number;
}

export function toCategoryDto(row: AiCategoryEntity): CategoryDto {
  return {
    id: row.id,
    key: row.key,
    groupKey: row.groupKey,
    title: row.title,
    description: row.description,
    clarifyingFactKey: row.clarifyingFactKey,
    clarifyingQuestion: row.clarifyingQuestion,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPhraseDto(row: AiPhraseEntity): PhraseDto {
  return {
    id: row.id,
    usage: row.usage,
    kind: row.kind,
    categoryKey: row.categoryKey,
    gender: row.gender,
    language: row.language,
    title: row.title,
    text: row.text,
    conditions: row.conditions ?? {},
    enabled: row.enabled,
    weight: row.weight,
    sortOrder: row.sortOrder,
    sentCount: row.sentCount,
    repliedCount: row.repliedCount,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toFactDto(row: AiFactEntity): FactDto {
  return {
    id: row.id,
    group: row.group,
    key: row.key,
    title: row.title,
    value: row.value,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDiagnosticDto(row: AiDiagnosticEntity, messagesCount: number): DiagnosticDto {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    categoryKey: row.categoryKey,
    gender: row.gender,
    language: row.language,
    text: row.text,
    messagesCount,
    enabled: row.enabled,
    weight: row.weight,
    sortOrder: row.sortOrder,
    sentCount: row.sentCount,
    repliedCount: row.repliedCount,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPlaybookDto(row: AiPlaybookEntity): PlaybookDto {
  return {
    id: row.id,
    stage: row.stage,
    goal: row.goal,
    instructions: row.instructions,
    requiredBlockKinds: row.requiredBlockKinds,
    allowedBlockKinds: row.allowedBlockKinds,
    exampleKinds: row.exampleKinds,
    noQuestions: row.noQuestions,
    enabled: row.enabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toNoteDto(row: AiNoteEntity): NoteDto {
  return {
    id: row.id,
    text: row.text,
    scope: row.scope,
    source: row.source,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  };
}
