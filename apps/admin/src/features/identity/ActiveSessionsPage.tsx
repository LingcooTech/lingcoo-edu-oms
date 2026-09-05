import { App, Button, Card, List, Popconfirm, Space, Tag, Typography } from 'antd';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useIdentitySessions, useRevokeSession } from './hooks';

function sessionName(userAgent: string | null): string {
  if (!userAgent) return '未知设备';
  if (/mobile|android|iphone/i.test(userAgent)) return '移动设备';
  if (/macintosh|mac os/i.test(userAgent)) return 'Mac';
  if (/windows/i.test(userAgent)) return 'Windows';
  return '浏览器会话';
}

export function ActiveSessionsPage() {
  const { message } = App.useApp();
  const sessions = useIdentitySessions();
  const revoke = useRevokeSession();

  return (
    <PageContainer title="活动会话" description="查看当前账号已登录的设备，并撤销不再使用的会话。">
      <Card>
        <AsyncState
          loading={sessions.isPending}
          error={sessions.error}
          empty={sessions.data?.items.length === 0}
        >
          <List
            dataSource={sessions.data?.items ?? []}
            renderItem={(item) => (
              <List.Item
                actions={
                  item.current
                    ? [
                        <Tag color="blue" key="current">
                          当前会话
                        </Tag>,
                      ]
                    : [
                        <Popconfirm
                          key="revoke"
                          title="撤销这个会话？"
                          description="该设备将需要重新登录。"
                          onConfirm={() =>
                            revoke.mutate(item.id, {
                              onSuccess: () => void message.success('会话已撤销'),
                            })
                          }
                        >
                          <Button danger type="link" loading={revoke.isPending}>
                            撤销
                          </Button>
                        </Popconfirm>,
                      ]
                }
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {sessionName(item.userAgent)}
                      {item.ipAddress && <Tag>{item.ipAddress}</Tag>}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Typography.Text type="secondary">
                        最近活动：{new Date(item.lastSeenAt).toLocaleString()}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        到期时间：{new Date(item.expiresAt).toLocaleString()}
                      </Typography.Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </AsyncState>
      </Card>
    </PageContainer>
  );
}
