import {
  CalendarOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { ApiClientError } from '@lingcoo-edu-oms/api-client';
import type {
  CreateScheduleRequest,
  GenerateScheduleRequest,
  GenerateScheduleResponse,
  InstitutionTeacher,
  ReplaceScheduleTeachersRequest,
  Schedule,
  ScheduleConflict,
  ScheduleTeacherAssignment,
  UpdateScheduleRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions } from '../organization/hooks';
import { useTeachers } from '../people/hooks';
import {
  useCampuses,
  useClasses,
  useClassrooms,
  useCourses,
  useCreateSchedule,
  useGenerateSchedule,
  useReplaceScheduleTeachers,
  useScheduleTeachers,
  useSchedules,
  useUpdateSchedule,
} from './hooks';

const days = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];
const statuses = [
  { value: 'active', label: '启用' },
  { value: 'inactive', label: '停用' },
];
const timeZones = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai（中国标准时间）' },
  { value: 'UTC', label: 'UTC' },
];
const errText = (e: unknown) => (e instanceof Error ? e.message : '操作失败，请稍后重试');
const dateText = (v: string) => v;

type FormValues = Omit<CreateScheduleRequest, 'status'>;
type SelectOption = { value: string; label: string };

export function SchedulePlansPage() {
  const { message } = App.useApp();
  const canManageSessions = useCan('education.sessions.manage');
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | undefined>();
  const [editing, setEditing] = useState<Schedule | null | undefined>();
  const [teacherSchedule, setTeacherSchedule] = useState<Schedule | null>(null);
  const [generateSchedule, setGenerateSchedule] = useState<Schedule | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [result, setResult] = useState<GenerateScheduleResponse | null>(null);
  const schedules = useSchedules(institutionId, {
    page: 1,
    pageSize: 100,
    search: search || undefined,
    status,
  });
  const courses = useCourses(institutionId);
  const classes = useClasses(institutionId);
  const campuses = useCampuses({ page: 1, pageSize: 100, status: 'active' });
  const selectedCampusId =
    editing?.campusId ?? teacherSchedule?.campusId ?? generateSchedule?.campusId ?? null;
  const classrooms = useClassrooms(selectedCampusId, { page: 1, pageSize: 100, status: 'active' });
  const teachers = useTeachers(institutionId, true);
  const scheduleTeachers = useScheduleTeachers(institutionId, teacherSchedule?.id ?? null);
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const replaceTeachers = useReplaceScheduleTeachers();
  const generate = useGenerateSchedule();
  useEffect(() => {
    if (!institutionId && institutions.data?.items[0])
      setInstitutionId(institutions.data.items[0].id);
  }, [institutionId, institutions.data]);
  const institutionOptions = (institutions.data?.items ?? []).map((v) => ({
    value: v.id,
    label: v.name,
  }));
  const courseOptions = (courses.data?.items ?? [])
    .filter((v) => v.status === 'active')
    .map((v) => ({ value: v.id, label: v.name }));
  const classOptions = (classes.data?.items ?? [])
    .filter((v) => ['active', 'recruiting'].includes(v.status))
    .map((v) => ({ value: v.id, label: v.name }));
  const campusOptions = (campuses.data?.items ?? []).map((v) => ({ value: v.id, label: v.name }));
  const classroomOptions = (classrooms.data?.items ?? []).map((v) => ({
    value: v.id,
    label: v.name,
  }));
  async function save(values: FormValues) {
    if (!institutionId) return;
    try {
      if (editing)
        await update.mutateAsync({
          institutionId,
          id: editing.id,
          input: { expectedRevision: editing.revision, ...values } as UpdateScheduleRequest,
        });
      else await create.mutateAsync({ institutionId, input: values as CreateScheduleRequest });
      setEditing(undefined);
      void message.success(editing ? '排课计划已更新；已生成课次不受影响' : '排课计划已创建');
    } catch (e) {
      void message.error(errText(e));
    }
  }
  async function runGenerate(values: { includeClassStudents: boolean; reason?: string }) {
    if (!generateSchedule) return;
    const input: GenerateScheduleRequest = {
      expectedRevision: generateSchedule.revision,
      includeClassStudents: values.includeClassStudents,
      allowConflicts: conflicts.length > 0,
      conflictReason: values.reason?.trim() || null,
    };
    try {
      const response = await generate.mutateAsync({
        institutionId: generateSchedule.institutionId,
        id: generateSchedule.id,
        input,
      });
      setGenerateSchedule(null);
      setConflicts([]);
      setResult(response);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'SCHEDULE_CONFLICT') {
        const details = e.details as { conflicts?: ScheduleConflict[] } | undefined;
        setConflicts(details?.conflicts ?? []);
        return;
      }
      void message.error(errText(e));
    }
  }
  return (
    <PageContainer
      title="排课计划"
      description="排课计划是课次生成规则；编辑计划不会修改已经生成的课次。"
      actions={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!institutionId || !canManageSessions}
          onClick={() => setEditing(null)}
        >
          新建排课计划
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        message="可选资源关系"
        description="课程、班级、校区、教室和教师都是课次上下文，不是课时权益限制。生成后课次与计划独立。"
        style={{ marginBottom: 16 }}
      />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Typography.Text strong>当前机构</Typography.Text>
          <Select
            showSearch
            optionFilterProp="label"
            value={institutionId}
            options={institutionOptions}
            style={{ minWidth: 280 }}
            onChange={setInstitutionId}
          />
          <Input.Search
            allowClear
            placeholder="搜索计划"
            style={{ width: 240 }}
            onSearch={(v) => setSearch(v.trim())}
          />
          <Select
            allowClear
            placeholder="状态"
            options={statuses}
            style={{ width: 120 }}
            onChange={setStatus}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void schedules.refetch()}>
            刷新
          </Button>
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={schedules.isPending}
          error={schedules.error}
          empty={!schedules.data?.items.length}
        >
          <Table<Schedule>
            rowKey="id"
            dataSource={schedules.data?.items}
            scroll={{ x: 1250 }}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: '计划名称', dataIndex: 'name', fixed: 'left', width: 200 },
              { title: '课次名称', dataIndex: 'sessionName' },
              {
                title: '周期',
                render: (_, v) =>
                  `${dateText(v.startDate)} - ${dateText(v.endDate)} · ${v.weekdays.map((d) => days.find((x) => x.value === d)?.label).join('、')}`,
              },
              { title: '时间', render: (_, v) => `${v.startTime} / ${v.durationMinutes} 分钟` },
              { title: '默认课时', dataIndex: 'defaultUnits' },
              { title: '状态', dataIndex: 'status', render: (v) => <Tag>{v}</Tag> },
              {
                title: '操作',
                fixed: 'right',
                width: 280,
                render: (_, v) => (
                  <Space>
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      disabled={!canManageSessions}
                      onClick={() => setEditing(v)}
                    >
                      编辑
                    </Button>
                    <Button
                      type="link"
                      icon={<TeamOutlined />}
                      disabled={!canManageSessions}
                      onClick={() => setTeacherSchedule(v)}
                    >
                      教师
                    </Button>
                    <Button
                      type="primary"
                      ghost
                      icon={<CalendarOutlined />}
                      disabled={!canManageSessions}
                      onClick={() => {
                        setConflicts([]);
                        setGenerateSchedule(v);
                      }}
                    >
                      生成课次
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <ScheduleModal
        open={editing !== undefined}
        schedule={editing}
        loading={create.isPending || update.isPending}
        courseOptions={courseOptions}
        classOptions={classOptions}
        campusOptions={campusOptions}
        classroomOptions={classroomOptions}
        onClose={() => setEditing(undefined)}
        onSubmit={save}
      />
      <ScheduleTeachersModal
        open={Boolean(teacherSchedule)}
        schedule={teacherSchedule}
        teachers={teachers.data?.items ?? []}
        assignments={scheduleTeachers.data?.items ?? []}
        loading={replaceTeachers.isPending}
        onClose={() => setTeacherSchedule(null)}
        onSubmit={async (assignments) => {
          if (!teacherSchedule) return;
          try {
            await replaceTeachers.mutateAsync({
              institutionId: teacherSchedule.institutionId,
              id: teacherSchedule.id,
              input: { expectedRevision: teacherSchedule.revision, assignments },
            });
            setTeacherSchedule(null);
            void message.success('教师分配已保存');
          } catch (e) {
            void message.error(errText(e));
          }
        }}
      />
      <GenerateModal
        open={Boolean(generateSchedule)}
        schedule={generateSchedule}
        conflicts={conflicts}
        loading={generate.isPending}
        onClose={() => {
          setGenerateSchedule(null);
          setConflicts([]);
        }}
        onSubmit={runGenerate}
      />
      <Modal
        open={Boolean(result)}
        title="生成结果"
        footer={
          <Button type="primary" onClick={() => setResult(null)}>
            完成
          </Button>
        }
        onCancel={() => setResult(null)}
      >
        {result && (
          <Space direction="vertical">
            <Typography.Text>创建课次：{result.createdSessions.length}</Typography.Text>
            <Typography.Text>
              跳过日期：{result.skippedDates.length ? result.skippedDates.join('、') : '无'}
            </Typography.Text>
            <Typography.Text>
              冲突：{result.conflicts.length ? result.conflicts.length : '无'}
            </Typography.Text>
          </Space>
        )}
      </Modal>
    </PageContainer>
  );
}

