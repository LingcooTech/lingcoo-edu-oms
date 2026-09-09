import {
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
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
  useResetUserPassword,
  useRoles,
  useUpdateUser,
  useUser,
  useUsers,
} from './hooks';

interface UserFormValue {
  email?: string;
  phone?: string;
  password: string;
  displayName?: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  roleIds: string[];
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function UsersPage() {
  const { message } = App.useApp();
  const canManageAccounts = useCan('accounts.manage');
  const canResetUserPassword = useCan('accounts.reset-password');
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
    let values: UserFormValue;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const input: CreateAccessUserRequest = {
      ...values,
      email: values.email || undefined,
      phone: values.phone || undefined,
      displayName: values.displayName || null,
      roleIds: canAssignRoles ? values.roleIds : [],
    };
    try {
      await createUser.mutateAsync(input);
      message.success('账号已创建');
      setCreateOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(errorMessage(error, '账号创建失败，请稍后重试'));
    }
  };

  return (
    <PageContainer
      title="账号管理"
      description="管理迁移期可登录 OMS 的账号、联系方式、状态与角色。停用账号会立即撤销其全部活动会话。"
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
            placeholder="搜索邮箱、手机号或姓名"
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
            scroll={{ x: 820 }}
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
                      <Typography.Text type="secondary">
                        {user.email ?? user.phone ?? '未设置登录方式'}
                      </Typography.Text>
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
                title: '联系方式',
                width: 220,
                render: (_, user: AccessUser) => (
                  <Space orientation="vertical" size={1}>
                    <Typography.Text>{user.phone ?? '未绑定手机号'}</Typography.Text>
                    <Typography.Text type="secondary">
                      {user.email
                        ? user.emailVerifiedAt
                          ? '邮箱已验证'
                          : '邮箱未验证'
                        : '未绑定邮箱'}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '密码',
                width: 125,
                render: (_, user: AccessUser) =>
                  user.mustChangePassword ? <Tag color="gold">待修改</Tag> : <Tag>已设置</Tag>,
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
          initialValues={{ emailVerified: false, mustChangePassword: true, roleIds: [] }}
          requiredMark="optional"
        >
          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ type: 'email', message: '请输入有效邮箱' }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="手机号"
            name="phone"
            dependencies={['email']}
            rules={[
              {
                pattern: /^(?:(?:\+86|0086)[ -]?)?1[3-9]\d{9}$/,
                message: '请输入有效的中国大陆手机号',
              },
              ({ getFieldValue }) => ({
                validator: async () => {
                  if (getFieldValue('email') || getFieldValue('phone')) return;
                  throw new Error('请至少填写邮箱或手机号');
                },
              }),
            ]}
          >
            <Input
              inputMode="tel"
              autoComplete="off"
              placeholder="仅手机号也可创建，如 13800000000"
            />
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
          <Form.Item
            label="首次登录强制修改密码"
            name="mustChangePassword"
            valuePropName="checked"
            extra="开启后，账号只能进入“账号安全”完成密码更新。"
          >
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
        canResetUserPassword={canResetUserPassword}
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
  canResetUserPassword,
  canAssignRoles,
  onClose,
}: {
  id: string | null;
  open: boolean;
  canManageAccounts: boolean;
  canResetUserPassword: boolean;
  canAssignRoles: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const user = useUser(id);
  const roles = useRoles(canAssignRoles);
  const updateUser = useUpdateUser();
  const replaceRoles = useReplaceUserRoles();
  const resetPassword = useResetUserPassword();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetForm] = Form.useForm<{ password: string }>();
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
    let values: { displayName?: string; status: 'active' | 'disabled'; roleIds: string[] };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    try {
      await updateUser.mutateAsync({
        id,
        input: { displayName: values.displayName || null, status: values.status },
      });
      if (canAssignRoles) await replaceRoles.mutateAsync({ id, roleIds: values.roleIds });
      message.success('账号已保存');
    } catch (error) {
      message.error(errorMessage(error, '账号保存失败，请稍后重试'));
    }
  };

  const submitResetPassword = async () => {
    if (!id) return;
    let values: { password: string };
    try {
      values = await resetForm.validateFields();
    } catch {
      return;
    }
    try {
      await resetPassword.mutateAsync({ id, password: values.password });
      message.success('密码已重置，账号下次登录需要修改密码');
      setResetOpen(false);
      resetForm.resetFields();
    } catch (error) {
      message.error(errorMessage(error, '密码重置失败，请稍后重试'));
    }
  };

  return (
    <Drawer
      title={user.data?.displayName || user.data?.email || user.data?.phone || '账号详情'}
      size={560}
      open={open}
      onClose={onClose}
      extra={
        canManageAccounts || canResetUserPassword ? (
          <Space>
            {canResetUserPassword && (
              <Button icon={<KeyOutlined />} onClick={() => setResetOpen(true)}>
                重置密码
              </Button>
            )}
            {canManageAccounts && (
              <Button
                type="primary"
                loading={updateUser.isPending || replaceRoles.isPending}
                onClick={() => void save()}
              >
                保存
              </Button>
            )}
          </Space>
        ) : undefined
      }
    >
      <AsyncState loading={user.isPending} error={user.error}>
        {user.data && (
          <Form form={form} layout="vertical" disabled={!canManageAccounts}>
            <Form.Item label="邮箱">
              <Input value={user.data.email ?? '未绑定邮箱'} disabled />
            </Form.Item>
            <Form.Item label="手机号">
              <Input value={user.data.phone ?? '未绑定手机号'} disabled />
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
      <Modal
        title="重置账号密码"
        open={resetOpen}
        okText="重置并要求修改"
        confirmLoading={resetPassword.isPending}
        onCancel={() => {
          setResetOpen(false);
          resetForm.resetFields();
        }}
        onOk={() => void submitResetPassword()}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          重置后会要求该账号在下次登录时立即修改密码。
        </Typography.Paragraph>
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="password"
            label="新临时密码"
            rules={[{ required: true }, { min: 12, message: '至少 12 个字符' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
