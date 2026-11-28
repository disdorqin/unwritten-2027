# F3 独立资产库（assets-source/friend3/）

本目录记录 F3 三条独立施工线的原创资产来源、许可与复用边界。

## FR-05 雪夜翻牌

- 交付：`tools/voxel-tavern/town-blockout/town-friend3-card-game.ts`、`friend3-card-game-preview.ts`、`friend3-card-game-preview.html`、`friend3-card-game.css`。
- 资产：10 种冬日物件牌面（灯笼、雪人、松树、铃铛、火炉、邮筒、雪橇、围巾、热可可、窗花），全部由 Canvas 程序化像素绘制，无第三方图片、字体或音频。
- 许可：仓库 MIT（Original-Procedural-Canvas）。
- 边界：三档难度、单机计时/步数/重开/退出，无联网排行、星石、经济或强剧情依赖。

## FR-07 未写镇氛围音效

- 交付：`tools/voxel-tavern/town-blockout/town-friend3-ambient-audio.ts`、`friend3-audio-preview.ts`、`friend3-audio-preview.html`、`friend3-audio-preview.css`。
- 资产：风铃、木门、火炉、木脚步、石脚步、雪脚步，共 6 种；全部由 WebAudio 振荡器、噪声缓冲、滤波器与包络实时合成，无外部采样、录音或不明版权素材。
- 许可：仓库 MIT（Original-WebAudio）。
- 边界：首次用户手势后才创建 AudioContext，不自动播放；独立试听面板提供试听/停止、循环开关、主音量、静音、停止全部；不接全局音频、HUD、存档或多人权威。
- 台账：如未来引入外部素材，必须在本文件追加来源、作者、许可证、原始链接与转换方式；未登记素材不得进入预览或候选。

## FR-08 雪夜门廊装饰

- 交付：`tools/voxel-tavern/town-blockout/town-friend3-decor.ts`、`friend3-decor-preview.ts`、`friend3-decor-preview.html`、`friend3-decor-preview.css`。
- 资产：程序化体素门廊、5 个灯笼挂点、5 个明信片贴点、3 种灯笼色（朱红/暖橙/晶青）与 3 种明信片纹理（雪夜/灯火/星尘）；全部原创几何与 Canvas 纹理，无第三方模型或贴图。
- 许可：仓库 MIT（Original-Procedural）。
- 边界：仅局部本地状态，支持选择/放置/撤回/全部撤回/重置视角；不写公共地形、存档、星石、收集经济或多人权威。

## FR-14 交通与高山音效

- 交付：`tools/voxel-tavern/town-blockout/town-friend3-travel-audio.ts`、`friend3-travel-audio-preview.ts`、`friend3-travel-audio-preview.html`、`friend3-vite.fr14-preview.config.ts`。
- 资产：轨轮、索道滑轮、绞盘、铁锤、高山风口、冰裂，共 6 类；全部由 WebAudio 振荡器、噪声缓冲、滤波器与包络实时合成，无外部采样或录音。
- 许可：仓库 MIT（Original-WebAudio）。
- 边界：复用 FR-07 的首次手势启动、试听/停止、循环、主音量、静音与停止全部架构；不重复旧风铃/火炉/脚步，不接公共音频、C 域音场、HUD、存档或多人权威。

## 独立验收入口

- FR-05：`friend3-vite.fr05-preview.config.ts`（dist-fr05 / 5205）
- FR-07：`friend3-vite.fr07-preview.config.ts`（dist-fr07 / 5207）
- FR-08：`friend3-vite.fr08-preview.config.ts`（dist-fr08 / 5208）
- FR-14：`friend3-vite.fr14-preview.config.ts`（dist-fr14 / 5214）
- 三套配置不修改共享 `tools/voxel-tavern/vite.config.ts`。