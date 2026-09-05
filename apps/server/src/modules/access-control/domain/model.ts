import type { PermissionKey } from '@lingcoo-edu-oms/contracts';

export interface PermissionDefinition {
  key: PermissionKey;
  source: string;
  group: string;
  name: string;
  description: string;
}

export interface AccessRoleSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
  permissionCount: number;
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccessRole extends AccessRoleSummary {
  permissions: PermissionKey[];
}

export interface AccessUserRole {
  id: string;
  key: string;
  name: string;
  system: boolean;
}
