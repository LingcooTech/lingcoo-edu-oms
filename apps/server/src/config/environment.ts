import { z } from 'zod';

export const DEVELOPMENT_SETTINGS_KEY = 'development-only-settings-key-change-me';

const settingsKeyringSchema = z
  .string()
  .default(JSON.stringify({ development: DEVELOPMENT_SETTINGS_KEY }))
  .transform((value, context): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      context.addIssue({ code: 'custom', message: '必须是 Key ID 到密钥的 JSON 对象' });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.string().trim().min(1).max(120), z.string().min(32)));

const optionalEnvironmentValue = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), schema])
    .optional()
    .transform((value): z.output<T> | undefined => (value === '' ? undefined : value));

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().trim().min(1).default('lingcoo-edu-oms'),
    APP_VERSION: z.string().trim().min(1).default('development'),
    APP_PUBLIC_URL: optionalEnvironmentValue(z.url().max(2_000)),
    API_HOST: z.string().trim().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(8090),
    CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174'),
    DATABASE_URL: z.string().url(),
    API_DOCS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    JOBS_WORKER_ID: optionalEnvironmentValue(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._:@/-]+$/)
        .max(200),
    ),
    JOBS_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
    JOBS_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(250).max(300_000).default(10_000),
    JOBS_SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
    JOBS_STALE_RECOVERY_BATCH: z.coerce.number().int().min(1).max(1_000).default(100),
    JOBS_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    JOBS_MAINTENANCE_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(3_600_000),
    OUTBOX_WORKER_ID: optionalEnvironmentValue(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._:@/-]+$/)
        .max(200),
    ),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    OUTBOX_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
    OUTBOX_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(250).max(300_000).default(10_000),
    OUTBOX_SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
    OUTBOX_STALE_RECOVERY_BATCH: z.coerce.number().int().min(1).max(1_000).default(100),
    OUTBOX_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    OUTBOX_MAINTENANCE_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(3_600_000),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(604_800),
    AUTH_ACTION_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(3600),
    AUTH_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('app_session'),
    AUTH_CSRF_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('app_csrf'),
    AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    AUTH_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_EXPOSE_TEST_TOKENS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SETTINGS_ENCRYPTION_CURRENT_KEY_ID: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]+$/)
      .max(120)
      .default('development'),
    SETTINGS_ENCRYPTION_KEYS: settingsKeyringSchema,
    SUPPORT_EMAIL: optionalEnvironmentValue(
      z.string().trim().toLowerCase().pipe(z.email().max(320)),
    ),
    MAIL_TRANSPORT: optionalEnvironmentValue(z.enum(['capture', 'smtp'])),
    SMTP_HOST: optionalEnvironmentValue(z.string().trim().min(1).max(320)),
    SMTP_PORT: optionalEnvironmentValue(z.coerce.number().int().min(1).max(65_535)),
    SMTP_SECURE: optionalEnvironmentValue(
      z.enum(['true', 'false']).transform((value) => value === 'true'),
    ),
    SMTP_USER: optionalEnvironmentValue(z.string().trim().min(1).max(320)),
    SMTP_PASSWORD: optionalEnvironmentValue(z.string().min(1).max(500)),
    SMTP_FROM_ADDRESS: optionalEnvironmentValue(
      z.string().trim().toLowerCase().pipe(z.email().max(320)),
    ),
    SMTP_FROM_NAME: optionalEnvironmentValue(z.string().trim().min(1).max(120)),
    STORAGE_PROVIDER: optionalEnvironmentValue(z.enum(['local', 's3'])),
    STORAGE_LOCAL_ROOT: z.string().trim().min(1).default('.data/storage'),
    STORAGE_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(100 * 1_024 * 1_024)
      .default(25 * 1_024 * 1_024),
    STORAGE_UPLOAD_EXPIRY_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    STORAGE_PENDING_RETENTION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    STORAGE_MAINTENANCE_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(3_600_000),
    STORAGE_S3_REGION: optionalEnvironmentValue(z.string().trim().min(1).max(120)),
    STORAGE_S3_ENDPOINT: optionalEnvironmentValue(z.url().max(1_000)),
    STORAGE_S3_BUCKET: optionalEnvironmentValue(z.string().trim().min(1).max(255)),
    STORAGE_S3_ACCESS_KEY: optionalEnvironmentValue(z.string().min(1).max(1_000)),
    STORAGE_S3_SECRET_KEY: optionalEnvironmentValue(z.string().min(1).max(2_000)),
    STORAGE_S3_FORCE_PATH_STYLE: optionalEnvironmentValue(
      z.enum(['true', 'false']).transform((value) => value === 'true'),
    ),
    PAYMENTS_MOCK_APP_ID: optionalEnvironmentValue(z.string().trim().min(1).max(200)),
    PAYMENTS_MOCK_MERCHANT_ID: optionalEnvironmentValue(z.string().trim().min(1).max(200)),
    PAYMENTS_MOCK_SIGNING_SECRET: optionalEnvironmentValue(z.string().min(32).max(500)),
    WECHAT_MINI_PROGRAM_ENABLED: optionalEnvironmentValue(
      z.enum(['true', 'false']).transform((value) => value === 'true'),
    ),
    WECHAT_MINI_PROGRAM_APP_ID: optionalEnvironmentValue(
      z
        .string()
        .trim()
        .regex(/^wx[0-9a-fA-F]{16}$/),
    ),
    WECHAT_MINI_PROGRAM_APP_SECRET: optionalEnvironmentValue(z.string().trim().min(16).max(200)),
    WECHAT_MINI_PROGRAM_STATE: optionalEnvironmentValue(z.enum(['developer', 'trial', 'formal'])),
    WECHAT_MINI_PROGRAM_SESSION_REMINDER_TEMPLATE_ID: optionalEnvironmentValue(
      z.string().trim().min(1).max(200),
    ),
    WECHAT_MINI_PROGRAM_LESSON_CONSUMPTION_TEMPLATE_ID: optionalEnvironmentValue(
      z.string().trim().min(1).max(200),
    ),
    WECHAT_PAY_ENABLED: optionalEnvironmentValue(
      z.enum(['true', 'false']).transform((value) => value === 'true'),
    ),
    WECHAT_PAY_APP_ID: optionalEnvironmentValue(
      z
        .string()
        .trim()
        .regex(/^wx[0-9a-fA-F]{16}$/),
    ),
    WECHAT_PAY_MERCHANT_ID: optionalEnvironmentValue(
      z
        .string()
        .trim()
        .regex(/^\d{6,32}$/),
    ),
    WECHAT_PAY_MERCHANT_SERIAL_NUMBER: optionalEnvironmentValue(z.string().trim().min(8).max(128)),
    WECHAT_PAY_MERCHANT_PRIVATE_KEY: optionalEnvironmentValue(
      z.string().trim().min(100).max(20_000),
    ),
    WECHAT_PAY_API_V3_KEY: optionalEnvironmentValue(z.string().length(32)),
    WECHAT_PAY_PUBLIC_KEY_ID: optionalEnvironmentValue(z.string().trim().min(8).max(128)),
    WECHAT_PAY_PUBLIC_KEY: optionalEnvironmentValue(z.string().trim().min(100).max(20_000)),
    WECHAT_PAY_NOTIFY_URL: optionalEnvironmentValue(
      z.url().refine((value) => value.startsWith('https://')),
    ),
    NOTION_CONTENT_SOURCE_ENABLED: optionalEnvironmentValue(
      z.enum(['true', 'false']).transform((value) => value === 'true'),
    ),
    NOTION_API_TOKEN: optionalEnvironmentValue(z.string().trim().min(10).max(1_000)),
    NOTION_API_VERSION: optionalEnvironmentValue(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    MAIL_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    MAIL_MAINTENANCE_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(3_600_000),
    BOOTSTRAP_OWNER_EMAIL: z
      .union([z.literal(''), z.string().trim().toLowerCase().pipe(z.email().max(320))])
      .optional()
      .transform((value) => value || undefined),
    BOOTSTRAP_OWNER_PASSWORD: z
      .union([z.literal(''), z.string().min(12).max(128)])
      .optional()
      .transform((value) => value || undefined),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.APP_PUBLIC_URL) {
      context.addIssue({
        code: 'custom',
        path: ['APP_PUBLIC_URL'],
        message: 'must be configured in production',
      });
    }
    if (value.NODE_ENV === 'production' && !value.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.AUTH_EXPOSE_TEST_TOKENS) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_EXPOSE_TEST_TOKENS'],
        message: 'must be false in production',
      });
    }
    if (value.AUTH_COOKIE_SAME_SITE === 'none' && !value.AUTH_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SAME_SITE'],
        message: 'none requires secure cookies',
      });
    }
    if (Boolean(value.BOOTSTRAP_OWNER_EMAIL) !== Boolean(value.BOOTSTRAP_OWNER_PASSWORD)) {
      context.addIssue({
        code: 'custom',
        path: ['BOOTSTRAP_OWNER_EMAIL'],
        message: 'email and password must be provided together',
      });
    }
    if (!value.SETTINGS_ENCRYPTION_KEYS[value.SETTINGS_ENCRYPTION_CURRENT_KEY_ID]) {
      context.addIssue({
        code: 'custom',
        path: ['SETTINGS_ENCRYPTION_CURRENT_KEY_ID'],
        message: '必须指向 SETTINGS_ENCRYPTION_KEYS 中存在的 Key ID',
      });
    }
    if (
      value.NODE_ENV === 'production' &&
      Object.values(value.SETTINGS_ENCRYPTION_KEYS).includes(DEVELOPMENT_SETTINGS_KEY)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SETTINGS_ENCRYPTION_KEYS'],
        message: '生产环境不能使用默认开发密钥',
      });
    }
  });

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function validateEnvironment(values: Record<string, unknown>): AppEnvironment {
  const result = environmentSchema.safeParse(values);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
