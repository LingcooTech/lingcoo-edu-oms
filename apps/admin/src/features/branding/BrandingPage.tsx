import { SaveOutlined } from '@ant-design/icons';
import type {
  AssetSummary,
  BrandingConfiguration,
  UpdateBrandingRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Card,
  ColorPicker,
  Form,
  Image,
  Input,
  InputNumber,
  Space,
  Tabs,
  Typography,
} from 'antd';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { AssetPicker } from '../storage';
import { useBrandingConfiguration, useUpdateBranding } from './hooks';

type BrandingFormValues = Omit<UpdateBrandingRequest, 'expectedRevision'>;
type BrandingAssetPreview = Pick<
  BrandingConfiguration,
  'logoUrl' | 'squareLogoUrl' | 'darkLogoUrl' | 'faviconUrl'
>;

const COLOR_FIELDS = [
  { name: 'primaryColor', label: '品牌主色', hint: '主要按钮、选中状态和重点操作' },
  { name: 'secondaryColor', label: '品牌辅助色', hint: '辅助强调、信息状态和搭配色' },
  { name: 'backgroundColor', label: '页面背景色', hint: '浅色模式下的后台页面底色' },
  { name: 'cardColor', label: '卡片背景色', hint: '浅色模式下的内容容器底色' },
  { name: 'textColor', label: '主要文字色', hint: '浅色模式下的正文和标题颜色' },
] as const;

export function BrandingPage() {
  const { message } = App.useApp();
  const configuration = useBrandingConfiguration();
  const update = useUpdateBranding();
  const canManage = useCan('branding.manage');
  const canReadStorage = useCan('storage.read');
  const [form] = Form.useForm<BrandingFormValues>();
  const initializedRevision = useRef<number | null>(null);
  const [assetPreview, setAssetPreview] = useState<BrandingAssetPreview>({
    logoUrl: null,
    squareLogoUrl: null,
    darkLogoUrl: null,
    faviconUrl: null,
  });
  const values = Form.useWatch([], form) as BrandingFormValues | undefined;

  useEffect(() => {
    if (!configuration.data) return;
    const data = configuration.data;
    if (initializedRevision.current === data.revision) return;
    initializedRevision.current = data.revision;
    form.setFieldsValue({
      appName: data.appName,
      logoAssetId: data.logoAssetId,
      squareLogoAssetId: data.squareLogoAssetId,
      darkLogoAssetId: data.darkLogoAssetId,
      faviconAssetId: data.faviconAssetId,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
      backgroundColor: data.backgroundColor,
      cardColor: data.cardColor,
      textColor: data.textColor,
      headingFont: data.headingFont,
      bodyFont: data.bodyFont,
      borderRadius: data.borderRadius,
      loginTitle: data.loginTitle,
      loginSubtitle: data.loginSubtitle,
    });
    setAssetPreview({
      logoUrl: data.logoUrl,
      squareLogoUrl: data.squareLogoUrl,
      darkLogoUrl: data.darkLogoUrl,
      faviconUrl: data.faviconUrl,
    });
  }, [configuration.data, form]);

  return (
    <PageContainer
      title="品牌设置"
      description="统一管理品牌标识、应用素材和受控 Design Tokens；组织主体资料仍在组织设置中维护。"
    >
      <AsyncState loading={configuration.isPending} error={configuration.error} empty={false}>
        {configuration.data && (
          <>
            {!canReadStorage && canManage && (
              <Alert
                type="warning"
                showIcon
                title="选择品牌素材还需要 storage.read 权限"
                description="你仍可修改名称、视觉主题和登录文案；现有品牌素材会保持不变。"
                style={{ marginBottom: 16 }}
              />
            )}
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
                  void message.success('品牌设置已更新');
                } catch (error) {
                  void message.error(error instanceof Error ? error.message : '品牌更新失败');
                }
              }}
            >
              <div className="branding-grid">
                <Card className="branding-editor-card">
                  <Tabs
                    destroyOnHidden={false}
                    items={[
                      {
                        key: 'identity',
                        label: '品牌标识',
                        forceRender: true,
                        children: <BrandIdentityFields />,
                      },
                      {
                        key: 'assets',
                        label: '品牌素材',
                        forceRender: true,
                        children: (
                          <BrandAssetFields
                            disabled={!canManage || !canReadStorage}
                            onPreview={(key, url) =>
                              setAssetPreview((current) => ({ ...current, [key]: url }))
                            }
                          />
                        ),
                      },
                      {
                        key: 'tokens',
                        label: '视觉主题',
                        forceRender: true,
                        children: <BrandTokenFields form={form} values={values} />,
                      },
                      {
                        key: 'login',
                        label: '登录界面',
                        forceRender: true,
                        children: <BrandLoginFields />,
                      },
                    ]}
                  />
                  <div className="branding-editor-actions">
                    <Typography.Text type="secondary">
                      保存后立即应用于后台；深色模式保留系统对比度，仅继承品牌色、字体与圆角。
                    </Typography.Text>
                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<SaveOutlined />}
                      loading={update.isPending}
                      disabled={!canManage}
                    >
                      保存全部品牌设置
                    </Button>
                  </div>
                </Card>
                <BrandingPreview
                  values={values}
                  fallback={configuration.data}
                  assets={assetPreview}
                />
              </div>
            </Form>
          </>
        )}
      </AsyncState>
    </PageContainer>
  );
}

