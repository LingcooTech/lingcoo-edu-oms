# 第一期迁移验收结论

验收日期：2026-09-06

## 结论

第一期“身份、账号与教育访问治理”已经形成可运行闭环，可以作为后续机构、教师、家长和教学业务迁移的统一入口。旧 Edu 生产数据尚未执行导入；本次仅使用隔离 PostgreSQL 数据库和匿名 fixture 验证迁移链路。

## 已完成范围

- 邮箱或中国大陆手机号登录，手机号统一存储为 `+86...`；邮箱和手机号至少存在一个。
- 兼容旧 Edu `scrypt:<salt>:<hash>`，首次成功登录后自动升级到当前密码格式。
- 新建账号、状态管理、角色分配、账号停用及全会话撤销。
- 临时密码和管理员重置后强制改密；服务端在改密前只开放 `me`、改密和退出。
- 管理员重置密码同时撤销 Session、作废 Action Token并写入不含明文密码的审计事件。
- `admin`、`institution_admin`、`teacher`、`parent` 四个教育角色及最小权限目录。
- 机构、教师档案、监护人档案和教师能力 Assignment；教务权限必须同时通过数据范围解析。
- Route 未声明教育数据范围时默认拒绝，不能仅凭角色权限直接查询全局学员。
- 账号、角色、审计后台页面，独立 Web 入口及移动端登录页面。
- 旧账号 export、plan、apply、rerun、verify、冲突拒绝与加密离线 artifact 工具。

## 结构性约束

- Route、Application、Domain、Infrastructure 继续分层，事务由 Application 用例编排。
- 跨模块调用公共端口；Notifications 不再直接查询 Identity Repository 或 schema。
- 跨模块外键只依赖数据库层最小目标描述，不暴露另一模块的 Drizzle schema。
- Contract 和 API Client 同步覆盖手机号、强制改密、重置密码和教育 Assignment。
- 教育数据范围解析采用 fail-closed：缺机构、档案、角色、能力或 scope policy 均拒绝。

## 数据迁移安全

- `plan` 默认只读；源库事务使用 `REPEATABLE READ, READ ONLY`。
- `apply` 同时要求命令、`--apply` 和目标库指纹。
- 不完整角色映射需要额外显式允许，缺少机构或档案引用时不授予运行时权限。
- `admin` 只映射教育平台管理员，`institution_admin` 只映射机构范围，二者均不会成为 `system.owner`。
- UUID、密码哈希和时间事实原样保留；冲突时停止，不发明邮箱、不合并账号、不覆盖目标数据。
- 微信身份只加密保留用于后续核对，本期不声称微信登录已经迁移。

## 实际验证

- 后端完整 PostgreSQL 套件：26 个文件、114 个测试通过。
- 迁移纯逻辑测试：16 个通过。
- 迁移 PostgreSQL 往返 fixture：1 个通过，覆盖 export、零写入 dry-run、双确认、同库拒绝、apply、重复 apply、verify、角色映射和冲突停止。
- 真实浏览器：2 个场景通过，覆盖账号创建、手机号登录、强制改密、CSRF、越权拒绝、管理员重置、Session 撤销、停用、审计、Web 和移动端。
- TypeScript、ESLint、Prettier、模块边界和 production build 通过。

## 实测中发现并修复的问题

1. 预览 API 与 Admin 的 CSRF Cookie 名不一致，导致改密被 403 拒绝；现已加入统一前端环境变量。
2. Notifications 在已占用数据库事务连接时，通过另一连接查询 Identity；20 路并发会耗尽连接池。现改为通过 Identity 公共端口复用同一事务执行器。
3. 手机号账号没有邮箱时，邮件通知不应创建失败任务；现保留站内通知并记录 `recipient_email_missing`。
4. 教师账号页头被错误标记为“OMS 管理员”；现统一显示为“已认证账号”，不伪造角色身份。

## 尚未完成

- 尚未连接或写入旧 Edu 生产数据库，也没有执行正式切换。
- 微信登录 Provider、教师／监护人领域档案本体仍待后续阶段接入；本期只保留身份引用和授权范围。
- 课程、班级、课次、学员、考勤、报名、课时余额、订单、支付事实和教学资源尚未迁移。
- 第一期正式导入前，需要先在旧库副本运行 `plan`，处理所有 blocker 和 incomplete 项，再在 staging 演练。

## Web 验收证据

- [一期工作台](phase-one/02-dashboard.png)
- [新建账号](phase-one/03-create-account.png)
- [首次登录强制改密](phase-one/04-forced-password.png)
- [账号管理](phase-one/05-accounts.png)
- [教育角色](phase-one/06-roles.png)
- [审计日志](phase-one/07-audit.png)
- [独立 Web 入口](phase-one/08-web.png)
- [移动端登录](phase-one/09-mobile-login.png)
