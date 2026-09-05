import { Alert, Button, Card, Form, Input, Result, Typography } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';

import { useConfirmPasswordReset, useRequestPasswordReset } from './hooks';

export function ForgotPasswordPage() {
  const requestReset = useRequestPasswordReset();
  return (
    <main className="identity-page">
      <Card className="identity-card" variant="borderless">
        <Typography.Title level={2}>找回密码</Typography.Title>
        <Typography.Paragraph type="secondary">
          提交后，无论账号是否存在都会返回相同结果，避免泄露账号信息。
        </Typography.Paragraph>
        {requestReset.isSuccess && (
          <Alert
            type="success"
            showIcon
            message="如果该账号存在，重置说明已经发送。"
            description={
              requestReset.data.testToken ? `开发令牌：${requestReset.data.testToken}` : undefined
            }
          />
        )}
        {requestReset.isError && (
          <Alert type="error" showIcon message={requestReset.error.message} />
        )}
        <Form
          layout="vertical"
          size="large"
          onFinish={({ email }) => requestReset.mutate(email as string)}
        >
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={requestReset.isPending}>
            提交
          </Button>
        </Form>
        <Button type="link" block>
          <Link to="/login">返回登录</Link>
        </Button>
      </Card>
    </main>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const reset = useConfirmPasswordReset();
  const token = searchParams.get('token') ?? '';
  if (!token) {
    return (
      <Result
        status="warning"
        title="缺少重置令牌"
        extra={<Link to="/forgot-password">重新申请</Link>}
      />
    );
  }
  if (reset.isSuccess) {
    return <Result status="success" title="密码已重置" extra={<Link to="/login">返回登录</Link>} />;
  }
  return (
    <main className="identity-page">
      <Card className="identity-card" variant="borderless">
        <Typography.Title level={2}>设置新密码</Typography.Title>
        {reset.isError && <Alert type="error" showIcon message={reset.error.message} />}
        <Form
          layout="vertical"
          size="large"
          onFinish={({ newPassword }) =>
            reset.mutate({ token, newPassword: newPassword as string })
          }
        >
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, min: 12, max: 128, message: '密码长度为 12–128 位' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={reset.isPending}>
            重置密码
          </Button>
        </Form>
      </Card>
    </main>
  );
}
