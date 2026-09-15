import { describe, expect, it, vi, afterEach } from 'vitest';
import axios from './axios';
describe('B类接线', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('createFromBank 调 from-bank', async () => {
    const spy = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any);
    const { createFromBank } = await import('./exams');
    await createFromBank(7, [1, 2]);
    // 后端 FromBankRequest 字段为 bank_ids（见 backend/app/schemas/question.py），此处按后端真实现断言
    expect(spy).toHaveBeenCalledWith('/api/exams/7/questions/from-bank', { bank_ids: [1, 2] });
  });
  it('createBankQuestion 调 POST /api/bank/questions', async () => {
    const spy = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any);
    const { createBankQuestion } = await import('./exams');
    const payload = { type: 'single', content: 'q', score: 2 } as any;
    await createBankQuestion(payload);
    expect(spy).toHaveBeenCalledWith('/api/bank/questions', payload);
  });
  it('importQuestionsJson 调 questions/import', async () => {
    const spy = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any);
    const { importQuestionsJson } = await import('./exams');
    const items = [{ type: 'single', content: 'q1' }] as any;
    await importQuestionsJson(7, items);
    // 后端 QuestionImport 字段为 questions（见 backend/app/schemas/question.py），此处按后端真实现断言
    expect(spy).toHaveBeenCalledWith('/api/exams/7/questions/import', { questions: items });
  });
  it('reportEvent 调 events 且 detail 缺省为 null', async () => {
    const spy = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any);
    const { reportEvent } = await import('./exams');
    await reportEvent(7, 'switch');
    expect(spy).toHaveBeenCalledWith('/api/exams/7/events', { event_type: 'switch', detail: null });
    await reportEvent(7, 'blur', { a: 1 });
    expect(spy).toHaveBeenCalledWith('/api/exams/7/events', { event_type: 'blur', detail: { a: 1 } });
  });
});
