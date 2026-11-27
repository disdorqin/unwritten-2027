# C2 后山东区主地貌 · 第一轮审图证据（2026-11-27）

分支 `town-blockout-lane-c2` · 主峰基线 `30ba18e5` · 真实 Chrome（非生产挂载）+ swiftshader。

**模块** `tools/voxel-tavern/town-blockout/town-night-c2-summit-east-landform.ts`
**审图** `tools/voxel-tavern/town-blockout/town-night-c2-summit-east-landform-review.ts/.html`

| 图 | 机位 | 审图要点 |
|---|---|---|
| `east-landform-1.png` | 东次峰俯瞰 | 三层断续岩带沿东南下坡展开；不再是规整石块环；颜色与板岩山体有足够对比 |
| `east-landform-2.png` | 东沟沟底 | 沟底铺石与两侧护岸贴在采样地表上，成弧形沟槽，无悬空 |
| `east-landform-3.png` | 山脊石阶 | 22 级踏面沿东次峰→中央脊方向搭接成连续路径 |
| `east-landform-4.png` | 东南接缝 | 32 m 边界收敛，E≥332 / N≥512，不越入 A/D2 战区 |

**约束落实**
- 高度唯一来自 D2 主峰正典 `createMainSummitBlock(mainSummitLayout).heightAt`；本模块不持有、不改写任何地形函数。
- 不重造东次峰峰体（590/1080/610 m 属正典 `mainSummitLayout`）、不碰 lower-cloud 亭（773/739）、east-gully 站（760/590）、watch-ruins（390/1120）四个既有 D2 站点。
- 140 件 / 1 批 InstancedMesh / 16px Nearest Lambert / 0 新增真实光源；可见盒与 collider 同源（盒底面 = `piece.y`）。
- 四机位实测 `draws=2`（含正典粗模）、`errors: []`；7/7 单元测试通过。

审图补光只为看清形体，模块自身不发光、不新增灯。本图是构造示意与实际渲染审图，不是生产挂载证据；生产接线待 D2 消费后由总控入干。
