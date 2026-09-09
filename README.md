# Lingcoo Edu OMS

Lingcoo 教育运营管理系统的新架构仓库。项目基于原生 Fastify、TypeScript、PostgreSQL、Drizzle、React 和 pnpm workspace，从旧 Edu 系统按业务域渐进迁移。

当前已完成前三阶段工程实现：Identity 与 Access Control、组织／机构／学员／家长／教师底座，以及机构通用课时包、学员机构课时账户、发放批次和不可变流水。课程、班级、独立课次、签到消课、周期卡和旧生产数据尚未迁移；订单、支付、退款金额及分成结算不属于本 OMS 的迁移范围。

## 技术结构

```text
lingcoo-edu-oms/
├── apps/
│   ├── server/       # 原生 Fastify API、Worker、Migration
│   ├── admin/        # React + Vite + Ant Design 管理端
│   └── web/          # 独立公共 Web 入口
├── packages/
│   ├── contracts/    # Server 与浏览器共享的 Zod Contract
│   └── api-client/   # 无 React 和 UI 依赖的 Fetch Client
├── scripts/          # 质量、边界、生成和 smoke 验证
│   └── migration/    # 旧 Edu 数据迁移预检、执行与验证工具
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
pnpm test:migration
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

## 本地阶段验收

预览环境使用独立的 `lingcoo-edu-oms-preview` PostgreSQL 容器和 55439 端口，不连接旧 Edu 数据库：

```bash
docker compose -f docker-compose.preview.yml up -d --wait
pnpm preview:migrate
pnpm preview:bootstrap
pnpm preview:api
pnpm preview:admin  # 另一个终端
pnpm preview:web    # 另一个终端
pnpm test:preview
```

- Web：<http://localhost:15174>
- Admin：<http://localhost:15173/admin/>
- API：<http://localhost:18090>

本地预览账号只用于开发验收，定义在被 Git 忽略的 `.env.preview`。迁移工具默认只生成匿名统计计划；生产应用必须再次提供写入开关和目标数据库指纹。

阶段实施结果与截图：

- [P1 身份与权限](docs/acceptance/phase-one-report.md)
- [P2 组织、机构与人员](docs/acceptance/phase-two-report.md)
- [P3 课时包、发放与账本](docs/acceptance/phase-three-report.md)

完整路线见[分阶段迁移实施方案](docs/migration/full-migration-plan.md)，P3 生产演练见[课时迁移运行手册](docs/migration/phase3-lessons.md)。

## 实施边界

Starter 提供的 Identity、Access Control、Audit、Settings、Idempotency、Jobs、Outbox、Mail、Notifications、Storage 和 Branding 继续作为统一底座。教育领域必须通过模块公开端口和强制数据范围接入，不能跨模块访问 Repository；P3 的每次课时变动在同一事务中保存账本、审计和 Outbox 事实。

## 许可证

Apache License 2.0。
