import type { Mock, MockedFunction } from 'vitest';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './index';
import { exportDashboard, exportScores, getDashboard, getScoreExportOptions } from '../../api/statistics';
import { downloadDashboardFile } from '../../utils/dashboardExport';
import type { ApiResponse } from '../../types/api';
import type {
  AdminDashboardData,
  StudentDashboardData,
  TeacherDashboardData,
} from '../../types/dashboard';

vi.mock('../../api/statistics', () => ({
  exportDashboard: vi.fn(),
  getDashboard: vi.fn(),
  exportScores: vi.fn(),
  getScoreExportOptions: vi.fn(),
}));

vi.mock('../../utils/dashboardExport', () => ({
  downloadDashboardFile: vi.fn(),
}));

vi.mock('../../components/EChart', () => ({
  __esModule: true,
  default: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockGetDashboard = getDashboard as Mock;
const mockExportDashboard = exportDashboard as Mock;
const mockDownloadDashboardFile = downloadDashboardFile as Mock;
const mockExportScores = exportScores as Mock;
const mockGetScoreExportOptions = getScoreExportOptions as Mock;

const studentData: StudentDashboardData = {
  role: 'student',
  stats: { available_exams: 2, my_exam_count: 5, avg_score: 82.5, pass_rate: 80 },
  upcoming_exams: [
    { id: 1, title: '期中考试', start_time: '2026-08-10 09:00:00', duration: 90 },
  ],
  recent_records: [
    {
      id: 1,
      exam_id: 1,
      exam_title: '期末考试',
      score: 88,
      pass_score: 60,
      status: 'graded',
      submit_time: '2026-07-01 11:00:00',
    },
  ],
};

const teacherData: TeacherDashboardData = {
  role: 'teacher',
  stats: { published_exams: 2, pending_grading_count: 3, course_count: 1, total_records: 8 },
  pending_grading: [{ exam_id: 2, exam_title: '数据结构', pending_count: 3 }],
  recent_exams: [
    { id: 2, title: '数据结构', status: 'published', start_time: '2026-08-08 09:00:00' },
  ],
};

const adminData: AdminDashboardData = {
  role: 'admin',
  stats: { student_count: 4, teacher_count: 2, admin_count: 1, exam_count: 3 },
  role_distribution: [
    { role: 'student', count: 4 },
    { role: 'teacher', count: 2 },
    { role: 'admin', count: 1 },
  ],
  recent_users: [],
  exam_status_distribution: [{ status: 'finished', count: 1 }],
  exams_per_course: [{ course_name: '计算机网络', count: 1 }],
  exam_avg_scores: [{ exam_id: 1, exam_title: '期中考试', avg_score: 75.5 }],
  exam_pass_rates: [{ exam_id: 1, exam_title: '期中考试', pass_rate: 50 }],
  score_distribution: [
    { label: '0-59', count: 0 },
    { label: '60-69', count: 0 },
    { label: '70-79', count: 0 },
    { label: '80-89', count: 1 },
    { label: '90-100', count: 0 },
  ],
  exam_participation: [{ exam_id: 1, exam_title: '期中考试', count: 1 }],
  pending_grading_by_exam: [{ exam_id: 1, exam_title: '期中考试', pending_count: 1 }],
  switch_counts_by_exam: [{ exam_id: 1, exam_title: '期中考试', switch_count: 3 }],
  class_student_distribution: [{ class_name: '计科2401班', count: 4 }],
};

const renderDashboard = (data: StudentDashboardData | TeacherDashboardData | AdminDashboardData) => {
  mockGetDashboard.mockResolvedValue({ data } as ApiResponse<typeof data>);
  return render(
    <App>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </App>
  );
};

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExportDashboard.mockResolvedValue({ data: new Blob(['file']), headers: {} });
    mockGetScoreExportOptions.mockResolvedValue({
      data: {
        classes: [{ id: 1, name: '计科2401班' }],
        courses: [{ id: 2, name: '数学' }],
      },
    });
  });

  it.each([
    [studentData, ['最近成绩与及格线图表', '考试通过率图表']],
    [teacherData, ['待批改题目数量图表', '最近考试时间线图表']],
    [
      adminData,
      [
        '用户角色分布图表',
        '考试状态分布图表',
        '各课程考试数量图表',
        '各考试平均分图表',
        '各考试及格率图表',
        '成绩分布图表',
        '各考试参与人数图表',
        '各考试待批改量图表',
        '各考试切屏次数图表',
        '班级学生分布图表',
      ],
    ],
  ] as const)('renders only the charts for the current role', async (data, labels) => {
    renderDashboard(data);

    expect(await screen.findByText('导出数据')).toBeInTheDocument();
    labels.forEach((label) => expect(screen.getByRole('img', { name: label })).toBeInTheDocument());
    const chartLabels = [
      '最近成绩与及格线图表',
      '考试通过率图表',
      '待批改题目数量图表',
      '最近考试时间线图表',
      '用户角色分布图表',
      '考试状态分布图表',
      '各课程考试数量图表',
      '各考试平均分图表',
      '各考试及格率图表',
      '成绩分布图表',
      '各考试参与人数图表',
      '各考试待批改量图表',
      '各考试切屏次数图表',
      '班级学生分布图表',
    ];
    expect(
      chartLabels.filter((label) => screen.queryByRole('img', { name: label }))
    ).toHaveLength(labels.length);
  });

  it('uses EmptyState instead of chart canvases when role datasets are empty', async () => {
    renderDashboard({ ...teacherData, pending_grading: [], recent_exams: [] });

    expect(await screen.findAllByText('没有待批改题目')).not.toHaveLength(0);
    expect(screen.getAllByText('还没有考试')).not.toHaveLength(0);
    expect(screen.queryByRole('img', { name: '待批改题目数量图表' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '最近考试时间线图表' })).not.toBeInTheDocument();
  });

  it('exports CSV summary and all Excel sheets with independent loading state', async () => {
    let resolveExport: ((value: unknown) => void) | undefined;
    mockExportDashboard.mockImplementation(
      () => new Promise((resolve) => { resolveExport = resolve; })
    );
    renderDashboard(studentData);

    const exportButton = await screen.findByRole('button', { name: /导出数据/ });
    fireEvent.click(exportButton);
    fireEvent.click(await screen.findByText('导出 CSV 概览'));

    expect(mockExportDashboard).toHaveBeenCalledWith('csv', 'summary');
    expect(exportButton).toBeDisabled();

    const response = { data: new Blob(['csv']), headers: {} };
    resolveExport?.(response);
    await waitFor(() => expect(mockDownloadDashboardFile).toHaveBeenCalledWith(response, '仪表盘概览.csv'));

    fireEvent.click(exportButton);
    fireEvent.click(await screen.findByText('导出 Excel 全部数据'));
    expect(mockExportDashboard).toHaveBeenCalledWith('xlsx', undefined);
  });

  it('shows an error and restores the export button when download fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockExportDashboard.mockRejectedValue(new Error('network error'));
    renderDashboard(adminData);

    const exportButton = await screen.findByRole('button', { name: /导出数据/ });
    fireEvent.click(exportButton);
    fireEvent.click(await screen.findByText('导出 CSV 概览'));

    expect(await screen.findByText('导出仪表盘数据失败')).toBeInTheDocument();
    await waitFor(() => expect(exportButton).not.toBeDisabled());
    expect(mockDownloadDashboardFile).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('opens the score export modal and downloads filtered data for teacher', async () => {
    mockExportScores.mockResolvedValue({ data: new Blob(['xlsx']), headers: {} });
    renderDashboard(teacherData);

    const exportButton = await screen.findByRole('button', { name: /导出数据/ });
    fireEvent.click(exportButton);
    fireEvent.click(await screen.findByText('成绩明细导出'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getAllByText('请选择班级')[0].closest('.ant-select-content') as Element);
    fireEvent.click(await screen.findByTitle('计科2401班'));
    fireEvent.mouseDown(screen.getAllByText('请选择科目')[0].closest('.ant-select-content') as Element);
    fireEvent.click(await screen.findByTitle('数学'));
    fireEvent.click(screen.getByRole('button', { name: /^导\s*出$/ }));

    await waitFor(() =>
      expect(mockExportScores).toHaveBeenCalledWith(1, 2)
    );
    await waitFor(() =>
      expect(mockDownloadDashboardFile).toHaveBeenCalledWith(
        { data: new Blob(['xlsx']), headers: {} },
        '成绩明细.xlsx'
      )
    );
  });

  it('hides the score export menu item for students', async () => {
    renderDashboard(studentData);

    fireEvent.click(await screen.findByRole('button', { name: /导出数据/ }));

    expect(screen.queryByText('成绩明细导出')).not.toBeInTheDocument();
  });

  it('shows an error when score export options fail to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetScoreExportOptions.mockRejectedValue(new Error('network error'));
    renderDashboard(teacherData);

    const exportButton = await screen.findByRole('button', { name: /导出数据/ });
    fireEvent.click(exportButton);
    fireEvent.click(await screen.findByText('成绩明细导出'));

    expect(await screen.findByText('获取导出选项失败')).toBeInTheDocument();
    error.mockRestore();
  });
});
