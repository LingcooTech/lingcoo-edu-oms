import {
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UndoOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { ApiClientError } from '@lingcoo-edu-oms/api-client';
import type {
  CreateLessonSessionRequest,
  InstitutionTeacher,
  LessonSession,
  LessonSessionAttendanceStatus,
  LessonSessionConsumptionStatus,
  LessonSessionConsumptionSource,
  LessonSessionRosterEntry,
  LessonSessionSource,
  LessonSessionStatus,
  LessonSessionTeacherAssignment,
  PeriodCardEntitlement,
  ReplaceLessonSessionTeachersRequest,
  UpdateLessonSessionRequest,
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
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions, useOrganizationProfile } from '../organization/hooks';
import { useStudents, useTeachers } from '../people/hooks';
import { SessionResourceContext } from '../teaching-resources/SessionResourceContext';
import {
  useAddLessonSessionStudents,
  useCancelLessonSession,
  useCompleteLessonSession,
  useConsumeLessonSessionStudent,
  useConsumeLessonSessionStudents,
  useActivePeriodCardEntitlements,
  useCreateLessonSession,
  useLessonSession,
  useLessonSessionRoster,
  useLessonSessions,
  useLessonSessionTeachers,
  useOpenLessonSession,
  useRecordLessonSessionAttendance,
  useReplaceLessonSessionTeachers,
  useReverseLessonSessionConsumption,
  useUpdateLessonSession,
} from './hooks';

type PageMode = 'sessions' | 'attendance';

type SessionFormValues = {
  name: string;
  startsAt: string;
  endsAt: string;
  source: LessonSessionSource;
  defaultUnits: number;
  notes?: string;
};

type ReasonFormValues = { reason: string };
type ConsumeFormValues = {
  units: number;
  reason?: string;
  consumptionSource: LessonSessionConsumptionSource;
  periodCardEntitlementId?: string | null;
};
type BulkConsumeFormValues = { reason?: string };
type AddStudentsFormValues = { studentIds: string[] };
type TeacherAssignmentFormValues = {
  instructorIds: string[];
  assistantIds: string[];
};

const sessionStatusPresentation: Record<LessonSessionStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  open: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'error' },
};

const attendancePresentation: Record<
  LessonSessionAttendanceStatus,
  { label: string; color: string }
> = {
  pending: { label: '待点名', color: 'default' },
  present: { label: '到课', color: 'success' },
  late: { label: '迟到', color: 'warning' },
  leave: { label: '请假', color: 'blue' },
  absent: { label: '缺勤', color: 'error' },
};

const consumptionPresentation: Record<
  LessonSessionConsumptionStatus,
  { label: string; color: string }
> = {
  not_consumed: { label: '未消课', color: 'default' },
  consumed: { label: '已消课', color: 'success' },
  reversed: { label: '已撤销', color: 'blue' },
  failed: { label: '消课失败', color: 'error' },
};

const sourcePresentation: Record<LessonSessionSource, string> = {
  manual: '手工创建',
  schedule: '排课生成',
  ad_hoc: '临时课次',
};

const attendanceOptions = Object.entries(attendancePresentation).map(([value, item]) => ({
  value,
  label: item.label,
}));

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function isSessionRevisionConflict(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'LESSON_SESSION_VERSION_CONFLICT';
}

function nullable(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultTime(offsetMinutes = 0): string {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string): string {
  return new Date(value).toISOString();
}

function displayDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function displayDate(value: string | null, emptyLabel = '—'): string {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(value))
    : emptyLabel;
}

function newOperationId(): string {
  return crypto.randomUUID();
}

