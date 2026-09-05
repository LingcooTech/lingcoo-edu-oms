# Jobs

Jobs 是应用内部的 PostgreSQL 异步任务队列，提供事务入队、延迟执行、受限重试、租约恢复、轻量周期任务和
安全管理诊断。它不承担同步 HTTP 幂等，也不替代下一阶段的 Transactional Outbox。

## 一致性语义

- 投递语义是 **at-least-once**。Handler 必须以业务唯一键、状态机或外部 Provider 幂等键保证业务幂等；
- `enqueue(input, transaction)` 可加入调用方业务事务，业务写入回滚时 Job 同步回滚；
- Worker 使用 `FOR UPDATE SKIP LOCKED` 并发 claim，按优先级、计划时间和创建时间排序；
- 每次 claim 生成新的随机 `claimToken`。heartbeat、成功、失败和取消写回都受 Token fencing；
- heartbeat 延长租约。租约过期的运行任务会记录 `timed_out` Attempt，再重新排队或进入死信；
- 可重试失败使用带 jitter 的指数退避；永久失败或耗尽尝试预算后进入 `dead`；
- 手动重试只允许 `dead/cancelled`，保留历史并增加一次最大尝试预算；手动取消只允许
  `queued/running`；两者与 Audit 事件共享事务；
- 成功、死信、取消记录按受控保留期清理，活跃任务不会被批量清理。

## Job、Attempt 与隐私边界

`jobs` 保存当前调度状态和经过 Schema 校验、确定性 JSON 化后的 Worker Payload；`job_attempts` 保存每次
领取的不可覆盖执行历史。原始去重键不落库，只保存 SHA-256 和不可逆短预览。

Admin/API 不返回以下内部字段：

- Payload 正文；
- 原始去重键或完整去重 Hash；
- Worker ID；
- Claim Token；
- Error Stack 或未分类异常内容。

诊断面只返回 Payload Hash、版本、大小、安全错误摘要和 Attempt 历史。权限为 `jobs.read`；取消和手动重试
另需 `jobs.manage`。

## 注册 Handler

Handler 通过 `JobHandlerRegistry` 显式注册。每个定义至少包含命名空间类型、Zod Payload Schema 和 Handler；
也可指定队列、Payload 版本、最大尝试次数、租约、超时、退避参数和安全错误分类器。

```ts
const handler = {
  type: 'notifications.email-send',
  payloadSchema: z.object({ deliveryId: z.uuid() }),
  maxAttempts: 5,
  async handler(payload, { signal }) {
    await sendDelivery(payload.deliveryId, { signal });
  },
};
```

具体 Handler 和周期任务统一加入 `apps/server/src/job-definitions.ts`；API 与 Worker 都从这里取得定义，避免
只在一侧注册。长耗时 Handler 必须监听 `AbortSignal`；超时、Worker 关闭、heartbeat 失败或所有权丢失时应
尽快停止副作用。

固定间隔周期任务使用时间桶生成去重键，多个 Worker 同时调度也只会创建一条记录。它适用于清理和观测等
轻量任务，不是完整 Cron 表达式调度器。

## Worker 与部署

开发环境单独运行：

```bash
pnpm dev:worker
```

生产环境使用相同镜像、独立进程：

```bash
node apps/server/dist/entrypoints/worker.js
```

可配置项：

- `JOBS_POLL_INTERVAL_MS`：空闲轮询间隔；
- `JOBS_CONCURRENCY`：单 Worker 并发；
- `JOBS_HEARTBEAT_INTERVAL_MS`：heartbeat 上限，实际值不超过租约的三分之一；
- `JOBS_SHUTDOWN_GRACE_MS`：优雅关闭等待时间；
- `JOBS_STALE_RECOVERY_BATCH`：单轮租约恢复上限；
- `JOBS_RETENTION_DAYS`：终态记录保留天数；
- `JOBS_MAINTENANCE_INTERVAL_MS`：清理维护间隔；
- `JOBS_WORKER_ID`：仅用于明确的实例标识；默认自动生成且更适合横向扩容。

停止 Worker 后，未完成任务最终由租约恢复；因此发布时应保留合理的 termination grace period。数据库连接失败
导致 heartbeat 不确定时，Runner 会中止 Handler，且不会用旧 Token 写回完成状态。

## 与其他基础模块的边界

- **Idempotency**：同步命令去重和结果重放；
- **Jobs**：应用内部延迟异步命令；
- **Transactional Outbox**：业务事务产生的不可变事件和可靠发布。

三者不能共用一张表或一套状态。Jobs Handler 即使由 Outbox 触发，也仍需接受重复执行。
