import type { PermissionDefinition } from './model.js';

export const OWNER_ROLE_KEY = 'system.owner';

export const SYSTEM_PERMISSIONS = [
  {
    key: 'accounts.read',
    group: '访问控制',
    name: '查看账号',
    description: '查看后台账号及其角色。',
  },
  {
    key: 'accounts.manage',
    group: '访问控制',
    name: '管理账号',
    description: '创建、编辑、启用或停用后台账号。',
  },
  { key: 'roles.read', group: '访问控制', name: '查看角色', description: '查看角色和权限目录。' },
  {
    key: 'roles.manage',
    group: '访问控制',
    name: '管理角色',
    description: '创建、编辑角色并分配权限。',
  },
  { key: 'settings.read', group: '系统设置', name: '查看设置', description: '查看系统设置。' },
  { key: 'settings.manage', group: '系统设置', name: '管理设置', description: '修改系统设置。' },
  {
    key: 'integrations.manage',
    group: '系统设置',
    name: '管理集成',
    description: '配置外部系统集成。',
  },
  { key: 'audit.read', group: '运维治理', name: '查看审计', description: '查看审计日志。' },
  {
    key: 'idempotency.read',
    group: '运维治理',
    name: '查看幂等记录',
    description: '查看幂等执行状态和安全诊断摘要。',
  },
  { key: 'jobs.read', group: '运维治理', name: '查看任务', description: '查看异步任务。' },
  { key: 'jobs.manage', group: '运维治理', name: '管理任务', description: '重试或取消异步任务。' },
  { key: 'outbox.read', group: '运维治理', name: '查看事件', description: '查看 Outbox 事件。' },
  {
    key: 'outbox.manage',
    group: '运维治理',
    name: '管理事件',
    description: '重放死信 Outbox 事件。',
  },
  {
    key: 'mail.read',
    group: '业务能力',
    name: '查看邮件',
    description: '查看邮件模板和安全投递摘要。',
  },
  {
    key: 'mail.manage',
    group: '业务能力',
    name: '管理邮件',
    description: '管理邮件模板并发送测试邮件。',
  },
  {
    key: 'payments.read',
    group: '业务能力',
    name: '查看支付',
    description: '查看支付与退款记录。',
  },
  {
    key: 'payments.manage',
    group: '业务能力',
    name: '管理支付',
    description: '执行支付、退款等受控操作。',
  },
  {
    key: 'notifications.read',
    group: '业务能力',
    name: '查看公告',
    description: '查看公告发布状态和受众统计。',
  },
  {
    key: 'notifications.manage',
    group: '业务能力',
    name: '管理通知',
    description: '创建、编辑、发布和撤回公告。',
  },
  {
    key: 'storage.read',
    group: '业务能力',
    name: '查看文件',
    description: '查看文件对象和元数据。',
  },
  {
    key: 'storage.manage',
    group: '业务能力',
    name: '管理文件',
    description: '上传、删除和管理文件对象。',
  },
  {
    key: 'branding.read',
    group: '系统设置',
    name: '查看应用品牌',
    description: '查看应用名称、主题和品牌素材配置。',
  },
  {
    key: 'branding.manage',
    group: '系统设置',
    name: '管理应用品牌',
    description: '修改应用展示名称、主题、登录文案及品牌素材。',
  },
] satisfies ReadonlyArray<Omit<PermissionDefinition, 'source'>>;

export const CORE_PERMISSION_DEFINITIONS: PermissionDefinition[] = SYSTEM_PERMISSIONS.map(
  (item) => ({
    ...item,
    source: 'core',
  }),
);
