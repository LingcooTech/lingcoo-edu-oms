import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  type TableColumnsType,
} from 'antd';
import { useState } from 'react';

import { AsyncState } from '../components/AsyncState';
import { PageContainer } from '../components/PageContainer';
import { StatusTag } from '../components/StatusTag';

interface ExampleRow {
  key: string;
  name: string;
  status: 'ready' | 'planned';
  owner: string;
}

const rows: ExampleRow[] = [
  { key: 'contracts', name: 'Contracts', status: 'ready', owner: 'Platform' },
  { key: 'api-client', name: 'API Client', status: 'ready', owner: 'Platform' },
  { key: 'identity', name: 'Identity', status: 'planned', owner: 'Identity Module' },
];

const columns: TableColumnsType<ExampleRow> = [
  { title: '边界', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
  { title: '所有者', dataIndex: 'owner' },
  {
    title: '状态',
    dataIndex: 'status',
    render: (status: ExampleRow['status']) => (
      <StatusTag tone={status === 'ready' ? 'success' : 'processing'}>
        {status === 'ready' ? '已就绪' : '待实施'}
      </StatusTag>
    ),
  },
];

export function ShowcasePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ExampleRow | null>(null);

  return (
    <PageContainer
      title="UI 基础展示"
      description="直接使用 Ant Design 官方组件，只保留应用级布局和状态组合。"
      breadcrumbs={[{ title: '概览' }, { title: 'UI 基础' }]}
      actions={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建示例
        </Button>
      }
    >
      <div className="showcase-grid">
        <Card title="资源列表" styles={{ body: { padding: 0 } }}>
          <Flex gap={8} wrap="wrap" style={{ padding: 16 }}>
            <Input prefix={<SearchOutlined />} placeholder="搜索边界" style={{ width: 220 }} />
            <Select
              defaultValue="all"
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'ready', label: '已就绪' },
                { value: 'planned', label: '待实施' },
              ]}
              style={{ width: 140 }}
            />
          </Flex>
          <Table
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 5 }}
            scroll={{ x: 560 }}
            onRow={(record) => ({
              onClick: () => setSelectedRow(record),
              style: { cursor: 'pointer' },
            })}
          />
        </Card>

        <Card title="标准表单">
          <Form layout="vertical" requiredMark="optional">
            <Form.Item
              label="模块名称"
              name="name"
              rules={[{ required: true, message: '请输入模块名称' }]}
            >
              <Input placeholder="例如 Identity" />
            </Form.Item>
            <Form.Item label="计划日期" name="date">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="说明" name="description">
              <Input.TextArea rows={4} placeholder="记录职责和非职责" />
            </Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button>取消</Button>
            </Space>
          </Form>
        </Card>

        <Card title="异步状态">
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Alert type="success" showIcon title="共享边界构建成功" />
            <AsyncState empty>
              <span />
            </AsyncState>
          </Space>
        </Card>

        <Card title="危险操作">
          <Space orientation="vertical" size={16}>
            <Alert type="warning" showIcon title="危险操作必须明确确认，并由后端权限最终裁决。" />
            <Button danger icon={<DeleteOutlined />}>
              删除示例
            </Button>
          </Space>
        </Card>
      </div>

      <Modal
        title="应用级组合示例"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => setModalOpen(false)}
      >
        <p>Modal、Form、Table 等基础交互直接使用 Ant Design，不复制组件源码。</p>
      </Modal>
      <Drawer
        title="资源详情"
        size={480}
        open={Boolean(selectedRow)}
        onClose={() => setSelectedRow(null)}
      >
        {selectedRow && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="边界">{selectedRow.name}</Descriptions.Item>
            <Descriptions.Item label="所有者">{selectedRow.owner}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <StatusTag tone={selectedRow.status === 'ready' ? 'success' : 'processing'}>
                {selectedRow.status === 'ready' ? '已就绪' : '待实施'}
              </StatusTag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </PageContainer>
  );
}
