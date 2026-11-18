基线 SHA：0c4b601ecf18b71a9d93c41d87a83cdea90c382e。

# B1 主审状态回执

- 审阅候选：c34ac0554323f908a3ffe7c4b7a565e7a28c50e3。
- 文件清单：presence/{protocol,server,start}.ts、Compose、viewer/页面、town-presence.ts、mascot-follow.ts、town-mascot.ts 与对应测试。
- 接线与放行：许可范围是 OWNER_KEY 挑战、0xFFFE 跟随、离线回巡游。69abe49 的车板、冰鞋、干池沿在合入最终树时复用；目前等待现役版本合成和源站发布通路。
- 测试：同期旧审根 188/188、服务端 40/40、双端跟车与撤演员通过，权限与最终树需再核。
- 性能账：旧审许愿树 277 draws / 1,323,108 tris。
- 本轮合成候选 b49ca72f7e4ee26cd62097b6719e81a0620f559e，基于当前集成头 cb6311b。跟车从现役车厢读取变换来定位小未，火车文件与基线逐字相同。新增文件清单含 hot-spring-soak.ts 的池沿读点。重跑根 191/191、服务端 40/40，真实 WS 覆盖合法会话、访客越权拒绝和断线撤演员。根与服务端 TypeScript、彩排构建通过。实景跟车和回巡游待该树再测。
- 部署目标 SHA：尚未钉定。未部署。
