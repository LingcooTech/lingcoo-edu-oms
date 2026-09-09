import { EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type {
  CreateLessonPackageRequest,
  LessonPackage,
  LessonPackageStatus,
  UpdateLessonPackageRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions, useOrganizationProfile } from '../organization/hooks';
import { useCreateLessonPackage, useLessonPackages, useUpdateLessonPackage } from './hooks';

type PackageFormValues = {
  name: string;
  description?: string;
  baseUnits: number;
  bonusUnits: number;
  status?: LessonPackageStatus;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function nullable(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function LessonPackagesPage() {
  const { message } = App.useApp();
  const canManage = useCan('education.lesson-packages.manage');
  const organization = useOrganizationProfile();
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LessonPackageStatus | undefined>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LessonPackage | null>(null);
  const [open, setOpen] = useState(false);
  const packages = useLessonPackages(institutionId, {
    page,
    pageSize: 20,
    search: search || undefined,
    status,
  });
  const createPackage = useCreateLessonPackage();
  const updatePackage = useUpdateLessonPackage();

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0]) {
      setInstitutionId(institutions.data.items[0].id);
    }
  }, [institutionId, institutions.data]);

  const institutionOptions = useMemo(
    () =>
      (institutions.data?.items ?? []).map((institution) => ({
        label:
          organization.data?.operationMode === 'self_operated_only'
            ? institution.name
            : `${institution.name} · ${institution.type === 'self_operated' ? '自营' : '合作'}`,
        value: institution.id,
      })),
    [institutions.data, organization.data?.operationMode],
  );

  return (
    <PageContainer
      title="课时包"
      description="课时包只定义某个机构发放多少通用课时，不绑定课程、班级、教师、校区或收费订单。"
      actions={
        canManage ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!institutionId}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            新建课时包
          </Button>
        ) : undefined
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="模板修改只生成新版本，已经发放给学员的课时数量和名称快照不会变化。"
      />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="选择机构"
            loading={institutions.isPending}
            value={institutionId}
            options={institutionOptions}
            style={{ minWidth: 280 }}
            onChange={(value) => {
              setInstitutionId(value);
              setPage(1);
            }}
          />
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索课时包"
            style={{ width: 240 }}
            onSearch={(value) => {
              setSearch(value.trim());
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="状态"
            value={status}
            style={{ width: 130 }}
            options={[
              { label: '启用', value: 'active' },
              { label: '停用', value: 'inactive' },
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={packages.isFetching}
            onClick={() => void packages.refetch()}
          >
            刷新
          </Button>
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={packages.isPending}
          error={packages.error}
          empty={packages.data?.items.length === 0}
        >
          <Table<LessonPackage>
            rowKey="id"
            dataSource={packages.data?.items ?? []}
            scroll={{ x: 760 }}
            pagination={{
              current: packages.data?.page ?? page,
              pageSize: packages.data?.pageSize ?? 20,
              total: packages.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              {
                title: '课时包',
                dataIndex: 'name',
                render: (name, record) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{name}</Typography.Text>
                    <Typography.Text type="secondary">
                      {record.description || '无额外说明'}
                    </Typography.Text>
                  </Space>
                ),
              },
              { title: '基础课时', dataIndex: 'baseUnits', width: 110 },
              { title: '赠送课时', dataIndex: 'bonusUnits', width: 110 },
              {
                title: '合计',
                width: 100,
                render: (_, record) => (
                  <Typography.Text strong>{record.baseUnits + record.bonusUnits}</Typography.Text>
                ),
              },
              {
                title: '版本',
                dataIndex: 'revision',
                width: 90,
                render: (value) => `V${value}`,
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 90,
                render: (value) => (
                  <Tag color={value === 'active' ? 'success' : 'default'}>
                    {value === 'active' ? '启用' : '停用'}
                  </Tag>
                ),
              },
              {
                title: '操作',
                fixed: 'right',
                width: 90,
                render: (_, record) =>
                  canManage ? (
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(record);
                        setOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <PackageModal
        open={open}
        value={editing}
        loading={createPackage.isPending || updatePackage.isPending}
        onClose={() => setOpen(false)}
        onSubmit={async (values) => {
          if (!institutionId) return;
          try {
            const common = {
              name: values.name.trim(),
              description: nullable(values.description),
              baseUnits: values.baseUnits,
              bonusUnits: values.bonusUnits,
            };
            if (editing) {
              const input: UpdateLessonPackageRequest = {
                ...common,
                status: values.status ?? editing.status,
                expectedRevision: editing.revision,
              };
              await updatePackage.mutateAsync({
                institutionId,
                packageId: editing.id,
                input,
              });
              void message.success('课时包已更新，新版本已保存');
            } else {
              await createPackage.mutateAsync({
                institutionId,
                input: common as CreateLessonPackageRequest,
              });
              void message.success('课时包已创建');
            }
            setOpen(false);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />
    </PageContainer>
  );
}

function PackageModal({
  open,
  value,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  value: LessonPackage | null;
  loading: boolean;
  onClose(): void;
  onSubmit(values: PackageFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<PackageFormValues>();
  return (
    <Modal
      open={open}
      destroyOnHidden
      width={620}
      title={value ? '编辑课时包' : '新建课时包'}
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (!visible) return;
        form.setFieldsValue(
          value
            ? {
                name: value.name,
                description: value.description ?? undefined,
                baseUnits: value.baseUnits,
                bonusUnits: value.bonusUnits,
                status: value.status,
              }
            : { baseUnits: 10, bonusUnits: 0, status: 'active' },
        );
      }}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="课时包名称" rules={[{ required: true, max: 160 }]}>
          <Input placeholder="例如：通用课时 20 节" />
        </Form.Item>
        <Space align="start" size={20}>
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
        {value ? (
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '启用', value: 'active' },
                { label: '停用', value: 'inactive' },
              ]}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="description" label="说明" rules={[{ max: 2000 }]}>
          <Input.TextArea rows={4} showCount maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
