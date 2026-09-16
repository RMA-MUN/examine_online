import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from 'antd';
import QuestionBank from './index';
import axios from '../../api/axios';
import { generatePaperFromBasket, importBankFile } from '../../api/exams';

vi.mock('../../api/exams', () => ({
  getExams: vi.fn().mockResolvedValue({ data: { items: [] } }),
  importBankFile: vi.fn(),
  generatePaperFromBasket: vi.fn(),
}));

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { items: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const mockedGet = vi.mocked(axios.get as unknown as ReturnType<typeof vi.fn>);
const mockedPost = vi.mocked(axios.post as unknown as ReturnType<typeof vi.fn>);
const mockedPut = vi.mocked(axios.put as unknown as ReturnType<typeof vi.fn>);

const renderBank = () =>
  render(
    <App>
      <QuestionBank />
    </App>,
  );

beforeEach(() => {
  mockedGet.mockReset();
  mockedGet.mockResolvedValue({ data: { items: [] } } as unknown as never);
  mockedPost.mockReset();
  mockedPost.mockResolvedValue({ data: {} } as unknown as never);
  mockedPut.mockReset();
  mockedPut.mockResolvedValue({ data: {} } as unknown as never);
  vi.mocked(importBankFile).mockReset();
  vi.mocked(generatePaperFromBasket).mockReset();
});

it('P2按钮已裁剪：无替换同类题按钮', () => {
  renderBank();
  expect(screen.queryByRole('button', { name: '替换同类题' })).not.toBeInTheDocument();
});

it('编辑按钮已启用（不再disabled）', async () => {
  // 真实空题库渲染 EmptyState（不再回退 mocks），故此处 seed 一条真实题目
  mockedGet.mockResolvedValue({
    data: {
      total: 1,
      items: [
        {
          id: 7,
          type: 'single',
          content: '链表题干',
          options: ['A1', 'B1', 'C1'],
          answer: 'A',
          score: 5,
          course_id: 3,
          tags: ['线性表'],
          difficulty: 'easy',
        },
      ],
    },
  } as unknown as never);
  renderBank();
  await screen.findByText('链表题干');
  const btns = screen.getAllByRole('button', { name: '编辑' });
  expect(btns.length).toBeGreaterThan(0);
  btns.forEach((b) => expect(b).not.toBeDisabled());
});

it('无查重pill（假展示已删除）', () => {
  renderBank();
  expect(screen.queryByText(/题目查重/)).not.toBeInTheDocument();
});

it('无正确率/使用次数假列', () => {
  renderBank();
  expect(screen.queryByText(/正确率/)).not.toBeInTheDocument();
  expect(screen.queryByText(/使用次数/)).not.toBeInTheDocument();
});

it('头部统计使用接口 total（subjects/假总数已删除）', async () => {
  mockedGet.mockResolvedValueOnce({
    data: {
      total: 42,
      items: [
        {
          id: 7,
          type: 'single',
          content: '链表题干',
          options: ['A1', 'B1', 'C1'],
          answer: 'A',
          score: 5,
          course_id: 3,
          tags: ['线性表'],
          difficulty: 'easy',
        },
      ],
    },
  } as unknown as never);
  renderBank();
  await screen.findByText('链表题干');
  expect(screen.getByText('42')).toBeInTheDocument();
  expect(screen.queryByText(/4268/)).not.toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain('MOCK');
});

it('新建题目：Modal 含真实字段，提交调 POST /api/bank/questions 后刷新列表', async () => {
  mockedGet.mockResolvedValue({ data: { items: [], total: 0 } } as unknown as never);
  renderBank();
  fireEvent.click(screen.getByRole('button', { name: '新建题目' }));
  // ExamEdit 风格字段：题型/题目内容/选项（single 显示）/参考答案/分值/课程 ID/难度/知识点标签
  // 注：Antd 两字按钮会渲染为空格分隔（新 建），故用 dialog + 空格名定位 Modal 确认键
  const dialog = await screen.findByRole('dialog', { name: '新建题目' });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByLabelText('题目内容')).toBeInTheDocument();
  expect(screen.getByLabelText('分值')).toBeInTheDocument();
  expect(screen.getByLabelText('参考答案')).toBeInTheDocument();
  expect(screen.getByLabelText('难度')).toBeInTheDocument();
  expect(screen.getByLabelText('课程 ID')).toBeInTheDocument();
  expect(screen.getByLabelText('知识点标签')).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('题目内容'), { target: { value: '新题干内容' } });
  fireEvent.change(screen.getByLabelText('参考答案'), { target: { value: 'A' } });
  fireEvent.change(screen.getByLabelText('课程 ID'), { target: { value: '3' } });
  // single 题型选项必填（与 ExamEdit 一致）：填满默认 4 个空选项
  const optionInputs = screen.getAllByPlaceholderText('选项内容');
  expect(optionInputs.length).toBeGreaterThanOrEqual(2);
  optionInputs.forEach((input, i) => {
    fireEvent.change(input, { target: { value: `选项${i + 1}` } });
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '新 建' }));

  await waitFor(() => {
    expect(mockedPost).toHaveBeenCalledWith(
      '/api/bank/questions',
      expect.objectContaining({ type: 'single', content: '新题干内容', answer: 'A', score: 5 }),
    );
  });
  await waitFor(() => {
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

it('编辑：同 Modal 预填并调 PUT /api/questions/{id} 后刷新', async () => {
  mockedGet.mockResolvedValue({
    data: {
      total: 1,
      items: [
        {
          id: 7,
          type: 'single',
          content: '链表题干',
          options: ['A1', 'B1', 'C1'],
          answer: 'A',
          score: 5,
          course_id: 3,
          tags: ['线性表'],
          difficulty: 'easy',
        },
      ],
    },
  } as unknown as never);
  renderBank();
  await screen.findByText('链表题干');
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  const contentInput = await screen.findByLabelText('题目内容');
  expect((contentInput as HTMLTextAreaElement).value).toBe('链表题干');
  fireEvent.change(screen.getByLabelText('参考答案'), { target: { value: 'B' } });
  const editDialog = screen.getByRole('dialog', { name: '编辑题目' });
  fireEvent.click(within(editDialog).getByRole('button', { name: '保 存' }));
  await waitFor(() => {
    expect(mockedPut).toHaveBeenCalledWith(
      '/api/questions/7',
      expect.objectContaining({ content: '链表题干', answer: 'B' }),
    );
  });
});

it('真实空题库渲染 EmptyState，不再回退到 mocks 假数据', async () => {
  mockedGet.mockResolvedValue({ data: { items: [], total: 0 } } as unknown as never);
  renderBank();
  await screen.findByText(/没有符合条件的题目/);
  expect(screen.queryByRole('button', { name: '加入组卷' })).not.toBeInTheDocument();
  expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
});

it('后端不可达时回退到 mocks 演示数据（离线占位保留）', async () => {
  mockedGet.mockRejectedValueOnce(new Error('network down'));
  renderBank();
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: '加入组卷' }).length).toBeGreaterThan(0);
  });
});

