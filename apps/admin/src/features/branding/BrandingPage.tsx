import { SaveOutlined } from '@ant-design/icons';
import type { AssetSummary, UpdateBrandingRequest } from '@lingcoo-edu-oms/contracts';
import { Alert, App, Button, Card, ColorPicker, Form, Image, Input, Space, Typography } from 'antd';
import { useEffect, useState, type CSSProperties } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { AssetPicker } from '../storage';
import { useBrandingConfiguration, useUpdateBranding } from './hooks';

type BrandingFormValues = Omit<UpdateBrandingRequest, 'expectedRevision'>;

export function BrandingPage() {
  const { message } = App.useApp();
  const configuration = useBrandingConfiguration();
  const update = useUpdateBranding();
  const canManage = useCan('branding.manage');
  const canReadStorage = useCan('storage.read');
  const [form] = Form.useForm<BrandingFormValues>();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const values = Form.useWatch([], form) as BrandingFormValues | undefined;

  useEffect(() => {
    if (!configuration.data) return;
    form.setFieldsValue({
      appName: configuration.data.appName,
      logoAssetId: configuration.data.logoAssetId,
      faviconAssetId: configuration.data.faviconAssetId,
      primaryColor: configuration.data.primaryColor,
      loginTitle: configuration.data.loginTitle,
      loginSubtitle: configuration.data.loginSubtitle,
    });
    setLogoPreview(configuration.data.logoUrl);
    setFaviconPreview(configuration.data.faviconUrl);
  }, [configuration.data, form]);

  return (
    <PageContainer
      title="应用品牌"
      description="配置当前部署应用的展示名称、受控主题色、登录文案和品牌素材。"
    >
      <AsyncState loading={configuration.isPending} error={configuration.error} empty={false}>
        {configuration.data && (
          <>
            {!canReadStorage && canManage && (
              <Alert
                type="warning"
                showIcon
                title="选择品牌素材还需要 storage.read 权限"
                description="你仍可修改名称、颜色和登录文案；现有 Logo 与 Favicon 会保持不变。"
                style={{ marginBottom: 16 }}
              />
            )}
            <div className="branding-grid">
              <Card title="品牌设置">
                <Form<BrandingFormValues>
                  form={form}
                  layout="vertical"
                  disabled={!canManage}
                  onFinish={async (input) => {
                    try {
                      await update.mutateAsync({
                        ...input,
                        expectedRevision: configuration.data.revision,
                      });
                      void message.success('应用品牌已更新');
                    } catch (error) {
                      void message.error(error instanceof Error ? error.message : '品牌更新失败');
                    }
                  }}
                >
                  <Form.Item
                    name="appName"
                    label="界面展示名称"
                    rules={[
                      { required: true, max: 120 },
                      { pattern: /^[^<>\r\n]+$/, message: '不能包含 HTML 或换行符' },
                    ]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item label="品牌主色" required>
                    <Space.Compact block>
                      <Form.Item
                        name="primaryColor"
                        noStyle
                        rules={[
                          { required: true },
                          { pattern: /^#[0-9a-fA-F]{6}$/, message: '请输入 #RRGGBB' },
                        ]}
                      >
                        <Input aria-label="品牌主色" style={{ width: 180 }} />
                      </Form.Item>
                      <ColorPicker
                        value={values?.primaryColor ?? configuration.data.primaryColor}
                        onChangeComplete={(color) =>
                          form.setFieldValue('primaryColor', color.toHexString())
                        }
                        disabled={!canManage}
                        showText
                      />
                    </Space.Compact>
                  </Form.Item>
                  <Form.Item name="logoAssetId" label="应用 Logo">
                    <BrandAssetPicker
                      disabled={!canManage || !canReadStorage}
                      onPreview={setLogoPreview}
                    />
                  </Form.Item>
                  <Form.Item name="faviconAssetId" label="浏览器图标">
                    <BrandAssetPicker
                      disabled={!canManage || !canReadStorage}
                      onPreview={setFaviconPreview}
                    />
                  </Form.Item>
                  <Form.Item
                    name="loginTitle"
                    label="登录页标题"
                    rules={[
                      { required: true, max: 120 },
                      { pattern: /^[^<>\r\n]+$/, message: '不能包含 HTML 或换行符' },
                    ]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="loginSubtitle"
                    label="登录页副标题"
                    rules={[
                      { required: true, max: 240 },
                      { pattern: /^[^<>\r\n]+$/, message: '不能包含 HTML 或换行符' },
                    ]}
                  >
                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
                  </Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    loading={update.isPending}
                    disabled={!canManage}
                  >
                    保存品牌设置
                  </Button>
                </Form>
              </Card>
              <BrandingPreview
                values={values}
                fallback={configuration.data}
                logoUrl={logoPreview}
                faviconUrl={faviconPreview}
              />
            </div>
          </>
        )}
      </AsyncState>
    </PageContainer>
  );
}

function BrandAssetPicker({
  value,
  onChange,
  disabled,
  onPreview,
}: {
  value?: string | null;
  onChange?: (value: string | null) => void;
  disabled?: boolean;
  onPreview: (url: string | null) => void;
}) {
  return (
    <AssetPicker
      value={value}
      mediaKind="image"
      disabled={disabled}
      onChange={(assetId, asset?: AssetSummary) => {
        onChange?.(assetId);
        onPreview(asset?.contentUrl ?? null);
      }}
    />
  );
}

function BrandingPreview({
  values,
  fallback,
  logoUrl,
  faviconUrl,
}: {
  values?: BrandingFormValues;
  fallback: BrandingFormValues;
  logoUrl: string | null;
  faviconUrl: string | null;
}) {
  const display = {
    appName: values?.appName ?? fallback.appName,
    primaryColor: values?.primaryColor ?? fallback.primaryColor,
    loginTitle: values?.loginTitle ?? fallback.loginTitle,
    loginSubtitle: values?.loginSubtitle ?? fallback.loginSubtitle,
  };
  return (
    <Card title="实时预览" className="branding-preview-card">
      <div
        className="branding-preview"
        style={{ '--branding-preview-color': display.primaryColor } as CSSProperties}
      >
        <div className="branding-preview__header">
          {logoUrl ? (
            <Image src={logoUrl} alt={display.appName} preview={false} />
          ) : (
            <span>{initials(display.appName)}</span>
          )}
          <Typography.Text strong>{display.appName}</Typography.Text>
        </div>
        <div className="branding-preview__login">
          <Typography.Title level={3}>{display.loginTitle}</Typography.Title>
          <Typography.Text type="secondary">{display.loginSubtitle}</Typography.Text>
          <Button type="primary" block>
            登录
          </Button>
        </div>
        <Space size="small">
          <Typography.Text type="secondary">浏览器图标</Typography.Text>
          {faviconUrl ? <Image src={faviconUrl} width={24} height={24} preview={false} /> : '默认'}
        </Space>
      </div>
    </Card>
  );
}

function initials(value: string): string {
  return [...(value.trim() || 'FB')].slice(0, 2).join('').toUpperCase();
}
