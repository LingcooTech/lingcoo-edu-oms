import { EditOutlined, PlusOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import type { AccessUser, CreateAccessUserRequest } from '@lingcoo-edu-oms/contracts';
import {
  App,
  Avatar,
  Button,
  Card,
  Drawer,
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
import { useEffect, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { StatusTag } from '../../components/StatusTag';
import { useCan } from './PermissionContext';
import {
  useCreateUser,
  useReplaceUserRoles,
  useRoles,
  useUpdateUser,
  useUser,
  useUsers,
} from './hooks';

interface UserFormValue {
  email: string;
  password: string;
  displayName?: string;
  emailVerified: boolean;
  roleIds: string[];
}

export function UsersPage() {
  const { message } = App.useApp();
  const canManageAccounts = useCan('accounts.manage');
  const canReadRoles = useCan('roles.read');
  const canAssignRoles = useCan(['accounts.manage', 'roles.manage']);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'disabled' | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const users = useUsers({ page, pageSize: 20, search: search || undefined, status });
  const roles = useRoles(canReadRoles);
  const createUser = useCreateUser();
  const [form] = Form.useForm<UserFormValue>();

  const submitCreate = async () => {
    const values = await form.validateFields();
    const input: CreateAccessUserRequest = {
      ...values,
      displayName: values.displayName || null,
      roleIds: canAssignRoles ? values.roleIds : [],
    };
    await createUser.mutateAsync(input);
    message.success('账号已创建');
    setCreateOpen(false);
    form.resetFields();
  };

  return (
    <PageContainer
      title="账号管理"
      description="管理可登录后台的账号、状态与角色。停用账号会立即撤销其全部活动会话。"
      actions={
        canManageAccounts ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建账号
          </Button>
        ) : undefined
      }
    >
      <Card>
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索邮箱或姓名"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            placeholder="全部状态"
            value={status}
            options={[
              { label: '正常', value: 'active' },
              { label: '已停用', value: 'disabled' },
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            style={{ width: 140 }}
          />
        </div>
        <AsyncState
          loading={users.isPending}
          error={users.error}
          empty={users.data?.items.length === 0}
        >
          <Table
            rowKey="id"
            dataSource={users.data?.items ?? []}
            pagination={{
              current: users.data?.page ?? page,
              pageSize: users.data?.pageSize ?? 20,
              total: users.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              {
                title: '账号',
                render: (_, user: AccessUser) => (
                  <Space>
                    <Avatar icon={<UserOutlined />} />
                    <Space orientation="vertical" size={0}>
                      <Typography.Text strong>{user.displayName || '未设置姓名'}</Typography.Text>
                      <Typography.Text type="secondary">{user.email}</Typography.Text>
                    </Space>
                  </Space>
                ),
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 110,
                render: (value) => (
                  <StatusTag tone={value === 'active' ? 'success' : 'neutral'}>
                    {value === 'active' ? '正常' : '已停用'}
                  </StatusTag>
                ),
              },
              {
                title: '角色',
                dataIndex: 'roles',
                render: (items: AccessUser['roles']) =>
                  items.length
                    ? items.map((role) => (
                        <Tag key={role.id} color={role.system ? 'blue' : undefined}>
                          {role.name}
                        </Tag>
                      ))
                    : '—',
              },
              {
                title: '邮箱验证',
                dataIndex: 'emailVerifiedAt',
                width: 120,
                render: (value) => (value ? <Tag color="green">已验证</Tag> : <Tag>未验证</Tag>),
              },
              {
                title: '操作',
                width: 100,
                render: (_, user: AccessUser) => (
                  <Button type="link" icon={<EditOutlined />} onClick={() => setEditingId(user.id)}>
                    {canManageAccounts ? '编辑' : '查看'}
                  </Button>
                ),
              },
            ]}
          />
        </AsyncState>
      </Card>

      <Modal
        title="新建账号"
        open={createOpen}
        confirmLoading={createUser.isPending}
        onOk={() => void submitCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ emailVerified: false, roleIds: [] }}
          requiredMark="optional"
        >
          <Form.Item label="邮箱" name="email" rules={[{ required: true }, { type: 'email' }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item label="姓名" name="displayName">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item
            label="初始密码"
            name="password"
            rules={[{ required: true }, { min: 12, message: '至少 12 个字符' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="邮箱已验证" name="emailVerified" valuePropName="checked">
            <Switch />
          </Form.Item>
          {canAssignRoles && (
            <Form.Item label="角色" name="roleIds">
              <Select
                mode="multiple"
                loading={roles.isPending}
                options={(roles.data?.items ?? []).map((role) => ({
                  label: role.name,
                  value: role.id,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <UserDrawer
        id={editingId}
        open={Boolean(editingId)}
        canManageAccounts={canManageAccounts}
        canAssignRoles={canAssignRoles}
        onClose={() => setEditingId(null)}
      />
    </PageContainer>
  );
}

function UserDrawer({
  id,
  open,
  canManageAccounts,
  canAssignRoles,
  onClose,
}: {
  id: string | null;
  open: boolean;
  canManageAccounts: boolean;
  canAssignRoles: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const user = useUser(id);
  const roles = useRoles(canAssignRoles);
  const updateUser = useUpdateUser();
  const replaceRoles = useReplaceUserRoles();
  const [form] = Form.useForm<{
    displayName?: string;
    status: 'active' | 'disabled';
    roleIds: string[];
  }>();

  useEffect(() => {
    if (!user.data) return;
    form.setFieldsValue({
      displayName: user.data.displayName ?? undefined,
      status: user.data.status,
      roleIds: user.data.roles.map((role) => role.id),
    });
  }, [form, user.data]);

  const save = async () => {
    if (!id) return;
    const values = await form.validateFields();
    await updateUser.mutateAsync({
      id,
      input: { displayName: values.displayName || null, status: values.status },
    });
    if (canAssignRoles) await replaceRoles.mutateAsync({ id, roleIds: values.roleIds });
    message.success('账号已保存');
  };

  return (
    <Drawer
      title={user.data?.displayName || user.data?.email || '账号详情'}
      size={560}
      open={open}
      onClose={onClose}
      extra={
        canManageAccounts ? (
          <Button
            type="primary"
            loading={updateUser.isPending || replaceRoles.isPending}
            onClick={() => void save()}
          >
            保存
          </Button>
        ) : undefined
      }
    >
      <AsyncState loading={user.isPending} error={user.error}>
        {user.data && (
          <Form form={form} layout="vertical" disabled={!canManageAccounts}>
            <Form.Item label="邮箱">
              <Input value={user.data.email} disabled />
            </Form.Item>
            <Form.Item label="姓名" name="displayName">
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item label="状态" name="status" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: '正常', value: 'active' },
                  { label: '已停用', value: 'disabled' },
                ]}
              />
            </Form.Item>
            <Form.Item
              label="角色"
              name="roleIds"
              extra={!canAssignRoles ? '需要“管理账号”和“管理角色”权限才能调整角色。' : undefined}
            >
              <Select
                mode="multiple"
                disabled={!canAssignRoles}
                loading={roles.isPending}
                options={(roles.data?.items ?? user.data.roles).map((role) => ({
                  label: role.system ? `${role.name}（系统）` : role.name,
                  value: role.id,
                  disabled:
                    role.key === 'system.owner' &&
                    user.data.roles.some((item) => item.key === 'system.owner'),
                }))}
              />
            </Form.Item>
          </Form>
        )}
      </AsyncState>
    </Drawer>
  );
}
