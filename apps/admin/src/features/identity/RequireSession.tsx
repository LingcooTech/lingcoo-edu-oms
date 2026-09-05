import { Flex, Result, Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PermissionProvider } from '../access/PermissionContext';
import { useCurrentPermissions } from '../access/hooks';
import { useSession } from './hooks';

export function RequireSession() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return (
      <Flex justify="center" align="center" className="identity-full-page">
        <Spin size="large" description="正在确认登录状态" />
      </Flex>
    );
  }
  if (session.isError) {
    return <Result status="500" title="无法连接服务" subTitle={session.error.message} />;
  }
  if (!session.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <AuthenticatedApplication />;
}

function AuthenticatedApplication() {
  const permissions = useCurrentPermissions();
  if (permissions.isPending) {
    return (
      <Flex justify="center" align="center" className="identity-full-page">
        <Spin size="large" description="正在加载访问权限" />
      </Flex>
    );
  }
  if (permissions.isError) {
    return <Result status="500" title="无法加载访问权限" subTitle={permissions.error.message} />;
  }
  return (
    <PermissionProvider permissions={permissions.data.permissions}>
      <Outlet />
    </PermissionProvider>
  );
}
