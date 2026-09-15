import type { AxiosResponse } from 'axios';
import axios from './axios';
import type { ApiResponse } from '../types/api';
import type { DashboardData } from '../types/dashboard';
import type { ScoreExportOptions } from '../types/scoreExport';

export const getDashboard = (): Promise<ApiResponse<DashboardData>> =>
  axios.get('/api/statistics/dashboard') as Promise<ApiResponse<DashboardData>>;

export const exportScores = (
  classId?: number,
  courseId?: number
): Promise<AxiosResponse<Blob>> =>
  axios.get('/api/statistics/scores/export', {
    params: {
      ...(classId ? { class_id: classId } : {}),
      ...(courseId ? { course_id: courseId } : {}),
    },
    responseType: 'blob',
    preserveResponse: true,
  }) as Promise<AxiosResponse<Blob>>;

export const getScoreExportOptions = (): Promise<ApiResponse<ScoreExportOptions>> =>
  axios.get('/api/statistics/scores/export-options') as Promise<ApiResponse<ScoreExportOptions>>;

export interface QuestionStat {
  question_id: number;
  type: string;
  avg_score: number;
  correct_rate: number;
  distribution: { full: number; partial: number; zero: number; total: number };
}

export interface StudentScoreItem {
  student: { id: number; name: string; username: string; class_id: number | null };
  score: number;
  switch_count: number;
  status: string;
  rank: number;
}

export const getExamQuestionStats = (examId: number): Promise<ApiResponse<QuestionStat[]>> =>
  axios.get(`/api/statistics/exam/${examId}/questions`) as Promise<ApiResponse<QuestionStat[]>>;

export const getExamStudentScores = (
  examId: number,
  params?: { page?: number; page_size?: number; class_id?: number; keyword?: string }
): Promise<ApiResponse<{ total: number; items: StudentScoreItem[] }>> =>
  axios.get(`/api/statistics/exam/${examId}/students`, { params }) as Promise<
    ApiResponse<{ total: number; items: StudentScoreItem[] }>
  >;

export const buildExamReport = (
  examId: number,
  sections?: string[]
): Promise<AxiosResponse<Blob>> =>
  axios.post(
    `/api/statistics/exam/${examId}/report`,
    { sections },
    {
      responseType: 'blob',
      preserveResponse: true,
    }
  ) as Promise<AxiosResponse<Blob>>;
