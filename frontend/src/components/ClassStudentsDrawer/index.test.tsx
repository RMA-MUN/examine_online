import { App } from 'antd';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClassStudentsDrawer from './index';
import { batchUpdateClassStudents, getAvailableStudents, getClassStudents } from '../../api/classes';
import type { ClassStudent } from '../../api/classes';
import type { ApiResponse } from '../../types/api';

vi.mock('../../api/classes', () => ({
  getClassStudents: vi.fn(),
  getAvailableStudents: vi.fn(),
  batchUpdateClassStudents: vi.fn(),
}));

const mockGetClassStudents = vi.mocked(getClassStudents);
const mockGetAvailableStudents = vi.mocked(getAvailableStudents);
const mockBatch = vi.mocked(batchUpdateClassStudents);

const student = (id: number, name: string): ClassStudent => ({ id, username: `user_${id}`, name });

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
    // antd 6 Transfer 的 useSelection 在数据到达后会以滞后 effect 重置勾选状态：
    // 若在 effect flush 前点击复选框，勾选会被覆盖（移动按钮保持 disabled）。
    // 轮询勾选直到移动按钮 enable，确保选中状态已稳定提交后再移动。
    await waitFor(() => {
      const btn = moveRightButton() as HTMLButtonElement;
      if (btn.disabled) {
        fireEvent.click(checkboxes[0]);
        throw new Error('勾选尚未生效，重试');
      }
    });
    fireEvent.click(moveRightButton());

    await waitFor(() => {
      expect(mockBatch).toHaveBeenCalledWith(1, 'add', expect.arrayContaining([3]));
    });
  });

  it('切换班级后旧请求响应不覆盖新班级数据', async () => {
    let resolveOldClass!: (value: ApiResponse<ClassStudent[]>) => void;
    mockGetClassStudents.mockImplementation((id: number) => {
      if (id === 1) {
        return new Promise<ApiResponse<ClassStudent[]>>((resolve) => {
          resolveOldClass = resolve;
        });
      }
      return Promise.resolve(apiResponse([student(10, '赵六')]));
    });
    mockGetAvailableStudents.mockResolvedValue(apiResponse([]));

    const { rerender } = render(
      <App>
        <ClassStudentsDrawer open onClose={() => {}} classId={1} className="计科2401" />
      </App>
    );

    rerender(
      <App>
        <ClassStudentsDrawer open onClose={() => {}} classId={2} className="计科2402" />
      </App>
    );

    expect(await screen.findByText(/赵六/)).toBeDefined();

    await act(async () => {
      resolveOldClass!(apiResponse([student(99, '旧数据')]));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText(/旧数据/)).toBeNull();
    expect(screen.getByText(/赵六/)).toBeInTheDocument();
  });
});
