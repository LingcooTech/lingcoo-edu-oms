import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { AccessRoleSummary, PermissionKey } from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from './PermissionContext';
import { PermissionMatrix } from './PermissionMatrix';
import {
  useCreateRole,
  useDeleteRole,
  usePermissionCatalog,
  useReplaceRolePermissions,
  useRole,
  useRoles,
  useUpdateRole,
} from './hooks';

interface RoleFormValue {
  key: string;
  name: string;
  description?: string;
}

export function RolesPage() {
  const { message, modal } = App.useApp();
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const canManage = useCan('roles.manage');
  const createRole = useCreateRole();
  const deleteRole = useDeleteRole();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<RoleFormValue>();
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);

  const submitCreate = async () => {
    const values = await form.validateFields();
    await createRole.mutateAsync({
      ...values,
      description: values.description || null,
      permissions,
    });
    message.success('角色已创建');
    setCreateOpen(false);
    form.resetFields();
    setPermissions([]);
  };

  const confirmDelete = (role: AccessRoleSummary) => {
    modal.confirm({
      title: `删除角色“${role.name}”？`,
      content:
        role.userCount > 0
          ? `该角色当前分配给 ${role.userCount} 个账号，删除后将解除这些分配。`
          : '此操作不可撤销。',
      okText: '删除',
      okButtonProps: { danger: true },
      async onOk() {
        await deleteRole.mutateAsync(role.id);
        message.success('角色已删除');
      },
    });
  };

  return (
    <PageContainer
      title="角色与权限"
      description="用角色组合权限，再将角色分配给账号。系统 Owner 始终拥有完整权限且不可修改。"
      actions={
        canManage ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建角色
          </Button>
        ) : undefined
      }
    >
      <Card>
        <AsyncState
          loading={roles.isPending}
          error={roles.error}
          empty={roles.data?.items.length === 0}
        >
          <Table
            rowKey="id"
            pagination={false}
            dataSource={roles.data?.items ?? []}
            columns={[
              {
                title: '角色',
                dataIndex: 'name',
                render: (_, role) => (
                  <Space orientation="vertical" size={0}>
                    <Space>
                      <Typography.Text strong>{role.name}</Typography.Text>
                      {role.system && <Tag color="blue">系统角色</Tag>}
                    </Space>
                    <Typography.Text type="secondary">{role.key}</Typography.Text>
                  </Space>
                ),
              },
              { title: '说明', dataIndex: 'description', render: (value) => value || '—' },
              { title: '权限数', dataIndex: 'permissionCount', width: 100 },
              { title: '账号数', dataIndex: 'userCount', width: 100 },
              {
                title: '操作',
                width: 180,
                render: (_, role) => (
                  <Space>
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => setEditingId(role.id)}
                    >
                      {role.system || !canManage ? '查看' : '编辑'}
                    </Button>
                    {canManage && !role.system && (
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => confirmDelete(role)}
                      >
                        删除
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>

      <Modal
        title="新建角色"
        open={createOpen}
        width={820}
        confirmLoading={createRole.isPending}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <div className="access-form-grid">
            <Form.Item
              label="角色名称"
              name="name"
              rules={[{ required: true, message: '请输入角色名称' }]}
            >
              <Input placeholder="例如：运营管理员" />
            </Form.Item>
            <Form.Item
              label="角色标识"
              name="key"
              rules={[
                { required: true, message: '请输入角色标识' },
                {
                  pattern: /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/,
                  message: '使用小写字母、数字、短横线和点',
                },
              ]}
            >
              <Input placeholder="例如：operations.manager" />
            </Form.Item>
          </div>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={2} maxLength={300} showCount />
          </Form.Item>
        </Form>
        <Typography.Title level={5}>权限</Typography.Title>
        <AsyncState loading={catalog.isPending} error={catalog.error}>
          <PermissionMatrix
            catalog={catalog.data?.items ?? []}
            value={permissions}
            onChange={setPermissions}
          />
        </AsyncState>
      </Modal>

      <RoleDrawer
        id={editingId}
        open={Boolean(editingId)}
        canManage={canManage}
        onClose={() => setEditingId(null)}
      />
    </PageContainer>
  );
}

function RoleDrawer({
  id,
  open,
  canManage,
  onClose,
}: {
  id: string | null;
  open: boolean;
  canManage: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const role = useRole(id);
  const catalog = usePermissionCatalog();
  const update = useUpdateRole();
  const replacePermissions = useReplaceRolePermissions();
  const [form] = Form.useForm<Pick<RoleFormValue, 'name' | 'description'>>();
  const [permissions, setPermissions] = useState<PermissionKey[]>([]);
  const mutable = canManage && !role.data?.system;

  useEffect(() => {
    if (!role.data) return;
    form.setFieldsValue({ name: role.data.name, description: role.data.description ?? undefined });
    setPermissions(role.data.permissions);
  }, [form, role.data]);

  const save = async () => {
    if (!id) return;
    const values = await form.validateFields();
    await update.mutateAsync({
      id,
      input: { name: values.name, description: values.description || null },
    });
    await replacePermissions.mutateAsync({ id, permissions });
    message.success('角色已保存');
  };

  return (
    <Drawer
      title={role.data?.name ?? '角色详情'}
      size={720}
      open={open}
      onClose={onClose}
      extra={
        mutable ? (
          <Button
            type="primary"
            loading={update.isPending || replacePermissions.isPending}
            onClick={() => void save()}
          >
            保存
          </Button>
        ) : undefined
      }
    >
      <AsyncState loading={role.isPending} error={role.error}>
        {role.data && (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            {role.data.system && (
              <Alert type="info" showIcon title="系统角色由 Bootstrap 维护，不能手工修改。" />
            )}
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[{ key: 'key', label: '角色标识', children: role.data.key }]}
            />
            <Form form={form} layout="vertical" disabled={!mutable}>
              <Form.Item label="角色名称" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="说明" name="description">
                <Input.TextArea rows={2} maxLength={300} showCount />
              </Form.Item>
            </Form>
            <div>
              <Typography.Title level={5}>
                <SafetyCertificateOutlined /> 权限矩阵
              </Typography.Title>
              <AsyncState loading={catalog.isPending} error={catalog.error}>
                <PermissionMatrix
                  catalog={catalog.data?.items ?? []}
                  value={permissions}
                  disabled={!mutable}
                  onChange={setPermissions}
                />
              </AsyncState>
            </div>
          </Space>
        )}
      </AsyncState>
    </Drawer>
  );
}
