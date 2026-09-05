import { fireEvent, render, screen } from '@testing-library/react';
import type { AssetSummary } from '@lingcoo-edu-oms/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AssetPicker } from './AssetPicker';

const asset: AssetSummary = {
  id: '2f54dd84-ca70-4d17-bf80-ffaca336113c',
  status: 'active',
  visibility: 'private',
  mediaKind: 'image',
  displayName: '品牌 Logo',
  altText: '品牌标识',
  currentVersion: 1,
  revision: 2,
  provider: 'local',
  originalName: 'logo.png',
  contentType: 'image/png',
  extension: 'png',
  sizeBytes: 100,
  checksumSha256: 'a'.repeat(64),
  referenceCount: 0,
  contentUrl: '/api/storage/assets/2f54dd84-ca70-4d17-bf80-ffaca336113c/content',
  publicUrl: null,
  createdBy: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
};

vi.mock('./hooks', () => ({
  useAssets: () => ({
    isPending: false,
    isError: false,
    error: null,
    data: { items: [asset], page: 1, pageSize: 12, total: 1 },
  }),
}));

describe('AssetPicker', () => {
  it('returns a stable Asset ID and supports clearing it', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AssetPicker onChange={onChange} mediaKind="image" />);
    fireEvent.click(screen.getByRole('button', { name: /选择素材/ }));
    fireEvent.click(screen.getByText('品牌 Logo'));
    expect(onChange).toHaveBeenCalledWith(asset.id, asset);

    rerender(<AssetPicker value={asset.id} onChange={onChange} mediaKind="image" />);
    fireEvent.click(screen.getByRole('button', { name: /清.*除/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
