import { randomBytes, randomInt } from 'node:crypto';
import teleproto from 'teleproto';
import { PacketCodec } from 'teleproto/network/connection/Connection.js';
import { TCPMTProxy } from 'teleproto/network/connection/TCPMTProxy.js';

const { errors } = teleproto;

/** Коды транспортных ошибок, которые прокси/DC шлют вместо пакета. */
const TRANSPORT_ERROR_CODES = new Set([-404, -429, -444]);

interface PacketReader {
  readExactly(n: number): Promise<Buffer>;
}

/**
 * Транспорт «padded intermediate» (тег 0xdddddddd): 4 байта длины little-endian,
 * полезная нагрузка и 0–3 байта случайного хвоста. Именно его требуют MTProxy
 * с секретами `dd…` (random padding) и `ee…` (fake-TLS) — teleproto для
 * MTProxy всегда шлёт abridged (0xef), и такие прокси молча рвут соединение.
 *
 * Хвост снимается по остатку длины от 4: сами MTProto-пакеты всегда кратны 4.
 */
export class PaddedIntermediatePacketCodec extends PacketCodec {
  static tag: Buffer | undefined = undefined;
  static obfuscateTag = Buffer.from('dddddddd', 'hex');

  tag: Buffer | undefined = undefined;
  obfuscateTag = PaddedIntermediatePacketCodec.obfuscateTag;

  override encodePacket(data: Buffer): Buffer {
    const padding = randomBytes(randomInt(0, 4));
    const body = Buffer.concat([data, padding]);
    const length = Buffer.alloc(4);
    length.writeUInt32LE(body.length, 0);
    return Buffer.concat([length, body]);
  }

  override async readPacket(reader: PacketReader): Promise<Buffer> {
    const lengthBuffer = await reader.readExactly(4);
    const length = lengthBuffer.readInt32LE(0);

    if (length === 4) {
      // Транспортная ошибка: вместо пакета — одно отрицательное число.
      const candidate = await reader.readExactly(4);
      if (TRANSPORT_ERROR_CODES.has(candidate.readInt32LE(0))) {
        throw new errors.InvalidBufferError(candidate);
      }
      return candidate;
    }
    if (length <= 0) {
      throw new errors.InvalidBufferError(lengthBuffer);
    }

    const body = await reader.readExactly(length);
    const padding = length % 4;
    return padding > 0 ? body.subarray(0, length - padding) : body;
  }
}

/** MTProxy-соединение на padded intermediate вместо abridged. */
export class ConnectionTCPMTProxyPadded extends TCPMTProxy {
  override PacketCodecClass = PaddedIntermediatePacketCodec as unknown as typeof PacketCodec;
}

/**
 * Нужен ли padded-транспорт для секрета: да для `dd…` и `ee…`,
 * для «голого» 16-байтового секрета остаётся abridged.
 */
export function needsPaddedTransport(secret: string): boolean {
  const normalized = secret.trim();
  if (/^[0-9a-fA-F]+$/.test(normalized)) {
    const prefix = normalized.slice(0, 2).toLowerCase();
    return prefix === 'dd' || prefix === 'ee';
  }
  // base64-вариант из t.me/proxy-ссылок: 0xdd → «3Q», 0xee → «7g».
  return normalized.startsWith('3Q') || normalized.startsWith('7g');
}
