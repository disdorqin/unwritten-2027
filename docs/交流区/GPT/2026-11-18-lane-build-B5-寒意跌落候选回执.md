基线 `108c52ca55f47bd2cdac7677313fed765a2787a2`（`origin/town-blockout-integration`）

# B5 寒意、火点与跌落 · 施工窗候选

- `town-frost.ts`、`style.css`、`tools/voxel-tavern/town-blockout.html`：渐进霜带/画面 blur/融退与水膜，水接触压力为同档干雪的 2 倍；灯下停积并缓慢融退，火边、温泉与室内沿用已定恢复。兼容现役 viewer 的布尔暴露入口，主窗口可切到四值表面。
- `town-campfires.ts`、`scenery.ts`、`town-lights.ts`、`town-snow-cover.ts`：四类暴露采样所需的火源、灯光和落雪探针；五处外围候选地面探查、座位、合批火盆壳与共享粒子池。抽离 `town-mail-sites.ts` 供 `town-mail-activity.ts` 和火点共用信箱点位，解决旧 WIP 在 Node 加载 CSS 的失败。
- `landing-feedback.ts`：按起落脚点差分档，3–6 m 压缩停顿 0.3 s，>6 m 趴倒 1.2 s 后两秒 ×0.7，深雪减一档。交由漫游消费的纯状态机，无血条/伤害/死亡。
- 相关实现文件位于 `tools/voxel-tavern/town-blockout/`，专项验证见 `tests/town-blockout-frost-and-campfires.test.ts`、`tests/town-blockout-landing-feedback.test.ts`。

## 主窗口接线申请

1. 参照 `git show 5ea4b4c -- tools/voxel-tavern/town-blockout/viewer.ts`，将现役布尔暴露源切到 water/lamp/dark-snow/none，给冻霜组件场景 DOM 与通知口，接外围五处地面检测及 warmth。B10 的全镇档位还未接入。
2. P16/P24/P25 三个广场火点须用 B2a 定位，点位 [238,205]、[240,173]、[178,162]，回暖半径 3 m。前两个静态火盆已在 B2a，复用壳并加热源，避免重复绘制。五处外围实际可达/座位、高低差与 NPC 驻位仍需浏览器验证。
3. 第一帧离地时以地面脚点调用 `begin(feet)`，现有着地分支调用 `land(feet, deepSnow)`，复用现有雪雾、镜头压缩及走速乘子。泡汤、传送、重生和雪橇状态切换时清理。本候选未自行选择远端趴倒姿态枚举，避免与 B3 pose 7 冲突。

## 测试与性能

- 合计 229/229，本批专项 7/7，根及服务端 TS、Vite、`git diff --check` 通过。覆盖湿冷倍率、灯下退霜、暖源、显示效果、非法火点剔除、深雪降档与跌落计时。
- 模块预算上限 8 × 44 个盒，即 4,224 tris 预留，只有实际实例参与绘制。火点壳复用街景批次，共用 1 个 Points 粒子批。PC 450 draws / 2.2M tris 参考线，未接线状态不写整场实测通过。
