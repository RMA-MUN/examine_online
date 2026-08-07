import React, { useState, useEffect } from 'react';
import { App, Descriptions, Tag, Form, Input, Button, Divider, Popconfirm } from 'antd';
import {
  SaveOutlined, LockOutlined, LogoutOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { updateMe, changePassword, logout } from '../../api/auth';
import useAuthStore from '../../store/auth';
import PageHeader from '../../components/PageHeader';
import PageCard from '../../components/PageCard';
import type { ProfileUpdate, ChangePasswordRequest, UserRole } from '../../types/user';
import './index.css';

const roleMap: Record<UserRole, string> = { student: '学生', teacher: '老师', admin: '管理员' };

interface ProfileFormValues {
  name: string;
  email?: string;
  phone?: string;
}

interface PwdFormValues {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

const Profile = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const logoutStore = useAuthStore((state) => state.logout);
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [pwdForm] = Form.useForm<PwdFormValues>();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    if (user) {
      profileForm.setFieldsValue({ name: user.name, email: user.email ?? undefined, phone: user.phone ?? undefined });
    }
  }, [user, profileForm]);

  const handleSaveProfile = async () => {
    try {
      const values = await profileForm.validateFields();
      setSavingProfile(true);
      const payload: ProfileUpdate = {
        name: values.name,
        email: values.email,
        phone: values.phone,
      };
      await updateMe(payload);
      await fetchUser();
      message.success('个人信息已更新');
    } catch (error) {
      if ((error as { errorFields?: unknown })?.errorFields) return;
      message.error(
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '更新失败'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await pwdForm.validateFields();
      setSavingPwd(true);
      const payload: ChangePasswordRequest = {
        old_password: values.old_password,
        new_password: values.new_password,
      };
      await changePassword(payload);
      message.success('密码修改成功');
      pwdForm.resetFields();
    } catch (error) {
      if ((error as { errorFields?: unknown })?.errorFields) return;
      message.error(
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '密码修改失败'
      );
    } finally {
      setSavingPwd(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      // 忽略登出接口错误，本地照常清理
    }
    logoutStore();
    navigate('/login');
  };

  return (
    <div className="profile-page">
      <PageHeader title="个人信息" subtitle="查看与修改你的账号资料" />

      <PageCard className="profile-section">
        <h3 className="profile-section-title">基本信息</h3>
        {user && (
          <Descriptions column={2} style={{ marginBottom: 8 }}>
            <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
            <Descriptions.Item label="角色">
              <Tag color="geekblue">{roleMap[user.role] || user.role}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="注册时间">
              {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
        <Divider plain style={{ margin: '16px 0 24px' }}>修改资料</Divider>
        <Form form={profileForm} layout="vertical" style={{ maxWidth: 480 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input placeholder="请输入电话" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" icon={<SaveOutlined />} loading={savingProfile} onClick={handleSaveProfile}>
              保存
            </Button>
          </Form.Item>
        </Form>
      </PageCard>

      <PageCard className="profile-section">
        <h3 className="profile-section-title">修改密码</h3>
        <Form form={pwdForm} layout="vertical" style={{ maxWidth: 480 }}>
          <Form.Item name="old_password" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="请输入原密码" />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="请输入新密码（至少 6 位）" />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_: unknown, value?: string) {
                  if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button icon={<SafetyCertificateOutlined />} loading={savingPwd} onClick={handleChangePassword}>
              修改密码
            </Button>
          </Form.Item>
        </Form>
      </PageCard>

      <PageCard className="profile-section">
        <h3 className="profile-section-title">账号操作</h3>
        <Popconfirm title="确认退出登录？" onConfirm={handleLogout}>
          <Button danger icon={<LogoutOutlined />}>
            退出登录
          </Button>
        </Popconfirm>
      </PageCard>
    </div>
  );
};

export default Profile;
