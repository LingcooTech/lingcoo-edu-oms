import {
  ApiOutlined,
  KeyOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { SettingView, SettingsConnectionTest } from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import {
  useClearSetting,
  useRotateSettingSecrets,
  useSaveSetting,
  useSettings,
  useTestSettingConnection,
} from './hooks';

const sourcePresentation = {
  environment: { label: '环境变量', color: 'purple' },
  database: { label: '管理后台', color: 'blue' },
  default: { label: '系统默认', color: 'default' },
  unset: { label: '未配置', color: 'warning' },
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export interface SettingsPageProps {
  includedGroups?: readonly string[];
  title?: string;
  description?: string;
}

export function SettingsPage({
  includedGroups,
  title = '系统设置',
  description = '集中管理应用级运行参数。环境变量始终优先且只能在部署环境中修改。',
}: SettingsPageProps) {
  const { message, modal } = App.useApp();
  const settings = useSettings();
  const rotate = useRotateSettingSecrets();
  const canManage = useCan('settings.manage');
  const includedGroupSet = useMemo(
    () => (includedGroups ? new Set(includedGroups) : undefined),
    [includedGroups],
  );
  const groups = useMemo(() => {
    const result = new Map<string, { label: string; items: SettingView[] }>();
    for (const item of settings.data?.items ?? []) {
      if (includedGroupSet && !includedGroupSet.has(item.group)) continue;
      const group = result.get(item.group) ?? { label: item.groupLabel, items: [] };
      group.items.push(item);
      result.set(item.group, group);
    }
    return [...result.entries()];
  }, [includedGroupSet, settings.data?.items]);
  const connectionTests = useMemo(
    () =>
      (settings.data?.connectionTests ?? []).filter(
        (item) => !includedGroupSet || includedGroupSet.has(item.group),
      ),
    [includedGroupSet, settings.data?.connectionTests],
  );

  const confirmRotation = () => {
    modal.confirm({
      title: '轮换数据库中的敏感设置密文？',
      content: '系统将使用当前主密钥重新加密旧密钥保存的敏感设置。此操作不会展示或更改明文。',
      okText: '开始轮换',
      async onOk() {
        try {
          const result = await rotate.mutateAsync();
          message.success(result.rotated > 0 ? `已轮换 ${result.rotated} 项敏感设置` : '无需轮换');
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  return (
    <PageContainer
      title={title}
      description={description}
      actions={
        canManage ? (
          <Button icon={<KeyOutlined />} loading={rotate.isPending} onClick={confirmRotation}>
            轮换敏感设置密文
          </Button>
        ) : undefined
      }
    >
      <Alert
        type="info"
        showIcon
        title="生效优先级：环境变量 > 管理后台 > 系统默认值"
        description="敏感设置的明文不会通过管理 API 返回；修改时必须重新输入完整值。"
        style={{ marginBottom: 16 }}
      />
      <AsyncState loading={settings.isPending} error={settings.error} empty={groups.length === 0}>
        <Card className="settings-provider-shell">
          <Tabs
            className="settings-provider-tabs"
            tabPosition="top"
            items={groups.map(([key, group]) => ({
              key,
              label: group.label,
              children: (
                <SettingsProvider
                  groupKey={key}
                  label={group.label}
                  items={group.items}
                  tests={connectionTests.filter((item) => item.group === key)}
                  canManage={canManage}
                />
              ),
            }))}
          />
        </Card>
      </AsyncState>
    </PageContainer>
  );
}

function SettingsProvider({
  groupKey,
  label,
  items,
  tests,
  canManage,
}: {
  groupKey: string;
  label: string;
  items: SettingView[];
  tests: SettingsConnectionTest[];
  canManage: boolean;
}) {
  const configured = items.filter((item) => item.configured).length;
  return (
    <div className="settings-provider" data-settings-group={groupKey}>
      <div className="settings-provider__header">
        <div>
          <Space>
            <SettingOutlined />
            <Typography.Title level={5}>{label}</Typography.Title>
          </Space>
          <Typography.Paragraph type="secondary">
            {providerDescription(groupKey)}
          </Typography.Paragraph>
        </div>
        <Tag color={configured === items.length ? 'success' : 'processing'}>
          已配置 {configured}/{items.length}
        </Tag>
      </div>
      <div className="settings-field-grid">
        {items.map((setting) => (
          <SettingEditor key={setting.key} setting={setting} canManage={canManage} />
        ))}
      </div>
      {tests.length > 0 && <ConnectionTests items={tests} canManage={canManage} />}
    </div>
  );
}

function providerDescription(group: string): string {
  const descriptions: Record<string, string> = {
    application: '应用公共地址、默认语言和运行时基础参数。',
    mail: 'SMTP 发信身份、传输安全和投递模式。',
    storage: '素材库文件存储；七牛云 Kodo 通过 S3-compatible 参数接入。',
    'wechat-pay': '微信支付 APIv3 商户身份、签名密钥和回调地址。',
    'content-sources': '外部内容来源；当前仅接入 Notion Connection。',
    'wechat-mini-program': '微信小程序服务端身份、运行版本和订阅消息模板。',
    'education-commerce':
      '控制课时包对外销售能力；线下订单由订单权限控制，不作为可关闭的业务模式。',
  };
  return descriptions[group] ?? '集中维护该服务的运行参数和敏感凭据。';
}

function SettingEditor({ setting, canManage }: { setting: SettingView; canManage: boolean }) {
  const { message, modal } = App.useApp();
  const save = useSaveSetting();
  const clear = useClearSetting();
  const [draft, setDraft] = useState<unknown>(
    setting.kind === 'secret' ? '' : (setting.value ?? ''),
  );
  const mutable = canManage && !setting.readOnly;

  useEffect(() => {
    setDraft(setting.kind === 'secret' ? '' : (setting.value ?? ''));
  }, [setting]);

  const submit = async () => {
    if (setting.kind === 'secret' && (typeof draft !== 'string' || !draft)) {
      message.warning('请输入新的完整敏感设置值');
      return;
    }
    try {
      await save.mutateAsync({
        key: setting.key,
        input: { value: draft, expectedVersion: setting.version },
      });
      message.success(`${setting.label}已保存`);
      if (setting.kind === 'secret') setDraft('');
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  const confirmClear = () => {
    if (setting.version === null) return;
    modal.confirm({
      title: `恢复“${setting.label}”的默认来源？`,
      content: '管理后台保存的值将被删除，设置会回退到系统默认值或未配置状态。',
      okText: '恢复',
      async onOk() {
        try {
          await clear.mutateAsync({
            key: setting.key,
            input: { expectedVersion: setting.version! },
          });
          message.success(`${setting.label}已恢复`);
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  const source = sourcePresentation[setting.source];
  return (
    <section
      className={`setting-field${setting.control === 'textarea' ? ' setting-field--wide' : ''}`}
      data-setting-key={setting.key}
    >
      <div className="setting-row__meta">
        <Space wrap>
          <Typography.Text strong>{setting.label}</Typography.Text>
          <Tag color={source.color}>{source.label}</Tag>
          {setting.kind === 'secret' && <Tag color="red">敏感</Tag>}
        </Space>
        <Typography.Paragraph type="secondary">{setting.description}</Typography.Paragraph>
      </div>
      <div className="setting-row__editor">
        <SettingControl setting={setting} value={draft} disabled={!mutable} onChange={setDraft} />
        <Space wrap>
          {mutable && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={save.isPending}
              onClick={() => void submit()}
            >
              保存
            </Button>
          )}
          {mutable && setting.source === 'database' && (
            <Button icon={<ReloadOutlined />} loading={clear.isPending} onClick={confirmClear}>
              恢复默认来源
            </Button>
          )}
          {setting.readOnly && (
            <Typography.Text type="secondary">请在部署环境中修改</Typography.Text>
          )}
        </Space>
      </div>
    </section>
  );
}

function SettingControl({
  setting,
  value,
  disabled,
  onChange,
}: {
  setting: SettingView;
  value: unknown;
  disabled: boolean;
  onChange(value: unknown): void;
}) {
  if (setting.kind === 'secret') {
    if (setting.control === 'textarea') {
      return (
        <Input.TextArea
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          autoComplete="new-password"
          autoSize={{ minRows: 4, maxRows: 10 }}
          placeholder={setting.configured ? '已配置；粘贴完整新值以替换' : '粘贴完整 PEM 内容'}
          className="setting-secret-textarea"
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }
    return (
      <Input.Password
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        autoComplete="new-password"
        placeholder={setting.configured ? '已配置；输入完整新值以替换' : '输入完整敏感设置值'}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (setting.control === 'boolean') {
    return <Switch checked={Boolean(value)} disabled={disabled} onChange={onChange} />;
  }
  if (setting.control === 'number') {
    return (
      <InputNumber
        value={typeof value === 'number' ? value : null}
        disabled={disabled}
        style={{ width: '100%' }}
        onChange={onChange}
      />
    );
  }
  if (setting.control === 'select') {
    return (
      <Select
        value={value as string | number | boolean | undefined}
        disabled={disabled}
        options={setting.options}
        onChange={onChange}
      />
    );
  }
  if (setting.control === 'textarea') {
    return (
      <Input.TextArea
        value={typeof value === 'string' ? value : ''}
        disabled={disabled}
        autoSize={{ minRows: 3, maxRows: 10 }}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <Input
      type={setting.control === 'email' ? 'email' : setting.control === 'url' ? 'url' : 'text'}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ConnectionTests({
  items,
  canManage,
}: {
  items: SettingsConnectionTest[];
  canManage: boolean;
}) {
  const { message } = App.useApp();
  const test = useTestSettingConnection();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const run = async (key: string) => {
    setActiveKey(key);
    try {
      const result = await test.mutateAsync(key);
      if (result.ok) message.success(result.message);
      else message.error(result.message);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setActiveKey(null);
    }
  };

  return (
    <div className="settings-tests-panel">
      <div className="settings-tests-panel__title">
        <ApiOutlined />
        <Typography.Text strong>连接测试</Typography.Text>
      </div>
      <div className="settings-tests">
        {items.map((item) => (
          <div key={item.key} className="settings-test">
            <div>
              <Typography.Text strong>{item.label}</Typography.Text>
              <Typography.Paragraph type="secondary">{item.description}</Typography.Paragraph>
            </div>
            {canManage && (
              <Button loading={activeKey === item.key} onClick={() => void run(item.key)}>
                测试连接
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
