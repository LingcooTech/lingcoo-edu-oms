# Lingcoo Edu Oms

一个基于原生 Fastify、TypeScript、PostgreSQL、Drizzle、React 和 pnpm workspace 的通用业务应用起步工程。

它保持模块化单体和独立前端入口，在 Base Starter 的工程底座上逐模块增加经过真实项目验证的后台通用能力，不包含教育、零售或平台行业模型。

## 技术结构

```text
lingcoo-edu-oms/
├── apps/
│   ├── server/       # 原生 Fastify API、Worker、Migration
│   ├── admin/        # React + Vite + Ant Design 管理端
│   └── web/          # 独立公共 Web 入口，本轮保持空白
├── packages/
│   ├── contracts/    # Server 与浏览器共享的 Zod Contract
│   └── api-client/   # 无 React 和 UI 依赖的 Fetch Client
├── scripts/          # 质量、边界、生成和 smoke 验证
├── docker/           # Caddy 配置
├── deploy/           # 生产部署脚本与环境模板
└── .github/          # CI、Docker、安全与部署工作流
```

后端是模块化单体。API 与 Worker 使用同一个 `apps/server` 包和领域代码，但作为独立进程运行。workspace 不代表微服务。

## 快速开始

要求 Node.js 24、Corepack、pnpm 11 和 Docker。

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:bootstrap
pnpm dev
```

默认地址：

- Web：<http://localhost:5174>
- Admin：<http://localhost:5173/admin/>
- API liveness：<http://localhost:8090/health/live>
- API readiness：<http://localhost:8090/health/ready>
- OpenAPI UI：<http://localhost:8090/api/docs>

Worker 按需单独启动：

```bash
pnpm dev:worker
```

## 开发业务模块

```bash
pnpm generate:module catalog
```

生成的模块按 `api / application / domain / infrastructure` 分层。完成实现后，在 `apps/server/src/modules/index.ts` 的 composition root 显式注册。

模块规则：

- Route 只处理 HTTP、校验和响应映射；
- Application Service 编排用例和事务；
- Domain 不依赖 Fastify 和 Drizzle；
- Repository、Schema 和 Provider Adapter 属于 Infrastructure；
- 跨模块只能导入对方的 `public.ts`；
- 不使用全局数据库单例或隐式 Service Locator。

## 工程检查

```bash
pnpm check
pnpm smoke:module-generator
pnpm smoke:admin-static
pnpm smoke:docker
pnpm e2e
```

`pnpm check` 包括工具链、starter 版本、模块边界、格式、Lint、类型、测试和 production build。

详细说明：

- [架构](docs/architecture.md)
- [开发](docs/development.md)
- [部署](docs/deployment.md)
- [质量标准](docs/quality-bar.md)
- [Identity](docs/identity.md)
- [Access Control](docs/access-control.md)
- [Audit](docs/audit.md)
- [Settings](docs/settings.md)
- [Idempotency](docs/idempotency.md)
- [Jobs](docs/jobs.md)
- [Transactional Outbox](docs/outbox.md)
- [Mail](docs/mail.md)
- [Notifications](docs/notifications.md)
- [Storage 与 Asset Management](docs/storage.md)
- [Application Branding](docs/branding.md)
- [Payments](docs/payments.md)
- [Webhook Inbox 架构决策](docs/webhook-inbox-decision.md)
- [CLI 与产品化](docs/productization.md)

## 实施边界

通用模块按照 Identity、Access Control、Audit、Settings、Idempotency、Jobs、Outbox、Mail、Notifications、Storage、Branding、Payments 的顺序逐个闭环实施；Webhook Inbox 已完成架构决策，当前不作为默认模块。

当前明确不包含 SaaS 多租户、CMS、Entitlement、AI Gateway，以及教育、零售或 Core Stack 的行业领域模型。

## 许可证

Apache License 2.0。
