import { Alert, App, Form, Input, Modal } from 'antd';
import { useEffect, useState } from 'react';

import type { GroupMatchingCampaign, GroupMatchingEnrollment } from './api';
import { errorMessage } from './formatters';
import { useWithdrawGroupMatchingEnrollment } from './hooks';

interface WithdrawalFormValues {
  reason: string;
}

interface EnrollmentWithdrawalModalProps {
  institutionId: string;
  campaign: GroupMatchingCampaign;
  enrollment: GroupMatchingEnrollment | null;
  onClose: () => void;
}

export function EnrollmentWithdrawalModal({
  institutionId,
  campaign,
  enrollment,
  onClose,
}: EnrollmentWithdrawalModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<WithdrawalFormValues>();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const withdraw = useWithdrawGroupMatchingEnrollment();

  useEffect(() => {
    if (!enrollment) return;
    form.resetFields();
    setIdempotencyKey(crypto.randomUUID());
  }, [enrollment, form]);

  const submit = async (values: WithdrawalFormValues) => {
    if (!enrollment) return;
    try {
      await withdraw.mutateAsync({
        institutionId,
        campaignId: campaign.id,
        enrollmentId: enrollment.id,
        idempotencyKey,
        input: { expectedRevision: enrollment.revision, reason: values.reason.trim() },
      });
      message.success('报名已退出，历史报名和退款事实均已保留');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      title={`办理报名退出${enrollment ? ` · ${enrollment.studentNameSnapshot}` : ''}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认退出"
      okButtonProps={{ danger: true }}
      confirmLoading={withdraw.isPending}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        title={
          enrollment?.depositRefund
            ? '意向金退款已经登记。本操作将终止报名，但不会删除报名及退款记录。'
            : '该报名没有需要退回的意向金，可以直接办理退出。'
        }
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item
          name="reason"
          label="退出原因"
          rules={[{ required: true, message: '请填写退出原因' }]}
        >
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
