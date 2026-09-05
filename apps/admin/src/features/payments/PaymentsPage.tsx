import { EyeOutlined, PlusOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import type {
  PaymentCallback,
  PaymentIntentStatus,
  PaymentIntentSummary,
  PaymentRefund,
  PaymentTransaction,
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
  InputNumber,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import {
  useClosePaymentIntent,
  useCreatePaymentIntent,
  useCreatePaymentRefund,
  usePaymentCallbacks,
  usePaymentIntent,
  usePaymentIntents,
  usePaymentRefunds,
  usePaymentTransactions,
  useReconcilePaymentIntent,
} from './hooks';

const statusLabels: Record<PaymentIntentStatus, string> = {
  created: '已创建',
  pending: '待支付',
  succeeded: '支付成功',
  failed: '失败',
  closed: '已关闭',
  partially_refunded: '部分退款',
  refunded: '已退款',
  unknown: '待对账',
};
const terminalColors: Record<string, string> = {
  succeeded: 'success',
  refunded: 'purple',
  partially_refunded: 'cyan',
  failed: 'error',
  closed: 'default',
  unknown: 'warning',
  pending: 'processing',
  created: 'default',
};

function Status({ value }: { value: string }) {
  return (
    <Tag color={terminalColors[value] ?? 'default'}>
      {statusLabels[value as PaymentIntentStatus] ?? value}
    </Tag>
  );
}
function time(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}
function money(value: number, currency: string) {
  return `${(value / 100).toFixed(2)} ${currency}`;
}

export function PaymentsPage() {
  const canManage = useCan('payments.manage');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const intents = usePaymentIntents({ page: 1, pageSize: 50 });
  const transactions = usePaymentTransactions({ page: 1, pageSize: 50 });
  const refunds = usePaymentRefunds({ page: 1, pageSize: 50 });
  const callbacks = usePaymentCallbacks({ page: 1, pageSize: 50 });

  return (
    <PageContainer
      title="支付与对账"
      description="管理支付意图、Provider 交易、验签回调和退款事实；业务订单通过 Payment Fact Port 接收结果。"
    >
      <Alert
        type="info"
        showIcon
        title="Starter 当前只启用 Mock Provider"
        description="请先在系统设置中配置 Mock 回调签名密钥。支付宝和微信支付通过 Provider Adapter 在具体项目中接入。"
        style={{ marginBottom: 16 }}
      />
      <Card>
        <Tabs
          tabBarExtraContent={
            canManage ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建支付
              </Button>
            ) : null
          }
          items={[
            {
              key: 'intents',
              label: '支付意图',
              children: <IntentTable result={intents} onOpen={setSelectedId} />,
            },
            {
              key: 'transactions',
              label: 'Provider 交易',
              children: <TransactionTable result={transactions} />,
            },
            { key: 'callbacks', label: '回调事实', children: <CallbackTable result={callbacks} /> },
            { key: 'refunds', label: '退款', children: <RefundTable result={refunds} /> },
          ]}
        />
      </Card>
      <CreateIntentModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <IntentDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </PageContainer>
  );
}

function IntentTable({
  result,
  onOpen,
}: {
  result: ReturnType<typeof usePaymentIntents>;
  onOpen(id: string): void;
}) {
  return (
    <AsyncState loading={result.isPending} error={result.error} empty={!result.data?.items.length}>
      <Table<PaymentIntentSummary>
        rowKey="id"
        dataSource={result.data?.items ?? []}
        scroll={{ x: 900 }}
        pagination={false}
        columns={[
          { title: '业务引用', dataIndex: 'merchantReference' },
          { title: '金额', render: (_, item) => money(item.amountMinor, item.currency) },
          { title: '状态', dataIndex: 'status', render: (value) => <Status value={value} /> },
          { title: 'Provider', dataIndex: 'provider', width: 100 },
          { title: '更新时间', dataIndex: 'updatedAt', render: time, width: 190 },
          {
            title: '操作',
            width: 90,
            render: (_, item) => (
              <Button type="link" icon={<EyeOutlined />} onClick={() => onOpen(item.id)}>
                详情
              </Button>
            ),
          },
        ]}
      />
    </AsyncState>
  );
}

function TransactionTable({ result }: { result: ReturnType<typeof usePaymentTransactions> }) {
  return (
    <AsyncState loading={result.isPending} error={result.error} empty={!result.data?.items.length}>
      <Table<PaymentTransaction>
        rowKey="id"
        dataSource={result.data?.items ?? []}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          { title: 'Provider Transaction ID', dataIndex: 'providerTransactionId' },
          { title: '金额', render: (_, item) => money(item.amountMinor, item.currency) },
          { title: '状态', dataIndex: 'status', render: (value) => <Status value={value} /> },
          { title: '最后查询', dataIndex: 'lastQueriedAt', render: time },
        ]}
      />
    </AsyncState>
  );
}

function CallbackTable({ result }: { result: ReturnType<typeof usePaymentCallbacks> }) {
  return (
    <AsyncState loading={result.isPending} error={result.error} empty={!result.data?.items.length}>
      <Table<PaymentCallback>
        rowKey="id"
        dataSource={result.data?.items ?? []}
        pagination={false}
        scroll={{ x: 1000 }}
        columns={[
          { title: 'Provider Event ID', dataIndex: 'providerEventId' },
          { title: '事件', dataIndex: 'eventType' },
          { title: '交易 ID', dataIndex: 'providerTransactionId' },
          { title: '金额', render: (_, item) => money(item.amountMinor, item.currency) },
          { title: '接收时间', dataIndex: 'receivedAt', render: time },
        ]}
      />
    </AsyncState>
  );
}

