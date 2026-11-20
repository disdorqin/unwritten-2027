# ZA-27 发布线 viewer 挂载交接

本轮已读 Muse 新文件：《审计·分支处置终表》16:23 追记二。主干新派工以 `d675bc1e` 的 ZA-27 任务文件为准。

分区一已在 `a298f4b` 以本新版 ①② 替换合体旧 05，再并 ZA-19，`b33af4d1` 登记闭合。独立 06 的按钮及 PNG 已在运行树，主干两端类型、生产 Vite 构建与定向 99/99 通过。04 的 CI workflow 仍传旧夜窗变量，有写权窗口可单独取[一文件补片](za22-live-night-workflow-only.patch)。

## ① 统一输入

[01 viewer-only 补丁](01-zb19-viewer-on-d675bc1e.patch) 以 `d675bc1e7914f167c069b20f0de3c0df89f4bbb7` 为父提交，候选 `9601e75dda813f1102dfec7f0a6a898250c144fa`，树 `4c464c01d8465cc61fe75addbbe7cdfbecc651dd`。补丁 SHA256 `362fa82f4c0b1f1893d5be52d17a5f45ad874e1c9353a0f017b1b668b56ac3df`。

仅改 `tools/voxel-tavern/town-blockout/viewer.ts`。复用 B 已审统一输入和库存，恢复编译与场景启动所需的 `stock`。现有 HTML 没有投雪球/触屏刹车按钮时按既有布局创建，已有按钮直接复用。ZA-22 山门和缆车优先处理，云海早返回分支同步刷新控制 HUD。

候选以独立 Git 索引实贴，客户端与服务端类型、生产预览构建、定向 75/75。Windows Chrome 用正常根入口和真实回环 Presence，在南侧雪堆和北坡雪橇架两个验收布点后执行可信键鼠/模拟触屏。两端均采到 4 球、投掷 1 次、收到权威雪墙回包、刹车 2.536 → 2.130 m/s，页面、控制台、HTTP、请求错误均 0。桌面还验带刹下橇、原地再上橇、空格重复不带入刹车。原件 `za27-01-native-evidence/zb19-town-inputs.json`，SHA256 `331d74a5212b244a0179f9a8d38501f9dd9329f40dad8f826dedf4d720f27b1a`。旧主干结霜 WebP 构建警告属独立 ZA-02 样式。

## ② 仪式携橇

[02 viewer-only 补丁](02-zb16-ceremony-on-za27-01.patch) 以 ① `9601e75d` 的 viewer blob `590232bbf44b09bfd0e4333a8e15e299c31138e5` 为前像，候选 `bd460799126681b4e199665310daeffec7c6c490`，结果 viewer blob `1265ad244628235ff064f2226726a92e3eefced6`。SHA256 `2b732047c21f7f1b2eeae64a56d8b2e92dae5b49e3db3f613b5c00eb30304b19`。

来自窗 B `332f7aa` 对 ZA-22 的重定版。只动 viewer.ts 的仪式落位与姿态、雪橇空中退出判断，保留云海优先交互和山门西域场景。严格索引实贴、两端类型、生产构建、定向 67/67 通过。Windows Chrome 146 / Intel UHD D3D11 正常根页从 E223/N180/Y12 出生，D/S/D 原生实走 E232.9/N174.4/Y12 上橇。服务端使用受控验收档期，发出唯一 on-time `ceremony-arrival`，真实 WS 显示 E228/N188/Y12 落场，HUD 保持下橇；随后下橇和原地复骑均通过。8 检查点、25 位姿帧、页面/控制台/HTTP/请求错误 0。出生点采样 160 draws / 1,110,788 tris / 0 错误。候选组合含独立 ZA-02 06，QA 组合提交 `ea27a2e`。原件 `za27-02-native-ceremony-06/za27-02-runtime.json`，SHA256 `0f65402a6f238211a076c02b71429359d8881cfac7a4db431d0e7e44b908d537`。先前两轮 Linux 只证普通到场，后续 Windows 这轮补齐携橇门。

## 实施顺序

先取 `ff33725` 的①，再按 viewer 前像取②，每件可独立验贴和提交。① 与既有合体交接的旧 05 二选一；此处 ① 是针对正式发布线的新版 viewer。ZB-17 夜窗权威 04 和 ZA-02 样式分别取件。发布线提交由总控终验。
