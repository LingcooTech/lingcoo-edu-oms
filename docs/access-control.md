# Access Control 模块

Access Control 负责“已认证账号可以执行什么操作”。它基于部署内 RBAC，不包含 SaaS 租户、组织范围、
校区范围或行业 Data Scope。Identity 仍然独立负责账号与会话，Access Control 只通过 Identity 的公共
Service Port 查询和管理账号。

## 数据模型

| 表                        | 所有事实                               |
| ------------------------- | -------------------------------------- |
| `access_permissions`      | 按来源注册的权限目录、分组、名称和说明 |
| `access_roles`            | 角色标识、名称、说明与系统角色标志     |
| `access_role_permissions` | 角色拥有的权限                         |
| `access_user_roles`       | Identity 账号与角色的分配关系          |

权限是稳定、带命名空间的代码，例如 `accounts.read`、`roles.manage`。角色是权限集合，账号可拥有多个
角色，有效权限取所有角色权限的并集。未分配角色的账号有效权限为空。

## 默认拒绝门禁

所有 `/api/*` 和 `/health/*` 路由都必须显式声明访问策略：

```ts
app.get(
  '/api/example',
  {
    config: { access: { permissions: ['example.read'] } },
  },
  handler,
);
```

- `{ public: true }`：明确公开；
- `{ permissions: [] }`：只要求有效 Session；
- `{ permissions: ['roles.read'] }`：要求有效 Session 和全部列出的权限；
- 未声明：返回 `ACCESS_POLICY_REQUIRED`，默认拒绝；
- 所有已认证写请求还统一要求与 Session 绑定的 `X-CSRF-Token`。

Admin 的路由、导航和按钮会按权限隐藏或拒绝，但前端只负责交互体验，后端 Guard 始终是最终安全
边界。权限变化后后端请求立即使用新权限，Admin 同时失效本地权限缓存。

## HTTP API

| Method | Path                                | 权限                                           |
| ------ | ----------------------------------- | ---------------------------------------------- |
| GET    | `/api/access/permissions`           | 有效 Session                                   |
| GET    | `/api/access/catalog`               | `roles.read`                                   |
| GET    | `/api/access/roles`                 | `roles.read`                                   |
| POST   | `/api/access/roles`                 | `roles.manage`                                 |
| GET    | `/api/access/roles/:id`             | `roles.read`                                   |
| PATCH  | `/api/access/roles/:id`             | `roles.manage`                                 |
| PUT    | `/api/access/roles/:id/permissions` | `roles.manage`                                 |
| DELETE | `/api/access/roles/:id`             | `roles.manage`                                 |
| GET    | `/api/access/users`                 | `accounts.read`                                |
| POST   | `/api/access/users`                 | `accounts.manage`；分配角色另需 `roles.manage` |
| GET    | `/api/access/users/:id`             | `accounts.read`                                |
| PATCH  | `/api/access/users/:id`             | `accounts.manage`                              |
| PUT    | `/api/access/users/:id/roles`       | `accounts.manage` + `roles.manage`             |

## Bootstrap 与 Owner 保护

`pnpm db:bootstrap` 每次都会同步 Core 权限目录，并创建或修复唯一的 `system.owner` 系统角色。Owner
自动拥有所有已注册来源的权限。配置初始账号时，命令还会幂等分配 Owner 角色。

管理 API 不允许修改或删除系统角色，不允许移除账号已有的 Owner 角色，也不允许停用 Owner 或当前
登录账号。这些限制用于避免通过常规后台操作锁死系统。

创建账号和初始角色分配共享同一个 PostgreSQL 事务；任一角色无效或分配失败时，Identity 账号与
密码凭据也会一并回滚，不会留下半完成账号。

## 权限演进

权限标识一经发布即视为持久数据标识，不能只在代码中直接重命名。重命名采用两阶段 Migration：

1. 先注册新权限，并在数据库 Migration 中把旧权限的角色分配复制到新权限；
2. 所有调用点和已部署版本切换完成后，再从 Registry 删除旧权限。

Registry 同步只清理由同一 `source` 管理且已从定义中移除的权限，不会删除其他业务模块注册的权限。
删除权限时外键级联只清理对应角色权限关系，不影响角色和账号。
