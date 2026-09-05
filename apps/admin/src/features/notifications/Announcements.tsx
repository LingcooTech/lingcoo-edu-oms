import { EditOutlined, PlusOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import type {
  AnnouncementDetail,
  AnnouncementStatus,
  AnnouncementSummary,
  NotificationLevel,
} from '@lingcoo-edu-oms/contracts';
import {
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { notificationsApi } from './api';
import {
  useAnnouncements,
  useCreateAnnouncement,
  usePublishAnnouncement,
  useUpdateAnnouncement,
  useWithdrawAnnouncement,
} from './hooks';

const statusView: Record<AnnouncementStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  publishing: { label: '发布中', color: 'processing' },
  published: { label: '已发布', color: 'success' },
  withdrawn: { label: '已撤回', color: 'warning' },
};
type EditorState = 'new' | AnnouncementDetail | null;
interface FormValues {
  title: string;
  body: string;
  level: NotificationLevel;
  ctaLabel?: string;
  ctaUrl?: string;
  audienceType: 'all_active_users' | 'selected_users';
  userIds?: string[];
  email: boolean;
}

export function Announcements({ canManage }: { canManage: boolean }) {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const result = useAnnouncements({ page, pageSize: 20 });
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const publish = usePublishAnnouncement();
  const withdraw = useWithdrawAnnouncement();
  const openEdit = async (id: string) => {
    setLoadingDetail(true);
    try {
      setEditor(await notificationsApi.getAnnouncement(id));
    } finally {
      setLoadingDetail(false);
    }
  };
  const transition = (item: AnnouncementSummary, action: 'publish' | 'withdraw') =>
    modal.confirm({
      title: action === 'publish' ? '发布公告？' : '撤回公告？',
      content:
        action === 'publish'
          ? '发布后内容和受众快照不可修改，系统将由 Worker 分批生成站内通知。'
          : '撤回后用户通知中心不再展示此公告，已经发出的邮件无法撤回。',
      okText: action === 'publish' ? '确认发布' : '确认撤回',
      okButtonProps: { danger: action === 'withdraw' },
      async onOk() {
        if (action === 'publish') {
          await publish.mutateAsync({ id: item.id, revision: item.revision });
          void message.success('公告已进入异步发布队列');
        } else {
          await withdraw.mutateAsync({ id: item.id, revision: item.revision });
          void message.success('公告已撤回');
        }
      },
    });
  return (
    <Card
      title="公告管理"
      extra={
        canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditor('new')}>
            新建公告
          </Button>
        ) : undefined
      }
    >
      <AsyncState
        loading={result.isPending}
        error={result.error}
        empty={!result.data?.items.length}
      >
        <Table
          rowKey="id"
          dataSource={result.data?.items ?? []}
          scroll={{ x: 1_100 }}
          pagination={{
            current: result.data?.page,
            pageSize: result.data?.pageSize,
            total: result.data?.total,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            {
              title: '公告',
              render: (_: unknown, item: AnnouncementSummary) => (
                <Space orientation="vertical" size={2}>
                  <Typography.Text strong>{item.title}</Typography.Text>
                  <Typography.Text type="secondary" ellipsis style={{ maxWidth: 460 }}>
                    {item.body}
                  </Typography.Text>
                  <Space wrap>
                    <Tag>
                      {item.audienceType === 'all_active_users' ? '全部活跃账号' : '指定账号'}
                    </Tag>
                    {item.channels.map((channel) => (
                      <Tag key={channel}>{channel === 'in_app' ? '站内' : '邮件'}</Tag>
                    ))}
                  </Space>
                </Space>
              ),
            },
            {
              title: '状态',
              width: 110,
              render: (_: unknown, item: AnnouncementSummary) => (
                <Tag color={statusView[item.status].color}>{statusView[item.status].label}</Tag>
              ),
            },
            {
              title: '进度',
              width: 170,
              render: (_: unknown, item: AnnouncementSummary) => (
                <Progress
                  size="small"
                  percent={
                    item.recipientCount
                      ? Math.round((item.deliveredCount / item.recipientCount) * 100)
                      : 0
                  }
                  format={() => `${item.deliveredCount}/${item.recipientCount}`}
                />
              ),
            },
            {
              title: '更新时间',
              width: 190,
              render: (_: unknown, item: AnnouncementSummary) =>
                new Date(item.updatedAt).toLocaleString('zh-CN'),
            },
            {
              title: '操作',
              width: 210,
              render: (_: unknown, item: AnnouncementSummary) => (
                <Space>
                  {canManage && item.status === 'draft' && (
                    <>
                      <Button
                        type="link"
                        icon={<EditOutlined />}
                        loading={loadingDetail}
                        onClick={() => void openEdit(item.id)}
                      >
                        编辑
                      </Button>
                      <Button
                        type="link"
                        icon={<SendOutlined />}
                        onClick={() => transition(item, 'publish')}
                      >
                        发布
                      </Button>
                    </>
                  )}
                  {canManage && ['publishing', 'published'].includes(item.status) && (
                    <Button
                      type="link"
                      danger
                      icon={<StopOutlined />}
                      onClick={() => transition(item, 'withdraw')}
                    >
                      撤回
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </AsyncState>
      <AnnouncementEditor
        state={editor}
        saving={create.isPending || update.isPending}
        onClose={() => setEditor(null)}
        onSave={async (values) => {
          const audience =
            values.audienceType === 'selected_users'
              ? { type: 'selected_users' as const, userIds: values.userIds ?? [] }
              : { type: 'all_active_users' as const };
          const content = {
            title: values.title,
            body: values.body,
            level: values.level,
            ctaLabel: values.ctaLabel || null,
            ctaUrl: values.ctaUrl || null,
            audience,
            channels: values.email ? (['in_app', 'email'] as const) : (['in_app'] as const),
          };
          if (editor === 'new') {
            await create.mutateAsync({
              ...content,
              channels: [...content.channels],
              deduplicationKey: crypto.randomUUID(),
            });
            void message.success('公告草稿已创建');
          } else if (editor) {
            await update.mutateAsync({
              id: editor.id,
              input: {
                ...content,
                channels: [...content.channels],
                expectedRevision: editor.revision,
              },
            });
            void message.success('公告草稿已更新');
          }
          setEditor(null);
        }}
      />
    </Card>
  );
}

function AnnouncementEditor({
  state,
  saving,
  onClose,
  onSave,
}: {
  state: EditorState;
  saving: boolean;
  onClose(): void;
  onSave(values: FormValues): Promise<void>;
}) {
  const [form] = Form.useForm<FormValues>();
  const audienceType = Form.useWatch('audienceType', form);
  const item = state === 'new' ? null : state;
  const initialValues: FormValues = item
    ? {
        title: item.title,
        body: item.body,
        level: item.level,
        ctaLabel: item.ctaLabel ?? undefined,
        ctaUrl: item.ctaUrl ?? undefined,
        audienceType: item.audience.type,
        userIds: item.audience.type === 'selected_users' ? item.audience.userIds : undefined,
        email: item.channels.includes('email'),
      }
    : { title: '', body: '', level: 'info', audienceType: 'all_active_users', email: false };
  return (
    <Modal
      title={state === 'new' ? '新建公告草稿' : '编辑公告草稿'}
      open={Boolean(state)}
      width={720}
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      {state && (
        <Form form={form} layout="vertical" initialValues={initialValues} onFinish={onSave}>
          <Form.Item name="title" label="标题" rules={[{ required: true }, { max: 200 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="body" label="正文" rules={[{ required: true }, { max: 5000 }]}>
            <Input.TextArea rows={6} showCount maxLength={5000} />
          </Form.Item>
          <Space align="start" wrap>
            <Form.Item name="level" label="级别">
              <Select
                style={{ width: 140 }}
                options={['info', 'success', 'warning', 'error'].map((value) => ({ value }))}
              />
            </Form.Item>
            <Form.Item name="audienceType" label="受众">
              <Radio.Group
                options={[
                  { label: '全部活跃账号', value: 'all_active_users' },
                  { label: '指定账号', value: 'selected_users' },
                ]}
              />
            </Form.Item>
            <Form.Item name="email" valuePropName="checked" label="渠道">
              <Checkbox>同时发送邮件</Checkbox>
            </Form.Item>
          </Space>
          {audienceType === 'selected_users' && (
            <Form.Item
              name="userIds"
              label="账号 ID"
              rules={[{ required: true, message: '至少输入一个账号 ID' }]}
              extra="输入 UUID 后按回车；发布时会再次校验账号仍处于启用状态。"
            >
              <Select mode="tags" tokenSeparators={[',', ' ']} open={false} />
            </Form.Item>
          )}
          <Space align="start" wrap style={{ width: '100%' }}>
            <Form.Item name="ctaLabel" label="操作文案">
              <Input placeholder="查看详情" maxLength={80} />
            </Form.Item>
            <Form.Item name="ctaUrl" label="操作链接">
              <Input placeholder="/path 或 https://..." style={{ width: 360 }} />
            </Form.Item>
          </Space>
          <Typography.Paragraph type="secondary">
            公告发布后内容与受众快照不可修改。邮件发送由 Mail/Jobs 独立重试，失败不会删除站内通知。
          </Typography.Paragraph>
        </Form>
      )}
    </Modal>
  );
}
