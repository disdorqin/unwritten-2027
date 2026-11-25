# 窗 D 总装审合回执 · B 索道权威 NodeNext 构建门禁修复（2026-11-21）

**性质：跨窗集成缺陷修补，不擅改玩法定义；请 B 窗和主窗口复核。**

- 基线：`town-blockout-integration` 的 B 批 `61737395` 在 `node tools/run.mjs build` 的客户端打包后，于 Presence 服务端 NodeNext TypeScript 阶段失败：
  - `src/presence/cable-line-authority.ts` 直接跨 `rootDir=src` 导入 `tools/voxel-tavern/town-blockout/town-za36-cable-repair`。
  - 去掉扩展名时报 TS2835；仅补 `.js` 又报 TS6059（目标文件在 `src/` 之外），所以纯改扩展名不是安全修补。
- 实施：将 B 批原样 `Za36CableRepair` 状态机与全部类型放到 `src/shared/za36-cable-repair.ts` 作为**唯一算法事实源**；原 `tools/.../town-za36-cable-repair.ts` 仅重导出，保留旧 API/导入路径，未保留双份实现。Presence 从 `../shared/za36-cable-repair.js` 导入，满足 NodeNext 与 `rootDir=src`。原 Stage `dormant / one-station / full-line`、9 次锈击、轮组、四配重、状态版本、仅首次开线返回 `opened` 均不更改。
- 实测：本地 D 盘新工程 `node tools/run.mjs check`、`node tools/run.mjs build` 正式全通过；`tests/server/cable-line-authority.test.ts` + `tests/town-blockout-cable-repair-host.test.ts` + `tests/town-blockout-za36-cable-repair.test.ts` 及窗 D 主峰模型四套回归合计 **20/20 PASS**。注意客户端 bundle-size 提示仍为警告，不能冒充性能最终验收。
- 约束：不激活正式缆车、改夜窗规则、伪造离线重放或绕开服务端权威。B 窗之后应以新的 `src/shared` 为唯一代码入口增补规则，防止未来双实现漂移。此次是因跨窗合并和全量构建失败触发的最小可重现修复。
- 用户已确定根目录：`D:\computer learning\game_exe\kuanian`。窗 D 工作树 `.worktrees\window-d`，不生成额外 C 盘工程副本。

本轮已读 Muse 新文件：无新增；仍按七轮制与主窗口并线规程复核。
