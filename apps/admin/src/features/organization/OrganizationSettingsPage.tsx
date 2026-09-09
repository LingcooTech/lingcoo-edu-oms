import { EditOutlined } from '@ant-design/icons';
import type { UpdateOrganizationProfileRequest } from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Image,
  Input,
  Modal,
  Radio,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { useOrganizationProfile, useUpdateOrganizationProfile } from './hooks';

type ProfileFormValues = Omit<UpdateOrganizationProfileRequest, 'expectedRevision'>;

function nullable(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function OrganizationSettingsPage() {
  const { message, modal } = App.useApp();
  const profile = useOrganizationProfile();
  const update = useUpdateOrganizationProfile();
  const canManage = useCan('education.institutions.manage');
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ProfileFormValues>();
  const logoUrl = Form.useWatch('logoUrl', form);
  const openEditor = () => {
    if (!profile.data) return;
    form.setFieldsValue({
      name: profile.data.name,
      brandName: profile.data.brandName,
      logoUrl: profile.data.logoUrl,
      phone: profile.data.phone,
      address: profile.data.address,
      operationMode: profile.data.operationMode,
    });
    setOpen(true);
  };

  return (
    <PageContainer
      title="组织设置"
      description="配置当前单租户部署对应的经营主体。组织不是机构，也不会直接持有学员课时。"
      actions={
        canManage && profile.data ? (
          <Button type="primary" icon={<EditOutlined />} onClick={openEditor}>
            编辑组织资料
          </Button>
        ) : undefined
      }
    >
      <AsyncState loading={profile.isPending} error={profile.error} empty={false}>
        {profile.data ? (
          <Card>
            <Row gutter={[32, 24]} align="middle">
              <Col xs={24} md={5} style={{ textAlign: 'center' }}>
                {profile.data.logoUrl ? (
                  <Image
                    src={profile.data.logoUrl}
                    width={128}
                    height={128}
                    style={{ objectFit: 'contain' }}
                  />
                ) : (
                  <Avatar shape="square" size={128}>
                    {profile.data.brandName.slice(0, 2)}
                  </Avatar>
                )}
              </Col>
              <Col xs={24} md={19}>
                <Space direction="vertical" size={4} style={{ marginBottom: 20 }}>
                  <Typography.Title level={3} style={{ margin: 0 }}>
                    {profile.data.brandName}
                  </Typography.Title>
                  <Typography.Text type="secondary">{profile.data.name}</Typography.Text>
                </Space>
                <Descriptions column={{ xs: 1, md: 2 }} bordered size="small">
                  <Descriptions.Item label="组织全称">{profile.data.name}</Descriptions.Item>
                  <Descriptions.Item label="品牌名称">{profile.data.brandName}</Descriptions.Item>
                  <Descriptions.Item label="联系电话">
                    {profile.data.phone || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="经营地址">
                    {profile.data.address || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="运营模式" span={2}>
                    <Space>
                      <Tag color={profile.data.operationMode === 'mixed' ? 'purple' : 'blue'}>
                        {profile.data.operationMode === 'mixed' ? '自营 + 合作机构' : '纯组织自营'}
                      </Tag>
                      <Typography.Text type="secondary">
                        {profile.data.operationMode === 'mixed'
                          ? '机构可区分为自营或合作'
                          : '全部机构统一按自营管理'}
                      </Typography.Text>
                    </Space>
                  </Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>
          </Card>
        ) : null}
      </AsyncState>

      <Modal
        title="编辑组织资料"
        open={open}
        width={720}
        okText="保存"
        cancelText="取消"
        confirmLoading={update.isPending}
        destroyOnHidden
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form<ProfileFormValues>
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            if (!profile.data) return;
            const save = async () => {
              try {
                await update.mutateAsync({
                  expectedRevision: profile.data.revision,
                  name: values.name.trim(),
                  brandName: values.brandName.trim(),
                  logoUrl: nullable(values.logoUrl),
                  phone: nullable(values.phone),
                  address: nullable(values.address),
                  operationMode: values.operationMode,
                });
                void message.success('组织资料已更新');
                setOpen(false);
              } catch (error) {
                void message.error(error instanceof Error ? error.message : '组织资料更新失败');
                throw error;
              }
            };
            if (
              profile.data.operationMode === 'mixed' &&
              values.operationMode === 'self_operated_only'
            ) {
              modal.confirm({
                title: '切换为纯组织自营？',
                content:
                  '现有合作机构将统一转换为自营机构，机构管理中也将隐藏类型选项。此操作会记录审计日志。',
                okText: '确认切换',
                cancelText: '取消',
                onOk: save,
              });
              return;
            }
            await save();
          }}
        >
          <Form.Item name="operationMode" label="机构运营模式" rules={[{ required: true }]}>
            <Radio.Group style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio value="self_operated_only">
                  纯组织自营：没有合作机构入驻，全部机构统一视为自营
                </Radio>
                <Radio value="mixed">
                  自营 + 合作机构：需要区分教学服务由组织自营还是合作方提供
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="运营模式只控制机构归属分类，不改变机构作为课时服务提供方的业务边界。"
            style={{ marginBottom: 20 }}
          />
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="组织全称" rules={[{ required: true, max: 160 }]}>
                <Input placeholder="经营主体或组织全称" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="brandName" label="品牌名称" rules={[{ required: true, max: 160 }]}>
                <Input placeholder="日常展示名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16} align="middle">
            <Col xs={24} md={20}>
              <Form.Item name="logoUrl" label="组织 Logo URL" rules={[{ max: 500 }]}>
                <Input placeholder="https://..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              {logoUrl ? (
                <Image src={logoUrl} width={56} height={56} style={{ objectFit: 'contain' }} />
              ) : null}
            </Col>
          </Row>
          <Form.Item name="phone" label="联系电话" rules={[{ max: 40 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="经营地址" rules={[{ max: 255 }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
