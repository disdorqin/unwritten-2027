# B6 蛇件独立部署回执

- 基线 SHA `ec2a9736e935ddf8df34cc6ab0f1c05257990966`，回滚点相同。部署目标 `60f9e8984059f293ea0abf86b64df6050b3daa5e`，发布引用 `town-preview-release-60f9e89`。
- 文件清单：`town-zodiac-snake.ts`、`town-zodiac.ts`、`town-npc-added-dialogue.ts`、`viewer.ts`，以及 `town-blockout-zodiac-snake.test.ts`、`town-blockout-npc-added-dialogue.test.ts`。
- 接线：灯塔西塔基 E402.05 / N78 / Y12，走近按 E，个人存档 `unwritten.zodiac.v1`。两处替换 Muse 新原文（护照谜面、翁寒江 NPC 线索），公网 JS 已核对旧桥洞原句不存在。现役协议逐字相同。独立发布仅启用蛇件。
- 测试：根 197/197、服务端 39/39、严格 TypeScript 和小镇构建通过。Chrome 测试从 E408/N84.35 的灯塔接近位置进入，沿正式地形和碰撞用键盘步行到 E402/N78.1，拾取、刷新后存档均通过，页面脚本错误 0。先行设置仅为测试起点，不入生产树。
- PC 账：354 帧，局部峰值 226 draws / 1,071,884 tris。蛇牌 1 draw / 96 tris。
- 滚动初次构建用了默认非彩排模式，核日志发现后已用 `TOWN_REHEARSAL_BUILD=on` 重建同一 SHA 的两个镜像并复核，沿用现役 presence 覆盖文件。公网首页和小镇页 200、WSS 101、presence healthy、双 SHA 账本一致。
- 公网 `/healthz` 回包逐字符核对如下。

```text
town-preview 60f9e8984059f293ea0abf86b64df6050b3daa5e
```
