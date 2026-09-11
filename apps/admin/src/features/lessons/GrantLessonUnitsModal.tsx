import type { LessonBatchSourceType } from '@lingcoo-edu-oms/contracts';
import { Form, Input, InputNumber, Modal, Segmented, Select, Space } from 'antd';

export type GrantLessonUnitsFormValues = {
  mode: 'template' | 'custom';
  templateId?: string;
  baseUnits?: number;
  bonusUnits?: number;
  source: Exclude<LessonBatchSourceType, 'adjustment' | 'online_purchase'>;
  sourceReference?: string;
  reason: string;
};

const grantSourceLabels: Record<
  Exclude<LessonBatchSourceType, 'adjustment' | 'online_purchase'>,
  string
> = {
  offline_purchase: '线下购课登记',
  gift: '赠送',
  makeup: '补发',
  migration_opening: '迁移期初',
  custom: '自定义发放',
};

export function GrantLessonUnitsModal({
  open,
  packages,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  packages: Array<{ id: string; name: string; baseUnits: number; bonusUnits: number }>;
  loading: boolean;
  onClose(): void;
  onSubmit(values: GrantLessonUnitsFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<GrantLessonUnitsFormValues>();
  const mode = Form.useWatch('mode', form);
  return (
    <Modal
      open={open}
      width={620}
      destroyOnHidden
      title="发放课时"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (visible) {
          form.setFieldsValue({
            mode: packages.length ? 'template' : 'custom',
            source: 'offline_purchase',
            baseUnits: 10,
            bonusUnits: 0,
          });
        }
      }}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="mode" label="发放方式">
          <Segmented
            block
            options={[
              { label: '从课时包发放', value: 'template', disabled: packages.length === 0 },
              { label: '自定义课时', value: 'custom' },
            ]}
          />
        </Form.Item>
        {mode === 'template' ? (
          <Form.Item name="templateId" label="课时包" rules={[{ required: true }]}>
            <Select
              placeholder="选择启用中的课时包"
              options={packages.map((item) => ({
                value: item.id,
                label: `${item.name} · ${item.baseUnits}+${item.bonusUnits} 课时`,
              }))}
            />
          </Form.Item>
        ) : (
          <Space align="start">
            <Form.Item
              name="baseUnits"
              label="基础课时"
              rules={[{ required: true, type: 'number', min: 1 }]}
            >
              <InputNumber min={1} precision={0} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="bonusUnits" label="赠送课时" rules={[{ type: 'number', min: 0 }]}>
              <InputNumber min={0} precision={0} style={{ width: 180 }} />
            </Form.Item>
          </Space>
        )}
        <Form.Item name="source" label="来源类型" rules={[{ required: true }]}>
          <Select
            options={Object.entries(grantSourceLabels).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item
          name="sourceReference"
          label="来源编号"
          tooltip="例如线下单据号；同一来源编号不会重复发放"
        >
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item name="reason" label="发放原因" rules={[{ required: true, max: 500 }]}>
          <Input.TextArea rows={3} showCount maxLength={500} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
