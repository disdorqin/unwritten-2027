基线 SHA：2e07e0b0109260a3824229524a91d3e5984894ea（现役与回滚点）。

# B1 小未驻留版部署回执

- 部署目标 SHA：0c4b601ecf18b71a9d93c41d87a83cdea90c382e，发布引用 town-preview-release-0c4b601。
- 文件：tests/town-blockout-mascot.test.ts 与 town-blockout/{town-mascot,town-npc,viewer,wish-activity}.ts。
- 接线：许愿树驻留、28 段自主巡游、NPC 模型实例批。
- 测试：客户端 184/184、服务端 39/39，源站 web 与 presence 生产镜像均构建并启动，presence 健康。公网首页与小镇页 200。
- PC 账：原签验许愿树 164 draws / 669,610 tris；驻留增量 +0 draws / +1,200 tris。本轮复用了钉死并审核过的运行树。
- 从源站经公网 HTTPS 获取的 healthz 逐字核对通过。

```text
town-preview 0c4b601ecf18b71a9d93c41d87a83cdea90c382e
```

现役与回滚 SHA 已写入源站台账，两个旧镜像保留。
