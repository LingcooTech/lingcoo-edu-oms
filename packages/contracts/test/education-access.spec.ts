import { describe, expect, it } from 'vitest';
import { createAccessUserRequestSchema, roleKeySchema } from '../src/access-control.js';
import {
  educationAssignmentInputSchema,
  teacherCapabilitiesSchema,
} from '../src/education-access.js';

describe('education account foundations', () => {
  it('requires at least one identifier and allows phone-only accounts', () => {
    expect(
      createAccessUserRequestSchema.safeParse({ password: 'strong-password', email: null }).success,
    ).toBe(false);
    expect(
      createAccessUserRequestSchema.parse({ password: 'strong-password', phone: '13800138000' })
        .phone,
    ).toBe('+8613800138000');
    expect(roleKeySchema.parse('institution_admin')).toBe('institution_admin');
  });
  it('defaults every teacher capability to false and requires institution/profile bindings', () => {
    expect(Object.values(teacherCapabilitiesSchema.parse({})).every((v) => v === false)).toBe(true);
    const base = { role: 'teacher', institutionId: '0049b788-7c50-432c-a7c7-c19fae39ab95' };
    expect(educationAssignmentInputSchema.safeParse(base).success).toBe(false);
    expect(
      educationAssignmentInputSchema.safeParse({
        ...base,
        teacherId: '76e1debf-ad73-44e7-9f09-4b5c578c130a',
      }).success,
    ).toBe(true);
    expect(teacherCapabilitiesSchema.safeParse({ globalAccess: true }).success).toBe(false);
  });
});
