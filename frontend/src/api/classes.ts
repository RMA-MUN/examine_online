import axios from './axios';
import type { ApiResponse, Paginated } from '../types/api';
import type { Class, ClassCreate, ClassUpdate } from '../types/class';

export const getClasses = (params?: { page?: number; page_size?: number; keyword?: string }): Promise<ApiResponse<Paginated<Class>>> =>
  axios.get('/api/classes', { params }) as Promise<ApiResponse<Paginated<Class>>>;

export const createClass = (data: ClassCreate): Promise<ApiResponse<Class>> =>
  axios.post('/api/admin/classes', data) as Promise<ApiResponse<Class>>;

export const updateClass = (id: number, data: ClassUpdate): Promise<ApiResponse<Class>> =>
  axios.put(`/api/admin/classes/${id}`, data) as Promise<ApiResponse<Class>>;

export const deleteClass = (id: number): Promise<ApiResponse<null>> =>
  axios.delete(`/api/admin/classes/${id}`) as Promise<ApiResponse<null>>;

export const getClassStudents = (id: number): Promise<ApiResponse<Array<{ id: number; username: string; name: string }>>> =>
  axios.get(`/api/admin/classes/${id}/students`) as Promise<ApiResponse<Array<{ id: number; username: string; name: string }>>>;
