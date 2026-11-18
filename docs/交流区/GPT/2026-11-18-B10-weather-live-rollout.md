# B10 天气公网部署回执

- 基线 SHA `8ad5da9d6b6d35b28edbb88fbcc874a4f8794831`，也是本批回滚点。部署目标 SHA `ec2a9736e935ddf8df34cc6ab0f1c05257990966`，发布引用 `town-preview-release-ec2a973`。
- 文件清单包括 `tests/town-blockout-weather.test.ts`、`tools/voxel-tavern/town-blockout/town-weather.ts`、`tools/voxel-tavern/town-blockout/viewer.ts` 和本批候选及部署回执。
- 接线：两端共用彩排和线上时钟推导轻、中、重三档雪势，并据此驱动飘雪、能见度和视觉积雪。B5 寒意仍从现役物理雪深取值，深雪与雪球模块、火车和联机协议路径与上一版保持逐字一致。
- 核验：根 196/196、服务端 39/39、严格 TypeScript、彩排生产构建通过。上海与洛杉矶时区各一真实 Chrome 连到同一 presence，持续 30 分钟，共 1,791 组有效采样、雪势切换 4 次、重雪样本 838 组、双端档位分歧 0、脚本异常 0。长期样本与发布 SHA 的运行文件逐字一致。
- PC 性能账：30 分钟重雪站点峰值 72 draws / 207,316 tris。定向重雪烟测，车站 67 / 202,264，广场 168 / 1,140,468。本批这些测点均低于 450 draws / 2.2M tris。
- 公网：首页与小镇页均 200，presence 容器 healthy，公网 WSS 握手 101。源站部署账本及回滚点复读一致，HTTPS healthz 响应逐字对上。

```text
town-preview ec2a9736e935ddf8df34cc6ab0f1c05257990966
```
