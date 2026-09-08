/**
 * Проверка MTProxy из .env без запуска приложения:
 *   npm run telegram:probe
 * Перебирает все прокси из TELEGRAM_MTPROXY, подключается через тот же
 * транспорт, что и приложение, и спрашивает у Telegram ближайший DC.
 */
import 'dotenv/config';
import teleproto from 'teleproto';
import { parseProxies } from '../telegram.config.js';
import { ConnectionTCPMTProxyPadded, needsPaddedTransport } from '../client/mtproxy-padded-transport.js';

const apiId = Number(process.env.TELEGRAM_API_ID ?? 0);
const apiHash = process.env.TELEGRAM_API_HASH ?? '';
const proxies = parseProxies(process.env.TELEGRAM_MTPROXY ?? '');

if (!apiId || !apiHash) {
  console.error('TELEGRAM_API_ID / TELEGRAM_API_HASH не заданы в .env');
  process.exit(1);
}
if (proxies.length === 0) {
  console.error('TELEGRAM_MTPROXY пуст — проверять нечего');
  process.exit(1);
}

let failures = 0;
for (const proxy of proxies) {
  const label = `${proxy.host}:${proxy.port} (${proxy.secret.slice(0, 2)}…)`;
  const client = new teleproto.TelegramClient(new teleproto.sessions.StringSession(''), apiId, apiHash, {
    proxy: { MTProxy: true, ip: proxy.host, port: proxy.port, secret: proxy.secret, timeout: 10 },
    connectionRetries: 1,
    timeout: 10,
    baseLogger: new teleproto.Logger('none' as never),
  });
  if (needsPaddedTransport(proxy.secret)) {
    client._connection = ConnectionTCPMTProxyPadded as unknown as typeof client._connection;
  }

  const started = Date.now();
  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('таймаут 20 с')), 20_000)),
    ]);
    const nearest = await client.invoke(new teleproto.Api.help.GetNearestDc());
    console.log(
      `✔ ${label}: подключено за ${Date.now() - started} мс, DC ${nearest.thisDc}, ближайший DC ${nearest.nearestDc} (${nearest.country})`,
    );
  } catch (error) {
    failures += 1;
    console.log(`✖ ${label}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  } finally {
    await client.destroy().catch(() => undefined);
  }
}

process.exit(failures === proxies.length ? 1 : 0);
