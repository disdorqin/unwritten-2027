基线：主线已核到 `9a8d52ae62651c7ae269415d32b749aa67f0a1e5`（天气发布运行树 `ec2a9736e935ddf8df34cc6ab0f1c05257990966`）；施工父提交 `668675e8019303a1a6630da60d47c8be2532f241`。本批为可摘取的 lane-build 施工候选。

# B4 冰晶宫殿返工回执

按《冰雪城堡宫殿扩建设计-v1》《B4 冰晶宫殿独立审合与退回复验》和六机关返工要求，落实体主殿、南北翼、主塔、南前庭迷宫、石窟、王座后密室、画廊密室、塔梯下前厅和宝物间。四座原塔、西门、旧观景台和其个人最佳仍在。实体热饮台、十二处长桌座位和四件旧冰雕展项有场景落点。

| 退回条目 | 本批证据 |
| --- | --- |
| A1 单人密室链 | 16×8 墙图在 0.27 m 玩家半径下，从入口到石窟约 60 m，门闭时取不到钥匙。三块 1.2 m 实体雪块各有凹槽，推行没有压死主线。压力板半径 0.55 m、垂直容差 0.45 m、离板 1.5 s。 |
| A1 连续通关 | 本地 Chrome 头距 1.8 m、步升 ≤0.43 m，用生产 `supportAt / obstructed / tryMove` 和同一活动适配器逐步检验。只在西门 E460/N72/Y12.12 放置一次玩家，之后 .25 m 移步执行 15 次真实热点。配重雪块 → 冰钥匙 → 王座活门 → 雪松/帆船/冰灯塔 → A2/B4 → 低/高/中三钟 → 开门 → 二次验钥，进度 `completed:true`。开门后 44 小步（11 m，模拟步速 7.5 m/s），低于 20 s 门限。松板、超时重拉和两间限时密室的内部安全出口另有状态测试。由内出门不会重开验钥时窗或恢复铃锁权限。封闭梯下密室的唯一东门实测不能绕过。 |
| A2 王座 | 就座 3 s、任期 5 min、离座逾 10 s、第三次已确认受击退位。数值原样。登临、空位两段本地事件经专项测试。双端抢位、全镇广播、戴冠外观和受击场景由主窗口总装后复验。 |
| A3 塔顶竞速 | 西门原踏板、原 3.09 m 观景台均保留。主塔实际登至 24.5 m，浏览器逐步登顶敲钟后走楼梯返回。主塔 16 短跑以 ≤0.27 m 踏阶消化 21.41 m 净升，替代原 27 步只够 7.29 m 的剖面；主塔中心移到局部 [11,−12.65] 留出旧东北塔。新终点单存 `towerBestMs`，与 `balconyBestMs`、机关及既存未知字段互写保留。 |
| A4 碰撞与成本 | 平整地块的取样中心独立为 E484/N65/Y12、48×52。建筑原点仍 E484/N72/Y12。前庭 735 个整数采样干地平整，实际南门路径 E486/N54→62 通行。六米西接驳候选 3458 个横向/纵向点干地，避轨、避墙，中心沿程单步高差 ≤0.0225 m；原南站路未切换。前庭闭门、钥匙在位、三雪块合批为 6 draws / 3,728 tris（网格账）。 |

## 浏览器同机位

Chrome 1000×650，Intel UHD / D3D11，单机位预热约 2.4 s 后取末 20 帧，`renderer.info.render`。Vite 内存临时接入总装适配器，基线使用旧城堡与旧地形取样。三处实测窗口内数据稳定。

| 机位 | 施工基线 draws / tris | B4 候选 draws / tris | 增量 |
| --- | ---: | ---: | ---: |
| 西门广角 E452/N72 | 63 / 210242 | 73 / 221802 | +10 / +11560 |
| 南前庭 E476/N43 | 130 / 428580 | 144 / 444176 | +14 / +15596 |
| 王座 E498/N71 | 73 / 237362 | 74 / 245210 | +1 / +7848 |

三点都低于全景 450 draws / 2.2M tris。南前庭完工版有一轮测到 144 draws / 444176 tris，比设计估算的约 +12 draws 高 2；早一轮同机位为 137 / 440384。取高值交审，主窗口合成需重复采样。

## 文件、验证、总装申请

- 建筑与地形：`landmark-ice-castle.ts`、`ice-castle-refinement.ts`、`ice-palace-expansion.ts`、`ice-palace-maze.ts`、`ice-palace-forecourt.ts`、`ice-palace-site.ts`、`town-extension.ts`。交互与存档：`ice-palace-activity.ts`、`ice-palace-landmark-activity.ts`、`ice-palace-progress.ts`、`ice-palace-puzzles.ts`、`ice-palace-race.ts`、`tower-chime.ts`，以及 B4 三份测试。
- 施工树客户端与服务端合计 256 项通过（B4 定向 18 项），两套严格 TypeScript 和 `town-preview` 实际 Vite 构建通过。Vite 开发服务器预扫描旧酒馆入口仍报既存 `tavern.json` 缺失，实际小镇页面跑通且预览产物构建完成。
- 将 `createIcePalaceLandmarkActivity(group, { ...activityContext, announce: announceActivity }, { canStand: canStandAtActivity, warmFromDrink, onToast, onRaceStatus, throneChanged, playerName })` 挂在主线 `registerLandmarkActivities` 的 `ice-castle` 分支。推入 `activitySpots`，并从 `activities` 注册 `blocked` 和逐帧 `step(dt, walking && !boardingGround && !homeReturn ? { x, n, ground, grounded: airHeight === undefined, seated } : undefined)`。热饮 60 s 冷却、举杯 2500 ms 走既有回暖/本地表现。另取 `onRaceStatus`，保留旧观景台 HUD；调用 `confirmedHit()` 仅在现有去重后的、`event.confirmerId === me` 合法确认分支。
- 现有就座/屋顶屏蔽会拦王座普通 P2b 命中，且现役无通用客户端广播。请按主线裁决决定受击方权威例外和公共 announce，别打开整片室内雪球。排双端：一人连续 3 秒、离座逾 10 秒、5 分钟、三次独立已确认命中、戴冠/争夺互斥及两行广播。
- 南站至西门现有铁路尾段与新墙图重叠，切换到 `icePalaceForecourt.stationTrail` 的 6 m 西绕道，保留平台、原西门与主轨。接入后亲走从楼梯脚 E496/N34 到西门全段再放行。
- 待主线仍有秦执礼台词与常驻锚、布置轮换宝物及展示、宫殿联动生肖和镇志、冠框照片和前庭 P2b 雪仗热区验收。当前完走凭冰钥匙和本地进度。独占总装、发布均由主窗执行。
