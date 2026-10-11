import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import Analytics from './index';
import { getExams } from '../../api/exams';
import { getExamAnalytics, getExamStudentScores } from '../../api/statistics';

vi.mock('../../api/exams', () => ({
  getExams: vi.fn(),
}));

vi.mock('../../api/statistics', () => ({
  buildExamReport: vi.fn(),
  exportScores: vi.fn(),
  getExamAnalytics: vi.fn(),
  getExamQuestionStats: vi.fn().mockResolvedValue({ data: [] }),
  getExamStudentScores: vi.fn(),
}));

vi.mock('../../utils/dashboardExport', () => ({
  downloadDashboardFile: vi.fn(),
}));

const mockGetExams = vi.mocked(getExams);
const mockGetExamAnalytics = vi.mocked(getExamAnalytics);
const mockGetExamStudentScores = vi.mocked(getExamStudentScores);

const ANALYTICS_PAYLOAD = {
  items: [
    {
      question_id: 101,
      type: '单选',
      avg_score: 2.1,
      correct_rate: 0.41,
      distribution: { full: 10, partial: 20, zero: 30, total: 60 },
      knowledge: '线性表',
      p: 0.41,
      d: 0.55,
    },
  ],
  knowledge: [{ name: '线性表', rate: 86 }],
  classes: [{ class_id: 1, name: '计科 2401', avg: 78.2, pass_rate: 90.0, count: 60 }],
  bins: [
    { label: '0–39', count: 2 },
    { label: '60–69', count: 19 },
  ],
  discrimination: [{ question_id: 101, p: 0.41, d: 0.55 }],
};

const SCORES_PAYLOAD = {
  total: 58,
  items: [
    {
      student: { id: 1, name: '张三', username: 's1', class_id: 1 },
      score: 80,
      switch_count: 0,
      status: 'submitted',
      rank: 1,
    },
  ],
};

const renderAnalytics = () =>
  render(
    <App>
      <Analytics />
    </App>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockGetExams.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 100 } } as never);
  mockGetExamAnalytics.mockResolvedValue({ data: ANALYTICS_PAYLOAD } as never);
  mockGetExamStudentScores.mockResolvedValue({ data: SCORES_PAYLOAD } as never);
});

it('无考试时显示空状态', async () => {
  renderAnalytics();
  expect(await screen.findByText('暂无考试')).toBeInTheDocument();
  expect(mockGetExamAnalytics).not.toHaveBeenCalled();
});

it('不再渲染成绩发布与待接入占位', async () => {
  mockGetExams.mockResolvedValue({
    data: { items: [{ id: 7, title: '《数据结构》期中' }], total: 1, page: 1, page_size: 100 },
  } as never);
  renderAnalytics();
  await waitFor(() => expect(mockGetExamAnalytics).toHaveBeenCalledWith(7));
  await screen.findByText('计科 2401');
  expect(screen.queryByText('成绩发布')).not.toBeInTheDocument();
  expect(screen.queryByText('待接入')).not.toBeInTheDocument();
  expect(screen.queryByText(/PDF/)).not.toBeInTheDocument();
});

it('P2演示按钮已裁剪、无可点教务同步', async () => {
  mockGetExams.mockResolvedValue({
    data: { items: [{ id: 7, title: '《数据结构》期中' }], total: 1, page: 1, page_size: 100 },
  } as never);
  renderAnalytics();
  await screen.findByText('计科 2401');
  // 待接入为纯展示 pill，不应是可点按钮（发布 panel 已整体删除）
  expect(screen.queryByText('成绩发布')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /教务同步/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /申诉/ })).not.toBeInTheDocument();
});

it('从真实聚合渲染各分区', async () => {
  mockGetExams.mockResolvedValue({
    data: { items: [{ id: 7, title: '《数据结构》期中' }], total: 1, page: 1, page_size: 100 },
  } as never);
  renderAnalytics();
  await screen.findByText('计科 2401');
  // KPI：参考人数来自 student-scores total，题目均分来自 items.avg_score 均值
  expect(screen.getByText('参考人数')).toBeInTheDocument();
  expect(screen.getByText('58')).toBeInTheDocument();
  expect(screen.getByText('题目均分')).toBeInTheDocument();
  expect(screen.getAllByText('2.1').length).toBeGreaterThanOrEqual(1);
  // 分数段分布：bins label/count（坐标轴 + 明细表各一处）
  expect(screen.getAllByText('60–69').length).toBeGreaterThanOrEqual(1);
  // 题目质量：question_id/type/avg_score/correct_rate + discrimination D
  expect(screen.getByText('第 101 题')).toBeInTheDocument();
  expect(screen.getByText('0.41')).toBeInTheDocument();
  expect(screen.getByText('0.55')).toBeInTheDocument();
  expect(screen.getByText('偏难')).toBeInTheDocument();
  expect(screen.getByText('线性表')).toBeInTheDocument();
  // 班级对比：classes name
  expect(screen.getByText('班级对比')).toBeInTheDocument();
});

it('报告弹窗仅含三项且无PDF项', async () => {
  mockGetExams.mockResolvedValue({
    data: { items: [{ id: 7, title: '《数据结构》期中' }], total: 1, page: 1, page_size: 100 },
  } as never);
  const user = userEvent;
  renderAnalytics();
  await screen.findByText('计科 2401');
  await user.click(screen.getByRole('button', { name: '生成分析报告' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('班级成绩单（含排名与分数段）')).toBeInTheDocument();
  expect(within(dialog).getByText('试题质量分析（难度、区分度）')).toBeInTheDocument();
  expect(within(dialog).getByText('知识点掌握度分析')).toBeInTheDocument();
  expect(within(dialog).queryByText(/PDF/)).not.toBeInTheDocument();
  expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3);
});
