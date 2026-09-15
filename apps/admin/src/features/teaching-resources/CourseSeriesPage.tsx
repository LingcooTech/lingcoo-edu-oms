import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type {
  CourseSeries,
  CourseSeriesStatus,
  CreateCourseSeriesRequest,
  UpdateCourseSeriesRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  App,
  Alert,
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
} from 'antd';
import { useEffect, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions } from '../organization/hooks';
import {
  useCourseSeries,
  useCreateCourseSeries,
  useDeleteCourseSeries,
  useUpdateCourseSeries,
} from './hooks';

const statusOptions = [
  { value: 'active', label: '启用' },
  { value: 'inactive', label: '停用' },
];

type FormValues = CreateCourseSeriesRequest;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export function CourseSeriesPage() {
  const { message, modal } = App.useApp();
  const canManage = useCan('education.courses.manage');
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CourseSeriesStatus>();
  const [editing, setEditing] = useState<CourseSeries | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const series = useCourseSeries(institutionId, {
    page: 1,
    pageSize: 100,
    search: search || undefined,
    status,
  });
  const create = useCreateCourseSeries();
  const update = useUpdateCourseSeries();
  const remove = useDeleteCourseSeries();

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0])
      setInstitutionId(institutions.data.items[0].id);
  }, [institutionId, institutions.data]);

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function submit(values: FormValues) {
    if (!institutionId) return;
    try {
      if (editing) {
        await update.mutateAsync({
          institutionId,
          id: editing.id,
          input: { expectedRevision: editing.revision, ...values } as UpdateCourseSeriesRequest,
        });
      } else {
        await create.mutateAsync({ institutionId, input: values });
      }
      closeModal();
      void message.success('课程系列已保存');
    } catch (error) {
      void message.error(errorMessage(error));
    }
  }

  function confirmDelete(item: CourseSeries) {
    modal.confirm({
      title: '删除课程系列？',
      content: '只有未关联任何课程的系列才允许删除；已有关联时请先解除关联或停用。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!institutionId) return;
        try {
          await remove.mutateAsync({ institutionId, id: item.id, expectedRevision: item.revision });
          void message.success('课程系列已删除');
        } catch (error) {
          void message.error(errorMessage(error));
          throw error;
        }
      },
    });
  }

  return (
    <PageContainer
      title="课程系列"
      description="课程系列只用于机构范围内的课程目录分类；不会限制课时包、课时账户、订单或消课。"
      actions={
        canManage ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!institutionId}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            新建课程系列
          </Button>
        ) : undefined
      }
    >
      <Alert
        type="info"
        showIcon
        message="目录分类与课时账本完全解耦"
        description="停用系列不会影响已关联课程；删除仅允许没有课程引用的系列，避免破坏课程目录历史。"
        style={{ marginBottom: 16 }}
      />
      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: '100%' }}>
          <Select
            showSearch
            optionFilterProp="label"
            value={institutionId}
            options={(institutions.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            placeholder="选择机构"
            style={{ minWidth: 280 }}
            onChange={setInstitutionId}
          />
          <Input.Search
            allowClear
            placeholder="搜索名称、编码或 slug"
            style={{ width: 280 }}
            onSearch={(value) => setSearch(value.trim())}
          />
          <Select
            allowClear
            placeholder="状态"
            options={statusOptions}
            style={{ width: 130 }}
            onChange={setStatus}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void series.refetch()}>
            刷新
          </Button>
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={series.isPending}
          error={series.error}
          empty={!series.data?.items.length}
        >
          <Table<CourseSeries>
            rowKey="id"
            dataSource={series.data?.items}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 900 }}
            columns={[
              { title: '名称', dataIndex: 'name' },
              { title: '编码', dataIndex: 'code', render: (value) => value || '—' },
              { title: 'slug', dataIndex: 'slug', render: (value) => value || '—' },
              { title: '排序', dataIndex: 'sortOrder' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (value: CourseSeriesStatus) => (
                  <Tag color={value === 'active' ? 'success' : 'default'}>
                    {value === 'active' ? '启用' : '停用'}
                  </Tag>
                ),
              },
              {
                title: '操作',
                render: (_, item) => (
                  <Space>
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      disabled={!canManage}
                      onClick={() => {
                        setEditing(item);
                        setModalOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      type="link"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={!canManage}
                      onClick={() => confirmDelete(item)}
                    >
                      删除
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>
      <CourseSeriesModal
        open={modalOpen}
        value={editing}
        loading={create.isPending || update.isPending}
        onCancel={closeModal}
        onSubmit={submit}
      />
    </PageContainer>
  );
}

function CourseSeriesModal({
  open,
  value,
  loading,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  value: CourseSeries | null;
  loading: boolean;
  onCancel(): void;
  onSubmit(values: FormValues): Promise<void>;
}) {
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: value?.name ?? '',
      code: value?.code ?? null,
      slug: value?.slug ?? null,
      description: value?.description ?? null,
      status: value?.status ?? 'active',
      sortOrder: value?.sortOrder ?? 0,
    });
  }, [form, open, value]);

  return (
    <Modal
      open={open}
      destroyOnHidden
      title={value ? '编辑课程系列' : '新建课程系列'}
      okText="保存"
      cancelText="取消"
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={() => form.submit()}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入系列名称' }]}>
          <Input />
        </Form.Item>
        <Space.Compact block>
          <Form.Item
            name="code"
            label="编码"
            style={{ width: '50%', marginRight: 8 }}
            rules={[{ max: 80, message: '编码不能超过 80 个字符' }]}
          >
            <Input placeholder="如 calligraphy" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="slug"
            style={{ width: '50%' }}
            rules={[{ max: 120, message: 'slug 不能超过 120 个字符' }]}
          >
            <Input placeholder="如 calligraphy-basic" />
          </Form.Item>
        </Space.Compact>
        <Form.Item
          noStyle
          shouldUpdate={(previous, current) =>
            previous.code !== current.code || previous.slug !== current.slug
          }
        >
          {({ getFieldValue }) =>
            !getFieldValue('code') && !getFieldValue('slug') ? (
              <Alert
                type="warning"
                showIcon
                message="编码和 slug 至少填写一个"
                style={{ marginBottom: 16 }}
              />
            ) : null
          }
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Space.Compact block>
          <Form.Item name="status" label="状态" style={{ width: '50%', marginRight: 8 }}>
            <Select options={statusOptions} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" style={{ width: '50%' }}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Space.Compact>
      </Form>
    </Modal>
  );
}
