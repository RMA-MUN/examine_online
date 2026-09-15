import { render, screen } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import Proctoring from './index';

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
