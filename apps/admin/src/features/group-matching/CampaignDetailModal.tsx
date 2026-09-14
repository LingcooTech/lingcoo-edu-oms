import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FormOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { App, Button, Descriptions, Divider, Modal, Space, Tag, Typography } from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import type { GroupMatchingEnrollment } from './api';
import { DepositModal } from './DepositModal';
import { EnrollmentModal, EnrollmentTable } from './EnrollmentManagement';
import { FormationModal, FormationSnapshot } from './FormationModal';
import { campaignStatusMeta, dateTime, errorMessage, money } from './formatters';
import { useGroupMatchingCampaign, usePublishGroupMatchingCampaign } from './hooks';

interface CampaignDetailModalProps {
  institutionId: string | null;
  campaignId: string | null;
  canManage: boolean;
  onClose: () => void;
  onMessage: ReturnType<typeof App.useApp>['message'];
}

export function CampaignDetailModal({
  institutionId,
  campaignId,
  canManage,
  onClose,
  onMessage,
}: CampaignDetailModalProps) {
  const detail = useGroupMatchingCampaign(institutionId, campaignId);
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const [depositEnrollment, setDepositEnrollment] = useState<GroupMatchingEnrollment | null>(null);
  const [formationOpen, setFormationOpen] = useState(false);
  const publish = usePublishGroupMatchingCampaign();
  const campaign = detail.data?.campaign;

  const publishCampaign = async () => {
    if (!institutionId || !campaign) return;
    try {
      await publish.mutateAsync({
        institutionId,
        campaignId: campaign.id,
        expectedRevision: campaign.revision,
      });
      onMessage.success('拼课已发布，开始招募');
    } catch (error) {
      onMessage.error(errorMessage(error));
    }
  };

  return (
    <Modal
      open={Boolean(campaignId)}
      title={campaign ? `${campaign.title} · 拼课详情` : '拼课详情'}
      width={1_160}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
    >
      <AsyncState loading={detail.isPending} error={detail.error} empty={!detail.data}>
        {campaign && detail.data ? (
          <>
            <Space wrap style={{ marginBottom: 16 }}>
              <Tag color={campaignStatusMeta[campaign.status].color}>
                {campaignStatusMeta[campaign.status].label}
              </Tag>
              <Typography.Text>
                {campaign.courseNameSnapshot} · {campaign.campusNameSnapshot}
              </Typography.Text>
              <Typography.Text type="secondary">
                <ClockCircleOutlined /> 报名截止 {dateTime(campaign.recruitmentDeadlineAt)}
              </Typography.Text>
              {canManage && campaign.status === 'draft' && (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={publish.isPending}
                  onClick={() => void publishCampaign()}
                >
                  发布招募
                </Button>
              )}
              {canManage && ['recruiting', 'ready'].includes(campaign.status) && (
                <Button icon={<UserAddOutlined />} onClick={() => setEnrollmentOpen(true)}>
                  添加学员报名
                </Button>
              )}
              {canManage && campaign.status === 'ready' && (
                <Button
                  type="primary"
                  icon={<FormOutlined />}
                  onClick={() => setFormationOpen(true)}
                >
                  确认成班
                </Button>
              )}
            </Space>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
              <Descriptions.Item label="目标人数">
                {campaign.minParticipants}–{campaign.maxParticipants} 人
              </Descriptions.Item>
              <Descriptions.Item label="预计交付">
                {campaign.plannedSessionCount} 课次 · 每次 {campaign.unitsPerSession} 课时 ·{' '}
                {campaign.durationMinutes} 分钟
              </Descriptions.Item>
              <Descriptions.Item label="意向金">
                {money(campaign.depositAmountMinor)} / 人
              </Descriptions.Item>
              <Descriptions.Item label="候选时间" span={2}>
                {campaign.candidateSchedule || '待沟通'}
              </Descriptions.Item>
              <Descriptions.Item label="尾款截止">
                {dateTime(campaign.balanceDueAt)}
              </Descriptions.Item>
              <Descriptions.Item label="退款 / 退出规则" span={3}>
                {campaign.withdrawalPolicy || '未设置'}
              </Descriptions.Item>
              {campaign.notes && (
                <Descriptions.Item label="内部备注" span={3}>
                  {campaign.notes}
                </Descriptions.Item>
              )}
            </Descriptions>
            <Divider titlePlacement="start">人数与价格</Divider>
            <Space wrap>
              {campaign.priceTiers.map((tier) => (
                <Tag key={tier.id} color="blue">
                  {tier.minParticipants}–{tier.maxParticipants} 人：{money(tier.unitPriceMinor)}
                  {tier.description ? `（${tier.description}）` : ''}
                </Tag>
              ))}
            </Space>
            <Divider titlePlacement="start">报名名单</Divider>
            <EnrollmentTable
              campaign={campaign}
              detail={detail.data}
              canManage={canManage}
              onRecordDeposit={setDepositEnrollment}
            />
            {institutionId && campaign.status === 'formed' && detail.data.formation && (
              <FormationSnapshot
                formation={detail.data.formation}
                institutionId={institutionId}
                canManage={canManage}
              />
            )}
          </>
        ) : null}
      </AsyncState>
      {campaign && institutionId && (
        <EnrollmentModal
          institutionId={institutionId}
          campaign={campaign}
          open={enrollmentOpen}
          onClose={() => setEnrollmentOpen(false)}
        />
      )}
      {campaign && institutionId && (
        <DepositModal
          institutionId={institutionId}
          campaign={campaign}
          enrollment={depositEnrollment}
          onClose={() => setDepositEnrollment(null)}
        />
      )}
      {campaign && institutionId && detail.data && (
        <FormationModal
          institutionId={institutionId}
          campaign={campaign}
          detail={detail.data}
          open={formationOpen}
          onClose={() => setFormationOpen(false)}
        />
      )}
    </Modal>
  );
}
