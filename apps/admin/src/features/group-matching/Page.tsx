import {
  CheckCircleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useInstitutions } from '../organization/hooks';
import type { GroupMatchingCampaign } from './api';
import { CampaignDetailModal } from './CampaignDetailModal';
import { CampaignFormModal } from './CampaignFormModal';
import { campaignStatusMeta, dateTime, money } from './formatters';
import { useGroupMatchingCampaigns } from './hooks';

export function GroupMatchingPage() {
  const { message } = App.useApp();
  const canManage = useCan('education.enrollments.manage');
  const institutions = useInstitutions({ page: 1, pageSize: 100, status: 'active' });
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const campaigns = useGroupMatchingCampaigns(institutionId, { page: 1, pageSize: 50 });

  useEffect(() => {
    if (!institutionId && institutions.data?.items[0]) {
      setInstitutionId(institutions.data.items[0].id);
    }
  }, [institutionId, institutions.data]);

  const paidTotal = (campaigns.data?.items ?? []).reduce(
    (total, campaign) => total + campaign.depositPaidCount,
    0,
  );
  const readyTotal = (campaigns.data?.items ?? []).filter((item) => item.status === 'ready').length;
  const formedTotal = (campaigns.data?.items ?? []).filter(
    (item) => item.status === 'formed',
  ).length;

  const columns: TableColumnsType<GroupMatchingCampaign> = [
    {
      title: '拼课计划',
      dataIndex: 'title',
      width: 240,
      render: (title, record) => (
        <Space orientation="vertical" size={2}>
          <Typography.Link onClick={() => setSelectedCampaignId(record.id)}>
            {title}
          </Typography.Link>
          <Typography.Text type="secondary">
            {record.courseNameSnapshot} · {record.campusNameSnapshot}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态 / 人数',
      width: 190,
      render: (_, record) => {
        const paid = record.depositPaidCount;
        return (
          <Space orientation="vertical" size={5}>
            <Tag color={campaignStatusMeta[record.status].color}>
              {campaignStatusMeta[record.status].label}
            </Tag>
            <Typography.Text>
              {paid} 人已付 / {record.minParticipants} 人成班 / 最多 {record.maxParticipants} 人
            </Typography.Text>
            <Progress
              percent={Math.min(100, Math.round((paid / record.minParticipants) * 100))}
              size="small"
              showInfo={false}
            />
          </Space>
        );
      },
    },
    {
      title: '交付设置',
      width: 180,
      render: (_, record) => (
        <Space orientation="vertical" size={2}>
          <span>
            {record.plannedSessionCount} 课次 · 共{' '}
            {record.plannedSessionCount * record.unitsPerSession} 课时
          </span>
          <Typography.Text type="secondary">
            每次 {record.unitsPerSession} 课时 · {record.durationMinutes} 分钟
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '价格阶梯',
      width: 220,
      render: (_, record) => (
        <Space orientation="vertical" size={3}>
          {record.priceTiers.map((tier) => (
            <Typography.Text key={tier.id}>
              {tier.minParticipants}–{tier.maxParticipants} 人：<b>{money(tier.unitPriceMinor)}</b>
            </Typography.Text>
          ))}
          <Typography.Text type="secondary">
            意向金 {money(record.depositAmountMinor)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '关键时间',
      width: 175,
      render: (_, record) => (
        <Space orientation="vertical" size={2}>
          <span>报名截止：{dateTime(record.recruitmentDeadlineAt)}</span>
          <Typography.Text type="secondary">
            尾款截止：{dateTime(record.balanceDueAt)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '操作',
      fixed: 'right',
      width: 96,
      render: (_, record) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedCampaignId(record.id)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      title="拼课管理"
      description="以意向金锁定报名，达到成班人数后确认教学资源和固定快照；正式订单与课时发放后续由结算工作流生成。"
      actions={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void campaigns.refetch()}>
            刷新
          </Button>
          {canManage && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!institutionId}
              onClick={() => setCreateOpen(true)}
            >
              新建拼课草稿
            </Button>
          )}
        </Space>
      }
    >
      <Card style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 300, maxWidth: '100%' }}
          placeholder="选择机构"
          loading={institutions.isPending}
          value={institutionId}
          onChange={setInstitutionId}
          options={(institutions.data?.items ?? []).map((item) => ({
            value: item.id,
            label: item.name,
          }))}
        />
      </Card>
      {institutionId ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="已发布拼课"
                  value={
                    (campaigns.data?.items ?? []).filter((item) =>
                      ['recruiting', 'ready'].includes(item.status),
                    ).length
                  }
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="已付意向金报名" value={paidTotal} prefix={<WalletOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="待确认 / 已成班"
                  value={`${readyTotal} / ${formedTotal}`}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>
          <Card>
            <AsyncState
              loading={campaigns.isPending}
              error={campaigns.error}
              empty={(campaigns.data?.items.length ?? 0) === 0}
            >
              <Table
                rowKey="id"
                columns={columns}
                dataSource={campaigns.data?.items ?? []}
                scroll={{ x: 1_200 }}
                pagination={false}
              />
            </AsyncState>
          </Card>
        </>
      ) : (
        <Card>
          <Empty description="请先选择机构" />
        </Card>
      )}
      <CampaignFormModal
        institutionId={institutionId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <CampaignDetailModal
        institutionId={institutionId}
        campaignId={selectedCampaignId}
        canManage={canManage}
        onClose={() => setSelectedCampaignId(null)}
        onMessage={message}
      />
    </PageContainer>
  );
}
