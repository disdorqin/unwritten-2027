# C2 后山东区背风营地 · 第二轮审图证据（2026-11-27）

分支 `town-blockout-lane-c2` · 真实 Chrome（非生产挂载）+ swiftshader。

**模块** `tools/voxel-tavern/town-blockout/town-night-c2-summit-east-camp.ts`
**审图** `tools/voxel-tavern/town-blockout/town-night-c2-summit-east-camp-review.ts/.html`

| 图 | 机位 | 审图要点 |
|---|---|---|
| `east-camp-1.png` | 东次峰俯瞰 | 营地嵌在东南坡面，与 E01 岩带同屏 |
| `east-camp-2.png` | 营地俯瞰 | 16 m 石台、小屋、营火与风旗的整体关系 |
| `east-camp-3.png` | 营地近景 | 实心分层石砌体从坡面长出，小屋厚墙、营火石圈、风旗清楚 |
| `east-camp-4.png` | 东南接缝 | 32 m 边界收敛，不越入邻区 |

**关键修复**：初版用四根细柱撑平板，在 24m 粗模与 8m 采样并存的审图里出现明显悬空柱脚。改为**实心分层石砌体**（每层按 8m sampler 找平、底层再埋 4m），使石台在任意主峰 LOD 下都读作坡面的一部分，而不是悬空平台。5/5 单元测试含"每堆课程必须有埋入地表的基座"回归。

**约束**：高度唯一来自 D2 正典 `block.heightAt`；避开 lower-cloud 亭（773/739，20m）与 east-gully 站（760/590，16m）；251 件（营地 111 + 地貌 140）/ 3 draws / 16px Nearest Lambert / 0 新增光源；可见盒与 collider 同源。营火不发光、旗不动画化，无交互或 presence 声明。

审图补光只为看清形体；非生产挂载，生产接线待 D2 消费后由总控入干。
