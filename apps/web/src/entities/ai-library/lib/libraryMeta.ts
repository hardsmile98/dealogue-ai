import type { FactGroup, PhraseKind } from '@/shared/api'

export interface PhraseKindMeta {
  label: string
  hint: string
  /** Обычно блок (дословно), а не образец. */
  blockByDefault?: boolean
}

export const PHRASE_KIND_META: Record<PhraseKind, PhraseKindMeta> = {
  greeting: { label: 'Приветствие', hint: 'Первое сообщение: поздороваться и попросить дату и место рождения' },
  birth_nudge: { label: 'Напоминание о дате', hint: 'Если клиент не прислал данные' },
  intro: { label: 'Знакомство', hint: 'Кто вы, откуда, вопрос о запросе' },
  empathy: { label: 'Эмпатия', hint: 'Короткая реакция на ситуацию клиента (можно по категории)' },
  ack_request: { label: 'Подтверждение запроса', hint: '«Понял, займусь диагностикой»' },
  links: { label: 'Ссылки', hint: 'Ссылки на страницы — уходят дословно', blockByDefault: true },
  diag_closing: { label: 'Вокруг диагностики', hint: 'Связка перед диагностикой и вопрос после неё' },
  reengage: { label: 'Вопрос-возврат', hint: 'После диагностики, если клиент молчит' },
  offer: { label: 'Предложение', hint: 'Описание услуг — модель пересказывает своими словами' },
  offer_question: { label: 'Вопрос после предложения', hint: '«Всё ли понятно по направлениям»' },
  price: { label: 'Цены', hint: 'Прайс — уходит дословно', blockByDefault: true },
  price_question: { label: 'Вопрос после цены', hint: 'Есть ли вопросы, что останавливает' },
  objection: { label: 'Возражения', hint: 'Как отвечать на «дорого», «подумаю», «сразу про деньги»' },
  discount: { label: 'Скидка', hint: 'Специальное предложение — уходит дословно', blockByDefault: true },
  reminder: { label: 'Напоминание', hint: 'Последние касания, если клиент молчит' },
  quick_reply: { label: 'Быстрый ответ', hint: 'Только для менеджера, воронка не использует' },
}

export const FACT_GROUP_LABELS: Record<FactGroup, string> = {
  service: 'Услуги',
  price: 'Цены',
  link: 'Ссылки',
  persona: 'О персоне',
  process: 'Как проходит работа',
  faq: 'Частые вопросы',
}

export const GENDER_LABELS: Record<'f' | 'm', string> = { f: 'женщинам', m: 'мужчинам' }

export const CATEGORY_GROUP_LABELS: Record<string, string> = {
  relationships: 'Отношения',
  money: 'Деньги',
  health: 'Здоровье',
  family: 'Семья',
  universal: 'Универсальные',
  mentoring: 'Наставничество',
  other: 'Прочее',
}

export const SOURCE_LABELS: Record<string, string> = {
  seed: 'из таблицы',
  manual: 'вручную',
  copied: 'скопировано',
}
