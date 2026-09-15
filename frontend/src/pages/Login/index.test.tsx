import type { Mock, MockedFunction } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from './index';
import { login } from '../../api/auth';
import useAuthStore from '../../store/auth';

vi.mock('../../api/auth', () => ({ login: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../store/auth', () => ({ default: () => ({ setToken: vi.fn() }) }));

const mockLogin = login as Mock;

describe('Login', () => {
  beforeEach(() => {
    mockLogin.mockResolvedValue({ data: { access_token: 'token' } });
  });

  it('渲染明鉴品牌区与表单', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );
    expect(screen.getByText('明鉴')).toBeTruthy();
    expect(screen.getByText('在线考试与阅卷系统')).toBeTruthy();
    expect(screen.getByPlaceholderText('请输入用户名')).toBeTruthy();
    expect(screen.getByPlaceholderText('请输入密码')).toBeTruthy();
    expect(screen.getByRole('button', { name: (name) => name.replace(/\s+/g, '') === '登录' })).toBeTruthy();
  });
});
