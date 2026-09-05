import { CheckCircleFilled, PictureOutlined } from '@ant-design/icons';
import type { AssetMediaKind, AssetSummary } from '@lingcoo-edu-oms/contracts';
import { Button, Card, Col, Empty, Modal, Pagination, Row, Space } from 'antd';
import { useState } from 'react';

import { AsyncState } from '../../components/AsyncState';
import { AssetPreview } from './AssetPreview';
import { useAssets } from './hooks';

export interface AssetPickerProps {
  value?: string | null;
  onChange?: (assetId: string | null, asset?: AssetSummary) => void;
  mediaKind?: AssetMediaKind;
  allowClear?: boolean;
  disabled?: boolean;
}

export function AssetPicker({
  value,
  onChange,
  mediaKind,
  allowClear = true,
  disabled,
}: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const assets = useAssets({ page, pageSize: 12, status: 'active', mediaKind });
  return (
    <>
      <Space>
        <Button icon={<PictureOutlined />} onClick={() => setOpen(true)} disabled={disabled}>
          {value ? '更换素材' : '选择素材'}
        </Button>
        {allowClear && value && (
          <Button onClick={() => onChange?.(null)} disabled={disabled}>
            清除
          </Button>
        )}
      </Space>
      <Modal
        title="从素材库选择"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={920}
        destroyOnHidden
      >
        <AsyncState
          loading={assets.isPending}
          error={assets.error}
          empty={assets.data?.items.length === 0}
        >
          <Row gutter={[12, 12]}>
            {assets.data?.items.map((asset) => (
              <Col xs={12} md={6} key={asset.id}>
                <Card
                  hoverable
                  size="small"
                  onClick={() => {
                    onChange?.(asset.id, asset);
                    setOpen(false);
                  }}
                  cover={<AssetPreview asset={asset} compact />}
                  actions={value === asset.id ? [<CheckCircleFilled key="selected" />] : undefined}
                >
                  <Card.Meta title={asset.displayName} description={asset.originalName} />
                </Card>
              </Col>
            ))}
          </Row>
          {assets.data && assets.data.total > assets.data.pageSize && (
            <Pagination
              current={page}
              pageSize={assets.data.pageSize}
              total={assets.data.total}
              onChange={setPage}
              showSizeChanger={false}
              style={{ marginTop: 16 }}
            />
          )}
        </AsyncState>
        {!assets.isPending && !assets.isError && !assets.data && <Empty />}
      </Modal>
    </>
  );
}
