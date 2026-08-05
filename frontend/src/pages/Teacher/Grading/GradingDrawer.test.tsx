import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import GradingDrawer from './GradingDrawer';
import * as gradingApi from '../../../api/grading';
import type { ExamRecord } from '../../../types/record';
import type { Answer } from '../../../types/answer';

const record: ExamRecord = {
  id: 1,
  exam_id: 10,
  student_id: 1,
  score: 0,
  status: 'submitted',
  switch_count: 0,
  start_time: '2026-08-05 10:00:00',
  submit_time: '2026-08-05 11:00:00',
  created_at: '2026-08-05 09:00:00',
  student: {
    id: 1,
    username: 'stu01',
    role: 'student',
    name: '张三',
    email: 'stu@example.com',
    phone: null,
    is_active: true,
    created_at: '2026-01-01 00:00:00',
  },
};

const wrongBlank: Answer = {
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

beforeEach(() => {
  jest.spyOn(gradingApi, 'getRecordAnswers').mockResolvedValue({
    code: 200,
    message: 'success',
    data: [wrongBlank],
  } as never);
});

test('判错的填空题展示 AI 评分依据', async () => {
  render(
    <App>
      <GradingDrawer record={record} open onClose={jest.fn()} />
    </App>
  );
  await screen.findByText('我国首都是哪座城市？');
  fireEvent.click(screen.getByText(/AI 评分依据/));
  await waitFor(() => {
    expect(screen.getByText(/答案等价，判为正确/)).toBeInTheDocument();
  });
});

test('答对的填空题不展示 AI 评分依据', async () => {
  const correctBlank: Answer = {
    ...wrongBlank,
    id: 3,
    question_id: 3,
    student_answer: '北京',
    score: 5,
    is_correct: true,
    ai_grading: {
      answer_id: 3,
      question_id: 3,
      record_id: 1,
      grading_status: 'pending',
      grading_source: 'pending',
    },
  };
  (gradingApi.getRecordAnswers as jest.Mock).mockResolvedValueOnce({
    code: 200,
    message: 'success',
    data: [correctBlank],
  } as never);
  render(
    <App>
      <GradingDrawer record={record} open onClose={jest.fn()} />
    </App>
  );
  await screen.findByText('我国首都是哪座城市？');
  expect(screen.queryByText(/AI 评分依据/)).toBeNull();
});

test('客观题（单选题）不展示 AI 评分依据', async () => {
  const single: Answer = {
    ...wrongBlank,
    id: 4,
    question_id: 4,
    question: { type: 'single', content: '1+1=？', score: 2, answer: 'A', options: ['A', 'B'] },
    ai_grading: {
      answer_id: 4,
      question_id: 4,
      record_id: 1,
      grading_status: 'pending',
      grading_source: 'pending',
    },
  };
  (gradingApi.getRecordAnswers as jest.Mock).mockResolvedValueOnce({
    code: 200,
    message: 'success',
    data: [single],
  } as never);
  render(
    <App>
      <GradingDrawer record={record} open onClose={jest.fn()} />
    </App>
  );
  await screen.findByText('1+1=？');
  expect(screen.queryByText(/AI 评分依据/)).toBeNull();
});
