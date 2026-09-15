import { render, screen } from '@testing-library/react';
import { App } from 'antd';
import QuestionBank from './index';

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
