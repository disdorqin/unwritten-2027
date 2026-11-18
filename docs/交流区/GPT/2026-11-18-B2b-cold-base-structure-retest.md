基线 SHA：8ad5da9d6b6d35b28edbb88fbcc874a4f8794831。

# B2b 戏台结构最新基线复验

- 合成候选 1eb899e3552247bbc469d2e6a88f99b6c8f8d06e。审阅分支 town-r8-b2b-after-cold-review。
- 文件：layout.json、district-layout.ts、scenery.ts、town-npc.ts、community-theater.ts、landmark-village.ts、屋门/道路/舞台/小镇回归，以及施工回执。
- 接线：纳入四屋 6548dd7 与戏台 56bc848，南址 E238/N140、西坡、四层看台、18 m 棚盖和迎未牌坊。东北角保留一套，pavers/柱帽同批并保留 B5 火点容量与 setCampfirePieces。戏台模块与次窗口复验树逐字相同。
- 根 192/192、服务端 39/39，差分与小镇彩排构建通过。Chrome 在实际广场及舞台入口运行，页面异常 0。广场 E223/N180 158 draws / 1,066,418 tris，舞台 E238/N152 75 draws / 312,062 tris。
- 部署目标 SHA：无。新舞台双机位、照片 48 人同框、正式小未见证位和合影入站判定仍欠联验。候选保留现役合影协议与站位。
