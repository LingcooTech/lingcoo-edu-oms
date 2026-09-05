export { AccessControlService } from './application/access-control.service.js';
export { installAccessControlGuard } from './api/access-control.guard.js';
export {
  CORE_PERMISSION_DEFINITIONS,
  OWNER_ROLE_KEY,
  SYSTEM_PERMISSIONS,
} from './domain/system-permissions.js';
export { createAccessControlModule, createAccessControlService } from './plugin.js';
export type {
  PermissionDefinition,
  AccessRole,
  AccessRoleSummary,
  AccessUserRole,
} from './domain/model.js';
