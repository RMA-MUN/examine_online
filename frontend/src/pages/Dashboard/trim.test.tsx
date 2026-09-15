import { render, screen } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './index';
import { getDashboard } from '../../api/statistics';
import type { TeacherDashboardData } from '../../types/dashboard';
import type { ApiResponse } from '../../types/api';

vi.mock('../../api/statistics', () => ({
  getDashboard: vi.fn(),
  exportScores: vi.fn(),
  getScoreExportOptions: vi.fn().mockResolvedValue({ data: { classes: [], courses: [] } }),
}));

vi.mock('../../utils/dashboardExport', () => ({
  downloadDashboardFile: vi.fn(),
}));

vi.mock('../../components/EChart', () => ({
  __esModule: true,
  default: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockGetDashboard = getDashboard as unknown as ReturnType<typeof vi.fn>;

const base: TeacherDashboardData = {
  role: 'teacher',
  stats: { published_exams: 2, pending_grading_count: 3, course_count: 1, total_records: 8 },
  pending_grading: [],
  recent_exams: [],
};

const renderDashboard = (data: TeacherDashboardData) => {
  mockGetDashboard.mockResolvedValue({ data } as ApiResponse<typeof data>);
  return render(
    <App>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </App>,
  );
};

it('三卡片保留且/proctoring链接受保留', async () => {
  renderDashboard({ ...base, running_exams: [], grading_progress: [], feed: [] });
  expect(await screen.findByTestId('module-proctoring')).toBeInTheDocument();
  expect(screen.getByTestId('module-question-bank')).toBeInTheDocument();
  expect(screen.getByTestId('module-analytics')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '进入监控台' })).toHaveAttribute('href', '/proctoring');
});

it('kpi.alerts有真用真、否则回退feed计数', async () => {
  const { unmount } = renderDashboard({
    ...base,
    alerts: 5,
    feed: [{ level: 'warn', title: 'a', meta: 'm' }],
    running_exams: [],
    grading_progress: [],
  });
  expect(await screen.findByTestId('kpi-alerts')).toHaveTextContent('5');
  unmount();
  mockGetDashboard.mockResolvedValue({
    data: {
      ...base,
      feed: [
        { level: 'warn', title: 'a', meta: 'm' },
        { level: 'danger', title: 'b', meta: 'm' },
        { level: 'info', title: 'c', meta: 'm' },
      ],
      running_exams: [],
      grading_progress: [],
    },
  } as never);
  render(
    <App>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </App>,
  );
  // 无 alerts 真值时回退 feed 中 warn+danger 计数 = 2
  expect(await screen.findByTestId('kpi-alerts')).toHaveTextContent('2');
});
