# lane-build 分支同步及主线审核回执（2026-11-21）

- 已读：`docs/交流区/任务/ZB-17.md`、`ZB-28.md`、`队列-窗B.md`；承接 `窗B公共批-2026-11-21/ZB-17-首听公共挂载交接.md`。不更改他人归口。
- 远端核查：工作树 `lane-build` 从 `332ad39a` 经 `git fetch` + `git merge --ff-only origin/lane-build` 前进到 `36196ccc`；此前落后两提交，当前 `HEAD` 与 `origin/lane-build` 一致，初始工作树干净。
- ZB-17 核验：`node --import tsx --test tests/town-blockout-first-beacon.test.ts tests/town-blockout-presence-night.test.ts tests/town-night-window.test.ts`，15/15 通过、0 失败，涵盖主镇可听条件、首次听见记账、跨域禁止消费、单调时钟动作、夜窗不重播。**状态保留「已接领/在建」**：公共 `viewer` 正式挂载、广播与场景接点以及出生点真实浏览器验收尚未闭环，不得标已完工。
- 集成审核：`origin/town-blockout-integration` 尖端 `e87a3766`；已包含 `06b7cef0` 的首听叶件对齐。`lane-build` 的 `36196ccc` 并非集成尖端的祖先，本分支与集成线存在并发改动，直接把整条分支向集成线或 `main` 快进不成立。现有正式流程是窗 A 对共享 viewer 单写合入集成线；保持补丁交接，不用源文件强覆。
- 主分支审核：`origin/main` 为 `53465697`，是 `lane-build` 祖先，但明显落后现役集成线；把整条在建 lane-build 直接并入 main 虽可 Git 快进，却跳过 A→B→C→D 集成与真实场景验收，并不满足交付协议。**本次不擅自合并 main**，待集成线完成公共挂载、全量构建/冒烟、主干冲突审阅后再按授权推进。
- 增补全项目检查：`node tools/run.mjs check && node tools/run.mjs build` 成功，Vite 生产构建 69 modules transformed / 2.69s；有 `node:module` 浏览器外部化和大包体积警告，**非构建失败**。这不代替真实浏览器和多人验收。
- 下一验收门：窗 A 在新的集成尖端复核 `zb17-first-hear-viewer-on-4116fee7.patch`，挂载后做裸入口浏览器首听+晚加入+跨域+声音授权；再补三回响、锚点、站广播等未交部分。其他在建项按任务文件继续接单；不将无测试的在建包冒充交付。
