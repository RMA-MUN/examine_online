import axios, { AxiosInstance } from 'axios';

declare module 'axios' {
  export interface AxiosRequestConfig {
    preserveResponse?: boolean;
  }

  export interface InternalAxiosRequestConfig {
    preserveResponse?: boolean;
  }
}

const instance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  timeout: 10000,
});

instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

instance.interceptors.response.use(
  (response) => response.config.preserveResponse ? response : response.data,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/api/auth/login')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default instance;
