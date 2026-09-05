import { BellOutlined } from '@ant-design/icons';
import { Badge, Button, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';

import { useUnreadNotificationCount } from './hooks';

export function NotificationBell() {
  const navigate = useNavigate();
  const unread = useUnreadNotificationCount();
  return (
    <Tooltip title={`通知中心${unread.data?.count ? `（${unread.data.count} 条未读）` : ''}`}>
      <Badge count={unread.data?.count ?? 0} size="small" overflowCount={99}>
        <Button
          type="text"
          aria-label="通知"
          icon={<BellOutlined />}
          onClick={() => navigate('/notifications')}
        />
      </Badge>
    </Tooltip>
  );
}
