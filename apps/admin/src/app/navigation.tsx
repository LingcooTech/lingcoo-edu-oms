import {
  AccountBookOutlined,
  ApiOutlined,
  ApartmentOutlined,
  BankOutlined,
  BookOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  ContactsOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  LaptopOutlined,
  MobileOutlined,
  PictureOutlined,
  ReadOutlined,
  ScheduleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { PermissionKey } from '@lingcoo-edu-oms/contracts';
import type { ReactNode } from 'react';

export interface AdminNavigationItem {
  key: string;
  label: string;
  path: string;
  icon?: ReactNode;
  permission?: PermissionKey;
  disabled?: boolean;
  section:
    'overview' | 'resources' | 'admissions' | 'academic' | 'ledger' | 'miniProgram' | 'system';
}

export interface AdminNavigationSection {
  key: AdminNavigationItem['section'];
  label: string;
  icon: ReactNode;
}

export const navigationSections: AdminNavigationSection[] = [
  { key: 'overview', label: '业务概览', icon: <DashboardOutlined /> },
  { key: 'resources', label: '教学资源', icon: <ReadOutlined /> },
  { key: 'admissions', label: '招生转化', icon: <ContactsOutlined /> },
  { key: 'academic', label: '教务管理', icon: <CalendarOutlined /> },
  { key: 'ledger', label: '课时账本', icon: <AccountBookOutlined /> },
  { key: 'miniProgram', label: '小程序设置', icon: <MobileOutlined /> },
  { key: 'system', label: '系统设置', icon: <SettingOutlined /> },
];

export const foundationNavigation: AdminNavigationItem[] = [
  {
    key: 'dashboard',
    label: '经营看板',
    path: '/',
    icon: <DashboardOutlined />,
    section: 'overview',
  },
  {
    key: 'quick-actions',
    label: '快捷操作',
    path: '/quick-actions',
    icon: <ThunderboltOutlined />,
    section: 'overview',
  },
  {
    key: 'organization-settings',
    label: '组织设置',
    path: '/organization',
    icon: <SettingOutlined />,
    permission: 'education.institutions.read',
    section: 'resources',
  },
  {
    key: 'institutions',
    label: '机构管理',
    path: '/institutions',
    icon: <BankOutlined />,
    permission: 'education.institutions.read',
    section: 'resources',
  },
  {
    key: 'campuses',
    label: '校区管理',
    path: '/campuses',
    icon: <BookOutlined />,
    permission: 'education.teaching-resources.read',
    section: 'resources',
  },
  {
    key: 'classrooms',
    label: '教室管理',
    path: '/classrooms',
    icon: <ApartmentOutlined />,
    permission: 'education.teaching-resources.read',
    section: 'resources',
  },
  {
    key: 'courses',
    label: '课程管理',
    path: '/courses',
    icon: <BookOutlined />,
    permission: 'education.courses.read',
    section: 'resources',
  },
  {
    key: 'teachers',
    label: '教师档案',
    path: '/teachers',
    icon: <SolutionOutlined />,
    permission: 'education.teachers.read',
    section: 'resources',
  },
  {
    key: 'admissions-planned',
    label: '线索 / 试听 / 营销（后续）',
    path: '/admissions',
    icon: <ContactsOutlined />,
    disabled: true,
    section: 'admissions',
  },
  {
    key: 'students',
    label: '学员档案',
    path: '/students',
    icon: <TeamOutlined />,
    permission: 'education.students.read',
    section: 'academic',
  },
  {
    key: 'classes',
    label: '班级管理',
    path: '/classes',
    icon: <TeamOutlined />,
    permission: 'education.classes.read',
    section: 'academic',
  },
  {
    key: 'schedule-plans',
    label: '排课计划',
    path: '/schedule-plans',
    icon: <ScheduleOutlined />,
    permission: 'education.sessions.read',
    section: 'academic',
  },
  {
    key: 'lesson-sessions',
    label: '课次管理',
    path: '/lesson-sessions',
    icon: <CalendarOutlined />,
    permission: 'education.sessions.read',
    section: 'academic',
  },
  {
    key: 'lesson-attendance',
    label: '签到消课',
    path: '/attendance',
    icon: <CheckSquareOutlined />,
    permission: 'education.attendance.read',
    section: 'academic',
  },
  {
    key: 'lesson-packages',
    label: '课时商品 / 课时包',
    path: '/lesson-packages',
    icon: <AccountBookOutlined />,
    permission: 'education.lesson-packages.read',
    section: 'ledger',
  },
  {
    key: 'lesson-accounts',
    label: '课时账户',
    path: '/lesson-accounts',
    icon: <WalletOutlined />,
    permission: 'education.lesson-balances.read',
    section: 'ledger',
  },
  {
    key: 'lesson-movements',
    label: '课时流水',
    path: '/lesson-movements',
    icon: <FileSearchOutlined />,
    permission: 'education.lesson-balances.read',
    section: 'ledger',
  },
  {
    key: 'orders-planned',
    label: '订单与收款（后续）',
    path: '/orders',
    icon: <AccountBookOutlined />,
    disabled: true,
    section: 'ledger',
  },
  {
    key: 'lesson-metrics-planned',
    label: '课时经营数据（后续）',
    path: '/lesson-metrics',
    icon: <DashboardOutlined />,
    disabled: true,
    section: 'ledger',
  },
  {
    key: 'mini-program-settings',
    label: '小程序设置',
    path: '/mini-program-settings',
    icon: <MobileOutlined />,
    permission: 'settings.read',
    section: 'miniProgram',
  },
  {
    key: 'access-users',
    label: '账号管理',
    path: '/access/users',
    icon: <UserOutlined />,
    permission: 'accounts.read',
    section: 'system',
  },
  {
    key: 'access-roles',
    label: '角色与权限',
    path: '/access/roles',
    icon: <TeamOutlined />,
    permission: 'roles.read',
    section: 'system',
  },
  {
    key: 'audit',
    label: '审计日志',
    path: '/audit',
    icon: <FileSearchOutlined />,
    permission: 'audit.read',
    section: 'system',
  },
  {
    key: 'account-security',
    label: '账号安全',
    path: '/account/security',
    icon: <SafetyCertificateOutlined />,
    section: 'system',
  },
  {
    key: 'active-sessions',
    label: '活动会话',
    path: '/account/sessions',
    icon: <LaptopOutlined />,
    section: 'system',
  },
  {
    key: 'branding',
    label: '品牌设置',
    path: '/branding',
    icon: <SettingOutlined />,
    permission: 'branding.read',
    section: 'system',
  },
  {
    key: 'settings',
    label: '接口配置',
    path: '/settings',
    icon: <ApiOutlined />,
    permission: 'settings.read',
    section: 'system',
  },
  {
    key: 'storage',
    label: '素材库',
    path: '/storage',
    icon: <PictureOutlined />,
    permission: 'storage.read',
    section: 'system',
  },
];

export function selectedNavigationKey(pathname: string): string {
  const matched = foundationNavigation.find((item) =>
    item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
  );
  return matched?.key ?? '';
}

export function selectedNavigationSection(pathname: string): AdminNavigationItem['section'] {
  return (
    foundationNavigation.find((item) =>
      item.path === '/' ? pathname === '/' : pathname.startsWith(item.path),
    )?.section ?? 'overview'
  );
}
