import { describe, expect, it } from 'vitest';
import type { TurnContext } from '../services/turn-context.service.js';
import { managerDraftTask } from './manager-draft.js';

const ctx = {
  playbook: {
    stage: 'offer',
    goal: 'Предложить услуги',
    instructions: 'Обязательно позови на диагностику',
    requiredBlockKinds: ['offer'],
    allowedBlockKinds: ['links'],
    exampleKinds: ['offer', 'objection'],
    noQuestions: true,
    enabled: true,
  },
  blocks: [
    { kind: 'offer', id: 'b1', title: 'Предложение', text: '…', source: 'phrase' },
    { kind: 'links', id: 'b2', title: 'Ссылки', text: '…', source: 'phrase' },
  ],
} as unknown as TurnContext;

describe('managerDraftTask', () => {
  it('снимает обязательные блоки и запрет вопросов, оставляя блоки этапа доступными', () => {
    const task = managerDraftTask('offer', ctx);
    expect(task.trigger).toBe('manager_draft');
    expect(task.requiredBlockKinds).toEqual([]);
    expect(task.allowedBlockKinds).toEqual(['offer', 'links']);
    expect(task.noQuestions).toBe(false);
    expect(task.exampleKinds).toEqual(['offer', 'objection']);
  });

  it('объясняет модели, что отправляет человек, и как промолчать', () => {
    const task = managerDraftTask('price', ctx);
    expect(task.stage).toBe('price');
    expect(task.text).toContain('менеджер');
    expect(task.text).toContain('reply.send = false');
  });
});
