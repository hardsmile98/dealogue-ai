import { createHmac, randomBytes } from 'node:crypto';
import type { SocketInterface } from 'teleproto/extensions/SocketInterface.js';

/**
 * Fake-TLS обёртка для MTProxy с секретом `ee…`.
 *
 * Зачем своя — в teleproto 1.229 два бага в ClientHello:
 *
 * 1. Первое и последнее расширения идут с одним и тем же GREASE-типом
 *    `0x0a0a`. По RFC 8446 повторяющийся тип расширения запрещён, и BoringSSL —
 *    а значит и MTProxy, и маскировочный сайт за ним — отвечает фатальным
 *    алертом `decode_error(50)`. Наружу это всплывает как
 *    «FakeTLS: expected Handshake at record 0, got 0x15».
 *    Здесь трейлинг-GREASE — `0x1a1a`, как в настоящем Chrome.
 * 2. Метка времени вмешивается в `random` big-endian вместо little-endian —
 *    прокси видит чужие часы и уводит соединение на маскировочный сайт,
 *    после чего не сходится уже HMAC сервера.
 */

const SECRET_LEN = 16;

const TLS_RECORD_HEADER_LEN = 5;
const TLS_RECORD_MAX_PAYLOAD = 16384;
const TLS_RECORD_ALERT = 0x15;
const TLS_RECORD_HANDSHAKE = 0x16;
const TLS_RECORD_CHANGE_CIPHER_SPEC = 0x14;
const TLS_RECORD_APPLICATION_DATA = 0x17;
const TLS_APP_DATA_PREFIX = Buffer.from([0x17, 0x03, 0x03]);

const HELLO_SIZE = 517;
const HELLO_RANDOM_OFFSET = 11;
const HELLO_RANDOM_LEN = 32;
/** 5 байт TLS-записи + 4 байта handshake-заголовка + фиксированное тело. */
const HELLO_FIXED_HEADER_SIZE = 114;
const HELLO_TIMESTAMP_XOR_OFFSET = 28;

/** Два РАЗНЫХ GREASE-значения: одинаковые дают дубль типа расширения. */
const GREASE_LEAD = 0x0a0a;
const GREASE_TRAIL = 0x1a1a;
/** GREASE внутри списков (шифры, группы, версии) — там повтор допустим. */
const G = 0x0a;

function tlsExtension(type: number, body: Buffer | number[]): Buffer {
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const out = Buffer.alloc(4 + content.length);
  out.writeUInt16BE(type, 0);
  out.writeUInt16BE(content.length, 2);
  content.copy(out, 4);
  return out;
}

function sniExtension(domain: string): Buffer {
  const dom = Buffer.from(domain, 'utf8');
  const body = Buffer.alloc(5 + dom.length);
  body.writeUInt16BE(dom.length + 3, 0);
  body.writeUInt8(0x00, 2);
  body.writeUInt16BE(dom.length, 3);
  dom.copy(body, 5);
  return tlsExtension(0x0000, body);
}

function keyShareExtension(): Buffer {
  const entries = Buffer.concat([
    Buffer.from([G, G, 0x00, 0x01, 0x00]),
    Buffer.from([0x00, 0x1d, 0x00, 0x20]),
    randomBytes(32),
  ]);
  const body = Buffer.alloc(2 + entries.length);
  body.writeUInt16BE(entries.length, 0);
  entries.copy(body, 2);
  return tlsExtension(0x0033, body);
}

/**
 * Расширения, не зависящие от входных данных, в порядке Chrome 105+.
 * SNI и key_share вставляются на лету — см. {@link buildClientHello}.
 */
const STATIC_EXTENSIONS: readonly Buffer[] = [
  tlsExtension(GREASE_LEAD, []),
  tlsExtension(0x0017, []),
  tlsExtension(0xff01, [0x00]),
  tlsExtension(0x000a, [0x00, 0x08, G, G, 0x00, 0x1d, 0x00, 0x17, 0x00, 0x18]),
  tlsExtension(0x000b, [0x01, 0x00]),
  tlsExtension(0x0023, []),
  tlsExtension(
    0x0010,
    [
      0x00, 0x0c, 0x02, 0x68, 0x32, 0x08, 0x68, 0x74, 0x74, 0x70, 0x2f, 0x31,
      0x2e, 0x31,
    ],
  ),
  tlsExtension(0x0005, [0x01, 0x00, 0x00, 0x00, 0x00]),
  tlsExtension(
    0x000d,
    [
      0x00, 0x10, 0x04, 0x03, 0x08, 0x04, 0x04, 0x01, 0x05, 0x03, 0x08, 0x05,
      0x05, 0x01, 0x08, 0x06, 0x06, 0x01,
    ],
  ),
  tlsExtension(0x0012, []),
  tlsExtension(0x002d, [0x01, 0x01]),
  tlsExtension(0x002b, [0x06, G, G, 0x03, 0x04, 0x03, 0x03]),
  tlsExtension(0x001b, [0x02, 0x00, 0x02]),
  tlsExtension(GREASE_TRAIL, [0x00]),
];
const STATIC_EXTENSIONS_LEN = STATIC_EXTENSIONS.reduce(
  (sum, ext) => sum + ext.length,
  0,
);

