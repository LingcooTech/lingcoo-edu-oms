# 第一期账号、角色与教育权限迁移

本工具把旧 Edu 的账号身份、密码凭据、有效角色和可证明的教育数据范围迁入 Lingcoo Edu OMS。默认命令是只读 `plan`；目标写入在一个串行化事务内完成。

## 迁移规则

| 旧数据                                     | 目标                                                 | 规则                                                             |
| ------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `accounts`                                 | `identity_users`                                     | 保留 UUID、状态、强制改密和时间；邮箱小写，手机号规范为 `+86...` |
| `password_hash`                            | `identity_password_credentials`                      | 原样保留，不接触明文密码                                         |
| `admin`                                    | `access_user_roles.admin`                            | 绝不映射 `system.owner`                                          |
| `institution_admin` / `teacher` / `parent` | `access_user_roles` + `access_education_assignments` | 仅 active 且机构、教师/家长档案 UUID 完整时授权                  |
| suspended assignment                       | staging；完整范围以 `active=false` 保存              | 不写对应 runtime role，不产生权限                                |
| 微信身份                                   | `migration_phase1_identity.wechat_identities`        | 仅保留供核对，不是登录实现                                       |

`account_role_assignments` 存在时是权威角色集合，`accounts.role` 只是旧系统首选角色，不能补出 assignment 中不存在的权限。没有任何 assignment 时，仅 `admin` 可按旧兼容逻辑回退；其他角色因为缺少可证明的机构/档案范围，进入 staging 并标记 `incomplete`。决策记录在 account snapshot 的 `primary_role_disposition`、assignment 的 `disposition` 和 exceptions 表。

目标缺少实际需要的 `admin`、`institution_admin`、`teacher` 或 `parent` runtime role 时直接阻断；任何情况下都不会把 `admin` 或 `institution_admin` 提升为 `system.owner`。

## 密码兼容事实

旧系统生成 `scrypt:<32位十六进制盐>:<128位十六进制摘要>`。迁移工具只校验格式并逐字节复制。兼容验证由 target server 本地 adapter `apps/server/src/modules/identity/infrastructure/password.ts` 完成，不是 `@lingcoo-tech/security/password` 上游包直接兼容。首次登录成功后，identity service 再升级为当前 `scrypt:v1:...`。旧 session 和重置码不迁移。

## 安全与停止条件

以下情况在提交前停止：没有有效登录标识、规范化后重复、UUID/状态/时间/哈希异常、孤儿记录、目标标识或 UUID 被其他记录占用、目标内容或 staging digest/disposition 不一致、目标约束/runtime role 缺失、source 与 target 是同一数据库。

工具不会伪造邮箱、猜测机构、合并账号、覆盖冲突行或输出数据库 URL、邮箱、手机号、密码哈希及微信标识。导出使用 AES-256-GCM；v2 payload 内含 source 数据库指纹，离线 artifact 也能拒绝同库迁移。staging 含敏感身份数据，必须按生产数据保护。

缺 institution/profile UUID 会明确报告 `incomplete` 且不授权。`plan` 返回状态码 2。若仍需先迁身份和其他安全角色，除正常 apply 确认外还要显式传 `--allow-incomplete-roles`；提交后仍返回 2。微信记录只标记 `staged-not-integrated`，不声称微信登录完成。

## 操作

```sh
export MIGRATION_SOURCE_DATABASE_URL='postgresql://source-reader:...@source/edu'
export MIGRATION_TARGET_DATABASE_URL='postgresql://target-migrator:...@target/oms'

# 默认 dry-run，记录报告中的 targetFingerprint
node scripts/migration/identity-phase1.mjs --report /tmp/identity-plan.json

# 写入要求 command + --apply + target 指纹
node scripts/migration/identity-phase1.mjs apply \
  --apply \
  --confirm-target <targetFingerprint> \
  --report /tmp/identity-apply.json

# 仅在明确接受 incomplete staging 时增加：--allow-incomplete-roles
node scripts/migration/identity-phase1.mjs verify --report /tmp/identity-verify.json
```

也可先生成加密只读快照：

```sh
export MIGRATION_EXPORT_KEY='至少 16 个字符的独立密钥'
node scripts/migration/identity-phase1.mjs export --output /secure/identity-source.enc.json
export MIGRATION_SOURCE_EXPORT='/secure/identity-source.enc.json'
node scripts/migration/identity-phase1.mjs plan
```

报告权限为 `0600`。状态码：`0` 表示当前阶段验证通过，`2` 表示 blocker/incomplete，`1` 表示运行失败，`64` 表示参数错误。

## 测试

```sh
node --test scripts/migration/identity-phase1.test.mjs

MIGRATION_INTEGRATION_ADMIN_URL='postgresql://fixture-admin:...@127.0.0.1/postgres' \
  node --test scripts/migration/identity-phase1.integration.test.mjs
```

数据库 fixture 使用随机数据库名并在结束时清理，不读取旧 Edu 生产数据。它覆盖加密导出、dry-run 零写入、apply flag 与 target 指纹保护、artifact 同库拒绝、四类 runtime role、三类 scoped assignment、`system.owner` 零授权、重复 apply、verify 和目标冲突停止。

第一期完成不代表人员、教学、交易或微信登录完成。缺失的 guardian/teacher/institution 关系应在对应领域迁移时补齐并复核 staging；微信登录必须有独立 provider contract、安全策略和验收后才能启用。
