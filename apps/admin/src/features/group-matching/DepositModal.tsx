import { App, Form, Input, InputNumber, Modal, Select } from 'antd';
import { useEffect } from 'react';

import type { GroupMatchingCampaign, GroupMatchingEnrollment } from './api';
import {
  depositPaymentMethodOptions,
  errorMessage,
  localDateTimeValue,
  nullable,
  toIso,
  toMinor,
} from './formatters';
import { useRecordGroupMatchingDeposit } from './hooks';

interface DepositFormValues {
  paidAmountYuan: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
  receivedAt: string;
  paymentReference?: string;
  paymentNote?: string;
}

interface DepositModalProps {
  institutionId: string;
  campaign: GroupMatchingCampaign;
  enrollment: GroupMatchingEnrollment | null;
  onClose: () => void;
}

export function DepositModal({ institutionId, campaign, enrollment, onClose }: DepositModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<DepositFormValues>();
  const recordDeposit = useRecordGroupMatchingDeposit();

  useEffect(() => {
    if (enrollment) {
      form.setFieldsValue({
        paidAmountYuan: enrollment.depositAmountMinor / 100,
        paymentMethod: 'cash',
        receivedAt: localDateTimeValue(),
      });
    }
  }, [enrollment, form]);

  const submit = async (values: DepositFormValues) => {
    if (!enrollment) return;
    try {
      await recordDeposit.mutateAsync({
        institutionId,
        campaignId: campaign.id,
        enrollmentId: enrollment.id,
        input: {
          expectedRevision: enrollment.revision,
          paidAmountMinor: toMinor(values.paidAmountYuan),
          paymentMethod: values.paymentMethod,
          receivedAt: toIso(values.receivedAt)!,
          paymentReference: nullable(values.paymentReference),
          paymentNote: nullable(values.paymentNote),
        },
      });
      message.success('意向金已登记');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      title={`登记线下意向金${enrollment ? ` · ${enrollment.studentNameSnapshot}` : ''}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认收款"
      confirmLoading={recordDeposit.isPending}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item name="paidAmountYuan" label="实收金额（元）" rules={[{ required: true }]}>
          <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="paymentMethod" label="收款方式" rules={[{ required: true }]}>
          <Select options={depositPaymentMethodOptions} />
        </Form.Item>
        <Form.Item name="receivedAt" label="收款时间" rules={[{ required: true }]}>
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="paymentReference" label="流水号 / 凭据号">
          <Input />
        </Form.Item>
        <Form.Item name="paymentNote" label="收款备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
