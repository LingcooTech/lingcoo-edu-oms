# 开发指南

## 本地环境

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

`pnpm dev` 并行运行 Server、Admin 和 Web。Worker 使用 `pnpm dev:worker` 单独启动。

Admin 使用 Ant Design，公共 Web 保持独立入口，不自动依赖 Admin 组件或样式。具体项目可以为 Web 独立选择 Ant Design、Tailwind 或其他方案。

共享边界：

- `packages/contracts` 只包含无框架 Zod Contract；
- `packages/api-client` 只包含无 React、无 UI 依赖的 Fetch Client；
- React Query Hooks 和 Ant Design 组件留在 `apps/admin`。

## 数据库变更

模块拥有自己的 Drizzle schema，schema 文件必须位于模块的 `infrastructure/persistence`：

```bash
pnpm db:generate
pnpm db:migrate
```

Migration 是唯一生产数据库升级方式。业务应用不应在生产环境使用 `drizzle-kit push`。

## 新模块

```bash
pnpm generate:module example
```

生成后完成 route schema、用例、持久化、migration 和风险匹配的测试，再在 composition root 注册。运行：

```bash
pnpm check:boundaries
pnpm check
```

## 测试

Server 使用 Fastify `inject()` 进行无需监听端口的 HTTP 测试。Application Service 和 Domain 规则应优先编写独立测试；数据库一致性功能应使用真实 PostgreSQL 集成测试。

Admin 单元和交互测试：

```bash
pnpm --filter @lingcoo-edu-oms/admin test
```

桌面和移动端关键路径：

```bash
pnpm e2e
```

生产构建后的 Admin 静态文件和深层路由：

```bash
pnpm build
pnpm smoke:admin-static
```
