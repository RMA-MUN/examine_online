import type { User } from './user';
import type { Question } from './question';
import type { AnswerValue } from './answer';

export type RecordStatus = 'ongoing' | 'submitted' | 'graded';

export interface ExamRecord {
  id: number;
  exam_id: number;
  student_id: number;
  score: number;
  status: RecordStatus;
  switch_count: number;
  start_time: string;
  submit_time?: string | null;
  created_at: string;
  // 阅卷列表接口嵌套返回学生完整信息
  student?: User | null;
  // 学生端"我的记录"接口返回考试标题
  exam_title?: string;
}

// 考试答题页试卷
export interface Paper {
  record_id: number;
  questions: Question[];
  saved_answers?: Record<string, AnswerValue>;
  /** 考生已标记的题目 ID（作答过程数据，随保存持久化） */
  marked_question_ids?: number[];
}
