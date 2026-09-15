import { describe, expect, it, vi, afterEach } from 'vitest';
import axios from './axios';

describe('Task3 题库导入与组卷落盘', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('importBankFile 调 POST /api/bank/questions/import-file（multipart）', async () => {
    const spy = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any);
    const { importBankFile } = await import('./exams');
    const file = new File(['x'], 'bank.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await importBankFile(file);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, body, config] = spy.mock.calls[0] as any[];
    expect(url).toBe('/api/bank/questions/import-file');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(config?.headers?.['Content-Type']).toBe('multipart/form-data');
  });

  it('generatePaperFromBasket 调 from-bank 且字段为 bank_ids', async () => {
    const spy = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} } as any);
    const { generatePaperFromBasket } = await import('./exams');
    await generatePaperFromBasket(7, [1, 2]);
    expect(spy).toHaveBeenCalledWith('/api/exams/7/questions/from-bank', { bank_ids: [1, 2] });
  });
});
