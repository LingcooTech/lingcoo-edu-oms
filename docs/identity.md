# Identity 模块

Identity 只负责“这个账号是谁、如何证明身份、当前登录是否有效”。教师、学员、员工、买家等
行业档案，以及角色、权限和组织关系不属于本模块。

## 数据模型

| 表                              | 所有事实                                             |
| ------------------------------- | ---------------------------------------------------- |
| `identity_users`                | 账号邮箱、显示名称、状态、邮箱验证时间               |
| `identity_password_credentials` | 版本化密码哈希与最后改密时间                         |
| `identity_sessions`             | Session/CSRF 摘要、设备信息、有效期、撤销时间        |
| `identity_action_tokens`        | 邮箱验证和密码重置的一次性令牌摘要、有效期与消费时间 |

密码使用 `@lingcoo-tech/security` 的版本化 scrypt 格式。原始 Session、CSRF、重置和验证令牌只在
签发时存在于内存及浏览器/投递适配器，PostgreSQL 只保存 SHA-256 摘要。

## HTTP API

| Method | Path                                   | 访问要求                       |
| ------ | -------------------------------------- | ------------------------------ |
| POST   | `/api/auth/login`                      | 公开、IP 限速                  |
| GET    | `/api/auth/me`                         | 有效 Session                   |
| POST   | `/api/auth/logout`                     | Session + `X-CSRF-Token`       |
| POST   | `/api/auth/password/change`            | Session + `X-CSRF-Token`       |
| POST   | `/api/auth/password-reset/request`     | 公开、通用响应、IP 限速        |
| POST   | `/api/auth/password-reset/confirm`     | 公开、一次性令牌、IP 限速      |
| POST   | `/api/auth/email-verification/request` | Session + CSRF、IP 限速        |
| POST   | `/api/auth/email-verification/confirm` | 公开、一次性令牌、IP 限速      |
| GET    | `/api/auth/sessions`                   | 有效 Session                   |
| POST   | `/api/auth/sessions/:id/revoke`        | Session + CSRF、仅限自己的会话 |

Admin/API 同站部署时保持 `AUTH_COOKIE_SAME_SITE=lax`。生产环境配置校验强制
`AUTH_COOKIE_SECURE=true`，并禁止 `AUTH_EXPOSE_TEST_TOKENS=true`。所有有 Cookie 环境权限的写请求
必须同时携带与 Session 绑定的 CSRF Cookie 和 `X-CSRF-Token` 请求头。

修改密码与密码重置在同一数据库事务中更新凭据并撤销该账号全部现有会话。密码找回对存在和不存在
的邮箱返回同一种响应，避免账号枚举。

## Bootstrap

Migration 后执行：

```bash
pnpm db:bootstrap
```

当 `BOOTSTRAP_OWNER_EMAIL` 和 `BOOTSTRAP_OWNER_PASSWORD` 同时配置时，命令创建或复用初始账号。
它可重复执行，且绝不覆盖已存在密码。Access Control 会在同一个 Bootstrap 流程中先幂等同步权限
目录和 Owner 系统角色，再为初始账号分配 Owner。未配置账号凭据时仍会同步权限目录和系统角色。

## 操作令牌投递边界

Identity 拥有令牌生成、摘要存储、过期、消费和失效规则，通过 `IdentityActionDelivery` Port 交付
明文令牌。当前默认适配器不做外部投递；开发/测试可启用 `AUTH_EXPOSE_TEST_TOKENS=true` 验收完整
令牌流程。Mail 阶段会在 Composition Root 替换该适配器，Identity 的表、服务和 API 无需修改。

生产环境在 Mail 模块接入前不应开放密码找回和邮箱验证入口。