export function LessonSessionsPage({ mode = 'sessions' }: { mode?: PageMode }) {
  const { message, modal } = App.useApp();
  const canManageSessions = useCan('education.sessions.manage');
  const canReadAttendance = useCan('education.attendance.read');
  const canManageAttendance = useCan('education.attendance.manage');
  const canManageConsumption = useCan([
    'education.attendance.manage',
    'education.lesson-balances.manage',
  ]);
  const organization = useOrganizationProfile();
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LessonSessionStatus | undefined>(
    mode === 'attendance' ? 'open' : undefined,
  );
  const [page, setPage] = useState(1);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<LessonSession | null>(null);
  const [addStudentsOpen, setAddStudentsOpen] = useState(false);
  const [cancelSession, setCancelSession] = useState<LessonSession | null>(null);
  const [consumeEntry, setConsumeEntry] = useState<LessonSessionRosterEntry | null>(null);
  const [bulkConsumeOpen, setBulkConsumeOpen] = useState(false);
  const [selectedRosterEntryIds, setSelectedRosterEntryIds] = useState<string[]>([]);
  const [reverseEntry, setReverseEntry] = useState<LessonSessionRosterEntry | null>(null);
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [attendanceUpdatingId, setAttendanceUpdatingId] = useState<string | null>(null);

  const sessions = useLessonSessions(institutionId, {
    page,
    pageSize: 20,
    search: search || undefined,
    status,
  });
  const selectedFromList = sessions.data?.items.find((item) => item.id === selectedSessionId);
  const sessionDetail = useLessonSession(institutionId, selectedSessionId);
  const selectedSession = sessionDetail.data ?? selectedFromList ?? null;
  const roster = useLessonSessionRoster(institutionId, selectedSessionId, canReadAttendance);
  const sessionTeachers = useLessonSessionTeachers(
    institutionId,
    selectedSessionId,
    Boolean(selectedSessionId),
  );
  const teachers = useTeachers(institutionId, true);
  const students = useStudents(institutionId, {
    page: 1,
    pageSize: 100,
    status: 'active',
    relationshipStatus: 'active',
  });

  const createSession = useCreateLessonSession();
  const updateSession = useUpdateLessonSession();
  const openSession = useOpenLessonSession();
  const completeSession = useCompleteLessonSession();
  const cancelLessonSession = useCancelLessonSession();
  const addStudents = useAddLessonSessionStudents();
  const recordAttendance = useRecordLessonSessionAttendance();
  const consumeStudent = useConsumeLessonSessionStudent();
  const consumeStudents = useConsumeLessonSessionStudents();
  const reverseConsumption = useReverseLessonSessionConsumption();
  const replaceTeachers = useReplaceLessonSessionTeachers();

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0]) {
      setInstitutionId(institutions.data.items[0].id);
    }
  }, [institutionId, institutions.data]);

  useEffect(() => {
    if (!selectedSessionId && sessions.data?.items[0]) {
      setSelectedSessionId(sessions.data.items[0].id);
    }
  }, [selectedSessionId, sessions.data]);

  useEffect(() => {
    if (mode === 'attendance') setStatus('open');
  }, [mode]);

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

  const rosterItems = roster.data?.items ?? [];
  const pendingCount = rosterItems.filter((item) => item.attendanceStatus === 'pending').length;
  const attendedCount = rosterItems.filter((item) =>
    ['present', 'late'].includes(item.attendanceStatus),
  ).length;
  const consumedCount = rosterItems.filter((item) => item.consumptionStatus === 'consumed').length;
  const consumedUnits = rosterItems.reduce(
    (total, item) =>
      total + (item.consumptionStatus === 'consumed' ? (item.consumedUnits ?? 0) : 0),
    0,
  );
  const assignedTeachers = sessionTeachers.data?.items ?? [];
  const activeTeachers = (teachers.data?.items ?? []).filter(
    (teacher) => teacher.status === 'active' && teacher.relationshipStatus === 'active',
  );

  const selectableStudents = useMemo(() => {
    const rosterStudentIds = new Set(rosterItems.map((item) => item.studentId));
    return (students.data?.items ?? [])
      .filter((student) => !rosterStudentIds.has(student.id))
      .map((student) => ({
        value: student.id,
        label: [student.fullName, student.preferredName, student.grade].filter(Boolean).join(' · '),
      }));
  }, [rosterItems, students.data?.items]);

  const bulkConsumableEntries = useMemo(
    () =>
      rosterItems.filter(
        (entry) =>
          ['present', 'late'].includes(entry.attendanceStatus) &&
          ['not_consumed', 'failed', 'reversed'].includes(entry.consumptionStatus),
      ),
    [rosterItems],
  );

  useEffect(() => {
    setSelectedRosterEntryIds((selected) =>
      selected.filter((id) => bulkConsumableEntries.some((entry) => entry.id === id)),
    );
  }, [bulkConsumableEntries]);

  const handleLifecycle = async (
    action: 'open' | 'complete',
    session: LessonSession,
  ): Promise<void> => {
    try {
      const args = {
        institutionId: session.institutionId,
        sessionId: session.id,
        input: { expectedRevision: session.revision },
      };
      if (action === 'open') {
        await openSession.mutateAsync(args);
        void message.success('课次已打开，可以开始点名');
      } else {
        await completeSession.mutateAsync(args);
        void message.success('课次已完成');
      }
    } catch (error) {
      void message.error(errorMessage(error));
      throw error;
    }
  };

  return (
    <PageContainer
      title={mode === 'attendance' ? '签到消课' : '课次管理'}
      description={
        mode === 'attendance'
          ? '按课次完成点名与通用课时消费，消费记录可追溯、可撤销。'
          : '课次是签到与消课的业务载体，仅关联机构，不依赖课程、班级、教师或教室。'
      }
      actions={
        canManageSessions ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!institutionId}
            onClick={() => {
              setEditingSession(null);
              setSessionModalOpen(true);
            }}
          >
            新建课次
          </Button>
        ) : undefined
      }
    >
      <Card className="session-filter-card">
        <div className="session-filter-grid">
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择机构"
            loading={institutions.isPending}
            value={institutionId}
            options={institutionOptions}
            onChange={(value) => {
              setInstitutionId(value);
              setSelectedSessionId(null);
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            placeholder="搜索课次名称"
            onSearch={(value) => {
              setSearch(value.trim());
              setSelectedSessionId(null);
              setPage(1);
            }}
          />
          <Select
            allowClear={mode !== 'attendance'}
            placeholder="全部状态"
            value={status}
            options={Object.entries(sessionStatusPresentation).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onChange={(value) => {
              setStatus(value);
              setSelectedSessionId(null);
              setPage(1);
            }}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={sessions.isFetching || roster.isFetching}
            onClick={() => {
              void sessions.refetch();
              if (selectedSessionId && canReadAttendance) void roster.refetch();
            }}
          >
            刷新
          </Button>
        </div>
      </Card>

      <div className="session-workbench">
        <Card
          className="session-list-card"
          title={<span>课次列表</span>}
          extra={
            <Typography.Text type="secondary">共 {sessions.data?.total ?? 0} 条</Typography.Text>
          }
          styles={{ body: { padding: 0 } }}
        >
          <AsyncState
            loading={sessions.isPending}
            error={sessions.error}
            empty={sessions.data?.items.length === 0}
          >
            <div className="session-list">
              {(sessions.data?.items ?? []).map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className={`session-list-row${selectedSessionId === session.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedSessionId(session.id)}
                >
                  <span className="session-list-row__date">
                    <strong>
                      {new Intl.DateTimeFormat('zh-CN', { day: '2-digit' }).format(
                        new Date(session.startsAt),
                      )}
                    </strong>
                    <small>
                      {new Intl.DateTimeFormat('zh-CN', { month: 'short' }).format(
                        new Date(session.startsAt),
                      )}
                    </small>
                  </span>
                  <span className="session-list-row__content">
                    <strong>{session.name}</strong>
                    <small>
                      {displayDateTime(session.startsAt)} –{' '}
                      {new Intl.DateTimeFormat('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      }).format(new Date(session.endsAt))}
                    </small>
                  </span>
                  <Tag color={sessionStatusPresentation[session.status].color}>
                    {sessionStatusPresentation[session.status].label}
                  </Tag>
                </button>
              ))}
            </div>
          </AsyncState>
          {(sessions.data?.total ?? 0) > 20 && (
            <div className="session-list-pagination">
              <Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                上一页
              </Button>
              <span>第 {page} 页</span>
              <Button
                disabled={page * 20 >= (sessions.data?.total ?? 0)}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </Card>

        <Card className="session-detail-card" styles={{ body: { padding: 0 } }}>
          {!selectedSession ? (
            <Empty className="session-detail-empty" description="选择一个课次查看名单" />
          ) : (
            <>
              <div className="session-detail-header">
                <div>
                  <Space wrap size={8}>
                    <Typography.Title level={4}>{selectedSession.name}</Typography.Title>
                    <Tag color={sessionStatusPresentation[selectedSession.status].color}>
                      {sessionStatusPresentation[selectedSession.status].label}
                    </Tag>
                  </Space>
                  <Typography.Text type="secondary">
                    {displayDateTime(selectedSession.startsAt)} 至{' '}
                    {displayDateTime(selectedSession.endsAt)} · 默认 {selectedSession.defaultUnits}{' '}
                    课时
                  </Typography.Text>
                </div>
                <Space wrap>
                  {canManageSessions && ['draft', 'open'].includes(selectedSession.status) && (
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditingSession(selectedSession);
                        setSessionModalOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                  )}
                  {canManageSessions && ['draft', 'open'].includes(selectedSession.status) && (
                    <Button icon={<TeamOutlined />} onClick={() => setAddStudentsOpen(true)}>
                      添加学员
                    </Button>
                  )}
                  {canManageSessions && selectedSession.status === 'draft' && (
                    <Button
                      type="primary"
                      icon={<CalendarOutlined />}
                      loading={openSession.isPending}
                      onClick={() =>
                        modal.confirm({
                          title: '打开课次？',
                          content: '打开后即可点名和消课。',
                          okText: '确认打开',
                          onOk: () => handleLifecycle('open', selectedSession),
                        })
                      }
                    >
                      打开课次
                    </Button>
                  )}
                  {canManageSessions && selectedSession.status === 'open' && (
                    <Tooltip
                      title={pendingCount > 0 ? `还有 ${pendingCount} 位学员未点名` : undefined}
                    >
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        disabled={pendingCount > 0}
                        loading={completeSession.isPending}
                        onClick={() =>
                          modal.confirm({
                            title: '完成课次？',
                            content: '完成后不能继续修改点名状态，但仍可撤销已发生的消课。',
                            okText: '确认完成',
                            onOk: () => handleLifecycle('complete', selectedSession),
                          })
                        }
                      >
                        完成课次
                      </Button>
                    </Tooltip>
                  )}
                  {canManageSessions && ['draft', 'open'].includes(selectedSession.status) && (
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={() => setCancelSession(selectedSession)}
                    >
                      取消
                    </Button>
                  )}
                </Space>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                  margin: '0 20px 16px',
                  padding: '12px 14px',
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  background: '#fafafa',
                }}
              >
                <div>
                  <Typography.Text strong>课次教师</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    {sessionTeachers.isPending ? (
                      <Spin size="small" />
                    ) : sessionTeachers.isError ? (
                      <Space size={8}>
                        <Typography.Text type="danger">教师分配读取失败</Typography.Text>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => void sessionTeachers.refetch()}
                        >
                          重试
                        </Button>
                      </Space>
                    ) : assignedTeachers.length ? (
                      <Space wrap size={[6, 6]}>
                        {assignedTeachers.map((assignment) => (
                          <Tag
                            key={assignment.teacherId}
                            color={assignment.role === 'instructor' ? 'blue' : 'purple'}
                          >
                            {assignment.teacherNameSnapshot} ·{' '}
                            {assignment.role === 'instructor' ? '授课' : '助教'}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      <Typography.Text type="secondary">尚未分配教师</Typography.Text>
                    )}
                  </div>
                </div>
                {canManageSessions && ['draft', 'open'].includes(selectedSession.status) && (
                  <Button
                    size="small"
                    icon={<TeamOutlined />}
                    disabled={
                      sessionTeachers.isPending ||
                      sessionTeachers.isError ||
                      teachers.isPending ||
                      teachers.isError
                    }
                    onClick={() => setTeacherModalOpen(true)}
                  >
                    管理教师
                  </Button>
                )}
              </div>

              <SessionResourceContext session={selectedSession} canManage={canManageSessions} />

              {selectedSession.cancellationReason && (
                <Alert
                  type="warning"
                  showIcon
                  message="课次已取消"
                  description={selectedSession.cancellationReason}
                  style={{ margin: '0 20px 16px' }}
                />
              )}

              <div className="session-statistics">
                <Row gutter={[12, 12]}>
                  <Col xs={12} sm={6}>
                    <Statistic title="名单人数" value={rosterItems.length} suffix="人" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="到课/迟到" value={attendedCount} suffix="人" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="已消课人数" value={consumedCount} suffix="人" />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic title="已消费课时" value={consumedUnits} precision={0} />
                  </Col>
                </Row>
              </div>

              {mode === 'attendance' && canManageConsumption && (
                <Alert
                  type="info"
                  showIcon
                  message="批量消课仅支持普通课时"
                  description="批量操作不会自动选择周期卡。需要使用周期卡时，请在对应学员行点击“消课”，逐人选择有效周期权益。"
                  action={
                    <Button
                      size="small"
                      type="primary"
                      disabled={selectedRosterEntryIds.length === 0}
                      onClick={() => setBulkConsumeOpen(true)}
                    >
                      批量消课（普通课时）
                    </Button>
                  }
                  style={{ margin: '0 20px 16px' }}
                />
              )}

              {!canReadAttendance ? (
                <Alert
                  type="info"
                  showIcon
                  message="当前账号没有查看签到名单的权限"
                  style={{ margin: 20 }}
                />
              ) : (
                <AsyncState loading={roster.isPending} error={roster.error} empty={false}>
                  <Table<LessonSessionRosterEntry>
                    rowKey="id"
                    className="session-roster-table"
                    dataSource={rosterItems}
                    pagination={false}
                    locale={{ emptyText: '暂无学员，请先添加学员到本课次' }}
                    scroll={{ x: 900 }}
                    rowSelection={
                      mode === 'attendance' && canManageConsumption
                        ? {
                            selectedRowKeys: selectedRosterEntryIds,
                            onChange: (keys) => setSelectedRosterEntryIds(keys as string[]),
                            getCheckboxProps: (entry) => ({
                              disabled: !bulkConsumableEntries.some((item) => item.id === entry.id),
                            }),
                          }
                        : undefined
                    }
                    columns={[
                      {
                        title: '学员',
                        dataIndex: 'studentNameSnapshot',
                        width: 150,
                        fixed: 'left',
                        render: (value) => <Typography.Text strong>{value}</Typography.Text>,
                      },
                      {
                        title: '点名状态',
                        dataIndex: 'attendanceStatus',
                        width: 150,
                        render: (value: LessonSessionAttendanceStatus, entry) =>
                          canManageAttendance && selectedSession.status === 'open' ? (
                            <Select
                              size="small"
                              value={value}
                              options={attendanceOptions}
                              loading={attendanceUpdatingId === entry.id}
                              style={{ width: 112 }}
                              onChange={async (attendanceStatus) => {
                                setAttendanceUpdatingId(entry.id);
                                try {
                                  await recordAttendance.mutateAsync({
                                    institutionId: entry.institutionId,
                                    sessionId: entry.lessonSessionId,
                                    rosterEntryId: entry.id,
                                    input: {
                                      expectedRevision: entry.revision,
                                      attendanceStatus,
                                    },
                                  });
                                  void message.success(`${entry.studentNameSnapshot}点名已更新`);
                                } catch (error) {
                                  void message.error(errorMessage(error));
                                } finally {
                                  setAttendanceUpdatingId(null);
                                }
                              }}
                            />
                          ) : (
                            <Tag color={attendancePresentation[value].color}>
                              {attendancePresentation[value].label}
                            </Tag>
                          ),
                      },
                      {
                        title: '消费状态',
                        dataIndex: 'consumptionStatus',
                        width: 130,
                        render: (value: LessonSessionConsumptionStatus) => (
                          <Tag color={consumptionPresentation[value].color}>
                            {consumptionPresentation[value].label}
                          </Tag>
                        ),
                      },
                      {
                        title: '消费凭据',
                        width: 190,
                        render: (_, entry) =>
                          entry.consumptionSource === 'period_card' ? (
                            <Space size={6}>
                              <Tag color="purple">周期卡</Tag>
                              <Typography.Text type="secondary">周期权益</Typography.Text>
                            </Space>
                          ) : (
                            <Space size={6}>
                              <Tag color={entry.consumptionSource ? 'cyan' : 'default'}>
                                普通课时
                              </Tag>
                              <Typography.Text type="secondary">课时账户</Typography.Text>
                            </Space>
                          ),
                      },
                      {
                        title: '课时数',
                        width: 100,
                        render: (_, entry) => (
                          <Typography.Text strong>
                            {entry.consumedUnits ?? entry.plannedUnits}
                          </Typography.Text>
                        ),
                      },
                      {
                        title: '消费结果',
                        width: 230,
                        render: (_, entry) => {
                          if (entry.consumptionStatus === 'failed') {
                            return (
                              <Typography.Text type="danger">
                                {entry.consumptionErrorMessage ||
                                  entry.consumptionErrorCode ||
                                  '消费失败，请重试'}
                              </Typography.Text>
                            );
                          }
                          if (entry.consumedAt) {
                            return (
                              <Typography.Text type="secondary">
                                {entry.consumptionStatus === 'reversed' ? '已于 ' : '消费于 '}
                                {displayDateTime(entry.reversedAt ?? entry.consumedAt)}
                              </Typography.Text>
                            );
                          }
                          return <Typography.Text type="secondary">等待消费</Typography.Text>;
                        },
                      },
                      {
                        title: '操作',
                        fixed: 'right',
                        width: 110,
                        render: (_, entry) => {
                          const canConsume =
                            canManageConsumption &&
                            ['open', 'completed'].includes(selectedSession.status) &&
                            ['present', 'late'].includes(entry.attendanceStatus) &&
                            ['not_consumed', 'failed', 'reversed'].includes(
                              entry.consumptionStatus,
                            );
                          if (canConsume) {
                            return (
                              <Button
                                type="link"
                                icon={<WalletOutlined />}
                                onClick={() => setConsumeEntry(entry)}
                              >
                                消课
                              </Button>
                            );
                          }
                          if (canManageConsumption && entry.consumptionStatus === 'consumed') {
                            return (
                              <Button
                                type="link"
                                icon={<UndoOutlined />}
                                onClick={() => setReverseEntry(entry)}
                              >
                                撤销
                              </Button>
                            );
                          }
                          return '—';
                        },
                      },
                    ]}
                  />
                </AsyncState>
              )}
            </>
          )}
        </Card>
      </div>

      <SessionModal
        open={sessionModalOpen}
        session={editingSession}
        loading={createSession.isPending || updateSession.isPending}
        onClose={() => setSessionModalOpen(false)}
        onSubmit={async (values) => {
          if (!institutionId) return;
          const common = {
            name: values.name.trim(),
            startsAt: toIso(values.startsAt),
            endsAt: toIso(values.endsAt),
            source: values.source,
            defaultUnits: values.defaultUnits,
            notes: nullable(values.notes),
          };
          try {
            if (editingSession) {
              const input: UpdateLessonSessionRequest = {
                ...common,
                expectedRevision: editingSession.revision,
              };
              const updated = await updateSession.mutateAsync({
                institutionId,
                sessionId: editingSession.id,
                input,
              });
              setSelectedSessionId(updated.id);
              void message.success('课次已更新');
            } else {
              const input: CreateLessonSessionRequest = {
                institutionId,
                ...common,
              };
              const created = await createSession.mutateAsync({ institutionId, input });
              setSelectedSessionId(created.id);
              void message.success('课次已创建');
            }
            setSessionModalOpen(false);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />

      <TeacherAssignmentModal
        open={teacherModalOpen}
        session={selectedSession}
        teachers={activeTeachers}
        assignments={assignedTeachers}
        teachersError={teachers.error}
        loading={sessionTeachers.isPending || teachers.isPending || replaceTeachers.isPending}
        onClose={() => setTeacherModalOpen(false)}
        onSubmit={async (values) => {
          if (!selectedSession) return;
          const instructorIds = Array.from(new Set(values.instructorIds ?? []));
          const instructorSet = new Set(instructorIds);
          const assistantIds = Array.from(new Set(values.assistantIds ?? [])).filter(
            (teacherId) => !instructorSet.has(teacherId),
          );
          const input: ReplaceLessonSessionTeachersRequest = {
            expectedRevision: selectedSession.revision,
            assignments: [
              ...instructorIds.map((teacherId) => ({ teacherId, role: 'instructor' as const })),
              ...assistantIds.map((teacherId) => ({ teacherId, role: 'assistant' as const })),
            ],
          };
          try {
            await replaceTeachers.mutateAsync({
              institutionId: selectedSession.institutionId,
              sessionId: selectedSession.id,
              input,
            });
            setTeacherModalOpen(false);
            void message.success('课次教师分配已保存');
          } catch (error) {
            if (isSessionRevisionConflict(error)) {
              void Promise.all([
                sessionDetail.refetch(),
                sessionTeachers.refetch(),
                sessions.refetch(),
              ]);
              void message.error('课次已被其他操作更新，已刷新数据，请重新打开教师分配后保存');
            } else {
              void message.error(errorMessage(error));
            }
          }
        }}
      />

      <AddStudentsModal
        open={addStudentsOpen}
        loading={students.isPending || addStudents.isPending}
        options={selectableStudents}
        onClose={() => setAddStudentsOpen(false)}
        onSubmit={async ({ studentIds }) => {
          if (!institutionId || !selectedSession) return;
          try {
            await addStudents.mutateAsync({
              institutionId,
              sessionId: selectedSession.id,
              input: { expectedRevision: selectedSession.revision, studentIds },
            });
            setAddStudentsOpen(false);
            void message.success(`已添加 ${studentIds.length} 位学员`);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />

      <ReasonModal
        open={Boolean(cancelSession)}
        title="取消课次"
        label="取消原因"
        confirmText="确认取消"
        danger
        loading={cancelLessonSession.isPending}
        onClose={() => setCancelSession(null)}
        onSubmit={async ({ reason }) => {
          if (!cancelSession) return;
          try {
            await cancelLessonSession.mutateAsync({
              institutionId: cancelSession.institutionId,
              sessionId: cancelSession.id,
              input: { expectedRevision: cancelSession.revision, reason: reason.trim() },
            });
            setCancelSession(null);
            void message.success('课次已取消');
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />

      <ConsumeModal
        open={Boolean(consumeEntry)}
        entry={consumeEntry}
        loading={consumeStudent.isPending}
        onClose={() => setConsumeEntry(null)}
        onSubmit={async (values) => {
          if (!consumeEntry) return;
          try {
            const result = await consumeStudent.mutateAsync({
              institutionId: consumeEntry.institutionId,
              sessionId: consumeEntry.lessonSessionId,
              rosterEntryId: consumeEntry.id,
              input: {
                operationId: newOperationId(),
                expectedRevision: consumeEntry.revision,
                units: values.units,
                reason: nullable(values.reason),
                consumptionSource: values.consumptionSource,
                periodCardEntitlementId:
                  values.consumptionSource === 'period_card'
                    ? (values.periodCardEntitlementId ?? null)
                    : null,
              },
            });
            if (result.errorMessage) {
              void message.error(result.errorMessage);
            } else {
              void message.success(
                `已为 ${consumeEntry.studentNameSnapshot} 消费 ${values.units} 课时`,
              );
            }
            setConsumeEntry(null);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />

      <BulkConsumeModal
        open={bulkConsumeOpen}
        entries={bulkConsumableEntries.filter((entry) => selectedRosterEntryIds.includes(entry.id))}
        loading={consumeStudents.isPending}
        onClose={() => setBulkConsumeOpen(false)}
        onSubmit={async (values) => {
          if (!selectedSession) return;
          try {
            const result = await consumeStudents.mutateAsync({
              institutionId: selectedSession.institutionId,
              sessionId: selectedSession.id,
              input: {
                operationId: newOperationId(),
                items: selectedRosterEntryIds
                  .map((id) => bulkConsumableEntries.find((entry) => entry.id === id))
                  .filter((entry): entry is LessonSessionRosterEntry => Boolean(entry))
                  .map((entry) => ({
                    rosterEntryId: entry.id,
                    expectedRevision: entry.revision,
                    units: entry.plannedUnits,
                    reason: nullable(values.reason),
                    consumptionSource: 'lesson_units' as const,
                    periodCardEntitlementId: null,
                  })),
              },
            });
            const failedCount = result.items.filter((item) => item.errorMessage).length;
            if (failedCount) {
              void message.warning(`批量消课完成，${failedCount} 人失败，请查看名单结果`);
            } else {
              void message.success(`已为 ${result.items.length} 人消费普通课时`);
            }
            setSelectedRosterEntryIds([]);
            setBulkConsumeOpen(false);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />

      <ReasonModal
        open={Boolean(reverseEntry)}
        title={`撤销 ${reverseEntry?.studentNameSnapshot ?? ''} 的消课`}
        label="撤销原因"
        confirmText="确认撤销"
        danger
        loading={reverseConsumption.isPending}
        onClose={() => setReverseEntry(null)}
        onSubmit={async ({ reason }) => {
          if (!reverseEntry) return;
          try {
            await reverseConsumption.mutateAsync({
              institutionId: reverseEntry.institutionId,
              sessionId: reverseEntry.lessonSessionId,
              rosterEntryId: reverseEntry.id,
              input: {
                operationId: newOperationId(),
                expectedRevision: reverseEntry.revision,
                reason: reason.trim(),
              },
            });
            setReverseEntry(null);
            void message.success('消课已撤销，课时已原路退回');
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />
    </PageContainer>
  );
}

function SessionModal({
  open,
  session,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  session: LessonSession | null;
  loading: boolean;
  onClose(): void;
  onSubmit(values: SessionFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<SessionFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      session
        ? {
            name: session.name,
            startsAt: toLocalInput(session.startsAt),
            endsAt: toLocalInput(session.endsAt),
            source: session.source,
            defaultUnits: session.defaultUnits,
            notes: session.notes ?? undefined,
          }
        : {
            name: '',
            startsAt: defaultTime(),
            endsAt: defaultTime(60),
            source: 'manual',
            defaultUnits: 1,
            notes: undefined,
          },
    );
  }, [form, open, session]);

  return (
    <Modal
      open={open}
      destroyOnHidden
      width={660}
      forceRender
      title={session ? '编辑课次' : '新建课次'}
      okText={session ? '保存修改' : '创建课次'}
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form name="lesson-session" form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          label="课次名称"
          name="name"
          rules={[{ required: true, message: '请输入课次名称' }]}
        >
          <Input maxLength={160} placeholder="例如：周六成长空间活动" />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="开始时间" name="startsAt" rules={[{ required: true }]}>
              <Input type="datetime-local" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              label="结束时间"
              name="endsAt"
              dependencies={['startsAt']}
              rules={[
                { required: true },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || new Date(value) > new Date(getFieldValue('startsAt'))) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('结束时间必须晚于开始时间'));
                  },
                }),
              ]}
            >
              <Input type="datetime-local" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="来源" name="source" rules={[{ required: true }]}>
              <Select
                options={Object.entries(sourcePresentation).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="默认消费课时" name="defaultUnits" rules={[{ required: true }]}>
              <InputNumber min={1} precision={0} style={{ width: '100%' }} addonAfter="课时" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="备注" name="notes">
          <Input.TextArea maxLength={2000} rows={3} showCount placeholder="可选" />
        </Form.Item>
        <Alert
          type="info"
          showIcon
          message="课次保持轻量"
          description="本阶段只关联机构和学员，不要求选择课程、班级、教师或教室。"
        />
      </Form>
    </Modal>
  );
}

function TeacherAssignmentModal({
  open,
  session,
  teachers,
  assignments,
  teachersError,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  session: LessonSession | null;
  teachers: InstitutionTeacher[];
  assignments: LessonSessionTeacherAssignment[];
  teachersError: unknown;
  loading: boolean;
  onClose(): void;
  onSubmit(values: TeacherAssignmentFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<TeacherAssignmentFormValues>();
  const instructorIds = Form.useWatch('instructorIds', form) ?? [];
  const assistantIds = Form.useWatch('assistantIds', form) ?? [];
  const teacherOptions = teachers.map((teacher) => ({
    value: teacher.id,
    label: [teacher.fullName, teacher.title].filter(Boolean).join(' · '),
  }));
  const instructorOptions = teacherOptions.filter((option) => !assistantIds.includes(option.value));
  const assistantOptions = teacherOptions.filter((option) => !instructorIds.includes(option.value));

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      instructorIds: assignments
        .filter((assignment) => assignment.role === 'instructor')
        .map((assignment) => assignment.teacherId),
      assistantIds: assignments
        .filter((assignment) => assignment.role === 'assistant')
        .map((assignment) => assignment.teacherId),
    });
  }, [assignments, form, open]);

  return (
    <Modal
      open={open}
      destroyOnHidden
      forceRender
      width={620}
      title={`管理课次教师${session ? ` · ${session.name}` : ''}`}
      okText="保存分配"
      cancelText="取消"
      confirmLoading={loading}
      okButtonProps={{ disabled: Boolean(teachersError) }}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form
        name="lesson-session-teachers"
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        preserve={false}
      >
        <Form.Item label="授课教师" name="instructorIds">
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            maxTagCount="responsive"
            options={instructorOptions}
            placeholder={teachers.length ? '选择一位或多位授课教师' : '暂无在职教师'}
            onChange={(ids: string[]) => {
              const nextIds = Array.from(new Set(ids));
              form.setFieldValue('instructorIds', nextIds);
              form.setFieldValue(
                'assistantIds',
                assistantIds.filter((teacherId) => !nextIds.includes(teacherId)),
              );
            }}
          />
        </Form.Item>
        <Form.Item label="助教" name="assistantIds">
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            maxTagCount="responsive"
            options={assistantOptions}
            placeholder={teachers.length ? '可选择一位或多位助教' : '暂无在职教师'}
            onChange={(ids: string[]) => {
              const nextIds = Array.from(new Set(ids));
              form.setFieldValue('assistantIds', nextIds);
              form.setFieldValue(
                'instructorIds',
                instructorIds.filter((teacherId) => !nextIds.includes(teacherId)),
              );
            }}
          />
        </Form.Item>
        <Alert
          type={teachersError ? 'error' : 'info'}
          showIcon
          message={
            teachersError ? '教师档案读取失败，暂不能保存分配' : '教师分配只记录课次参与角色'
          }
          description={
            teachersError
              ? errorMessage(teachersError)
              : '课次仍然只归属于机构；教师不会限制课时包，也不会改变签到和消课规则。清空两组选项即可取消全部分配。'
          }
        />
      </Form>
    </Modal>
  );
}

function AddStudentsModal({
  open,
  loading,
  options,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  options: Array<{ value: string; label: string }>;
  onClose(): void;
  onSubmit(values: AddStudentsFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<AddStudentsFormValues>();
  return (
    <Modal
      open={open}
      destroyOnHidden
      width={620}
      title="添加课次学员"
      okText="添加到名单"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" preserve={false} onFinish={onSubmit}>
        <Form.Item
          label="选择学员"
          name="studentIds"
          rules={[{ required: true, message: '请至少选择一位学员' }]}
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            maxTagCount="responsive"
            options={options}
            placeholder={options.length ? '可搜索并选择多位学员' : '没有可添加的在读学员'}
            notFoundContent={loading ? <Spin size="small" /> : '没有可添加的学员'}
          />
        </Form.Item>
        <Typography.Paragraph type="secondary">
          添加后会保存学员姓名快照；学员资料后续变化不会改变历史课次记录。
        </Typography.Paragraph>
      </Form>
    </Modal>
  );
}

function ConsumeModal({
  open,
  entry,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  entry: LessonSessionRosterEntry | null;
  loading: boolean;
  onClose(): void;
  onSubmit(values: ConsumeFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<ConsumeFormValues>();
  const consumptionSource = Form.useWatch('consumptionSource', form) ?? 'lesson_units';
  const entitlements = useActivePeriodCardEntitlements(
    entry?.institutionId ?? null,
    entry?.studentId ?? null,
    open,
  );
  const entitlementItems = entitlements.data?.items ?? [];

  useEffect(() => {
    if (open && entry) {
      form.setFieldsValue({
        units: entry.plannedUnits,
        reason: undefined,
        consumptionSource: 'lesson_units',
        periodCardEntitlementId: null,
      });
    }
  }, [entry, form, open]);

  const entitlementLabel = (entitlement: PeriodCardEntitlement) => {
    const validity = `${displayDate(entitlement.activationStartsAt, '首次使用生效')} — ${displayDate(entitlement.endsAt, '无结束时间')}`;
    const remaining =
      entitlement.remainingQuantity === null
        ? '不限次'
        : `剩余 ${entitlement.remainingQuantity} 次`;
    return (
      <Space direction="vertical" size={0}>
        <Typography.Text strong>{entitlement.productName}</Typography.Text>
        <Typography.Text type="secondary">
          {validity} · {remaining}
        </Typography.Text>
      </Space>
    );
  };

  return (
    <Modal
      open={open}
      destroyOnHidden
      width={520}
      title={`为 ${entry?.studentNameSnapshot ?? ''} 消课`}
      forceRender
      okText="确认消课"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form name="lesson-consume" form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item
          label="消费凭据"
          name="consumptionSource"
          rules={[{ required: true, message: '请选择消费凭据' }]}
        >
          <Select
            options={[
              { value: 'lesson_units', label: '普通课时 · 课时账户' },
              { value: 'period_card', label: '周期卡 · 周期权益' },
            ]}
            onChange={(value: LessonSessionConsumptionSource) => {
              if (value === 'lesson_units') form.setFieldValue('periodCardEntitlementId', null);
            }}
          />
        </Form.Item>
        {consumptionSource === 'period_card' && (
          <>
            {entitlements.isPending ? (
              <Alert type="info" showIcon message="正在加载当前学员的有效周期卡…" />
            ) : entitlements.isError ? (
              <Alert
                type="error"
                showIcon
                message="有效周期卡加载失败"
                description={errorMessage(entitlements.error)}
              />
            ) : entitlementItems.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                message="当前学员没有可用的有效周期卡"
                description="请改用普通课时，或先为该学员发放处于有效期内的周期卡权益。"
              />
            ) : (
              <Form.Item
                label="选择周期权益"
                name="periodCardEntitlementId"
                rules={[{ required: true, message: '请选择一个周期权益' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="title"
                  placeholder="请选择本次要使用的周期权益"
                  options={entitlementItems.map((entitlement) => ({
                    value: entitlement.id,
                    label: entitlementLabel(entitlement),
                    title: `${entitlement.productName} · ${displayDate(entitlement.activationStartsAt)} — ${displayDate(entitlement.endsAt)}`,
                  }))}
                />
              </Form.Item>
            )}
          </>
        )}
        <Form.Item label="消费课时" name="units" rules={[{ required: true }]}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} addonAfter="课时" />
        </Form.Item>
        <Form.Item label="消费说明" name="reason">
          <Input.TextArea maxLength={500} rows={3} placeholder="可选，例如：本次到课消费" />
        </Form.Item>
        <Alert type="warning" showIcon message="确认后将从该学员在当前机构的可用课时中扣减" />
      </Form>
    </Modal>
  );
}

function BulkConsumeModal({
  open,
  entries,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  entries: LessonSessionRosterEntry[];
  loading: boolean;
  onClose(): void;
  onSubmit(values: BulkConsumeFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<BulkConsumeFormValues>();

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  return (
    <Modal
      open={open}
      destroyOnHidden
      width={520}
      title={`批量消课 · ${entries.length} 位学员`}
      okText="确认批量消课"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" preserve={false} onFinish={onSubmit}>
        <Alert
          type="info"
          showIcon
          message="本次批量操作固定使用普通课时"
          description="每位学员按课次名单中的计划课时数消费。周期卡不会被自动选择；如需使用周期卡，请关闭此弹框并逐人消课。"
          style={{ marginBottom: 16 }}
        />
        <Typography.Paragraph>
          将处理：{entries.map((entry) => entry.studentNameSnapshot).join('、') || '暂无学员'}
        </Typography.Paragraph>
        <Form.Item label="消费说明" name="reason">
          <Input.TextArea maxLength={500} rows={3} placeholder="可选，例如：本次到课批量消课" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ReasonModal({
  open,
  title,
  label,
  confirmText,
  danger,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  confirmText: string;
  danger?: boolean;
  loading: boolean;
  onClose(): void;
  onSubmit(values: ReasonFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<ReasonFormValues>();
  return (
    <Modal
      open={open}
      destroyOnHidden
      width={520}
      title={title}
      okText={confirmText}
      okButtonProps={{ danger }}
      cancelText="返回"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
    >
      <Form
        name={label === '撤销原因' ? 'lesson-reverse' : 'lesson-cancel'}
        form={form}
        layout="vertical"
        preserve={false}
        onFinish={onSubmit}
      >
        <Form.Item
          label={label}
          name="reason"
          rules={[{ required: true, whitespace: true, message: `请填写${label}` }]}
        >
          <Input.TextArea maxLength={500} rows={4} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
