import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import Proctoring from './index';
import axios from '../../api/axios';
import { getExams } from '../../api/exams';

vi.mock('../../api/exams', () => ({
  getExams: vi.fn().mockResolvedValue({ data: { items: [] } }),
}));

vi.mock('../../api/grading', () => ({
  getExamRecords: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
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

const examItem = { id: 7, title: '期中考试' };

const recordItems = [
  {
    id: 101,
    exam_id: 7,
    student_id: 11,
    score: 0,
    status: 'ongoing',
    switch_count: 3,
    start_time: '2026-01-01T00:00:00',
    submit_time: null,
    created_at: '2026-01-01T00:00:00',
    student: { id: 11, username: 'stu11', role: 'student', name: '王磊' },
  },
  {
    id: 102,
    exam_id: 7,
    student_id: 12,
    score: 0,
    status: 'submitted',
    switch_count: 0,
    start_time: '2026-01-01T00:00:00',
    submit_time: '2026-01-01T01:00:00',
    created_at: '2026-01-01T00:00:00',
    student: { id: 12, username: 'stu12', role: 'student', name: '李思远' },
  },
];

const mkEvent = (id: number, recordId: number, type: string, handled: 'warn' | 'normal' | null = null) => ({
  id,
  exam_id: 7,
  record_id: recordId,
  student_id: recordId === 101 ? 11 : 12,
  event_type: type,
  detail: null,
  handled_action: handled,
  handled_by: handled ? 1 : null,
  created_at: `15:1${id}:02`,
});

it('防作弊策略按钮与策略列表已删除', async () => {
  renderProctoring();
  expect(await screen.findByText('实时监控墙')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '防作弊策略' })).not.toBeInTheDocument();
  expect(screen.queryByText('切屏检测与记录')).not.toBeInTheDocument();
});

it('空事件流渲染 EmptyState 而非演示占位', async () => {
  const { unmount } = renderProctoring();
  expect(await screen.findByText('实时监控墙')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('暂无异常事件')).toBeInTheDocument();
  });
  expect(screen.getByText('请先选择考试')).toBeInTheDocument();
  expect(screen.getByText('暂无处置记录')).toBeInTheDocument();
  // 无 mock 回退文案
  expect(document.body.textContent).not.toContain('演示占位');
  expect(document.body.textContent).not.toContain('本地演示');
  unmount();
});

it('风险由切屏/人脸丢失事件数推导 + KPI 映射真实记录', async () => {
  vi.mocked(getExams).mockResolvedValueOnce({ data: { items: [examItem] } } as never);
  const { getExamRecords } = await import('../../api/grading');
  vi.mocked(getExamRecords).mockResolvedValueOnce({
    data: { items: recordItems, total: 2, page: 1, page_size: 100 },
  } as never);
  const mockGet = vi.mocked(axios.get);
  mockGet.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/records/')) {
      return { data: [] } as never;
    }
    if (url === '/api/exams/7/events') {
      return {
        data: {
          // 记录 101：3 次切屏 → 高风险；记录 102：1 次人脸丢失 → 中风险（blur 不计入风险）
          items: [
            mkEvent(1, 101, 'switch'),
            mkEvent(2, 101, 'switch'),
            mkEvent(3, 101, 'switch'),
            mkEvent(4, 102, 'face_lost'),
            mkEvent(5, 102, 'blur'),
          ],
          total: 5,
          page: 1,
          page_size: 100,
        },
      } as never;
    }
    return { data: { items: [] } } as never;
  });
  const { unmount } = renderProctoring();
  // 墙体为记录驱动
  expect(await screen.findByText('王磊')).toBeInTheDocument();
  expect(screen.getByText('李思远')).toBeInTheDocument();
  expect(screen.getByText('记录 #101 · 事件 3 · 作答中')).toBeInTheDocument();
  // 风险推导：≥3 高风险，1–2 中风险（多处同名词：墙体 pill / KPI / 筛选段）
  expect(screen.getByText('高风险 · 3 次')).toBeInTheDocument();
  expect(screen.getAllByText('中风险').length).toBeGreaterThan(0);
  // 推导口径文案
  expect(screen.getByText(/风险由切屏 \/ 人脸丢失事件数推导/)).toBeInTheDocument();
  expect(screen.getByText(/暂无视频流，列表为事件聚合/)).toBeInTheDocument();
  // KPI：记录数 / 事件数 / 已交卷数均来自真实接口（banner 文本跨元素，用 textContent 断言）
  await waitFor(() => {
    expect(document.querySelector('.banner-warn')).not.toBeNull();
  });
  const bannerText = document.querySelector('.banner-warn')?.textContent ?? '';
  expect(bannerText).toContain('1 名考生');
  expect(bannerText).toContain('触发高风险告警');
  unmount();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { items: [] } } as never);
});

it('处置记录来自事件流 handled_action；为空时 EmptyState', async () => {
  vi.mocked(getExams).mockResolvedValueOnce({ data: { items: [examItem] } } as never);
  const { getExamRecords } = await import('../../api/grading');
  vi.mocked(getExamRecords).mockResolvedValueOnce({
    data: { items: recordItems, total: 2, page: 1, page_size: 100 },
  } as never);
  const mockGet = vi.mocked(axios.get);
  mockGet.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/records/')) {
      return { data: [] } as never;
    }
    if (url === '/api/exams/7/events') {
      return {
        data: {
          items: [mkEvent(1, 101, 'switch', 'warn'), mkEvent(2, 102, 'blur', 'normal'), mkEvent(3, 101, 'paste')],
          total: 3,
          page: 1,
          page_size: 100,
        },
      } as never;
    }
    return { data: { items: [] } } as never;
  });
  const { unmount } = renderProctoring();
  expect(await screen.findByText('已发送警告')).toBeInTheDocument();
  expect(screen.getByText('已标记正常')).toBeInTheDocument();
  expect(screen.queryByText('暂无处置记录')).not.toBeInTheDocument();
  unmount();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { items: [] } } as never);
});

it('F4 全处置返null不PATCH（删recordEvents[0]回退）', async () => {
  vi.mocked(getExams).mockResolvedValueOnce({ data: { items: [examItem] } } as never);
  const { getExamRecords } = await import('../../api/grading');
  vi.mocked(getExamRecords).mockResolvedValueOnce({
    data: { items: [recordItems[0]], total: 1, page: 1, page_size: 100 },
  } as never);
  const mockGet = vi.mocked(axios.get);
  mockGet.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.startsWith('/api/records/')) {
      return {
        data: [mkEvent(1, 101, 'switch', 'warn')],
      } as never;
    }
    if (url === '/api/exams/7/events') {
      return { data: { items: [mkEvent(1, 101, 'switch', 'warn')], total: 1, page: 1, page_size: 100 } } as never;
    }
    return { data: { items: [] } } as never;
  });
  const mockPatch = vi.mocked(axios.patch);
  mockPatch.mockClear();
  const { unmount } = renderProctoring();
  // 打开王磊抽屉（记录 #101，可触发真接口分支）
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
  // 全处置提示诚实文案
  expect(await screen.findByText('暂无待处置事件')).toBeInTheDocument();
  unmount();
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { items: [] } } as never);
});
