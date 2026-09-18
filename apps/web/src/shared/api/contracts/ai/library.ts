/**
 * Библиотека аккаунта: категории запросов, тексты, факты, диагностики,
 * плейбуки этапов и заметки менеджера.
 */

import type {
  FactGroup,
  FunnelStage,
  Gender,
  LibrarySource,
  PhraseKind,
  PhraseUsage,
} from './common'

export interface CategoryDto {
  id: string
  key: string
  groupKey: string
  title: string
  description: string
  clarifyingFactKey: string | null
  clarifyingQuestion: string | null
  enabled: boolean
  sortOrder: number
  updatedAt: string
}

export type CategoryInput = Omit<CategoryDto, 'id' | 'updatedAt'>

export interface PhraseConditionsDto {
  requiresRequest?: boolean
  avoidIfPriceAsked?: boolean
}

export interface PhraseDto {
  id: string
  usage: PhraseUsage
  kind: PhraseKind
  categoryKey: string | null
  gender: Gender | null
  language: string
  title: string
  text: string
  conditions: PhraseConditionsDto
  enabled: boolean
  weight: number
  sortOrder: number
  sentCount: number
  repliedCount: number
  source: LibrarySource
  updatedAt: string
}

export type PhraseInput = Omit<PhraseDto, 'id' | 'updatedAt' | 'sentCount' | 'repliedCount' | 'source'>

export interface PhrasesQuery {
  usage?: PhraseUsage
  kind?: PhraseKind
  categoryKey?: string
  gender?: Gender
  language?: string
  enabled?: 'true' | 'false'
}

export interface FactDto {
  id: string
  group: FactGroup
  key: string
  title: string
  value: string
  enabled: boolean
  sortOrder: number
  updatedAt: string
}

export type FactInput = Omit<FactDto, 'id' | 'updatedAt'>

export interface DiagnosticDto {
  id: string
  key: string
  title: string
  categoryKey: string | null
  gender: Gender | null
  language: string
  text: string
  /** На сколько сообщений разрежется текст. */
  messagesCount: number
  enabled: boolean
  weight: number
  sortOrder: number
  sentCount: number
  repliedCount: number
  source: LibrarySource
  updatedAt: string
}

export type DiagnosticInput = Omit<
  DiagnosticDto,
  'id' | 'updatedAt' | 'messagesCount' | 'sentCount' | 'repliedCount' | 'source'
>

export interface DiagnosticsQuery {
  categoryKey?: string
  gender?: Gender
  language?: string
  enabled?: 'true' | 'false'
}

export interface PlaybookDto {
  id: string
  stage: FunnelStage
  goal: string
  instructions: string
  requiredBlockKinds: PhraseKind[]
  allowedBlockKinds: PhraseKind[]
  exampleKinds: PhraseKind[]
  noQuestions: boolean
  enabled: boolean
  updatedAt: string
}

export type PlaybookInput = Partial<Omit<PlaybookDto, 'id' | 'stage' | 'updatedAt'>>

export interface NoteDto {
  id: string
  text: string
  scope: string
  source: string
  enabled: boolean
  createdAt: string
}

export interface NoteInput {
  text: string
  scope: string
  enabled: boolean
}

export interface LibraryOverviewDto {
  counts: {
    categories: number
    phrases: number
    blocks: number
    facts: number
    diagnostics: number
    notes: number
  }
  missingBlocks: { stage: FunnelStage; kind: PhraseKind }[]
  missingExamples: { stage: FunnelStage; kind: PhraseKind }[]
  diagnosticsByLanguage: Record<string, { total: number; universal: number }>
  seededAt: string | null
}

export interface UpsertStatsDto {
  created: number
  updated: number
  skipped: number
}

export interface SeedResultDto {
  categories: UpsertStatsDto
  phrases: UpsertStatsDto
  facts: UpsertStatsDto
  diagnostics: UpsertStatsDto
  playbooks: UpsertStatsDto
  notes?: UpsertStatsDto
}

export interface CopyLibraryRequest {
  categories: boolean
  phrases: boolean
  facts: boolean
  diagnostics: boolean
  playbooks: boolean
  notes: boolean
  mode: 'skip' | 'replace'
}

export interface PreviewSplitResponse {
  messages: string[]
  lengths: number[]
}
