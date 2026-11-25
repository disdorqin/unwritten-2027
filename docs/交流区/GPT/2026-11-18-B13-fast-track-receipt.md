基线 SHA：88dac01455162477073d41a2422cee8f5cb63d9f。

# B13 百门通快轨候选补回执

- 文件：tests/town-blockout-{chronicle,house-portals,shared-home}.test.ts；town-blockout/{district-layout,extension-streets,landmark-shared-home,landmark-village,town-chronicle,town-house-door-book,town-house-portals,town-npc,viewer}.ts；town-house-door-book.css。
- 接线：共享屋册页、机械生成门册、真实地面与占位择点、原门回退、淡出与 C1 落位竞态。viewer 待在最终集成树逐行对现役。
- 测试：重跑根 183/183、服务端 39/39。上轮真 Chrome 核验 92 门、18/18 进出、淡出淡入 510.8–531.9 ms。
- PC 账：屋内 2 draws / 6,024 tris；RTX 4060 Laptop 冷路线 E543.6/N412 396 draws / 1,757,282 tris，峰帧 150 ms，超过 A6 的 50 ms；预编译试验峰帧 191.6 ms，已撤回。
- 候选 a08ee7533c7de5f8583b215881632dc97f1b7f6d。部署目标 SHA：无，A6 尚未通过。
