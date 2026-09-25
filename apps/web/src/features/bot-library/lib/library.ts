import { OBJECTION_CATEGORIES, REQUEST_CATEGORIES } from '@/shared/api';
import type {
  LibraryItemBody,
  LibraryItemDto,
  LibraryKind,
  ObjectionCategory,
  RequestCategory,
} from '@/shared/api';
import { OBJECTION_LABELS } from '@/entities/bot';

export type KindFilter = LibraryKind | 'all';

function isObjection(category: string): category is ObjectionCategory {
  return (OBJECTION_CATEGORIES as readonly string[]).includes(category);
}

/** Название категории: запрос клиента (у диагностик) или возражение. */
export function categoryTitle(category: string | null): string | null {
  if (!category) return null;
  return (
    REQUEST_CATEGORIES.find((item) => item.key === category)?.title ??
    (isObjection(category) ? OBJECTION_LABELS[category] : null) ??
    category
  );
}

/** Категория нужна диагностикам (запрос клиента) и возражениям (плейбук). */
export function categoryOptions(kind: LibraryKind): RequestCategory[] | null {
  if (kind === 'diagnostic') return [...REQUEST_CATEGORIES];
  if (kind === 'objection') {
    return OBJECTION_CATEGORIES.map((key) => ({
      key,
      title: OBJECTION_LABELS[key],
    }));
  }
  return null;
}

/** Сколько текстов каждого вида — для счётчиков в фильтре. */
export function countByKind(
  items: readonly LibraryItemDto[],
): Map<LibraryKind, number> {
  const counts = new Map<LibraryKind, number>();
  for (const item of items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  return counts;
}

/** Фильтр по виду и поиск по названию и тексту без учёта регистра. */
export function filterLibrary(
  items: readonly LibraryItemDto[],
  kind: KindFilter,
  search: string,
): LibraryItemDto[] {
  const needle = search.trim().toLowerCase();
  return items.filter(
    (item) =>
      (kind === 'all' || item.kind === kind) &&
      (!needle ||
        item.title.toLowerCase().includes(needle) ||
        item.text.toLowerCase().includes(needle)),
  );
}

/** Тело формы из элемента: язык из строки контракта приводим к известным. */
export function toBody(item: LibraryItemDto): LibraryItemBody {
  return {
    kind: item.kind,
    language: item.language === 'en' ? 'en' : 'ru',
    gender: item.gender,
    category: item.category,
    title: item.title,
    text: item.text,
    enabled: item.enabled,
  };
}

/** Пустой текст; вид — выбранный в фильтре, чтобы не выбирать его дважды. */
export function newItemBody(kind: KindFilter): LibraryItemBody {
  return {
    kind: kind === 'all' ? 'empathy' : kind,
    language: 'ru',
    gender: null,
    category: null,
    title: '',
    text: '',
    enabled: true,
  };
}
