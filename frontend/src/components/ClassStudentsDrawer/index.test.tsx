import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClassStudentsDrawer from './index';
import { batchUpdateClassStudents, getAvailableStudents, getClassStudents } from '../../api/classes';
import type { ApiResponse } from '../../types/api';

vi.mock('../../api/classes', () => ({
  getClassStudents: vi.fn(),
  getAvailableStudents: vi.fn(),
  batchUpdateClassStudents: vi.fn(),
}));

const mockGetClassStudents = vi.mocked(getClassStudents);
const mockGetAvailableStudents = vi.mocked(getAvailableStudents);
const mockBatch = vi.mocked(batchUpdateClassStudents);

const student = (id: number, name: string) => ({ id, username: `user_${id}`, name });

const apiResponse = <T,>(data: T): ApiResponse<T> => ({ code: 200, message: 'ok', data });

const moveRightButton = () =>
  screen.getAllByRole('button').find((btn) => btn.querySelector('[aria-label="right"]')) as HTMLElement;

describe('ClassStudentsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClassStudents.mockResolvedValue(apiResponse([student(1, '张三'), student(2, '李四')]));
    mockGetAvailableStudents.mockResolvedValue(apiResponse([student(3, '王五')]));
    mockBatch.mockResolvedValue(apiResponse({ updated: 1 }));
  });

  it('打开时加载班级学生与可加入学生', async () => {
    render(
      <App>
        <ClassStudentsDrawer open onClose={() => {}} classId={1} className="计科2401" />
      </App>
    );

    expect(await screen.findByText(/张三/)).toBeDefined();
    await waitFor(() => {
      expect(mockGetClassStudents).toHaveBeenCalledWith(1);
      expect(mockGetAvailableStudents).toHaveBeenCalledWith(1);
    });
  });

  it('移动学生到右侧触发批量加入接口', async () => {
    render(
      <App>
        <ClassStudentsDrawer open onClose={() => {}} classId={1} className="计科2401" />
      </App>
    );

    await screen.findByText(/王五/);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(moveRightButton());

    await waitFor(() => {
      expect(mockBatch).toHaveBeenCalledWith(1, 'add', expect.arrayContaining([3]));
    });
  });
});
