import { Alert, App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect, useState } from 'react';

import type { GroupMatchingCampaign, GroupMatchingEnrollment } from './api';
import {
  depositPaymentMethodOptions,
  errorMessage,
  localDateTimeValue,
  nullable,
  toIso,
  toMinor,
} from './formatters';
import { useRecordGroupMatchingDepositRefund } from './hooks';

interface RefundFormValues {
  refundedAmountYuan: number;
  refundMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
  refundedAt: string;
  refundReference?: string;
  refundNote?: string;
}

interface DepositRefundModalProps {
  institutionId: string;
  campaign: GroupMatchingCampaign;
  enrollment: GroupMatchingEnrollment | null;
  onClose: () => void;
}

export function DepositRefundModal({
  institutionId,
  campaign,
  enrollment,
  onClose,
}: DepositRefundModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<RefundFormValues>();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const refund = useRecordGroupMatchingDepositRefund();

  useEffect(() => {
    if (!enrollment) return;
    form.setFieldsValue({
      refundedAmountYuan: enrollment.depositAmountMinor / 100,
      refundMethod: enrollment.depositPaymentMethod ?? 'cash',
      refundedAt: localDateTimeValue(),
      refundReference: undefined,
      refundNote: undefined,
    });
    setIdempotencyKey(crypto.randomUUID());
  }, [enrollment, form]);

  const submit = async (values: RefundFormValues) => {
    if (!enrollment) return;
    try {
      await refund.mutateAsync({
        institutionId,
        campaignId: campaign.id,
        enrollmentId: enrollment.id,
        idempotencyKey,
        input: {
          expectedRevision: enrollment.revision,
          refundedAmountMinor: toMinor(values.refundedAmountYuan),
          refundMethod: values.refundMethod,
          refundedAt: toIso(values.refundedAt)!,
          refundReference: nullable(values.refundReference),
          refundNote: nullable(values.refundNote),
        },
      });
      message.success('线下意向金退款事实已登记，现在可以办理报名退出');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      title={`确认线下退回意向金${enrollment ? ` · ${enrollment.studentNameSnapshot}` : ''}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认已实际退款"
      okButtonProps={{ danger: true }}
      confirmLoading={refund.isPending}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        title="本操作只登记已经在线下实际完成的退款，不会自动转账。退款事实创建后不可修改或删除。"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item name="refundedAmountYuan" label="实退金额（元）" rules={[{ required: true }]}>
          <InputNumber disabled min={0.01} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="refundMethod" label="退款方式" rules={[{ required: true }]}>
          <Select options={depositPaymentMethodOptions} />
        </Form.Item>
        <Form.Item name="refundedAt" label="实际退款时间" rules={[{ required: true }]}>
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="refundReference" label="退款流水号 / 凭据号">
          <Input />
        </Form.Item>
        <Form.Item
          name="refundNote"
          label="退款说明"
          rules={[{ required: true, message: '请填写退款说明' }]}
        >
          <Input.TextArea rows={3} placeholder="例如：家长申请退出，已通过微信转账退回" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
