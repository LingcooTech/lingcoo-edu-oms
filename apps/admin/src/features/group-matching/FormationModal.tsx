import {
  Alert,
  App,
  Button,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { LessonOrderStatus } from '@lingcoo-edu-oms/contracts';
import { useEffect, useMemo, useState } from 'react';

import { useLessonOrders } from '../orders/hooks';
import { useTeachers } from '../people/hooks';
import { useClassrooms } from '../teaching-resources/hooks';
import type {
  GroupMatchingCampaign,
  GroupMatchingCampaignDetail,
  GroupMatchingFormation,
} from './api';
import {
  dateTime,
  errorMessage,
  localDateTimeValue,
  money,
  paidEnrollments,
  toIso,
} from './formatters';
import { GroupSettlementModal, type GroupSettlementTarget } from './GroupSettlementModal';
import { useConfirmGroupMatchingFormation } from './hooks';

const orderStatusMeta: Record<LessonOrderStatus, { label: string; color: string }> = {
  awaiting_settlement: { label: '待收尾款', color: 'gold' },
  pending_payment: { label: '支付中', color: 'processing' },
  paid_pending_grant: { label: '已支付·待发课', color: 'processing' },
  completed: { label: '已发课', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
  grant_failed: { label: '发课失败', color: 'error' },
  refunding: { label: '退款处理中', color: 'processing' },
  refunded: { label: '已退款', color: 'default' },
};

interface FormationFormValues {
  selectedEnrollmentIds: string[];
  teacherId?: string;
  classroomId?: string;
  scheduleDescription: string;
  balanceDueAt?: string;
}

interface FormationModalProps {
  institutionId: string;
  campaign: GroupMatchingCampaign;
  detail: GroupMatchingCampaignDetail;
  open: boolean;
  onClose: () => void;
}

export function FormationModal({
  institutionId,
  campaign,
  detail,
  open,
  onClose,
}: FormationModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormationFormValues>();
  const paid = paidEnrollments(detail);
  const teachers = useTeachers(institutionId, true);
  const classrooms = useClassrooms(campaign.campusId, {
    page: 1,
    pageSize: 200,
    status: 'active',
  });
  const confirmFormation = useConfirmGroupMatchingFormation();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        selectedEnrollmentIds: paid.map((item) => item.id),
        scheduleDescription: campaign.candidateSchedule || '',
        balanceDueAt: campaign.balanceDueAt
          ? localDateTimeValue(new Date(campaign.balanceDueAt))
          : undefined,
      });
    }
  }, [campaign.balanceDueAt, campaign.candidateSchedule, form, open, paid]);

  const submit = async (values: FormationFormValues) => {
    try {
      await confirmFormation.mutateAsync({
        institutionId,
        campaignId: campaign.id,
        input: {
          expectedRevision: campaign.revision,
          selectedEnrollmentIds: values.selectedEnrollmentIds,
          teacherId: values.teacherId || null,
          classroomId: values.classroomId || null,
          scheduleDescription: values.scheduleDescription.trim(),
          balanceDueAt: toIso(values.balanceDueAt),
        },
      });
      message.success('已确认成班，内部课时包和每位学员订单已自动创建。');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      title="确认成班"
      width={760}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认并生成成班快照"
      confirmLoading={confirmFormation.isPending}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title="确认后将自动创建内部课时包与每位学员订单，并固化课程、校区、教师、教室、最终时间、人数和价格；支付尾款后系统自动发课。"
      />
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item
          name="selectedEnrollmentIds"
          label="选择已付意向金学员"
          rules={[{ required: true, message: '至少选择两名学员' }]}
        >
          <Checkbox.Group style={{ width: '100%' }}>
            <Space orientation="vertical">
              {paid.map((item) => (
                <Checkbox key={item.id} value={item.id}>
                  {item.studentNameSnapshot} · {item.guardianNameSnapshot} · 已付{' '}
                  {money(item.depositAmountMinor)}
                </Checkbox>
              ))}
            </Space>
          </Checkbox.Group>
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="teacherId" label="教师（可选）">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                loading={teachers.isPending}
                options={(teachers.data?.items ?? [])
                  .filter((item) => item.status === 'active')
                  .map((item) => ({ value: item.id, label: item.fullName }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="classroomId" label="教室（可选）">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                loading={classrooms.isPending}
                options={(classrooms.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.name} · 容量 ${item.capacity}`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="scheduleDescription"
          label="最终上课时间说明"
          rules={[{ required: true, message: '请确认最终时间' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="例如：自 10 月 12 日起，每周六 10:00–11:30，共 8 次。"
          />
        </Form.Item>
        <Form.Item name="balanceDueAt" label="尾款截止时间">
          <Input type="datetime-local" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function FormationSnapshot({
  formation,
  institutionId,
  canManage,
}: {
  formation: GroupMatchingFormation;
  institutionId: string;
  canManage: boolean;
}) {
  const [settlingOrder, setSettlingOrder] = useState<GroupSettlementTarget | null>(null);
  const orders = useLessonOrders(institutionId, { page: 1, pageSize: 100 });
  const ordersById = useMemo(
    () => new Map((orders.data?.items ?? []).map((order) => [order.id, order])),
    [orders.data?.items],
  );

  return (
    <>
      <Divider titlePlacement="start">不可变成班快照</Divider>
      <Alert
        type="success"
        showIcon
        style={{ marginBottom: 12 }}
        title="拼课已成班；内部课时包与每位学员订单已自动创建。登记或支付尾款后，系统会自动发课。"
      />
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
        <Descriptions.Item label="最终人数">{formation.finalParticipantCount} 人</Descriptions.Item>
        <Descriptions.Item label="最终单价">{money(formation.unitPriceMinor)}</Descriptions.Item>
        <Descriptions.Item label="课时总量">
          {formation.plannedSessionCount} 课次 · 共 {formation.totalUnits} 课时
        </Descriptions.Item>
        <Descriptions.Item label="教师">
          {formation.teacherNameSnapshot || '待安排'}
        </Descriptions.Item>
        <Descriptions.Item label="教室">
          {formation.classroomNameSnapshot || '待安排'}
        </Descriptions.Item>
        <Descriptions.Item label="尾款截止">{dateTime(formation.balanceDueAt)}</Descriptions.Item>
        <Descriptions.Item label="内部课时包" span={3}>
          {formation.lessonPackageId ? (
            <Tag color="success">已生成 · V{formation.lessonPackageVersion}</Tag>
          ) : (
            <Tag color="warning">生成中 / 待核查</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="最终时间" span={3}>
          {formation.scheduleDescription}
        </Descriptions.Item>
      </Descriptions>
      <Table
        style={{ marginTop: 12 }}
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={formation.selectedLearners}
        columns={[
          {
            title: '学员 / 家长',
            render: (_, item) => (
              <Space orientation="vertical" size={0}>
                <Typography.Text strong>{item.studentNameSnapshot}</Typography.Text>
                <Typography.Text type="secondary">{item.guardianNameSnapshot}</Typography.Text>
              </Space>
            ),
          },
          { title: '总额', render: (_, item) => money(item.totalAmountMinor) },
          { title: '已付意向金', render: (_, item) => money(item.depositAppliedMinor) },
          { title: '待付尾款', render: (_, item) => money(item.balanceDueMinor) },
          {
            title: '正式订单',
            render: (_, item) => {
              const order = item.lessonOrderId ? ordersById.get(item.lessonOrderId) : undefined;
              const status = order?.status ?? item.lessonOrderStatus;
              return (
                <Space orientation="vertical" size={2}>
                  <Typography.Text code>
                    {order?.orderNo ?? item.lessonOrderNo ?? '生成中'}
                  </Typography.Text>
                  {status ? (
                    <Tag color={orderStatusMeta[status].color}>{orderStatusMeta[status].label}</Tag>
                  ) : (
                    <Tag color="default">待生成订单</Tag>
                  )}
                </Space>
              );
            },
          },
          {
            title: '操作',
            width: 146,
            render: (_, item) => {
              const order = item.lessonOrderId ? ordersById.get(item.lessonOrderId) : undefined;
              const orderStatus = order?.status ?? item.lessonOrderStatus;
              const settlementTarget = order
                ? order
                : item.lessonOrderId && item.lessonOrderNo && item.lessonOrderRevision
                  ? {
                      id: item.lessonOrderId,
                      institutionId,
                      studentName: item.studentNameSnapshot,
                      guardianName: item.guardianNameSnapshot,
                      orderNo: item.lessonOrderNo,
                      amountMinor: item.totalAmountMinor,
                      depositAppliedMinor: item.depositAppliedMinor,
                      balanceDueMinor: item.balanceDueMinor,
                      revision: item.lessonOrderRevision,
                    }
                  : null;
              return canManage && settlementTarget && orderStatus === 'awaiting_settlement' ? (
                <Button type="link" onClick={() => setSettlingOrder(settlementTarget)}>
                  登记线下尾款
                </Button>
              ) : (
                '—'
              );
            },
          },
        ]}
      />
      <GroupSettlementModal
        open={Boolean(settlingOrder)}
        order={settlingOrder}
        onClose={() => setSettlingOrder(null)}
      />
    </>
  );
}
