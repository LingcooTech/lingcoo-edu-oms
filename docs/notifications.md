# Notifications

Notifications 模块负责当前账号站内通知、精确未读状态、通用公告和可选邮件渠道编排。它提供稳定的
`NotificationPublisher` Port 给业务模块调用，但不包含教育、零售等行业收件人解析、业务模板或营销分群。

## 事实与状态边界

- `notifications` 是按账号生成的通知事实。标题、正文、来源、业务元数据和去重身份创建后不可修改；用户只能写入
  `read_at` 和 `archived_at`，公告撤回只能写入 `withdrawn_at`；
- 未读数不保存冗余计数器，始终由当前账号未读、未归档、未撤回的通知记录实时查询；
- `notification_announcements` 是公告主记录，采用 `draft → publishing → published → withdrawn` 状态机；
- `notification_announcement_targets` 是发布时的账号受众快照。后续账号新增、停用或资料变化不会改写已经完成的
  发布事实；
- 公告撤回保留通知和投递历史，只停止继续展开目标，并从用户列表和未读数中隐藏已经生成的站内通知。已经由外部
  Provider 接受的邮件无法撤回。

PostgreSQL Check、Unique Index 和 Trigger 共同保护状态转换、内容不可变性、目标投递状态和计数约束。应用层乐观锁
使用公告 `revision`，并发编辑、发布或撤回返回明确冲突，不做静默覆盖。

## 发布与幂等

业务模块应在自己的业务事务中调用：

```ts
await notifications.publish(
  {
    recipientUserId,
    category: 'orders.payment-succeeded',
    level: 'success',
    title: '支付成功',
    body: '订单已支付。',
    sourceType: 'order',
    sourceId: orderId,
    deduplicationKey: `order:${orderId}:payment-succeeded`,
    channels: ['in_app', 'email'],
  },
  transaction,
);
```

调用方必须提供事务和稳定业务去重键。模块只保存 SHA-256 摘要；相同键与相同内容返回既有通知，不重复创建；相同键
对应不同内容返回冲突。站内通知、可选 Mail Delivery 和 Mail Job 在同一事务提交或一起回滚。

`in_app` 是强制事实渠道。默认偏好解析器只允许活跃账号进入邮件渠道，站内通知不会因邮件被禁用或失败而消失。
具体应用可以在 Composition Root 注入 `NotificationPreferenceResolver`，但不得用偏好覆盖历史通知事实。

## 公告工作流

Admin 支持两类通用受众：

- 全部活跃后台账号；
- 最多 500 个指定账号 UUID。

草稿可编辑内容、受众和渠道。发布操作在事务内校验并固化受众快照，同时创建
`notifications.publish-announcement` Job；Worker 以 100 个目标为一批，锁定目标并调用统一 Publisher。目标、通知、
可选 Mail Delivery 和发布进度在同一数据库事务提交。重复 Worker、Job 重试或并发处理不会生成重复通知。

通用 Starter 对“全部活跃账号”设置 10,000 人硬上限，防止无界广播占用单体 Worker。地区、班级、客户标签、订单状态
等行业分群必须由实际应用先解析为明确账号集合，或实现专用分群发布器；不得把行业表耦合进本模块。

## 邮件失败边界

公告邮件复用 Mail 模块注册的 `notifications.generic` 模板和 Jobs 重试机制。通知事实创建成功后，SMTP/Capture
发送在独立 Worker 中进行：

- 邮件失败不会回滚、删除或改写站内通知；
- Mail Delivery 状态、错误分类和重试由 Mail/Jobs 所有；
- Notifications API 不返回 Mail Delivery ID、去重摘要、完整邮箱、正文快照或 Provider 响应；
- SMTP 仍是 at-least-once，不能宣称外部发送 exactly-once。

## API、Admin 与权限

登录账号无需额外业务权限即可访问自己的：

- `GET /api/notifications`；
- `GET /api/notifications/unread-count`；
- 标记单条/全部已读和归档操作。

所有单条状态变更都带 `recipient_user_id` 所有权条件，不能读取或修改其他账号通知。

- `notifications.read`：查看公告列表和受众详情；
- `notifications.manage`：创建、编辑、发布和撤回公告。

Admin `/notifications` 提供 Header 未读 Badge、当前账号通知列表、筛选、已读/归档，以及权限感知的公告管理和异步
发布进度。外部 CTA 只接受 `https/mailto/tel`，新窗口链接带 `noreferrer`；应用内 CTA 必须是非协议相对根路径。

## 运维与扩展

API 与 Worker 必须注册同一 Notifications/Mail/Jobs Composition Root。公告发布依赖独立 Worker；Worker 未运行时
公告保持 `publishing`，恢复 Worker 后由租约和重试继续处理。

实际应用通常只需要扩展三处：

1. 在业务模块中实现收件账号解析并调用 `NotificationPublisher`；
2. 注入通知偏好解析器；
3. 向 Mail Registry 注册行业模板，或在业务模块内定义专用邮件编排。

不要在通用模块中增加学员、家长、会员、合作方、班级、订单或店铺外键；这些身份到后台账号/业务联系人之间的映射
属于具体应用领域。
