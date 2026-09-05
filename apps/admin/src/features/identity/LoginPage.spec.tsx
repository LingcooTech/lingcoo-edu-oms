import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { LoginPage } from './LoginPage';

vi.mock('./hooks', () => ({
  useSession: () => ({ data: null }),
  useLogin: () => ({ isError: false, isPending: false, mutate: vi.fn() }),
}));

describe('LoginPage', () => {
  it('renders the identity login form and recovery entry', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '登录管理后台' })).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /登\s*录/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '忘记密码？' })).toBeInTheDocument();
  });
});
