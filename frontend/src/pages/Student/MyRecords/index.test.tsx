import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import MyRecords from './index';
import * as examsApi from '../../../api/exams';
import * as gradingApi from '../../../api/grading';
import type { ExamRecord } from '../../../types/record';
import type { Answer } from '../../../types/answer';

const records: ExamRecord[] = [
  {
    id: 1,
    exam_id: 10,
    student_id: 1,
    score: 7,
    status: 'submitted',
    switch_count: 0,
    start_time: '2026-08-05 10:00:00',
    submit_time: '2026-08-05 11:00:00',
    created_at: '2026-08-05 09:00:00',
    exam_title: '期中考试',
  },
];

const answers: Answer[] = [
  {
    id: 1,
    record_id: 1,
    question_id: 1,
    student_answer: '要点A',
    score: 7,
    created_at: '2026-08-05 09:00:00',
    question: { type: 'essay', content: '简述', score: 10, answer: '要点B' },
    ai_grading: {
      answer_id: 1,
      question_id: 1,
      record_id: 1,
      grading_status: 'completed',
      grading_source: 'ai',
      ai_score: 7,
      ai_feedback: { reasoning: '答案完整', confidence: 0.9 },
    },
  },
];

beforeEach(() => {
  jest.spyOn(examsApi, 'getMyRecords').mockResolvedValue({
    code: 200, message: 'success', data: records,
  } as never);
  jest.spyOn(gradingApi, 'getMyRecordAnswers').mockResolvedValue({
    code: 200, message: 'success', data: answers,
  } as never);
});

const wrongBlankAnswer: Answer = {
  id: 2,
  record_id: 1,
  question_id: 2,
  student_answer: '上海',
  score: 0,
  is_correct: false,
  created_at: '2026-08-05 09:00:00',
  question: { type: 'blank', content: '我国首都是哪座城市？', score: 5, answer: '北京' },
  ai_grading: {
    answer_id: 2,
    question_id: 2,
    record_id: 1,
    grading_status: 'completed',
    grading_source: 'ai',
    ai_score: 5,
    ai_feedback: { reasoning: '答案等价，判为正确', confidence: 0.95 },
  },
};

test('判错的填空题在结果详情中展示 AI 评分依据', async () => {
  (gradingApi.getMyRecordAnswers as jest.Mock).mockResolvedValueOnce({
    code: 200,
    message: 'success',
    data: [wrongBlankAnswer],
  } as never);
  render(
    <App>
      <MyRecords />
    </App>
  );
  await screen.findByText('期中考试');
  fireEvent.click(screen.getByRole('button', { name: /查看详情/ }));
  await waitFor(() => {
    expect(screen.getByText('我国首都是哪座城市？')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText(/AI 评分依据/));
  await waitFor(() => {
    expect(screen.getByText(/答案等价，判为正确/)).toBeInTheDocument();
  });
});

test('我的记录展示完成状态并可查看结果详情', async () => {
  render(
    <App>
      <MyRecords />
    </App>
  );
  await screen.findByText('期中考试');
  const detailBtn = screen.getByRole('button', { name: /查看详情/ });
  fireEvent.click(detailBtn);
  await waitFor(() => {
    expect(screen.getByText('简述')).toBeInTheDocument();
  });
  expect(screen.getByText('要点A')).toBeInTheDocument();
  fireEvent.click(screen.getByText(/AI 评分依据/));
  await waitFor(() => {
    expect(screen.getByText(/答案完整/)).toBeInTheDocument();
  });
});

test('切换考试记录时详情抽屉的滚动位置被重置', async () => {
  const secondRecord: ExamRecord = {
    id: 2,
    exam_id: 11,
    student_id: 1,
    score: 8,
    status: 'graded',
    switch_count: 0,
    start_time: '2026-08-04 10:00:00',
    submit_time: '2026-08-04 11:00:00',
    created_at: '2026-08-04 09:00:00',
    exam_title: '期末考试',
  };
  (examsApi.getMyRecords as jest.Mock).mockResolvedValueOnce({
    code: 200,
    message: 'success',
    data: [records[0], secondRecord],
  } as never);
  const secondAnswers: Answer[] = [
    {
      ...answers[0],
      id: 2,
      record_id: 2,
      question_id: 3,
      student_answer: '要点C',
      question: { type: 'essay', content: '简述二', score: 10, answer: '要点D' },
    },
  ];
  (gradingApi.getMyRecordAnswers as jest.Mock)
    .mockResolvedValueOnce({ code: 200, message: 'success', data: answers } as never)
    .mockResolvedValueOnce({ code: 200, message: 'success', data: secondAnswers } as never);

  render(
    <App>
      <MyRecords />
    </App>
  );
  await screen.findByText('期中考试');
  const detailButtons = screen.getAllByRole('button', { name: /查看详情/ });
  fireEvent.click(detailButtons[0]);
  await screen.findByText('简述');
  const firstBody = document.querySelector('.ant-drawer-body') as HTMLElement;
  firstBody.scrollTop = 500;

  fireEvent.click(document.querySelector('.ant-drawer-close') as HTMLElement);
  await waitFor(
    () => {
      expect(document.querySelector('.ant-drawer-body')).not.toBeInTheDocument();
    },
    { timeout: 3000 }
  );

  fireEvent.click(screen.getAllByRole('button', { name: /查看详情/ })[1]);
  await waitFor(
    () => {
      expect(screen.getByText('简述二')).toBeInTheDocument();
      expect((document.querySelector('.ant-drawer-body') as HTMLElement).scrollTop).toBe(0);
    },
    { timeout: 3000 }
  );
});
