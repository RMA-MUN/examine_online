import type { QuestionType, RubricItem } from './question';

// 阅卷接口嵌套返回的题目信息（仅字段子集）
export type GradingQuestion = {
  type: QuestionType;
  content: string;
  options?: string[] | null;
  answer?: string | null;
  score: number;
  grading_rubric?: RubricItem[] | null;
};

export interface AiGrading {
  answer_id: number;
  question_id: number;
  record_id: number;
  grading_status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  grading_source: 'pending' | 'ai' | 'teacher' | 'failed' | string;
  ai_score?: number | null;
  ai_feedback?: {
    reasoning?: string;
    confidence?: number;
    criterion_results?: Array<{ criterion_id: string; score: number; reason: string }>;
  } | null;
  ai_model?: string | null;
  ai_graded_at?: string | null;
  last_error?: string | null;
}

export interface Answer {
  id: number;
  record_id: number;
  question_id: number;
  student_answer?: string | null;
  score: number;
  is_correct?: boolean | null;
  teacher_comment?: string | null;
  graded_at?: string | null;
  grader_id?: number | null;
  created_at: string;
  // 阅卷接口嵌套返回题目信息（字段子集）
  question?: GradingQuestion;
  ai_grading?: AiGrading;
}

export interface GradeRequest {
  score: number;
  is_correct?: boolean;
  override_reason?: string;
  teacher_comment?: string;
}

export type AnswerValue = string | string[];
