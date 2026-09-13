import {
  ArrowLeftOutlined,
  CalendarOutlined,
  HistoryOutlined,
  ShoppingOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type {
  LessonBatch,
  LessonMovement,
  LessonOrder,
  PeriodCardEntitlement,
  Student360Delivery,
} from '@lingcoo-edu-oms/contracts';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useStudent360 } from './hooks';

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
}

function money(amountMinor: number): string {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(
    amountMinor / 100,
  );
}

const movementLabels: Record<string, string> = {
  grant: '发放',
  adjustment_credit: '调增',
  adjustment_debit: '调减',
  clawback: '回收',
  grant_reversal: '发放撤销',
  consume: '消课',
  consume_reversal: '消课冲正',
};

const attendanceLabels: Record<string, string> = {
  pending: '待点名',
  present: '到课',
  late: '迟到',
  leave: '请假',
  absent: '缺勤',
};

const consumptionLabels: Record<string, string> = {
  not_consumed: '未消课',
  consumed: '已消课',
  reversed: '已冲正',
  failed: '消课失败',
};

export function Student360Page() {
  const navigate = useNavigate();
  const { studentId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const institutionId = searchParams.get('institutionId');
  const profile = useStudent360(institutionId, studentId || null);
  const data = profile.data;

  return (
    <PageContainer
      title={data ? `${data.student.fullName} · 360°详情` : '学员 360°详情'}
      description="以学员与当前机构的服务关系为边界，统一查看联系人、课时权益、教学交付和订单证据。"
      actions={
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/students')}>
          返回学员档案
        </Button>
      }
      breadcrumbs={[
        { title: '教务管理' },
        { title: '学员档案', href: '/admin/students' },
        { title: '360°详情' },
      ]}
    >
      <AsyncState
        loading={profile.isPending}
        error={profile.error}
        empty={!institutionId || !studentId}
      >
        {data ? (
          <>
            <Card className="student-360-hero">
              <div className="student-360-hero__identity">
                <div className="student-360-avatar">{data.student.fullName.slice(-1)}</div>
                <div>
                  <Space wrap>
                    <Typography.Title level={3}>{data.student.fullName}</Typography.Title>
                    <Tag
                      color={data.student.relationshipStatus === 'active' ? 'success' : 'default'}
                    >
                      {data.student.relationshipStatus === 'active' ? '服务中' : '服务已结束'}
                    </Tag>
                  </Space>
                  <Typography.Text type="secondary">
                    {[
                      data.student.preferredName,
                      data.student.grade,
                      data.student.school,
                      data.institution.name,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '暂无补充资料'}
                  </Typography.Text>
                </div>
              </div>
              <Typography.Text type="secondary">
                数据生成于 {dateTime(data.generatedAt)}
              </Typography.Text>
            </Card>

            <Row gutter={[12, 12]} className="student-360-metrics">
              <Col xs={12} lg={4}>
                <Card>
                  <Statistic
                    title="课时余额"
                    value={data.summary.lessonBalanceUnits}
                    suffix="课时"
                    prefix={<WalletOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} lg={4}>
                <Card>
                  <Statistic
                    title="有效周期卡"
                    value={data.summary.activePeriodCardCount}
                    prefix={<CalendarOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} lg={4}>
                <Card>
                  <Statistic
                    title="待上课"
                    value={data.summary.upcomingSessionCount}
                    prefix={<HistoryOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} lg={4}>
                <Card>
                  <Statistic
                    title="已到课"
                    value={data.summary.attendedSessionCount}
                    prefix={<TeamOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} lg={4}>
                <Card>
                  <Statistic title="累计消课" value={data.summary.consumedUnits} suffix="课时" />
                </Card>
              </Col>
              <Col xs={12} lg={4}>
                <Card>
                  <Statistic
                    title="已付订单"
                    value={data.summary.paidOrderCount}
                    prefix={<ShoppingOutlined />}
                  />
                </Card>
              </Col>
            </Row>

            <Card className="student-360-tabs-card">
              <Tabs
                items={[
                  {
                    key: 'overview',
                    label: '档案与关系',
                    children: (
                      <Row gutter={[16, 16]}>
                        <Col xs={24} xl={12}>
                          <Descriptions title="基础档案" bordered size="small" column={2}>
                            <Descriptions.Item label="姓名">
                              {data.student.fullName}
                            </Descriptions.Item>
                            <Descriptions.Item label="常用名">
                              {data.student.preferredName || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="年级">
                              {data.student.grade || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="学校">
                              {data.student.school || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="出生日期">
                              {data.student.birthDate || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="加入时间">
                              {dateTime(data.student.joinedAt)}
                            </Descriptions.Item>
                            <Descriptions.Item label="备注" span={2}>
                              {data.student.notes || '—'}
                            </Descriptions.Item>
                          </Descriptions>
                        </Col>
                        <Col xs={24} xl={12}>
                          <Typography.Title level={5}>家长联系人</Typography.Title>
                          {data.guardians.length === 0 ? (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description="尚未绑定家长"
                            />
                          ) : (
                            <Table
                              pagination={false}
                              size="small"
                              rowKey="id"
                              dataSource={data.guardians}
                              columns={[
                                { title: '家长', render: (_, item) => item.guardian.fullName },
                                {
                                  title: '联系方式',
                                  render: (_, item) =>
                                    item.guardian.phone || item.guardian.email || '—',
                                },
                                { title: '关系', dataIndex: 'relationship' },
                                {
                                  title: '状态',
                                  render: (_, item) => (
                                    <Tag
                                      color={
                                        item.verificationStatus === 'verified'
                                          ? 'success'
                                          : 'warning'
                                      }
                                    >
                                      {item.verificationStatus === 'verified' ? '已核验' : '待核验'}
                                    </Tag>
                                  ),
                                },
                              ]}
                            />
                          )}
                        </Col>
                        <Col span={24}>
                          <Typography.Title level={5}>班级安排</Typography.Title>
                          {data.classes.length === 0 ? (
                            <Empty
                              image={Empty.PRESENTED_IMAGE_SIMPLE}
                              description="暂无班级关系"
                            />
                          ) : (
                            <Table
                              pagination={false}
                              size="small"
                              rowKey={(item) => item.classGroup.id}
                              dataSource={data.classes}
                              columns={[
                                { title: '班级', render: (_, item) => item.classGroup.name },
                                {
                                  title: '成员状态',
                                  render: (_, item) => (
                                    <Tag
                                      color={
                                        item.membership.status === 'active' ? 'success' : 'default'
                                      }
                                    >
                                      {item.membership.status === 'active' ? '在班' : '已离班'}
                                    </Tag>
                                  ),
                                },
                                {
                                  title: '加入时间',
                                  render: (_, item) => dateTime(item.membership.joinedAt),
                                },
                                {
                                  title: '离班时间',
                                  render: (_, item) => dateTime(item.membership.leftAt ?? null),
                                },
                              ]}
                            />
                          )}
                        </Col>
                      </Row>
                    ),
                  },
                  {
                    key: 'ledger',
                    label: `课时账本 (${data.summary.lessonBalanceUnits})`,
                    children: (
                      <LedgerSection
                        batches={data.lessonLedger.recentBatches}
                        movements={data.lessonLedger.recentMovements}
                      />
                    ),
                  },
                  {
                    key: 'deliveries',
                    label: `教学交付 (${data.deliveries.length})`,
                    children: (
                      <DeliverySection
                        items={data.deliveries}
                        onOpen={(sessionId) =>
                          navigate(
                            `/attendance?institutionId=${data.institution.id}&sessionId=${sessionId}`,
                          )
                        }
                      />
                    ),
                  },
                  {
                    key: 'period-cards',
                    label: `周期卡 (${data.periodCards.entitlements.length})`,
                    children: <PeriodCardSection items={data.periodCards.entitlements} />,
                  },
                  {
                    key: 'orders',
                    label: `订单与收款 (${data.orders.length})`,
                    children: <OrderSection items={data.orders} />,
                  },
                ]}
              />
            </Card>
          </>
        ) : null}
      </AsyncState>
    </PageContainer>
  );
}

function LedgerSection({
  batches,
  movements,
}: {
  batches: LessonBatch[];
  movements: LessonMovement[];
}) {
  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={5}>最近课时批次</Typography.Title>
        <Table<LessonBatch>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={batches}
          columns={[
            { title: '来源', render: (_, item) => item.templateName || item.reason },
            { title: '总课时', dataIndex: 'totalUnits' },
            { title: '已消费', dataIndex: 'consumedUnits' },
            { title: '已回收', dataIndex: 'withdrawnUnits' },
            { title: '剩余', dataIndex: 'remainingUnits' },
            {
              title: '状态',
              render: (_, item) => (
                <Tag>
                  {item.status === 'available'
                    ? '可用'
                    : item.status === 'depleted'
                      ? '已用完'
                      : '已撤销'}
                </Tag>
              ),
            },
          ]}
        />
      </div>
      <div>
        <Typography.Title level={5}>最近课时流水</Typography.Title>
        <Table<LessonMovement>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={movements}
          columns={[
            { title: '时间', render: (_, item) => dateTime(item.occurredAt) },
            { title: '类型', render: (_, item) => movementLabels[item.type] ?? item.type },
            {
              title: '变动',
              render: (_, item) => (
                <Typography.Text type={item.direction === 'credit' ? 'success' : 'danger'}>
                  {item.direction === 'credit' ? '+' : '-'}
                  {item.units}
                </Typography.Text>
              ),
            },
            { title: '变动后余额', dataIndex: 'balanceAfterUnits' },
            { title: '原因', dataIndex: 'reason' },
          ]}
        />
      </div>
    </Space>
  );
}

function DeliverySection({
  items,
  onOpen,
}: {
  items: Student360Delivery[];
  onOpen(id: string): void;
}) {
  return (
    <Table<Student360Delivery>
      rowKey={(item) => item.attendance.id}
      dataSource={items}
      pagination={false}
      scroll={{ x: 900 }}
      columns={[
        {
          title: '课次',
          render: (_, item) => (
            <Space direction="vertical" size={0}>
              <Typography.Text strong>{item.session.name}</Typography.Text>
              <Typography.Text type="secondary">{dateTime(item.session.startsAt)}</Typography.Text>
            </Space>
          ),
        },
        {
          title: '教师',
          render: (_, item) =>
            item.teachers.map((teacher) => teacher.teacherNameSnapshot).join('、') || '—',
        },
        {
          title: '点名',
          render: (_, item) => <Tag>{attendanceLabels[item.attendance.attendanceStatus]}</Tag>,
        },
        {
          title: '消课',
          render: (_, item) => (
            <Tag
              color={
                item.attendance.consumptionStatus === 'failed'
                  ? 'error'
                  : item.attendance.consumptionStatus === 'consumed'
                    ? 'success'
                    : 'default'
              }
            >
              {consumptionLabels[item.attendance.consumptionStatus]}
            </Tag>
          ),
        },
        { title: '实际课时', render: (_, item) => item.attendance.consumedUnits ?? '—' },
        {
          title: '来源',
          render: (_, item) =>
            item.attendance.consumptionSource === 'period_card'
              ? '周期卡'
              : item.attendance.consumptionSource === 'lesson_units'
                ? '通用课时'
                : '—',
        },
        {
          title: '操作',
          fixed: 'right',
          render: (_, item) => (
            <Button type="link" onClick={() => onOpen(item.session.id)}>
              查看课次
            </Button>
          ),
        },
      ]}
    />
  );
}

function PeriodCardSection({ items }: { items: PeriodCardEntitlement[] }) {
  return (
    <Table<PeriodCardEntitlement>
      rowKey="id"
      dataSource={items}
      pagination={false}
      columns={[
        { title: '周期卡', dataIndex: 'productName' },
        {
          title: '模式',
          render: (_, item) => (item.mode === 'unlimited' ? '不限次' : `限 ${item.usageLimit} 次`),
        },
        { title: '已使用', dataIndex: 'usedQuantity' },
        { title: '剩余', render: (_, item) => item.remainingQuantity ?? '不限' },
        {
          title: '有效期',
          render: (_, item) => `${dateTime(item.activationStartsAt)} — ${dateTime(item.endsAt)}`,
        },
        { title: '状态', render: (_, item) => <Tag>{item.effectiveStatus}</Tag> },
      ]}
    />
  );
}

function OrderSection({ items }: { items: LessonOrder[] }) {
  return (
    <Table<LessonOrder>
      rowKey="id"
      dataSource={items}
      pagination={false}
      scroll={{ x: 860 }}
      columns={[
        { title: '订单号', dataIndex: 'orderNo' },
        {
          title: '商品',
          render: (_, item) =>
            item.productType === 'lesson_package' ? item.packageName : item.periodCardProductName,
        },
        { title: '渠道', render: (_, item) => (item.channel === 'online' ? '线上' : '线下') },
        { title: '支付方式', dataIndex: 'paymentMethod' },
        { title: '金额', render: (_, item) => money(item.amountMinor) },
        { title: '状态', render: (_, item) => <Tag>{item.status}</Tag> },
        { title: '支付时间', render: (_, item) => dateTime(item.paidAt) },
      ]}
    />
  );
}
