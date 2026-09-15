import React, { useState } from 'react';
import { App, Form, Input, Button } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { login } from '../../api/auth';
import useAuthStore from '../../store/auth';
import BrandLogo from '../../components/BrandLogo';
import './index.css';

interface LoginValues {
  username: string;
  password: string;
}

const Login = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setToken = useAuthStore((state) => state.setToken);

  const onFinish = async (values: LoginValues) => {
    setLoading(true);
    try {
      const res = await login(values.username, values.password);
      setToken(res.data.access_token);
      message.success('登录成功');
      navigate('/');
    } catch (error) {
      message.error((error as { response?: { data?: { detail?: string } } }).response?.data?.detail || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <aside className="login-brand">
          <div className="login-brand-inner">
            <BrandLogo size={56} />
            <h1 className="login-brand-name">明鉴</h1>
            <span className="login-brand-en">MINGJIAN · EXAM & GRADING</span>
            <p className="login-brand-slogan">在线考试与阅卷系统</p>
          </div>
        </aside>

        <main className="login-form-panel">
          <div className="login-form-inner">
            <h2 className="login-title">欢迎登录</h2>
            <p className="login-subtitle">请使用您的账号密码登录系统</p>
            <Form
              onFinish={onFinish}
              size="large"
              labelCol={{ flex: '4em' }}
              wrapperCol={{ flex: 1 }}
            >
              <Form.Item
                name="username"
                label="用户名"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[{ required: true, message: '请输入密码' }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block className="login-submit">
                  登录
                </Button>
              </Form.Item>
            </Form>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Login;
