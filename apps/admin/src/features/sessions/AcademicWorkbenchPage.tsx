import {
  CalendarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  ScheduleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { LessonSessionStatus, LessonSessionWorkItem } from '@lingcoo-edu-oms/contracts';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useInstitutions, useOrganizationProfile } from '../organization/hooks';
import { useLessonSessionWorkbench } from './hooks';

const statusPresentation: Record<LessonSessionStatus, { label: string; color: string }> = {
  draft: { label: '待开课', color: 'default' },
  open: { label: '进行中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'error' },
};

const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, count: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + count, 1);
}

function addDays(value: Date, count: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + count);
}

function dateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function calendarStart(month: Date): Date {
  const first = startOfMonth(month);
  const mondayOffset = (first.getDay() + 6) % 7;
  return addDays(first, -mondayOffset);
}

function timeText(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function dayTitle(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(`${value}T12:00:00`));
}

function SessionSummary({
  item,
  onOpen,
  onAttendance,
}: {
  item: LessonSessionWorkItem;
  onOpen: () => void;
  onAttendance: () => void;
}) {
  const { session, teachers, attendance, consumption } = item;
  return (
    <div className="academic-agenda-item">
      <div className="academic-agenda-item__time">
        <strong>{timeText(session.startsAt)}</strong>
        <span>{timeText(session.endsAt)}</span>
      </div>
      <div className="academic-agenda-item__body">
        <Space size={6} wrap>
          <Typography.Text strong>{session.name}</Typography.Text>
          <Tag color={statusPresentation[session.status].color}>
            {statusPresentation[session.status].label}
          </Tag>
        </Space>
        <Typography.Text type="secondary">
          {teachers.length > 0
            ? teachers.map((teacher) => teacher.teacherNameSnapshot).join('、')
            : '尚未安排教师'}
        </Typography.Text>
        <Space size={12} wrap>
          <Typography.Text type={attendance.pending > 0 ? 'warning' : 'secondary'}>
            点名 {attendance.total - attendance.pending}/{attendance.total}
          </Typography.Text>
          <Typography.Text type={consumption.failed > 0 ? 'danger' : 'secondary'}>
            已消课 {consumption.consumed} 人
          </Typography.Text>
          {consumption.failed > 0 && (
            <Typography.Text type="danger">失败 {consumption.failed} 人</Typography.Text>
          )}
        </Space>
      </div>
      <Space size={4} wrap className="academic-agenda-item__actions">
        <Button size="small" onClick={onOpen}>
          课次详情
        </Button>
        <Button size="small" type="primary" ghost onClick={onAttendance}>
          签到消课
        </Button>
      </Space>
    </div>
  );
}

