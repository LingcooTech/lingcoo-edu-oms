import { EyeOutlined, FilterOutlined, SearchOutlined } from '@ant-design/icons';
import type {
  MailDeliveryQuery,
  MailDeliveryStatus,
  MailDeliverySummary,
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
import { useMailDeliveries, useMailDelivery } from './hooks';

const statusView: Record<MailDeliveryStatus, { label: string; color: string }> = {
  queued: { label: '排队中', color: 'default' },
  sending: { label: '发送中', color: 'processing' },
  sent: { label: '已发送', color: 'success' },
  exhausted: { label: '已耗尽', color: 'error' },
};
const time = (value: string | null) => (value ? new Date(value).toLocaleString('zh-CN') : '—');

export function MailDeliveries() {
  const [form] = Form.useForm();
  const [query, setQuery] = useState<Partial<MailDeliveryQuery>>({ page: 1, pageSize: 20 });
  const [selected, setSelected] = useState<string | null>(null);
  const result = useMailDeliveries(query);
  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={(values) => setQuery({ ...values, page: 1, pageSize: 20 })}
        >
          <Form.Item name="search">
            <Input allowClear prefix={<SearchOutlined />} placeholder="模板、脱敏收件人或错误码" />
          </Form.Item>
          <Form.Item name="status">
            <Select
              allowClear
              style={{ width: 140 }}
              placeholder="状态"
              options={Object.entries(statusView).map(([value, item]) => ({
                value,
                label: item.label,
              }))}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<FilterOutlined />}>
            筛选
          </Button>
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
            scroll={{ x: 900 }}
            dataSource={result.data?.items ?? []}
            pagination={{
              current: result.data?.page,
              pageSize: result.data?.pageSize,
              total: result.data?.total,
              showSizeChanger: true,
              onChange: (page, pageSize) => setQuery((current) => ({ ...current, page, pageSize })),
            }}
            columns={[
              { title: '创建时间', dataIndex: 'createdAt', width: 190, render: time },
              { title: '模板', dataIndex: 'templateKey' },
              { title: '收件人', dataIndex: 'recipientPreview', width: 200 },
              {
                title: '状态',
                dataIndex: 'status',
                width: 110,
                render: (status: MailDeliveryStatus) => (
                  <Tag color={statusView[status].color}>{statusView[status].label}</Tag>
                ),
              },
              { title: '尝试', dataIndex: 'attemptCount', width: 80 },
              {
                title: '操作',
                width: 90,
                render: (_: unknown, item: MailDeliverySummary) => (
                  <Button type="link" icon={<EyeOutlined />} onClick={() => setSelected(item.id)}>
                    详情
                  </Button>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <DeliveryDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function DeliveryDrawer({ id, onClose }: { id: string | null; onClose(): void }) {
  const result = useMailDelivery(id);
  const item = result.data;
  return (
    <Drawer
      title="邮件投递详情"
      size={720}
      open={Boolean(id)}
      onClose={onClose}
      className="mail-delivery-detail-drawer"
    >
      <AsyncState loading={result.isPending} error={result.error}>
        {item && (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              安全边界：此处不会返回完整收件地址、正文、模板变量、Token 或 Provider 原始响应。
            </Typography.Text>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                {
                  key: 'status',
                  label: '状态',
                  children: (
                    <Tag color={statusView[item.status].color}>{statusView[item.status].label}</Tag>
                  ),
                },
                {
                  key: 'template',
                  label: '模板 / 版本',
                  children: `${item.templateKey} / ${item.templateVersion}.${item.templateRevision ?? 0}`,
                },
                { key: 'recipient', label: '收件人', children: item.recipientPreview },
                { key: 'transport', label: '投递方式', children: item.transport ?? '—' },
                { key: 'attempts', label: '尝试次数', children: item.attemptCount },
                { key: 'job', label: 'Job ID', children: item.jobId ?? '—' },
                {
                  key: 'hash',
                  label: '内容哈希',
                  children: <Typography.Text copyable>{item.contentHash}</Typography.Text>,
                },
                { key: 'sent', label: '发送时间', children: time(item.sentAt) },
                {
                  key: 'error',
                  label: '安全错误摘要',
                  children: item.lastError
                    ? `${item.lastError.code}：${item.lastError.message}`
                    : '—',
                },
              ]}
            />
          </Space>
        )}
      </AsyncState>
    </Drawer>
  );
}
