import { FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import type { AssetSummary } from '@lingcoo-edu-oms/contracts';
import { Image, Typography } from 'antd';

export function AssetPreview({
  asset,
  compact = false,
}: {
  asset: AssetSummary;
  compact?: boolean;
}) {
  if (asset.mediaKind === 'image' && asset.contentUrl) {
    return (
      <Image
        src={asset.contentUrl}
        alt={asset.altText ?? asset.displayName}
        width={compact ? 56 : '100%'}
        height={compact ? 56 : 320}
        style={{ objectFit: 'contain', borderRadius: 8 }}
        preview={!compact}
      />
    );
  }
  const icon = asset.mediaKind === 'document' ? <FilePdfOutlined /> : <FileTextOutlined />;
  return (
    <Typography.Link href={asset.contentUrl ?? undefined} target="_blank" rel="noreferrer">
      {icon} {compact ? asset.extension?.toUpperCase() : `打开 ${asset.displayName}`}
    </Typography.Link>
  );
}
