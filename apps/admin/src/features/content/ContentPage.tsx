import { EditOutlined, ImportOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type {
  ContentItem,
  ContentStatus,
  ContentSourceType,
  CreateContentRequest,
  ImportNotionContentRequest,
  UpdateContentRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import {
  useCreateContent,
  useContentItems,
  useImportNotionContent,
  useUpdateContent,
} from './hooks';

const statuses: Record<ContentStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  published: { label: '已发布', color: 'success' },
  archived: { label: '已归档', color: 'warning' },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export function ContentPage() {
  const { message } = App.useApp();
  const canManage = useCan('education.content.manage');
  const [status, setStatus] = useState<ContentStatus>();
  const [sourceType, setSourceType] = useState<ContentSourceType>();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notionOpen, setNotionOpen] = useState(false);
  const items = useContentItems({
    page: 1,
    pageSize: 100,
    search: search || undefined,
    status,
    sourceType,
  });
  const create = useCreateContent();
  const update = useUpdateContent();
  const importNotion = useImportNotionContent();

  async function submit(values: CreateContentRequest) {
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          input: { ...values, expectedRevision: editing.revision } as UpdateContentRequest,
        });
        message.success('内容已更新');
      } else {
        await create.mutateAsync(values);
        message.success('内容已创建');
      }
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function importFromNotion(values: ImportNotionContentRequest) {
    try {
      await importNotion.mutateAsync(values);
      message.success('Notion 内容已导入为草稿');
      setNotionOpen(false);
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  return (
    <PageContainer
      title="内容营销"
      description="管理内容资产并沉淀可追踪的内容来源；当前先支持手工内容和 Notion 导入。"
      actions={
        canManage && (
          <Space>
            <Button icon={<ImportOutlined />} onClick={() => setNotionOpen(true)}>
              从 Notion 导入
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              新建内容
            </Button>
          </Space>
        )
      }
    >
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="搜索标题或摘要"
            style={{ width: 300 }}
            onSearch={(value) => setSearch(value.trim())}
          />
          <Select
            allowClear
            placeholder="内容状态"
            style={{ width: 140 }}
            value={status}
            options={Object.entries(statuses).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onChange={setStatus}
          />
          <Select
            allowClear
            placeholder="内容来源"
            style={{ width: 140 }}
            value={sourceType}
            options={[
              { value: 'manual', label: '手工创建' },
              { value: 'notion', label: 'Notion' },
            ]}
            onChange={setSourceType}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={items.isFetching}
            onClick={() => void items.refetch()}
          >
            刷新
          </Button>
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={items.isPending}
          error={items.error}
          empty={items.data?.items.length === 0}
        >
          <Table<ContentItem>
            rowKey="id"
            scroll={{ x: 1050 }}
            dataSource={items.data?.items ?? []}
            pagination={false}
            columns={[
              {
                title: '内容',
                width: 330,
                render: (_, item) => (
                  <Space direction="vertical" size={0}>
                    <Space>
                      {item.isPinned && <Tag color="gold">置顶</Tag>}
                      <Typography.Text strong>{item.title}</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary" ellipsis style={{ maxWidth: 290 }}>
                      {item.excerpt || '暂无摘要'}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '来源',
                width: 120,
                render: (_, item) => (item.sourceType === 'notion' ? 'Notion' : '手工创建'),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 120,
                render: (value: ContentStatus) => (
                  <Tag color={statuses[value].color}>{statuses[value].label}</Tag>
                ),
              },
              {
                title: '更新时间',
                dataIndex: 'updatedAt',
                width: 180,
                render: (value: string) =>
                  new Date(value).toLocaleString('zh-CN', { hour12: false }),
              },
              {
                title: '操作',
                width: 100,
                render: (_, item) =>
                  canManage ? (
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                  ) : null,
              },
            ]}
          />
        </AsyncState>
      </Card>
      <ContentFormModal
        open={formOpen}
        item={editing}
        loading={create.isPending || update.isPending}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={submit}
      />
      <NotionImportModal
        open={notionOpen}
        loading={importNotion.isPending}
        onCancel={() => setNotionOpen(false)}
        onSubmit={importFromNotion}
      />
    </PageContainer>
  );
}

function ContentFormModal({
  open,
  item,
  loading,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  item: ContentItem | null;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateContentRequest) => Promise<void>;
}) {
  const [form] = Form.useForm<CreateContentRequest>();
  return (
    <Modal
      title={item ? '编辑内容' : '新建内容'}
      open={open}
      width={760}
      footer={null}
      destroyOnClose
      onCancel={onCancel}
      afterOpenChange={(visible) => {
        if (visible)
          form.setFieldsValue(
            item
              ? {
                  title: item.title,
                  slug: item.slug,
                  excerpt: item.excerpt,
                  contentHtml: item.contentHtml,
                  coverUrl: item.coverUrl,
                  coverThumbUrl: item.coverThumbUrl,
                  authorName: item.authorName,
                  status: item.status,
                  isPinned: item.isPinned,
                }
              : { status: 'draft', isPinned: false },
          );
      }}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="slug" label="访问标识（可留空自动生成）">
          <Input placeholder="例如：summer-camp-intro" />
        </Form.Item>
        <Form.Item name="excerpt" label="摘要">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="contentHtml" label="正文 HTML / 富文本内容">
          <Input.TextArea rows={12} placeholder="粘贴整理后的 HTML；后续可接入富文本编辑器" />
        </Form.Item>
        <Space style={{ width: '100%' }} size="large">
          <Form.Item name="status" label="状态" initialValue="draft">
            <Select
              style={{ width: 140 }}
              options={Object.entries(statuses).map(([value, item]) => ({
                value,
                label: item.label,
              }))}
            />
          </Form.Item>
          <Form.Item name="isPinned" label="置顶" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>
        <Form.Item name="coverUrl" label="封面地址">
          <Input />
        </Form.Item>
        <Form.Item name="authorName" label="作者">
          <Input />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              保存内容
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function NotionImportModal({
  open,
  loading,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: ImportNotionContentRequest) => Promise<void>;
}) {
  const [form] = Form.useForm<ImportNotionContentRequest>();
  return (
    <Modal title="从 Notion 导入" open={open} footer={null} destroyOnClose onCancel={onCancel}>
      <Typography.Paragraph type="secondary">
        服务端通过已配置的 Notion Connection 读取页面和块内容，并保留 sourceId/sourceUrl
        便于回溯。导入结果默认是草稿。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={onSubmit} initialValues={{ status: 'draft' }}>
        <Form.Item
          name="pageIdOrUrl"
          label="Notion 页面 ID 或 URL"
          rules={[{ required: true, message: '请输入 Notion 页面 ID 或 URL' }]}
        >
          <Input placeholder="https://www.notion.so/..." />
        </Form.Item>
        <Form.Item name="status" label="导入后状态">
          <Select
            options={Object.entries(statuses).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              开始导入
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
