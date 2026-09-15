import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import QuestionBank from './index';
import { importBankFile } from '../../api/exams';

vi.mock('../../api/exams', () => ({
  getExams: vi.fn().mockResolvedValue({ data: { items: [] } }),
  importBankFile: vi.fn(),
  generatePaperFromBasket: vi.fn(),
}));

vi.mock('../../api/axios', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { items: [] } }) },
}));

const renderBank = () =>
  render(
    <App>
      <QuestionBank />
    </App>,
  );

it('P2按钮已裁剪', () => {
  renderBank();
  const btns = screen.getAllByRole('button', { name: '替换同类题' });
  expect(btns.length).toBeGreaterThan(0);
  btns.forEach((b) => expect(b).toBeDisabled());
});

it('编辑按钮已裁剪为disabled', () => {
  renderBank();
  const btns = screen.getAllByRole('button', { name: '编辑' });
  expect(btns.length).toBeGreaterThan(0);
  btns.forEach((b) => expect(b).toBeDisabled());
});

it('查重pill标记为演示占位', () => {
  renderBank();
  expect(screen.getByText(/题目查重.*演示/)).toBeInTheDocument();
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

it('F3 死字段禁用（paperName/duration/publishClass，P2待接入暂不生效）', async () => {
  renderBank();
  // 先加入一题以启用“生成试卷”
  const addBtns = screen.getAllByRole('button', { name: '加入组卷' });
  fireEvent.click(addBtns[0]);
  const genBtn = screen.getByRole('button', { name: '生成试卷' });
  fireEvent.click(genBtn);
  const nameInput = await screen.findByLabelText('试卷名称');
  expect(nameInput).toBeDisabled();
  expect(nameInput).toHaveAttribute('title', 'P2待接入暂不生效');
  const durInput = screen.getByLabelText('考试时长（分钟）');
  expect(durInput).toBeDisabled();
  expect(durInput).toHaveAttribute('title', 'P2待接入暂不生效');
  await waitFor(() => {
    const groupLabel = screen.getByText('发布班级');
    const field = groupLabel.parentElement;
    // Select 禁用后应带 disabled 态与 P2 提示
    expect(field?.innerHTML ?? document.body.innerHTML).toMatch(/disabled/);
  });
  expect(document.body.innerHTML).toContain('P2待接入暂不生效');
});
