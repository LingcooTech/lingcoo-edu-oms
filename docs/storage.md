# 存储与素材管理

Storage 模块提供一套与业务领域无关的素材库，支持本地磁盘和 S3-compatible 对象存储。它只负责文件事实、版本、访问控制与引用治理，不承载商品图、课程封面、轮播排序等行业语义。

## 数据语义

- `storage_assets` 是业务引用的稳定身份。替换内容时 Asset ID 不变；
- `storage_objects` 是版本化物理对象，记录 Provider、内容事实、SHA-256 和生命周期；
- `storage_asset_references` 是服务端业务模块维护的精确引用。存在引用时拒绝删除 Asset；
- 数据库不保存裸 CDN URL，API 也不返回 Bucket、Object Key、本地路径或凭据；
- Bucket 应保持私有。`public` 仅表示可通过 `/api/assets/public/:id/content` 公开读取。

业务模块必须在自己的写事务中调用 `AssetReferenceService.set()`，把引用的建立或清除与业务记录变更放在同一事务里。业务表保存 Asset ID，不保存当前 Object ID 或 URL。

## 上传与替换

1. 客户端携带 `Idempotency-Key` 请求上传预授权；
2. Local 驱动返回受认证的 multipart API，S3 驱动返回短时效预签名 PUT；
3. 完成上传时，服务器读取内容并校验实际大小、魔数、扩展名、UTF-8 编码及 SHA-256；
4. 校验成功后在事务中切换 Asset 当前版本，旧对象进入异步删除；
5. 重复完成同一 Object 是幂等操作，历史版本事实不被后续替换覆盖。

同一个 Asset ID 的媒体大类不可改变：image 只能替换为 image，document 只能替换为 document，text 只能替换为
text。业务可以安全地把稳定 Asset ID 用于 Logo、图片或文档字段，而不会在后续替换时静默改变字段语义。

当前通用白名单为 JPEG、PNG、GIF、WebP、AVIF、PDF、UTF-8 TXT 和 CSV。SVG、HTML、视频、压缩包和可执行内容不进入 Starter。病毒扫描、图片裁切、转码和行业专用媒体编排应由具体应用按需扩展。

## 删除与清理

逻辑删除和物理删除分离：删除 Asset 的事务会先检查引用并把对象标记为 `deletion_pending`，随后由 `storage.delete-object` Job 删除物理内容。校验不通过的对象由独立重试 Job 删除，`storage.cleanup-pending` 周期任务清理过期、未完成的上传授权。Worker 与 API 在 Local 模式下必须挂载同一存储卷。

## 配置

- `STORAGE_PROVIDER`：`local` 或 `s3`；
- `STORAGE_LOCAL_ROOT`：Local 根目录，生产默认 `/app/data/storage`；
- `STORAGE_MAX_UPLOAD_BYTES`：单文件上限，默认 25 MiB；
- `STORAGE_UPLOAD_EXPIRY_SECONDS`：预授权有效期，默认 900 秒；
- `STORAGE_PENDING_RETENTION_HOURS`：过期 Pending 保留时间，默认 24 小时；
- `STORAGE_MAINTENANCE_INTERVAL_MS`：清理任务周期，默认 1 小时；
- `STORAGE_S3_REGION`、`STORAGE_S3_ENDPOINT`、`STORAGE_S3_BUCKET`；
- `STORAGE_S3_ACCESS_KEY`、`STORAGE_S3_SECRET_KEY`；
- `STORAGE_S3_FORCE_PATH_STYLE`：MinIO 等服务通常需要开启。

### 七牛云 Kodo S3

七牛 Kodo 复用现有 `s3` 存储驱动，不新增七牛专属 Provider。配置 `STORAGE_PROVIDER=s3`，并填写七牛控制台对应空间的 S3 参数：

```dotenv
STORAGE_PROVIDER=s3
STORAGE_S3_REGION=cn-east-1
STORAGE_S3_ENDPOINT=https://s3.cn-east-1.qiniucs.com
STORAGE_S3_BUCKET=your-qiniu-space
STORAGE_S3_ACCESS_KEY=
STORAGE_S3_SECRET_KEY=
STORAGE_S3_FORCE_PATH_STYLE=false
```

- `STORAGE_S3_REGION` 必须与空间所在区域一致；上面的 `cn-east-1` 仅为示例，请以七牛控制台提供的区域 ID 为准；
- `STORAGE_S3_ENDPOINT` 必须使用该区域对应的七牛 S3 Endpoint；
- `STORAGE_S3_BUCKET` 填写七牛空间名称；
- `STORAGE_S3_ACCESS_KEY` 与 `STORAGE_S3_SECRET_KEY` 必须成对配置，真实密钥只放在部署环境或加密设置中，不提交到仓库；
- 七牛支持虚拟主机和路径两种寻址方式，默认保持 `STORAGE_S3_FORCE_PATH_STYLE=false`；遇到代理、证书或端点兼容性要求时再改为 `true`。

当前 Provider 使用的上传预签名 PUT、读取、删除和 Bucket 连通性检查均属于 S3 兼容基础操作。配置完成后，可在系统设置中执行“测试存储连接”，再通过 `/storage` 完成一次小文件上传、预览和删除验证。七牛 S3 兼容接口的具体限制以其官方文档为准。

除 Local 根目录和运行上限外，Provider 与 S3 配置也注册在系统设置中。环境变量优先且在 Admin 中只读；Secret 加密保存且永不回显。Admin 的 `/storage` 提供上传、筛选、预览、元数据编辑、替换和删除操作，`AssetPicker` 与 `AssetImageField` 可供后续业务模块复用。

## 安全边界

- 管理读取需要 `storage.read`，写操作需要 `storage.manage`；
- 公共读取只接受状态为 active 且 visibility 为 public 的 Asset；
- 内容响应启用 `nosniff`、安全文件名、ETag 和受控缓存；私有内容使用 `no-store`；
- Provider 内部定位信息不进入 Audit metadata；
- S3 直传不携带应用 Cookie 或 CSRF Token；
- 文件类型判断不信任浏览器声明。若需要处理不可信 Office 文档或面向公众开放上传，应在具体应用增加隔离式恶意内容扫描。
