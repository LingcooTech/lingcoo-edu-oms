import {
  ApiOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  CloudServerOutlined,
  DatabaseOutlined,
  FieldTimeOutlined,
  FileProtectOutlined,
  LockOutlined,
  NotificationOutlined,
  PictureOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@lingcoo-edu-oms/api-client';
import { readinessResponseSchema } from '@lingcoo-edu-oms/contracts';
import { Button, Card, Progress, Space, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { AsyncState } from '../components/AsyncState';
import { PageContainer } from '../components/PageContainer';

const apiClient = createApiClient();

interface Capability {
  icon: ReactNode;
  title: string;
  description: string;
  path: string;
  color: string;
}

const capabilities: Capability[] = [
  {
    icon: <SafetyCertificateOutlined />,
    title: '身份与权限',
    description: 'Session、CSRF 与动态 RBAC',
    path: '/access/users',
    color: '#635bff',
  },
  {
    icon: <FieldTimeOutlined />,
    title: '异步任务',
    description: '持久化任务、重试与死信处理',
    path: '/jobs',
    color: '#0ea5e9',
  },
  {
    icon: <NotificationOutlined />,
    title: '消息触达',
    description: '站内通知、公告与邮件投递',
    path: '/notifications',
    color: '#f59e0b',
  },
  {
    icon: <PictureOutlined />,
    title: '资源管理',
    description: '对象、版本、引用与安全清理',
    path: '/storage',
    color: '#10b981',
  },
];

const quickActions = [
  {
    icon: <TeamOutlined />,
    title: '邀请成员',
    detail: '创建账号并分配角色',
    path: '/access/users',
  },
  { icon: <SettingOutlined />, title: '配置系统', detail: '管理运行参数与密钥', path: '/settings' },
  { icon: <PictureOutlined />, title: '上传素材', detail: '进入统一资源中心', path: '/storage' },
];

export function DashboardPage() {
  const readiness = useQuery({
    queryKey: ['system', 'readiness'],
    queryFn: ({ signal }) =>
      apiClient.request({ path: '/health/ready', schema: readinessResponseSchema, signal }),
    refetchInterval: 30_000,
  });
  const ready = Boolean(readiness.data);

  return (
    <PageContainer
      title="工作台"
      description="从通用能力到业务交付，在一个清晰、可靠的工作空间里完成。"
      actions={
        <Space>
          <Link to="/showcase">
            <Button>组件示例</Button>
          </Link>
          <Link to="/access/users">
            <Button type="primary">管理成员</Button>
          </Link>
        </Space>
      }
    >
      <section className="dashboard-welcome">
        <div className="dashboard-welcome__copy">
          <Tag className="dashboard-welcome__tag" variant="filled">
            <RocketOutlined /> PRODUCTION READY
          </Tag>
          <h2>欢迎回来，今天从哪里开始？</h2>
          <p>身份、权限、任务、通知和支付能力已完成组合。你只需要专注于自己的业务领域。</p>
          <Space size={12} wrap>
            <Link to="/settings">
              <Button type="primary" size="large">
                完成系统配置 <ArrowRightOutlined />
              </Button>
            </Link>
            <Link to="/branding">
              <Button className="dashboard-welcome__secondary" size="large">
                定制应用品牌
              </Button>
            </Link>
          </Space>
        </div>
        <div className="dashboard-pulse">
          <div className="dashboard-pulse__header">
            <span>系统脉搏</span>
            <AsyncState loading={readiness.isLoading} error={readiness.error}>
              <span className="dashboard-pulse__live">
                <i /> 实时
              </span>
            </AsyncState>
          </div>
          <PulseItem
            icon={<ApiOutlined />}
            iconClass="purple"
            title="API 服务"
            description="Fastify application"
            ready={ready}
          />
          <PulseItem
            icon={<DatabaseOutlined />}
            iconClass="blue"
            title="数据服务"
            description="PostgreSQL connection"
            ready={ready}
          />
          <PulseItem
            icon={<CloudServerOutlined />}
            iconClass="green"
            title="Worker"
            description="Jobs & Outbox ready"
            ready
          />
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="系统概览">
        <Metric
          icon={<ThunderboltOutlined />}
          color="green"
          label="服务状态"
          value={ready ? '运行正常' : readiness.isLoading ? '正在检查' : '需要检查'}
          detail="每 30 秒自动刷新"
        />
        <Metric
          icon={<FileProtectOutlined />}
          color="purple"
          label="通用模块"
          value="12 项能力"
          detail="已形成完整业务闭环"
        />
        <Metric
          icon={<LockOutlined />}
          color="blue"
          label="安全基线"
          value="Session + CSRF"
          detail="默认拒绝访问策略"
        />
        <Metric
          icon={<RocketOutlined />}
          color="orange"
          label="交付保障"
          value="全链路门禁"
          detail="CI、E2E 与 Docker Smoke"
        />
      </section>

      <section className="dashboard-main-grid">
        <Card className="dashboard-section-card" variant="borderless">
          <div className="dashboard-section-heading">
            <div>
              <Typography.Title level={4}>核心能力</Typography.Title>
              <Typography.Text type="secondary">用于承载业务模块的稳定基础设施</Typography.Text>
            </div>
            <Tag color="success">全部就绪</Tag>
          </div>
          <div className="capability-list">
            {capabilities.map((capability) => (
              <Link className="capability-row" key={capability.title} to={capability.path}>
                <span className="capability-row__icon" style={{ color: capability.color }}>
                  {capability.icon}
                </span>
                <div className="capability-row__content">
                  <div>
                    <strong>{capability.title}</strong>
                    <span>{capability.description}</span>
                  </div>
                  <Progress
                    percent={100}
                    showInfo={false}
                    strokeColor={capability.color}
                    size="small"
                  />
                </div>
                <ArrowRightOutlined className="capability-row__arrow" />
              </Link>
            ))}
          </div>
        </Card>

        <div className="dashboard-side-column">
          <Card className="dashboard-section-card" variant="borderless">
            <div className="dashboard-section-heading">
              <div>
                <Typography.Title level={4}>快速开始</Typography.Title>
                <Typography.Text type="secondary">常用管理入口</Typography.Text>
              </div>
            </div>
            <div className="quick-action-list">
              {quickActions.map((action) => (
                <Link className="quick-action" key={action.title} to={action.path}>
                  <span>{action.icon}</span>
                  <div>
                    <strong>{action.title}</strong>
                    <small>{action.detail}</small>
                  </div>
                  <ArrowRightOutlined />
                </Link>
              ))}
            </div>
          </Card>

          <Card className="delivery-card" variant="borderless">
            <span className="delivery-card__icon">
              <RocketOutlined />
            </span>
            <div>
              <strong>准备交付新业务？</strong>
              <p>使用 CLI 创建版本一致、质量门禁完整的新项目。</p>
            </div>
            <Tag variant="filled">v0.1.0</Tag>
          </Card>
        </div>
      </section>
    </PageContainer>
  );
}

function PulseItem({
  icon,
  iconClass,
  title,
  description,
  ready,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  description: string;
  ready: boolean;
}) {
  return (
    <div className="dashboard-pulse__item">
      <span className={`dashboard-pulse__icon dashboard-pulse__icon--${iconClass}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <CheckCircleFilled className={ready ? 'is-ready' : 'is-pending'} />
    </div>
  );
}

function Metric({
  icon,
  color,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="dashboard-metric" variant="borderless">
      <span className={`dashboard-metric__icon dashboard-metric__icon--${color}`}>{icon}</span>
      <div>
        <span className="dashboard-metric__label">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </Card>
  );
}
