# Mail

Mail 模块负责代码注册模板、受控后台覆盖、加密投递快照、SMTP/Capture Provider 和 Jobs 重试。它不负责站内
通知、公告、用户偏好或业务通知意图；这些由 Notifications 或具体业务模块持有，邮件渠道只通过 `MailQueue` 接入。

## 可靠性边界

- `MailQueue.queue(input, transaction)` 强制接受调用方事务；业务事实、Identity Action Token、Delivery 和 Job
  可以原子提交或一起回滚；
- 请求线程只创建投递事实和 Job，SMTP 网络调用只在独立 Worker 中发生；
- Delivery 使用 SHA-256 业务去重身份，Job 使用由 Delivery ID 派生的稳定去重键；同一键对应不同收件人、模板
  或内容时返回冲突；
- Delivery 的模板版本、收件人 Hash/脱敏预览、内容 Hash、去重 Hash、加密正文和创建时间由 PostgreSQL Trigger
  保护，不允许事后改写；
- Jobs 是重试、Attempt、租约和 Dead Letter 的唯一所有者。Delivery 只保存业务投递状态
  `queued/sending/sent/exhausted` 与最后一次安全结果；
- SMTP 是 **at-least-once**。Provider 已接受邮件但 Worker 在写回 `sent` 前失败时可能重发。稳定 Message-ID 使用
  Delivery ID，仍不能宣称跨 SMTP Provider exactly-once。

Identity 通过 `IdentityActionDelivery` Port 接入 Mail。原始 Action Token 只在事务内参与生成加密投递快照；
Token 摘要仍由 Identity 保存，Job Payload 只有 `deliveryId`。

## 模板边界

模板 Key、变量 Schema、默认主题和默认正文由代码 Registry 注册。Admin 只能覆盖已注册模板，不能创建任意 Key。
覆盖使用 Revision 乐观锁；恢复默认会删除覆盖记录，但不会改变历史 Delivery 的模板版本和内容事实。

模板仅支持 `{{variableName}}`：

- Zod 校验变量对象；
- 拒绝未知变量、缺失变量、三花括号、Section、Helper 和表达式；
- 主题移除换行；
- HTML 由渲染后的纯文本统一转义生成，不允许 Admin 保存任意 HTML、脚本或远程资源。

当前代码模板包括密码重置、邮箱验证、系统测试邮件和 Notifications 通用通知。具体行业模块应注册自己的模板定义，不应把教育、零售等
文案加入通用 Starter。

## 数据与 Secret

`mail_deliveries` 不保存完整收件地址和明文正文：

- 收件地址仅保存不可逆 Hash 与脱敏预览；
- `to/subject/text/html` 作为一个 Envelope，使用 Settings 同一 AES 密钥环加密；
- Admin/API 永不返回加密 Envelope、完整收件人、正文、Token、SMTP 密码、Provider 原始响应或异常堆栈；
- Last Error 只保存分类后的错误码、通用消息、HTTP 语义状态和可重试标记；
- Audit 只记录模板 Key、脱敏收件人、Revision 和内容 Hash，不记录模板实际变量或正文。

密钥轮换时，旧密钥至少保留到对应 Delivery 被清理。周期任务只清理超过 `MAIL_RETENTION_DAYS` 的 `sent` 和
`exhausted` 记录；排队中和发送中的记录不会被清理。

## Settings 与 Provider

Admin 的“系统设置”统一管理：

- `mail.transport`：`capture` 或 `smtp`；
- `mail.smtp-host`、`mail.smtp-port`、`mail.smtp-secure`；
- `mail.smtp-user`、`mail.smtp-password`；
- `mail.from-address`、`mail.from-name`。

`mail.smtp-password` 是 Secret Setting，浏览器只获得“是否已配置”。环境变量优先于数据库设置，受环境覆盖的字段
在 Admin 中只读。SMTP Connection Test 只执行连接与认证验证，不发送邮件，并对超时、取消和错误输出做限制。

Capture 是默认开发适配器：它把 Delivery 标记为模拟成功，只记录 Delivery ID 和 Transport，不输出收件地址、
正文或 Token。生产环境要真实发送时，应显式配置 `MAIL_TRANSPORT=smtp` 和完整 SMTP 设置。

## Admin 与权限

- `mail.read`：模板列表、投递列表和安全详情；
- `mail.manage`：模板覆盖/恢复和发送测试邮件；
- SMTP 配置继续使用 `settings.read/settings.manage`。

Mail 页面包括 Deliveries、Delivery Detail、Templates 和 Test Mail，并链接到系统设置。测试邮件同样只是入队，
由 Worker 执行。

## Worker 与运维

API 和 Worker 通过 Composition Root 注册同一组定义：

- `mail.send`：队列 `mail`，最多 5 次，使用有界退避；
- `mail.cleanup`：队列 `maintenance`，只清理终态历史；
- `MAIL_RETENTION_DAYS`：终态 Delivery 保留天数，默认 30；
- `MAIL_MAINTENANCE_INTERVAL_MS`：清理任务调度间隔，默认 1 小时。

必须同时运行 API 和 `pnpm dev:worker`（生产为独立 Worker 容器），否则邮件会保持排队状态。
