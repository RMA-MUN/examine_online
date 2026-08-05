import type { Dayjs } from 'dayjs';

export type ExamStatus = 'draft' | 'published' | 'ongoing' | 'finished';

export interface StudentOverride {
  student_id: number;
  action: 'include' | 'exclude';
}

export interface Exam {
  id: number;
  course_id: number;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  duration: number;
  total_score: number;
  pass_score: number;
  random_order: boolean;
  max_switch: number;
  status: ExamStatus;
  created_at: string;
  assigned_class_ids?: number[];
  student_overrides?: StudentOverride[];
  student_record_status?: 'ongoing' | 'submitted' | 'graded' | null;
}

export interface ExamInput {
  course_id?: number;
  title: string;
  description?: string;
  duration: number;
  total_score: number;
  pass_score: number;
  start_time: string;
  end_time: string;
  random_order: boolean;
  max_switch: number;
  class_ids?: number[];
  student_overrides?: StudentOverride[];
}

// 考试编辑页表单值（DatePicker 值，提交前 format 成字符串）
export interface ExamFormValues {
  course_id?: number;
  title: string;
  description?: string;
  duration: number;
  total_score: number;
  pass_score: number;
  max_switch: number;
  start_time: Dayjs;
  end_time: Dayjs;
  random_order: boolean;
  class_ids?: number[];
  exclude_student_ids?: string[];
}

export interface ExamQuery {
  page?: number;
  page_size?: number;
  status?: string;
  course_id?: number;
}
