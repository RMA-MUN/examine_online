import type { Mock, MockedFunction } from 'vitest';
import { act, render } from '@testing-library/react';
import * as echarts from 'echarts';
import EChart from './index';

vi.mock('echarts', () => ({ init: vi.fn() }));

const setOption = vi.fn();
const resize = vi.fn();
const dispose = vi.fn();
const observe = vi.fn();
const disconnect = vi.fn();
let resizeCallback: ResizeObserverCallback;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }

  observe = observe;
  unobserve = vi.fn();
  disconnect = disconnect;
}

const mockInit = echarts.init as MockedFunction<typeof echarts.init>;

describe('EChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
    mockInit.mockReturnValue({ setOption, resize, dispose } as unknown as echarts.ECharts);
  });

  it('updates, resizes, and disposes the chart with its container lifecycle', () => {
    const firstOption = { series: [{ type: 'bar' as const, data: [1] }] };
    const secondOption = { series: [{ type: 'bar' as const, data: [2] }] };
    const { container, rerender, unmount } = render(
      <EChart option={firstOption} ariaLabel="考试成绩图表" className="dashboard-chart" />
    );
    const chartContainer = container.firstElementChild as HTMLDivElement;

    expect(mockInit).toHaveBeenCalledWith(chartContainer);
    expect(observe).toHaveBeenCalledWith(chartContainer);
    expect(setOption).toHaveBeenLastCalledWith(firstOption, true);
    expect(chartContainer).toHaveAttribute('role', 'img');
    expect(chartContainer).toHaveAttribute('aria-label', '考试成绩图表');

    rerender(
      <EChart option={secondOption} ariaLabel="考试成绩图表" className="dashboard-chart" />
    );
    expect(setOption).toHaveBeenLastCalledWith(secondOption, true);

    act(() => resizeCallback([], {} as ResizeObserver));
    expect(resize).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
