import type { PermissionKey } from '@lingcoo-edu-oms/contracts';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const PermissionContext = createContext<ReadonlySet<PermissionKey> | null>(null);

export function PermissionProvider({
  permissions,
  children,
}: {
  permissions: PermissionKey[];
  children: ReactNode;
}) {
  const value = useMemo(() => new Set(permissions), [permissions]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): ReadonlySet<PermissionKey> {
  const context = useContext(PermissionContext);
  if (!context) throw new Error('PermissionProvider is missing');
  return context;
}

export function useCan(required: PermissionKey | readonly PermissionKey[]): boolean {
  const permissions = usePermissions();
  const values = Array.isArray(required) ? required : [required];
  return values.every((permission) => permissions.has(permission));
}

export function RequirePermission({ permissions }: { permissions: readonly PermissionKey[] }) {
  return useCan(permissions) ? <Outlet /> : <Navigate to="/forbidden" replace />;
}
