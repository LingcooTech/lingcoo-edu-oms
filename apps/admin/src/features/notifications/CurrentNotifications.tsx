import { CheckOutlined, DeleteOutlined, LinkOutlined } from '@ant-design/icons';
import type {
  Notification as AppNotification,
  NotificationStatus,
} from '@lingcoo-edu-oms/contracts';
import { App, Button, Card, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from './hooks';

const statusLabels: Record<NotificationStatus, string> = {
  unread: '未读',
  read: '已读',
  archived: '已归档',
};
const levelColors = { info: 'blue', success: 'green', warning: 'orange', error: 'red' } as const;

export function CurrentNotifications() {
  const { message } = App.useApp();
  const [status, setStatus] = useState<NotificationStatus | undefined>();
  const [page, setPage] = useState(1);
  const result = useNotifications({ page, pageSize: 20, status, includeArchived: Boolean(status) });
  const unread = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const archive = useArchiveNotification();
  return (
    <Card
      title={`当前账号通知${unread.data ? ` · ${unread.data.count} 条未读` : ''}`}
      extra={
        <Space>
          <Select
            allowClear
            value={status}
            placeholder="全部状态"
            style={{ width: 130 }}
            options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Button
            icon={<CheckOutlined />}
            disabled={!unread.data?.count}
            loading={markAll.isPending}
            onClick={async () => {
              const response = await markAll.mutateAsync();
              void message.success(`已标记 ${response.updatedCount} 条通知`);
            }}
          >
            全部已读
          </Button>
        </Space>
      }
    >
      <AsyncState
        loading={result.isPending}
        error={result.error}
        empty={!result.data?.items.length}
      >
        <Table
          rowKey="id"
          dataSource={result.data?.items ?? []}
          scroll={{ x: 900 }}
          pagination={{
            current: result.data?.page,
            pageSize: result.data?.pageSize,
            total: result.data?.total,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            {
              title: '通知',
              render: (_: unknown, item: AppNotification) => (
                <Space orientation="vertical" size={2}>
                  <Space wrap>
                    <Typography.Text strong={item.status === 'unread'}>
                      {item.title}
                    </Typography.Text>
                    <Tag color={levelColors[item.level]}>{item.level}</Tag>
                    <Tag>{item.category}</Tag>
                  </Space>
                  <Typography.Text>{item.body}</Typography.Text>
                  {item.ctaLabel && item.ctaUrl && (
                    <Typography.Link
                      href={item.ctaUrl}
                      target={item.ctaUrl.startsWith('/') ? undefined : '_blank'}
                      rel={item.ctaUrl.startsWith('/') ? undefined : 'noreferrer'}
                    >
                      <LinkOutlined /> {item.ctaLabel}
                    </Typography.Link>
                  )}
                </Space>
              ),
            },
            {
              title: '状态',
              width: 100,
              render: (_: unknown, item: AppNotification) => (
                <Tag color={item.status === 'unread' ? 'processing' : 'default'}>
                  {statusLabels[item.status]}
                </Tag>
              ),
            },
            {
              title: '时间',
              width: 190,
              render: (_: unknown, item: AppNotification) =>
                new Date(item.createdAt).toLocaleString('zh-CN'),
            },
            {
              title: '操作',
              width: 170,
              render: (_: unknown, item: AppNotification) => (
                <Space>
                  {item.status === 'unread' && (
                    <Button type="link" onClick={() => markRead.mutate(item.id)}>
                      标记已读
                    </Button>
                  )}
                  {item.status !== 'archived' && (
                    <Button
                      type="link"
                      icon={<DeleteOutlined />}
                      onClick={() => archive.mutate(item.id)}
                    >
                      归档
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </AsyncState>
    </Card>
  );
}
