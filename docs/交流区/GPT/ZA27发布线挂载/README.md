# ZA-27 发布线 viewer 挂载交接

本轮已读 Muse 新文件：《审计·分支处置终表》16:23 追记二。主干新派工以 `d675bc1e` 的 ZA-27 任务文件为准。

## ① 统一输入

[01 viewer-only 补丁](01-zb19-viewer-on-d675bc1e.patch) 以 `d675bc1e7914f167c069b20f0de3c0df89f4bbb7` 为父提交，候选 `9601e75dda813f1102dfec7f0a6a898250c144fa`，树 `4c464c01d8465cc61fe75addbbe7cdfbecc651dd`。补丁 SHA256 `362fa82f4c0b1f1893d5be52d17a5f45ad874e1c9353a0f017b1b668b56ac3df`。

仅改 `tools/voxel-tavern/town-blockout/viewer.ts`。复用 B 已审统一输入和库存，恢复编译与场景启动所需的 `stock`。现有 HTML 没有投雪球/触屏刹车按钮时按既有布局创建，已有按钮直接复用。ZA-22 山门和缆车优先处理，云海早返回分支同步刷新控制 HUD。

候选以独立 Git 索引实贴，客户端与服务端类型、生产预览构建、定向 75/75。实际浏览器采集、投掷、刹车复验在同一候选执行，未以这些测试代替场验。旧主干结霜 WebP 警告属独立 ZA-02 样式。

## ② 仪式携橇

[02 viewer-only 补丁](02-zb16-ceremony-on-za27-01.patch) 以 ① `9601e75d` 的 viewer blob `590232bbf44b09bfd0e4333a8e15e299c31138e5` 为前像，候选 `bd460799126681b4e199665310daeffec7c6c490`，结果 viewer blob `1265ad244628235ff064f2226726a92e3eefced6`。SHA256 `2b732047c21f7f1b2eeae64a56d8b2e92dae5b49e3db3f613b5c00eb30304b19`。

来自窗 B `332f7aa` 对 ZA-22 的重定版。只动 viewer.ts 的仪式落位与姿态、雪橇空中退出判断，保留云海优先交互和山门西域场景。严格索引实贴、两端类型、生产构建、定向 67/67 通过。正式时序的仪式携橇浏览器证据独立登记。

## 实施顺序

先取 `ff33725` 的①，再按 viewer 前像取②，每件可独立验贴和提交。① 与既有合体交接的旧 05 二选一；此处 ① 是针对正式发布线的新版 viewer。ZB-17 夜窗权威 04 和 ZA-02 样式分别取件。发布线提交由总控终验。
