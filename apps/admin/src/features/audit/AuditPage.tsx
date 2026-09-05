import { EyeOutlined, FilterOutlined, SearchOutlined } from '@ant-design/icons';
import type {
  AuditActorType,
  AuditCategory,
  AuditEvent,
  AuditOutcome,
  AuditQuery,
} from '@lingcoo-edu-oms/contracts';
import {
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
import { useAuditEvent, useAuditEvents } from './hooks';

interface FilterValues {
  search?: string;
  actorType?: AuditActorType;
  actorId?: string;
  category?: AuditCategory;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  from?: string;
  to?: string;
}

const categoryLabels: Record<AuditCategory, string> = {
  security: '安全',
  access: '权限',
  account: '账号',
  system: '系统',
  business: '业务',
};

function toIso(value?: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export function AuditPage() {
  const [form] = Form.useForm<FilterValues>();
  const [query, setQuery] = useState<Partial<AuditQuery>>({ page: 1, pageSize: 20 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const events = useAuditEvents(query);

  const applyFilters = (values: FilterValues) => {
    const compact = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
    ) as FilterValues;
    setQuery({
      ...compact,
      from: toIso(compact.from),
      to: toIso(compact.to),
      page: 1,
      pageSize: 20,
    });
  };

  const resetFilters = () => {
    form.resetFields();
    setQuery({ page: 1, pageSize: 20 });
  };

  return (
    <PageContainer
      title="审计日志"
      description="查看不可变的安全事件和管理操作。审计记录只允许追加，不提供修改或删除入口。"
    >
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onFinish={applyFilters}>
          <div className="audit-filter-grid">
            <Form.Item label="全文搜索" name="search">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="动作、资源、账号或 Request ID"
              />
            </Form.Item>
            <Form.Item label="分类" name="category">
              <Select
                allowClear
                options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
            <Form.Item label="Actor 类型" name="actorType">
              <Select
                allowClear
                options={['user', 'system', 'job', 'provider'].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
            <Form.Item label="账号 ID" name="actorId">
              <Input allowClear />
            </Form.Item>
            <Form.Item label="动作" name="action">
              <Input allowClear placeholder="access.role.created" />
            </Form.Item>
            <Form.Item label="资源类型" name="resourceType">
              <Input allowClear placeholder="access.role" />
            </Form.Item>
            <Form.Item label="资源 ID" name="resourceId">
              <Input allowClear />
            </Form.Item>
            <Form.Item label="结果" name="outcome">
              <Select
                allowClear
                options={[
                  { value: 'success', label: '成功' },
                  { value: 'failure', label: '失败' },
                ]}
              />
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
            <Button onClick={resetFilters}>重置</Button>
          </Space>
        </Form>
      </Card>

      <Card>
        <AsyncState
          loading={events.isPending}
          error={events.error}
          empty={events.data?.items.length === 0}
        >
          <Table
            rowKey="id"
            dataSource={events.data?.items ?? []}
            onRow={(event) => ({
              onClick: () => setSelectedId(event.id),
              style: { cursor: 'pointer' },
            })}
            pagination={{
              current: events.data?.page ?? query.page,
              pageSize: events.data?.pageSize ?? query.pageSize,
              total: events.data?.total ?? 0,
              showSizeChanger: true,
              onChange: (page, pageSize) => setQuery((current) => ({ ...current, page, pageSize })),
            }}
            columns={[
              {
                title: '时间',
                dataIndex: 'occurredAt',
                width: 190,
                render: (value: string) => new Date(value).toLocaleString('zh-CN'),
              },
              {
                title: '动作',
                dataIndex: 'action',
                render: (value: string, event: AuditEvent) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text strong>{value}</Typography.Text>
                    <Typography.Text type="secondary">
                      {event.requestId ?? '无 Request ID'}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: 'Actor',
                render: (_: unknown, event: AuditEvent) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text>{event.actorLabel ?? event.actorType}</Typography.Text>
                    <Typography.Text type="secondary" copyable={Boolean(event.actorId)}>
                      {event.actorId ?? '—'}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '资源',
                render: (_: unknown, event: AuditEvent) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text>{event.resourceType}</Typography.Text>
                    <Typography.Text type="secondary">{event.resourceId ?? '—'}</Typography.Text>
                  </Space>
                ),
              },
              {
                title: '分类 / 结果',
                width: 150,
                render: (_: unknown, event: AuditEvent) => (
                  <Space>
                    <Tag>{categoryLabels[event.category]}</Tag>
                    <Tag color={event.outcome === 'success' ? 'success' : 'error'}>
                      {event.outcome === 'success' ? '成功' : '失败'}
                    </Tag>
                  </Space>
                ),
              },
              {
                title: '操作',
                width: 90,
                render: (_: unknown, event: AuditEvent) => (
                  <Button
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      setSelectedId(event.id);
                    }}
                  >
                    详情
                  </Button>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>

      <AuditDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </PageContainer>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <Typography.Paragraph>
      <pre className="audit-json">{JSON.stringify(value, null, 2)}</pre>
    </Typography.Paragraph>
  );
}

function AuditDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const event = useAuditEvent(id);
  return (
    <Drawer
      title="审计详情"
      rootClassName="audit-detail-drawer"
      size={720}
      open={Boolean(id)}
      onClose={onClose}
    >
      <AsyncState loading={event.isPending} error={event.error}>
        {event.data && (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { key: 'id', label: '事件 ID', children: event.data.id },
                {
                  key: 'time',
                  label: '发生时间',
                  children: new Date(event.data.occurredAt).toLocaleString('zh-CN'),
                },
                { key: 'action', label: '动作', children: event.data.action },
                {
                  key: 'actor',
                  label: 'Actor',
                  children: `${event.data.actorLabel ?? event.data.actorType} · ${event.data.actorId ?? '—'}`,
                },
                {
                  key: 'resource',
                  label: '资源',
                  children: `${event.data.resourceType} · ${event.data.resourceId ?? '—'}`,
                },
                { key: 'request', label: 'Request ID', children: event.data.requestId ?? '—' },
                {
                  key: 'correlation',
                  label: 'Correlation ID',
                  children: event.data.correlationId ?? '—',
                },
                {
                  key: 'network',
                  label: 'IP / User Agent',
                  children: `${event.data.ipAddress ?? '—'} / ${event.data.userAgent ?? '—'}`,
                },
                {
                  key: 'version',
                  label: '事件 / 脱敏版本',
                  children: `${event.data.eventVersion} / ${event.data.redactionVersion}`,
                },
              ]}
            />
            <div>
              <Typography.Title level={5}>变更摘要</Typography.Title>
              <JsonBlock value={event.data.changes} />
            </div>
            <div>
              <Typography.Title level={5}>补充信息</Typography.Title>
              <JsonBlock value={event.data.metadata} />
            </div>
          </Space>
        )}
      </AsyncState>
    </Drawer>
  );
}
