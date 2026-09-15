import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import Grading from './index';
import * as examsApi from '../../../api/exams';
import * as gradingApi from '../../../api/grading';

beforeEach(() => {
  vi.spyOn(examsApi, 'getExams').mockResolvedValue({
    code: 200,
    message: 'success',
    data: { items: [], total: 0 },
  } as never);
  vi.spyOn(gradingApi, 'getExamRecords').mockResolvedValue({
    code: 200,
    message: 'success',
    data: { items: [], total: 0 },
  } as never);
  vi.spyOn(gradingApi, 'getRecordAnswers').mockResolvedValue({
    code: 200,
    message: 'success',
    data: [],
  } as never);
});

const renderGrading = () =>
  render(
    <MemoryRouter>
      <App>
        <Grading />
      </App>
    </MemoryRouter>
  );

it('按题/按人seg切换', async () => {
  const { container } = renderGrading();
  const byStudent = await screen.findByText('按人阅卷');
  // 默认按题阅卷高亮
  expect(screen.getByText('按题阅卷')).toHaveClass('on');
  fireEvent.click(byStudent);
  expect(screen.getByText('按人阅卷')).toHaveClass('on');
  // 等价断言：对应模式内容区出现
  expect(container.querySelector('.mj-grading')).not.toBeNull();
});