function BrandIdentityFields() {
  return (
    <div className="branding-section">
      <SectionIntroduction
        title="品牌标识"
        description="界面展示名称用于后台标题、登录页和系统品牌位置；经营主体名称、电话和地址由组织设置统一维护。"
      />
      <Form.Item
        name="appName"
        label="界面展示名称"
        rules={[
          { required: true, max: 120 },
          { pattern: /^[^<>\r\n]+$/, message: '不能包含 HTML 或换行符' },
        ]}
      >
        <Input placeholder="例如：Lingcoo Edu OMS" />
      </Form.Item>
    </div>
  );
}

function BrandAssetFields({
  disabled,
  onPreview,
}: {
  disabled: boolean;
  onPreview(key: keyof BrandingAssetPreview, url: string | null): void;
}) {
  return (
    <div className="branding-section">
      <SectionIntroduction
        title="品牌素材"
        description="素材均引用素材库中的稳定 Asset，不保存外部 URL；替换文件不会破坏品牌引用。"
      />
      <div className="branding-form-grid">
        <Form.Item
          name="logoAssetId"
          label="完整 Logo"
          extra="横版或完整品牌 Logo，用于登录页等宽空间。"
        >
          <BrandAssetPicker disabled={disabled} onPreview={(url) => onPreview('logoUrl', url)} />
        </Form.Item>
        <Form.Item
          name="squareLogoAssetId"
          label="方形 Logo"
          extra="用于侧栏图标、头像和小程序图标位置。"
        >
          <BrandAssetPicker
            disabled={disabled}
            onPreview={(url) => onPreview('squareLogoUrl', url)}
          />
        </Form.Item>
        <Form.Item
          name="darkLogoAssetId"
          label="暗色 Logo"
          extra="用于深色背景；未配置时回退到完整 Logo。"
        >
          <BrandAssetPicker
            disabled={disabled}
            onPreview={(url) => onPreview('darkLogoUrl', url)}
          />
        </Form.Item>
        <Form.Item
          name="faviconAssetId"
          label="浏览器图标"
          extra="建议使用清晰的方形 PNG 或 WebP。"
        >
          <BrandAssetPicker disabled={disabled} onPreview={(url) => onPreview('faviconUrl', url)} />
        </Form.Item>
      </div>
    </div>
  );
}

