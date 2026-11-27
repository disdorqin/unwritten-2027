# C2 后山东区林带与雪岩组团 · 第二轮审图证据（2026-11-27）

分支 `town-blockout-lane-c2` · 真实 Chrome（非生产挂载）+ swiftshader。

**模块** `tools/voxel-tavern/town-blockout/town-night-c2-summit-east-vegetation.ts`
**审图** `tools/voxel-tavern/town-blockout/town-night-c2-summit-east-vegetation-review.ts/.html`

| 图 | 机位 | 审图要点 |
|---|---|---|
| `east-veg-1.png` | 东次峰俯瞰 | 树石成两片自然组团贴坡，不是均匀树农场；岩带与林带交错但互不压盖 |
| `east-veg-2.png` | 营地俯瞰 | 营地石台周围留空，D2 站点不被植被侵占 |
| `east-veg-3.png` | 营地近景 | 近处树/雪岩落地 |
| `east-veg-4.png` | 山脊石阶 | 石阶线保持净空 |

**分带规则**：高度 528–690m（D2 云海低带森林顶 560m 之上），按 t=(h−528)/162 分松（t<.34）/旗松（.12–.6）/灌木（>.38）/雪岩（>.45），坡度阈值随类别变化；每株都由 `block.heightAt` 定位，成对间距防重叠。

**约束**：552 件 / 1 批 16px Nearest Lambert / 0 光源；只有树干与岩块有碰撞，灌木是视觉地表覆盖。营地石台（742/802）、D2 lower-cloud 亭（773/739）、east-gully 站（760/590）、watch-ruins（390/1120）四区全部留空。

四机位实测 4 draws（含正典粗模 + 地貌 + 营地 + 林带）、`errors: []`；5/5 单元测试与 `check` 通过。审图补光不属模块；本图非生产挂载。
