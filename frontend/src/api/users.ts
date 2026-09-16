import axios from './axios';
import type { ApiResponse, Paginated } from '../types/api';
import type { User, UserRole } from '../types/user';

export interface UserCreateInput {
  username: string;
  password: string;
  name: string;
  role: UserRole;
  email?: string;
  phone?: string;
  class_id?: number | null;
}

export interface UserUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  is_active?: boolean;
  class_id?: number | null;
}

export const getUsers = (params?: Record<string, unknown>): Promise<ApiResponse<Paginated<User>>> =>
  axios.get('/api/users', { params }) as Promise<ApiResponse<Paginated<User>>>;

export const createUser = (data: UserCreateInput): Promise<ApiResponse<User>> =>
  axios.post('/api/users', data) as Promise<ApiResponse<User>>;

export const updateUser = (id: number, data: UserUpdateInput): Promise<ApiResponse<User>> =>
  axios.put(`/api/users/${id}`, data) as Promise<ApiResponse<User>>;

export const deleteUser = (id: number): Promise<ApiResponse<null>> =>
  axios.delete(`/api/users/${id}`) as Promise<ApiResponse<null>>;

export const importUsersFile = (file: File): Promise<ApiResponse<{ imported_count: number; errors: Array<{ row?: number; error?: string }> }>> => {
  const formData = new FormData();
  formData.append('file', file);
  return axios.post('/api/users/import-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }) as Promise<ApiResponse<{ imported_count: number; errors: Array<{ row?: number; error?: string }> }>>;
};

export const resetUserPassword = (id: number, new_password: string): Promise<ApiResponse<null>> =>
  axios.post(`/api/users/${id}/reset-password`, { new_password }) as Promise<ApiResponse<null>>;
