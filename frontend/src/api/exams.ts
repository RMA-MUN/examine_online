import axios from './axios';
import type { ApiResponse, Paginated } from '../types/api';
import type { Exam, ExamInput, ExamQuery } from '../types/exam';
import type { Question, QuestionInput, QuestionQuery, ImportResult, ImportErrorResponse } from '../types/question';
import type { ExamRecord, Paper } from '../types/record';
import type { AnswerValue } from '../types/answer';

export const getExams = (params?: ExamQuery): Promise<ApiResponse<Paginated<Exam>>> =>
  axios.get('/api/exams', { params }) as Promise<ApiResponse<Paginated<Exam>>>;

export const getExam = (id: number): Promise<ApiResponse<Exam>> =>
  axios.get(`/api/exams/${id}`) as Promise<ApiResponse<Exam>>;

export const createExam = (data: ExamInput): Promise<ApiResponse<Exam>> =>
  axios.post('/api/exams', data) as Promise<ApiResponse<Exam>>;

export const updateExam = (id: number, data: Partial<ExamInput>): Promise<ApiResponse<Exam>> =>
  axios.put(`/api/exams/${id}`, data) as Promise<ApiResponse<Exam>>;

export const deleteExam = (id: number): Promise<ApiResponse<null>> =>
  axios.delete(`/api/exams/${id}`) as Promise<ApiResponse<null>>;

export const publishExam = (id: number): Promise<ApiResponse<Exam>> =>
  axios.put(`/api/exams/${id}/publish`) as Promise<ApiResponse<Exam>>;

export const getExamQuestions = (examId: number, params?: QuestionQuery): Promise<ApiResponse<Paginated<Question>>> =>
  axios.get(`/api/exams/${examId}/questions`, { params }) as Promise<ApiResponse<Paginated<Question>>>;

export const createQuestion = (examId: number, data: QuestionInput): Promise<ApiResponse<Question>> =>
  axios.post(`/api/exams/${examId}/questions`, data) as Promise<ApiResponse<Question>>;

export const updateQuestion = (questionId: number, data: Partial<QuestionInput>): Promise<ApiResponse<Question>> =>
  axios.put(`/api/questions/${questionId}`, data) as Promise<ApiResponse<Question>>;

export const deleteQuestion = (questionId: number): Promise<ApiResponse<null>> =>
  axios.delete(`/api/questions/${questionId}`) as Promise<ApiResponse<null>>;

export const startExam = (examId: number): Promise<ApiResponse<unknown>> =>
  axios.post(`/api/exams/${examId}/start`) as Promise<ApiResponse<unknown>>;

export const getPaper = (examId: number): Promise<ApiResponse<Paper>> =>
  axios.get(`/api/exams/${examId}/paper`) as Promise<ApiResponse<Paper>>;

export const saveAnswers = (examId: number, answers: Record<string, AnswerValue>): Promise<ApiResponse<unknown>> =>
  axios.post(`/api/exams/${examId}/save`, answers) as Promise<ApiResponse<unknown>>;

export const submitExam = (examId: number, answers: Record<string, AnswerValue>): Promise<ApiResponse<{ score: number }>> =>
  axios.post(`/api/exams/${examId}/submit`, { answers }) as Promise<ApiResponse<{ score: number }>>;

export const recordSwitch = (examId: number): Promise<ApiResponse<unknown>> =>
  axios.post(`/api/exams/${examId}/switch`) as Promise<ApiResponse<unknown>>;

export const getSwitchStatus = (examId: number): Promise<ApiResponse<unknown>> =>
  axios.get(`/api/exams/${examId}/switch-status`) as Promise<ApiResponse<unknown>>;

export const getMyRecords = (): Promise<ApiResponse<ExamRecord[]>> =>
  axios.get('/api/records') as Promise<ApiResponse<ExamRecord[]>>;

export const downloadTemplate = (format: 'excel' | 'word') => {
  return axios.get(`/api/questions/template/${format}`, {
    responseType: 'blob'
  });
};

export const importQuestionsFile = (examId: number, file: File): Promise<ApiResponse<ImportResult> | ImportErrorResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post(`/api/exams/${examId}/questions/import-file`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }) as Promise<ApiResponse<ImportResult> | ImportErrorResponse>;
};

export const createBankQuestion = (data: QuestionInput): Promise<ApiResponse<Question>> =>
  axios.post('/api/bank/questions', data) as Promise<ApiResponse<Question>>;

export const createFromBank = (examId: number, question_ids: number[]) =>
  axios.post(`/api/exams/${examId}/questions/from-bank`, { bank_ids: question_ids });

export const importQuestionsJson = (examId: number, items: unknown[]) =>
  axios.post(`/api/exams/${examId}/questions/import`, { questions: items });

export const reportEvent = (examId: number, event_type: string, detail?: Record<string, unknown>) =>
  axios.post(`/api/exams/${examId}/events`, { event_type, detail: detail ?? null });

export const importBankFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post('/api/bank/questions/import-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const generatePaperFromBasket = (examId: number, bankIds: number[]) =>
  axios.post(`/api/exams/${examId}/questions/from-bank`, { bank_ids: bankIds });

export interface AnnouncementItem {
  id: number;
  exam_id: number;
  record_id: number;
  event_type: string;
  detail: { message?: string } | null;
  created_at: string;
}

export const postAnnouncement = (examId: number, message: string) =>
  axios.post(`/api/exams/${examId}/announcements`, { message });

export const getAnnouncements = (examId: number): Promise<ApiResponse<AnnouncementItem[]>> =>
  axios.get(`/api/exams/${examId}/announcements`) as Promise<ApiResponse<AnnouncementItem[]>>;
