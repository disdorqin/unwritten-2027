# ZB-20 服务端授权风偏·公共批交接（2026-11-21）
 
- 窗号 / 自有分支 / 候选提交：B / `lane-build` / `bd68e200`；已并独立叶件 `town-blockout-integration@f7383f2b`。
- **要取的公共文件仅** `src/presence/server.ts`，B 候选内有精确差分：`git show bd68e200 -- src/presence/server.ts`。不可直接用 B 旧文件覆盖当前集成线服务端，需在当前集成尖端复放。公共服务端单写锁归公共批审取。
- 入口：在 `Options` 新增可选 `snowballWindForThrow(event,wallNow())`。只在当前 `receiveSnowball` 已完成玩家身份、手部距离和投掷速率检查后，由服务端计算已验证的水平风偏（限 ±2 m/s²）并通过 `encodeSnowballRelay` 送给邻近玩家。
- **关键协议风险**：若公共服务端开启回调，会发送 `0xff/3` 新 22 字节包。必须先确认已上线客户端读取 `decodeSnowballEvents` 的新版本，旧版读不了；旧客户端未切换前保持回调关闭，服务器仍发旧 18 字节包。
- G-09 晴雪/大风/白茫排程 `townOutdoorWeatherAt`、分区 `townWeatherExposureFor` 目前在 B 侧，集成线未必已入图。应复用已登记的权威同钟与区域乘数，**不得直接复制 B 的另一个天气时钟**。服务端回调可以由权威天气与区暴露计算，不能信任客户端附加字段。
- 客户端公共 `viewer.ts` 后续需要将实时权威天气和区域暴露传入本地 `windAtLaunch`，并将带风的远端包传至 `throwRemote(origin,dir,thrower,id,{east:event.windEast,north:event.windNorth})`；旧包则不传第五参。注意 map north = Three.js -Z。
- 实证：窗 B `bd68e200` 相关 38/38（含两人真 WS 和恶意客户端字段无效）；`node tools/run.mjs check`、`build` 通过。集成代码叶件 `f7383f2b` 已回读；公共两入口尚未挂载，所以任务状态依然 `已接领/在建`。
- 审核清单：协议混排/旧包无风/发射时相位快照/跨天气边界/从裸出生点真实两浏览器演示/断线重连/限时风暴一致性/不增加雪球额外 draw；发布需对应客户端与服务器同批。
- 本轮已读 Muse 新文件：《审计-建成未入图清单》《夜间回补清单》。
