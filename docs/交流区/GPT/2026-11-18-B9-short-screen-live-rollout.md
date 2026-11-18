基线 SHA：ad45e1813735852760bd22427c3a9eb4af2418f7（现役、集成与回滚点）。

# B9 短屏修正部署回执

- 部署目标 SHA：7e2821d254bfa6086e37c1753c058427ba406856，发布引用 town-preview-release-7e2821d。
- 文件：tools/voxel-tavern/town-blockout.html、tools/voxel-tavern/town-blockout/town-panel.css。
- 接线：仅短屏控制面板滚动范围及聊天同级结构。对照次窗口 06d8239 的最终两文件，B5 的额外霜层 DOM 留随 B5；市集分批按裁决⑮未带入。
- 测试：合入完整树根 184/184、服务端 39/39、差分检查通过。原短屏树在 667×320 的实际 Chrome 游戏页验证三维画布、折叠面板和页面异常 0。线上 web 与 presence 双镜像构建，首页与游戏页 200，presence 健康。
- PC 账：仅 HTML/CSS，场景几何增量 0。继承东北角发布的场景性能账，本批无新增绘制。
- 经源站访问公网 HTTPS，healthz 逐字核对。

```text
town-preview 7e2821d254bfa6086e37c1753c058427ba406856
```
