import {
  CheckCircleOutlined,
  GiftOutlined,
  ScheduleOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type {
  GrantLessonUnitsRequest,
  LessonAccountMutationResult,
} from '@lingcoo-edu-oms/contracts';
import { Alert, App, Button, Descriptions, Modal, Result, Space, Spin, Statistic } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  GrantLessonUnitsModal,
  type GrantLessonUnitsFormValues,
} from '../lessons/GrantLessonUnitsModal';
import { useGrantLessonUnits, useLessonAccount, useLessonPackages } from '../lessons/hooks';

export interface StudentOnboardingTarget {
  institutionId: string;
  institutionName: string;
  studentId: string;
  studentName: string;
}

function nullable(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function operationId() {
  return globalThis.crypto.randomUUID();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export function StudentOnboardingFlow({
  target,
  onClose,
}: {
  target: StudentOnboardingTarget | null;
  onClose(): void;
}) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantResult, setGrantResult] = useState<LessonAccountMutationResult | null>(null);
  const account = useLessonAccount(target?.institutionId ?? null, target?.studentId ?? null);
  const packages = useLessonPackages(target?.institutionId ?? null, {
    page: 1,
    pageSize: 100,
    status: 'active',
  });
  const grant = useGrantLessonUnits();

  useEffect(() => {
    if (!target) {
      setGrantOpen(false);
      setGrantResult(null);
    }
  }, [target]);

  const currentAccount = grantResult?.account ?? account.data;
  const accountReady = Boolean(currentAccount);

  function viewAccount() {
    if (!target) return;
    onClose();
    navigate(
      `/lesson-accounts?institutionId=${encodeURIComponent(target.institutionId)}&studentId=${encodeURIComponent(target.studentId)}`,
    );
  }

  function arrangeTeaching() {
    if (!target) return;
    onClose();
    navigate(
      `/classes?institutionId=${encodeURIComponent(target.institutionId)}&studentId=${encodeURIComponent(target.studentId)}`,
    );
  }

  return (
    <>
      <Modal
        open={Boolean(target)}
        width={680}
        title={grantResult ? '课时发放完成' : '学员建档完成'}
        onCancel={onClose}
        footer={
          <Space wrap>
            <Button onClick={onClose}>稍后处理</Button>
            <Button icon={<WalletOutlined />} onClick={viewAccount} disabled={!accountReady}>
              查看课时账户
            </Button>
            <Button icon={<ScheduleOutlined />} onClick={arrangeTeaching}>
              安排教学
            </Button>
            <Button
              type="primary"
              icon={<GiftOutlined />}
              onClick={() => setGrantOpen(true)}
              disabled={account.isPending || Boolean(account.error)}
            >
              {grantResult ? '继续发放课时' : '立即发放课时'}
            </Button>
          </Space>
        }
      >
        {target && (
          <Spin spinning={account.isPending}>
            {grantResult ? (
              <Result
                status="success"
                icon={<CheckCircleOutlined />}
                title={`已为${target.studentName}发放 ${grantResult.movement.units} 课时`}
                subTitle="发放批次和不可变课时流水已同时生成。"
                extra={<Statistic title="当前可用课时" value={grantResult.account.balanceUnits} />}
              />
            ) : (
              <>
                <Alert
                  type={account.error ? 'error' : 'success'}
                  showIcon
                  message={account.error ? '课时账户读取失败' : '学员档案和机构服务关系已建立'}
                  description={
                    account.error
                      ? errorMessage(account.error)
                      : '系统已同步建立该学员在当前机构下的零余额课时账户。'
                  }
                  style={{ marginBottom: 20 }}
                />
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="学员">{target.studentName}</Descriptions.Item>
                  <Descriptions.Item label="服务机构">{target.institutionName}</Descriptions.Item>
                  <Descriptions.Item label="课时账户">
                    {accountReady ? '已创建' : '正在确认'}
                  </Descriptions.Item>
                  <Descriptions.Item label="当前余额">
                    {currentAccount?.balanceUnits ?? 0} 课时
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}
          </Spin>
        )}
      </Modal>

      <GrantLessonUnitsModal
        open={grantOpen}
        packages={packages.data?.items ?? []}
        loading={grant.isPending}
        onClose={() => setGrantOpen(false)}
        onSubmit={async (values: GrantLessonUnitsFormValues) => {
          if (!target || !currentAccount) return;
          const common = {
            source: values.source,
            reason: values.reason.trim(),
            sourceReference: nullable(values.sourceReference),
          };
          const command: GrantLessonUnitsRequest =
            values.mode === 'template'
              ? { ...common, templateId: values.templateId! }
              : {
                  ...common,
                  templateId: null,
                  baseUnits: values.baseUnits!,
                  bonusUnits: values.bonusUnits ?? 0,
                };
          try {
            const result = await grant.mutateAsync({
              institutionId: target.institutionId,
              studentId: target.studentId,
              command,
              expectedAccountRevision: currentAccount.revision,
              idempotencyKey: operationId(),
            });
            setGrantResult(result);
            setGrantOpen(false);
            void message.success('课时已发放并生成批次与流水');
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
