# C33-2 东区步行走廊卡人清零 · 审图证据

日期：2026-11-28　工包：`town-night-c2-trail-corridor.ts` + `town-night-c2-summit-east-landform.ts` + `town-night-c2-summit-east-switchback.ts`

## 机位（真实 Chrome + swiftshader，本地 Vite :3020）

| 截图 | 机位 | 看点 |
|---|---|---|
| `corridor-1.png` | 被裁剪的 356.9m 弦 · E570/N462 看 E509/N526 | 最后 1 根护栏柱所在的区外直连弦，青线连续、无实体压线 |
| `corridor-2.png` | 东坡折返护栏 · E800/N520 看 E520/N720 | 折返段护栏全部退到步行净宽外 |
| `corridor-3.png` | 东区步行线全景 · E1000/N380 看 E540/N760 | 1692 站中心线与东地貌、盘山折返整体关系 |
| `corridor-4.png` | 地表近景 · E470/N455 看 E509/N526 | 石砌步道、护栏柱与青线同框，中心可通行 |

审图驱动状态：`blocked 0`（四机位一致）、`draws 27/72/75/36`、`errors: []`、console 零错误。青线是审图专用可视化，不进生产。

## 本轮真实缺陷与修复

1. 1692 站审计最初发现 41 个中心阻塞（31 地貌 + 10 折返护栏）。建立共享走廊模块，`landform` 过滤非台阶实体、`switchback` 过滤护栏实体；薄铺面、雪边、沟槽、护坡不作为 collider，水平横杆只保留视觉。
2. 余下 1 根护栏柱位于 E508.6/N525.9。根因不是漏过滤，而是走廊模块按 5528 个**测站顶点**测距：正典测站最长有 50m 顶点间隔，而 C2 实际铺设的 `clipC2EastTrail` 会跨过区外点直连形成 356.9m 弦，该柱距弦仅 0.15m、距任何测站顶点 64m。改为点到线段距离，并直接用 1692 个实际铺设站位建索引，阻塞归零。

## 约束复述

- 高度唯一来自 D2 正典 8m 三角面采样；不建第二地形权威，不改地形/道路/viewer 权威。
- 全部构件 E≥300 / N≥480，32m 共享边界收敛；不重造 D2 亭、遗址、east-gully 站点或 B 缆车。
- visible / collider 同源；每批 16px Nearest Lambert、0 新增光源、`y` 为构件底面。
- 审图页只用于复核，不是生产挂载；不为通过审计而缩短、改道或伪造步行线。

## 验证

- `tests/town-night-c2-trail-corridor.test.ts`：3/3（站位同源、线段距离、1692 站零堵塞）。
- C2 东区相关 17/17 通过；C2 typecheck 零错误。
- 全量 typecheck 仍有 4 条 A 线既有错误（`town-a32-final-gameplay` 3 条、`town-night-a-summit-production` 1 条），非本轮引入、非 C2 领地，未越权修改。
