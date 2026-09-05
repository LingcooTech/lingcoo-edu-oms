import { ApiError } from '@lingcoo-tech/http';
import { z } from 'zod';

export interface MailTemplateDefinition<T extends Record<string, string> = Record<string, string>> {
  key: string;
  name: string;
  description: string;
  version: number;
  variables: z.ZodType<T>;
  subjectTemplate: string;
  textTemplate: string;
}

const actionVariables = z.object({
  applicationName: z.string().min(1).max(120),
  actionUrl: z.url().max(2_000),
  expiresAt: z.string().min(1).max(120),
});

export const CORE_MAIL_TEMPLATES: MailTemplateDefinition[] = [
  {
    key: 'identity.password-reset',
    name: '重置密码',
    description: '用户请求重置密码时发送。',
    version: 1,
    variables: actionVariables,
    subjectTemplate: '重置您的 {{applicationName}} 密码',
    textTemplate:
      '您好，\n\n请打开以下链接重置密码：\n{{actionUrl}}\n\n链接有效期至 {{expiresAt}}。如非本人操作，请忽略本邮件。',
  },
  {
    key: 'identity.email-verification',
    name: '验证邮箱',
    description: '用户请求验证邮箱时发送。',
    version: 1,
    variables: actionVariables,
    subjectTemplate: '验证您的 {{applicationName}} 邮箱',
    textTemplate:
      '您好，\n\n请打开以下链接完成邮箱验证：\n{{actionUrl}}\n\n链接有效期至 {{expiresAt}}。如非本人操作，请忽略本邮件。',
  },
  {
    key: 'system.test',
    name: '测试邮件',
    description: '管理员验证邮件投递链路时发送。',
    version: 1,
    variables: z.object({ applicationName: z.string().min(1).max(120) }),
    subjectTemplate: '{{applicationName}} 邮件服务测试',
    textTemplate: '这是一封来自 {{applicationName}} 的测试邮件。收到此邮件表示投递链路工作正常。',
  },
];

const placeholder = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

export class MailTemplateRegistry {
  private readonly definitions = new Map<string, MailTemplateDefinition>();

  constructor(definitions: MailTemplateDefinition[] = CORE_MAIL_TEMPLATES) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: MailTemplateDefinition): void {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(definition.key))
      throw new Error(`Invalid mail template key: ${definition.key}`);
    if (this.definitions.has(definition.key))
      throw new Error(`Mail template already registered: ${definition.key}`);
    this.validateSources(
      definition.subjectTemplate,
      definition.textTemplate,
      this.variableNames(definition),
    );
    this.definitions.set(definition.key, definition);
  }

  list(): MailTemplateDefinition[] {
    return [...this.definitions.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  require(key: string): MailTemplateDefinition {
    const definition = this.definitions.get(key);
    if (!definition) throw new ApiError(404, 'MAIL_TEMPLATE_NOT_FOUND', '邮件模板不存在');
    return definition;
  }

  render(
    key: string,
    variables: unknown,
    override?: { subjectTemplate: string; textTemplate: string },
  ) {
    const definition = this.require(key);
    const parsed = definition.variables.safeParse(variables);
    if (!parsed.success)
      throw new ApiError(400, 'MAIL_TEMPLATE_VARIABLES_INVALID', '邮件模板变量校验失败');
    const names = this.variableNames(definition);
    const subjectSource = override?.subjectTemplate ?? definition.subjectTemplate;
    const textSource = override?.textTemplate ?? definition.textTemplate;
    this.validateSources(subjectSource, textSource, names);
    const values = parsed.data as Record<string, string>;
    const render = (source: string) =>
      source.replace(placeholder, (_match, name: string) => values[name] ?? '');
    const subject = render(subjectSource)
      .replace(/[\r\n]+/g, ' ')
      .trim();
    const text = render(textSource);
    return { subject, text, html: this.textToHtml(text) };
  }

  validateOverride(key: string, subjectTemplate: string, textTemplate: string): void {
    const names = this.variableNames(this.require(key));
    this.validateSources(subjectTemplate, textTemplate, names);
  }

  variableNames(definition: MailTemplateDefinition): string[] {
    const shape = (definition.variables as z.ZodObject<Record<string, z.ZodType>>).shape;
    return Object.keys(shape).sort();
  }

  private validateSource(source: string, names: string[]): string[] {
    if (!source.trim() || source.length > 20_000 || /{{{|}}}|{{[#/^!>&]/.test(source))
      throw new ApiError(400, 'MAIL_TEMPLATE_SYNTAX_INVALID', '邮件模板语法无效');
    const found = [...source.matchAll(placeholder)].map((match) => match[1]!);
    const withoutKnownTags = source.replace(placeholder, '');
    if (
      withoutKnownTags.includes('{{') ||
      withoutKnownTags.includes('}}') ||
      found.some((name) => !names.includes(name))
    )
      throw new ApiError(400, 'MAIL_TEMPLATE_VARIABLE_UNKNOWN', '邮件模板包含未知或格式错误的变量');
    return found;
  }

  private validateSources(subject: string, text: string, names: string[]): void {
    const found = [...this.validateSource(subject, names), ...this.validateSource(text, names)];
    const missing = names.filter((name) => !found.includes(name));
    if (missing.length)
      throw new ApiError(
        400,
        'MAIL_TEMPLATE_VARIABLE_MISSING',
        `邮件模板缺少变量：${missing.join(', ')}`,
      );
  }

  private textToHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return `<div style="white-space:pre-wrap;font-family:system-ui,sans-serif">${escaped}</div>`;
  }
}
