import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { AiDiagnosticEntity } from '../../entities/ai-diagnostic.entity.js';
import { AiPhraseEntity } from '../../entities/ai-phrase.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import type { TurnOutcome } from '../../domain/types.js';

/** Ответ считается ответом на ход, если пришёл в эти сутки после него (раздел 14 ТЗ). */
const REPLY_WINDOW_MS = 24 * 3_600_000;
/** Ходы, у которых сообщения реально ушли (в сухом прогоне — «ушли бы»). */
const DELIVERED: TurnOutcome[] = ['sent', 'dry_run'];

/**
 * Обучение на практике (раздел 9.2 ТЗ): считаем, на какие примеры и блоки
 * клиент отвечает. Похожие случаи для промпта ищет `SimilarCasesService`,
 * а здесь — только счётчик ответов.
 */
@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
    @InjectRepository(AiPhraseEntity)
    private readonly phrases: Repository<AiPhraseEntity>,
    @InjectRepository(AiDiagnosticEntity)
    private readonly diagnostics: Repository<AiDiagnosticEntity>,
  ) {}

  /**
   * Клиент написал: последний ход бота в этом чате получает отметку «ответили»,
   * а его примеры, блоки и диагностики — плюс к `replied_count`. Ответ
   * засчитывается один раз и только ходу, который был последним.
   */
  async markReplied(chatId: string, at: Date = new Date()): Promise<string[]> {
    // Берём именно последний ход, а не последний неотвеченный: иначе второе
    // сообщение клиента засчиталось бы ходу, который он уже пропустил.
    const turn = await this.turns.findOne({
      where: {
        chatId,
        outcome: In(DELIVERED),
        createdAt: MoreThan(new Date(at.getTime() - REPLY_WINDOW_MS)),
      },
      order: { createdAt: 'DESC' },
    });
    if (!turn || turn.repliedAt || turn.createdAt > at) return [];

    await this.turns.update(turn.id, { repliedAt: at });

    const ids = turn.libraryIds ?? [];
    if (ids.length === 0) return [];
    await this.phrases.increment({ id: In(ids) }, 'repliedCount', 1).catch(() => undefined);
    await this.diagnostics.increment({ id: In(ids) }, 'repliedCount', 1).catch(() => undefined);
    this.logger.debug(`Чат ${chatId}: ответ на ход ${turn.id.slice(0, 8)} — ${ids.length} записей библиотеки`);
    return ids;
  }
}
