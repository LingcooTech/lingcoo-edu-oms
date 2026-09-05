import { App } from 'antd';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PermissionProvider } from '../access/PermissionContext';
import { BrandingPage } from './BrandingPage';

vi.mock('./hooks', () => ({
  useBrandingConfiguration: () => ({
    isPending: false,
    error: null,
    data: {
      appName: 'Lingcoo Console',
      logoAssetId: null,
      faviconAssetId: null,
      primaryColor: '#16a085',
      loginTitle: '欢迎回来',
      loginSubtitle: '使用管理员账号继续',
      logoUrl: null,
      faviconUrl: null,
      revision: 2,
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
  }),
  useUpdateBranding: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock('../storage', () => ({
  AssetPicker: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" disabled={disabled}>
      选择素材
    </button>
  ),
}));

describe('BrandingPage', () => {
  it('renders constrained fields and a live preview for an authorized manager', async () => {
    const view = render(
      <App>
        <PermissionProvider permissions={['branding.read', 'branding.manage', 'storage.read']}>
          <BrandingPage />
        </PermissionProvider>
      </App>,
    );
    expect(await screen.findByRole('heading', { name: '应用品牌' })).toBeInTheDocument();
    expect(screen.getByLabelText('界面展示名称')).toHaveValue('Lingcoo Console');
    expect(screen.getByLabelText('登录页标题')).toHaveValue('欢迎回来');
    expect(screen.getAllByRole('button', { name: '选择素材' })).toHaveLength(2);
    expect(screen.getByText('实时预览')).toBeInTheDocument();

    view.unmount();
    await act(async () => undefined);
  });
});
