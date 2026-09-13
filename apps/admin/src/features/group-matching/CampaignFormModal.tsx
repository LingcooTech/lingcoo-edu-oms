import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from 'antd';
import { useEffect } from 'react';

import { useCampuses, useCourses } from '../teaching-resources/hooks';
import { nullable, errorMessage, localDateTimeValue, toIso, toMinor } from './formatters';
import { useCreateGroupMatchingCampaign } from './hooks';

type TierFormValue = {
  minParticipants: number;
  maxParticipants: number;
  priceYuan: number;
  description?: string;
};
type CampaignFormValues = {
  title: string;
  description?: string;
  courseId: string;
  campusId: string;
  minParticipants: number;
  maxParticipants: number;
  depositYuan: number;
  plannedSessionCount: number;
  unitsPerSession: number;
  durationMinutes: number;
  candidateSchedule?: string;
  recruitmentDeadlineAt: string;
  balanceDueAt?: string;
  withdrawalPolicy?: string;
  notes?: string;
  priceTiers: TierFormValue[];
};

export function CampaignFormModal({
  institutionId,
  open,
  onClose,
}: {
  institutionId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CampaignFormValues>();
  const courses = useCourses(institutionId, { page: 1, pageSize: 200, status: 'active' });
  const campuses = useCampuses({ page: 1, pageSize: 200, status: 'active' });
  const create = useCreateGroupMatchingCampaign();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      minParticipants: 2,
      maxParticipants: 6,
      depositYuan: 100,
      plannedSessionCount: 8,
      unitsPerSession: 1,
      durationMinutes: 90,
      recruitmentDeadlineAt: localDateTimeValue(new Date(Date.now() + 7 * 24 * 3_600_000)),
      priceTiers: [{ minParticipants: 2, maxParticipants: 6, priceYuan: 1_000 }],
    });
  }, [form, open]);

  const submit = async (values: CampaignFormValues) => {
    if (!institutionId) return;
    try {
      await create.mutateAsync({
        institutionId,
        input: {
          title: values.title.trim(),
          description: nullable(values.description),
          courseId: values.courseId,
          campusId: values.campusId,
          minParticipants: values.minParticipants,
          maxParticipants: values.maxParticipants,
          depositAmountMinor: toMinor(values.depositYuan),
          plannedSessionCount: values.plannedSessionCount,
          unitsPerSession: values.unitsPerSession,
          durationMinutes: values.durationMinutes,
          candidateSchedule: nullable(values.candidateSchedule),
          recruitmentDeadlineAt: toIso(values.recruitmentDeadlineAt)!,
          balanceDueAt: toIso(values.balanceDueAt),
          withdrawalPolicy: nullable(values.withdrawalPolicy),
          notes: nullable(values.notes),
          priceTiers: values.priceTiers.map((tier) => ({
            minParticipants: tier.minParticipants,
            maxParticipants: tier.maxParticipants,
            unitPriceMinor: toMinor(tier.priceYuan),
            description: nullable(tier.description),
          })),
        },
      });
      message.success('拼课草稿已创建');
      form.resetFields();
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      title="新建拼课草稿"
      open={open}
      width={1_040}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="创建草稿"
      confirmLoading={create.isPending}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="草稿可编辑；发布后开始招募。人数和价格阶梯必须覆盖完整范围。"
      />
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="title"
              label="拼课名称"
              rules={[{ required: true, message: '请输入名称' }]}
            >
              <Input placeholder="例如：周末创意美术拼课" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="description" label="简介">
              <Input placeholder="面向家长展示的简要说明" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="courseId"
              label="课程"
              rules={[{ required: true, message: '请选择课程' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={courses.isPending}
                options={(courses.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="campusId"
              label="校区"
              rules={[{ required: true, message: '请选择校区' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={campuses.isPending}
                options={(campuses.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <NumberField name="minParticipants" label="最低成班人数" min={2} />
          </Col>
          <Col xs={12} md={6}>
            <NumberField name="maxParticipants" label="最多人数" min={2} />
          </Col>
          <Col xs={12} md={6}>
            <NumberField name="depositYuan" label="每人意向金（元）" min={0} precision={2} />
          </Col>
          <Col xs={12} md={6}>
            <NumberField name="durationMinutes" label="每次时长（分钟）" min={1} />
          </Col>
          <Col xs={12} md={8}>
            <NumberField name="plannedSessionCount" label="预计课次" min={2} />
          </Col>
          <Col xs={12} md={8}>
            <NumberField name="unitsPerSession" label="每次课时" min={1} />
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="recruitmentDeadlineAt"
              label="报名截止"
              rules={[{ required: true, message: '请选择报名截止时间' }]}
            >
              <Input type="datetime-local" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="candidateSchedule" label="候选时间">
              <Input.TextArea rows={2} placeholder="例如：周六 10:00–11:30；周日 14:00–15:30" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="balanceDueAt" label="尾款截止">
              <Input type="datetime-local" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="withdrawalPolicy" label="退款 / 退出规则">
              <Input.TextArea
                rows={2}
                placeholder="例如：报名截止前可申请退意向金；成班后以正式订单退款规则为准。"
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notes" label="内部备注">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
        <Divider titlePlacement="start">价格阶梯（按最终成班人数执行）</Divider>
        <Form.List name="priceTiers">
          {(fields, { add, remove }) => (
            <Space orientation="vertical" style={{ width: '100%' }} size={8}>
              {fields.map((field, index) => (
                <Card size="small" key={field.key}>
                  <Row gutter={12} align="middle">
                    <Col xs={8} md={4}>
                      <TierNumber field={field} name="minParticipants" label="最少人数" min={2} />
                    </Col>
                    <Col xs={8} md={4}>
                      <TierNumber field={field} name="maxParticipants" label="最多人数" min={2} />
                    </Col>
                    <Col xs={8} md={5}>
                      <TierNumber
                        field={field}
                        name="priceYuan"
                        label="每人总价（元）"
                        min={0.01}
                        precision={2}
                      />
                    </Col>
                    <Col xs={18} md={8}>
                      <Form.Item {...field} name={[field.name, 'description']} label="说明">
                        <Input placeholder="可选，例如满 4 人成班价" />
                      </Form.Item>
                    </Col>
                    <Col xs={6} md={3}>
                      <Button
                        danger
                        type="text"
                        disabled={fields.length === 1}
                        onClick={() => remove(field.name)}
                        style={{ marginTop: 30 }}
                      >
                        删除
                      </Button>
                    </Col>
                  </Row>
                  {index === 0 && (
                    <Typography.Text type="secondary">
                      首档起始人数必须等于最低成班人数。
                    </Typography.Text>
                  )}
                </Card>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({ minParticipants: 2, maxParticipants: 2, priceYuan: 1_000 })}
              >
                添加价格档位
              </Button>
            </Space>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}

function NumberField({
  name,
  label,
  min,
  precision = 0,
}: {
  name: keyof CampaignFormValues;
  label: string;
  min: number;
  precision?: number;
}) {
  return (
    <Form.Item name={name} label={label} rules={[{ required: true }]}>
      <InputNumber min={min} precision={precision} style={{ width: '100%' }} />
    </Form.Item>
  );
}

function TierNumber({
  field,
  name,
  label,
  min,
  precision = 0,
}: {
  field: { name: number; key: number };
  name: keyof TierFormValue;
  label: string;
  min: number;
  precision?: number;
}) {
  return (
    <Form.Item {...field} name={[field.name, name]} label={label} rules={[{ required: true }]}>
      <InputNumber min={min} precision={precision} style={{ width: '100%' }} />
    </Form.Item>
  );
}
