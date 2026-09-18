import { describe, expect, it } from 'vitest';
import { chooseBlocks, chooseFor, languageChain, orderFor, targetOf } from './targeting.js';

function item(id: string, categoryKey: string | null, gender: string | null, language = 'ru') {
  return { id, categoryKey, gender, language };
}

const POOL = [
  item('универсальный', null, null),
  item('женский', null, 'f'),
  item('по категории', 'relationships', null),
  item('категория и пол', 'relationships', 'f'),
  item('английский универсальный', null, null, 'en'),
  item('чужая категория', 'money', null),
  item('мужской', null, 'm'),
];

const ru = (categoryKey: string | null, gender: string | null) => ({ categoryKey, gender, languages: ['ru'] });

describe('chooseFor', () => {
  it('самое точное — категория и пол', () => {
    expect(chooseFor(POOL, ru('relationships', 'f'))?.id).toBe('категория и пол');
  });

  it('пол неизвестен — берёт вариант по категории без пола', () => {
    expect(chooseFor(POOL, ru('relationships', null))?.id).toBe('по категории');
  });

  it('категории нет — женский универсальный', () => {
    expect(chooseFor(POOL, ru(null, 'f'))?.id).toBe('женский');
  });

  it('ничего не известно — универсальный', () => {
    expect(chooseFor(POOL, ru(null, null))?.id).toBe('универсальный');
  });

  it('чужую категорию и чужой пол не отдаёт', () => {
    const ids = orderFor(POOL, ru('relationships', 'f')).map((i) => i.id);
    expect(ids).not.toContain('чужая категория');
    expect(ids).not.toContain('мужской');
  });
});

describe('цепочка языков', () => {
  it('на языке клиента текстов нет — берёт язык аккаунта', () => {
    const pool = [item('английский', null, null, 'en'), item('русский', null, null, 'ru')];
    expect(chooseFor(pool, { categoryKey: null, gender: null, languages: ['en', 'ru'] })?.id).toBe('английский');
    expect(chooseFor(pool, { categoryKey: null, gender: null, languages: ['kk', 'ru'] })?.id).toBe('русский');
  });

  it('язык важнее конкретности', () => {
    const pool = [item('англ. по категории', 'relationships', 'f', 'en'), item('рус. универсальный', null, null, 'ru')];
    const chosen = chooseFor(pool, { categoryKey: 'relationships', gender: 'f', languages: ['ru', 'en'] });
    expect(chosen?.id).toBe('рус. универсальный');
  });

  it('совсем чужой язык не подходит', () => {
    const pool = [item('русский', null, null, 'ru')];
    expect(chooseFor(pool, { categoryKey: null, gender: null, languages: ['en'] })).toBeNull();
  });

  it('languageChain не дублирует язык аккаунта', () => {
    expect(languageChain('ru', 'ru')).toEqual(['ru']);
    expect(languageChain('en', 'ru')).toEqual(['en', 'ru']);
  });
});

describe('поздний выбор блока', () => {
  const pools = [
    {
      kind: 'diagnostics',
      source: 'diagnostic' as const,
      items: [
        { id: 'универсальная', title: 'у', text: 'т', categoryKey: null, gender: null, language: 'ru' },
        { id: 'разрыв для женщин', title: 'ж', text: 'т', categoryKey: 'breakup', gender: 'f', language: 'ru' },
      ],
    },
  ];

  it('то, что модель поняла в этом ходе, меняет выбранный вариант', () => {
    const before = chooseBlocks(pools, targetOf({ requestCategoryKey: null, gender: null, language: 'ru' }, 'ru'));
    const after = chooseBlocks(pools, targetOf({ requestCategoryKey: 'breakup', gender: 'f', language: 'ru' }, 'ru'));
    expect(before[0].id).toBe('универсальная');
    expect(after[0].id).toBe('разрыв для женщин');
  });

  it('карточка не изменилась — вариант тот же', () => {
    const target = targetOf({ requestCategoryKey: 'breakup', gender: 'f', language: 'ru' }, 'ru');
    expect(chooseBlocks(pools, target)[0].id).toBe(chooseBlocks(pools, target)[0].id);
  });

  it('вариантов на языке клиента нет — блока не будет, а не чужой текст', () => {
    expect(chooseBlocks(pools, targetOf({ requestCategoryKey: null, gender: null, language: 'en' }, 'en'))).toEqual([]);
  });
});

describe('orderFor', () => {
  it('сохраняет порядок пула внутри яруса', () => {
    const pool = [item('первый', null, null), item('второй', null, null)];
    expect(orderFor(pool, ru(null, null)).map((i) => i.id)).toEqual(['первый', 'второй']);
  });
});
