基线 SHA：0c4b601ecf18b71a9d93c41d87a83cdea90c382e。

# B14 爆竹主审回执

- 文件：src/presence/{personal-fireworks,server}.ts；tests/server/presence.test.ts；tests/town-blockout-{market-fair,personal-fireworks}.test.ts；tools/voxel-tavern/town-blockout.html；town-blockout/{festival,landmark-market,market-stall-banners,personal-firework-activity,personal-fireworks,town-presence,viewer}.ts。另含施工回执。
- 接线：候选新增 join.firecrackers、event/personal-firework、personal-firework-rejected，三货独立限流并复用粒子池。现役公共烟花和雪球原事件保持。新增联机消息触及本轮协议零改，需确认本批事件层是否属于许可。
- 测试：目标树重新执行根 187/187、服务端 40/40。原预检双 Chrome 三货互见与五区拒放通过，宫殿密室待 B4。
- PC 账：原预检十人挂鞭 218 draws，峰帧 16.7 ms，P95 12.6 ms，约 10.47 KB/s 出站。原回执未给该机位总 tris。
- 预检目标 SHA：6c18abafa7d123a767545f1585d8f999fd548fe6。未合入、未部署。
