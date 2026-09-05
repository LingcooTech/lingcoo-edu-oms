import { EyeOutlined, FilterOutlined, SearchOutlined } from '@ant-design/icons';
import type {
  IdempotencyQuery,
  IdempotencyRecordSummary,
  IdempotencyStatus,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
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
import { useIdempotencyRecord, useIdempotencyRecords } from './hooks';

interface FilterValues {
  search?: string;
  status?: IdempotencyStatus;
  operation?: string;
  scope?: string;
  from?: string;
  to?: string;
}

const statusPresentation: Record<IdempotencyStatus, { label: string; color: string }> = {
  processing: { label: '处理中', color: 'processing' },
  succeeded: { label: '已成功', color: 'success' },
  failed: { label: '已失败', color: 'error' },
  stale: { label: '租约超时', color: 'warning' },
};

function toIso(value?: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function StatusTag({ status }: { status: IdempotencyStatus }) {
  const presentation = statusPresentation[status];
  return <Tag color={presentation.color}>{presentation.label}</Tag>;
}

export function IdempotencyPage() {
  const [form] = Form.useForm<FilterValues>();
  const [query, setQuery] = useState<Partial<IdempotencyQuery>>({ page: 1, pageSize: 20 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const records = useIdempotencyRecords(query);

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
      title="幂等诊断"
      description="只读查看请求幂等执行、重放、失败和租约恢复状态。业务事实仍由对应业务模块拥有。"
    >
      <Alert
        type="info"
        showIcon
        title="诊断页不提供强制成功、删除或重新执行操作"
        description="系统不保存原始幂等键和请求体，成功结果快照仅供服务端重放，不会通过诊断 API 返回。"
        style={{ marginBottom: 16 }}
      />
      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" onFinish={applyFilters}>
          <div className="idempotency-filter-grid">
            <Form.Item label="搜索" name="search">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Key 预览、操作、Scope 或错误码"
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
            <Form.Item label="操作" name="operation">
              <Input allowClear placeholder="orders.create" />
            </Form.Item>
            <Form.Item label="Scope" name="scope">
              <Input allowClear placeholder="account:uuid" />
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
          loading={records.isPending}
          error={records.error}
          empty={records.data?.items.length === 0}
        >
          <Table
            rowKey="id"
            scroll={{ x: 1_000 }}
            dataSource={records.data?.items ?? []}
            pagination={{
              current: records.data?.page ?? query.page,
              pageSize: records.data?.pageSize ?? query.pageSize,
              total: records.data?.total ?? 0,
              showSizeChanger: true,
              onChange: (page, pageSize) => setQuery((current) => ({ ...current, page, pageSize })),
            }}
            columns={[
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                width: 190,
                render: (value: string) => new Date(value).toLocaleString('zh-CN'),
              },
              {
                title: '操作 / Scope',
                render: (_: unknown, record: IdempotencyRecordSummary) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text strong>{record.operation}</Typography.Text>
                    <Typography.Text type="secondary">{record.scope}</Typography.Text>
                  </Space>
                ),
              },
              { title: 'Key 预览', dataIndex: 'keyPreview', width: 170 },
              {
                title: '状态',
                dataIndex: 'status',
                width: 110,
                render: (status: IdempotencyStatus) => <StatusTag status={status} />,
              },
              {
                title: '尝试 / 恢复',
                width: 130,
                render: (_: unknown, record: IdempotencyRecordSummary) =>
                  `${record.attemptCount}/${record.maxAttempts} · ${record.recoveryCount}`,
              },
              {
                title: '操作',
                width: 90,
                fixed: 'right',
                render: (_: unknown, record: IdempotencyRecordSummary) => (
                  <Button
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => setSelectedId(record.id)}
                  >
                    详情
                  </Button>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <IdempotencyDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </PageContainer>
  );
}

function IdempotencyDrawer({ id, onClose }: { id: string | null; onClose(): void }) {
  const record = useIdempotencyRecord(id);
  return (
    <Drawer
      title="幂等记录详情"
      aria-label="幂等记录详情"
      className="idempotency-detail-drawer"
      size={720}
      open={Boolean(id)}
      onClose={onClose}
    >
      <AsyncState loading={record.isPending} error={record.error}>
        {record.data && (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                {
                  key: 'status',
                  label: '状态',
                  children: <StatusTag status={record.data.status} />,
                },
                { key: 'operation', label: '操作', children: record.data.operation },
                { key: 'scope', label: 'Scope', children: record.data.scope },
                { key: 'key', label: 'Key 预览', children: record.data.keyPreview },
                {
                  key: 'attempts',
                  label: '尝试 / 最大 / 恢复',
                  children: `${record.data.attemptCount} / ${record.data.maxAttempts} / ${record.data.recoveryCount}`,
                },
                { key: 'actor', label: '最近执行账号', children: record.data.actorId ?? '系统' },
                { key: 'locked', label: '租约到期', children: formatTime(record.data.lockedUntil) },
                { key: 'created', label: '创建时间', children: formatTime(record.data.createdAt) },
                { key: 'updated', label: '更新时间', children: formatTime(record.data.updatedAt) },
                {
                  key: 'completed',
                  label: '完成时间',
                  children: formatTime(record.data.completedAt),
                },
                { key: 'expires', label: '记录过期', children: formatTime(record.data.expiresAt) },
              ]}
            />
            <div>
              <Typography.Title level={5}>安全诊断摘要</Typography.Title>
              <Descriptions
                bordered
                size="small"
                column={1}
                items={[
                  {
                    key: 'hash',
                    label: `Request Hash v${record.data.requestHashVersion}`,
                    children: (
                      <Typography.Text code copyable>
                        {record.data.requestHash}
                      </Typography.Text>
                    ),
                  },
                  {
                    key: 'result',
                    label: '结果快照',
                    children: record.data.resultStored
                      ? `已安全保存（${record.data.resultSizeBytes ?? 0} bytes），不通过诊断 API 展示`
                      : '未保存',
                  },
                ]}
              />
            </div>
            {record.data.lastError && (
              <Alert
                type={record.data.lastError.retryable ? 'warning' : 'error'}
                showIcon
                title={record.data.lastError.code}
                description={`${record.data.lastError.message}（HTTP ${record.data.lastError.statusCode}）`}
              />
            )}
          </Space>
        )}
      </AsyncState>
    </Drawer>
  );
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}
