import type {
  ChatMode,
  GuardConfig,
  LimitsConfig,
  PersonaConfig,
  TimingsConfig,
} from './types.js';

/** Значения по умолчанию из раздела 5.4 и 6.1 ТЗ. */

export const DEFAULT_PERSONA: PersonaConfig = {
  name: '',
  gender: 'm',
  bio: '',
  tone: 'тепло, коротко, как в мессенджере, без канцелярита',
  habits: '',
  city: '',
  language: 'ru',
  links: [],
};

export const DEFAULT_TIMINGS: TimingsConfig = {
  debounceSec: 120,
  debounceMaxSec: 300,
  greetingDebounceMaxSec: 180,
  firstReplyDelayMinSec: 45,
  firstReplyDelayMaxSec: 150,
  birthNudgeAfterMin: 30,
  diagnosticsDelayMin: 60,
  reengageAfterReadMin: 60,
  reengageIfUnreadHours: 24,
  touchIntervalMinHours: 12,
  touchIntervalMaxHours: 16,
  maxReminders: 3,
  superviseTimeoutHours: 6,
};

export const DEFAULT_LIMITS: LimitsConfig = {
  llmCallsPerHour: 400,
  llmCallsPerDay: 3000,
  botMessagesPerHour: 80,
  botMessagesPerChatPerDay: 12,
  autoMessagesWithoutReply: 4,
};

export const DEFAULT_GUARD: GuardConfig = {
  botAdmissionPhrases: [
    'я бот',
    'я — бот',
    'я ии',
    'я — ии',
    'искусственный интеллект',
    'нейросеть',
    'языковая модель',
    'автоматическ',
    'я ассистент',
    'я программа',
    'chatgpt',
    'gpt',
  ],
  promisePhrases: ['гарантирую', 'гарантированно', '100%', '100 %', 'точно вернётся', 'точно вернется', 'обещаю результат'],
  similarityThreshold: 0.8,
  confidenceThreshold: 0.5,
};

/** Таймзона аккаунта: в ней считаются дневные метрики. */
export const DEFAULT_TZ = 'Europe/Moscow';

/**
 * Настройки «как у только что заведённого аккаунта»: ими заполняется новая
 * строка и к ним же возвращает сброс. Блоки клонируются — иначе строка в
 * памяти делила бы массивы с константами.
 */
export function accountDefaults(dryRun: boolean) {
  return {
    enabled: false,
    dryRun,
    defaultChatMode: 'auto' as ChatMode,
    assistantForExistingChats: true,
    markRead: true,
    notifyTelegram: true,
    handoffPeer: null,
    tz: DEFAULT_TZ,
    persona: structuredClone(DEFAULT_PERSONA),
    timings: structuredClone(DEFAULT_TIMINGS),
    limits: structuredClone(DEFAULT_LIMITS),
    guard: structuredClone(DEFAULT_GUARD),
  };
}

/** Мягкое слияние: недостающие ключи берутся из дефолта, лишние отбрасываются. */
export function withDefaults<T extends object>(defaults: T, value: Partial<T> | null | undefined): T {
  const result = { ...defaults };
  if (!value) return result;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const next = value[key];
    if (next !== undefined && next !== null) result[key] = next as T[keyof T];
  }
  return result;
}
