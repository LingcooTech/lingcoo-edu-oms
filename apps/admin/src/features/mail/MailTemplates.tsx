import { EditOutlined, RollbackOutlined } from '@ant-design/icons';
import type { MailTemplate } from '@lingcoo-edu-oms/contracts';
import { App, Button, Card, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { useCan } from '../access/PermissionContext';
import { useMailTemplates, useResetMailTemplate, useUpdateMailTemplate } from './hooks';

export function MailTemplates() {
  const { message, modal } = App.useApp();
  const canManage = useCan('mail.manage');
  const result = useMailTemplates();
  const update = useUpdateMailTemplate();
  const reset = useResetMailTemplate();
  const [editing, setEditing] = useState<MailTemplate | null>(null);
  const resetOne = (item: MailTemplate) =>
    modal.confirm({
      title: '恢复代码默认模板？',
      content: '当前覆盖版本将删除，后续投递使用代码内默认模板；历史投递事实不受影响。',
      okText: '恢复默认',
      async onOk() {
        await reset.mutateAsync({ key: item.key, input: { expectedRevision: item.revision! } });
        void message.success('已恢复默认模板');
      },
    });
  return (
    <Card>
      <AsyncState
        loading={result.isPending}
        error={result.error}
        empty={!result.data?.items.length}
      >
        <Table
          rowKey="key"
          dataSource={result.data?.items ?? []}
          pagination={false}
          columns={[
            {
              title: '模板',
              render: (_: unknown, item: MailTemplate) => (
                <Space orientation="vertical" size={0}>
                  <Typography.Text strong>{item.name}</Typography.Text>
                  <Typography.Text type="secondary">{item.key}</Typography.Text>
                </Space>
              ),
            },
            {
              title: '变量',
              render: (_: unknown, item: MailTemplate) => (
                <Space wrap>
                  {item.variables.map((variable) => (
                    <Tag key={variable}>{`{{${variable}}}`}</Tag>
                  ))}
                </Space>
              ),
            },
            {
              title: '版本',
              width: 120,
              render: (_: unknown, item: MailTemplate) => `${item.version}.${item.revision ?? 0}`,
            },
            {
              title: '来源',
              width: 110,
              render: (_: unknown, item: MailTemplate) => (
                <Tag color={item.overridden ? 'blue' : 'default'}>
                  {item.overridden ? '管理后台' : '代码默认'}
                </Tag>
              ),
            },
            {
              title: '操作',
              width: 190,
              render: (_: unknown, item: MailTemplate) =>
                canManage ? (
                  <Space>
                    <Button type="link" icon={<EditOutlined />} onClick={() => setEditing(item)}>
                      编辑
                    </Button>
                    {item.overridden && (
                      <Button
                        type="link"
                        icon={<RollbackOutlined />}
                        onClick={() => resetOne(item)}
                      >
                        恢复默认
                      </Button>
                    )}
                  </Space>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      </AsyncState>
      <TemplateEditor
        item={editing}
        saving={update.isPending}
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          if (!editing) return;
          await update.mutateAsync({
            key: editing.key,
            input: { ...values, expectedRevision: editing.revision },
          });
          void message.success('模板已更新');
          setEditing(null);
        }}
      />
    </Card>
  );
}

function TemplateEditor({
  item,
  saving,
  onClose,
  onSave,
}: {
  item: MailTemplate | null;
  saving: boolean;
  onClose(): void;
  onSave(values: { subjectTemplate: string; textTemplate: string }): Promise<void>;
}) {
  const [form] = Form.useForm();
  return (
    <Modal
      title={`编辑模板：${item?.name ?? ''}`}
      open={Boolean(item)}
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      {item && (
        <Form form={form} layout="vertical" initialValues={item} onFinish={onSave}>
          <Typography.Paragraph type="secondary">
            仅支持页面所列的双花括号变量；不支持 HTML、Helper 或逻辑表达式。HTML
            正文由纯文本安全转义生成。
          </Typography.Paragraph>
          <Form.Item name="subjectTemplate" label="主题" rules={[{ required: true }, { max: 500 }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="textTemplate"
            label="纯文本正文"
            rules={[{ required: true }, { max: 20000 }]}
          >
            <Input.TextArea rows={12} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}
