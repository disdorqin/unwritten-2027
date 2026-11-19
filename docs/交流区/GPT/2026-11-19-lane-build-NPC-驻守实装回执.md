基线 SHA `4c050b27969a1fba0edce487ab517d392e5a9813`（集成线与发布树）；开工 `0ea1e4d`，场景复验用其产品等价 `f2dde6a` 合成树。期间主窗加入 C2 cue/festival 及 viewer 接线，驻守、地形与 NPC 原文源文件不变。

# NPC 驻守落地复验

| NPC | 驻守 E/N/Y | 交谈脚点 E/N/Y | 台词注册与激活 |
| --- | --- | --- | --- |
| 樊樵 | 122.35 / 405.75 / 18.945520 | 122.35 / 404.75 / 19.242463 | 现役 `npcAddedDialogue.樊樵`；`registerTownResidentStations` 取实际森林火点 E122.47759/N407.65367/Y18.37874 与劈柴热点。 |
| 翁寒江 | 338.70 / 110.45 / 8.313988 | 339.60 / 110.45 / 8.373581 | 现役 `npcAddedDialogue.翁寒江`；湖畔真实火桶 E337/N109.65/Y8.22622 配主钓点。蛇件仅用现役 `lighthouseSnakeClue` 定稿。 |
| 秦知礼 | 491.75 / 74 / 12.17 | 491.75 / 72.65 / 12.17 | 发布树中的运行时台词模块未找到。候选 `palaceStewardDialogue` 的 25 句来自现役仓中《NPC补供稿二-汤守礼仪官戏台联-v1》§乙原文，等主窗传入 `palaceProgress: () => palaceActivity?.state()` 才激活。 |

B4+B8 本地 Chrome 合成通过 3/3 现场交谈。按生产碰撞移动到现场，路径采样分别为 17/17、9/9、14/14，实际 E 打开原稿首句，并复验翁寒江的灯塔蛇谜。三人演员脚点和交谈脚点均为干地。无 B4 旗标、无真实火/玩法时保持休眠。贾明灯、文墨生和胡六环等市场批次的真实摊与交互。

## 同机位性能

Intel UHD D3D11，Chrome 1000×650，同机位每侧 40 帧，驻守关闭→三人启用。draws / tris / p95 ms。

| 视口 | 关 | 开 |
| --- | ---: | ---: |
| 森林 | 60 / 126,224 / 12.6 | 60 / 127,052 / 8.5 |
| 湖畔 | 281 / 1,042,832 / 12.6 | 281 / 1,043,660 / 16.7 |
| 宫殿 | 240 / 1,047,326 / 16.7 | 240 / 1,048,154 / 8.4 |

同一帧还测得实际 NPC 实例批次 289→358，三人各 23 盒，+0 draws / +828 tris。对照低于 PC 450 draws / 2.2M tris，页面异常 0。C2 仪式过程与驻守同时出现的帧时未验；截图为本地 QA 对照。

## 文件与审合

- `town-npc.ts`、`town-npc-residents.ts`、`town-npc-stations.ts` 保留现役 NPC 和小未的同一个实例批。通过连续尾段处理驻守和小未近远显隐，原跟随路径和信息采用主窗现役。
- `town-mascot.ts` 只需主窗摘取批尾偏移和计数适配；`mascot-follow.ts` 是施工线补齐的既有现役依赖。`town-npc-added-dialogue.ts`、`town-zodiac.ts` 及《给GPT-蛇件新谜面与接线-2026-11-18》对齐定稿；主线既有时继续使用主线。
- `tests/town-blockout-npc-stations.test.ts`、`tests/town-blockout-npc-added-dialogue.test.ts` 回归真实依赖门控、活跃/休眠批、同帧小未可见/隐藏和台词源。秦知礼模块沿 `ae72baa` 的原文源。
- lane 根与服务端 301/301，驻守与生肖定向 10/10，现役等价合成的 NPC/小未回归 16/16。两套 TypeScript 与差异检查通过。
- 主窗把 `registerTownResidentStations(npcActivity, …)` 返回点加入 `activitySpots`，给真实 `campfireSites`、`canStandAtActivity`、夜景、森林柴点、主钓点和 B4 进度入口。正式总装和已上线世界的逐人复验待主窗。