function RefundTable({ result }: { result: ReturnType<typeof usePaymentRefunds> }) {
  return (
    <AsyncState loading={result.isPending} error={result.error} empty={!result.data?.items.length}>
      <Table<PaymentRefund>
        rowKey="id"
        dataSource={result.data?.items ?? []}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          { title: '请求键', dataIndex: 'requestKey' },
          {
            title: 'Provider Refund ID',
            dataIndex: 'providerRefundId',
            render: (value) => value ?? '—',
          },
          {
            title: '金额（最小货币单位）',
            dataIndex: 'amountMinor',
            render: (value: number) => value.toLocaleString('zh-CN'),
          },
          { title: '状态', dataIndex: 'status', render: (value) => <Status value={value} /> },
          { title: '创建时间', dataIndex: 'createdAt', render: time },
        ]}
      />
    </AsyncState>
  );
}

function CreateIntentModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const mutation = useCreatePaymentIntent();
  return (
    <Modal
      title="新建支付意图"
      open={open}
      onCancel={onClose}
      confirmLoading={mutation.isPending}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ provider: 'mock', currency: 'CNY' }}
        onFinish={async (values) => {
          try {
            await mutation.mutateAsync(values);
            void message.success('支付意图已创建');
            form.resetFields();
            onClose();
          } catch (error) {
            void message.error(error instanceof Error ? error.message : '创建失败');
          }
        }}
      >
        <Form.Item name="merchantReference" label="业务引用" rules={[{ required: true }]}>
          <Input placeholder="order-20260902-001" />
        </Form.Item>
        <Form.Item name="description" label="描述" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="amountMinor" label="金额（分）" rules={[{ required: true }]}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="currency" label="币种">
          <Input disabled />
        </Form.Item>
        <Form.Item name="provider" hidden>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function IntentDrawer({ id, onClose }: { id: string | null; onClose(): void }) {
  const canManage = useCan('payments.manage');
  const { message, modal } = App.useApp();
  const result = usePaymentIntent(id);
  const close = useClosePaymentIntent();
  const reconcile = useReconcilePaymentIntent();
  const refund = useCreatePaymentRefund();
  const [refundOpen, setRefundOpen] = useState(false);
  const [form] = Form.useForm();
  const intent = result.data;
  const action = (kind: 'close' | 'reconcile') => {
    if (!intent) return;
    modal.confirm({
      title: kind === 'close' ? '确认关闭支付？' : '立即向 Provider 查询并对账？',
      okText: kind === 'close' ? '确认关闭' : '确认对账',
      okButtonProps: { danger: kind === 'close' },
      async onOk() {
        await (kind === 'close' ? close : reconcile).mutateAsync(intent.id);
        void message.success(kind === 'close' ? '支付已关闭' : '对账完成');
      },
    });
  };
  return (
    <>
      <Drawer
        title="支付详情"
        size={760}
        open={Boolean(id)}
        onClose={onClose}
        extra={
          canManage && intent ? (
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => action('reconcile')}>
                对账
              </Button>
              {['created', 'pending', 'unknown'].includes(intent.status) && (
                <Button danger icon={<StopOutlined />} onClick={() => action('close')}>
                  关闭
                </Button>
              )}
              {['succeeded', 'partially_refunded'].includes(intent.status) && (
                <Button onClick={() => setRefundOpen(true)}>退款</Button>
              )}
            </Space>
          ) : null
        }
      >
        <AsyncState loading={result.isPending} error={result.error}>
          {intent && (
            <Space orientation="vertical" size="large" style={{ width: '100%' }}>
              <Descriptions
                bordered
                column={1}
                items={[
                  { key: 'reference', label: '业务引用', children: intent.merchantReference },
                  { key: 'status', label: '状态', children: <Status value={intent.status} /> },
                  {
                    key: 'amount',
                    label: '金额 / 已退款',
                    children: `${money(intent.amountMinor, intent.currency)} / ${money(intent.refundedAmountMinor, intent.currency)}`,
                  },
                  { key: 'description', label: '描述', children: intent.description },
                  { key: 'created', label: '创建时间', children: time(intent.createdAt) },
                ]}
              />
              <div>
                <Typography.Title level={5}>Provider 交易</Typography.Title>
                <TransactionTable
                  result={
                    {
                      ...result,
                      data: {
                        items: intent.transactions,
                        page: 1,
                        pageSize: intent.transactions.length || 1,
                        total: intent.transactions.length,
                      },
                    } as ReturnType<typeof usePaymentTransactions>
                  }
                />
              </div>
            </Space>
          )}
        </AsyncState>
      </Drawer>
      <Modal
        title="创建退款"
        open={refundOpen}
        onCancel={() => setRefundOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={refund.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            if (!intent) return;
            try {
              await refund.mutateAsync({ id: intent.id, request: values });
              void message.success('退款请求已处理');
              form.resetFields();
              setRefundOpen(false);
            } catch (error) {
              void message.error(error instanceof Error ? error.message : '退款失败');
            }
          }}
        >
          <Form.Item name="requestKey" label="退款请求键" rules={[{ required: true, min: 8 }]}>
            <Input placeholder="refund-order-001" />
          </Form.Item>
          <Form.Item name="amountMinor" label="退款金额（分）" rules={[{ required: true }]}>
            <InputNumber
              min={1}
              max={intent ? intent.amountMinor - intent.refundedAmountMinor : undefined}
              precision={0}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="reason" label="退款原因" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
