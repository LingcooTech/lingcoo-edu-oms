import {
  CloseCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  RedoOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { JobAttempt, JobQuery, JobStatus, JobSummary } from '@lingcoo-edu-oms/contracts';
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
import { useCancelJob, useJob, useJobs, useRetryJob } from './hooks';

interface FilterValues {
  search?: string;
  status?: JobStatus;
  type?: string;
  queue?: string;
  from?: string;
  to?: string;
}

const statuses: Record<JobStatus, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  succeeded: { label: '已成功', color: 'success' },
  dead: { label: '死信', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' },
};

function StatusTag({ status }: { status: JobStatus }) {
  const item = statuses[status];
  return <Tag color={item.color}>{item.label}</Tag>;
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

function toIso(value?: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export function JobsPage() {
  const [form] = Form.useForm<FilterValues>();
  const [query, setQuery] = useState<Partial<JobQuery>>({ page: 1, pageSize: 20 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const result = useJobs(query);

  return (
    <PageContainer
      title="后台任务"
      description="查看异步任务、重试退避、租约恢复与死信状态；业务数据仍由对应业务模块负责。"
    >
      <Alert
        type="info"
        showIcon
        title="诊断接口不会返回 Payload、Worker ID 或 Claim Token"
        description="页面只展示 Payload 哈希、版本、大小和安全错误摘要。手动重试仅增加一次尝试预算，不会修改历史执行事实。"
        style={{ marginBottom: 16 }}
      />
      <Card style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            setQuery({
              ...Object.fromEntries(
                Object.entries(values).filter(([, value]) => value !== undefined && value !== ''),
              ),
              from: toIso(values.from),
              to: toIso(values.to),
              page: 1,
              pageSize: 20,
            })
          }
        >
          <div className="jobs-filter-grid">
            <Form.Item label="搜索" name="search">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="类型、队列、Key 预览或错误码"
              />
            </Form.Item>
            <Form.Item label="状态" name="status">
              <Select
                allowClear
                options={Object.entries(statuses).map(([value, item]) => ({
                  value,
                  label: item.label,
                }))}
              />
            </Form.Item>
            <Form.Item label="Job 类型" name="type">
              <Input allowClear placeholder="notifications.email-send" />
            </Form.Item>
            <Form.Item label="队列" name="queue">
              <Input allowClear placeholder="default" />
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
            scroll={{ x: 1_100 }}
            dataSource={result.data?.items ?? []}
            pagination={{
              current: result.data?.page ?? query.page,
              pageSize: result.data?.pageSize ?? query.pageSize,
              total: result.data?.total ?? 0,
              showSizeChanger: true,
              onChange: (page, pageSize) => setQuery((current) => ({ ...current, page, pageSize })),
            }}
            columns={[
              {
                title: '创建时间',
                dataIndex: 'createdAt',
                width: 190,
                render: formatTime,
              },
              {
                title: '类型 / 队列',
                render: (_: unknown, job: JobSummary) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text strong>{job.type}</Typography.Text>
                    <Typography.Text type="secondary">{job.queue}</Typography.Text>
                  </Space>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 110,
                render: (status: JobStatus) => <StatusTag status={status} />,
              },
              {
                title: '尝试 / 最大 / 恢复',
                width: 160,
                render: (_: unknown, job: JobSummary) =>
                  `${job.attemptCount} / ${job.maxAttempts} / ${job.recoveryCount}`,
              },
              { title: '计划执行', dataIndex: 'runAt', width: 190, render: formatTime },
              {
                title: '操作',
                width: 90,
                fixed: 'right',
                render: (_: unknown, job: JobSummary) => (
                  <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedId(job.id)}>
                    详情
                  </Button>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <JobDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </PageContainer>
  );
}

function JobDrawer({ id, onClose }: { id: string | null; onClose(): void }) {
  const { message, modal } = App.useApp();
  const canManage = useCan('jobs.manage');
  const result = useJob(id);
  const retry = useRetryJob();
  const cancel = useCancelJob();
  const job = result.data;

  const confirmAction = (action: 'retry' | 'cancel') => {
    if (!job) return;
    const isRetry = action === 'retry';
    modal.confirm({
      title: isRetry ? '确认重试这个 Job？' : '确认取消这个 Job？',
      content: isRetry
        ? '系统将保留历史尝试，并额外增加一次最大尝试预算。'
        : '运行中的 Handler 会通过 Claim Token fencing 失去写回权限。',
      okText: isRetry ? '确认重试' : '确认取消',
      okButtonProps: { danger: !isRetry },
      async onOk() {
        try {
          await (isRetry ? retry : cancel).mutateAsync(job.id);
          void message.success(isRetry ? 'Job 已重新入队' : 'Job 已取消');
        } catch (error) {
          void message.error(error instanceof Error ? error.message : '操作失败');
          throw error;
        }
      },
    });
  };

  return (
    <Drawer
      title="Job 详情"
      aria-label="Job 详情"
      className="job-detail-drawer"
      size={760}
      open={Boolean(id)}
      onClose={onClose}
      extra={
        canManage && job ? (
          <Space>
            {job.canRetry && (
              <Button icon={<RedoOutlined />} onClick={() => confirmAction('retry')}>
                重试
              </Button>
            )}
            {job.canCancel && (
              <Button danger icon={<CloseCircleOutlined />} onClick={() => confirmAction('cancel')}>
                取消
              </Button>
            )}
          </Space>
        ) : null
      }
    >
      <AsyncState loading={result.isPending} error={result.error}>
        {job && (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { key: 'status', label: '状态', children: <StatusTag status={job.status} /> },
                { key: 'type', label: '类型', children: job.type },
                { key: 'queue', label: '队列', children: job.queue },
                {
                  key: 'attempts',
                  label: '尝试 / 最大 / 恢复 / 手动',
                  children: `${job.attemptCount} / ${job.maxAttempts} / ${job.recoveryCount} / ${job.manualRetryCount}`,
                },
                {
                  key: 'dedupe',
                  label: '去重 Key 预览',
                  children: job.deduplicationPreview ?? '—',
                },
                { key: 'lease', label: '租约到期', children: formatTime(job.leaseExpiresAt) },
                { key: 'runAt', label: '计划执行', children: formatTime(job.runAt) },
                { key: 'completed', label: '完成时间', children: formatTime(job.completedAt) },
                {
                  key: 'payload',
                  label: `Payload v${job.payloadVersion}`,
                  children: `${job.payloadSizeBytes} bytes`,
                },
                {
                  key: 'hash',
                  label: 'Payload Hash',
                  children: (
                    <Typography.Text code copyable>
                      {job.payloadHash}
                    </Typography.Text>
                  ),
                },
                {
                  key: 'error',
                  label: '最近错误',
                  children: job.lastError
                    ? `${job.lastError.code} · ${job.lastError.message}`
                    : '—',
                },
              ]}
            />
            <div>
              <Typography.Title level={5}>执行尝试</Typography.Title>
              <Table<JobAttempt>
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 680 }}
                dataSource={job.attempts}
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
