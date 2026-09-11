import { RedoOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { LessonOrder, LessonOrderStatus } from '@lingcoo-edu-oms/contracts';
import { App, Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions, useOrganizationProfile } from '../organization/hooks';
import { useLessonOrders, useRetryLessonOrderGrant } from './hooks';

const STATUS: Record<LessonOrderStatus, { label: string; color: string }> = {
  pending_payment: { label: '待支付', color: 'gold' },
  paid_pending_grant: { label: '已支付·待发放', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
  grant_failed: { label: '发放失败', color: 'error' },
  refunding: { label: '退款处理中', color: 'processing' },
  refunded: { label: '已退款', color: 'default' },
};

function money(amountMinor: number) {
  return `¥${(amountMinor / 100).toFixed(2)}`;
}

function dateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';
}

export function OrdersPage() {
  const { message } = App.useApp();
  const canManage = useCan('education.orders.manage');
  const organization = useOrganizationProfile();
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LessonOrderStatus | undefined>();
  const [page, setPage] = useState(1);
  const orders = useLessonOrders(institutionId, {
    page,
    pageSize: 20,
    search: search || undefined,
    status,
  });
  const retry = useRetryLessonOrderGrant();

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0]) {
      setInstitutionId(institutions.data.items[0].id);
    }
  }, [institutionId, institutions.data]);

  const institutionOptions = useMemo(
    () =>
      (institutions.data?.items ?? []).map((institution) => ({
        label:
          organization.data?.operationMode === 'self_operated_only'
            ? institution.name
            : `${institution.name} · ${institution.type === 'self_operated' ? '自营' : '合作'}`,
        value: institution.id,
      })),
    [institutions.data, organization.data?.operationMode],
  );

  return (
    <PageContainer
      title="订单与收款"
      description="查看小程序购课订单、支付结果与课时到账状态；支付成功不等于发放成功，两类事实分别留痕。"
    >
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择机构"
            loading={institutions.isPending}
            value={institutionId}
            options={institutionOptions}
            style={{ minWidth: 280 }}
            onChange={(value) => {
              setInstitutionId(value);
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="订单号、学员、家长或课时包"
            style={{ width: 280 }}
            onSearch={(value) => {
              setSearch(value.trim());
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="订单状态"
            value={status}
            style={{ width: 170 }}
            options={Object.entries(STATUS).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={orders.isFetching}
            onClick={() => void orders.refetch()}
          >
            刷新
          </Button>
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={orders.isPending}
          error={orders.error}
          empty={orders.data?.items.length === 0}
        >
          <Table<LessonOrder>
            rowKey="id"
            dataSource={orders.data?.items ?? []}
            scroll={{ x: 1_180 }}
            pagination={{
              current: orders.data?.page ?? page,
              pageSize: orders.data?.pageSize ?? 20,
              total: orders.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              {
                title: '订单',
                dataIndex: 'orderNo',
                width: 240,
                render: (value, record) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text copyable strong>
                      {value}
                    </Typography.Text>
                    <Typography.Text type="secondary">{dateTime(record.createdAt)}</Typography.Text>
                  </Space>
                ),
              },
              {
                title: '学员 / 家长',
                width: 180,
                render: (_, record) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{record.studentName}</Typography.Text>
                    <Typography.Text type="secondary">{record.guardianName}</Typography.Text>
                  </Space>
                ),
              },
              {
                title: '课时商品',
                width: 220,
                render: (_, record) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text>{record.packageName}</Typography.Text>
                    <Typography.Text type="secondary">
                      {record.baseUnits} + 赠 {record.bonusUnits} · V{record.packageVersion}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '实收',
                dataIndex: 'amountMinor',
                width: 110,
                render: money,
              },
              {
                title: '支付方式',
                dataIndex: 'provider',
                width: 110,
                render: (value) => (value === 'wechat_pay' ? '微信支付' : '模拟支付'),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 170,
                render: (value: LessonOrderStatus, record) => (
                  <Space direction="vertical" size={0}>
                    <Tag color={STATUS[value].color}>{STATUS[value].label}</Tag>
                    {record.failureMessage ? (
                      <Typography.Text type="danger" style={{ fontSize: 12 }}>
                        {record.failureMessage}
                      </Typography.Text>
                    ) : null}
                  </Space>
                ),
              },
              {
                title: '支付时间',
                dataIndex: 'paidAt',
                width: 160,
                render: dateTime,
              },
              {
                title: '操作',
                fixed: 'right',
                width: 110,
                render: (_, record) =>
                  canManage && record.status === 'grant_failed' ? (
                    <Button
                      type="link"
                      icon={<RedoOutlined />}
                      loading={retry.isPending && retry.variables?.orderId === record.id}
                      onClick={async () => {
                        if (!institutionId) return;
                        try {
                          await retry.mutateAsync({ institutionId, orderId: record.id });
                          message.success('课时发放已完成');
                        } catch (error) {
                          message.error(error instanceof Error ? error.message : '重试失败');
                        }
                      }}
                    >
                      重试发放
                    </Button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </AsyncState>
      </Card>
    </PageContainer>
  );
}
