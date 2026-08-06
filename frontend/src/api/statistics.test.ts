import type { Mock, MockedFunction } from 'vitest';
import axios from './axios';
import { exportScores, getScoreExportOptions } from './statistics';

vi.mock('./axios', () => ({
  __esModule: true,
  default: { get: vi.fn() },
}));

const mockGet = axios.get as Mock;

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
