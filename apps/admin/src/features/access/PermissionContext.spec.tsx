import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { PermissionProvider, RequirePermission } from './PermissionContext';

describe('permission boundary', () => {
  it('renders an allowed route and redirects a denied route', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/roles']}>
        <PermissionProvider permissions={['roles.read']}>
          <Routes>
            <Route element={<RequirePermission permissions={['roles.read']} />}>
              <Route path="roles" element={<div>角色页面</div>} />
            </Route>
            <Route path="forbidden" element={<div>无权访问</div>} />
          </Routes>
        </PermissionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('角色页面')).toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/roles']}>
        <PermissionProvider permissions={[]}>
          <Routes>
            <Route element={<RequirePermission permissions={['roles.read']} />}>
              <Route path="roles" element={<div>角色页面</div>} />
            </Route>
            <Route path="forbidden" element={<div>无权访问</div>} />
          </Routes>
        </PermissionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('无权访问')).toBeInTheDocument();
  });
});
