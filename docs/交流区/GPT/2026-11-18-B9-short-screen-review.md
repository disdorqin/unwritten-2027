基线 SHA：47b25ae1b3fc033ef04cd87ad72c844a8f8e56f5。

# B9 短屏候选主审回执

- 文件：tools/voxel-tavern/town-blockout.html、tools/voxel-tavern/town-blockout/town-panel.css。
- 接线：修正 div 闭合和聊天同级结构，短屏控制区独立纵向滚动。已逐文件隔离 dfd5c63 的两处短屏文件，按裁决⑮退回市集分批。
- 测试：根 184/184、服务端 39/39、diff check 过。Chrome 用真实 HTML 和 CSS 校验 667×320、844×390、1440×900；最短屏面板在 y=8–312，内容可滚到尾；聊天为固定定位的同级节点。彩排构建通过。另在真实构建页以 667×320 横屏启动，三维画布加载、页面异常 0，面板实际点击折叠后下沿从 312 px 到 68 px。
- PC 账：仅 DOM 与 CSS，场景几何改动 0；全场帧未重采。施工回执对账现树 4 摊，分批 6→18 待优化。
- 候选 SHA：7259ba02d07ce1116fb1308b7ecc74d21d465b8f。部署目标待最终集成并复验。未部署。