function ScheduleModal({
  open,
  schedule,
  loading,
  courseOptions,
  classOptions,
  campusOptions,
  classroomOptions,
  onClose,
  onSubmit,
}: {
  open: boolean;
  schedule?: Schedule | null;
  loading: boolean;
  courseOptions: SelectOption[];
  classOptions: SelectOption[];
  campusOptions: SelectOption[];
  classroomOptions: SelectOption[];
  onClose(): void;
  onSubmit(v: FormValues): Promise<void>;
}) {
  const [form] = Form.useForm<FormValues>();
  useEffect(() => {
    if (open)
      form.setFieldsValue(
        schedule
          ? {
              name: schedule.name,
              sessionName: schedule.sessionName,
              startDate: schedule.startDate,
              endDate: schedule.endDate,
              weekdays: schedule.weekdays,
              startTime: schedule.startTime,
              timeZone: schedule.timeZone,
              durationMinutes: schedule.durationMinutes,
              defaultUnits: schedule.defaultUnits,
              courseId: schedule.courseId ?? undefined,
              classGroupId: schedule.classGroupId ?? undefined,
              campusId: schedule.campusId ?? undefined,
              classroomId: schedule.classroomId ?? undefined,
            }
          : {
              name: '',
              sessionName: '',
              startDate: new Date().toISOString().slice(0, 10),
              endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
              weekdays: [6],
              startTime: '10:00',
              timeZone: 'Asia/Shanghai',
              durationMinutes: 60,
              defaultUnits: 1,
            },
      );
  }, [form, open, schedule]);
  return (
    <Modal
      open={open}
      destroyOnHidden
      width={760}
      title={schedule ? '编辑排课计划' : '新建排课计划'}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="计划名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sessionName" label="课次名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="startDate" label="开始日期" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="endDate" label="结束日期" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="weekdays" label="星期" rules={[{ required: true }]}>
          <Checkbox.Group options={days} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="startTime" label="时间" rules={[{ required: true }]}>
              <Input type="time" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="timeZone" label="时区" rules={[{ required: true }]}>
              <Select options={timeZones} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="durationMinutes" label="时长" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} addonAfter="分钟" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="defaultUnits" label="默认课时" rules={[{ required: true }]}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Typography.Text strong>可选资源</Typography.Text>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="courseId" label="课程">
              <Select allowClear options={courseOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="classGroupId" label="班级">
              <Select allowClear options={classOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="campusId" label="校区">
              <Select allowClear options={campusOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="classroomId" label="教室">
              <Select allowClear options={classroomOptions} />
            </Form.Item>
          </Col>
        </Row>
        <Alert
          type="info"
          showIcon
          message="编辑计划不影响已生成课次"
          description="只影响以后生成的课次。"
        />
      </Form>
    </Modal>
  );
}

function ScheduleTeachersModal({
  open,
  schedule,
  teachers,
  assignments,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  schedule: Schedule | null;
  teachers: InstitutionTeacher[];
  assignments: ScheduleTeacherAssignment[];
  loading: boolean;
  onClose(): void;
  onSubmit(v: ReplaceScheduleTeachersRequest['assignments']): Promise<void>;
}) {
  const [form] = Form.useForm<{ instructors: string[]; assistants: string[] }>();
  const instructors = Form.useWatch('instructors', form) ?? [];
  const assistants = Form.useWatch('assistants', form) ?? [];
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        instructors: assignments.filter((x) => x.role === 'instructor').map((x) => x.teacherId),
        assistants: assignments.filter((x) => x.role === 'assistant').map((x) => x.teacherId),
      });
  }, [assignments, form, open]);
  const options = teachers
    .filter((x) => x.status === 'active')
    .map((x) => ({ value: x.id, label: x.fullName }));
  return (
    <Modal
      open={open}
      destroyOnHidden
      title={`教师分配${schedule ? ` · ${schedule.name}` : ''}`}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) =>
          onSubmit([
            ...v.instructors.map((teacherId) => ({ teacherId, role: 'instructor' as const })),
            ...v.assistants.map((teacherId) => ({ teacherId, role: 'assistant' as const })),
          ])
        }
      >
        <Form.Item name="instructors" label="授课教师">
          <Select mode="multiple" options={options.filter((x) => !assistants.includes(x.value))} />
        </Form.Item>
        <Form.Item name="assistants" label="助教">
          <Select mode="multiple" options={options.filter((x) => !instructors.includes(x.value))} />
        </Form.Item>
        <Alert
          type="info"
          showIcon
          message="教师复制到新课次"
          description="修改计划教师不会影响已经生成的课次。"
        />
      </Form>
    </Modal>
  );
}

