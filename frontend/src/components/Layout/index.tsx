import React, { useState } from 'react';
import { Layout, Menu, Dropdown, Avatar, Tooltip, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  IdcardOutlined,
  TeamOutlined,
  FileTextOutlined,
  BookOutlined,
  CheckSquareOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  AppstoreOutlined,
  ReadOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import BrandLogo from '../BrandLogo';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import useAuthStore from '../../store/auth';
import useThemeStore from '../../store/theme';
import { logout as logoutApi } from '../../api/auth';
import PageTransition from '../PageTransition';
import './index.css';

const { Sider, Header, Content } = Layout;

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logoutStore = useAuthStore((state) => state.logout);
  const mode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (e) {
      // 忽略登出接口错误，本地照常清理
    }
    logoutStore();
    navigate('/login');
  };

  const userMenu: MenuProps = {
    items: [
      { key: 'profile', icon: <IdcardOutlined />, label: '个人信息' },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'profile') navigate('/profile');
      else if (key === 'logout') handleLogout();
    },
  };

  const getMenuItems = (): MenuProps['items'] => {
    if (user?.role === 'admin') {
      return [
        { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
        { key: '/classes', icon: <AppstoreOutlined />, label: '班级管理' },
        { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
        { key: '/teacher-subjects', icon: <ReadOutlined />, label: '教师学科' },
        { key: '/exams', icon: <FileTextOutlined />, label: '考试管理' },
      ];
    }
    if (user?.role === 'teacher') {
      return [
        { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
        { key: '/courses', icon: <BookOutlined />, label: '课程管理' },
        { key: '/exams', icon: <FileTextOutlined />, label: '考试管理' },
        { key: '/grading', icon: <CheckSquareOutlined />, label: '阅卷管理' },
      ];
    }
    return [
      { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
      { key: '/exams', icon: <FileSearchOutlined />, label: '考试列表' },
      { key: '/my-records', icon: <HistoryOutlined />, label: '我的记录' },
    ];
  };

  return (
    <Layout className="app-layout">
      <Sider
        className={`app-sider${collapsed ? ' app-sider-collapsed' : ''}`}
        width={220}
        collapsedWidth={72}
        collapsible
        collapsed={collapsed}
        trigger={null}
      >
        <div className="app-brand">
          <BrandLogo size={32} />
          {!collapsed && <span className="app-brand-name">π考</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={getMenuItems()}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header-left">
            <span className="app-collapse-btn">
              {collapsed ? (
                <MenuUnfoldOutlined
                  onClick={() => setCollapsed(false)}
                  style={{ cursor: 'pointer' }}
                />
              ) : (
                <MenuFoldOutlined
                  onClick={() => setCollapsed(true)}
                  style={{ cursor: 'pointer' }}
                />
              )}
            </span>
          </div>
          <div className="app-header-right">
            <Tooltip title={mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}>
              <Button
                type="text"
                className="app-theme-toggle"
                aria-label={mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
            </Tooltip>
            <Dropdown menu={userMenu} placement="bottomRight">
              <span className="app-user">
                <Avatar
                  size={32}
                  className="app-user-avatar"
                  icon={<UserOutlined />}
                />
                <span className="app-user-name">{user?.name || user?.username}</span>
              </span>
            </Dropdown>
          </div>
        </Header>
        <Content className="app-content">
          <PageTransition>
            <Outlet key={location.pathname} />
          </PageTransition>
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
