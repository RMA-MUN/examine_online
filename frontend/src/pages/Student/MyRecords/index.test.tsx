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
