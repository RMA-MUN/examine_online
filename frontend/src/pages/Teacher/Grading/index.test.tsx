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

const renderGrading = (entry = '/grading') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
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

it('点击表格“阅卷”打开该生整卷抽屉', async () => {
  vi.spyOn(gradingApi, 'getExamRecords').mockResolvedValue({
    code: 200,
    message: 'success',
    data: {
      items: [
        {
          id: 1,
          exam_id: 10,
          student_id: 1,
          score: 50,
          status: 'graded',
          switch_count: 0,
          submit_time: '2026-08-05 11:00:00',
          student: {
            id: 1,
            username: 'stu01',
            role: 'student',
            name: '王浩然',
            email: 'stu01@example.com',
            phone: null,
            is_active: true,
            created_at: '2026-01-01 00:00:00',
          },
        },
      ],
      total: 1,
    },
  } as never);
  renderGrading('/grading?examId=10');
  fireEvent.click(await screen.findByRole('button', { name: '阅卷' }));
  // 抽屉标题为“{学生姓名} 的答卷”，且打开时会拉取该记录答案
  expect(await screen.findByText('王浩然 的答卷')).toBeInTheDocument();
  expect(gradingApi.getRecordAnswers).toHaveBeenCalledWith(1);
}, 15000);
