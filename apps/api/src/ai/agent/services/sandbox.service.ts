import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramChatEntity } from '../../../telegram/entities/telegram-chat.entity.js';
import type { FunnelStage, Gender, TouchKind } from '../../domain/types.js';
import { AiSettingsService } from '../../settings/ai-settings.service.js';
import type { HistoryMessage, SlotsSnapshot } from '../agent.types.js';
import { defaultRng } from '../lib/random.js';
import { formatSimilarCases } from '../learning/similar-cases.js';
import { plan, stageAfterTurn, stageForTouch } from '../planner/planner.js';
import type { ClientCard } from '../../domain/types.js';
import { emptyCard } from '../card/client-card.js';
import { clientCard, slotsOf } from '../card/turn-card.js';
import { ChatStateService } from './chat-state.service.js';
import { SimilarCasesService } from './similar-cases.service.js';
import { TurnContextService, peerOf } from './turn-context.service.js';
import { TurnGenerationService } from './turn-generation.service.js';

export interface SandboxHistoryItem {
  role: 'client' | 'bot' | 'manager';
  text: string;
}

export interface SandboxRequest {
  /** Взять состояние и историю из чата (иначе — чистый лист). */
  chatId?: string | null;
  history?: SandboxHistoryItem[];
  /** Новое сообщение клиента; пусто — касание `touchKind`. */
  message?: string | null;
  touchKind?: TouchKind | null;
  stage?: FunnelStage | null;
  slots?: Partial<Pick<SlotsSnapshot, 'birthDate' | 'birthPlace' | 'gender' | 'language' | 'requestSummary' | 'requestCategoryKey'>> | null;
}

export interface SandboxResult {
  stage: FunnelStage;
  stageAfter: FunnelStage;
  task: string | null;
  verdict: { kind: string; reason?: string; detail?: string };
  analysis: Record<string, unknown> | null;
  messages: { text: string; blockKind: string | null }[];
  send: boolean;
  silentReason: string | null;
  guardNotes: Record<string, unknown>[];
  guardOk: boolean;
  examples: { kind: string; title: string }[];
  blocks: { kind: string; title: string }[];
  /** Похожие прошлые случаи, подмешанные в промпт (раздел 9.3 ТЗ). */
  similarCases: { source: string; clientText: string; answerText: string }[];
  usage: { tokensIn: number; tokensOut: number; durationMs: number; model: string };
  prompts: { system: string; user: string } | null;
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Песочница (раздел 12.1 п. 7 ТЗ): полный ход Planner → Composer → Guard
 * без отправки и без записи в базу. Для проверки плейбуков и образцов.
 */
@Injectable()
export class SandboxService {
  constructor(
    @InjectRepository(TelegramChatEntity)
    private readonly chats: Repository<TelegramChatEntity>,
    private readonly settings: AiSettingsService,
    private readonly chatState: ChatStateService,
    private readonly context: TurnContextService,
    private readonly similar: SimilarCasesService,
    private readonly generation: TurnGenerationService,
  ) {}

