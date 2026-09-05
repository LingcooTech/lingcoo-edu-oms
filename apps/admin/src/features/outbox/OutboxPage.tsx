import { EyeOutlined, FilterOutlined, RedoOutlined, SearchOutlined } from '@ant-design/icons';
import type {
  OutboxAttempt,
  OutboxEventSummary,
  OutboxQuery,
  OutboxStatus,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useOutboxEvent, useOutboxEvents, useReplayOutboxEvent } from './hooks';

interface Filters {
  search?: string;
  status?: OutboxStatus;
  topic?: string;
  aggregateType?: string;
  from?: string;
  to?: string;
}

const statusPresentation: Record<OutboxStatus, { label: string; color: string }> = {
  pending: { label: '待发布', color: 'default' },
  publishing: { label: '发布中', color: 'processing' },
  published: { label: '已发布', color: 'success' },
  dead: { label: '死信', color: 'error' },
};

function StatusTag({ status }: { status: OutboxStatus }) {
  const item = statusPresentation[status];
  return <Tag color={item.color}>{item.label}</Tag>;
}

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

export function OutboxPage() {
  const [form] = Form.useForm<Filters>();
  const [query, setQuery] = useState<Partial<OutboxQuery>>({ page: 1, pageSize: 20 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const result = useOutboxEvents(query);
  const apply = (values: Filters) =>
    setQuery({
      ...Object.fromEntries(Object.entries(values).filter(([, value]) => value)),
      from: values.from ? new Date(values.from).toISOString() : undefined,
      to: values.to ? new Date(values.to).toISOString() : undefined,
      page: 1,
      pageSize: 20,
    });

  return (
    <PageContainer
      title="Outbox 事件"
      description="诊断事务业务事件的发布、重试、聚合顺序和死信状态。"
    >
      <Alert
        type="info"
        showIcon
        title="事件事实不可修改，发布语义为 at-least-once"
        description="页面不返回 Payload、原始去重键、Worker、Claim Token 或异常堆栈；消费者必须使用 Event ID 幂等。"
        style={{ marginBottom: 16 }}
      />
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onFinish={apply}>
          <div className="outbox-filter-grid">
            <Form.Item label="搜索" name="search">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Topic、聚合 ID、Key 预览或错误码"
              />
            </Form.Item>
            <Form.Item label="状态" name="status">
              <Select
                allowClear
                options={Object.entries(statusPresentation).map(([value, item]) => ({
                  value,
                  label: item.label,
                }))}
              />
            </Form.Item>
            <Form.Item label="Topic" name="topic">
              <Input allowClear placeholder="payments.succeeded" />
            </Form.Item>
            <Form.Item label="聚合类型" name="aggregateType">
              <Input allowClear placeholder="payment_intent" />
            </Form.Item>
            <Form.Item label="开始时间" name="from">
              <Input type="datetime-local" />
            </Form.Item>
            <Form.Item label="结束时间" name="to">
              <Input type="datetime-local" />
            </Form.Item>
          </div>
          <Space>
            <Button type="primary" htmlType="submit" icon={<FilterOutlined />}>
              筛选
            </Button>
            <Button
              onClick={() => {
                form.resetFields();
                setQuery({ page: 1, pageSize: 20 });
              }}
            >
              重置
            </Button>
          </Space>
        </Form>
      </Card>
      <Card>
        <AsyncState
          loading={result.isPending}
          error={result.error}
          empty={!result.data?.items.length}
        >
          <Table
            rowKey="id"
            scroll={{ x: 1_180 }}
            dataSource={result.data?.items ?? []}
            pagination={{
              current: result.data?.page ?? query.page,
              pageSize: result.data?.pageSize ?? query.pageSize,
              total: result.data?.total ?? 0,
              showSizeChanger: true,
              onChange: (page, pageSize) => setQuery((current) => ({ ...current, page, pageSize })),
            }}
            columns={[
              { title: '发生时间', dataIndex: 'occurredAt', width: 190, render: formatTime },
              {
                title: 'Topic',
                dataIndex: 'topic',
                render: (value: string, event: OutboxEventSummary) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text strong>{value}</Typography.Text>
                    <Typography.Text type="secondary">v{event.eventVersion}</Typography.Text>
                  </Space>
                ),
              },
              {
                title: '聚合',
                width: 220,
                render: (_: unknown, event: OutboxEventSummary) =>
                  event.aggregateType
                    ? `${event.aggregateType} / ${event.aggregateId} / v${event.aggregateVersion}`
                    : '无序事件',
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 100,
                render: (status: OutboxStatus) => <StatusTag status={status} />,
              },
              {
                title: '尝试 / 最大 / 恢复',
                width: 150,
                render: (_: unknown, event: OutboxEventSummary) =>
                  `${event.attemptCount} / ${event.maxAttempts} / ${event.recoveryCount}`,
              },
              {
                title: '操作',
                fixed: 'right',
                width: 90,
                render: (_: unknown, event: OutboxEventSummary) => (
                  <Button
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => setSelectedId(event.id)}
                  >
                    详情
                  </Button>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <OutboxDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </PageContainer>
  );
}

function OutboxDrawer({ id, onClose }: { id: string | null; onClose(): void }) {
  const { message, modal } = App.useApp();
  const canManage = useCan('outbox.manage');
  const result = useOutboxEvent(id);
  const replay = useReplayOutboxEvent();
  const event = result.data;
  return (
    <Drawer
      title="Outbox Event 详情"
      aria-label="Outbox Event 详情"
      className="outbox-detail-drawer"
      size={760}
      open={Boolean(id)}
      onClose={onClose}
      extra={
        canManage && event?.canReplay ? (
          <Button
            icon={<RedoOutlined />}
            onClick={() =>
              modal.confirm({
                title: '确认重放死信事件？',
                content: '系统保留原 Event ID、Payload 与历史 Attempt，并增加一次发布预算。',
                okText: '确认重放',
                async onOk() {
                  await replay.mutateAsync(event.id);
                  void message.success('Outbox Event 已重新排队');
                },
              })
            }
          >
            重放
          </Button>
        ) : null
      }
    >
      <AsyncState loading={result.isPending} error={result.error}>
        {event && (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { key: 'status', label: '状态', children: <StatusTag status={event.status} /> },
                {
                  key: 'topic',
                  label: 'Topic / Version',
                  children: `${event.topic} / v${event.eventVersion}`,
                },
                {
                  key: 'aggregate',
                  label: '聚合',
                  children: event.aggregateType
                    ? `${event.aggregateType} / ${event.aggregateId} / v${event.aggregateVersion}`
                    : '无序事件',
                },
                {
                  key: 'attempts',
                  label: '尝试 / 最大 / 恢复 / 重放',
                  children: `${event.attemptCount} / ${event.maxAttempts} / ${event.recoveryCount} / ${event.manualReplayCount}`,
                },
                {
                  key: 'dedupe',
                  label: '去重 Key 预览',
                  children: event.deduplicationPreview ?? '—',
                },
                { key: 'occurred', label: '发生时间', children: formatTime(event.occurredAt) },
                { key: 'published', label: '发布时间', children: formatTime(event.publishedAt) },
                {
                  key: 'payload',
                  label: 'Payload 摘要',
                  children: `${event.payloadSizeBytes} bytes`,
                },
                {
                  key: 'hash',
                  label: 'Payload Hash',
                  children: (
                    <Typography.Text code copyable>
                      {event.payloadHash}
                    </Typography.Text>
                  ),
                },
                {
                  key: 'error',
                  label: '最近错误',
                  children: event.lastError
                    ? `${event.lastError.code} · ${event.lastError.message}`
                    : '—',
                },
              ]}
            />
            <div>
              <Typography.Title level={5}>发布尝试</Typography.Title>
              <Table<OutboxAttempt>
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 680 }}
                dataSource={event.attempts}
                columns={[
                  { title: '#', dataIndex: 'attemptNumber', width: 60 },
                  { title: '状态', dataIndex: 'status', width: 110 },
                  { title: '开始', dataIndex: 'startedAt', width: 180, render: formatTime },
                  { title: '完成', dataIndex: 'finishedAt', width: 180, render: formatTime },
                  {
                    title: '错误',
                    render: (_: unknown, attempt) =>
                      attempt.error ? `${attempt.error.code} · ${attempt.error.message}` : '—',
                  },
                ]}
              />
            </div>
          </Space>
        )}
      </AsyncState>
    </Drawer>
  );
}
