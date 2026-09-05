# Audit 模块

Audit 记录安全事件和有管理意义的业务变更。它不是 HTTP Access Log，也不自动保存请求 Body。调用模块必须
显式选择事件、资源和允许进入审计的变更摘要。

## 数据模型

`audit_events` 是追加式事实表，主要字段包括：

- `event_version`、`redaction_version`：事件契约和脱敏规则版本；
- `category`、`action`、`outcome`：事件分类、稳定动作名和结果；
- `actor_type`、`actor_id`、`actor_label`：执行者及当时的可读快照；
- `resource_type`、`resource_id`：被操作资源；
- `request_id`、`correlation_id`：单请求和跨流程关联；
- `ip_address`、`user_agent`：HTTP 安全上下文；
- `changes`：显式字段级变更摘要；
- `metadata`：不承载核心事实的补充信息。

Actor 和 Resource 不使用外键。账号或业务资源后续被删除时，历史事件仍保留其事实快照，不受实时状态
覆盖。

## 不可变性与事务

模块只暴露 `AuditWriter.record(event, executor?)`，没有更新或删除 Repository，也没有对应 HTTP API。
Migration 还创建 PostgreSQL Trigger，任何普通 `UPDATE` 或 `DELETE` 都会被数据库拒绝。

关键业务写入由调用方 Application Service 开启事务，再把同一个 `DatabaseExecutor` 传给业务 Repository
和 Audit Writer。例如：

```text
创建账号
  -> identity_users
  -> identity_password_credentials
  -> access_user_roles
  -> audit_events
  -> COMMIT
```

审计插入失败时，关键业务修改必须回滚。登录失败等没有业务写入的安全事件独立追加。数据库级归档或
保留期清理属于受控运维流程，需要数据库管理员在维护窗口显式处理，不通过应用 API 实现。

## 事件命名

动作使用 `<module>.<resource>.<past-tense-action>` 的稳定小写标识。当前内置事件包括：

- `identity.login.succeeded`、`identity.login.failed`、`identity.logout`；
- `identity.session.revoked`；
- `identity.password.changed`；
- `identity.password-reset.requested`、`identity.password-reset.completed`；
- `identity.email-verification.requested`、`identity.email-verification.completed`；
- `identity.bootstrap-account.created`、`access.owner.assigned`；
- `access.role.created`、`access.role.updated`、`access.role.permissions-replaced`、
  `access.role.deleted`；
- `access.account.created`、`access.account.updated`、`access.account.roles-replaced`。

纯查询、Session `lastSeenAt` 和健康检查不产生审计事件，避免把技术噪声混入业务审计。

## 脱敏规则

调用方应只提交明确允许的摘要，Audit 再执行防御性二次脱敏：

- Password、Token、Secret、Authorization、Cookie、Credential、Private/API Key、银行卡和 CVV 等键名
  统一替换为 `[REDACTED]`；
- `changes.field` 本身命中敏感名称时，before/after 均替换；
- 限制嵌套深度、数组长度、对象键数、字符串长度和序列化总大小；
- Date、BigInt、二进制、循环引用及不可序列化值转换为安全表示；
- 不保存完整请求 Body、Header、Cookie、密码哈希、Session/CSRF/Action Token 或 Provider 原始响应。

## HTTP API 与 Admin

所有接口都要求 `audit.read`：

| Method | Path                    | 说明                       |
| ------ | ----------------------- | -------------------------- |
| GET    | `/api/audit/events`     | 分页、组合筛选和全文搜索   |
| GET    | `/api/audit/events/:id` | 读取单个事件和完整变更摘要 |

列表按 `occurred_at DESC, id DESC` 稳定排序，支持账号、Actor 类型、分类、动作、资源、结果和时间区间筛选。
Admin 的“审计日志”页面提供相同筛选、分页和只读详情 Drawer。
