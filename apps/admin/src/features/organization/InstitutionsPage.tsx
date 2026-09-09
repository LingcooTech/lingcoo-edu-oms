import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type {
  CreateInstitutionRequest,
  Institution,
  InstitutionMediaItem,
  InstitutionStatus,
  InstitutionType,
  UpdateInstitutionRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  App,
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Grid,
  Image,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import {
  useCreateInstitution,
  useInstitutions,
  useOrganizationProfile,
  useUpdateInstitution,
} from './hooks';

const typePresentation: Record<InstitutionType, { label: string; color: string }> = {
  self_operated: { label: '自营机构', color: 'blue' },
  partner: { label: '合作机构', color: 'purple' },
};

const statusPresentation: Record<InstitutionStatus, { label: string; color: string }> = {
  active: { label: '运营中', color: 'success' },
  inactive: { label: '已停用', color: 'default' },
};

type InstitutionFormValues = {
  name: string;
  type: InstitutionType;
  status?: InstitutionStatus;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  logoUrl?: string;
  intro?: string;
  qualificationItems?: InstitutionMediaItem[];
  outcomeItems?: InstitutionMediaItem[];
  contact?: string;
  sortOrder?: number;
  notes?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

function nullable(value?: string): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function mediaItems(value?: InstitutionMediaItem[]): InstitutionMediaItem[] {
  return (value ?? [])
    .map((item) => ({ imageUrl: item.imageUrl?.trim(), caption: item.caption?.trim() ?? '' }))
    .filter((item) => item.imageUrl);
}

export function InstitutionsPage() {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const canManage = useCan('education.institutions.manage');
  const profile = useOrganizationProfile();
  const selfOperatedOnly = profile.data?.operationMode === 'self_operated_only';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InstitutionStatus | undefined>();
  const [type, setType] = useState<InstitutionType | undefined>();
  const [editing, setEditing] = useState<Institution | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const institutions = useInstitutions({
    page,
    pageSize: 20,
    search: search || undefined,
    status,
    type,
  });
  const createInstitution = useCreateInstitution();
  const updateInstitution = useUpdateInstitution();

  return (
    <PageContainer
      title="机构管理"
      description={
        selfOperatedOnly
          ? '维护实际提供教学服务和课时权益的机构；当前组织为纯自营模式，无需区分机构类型。'
          : '维护实际提供教学服务和课时权益的自营、合作机构；同时保留旧系统已经使用的机构展示资料。'
      }
      actions={
        canManage ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            新建机构
          </Button>
        ) : undefined
      }
    >
      {selfOperatedOnly ? (
        <Alert
          type="info"
          showIcon
          message="当前为纯组织自营模式"
          description="所有机构均按自营机构管理；如未来有合作机构入驻，可在“组织设置”中切换运营模式。"
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size={12} style={{ width: '100%' }}>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索机构、联系人或联系方式"
            style={{ width: screens.md ? 320 : '100%' }}
            onSearch={(value) => {
              setSearch(value.trim());
              setPage(1);
            }}
          />
          {!selfOperatedOnly ? (
            <Select
              allowClear
              placeholder="机构类型"
              style={{ minWidth: 140 }}
              value={type}
              options={Object.entries(typePresentation).map(([value, item]) => ({
                value,
                label: item.label,
              }))}
              onChange={(value) => {
                setType(value);
                setPage(1);
              }}
            />
          ) : null}
          <Select
            allowClear
            placeholder="运营状态"
            style={{ minWidth: 140 }}
            value={status}
            options={Object.entries(statusPresentation).map(([value, item]) => ({
              value,
              label: item.label,
            }))}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
          <Button
            icon={<ReloadOutlined />}
            loading={institutions.isFetching}
            onClick={() => void institutions.refetch()}
          >
            刷新
          </Button>
        </Space>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <AsyncState
          loading={institutions.isPending}
          error={institutions.error}
          empty={institutions.data?.items.length === 0}
        >
          <Table<Institution>
            rowKey="id"
            dataSource={institutions.data?.items ?? []}
            scroll={{ x: 1050 }}
            pagination={{
              current: institutions.data?.page ?? page,
              pageSize: institutions.data?.pageSize ?? 20,
              total: institutions.data?.total ?? 0,
              showSizeChanger: false,
              showTotal: (total) => `共 ${total} 家机构`,
              onChange: setPage,
            }}
            columns={[
              {
                title: '机构',
                dataIndex: 'name',
                width: 250,
                render: (name: string, record) => (
                  <Space>
                    <Avatar shape="square" size={44} src={record.logoUrl ?? undefined}>
                      {name.slice(0, 1)}
                    </Avatar>
                    <Space direction="vertical" size={0}>
                      <Typography.Text strong>{name}</Typography.Text>
                      <Typography.Text type="secondary" ellipsis style={{ maxWidth: 170 }}>
                        {record.intro || '暂无机构介绍'}
                      </Typography.Text>
                    </Space>
                  </Space>
                ),
              },
              ...(selfOperatedOnly
                ? []
                : [
                    {
                      title: '类型',
                      dataIndex: 'type',
                      width: 110,
                      render: (value: InstitutionType) => (
                        <Tag color={typePresentation[value].color}>
                          {typePresentation[value].label}
                        </Tag>
                      ),
                    },
                  ]),
              {
                title: '联系人',
                width: 180,
                render: (_, record) => (
                  <Space direction="vertical" size={0}>
                    <span>{record.contactName || '—'}</span>
                    <Typography.Text type="secondary">
                      {record.contactPhone || record.contact || '—'}
                    </Typography.Text>
                  </Space>
                ),
              },
              {
                title: '地址',
                dataIndex: 'address',
                width: 220,
                ellipsis: true,
                render: (value) => value || '—',
              },
              { title: '排序', dataIndex: 'sortOrder', width: 80 },
              {
                title: '状态',
                dataIndex: 'status',
                width: 100,
                render: (value: InstitutionStatus) => (
                  <Tag color={statusPresentation[value].color}>
                    {statusPresentation[value].label}
                  </Tag>
                ),
              },
              {
                title: '操作',
                fixed: 'right',
                width: 100,
                render: (_, record) =>
                  canManage ? (
                    <Button
                      type="link"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(record);
                        setModalOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                  ) : null,
              },
            ]}
          />
        </AsyncState>
      </Card>

      <InstitutionModal
        open={modalOpen}
        institution={editing}
        showTypeChoice={!selfOperatedOnly}
        loading={createInstitution.isPending || updateInstitution.isPending}
        onClose={() => setModalOpen(false)}
        onSubmit={async (values) => {
          const common = {
            name: values.name.trim(),
            type: selfOperatedOnly ? ('self_operated' as const) : values.type,
            contactName: nullable(values.contactName),
            contactPhone: nullable(values.contactPhone),
            address: nullable(values.address),
            logoUrl: nullable(values.logoUrl),
            intro: values.intro?.trim() ?? '',
            qualificationItems: mediaItems(values.qualificationItems),
            outcomeItems: mediaItems(values.outcomeItems),
            contact: nullable(values.contact),
            sortOrder: values.sortOrder ?? 0,
            notes: nullable(values.notes),
          };
          try {
            if (editing) {
              const input: UpdateInstitutionRequest = {
                ...common,
                status: values.status ?? editing.status,
                expectedRevision: editing.revision,
              };
              await updateInstitution.mutateAsync({ id: editing.id, input });
              void message.success('机构资料已更新');
            } else {
              await createInstitution.mutateAsync(common as CreateInstitutionRequest);
              void message.success('机构已创建');
            }
            setModalOpen(false);
          } catch (error) {
            void message.error(errorMessage(error));
          }
        }}
      />
    </PageContainer>
  );
}

function InstitutionModal({
  open,
  institution,
  showTypeChoice,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  institution: Institution | null;
  showTypeChoice: boolean;
  loading: boolean;
  onClose(): void;
  onSubmit(values: InstitutionFormValues): Promise<void>;
}) {
  const [form] = Form.useForm<InstitutionFormValues>();
  const logoUrl = Form.useWatch('logoUrl', form);
  return (
    <Modal
      open={open}
      width={860}
      title={institution ? '编辑机构' : '新建机构'}
      okText={institution ? '保存修改' : '创建机构'}
      cancelText="取消"
      confirmLoading={loading}
      destroyOnHidden
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingRight: 8 } }}
      onCancel={onClose}
      onOk={() => form.submit()}
      afterOpenChange={(visible) => {
        if (!visible) return;
        form.setFieldsValue(
          institution
            ? {
                ...institution,
                contactName: institution.contactName ?? undefined,
                contactPhone: institution.contactPhone ?? undefined,
                address: institution.address ?? undefined,
                logoUrl: institution.logoUrl ?? undefined,
                contact: institution.contact ?? undefined,
                notes: institution.notes ?? undefined,
              }
            : {
                type: showTypeChoice ? 'partner' : 'self_operated',
                status: 'active',
                intro: '',
                qualificationItems: [],
                outcomeItems: [],
                sortOrder: 0,
              },
        );
      }}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Divider titlePlacement="start" plain>
          基础信息
        </Divider>
        <Row gutter={16}>
          <Col xs={24} md={showTypeChoice ? 14 : 19}>
            <Form.Item name="name" label="机构名称" rules={[{ required: true, max: 160 }]}>
              <Input />
            </Form.Item>
          </Col>
          {showTypeChoice ? (
            <Col xs={24} md={5}>
              <Form.Item name="type" label="机构类型" rules={[{ required: true }]}>
                <Select
                  options={Object.entries(typePresentation).map(([value, item]) => ({
                    value,
                    label: item.label,
                  }))}
                />
              </Form.Item>
            </Col>
          ) : null}
          <Col xs={24} md={5}>
            <Form.Item name="status" label="运营状态">
              <Select
                options={Object.entries(statusPresentation).map(([value, item]) => ({
                  value,
                  label: item.label,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16} align="middle">
          <Col xs={24} md={20}>
            <Form.Item name="logoUrl" label="机构 Logo URL" rules={[{ max: 500 }]}>
              <Input placeholder="https://..." />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}>
            {logoUrl ? (
              <Image src={logoUrl} width={56} height={56} style={{ objectFit: 'contain' }} />
            ) : null}
          </Col>
        </Row>
        <Form.Item name="intro" label="机构介绍" rules={[{ max: 10_000 }]}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} />
        </Form.Item>

        <Divider titlePlacement="start" plain>
          运营联系方式
        </Divider>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="contactName" label="联系人" rules={[{ max: 120 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="contactPhone" label="联系电话" rules={[{ max: 40 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="sortOrder" label="展示顺序" rules={[{ required: true }]}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="address" label="地址" rules={[{ max: 300 }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="contact"
          label="公开联系方式"
          tooltip="旧系统字段，可填写电话、微信、地址等对外展示信息"
          rules={[{ max: 200 }]}
        >
          <Input />
        </Form.Item>

        <Divider titlePlacement="start" plain>
          资质与成果展示
        </Divider>
        <MediaList name="qualificationItems" label="资质证明" />
        <MediaList name="outcomeItems" label="教学成果" />

        <Divider titlePlacement="start" plain>
          内部信息
        </Divider>
        <Form.Item name="notes" label="内部备注" rules={[{ max: 1_000 }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function MediaList({
  name,
  label,
}: {
  name: 'qualificationItems' | 'outcomeItems';
  label: string;
}) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Space>
            <Typography.Text strong>{label}</Typography.Text>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => add({ imageUrl: '', caption: '' })}
            >
              添加
            </Button>
          </Space>
          {fields.map((field) => (
            <Row gutter={8} key={field.key} align="top">
              <Col span={14}>
                <Form.Item
                  {...field}
                  name={[field.name, 'imageUrl']}
                  rules={[{ required: true, max: 500 }]}
                >
                  <Input placeholder="图片 URL" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item {...field} name={[field.name, 'caption']} rules={[{ max: 200 }]}>
                  <Input placeholder="说明" />
                </Form.Item>
              </Col>
              <Col span={2}>
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  aria-label={`删除${label}`}
                  onClick={() => remove(field.name)}
                />
              </Col>
            </Row>
          ))}
        </Space>
      )}
    </Form.List>
  );
}
