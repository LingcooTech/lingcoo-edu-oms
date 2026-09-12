import {
  EditOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions, useOrganizationProfile } from '../organization/hooks';
import { useStudents } from '../people/hooks';
import {
  useCreatePeriodCardProduct,
  useIssuePeriodCardEntitlement,
  usePeriodCardEntitlements,
  usePeriodCardProducts,
  usePeriodCardUsages,
  useReversePeriodCardUsage,
  useUpdatePeriodCardProduct,
} from './hooks';
import type {
  CreatePeriodCardProductRequest,
  PeriodCardActivationPolicy,
  PeriodCardBillingMode,
  PeriodCardEntitlement,
  PeriodCardEntitlementListQuery,
  PeriodCardEntitlementStatus,
  PeriodCardPeriodUnit,
  PeriodCardProduct,
  PeriodCardProductListQuery,
  PeriodCardStatus,
  PeriodCardUsage,
  PeriodCardUsageListQuery,
  UpdatePeriodCardProductRequest,
} from './api';

type ProductFormValues = {
  name: string;
  description?: string;
  mode: PeriodCardBillingMode;
  usageLimit?: number;
  durationUnit: PeriodCardPeriodUnit;
  durationCount: number;
  activationPolicy: PeriodCardActivationPolicy;
  priceYuan: number;
  onlineSaleEnabled: boolean;
  saleStartsAt?: string;
  saleEndsAt?: string;
  status?: PeriodCardStatus;
};

type EntitlementFormValues = {
  studentId: string;
  productId: string;
};

type ReverseFormValues = { reason: string };

const periodUnitLabels: Record<PeriodCardPeriodUnit, string> = {
  day: '天',
  week: '周',
  month: '月',
};

const activationLabels: Record<PeriodCardActivationPolicy, string> = {
  immediate: '立即生效',
  on_first_use: '首次使用激活',
};

const entitlementStatusLabels: Record<PeriodCardEntitlementStatus, string> = {
  pending_activation: '待激活',
  active: '有效',
  exhausted: '已用尽',
  expired: '已过期',
  revoked: '已撤销',
};

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试';
}

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized || null;
}

function yuanToFen(value: number) {
  return Math.round(value * 100);
}

function money(value: number) {
  return `¥${(value / 100).toFixed(2)}`;
}

function dateTime(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';
}

function isoToLocal(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localToIso(value?: string) {
  return value ? new Date(value).toISOString() : null;
}

function statusTag(status: PeriodCardEntitlementStatus) {
  const color: Record<PeriodCardEntitlementStatus, string> = {
    pending_activation: 'gold',
    active: 'success',
    exhausted: 'blue',
    expired: 'default',
    revoked: 'error',
  };
  return <Tag color={color[status]}>{entitlementStatusLabels[status] ?? status}</Tag>;
}

function studentLabel(student: { id: string; fullName: string; preferredName: string | null }) {
  return student.preferredName
    ? `${student.fullName}（${student.preferredName}）`
    : student.fullName;
}

export function PeriodCardsPage() {
  const organization = useOrganizationProfile();
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const canManage = useCan('education.lesson-packages.manage');
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('products');

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0])
      setInstitutionId(institutions.data.items[0].id);
  }, [institutionId, institutions.data]);

  const institutionOptions = useMemo(
    () =>
      (institutions.data?.items ?? []).map((institution) => ({
        value: institution.id,
        label:
          organization.data?.operationMode === 'self_operated_only'
            ? institution.name
            : `${institution.name} · ${institution.type === 'self_operated' ? '自营' : '合作'}`,
      })),
    [institutions.data, organization.data?.operationMode],
  );

  return (
    <PageContainer
      title="周期卡"
      description="周期卡按机构提供阶段性使用权；它与通用课时账户分开核算，使用记录始终可追溯、可冲正。"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="周期卡不绑定课程、校区、教师或班级；限次卡记录使用上限，不限次卡只记录使用事实。"
      />
      <Card style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          loading={institutions.isPending}
          placeholder="选择机构"
          value={institutionId}
          options={institutionOptions}
          style={{ minWidth: 300, maxWidth: '100%' }}
          onChange={setInstitutionId}
        />
      </Card>
      {institutionId ? (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'products',
              label: '周期卡商品',
              children: <ProductsTab institutionId={institutionId} canManage={canManage} />,
            },
            {
              key: 'entitlements',
              label: '学员权益',
              children: <EntitlementsTab institutionId={institutionId} canManage={canManage} />,
            },
            {
              key: 'usages',
              label: '使用记录',
              children: <UsagesTab institutionId={institutionId} canManage={canManage} />,
            },
          ]}
        />
      ) : institutions.isPending ? (
        <Card>
          <Typography.Text type="secondary">机构加载中…</Typography.Text>
        </Card>
      ) : (
        <Card>
          <Alert type="warning" showIcon message="请先创建并启用机构" />
        </Card>
      )}
    </PageContainer>
  );
}

