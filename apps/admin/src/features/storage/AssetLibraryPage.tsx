import {
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  SettingOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { AssetSummary, AssetVisibility } from '@lingcoo-edu-oms/contracts';
import {
  Alert,
  App,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Upload,
} from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AsyncState } from '../../components/AsyncState';
import { PageContainer } from '../../components/PageContainer';
import { useCan } from '../access/PermissionContext';
import { AssetPreview } from './AssetPreview';
import {
  useAsset,
  useAssets,
  useDeleteAsset,
  useReplaceAsset,
  useUpdateAsset,
  useUploadAsset,
} from './hooks';

export function AssetLibraryPage() {
  const { message } = App.useApp();
  const canManage = useCan('storage.manage');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [mediaKind, setMediaKind] = useState<'image' | 'document' | 'text' | undefined>();
  const [selectedId, setSelectedId] = useState<string>();
  const assets = useAssets({ page, pageSize: 20, search: search || undefined, mediaKind });
  const upload = useUploadAsset();

  return (
    <PageContainer
      title="素材库"
      description="统一管理图片、PDF 和 UTF-8 文本；业务数据只保存稳定 Asset ID。"
      actions={
        <Space>
          <Link to="/settings">
            <Button icon={<SettingOutlined />}>存储设置</Button>
          </Link>
          <Upload
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif,application/pdf,text/plain,text/csv"
            showUploadList={false}
            disabled={!canManage}
            beforeUpload={async (file) => {
              try {
                await upload.mutateAsync(file);
                void message.success('素材上传完成');
              } catch (error) {
                void message.error(error instanceof Error ? error.message : '素材上传失败');
              }
              return Upload.LIST_IGNORE;
            }}
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={upload.isPending}
              disabled={!canManage}
            >
              上传素材
            </Button>
          </Upload>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        title="存储空间默认保持私有"
        description="公开素材也通过应用受控地址访问；替换文件不会改变 Asset ID，删除前会检查业务引用。"
        style={{ marginBottom: 16 }}
      />
      <Space wrap style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          placeholder="搜索名称或原文件名"
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          style={{ width: 280 }}
        />
        <Select
          allowClear
          placeholder="全部类型"
          style={{ width: 160 }}
          options={[
            { label: '图片', value: 'image' },
            { label: 'PDF 文档', value: 'document' },
            { label: '文本', value: 'text' },
          ]}
          onChange={(value) => {
            setMediaKind(value);
            setPage(1);
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void assets.refetch()}>
          刷新
        </Button>
      </Space>
      <AsyncState
        loading={assets.isPending}
        error={assets.error}
        empty={assets.data?.items.length === 0}
      >
        <Table<AssetSummary>
          rowKey="id"
          dataSource={assets.data?.items}
          scroll={{ x: 900 }}
          pagination={{
            current: page,
            pageSize: assets.data?.pageSize,
            total: assets.data?.total,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            {
              title: '预览',
              width: 88,
              render: (_, asset) => <AssetPreview asset={asset} compact />,
            },
            {
              title: '素材',
              render: (_, asset) => (
                <Button type="link" onClick={() => setSelectedId(asset.id)} style={{ padding: 0 }}>
                  {asset.displayName}
                </Button>
              ),
            },
            { title: '文件名', dataIndex: 'originalName', ellipsis: true },
            { title: '类型', dataIndex: 'contentType', width: 150 },
            {
              title: '可见性',
              width: 90,
              render: (_, asset) => <Tag>{asset.visibility === 'public' ? '公开' : '私有'}</Tag>,
            },
            { title: '引用', dataIndex: 'referenceCount', width: 80 },
            { title: '版本', dataIndex: 'currentVersion', width: 80 },
            {
              title: '更新时间',
              dataIndex: 'updatedAt',
              width: 190,
              render: (value: string) => new Date(value).toLocaleString(),
            },
          ]}
        />
      </AsyncState>
      <AssetDrawer id={selectedId} onClose={() => setSelectedId(undefined)} canManage={canManage} />
    </PageContainer>
  );
}

function AssetDrawer({
  id,
  onClose,
  canManage,
}: {
  id?: string;
  onClose: () => void;
  canManage: boolean;
}) {
  const { message } = App.useApp();
  const asset = useAsset(id);
  const update = useUpdateAsset();
  const replace = useReplaceAsset();
  const remove = useDeleteAsset();
  const [editing, setEditing] = useState(false);
  return (
    <Drawer
      title="素材详情"
      open={Boolean(id)}
      onClose={onClose}
      size={560}
      className="storage-asset-detail-drawer"
      destroyOnHidden
    >
      <AsyncState loading={asset.isPending} error={asset.error} empty={!asset.data}>
        {asset.data && (
          <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <AssetPreview asset={asset.data} />
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Asset ID">{asset.data.id}</Descriptions.Item>
              <Descriptions.Item label="原文件名">{asset.data.originalName}</Descriptions.Item>
              <Descriptions.Item label="SHA-256">{asset.data.checksumSha256}</Descriptions.Item>
              <Descriptions.Item label="引用数量">{asset.data.referenceCount}</Descriptions.Item>
              <Descriptions.Item label="版本数量">{asset.data.versions.length}</Descriptions.Item>
            </Descriptions>
            {editing ? (
              <AssetMetadataForm
                asset={asset.data}
                loading={update.isPending}
                onCancel={() => setEditing(false)}
                onSave={async (values) => {
                  await update.mutateAsync({
                    id: asset.data.id,
                    input: { ...values, expectedRevision: asset.data.revision },
                  });
                  setEditing(false);
                  void message.success('素材信息已更新');
                }}
              />
            ) : (
              <Space wrap>
                <Button
                  icon={<EditOutlined />}
                  disabled={!canManage}
                  onClick={() => setEditing(true)}
                >
                  编辑信息
                </Button>
                <Upload
                  showUploadList={false}
                  disabled={!canManage}
                  beforeUpload={async (file) => {
                    await replace.mutateAsync({
                      id: asset.data.id,
                      revision: asset.data.revision,
                      file,
                    });
                    void message.success('素材内容已替换');
                    return Upload.LIST_IGNORE;
                  }}
                >
                  <Button
                    icon={<UploadOutlined />}
                    loading={replace.isPending}
                    disabled={!canManage}
                  >
                    替换文件
                  </Button>
                </Upload>
                <Popconfirm
                  title="确认删除素材？"
                  description={
                    asset.data.referenceCount
                      ? '该素材仍有业务引用，服务器会拒绝删除。'
                      : '物理文件将由 Worker 异步清理。'
                  }
                  onConfirm={async () => {
                    await remove.mutateAsync({ id: asset.data.id, revision: asset.data.revision });
                    void message.success('素材已进入删除流程');
                    onClose();
                  }}
                >
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={remove.isPending}
                    disabled={!canManage}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            )}
          </Space>
        )}
      </AsyncState>
    </Drawer>
  );
}

function AssetMetadataForm({
  asset,
  loading,
  onCancel,
  onSave,
}: {
  asset: AssetSummary;
  loading: boolean;
  onCancel: () => void;
  onSave: (values: {
    displayName: string;
    altText: string | null;
    visibility: AssetVisibility;
  }) => Promise<void>;
}) {
  return (
    <Form
      layout="vertical"
      initialValues={{
        displayName: asset.displayName,
        altText: asset.altText,
        visibility: asset.visibility,
      }}
      onFinish={onSave}
    >
      <Form.Item name="displayName" label="显示名称" rules={[{ required: true, max: 200 }]}>
        <Input />
      </Form.Item>
      <Form.Item name="altText" label="替代文本">
        <Input.TextArea maxLength={500} />
      </Form.Item>
      <Form.Item name="visibility" label="可见性" rules={[{ required: true }]}>
        <Select
          options={[
            { label: '私有', value: 'private' },
            { label: '公开', value: 'public' },
          ]}
        />
      </Form.Item>
      <Space>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          保存
        </Button>
      </Space>
    </Form>
  );
}
