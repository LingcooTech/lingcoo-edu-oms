import { Alert, App, Form, Input, Modal } from 'antd';
import { useEffect } from 'react';

import type { GroupMatchingCampaign } from './api';
import { errorMessage } from './formatters';
import { useCancelGroupMatchingCampaign } from './hooks';

interface CampaignCancelModalProps {
  institutionId: string;
  campaign: GroupMatchingCampaign | null;
  open: boolean;
  onClose: () => void;
}

export function CampaignCancelModal({
  institutionId,
  campaign,
  open,
  onClose,
}: CampaignCancelModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ reason: string }>();
  const cancel = useCancelGroupMatchingCampaign();

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  const submit = async ({ reason }: { reason: string }) => {
    if (!campaign) return;
    try {
      await cancel.mutateAsync({
        institutionId,
        campaignId: campaign.id,
        expectedRevision: campaign.revision,
        reason: reason.trim(),
      });
      message.success('拼课已取消，未成班报名已统一退出');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      title={`取消拼课${campaign ? ` · ${campaign.title}` : ''}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认取消"
      okButtonProps={{ danger: true }}
      confirmLoading={cancel.isPending}
      destroyOnHidden
    >
      <Alert
        type="warning"
        showIcon
        title="取消前，所有已收意向金必须先完成线下退款登记。取消后，其余未成班报名将自动退出。"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item
          name="reason"
          label="取消原因"
          rules={[{ required: true, message: '请填写取消原因' }]}
        >
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