function BrandTokenFields({
  form,
  values,
}: {
  form: ReturnType<typeof Form.useForm<BrandingFormValues>>[0];
  values?: BrandingFormValues;
}) {
  return (
    <div className="branding-section">
      <SectionIntroduction
        title="Design Tokens"
        description="只开放经过校验的颜色、字体和圆角，不接受任意 CSS，避免品牌设置破坏后台可用性。"
      />
      <div className="branding-form-grid">
        {COLOR_FIELDS.map((field) => (
          <Form.Item key={field.name} label={field.label} extra={field.hint} required>
            <Space.Compact block>
              <Form.Item
                name={field.name}
                noStyle
                rules={[
                  { required: true },
                  { pattern: /^#[0-9a-fA-F]{6}$/, message: '请输入 #RRGGBB' },
                ]}
              >
                <Input aria-label={field.label} />
              </Form.Item>
              <ColorPicker
                value={values?.[field.name]}
                onChangeComplete={(color) => form.setFieldValue(field.name, color.toHexString())}
                showText
              />
            </Space.Compact>
          </Form.Item>
        ))}
        <Form.Item
          name="borderRadius"
          label="全局圆角"
          extra="允许 0–24 px；应用于按钮、输入框、卡片和弹框。"
          rules={[{ required: true }]}
        >
          <InputNumber min={0} max={24} precision={0} suffix="px" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="headingFont"
          label="标题字体"
          extra="填写系统已安装字体栈；不会加载远程字体文件。"
          rules={[{ required: true, max: 120 }]}
        >
          <Input placeholder="PingFang SC, Microsoft YaHei, sans-serif" />
        </Form.Item>
        <Form.Item
          name="bodyFont"
          label="正文字体"
          extra="影响表单、表格、菜单和正文。"
          rules={[{ required: true, max: 120 }]}
        >
          <Input placeholder="PingFang SC, Microsoft YaHei, sans-serif" />
        </Form.Item>
      </div>
    </div>
  );
}

function BrandLoginFields() {
  return (
    <div className="branding-section">
      <SectionIntroduction
        title="登录界面"
        description="这里只维护管理后台登录文案，不包含已排除的公开 Web Header、Footer 或页面装修。"
      />
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
    </div>
  );
}

function SectionIntroduction({ title, description }: { title: string; description: string }) {
  return (
    <div className="branding-section__intro">
      <Typography.Title level={5}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
    </div>
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
  assets,
}: {
  values?: BrandingFormValues;
  fallback: BrandingConfiguration;
  assets: BrandingAssetPreview;
}) {
  const display = {
    appName: values?.appName ?? fallback.appName,
    primaryColor: values?.primaryColor ?? fallback.primaryColor,
    secondaryColor: values?.secondaryColor ?? fallback.secondaryColor,
    backgroundColor: values?.backgroundColor ?? fallback.backgroundColor,
    cardColor: values?.cardColor ?? fallback.cardColor,
    textColor: values?.textColor ?? fallback.textColor,
    headingFont: values?.headingFont ?? fallback.headingFont,
    bodyFont: values?.bodyFont ?? fallback.bodyFont,
    borderRadius: values?.borderRadius ?? fallback.borderRadius,
    loginTitle: values?.loginTitle ?? fallback.loginTitle,
    loginSubtitle: values?.loginSubtitle ?? fallback.loginSubtitle,
  };
  const previewStyle = {
    '--branding-preview-primary': display.primaryColor,
    '--branding-preview-secondary': display.secondaryColor,
    '--branding-preview-background': display.backgroundColor,
    '--branding-preview-card': display.cardColor,
    '--branding-preview-text': display.textColor,
    '--branding-preview-heading-font': display.headingFont,
    '--branding-preview-body-font': display.bodyFont,
    '--branding-preview-radius': `${display.borderRadius}px`,
  } as CSSProperties;
  return (
    <Card title="实时预览" className="branding-preview-card">
      <div className="branding-preview" style={previewStyle}>
        <div className="branding-preview__header">
          {(assets.squareLogoUrl ?? assets.logoUrl) ? (
            <Image
              src={assets.squareLogoUrl ?? assets.logoUrl ?? undefined}
              alt={display.appName}
              preview={false}
            />
          ) : (
            <span>{initials(display.appName)}</span>
          )}
          <div>
            <Typography.Text strong>{display.appName}</Typography.Text>
            <small>EDUCATION OMS</small>
          </div>
        </div>
        <div className="branding-preview__login">
          {assets.logoUrl && <Image src={assets.logoUrl} height={32} preview={false} />}
          <h3>{display.loginTitle}</h3>
          <p>{display.loginSubtitle}</p>
          <button type="button">登录</button>
        </div>
        <div className="branding-preview__tokens">
          {COLOR_FIELDS.map((field) => (
            <div key={field.name} className="branding-preview__token">
              <span style={{ background: display[field.name] }} />
              <small>{field.label}</small>
            </div>
          ))}
        </div>
        <Space size="small">
          <Typography.Text type="secondary">浏览器图标</Typography.Text>
          {assets.faviconUrl ? (
            <Image src={assets.faviconUrl} width={24} height={24} preview={false} />
          ) : (
            '默认'
          )}
        </Space>
      </div>
    </Card>
  );
}

function initials(value: string): string {
  return [...(value.trim() || 'LE')].slice(0, 2).join('').toUpperCase();
}
