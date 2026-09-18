import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LlmError } from '../../ai/llm/llm-provider.interface.js';

/**
 * Единый ответ на ошибку. Форму тела HttpException не трогаем — веб читает
 * `data.message` (apps/web/src/shared/lib/getApiErrorMessage.ts). Здесь
 * добавлены две вещи: ошибка провайдера модели становится 503 с текстом,
 * а всё непредвиденное пишется в лог со стеком и наружу уходит одной строкой.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) this.log(request, exception);
      send(response, status, exception.getResponse());
      return;
    }

    // Провайдер недоступен или ответил не тем — это не «500 у нас», а 503.
    if (exception instanceof LlmError) {
      this.logger.warn(`${label(request)}: модель — ${exception.message}`);
      send(response, HttpStatus.SERVICE_UNAVAILABLE, {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: exception.message,
        error: 'Service Unavailable',
      });
      return;
    }

    this.log(request, exception);
    send(response, HttpStatus.INTERNAL_SERVER_ERROR, {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Внутренняя ошибка сервера',
      error: 'Internal Server Error',
    });
  }

  private log(request: Request, error: unknown): void {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    this.logger.error(`${label(request)}: ${detail}`);
  }
}

function label(request: Request): string {
  return `${request.method} ${request.url}`;
}

function send(response: Response, status: number, body: unknown): void {
  // Ответ уже начали отдавать (SSE, стрим) — дописывать в него нечего.
  if (response.headersSent) return;
  response.status(status).json(body);
}
