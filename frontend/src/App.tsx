import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Login from './pages/Login';
import AppLayout from './components/Layout';
import useAuthStore from './store/auth';
import useThemeStore, { applyThemeMode } from './store/theme';

// 管理员页面
import UserManage from './pages/Admin/UserManage';
import ClassManage from './pages/Admin/ClassManage';
import TeacherSubjectManage from './pages/Admin/TeacherSubjectManage';

// 老师页面
import ExamManage from './pages/Teacher/ExamManage';
import ExamEdit from './pages/Teacher/ExamEdit';
import CourseManage from './pages/Teacher/CourseManage';
import Grading from './pages/Teacher/Grading';

// 个人信息
import Profile from './pages/Profile';

// 学生页面
import ExamList from './pages/Student/ExamList';
import ExamTaking from './pages/Student/ExamTaking';
import MyRecords from './pages/Student/MyRecords';

// 仪表盘
import Dashboard from './pages/Dashboard';

import type { ReactNode } from 'react';

const PrivateRoute = ({ children }: { children: ReactNode }) => {
  const token = useAuthStore((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
};

// 根据角色渲染 /exams：管理员/老师进入考试管理，学生进入考试列表
const ExamsPage = () => {
  const user = useAuthStore((state) => state.user);
  return user?.role === 'student' ? <ExamList /> : <ExamManage />;
};

function App() {
  const { fetchUser, token } = useAuthStore();
  const mode = useThemeStore((state) => state.mode);
  const isDark = mode === 'dark';

  useEffect(() => {
    if (token) {
      fetchUser();
    }
  }, [token, fetchUser]);

  // store 初始化时已确定 mode，这里把它同步到 <html> 上驱动 CSS 变量
  useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? '#6B9ECF' : '#3D5A80',
          colorInfo: isDark ? '#6B9ECF' : '#3D5A80',
          colorSuccess: isDark ? '#4CAF6D' : '#52C41A',
          colorWarning: isDark ? '#E0A030' : '#FAAD14',
          colorError: isDark ? '#E06A58' : '#FF4D4F',
          colorTextBase: isDark ? '#E8EDF3' : '#1A2332',
          colorBgBase: isDark ? '#1E2A3A' : '#FFFFFF',
          colorBgLayout: isDark ? '#16202C' : '#F0F2F5',
          colorBorder: isDark ? '#33455C' : '#E4E8EE',
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif",
        },
        components: {
          Layout: {
            siderBg: isDark ? '#131C26' : '#1A2332',
            headerBg: isDark ? '#1E2A3A' : '#FFFFFF',
            headerHeight: 64,
            bodyBg: isDark ? '#16202C' : '#F0F2F5',
          },
          Menu: {
            darkItemBg: isDark ? '#131C26' : '#1A2332',
            darkItemColor: isDark ? '#94A6BC' : '#8B9BB4',
            darkItemHoverBg: isDark ? '#24344A' : '#2A3A4E',
            darkItemHoverColor: '#FFFFFF',
            darkItemSelectedBg: isDark ? '#3A6FA5' : '#3D5A80',
            darkItemSelectedColor: '#FFFFFF',
            itemBorderRadius: 8,
            itemMarginInline: 8,
          },
          Card: { borderRadiusLG: 12 },
          Button: { borderRadius: 8, borderRadiusLG: 8, borderRadiusSM: 6 },
          Input: { borderRadius: 8, borderRadiusLG: 8, borderRadiusSM: 6 },
          Select: { borderRadius: 8, borderRadiusLG: 8, borderRadiusSM: 6 },
          Modal: { borderRadiusLG: 16 },
          Table: {
            headerBg: isDark ? '#24313F' : '#f7f9fb',
            headerSplitColor: isDark ? '#33455C' : '#E4E8EE',
          },
          Tag: { borderRadiusSM: 6 },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="users" element={<UserManage />} />
              <Route path="classes" element={<ClassManage />} />
              <Route path="teacher-subjects" element={<TeacherSubjectManage />} />
              <Route path="exams" element={<ExamsPage />} />
              <Route path="exams/new" element={<ExamEdit />} />
              <Route path="exams/:examId/edit" element={<ExamEdit />} />
              <Route path="exams/:examId/take" element={<ExamTaking />} />
              <Route path="my-records" element={<MyRecords />} />
              <Route path="courses" element={<CourseManage />} />
              <Route path="grading" element={<Grading />} />
              <Route path="profile" element={<Profile />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
