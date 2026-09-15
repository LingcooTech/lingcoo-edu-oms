import type {
  LessonOrder,
  LessonOrderRefund,
  LessonOrderRefundStatus,
} from '@lingcoo-edu-oms/contracts';
import { Alert, App, Button, Descriptions, Form, Input, Modal, Select, Space, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import {
  useApproveLessonOrderRefund,
  useCancelLessonOrderRefund,
  useConfirmOfflineLessonOrderRefund,
  useLessonOrderRefunds,
  useRejectLessonOrderRefund,
  useRequestLessonOrderRefund,
} from './hooks';

const STATUS: Record<LessonOrderRefundStatus, { label: string; color: string }> = {
  requested: { label: '待审批', color: 'gold' },
  approved: { label: '已批准', color: 'blue' },
  processing: { label: '处理中', color: 'processing' },
  awaiting_offline_refund: { label: '待确认线下退款', color: 'orange' },
  completed: { label: '已完成', color: 'success' },
  rejected: { label: '已拒绝', color: 'error' },
  cancelled: { label: '已取消', color: 'default' },
  failed: { label: '处理失败', color: 'error' },
};

type RequestValues = { reason: string };
type ReviewValues = { note?: string };
type OfflineValues = {
  paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
  refundedAt: string;
  paymentReference?: string;
  note: string;
};

function localDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function nullable(value?: string) {
  return value?.trim() || null;
}

function money(amountMinor: number) {
  return `¥${(amountMinor / 100).toFixed(2)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export function RefundWorkflowModal({
  institutionId,
  order,
  onClose,
}: {
  institutionId: string | null;
  order: LessonOrder | null;
  onClose(): void;
}) {
  const { message } = App.useApp();
  const [requestForm] = Form.useForm<RequestValues>();
  const [reviewForm] = Form.useForm<ReviewValues>();
  const [offlineForm] = Form.useForm<OfflineValues>();
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const refunds = useLessonOrderRefunds(institutionId, order?.id ?? null);
  const requestRefund = useRequestLessonOrderRefund();
  const approve = useApproveLessonOrderRefund();
  const reject = useRejectLessonOrderRefund();
  const cancel = useCancelLessonOrderRefund();
  const confirmOffline = useConfirmOfflineLessonOrderRefund();

  useEffect(() => {
    if (!order) return;
    requestForm.resetFields();
    reviewForm.resetFields();
    offlineForm.setFieldsValue({
      paymentMethod:
        order.paymentMethod === 'cash' ||
        order.paymentMethod === 'bank_transfer' ||
        order.paymentMethod === 'wechat_transfer' ||
        order.paymentMethod === 'other'
          ? order.paymentMethod
          : 'wechat_transfer',
      refundedAt: localDateTimeValue(),
      paymentReference: undefined,
      note: '',
    });
    setRequestKey(crypto.randomUUID());
  }, [offlineForm, order, requestForm, reviewForm]);

  const active = useMemo(
    () =>
      refunds.data?.find((item) =>
        ['requested', 'approved', 'processing', 'awaiting_offline_refund', 'failed'].includes(
          item.status,
        ),
      ) ?? null,
    [refunds.data],
  );
  const latest = active ?? refunds.data?.[0] ?? null;
  const busy =
    requestRefund.isPending ||
    approve.isPending ||
    reject.isPending ||
    cancel.isPending ||
    confirmOffline.isPending;

  async function refresh(success: string) {
    message.success(success);
    await refunds.refetch();
  }

  async function submitRequest(values: RequestValues) {
    if (!institutionId || !order) return;
    try {
      await requestRefund.mutateAsync({
        institutionId,
        orderId: order.id,
        command: {
          expectedOrderRevision: order.revision,
          requestKey,
          reason: values.reason.trim(),
        },
      });
      await refresh('退款申请已提交，请审批后执行权益回收');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function reviewAction(kind: 'approve' | 'reject' | 'cancel') {
    if (!institutionId || !active) return;
    try {
      const values = await reviewForm.validateFields();
      const note = nullable(values.note);
      if (kind === 'reject' && !note) {
        message.warning('拒绝申请必须填写原因');
        return;
      }
      if (kind === 'cancel' && !note) {
        message.warning('取消申请必须填写原因');
        return;
      }
      if (kind === 'approve') {
        await approve.mutateAsync({
          institutionId,
          refundId: active.id,
          command: { expectedRevision: active.revision, note },
        });
        await refresh(
          active.channel === 'offline' ? '权益已回收，请确认实际退款' : '退款处理已执行',
        );
      } else if (kind === 'reject') {
        await reject.mutateAsync({
          institutionId,
          refundId: active.id,
          command: { expectedRevision: active.revision, note },
        });
        await refresh('退款申请已拒绝');
      } else {
        await cancel.mutateAsync({
          institutionId,
          refundId: active.id,
          command: { expectedRevision: active.revision, reason: note! },
        });
        await refresh('退款申请已取消');
      }
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function submitOffline(values: OfflineValues) {
    if (!institutionId || !active) return;
    try {
      await confirmOffline.mutateAsync({
        institutionId,
        refundId: active.id,
        command: {
          expectedRevision: active.revision,
          paymentMethod: values.paymentMethod,
          refundedAt: new Date(values.refundedAt).toISOString(),
          paymentReference: nullable(values.paymentReference),
          note: values.note.trim(),
        },
      });
      await refresh('退款与权益回收已全部完成');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  return (
    <Modal
      open={Boolean(order)}
      title="普通订单退款"
      width={720}
      footer={<Button onClick={onClose}>关闭</Button>}
      onCancel={onClose}
      destroyOnHidden
    >
      {order ? (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            showIcon
            type="warning"
            title="仅支持完整未使用权益的全额退款"
            description="课时包按原订单批次整批回收，周期卡必须从未使用；拼课成班订单不进入本流程。所有审批、回收和退款事实都会保留。"
          />
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="订单号" span={2}>
              {order.orderNo}
            </Descriptions.Item>
            <Descriptions.Item label="学员">{order.studentName}</Descriptions.Item>
            <Descriptions.Item label="金额">{money(order.amountMinor)}</Descriptions.Item>
            <Descriptions.Item label="渠道">
              {order.channel === 'online' ? '线上原路退' : '线下退款'}
            </Descriptions.Item>
            <Descriptions.Item label="订单状态">{order.status}</Descriptions.Item>
          </Descriptions>

          {refunds.isPending ? <Alert type="info" showIcon message="正在读取退款记录…" /> : null}
          {latest ? <RefundSummary refund={latest} /> : null}

          {!active && order.status === 'completed' ? (
            <Form form={requestForm} layout="vertical" onFinish={submitRequest}>
              <Form.Item
                name="reason"
                label="退款原因"
                rules={[{ required: true, min: 2, message: '请填写至少 2 个字的退款原因' }]}
              >
                <Input.TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
              <Button type="primary" danger loading={busy} onClick={() => requestForm.submit()}>
                提交退款申请
              </Button>
            </Form>
          ) : null}

          {active?.status === 'requested' ? (
            <Form form={reviewForm} layout="vertical">
              <Form.Item name="note" label="审批意见 / 拒绝或取消原因">
                <Input.TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
              <Space wrap>
                <Button
                  type="primary"
                  danger
                  loading={busy}
                  onClick={() => void reviewAction('approve')}
                >
                  批准并回收权益
                </Button>
                <Button loading={busy} onClick={() => void reviewAction('reject')}>
                  拒绝
                </Button>
                <Button loading={busy} onClick={() => void reviewAction('cancel')}>
                  取消申请
                </Button>
              </Space>
            </Form>
          ) : null}

          {active && ['approved', 'processing', 'failed'].includes(active.status) ? (
            <Space orientation="vertical" style={{ width: '100%' }}>
              {active.failureMessage ? (
                <Alert
                  type="error"
                  showIcon
                  message={active.failureMessage}
                  description="请核实权益或支付状态后重试；已经回收的权益不会重复回收。"
                />
              ) : (
                <Alert type="info" showIcon message="退款处理中，可继续核验渠道结果。" />
              )}
              <Space>
                <Button type="primary" loading={busy} onClick={() => void reviewAction('approve')}>
                  继续处理
                </Button>
                {active.status === 'failed' && !active.entitlementRecoveredAt ? (
                  <Button loading={busy} onClick={() => void reviewAction('cancel')}>
                    取消失败申请
                  </Button>
                ) : null}
              </Space>
            </Space>
          ) : null}

          {active?.status === 'awaiting_offline_refund' ? (
            <Form form={offlineForm} layout="vertical" onFinish={submitOffline}>
              <Alert
                type="warning"
                showIcon
                message="权益已回收。请在线下实际退款后再确认，系统不会自动转账。"
                style={{ marginBottom: 16 }}
              />
              <Form.Item name="paymentMethod" label="退款方式" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'cash', label: '现金' },
                    { value: 'bank_transfer', label: '银行转账' },
                    { value: 'wechat_transfer', label: '微信转账' },
                    { value: 'other', label: '其他' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="refundedAt" label="实际退款时间" rules={[{ required: true }]}>
                <Input type="datetime-local" />
              </Form.Item>
              <Form.Item name="paymentReference" label="退款流水号 / 凭据号">
                <Input />
              </Form.Item>
              <Form.Item name="note" label="退款说明" rules={[{ required: true, min: 2 }]}>
                <Input.TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
              <Button type="primary" danger loading={busy} onClick={() => offlineForm.submit()}>
                确认款项已退回并完成退款
              </Button>
            </Form>
          ) : null}
        </Space>
      ) : null}
    </Modal>
  );
}

function RefundSummary({ refund }: { refund: LessonOrderRefund }) {
  return (
    <Descriptions bordered size="small" column={2} title="最近退款记录">
      <Descriptions.Item label="退款单号">{refund.requestNo}</Descriptions.Item>
      <Descriptions.Item label="状态">
        <Tag color={STATUS[refund.status].color}>{STATUS[refund.status].label}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="原因" span={2}>
        {refund.reason}
      </Descriptions.Item>
      <Descriptions.Item label="权益回收">
        {refund.entitlementRecoveredAt ? '已完成' : '未完成'}
      </Descriptions.Item>
      <Descriptions.Item label="资金退款">
        {refund.fundsRefundedAt ? '已完成' : '未完成'}
      </Descriptions.Item>
      {refund.reviewNote ? (
        <Descriptions.Item label="审批说明" span={2}>
          {refund.reviewNote}
        </Descriptions.Item>
      ) : null}
      {refund.failureMessage ? (
        <Descriptions.Item label="失败原因" span={2}>
          {refund.failureMessage}
        </Descriptions.Item>
      ) : null}
    </Descriptions>
  );
}
