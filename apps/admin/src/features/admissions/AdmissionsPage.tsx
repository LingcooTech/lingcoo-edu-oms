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
  AdmissionTrialSession,
  CreateAdmissionLeadRequest,
  CreateAdmissionTrialRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  App,
  Button,
  Card,
  DatePicker,
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
import { useState } from 'react';

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
                label: `${item.title} · ${displayDate(item.startsAt)} · ${item.bookedCount}/${item.capacity}`,
              }))}
              onChange={setTrialId}
            />
            <Button
              disabled={!canManage || !trialId}
              loading={book.isPending}
              onClick={() => void bookTrial()}
            >
              预约试听
            </Button>
          </Space>
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
  const [selected, setSelected] = useState<AdmissionTrialSession | null>(null);
  const [institutionId, setInstitutionId] = useState<string>();

  async function submit(values: CreateAdmissionTrialRequest) {
    try {
      await create.mutateAsync(values);
      message.success('试听场次已创建');
      setCreateOpen(false);
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
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
            scroll={{ x: 1000 }}
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
                title: '名额',
                width: 100,
                render: (_, item) => `${item.bookedCount} / ${item.capacity}`,
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
                width: 180,
                render: (_, item) => (
                  <Space>
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
        loading={create.isPending}
        institutions={institutions.data?.items ?? []}
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
  onCancel,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  institutions: readonly { id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (values: CreateAdmissionTrialRequest) => Promise<void>;
}) {
  const [form] = Form.useForm<CreateAdmissionTrialRequest>();
  const institutionId = Form.useWatch('institutionId', form) ?? null;
  const campuses = useCampuses({ page: 1, pageSize: 100, status: 'active' });
  const courses = useCourses(institutionId, { page: 1, pageSize: 100, status: 'active' });
  const teachers = useTeachers(institutionId, Boolean(institutionId));
  return (
    <Modal title="新增试听场次" open={open} footer={null} destroyOnClose onCancel={onCancel}>
      <Form form={form} layout="vertical" onFinish={onSubmit}>
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
          <DatePicker
            showTime
            style={{ width: '100%' }}
            onChange={(value) => form.setFieldValue('startsAt', value?.toISOString())}
          />
        </Form.Item>
        <Form.Item
          name="endsAt"
          label="结束时间"
          rules={[{ required: true, message: '请选择结束时间' }]}
        >
          <DatePicker
            showTime
            style={{ width: '100%' }}
            onChange={(value) => form.setFieldValue('endsAt', value?.toISOString())}
          />
        </Form.Item>
        <Form.Item name="capacity" label="人数上限" initialValue={10} rules={[{ required: true }]}>
          <InputNumber min={1} max={500} style={{ width: '100%' }} />
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
      width={680}
      footer={null}
      onCancel={onClose}
    >
      <AsyncState
        loading={registrations.isPending}
        error={registrations.error}
        empty={registrations.data?.items.length === 0}
      >
        <Table
          rowKey="id"
          dataSource={registrations.data?.items ?? []}
          pagination={false}
          columns={[
            { title: '线索 ID', dataIndex: 'leadId' },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value: string) => (
                <Tag>
                  {value === 'checked_in'
                    ? '已签到'
                    : value === 'cancelled'
                      ? '已取消'
                      : value === 'no_show'
                        ? '未到场'
                        : '已预约'}
                </Tag>
              ),
            },
            { title: '签到时间', dataIndex: 'checkedInAt', render: displayDate },
            {
              title: '操作',
              render: (_, item: { leadId: string; status: string }) => (
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