function ProductsTab({ institutionId, canManage }: { institutionId: string; canManage: boolean }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState<PeriodCardProductListQuery>({ page: 1, pageSize: 20 });
  const [editing, setEditing] = useState<PeriodCardProduct | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const products = usePeriodCardProducts(institutionId, query);
  const create = useCreatePeriodCardProduct();
  const update = useUpdatePeriodCardProduct();

  const save = async (values: ProductFormValues) => {
    try {
      const common: CreatePeriodCardProductRequest = {
        name: values.name.trim(),
        description: nullable(values.description),
        mode: values.mode,
        usageLimit: values.mode === 'limited' ? (values.usageLimit ?? null) : null,
        durationUnit: values.durationUnit,
        durationCount: values.durationCount,
        activationPolicy: values.activationPolicy,
        priceAmount: yuanToFen(values.priceYuan),
        currency: 'CNY',
        onlineSaleEnabled: values.onlineSaleEnabled,
        saleStartsAt: localToIso(values.saleStartsAt),
        saleEndsAt: localToIso(values.saleEndsAt),
      };
      if (editing) {
        const input: UpdatePeriodCardProductRequest = {
          ...common,
          status: values.status ?? editing.status,
          expectedRevision: editing.revision,
        };
        await update.mutateAsync({ institutionId, productId: editing.id, input });
        void message.success('周期卡商品已更新，新版本已保存');
      } else {
        await create.mutateAsync({ institutionId, input: common });
        void message.success('周期卡商品已创建');
      }
      setModalOpen(false);
    } catch (error) {
      void message.error(errorMessage(error));
    }
  };

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索商品名称"
            style={{ width: 250 }}
            onSearch={(value) => setQuery({ ...query, page: 1, search: value.trim() || undefined })}
          />
          <Select
            allowClear
            placeholder="商品状态"
            style={{ width: 130 }}
            options={[
              { label: '启用', value: 'active' },
              { label: '停用', value: 'inactive' },
            ]}
            onChange={(status: PeriodCardStatus | undefined) =>
              setQuery({ ...query, page: 1, status })
            }
          />
          <Button
            icon={<ReloadOutlined />}
            loading={products.isFetching}
            onClick={() => void products.refetch()}
          >
            刷新
          </Button>
          {canManage ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              新建周期卡商品
            </Button>
          ) : null}
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={products.isPending}
          error={products.error}
          empty={products.data?.items.length === 0}
        >
          <Table<PeriodCardProduct>
            rowKey="id"
            scroll={{ x: 1_240 }}
            dataSource={products.data?.items ?? []}
            pagination={{
              current: products.data?.page ?? query.page,
              pageSize: products.data?.pageSize ?? query.pageSize,
              total: products.data?.total ?? 0,
              showSizeChanger: false,
              onChange: (page) => setQuery({ ...query, page }),
            }}
            columns={[
              {
                title: '商品',
                render: (_: unknown, record) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text strong>{record.name}</Typography.Text>
                    <Typography.Text type="secondary">
                      {record.description || '无额外说明'}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '规则',
                width: 220,
                render: (_: unknown, record) => (
                  <Space orientation="vertical" size={0}>
                    <span>
                      {record.mode === 'unlimited' ? '不限次' : `限 ${record.usageLimit ?? 0} 次`}
                    </span>
                    <Typography.Text type="secondary">
                      {record.durationCount}
                      {periodUnitLabels[record.durationUnit]} ·{' '}
                      {activationLabels[record.activationPolicy]}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '售价',
                dataIndex: 'priceAmount',
                width: 110,
                render: (value: number) => money(value),
              },
              {
                title: '线上销售',
                width: 235,
                render: (_: unknown, record) => (
                  <Space orientation="vertical" size={0}>
                    <Tag color={record.onlineSaleEnabled ? 'blue' : 'default'}>
                      {record.onlineSaleEnabled ? '线上可售' : '未上架'}
                    </Tag>
                    {record.onlineSaleEnabled ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {record.saleStartsAt || record.saleEndsAt
                          ? `${dateTime(record.saleStartsAt)} 至 ${dateTime(record.saleEndsAt)}`
                          : '长期有效'}
                      </Typography.Text>
                    ) : null}
                  </Space>
                ),
              },
              { title: '版本', width: 80, render: (_: unknown, record) => `V${record.revision}` },
              {
                title: '状态',
                width: 90,
                render: (_: unknown, record) => (
                  <Tag color={record.status === 'active' ? 'success' : 'default'}>
                    {record.status === 'active' ? '启用' : '停用'}
                  </Tag>
                ),
              },
              {
                title: '操作',
                fixed: 'right',
                width: 90,
                render: (_: unknown, record) =>
                  canManage ? (
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(record);
                        setModalOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <ProductModal
        open={modalOpen}
        value={editing}
        loading={create.isPending || update.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={save}
      />
    </>
  );
}

function EntitlementsTab({
  institutionId,
  canManage,
}: {
  institutionId: string;
  canManage: boolean;
}) {
  const { message } = App.useApp();
  const [query, setQuery] = useState<PeriodCardEntitlementListQuery>({ page: 1, pageSize: 20 });
  const [modalOpen, setModalOpen] = useState(false);
  const entitlements = usePeriodCardEntitlements(institutionId, query);
  const products = usePeriodCardProducts(institutionId, {
    page: 1,
    pageSize: 100,
    status: 'active',
  });
  const students = useStudents(institutionId, { page: 1, pageSize: 500, status: 'active' });
  const issue = useIssuePeriodCardEntitlement();

  const studentOptions = (students.data?.items ?? []).map((student) => ({
    value: student.id,
    label: studentLabel(student),
  }));
  const productOptions = (products.data?.items ?? []).map((product) => ({
    value: product.id,
    label: `${product.name} · ${product.mode === 'unlimited' ? '不限次' : `限${product.usageLimit ?? 0}次`} / ${product.durationCount}${periodUnitLabels[product.durationUnit]}`,
  }));

  const submit = async (values: EntitlementFormValues) => {
    try {
      await issue.mutateAsync({
        institutionId,
        input: {
          operationId: crypto.randomUUID(),
          studentId: values.studentId,
          productId: values.productId,
        },
      });
      void message.success('周期卡权益已发放');
      setModalOpen(false);
    } catch (error) {
      void message.error(errorMessage(error));
    }
  };

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索学员"
            style={{ width: 230 }}
            onSearch={(value) => setQuery({ ...query, page: 1, search: value.trim() || undefined })}
          />
          <Select
            allowClear
            placeholder="权益状态"
            style={{ width: 150 }}
            options={Object.entries(entitlementStatusLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(status: PeriodCardEntitlementStatus | undefined) =>
              setQuery({ ...query, page: 1, status })
            }
          />
          <Button
            icon={<ReloadOutlined />}
            loading={entitlements.isFetching}
            onClick={() => void entitlements.refetch()}
          >
            刷新
          </Button>
          {canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              发放权益
            </Button>
          ) : null}
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={entitlements.isPending}
          error={entitlements.error}
          empty={entitlements.data?.items.length === 0}
        >
          <Table<PeriodCardEntitlement>
            rowKey="id"
            scroll={{ x: 1_160 }}
            dataSource={entitlements.data?.items ?? []}
            pagination={{
              current: entitlements.data?.page ?? query.page,
              pageSize: entitlements.data?.pageSize ?? query.pageSize,
              total: entitlements.data?.total ?? 0,
              showSizeChanger: false,
              onChange: (page) => setQuery({ ...query, page }),
            }}
            columns={[
              {
                title: '学员',
                width: 160,
                render: (_: unknown, record) => record.studentName || record.studentId,
              },
              {
                title: '周期卡商品',
                width: 220,
                render: (_: unknown, record) => record.productName || record.productId,
              },
              {
                title: '状态',
                width: 120,
                render: (_: unknown, record) => statusTag(record.effectiveStatus),
              },
              {
                title: '有效期',
                width: 250,
                render: (_: unknown, record) =>
                  `${dateTime(record.activationStartsAt)} 至 ${dateTime(record.endsAt)}`,
              },
              {
                title: '限额 / 已用 / 剩余',
                width: 160,
                render: (_: unknown, record) =>
                  record.usageLimit === null
                    ? `不限次 / ${record.usedQuantity} / 不限`
                    : `${record.usageLimit} / ${record.usedQuantity} / ${record.remainingQuantity ?? 0}`,
              },
              {
                title: '发放时间',
                dataIndex: 'issuedAt',
                width: 170,
                render: (value: string) => dateTime(value),
              },
              {
                title: '激活方式',
                width: 130,
                render: (_: unknown, record) => activationLabels[record.activationPolicy],
              },
            ]}
          />
        </AsyncState>
      </Card>
      <IssueEntitlementModal
        open={modalOpen}
        loading={issue.isPending}
        studentOptions={studentOptions}
        productOptions={productOptions}
        onClose={() => setModalOpen(false)}
        onSubmit={submit}
      />
    </>
  );
}

function UsagesTab({ institutionId, canManage }: { institutionId: string; canManage: boolean }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState<PeriodCardUsageListQuery>({ page: 1, pageSize: 20 });
  const [reversing, setReversing] = useState<PeriodCardUsage | null>(null);
  const usages = usePeriodCardUsages(institutionId, query);
  const reverse = useReversePeriodCardUsage();

  const submitReverse = async (values: ReverseFormValues) => {
    if (!reversing) return;
    try {
      await reverse.mutateAsync({
        institutionId,
        usageId: reversing.id,
        input: { operationId: crypto.randomUUID(), reason: values.reason.trim() },
      });
      void message.success('使用记录已冲正');
      setReversing(null);
    } catch (error) {
      void message.error(errorMessage(error));
    }
  };

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="按学员 ID 筛选"
            style={{ width: 250 }}
            onSearch={(value) =>
              setQuery({ ...query, page: 1, studentId: value.trim() || undefined })
            }
          />
          <Select
            allowClear
            placeholder="记录状态"
            style={{ width: 130 }}
            options={[
              { label: '有效', value: 'active' },
              { label: '已冲正', value: 'reversed' },
            ]}
            onChange={(status: 'active' | 'reversed' | undefined) =>
              setQuery({ ...query, page: 1, status })
            }
          />
          <Button icon={<FilterOutlined />} onClick={() => setQuery({ ...query, page: 1 })}>
            应用
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={usages.isFetching}
            onClick={() => void usages.refetch()}
          >
            刷新
          </Button>
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={usages.isPending}
          error={usages.error}
          empty={usages.data?.items.length === 0}
        >
          <Table<PeriodCardUsage>
            rowKey="id"
            scroll={{ x: 1_080 }}
            dataSource={usages.data?.items ?? []}
            pagination={{
              current: usages.data?.page ?? query.page,
              pageSize: usages.data?.pageSize ?? query.pageSize,
              total: usages.data?.total ?? 0,
              showSizeChanger: false,
              onChange: (page) => setQuery({ ...query, page }),
            }}
            columns={[
              {
                title: '学员',
                width: 160,
                render: (_: unknown, record) => record.studentName || record.studentId,
              },
              {
                title: '课次来源',
                width: 260,
                render: (_: unknown, record) => (
                  <Space orientation="vertical" size={0}>
                    <Typography.Text strong>{record.sourceReference}</Typography.Text>
                    <Typography.Text type="secondary">{record.productName}</Typography.Text>
                  </Space>
                ),
              },
              { title: '消耗数量', dataIndex: 'quantity', width: 110 },
              {
                title: '发生时间',
                dataIndex: 'occurredAt',
                width: 180,
                render: (value: string) => dateTime(value),
              },
              {
                title: '状态',
                width: 110,
                render: (_: unknown, record) =>
                  record.status === 'reversed' ? (
                    <Tag color="default">已冲正</Tag>
                  ) : (
                    <Tag color="success">有效</Tag>
                  ),
              },
              {
                title: '冲正说明',
                width: 220,
                render: (_: unknown, record) => record.reversalReason || record.reason || '—',
              },
              {
                title: '操作',
                fixed: 'right',
                width: 100,
                render: (_: unknown, record) =>
                  canManage && record.status === 'active' ? (
                    <Button
                      type="link"
                      icon={<RollbackOutlined />}
                      onClick={() => setReversing(record)}
                    >
                      冲正
                    </Button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <ReverseUsageModal
        open={Boolean(reversing)}
        loading={reverse.isPending}
        value={reversing}
        onClose={() => setReversing(null)}
        onSubmit={submitReverse}
      />
    </>
  );
}

function ProductModal({
  open,
  value,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  value: PeriodCardProduct | null;
  loading: boolean;
  onClose(): void;
  onSubmit(values: ProductFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<ProductFormValues>();
  const mode = Form.useWatch('mode', form) ?? 'limited';

  return (
    <Modal
      open={open}
      destroyOnHidden
      width={650}
      title={value ? '编辑周期卡商品' : '新建周期卡商品'}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (!visible) return;
        form.setFieldsValue(
          value
            ? {
                name: value.name,
                description: value.description ?? undefined,
                mode: value.mode,
                usageLimit: value.usageLimit ?? undefined,
                durationUnit: value.durationUnit,
                durationCount: value.durationCount,
                activationPolicy: value.activationPolicy,
                priceYuan: value.priceAmount / 100,
                onlineSaleEnabled: value.onlineSaleEnabled,
                saleStartsAt: isoToLocal(value.saleStartsAt),
                saleEndsAt: isoToLocal(value.saleEndsAt),
                status: value.status,
              }
            : {
                mode: 'limited',
                usageLimit: 10,
                durationUnit: 'month',
                durationCount: 1,
                activationPolicy: 'immediate',
                priceYuan: 0,
                onlineSaleEnabled: false,
                status: 'active',
              },
        );
      }}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="商品名称" rules={[{ required: true, max: 160 }]}>
          <Input placeholder="例如：月度通用周期卡" />
        </Form.Item>
        <Space align="start" size={20} wrap>
          <Form.Item name="mode" label="使用次数" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: '限次', value: 'limited' },
                { label: '不限次', value: 'unlimited' },
              ]}
            />
          </Form.Item>
          {mode === 'limited' ? (
            <Form.Item
              name="usageLimit"
              label="次数上限"
              rules={[{ required: true, type: 'number', min: 1 }]}
            >
              <InputNumber min={1} precision={0} style={{ width: 140 }} />
            </Form.Item>
          ) : null}
        </Space>
        <Space align="start" size={20} wrap>
          <Form.Item name="durationUnit" label="有效期单位" rules={[{ required: true }]}>
            <Select
              style={{ width: 150 }}
              options={Object.entries(periodUnitLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item
            name="durationCount"
            label="有效期长度"
            rules={[{ required: true, type: 'number', min: 1 }]}
          >
            <InputNumber min={1} precision={0} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="activationPolicy" label="生效方式" rules={[{ required: true }]}>
            <Select
              style={{ width: 170 }}
              options={Object.entries(activationLabels).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
        </Space>
        <Form.Item
          name="priceYuan"
          label="售价（元）"
          extra="以人民币分保存；价格为 0 时不能线上购买。"
          rules={[{ required: true, type: 'number', min: 0 }]}
        >
          <InputNumber min={0} precision={2} step={0.01} style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="onlineSaleEnabled" label="线上销售" valuePropName="checked">
          <Switch checkedChildren="上架" unCheckedChildren="下架" />
        </Form.Item>
        <Space align="start" size={20} wrap>
          <Form.Item name="saleStartsAt" label="销售开始时间（可选）">
            <Input type="datetime-local" style={{ width: 230 }} />
          </Form.Item>
          <Form.Item name="saleEndsAt" label="销售结束时间（可选）">
            <Input type="datetime-local" style={{ width: 230 }} />
          </Form.Item>
        </Space>
        {value ? (
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '启用', value: 'active' },
                { label: '停用', value: 'inactive' },
              ]}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="description" label="说明" rules={[{ max: 2_000 }]}>
          <Input.TextArea rows={3} showCount maxLength={2_000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function IssueEntitlementModal({
  open,
  loading,
  studentOptions,
  productOptions,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  studentOptions: { value: string; label: string }[];
  productOptions: { value: string; label: string }[];
  onClose(): void;
  onSubmit(values: EntitlementFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<EntitlementFormValues>();
  return (
    <Modal
      open={open}
      destroyOnHidden
      title="发放周期卡权益"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="权益的有效期、限额和激活方式继承商品当前版本快照。"
      />
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="studentId"
          label="学员"
          rules={[{ required: true, message: '请选择学员' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择学员"
            options={studentOptions}
          />
        </Form.Item>
        <Form.Item
          name="productId"
          label="周期卡商品"
          rules={[{ required: true, message: '请选择商品' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择启用中的周期卡商品"
            options={productOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ReverseUsageModal({
  open,
  loading,
  value,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  value: PeriodCardUsage | null;
  onClose(): void;
  onSubmit(values: ReverseFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<ReverseFormValues>();
  return (
    <Modal
      open={open}
      destroyOnHidden
      title="冲正周期卡使用记录"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={`将冲正 ${value?.quantity ?? 0} 次使用，不会删除原始记录。`}
      />
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          name="reason"
          label="冲正原因"
          rules={[{ required: true, whitespace: true, max: 500, message: '请填写冲正原因' }]}
        >
          <Input.TextArea
            rows={4}
            showCount
            maxLength={500}
            placeholder="例如：误点名，课次未实际发生"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
