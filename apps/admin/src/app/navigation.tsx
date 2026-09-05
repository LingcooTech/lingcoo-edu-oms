import {
  AppstoreOutlined,
  DashboardOutlined,
  SafetyCertificateOutlined,
  LaptopOutlined,
  TeamOutlined,
  UserOutlined,
  FileSearchOutlined,
  SettingOutlined,
  HistoryOutlined,
  FieldTimeOutlined,
  SwapOutlined,
  MailOutlined,
  NotificationOutlined,
  PictureOutlined,
  BgColorsOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import type { PermissionKey } from '@lingcoo-edu-oms/contracts';
import type { ReactNode } from 'react';

export interface AdminNavigationItem {
  key: string;
  label: string;
  path: string;
  icon?: ReactNode;
  permission?: PermissionKey;
  group: 'workspace' | 'organization' | 'operations' | 'configuration' | 'account';
}

export const foundationNavigation: AdminNavigationItem[] = [
  {
    key: 'dashboard',
    label: '工作台',
    path: '/',
    icon: <DashboardOutlined />,
    group: 'workspace',
  },
  {
    key: 'showcase',
    label: '组件示例',
    path: '/showcase',
    icon: <AppstoreOutlined />,
    group: 'workspace',
  },
  {
    key: 'access-users',
    label: '账号管理',
    path: '/access/users',
    icon: <UserOutlined />,
    permission: 'accounts.read',
    group: 'organization',
  },
  {
    key: 'access-roles',
    label: '角色与权限',
    path: '/access/roles',
    icon: <TeamOutlined />,
    permission: 'roles.read',
    group: 'organization',
  },
  {
    key: 'audit',
    label: '审计日志',
    path: '/audit',
    icon: <FileSearchOutlined />,
    permission: 'audit.read',
    group: 'organization',
  },
  {
    key: 'settings',
    label: '系统设置',
    path: '/settings',
    icon: <SettingOutlined />,
    permission: 'settings.read',
    group: 'configuration',
  },
  {
    key: 'idempotency',
    label: '幂等诊断',
    path: '/idempotency',
    icon: <HistoryOutlined />,
    permission: 'idempotency.read',
    group: 'operations',
  },
  {
    key: 'jobs',
    label: '后台任务',
    path: '/jobs',
    icon: <FieldTimeOutlined />,
    permission: 'jobs.read',
    group: 'operations',
  },
  {
    key: 'outbox',
    label: 'Outbox 事件',
    path: '/outbox',
    icon: <SwapOutlined />,
    permission: 'outbox.read',
    group: 'operations',
  },
  {
    key: 'mail',
    label: '邮件服务',
    path: '/mail',
    icon: <MailOutlined />,
    permission: 'mail.read',
    group: 'operations',
  },
  {
    key: 'storage',
    label: '素材库',
    path: '/storage',
    icon: <PictureOutlined />,
    permission: 'storage.read',
    group: 'configuration',
  },
  {
    key: 'branding',
    label: '应用品牌',
    path: '/branding',
    icon: <BgColorsOutlined />,
    permission: 'branding.read',
    group: 'configuration',
  },
  {
    key: 'notifications',
    label: '通知中心',
    path: '/notifications',
    icon: <NotificationOutlined />,
    group: 'operations',
  },
  {
    key: 'payments',
    label: '支付与对账',
    path: '/payments',
    icon: <DollarOutlined />,
    permission: 'payments.read',
    group: 'operations',
  },
  {
    key: 'account-security',
    label: '账号安全',
    path: '/account/security',
    icon: <SafetyCertificateOutlined />,
    group: 'account',
  },
  {
    key: 'active-sessions',
    label: '活动会话',
    path: '/account/sessions',
    icon: <LaptopOutlined />,
    group: 'account',
  },
];

export const navigationGroups = [
  { key: 'workspace', label: '工作空间' },
  { key: 'organization', label: '组织与安全' },
  { key: 'operations', label: '业务运营' },
  { key: 'configuration', label: '内容与配置' },
  { key: 'account', label: '个人中心' },
] as const satisfies ReadonlyArray<{ key: AdminNavigationItem['group']; label: string }>;

export function selectedNavigationKey(pathname: string): string {
  const matched = foundationNavigation.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );
  return matched?.key ?? '';
}
