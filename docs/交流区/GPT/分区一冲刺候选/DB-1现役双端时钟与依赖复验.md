已读《审单-DB-1-DB-2-DB-4冲刺候选-严规逐项》（8a5efce）、《钩子一号》H1/H2、《地表生态与天气》O1/O5、《天象事件》TX2、《声音与音乐故事线》Y2、C-18、R3-19/R3-41，以及 09fb26e、3b45ee6、现役 75859a0。

# DB-1 · 现役双端时钟与依赖复验

- 同一台 Windows 机，从 75859a094757c5dcee8b874eef86ec37f4204907 起原版 `createPresenceServer`，用两个独立 WebSocket 回传三组真实 `clock` 包，客户端各走 `createTownPresenceClock` 的原算法。同组两端服务器 epoch 相同，估计钟端差为 0.075 / 0.172 / 0.162 ms，最大 RTT 0.899 ms。原始输出见 [db1-clock-transport-proof.json](./db1-clock-transport-proof.json)。
- 为检现役整点边界，向两端校时后读数加同一个测试偏移，跨普通日北京 20:00；两端触发同一时刻 1795262400000、普通三声。此轮实测共钟运输和触发函数，普通第九声实播、远端网络、耳听和实际方位单列待验。
- 两个同名会话实际获 peer 1、2。同名重连实际获 peer 3。`server.ts` 的 `createPeer` 给传输会话分配编号，WS `join` 读昵称；poll 的 session token 也绑定当次会话。`ceremony-arrival` 发跨年落位。现役未提供可跨会话验证的稳定玩家 ID、逐整点的在镇权威记录或第 3 次计数。此位应从宿主确认的参与身份和整点镇域资格读取。
- O1/O5 写极光夜抑制第九声，TX2 写全图天气总档与运营排期。现役 `town-weather.ts` 只输出 light / medium / heavy 三档雪，发布源码中 `auroraAtHour` 仅候选规划器消费，分窗 lane-build/C/D 未见正式源。接线需 O1/TX2 给出按整点查询的全图状态，待确认时 viewer 保持现役播放。
- 建议落地接线与验收入口在 `viewer.ts` 的普通 `dailyTowerChime` 分支。复用 `presence.serverNow`，在通过权威判定的同一 cue 规划八声及第九声，套已审声音节点与 C-18「西边偏上」的真实听者坐标。首晚 20:00、跨年零点、00:10 分别按各自分期裁定承接。01:00 等其他现役静默时段继续由现役整点源控制，若需范围更改以专门裁定为准。

复跑 `node --import tsx tools/verify-db1-clock-transport.ts`；该脚本单独以 tsc Bundler 模式严格检查通过。规划器及现役钟楼定向 17/17；生产文件差异为零。
