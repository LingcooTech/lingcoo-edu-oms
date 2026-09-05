import { Alert, App, Button, Card, Descriptions, Form, Input, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

import { PageContainer } from '../../components/PageContainer';
import { useChangePassword, useRequestEmailVerification, useSession } from './hooks';

export function AccountSecurityPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const session = useSession();
  const changePassword = useChangePassword();
  const requestVerification = useRequestEmailVerification();
  const user = session.data!.user;

  return (
    <PageContainer title="账号安全" description="管理当前账号的凭据与邮箱验证状态。">
      <div className="identity-settings-grid">
        <Card title="账号资料">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="邮箱">{user.email}</Descriptions.Item>
            <Descriptions.Item label="显示名称">{user.displayName ?? '未设置'}</Descriptions.Item>
            <Descriptions.Item label="账号状态">
              <Tag color="green">正常</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="邮箱验证">
              {user.emailVerifiedAt ? (
                <Tag color="blue">已验证</Tag>
              ) : (
                <Space>
                  <Tag>未验证</Tag>
                  <Button
                    size="small"
                    loading={requestVerification.isPending}
                    onClick={() =>
                      requestVerification.mutate(undefined, {
                        onSuccess: (result) =>
                          void message.success(
                            result.testToken ? `开发令牌：${result.testToken}` : '验证说明已发送',
                          ),
                      })
                    }
                  >
                    发送验证
                  </Button>
                </Space>
              )}
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="修改密码">
          <Typography.Paragraph type="secondary">
            修改后所有设备上的会话都会立即失效，需要重新登录。
          </Typography.Paragraph>
          {changePassword.isError && (
            <Alert type="error" showIcon message={changePassword.error.message} />
          )}
          <Form
            layout="vertical"
            requiredMark={false}
            onFinish={(values) =>
              changePassword.mutate(
                {
                  currentPassword: values.currentPassword as string,
                  newPassword: values.newPassword as string,
                },
                {
                  onSuccess: () => {
                    void message.success('密码已修改，请重新登录');
                    navigate('/login', { replace: true });
                  },
                },
              )
            }
          >
            <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="新密码"
              rules={[{ required: true, min: 12, max: 128, message: '密码长度为 12–128 位' }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={changePassword.isPending}>
              修改密码
            </Button>
          </Form>
        </Card>
      </div>
    </PageContainer>
  );
}
