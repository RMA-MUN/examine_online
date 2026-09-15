import { render, screen } from '@testing-library/react';
import { App } from 'antd';
import Analytics from './index';

vi.mock('../../api/exams', () => ({
  getExams: vi.fn().mockResolvedValue({ data: { items: [] } }),
}));

vi.mock('../../api/statistics', () => ({
  buildExamReport: vi.fn(),
  exportScores: vi.fn(),
  getExamQuestionStats: vi.fn().mockResolvedValue({ data: [] }),
  getExamStudentScores: vi.fn().mockResolvedValue({ data: { total: 0 } }),
}));

vi.mock('../../utils/dashboardExport', () => ({
  downloadDashboardFile: vi.fn(),
}));

const renderAnalytics = () =>
  render(
    <App>
      <Analytics />
    </App>,
  );

it('成绩发布panel标记为待接入', async () => {
  renderAnalytics();
  expect(await screen.findByText('成绩发布')).toBeInTheDocument();
  expect(screen.getByText('教务系统同步')).toBeInTheDocument();
  expect(screen.getByText('申诉窗口')).toBeInTheDocument();
  const pending = screen.getAllByText('待接入');
  expect(pending.length).toBeGreaterThanOrEqual(4);
});

it('P2演示按钮已裁剪、无可点教务同步', async () => {
  renderAnalytics();
  await screen.findByText('成绩发布');
  // 待接入为纯展示 pill，不应是可点按钮
  expect(screen.queryByRole('button', { name: /教务同步/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /申诉/ })).not.toBeInTheDocument();
});
