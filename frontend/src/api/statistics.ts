import type { AxiosResponse } from 'axios';
import axios from './axios';
import type { ApiResponse } from '../types/api';
import type { DashboardData } from '../types/dashboard';
import type { ScoreExportOptions } from '../types/scoreExport';

export const getDashboard = (): Promise<ApiResponse<DashboardData>> =>
  axios.get('/api/statistics/dashboard') as Promise<ApiResponse<DashboardData>>;

export const exportDashboard = (
  format: 'csv' | 'xlsx',
  dataset?: string
): Promise<AxiosResponse<Blob>> =>
  axios.get('/api/statistics/dashboard/export', {
    params: { format, ...(dataset ? { dataset } : {}) },
    responseType: 'blob',
    preserveResponse: true,
  }) as Promise<AxiosResponse<Blob>>;

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
