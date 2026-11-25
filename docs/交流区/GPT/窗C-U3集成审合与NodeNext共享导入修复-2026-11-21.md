# 窗 C · U-3 9,046 块水晶洞最新集成审合与 NodeNext 构建阻断修复（2026-11-21）

**本回执属于源码集成审核，不代表水晶洞已挂载默认玩家/−140m 域，不申请直接发布。**

## 真正审核基线与不覆盖策略

- 统一根：`D:\computer learning\game_exe\kuanian`；自有分支 `lane-c`，隔离审核工作树 `.worktrees\window-c-integration-review`，不改仍有未提交变动的正式根工作树。
- 主干基线 `origin/town-blockout-integration=278d1ddd`。先在 D 盘已登记的隔离审核树执行基础 `node tools/run.mjs check` 与主峰工坊测试，**check PASS、工坊 3/3 PASS**；说明旧审单在 `064f0104` 观察到的 12 项主峰测试 TypeScript 错误已经被后续主干修复。
- U-3 旧四笔原始建模 `e9e14ab7`、`8d864c6e`、`7f92b38c`、`3a59a308` 已逐笔无冲突重放。新两笔 `a06d92fb`、`4137389c` 原样 cherry-pick 会撞到主干**已删除**的旧 `docs/交流区/任务/U-3.md` 和已被他窗更新的 `docs/交流区/队列-窗C.md`，因而**停止并撤销第五笔冲突拣选**，之后仅按文件白名单从 `origin/lane-c` 导入 U3 最新单体源码、专项测试、Chrome 夹具、六张截图/JSON 和独立回执，不恢复旧任务文件、不覆盖共享队列。其他主干代码不被 C 美术改写。
- U3 场景总 9,046 个实例化实体：62 原生晶簇、289 格浅水、三根 8m 层晶与月光石银灰侧洞纯视觉预制；共 8 材质批次；U8/U15 采矿、真实地下宿主与战斗权威仍隔离。

## 根构建红灯定位与精确修复

- 最新主干 `src/presence/server.ts` 原使用 `../../tools/voxel-tavern/town-blockout/town-za36-cable-repair` 的 **type-only** 进口。该源归 `tools/`，在 `tsconfig.server.json` 的 NodeNext/`rootDir=src` 约束下导致 TS2835；仅补 `.js` 又引发 TS6059 + 工具侧 TS2835，并非充分修法。
- 服务器已有**唯一正规共享契约** `src/shared/za36-cable-repair.ts`，且 `src/presence/cable-line-authority.ts` 已直接从 `../shared/za36-cable-repair.js` 导入同名类型。审核树验证：只将 `server.ts` 这一处 **type-only** 路径改为 `../shared/za36-cable-repair.js`，不改修缮状态机、事件、网络消息或玩家权限。
- 该路径改正后，最新基线 + U3 组合 **`node tools/run.mjs build` PASS**（Vite 既有大 chunk 警告），`node tools/run.mjs check` 先前已 PASS；恢复正确导入后继续依照干净的最终组合做 Gate 核验。和 `main-summit` 历史 12 错不是一个问题。

## 验收与正式缺口

- U3 新场景专项 `tests/town-blockout-underground-crystal-cavern.test.ts` **9/9 PASS**，含三晶柱、侧洞、0.27m 胶囊线路净空、禁非法矿点/收益。
- Presence、缆车状态、地下井口/黑屏交接相关 6 组真实测试文件 **51/51 PASS**（采用正确共享类型导入），共 **60/60**；测试范围不等同于全项目回归。
- `node tools/verify-underground-crystal-cavern.mjs` 在此隔离审合树再次真实启动 Chrome：6/6 机位 PASS、8 或以下 draw calls、105,084–108,552 triangles、零浏览器报错；独立夹具仅用于造型审图，非默认玩家第一人称。
- 源码合入本身不等于 `-140m` 世界挂载、多人真实移动、U-15 跨层关口、玩家 E、碰撞/怪物/矿物授权或移动端 FPS 的通过，U3 正式任务**仍为在建**。宝库/别窗主线与发布线未修改。
- **本轮已读 Muse 新文件：** 对 `3b3c7b0b..278d1ddd` 相关任务/提单差异核查未发现新 U3 归属变更；重核《任务书-水晶洞细化》《地下层补充-陨石坑入口与洞内风格》和窗 C 七轮/四齐门槛。

**审合门：** 自有 `lane-c` 已推 `4137389c`；总装只允许基于远端实时最新尖端普通非强推更新。远端若移动或根回归出现新红，则保留审核候选、不强推、不覆盖其他窗口。
