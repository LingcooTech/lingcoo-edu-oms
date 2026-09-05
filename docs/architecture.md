# 架构

## 定位

本项目是多应用 workspace 内的模块化单体。`apps/server` 是一个代码包、一个数据库边界和一套迁移，但提供 API 与 Worker 两个进程入口。Admin 和 Web 是独立构建的浏览器应用，生产镜像由 Fastify 统一提供静态文件。

```text
Admin ─┐
Web ───┼── HTTP ── Fastify API ── PostgreSQL
Client ┘                    │
                       Shared domain code
                            │
                         Worker
```

## Composition Root

`apps/server/src/app.ts` 组装 HTTP 基础设施，`apps/server/src/modules/index.ts` 负责业务模块注册。数据库和配置以依赖传入模块，不允许模块自行创建全局连接。

Fastify plugin 用于路由封装和 HTTP scope，不承担业务依赖发现。普通 class、factory 和明确构造参数是默认依赖注入方式。

## 模块结构

```text
modules/<name>/
├── api/                    # Fastify routes、协议映射
├── application/            # 用例、事务编排
├── domain/                 # 领域规则和类型
├── infrastructure/         # Repository、Schema、Adapter
├── plugin.ts               # 模块 HTTP 组合
└── public.ts               # 唯一跨模块入口
```

数据库 transaction executor 应由 Application Service 显式传递给需要参与同一事务的 Repository 或跨模块 Port。HTTP handler 不能承担多步数据一致性。

## Packages 边界

`packages/` 只用于当前应用内多个 surface 真正共享的稳定契约：

- `packages/contracts` 不依赖 Fastify、Drizzle、React 或 UI 框架；
- `packages/api-client` 不依赖 React Query、Ant Design 或路由；
- Admin 组件留在 `apps/admin`；
- Web 可以独立选择 UI 框架，但不能直接导入 Admin 应用代码。

数据库、Repository、完整服务端模块和单消费者工具不应移入 package。

## 运行时基础设施

- `/health/live` 只表示进程存活；
- `/health/ready` 验证数据库可用性；
- API 和 Worker 都处理 SIGINT/SIGTERM 并释放连接；
- OpenAPI 只在 `API_DOCS_ENABLED=true` 时提供 UI；
- 生产容器只包含 server production dependencies 和构建产物；
- Redis、队列、Storage 等只在真实需求出现时添加。
