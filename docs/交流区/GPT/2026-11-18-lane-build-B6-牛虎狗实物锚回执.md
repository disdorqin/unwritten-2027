基线：集成已核验 `3f4e2de7d7952d2c7fc86f691f94cc7b75e13adc`、线上复验 `ec2a9736e935ddf8df34cc6ab0f1c05257990966`；施工父提交 `8e1e031657a17249541612e064ec6ad3fd86d496`。蛇件独立复验树 `0d0c7152b0e03f580132e7b4f27d173eb9ff6c51`。

# B6 牛、虎、狗实物锚回执

按《生肖寻宝落地设计-v1》锚点表和裁决⑯，三处实体与拾取面同批。新版生肖图集在三件真实挂载时才解锁对应护照谜面与拾取，未挂载保持「尚未现身」。

| 挂件 | 真实物件与拾取位置 | 行走与碰撞 |
| --- | --- | --- |
| 牛 | 原集市第三摊后，E155.80/N114.25/Y10；挂件 E155.80/N113.86/Y10.24 | 原四摊、试吃 ID 保留。干草垛遮挡正面，从后面有视线。E153.86/N98.50 → N114.25 → 拾取，17.69 m，356 个原场景干地无阻采样。拾取盘半径 0.40 m，与最近试吃盘边沿相隔 4.522 m（设计至少 1.5 m）。 |
| 虎 | E129.48/N404.65 老松第一分杈，拾取脚点 E129.38/N403.41/Y21.75472；距实测篝火中心 7.616 m | 三个实体落脚面支撑跳跃，保留反向逐级下树。基点 Y18.75472，三个台面相对 +1.43/+2.20/+3.00 m，第一跳从外侧较高干地发起。连续实际净升 0.681/0.770/0.800 m，均低于 1.255 m 跳高，逆向逐级可下。篝火边到起跳点 3.446 m，17 个路段样点和 442 个物件占地样点通过。 |
| 狗 | 实际住宅 `district:410:343` 外邮箱，拾取 E417.07/N345.25/Y53.93328 | 同一个外置信箱，拾取与纪守信明信片分别 E417.07/N345.25、E417.07/N344.48，各半径 0.29 m，中心相隔 0.77 m。实际房屋门区至两盘共 94 处行走/地形/障碍采样和交互优先验证。 |

本地 Chrome、Vite 内存总装三处热点。依次在真实场景拾取站位核对 `walkable/obstructed`、`currentAction`、实例可见、收藏、浏览器存档，三个均通过。该浏览器项是站位与真实入口检查，连续抵达/返程由上表的场景采样和跳跃专项提供。三件都只拾取一次，保存键仍为 `unwritten.zodiac.v1`。蛇件新谜面、旧存档和锁住的金羊均由各自现有口径处理。

## 渲染与接线

两套严格 TypeScript、实际 town-preview 构建和本批十项定向测试通过。客户端与服务端总计 261 项通过。

- 牛草垛并集市原批，+0 draws / +396 tris。狗邮箱并住宅原批，+0 / +96。虎老松及三落脚、雪冠一批，+1 / +768。三件共用原结构的多角色生肖实例图集，每件 52 tris；同一场景复用一个 atlas draw，远距或已拾取不占实例。这里是本批新增场景资源账，整合总帧仍随主线复验。
- 文件：`landmark-market.ts`、`extension-streets.ts`、`town-zodiac-tiger-anchor.ts`、`town-zodiac-dog.ts`、`town-zodiac-atlas.ts`、`town-zodiac.ts`，以及集市、虎、狗和三件共图集四份测试。
- 主线沿用 `0d0c715` 的蛇件坐标和文案。将单一 `createTownZodiacSites` 工厂导入切至 `town-zodiac-atlas.ts`，旧 `town-zodiac-sites.ts` 的已验锚数据和对话继续使用；别创建第二份实例网格。三个新 ID 按真实挂件挂载启用，无需提前加到 `createZodiacProgress([...])`。
- 牛：`zodiacSites.mount(architecture.get('market-stalls')!, marketOxSite)`。虎：`buildTigerZodiacAnchor(grid.heightAt)` 入 scene 与 `geometry()` 分块碰撞对象，再 `zodiacSites.mount(tigerPine, tigerZodiacSite)`。狗：现有 extensionStreets 构造成功且 `dogMailbox` 存在后，用 `zodiacSites.mount(extensionStreets.group, dogMailbox.charm)` 和 `createZodiacDogPostcard(dogMailbox, activityContext)` 入热点；`group` 当前使用世界坐标且保持 identity transform。
- 施工窗仅交三件候选。金羊仍封存，蛇件复审状态沿用主窗口回执。