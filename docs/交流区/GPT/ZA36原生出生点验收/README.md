# ZA-36 · 严格无参出生点验收——部分证据 / 未过门

窗 A · 2026-11-21；使用 `town-blockout-integration@64a5cd5cbb91621456b7b1c18096f26d19c06156` 的场景源码，源树 `a81fda2430006eaeb53ed08ae17149889974648a`；浏览器 QA 工具为同窗口未提交的增量修改（已随本回执补齐源码提交，原始运行时修改与提交后的差异见工具 diff）。

- 环境：Windows Chrome，`ZA22_BARE=1`、`ZA22_HARDWARE=1`、独立 `town-preview` Vite 构建、NodeNext Presence 全编译，原生无参 URL `/`，不带 `?profile`。使用真实浏览器的正常渲染循环、WebSocket 会话与输入。
- 正式构建 **通过**；Presence 报 `Town presence listening on 58472`，客户端本人 `join ok`，浏览器 HUD/WS 读取 **E223 / N180 / Y12**（真实出生点）。
- 原生 Chrome 截图 `spawn-bare.png` 已实际写出，PNG 头 `89504e470d0a1a0a`，34,396 字节，SHA-256 **`8c94bd4346c4ac2535d81cbcef9340314fad7c19cb9fc4bf97856285794f8819`**。该截图未在视觉层独立复读，不能仅凭 PNG 存在宣布“景色读感合格”。
- 浏览器 `requestAnimationFrame` 2.15s 的原始测量仅 **3 个有效间隔**，平均 508.27ms、P95 766.5ms、推算 rAF **1.97 FPS**。这是**远端无头浏览器刷新节拍**，非真实 GPU 绘制 FPS，也不是坑沿或坑底测点，不得用于“坑沿达广场 80%”判定。
- 事件流随后第二个 Presence 会话 `join timeout`，整个工具跑到 120 秒外部超时；旧版 QA 没有在截图前写 JSON，`za22-live-walk.json` **未落盘**。所以**浏览器 0 错、真实截图视觉通过、坑口/坑底帧率、连续实走均未证明**。未将这次验收标为成功。
- 修正：QA 工具新增 `ZA22_BARE=1` 可选裸链入口和独立 `spawn` 阶段，保留旧 `?profile` 方案；NodeNext presence 从只编译 `index.ts` 改为 `tsconfig.server.json` 全图编译（第一次失败缘于缺失 `presence/start.js`），加入断点即时保存 `spawn-native-cadence.json` 以免下次后续截图超时丢失数据。请在低负载远端/真实 GPU 浏览器复测；再次运行前确认既有测试进程已退出。

复跑命令（仓根，Windows Git Bash 环境）：

```sh
export ZA22_BARE=1 ZA22_HARDWARE=1
node tools/verify-za22-local.mjs spawn docs/交流区/GPT/ZA36原生出生点验收
```

验收未闭合：ZA-36 山口 A/B 裁定、坑沿→坑底→绞盘与广场的**同机实际 FPS 对照**、全程原生截图+真 WS、装扮密度对照及旧 ZA31 的 TypeScript 测试兼容性问题。回滚本 QA 增量：删除两脚本中的 spawn / bare / rAF 采样逻辑即可，游戏内容不受影响。

本轮已读 Muse 新文件：自 `64a5cd5c` 复拉至 `dc512e5f`，无本线有关的新增 Muse 变更；保留总控 ZA-36 两选一待裁。
