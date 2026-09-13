import { WalletOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect } from 'react';

import { useGuardianBindings, useStudents } from '../people/hooks';
import type {
  GroupMatchingCampaign,
  GroupMatchingCampaignDetail,
  GroupMatchingEnrollment,
} from './api';
import { dateTime, enrollmentStatusMeta, errorMessage, money, nullable } from './formatters';
import { useAddGroupMatchingEnrollment } from './hooks';

interface EnrollmentFormValues {
  studentId: string;
  guardianId: string;
  schedulePreference?: string;
  notes?: string;
}

interface EnrollmentTableProps {
  campaign: GroupMatchingCampaign;
  detail: GroupMatchingCampaignDetail;
  canManage: boolean;
  onRecordDeposit: (enrollment: GroupMatchingEnrollment) => void;
}

export function EnrollmentTable({
  campaign,
  detail,
  canManage,
  onRecordDeposit,
}: EnrollmentTableProps) {
  const columns: TableColumnsType<GroupMatchingEnrollment> = [
    {
      title: '学员 / 家长',
      render: (_, item) => (
        <Space orientation="vertical" size={0}>
          <Typography.Text strong>{item.studentNameSnapshot}</Typography.Text>
          <Typography.Text type="secondary">{item.guardianNameSnapshot}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '报名状态',
      render: (_, item) => (
        <Tag color={enrollmentStatusMeta[item.status].color}>
          {enrollmentStatusMeta[item.status].label}
        </Tag>
      ),
    },
    { title: '时间偏好', dataIndex: 'schedulePreference', render: (value) => value || '—' },
    {
      title: '意向金',
      render: (_, item) => (
        <Space orientation="vertical" size={0}>
          <span>{money(item.depositAmountMinor)}</span>
          <Typography.Text type="secondary">
            {item.depositPaidAt
              ? `${item.depositPaymentMethod || '—'} · ${dateTime(item.depositPaidAt)}`
              : '未登记'}
          </Typography.Text>
        </Space>
      ),
    },
    { title: '备注', dataIndex: 'notes', render: (value) => value || '—' },
    {
      title: '操作',
      width: 120,
      render: (_, item) =>
        canManage && item.status === 'pending_deposit' && campaign.depositAmountMinor > 0 ? (
          <Button type="link" icon={<WalletOutlined />} onClick={() => onRecordDeposit(item)}>
            登记意向金
          </Button>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <Table
      rowKey="id"
      size="small"
      columns={columns}
      dataSource={detail.enrollments.items}
      pagination={false}
      scroll={{ x: 860 }}
      locale={{ emptyText: '尚无报名学员' }}
    />
  );
}

interface EnrollmentModalProps {
  institutionId: string;
  campaign: GroupMatchingCampaign;
  open: boolean;
  onClose: () => void;
}

export function EnrollmentModal({ institutionId, campaign, open, onClose }: EnrollmentModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<EnrollmentFormValues>();
  const studentId = Form.useWatch('studentId', form);
  const students = useStudents(institutionId, {
    page: 1,
    pageSize: 500,
    status: 'active',
    relationshipStatus: 'active',
  });
  const guardians = useGuardianBindings(institutionId, studentId ?? null, Boolean(studentId));
  const addEnrollment = useAddGroupMatchingEnrollment();

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);
  useEffect(() => {
    form.setFieldValue('guardianId', undefined);
  }, [form, studentId]);

  const submit = async (values: EnrollmentFormValues) => {
    try {
      await addEnrollment.mutateAsync({
        institutionId,
        campaignId: campaign.id,
        input: {
          studentId: values.studentId,
          guardianId: values.guardianId,
          schedulePreference: nullable(values.schedulePreference),
          notes: nullable(values.notes),
          source: 'admin',
        },
      });
      message.success(
        campaign.depositAmountMinor === 0 ? '报名已占位' : '报名已添加，请登记意向金',
      );
      onClose();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      title="添加拼课报名"
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认报名"
      confirmLoading={addEnrollment.isPending}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={
          campaign.depositAmountMinor === 0
            ? '该拼课不收意向金，报名将直接占位。'
            : `本拼课意向金为 ${money(campaign.depositAmountMinor)}，报名后请登记线下收款。`
        }
      />
      <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
        <Form.Item
          name="studentId"
          label="已有学员"
          rules={[{ required: true, message: '请选择学员' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={students.isPending}
            options={(students.data?.items ?? []).map((item) => ({
              value: item.id,
              label: `${item.fullName}${item.grade ? ` · ${item.grade}` : ''}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="guardianId"
          label="付款 / 联系家长"
          rules={[{ required: true, message: '请选择已绑定家长' }]}
          extra={
            studentId && guardians.data?.items.length === 0
              ? '该学员尚未绑定家长，请先在学员档案中完成绑定。'
              : undefined
          }
        >
          <Select
            disabled={!studentId}
            loading={guardians.isPending}
            options={(guardians.data?.items ?? [])
              .filter((item) => item.status === 'active')
              .map((item) => ({
                value: item.guardian.id,
                label: `${item.guardian.fullName}${item.isPrimary ? '（主要联系人）' : ''}`,
              }))}
          />
        </Form.Item>
        <Form.Item name="schedulePreference" label="时间偏好">
          <Input.TextArea rows={2} placeholder="例如：仅周末上午；周三晚也可" />
        </Form.Item>
        <Form.Item name="notes" label="内部备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
