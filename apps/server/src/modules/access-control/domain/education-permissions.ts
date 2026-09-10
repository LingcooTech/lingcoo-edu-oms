import type { EducationRoleKey } from '@lingcoo-edu-oms/contracts';
import type { PermissionDefinition } from './model.js';

export const EDUCATION_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  ['institutions.read', '查看机构'],
  ['institutions.manage', '管理机构'],
  ['students.read', '查看学员'],
  ['students.manage', '管理学员'],
  ['guardians.read', '查看监护人'],
  ['guardians.manage', '管理监护人'],
  ['teachers.read', '查看教师'],
  ['teachers.manage', '管理教师'],
  ['courses.read', '查看课程'],
  ['courses.manage', '管理课程'],
  ['classes.read', '查看班级'],
  ['classes.manage', '管理班级'],
  ['sessions.read', '查看课次'],
  ['sessions.manage', '管理课次'],
  ['attendance.read', '查看考勤'],
  ['attendance.manage', '管理考勤'],
  ['enrollments.read', '查看报名'],
  ['enrollments.manage', '管理报名'],
  ['lesson-packages.read', '查看课时包'],
  ['lesson-packages.manage', '管理课时包'],
  ['lesson-balances.read', '查看课时余额'],
  ['lesson-balances.manage', '管理课时余额'],
  ['orders.read', '查看订单'],
  ['orders.manage', '管理订单'],
  ['leads.read', '查看线索'],
  ['leads.manage', '管理线索'],
  ['content.read', '查看内容'],
  ['content.manage', '管理内容'],
  ['teaching-resources.read', '查看教学资源'],
  ['teaching-resources.manage', '管理教学资源'],
].map(([key, name]) => ({
  key: `education.${key}`,
  name: name!,
  group: '教务管理',
  source: 'education',
  description: `${name}；必须同时执行机构及档案范围校验。`,
}));

const teacherPermissions = [
  'students.read',
  'courses.read',
  'classes.read',
  'sessions.read',
  'attendance.read',
  'attendance.manage',
  'teaching-resources.read',
];
const parentPermissions = [
  'students.read',
  'courses.read',
  'classes.read',
  'sessions.read',
  'attendance.read',
  'enrollments.read',
  'lesson-balances.read',
  'orders.read',
];
export const EDUCATION_ROLE_DEFAULTS: Array<{
  key: EducationRoleKey;
  name: string;
  permissions: string[];
}> = [
  {
    key: 'admin',
    name: '平台管理员',
    permissions: [
      'accounts.read',
      'accounts.manage',
      'accounts.reset-password',
      'roles.read',
      ...EDUCATION_PERMISSION_DEFINITIONS.map((p) => p.key),
    ],
  },
  {
    key: 'institution_admin',
    name: '机构管理员',
    permissions: EDUCATION_PERMISSION_DEFINITIONS.filter(
      (p) => p.key !== 'education.institutions.manage',
    ).map((p) => p.key),
  },
  {
    key: 'teacher',
    name: '教师',
    permissions: teacherPermissions.map((key) => `education.${key}`),
  },
  { key: 'parent', name: '家长', permissions: parentPermissions.map((key) => `education.${key}`) },
];