it('F2 导入失败透出第X行（reject映射error.response.data.data.errors）', async () => {
  vi.mocked(importBankFile).mockRejectedValueOnce({
    response: { data: { data: { errors: [{ row: 2, error: '题型非法' }] } } },
  });
  renderBank();
  const input = screen.getByLabelText('选择题库文件') as HTMLInputElement;
  const file = new File(['x'], 'bank.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText(/第2行题型非法/);
});

it('F3 死字段已删除（生成试卷 Modal 无 paperName/duration/publishClass 与乱序/发布checkbox）', async () => {
  // 真实空题库渲染 EmptyState（不再回退 mocks），故此处 seed 一条真实题目
  mockedGet.mockResolvedValue({
    data: {
      total: 1,
      items: [
        {
          id: 7,
          type: 'single',
          content: '链表题干',
          options: ['A1', 'B1', 'C1'],
          answer: 'A',
          score: 5,
          course_id: 3,
          tags: ['线性表'],
          difficulty: 'easy',
        },
      ],
    },
  } as unknown as never);
  renderBank();
  await screen.findByText('链表题干');
  // 先加入一题以启用“生成试卷”
  const addBtns = screen.getAllByRole('button', { name: '加入组卷' });
  fireEvent.click(addBtns[0]);
  const genBtn = screen.getByRole('button', { name: '生成试卷' });
  fireEvent.click(genBtn);
  await screen.findByText('落盘目标考试');
  expect(screen.queryByLabelText('试卷名称')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('考试时长（分钟）')).not.toBeInTheDocument();
  expect(screen.queryByText('发布班级')).not.toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain('P2待接入暂不生效');
  expect(screen.queryByText(/题目乱序/)).not.toBeInTheDocument();
  expect(screen.queryByText(/选项乱序/)).not.toBeInTheDocument();
  expect(screen.queryByText(/立即发布/)).not.toBeInTheDocument();
});
