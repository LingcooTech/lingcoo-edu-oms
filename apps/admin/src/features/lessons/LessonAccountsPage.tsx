import {
  GiftOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  RollbackOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type {
  GrantLessonUnitsRequest,
  LessonBatch,
  LessonBatchSourceType,
  LessonMovement,
  LessonMovementType,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions, useOrganizationProfile } from '../organization/hooks';
import { useStudents } from '../people/hooks';
import { GrantLessonUnitsModal, type GrantLessonUnitsFormValues } from './GrantLessonUnitsModal';
import {
  useAdjustLessonUnits,
  useClawbackLessonUnits,
  useGrantLessonUnits,
  useLessonAccount,
  useLessonBatches,
  useLessonMovements,
  useLessonPackages,
  useReverseLessonGrant,
} from './hooks';

const sourceLabels: Record<LessonBatchSourceType, string> = {
  online_purchase: '线上购课',
  offline_purchase: '线下购课登记',
  gift: '赠送',
  makeup: '补发',
  migration_opening: '迁移期初',
  custom: '自定义发放',
  adjustment: '调整增加',
};

const movementLabels: Record<LessonMovementType, string> = {
  grant: '发放',
  adjustment_credit: '调整增加',
  adjustment_debit: '调整扣减',
  clawback: '剩余课时扣回',
  grant_reversal: '发放纠错',
  consume: '签到消课',
  consume_reversal: '消课冲正',
};

type AdjustmentFormValues = {
  direction: 'credit' | 'debit';
  units: number;
  sourceReference?: string;
  reason: string;
};

type BatchAction = { mode: 'clawback' | 'reverse'; batch: LessonBatch } | null;

function nullable(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function operationId() {
  return globalThis.crypto.randomUUID();
}

export function LessonAccountsPage({
  initialTab = 'batches',
}: {
  initialTab?: 'batches' | 'movements';
}) {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const canManage = useCan('education.lesson-balances.manage');
  const organization = useOrganizationProfile();
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const students = useStudents(institutionId, { page: 1, pageSize: 100, status: 'active' });
  const [studentId, setStudentId] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<BatchAction>(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const account = useLessonAccount(institutionId, studentId);
  const batches = useLessonBatches(institutionId, studentId, { page: 1, pageSize: 100 });
  const movements = useLessonMovements(institutionId, studentId, { page: 1, pageSize: 100 });
  const packages = useLessonPackages(institutionId, { page: 1, pageSize: 100, status: 'active' });
  const grant = useGrantLessonUnits();
  const adjust = useAdjustLessonUnits();
  const clawback = useClawbackLessonUnits();
  const reverse = useReverseLessonGrant();

  useEffect(() => {
    const requested = searchParams.get('institutionId');
    const requestedInstitution = institutions.data?.items.find((item) => item.id === requested);
    if (!institutionId && (requestedInstitution || institutions.data?.items[0])) {
      setInstitutionId((requestedInstitution || institutions.data?.items[0])!.id);
    }
  }, [institutionId, institutions.data, searchParams]);

  useEffect(() => {
    const first = students.data?.items[0];
    const requested = searchParams.get('studentId');
    const requestedStudent = students.data?.items.find((item) => item.id === requested);
    if (!studentId && (requestedStudent || first)) setStudentId((requestedStudent || first)!.id);
    if (studentId && students.data && !students.data.items.some((item) => item.id === studentId)) {
      setStudentId(first?.id ?? null);
    }
  }, [studentId, students.data, searchParams]);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

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
  const studentOptions = useMemo(
    () =>
      (students.data?.items ?? []).map((student) => ({
        value: student.id,
        label: `${student.fullName}${student.preferredName ? `（${student.preferredName}）` : ''}`,
      })),
    [students.data],
  );
  const currentRevision = account.data?.revision ?? 0;

  return (
    <PageContainer
      title={initialTab === 'movements' ? '课时流水' : '课时账户'}
      description={
        initialTab === 'movements'
          ? '按“学员＋机构”查看每一次课时增加、扣减、消费和冲正记录。'
          : '以“学员＋机构”独立记账。余额只能由发放、调整、扣回和签到消费流水产生。'
      }
      actions={
        canManage && studentId ? (
          <Space>
            <Button icon={<PlusCircleOutlined />} onClick={() => setAdjustOpen(true)}>
              课时调整
            </Button>
            <Button type="primary" icon={<GiftOutlined />} onClick={() => setGrantOpen(true)}>
              发放课时
            </Button>
          </Space>
        ) : undefined
      }
    >
      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="A 机构的余额不会自动借给 B 机构；课程、老师和校区也不会改变课时归属。"
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
              setStudentId(null);
            }}
          />
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择学员"
            loading={students.isPending}
            value={studentId}
            options={studentOptions}
            style={{ minWidth: 240 }}
            onChange={setStudentId}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={account.isFetching || batches.isFetching || movements.isFetching}
            onClick={() => {
              void account.refetch();
              void batches.refetch();
              void movements.refetch();
            }}
          >
            刷新
          </Button>
        </Space>
      </Card>

      {!studentId ? (
        <Card>
          <Empty description="请先选择有服务关系的学员" />
        </Card>
      ) : (
        <>
          <AsyncState loading={account.isPending} error={account.error}>
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
              <Col xs={24} sm={12} xl={6}>
                <Card>
                  <Statistic
                    title="当前可用课时"
                    value={account.data?.balanceUnits ?? 0}
                    prefix={<WalletOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card>
                  <Statistic title="累计增加" value={account.data?.lifetimeCreditedUnits ?? 0} />
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card>
                  <Statistic title="累计扣减" value={account.data?.lifetimeDebitedUnits ?? 0} />
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card>
                  <Statistic title="可用批次" value={account.data?.activeBatchCount ?? 0} />
                </Card>
              </Col>
            </Row>
          </AsyncState>
          <Card>
            <Tabs
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as 'batches' | 'movements')}
              items={[
                {
                  key: 'batches',
                  label: '发放批次',
                  children: (
                    <BatchTable
                      data={batches.data?.items ?? []}
                      loading={batches.isPending}
                      canManage={canManage}
                      onAction={setBatchAction}
                    />
                  ),
                },
                {
                  key: 'movements',
                  label: '课时流水',
                  children: (
                    <MovementTable
                      data={movements.data?.items ?? []}
                      loading={movements.isPending}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}

      <GrantLessonUnitsModal
        open={grantOpen}
        packages={packages.data?.items ?? []}
        loading={grant.isPending}
        onClose={() => setGrantOpen(false)}
        onSubmit={async (values: GrantLessonUnitsFormValues) => {
          if (!institutionId || !studentId) return;
          const common = {
            source: values.source,
            reason: values.reason.trim(),
            sourceReference: nullable(values.sourceReference),
          };
          const command: GrantLessonUnitsRequest =
            values.mode === 'template'
              ? { ...common, templateId: values.templateId! }
              : {
                  ...common,
                  templateId: null,
                  baseUnits: values.baseUnits!,
                  bonusUnits: values.bonusUnits ?? 0,
                };
          try {
            await grant.mutateAsync({
              institutionId,
              studentId,
              command,
              expectedAccountRevision: currentRevision,
              idempotencyKey: operationId(),
            });
            void message.success('课时已发放并生成批次与流水');
            setGrantOpen(false);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />
      <AdjustmentModal
        open={adjustOpen}
        loading={adjust.isPending}
        onClose={() => setAdjustOpen(false)}
        onSubmit={async (values) => {
          if (!institutionId || !studentId) return;
          try {
            await adjust.mutateAsync({
              institutionId,
              studentId,
              command: {
                direction: values.direction,
                units: values.units,
                reason: values.reason.trim(),
                sourceReference: nullable(values.sourceReference),
              },
              expectedAccountRevision: currentRevision,
              idempotencyKey: operationId(),
            });
            void message.success(values.direction === 'credit' ? '课时已增加' : '课时已扣减');
            setAdjustOpen(false);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />
      <BatchActionModal
        action={batchAction}
        loading={clawback.isPending || reverse.isPending}
        onClose={() => setBatchAction(null)}
        onSubmit={async (values) => {
          if (!institutionId || !studentId || !batchAction) return;
          try {
            const common = {
              institutionId,
              studentId,
              batchId: batchAction.batch.id,
              expectedAccountRevision: currentRevision,
              idempotencyKey: operationId(),
            };
            if (batchAction.mode === 'clawback') {
              await clawback.mutateAsync({
                ...common,
                command: { units: values.units!, reason: values.reason.trim() },
              });
              void message.success('剩余课时已扣回');
            } else {
              await reverse.mutateAsync({
                ...common,
                command: { reason: values.reason.trim() },
              });
              void message.success('错误发放已整笔撤销');
            }
            setBatchAction(null);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />
    </PageContainer>
  );
}

function BatchTable({
  data,
  loading,
  canManage,
  onAction,
}: {
  data: LessonBatch[];
  loading: boolean;
  canManage: boolean;
  onAction(action: BatchAction): void;
}) {
  return (
    <Table<LessonBatch>
      rowKey="id"
      loading={loading}
      dataSource={data}
      pagination={false}
      scroll={{ x: 1040 }}
      locale={{ emptyText: '该学员在当前机构尚未获得课时' }}
      columns={[
        {
          title: '批次来源',
          width: 180,
          render: (_, row) => (
            <Space direction="vertical" size={0}>
              <Typography.Text strong>
                {row.templateName || sourceLabels[row.sourceType]}
              </Typography.Text>
              <Typography.Text type="secondary">
                {row.sourceReference || '无来源编号'}
              </Typography.Text>
            </Space>
          ),
        },
        { title: '基础', dataIndex: 'baseUnits', width: 80 },
        { title: '赠送', dataIndex: 'bonusUnits', width: 80 },
        { title: '已消费', dataIndex: 'consumedUnits', width: 90 },
        { title: '已扣回', dataIndex: 'withdrawnUnits', width: 90 },
        {
          title: '剩余',
          dataIndex: 'remainingUnits',
          width: 90,
          render: (value) => <Typography.Text strong>{value}</Typography.Text>,
        },
        {
          title: '状态',
          dataIndex: 'status',
          width: 90,
          render: (value) => (
            <Tag
              color={value === 'available' ? 'success' : value === 'reversed' ? 'error' : 'default'}
            >
              {value === 'available' ? '可用' : value === 'reversed' ? '已撤销' : '已用尽'}
            </Tag>
          ),
        },
        {
          title: '发放时间',
          dataIndex: 'createdAt',
          width: 170,
          render: (value) => new Date(value).toLocaleString('zh-CN'),
        },
        {
          title: '操作',
          fixed: 'right',
          width: 180,
          render: (_, row) =>
            canManage && row.status === 'available' ? (
              <Space size={0}>
                <Button
                  type="link"
                  icon={<MinusCircleOutlined />}
                  onClick={() => onAction({ mode: 'clawback', batch: row })}
                >
                  扣回
                </Button>
                {row.remainingUnits === row.totalUnits && row.withdrawnUnits === 0 ? (
                  <Button
                    type="link"
                    danger
                    icon={<RollbackOutlined />}
                    onClick={() => onAction({ mode: 'reverse', batch: row })}
                  >
                    纠错撤销
                  </Button>
                ) : null}
              </Space>
            ) : (
              '—'
            ),
        },
      ]}
    />
  );
}

function MovementTable({ data, loading }: { data: LessonMovement[]; loading: boolean }) {
  return (
    <Table<LessonMovement>
      rowKey="id"
      loading={loading}
      dataSource={data}
      pagination={false}
      scroll={{ x: 900 }}
      locale={{ emptyText: '暂无课时流水' }}
      columns={[
        {
          title: '业务类型',
          dataIndex: 'type',
          width: 150,
          render: (value: LessonMovementType) => movementLabels[value],
        },
        {
          title: '变动',
          width: 100,
          render: (_, row) => (
            <Typography.Text type={row.direction === 'credit' ? 'success' : 'danger'} strong>
              {row.direction === 'credit' ? '+' : '-'}
              {row.units}
            </Typography.Text>
          ),
        },
        {
          title: '余额',
          width: 130,
          render: (_, row) => `${row.balanceBeforeUnits} → ${row.balanceAfterUnits}`,
        },
        { title: '原因', dataIndex: 'reason', ellipsis: true },
        {
          title: '批次分摊',
          width: 110,
          render: (_, row) =>
            row.allocations.length ? `${row.allocations.length} 个批次` : '新批次',
        },
        {
          title: '发生时间',
          dataIndex: 'occurredAt',
          width: 180,
          render: (value) => new Date(value).toLocaleString('zh-CN'),
        },
      ]}
    />
  );
}

function AdjustmentModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onClose(): void;
  onSubmit(values: AdjustmentFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<AdjustmentFormValues>();
  return (
    <Modal
      open={open}
      destroyOnHidden
      title="课时调整"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (visible) form.setFieldsValue({ direction: 'credit', units: 1 });
      }}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="direction" label="调整方向" rules={[{ required: true }]}>
          <Segmented
            block
            options={[
              { label: '增加课时', value: 'credit' },
              { label: '扣减课时', value: 'debit' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="units"
          label="课时数量"
          rules={[{ required: true, type: 'number', min: 1 }]}
        >
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="sourceReference" label="业务参考编号">
          <Input />
        </Form.Item>
        <Form.Item name="reason" label="调整原因" rules={[{ required: true, max: 500 }]}>
          <Input.TextArea rows={3} showCount maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function BatchActionModal({
  action,
  loading,
  onClose,
  onSubmit,
}: {
  action: BatchAction;
  loading: boolean;
  onClose(): void;
  onSubmit(values: { units?: number; reason: string }): Promise<void>;
}) {
  const [form] = Form.useForm<{ units?: number; reason: string }>();
  return (
    <Modal
      open={Boolean(action)}
      destroyOnHidden
      title={action?.mode === 'reverse' ? '纠错撤销整笔发放' : '扣回剩余课时'}
      okText={action?.mode === 'reverse' ? '确认撤销' : '确认扣回'}
      okButtonProps={{ danger: true }}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (visible && action) form.setFieldsValue({ units: action.batch.remainingUnits });
      }}
    >
      {action ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`批次当前剩余 ${action.batch.remainingUnits} 课时`}
          description={
            action.mode === 'reverse'
              ? '仅从未消费、从未扣回的完整发放可以纠错撤销，原始流水仍会保留。'
              : '系统只处理课时权益，不判断线下退款是否完成。'
          }
        />
      ) : null}
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        {action?.mode === 'clawback' ? (
          <Form.Item
            name="units"
            label="扣回数量"
            rules={[{ required: true, type: 'number', min: 1 }]}
          >
            <InputNumber
              min={1}
              max={action.batch.remainingUnits}
              precision={0}
              style={{ width: '100%' }}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="reason" label="操作原因" rules={[{ required: true, max: 500 }]}>
          <Input.TextArea rows={3} showCount maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
