import {
  PlusOutlined,
  PrinterOutlined,
  RedoOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type {
  CreateOfflineLessonOrderRequest,
  LessonOrder,
  LessonOrderPaymentMethod,
  LessonOrderProductType,
  LessonOrderStatus,
  LessonReceipt,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useLessonPackages } from '../lessons/hooks';
import { useInstitutions, useOrganizationProfile } from '../organization/hooks';
import { useGuardianBindings, useStudents } from '../people/hooks';
import type { PeriodCardProduct } from '../period-cards/api';
import { usePeriodCardProducts } from '../period-cards/hooks';
import {
  useCreateOfflineLessonOrder,
  useLessonOrders,
  useLessonReceipt,
  useRetryLessonOrderGrant,
} from './hooks';

const STATUS: Record<LessonOrderStatus, { label: string; color: string }> = {
  pending_payment: { label: '待支付', color: 'gold' },
  paid_pending_grant: { label: '已支付·待发放', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
  grant_failed: { label: '发放失败', color: 'error' },
  refunding: { label: '退款处理中', color: 'processing' },
  refunded: { label: '已退款', color: 'default' },
};

const PAYMENT_METHOD: Record<LessonOrderPaymentMethod, string> = {
  wechat_pay: '微信支付',
  mock: '模拟支付',
  cash: '现金',
  bank_transfer: '银行转账',
  wechat_transfer: '微信转账',
  other: '其他线下方式',
};

const PRODUCT_TYPE: Record<LessonOrderProductType, string> = {
  lesson_package: '课时包',
  period_card: '周期卡',
};

const PERIOD_UNIT: Record<PeriodCardProduct['durationUnit'], string> = {
  day: '天',
  week: '周',
  month: '月',
};

const ACTIVATION_POLICY: Record<PeriodCardProduct['activationPolicy'], string> = {
  immediate: '立即生效',
  on_first_use: '首次使用激活',
};

type OfflineOrderForm = {
  studentKind: 'existing' | 'new';
  studentId?: string;
  guardianId?: string;
  studentName?: string;
  grade?: string;
  school?: string;
  guardianName?: string;
  guardianPhone?: string;
  relationship?: string;
  productType: LessonOrderProductType;
  packageId?: string;
  periodCardProductId?: string;
  paidAmountYuan: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
  receivedAt: string;
  paymentReference?: string;
  paymentNote?: string;
  priceAdjustmentReason?: string;
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

function localDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function nullable(value?: string) {
  const result = value?.trim();
  return result || null;
}

export function OrdersPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<OfflineOrderForm>();
  const canManage = useCan('education.orders.manage');
  const organization = useOrganizationProfile();
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [productType, setProductType] = useState<LessonOrderProductType | undefined>();
  const [status, setStatus] = useState<LessonOrderStatus | undefined>();
  const [page, setPage] = useState(1);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [offlineIdempotencyKey, setOfflineIdempotencyKey] = useState(() => crypto.randomUUID());
  const [receipt, setReceipt] = useState<LessonReceipt | null>(null);
  const studentKind = Form.useWatch('studentKind', form) ?? 'existing';
  const selectedProductType = Form.useWatch('productType', form) ?? 'lesson_package';
  const selectedStudentId = Form.useWatch('studentId', form) ?? null;
  const orders = useLessonOrders(institutionId, {
    page,
    pageSize: 20,
    search: search || undefined,
    productType,
    status,
  });
  const students = useStudents(institutionId, { page: 1, pageSize: 500, status: 'active' });
  const guardians = useGuardianBindings(
    institutionId,
    selectedStudentId,
    offlineOpen && studentKind === 'existing',
  );
  const packages = useLessonPackages(institutionId, {
    page: 1,
    pageSize: 100,
    status: 'active',
  });
  const periodCards = usePeriodCardProducts(institutionId, {
    page: 1,
    pageSize: 100,
    status: 'active',
  });
  const retry = useRetryLessonOrderGrant();
  const createOffline = useCreateOfflineLessonOrder();
  const receiptRequest = useLessonReceipt();

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0]) {
      setInstitutionId(institutions.data.items[0].id);
    }
  }, [institutionId, institutions.data]);

  useEffect(() => {
    const primary = guardians.data?.items.find(
      (item) => item.status === 'active' && item.isPrimary,
    );
    const first = guardians.data?.items.find((item) => item.status === 'active');
    if (primary || first) form.setFieldValue('guardianId', (primary ?? first)!.guardian.id);
  }, [form, guardians.data]);

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

  const openOfflineOrder = () => {
    form.resetFields();
    setOfflineIdempotencyKey(crypto.randomUUID());
    form.setFieldsValue({
      studentKind: 'existing',
      productType: 'lesson_package',
      paymentMethod: 'wechat_transfer',
      receivedAt: localDateTimeValue(),
    });
    setOfflineOpen(true);
  };

  const submitOfflineOrder = async () => {
    if (!institutionId) return;
    try {
      const values = await form.validateFields();
      const student: CreateOfflineLessonOrderRequest['student'] =
        values.studentKind === 'existing'
          ? {
              kind: 'existing',
              studentId: values.studentId!,
              guardianId: values.guardianId!,
            }
          : {
              kind: 'new',
              profile: {
                fullName: values.studentName!,
                grade: nullable(values.grade),
                school: nullable(values.school),
              },
              guardian: {
                fullName: values.guardianName!,
                phone: values.guardianPhone!,
                relationship: values.relationship!,
                isPrimary: true,
              },
            };
      const payment = {
        paidAmountMinor: Math.round(values.paidAmountYuan * 100),
        paymentMethod: values.paymentMethod,
        receivedAt: new Date(values.receivedAt).toISOString(),
        paymentReference: nullable(values.paymentReference),
        paymentNote: nullable(values.paymentNote),
        priceAdjustmentReason: nullable(values.priceAdjustmentReason),
      };
      const command: CreateOfflineLessonOrderRequest =
        values.productType === 'lesson_package'
          ? {
              student,
              packageId: values.packageId!,
              ...payment,
            }
          : {
              student,
              productType: 'period_card',
              periodCardProductId: values.periodCardProductId!,
              ...payment,
            };
      const order = await createOffline.mutateAsync({
        institutionId,
        idempotencyKey: offlineIdempotencyKey,
        command,
      });
      setOfflineOpen(false);
      if (order.status === 'completed') {
        message.success(
          values.productType === 'lesson_package'
            ? '线下收款已补录，商品已完成，课时权益已到账'
            : '线下收款已补录，商品已完成，周期卡权益已到账',
        );
        setReceipt(await receiptRequest.mutateAsync({ institutionId, orderId: order.id }));
      } else {
        message.warning('收款已记录，但商品权益发放失败，请在订单列表中重试');
      }
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    }
  };

  const showReceipt = async (order: LessonOrder) => {
    if (!institutionId) return;
    try {
      setReceipt(await receiptRequest.mutateAsync({ institutionId, orderId: order.id }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '收据生成失败');
    }
  };

  return (
    <PageContainer
      title="订单与收款"
      description="线上和线下购买商品统一形成订单、收款事实、课时流水或周期卡权益与可打印收据。"
      actions={
        canManage ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!institutionId}
            onClick={openOfflineOrder}
          >
            补录线下收款
          </Button>
        ) : undefined
      }
    >
      <Alert
        showIcon
        type="info"
        message="线下收款必须从这里补录订单；课时包形成课时流水，周期卡形成独立权益，赠课、补课和余额纠错仍走独立课时流水。"
        style={{ marginBottom: 16 }}
      />
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
            placeholder="订单号、学员、家长或商品"
            style={{ width: 280 }}
            onSearch={(value) => {
              setSearch(value.trim());
              setPage(1);
            }}
          />
          <Select
            value={productType ?? 'all'}
            style={{ width: 150 }}
            options={[
              { value: 'all', label: '全部' },
              ...Object.entries(PRODUCT_TYPE).map(([value, label]) => ({ value, label })),
            ]}
            onChange={(value) => {
              setProductType(value === 'all' ? undefined : (value as LessonOrderProductType));
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="订单状态"
            value={status}
            style={{ width: 170 }}
            options={Object.entries(STATUS).map(([value, item]) => ({ value, label: item.label }))}
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
            scroll={{ x: 1_300 }}
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
                title: '渠道',
                dataIndex: 'channel',
                width: 90,
                render: (value) => (
                  <Tag color={value === 'online' ? 'blue' : 'cyan'}>
                    {value === 'online' ? '线上' : '线下'}
                  </Tag>
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
                title: '商品',
                width: 280,
                render: (_, record) =>
                  record.productType === 'lesson_package' ? (
                    <Space direction="vertical" size={0}>
                      <Space size={6}>
                        <Tag color="blue">课时包</Tag>
                        <Typography.Text>{record.packageName}</Typography.Text>
                      </Space>
                      <Typography.Text type="secondary">
                        {record.baseUnits} + 赠 {record.bonusUnits} 课时 · V{record.packageVersion}
                      </Typography.Text>
                    </Space>
                  ) : (
                    <Space direction="vertical" size={0}>
                      <Space size={6}>
                        <Tag color="purple">周期卡</Tag>
                        <Typography.Text>{record.periodCardProductName}</Typography.Text>
                      </Space>
                      <Typography.Text type="secondary">
                        {record.periodCardDurationCount}
                        {PERIOD_UNIT[record.periodCardDurationUnit]} ·{' '}
                        {record.periodCardMode === 'unlimited'
                          ? '不限次'
                          : `限 ${record.periodCardUsageLimit} 次`}{' '}
                        · {ACTIVATION_POLICY[record.periodCardActivationPolicy]} · V
                        {record.periodCardProductVersion}
                      </Typography.Text>
                    </Space>
                  ),
              },
              { title: '实收', dataIndex: 'amountMinor', width: 110, render: money },
              {
                title: '支付方式',
                dataIndex: 'paymentMethod',
                width: 120,
                render: (value: LessonOrderPaymentMethod) => PAYMENT_METHOD[value],
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
              { title: '支付时间', dataIndex: 'paidAt', width: 160, render: dateTime },
              {
                title: '操作',
                fixed: 'right',
                width: 170,
                render: (_, record) => (
                  <Space size={0}>
                    {['completed', 'refunding', 'refunded'].includes(record.status) ? (
                      <Button
                        type="link"
                        icon={<PrinterOutlined />}
                        loading={receiptRequest.isPending}
                        onClick={() => void showReceipt(record)}
                      >
                        收据
                      </Button>
                    ) : null}
                    {canManage && record.status === 'grant_failed' ? (
                      <Button
                        type="link"
                        icon={<RedoOutlined />}
                        loading={retry.isPending && retry.variables?.orderId === record.id}
                        onClick={async () => {
                          if (!institutionId) return;
                          try {
                            await retry.mutateAsync({ institutionId, orderId: record.id });
                            message.success(
                              record.productType === 'period_card'
                                ? '周期卡权益发放已完成'
                                : '课时权益发放已完成',
                            );
                          } catch (error) {
                            message.error(error instanceof Error ? error.message : '重试失败');
                          }
                        }}
                      >
                        重试发放
                      </Button>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>

      <OfflineOrderModal
        form={form}
        open={offlineOpen}
        studentKind={studentKind}
        students={students.data?.items ?? []}
        studentsLoading={students.isPending}
        guardians={guardians.data?.items ?? []}
        guardiansLoading={guardians.isPending}
        packages={packages.data?.items ?? []}
        packagesLoading={packages.isPending}
        periodCards={periodCards.data?.items ?? []}
        periodCardsLoading={periodCards.isPending}
        productType={selectedProductType}
        submitting={createOffline.isPending}
        onCancel={() => setOfflineOpen(false)}
        onSubmit={() => void submitOfflineOrder()}
      />

      <Modal
        title="订单收据"
        open={Boolean(receipt)}
        width={760}
        footer={[
          <Button key="close" onClick={() => setReceipt(null)}>
            关闭
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => window.print()}
          >
            打印收据
          </Button>,
        ]}
        onCancel={() => setReceipt(null)}
      >
        {receipt ? <ReceiptView receipt={receipt} /> : null}
      </Modal>
    </PageContainer>
  );
}

function OfflineOrderModal({
  form,
  open,
  studentKind,
  students,
  studentsLoading,
  guardians,
  guardiansLoading,
  packages,
  packagesLoading,
  periodCards,
  periodCardsLoading,
  productType,
  submitting,
  onCancel,
  onSubmit,
}: {
  form: ReturnType<typeof Form.useForm<OfflineOrderForm>>[0];
  open: boolean;
  studentKind: 'existing' | 'new';
  students: Array<{ id: string; fullName: string }>;
  studentsLoading: boolean;
  guardians: Array<{
    status: string;
    isPrimary: boolean;
    relationship: string;
    guardian: { id: string; fullName: string };
  }>;
  guardiansLoading: boolean;
  packages: Array<{
    id: string;
    name: string;
    baseUnits: number;
    bonusUnits: number;
    priceAmount: number;
  }>;
  packagesLoading: boolean;
  periodCards: PeriodCardProduct[];
  periodCardsLoading: boolean;
  productType: LessonOrderProductType;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title="补录线下收款并发放商品权益"
      open={open}
      width={760}
      okText="确认收款并发放"
      cancelText="取消"
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={onSubmit}
    >
      <Alert
        type="warning"
        showIcon
        message="请确认款项已经实际收到。提交后将创建正式订单，并自动发放课时或周期卡权益。"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item name="studentKind" label="学员方式">
          <Radio.Group
            optionType="button"
            options={[
              { label: '选择已有学员', value: 'existing' },
              { label: '直接新建学员', value: 'new' },
            ]}
          />
        </Form.Item>
        {studentKind === 'existing' ? (
          <div className="two-column-form-grid">
            <Form.Item
              name="studentId"
              label="学员"
              rules={[{ required: true, message: '请选择学员' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={studentsLoading}
                options={students.map((item) => ({ label: item.fullName, value: item.id }))}
                onChange={() => form.setFieldValue('guardianId', undefined)}
              />
            </Form.Item>
            <Form.Item
              name="guardianId"
              label="付款家长"
              rules={[{ required: true, message: '请选择已绑定家长' }]}
            >
              <Select
                loading={guardiansLoading}
                options={guardians
                  .filter((item) => item.status === 'active')
                  .map((item) => ({
                    label: `${item.guardian.fullName} · ${item.relationship}${item.isPrimary ? ' · 主要联系人' : ''}`,
                    value: item.guardian.id,
                  }))}
              />
            </Form.Item>
          </div>
        ) : (
          <div className="two-column-form-grid">
            <Form.Item name="studentName" label="学员姓名" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="grade" label="年级">
              <Input />
            </Form.Item>
            <Form.Item name="school" label="学校">
              <Input />
            </Form.Item>
            <Form.Item name="guardianName" label="家长姓名" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item
              name="guardianPhone"
              label="家长手机号"
              rules={[
                { required: true },
                { pattern: /^1\d{10}$/, message: '请输入正确的大陆手机号' },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="relationship"
              label="与学员关系"
              rules={[{ required: true }]}
              initialValue="家长"
            >
              <Input />
            </Form.Item>
          </div>
        )}
        <Divider />
        <Form.Item name="productType" label="商品类型" rules={[{ required: true }]}>
          <Radio.Group
            optionType="button"
            options={[
              { label: '课时包', value: 'lesson_package' },
              { label: '周期卡', value: 'period_card' },
            ]}
            onChange={() => {
              form.setFieldsValue({ packageId: undefined, periodCardProductId: undefined });
              form.setFieldValue('paidAmountYuan', undefined);
            }}
          />
        </Form.Item>
        <div className="two-column-form-grid">
          {productType === 'lesson_package' ? (
            <Form.Item name="packageId" label="课时包商品" rules={[{ required: true }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={packagesLoading}
                options={packages.map((item) => ({
                  label: `${item.name} · ${item.baseUnits + item.bonusUnits}课时 · ${money(item.priceAmount)}`,
                  value: item.id,
                }))}
                onChange={(value) => {
                  const selected = packages.find((item) => item.id === value);
                  if (selected) form.setFieldValue('paidAmountYuan', selected.priceAmount / 100);
                }}
              />
            </Form.Item>
          ) : (
            <Form.Item
              name="periodCardProductId"
              label="周期卡商品"
              rules={[{ required: true, message: '请选择周期卡商品' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={periodCardsLoading}
                options={periodCards.map((item) => ({
                  label: `${item.name} · ${item.durationCount}${PERIOD_UNIT[item.durationUnit]} · ${item.mode === 'unlimited' ? '不限次' : `限${item.usageLimit}次`} · ${ACTIVATION_POLICY[item.activationPolicy]} · ${money(item.priceAmount)}`,
                  value: item.id,
                }))}
                onChange={(value) => {
                  const selected = periodCards.find((item) => item.id === value);
                  if (selected) form.setFieldValue('paidAmountYuan', selected.priceAmount / 100);
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="paidAmountYuan" label="实收金额（元）" rules={[{ required: true }]}>
            <InputNumber min={0.01} precision={2} prefix="¥" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="paymentMethod" label="支付方式" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '现金', value: 'cash' },
                { label: '微信转账', value: 'wechat_transfer' },
                { label: '银行转账', value: 'bank_transfer' },
                { label: '其他线下方式', value: 'other' },
              ]}
            />
          </Form.Item>
          <Form.Item name="receivedAt" label="实际收款时间" rules={[{ required: true }]}>
            <Input type="datetime-local" />
          </Form.Item>
          <Form.Item name="paymentReference" label="收款凭证号">
            <Input placeholder="转账单号、流水号等" />
          </Form.Item>
          <Form.Item
            name="priceAdjustmentReason"
            label="调价原因"
            tooltip="实收金额与商品标价不一致时必填"
          >
            <Input placeholder="例如：老学员续费优惠" />
          </Form.Item>
        </div>
        <Form.Item name="paymentNote" label="收款备注">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ReceiptView({ receipt }: { receipt: LessonReceipt }) {
  const order = receipt.order;
  return (
    <article className="lesson-receipt-print-area">
      <header className="lesson-receipt-header">
        <div className="lesson-receipt-logo">
          {receipt.organization.logoUrl ? <img src={receipt.organization.logoUrl} alt="" /> : null}
        </div>
        <div>
          <Typography.Title level={2}>{receipt.title}</Typography.Title>
          <Typography.Text>{receipt.organization.brandName}</Typography.Text>
        </div>
        <strong className="lesson-receipt-mark">{receipt.settlementMark}</strong>
      </header>
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="收据号">{receipt.receiptNo}</Descriptions.Item>
        <Descriptions.Item label="订单号">{order.orderNo}</Descriptions.Item>
        <Descriptions.Item label="付款人">{order.guardianName}</Descriptions.Item>
        <Descriptions.Item label="学员">{order.studentName}</Descriptions.Item>
        <Descriptions.Item label="收款机构">{receipt.institution.name}</Descriptions.Item>
        <Descriptions.Item label="支付方式">
          {PAYMENT_METHOD[order.paymentMethod]}
        </Descriptions.Item>
        <Descriptions.Item label="收款时间">{dateTime(order.paidAt)}</Descriptions.Item>
        <Descriptions.Item label="订单渠道">
          {order.channel === 'online' ? '线上小程序' : '线下补录'}
        </Descriptions.Item>
        <Descriptions.Item label="收款事由" span={2}>
          {order.productType === 'lesson_package' ? (
            <>
              {order.packageName}，基础 {order.baseUnits} 课时，赠送 {order.bonusUnits} 课时
            </>
          ) : (
            <>
              {order.periodCardProductName}，{order.periodCardDurationCount}
              {PERIOD_UNIT[order.periodCardDurationUnit]}，
              {order.periodCardMode === 'unlimited'
                ? '不限次'
                : `限 ${order.periodCardUsageLimit} 次`}
              ，{ACTIVATION_POLICY[order.periodCardActivationPolicy]}
            </>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="人民币（小写）">{money(order.amountMinor)}</Descriptions.Item>
        <Descriptions.Item label="人民币（大写）">{receipt.amountUppercase}</Descriptions.Item>
        {order.paymentReference ? (
          <Descriptions.Item label="收款凭证" span={2}>
            {order.paymentReference}
          </Descriptions.Item>
        ) : null}
        {order.paymentNote ? (
          <Descriptions.Item label="备注" span={2}>
            {order.paymentNote}
          </Descriptions.Item>
        ) : null}
      </Descriptions>
      <footer className="lesson-receipt-footer">
        <span>{receipt.organization.address ?? ''}</span>
        <span>{receipt.organization.phone ?? ''}</span>
        <span>开具时间：{dateTime(receipt.issuedAt)}</span>
      </footer>
      <Typography.Paragraph type="secondary" className="lesson-receipt-disclaimer">
        本收据用于经营收款记录，不作为税务发票。
      </Typography.Paragraph>
    </article>
  );
}
