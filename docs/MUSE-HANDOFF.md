# Muse 接手任务书

更新于 2026-11-17。以 `disdorqin/unwritten-2027` 的 `origin/town-blockout-integration` 为基线。六处新互动从提交 `c0a2200` 起可试玩。请从当前集成分支建自己的工作分支，PR 目标也选 `town-blockout-integration`。

```sh
git fetch origin
git switch -c muse/a4-town-polish origin/town-blockout-integration
```

如果已按本任务开了分支，请先同步最新集成分支。旧 `town-blockout-main` 含 A3 灰盒和旧 A4 验收记录。本轮的四桥与地标路线、暖房门槛、灯塔楼梯和钟楼施工已在集成分支推进，复验位置和遗留事项见 [小镇步行复验](TOWN-BLOCKOUT.md#2026-11-17-步行复验)。如有并行工作分支，按最新集成版复跑涉及路线再提交 PR。

## 第一包 · 路线复验与地图收尾

1. 从四条短路走回广场，再验外环、四座桥、纪念馆前庭与西侧露台回程。记录实际卡点和坐标。
2. 复验酒馆就座、邮局盖戳、舞台鼓掌、灯坊点灯、冰湖五球、广场祝福挂卡。每处给一条入口到交互点的简短路线。
3. 复核暖房门口与 `layout.json` 中门口、接点的定义，复核灯塔步行支路的连续性。有差异时提交最小修正，并复验两侧通道和碰撞。
4. 更新旧 A4 记录中的版本、实测路线和遗留项。随 PR 给出可以复现的问题与实机截图。

## 第二包 · 钟楼内部收尾

按概念图 B02–B04，逐段走通钟厅、表盘层与钟室。补齐必要的楼梯转角、护栏、齿轮、铜钟和梁架。沿用塔身比例、广场落点和现有入口。验收包含从正门走到钟室再回到广场，检查沿途卡碰撞和掉落。可以与第一包分开提交。

## 工作范围

Muse 负责地图复验、路口修正和钟楼收尾。主线负责纪念馆的参观动线、展品互动与联机。需要共改 `viewer.ts`、`layout.json` 或公共协议时，在 PR 描述里注明涉及的坐标和测试路径。

- [当前小镇试玩路线](../tools/voxel-tavern/town-blockout/LANDMARKS.md)
- [施工任务和共享坐标说明](TOWN-BLOCKOUT.md)
- [建筑概念图索引](../assets-source/concept-art/README.md)
- [Muse 上轮 A4 验收记录](https://github.com/disdorqin/unwritten-2027/blob/fd7859d5a08dc7117ffd4ede1e49361ce83027e7/docs/TOWN-BLOCKOUT-ACCEPTANCE.md)
