import type { Exam } from '../../../types/exam';

export const EXAM_CARD_COLORS: [string, string][] = [
  ['#3D5A80', '#4A6B94'],
  ['#4E8D8C', '#5FA8A7'],
  ['#7A6F9B', '#9488B4'],
  ['#A05B6D', '#B87A89'],
  ['#8C6D5B', '#A6897A'],
  ['#5B7C99', '#7195B2'],
];

export type ExamDisplayStatus = 'not_taken' | 'ongoing' | 'finished';

export const getExamDisplayStatus = (
  exam: Pick<Exam, 'student_record_status'>,
): ExamDisplayStatus => {
  if (exam.student_record_status === 'ongoing') return 'ongoing';
  if (
    exam.student_record_status === 'submitted' ||
    exam.student_record_status === 'graded'
  ) {
    return 'finished';
  }
  return 'not_taken';
};

export const getExamCardColor = (title: string): [string, string] => {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return EXAM_CARD_COLORS[hash % EXAM_CARD_COLORS.length];
};
