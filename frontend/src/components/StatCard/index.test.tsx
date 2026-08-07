import { render, screen } from '@testing-library/react';
import { FileTextOutlined } from '@ant-design/icons';
import StatCard from './index';

describe('StatCard', () => {
  it('渲染标签与数值', () => {
    render(<StatCard label="可参加考试" value={12} icon={<FileTextOutlined />} />);
    expect(screen.getByText('可参加考试')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('后缀跟随数值展示', () => {
    render(<StatCard label="通过率" value={80} suffix="%" icon={<FileTextOutlined />} />);
    expect(screen.getByText('%')).toBeTruthy();
  });

  it('色调映射到对应的修饰类', () => {
    const { container } = render(
      <StatCard label="待批改" value={3} icon={<FileTextOutlined />} tone="warning" />
    );
    expect(container.querySelector('.stat-card-warning')).toBeTruthy();
  });

  it('默认使用品牌色调', () => {
    const { container } = render(
      <StatCard label="考试总数" value={9} icon={<FileTextOutlined />} />
    );
    expect(container.querySelector('.stat-card-brand')).toBeTruthy();
  });
});
