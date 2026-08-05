import axios from './axios';
import type { ApiResponse, Paginated } from '../types/api';
import type { ExamRecord } from '../types/record';
import type { Answer, GradeRequest } from '../types/answer';

export const getExamRecords = (
  examId: number,
  params?: Record<string, unknown>
): Promise<ApiResponse<Paginated<ExamRecord>>> =>
  axios.get(`/api/exams/${examId}/records`, { params }) as Promise<ApiResponse<Paginated<ExamRecord>>>;

export const getRecordAnswers = (recordId: number): Promise<ApiResponse<Answer[]>> =>
  axios.get(`/api/records/${recordId}/answers`) as Promise<ApiResponse<Answer[]>>;

export const getMyRecordAnswers = (recordId: number): Promise<ApiResponse<Answer[]>> =>
  axios.get(`/api/records/${recordId}/result`) as Promise<ApiResponse<Answer[]>>;

export const gradeAnswer = (answerId: number, data: GradeRequest): Promise<ApiResponse<Answer>> =>
  axios.put(`/api/answers/${answerId}/grade`, data) as Promise<ApiResponse<Answer>>;

export const retryAiGrading = (answerId: number): Promise<ApiResponse<{ answer_id: number; status: string }>> =>
  axios.post(`/api/answers/${answerId}/ai-grading/retry`) as Promise<ApiResponse<{ answer_id: number; status: string }>>;

export const finalizeRecord = (recordId: number): Promise<ApiResponse<ExamRecord>> =>
  axios.put(`/api/records/${recordId}/finalize`) as Promise<ApiResponse<ExamRecord>>;
