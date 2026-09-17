/**
 * Задача хода, когда чат ведёт человек (раздел 8.2 ТЗ): бот не отправляет
 * сообщение, а предлагает менеджеру готовый ответ. Ограничения этапа сняты,
 * правила про факты и про «я не бот» остаются.
 */

import type { FunnelStage } from '../../domain/types.js';
import type { TurnTask } from '../agent.types.js';
import type { TurnContext } from '../services/turn-context.service.js';

export const MANAGER_DRAFT_TASK_TEXT =
  'Этот чат ведёт человек — менеджер. Ты не отправляешь сообщение сам, а предлагаешь ему готовый ответ клиенту: ' +
  'ответь на то, что клиент написал, так, как ответил бы сам, опираясь на факты и переписку. ' +
  'Обязательных шагов этапа сейчас нет, вести к следующему этапу не нужно. ' +
  'Если ответить нельзя без человека (нужны реквизиты, личные договорённости, острая ситуация), ' +
  'поставь reply.send = false и объясни в silentReason, что должен решить менеджер.';

export function managerDraftTask(stage: FunnelStage, ctx: TurnContext): TurnTask {
  return {
    trigger: 'manager_draft',
    touchKind: null,
    stage,
    text: MANAGER_DRAFT_TASK_TEXT,
    // Ничего не обязательно; дословные блоки — только те, что уместны на этапе.
    requiredBlockKinds: [],
    allowedBlockKinds: ctx.blocks.map((b) => b.kind),
    exampleKinds: ctx.playbook.exampleKinds,
    noQuestions: false,
  };
}
