import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { BrandMark, useBranding } from '../branding';
import { useLogin, useSession } from './hooks';

export function LoginPage() {
  const login = useLogin();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const branding = useBranding();
  const destination = (location.state as { from?: string } | null)?.from ?? '/';

  if (session.data) return <Navigate to={destination} replace />;

  return (
    <main className="identity-page">
      <Card className="identity-card" variant="borderless">
        <Space orientation="vertical" size={6} className="identity-heading">
          <BrandMark />
          <Typography.Title level={2}>{branding.loginTitle}</Typography.Title>
          <Typography.Text type="secondary">{branding.loginSubtitle}</Typography.Text>
        </Space>
        {login.isError && <Alert type="error" showIcon message={login.error.message} />}
        <Form
          layout="vertical"
          size="large"
          requiredMark={false}
          onFinish={(values) =>
            login.mutate(values, { onSuccess: () => navigate(destination, { replace: true }) })
          }
        >
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}
          >
            <Input
              prefix={<MailOutlined />}
              autoComplete="username"
              placeholder="owner@example.com"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={login.isPending}>
            登录
          </Button>
        </Form>
        <Button type="link" block onClick={() => navigate('/forgot-password')}>
          忘记密码？
        </Button>
      </Card>
    </main>
  );
}
