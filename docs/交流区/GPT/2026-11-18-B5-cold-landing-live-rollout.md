基线 SHA：7e2821d254bfa6086e37c1753c058427ba406856（现役及回滚点），集成基线 f72b680f614e9a9e6712b4b58dc3adaea41e9f40。

# B5 寒意跌落部署回执

- 部署目标 SHA：8ad5da9d6b6d35b28edbb88fbcc874a4f8794831，发布引用 town-preview-release-8ad5da9。
- 文件：town-blockout.html、town-blockout/{landing-feedback,landing-snow,market-fair,scenery,town-campfires,town-frost,town-lights,town-mail-activity,town-mail-sites,viewer}.ts、style.css、两份 B5 定向测试及回执。
- 接线：湿冷及无光雪面曝露，外围五处暖源、座位和热饮，第一人称跌落压缩、趴倒与起身。依据物理裁定选复用现役就座变体，旁观端收到既有 pose 1，不改协议；12 粒落雪用独立暂态批。与部署前源码逐字核对，presence、雪球、深雪及火车文件一致。
- 测试：根 191/191、服务端 39/39、根 TypeScript、彩排生产构建、差分检查通过。Chrome 五机位页面错误 0。源站双镜像构建及容器启动，HTTPS 首页和小镇页 200，presence 健康。
- PC 账：俯瞰 287/1,511,486，广场 146/1,089,166，森林 53/148,152，冰钓 80/353,718，温泉 52/178,564（draws/tris）。落雪只在播放时提交一个 12 点 draw。单步 0.05 ms 差值未核销；广场三火点随完整 B2a 接线；原硬件落差姿态 8 的旧记录不充作本版实景复验。
- 原计划先 B5 后 B9。视为返工件，B9 放行后重接 B5 得到本批。公网 healthz 实测逐字核销。

```text
town-preview 8ad5da9d6b6d35b28edbb88fbcc874a4f8794831
```
