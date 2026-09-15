# Phase Eleven 真实预览验收报告

验收日期：2026-09-15
验收环境：本机 preview（PostgreSQL `127.0.0.1:55439`、API `127.0.0.1:18090`、Admin `127.0.0.1:15173`）

## 执行结果

执行命令：

```bash
node --env-file=.env.preview node_modules/@playwright/test/cli.js test \
  test/preview/phase-eleven-course-series-refunds-group-exit.spec.ts \
  --config playwright.preview.config.ts
```

最终已执行批次结果：**3 passed，50.8s**。

视觉证据一致性补充验证（仅课程系列）：

```bash
node --env-file=.env.preview node_modules/@playwright/test/cli.js test \
  test/preview/phase-eleven-course-series-refunds-group-exit.spec.ts \
  --config playwright.preview.config.ts \
  --grep '课程系列 CRUD'
```

补充验证结果：**1 passed，15.3s**（用例执行 13.1s）。截图前已发送 `Escape`，并断言可见的 Ant Design 下拉数量为 0；截图目检确认页面显示稳定“暂无数据”空态且机构下拉已关闭。本次没有重跑退款和拼课用例。

| 验收链路         | API 结果                                                                                                                              | 后台 UI 结果                                                                                           | 结论 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 课程系列         | 新建系列、关联课程、更新停用、有关联时删除被 `409` 阻断、解除关联后删除成功                                                           | `/admin/course-series` 显示课程系列页及机构范围内稳定“暂无数据”空态                                    | 通过 |
| 普通线下订单退款 | 申请 `requested` → 审批并回收原订单批次权益 `awaiting_offline_refund` → 登记实际线下退款 `completed`；课时余额由 5 回收至 0           | 订单页可进入“普通订单退款”弹框，展示退款单、权益回收完成与“待确认线下退款”提示；完成后订单显示“已退款” | 通过 |
| 拼课退出与取消   | 已收意向金时取消拼课返回 `409`；登记全额意向金退款后状态为 `deposit_refunded`，报名退出为 `withdrawn`；随后取消拼课成功并写入取消原因 | `/admin/group-matching` 显示已取消拼课，机构选择完成后下拉已关闭                                       | 通过 |

## 截图证据

| 文件                                                                                        | 说明                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [01-course-series.png](./phase-eleven/01-course-series.png)                                 | 课程系列页面，验收机构下的稳定空态；不再停留在“加载中”。 |
| [02-order-refund-awaiting-offline.png](./phase-eleven/02-order-refund-awaiting-offline.png) | 普通退款交互证据：审批后权益已回收、资金退款待线下确认。 |
| [02-order-refund-completed.png](./phase-eleven/02-order-refund-completed.png)               | 线下退款确认完成后的订单状态。                           |
| [03-group-exit-and-cancelled.png](./phase-eleven/03-group-exit-and-cancelled.png)           | 拼课取消后的后台列表；机构选择下拉已收起。               |

## 自动化资产

本阶段新增可复跑用例：

- [phase-eleven-course-series-refunds-group-exit.spec.ts](../../test/preview/phase-eleven-course-series-refunds-group-exit.spec.ts)

该用例使用每次运行独立的 P11 机构、学员、课程、订单和拼课数据，不依赖旧系统数据，也不会修改业务实现文件。
