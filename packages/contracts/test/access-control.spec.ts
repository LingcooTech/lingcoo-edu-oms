import {
  createAccessUserRequestSchema,
  permissionKeySchema,
  roleKeySchema,
} from '../src/access-control.js';
import { describe, expect, it } from 'vitest';

describe('access control contracts', () => {
  it('accepts namespaced permissions and stable role keys', () => {
    expect(permissionKeySchema.parse('accounts.read')).toBe('accounts.read');
    expect(roleKeySchema.parse('operations.manager')).toBe('operations.manager');
    expect(permissionKeySchema.safeParse('admin').success).toBe(false);
    expect(roleKeySchema.safeParse('Operations Manager').success).toBe(false);
  });

  it('normalizes account input and applies safe role defaults', () => {
    expect(
      createAccessUserRequestSchema.parse({
        email: ' Admin@Example.com ',
        password: 'a-secure-password',
      }),
    ).toMatchObject({ email: 'admin@example.com', emailVerified: false, roleIds: [] });
  });
});
