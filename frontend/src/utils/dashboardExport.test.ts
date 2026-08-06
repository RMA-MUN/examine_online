import type { AxiosResponse } from 'axios';
import { downloadDashboardFile } from './dashboardExport';

describe('downloadDashboardFile', () => {
  let createObjectURL: ReturnType<typeof vi.spyOn>;
  let revokeObjectURL: ReturnType<typeof vi.spyOn>;
  let click: ReturnType<typeof vi.spyOn>;
  let appendChild: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.URL.createObjectURL = vi.fn(() => 'blob:test');
    window.URL.revokeObjectURL = vi.fn();
    createObjectURL = vi.spyOn(window.URL, 'createObjectURL');
    revokeObjectURL = vi.spyOn(window.URL, 'revokeObjectURL');
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    appendChild = vi.spyOn(document.body, 'appendChild');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('a[download]').forEach((anchor) => anchor.remove());
  });

  it('uses and sanitizes the RFC 5987 filename from Content-Disposition', () => {
    const response = {
      data: new Blob(['test']),
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''%E4%BB%AA%E8%A1%A8%E7%9B%98%2F%E6%A6%82%E8%A7%88%28%E6%95%B0%E6%8D%AE%29%F0%9F%94%A5.csv",
      },
    } as unknown as AxiosResponse<Blob>;

    downloadDashboardFile(response, 'dashboard.csv');

    const anchor = appendChild.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.download).toBe('仪表盘_概览_数据.csv');
    expect(click).toHaveBeenCalledTimes(1);
    expect(anchor).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('falls back to a safe filename for a raw Blob response', () => {
    const blob = new Blob(['test']);

    downloadDashboardFile(blob, '../dashboard summary.csv');

    const anchor = appendChild.mock.calls[0][0] as HTMLAnchorElement;
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.download).toBe('dashboard_summary.csv');
  });
});
