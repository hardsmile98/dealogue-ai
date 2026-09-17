import type {
  GuardConfig,
  LimitsConfig,
  NightWindowConfig,
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

export const DEFAULT_NIGHT_WINDOW: NightWindowConfig = {
  enabled: false,
  from: '01:00',
  to: '08:00',
  tz: 'Europe/Moscow',
};

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
