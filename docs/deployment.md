# 部署指南

生产环境只运行 CI 构建的镜像，不在服务器安装依赖或编译源码。

```text
Git push
  → CI check/test/build
  → Docker image
  → Registry
  → migrate → bootstrap
  → API + Worker + Caddy
  → readiness check
```

## 本地生产验证

```bash
pnpm smoke:docker
```

该命令构建生产镜像、启动 PostgreSQL、运行 migration 和幂等 bootstrap、启动 API/Worker/Caddy、检查 readiness，并在结束后清理临时容器和卷。

## 生产配置

复制 `deploy/production.env.example`，至少设置数据库密码、CORS origin、`APP_PUBLIC_URL`、镜像和监听端口。
`APP_PUBLIC_URL` 用于生成密码重置与邮箱验证链接，生产环境不可省略。生产默认关闭 API docs，并通过 Caddy
终止 HTTP/HTTPS。

Mail 默认使用 `capture`，不会向外发送。启用真实邮件前，把 `MAIL_TRANSPORT` 改为 `smtp`，并配置 SMTP
Host、Port、TLS、凭据和 From；SMTP 密码也可以在部署后通过 Admin 的 Secret Setting 加密保存。

Notifications 的站内通知查询由 API 提供；公告受众展开和可选邮件发送由 Worker 执行。生产环境必须持续运行 Worker，
否则公告会停留在 `publishing`、邮件会停留在排队状态，但已经提交的站内通知事实不会丢失。

Storage 默认使用 Local Provider，API 与 Worker 必须共享 `/app/data/storage` 可写卷；Compose 已在只读根文件系统之外单独挂载该卷。
多实例部署应改用 S3-compatible Provider，保持 Bucket 私有，并配置 Region、Bucket、可选 Endpoint 和凭据。删除旧版本与清理过期上传依赖 Worker。

Dockerfile 默认使用官方 `node:24-alpine`、`docker-compose.prod.yml` 默认使用官方 PostgreSQL 和 Caddy
镜像。网络受限或国内部署时，可在构建和 Compose 环境中覆盖 `NODE_IMAGE`、`POSTGRES_IMAGE`、`CADDY_IMAGE`
为可访问的镜像缓存或企业镜像仓库；不要修改业务代码或把单一地区镜像写死在 Starter 中。例如本地 Docker
Smoke 可运行：

```bash
NODE_IMAGE=mirror.gcr.io/library/node:24-alpine \
POSTGRES_IMAGE=postgres:17-alpine \
CADDY_IMAGE=mirror.gcr.io/library/caddy:2-alpine \
pnpm smoke:docker
```

容器基线：

- non-root user；
- read-only filesystem；
- no-new-privileges；
- drop all capabilities；
- API readiness healthcheck；
- server production dependencies only。

Migration 必须在新版本 API 启动前完成。数据库变更应保持向前兼容，使旧实例和新实例可在滚动窗口内短暂并存。

首次部署必须配置随机的 `BOOTSTRAP_OWNER_PASSWORD`。Bootstrap 不会覆盖已存在账号的密码；
Identity 阶段只创建账号，Access Control 阶段完成后同一个命令还会幂等分配系统 Owner 角色。

## 版本升级

生产部署必须使用不可变 Git SHA 镜像标签，不能依赖 `latest` 作为唯一回滚依据。

升级前：

1. 阅读 Changelog、Migration 和环境变量差异，确认旧 API/Worker 能在新 Schema 上短暂运行；
2. 备份数据库并在隔离环境验证恢复，记录当前镜像 SHA、Compose 文件和环境配置版本；
3. 在预发布环境执行 Migration 两次、Bootstrap 两次、完整 Docker Smoke 和关键业务验收；
4. 确认 Jobs/Outbox 没有无法解释的持续积压或死信。

升级顺序固定为 PostgreSQL Ready → Migration → Bootstrap → API/Worker → Readiness → Caddy。Migration
必须采用 expand/contract：先增加兼容结构，等所有旧实例退出且数据回填完成后，后续版本才能删除旧结构。

CLI 生成的项目不会自动接收模板升级。项目升级必须生成目标版本的临时基线并做显式 Git Diff，逐模块合并；不得把 CLI 指向已有非空项目覆盖业务代码。

## 应用回滚

普通回滚只切换到上一个已验证的不可变镜像，不自动执行 Down Migration：

1. 停止新版本 Worker，避免继续产生只有新版本理解的副作用；
2. 确认当前数据库结构仍与旧版本兼容；
3. 将 `APP_IMAGE` 和 `APP_VERSION` 切回记录的旧 SHA；
4. 启动旧 API/Worker，检查 readiness、Worker 轮询、Jobs/Outbox 和关键页面；
5. 保留新 Migration，并为不兼容问题发布向前修复 Migration。

如果 Migration 已破坏旧版本兼容性，不得直接启动旧镜像。先停止写流量与 Worker，在隔离环境验证备份恢复，再按事故流程恢复数据库和匹配镜像。数据库恢复会丢失备份时间点之后的数据，只能作为经过负责人确认的灾难恢复操作。

## 凭据轮换

所有轮换都遵循“新增 → 双凭据窗口 → 验证 → 撤销旧凭据”，不得先删除仍被运行实例或密文引用的旧值。

Settings 加密密钥：

1. 在 `SETTINGS_ENCRYPTION_KEYS` 加入新 Key ID 和随机密钥，同时保留旧密钥；
2. 把 `SETTINGS_ENCRYPTION_CURRENT_KEY_ID` 切到新 ID 并完成所有 API/Worker 实例部署；
3. 通过受权 Admin 执行 Secret Rotation；
4. 验证 `system_settings.encryption_key_id` 已无旧 ID，确认旧实例全部退出；
5. 从 Keyring 删除旧密钥并再次部署。

数据库凭据优先创建新角色、授予最小权限、更新所有实例并验证，再撤销旧角色；如果只能修改同一角色密码，应安排维护窗口。SMTP、S3 和 Payment Provider 凭据应使用供应商提供的双 Key 窗口，先验证连接或回调验签再撤销旧 Key。

Registry、GitHub Actions、Deploy SSH 和云平台凭据必须在对应控制面轮换，并更新受保护 Environment/Secrets。发生泄漏时跳过常规窗口：立即吊销受影响凭据、暂停相关部署或 Provider 入口、检查 Audit/平台访问日志，轮换派生凭据后再恢复服务。

轮换过程中不得把 Secret 写入命令参数、Shell 历史、日志、Issue、PR 或 Audit Metadata。
