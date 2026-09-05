import { MailOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Form, Input, Space, Tabs } from 'antd';
import { Link } from 'react-router-dom';

import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { MailDeliveries } from './MailDeliveries';
import { MailTemplates } from './MailTemplates';
import { useSendTestMail } from './hooks';

export function MailPage() {
  return (
    <PageContainer
      title="邮件服务"
      description="管理邮件模板、异步投递与安全诊断；SMTP 密码仍统一在系统设置中管理。"
    >
      <Alert
        type="info"
        showIcon
        title="邮件发送由 Worker 执行并使用 Jobs 重试"
        description="投递正文加密保存，管理接口只提供脱敏收件人、内容哈希与安全错误摘要。Capture 模式不会向外部发送。"
        style={{ marginBottom: 16 }}
      />
      <Tabs
        items={[
          { key: 'deliveries', label: '投递记录', children: <MailDeliveries /> },
          { key: 'templates', label: '邮件模板', children: <MailTemplates /> },
          { key: 'test', label: '测试邮件', children: <TestMail /> },
        ]}
      />
    </PageContainer>
  );
}

function TestMail() {
  const { message } = App.useApp();
  const canManage = useCan('mail.manage');
  const send = useSendTestMail();
  return (
    <Card
      title="验证投递链路"
      extra={
        <Link to="/settings">
          <Button icon={<SettingOutlined />}>邮件设置</Button>
        </Link>
      }
    >
      <Form
        layout="vertical"
        style={{ maxWidth: 520 }}
        onFinish={async (values: { to: string }) => {
          await send.mutateAsync(values);
          void message.success('测试邮件已进入队列');
        }}
      >
        <Form.Item name="to" label="收件邮箱" rules={[{ required: true, type: 'email' }]}>
          <Input prefix={<MailOutlined />} placeholder="name@example.com" disabled={!canManage} />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={send.isPending} disabled={!canManage}>
            发送测试邮件
          </Button>
        </Space>
      </Form>
    </Card>
  );
}
