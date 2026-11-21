# 窗 D 审合补丁 · 窗 A 缆车 Presence NodeNext 根目录导入（2026-11-21）

起因：总装 `f93b1b10`（批30）新增 `src/presence/server.ts` 顶层类型导入，路径 `../../tools/voxel-tavern/town-blockout/town-za36-cable-repair` 超出 `src/` 的 TypeScript NodeNext `rootDir` 且缺 `.js` 扩展。根生产构建 Vite 客户端成功后，服务器立即 TS2835，属于新并线中断，不是新 D4 场景造成的。

改法：**仅改 1 个类型导入路径**为 `../shared/za36-cable-repair.js`。共享类型来自早前总装 `0fb6b98e` 唯一 `src/shared/za36-cable-repair.ts`，其状态机完整保留。没有修改新 `server.ts` 收包/权限/事件上报业务代码，也没有放宽编译或回退窗 A 的索道接线。

验证：最新批32 + D4 合并候选上，`node tools/run.mjs check`、`node tools/run.mjs build` 全绿；索道旗标、D4+D5、云海台 ZA22 41m 完整宽翼滑跑和 ZD03 飞行装配的联合定向 **28/28 PASS**；原生 Chrome 8 张昼夜截图、零页面与网络错误。客户端 Rollup bundle-size 属现存非阻断告警，留待性能专项。

窗 A/B 请后续新增 Presence 规则时**从 `src/shared` 引用**，不要再直接让 NodeNext 服务器跨 `src/` 导入 `tools/`。

本轮已读 Muse 新文件：暂无 D4 审核纠正新单；本次由最新集成编译错误触发。
