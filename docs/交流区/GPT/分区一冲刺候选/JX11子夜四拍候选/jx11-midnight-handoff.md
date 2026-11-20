# JX-11 子夜庆典四拍隔离复验

已读《工包-JX-11-子夜庆典流程骨架》（d6119d3）、《任务书-庆典线守岁与未央过顶》§1–3、《矛盾裁定修订登记·第三轮》钩子项、《四项裁定》零点传送、《仪式滚动批任务书》C1 与《除夕烟花秀编排细化》YH2。窗 B 领单 67b0bd8，底座为现役发布 75859a094757c5dcee8b874eef86ec37f4204907。

现役 `town-ceremony.ts` 已有零点、正钟与烟花 cue，`src/presence/server.ts` 与 `town-presence.ts` 已有 server 时间戳传送，但未找到守岁星起止 cue。候选仅在原 director 增加 23:52 起与 00:09 止两条 cue，同时以 `watchStarVisible` 保存当前时间窗，供后续天象渲染和迟入恢复读取。现役烟花编排与传送路径不迁移，不增加仪式文字。

| 四拍 | 北京时间 | 两端回环记录 |
| --- | --- | --- |
| 守岁星开始 | 12-31 23:52:00（T−480 s） | 前一毫秒为 false，两端同时出 `watch-star-rise` |
| 全员广场传送 | 01-01 00:00:00 | T−10 s 真实 WS 发送预告与预分配，两个会话独立取主环槽 0 / 1，正式落位目标 `startAt` 同为 T。首正钟同时发生。 |
| 第一发主秀 | 01-01 00:00:01 | 两个 director 相同 `fireworks-main` 并调用现役编排投递；首发由首炮表 + 飞行时间实算 T+1 s，T+999 ms 前未发。正钟 12 声、2.020 s 间距不变，主秀 54+28+20 发。 |
| 守岁星没入 | 01-01 00:09:00（T+540 s） | 前一毫秒仍 true，两端同发 `watch-star-set`。模拟快钟和慢钟经服务端校准同步，校时回退后同一 cue 不重播。 |

本次证据来自环回 127.0.0.1 临时 presence，使用真实 WebSocket 协议、服务器 join 下发 epoch 以及传送帧。设备时间偏差 +7.5 s / −12 s 为测试输入。迟入新会话得到实发边缘槽，初始化直接恢复星窗，已过去的正钟、主秀和露头未重播。23:52→00:09 按庆典线分钟表共 17 分钟。正式观测星体外观、角度曲线、天顶构图、夜场对位和仪式文本由后续相应工包验。

原有广场合影是手动召集共钟功能。生产 viewer 在传送时调用 `plazaPhoto.leaveForCeremony()`，本次保留此行为。回环回归含三端同一邀约、名单冻结和 48 个真实 WS 会话进合影名册。尚未发现现役自动散场合影 cue，候选未把它加进四拍；正式三场与过顶停拍继续单列 JX-26。

旧稿写「23:59 传送、倒计时 60 秒」，较晚四项裁定明确正式零点落位，C1/YH2 是 T−10 s 发预告与预分配；本次保留已经上线的服务器 T 目标与 C2 既有首发 T+1 s，未落实不同版本的 +0.5 s 或 15 分钟新烟花编排。按第三轮保护口径，零点不增加普通第九声；00:10 散场远钟独立。

| 原件 | 核验 |
| --- | --- |
| `jx11-cadence.patch` | SHA-256 `0f9dd28d81480f018070a7a70fce1a84f8f669600f3306b0141ad59684edd10c`。仅 `tools/voxel-tavern/town-blockout/town-ceremony.ts` 及 `tests/server/presence.test.ts`。 |
| `jx11-four-beat-loopback.json` | 截自真实回环测试原诊断，SHA-256 `843de0f5dc09068ac5864accbfcba4fc7a347103f2fc1b8f39eac1100a782777`。 |
| `jx11-loopback-transport.log` | 指定八个服务端网络测试 8/8，0 跳过（日志有检测时刻、会话号、状态；无访客数据）。 |
| `jx11-cue-regression.log` | 仪式／烟花／合影／钟楼四文件 28/28；全仓 `npm run typecheck` 与两个相关源的定向 strict 检查均 0，`git diff --check` 通过。 |

候选基于发布线 75859a0。核查独立 `lane-build` 后，发现其旧 director 使用 `lastNow = now`，少了发布线 `Math.max(lastNow ?? now, now)` 的回拨防补播，且服务端测试文件并非同一 blob。生产合线应以发布线防重播行为为准。

```bash
node --import tsx --test --test-name-pattern='JX-11|ceremony preassigns|presence joins beyond|rehearsal clock|plaza photo relay|48 live WebSocket' tests/server/presence.test.ts
node --import tsx --test tests/town-blockout-ceremony.test.ts tests/town-blockout-ceremony-fireworks-clock.test.ts tests/town-blockout-plaza-group-photo.test.ts tests/town-blockout-clocktower-time.test.ts
```
