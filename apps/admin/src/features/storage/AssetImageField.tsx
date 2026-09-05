import { Image, Space } from 'antd';

import { AssetPicker, type AssetPickerProps } from './AssetPicker';
import { useAsset } from './hooks';

export function AssetImageField(props: Omit<AssetPickerProps, 'mediaKind'>) {
  const asset = useAsset(props.value ?? undefined);
  return (
    <Space orientation="vertical" size="small">
      {asset.data?.contentUrl && (
        <Image
          src={asset.data.contentUrl}
          alt={asset.data.altText ?? asset.data.displayName}
          width={160}
          height={96}
          style={{ objectFit: 'contain', borderRadius: 8 }}
        />
      )}
      <AssetPicker {...props} mediaKind="image" />
    </Space>
  );
}
