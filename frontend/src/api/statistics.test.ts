import type { Mock, MockedFunction } from 'vitest';
import axios from './axios';
import { exportScores, getScoreExportOptions } from './statistics';

vi.mock('./axios', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn() },
}));

const mockGet = axios.get as Mock;
const mockPost = axios.post as Mock;

describe('exportScores', () => {
  it('requests the score export with class and course filters', async () => {
    const response = { data: new Blob(['xlsx']), headers: {} };
    mockGet.mockResolvedValue(response);

    await expect(exportScores(3, 5)).resolves.toBe(response);
    expect(mockGet).toHaveBeenCalledWith('/api/statistics/scores/export', {
      params: { class_id: 3, course_id: 5 },
      responseType: 'blob',
      preserveResponse: true,
    });
  });

  it('omits filters when none are provided', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['xlsx']), headers: {} });

    await exportScores();

    expect(mockGet).toHaveBeenCalledWith('/api/statistics/scores/export', {
      params: {},
      responseType: 'blob',
      preserveResponse: true,
    });
  });
});

describe('getScoreExportOptions', () => {
  it('fetches class and course options', async () => {
    const options = { classes: [{ id: 1, name: '一班' }], courses: [{ id: 2, name: '数学' }] };
    mockGet.mockResolvedValue({ data: options });

    await expect(getScoreExportOptions()).resolves.toEqual({ data: options });
    expect(mockGet).toHaveBeenCalledWith('/api/statistics/scores/export-options');
  });
});

describe('Task5 报告导出接线', () => {
  it('buildExamReport 调 report 且携带 sections（blob 下载）', async () => {
    const { buildExamReport } = await import('./statistics');
    mockPost.mockResolvedValue({ data: new Blob(['xlsx']), headers: {} });

    await buildExamReport(7, ['scores', 'quality']);

    expect(mockPost).toHaveBeenCalledWith(
      '/api/statistics/exam/7/report',
      { sections: ['scores', 'quality'] },
      expect.objectContaining({ responseType: 'blob' })
    );
  });
});

describe('Task5 全屏公告接线', () => {
  it('postAnnouncement 调 announcements 广播', async () => {
    const { postAnnouncement } = await import('./exams');
    mockPost.mockResolvedValue({ data: {} });

    await postAnnouncement(7, '剩余 10 分钟');

    expect(mockPost).toHaveBeenCalledWith('/api/exams/7/announcements', { message: '剩余 10 分钟' });
  });

  it('getAnnouncements 调 announcements 轮询', async () => {
    const { getAnnouncements } = await import('./exams');
    mockGet.mockResolvedValue({ data: [] });

    await getAnnouncements(7);

    expect(mockGet).toHaveBeenCalledWith('/api/exams/7/announcements');
  });
});
