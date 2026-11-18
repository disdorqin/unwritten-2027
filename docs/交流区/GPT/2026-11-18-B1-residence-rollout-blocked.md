基线 SHA：993c5683eefa53269653264bfb538c15d831b05d。现役预期回滚点 2e07e0b0109260a3824229524a91d3e5984894ea。

# 小未驻留部署阻塞回执

- 文件：tests/town-blockout-mascot.test.ts；town-blockout/{town-mascot,town-npc,viewer,wish-activity}.ts。
- 接线：许愿树休息角、自主巡游 28 段、NPC 模型实例批。已在集成线，远端发布引用 town-preview-release-0c4b601 已核。
- 测试：本轮重跑同运行树 97bcbde，根 184/184、服务端 39/39。与签验目标仅差 Muse 裁决文档；严格 TS、彩排构建与 Chrome 模型渲染见原预检。
- PC 账：许愿树近机位 164 draws，668,410 → 669,610 tris，增量 +0/+1,200（原实测）。
- 部署目标 SHA：0c4b601ecf18b71a9d93c41d87a83cdea90c382e。预期 healthz 为 town-preview 0c4b601ecf18b71a9d93c41d87a83cdea90c382e。
- 未部署。Windows SSH 严格校验缺主机信任记录且无 SSH agent。公网 TLS 重置，独立执行环境无法直连，腾讯云控制台转至登录页。本轮未取得实际 healthz。
