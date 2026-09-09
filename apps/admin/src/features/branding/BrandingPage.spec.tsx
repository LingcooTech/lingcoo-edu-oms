import { App } from 'antd';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PermissionProvider } from '../access/PermissionContext';
import { BrandingPage } from './BrandingPage';

const updateBranding = vi.fn();

vi.mock('./hooks', () => ({
  useBrandingConfiguration: () => ({
    isPending: false,
    error: null,
    data: {
      appName: 'Lingcoo Console',
      logoAssetId: null,
      squareLogoAssetId: null,
      darkLogoAssetId: null,
      faviconAssetId: null,
      primaryColor: '#16a085',
      secondaryColor: '#722ed1',
      backgroundColor: '#f4f6fa',
      cardColor: '#ffffff',
      textColor: '#172033',
      headingFont: 'sans-serif',
      bodyFont: 'sans-serif',
      borderRadius: 8,
      loginTitle: '欢迎回来',
      loginSubtitle: '使用管理员账号继续',
      logoUrl: null,
      squareLogoUrl: null,
      darkLogoUrl: null,
      faviconUrl: null,
      revision: 2,
      updatedAt: '2026-09-02T00:00:00.000Z',
    },
  }),
  useUpdateBranding: () => ({ isPending: false, mutateAsync: updateBranding }),
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
    expect(await screen.findByRole('heading', { name: '品牌设置' })).toBeInTheDocument();
    expect(screen.getByLabelText('界面展示名称')).toHaveValue('Lingcoo Console');
    expect(screen.getByRole('tab', { name: '品牌素材' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '视觉主题' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '登录界面' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '品牌素材' }));
    expect(screen.getAllByRole('button', { name: '选择素材' })).toHaveLength(4);
    fireEvent.click(screen.getByRole('tab', { name: '视觉主题' }));
    expect(screen.getByLabelText('品牌辅助色')).toHaveValue('#722ed1');
    expect(screen.getByLabelText('全局圆角')).toHaveValue('8');
    fireEvent.click(screen.getByRole('tab', { name: '登录界面' }));
    expect(screen.getByLabelText('登录页标题')).toHaveValue('欢迎回来');
    fireEvent.click(screen.getByRole('button', { name: /保存全部品牌设置$/ }));
    await waitFor(() =>
      expect(updateBranding).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedRevision: 2,
          appName: 'Lingcoo Console',
          secondaryColor: '#722ed1',
          borderRadius: 8,
          squareLogoAssetId: null,
          darkLogoAssetId: null,
        }),
      ),
    );
    expect(screen.getByText('实时预览')).toBeInTheDocument();

    view.unmount();
    await act(async () => undefined);
  });
});
