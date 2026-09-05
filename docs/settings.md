# Settings 模块

Settings 管理当前单体部署的应用级运行参数。它不包含 SaaS 租户配置、行业配置或 Provider 自身的业务
模型；Mail、Storage、Payments 等后续模块通过注册表扩展自己的设置定义和连接测试器。

## 解析模型

每个设置必须先在 `SettingsRegistry` 中以代码注册。运行时按以下固定顺序解析：

```text
环境变量 > system_settings 数据库记录 > 代码默认值 > 未配置
```

环境变量来源不可通过 Admin 修改或清除。数据库值使用显式版本号做乐观并发控制：首次写入必须提交
`expectedVersion: null`，后续保存和清除必须提交当前正整数版本；版本不一致返回
`SETTING_VERSION_CONFLICT`。

设置按可见性分为三类：

| 类型       | 服务端运行时 | 受权 Admin   | 公共 Settings API  |
| ---------- | ------------ | ------------ | ------------------ |
| `public`   | 可读取       | 可查看管理   | 可按注册项公开     |
| `internal` | 可读取       | 可查看管理   | 不公开             |
| `secret`   | 可解密读取   | 仅状态元数据 | 不公开且不返回明文 |

`SettingsReader` 是仅供 Composition Root 显式注入 Provider Adapter 的服务端能力，其中
`getValue()` 会按需解密 Secret；不得把 Reader、返回值或测试 Map 传给 HTTP、日志和审计元数据。

核心注册项只包含当前真实使用的应用设置：`application.name`、`application.support-email`、
`application.locale` 和 `application.timezone`。Starter 不提前注册 SMTP、对象存储或支付参数。
Secret 不允许在代码中声明默认明文；Select 的每个选项也必须通过对应设置 Schema。

其中 `application.name` 是运行时服务标识和系统通知名称；Admin 界面名称、Logo、Favicon、主题色与登录文案由
Application Branding 聚合统一管理，避免把带 Asset Reference 的多字段业务配置拆成独立 Settings Key。

## 数据与加密

`system_settings` 每个 Key 只保存一种载荷：普通设置写入 `value_json`；Secret 写入 AES-256-GCM 加密
信封和 `encryption_key_id`。Check Constraint 保证两种载荷互斥、密文与 Key ID 同时存在且版本为正数。

密钥只来自部署环境：

```dotenv
SETTINGS_ENCRYPTION_CURRENT_KEY_ID=production-v1
SETTINGS_ENCRYPTION_KEYS={"production-v1":"replace-with-at-least-32-secret-characters"}
```

- 生产环境拒绝默认开发密钥；
- Keyring 必须保留仍被数据引用的旧密钥；
- `POST /api/settings/actions/rotate-secrets` 在单个事务中锁定旧密钥记录、解密并使用当前密钥重新加密；
- 确认所有记录完成轮换且旧版本不再运行后，才能从 Keyring 删除旧密钥；
- Secret 的 API View、审计变更和日志均不得包含明文。

## 模块扩展

业务模块在自己的 Domain 中声明设置定义，并由 Composition Root 注入 Settings，不反向修改 Settings
核心模块。例如：

```ts
const definitions: SettingDefinition[] = [
  {
    key: 'mail.smtp-host',
    group: 'mail',
    groupLabel: '邮件服务',
    label: 'SMTP Host',
    description: '邮件服务地址。',
    kind: 'internal',
    schema: z.string().min(1),
    control: 'text',
  },
];
```

需要同时读取多个设置的 Provider 通过组合连接测试端口接入。测试器必须响应 `AbortSignal`，Settings
会在 100–30000ms 的注册超时范围内主动取消调用；Fastify 请求断开也会沿同一 `AbortSignal` 传播。
Settings 会对测试器结果再次执行 Contract 校验，异常原文和 Secret 不会返回 Admin。

## HTTP API

| Method | Path                                   | 权限              |
| ------ | -------------------------------------- | ----------------- |
| GET    | `/api/settings/public`                 | 显式公开          |
| GET    | `/api/settings`                        | `settings.read`   |
| PUT    | `/api/settings/:key`                   | `settings.manage` |
| DELETE | `/api/settings/:key`                   | `settings.manage` |
| POST   | `/api/settings/tests/:key`             | `settings.manage` |
| POST   | `/api/settings/actions/rotate-secrets` | `settings.manage` |

所有受保护写请求还需要 Session CSRF Token。设置保存、清除和 Secret 轮换与对应 Audit 事件共享数据库事务；
连接测试作为无业务写入的独立审计事件追加。

稳定审计动作包括：

- `settings.setting.updated`；
- `settings.setting.cleared`；
- `settings.connection-tested`；
- `settings.secrets.rotated`。

## Admin 行为

`/admin/settings` 按注册分组呈现设置，并明确显示环境变量、管理后台、系统默认或未配置来源。环境变量
项只读；数据库项可恢复默认来源；Secret 仅显示是否配置、来源和版本，编辑框永远不回填明文。页面、
导航和操作按钮按 `settings.read` / `settings.manage` 控制，后端权限门禁仍是最终安全边界。
