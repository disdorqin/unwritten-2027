# C2-E06 后山东区发卡弯休憩石凳 · 审图证据

日期：2026-11-27　工包：`town-night-c2-summit-east-bench.ts`（第二轮，图册 C2 第四格 `hairpin-bench`）

## 机位（真实 Chrome + swiftshader，本地 Vite :3020）

| 截图 | 机位 | 看点 |
|---|---|---|
| `bench-1.png` | 石凳俯瞰 E392/N948 | 石凳与 E01 山脊石阶的整体关系 |
| `bench-2.png` | 开口近景 E454/N962 | 半圆背墙、弧形木凳、导柱、贴地砌体 |
| `bench-3.png` | 背墙与木凳 E398/N1076 | 弧形可读性、石砌挡墙 |
| `bench-4.png` | 山脊石阶关系 E556/N1112 | 石阶弯道与石凳衔接 |

审图结果：`draws 3`、`errors: []`、console 零错误；单元 6/6、typecheck 干净；594 件 / 1 批 / 0 光源。

## 约束复述

- 高度唯一来自 D2 正典 `createMainSummitBlock(mainSummitLayout).heightAt`，不建第二地形权威、不改地形/道路、不占 world anchor。
- 全部构件 E≥300 / N≥480，32m 共享边界收敛；避开 skywatch 遗址、lower-cloud 亭、east-gully 站与 C2-E02 营地。
- 只补 E01 山脊石阶弯道 (454,1037) 的休憩家具，不重造石阶、亭子或 D2 设施。
- 1 批 16px Nearest Lambert、0 新增光源、visible / collider 同源、`y` 为底面。

## 审图驱动修复

- 第 3 机位初版在坡面低处、视线被山体凸起遮挡，只见零散石块；改为从西北高处俯看弯道，半圆背墙与木凳才完整入画。实体本身未因审图返工。
- 扇形台面 datum 取全足迹最高采样 +0.5m，避免上坡半幅被山体吞没；每格从地表下 3m 起实心分层砌筑，低侧形成贴坡挡墙而非悬空细柱。