const CIPHER_SUITES = Buffer.from([
  G,
  G,
  0x13,
  0x01,
  0x13,
  0x02,
  0x13,
  0x03,
  0xc0,
  0x2b,
  0xc0,
  0x2f,
  0xc0,
  0x2c,
  0xc0,
  0x30,
  0xcc,
  0xa9,
  0xcc,
  0xa8,
  0xc0,
  0x13,
  0xc0,
  0x14,
  0x00,
  0x9c,
  0x00,
  0x9d,
  0x00,
  0x2f,
  0x00,
  0x35,
]);

/**
 * Собирает 517-байтовый Chrome-подобный ClientHello TLS 1.2. Поле `random`
 * (32 байта по смещению 11) остаётся нулевым — его штампует вызывающий
 * HMAC-ом от секрета.
 */
export function buildClientHello(domain: string, sessionId: Buffer): Buffer {
  const sni = sniExtension(domain);
  const keyShare = keyShareExtension();
  let extensionsLen = STATIC_EXTENSIONS_LEN + sni.length + keyShare.length;
  const paddingPayloadLen =
    HELLO_SIZE - HELLO_FIXED_HEADER_SIZE - extensionsLen - 4;
  if (paddingPayloadLen < 0) {
    throw new Error(
      `FakeTLS: домен слишком длинный (${domain.length} байт), ClientHello переполнен на ${-paddingPayloadLen} байт`,
    );
  }
  const padding = tlsExtension(0x0015, Buffer.alloc(paddingPayloadLen));
  extensionsLen += padding.length;

  // SNI идёт сразу за ведущим GREASE, key_share — после SCT-расширения.
  const KEY_SHARE_INSERT_AFTER = 11;
  const extensions = [
    STATIC_EXTENSIONS[0],
    sni,
    ...STATIC_EXTENSIONS.slice(1, KEY_SHARE_INSERT_AFTER + 1),
    keyShare,
    ...STATIC_EXTENSIONS.slice(KEY_SHARE_INSERT_AFTER + 1),
    padding,
  ];

  const hello = Buffer.concat([
    Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00]),
    Buffer.from([0x01, 0x00, 0x01, 0xfc]),
    Buffer.from([0x03, 0x03]),
    Buffer.alloc(HELLO_RANDOM_LEN),
    Buffer.from([sessionId.length]),
    sessionId,
    Buffer.from([
      (CIPHER_SUITES.length >> 8) & 0xff,
      CIPHER_SUITES.length & 0xff,
    ]),
    CIPHER_SUITES,
    Buffer.from([0x01, 0x00]),
    Buffer.from([(extensionsLen >> 8) & 0xff, extensionsLen & 0xff]),
    ...extensions,
  ]);
  if (hello.length !== HELLO_SIZE) {
    throw new Error(
      `FakeTLS: неверный размер ClientHello — ${hello.length}, ожидался ${HELLO_SIZE}`,
    );
  }
  return hello;
}

interface RecordReader {
  readExactly(n: number): Promise<Buffer>;
}

async function readTlsRecord(
  stream: RecordReader,
): Promise<{ type: number; payload: Buffer }> {
  const hdr = await stream.readExactly(TLS_RECORD_HEADER_LEN);
  const type = hdr[0];
  const payload = await stream.readExactly(hdr.readUInt16BE(3));
  return { type, payload };
}

function describeRecord(type: number, payload: Buffer): string {
  switch (type) {
    case TLS_RECORD_HANDSHAKE:
      return 'Handshake';
    case TLS_RECORD_CHANGE_CIPHER_SPEC:
      return 'ChangeCipherSpec';
    case TLS_RECORD_APPLICATION_DATA:
      return 'ApplicationData';
    case TLS_RECORD_ALERT:
      return payload.length >= 2
        ? `Alert(level=${payload[0]}, description=${payload[1]})`
        : 'Alert';
    default:
      return `0x${type.toString(16).padStart(2, '0')}`;
  }
}

/**
 * Оборачивает сокет в fake-TLS: на {@link handshake} шлёт ClientHello со
 * штампом `HMAC-SHA256(secret, hello)` (последние 4 байта — XOR с unix-time),
 * затем проверяет, что server random равен
 * `HMAC-SHA256(secret, client_random || ответ_сервера_с_обнулённым_random)`.
 * Дальше весь трафик едет внутри TLS-записей application_data.
 */
