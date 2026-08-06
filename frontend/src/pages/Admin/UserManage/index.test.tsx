import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UserManage from './index';
import { getUsers } from '../../../api/users';
import type { ApiResponse, Paginated } from '../../../types/api';
import type { User } from '../../../types/user';

vi.mock('../../../api/users', () => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('../../../api/classes', () => ({
  getClasses: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
}));

const mockGetUsers = getUsers as Mock;

const makeUser = (id: number): User => ({
  id,
  username: `demo_student_${id}`,
  role: 'student',
  name: `学生${id}`,
  email: null,
  phone: null,
  class_id: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00',
});

const paginated = (items: User[], total: number): ApiResponse<Paginated<User>> => ({
  code: 200,
  message: 'ok',
  data: { items, total, page: 1, page_size: 10 },
});

describe('UserManage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('加载第一页数据并显示总数（学生分布在后页也能看到总条数）', async () => {
    const firstPage = Array.from({ length: 10 }, (_, i) => makeUser(i + 1));
    mockGetUsers.mockResolvedValue(paginated(firstPage, 60));

    render(
      <App>
        <UserManage />
      </App>
    );

    expect(await screen.findByText('demo_student_1')).toBeInTheDocument();
    expect(screen.getByText('共 60 条')).toBeInTheDocument();
    expect(mockGetUsers).toHaveBeenCalledTimes(1);
  });

  it('翻到第二页时以 page=2 重新请求并渲染对应数据', async () => {
    const firstPage = Array.from({ length: 10 }, (_, i) => makeUser(i + 1));
    const secondPage = Array.from({ length: 10 }, (_, i) => makeUser(i + 11));
    mockGetUsers
      .mockResolvedValueOnce(paginated(firstPage, 60))
      .mockResolvedValueOnce(paginated(secondPage, 60));

    render(
      <App>
        <UserManage />
      </App>
    );

    await screen.findByText('demo_student_1');
    fireEvent.click(screen.getByTitle('2'));

    await waitFor(() => {
      expect(mockGetUsers).toHaveBeenLastCalledWith({ page: 2, page_size: 10 });
    });
    expect(await screen.findByText('demo_student_11')).toBeInTheDocument();
  });
});