function GenerateModal({
  open,
  schedule,
  conflicts,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  schedule: Schedule | null;
  conflicts: ScheduleConflict[];
  loading: boolean;
  onClose(): void;
  onSubmit(v: { includeClassStudents: boolean; reason?: string }): Promise<void>;
}) {
  const [form] = Form.useForm<{ includeClassStudents: boolean; reason?: string }>();
  useEffect(() => {
    if (open) form.setFieldsValue({ includeClassStudents: false, reason: undefined });
  }, [form, open]);
  return (
    <Modal
      open={open}
      destroyOnHidden
      width={700}
      title={`生成课次${schedule ? ` · ${schedule.name}` : ''}`}
      okText={conflicts.length ? '确认覆盖并生成' : '生成课次'}
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ danger: conflicts.length > 0 }}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        {conflicts.length ? (
          <Alert
            type="warning"
            showIcon
            message={`发现 ${conflicts.length} 个草稿/进行中冲突`}
            description={
              <Space direction="vertical">
                {conflicts.map((x) => (
                  <span key={`${x.date}-${x.existingSessionId}`}>
                    {x.date} · {x.resourceType === 'teacher' ? '教师' : '教室'} ·{' '}
                    {x.existingSessionName}
                  </span>
                ))}
              </Space>
            }
            style={{ marginBottom: 16 }}
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="首次生成将由服务端检查冲突"
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item name="includeClassStudents" valuePropName="checked">
          <Checkbox disabled={!schedule?.classGroupId}>复制班级当前学员到课次名单</Checkbox>
          <Typography.Paragraph type="secondary">
            默认关闭；复制后名单与班级独立，修改班级不会回写课次。
          </Typography.Paragraph>
        </Form.Item>
        {conflicts.length ? (
          <Form.Item
            name="reason"
            label="覆盖原因"
            rules={[{ required: true, message: '覆盖冲突必须填写原因' }]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        ) : null}
        <Alert
          type="info"
          showIcon
          message="计划与已生成课次独立"
          description="编辑计划不会修改历史课次。"
        />
      </Form>
    </Modal>
  );
}
