import {
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type {
  AccessUser,
  AdmissionLead,
  AdmissionLeadStatus,
  AdmissionTrialRegistration,
  AdmissionTrialSession,
  CreateAdmissionLeadRequest,
  CreateAdmissionTrialRequest,
  UpdateAdmissionTrialRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useUsers } from '../access/hooks';
import { useInstitutions } from '../organization/hooks';
import { useTeachers } from '../people/hooks';
import { useCampuses, useCourses } from '../teaching-resources/hooks';
import {
  useAddAdmissionFollowUp,
  useAdmissionFollowUps,
  useAdmissionLeads,
  useAdmissionRegistrations,
  useAdmissionTrials,
  useBookAdmissionTrial,
  useCheckInAdmissionTrial,
  useConvertAdmissionLead,
  useCreateAdmissionLead,
  useCreateAdmissionTrial,
  useUpdateAdmissionLead,
  useUpdateAdmissionTrial,
} from './hooks';

const leadStatus: Record<AdmissionLeadStatus, { label: string; color: string }> = {
  new: { label: '新线索', color: 'blue' },
  contacted: { label: '已联系', color: 'processing' },
  qualified: { label: '已确认需求', color: 'cyan' },
  trial_booked: { label: '已预约试听', color: 'purple' },
  trial_attended: { label: '已参加试听', color: 'geekblue' },
  nurture: { label: '持续培育', color: 'gold' },
  won: { label: '已转化', color: 'success' },
  lost: { label: '已失效', color: 'default' },
};

const trialStatus = {
  open: { label: '可预约', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
  cancelled: { label: '已取消', color: 'error' },
  completed: { label: '已结束', color: 'blue' },
} as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function dateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function displayDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
}

function dateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function moneyMinor(value: number) {
  return value === 0 ? '免费' : `¥${(value / 100).toFixed(2)}`;
}

const registrationStatus: Record<
  AdmissionTrialRegistration['status'],
  { label: string; color: string }
> = {
  pending_payment: { label: '待支付', color: 'gold' },
  booked: { label: '已预约', color: 'purple' },
  checked_in: { label: '已签到', color: 'success' },
  no_show: { label: '未到场', color: 'orange' },
  cancelled: { label: '已取消', color: 'default' },
  expired: { label: '已过期', color: 'error' },
};

const paymentStatus: Record<
  AdmissionTrialRegistration['paymentStatus'],
  { label: string; color: string }
> = {
  not_required: { label: '无需支付', color: 'default' },
  pending: { label: '待支付', color: 'gold' },
  succeeded: { label: '已支付', color: 'success' },
  failed: { label: '支付失败', color: 'error' },
  closed: { label: '已关闭', color: 'default' },
  refunded: { label: '已退款', color: 'cyan' },
};

export function AdmissionsPage({ initialTab = 'leads' }: { initialTab?: 'leads' | 'trials' }) {
  return (
    <PageContainer
      title="招生转化"
      description="记录线索、跟进、试听和转化；试听是交付前的体验事件，不直接改变课时账本。"
    >
      <Tabs
        defaultActiveKey={initialTab}
        items={[
          { key: 'leads', label: '线索跟进', children: <LeadsPanel /> },
          { key: 'trials', label: '试听转化', children: <TrialsPanel /> },
        ]}
      />
    </PageContainer>
  );
}

function LeadsPanel() {
  const { message } = App.useApp();
  const canManage = useCan('education.leads.manage');
  const [status, setStatus] = useState<AdmissionLeadStatus>();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<AdmissionLead | null>(null);
  const leads = useAdmissionLeads({ page: 1, pageSize: 100, search: search || undefined, status });
  const users = useUsers({ page: 1, pageSize: 100, status: 'active' });
  const create = useCreateAdmissionLead();

  async function submit(values: CreateAdmissionLeadRequest) {
    try {
      await create.mutateAsync({
        ...values,
        guardianName: values.guardianName.trim(),
        phone: values.phone.trim(),
        studentName: values.studentName.trim(),
      });
      message.success('线索已创建');
      setCreateOpen(false);
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="搜索学员、家长或手机号"
            style={{ width: 300 }}
            onSearch={(value) => setSearch(value.trim())}
          />
          <Select
            allowClear
            placeholder="线索状态"
            style={{ width: 150 }}
            value={status}
            options={Object.entries(leadStatus).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onChange={setStatus}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={leads.isFetching}
            onClick={() => void leads.refetch()}
          >
            刷新
          </Button>
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新增线索
            </Button>
          )}
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={leads.isPending}
          error={leads.error}
          empty={leads.data?.items.length === 0}
        >
          <Table<AdmissionLead>
            rowKey="id"
            scroll={{ x: 1050 }}
            dataSource={leads.data?.items ?? []}
            pagination={false}
            columns={[
              {
                title: '学员 / 家长',
                width: 210,
                render: (_, item) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{item.studentName}</Typography.Text>
                    <Typography.Text type="secondary">
                      {item.guardianName} · {item.phone}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '来源',
                width: 180,
                render: (_, item) => (
                  <span>
                    {item.source ?? '未记录'}
                    {item.sourceDetail ? ` · ${item.sourceDetail}` : ''}
                  </span>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 130,
                render: (value: AdmissionLeadStatus) => (
                  <Tag color={leadStatus[value].color}>{leadStatus[value].label}</Tag>
                ),
              },
              { title: '下次跟进', dataIndex: 'nextFollowUpAt', width: 180, render: displayDate },
              { title: '创建时间', dataIndex: 'createdAt', width: 180, render: displayDate },
              {
                title: '操作',
                fixed: 'right',
                width: 100,
                render: (_, item) => (
                  <Button type="link" icon={<EditOutlined />} onClick={() => setSelected(item)}>
                    处理
                  </Button>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <LeadModal open={Boolean(selected)} lead={selected} onClose={() => setSelected(null)} />
      <Modal
        title="新增线索"
        open={createOpen}
        footer={null}
        destroyOnClose
        onCancel={() => setCreateOpen(false)}
      >
        <LeadForm
          users={users.data?.items ?? []}
          loading={create.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={submit}
        />
      </Modal>
    </>
  );
}

function LeadForm({
  users,
  loading,
  onCancel,
  onSubmit,
}: {
  users: readonly AccessUser[];
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateAdmissionLeadRequest) => Promise<void>;
}) {
  const [form] = Form.useForm<CreateAdmissionLeadRequest>();
  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onSubmit}
      initialValues={{ grade: null, source: null, sourceDetail: null }}
    >
      <Form.Item
        name="studentName"
        label="学员姓名"
        rules={[{ required: true, message: '请输入学员姓名' }]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        name="guardianName"
        label="家长姓名"
        rules={[{ required: true, message: '请输入家长姓名' }]}
      >
        <Input />
      </Form.Item>
      <Form.Item
        name="phone"
        label="联系电话"
        rules={[{ required: true, message: '请输入联系电话' }]}
      >
        <Input />
      </Form.Item>
      <Form.Item name="grade" label="年级">
        <Input />
      </Form.Item>
      <Form.Item name="source" label="来源">
        <Input placeholder="例如：内容文章、朋友推荐" />
      </Form.Item>
      <Form.Item name="sourceDetail" label="来源补充">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item name="ownerUserId" label="负责人">
        <Select
          allowClear
          options={users.map((user) => ({
            value: user.id,
            label: user.displayName || user.email || user.phone || user.id,
          }))}
        />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            保存线索
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
}

function LeadModal({
  open,
  lead,
  onClose,
}: {
  open: boolean;
  lead: AdmissionLead | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const canManage = useCan('education.leads.manage');
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const users = useUsers({ page: 1, pageSize: 100, status: 'active' });
  const trials = useAdmissionTrials({ page: 1, pageSize: 100, status: 'open' });
  const followUps = useAdmissionFollowUps(lead?.id ?? null);
  const update = useUpdateAdmissionLead();
  const addFollowUp = useAddAdmissionFollowUp();
  const book = useBookAdmissionTrial();
  const convert = useConvertAdmissionLead();
  const [followUpText, setFollowUpText] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [trialId, setTrialId] = useState<string>();
  const [institutionId, setInstitutionId] = useState<string>();

  if (!lead) return null;
  const currentLead = lead;
  const selectedTrial = (trials.data?.items ?? []).find((item) => item.id === trialId);
  async function updateLead(input: { status?: AdmissionLeadStatus; ownerUserId?: string | null }) {
    try {
      await update.mutateAsync({
        id: currentLead.id,
        input: { expectedRevision: currentLead.revision, ...input },
      });
      message.success('线索信息已更新');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  async function submitFollowUp() {
    if (!followUpText.trim()) return;
    try {
      await addFollowUp.mutateAsync({
        id: currentLead.id,
        input: { content: followUpText.trim(), nextFollowUpAt: dateTime(nextFollowUpAt) },
      });
      setFollowUpText('');
      setNextFollowUpAt('');
      message.success('跟进记录已添加');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  async function bookTrial() {
    if (!trialId) return;
    try {
      await book.mutateAsync({ id: currentLead.id, input: { trialSessionId: trialId } });
      message.success('试听已预约');
      setTrialId(undefined);
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  async function convertLead() {
    if (!institutionId) return;
    try {
      await convert.mutateAsync({
        id: currentLead.id,
        input: { institutionId, preferredName: currentLead.studentName, school: null },
      });
      message.success('已转为学员档案');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  return (
    <Modal
      title={`处理线索：${lead.studentName}`}
      open={open}
      width={720}
      footer={null}
      destroyOnClose
      onCancel={onClose}
    >
      <Descriptions
        size="small"
        column={2}
        bordered
        items={[
          { key: 'guardian', label: '家长', children: `${lead.guardianName} · ${lead.phone}` },
          { key: 'grade', label: '年级', children: lead.grade ?? '—' },
          { key: 'source', label: '来源', children: lead.source ?? '未记录' },
          { key: 'created', label: '创建时间', children: displayDate(lead.createdAt) },
        ]}
      />
      <Card size="small" title="推进状态" style={{ marginTop: 16 }}>
        <Space wrap>
          <Select
            value={lead.status}
            disabled={!canManage || update.isPending}
            style={{ width: 170 }}
            options={Object.entries(leadStatus).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onChange={(value) => void updateLead({ status: value })}
          />
          <Select
            allowClear
            placeholder="负责人"
            value={lead.ownerUserId ?? undefined}
            disabled={!canManage || update.isPending}
            style={{ width: 190 }}
            options={(users.data?.items ?? []).map((user) => ({
              value: user.id,
              label: user.displayName || user.email || user.phone || user.id,
            }))}
            onChange={(value) => void updateLead({ ownerUserId: value ?? null })}
          />
          {lead.convertedStudentId && <Tag color="success">已生成学员档案</Tag>}
        </Space>
      </Card>
      <Card size="small" title="添加跟进" style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input.TextArea
            disabled={!canManage}
            rows={3}
            value={followUpText}
            onChange={(event) => setFollowUpText(event.target.value)}
            placeholder="记录沟通结论、家长需求和下一步动作"
          />
          <Input
            disabled={!canManage}
            type="datetime-local"
            value={nextFollowUpAt}
            onChange={(event) => setNextFollowUpAt(event.target.value)}
          />
          <Button
            disabled={!canManage || !followUpText.trim()}
            loading={addFollowUp.isPending}
            onClick={() => void submitFollowUp()}
          >
            保存跟进记录
          </Button>
        </Space>
        <Typography.Text type="secondary">
          已有记录：{followUps.data?.items.length ?? 0} 条
        </Typography.Text>
      </Card>
      <Card size="small" title="试听与转化" style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Select
              allowClear
              placeholder="选择可预约试听"
              style={{ minWidth: 310 }}
              value={trialId}
              options={(trials.data?.items ?? []).map((item) => ({
                value: item.id,
                label: `${item.title} · ${displayDate(item.startsAt)} · ${item.bookedCount}/${item.capacity} · ${moneyMinor(item.reservationFeeAmountMinor)}`,
              }))}
              onChange={setTrialId}
            />
            <Button
              disabled={!canManage || !trialId || Boolean(selectedTrial?.reservationFeeAmountMinor)}
              loading={book.isPending}
              onClick={() => void bookTrial()}
            >
              预约试听
            </Button>
          </Space>
          {selectedTrial && selectedTrial.reservationFeeAmountMinor > 0 && (
            <Typography.Text type="warning">
              该场次需要支付 {moneyMinor(selectedTrial.reservationFeeAmountMinor)}{' '}
              占位费，后台不能直接预约；请引导家长在微信小程序完成占位费支付。若直接操作，系统会返回“需走占位费支付”，不会伪造已支付状态。
            </Typography.Text>
          )}
          <Space wrap>
            <Select
              allowClear
              placeholder="转化到所属机构"
              style={{ minWidth: 230 }}
              value={institutionId}
              options={(institutions.data?.items ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onChange={setInstitutionId}
            />
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              disabled={!canManage || !institutionId || Boolean(lead.convertedStudentId)}
              loading={convert.isPending}
              onClick={() => void convertLead()}
            >
              转为学员档案
            </Button>
          </Space>
        </Space>
      </Card>
      <FollowUpList followUps={followUps.data?.items ?? []} />
    </Modal>
  );
}

function FollowUpList({
  followUps,
}: {
  followUps: readonly {
    id: string;
    content: string;
    nextFollowUpAt: string | null;
    createdAt: string;
  }[];
}) {
  if (followUps.length === 0) return null;
  return (
    <Card size="small" title="跟进时间线" style={{ marginTop: 16 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {followUps.map((item) => (
          <div key={item.id}>
            <Typography.Text strong>{displayDate(item.createdAt)}</Typography.Text>
            <div>{item.content}</div>
            {item.nextFollowUpAt && (
              <Typography.Text type="secondary">
                下次跟进：{displayDate(item.nextFollowUpAt)}
              </Typography.Text>
            )}
          </div>
        ))}
      </Space>
    </Card>
  );
}

function TrialsPanel() {
  const { message } = App.useApp();
  const canManage = useCan('education.leads.manage');
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const trials = useAdmissionTrials({ page: 1, pageSize: 100 });
  const create = useCreateAdmissionTrial();
  const update = useUpdateAdmissionTrial();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTrial, setEditingTrial] = useState<AdmissionTrialSession | null>(null);
  const [selected, setSelected] = useState<AdmissionTrialSession | null>(null);
  const [institutionId, setInstitutionId] = useState<string>();

  async function submit(values: CreateAdmissionTrialRequest) {
    try {
      if (editingTrial) {
        const input: UpdateAdmissionTrialRequest = {
          ...values,
          expectedRevision: editingTrial.revision,
        };
        await update.mutateAsync({ id: editingTrial.id, input });
        message.success('试听场次已更新');
      } else {
        await create.mutateAsync(values);
        message.success('试听场次已创建');
      }
      setCreateOpen(false);
      setEditingTrial(null);
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  async function closeTrial(item: AdmissionTrialSession) {
    try {
      await update.mutateAsync({
        id: item.id,
        input: { expectedRevision: item.revision, status: 'closed' },
      });
      message.success('试听场次已关闭');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="机构"
            style={{ width: 220 }}
            value={institutionId}
            options={(institutions.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            onChange={setInstitutionId}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={trials.isFetching}
            onClick={() => void trials.refetch()}
          >
            刷新
          </Button>
          {canManage && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingTrial(null);
                setCreateOpen(true);
              }}
            >
              新增试听场次
            </Button>
          )}
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={trials.isPending}
          error={trials.error}
          empty={trials.data?.items.length === 0}
        >
          <Table<AdmissionTrialSession>
            rowKey="id"
            scroll={{ x: 1220 }}
            dataSource={(trials.data?.items ?? []).filter(
              (item) => !institutionId || item.institutionId === institutionId,
            )}
            pagination={false}
            columns={[
              {
                title: '试听场次',
                dataIndex: 'title',
                width: 230,
                render: (value: string, item) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{value}</Typography.Text>
                    <Typography.Text type="secondary">
                      {displayDate(item.startsAt)} — {displayDate(item.endsAt)}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '容量占用',
                width: 120,
                render: (_, item) => `${item.bookedCount} / ${item.capacity} 人`,
              },
              {
                title: '占位费',
                width: 110,
                render: (_, item) => moneyMinor(item.reservationFeeAmountMinor),
              },
              {
                title: '占位规则',
                width: 190,
                render: (_, item) => (
                  <Space direction="vertical" size={0}>
                    <span>{item.reservationHoldMinutes} 分钟内完成支付</span>
                    <Typography.Text type="secondary">
                      提前 {item.reservationRefundCutoffHours} 小时可退
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (value: keyof typeof trialStatus) => (
                  <Tag color={trialStatus[value].color}>{trialStatus[value].label}</Tag>
                ),
              },
              { title: '说明', dataIndex: 'notes', render: (value: string | null) => value || '—' },
              {
                title: '操作',
                width: 240,
                render: (_, item) => (
                  <Space>
                    {canManage && item.status === 'open' && (
                      <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditingTrial(item);
                          setCreateOpen(true);
                        }}
                      >
                        编辑
                      </Button>
                    )}
                    <Button type="link" onClick={() => setSelected(item)}>
                      报名名单
                    </Button>
                    {canManage && item.status === 'open' && (
                      <Button type="link" danger onClick={() => void closeTrial(item)}>
                        关闭
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <TrialFormModal
        open={createOpen}
        loading={create.isPending || update.isPending}
        institutions={institutions.data?.items ?? []}
        trial={editingTrial}
        onCancel={() => setCreateOpen(false)}
        onSubmit={submit}
      />
      <RegistrationModal trial={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function TrialFormModal({
  open,
  loading,
  institutions,
  trial,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  institutions: readonly { id: string; name: string }[];
  trial: AdmissionTrialSession | null;
  onCancel: () => void;
  onSubmit: (values: CreateAdmissionTrialRequest) => Promise<void>;
}) {
  type TrialFormValues = Omit<CreateAdmissionTrialRequest, 'reservationFeeAmountMinor'> & {
    reservationFeeAmountYuan: number;
  };
  const [form] = Form.useForm<TrialFormValues>();
  const institutionId = Form.useWatch('institutionId', form) ?? null;
  const campuses = useCampuses({ page: 1, pageSize: 100, status: 'active' });
  const courses = useCourses(institutionId, { page: 1, pageSize: 100, status: 'active' });
  const teachers = useTeachers(institutionId, Boolean(institutionId));
  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      institutionId: trial?.institutionId,
      campusId: trial?.campusId ?? null,
      courseId: trial?.courseId ?? null,
      teacherId: trial?.teacherId ?? null,
      title: trial?.title ?? '',
      startsAt: dateTimeLocal(trial?.startsAt),
      endsAt: dateTimeLocal(trial?.endsAt),
      capacity: trial?.capacity ?? 10,
      reservationFeeAmountYuan: trial ? trial.reservationFeeAmountMinor / 100 : 0,
      reservationHoldMinutes: trial?.reservationHoldMinutes ?? 15,
      reservationRefundCutoffHours: trial?.reservationRefundCutoffHours ?? 12,
      notes: trial?.notes ?? null,
    });
  }, [form, open, trial]);

  function submit(values: TrialFormValues) {
    const { reservationFeeAmountYuan, ...rest } = values;
    return onSubmit({
      ...rest,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
      reservationFeeAmountMinor: Math.round(reservationFeeAmountYuan * 100),
    });
  }

  return (
    <Modal
      title={trial ? '编辑试听场次' : '新增试听场次'}
      open={open}
      footer={null}
      destroyOnClose
      onCancel={onCancel}
    >
      <Typography.Paragraph type="secondary">
        课程、校区和教师只是试听场次的服务上下文，不会限制课时包或课时消费；占位费仅用于锁定试听名额。
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        initialValues={{
          capacity: 10,
          reservationFeeAmountYuan: 0,
          reservationHoldMinutes: 15,
          reservationRefundCutoffHours: 12,
        }}
      >
        <Form.Item
          name="institutionId"
          label="所属机构"
          rules={[{ required: true, message: '请选择机构' }]}
        >
          <Select options={institutions.map((item) => ({ value: item.id, label: item.name }))} />
        </Form.Item>
        <Form.Item name="campusId" label="校区（可选）">
          <Select
            allowClear
            options={(campuses.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </Form.Item>
        <Form.Item name="courseId" label="课程（可选）">
          <Select
            allowClear
            options={(courses.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </Form.Item>
        <Form.Item name="teacherId" label="教师（可选）">
          <Select
            allowClear
            options={(teachers.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.fullName,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="title"
          label="场次名称"
          rules={[{ required: true, message: '请输入场次名称' }]}
        >
          <Input placeholder="例如：周六上午体验课" />
        </Form.Item>
        <Form.Item
          name="startsAt"
          label="开始时间"
          rules={[{ required: true, message: '请选择开始时间' }]}
        >
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item
          name="endsAt"
          label="结束时间"
          rules={[{ required: true, message: '请选择结束时间' }]}
        >
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="capacity" label="人数上限" initialValue={10} rules={[{ required: true }]}>
          <InputNumber min={1} max={500} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="reservationFeeAmountYuan"
          label="占位费（元）"
          extra="填写 0 表示免费试听；收费场次必须由家长在微信小程序完成支付。"
          rules={[{ required: true, message: '请输入占位费，免费场次填写 0' }]}
        >
          <InputNumber min={0} precision={2} step={0.01} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="reservationHoldMinutes"
          label="支付占位时长（分钟）"
          extra="报名创建后，家长需要在此时长内完成支付。"
          rules={[
            { required: true, type: 'number', min: 5, max: 60, message: '请输入 5～60 分钟' },
          ]}
        >
          <InputNumber min={5} max={60} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="reservationRefundCutoffHours"
          label="退款截止提前小时数"
          extra="距离试听开始不足该小时数时，取消将不再自动退还占位费。"
          rules={[
            { required: true, type: 'number', min: 0, max: 168, message: '请输入 0～168 小时' },
          ]}
        >
          <InputNumber min={0} max={168} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label="说明">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              保存场次
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RegistrationModal({
  trial,
  onClose,
}: {
  trial: AdmissionTrialSession | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const canManage = useCan('education.leads.manage');
  const registrations = useAdmissionRegistrations(trial?.id ?? null);
  const checkIn = useCheckInAdmissionTrial();
  async function handleCheckIn(leadId: string) {
    if (!trial) return;
    try {
      await checkIn.mutateAsync({ trialId: trial.id, leadId });
      message.success('已签到');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  return (
    <Modal
      title={trial ? `${trial.title} · 报名名单` : '报名名单'}
      open={Boolean(trial)}
      width={1080}
      footer={null}
      onCancel={onClose}
    >
      <AsyncState
        loading={registrations.isPending}
        error={registrations.error}
        empty={registrations.data?.items.length === 0}
      >
        <Table<AdmissionTrialRegistration>
          rowKey="id"
          dataSource={registrations.data?.items ?? []}
          pagination={false}
          scroll={{ x: 980 }}
          columns={[
            {
              title: '学员 / 家长',
              width: 180,
              render: (_, item) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{item.studentNameSnapshot ?? '未记录'}</Typography.Text>
                  <Typography.Text type="secondary">
                    {item.guardianNameSnapshot ?? '未记录'} · {item.phoneSnapshot ?? '—'}
                  </Typography.Text>
                </Space>
              ),
            },
            {
              title: '预约状态',
              dataIndex: 'status',
              width: 110,
              render: (value: AdmissionTrialRegistration['status']) => (
                <Tag color={registrationStatus[value].color}>{registrationStatus[value].label}</Tag>
              ),
            },
            {
              title: '占位费',
              width: 130,
              render: (_, item) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text>{moneyMinor(item.amountMinor)}</Typography.Text>
                  <Tag color={paymentStatus[item.paymentStatus].color}>
                    {paymentStatus[item.paymentStatus].label}
                  </Tag>
                </Space>
              ),
            },
            {
              title: '订单 / 收据',
              width: 220,
              render: (_, item) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text copyable={Boolean(item.orderNo)}>
                    {item.orderNo ?? '免费预约，无订单'}
                  </Typography.Text>
                  <Typography.Text type="secondary">{item.receiptNo ?? '—'}</Typography.Text>
                </Space>
              ),
            },
            {
              title: '支付 / 过期时间',
              width: 190,
              render: (_, item) => (
                <Space direction="vertical" size={0}>
                  <span>支付：{displayDate(item.paidAt)}</span>
                  <Typography.Text type="secondary">
                    保留至：{displayDate(item.expiresAt)}
                  </Typography.Text>
                </Space>
              ),
            },
            { title: '签到时间', dataIndex: 'checkedInAt', render: displayDate },
            {
              title: '操作',
              render: (_, item) => (
                <Button
                  type="link"
                  icon={<CheckCircleOutlined />}
                  disabled={!canManage || item.status !== 'booked'}
                  onClick={() => void handleCheckIn(item.leadId)}
                >
                  签到
                </Button>
              ),
            },
          ]}
        />
      </AsyncState>
    </Modal>
  );
}
