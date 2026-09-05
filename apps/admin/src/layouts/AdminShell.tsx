import {
  BulbOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Grid,
  Layout,
  Menu,
  type MenuProps,
  Space,
  Tooltip,
  theme,
} from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { foundationNavigation, navigationGroups, selectedNavigationKey } from '../app/navigation';
import { useThemeMode } from '../app/theme-context';
import { CommandPalette } from '../components/CommandPalette';
import { usePermissions } from '../features/access/PermissionContext';
import { BrandMark, useBranding } from '../features/branding';
import { useLogout, useSession } from '../features/identity/hooks';
import { NotificationBell } from '../features/notifications/NotificationBell';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

function Brand({ collapsed }: { collapsed: boolean }) {
  const branding = useBranding();
  return (
    <div className="admin-brand">
      <BrandMark compact />
      {!collapsed && (
        <div className="admin-brand__copy">
          <strong>{branding.appName}</strong>
          <span>Business Console</span>
        </div>
      )}
    </div>
  );
}

export function AdminShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const screens = useBreakpoint();
  const desktop = Boolean(screens.lg);
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const logout = useLogout();
  const { mode, toggle } = useThemeMode();
  const { token } = theme.useToken();
  const permissions = usePermissions();
  const branding = useBranding();
  const visibleNavigation = useMemo(
    () =>
      foundationNavigation.filter((item) => !item.permission || permissions.has(item.permission)),
    [permissions],
  );
  const menuItems = useMemo<MenuProps['items']>(
    () =>
      navigationGroups
        .map((group) => ({
          type: 'group' as const,
          key: group.key,
          label: group.label,
          children: visibleNavigation
            .filter((item) => item.group === group.key)
            .map((item) => ({ key: item.key, icon: item.icon, label: item.label })),
        }))
        .filter((group) => group.children.length > 0),
    [visibleNavigation],
  );
  const selectedKeys = [selectedNavigationKey(location.pathname)].filter(Boolean);
  const activeNavigation = foundationNavigation.find((item) => item.key === selectedKeys[0]);
  const menu = (
    <Menu
      className="admin-navigation"
      mode="inline"
      selectedKeys={selectedKeys}
      items={menuItems}
      onClick={({ key }) => {
        const item = visibleNavigation.find((entry) => entry.key === key);
        if (item) navigate(item.path);
        setDrawerOpen(false);
      }}
    />
  );
  const siderWidth = collapsed ? 80 : 240;

  return (
    <Layout className="admin-layout" style={{ background: token.colorBgLayout }}>
      <CommandPalette items={visibleNavigation} />
      {desktop ? (
        <Sider className="admin-sider" width={240} collapsedWidth={80} collapsed={collapsed}>
          <Brand collapsed={collapsed} />
          {menu}
          {!collapsed && (
            <div className="admin-sider__footer">
              <span className="admin-sider__status" />
              <span>服务运行正常</span>
            </div>
          )}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          size={280}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{ body: { padding: 0, background: '#111827' }, header: { display: 'none' } }}
        >
          <Brand collapsed={false} />
          {menu}
          <div className="admin-sider__footer">
            <span className="admin-sider__status" />
            <span>服务运行正常</span>
          </div>
        </Drawer>
      )}
      <Layout className="admin-main" style={{ marginInlineStart: desktop ? siderWidth : 0 }}>
        <Header
          className="admin-header"
          style={{
            background: token.colorBgContainer,
            borderBottomColor: token.colorBorderSecondary,
          }}
        >
          <Space size={12}>
            <Button
              type="text"
              aria-label={desktop ? '折叠导航' : '打开导航'}
              icon={
                desktop ? (
                  collapsed ? (
                    <MenuUnfoldOutlined />
                  ) : (
                    <MenuFoldOutlined />
                  )
                ) : (
                  <MenuUnfoldOutlined />
                )
              }
              onClick={() => (desktop ? setCollapsed((value) => !value) : setDrawerOpen(true))}
            />
            <div className="admin-header__context">
              <span>{branding.appName} 管理后台</span>
              <strong>{activeNavigation?.label ?? '管理后台'}</strong>
            </div>
          </Space>
          <div className="admin-header__actions">
            <Tooltip title="快速导航（⌘/Ctrl + K）">
              <Button
                className="admin-search"
                aria-label="快速导航"
                icon={<SearchOutlined />}
                onClick={() =>
                  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
                }
              >
                {desktop && <span>搜索功能</span>}
                {desktop && <kbd>⌘ K</kbd>}
              </Button>
            </Tooltip>
            <Tooltip title={mode === 'light' ? '切换深色主题' : '切换浅色主题'}>
              <Button
                type="text"
                aria-label="切换主题"
                icon={mode === 'light' ? <MoonOutlined /> : <BulbOutlined />}
                onClick={toggle}
              />
            </Tooltip>
            <NotificationBell />
            <Dropdown
              menu={{
                items: [
                  { key: 'account', label: '账号安全' },
                  { key: 'sessions', label: '活动会话' },
                  { type: 'divider' },
                  { key: 'logout', label: '退出登录', danger: true },
                ],
                onClick: ({ key }) => {
                  if (key === 'account') navigate('/account/security');
                  if (key === 'sessions') navigate('/account/sessions');
                  if (key === 'logout') logout.mutate();
                },
              }}
            >
              <Button type="text" className="admin-account">
                <Space>
                  <Avatar className="admin-account__avatar" size={36} icon={<UserOutlined />} />
                  {desktop && (
                    <span className="admin-account__copy">
                      <strong>{session.data?.user.displayName ?? session.data?.user.email}</strong>
                      <span>系统管理员</span>
                    </span>
                  )}
                </Space>
              </Button>
            </Dropdown>
          </div>
        </Header>
        <Content className="admin-content" style={{ background: token.colorBgLayout }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
