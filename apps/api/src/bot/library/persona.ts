import type { Gender } from './kinds.js';

/** Ссылка на страницу практика: подпись с эмодзи и адрес. */
export interface PersonaLink {
  title: string;
  url: string;
}

/**
 * Образ практика — своё у каждого аккаунта. Идёт в статичную часть промпта
 * и подставляется в тексты библиотеки вместо `{{bio}}` и `{{links}}`.
 */
export interface Persona {
  name: string;
  gender: Gender;
  /** Откуда, где живёт, как пришёл к практике. */
  bio: string;
  links: PersonaLink[];
}

export function defaultPersona(name: string): Persona {
  return { name, gender: 'm', bio: '', links: [] };
}

/** Образ из jsonb: чего нет — берём по умолчанию, лишнее не тащим. */
export function readPersona(raw: unknown, fallbackName: string): Persona {
  const source = (raw ?? {}) as Partial<Record<keyof Persona, unknown>>;
  const links = Array.isArray(source.links)
    ? source.links
        .filter((link): link is PersonaLink =>
          typeof link === 'object' && link !== null &&
          typeof (link as PersonaLink).title === 'string' &&
          typeof (link as PersonaLink).url === 'string',
        )
        .map((link) => ({ title: link.title, url: link.url }))
    : [];
  return {
    name: typeof source.name === 'string' && source.name ? source.name : fallbackName,
    gender: source.gender === 'f' ? 'f' : 'm',
    bio: typeof source.bio === 'string' ? source.bio : '',
    links,
  };
}

/** Плейсхолдеры, которые допустимы в текстах библиотеки. */
export const PLACEHOLDERS = ['{{bio}}', '{{links}}'] as const;

const PLACEHOLDER_RE = /\{\{\s*(bio|links)\s*\}\}/g;

/** Как ссылки выглядят в сообщении: «🔮 Instagram:» и адрес на следующей строке. */
export function renderLinks(links: readonly PersonaLink[]): string {
  return links.map((link) => `${link.title}:\n${link.url}`).join('\n\n');
}

/**
 * Подставляет образ в текст библиотеки. Пустое значение убирает
 * плейсхолдер вместе с лишними пробелами и пустыми строками вокруг.
 */
export function renderPersona(text: string, persona: Persona): string {
  const rendered = text.replace(PLACEHOLDER_RE, (_match, key: 'bio' | 'links') =>
    key === 'bio' ? persona.bio : renderLinks(persona.links),
  );
  return rendered
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const KNOWN_PLACEHOLDER = /^\{\{\s*(bio|links)\s*\}\}$/;

/** Плейсхолдеры в тексте, которых образ не умеет заполнять. */
export function unknownPlaceholders(text: string): string[] {
  const found = text.match(/\{\{[^}]*\}\}/g) ?? [];
  return found.filter((token) => !KNOWN_PLACEHOLDER.test(token));
}
