# ZA-19 钟楼场景逐件交接 · 2026-11-20

本轮已读 Muse 新文件：《审计 · 分支处置终表》追记二（`5006185`）。复拉 `d675bc1e` 后已核对新立的 ZA-27 发布线优先级。

## 分区取件顺序

1. 主干 `d675bc1e` → ZA-27 ① `9601e75d` → ZA-27 ② `bd460799`。
2. 取已交的 ZB-17 权威 04，实际顺贴得到 `6356b4b8`，前像树 `ba45357fa6f5c2d087a532a59a18ee8a524b10ac`。04 保持原补丁 ID，且未改 viewer。
3. 应用本次的 [ZA-19 七路径补丁](za19-after-za27-and-zb17.patch)，候选 `c991e908`，树 `5e4e3bb588a4b3a23feaa994aee856b800a2056e`。补片只含钟楼模型、活动挂载、相关测试与两个验收驱动。使用 ZB-17 `getTownNightWindow`，现场驱动核对 Presence WebSocket 加入和夜窗状态帧。

04 与本件在独立 Git 索引按序应用通过，两步树均与实际提交完全一致。新补片与旧 WS 候选 `c30eb40a` 的稳定补丁 ID 一致，除已有 ZA-27 viewer 基底变化外，其余六路径结果逐字节一致。ZA-02 结霜 CSS 仍属独立公共件。

## 证据边界

窗 A 原验收源 `81b9474`、回执 `aae432b`。Windows Chrome 从 E223/N180/Y12 步行到双账本、钟腔和塔顶，56 个检查点、639 帧实网姿态、4 张截图，浏览器错误 0，夜窗取证走当时的 Presence HTTP 接口。

旧 WS 候选 `c30eb40a` 的根端与服务端 TypeScript、生产预览及定向 24/24 已通过，其中 7 项为 Presence 实 WebSocket/轮询等服务端定向。其 Linux Chromium 在打开页面前报套接字权限错误，0 个路点、0 张截图。本次叠加只重验补片前像与结果树。新组合的浏览器实走用 `node tools/verify-za22-local.mjs clock <证据目录>`，快速核双账本用 `clock-books`。
