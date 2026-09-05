# Idempotency 模块

Idempotency 为应用层命令提供可复用的“同一请求最多只有一个有效执行者、完成后安全重放”能力。它不是
HTTP 中间件，也不替代订单、支付事件、库存流水、课时流水等业务事实表。

## 适用边界

适合接入创建订单、发放权益、提交支付、消费回调等可能因网络重试而重复到达的应用命令。调用方必须显式
定义：

- 稳定的 `operation`，例如 `orders.create`；
- 能隔离调用主体或业务边界的 `scope`，例如 `account:<id>`；
- 客户端生成并在同一逻辑请求的所有重试中复用的 `key`；
- 足以区分请求语义、但不包含无关易变字段的 `request` 快照；
- 用于验证首次执行结果和历史重放结果的 Zod Schema。

唯一身份是 `(scope, operation, SHA-256(key))`。相同身份和相同请求哈希会等待、重试或重放；相同身份
配合不同请求哈希会返回 `IDEMPOTENCY_KEY_CONFLICT`，绝不静默复用旧结果。

## 状态与租约

数据库只保存 `processing`、`succeeded`、`failed` 三种状态；Admin 中的 `stale` 是
`processing` 且租约已到期的实时诊断视图。

```text
新请求 -> processing -> succeeded -> 相同请求安全重放
                  \-> failed -----> 可重试失败再次领取租约
processing + 租约到期 -----------> 新执行者接管
failed + 永久错误/次数耗尽 ------> 相同错误安全重放
```

领取执行权使用短事务和行锁。每次领取生成新的随机 Owner Token；完成更新必须同时匹配记录、状态和 Token，
因此旧执行者在租约被接管后不能覆盖新执行者结果。接管会增加尝试次数和恢复次数，并留下安全的超时错误摘要。

默认租约 60 秒、记录保留 7 天、最多尝试 3 次、结果上限 256 KiB。可按操作配置，但租约必须在 1 秒至
15 分钟、保留期在 1 分钟至 30 天、尝试次数在 1 至 20、结果上限不超过 1 MiB。过期的完成记录可在
领取时或通过 `purgeExpired()` 分批清理；仍处于 `processing` 的记录不会被清理。

## 事务边界

首次执行时，传给回调的 `transaction` 是该次业务执行的唯一数据库事务。业务写入和成功结果快照在同一
事务提交；回调抛错、返回结果不符合 Schema、结果不能 JSON 序列化或超过上限时，所有业务写入一起回滚。

```ts
import { z } from 'zod';

const createOrder = {
  operation: 'orders.create',
  resultSchema: z.object({ orderId: z.uuid() }),
  maxAttempts: 3,
};

const executed = await idempotency.execute(
  createOrder,
  {
    scope: `account:${accountId}`,
    key: request.idempotencyKey,
    request: { accountId, lines: request.lines },
    actorId: session.userId,
  },
  async (transaction) => {
    const order = await orders.create(command, transaction);
    await audit.record(
      {
        action: 'orders.order.created',
        resourceType: 'orders.order',
        resourceId: order.id,
      },
      transaction,
    );
    return { orderId: order.id };
  },
);
```

回调内不得直接调用不支持幂等键和状态查询的外部 Provider。数据库事务无法回滚已经发出的邮件、支付请求或
HTTP 调用；这类操作应在同一事务写入业务事实或 Transactional Outbox，再由后续阶段的 Worker 投递。
如果 Provider 自身支持幂等，仍应使用稳定 Provider 幂等键，并把 Provider 结果写入对应业务事实表。

租约只用于崩溃后的安全接管，不会强行中止 JavaScript Promise。耗时操作必须选取覆盖正常执行时长的租约，
也不能把通用幂等记录误当作外部副作用的 exactly-once 保证。

## 失败分类

默认规则是 HTTP 429 和 5xx 可重试，其他 `ApiError` 视为永久失败，未知错误视为可重试。业务模块可通过
`classifyError` 返回稳定错误码、安全消息、HTTP 状态和 `retryable` 标志。诊断记录不保存堆栈、请求体、
Provider 原始响应或异常详情。

可重试失败在下一次相同请求到达时领取新租约；永久失败直接重放已保存的安全错误。达到尝试上限后返回
`IDEMPOTENCY_ATTEMPTS_EXHAUSTED` 和 `retryable: false`，同时保留最后安全错误码供诊断，不会再次执行
回调。

## 数据安全

- 原始幂等键不落库，只保存 SHA-256；长度至少为 8 时预览由前 4 个字符加短哈希组成，更短的 Key 使用
  固定 `short` 标记加短哈希，绝不完整保存短 Key。幂等键不应携带密码、Token 或个人信息；
- 原始请求体不落库，只保存确定性 JSON 的 SHA-256，当前哈希算法版本为 `v1`；
- 对象键排序，数组顺序保留；循环引用、非 JSON 对象、非有限数字和超过 1 MiB 的请求被拒绝；
- 结果快照只供服务端重放，Repository 的诊断投影和 HTTP Contract 都不包含快照、完整 Key Hash 或 Owner
  Token；
- 结果必须通过操作自己的 Zod Schema，并在 JSON 往返后再次校验；首次调用返回的就是可持久化形态，历史
  重放还会再次校验，防止 `Date`、`undefined` 等非稳定结果造成首次与重放语义不同；

哈希算法若要演进，必须新增版本并在读取路径兼容旧版本，不能直接改变 `v1` 的规范化规则。

## API、权限与 Admin

| Method | Path                           | 权限               |
| ------ | ------------------------------ | ------------------ |
| GET    | `/api/idempotency/records`     | `idempotency.read` |
| GET    | `/api/idempotency/records/:id` | `idempotency.read` |

查询支持状态、操作、Scope、时间范围、搜索和分页。Admin `/admin/idempotency` 只显示安全摘要、尝试/恢复
次数、租约和错误分类。模块不提供强制成功、手动重试、删除或结果查看 API；运行维护清理由受控 Worker 调用
`purgeExpired()`，而不是暴露给后台按钮。

Jobs 未来只能负责定期清理或观测，不改变本模块领取、事务、重放和 fencing 语义。

## 不应进入通用记录的事实

以下内容必须继续由业务模块拥有：

- 支付回调事件、支付单、退款单和 Provider 交易状态；
- 订单、库存流水和库存占用；
- 学员课时权益、课次名单快照、实际扣课记录和不可变课时流水；
- 邮件/通知投递记录、Webhook Inbox 和 Transactional Outbox 事件。

幂等记录回答“这条应用命令是否已经以相同输入执行过”，业务事实回答“业务世界实际发生了什么”。两者不能
合并成一张通用表。
