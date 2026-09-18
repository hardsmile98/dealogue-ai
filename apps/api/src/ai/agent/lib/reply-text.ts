/**
 * Проверки текста исходящего сообщения: вопрос, приветствие. Нужны Guard'у,
 * чтобы поймать то, что видно по самому тексту, — не понимание клиента.
 */

/** Содержит ли текст вопрос (для проверки «без вопросов на этом шаге»). */
export function hasQuestion(text: string): boolean {
  return text.includes('?');
}

const GREETING_RE =
  /^\s*(привет(ствую)?|здравствуй(те)?|добр(ый|ое|ого)\s+(день|утро|вечер|времени)|доброй\s+ночи|hi|hello|hey|good\s+(morning|afternoon|evening))(?!\p{L})/iu;

export function startsWithGreeting(text: string): boolean {
  return GREETING_RE.test(text);
}

/** Убирает первое предложение-приветствие; если больше ничего нет — пустая строка. */
export function stripLeadingGreeting(text: string): string {
  if (!startsWithGreeting(text)) return text;
  const match = /^[^.!?\n]*[.!?]+\s*|^[^\n]*\n+/.exec(text);
  if (!match) return '';
  return text.slice(match[0].length).trimStart();
}
