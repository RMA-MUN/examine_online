import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import Proctoring from './index';
import axios from '../../api/axios';
import { getExams } from '../../api/exams';

vi.mock('../../api/exams', () => ({
  getExams: vi.fn().mockResolvedValue({ data: { items: [] } }),
}));

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { items: [] } }),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const renderProctoring = () =>
  render(
    <MemoryRouter>
      <App>
        <Proctoring />
      </App>
    </MemoryRouter>,
  );

it('防作弊策略按钮已裁剪为disabled', async () => {
  renderProctoring();
  const btn = await screen.findByRole('button', { name: '防作弊策略' });
  expect(btn).toBeDisabled();
  expect(btn).toHaveAttribute('title', expect.stringContaining('P2'));
});

it('监控墙LIVE tiles保留+墙体占位注脚', async () => {
  renderProctoring();
  expect(await screen.findByText('实时监控墙')).toBeInTheDocument();
  // tiles 保留 LIVE/ALERT/OFF 标识
  expect(screen.getAllByText(/LIVE|ALERT|OFF/).length).toBeGreaterThan(0);
  const note = document.querySelector('.wall-note');
  expect(note?.textContent).toContain('本地' + '演示占位');
});

it('F4 全处置返null不PATCH（删recordEvents[0]回退）', async () => {
  vi.mocked(getExams).mockResolvedValueOnce({ data: { items: [{ id: 7, title: '期中考试' }] } } as never);
  const mockGet = vi.mocked(axios.get);
  mockGet.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/records/')) {
      return {
        data: [
          {
            id: 1,
            exam_id: 7,
            record_id: 2024010118,
            student_id: 1,
            event_type: 'switch',
            detail: null,
            handled_action: 'warn',
            handled_by: 1,
            created_at: '15:18:02',
          },
        ],
      } as never;
    }
    return { data: { items: [] } } as never;
  });
  const mockPatch = vi.mocked(axios.patch);
  mockPatch.mockClear();
  const { unmount } = renderProctoring();
  // 打开王磊抽屉（id 2024010118 为数字型 recordId，可触发真接口分支）
  const tileName = await screen.findByText('王磊');
  const tileBtn = tileName.closest('button');
  expect(tileBtn).not.toBeNull();
  fireEvent.click(tileBtn!);
  await screen.findByRole('button', { name: '发送警告' });
  // 等记录事件流（全已处置）加载完成
  await waitFor(() => {
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/api/records/'));
  });
  // 等 examId=7 的事件轮询建立（保证 handle 时 examId 非空，若仍 PATCH 则为回退 bug）
  await waitFor(
    () => {
      expect(mockGet).toHaveBeenCalledWith('/api/exams/7/events', expect.anything());
    },
    { timeout: 3000 },
  );
  mockPatch.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '发送警告' }));
  await waitFor(() => new Promise((r) => setTimeout(r, 200)));
  expect(mockPatch).not.toHaveBeenCalled();
  unmount();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { items: [] } } as never);
});
