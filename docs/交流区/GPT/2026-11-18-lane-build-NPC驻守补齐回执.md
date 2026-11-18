基线：主线 `e4ee93fab759f8c1fb72d990a4e2add2af420757`，现役空格热修 `799b571`，施工父提交 `0ab2dc44c4de4e843d506f09679165717122f63d`。本批按《NPC新增六人台词-v1》《NPC补供稿二》和 B8/B4/集市实际实体施工。

# NPC 驻守补齐回执

坐标均为 E/N/Y。候选坐标与实际常驻分列。

| NPC | 驻位 / 交谈脚点 | 台词注册点 | 状态 |
| --- | --- | --- | --- |
| 樊樵 | **122.35 / 405.75 / 18.946**；交谈 122.35 / 404.75 / 19.242 | `npcAddedDialogue.樊樵` → `registerTownResidentStations` 的森林火点与火旁劈柴联合门控 | 实际篝火 E122.48/N407.65。由劈柴点走 2.86 m、14 样点零阻挡。随 B8 总装。 |
| 翁寒江 | **338.70 / 110.45 / 8.314**；交谈 339.60 / 110.45 / 8.374 | `npcAddedDialogue.翁寒江` → 同一 Actor ID 的湖畔火桶/主钓位门控 | 湖畔火桶 E337/N109.65，从岸边来 3.90 m、19 样点零阻挡，玩家在火桶 3 m 范围内。温泉备用 **556.08 / 163 / 15.18**；交谈 555.20 / 162.75 / 15.18，35.45 m、147 样点无阻。寒意设计 §4.3 温泉以泡汤回暖，运行树没有温泉实体火点，因此夜间仍驻湖畔。 |
| 秦知礼 | **491.75 / 74 / 12.17**；交谈 491.75 / 72.65 / 12.17 | `palaceStewardDialogue`（新模块逐字导入补供稿 §乙 25 句）→ `palaceProgress` | 大殿门侧，避开长桌和冰毯主线。门厅至交谈面 46 样点，最窄净距 0.316 m。等 B4 合线并实际传入活动状态后启用。 |
| 贾明灯 | 北巷候选 **140.60 / 114.40 / 10.000**；来客 138.85 / 114.40 / 10.000 | `npcAddedDialogue.贾明灯` → `marketStall('贾明灯')` | 候选为裸地测量，来路 11.28 m、119 样点零阻挡。等灯笼实体摊与试灯入口。 |
| 文墨生 | 西角候选 **141 / 90 / 9.648**；来客 143.40 / 90 / 9.623 | `npcAddedDialogue.文墨生` → `marketStall('文墨生')` | 候选为裸地测量，来路 10.85 m、113 样点零阻挡。等春联年画实体摊，场地坡面还需踏板整平。 |
| 胡六环 | 东角候选 **167 / 90 / 8.737**；来客 164.05 / 90 / 8.791 | `npcAddedDialogue.胡六环` → `marketStall('胡六环')` | 候选为裸地测量，来路 10.05 m、104 样点零阻挡。等套圈实体摊与玩法入口。 |

集市实树只包含糖葫芦、干果炒货、吃食、热饮四个实体摊。集市 v2 §4–5 的合批前置尚未核销，裁决 ⑮ 保留短屏修正口径。三摊主有台词代码与地面候选，等摊体、可站面和玩法入口齐备再激活。

## 验证与接线

- `town-npc.ts` 在现有 `town-npc-shared-skins` 批尾部紧凑挂载已启用的人，每人 23 盒，**+0 draws / +276 tris**。两名 B8 驻守合 +552 tris。休眠角色 count 不增长。翁寒江两处使用同一名字、存档和热点；未来只在确证温泉真实火点后按夜景切换。
- Chrome 1000×650 本地内存接线，两处 B8 位置的合法站立、真实 E 热点、原稿迎宾均通过。秦知礼默认隐藏，临时启用 B4 站位门控后验证实景站立和原稿对话。三摊未带实体时保持不可交互。全程使用一个 NPC 实例批。
- 调用 `const spots = registerTownResidentStations(npcActivity, {...})` 后把 `spots` 放入主线 `activitySpots`，沿用现有 `npcActivity.update`。参数给实测 `campfireSites`、`canStandAtActivity`、`isNight`、B8 篝火旁劈柴真实 spot 与 E337/N87 主钓位 spot；从主线 `town-zodiac` 传 `authorizedSnakeClue: lighthouseSnakeClue` 与 `canCollect: zodiac.canCollect`，旧桥洞句不会回流。温泉、摊和未合 B4 参数可暂缺。
- 秦知礼合线后由 `palaceProgress: () => palaceActivity?.state()` 激活；冰钥匙、图谱和乐谱会按实际状态选择引导。金羊仅在独立觉醒门控为真时切换已醒台词。未来三摊各自返回真实 `{ station, activity }`，对应玩法才出现在摊主菜单。
- NPC、原稿和酒馆店小二定向 7/7，客户端与服务端全量 273/273，两套 TypeScript 和 `town-preview` 构建通过。既有 Vite 预扫描旧酒馆的 `tavern.json` 报行不影响小镇彩排。
- 改动文件为 `town-npc.ts`、`town-npc-residents.ts`、`town-npc-stations.ts`、`town-npc-palace-dialogue.ts` 以及 NPC 驻守回归。台词原库与原名册入口沿用。
