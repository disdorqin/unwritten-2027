# ZB-28 守卫叶面重写（对当前主干批 19 `2c219a50`）— 窗 B 交付，A 窗公共批取用

总控催单件 ①。旧 ZB-28 叶子是批 8 基线产物；本件在批 19 主干实树上重写并实测。

## 内容

1. `zb28-leaf-rewrite.patch`（叶子 `town-za29-guard-duty.ts`＋测试）：
   - 新增 `za29GuardDutyForPhase(phase)`——双岗共用的**唯一相位源**，返回现行 `Za29GuardDuty` 二字段：day/未明＝在岗无夜签；awaiting-beacon＝**空岗且夜签未起**（修掉 viewer 现行二值内联在黄昏仍留岗的错位）；night-window＝空岗＋夜签。
   - 坑口拦截窗由通用圆盘（半径 2）改为**真围栏开口槽**：半宽 2.07（栏杆 ±3.25、单栏半长 1.18，源 `town-za22-crater-road` fenceBlocks；唇点在本主干实测 (−71.5335, 159)、栅线 east −70.5335），高度包络 1.4 与山口岗一致。山口岗行为逐字不变。
2. `zb28-viewer-phase.patch`（viewer 一段）：`updateGuardPosts` 的内联二值 duty 改调用 `za29GuardDutyForPhase(presence.getTownNightWindow()?.phase)`，A 窗公共批落此段后相位口径全镇单源。

## 验证（批 19 实树工作树内）

- 测试 5/5：主干原有 3 条（山口岗全程、坑口原断言）不回退＋新增 2 条（相位映射四态、开口槽边界 2.0 内拦/2.2 外放/包络上越放行）。
- tsc 全量 0。

## 与窗 B 旧栈的关系

窗 B 本地栈里的旧 ZB-28 件（批 8 基）以本件为准作废；批推时请总控以本包覆盖旧段（交 A 包第一段 `zb28-phase-viewer.patch` 同步作废，由本包第二段替代）。
