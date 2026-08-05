import type { UserRole } from './user';

export interface StudentDashboardData {
  role: 'student';
  stats: {
    available_exams: number;
    my_exam_count: number;
    avg_score: number;
    pass_rate: number;
  };
  upcoming_exams: Array<{
    id: number;
    title: string;
    start_time: string;
    duration: number;
  }>;
  recent_records: Array<{
    id: number;
    exam_id: number;
    exam_title: string;
    score: number;
    pass_score: number;
    status: 'submitted' | 'graded';
    submit_time: string | null;
  }>;
}

export interface TeacherDashboardData {
  role: 'teacher';
  stats: {
    published_exams: number;
    pending_grading_count: number;
    course_count: number;
    total_records: number;
  };
  pending_grading: Array<{
    exam_id: number;
    exam_title: string;
    pending_count: number;
  }>;
  recent_exams: Array<{
    id: number;
    title: string;
    status: string;
    start_time: string;
  }>;
}

export interface AdminDashboardData {
  role: 'admin';
  stats: {
    student_count: number;
    teacher_count: number;
    admin_count: number;
    exam_count: number;
  };
  role_distribution: Array<{ role: UserRole; count: number }>;
  recent_users: Array<{
    id: number;
    username: string;
    name: string;
    role: UserRole;
    created_at: string;
  }>;
  exam_status_distribution: Array<{ status: string; count: number }>;
  exams_per_course: Array<{ course_name: string; count: number }>;
  exam_avg_scores: Array<{ exam_id: number; exam_title: string; avg_score: number }>;
  exam_pass_rates: Array<{ exam_id: number; exam_title: string; pass_rate: number }>;
  score_distribution: Array<{ label: string; count: number }>;
  exam_participation: Array<{ exam_id: number; exam_title: string; count: number }>;
  pending_grading_by_exam: Array<{ exam_id: number; exam_title: string; pending_count: number }>;
  switch_counts_by_exam: Array<{ exam_id: number; exam_title: string; switch_count: number }>;
  class_student_distribution: Array<{ class_name: string; count: number }>;
}

export type DashboardData = StudentDashboardData | TeacherDashboardData | AdminDashboardData;
