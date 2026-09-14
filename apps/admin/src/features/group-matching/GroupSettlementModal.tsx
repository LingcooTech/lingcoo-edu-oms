import { Alert, App, Descriptions, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';

import {
  depositPaymentMethodOptions,
  errorMessage,
  localDateTimeValue,
  money,
  nullable,
  toIso,
} from './formatters';
import { useRecordGroupOfflineSettlement } from './hooks';

type SettlementFormValues = {
  paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
  paidAt: string;
  paymentReference?: string;
  paymentNote?: string;
};

export interface GroupSettlementTarget {
  id: string;
  institutionId: string;
  studentName: string;
  guardianName: string;
  orderNo: string;
  amountMinor: number;
  depositAppliedMinor: number;
  balanceDueMinor: number;
  revision: number;
}

export function GroupSettlementModal({
  open,
  order,
  onClose,
}: {
  open: boolean;
  order: GroupSettlementTarget | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<SettlementFormValues>();
  const settlement = useRecordGroupOfflineSettlement();

  useEffect(() => {
    if (!open || !order) return;
    form.setFieldsValue({
      paymentMethod: 'cash',
      paidAt: localDateTimeValue(),
      paymentReference: undefined,
      paymentNote: undefined,
    });
  }, [form, open, order]);

  const submit = async (values: SettlementFormValues) => {
    if (!order) return;
    try {
      await settlement.mutateAsync({
        institutionId: order.institutionId,
        orderId: order.id,
        expectedRevision: order.revision,
        paidAmountMinor: order.balanceDueMinor,
        paymentMethod: values.paymentMethod,
        paidAt: toIso(values.paidAt)!,
        paymentReference: nullable(values.paymentReference),
        paymentNote: nullable(values.paymentNote),
      });
      message.success('尾款已登记，系统将自动发放拼课课时；如发放异常会进入待处理状态。');
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      title={`登记线下尾款${order ? ` · ${order.studentName}` : ''}`}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认收款并发课"
      confirmLoading={settlement.isPending}
      destroyOnHidden
    >
      {order && (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="尾款金额由拼课成班快照锁定，登记成功后会自动进入课时发放流程。"
          />
          <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="订单号">{order.orderNo}</Descriptions.Item>
            <Descriptions.Item label="学员 / 家长">
              {order.studentName} / {order.guardianName}
            </Descriptions.Item>
            <Descriptions.Item label="总额">{money(order.amountMinor)}</Descriptions.Item>
            <Descriptions.Item label="已抵扣意向金">
              {money(order.depositAppliedMinor)}
            </Descriptions.Item>
            <Descriptions.Item label="本次固定收尾款">
              {money(order.balanceDueMinor)}
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item name="paymentMethod" label="收款方式" rules={[{ required: true }]}>
          <Select options={depositPaymentMethodOptions} />
        </Form.Item>
        <Form.Item name="paidAt" label="收款时间" rules={[{ required: true }]}>
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
