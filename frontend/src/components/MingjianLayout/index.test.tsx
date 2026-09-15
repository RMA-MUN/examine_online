import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MingjianLayout from './index';
import useAuthStore from '../../store/auth';

describe('MingjianLayout', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: 1,
        username: 't',
        role: 'admin',
        name: 'T',
        is_active: true,
        created_at: '2026-01-01',
      },
    });
  });

  it('显示品牌与分组导航', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<MingjianLayout />}>
            <Route path="/dashboard" element={<div>page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('明鉴')).toBeTruthy();
    expect(screen.getByText('考试运行')).toBeTruthy();
  });
});
