import {
  ArrowRightOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  GiftOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { PermissionKey } from '@lingcoo-edu-oms/contracts';
import { Button, Card, Col, Row, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { PageContainer } from '../components/PageContainer';
import { useCan, usePermissions } from '../features/access/PermissionContext';

interface QuickAction {
  title: string;
  description: string;
  path: string;
  permission: PermissionKey;
  icon: ReactNode;
}

const quickActions: QuickAction[] = [
  {
    title: '添加学员',
    description: '建立学员档案、机构服务关系和零余额课时账户。',
    path: '/students?create=1',
    permission: 'education.students.manage',
    icon: <TeamOutlined />,
  },
  {
    title: '发放课时',
    description: '选择学员账户，通过课时包或自定义数量发放课时。',
    path: '/lesson-accounts',
    permission: 'education.lesson-balances.manage',
    icon: <GiftOutlined />,
  },
  {
    title: '班级安排',
    description: '把学员和教学资源组织到班级，不影响课时权益归属。',
    path: '/classes',
    permission: 'education.classes.manage',
    icon: <TeamOutlined />,
  },
  {
    title: '排课计划',
    description: '按教学安排批量生成课次，课程、教师和场地均为关联资源。',
    path: '/schedule-plans',
    permission: 'education.sessions.manage',
    icon: <CalendarOutlined />,
  },
  {
    title: '签到消课',
    description: '完成点名与消课，每次余额变化均形成可追溯流水。',
    path: '/attendance',
    permission: 'education.attendance.manage',
    icon: <CheckSquareOutlined />,
  },
];

function QuickActionGrid() {
  const permissions = usePermissions();
  const availableActions = quickActions.filter((action) => permissions.has(action.permission));

  return (
    <Row gutter={[16, 16]}>
      {availableActions.map((action) => (
        <Col xs={24} md={12} xl={8} key={action.title}>
          <Card
            variant="borderless"
            actions={[
              <Link to={action.path} key={action.path}>
                开始操作 <ArrowRightOutlined />
              </Link>,
            ]}
          >
            <Space align="start" size={14}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {action.icon}
              </Typography.Title>
              <div>
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                  {action.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {action.description}
                </Typography.Paragraph>
              </div>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

export function DashboardPage() {
  const canCreateStudent = useCan('education.students.manage');
  const canReadStudents = useCan('education.students.read');
  const canReadAccounts = useCan('education.lesson-balances.read');

  return (
    <PageContainer
      title="经营看板"
      description="围绕学员服务、教学交付和课时账本查看运营状态。"
      actions={
        <Link to="/quick-actions">
          <Button type="primary" icon={<ThunderboltOutlined />}>
            快捷操作
          </Button>
        </Link>
      }
    >
      <section className="dashboard-welcome dashboard-welcome--edu">
        <div className="dashboard-welcome__copy">
          <Tag className="dashboard-welcome__tag" variant="filled">
            EDUCATION OPERATIONS
          </Tag>
          <h2>从学员建档，到课时发放，再到教学交付。</h2>
          <p>
            课时账户以“学员＋机构”为边界；课程、班级、教师、校区和教室用于组织教学，不反向改变课时权益。
          </p>
          <Space size={12} wrap>
            {(canCreateStudent || canReadStudents) && (
              <Link to={canCreateStudent ? '/students?create=1' : '/students'}>
                <Button type="primary" size="large">
                  {canCreateStudent ? '添加学员' : '查看学员'} <ArrowRightOutlined />
                </Button>
              </Link>
            )}
            {canReadAccounts && (
              <Link to="/lesson-accounts">
                <Button className="dashboard-welcome__secondary" size="large">
                  查看课时账户
                </Button>
              </Link>
            )}
          </Space>
        </div>
        <div className="dashboard-phase-note">
          <span>核心业务闭环</span>
          <strong>建档 → 发课 → 排课 → 签到消课</strong>
          <p>各步骤保持独立，同时可从快捷流程连续完成。</p>
        </div>
      </section>

      <Card variant="borderless" title="常用操作">
        <QuickActionGrid />
      </Card>
    </PageContainer>
  );
}

export function QuickActionsPage() {
  return (
    <PageContainer
      title="快捷操作"
      description="按日常工作场景进入独立业务用例；完成学员建档后，系统会继续引导发放课时和安排教学。"
    >
      <QuickActionGrid />
    </PageContainer>
  );
}
