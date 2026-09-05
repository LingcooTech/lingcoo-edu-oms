# 质量标准

Starter 的完成标准不是源码能够启动，而是生成后的独立项目也能可靠安装、检查、构建和部署。

必须持续通过：

```bash
pnpm check
pnpm smoke:module-generator
pnpm smoke:admin-static
pnpm smoke:docker
pnpm e2e
pnpm audit --prod --audit-level high
```

验收范围：

- Node 和 pnpm 版本固定；
- 单一冻结锁文件；
- Format、Lint、strict TypeScript；
- 模块边界自动检查；
- Fastify HTTP contract 测试；
- Admin/Web/Server production build；
- Admin 桌面与移动端 Playwright 关键路径；
- Admin 生产静态托管和深层路由刷新；
- Admin 与 Web 的 UI 依赖和构建产物隔离；
- npx 模板生成后无维护者文件和 starter 身份残留；
- CLI npm tarball 只包含发布 Allowlist，且内嵌模板版本与 CLI/Starter 版本一致；
- 生成项目冻结安装并执行完整 `pnpm check`；
- production-only Docker dependencies；
- migration 可重复执行；
- non-root、只读容器和 readiness；
- 生产依赖不存在未处置的 high 漏洞。

## Admin Bundle 基线

阶段 0 使用路由级懒加载隔离 Dashboard 和 UI Showcase。Ant Design 作为成熟后台组件库会增加基础体积，构建时持续记录各 chunk 的 gzip 大小；重型表格、日期和编辑类页面不得进入无关公共 Web 构建。

单个 PR 导致 Admin 首屏 gzip 增加超过 25 kB 时，必须在 PR 中说明来源和必要性。不得为了消除体积告警复制或重写 Ant Design 组件。
