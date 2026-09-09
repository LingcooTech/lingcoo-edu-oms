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
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import {
  foundationNavigation,
  navigationSections,
  selectedNavigationKey,
  selectedNavigationSection,
} from '../app/navigation';
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
          <span>Education OMS</span>
        </div>
      )}
    </div>
  );
}

export function AdminShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
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
      navigationSections
        .map((section) => ({
          key: `section-${section.key}`,
          icon: section.icon,
          label: section.label,
          children: visibleNavigation
            .filter((item) => item.section === section.key)
            .map((item) => ({ key: item.key, label: item.label, disabled: item.disabled })),
        }))
        .filter((section) => section.children.length > 0),
    [visibleNavigation],
  );
  const selectedKeys = [selectedNavigationKey(location.pathname)].filter(Boolean);
  const activeSection = selectedNavigationSection(location.pathname);
  const activeNavigation = foundationNavigation.find((item) => item.key === selectedKeys[0]);
  const accountName =
    session.data?.user.displayName ??
    session.data?.user.email ??
    session.data?.user.phone ??
    '用户';
  const accountMenu: MenuProps = {
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
  };

  const sidebarUser = (isCollapsed: boolean) => (
    <div className={`admin-sider__footer${isCollapsed ? ' admin-sider__footer--collapsed' : ''}`}>
      <Dropdown menu={accountMenu} placement="topLeft" trigger={['click']}>
        <Button
          type="text"
          className={`admin-sider-user${isCollapsed ? ' admin-sider-user--collapsed' : ''}`}
          aria-label={`当前用户：${accountName}`}
        >
          <Avatar className="admin-account__avatar" size={32} icon={<UserOutlined />} />
          {!isCollapsed && (
            <span className="admin-sider-user__copy">
              <strong>{accountName}</strong>
              <span>查看账户与退出登录</span>
            </span>
          )}
        </Button>
      </Dropdown>
    </div>
  );

  useEffect(() => {
    if (!collapsed) {
      setOpenKeys((current) => [...new Set([...current, `section-${activeSection}`])]);
    }
  }, [activeSection, collapsed]);

  const menu = (
    <Menu
      className="admin-navigation"
      mode="inline"
      inlineIndent={14}
      selectedKeys={selectedKeys}
      openKeys={collapsed ? undefined : openKeys}
      onOpenChange={(keys) => setOpenKeys(keys)}
      items={menuItems}
      onClick={({ key }) => {
        const item = visibleNavigation.find((entry) => entry.key === key);
        if (item && !item.disabled) navigate(item.path);
        setDrawerOpen(false);
      }}
    />
  );
  const siderWidth = collapsed ? 72 : 240;

  return (
    <Layout className="admin-layout" style={{ background: token.colorBgLayout }}>
      <CommandPalette items={visibleNavigation.filter((item) => !item.disabled)} />
      {desktop ? (
        <Sider
          className="admin-sider"
          width={240}
          collapsedWidth={72}
          collapsed={collapsed}
          theme={mode === 'dark' ? 'dark' : 'light'}
          style={{ background: token.colorBgContainer }}
        >
          <Brand collapsed={collapsed} />
          {menu}
          {sidebarUser(collapsed)}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          size={280}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          styles={{
            body: {
              display: 'flex',
              height: '100%',
              minHeight: 0,
              flexDirection: 'column',
              overflow: 'hidden',
              padding: 0,
              background: token.colorBgContainer,
            },
            header: { display: 'none' },
          }}
        >
          <Brand collapsed={false} />
          {menu}
          {sidebarUser(false)}
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
              <span>{branding.appName}</span>
              <strong>{activeNavigation?.label ?? '教育运营管理'}</strong>
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
            <Dropdown menu={accountMenu}>
              <Button type="text" className="admin-account">
                <Space>
                  <Avatar className="admin-account__avatar" size={36} icon={<UserOutlined />} />
                  {desktop && (
                    <span className="admin-account__copy">
                      <strong>{accountName}</strong>
                      <span>已认证账号</span>
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
