# Application Branding

Branding 模块描述当前单体部署应用本身的公开展示，不代表机构、租户、店铺或业务品牌。系统固定只有一个 `default`
配置，不提供多品牌、继承、发布流程、页面装修或 CMS。

## 数据语义

- `application_branding` 保存界面展示名称、一个 `#RRGGBB` 主色、登录页标题/副标题和 Revision；
- Logo 与 Favicon 只保存在 `storage_asset_references`，分别使用
  `application-branding/default/logo` 和 `application-branding/default/favicon`；
- Branding 主表不重复保存 Asset ID，更不保存 URL、Object ID、Bucket 或本地路径；
- 更新在一个事务内完成行锁、Revision 校验、图片 Asset 校验、Reference 切换、配置写入和 Audit；
- 未配置数据库记录时，界面名称回退到 `APP_NAME`，其余字段使用代码默认值，Revision 为 `0`。

`APP_NAME` / Settings 中的 `application.name` 是运行时服务标识和系统通知名称；Branding 的 `appName`
是 Admin 界面展示名称。这样生产部署可以保持稳定服务标识，同时独立调整界面品牌。

## HTTP API

| Method | Path                           | 权限              |
| ------ | ------------------------------ | ----------------- |
| GET    | `/api/branding/public`         | 显式公开          |
| GET    | `/api/branding`                | `branding.read`   |
| PUT    | `/api/branding`                | `branding.manage` |
| GET    | `/api/branding/assets/logo`    | 显式公开          |
| GET    | `/api/branding/assets/favicon` | 显式公开          |

公开配置不返回 Asset ID、操作人或 Storage Provider 信息。响应使用内容摘要 ETag 和强制重新验证缓存；Logo/Favicon
地址携带当前文件 SHA-256 摘要片段，因此稳定 Asset ID 替换内容后也能刷新缓存。

品牌图片端点只代理当前 Branding Reference 指向的 active 图片。选择一个 private Asset 作为 Logo/Favicon
等同于明确授权它通过该固定品牌端点公开展示；它不会因此获得通用 `/api/assets/public/:id/content` 地址，也不能借此
读取其他私有 Asset。

## Admin 行为

`/admin/branding` 提供整体表单和实时预览：

- `branding.read` 控制页面和导航可见性；
- `branding.manage` 控制保存；
- 选择 Asset 还需要 `storage.read`，Starter 不额外复制一套受限素材查询 API；
- Logo/Favicon 通过 `AssetPicker` 只提交稳定 Asset ID，后端重新验证 active 与 image 类型；
- 保存成功后同步刷新 Query Cache、Ant Design `colorPrimary`、页面标题、Favicon、登录页和 Admin Shell；
- Branding 请求失败时使用本地默认值，不阻断登录或 Admin 启动。

主题模式与品牌色是两个独立概念：用户 light/dark 偏好选择 Ant Design algorithm，Branding 只白名单映射
`primaryColor -> colorPrimary`。服务端不会接受任意 Token Map、CSS、HTML、Markdown 或布局 JSON。

## 安全边界

- 文本均为单行纯文本，拒绝控制字符和 `<` / `>`，React 仍按普通文本渲染；
- 主题色只接受六位 Hex，不接受 `rgb()`、`var()`、渐变或 URL；
- Storage 继续拒绝 SVG/HTML 等主动内容；Branding 第一版使用安全位图；
- Asset ID 一旦成为 image 类型，后续内容替换必须继续保持 image 媒体大类，避免品牌引用被替换成 PDF 或文本；
- 被 Branding 引用的 Asset 不能删除；清除或切换 Reference 后，旧 Asset 仅解除引用，不自动删除；
- 审计只记录受控配置字段和稳定 Asset ID，不记录图片内容或 Provider 物理位置。
