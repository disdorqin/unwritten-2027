# B13 百门通现役基线复审

- 基线 SHA `8ad5da9d6b6d35b28edbb88fbcc874a4f8794831`，快轨候选 `a08ee75`，复审候选 `cd6e0e36d93711f74ddb859f10dd040534eafd01`。
- 文件清单由 `git diff --name-only 8ad5da9 cd6e0e3` 核对。测试为 chronicle、house-portals、shared-home。接线文件为 district-layout、extension-streets、landmark-shared-home、landmark-village、town-chronicle、town-house-door-book（含 CSS）、town-house-portals、town-npc、viewer。
- 门册覆盖 92 个门，保留原门返回及现役广场定时到场兼容，`src/presence` 与基线逐字一致。此前快轨回执仍可查。
- 根 193/193、服务端 39/39、严格 TypeScript 和彩排生产构建通过。
- 性能账沿用已标明基线的实测记录。旧候选室内 2 draws / 6,024 tris，跨区最高约 150 ms，旧样本有两处超 450 draws。最新候选的 18 条冷路线与 A6 50 ms 门槛仍待复验。
- 部署目标 SHA 暂未放行。候选 SHA 仅供复审，本批无已部署回执。
