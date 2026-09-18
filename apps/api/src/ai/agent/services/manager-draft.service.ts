import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RealtimeService } from '../../../realtime/realtime.service.js';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import { TelegramMessageEntity } from '../../../telegram/entities/telegram-message.entity.js';
import { AlertsService } from '../../alerts/alerts.service.js';
import type { AiAccountSettingsEntity } from '../../entities/ai-account-settings.entity.js';
import type { AiChatStateEntity } from '../../entities/ai-chat-state.entity.js';
import { AiDraftEntity } from '../../entities/ai-draft.entity.js';
import { AiTurnEntity } from '../../entities/ai-turn.entity.js';
import { LlmError } from '../../llm/llm-provider.interface.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import type { HistoryMessage } from '../agent.types.js';
import { PROMPT_VERSION } from '../composer/prompt-builder.js';
import { managerDraftTask } from '../drafts/manager-draft.js';
import { defaultRng } from '../lib/random.js';
import type { Rng } from '../lib/random.js';
import { slotsFromAnalysis, snapshot } from '../lib/turn-slots.js';
import { toTurnMessage } from '../lib/turn-message.js';
import { plan } from '../planner/planner.js';
import { ChatStateService } from './chat-state.service.js';
import { HandoffService } from './handoff.service.js';
import { TurnContextService, toHistoryMessage } from './turn-context.service.js';
import { TurnGenerationService } from './turn-generation.service.js';
import type { GenerateResult } from './turn-generation.service.js';
import { TurnLimitsService } from './turn-limits.service.js';
import { done, postpone } from './turn-result.js';
import type { RunTurnParams, TurnRunResult } from './turn-result.js';

/**
 * Чат ведёт человек (режим `manager`, раздел 8.3 ТЗ): бот не пишет клиенту,
 * а предлагает менеджеру вариант ответа. Этап и таймеры воронки не трогаем —
 * её ведёт человек.
 */
