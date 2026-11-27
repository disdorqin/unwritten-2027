# C2-E05 后山东区雪橇起点坡道与风袋杆 · 审图证据

日期：2026-11-27　工包：`town-night-c2-summit-east-sled.ts`（第二轮，四战区均衡派工）

## 机位（真实 Chrome + swiftshader，本地 Vite :3020）

| 截图 | 机位 | 看点 |
|---|---|---|
| `sled-start-1.png` | 起跳台俯瞰 E585/N982 | 起跳台与连续雪道的整体关系 |
| `sled-start-2.png` | 起跳台近景 E648/N988 | 实心石基、木护栏、双旗、铭文碑 |
| `sled-start-3.png` | 雪槽下坡 E700/N1040 | 雪道连续性、成对导流杆 |
| `sled-start-4.png` | 风袋杆与铭文碑 E672/N1100 | 橙色风袋杆、石碑、周边岩带 |

审图结果：`draws 3–4`、`errors: []`、console 零错误；单元 6/6、typecheck 干净。

## 约束复述

- 高度唯一来自 D2 正典 `createMainSummitBlock(mainSummitLayout).heightAt`，本包不建第二地形权威、不改地形/道路、不占 world anchor。
- 全部构件 E≥300 / N≥480，32m 共享边界收敛；避开 lower-cloud 亭、east-gully 站、watch-ruins 与 C2-E02 营地。
- A 战区既有 `longHallSledRoute`（N≈192–303）与 `surveyedSledConnection`（E1100/N203）不属本包，未触碰；B 缆车、D2 索道同样未触碰。
- 1 批 16px Nearest Lambert、0 新增光源、visible / collider 同源、`y` 为底面。

## 审图驱动的三处真实修复

1. **甲板半埋**：初版 datum 取网格中心点，上坡两列地面高于甲板，甲板被山坡吞掉一半；改为取全网格最高采样 +0.6m 的统一 datum，每格从地表下 4m 起实心分层砌筑。
2. **雪槽锯齿**：短薄雪板在 30% 坡上读成一排白色锯片；改为更少更长的重叠雪板。随后发现 `yaw` 对齐的是局部 X 轴，长尺寸误赋给横向 `d`，再次交换为沿路径 `w`，雪道才真正连续。
3. **风袋杆不可见 / 山体显浮**：机位被东次峰遮挡，改从东南高处俯看；审图粗模从 24m 改 8m 与采样面一致，消除雪道悬空错觉；风袋杆加高至 22m 并放大橙色分段。
