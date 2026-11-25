本轮已读 Muse 新文件：《分区一冲刺领单 A/B》（e1931a7）、《分区一断点说明》（e1931a7）、《联络轮 0816 催单》（ce0cfe5）及 B4 移动靶场审核（3761cf5）。对版《分支预总装冲突表》（5bcaa61，B4 行）与已审候选 c8c93df。

# DB-2 移动靶场生产接线候选（2026-11-20）

- 基线 `e1931a717320edc87f223ccf0303256da2149881`。开工时集成头 `dc82b279fd011a42a8ad7b68c594cf4e6fa79cf7`，中间提交仅交流区文件，五个候选文件均以基线对版。
- 候选 `DB2-production-candidate.patch`，SHA-256 `f0be0295d589738bcbe16e74d69af5bf670a3a03a65e6494527312714827c343`。5 文件，276 行新增、6 行删除。`viewer.ts` 三处为 `practiceTarget` 构造和 HUD、`createTownSnowballFight` 事件分发、动画帧移动前刷新。保留 NPC/小未构造、宫殿/雪墙/雪球榜回调与团队雪仗控件。逐文件核 `git diff --check`，TypeScript 客户端入口退出 0。

| 验收项 | 实测证据 | 复验入口 |
|---|---|---|
| 60 秒闭环与独立计分 | 真正 `createTownSnowballFight` 和 `createSnowballSweep` 组合下旧球不计、当轮首次命中 0→1、重复/NPC/偏离/到期命中不计、59,999 ms 显示 1 秒、60,000 ms 仅结算一次并复位 | `tests/town-blockout-moving-range.test.ts` 第二项 |
| 净空与碰撞同步 | 5,875 个时点，10 ms 步长，E221.84–224.16/N173/Y12，现役道路侵入 0，距最近仪式点 1.410 m。移动后雪球扫掠和走路阻挡命中实体新位置，走原位置不误判 | 同文件第一项 |
| 渲染与旧靶回归 | 复用一个实例模型，22 盒 / 264 三角，静止打中回弹、0.34 秒还原，离局恢复原阻挡。40 项定向包含移动、雪球、扫掠、榜单、冰宫和攻防程序回归 | 同文件第三项、下列命令 |
| 实机操作 | Linux Chromium 在浏览器进程初始化时因 Unix socket EPERM 退出，未加载场景。移动端操作与正常速度手瞄待实机验证 | 现役页面选择「雪团练习场」，查看「开始移动靶练习」与 HUD，捏雪、瞄准投中、等结算，再复验触屏 |

```bash
git apply --check DB2-production-candidate.patch
git apply DB2-production-candidate.patch
git diff --check
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test \
  tests/town-blockout-moving-range.test.ts \
  tests/town-blockout-snowball.test.ts \
  tests/town-blockout-snowball-world.test.ts \
  tests/town-blockout-snowball-board.test.ts \
  tests/town-blockout-ice-palace-snowball.test.ts \
  tests/town-blockout-snowfight.test.ts \
  tests/town-blockout-movement.test.ts
```

上述测试在 Node v24.22.3 实跑 40/40，失败 0，约 3.6 s。本件为局部接线候选与定向证据，留分区一按严规审核及实机复验。
