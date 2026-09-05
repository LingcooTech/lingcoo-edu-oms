import { Alert, Tabs } from 'antd';

import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { Announcements } from './Announcements';
import { CurrentNotifications } from './CurrentNotifications';

export function NotificationsPage() {
  const canReadAnnouncements = useCan('notifications.read');
  const canManageAnnouncements = useCan('notifications.manage');
  return (
    <PageContainer
      title="通知中心"
      description="查看当前账号站内通知；有权限的管理员可以管理公告及其异步发布状态。"
    >
      <Alert
        type="info"
        showIcon
        title="站内通知事实与外部渠道相互隔离"
        description="未读数由数据库事实实时计算；公告发布按受众快照异步展开，邮件失败不会影响站内通知。"
        style={{ marginBottom: 16 }}
      />
      <Tabs
        items={[
          { key: 'mine', label: '我的通知', children: <CurrentNotifications /> },
          ...(canReadAnnouncements
            ? [
                {
                  key: 'announcements',
                  label: '公告管理',
                  children: <Announcements canManage={canManageAnnouncements} />,
                },
              ]
            : []),
        ]}
      />
    </PageContainer>
  );
}