export function AcademicWorkbenchPage() {
  const navigate = useNavigate();
  const organization = useOrganizationProfile();
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0]) {
      setInstitutionId(institutions.data.items[0].id);
    }
  }, [institutionId, institutions.data]);

  const range = useMemo(() => {
    const from = startOfMonth(month);
    const to = addMonths(from, 1);
    return { from: from.toISOString(), to: new Date(to.getTime() - 1).toISOString() };
  }, [month]);
  const workbench = useLessonSessionWorkbench(institutionId, {
    page: 1,
    pageSize: 500,
    from: range.from,
    to: range.to,
  });
  const items = useMemo(
    () =>
      [...(workbench.data?.items ?? [])].sort((a, b) =>
        a.session.startsAt.localeCompare(b.session.startsAt),
      ),
    [workbench.data?.items],
  );
  const itemsByDay = useMemo(() => {
    const result = new Map<string, LessonSessionWorkItem[]>();
    for (const item of items) {
      const key = dateKey(item.session.startsAt);
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return result;
  }, [items]);
  const days = useMemo(() => {
    const start = calendarStart(month);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month]);
  const selectedItems = itemsByDay.get(selectedDate) ?? [];
  const today = dateKey(new Date());
  const todayItems = itemsByDay.get(today) ?? [];
  const openItems = items.filter((item) => item.session.status === 'open');
  const attendanceQueue = items.filter(
    (item) => item.session.status === 'open' && item.attendance.pending > 0,
  );
  const consumptionQueue = items.filter(
    (item) =>
      item.session.status !== 'cancelled' &&
      (item.consumption.failed > 0 ||
        (item.session.status === 'completed' && item.consumption.notConsumed > 0)),
  );
  const exceptionCount = consumptionQueue.reduce(
    (total, item) => total + item.consumption.failed,
    0,
  );

  const institutionOptions = (institutions.data?.items ?? []).map((institution) => ({
    value: institution.id,
    label:
      organization.data?.operationMode === 'self_operated_only'
        ? institution.name
        : `${institution.name} · ${institution.type === 'self_operated' ? '自营' : '合作'}`,
  }));

  function goTo(item: LessonSessionWorkItem, target: 'session' | 'attendance') {
    const params = new URLSearchParams({
      institutionId: item.session.institutionId,
      sessionId: item.session.id,
    });
    navigate(`/${target === 'session' ? 'lesson-sessions' : 'attendance'}?${params.toString()}`);
  }

  function changeMonth(next: Date) {
    const normalized = startOfMonth(next);
    setMonth(normalized);
    setSelectedDate(
      normalized.getMonth() === new Date().getMonth() &&
        normalized.getFullYear() === new Date().getFullYear()
        ? today
        : dateKey(normalized),
    );
  }

  return (
    <PageContainer
      title="教务工作台"
      description="用月历统览课次，用待办队列完成开课、点名、消课与异常处理。"
      actions={
        <Space wrap>
          <Button icon={<ScheduleOutlined />} onClick={() => navigate('/schedule-plans')}>
            排课计划
          </Button>
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            onClick={() => navigate('/lesson-sessions')}
          >
            课次管理
          </Button>
        </Space>
      }
    >
      <Card className="academic-toolbar-card">
        <div className="academic-toolbar">
          <Select
            showSearch
            optionFilterProp="label"
            loading={institutions.isPending}
            value={institutionId}
            options={institutionOptions}
            placeholder="选择机构"
            onChange={setInstitutionId}
          />
          <Space.Compact>
            <Button
              aria-label="上个月"
              icon={<LeftOutlined />}
              onClick={() => changeMonth(addMonths(month, -1))}
            />
            <Button onClick={() => changeMonth(new Date())}>今天</Button>
            <Button
              aria-label="下个月"
              icon={<RightOutlined />}
              onClick={() => changeMonth(addMonths(month, 1))}
            />
          </Space.Compact>
          <Typography.Title level={4} className="academic-month-title">
            {new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(month)}
          </Typography.Title>
          <Button
            icon={<ReloadOutlined />}
            loading={workbench.isFetching}
            onClick={() => void workbench.refetch()}
          >
            刷新
          </Button>
        </div>
      </Card>

      <Row gutter={[12, 12]} className="academic-metrics">
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="本月课次"
              value={workbench.data?.total ?? 0}
              prefix={<CalendarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="今日课次"
              value={todayItems.length}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="待点名课次"
              value={attendanceQueue.length}
              prefix={<CheckSquareOutlined />}
              valueStyle={attendanceQueue.length ? { color: '#d46b08' } : undefined}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="消课异常人数"
              value={exceptionCount}
              prefix={<WarningOutlined />}
              valueStyle={exceptionCount ? { color: '#cf1322' } : undefined}
            />
          </Card>
        </Col>
      </Row>

      <AsyncState loading={workbench.isPending} error={workbench.error}>
        <div className="academic-workbench-grid">
          <Card className="academic-calendar-card" styles={{ body: { padding: 0 } }}>
            <div className="academic-calendar-weekdays">
              {weekLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="academic-calendar-grid">
              {days.map((day) => {
                const key = dateKey(day);
                const dayItems = itemsByDay.get(key) ?? [];
                const outside = day.getMonth() !== month.getMonth();
                return (
                  <button
                    key={key}
                    type="button"
                    className={`academic-calendar-day${outside ? ' is-outside' : ''}${key === selectedDate ? ' is-selected' : ''}${key === today ? ' is-today' : ''}`}
                    onClick={() => {
                      if (outside) changeMonth(day);
                      setSelectedDate(key);
                    }}
                  >
                    <span className="academic-calendar-day__number">{day.getDate()}</span>
                    <span className="academic-calendar-day__sessions">
                      {dayItems.slice(0, 3).map((item) => (
                        <span
                          key={item.session.id}
                          className={`academic-session-chip is-${item.session.status}`}
                        >
                          {timeText(item.session.startsAt)} {item.session.name}
                        </span>
                      ))}
                      {dayItems.length > 3 && <small>还有 {dayItems.length - 3} 节</small>}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card
            title={dayTitle(selectedDate)}
            extra={<Badge count={selectedItems.length} showZero color="#1677ff" />}
          >
            {selectedItems.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当天暂无课次" />
            ) : (
              <div className="academic-agenda-list">
                {selectedItems.map((item) => (
                  <SessionSummary
                    key={item.session.id}
                    item={item}
                    onOpen={() => goTo(item, 'session')}
                    onAttendance={() => goTo(item, 'attendance')}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <Row gutter={[12, 12]} className="academic-queues">
          <Col xs={24} xl={12}>
            <Card
              title="待点名"
              extra={
                <Tag color={attendanceQueue.length ? 'orange' : 'green'}>
                  {attendanceQueue.length} 节
                </Tag>
              }
            >
              {attendanceQueue.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有待点名课次" />
              ) : (
                <div className="academic-queue-list">
                  {attendanceQueue.slice(0, 8).map((item) => (
                    <SessionSummary
                      key={item.session.id}
                      item={item}
                      onOpen={() => goTo(item, 'session')}
                      onAttendance={() => goTo(item, 'attendance')}
                    />
                  ))}
                </div>
              )}
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card
              title="待消课与异常"
              extra={
                <Tag color={consumptionQueue.length ? 'red' : 'green'}>
                  {consumptionQueue.length} 节
                </Tag>
              }
            >
              {consumptionQueue.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有待处理消课" />
              ) : (
                <div className="academic-queue-list">
                  {consumptionQueue.slice(0, 8).map((item) => (
                    <SessionSummary
                      key={item.session.id}
                      item={item}
                      onOpen={() => goTo(item, 'session')}
                      onAttendance={() => goTo(item, 'attendance')}
                    />
                  ))}
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </AsyncState>
      {openItems.length > 0 && (
        <Typography.Paragraph type="secondary" className="academic-open-summary">
          当前有 {openItems.length} 节进行中课次，请在结束前完成点名，结束后核对课时消费结果。
        </Typography.Paragraph>
      )}
    </PageContainer>
  );
}
