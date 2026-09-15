import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ExamTaking from './index';
import * as examsApi from '../../../api/exams';
import { countAnswered } from './utils';
import type { Paper } from '../../../types/record';
import type { Exam } from '../../../types/exam';

const paper: Paper = {
  record_id: 99,
  saved_answers: { 1: 'A' },
  questions: [
    {
      id: 1, exam_id: 7, type: 'single', content: '快速排序最坏时间复杂度是？',
      options: ['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)'], score: 5,
      sort_order: 1, created_at: '2026-09-01 10:00:00',
    },
    {
      id: 2, exam_id: 7, type: 'judge', content: '栈是先进后出的线性结构。',
      options: null, score: 5,
      sort_order: 2, created_at: '2026-09-01 10:00:00',
    },
    {
      id: 3, exam_id: 7, type: 'blank', content: '二叉链表空指针域个数为 ______。',
      options: null, score: 6,
      sort_order: 3, created_at: '2026-09-01 10:00:00',
    },
  ],
};

const exam: Exam = {
  id: 7, course_id: 3, title: '《数据结构与算法》期中考试',
  description: null, start_time: '2026-09-15 09:00:00', end_time: '2026-09-15 11:00:00',
  duration: 30, total_score: 100, pass_score: 60, random_order: false,
  max_switch: 5, status: 'ongoing', created_at: '2026-09-01 09:00:00',
};

beforeEach(() => {
  vi.spyOn(examsApi, 'getPaper').mockResolvedValue({
    code: 200, message: 'success', data: paper,
  } as never);
  vi.spyOn(examsApi, 'getExam').mockResolvedValue({
    code: 200, message: 'success', data: exam,
  } as never);
  vi.spyOn(examsApi, 'saveAnswers').mockResolvedValue({
    code: 200, message: 'success', data: null,
  } as never);
  vi.spyOn(examsApi, 'recordSwitch').mockResolvedValue({
    code: 200, message: 'success', data: null,
  } as never);
});

const renderTaking = () =>
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/exams/7/take', state: { duration: 30 } }]}
    >
      <App>
        <Routes>
          <Route path="/exams/:examId/take" element={<ExamTaking />} />
        </Routes>
      </App>
    </MemoryRouter>
  );

// utils 真实签名为 (answers: Record<string, AnswerValue|undefined>, questionIds: number[]) ——
// brief 示例用字符串 id，与实际不符，此处按真实签名断言"已答计数"语义。
test('countAnswered 真实签名：已答计数语义', () => {
  expect(countAnswered({ 1: 'A', 2: '' }, [1, 2])).toBe(1);
});

test('顶栏 .exam-bar 含品牌、考试名、.timer 与交卷按钮', async () => {
  const { container } = renderTaking();
  const bar = await screen.findByText('《数据结构与算法》期中考试');
  expect(bar.closest('.exam-bar')).not.toBeNull();
  // duration=30 → 1800s → 30:00
  expect(container.querySelector('.exam-bar .timer .timer-num')?.textContent).toBe('30:00');
  expect(screen.getByRole('button', { name: '交卷' })).toBeInTheDocument();
});

test('答题卡 .sheet 格子数与题目数一致，progress 统计已答', async () => {
  const { container } = renderTaking();
  await screen.findByText('《数据结构与算法》期中考试');
  const cells = container.querySelectorAll('.sheet button');
  expect(cells).toHaveLength(3);
  // saved_answers 中第 1 题已答
  expect(container.querySelector('#progress-pill')?.textContent).toMatch(/已答 1 \/ 3/);
  expect(container.querySelector('.sheet button.done')).not.toBeNull();
});

test('题目区 .q-card 渲染当前题，标记按钮可切换', async () => {
  const { container } = renderTaking();
  await screen.findByText('快速排序最坏时间复杂度是？');
  expect(container.querySelector('.q-card')).not.toBeNull();
  expect(container.querySelector('.q-card .q-no')).not.toBeNull();
  const markBtn = screen.getByRole('button', { name: /标记本题/ });
  fireEvent.click(markBtn);
  expect(screen.getByRole('button', { name: /取消标记/ })).toBeInTheDocument();
  expect(container.querySelector('.sheet button.flag')).not.toBeNull();
});

test('未切屏时不显示切屏 banner', async () => {
  const { container } = renderTaking();
  await screen.findByText('《数据结构与算法》期中考试');
  expect(container.querySelector('.banner-danger, .banner-warn')).toBeNull();
});
