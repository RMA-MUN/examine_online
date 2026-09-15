import React from 'react';
import { Avatar, Breadcrumb, Button, Dropdown, Input, Layout, Menu, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  BarChartOutlined,
  BookOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  EyeOutlined,
  FileTextOutlined,
  IdcardOutlined,
  LogoutOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/auth';
import useThemeStore from '../../store/theme';
import { logout as logoutApi } from '../../api/auth';
import { MINGJIAN_DARK, MINGJIAN_LIGHT } from '../../theme/mingjian';
import { NAV_ITEMS, filterByRole, type Role } from '../../store/navigation';
import PageTransition from '../PageTransition';
import './index.css';

const { Sider, Header, Content, Footer } = Layout;

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <DashboardOutlined />,
  exam: <FileTextOutlined />,
  grading: <CheckSquareOutlined />,
  eye: <EyeOutlined />,
  bank: <BookOutlined />,
  chart: <BarChartOutlined />,
  setting: <SettingOutlined />,
};

const ROLE_LABEL: Record<Role, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
};

const GROUP_ORDER = ['考试运行', '教学管理', '系统'];

const MingjianLayout = () => {
  const user = useAuthStore((state) => state.user);
  const logoutStore = useAuthStore((state) => state.logout);
  const mode = useThemeStore((state) => state.mode);
  const toggleTheme = useThemeStore((state) => state.toggle);
  const location = useLocation();
  const navigate = useNavigate();
  const isDark = mode === 'dark';
  const siderBg = isDark ? MINGJIAN_DARK.siderBg : MINGJIAN_LIGHT.siderBg;

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch {
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

  const visibleItems = user ? filterByRole(NAV_ITEMS, user.role) : [];

  const menuItems: MenuProps['items'] = [
    ...visibleItems
      .filter((i) => i.group === null)
      .map((i) => ({ key: i.path, icon: ICONS[i.icon], label: i.label })),
    ...GROUP_ORDER.flatMap((group) => {
      const children = visibleItems
        .filter((i) => i.group === group)
        .map((i) => ({ key: i.path, icon: ICONS[i.icon], label: i.label }));
      if (children.length === 0) return [];
      return [{ key: `group-${group}`, label: group, type: 'group' as const, children }];
    }),
  ];

  const currentLabel =
    NAV_ITEMS.find((i) => i.path === location.pathname)?.label ?? '总览控制台';

  return (
    <Layout className="mj-layout">
      <Sider className="mj-sider" width={236} style={{ background: siderBg }}>
        <div className="mj-brand">
          <span className="mj-brand-mark">明</span>
          <span className="mj-brand-text">
            <span className="mj-brand-name">明鉴</span>
            <span className="mj-brand-sub">Exam &amp; Grading</span>
          </span>
        </div>
        <Menu
          theme={isDark ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
        {user && (
          <div className="mj-side-foot">
            <Avatar size={32} icon={<UserOutlined />} />
            <span className="mj-side-foot-name">{user.name}</span>
            <span className="mj-side-foot-role">{ROLE_LABEL[user.role]}</span>
          </div>
        )}
      </Sider>
      <Layout>
        <Header className="mj-header">
          <Breadcrumb items={[{ title: '工作台' }, { title: currentLabel }]} />
          <div className="mj-header-right">
            <Input.Search placeholder="搜索" style={{ width: 280 }} />
            <Tooltip title={mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}>
              <Button
                type="text"
                className="mj-theme-toggle"
                aria-label={mode === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
            </Tooltip>
            <Dropdown menu={userMenu} placement="bottomRight">
              <span className="mj-user">
                <Avatar size={32} icon={<UserOutlined />} />
              </span>
            </Dropdown>
          </div>
        </Header>
        <Content className="mj-content">
          <div className="mj-content-inner" style={{ maxWidth: 1600 }}>
            <PageTransition>
              <Outlet key={location.pathname} />
            </PageTransition>
          </div>
        </Content>
        <Footer className="mj-footer">明鉴在线考试与阅卷系统 · 教务管理端 v2.4.0</Footer>
      </Layout>
    </Layout>
  );
};

export default MingjianLayout;
