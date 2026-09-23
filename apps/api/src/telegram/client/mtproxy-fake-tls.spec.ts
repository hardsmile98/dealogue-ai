import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildClientHello } from './mtproxy-fake-tls.js';

/** Разбирает ClientHello в список `[тип расширения, тело]`. */
function parseExtensions(hello: Buffer): Array<[number, Buffer]> {
  // 5 (запись) + 4 (handshake) + 2 (версия) + 32 (random) = 43
  let offset = 43;
  const sessionIdLen = hello[offset];
  offset += 1 + sessionIdLen;
  offset += 2 + hello.readUInt16BE(offset); // шифры
  offset += 1 + hello[offset]; // методы сжатия
  const extensionsLen = hello.readUInt16BE(offset);
  offset += 2;
  expect(offset + extensionsLen).toBe(hello.length);

  const extensions: Array<[number, Buffer]> = [];
  const end = offset + extensionsLen;
  while (offset < end) {
    const type = hello.readUInt16BE(offset);
    const len = hello.readUInt16BE(offset + 2);
    extensions.push([type, hello.subarray(offset + 4, offset + 4 + len)]);
    offset += 4 + len;
  }
  expect(offset).toBe(end);
  return extensions;
}

describe('buildClientHello', () => {
  const domain = 'redflag.example.cc';
  const hello = buildClientHello(domain, randomBytes(32));

  it('укладывается ровно в 517 байт, как ждёт MTProxy', () => {
    expect(hello.length).toBe(517);
    expect(hello.subarray(0, 5)).toEqual(
      Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00]),
    );
  });

  it('не повторяет типы расширений — иначе TLS-сервер шлёт decode_error(50)', () => {
    const types = parseExtensions(hello).map(([type]) => type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('кладёт домен прокси в SNI', () => {
    const sni = parseExtensions(hello).find(([type]) => type === 0x0000);
    expect(sni).toBeDefined();
    expect(sni![1].subarray(5).toString('utf8')).toBe(domain);
  });

  it('оставляет поле random нулевым — его штампует вызывающий', () => {
    expect(hello.subarray(11, 43)).toEqual(Buffer.alloc(32));
  });

  it('падает на домене, который не влезает в ClientHello', () => {
    expect(() => buildClientHello('a'.repeat(400), randomBytes(32))).toThrow(
      /слишком длинный/,
    );
  });
});
