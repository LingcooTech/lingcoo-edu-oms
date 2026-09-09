# P2 机构与人员迁移运行手册

更新日期：2026-09-06。

## 迁移范围

本阶段只迁移组织基础档案、机构、组织级学员、家长、教师，以及有明确证据的人员关系。不迁移课程、班级、校区、订单、收款或课时余额。

- 旧 `organization` 单例迁移组织全称、品牌名称、电话、地址，并按 `fullLogoUrl → logoUrl → squareLogoUrl` 优先级保留一个基础 Logo。目标组织资料已被人工修改时拒绝覆盖。
- 旧 `institutions` 保守映射为 `partner`，自营／合作类型必须由业务复核，不根据名称、课程、场地或收款方猜测。
- 机构的 Logo、介绍、资质图片及说明、成果图片及说明、公开联系方式、排序和状态原样保留；联系人、联系电话、地址、内部备注是新系统运营字段，不从旧 `contact` 文本中猜测拆分。
- 学员只生成一份组织级档案。机构服务关系只接受旧合同明确机构、合同课程的服务提供机构或家长机构角色三类证据，并记录来源与旧记录引用。
- `students.guardian_id` 与 `student_guardians` 取并集，同一对关系去重。旧关系一律标记为 `unverified + legacy_import`，复核前不能产生家长访问权。
- 监护人不按手机号自动合并。无法规范为中国大陆手机号且未关联已迁移账号的监护人进入隔离清单，不生成无联系方式档案。
- 教师与旧 `institution_id` 建立任职关系；账号关联只在唯一且已迁移的旧账号证据成立时写入。
- 教师的职称、头像、简介、微信二维码、专业背景、教学经验、教学风格、荣誉、展示指标、教学理念、课堂照片、学员作品、家长评价、擅长项和展示标记完整迁移；机构任职关系仍独立维护。

## 推荐执行顺序

1. 对旧生产库建立只读副本和一致性快照；禁止直接将生产主库作为迁移源。
2. 运行 P1 身份计划并应用身份。目标已有真实机构外键时，P1 会暂缓所有缺少真实档案的机构／教师／家长授权，不再接受裸 UUID。
3. 运行 P2 只读计划，审查 `incompleteCounts`、`exceptionCounts` 和机构类型清单。
4. 当前旧系统已由业务负责人确认不存在自营机构，3 家旧机构全部按 `partner` 导入；未来新增机构仍必须经过业务确认，不能根据名称、课程、场地或收款方猜测类型。
5. 对确认接受的隔离项使用 `--allow-incomplete` 显式确认后原子导入。该参数只允许跳过待人工处理记录，不绕过硬阻断。
6. 管理员在 Web 中逐条核验旧家长绑定；只有核验通过的关系才能授予家长角色范围。
7. 重新运行 P1 计划：机构管理员与匹配教师可在真实档案关系成立后获得授权；未核验家长继续保持未授权。
8. 核对机构、学员、家长、教师及关系数量，再开放 P2 业务写入。P3 课时迁移前不得删除旧合同证据。

## 命令

```sh
MIGRATION_SOURCE_DATABASE_URL='postgres://…/legacy_readonly' \
MIGRATION_TARGET_DATABASE_URL='postgres://…/lingcoo_edu_oms' \
node scripts/migration/people-phase2.mjs plan --report /secure/path/phase2-plan.json

MIGRATION_SOURCE_DATABASE_URL='postgres://…/legacy_readonly' \
MIGRATION_TARGET_DATABASE_URL='postgres://…/lingcoo_edu_oms' \
node scripts/migration/people-phase2.mjs apply --apply \
  --confirm-target TARGET_FINGERPRINT --allow-incomplete \
  --report /secure/path/phase2-apply.json
```

计划是默认行为且源事务强制只读。应用必须同时提供 `apply`、`--apply` 和计划输出的目标指纹；目标存在相同实体或关系时拒绝覆盖。报告只包含摘要、数量和异常代码，不包含姓名、手机号或数据库 URL。

## 必须停止的情况

- 目标指纹变化、目标已存在冲突 ID／关系、目标 schema 不完整。
- 机构类型尚未完成人工确认，却准备直接开放运营。
- 学员机构归属无证据，或同一旧合同的服务机构存在冲突。
- 监护人手机号无效且无唯一账号证据。
- 试图把旧家长关系直接视为已验证，或只凭角色表中的 UUID 发放访问权。
- P3 前准备删除旧合同、课程提供方或历史人员关联数据。
