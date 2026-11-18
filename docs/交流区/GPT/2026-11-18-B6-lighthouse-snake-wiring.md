# B6 蛇件灯塔接线回执

- 基线候选 `bcc3e88da0ad62a0426e0b193d3d44ac7ddf90e9`，原现役基线 `8ad5da9d6b6d35b28edbb88fbcc874a4f8794831`，蛇件复审 SHA `e203902db87271baaba176c9b5330df8992d6621`，分支 `town-r8-b6-lighthouse-snake-review`。本批部署目标尚未放行。
- 文件为 town-zodiac、town-zodiac-sites、town-npc-added-dialogue、viewer 四个 TS 文件，两份对应测试，以及 Muse 新谜面原稿。
- 护照和翁寒江线索共两处分用 Muse 原文，源码中的旧桥洞线索已移除。西塔基 E402.05 / N78 / Y12 注册蛇件，用现有生肖实例网格与本地存档。定向实测沿干地路径采样，站位、渲染批挂载、互动触发、写入护照并阻止重复拾取均通过。
- 根 195/195、服务端 39/39、两套严格 TypeScript、彩排构建通过。网格几何 52 tris/实例，复用同一个 draw，蛇件视距内增加 52 tris。公网现场与整批 PC 范围待复验。
- B6 还剩牛、虎、狗锚点和宫殿金羊解锁。蛇件目前在复审分支。