  async run(accountId: string, request: SandboxRequest): Promise<SandboxResult> {
    const settings = await this.settings.get(accountId);
    const now = new Date();
    const rng = defaultRng;

    let card: ClientCard = emptyCard(settings.persona.language);
    let manualSlots: string[] = [];
    let peer: { name: string | null; username: string | null } = { name: null, username: null };
    let history: HistoryMessage[] = [];
    let baseStage: FunnelStage = 'greeting';
    let sentBlockIds: string[] = [];
    let usedExampleIds: string[] = [];

    if (request.chatId) {
      const chat = await this.chats.findOne({ where: { id: request.chatId, accountId } });
      const state = chat ? await this.chatState.find(chat.id) : null;
      if (chat) {
        history = await this.context.loadHistory(chat.id);
        peer = peerOf(chat);
      }
      if (state) {
        card = clientCard(state, settings.persona.language, now);
        manualSlots = state.manualSlots;
        baseStage = state.stage;
        sentBlockIds = state.sentBlockIds;
        usedExampleIds = state.usedExampleIds;
      }
    }
    if (request.history && request.history.length > 0) {
      history = request.history.map((item, index) => ({
        id: `sandbox-${index}`,
        telegramMessageId: index + 1,
        role: item.role,
        text: item.text,
        sentAt: new Date(now.getTime() - (request.history!.length - index) * 60_000),
        readAt: item.role === 'client' ? null : now,
        mediaKind: null,
        turnId: null,
      }));
    }
    if (request.slots) {
      card = {
        ...card,
        birthDate: request.slots.birthDate ?? card.birthDate,
        birthPlace: request.slots.birthPlace ?? card.birthPlace,
        gender: (request.slots.gender as Gender | null | undefined) ?? card.gender,
        language: request.slots.language ?? card.language,
        requestSummary: request.slots.requestSummary ?? card.requestSummary,
        requestCategoryKey: request.slots.requestCategoryKey ?? card.requestCategoryKey,
      };
    }
    const slots = slotsOf(card, manualSlots, now);

    const trigger = request.message?.trim() ? 'inbound' : 'touch';
    const touchKind = trigger === 'touch' ? (request.touchKind ?? 'reengage') : null;
    const stage = request.stage ?? (touchKind ? stageForTouch(touchKind) : baseStage);
    const batch: HistoryMessage[] =
      trigger === 'inbound'
        ? [{ id: 'sandbox-new', telegramMessageId: history.length + 1, role: 'client', text: request.message!.trim(), sentAt: now, readAt: null, mediaKind: null, turnId: null }]
        : [];

    const ctx = await this.context.load({
      accountId,
      stage,
      touchKind,
      slots,
      usedExampleIds,
      sentBlockIds,
      accountLanguage: settings.persona.language,
      rng,
    });

    const verdict = plan({
      trigger,
      touchKind,
      mode: 'auto',
      stage,
      playbook: ctx.playbook,
      slots,
      batch,
      history,
      isMinor: slots.age !== null && slots.age < 18,
      autoMessagesSinceClient: 0,
      remindersSent: 0,
      diagnosticsSentAt: null,
      diagnosticsReadAt: null,
      lastClientMessageAt: history.filter((m) => m.role === 'client').at(-1)?.sentAt ?? null,
      limits: settings.limits,
      blocks: ctx.blocks,
      exhaustedBlockKinds: ctx.exhaustedBlockKinds,
      recentTurns: [],
      now,
    });

    const base: SandboxResult = {
      stage,
      stageAfter: stage,
      task: null,
      verdict: { kind: verdict.kind },
      analysis: null,
      messages: [],
      send: false,
      silentReason: null,
      guardNotes: [],
      guardOk: true,
      examples: ctx.examples.map((e) => ({ kind: e.kind, title: e.title })),
      blocks: ctx.blocks.map((b) => ({ kind: b.kind, title: b.title })),
      similarCases: [],
      usage: { tokensIn: 0, tokensOut: 0, durationMs: 0, model: '' },
      prompts: null,
    };
    if (verdict.kind === 'skip') return { ...base, verdict: { kind: 'skip', detail: verdict.detail } };
    if (verdict.kind === 'handoff') return { ...base, verdict: { kind: 'handoff', reason: verdict.reason, detail: verdict.detail } };

    const task = verdict.task;
    // Похожие случаи — как в настоящем ходе, чтобы песочница показывала то же, что увидит модель.
    const cases = await this.similar.find({
      accountId,
      chatId: request.chatId ?? ZERO_UUID,
      texts: batch.map((m) => m.text),
      stage,
      categoryKey: slots.requestCategoryKey,
    });
    const gen = await this.generation.generate({
      system: { persona: settings.persona, facts: ctx.facts, stages: ctx.stages, categories: ctx.categories },
      turn: { task, playbook: ctx.playbook, examples: ctx.examples, blocks: ctx.blocks, history, batch, card, age: slots.age, manualSlots, peer, notes: ctx.notes, similarCases: formatSimilarCases(cases), now },
      guard: {
        sentBlockIds,
        exhaustedBlockKinds: ctx.exhaustedBlockKinds,
        pastBotMessages: history.filter((m) => m.role === 'bot').map((m) => m.text),
        greetedToday: history.some((m) => m.role === 'bot' && m.sentAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10) && /^(привет|здравствуй|добр)/i.test(m.text)),
        config: settings.guard,
      },
      task,
      blockPools: ctx.blockPools,
      facts: ctx.facts,
      personaLinks: settings.persona.links,
      accountLanguage: ctx.accountLanguage,
    });

    const escalation = gen.output.analysis.escalation;
    const stageAfter = stageAfterTurn(stage, trigger, touchKind, gen.output.analysis.stageProgress, {
      birthKnown: Boolean(slots.birthDate || slots.birthDateText),
      requestKnown: Boolean(slots.requestSummary || gen.output.analysis.card.requestSummary),
      hasDiscountBlock: ctx.hasDiscountBlock,
    });

    return {
      ...base,
      stageAfter,
      similarCases: cases.map((item) => ({ source: item.source, clientText: item.clientText, answerText: item.answerText })),
      task: task.text,
      verdict: escalation
        ? { kind: 'handoff', reason: escalation.reason, detail: escalation.note ?? '' }
        : gen.guardOk
          ? { kind: 'proceed' }
          : { kind: 'handoff', reason: 'guard_failed', detail: 'Проверка не пройдена дважды' },
      analysis: gen.output.analysis as unknown as Record<string, unknown>,
      messages: gen.messages.map((m) => ({ text: m.text, blockKind: m.blockKind })),
      send: gen.output.reply.send,
      silentReason: gen.output.reply.silentReason,
      guardNotes: gen.guardNotes as unknown as Record<string, unknown>[],
      guardOk: gen.guardOk,
      usage: { tokensIn: gen.tokensIn, tokensOut: gen.tokensOut, durationMs: gen.durationMs, model: gen.model },
      prompts: gen.prompts,
    };
  }
}
