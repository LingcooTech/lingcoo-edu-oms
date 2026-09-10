# 招生转化业务闭环验收

## 验收范围

本用例验证招生转化的最小闭环：

1. 创建试听场次；
2. 在后台新建线索；
3. 预约试听；
4. 报名名单签到；
5. 转为学员档案；
6. 核验家长绑定和课时账户。

试听场次由测试夹具创建，预约、签到、转化均通过后台页面完成。

## 固化规则

- 试听签到只记录试听报名状态和签到时间，不产生课时消费；
- 线索转化在一个事务内创建学员、机构服务关系、家长绑定和课时账户；
- 新建课时账户余额为 0，不自动赠送或发放课时；
- 转化完成后，课时账户应存在，但课时流水为空；
- 后续课时发放必须通过课时账本的独立操作，并生成可追溯流水。

## 执行命令

```bash
BOOTSTRAP_OWNER_EMAIL=owner@lingcoo.local \
BOOTSTRAP_OWNER_PASSWORD='Lingcoo-Preview-2026!' \
corepack pnpm exec playwright test \
  --config playwright.preview.config.ts \
  test/preview/admissions-business-flow.spec.ts
```

验收截图：`04-business-flow.png`。
