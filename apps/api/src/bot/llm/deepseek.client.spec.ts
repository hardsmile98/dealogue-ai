import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { BotConfig } from '../bot.config.js';
import { DeepSeekClient } from './deepseek.client.js';
import { LlmError } from './llm.types.js';
import type { LlmRequest } from './llm.types.js';

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

const REQUEST: LlmRequest = {
  model: 'deepseek-chat',
  messages: [{ role: 'user', content: 'привет' }],
  temperature: 0,
  json: true,
};

let server: Server | null = null;

async function clientFor(handler: Handler, timeoutMs = 2_000) {
  server = createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const config = {
    llmEnabled: true,
    llmApiKey: 'test-key',
    llmBaseUrl: `http://127.0.0.1:${port}`,
    llmTimeoutMs: timeoutMs,
  } as BotConfig;
  return new DeepSeekClient(config);
}

async function failure(promise: Promise<unknown>): Promise<LlmError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(LlmError);
  return error as LlmError;
}

afterEach(async () => {
  const current = server;
  server = null;
  if (!current) return;
  current.closeAllConnections();
  await new Promise((resolve) => current.close(resolve));
});

describe('DeepSeekClient', () => {
  it('отдаёт текст и расход токенов', async () => {
    const client = await clientFor((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 3,
            prompt_cache_hit_tokens: 8,
          },
        }),
      );
    });
    const result = await client.complete(REQUEST);
    expect(result.text).toBe('{"ok":true}');
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 3,
      cachedTokens: 8,
    });
  });

  it('тело, которое перестало приходить, обрывается по таймауту', async () => {
    const client = await clientFor((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"choices":[');
      // Остальное не придёт никогда.
    }, 150);
    const error = await failure(client.complete(REQUEST));
    expect(error.message).toMatch(/таймаут 150 мс/);
    expect(error.retryable).toBe(true);
  });

  it('5xx и 429 повторяются, 4xx — нет', async () => {
    let status = 503;
    const client = await clientFor((_request, response) => {
      response.statusCode = status;
      response.end(JSON.stringify({ error: { message: 'занято' } }));
    });
    const busy = await failure(client.complete(REQUEST));
    expect(busy).toMatchObject({ status: 503, retryable: true });
    expect(busy.message).toContain('занято');

    status = 429;
    expect(await failure(client.complete(REQUEST))).toMatchObject({
      retryable: true,
    });

    status = 400;
    expect(await failure(client.complete(REQUEST))).toMatchObject({
      status: 400,
      retryable: false,
    });
  });

  it('пустой ответ модели — временная ошибка', async () => {
    const client = await clientFor((_request, response) => {
      response.end(
        JSON.stringify({ choices: [{ message: { content: ' ' } }] }),
      );
    });
    expect(await failure(client.complete(REQUEST))).toMatchObject({
      retryable: true,
    });
  });

  it('без ключа не ходит в сеть и не повторяет', async () => {
    const client = new DeepSeekClient({ llmEnabled: false } as BotConfig);
    expect(await failure(client.complete(REQUEST))).toMatchObject({
      retryable: false,
    });
  });
});