@Injectable()
export class ManagerDraftService {
  constructor(
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    @InjectRepository(TelegramMessageEntity)
    private readonly messages: Repository<TelegramMessageEntity>,
    @InjectRepository(AiTurnEntity)
    private readonly turns: Repository<AiTurnEntity>,
    @InjectRepository(AiDraftEntity)
    private readonly drafts: Repository<AiDraftEntity>,
    private readonly settings: AiSettingsService,
    private readonly chatState: ChatStateService,
    private readonly context: TurnContextService,
    private readonly generation: TurnGenerationService,
    private readonly handoffs: HandoffService,
    private readonly limits: TurnLimitsService,
    private readonly alerts: AlertsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Ход в чате менеджера: вместо отправки — черновик на согласование. */
  async run(input: {
    params: RunTurnParams;
    settings: AiAccountSettingsEntity;
    chat: TelegramChatEntity;
    state: AiChatStateEntity;
    batch: HistoryMessage[];
    handledId: number;
    slotPatch: Partial<AiChatStateEntity>;
    now: Date;
    rng: Rng;
  }): Promise<TurnRunResult> {
    const { params, settings, chat, state, batch, handledId, slotPatch, now, rng } = input;
    if (params.trigger !== 'inbound' || batch.length === 0) return done('skip', null, 'Чат ведёт менеджер');
    const patch: Partial<AiChatStateEntity> = {
      ...slotPatch,
      lastHandledMessageId: handledId,
      lastClientMessageAt: batch[batch.length - 1].sentAt,
      autoMessagesSinceClient: 0,
    };

    // Медиа бот не видит — черновика не будет, но входящее менеджер увидит в очереди.
    const media = batch.find((m) => m.mediaKind && !m.text.trim());
    if (media) {
      await this.chatState.apply(state, patch);
      await this.handoffs.createDraft('handoff', 'pending', state, chat, batch, 'media', [], 'Клиент прислал вложение — бот его не видит', null);
      return done('awaiting_approval', null, 'Черновика нет: медиа без текста');
    }

    const limit = await this.limits.llmCalls(chat.accountId, settings, now);
    if (limit) return postpone(new Date(now.getTime() + limit.retryMs), limit.reason);

    const stage = state.stage;
    const slots = snapshot(state);
    const ctx = await this.context.load({
      accountId: chat.accountId,
      stage,
      touchKind: null,
      slots,
      usedExampleIds: state.usedExampleIds,
      sentBlockIds: state.sentBlockIds,
      personaLinks: settings.persona.links,
      rng,
    });
    const history = await this.context.loadHistory(chat.id, batch.map((m) => m.id));
    const task = managerDraftTask(stage, ctx);
    const similar = await this.generation.findSimilar(chat, state, stage, batch);

    let gen: GenerateResult;
    try {
      gen = await this.generation.generate(
        this.generation.paramsFor({ settings, ctx, task, history, batch, slots, state, similarCases: similar.lines, now }),
      );
    } catch (error) {
      const retryable = error instanceof LlmError ? error.retryable : true;
      const lastAttempt = params.attempt ? params.attempt.current >= params.attempt.max : false;
      if (retryable && !lastAttempt) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await this.chatState.apply(state, patch);
      // Без модели черновика нет — менеджер всё равно должен увидеть входящее.
      await this.handoffs.createDraft('handoff', 'pending_classification', state, chat, batch, state.handoffReason, [], `Модель недоступна: ${message}`, null);
      await this.alerts.create({ accountId: chat.accountId, chatId: chat.id, type: 'ai_error', payload: { error: message, stage } });
      return done('error', null, message);
    }

    const turn = await this.turns.save(
      this.turns.create({
        accountId: chat.accountId,
        chatId: chat.id,
        trigger: 'manager_draft',
        touchKind: null,
        stageBefore: stage,
        stageAfter: stage,
        inputMessageIds: batch.map((m) => m.id),
        clientText: batch.map((m) => m.text).join('\n'),
        similarCaseIds: similar.ids,
        promptVersion: PROMPT_VERSION,
        model: gen.model,
        analysis: gen.output.analysis as unknown as Record<string, unknown>,
        messagesPlanned: gen.messages.map(toTurnMessage),
        guardNotes: gen.guardNotes as unknown as Record<string, unknown>[],
        tokensIn: gen.tokensIn,
        tokensOut: gen.tokensOut,
        durationMs: gen.durationMs,
        outcome: 'awaiting_approval',
      }),
    );
    await this.chatState.apply(state, { ...patch, ...slotsFromAnalysis(state, gen.output, now) });
    const escalation = gen.output.analysis.escalation;
    await this.handoffs.createDraft(
      'handoff',
      'pending',
      state,
      chat,
      batch,
      escalation?.reason ?? state.handoffReason,
      gen.output.reply.send ? gen.messages : [],
      escalation?.note ?? gen.output.reply.silentReason ?? gen.output.analysis.clientIntent ?? null,
      turn.id,
    );
    return done('awaiting_approval', turn.id, 'Черновик для менеджера готов');
  }

  /**
   * Переписать черновик заново: для хода под контролем — по задаче того же
   * шага, для передачи — как ответ, который предложат менеджеру.
   */
  async regenerate(draft: AiDraftEntity, rng: Rng = defaultRng): Promise<AiDraftEntity> {
    const now = new Date();
    const chat = await this.chats.findOne({ where: { id: draft.chatId } });
    const state = await this.chatState.find(draft.chatId);
    if (!chat || !state) throw new Error('Чат черновика не найден');
    const settings = await this.settings.get(draft.accountId);
    const turn = draft.turnId ? await this.turns.findOne({ where: { id: draft.turnId } }) : null;

    const batchRows =
      draft.clientMessageIds.length > 0
        ? await this.messages.find({ where: { id: In(draft.clientMessageIds) }, order: { telegramMessageId: 'ASC' } })
        : [];
    const batch = batchRows.map(toHistoryMessage);
    const stage = turn?.stageBefore ?? state.stage;
    const touchKind = turn?.touchKind ?? null;
    const slots = snapshot(state);
    const ctx = await this.context.load({
      accountId: draft.accountId,
      stage,
      touchKind,
      slots,
      usedExampleIds: state.usedExampleIds,
      sentBlockIds: state.sentBlockIds,
      personaLinks: settings.persona.links,
      rng,
    });
    const history = await this.context.loadHistory(chat.id, batch.map((m) => m.id));

    let task = managerDraftTask(stage, ctx);
    // Ход под контролем переписываем по задаче того же шага воронки.
    if (draft.kind === 'supervised') {
      const recentTurns = await this.context.recentTurns(chat.id);
      const verdict = plan({
        trigger: turn?.trigger === 'touch' || turn?.trigger === 'manual' ? turn.trigger : 'inbound',
        touchKind,
        mode: 'auto',
        stage,
        playbook: ctx.playbook,
        slots,
        batch,
        history,
        isMinor: state.isMinor,
        autoMessagesSinceClient: state.autoMessagesSinceClient,
        remindersSent: state.remindersSent,
        diagnosticsSentAt: state.diagnosticsSentAt,
        diagnosticsReadAt: state.diagnosticsReadAt,
        lastClientMessageAt: state.lastClientMessageAt,
        limits: settings.limits,
        blocks: ctx.blocks,
        exhaustedBlockKinds: ctx.exhaustedBlockKinds,
        recentTurns,
        now,
      });
      if (verdict.kind === 'proceed') task = verdict.task;
    }

    const similar = await this.generation.findSimilar(chat, state, stage, batch);
    const gen = await this.generation.generate(
      this.generation.paramsFor({ settings, ctx, task, history, batch, slots, state, similarCases: similar.lines, now }),
    );
    draft.draftMessages = gen.messages.map(toTurnMessage);
    draft.similarCaseIds = similar.ids;
    draft.draftRationale = gen.output.reply.send
      ? (gen.output.analysis.clientIntent ?? draft.draftRationale)
      : (gen.output.reply.silentReason ?? 'Модель считает, что отвечать сейчас не нужно');
    await this.drafts.save(draft);
    if (turn) {
      turn.messagesPlanned = draft.draftMessages;
      turn.similarCaseIds = similar.ids;
      turn.analysis = gen.output.analysis as unknown as Record<string, unknown>;
      turn.guardNotes = gen.guardNotes as unknown as Record<string, unknown>[];
      turn.tokensIn += gen.tokensIn;
      turn.tokensOut += gen.tokensOut;
      turn.durationMs += gen.durationMs;
      await this.turns.save(turn);
    }
    await this.realtime.publishForAccount(draft.accountId, { type: 'draft.updated', accountId: draft.accountId, chatId: draft.chatId, draftId: draft.id, status: draft.status });
    return draft;
  }
}
