基线：主线审合记录 `e3d80765ecde9ac01b3d7165fe23847d8fb52fd2`，现役天气运行树 `ec2a9736e935ddf8df34cc6ab0f1c05257990966`，施工父提交 `b1ad8797c2fc98d219b11c7485324f847392723b`。按《全图交互铺开设计-v1》交六项。

| 项 | 实体、可玩状态与证据 | 本项模型增量 |
| --- | --- | ---: |
| 冰钓 | E337/N87、E318/N80、E368/N74 三钓位共用日志。原有咬钩手感、随机三鱼种与旧档保持，三种补齐后护照记「冰钓图鉴」。 | +0 draws / +316 tris |
| 滑冰 | 原六门计时和最佳成绩。三十六枚夜滑灯钉随夜色显示，无新增常开光源。 | +1 / +432 |
| 篝火点 | B5 的实测晚会点 E122.48/N407.65、座位、避路、3 m 回暖采用现役参数。木屋 E94.30/N263.25 和火旁 E119.98/N406.35 两劈柴点，五次节奏敲击产一份柴，四份达旺火，夜间进晚会。两处持久柴垛、木屋烟和首次围坐留存通过专项。 | 柴垛 +1 / 144–1008；火/烟复用 B5 粒子池 |
| 城堡冰滑梯 | 入口 E460.87/N50.22/Y14.28，经八级上梯，固定坐滑 9.70 m 至 E464.18/N40.32/Y12.12。28% 最大坡与减速滩，运行约 4.73 s，峰速 4.10 m/s。实地台阶/滑道/返程与城堡接驳碰撞核验；Chrome 从真实“坐上冰滑梯”热点出发，中途座姿、减速后落点正确。 | +1 / +1392 |
| 全图玩法总台 | 站厅西墙 E507.40/N326.90/Y26.14，实体牌和弹窗同数据，六站按真实运营顺序。最后 6.10 m 的 62 个碰撞及支撑样点通过。导视按已接入内容填报。 | +0 / +0 |
| 长殿点灯接力 | 起点 E378/N311.35/Y36.1，六灯站位 E375.17/380.83 × N312.88/317.08/321.48。逐灯提示 4.2 s，施工暂定 30 s 限时，成功全亮 60 s、本地前五/护照。全部站位之间 1482 个步行净空采样，最长随机路线 52.42 m。 | +0 / +60 |

## 性能复验

Chrome 1000×650，Intel UHD / D3D11，夜景，11 个相同静止视口各热身 2 s 后取 24 帧，读实际 `renderer.info.render`。同一帧先切回首钓位的批量和包围球，移除滑梯、滑冰夜灯、柴垛及新增炊烟，再恢复全候选。已有轨道、列车相位、其他场景对象和摄像头在两次渲染之间保持同一帧。该法也计入增加钓位导致原批跨进视锥的调用；分开启动两次时的列车和场景热身波动不计作 B8 增量。

| 视口 | 候选峰值 draws / tris | 同帧增量 |
| --- | ---: | ---: |
| 湖中 E337/N82 | 225 / 990544 | 0 |
| 湖西 E320/N78 | 251 / 1144748 | +3 |
| 湖东 E367/N73 | 363 / 1469880 | **+4** |
| 森林篝火 E124.41/N405.50 | 37 / 117278 | +1 |
| 木屋柴垛 E92/N268 | 93 / 403768 | +1 |
| 城堡门 E454/N67 | 81 / 243966 | 0 |
| 城堡前庭 E472/N61 | 66 / 226306 | 0 |
| 滑梯回望 E466/N42 | 494 / 1828104 | +3 |
| 长殿 E378/N311.35 | 72 / 627782 | 0 |
| 站厅总台 E507.4/N326.9 | 441 / 1854044 | +1 |
| 广场对照 E224/N174 | 261 / 1299358 | 0 |

本批观察峰值 **+4 draws**，在 +5 以内。城堡滑梯回望的同帧底场已 491 draws，候选 494，超过全镇 450 draws 参考线，单列给主窗复核绝对预算。所有视口地面站位通过，页面异常 0；实际小镇彩排构建通过，Vite 开发预扫描旧酒馆入口的既有 `tavern.json` 缺失仍有报行。

## 文件、测试、主线总装

- 湖面：`ice-fishing-activity.ts`、`lake-skating-activity.ts`。用 `createIceFishingActivity(context, grid.heightAt, () => passport.collectExtension(iceFishingCatalogueStamp.id))` 并登记 `iceFishingCatalogueStamp`，滑冰第三参 `() => nightMode`。原循环驱动夜灯，不增加灯源。
- 篝火：`town-campfires.ts`、`town-forest-campfire.ts`。保留 B5 的 `findRegionalCampfires(campfireGround)` 与 `campfireGround` 路、湖、碰撞和可站判断。以 `findForestChopSites(campfireSites, campfireGround)` 选两处，`createForestCampfire(scene, { announce: announceActivity }, chopSites, { isNight: () => nightMode })`，把 `spots` 与 `blocked` 注册到对应总装数组。森林返回的 `flames` 作为 `createTownCampfires` 第四参，已验回暖接口不改。
- 城堡：`ice-palace-slide.ts`、`landmark-ice-castle.ts`。先接 B4 南前庭和平整场地，再用 `createCastleIceSlideActivity(group, { ...activityContext, announce: announceActivity }, canStandAtActivity)` 注册热点。每帧调用 `step(dt, Boolean(seated))`，用 riding 的 `seat` 和 `pitch` 刷座姿、`ground` 作为这段现有 pose 1 的脚高。land 时离座、按 `landing` 安全落地、重置移动。普通 E/Escape 退出走 `cancel()` 的落点，传送或座状态替换走 `reset()`，避免把已传送玩家拖回路径。旁边留 E466.3/N40.4 的雪橇架候选。
- 长殿：`long-hall-relay.ts`、`landmark-culture.ts`。在护照初始化后 `createLongHallRelay(architecture.get('long-hall')!, { announce: announceActivity }, { award: () => passport.collectExtension(longHallRelayStamp.id), status: renderDedicatedRelayStatus })`；登记扩展戳与热点，每帧调用 `update`。状态输出接单独 DOM，首人称视野装不下两侧灯时仍能看见提示，计时阶段只显示进度。
- 导视：`town-rail-copy.ts`。六站现场路线长度以现有站台与步道算。站前约 50.50 m、森林灯道 19.14 m、湖南岸到现有冰钓 58.61 m（后段仅地形干地核验）、温泉西门 38.86 m。城堡南站经旧灯路到西门 77.04 m，晚于设计 60 m；B4 西绕与 B8 滑梯须总装后一起实走。未写镇站已有近期上橇位置，本回执没有六站全程一分钟实走结论。
- 测试文件：冰湖、地标复核、城堡滑梯、长殿接力、森林篝火、B5 寒意和暖源。各片区专项和全量共 271 项通过，严格两套 TypeScript 与差异检查通过。主窗口负责 viewer 总装和发布，施工候选沿现有协议。
