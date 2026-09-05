import { describe, expect, it } from 'vitest';

import { MailTemplateRegistry } from '../src/modules/mail/domain/template.registry.js';
import { MailCipher } from '../src/modules/mail/infrastructure/mail-cipher.js';

describe('mail templates and encrypted delivery envelope', () => {
  it('validates variables, rejects executable syntax, and escapes generated HTML', () => {
    const registry = new MailTemplateRegistry();
    const rendered = registry.render('system.test', { applicationName: '<Admin & Co>' });
    expect(rendered.text).toContain('<Admin & Co>');
    expect(rendered.html).toContain('&lt;Admin &amp; Co&gt;');
    expect(rendered.html).not.toContain('<Admin & Co>');
    expect(() =>
      registry.render('identity.password-reset', { applicationName: 'Only one' }),
    ).toThrowError(expect.objectContaining({ code: 'MAIL_TEMPLATE_VARIABLES_INVALID' }));
    expect(() =>
      registry.validateOverride('system.test', '{{{applicationName}}}', '{{applicationName}}'),
    ).toThrowError(expect.objectContaining({ code: 'MAIL_TEMPLATE_SYNTAX_INVALID' }));
    expect(() =>
      registry.validateOverride('system.test', '{{unknown}}', '{{applicationName}}'),
    ).toThrowError(expect.objectContaining({ code: 'MAIL_TEMPLATE_VARIABLE_UNKNOWN' }));
  });

  it('encrypts recipient, body, and action token as one opaque envelope', () => {
    const key = 'mail-test-key-that-is-at-least-32-characters';
    const cipher = new MailCipher('test-v1', { 'test-v1': key });
    const plaintext = {
      to: 'secret@example.com',
      subject: 'Secret',
      text: 'token=top-secret',
      html: '<p>top-secret</p>',
    };
    const stored = cipher.encrypt(plaintext);
    expect(JSON.stringify(stored)).not.toContain('top-secret');
    expect(JSON.stringify(stored)).not.toContain('secret@example.com');
    expect(cipher.decrypt(stored.encryptedEnvelope, stored.encryptionKeyId)).toEqual(plaintext);
  });
});
