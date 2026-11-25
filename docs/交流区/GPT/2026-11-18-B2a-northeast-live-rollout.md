基线 SHA：0c4b601ecf18b71a9d93c41d87a83cdea90c382e（现役及回滚点）；集成钉头 bbd45151b116faaceb6eea5151bd952ac9c5e3c9。

# B2a 广场东北角装饰部署回执

- 部署目标 SHA：ad45e1813735852760bd22427c3a9eb4af2418f7，发布引用 town-preview-release-ad45e18。
- 文件：tools/voxel-tavern/town-blockout/scenery.ts 及原候选审合文档。独立移植 b68e4f7 的东北角提交，scenery.ts 与其逐字相同。
- 接线：P17 四只雪人、P19 骏马冰雕、P22 三个静态雪包，沿用现役广场边界。完整扩界和戏台迁位继续独立处理。
- 测试：根 184/184、服务端 39/39，源站双镜像构建通过，公网首页与游戏页 200，presence 健康。
- PC 账：原 RTX 4060 同文件四机位峰值 200 draws / 1,103,060 tris，四机位均 +0 draws / +1,032 tris，1,411 路线采点零阻挡，保持 92 门。
- 公网 HTTPS healthz 逐字核对通过。

```text
town-preview ad45e1813735852760bd22427c3a9eb4af2418f7
```
