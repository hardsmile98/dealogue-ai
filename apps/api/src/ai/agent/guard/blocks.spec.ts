import { describe, expect, it } from 'vitest';
import type { LibraryBlock } from '../agent.types.js';
import { expandMarkers, resolveBlocks } from './blocks.js';

const blocks: LibraryBlock[] = [
  { kind: 'links', id: 'l1', title: 'Ссылки', text: 'Instagram: soul.rayss\n\n---\n\nКанал: t.me/marsel_energy', source: 'phrase' },
  { kind: 'diagnostics', id: 'd1', title: 'Диагностика', text: 'Часть 1\n---\nЧасть 2\n---\nЧасть 3', source: 'diagnostic' },
];

describe('expandMarkers', () => {
  it('маркер внутри текста становится отдельным сегментом', () => {
    const segments = expandMarkers(['Вот мои ссылки [[BLOCK:links]] посмотрите', '[[block: diagnostics ]]']);
    expect(segments).toEqual([
      { text: 'Вот мои ссылки', blockKind: null },
      { text: '[[BLOCK:links]]', blockKind: 'links' },
      { text: 'посмотрите', blockKind: null },
      { text: '[[block: diagnostics ]]', blockKind: 'diagnostics' },
    ]);
  });
});

describe('resolveBlocks', () => {
  it('подставляет тексты и режет по ---, неизвестные маркеры отбрасывает', () => {
    const result = resolveBlocks(expandMarkers(['Держите', '[[BLOCK:links]]', '[[BLOCK:price]]']), blocks);
    expect(result.unknownKinds).toEqual(['price']);
    expect(result.messages.map((m) => m.text)).toEqual(['Держите', 'Instagram: soul.rayss', 'Канал: t.me/marsel_energy']);
    expect(result.messages[1]).toMatchObject({ blockKind: 'links', blockId: 'l1' });
  });

  it('один блок дважды — оставляем первое вхождение', () => {
    const result = resolveBlocks(expandMarkers(['[[BLOCK:diagnostics]]', 'и ещё раз [[BLOCK:diagnostics]]']), blocks);
    expect(result.messages.filter((m) => m.blockKind === 'diagnostics')).toHaveLength(3);
  });
});
