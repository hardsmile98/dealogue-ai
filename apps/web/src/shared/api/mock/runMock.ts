import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

/** Ошибка мока в том же виде, в каком её вернул бы NestJS. */
export class MockApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'MockApiError'
    this.status = status
  }
}

export type MockResult<T> = { data: T } | { error: FetchBaseQueryError }

const DEFAULT_LATENCY_MS = 350

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Запускает мок-операцию с задержкой «как в сети» и приводит результат
 * к формату queryFn RTK Query: ошибки мока становятся FetchBaseQueryError,
 * так что обработка ошибок в UI одинакова для мока и реального API.
 */
export async function runMock<T>(
  operation: () => T | Promise<T>,
  latencyMs = DEFAULT_LATENCY_MS,
): Promise<MockResult<T>> {
  await delay(latencyMs)
  try {
    return { data: await operation() }
  } catch (error) {
    if (error instanceof MockApiError) {
      return {
        error: { status: error.status, data: { message: error.message } },
      }
    }
    throw error
  }
}