export class FakeTlsSocket {
  private readonly inner: SocketInterface;
  private readonly secret: Buffer;
  private readonly domain: string;
  private clientRandom: Buffer = Buffer.alloc(0);
  private readBuf: Buffer = Buffer.alloc(0);

  constructor(inner: SocketInterface, secret: Buffer, domain: string) {
    if (secret.length !== SECRET_LEN) {
      throw new Error(
        `FakeTLS: секрет должен быть ${SECRET_LEN} байт, получено ${secret.length}`,
      );
    }
    this.inner = inner;
    this.secret = secret;
    this.domain = domain;
  }

  async handshake(): Promise<void> {
    this.inner.write(this.buildStampedHello());
    await this.readAndVerifyServerHandshake();
  }

  write(data: Buffer): void {
    for (let off = 0; off < data.length; off += TLS_RECORD_MAX_PAYLOAD) {
      const chunkLen = Math.min(TLS_RECORD_MAX_PAYLOAD, data.length - off);
      const hdr = Buffer.alloc(TLS_RECORD_HEADER_LEN);
      TLS_APP_DATA_PREFIX.copy(hdr, 0);
      hdr.writeUInt16BE(chunkLen, 3);
      this.inner.write(
        Buffer.concat([hdr, data.subarray(off, off + chunkLen)]),
      );
    }
  }

  async readExactly(n: number): Promise<Buffer> {
    while (this.readBuf.length < n) {
      const { type, payload } = await readTlsRecord(this.inner);
      if (type !== TLS_RECORD_APPLICATION_DATA) continue;
      this.readBuf = Buffer.concat([this.readBuf, payload]);
    }
    const out = Buffer.from(this.readBuf.subarray(0, n));
    this.readBuf = this.readBuf.subarray(n);
    return out;
  }

  read(n: number): Promise<Buffer> {
    return this.readExactly(n);
  }

  readAll(): Promise<Buffer> {
    return Promise.reject(new Error('FakeTLS: readAll не поддерживается'));
  }

  connect(): Promise<unknown> {
    return Promise.reject(new Error('FakeTLS: сокет уже подключён'));
  }

  async close(): Promise<void> {
    await this.inner.close();
  }

  private buildStampedHello(): Buffer {
    const hello = buildClientHello(this.domain, randomBytes(32));
    const stamp = createHmac('sha256', this.secret).update(hello).digest();
    // Метка времени вписывается little-endian — так её читают MTProxy и
    // официальные клиенты. teleproto пишет big-endian, и прокси с проверкой
    // часов считает такого клиента чужим и уводит на маскировочный сайт.
    const now = Math.floor(Date.now() / 1000) >>> 0;
    stamp.writeUInt32LE(
      (stamp.readUInt32LE(HELLO_TIMESTAMP_XOR_OFFSET) ^ now) >>> 0,
      HELLO_TIMESTAMP_XOR_OFFSET,
    );
    stamp.copy(hello, HELLO_RANDOM_OFFSET);
    this.clientRandom = stamp;
    return hello;
  }

  /** Ждём канонический ответ из трёх записей — иначе падаем громко. */
  private async readAndVerifyServerHandshake(): Promise<void> {
    const expectedTypes = [
      TLS_RECORD_HANDSHAKE,
      TLS_RECORD_CHANGE_CIPHER_SPEC,
      TLS_RECORD_APPLICATION_DATA,
    ];
    const chunks: Buffer[] = [];
    let serverRandomOffset = -1;
    let offset = 0;
    for (let i = 0; i < expectedTypes.length; i += 1) {
      const { type, payload } = await readTlsRecord(this.inner);
      if (type !== expectedTypes[i]) {
        throw new Error(
          `FakeTLS: ожидалась запись ${describeRecord(expectedTypes[i], Buffer.alloc(0))} №${i}, пришла ${describeRecord(type, payload)}`,
        );
      }
      if (i === 0) serverRandomOffset = offset + HELLO_RANDOM_OFFSET;
      const hdr = Buffer.alloc(TLS_RECORD_HEADER_LEN);
      hdr[0] = type;
      hdr[1] = 0x03;
      hdr[2] = 0x03;
      hdr.writeUInt16BE(payload.length, 3);
      chunks.push(hdr, payload);
      offset += TLS_RECORD_HEADER_LEN + payload.length;
    }

    const serverResp = Buffer.concat(chunks);
    const serverRandom = Buffer.from(
      serverResp.subarray(
        serverRandomOffset,
        serverRandomOffset + HELLO_RANDOM_LEN,
      ),
    );
    serverResp.fill(
      0,
      serverRandomOffset,
      serverRandomOffset + HELLO_RANDOM_LEN,
    );
    const expected = createHmac('sha256', this.secret)
      .update(this.clientRandom)
      .update(serverResp)
      .digest();
    if (!expected.equals(serverRandom)) {
      throw new Error('FakeTLS: HMAC сервера не сошёлся — проверьте секрет');
    }
  }
}
