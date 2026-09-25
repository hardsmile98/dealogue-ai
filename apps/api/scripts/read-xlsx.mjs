import fs from 'node:fs';
import path from 'node:path';

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/_x000D_/g, '');

/**
 * Читает распакованный xlsx (папка с xl/…) без зависимостей:
 * { имяЛиста: { A1: 'текст', … } }. Пустые ячейки пропускаются,
 * переводы строк сохраняются, пробелы по краям обрезаются.
 */
export function readWorkbook(root) {
  const ssXml = fs.readFileSync(
    path.join(root, 'xl/sharedStrings.xml'),
    'utf8',
  );
  const strings = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode(
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''),
    ),
  );
  const wb = fs.readFileSync(path.join(root, 'xl/workbook.xml'), 'utf8');
  const rels = fs.readFileSync(
    path.join(root, 'xl/_rels/workbook.xml.rels'),
    'utf8',
  );
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship [^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)?.[1];
    const target = m[0].match(/Target="([^"]+)"/)?.[1];
    if (id && target) relMap[id] = target;
  }
  const out = {};
  for (const m of wb.matchAll(
    /<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g,
  )) {
    const name = decode(m[1]);
    const target = relMap[m[2]];
    const file = path.join(root, 'xl', target.replace(/^\/?xl\//, ''));
    const xml = fs.readFileSync(file, 'utf8');
    const cells = {};
    for (const c of xml.matchAll(
      /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const ref = c[1];
      const attrs = c[2];
      const inner = c[3] ?? '';
      let v = '';
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (/t="s"/.test(attrs) && vm) v = strings[Number(vm[1])] ?? '';
      else if (/t="inlineStr"/.test(attrs))
        v = decode(
          [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
            .map((t) => t[1])
            .join(''),
        );
      else if (vm) v = vm[1];
      v = v
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      if (v) cells[ref] = v;
    }
    out[name] = cells;
  }
  return out;
}
