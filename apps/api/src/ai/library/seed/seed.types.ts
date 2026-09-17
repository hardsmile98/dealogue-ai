import type { FactGroup, FunnelStage, Gender, PhraseConditions, PhraseKind, PhraseUsage } from '../../domain/types.js';

/** Форма стандартной библиотеки (генерируется из docs/source/*.xlsx). */

export interface SeedCategory {
  key: string;
  groupKey: string;
  title: string;
  description: string;
  clarifyingFactKey?: string | null;
  clarifyingQuestion?: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface SeedPhrase {
  usage: PhraseUsage;
  kind: PhraseKind;
  title: string;
  text: string;
  categoryKey?: string | null;
  gender?: Gender | null;
  language: string;
  conditions?: PhraseConditions;
  enabled: boolean;
  sortOrder: number;
}

export interface SeedFact {
  group: FactGroup;
  key: string;
  title: string;
  value: string;
  enabled: boolean;
  sortOrder: number;
}

export interface SeedDiagnostic {
  key: string;
  title: string;
  categoryKey?: string | null;
  gender?: Gender | null;
  language: string;
  text: string;
  enabled: boolean;
  sortOrder: number;
}

export interface SeedPlaybook {
  stage: FunnelStage;
  goal: string;
  instructions: string;
  requiredBlockKinds: PhraseKind[];
  allowedBlockKinds: PhraseKind[];
  exampleKinds: PhraseKind[];
  noQuestions: boolean;
}

export interface LibrarySeed {
  generatedAt: string;
  categories: SeedCategory[];
  phrases: SeedPhrase[];
  facts: SeedFact[];
  diagnostics: SeedDiagnostic[];
}
