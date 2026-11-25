已读分区一冲刺领单、08:46 全线总攻令、DB-1、DB-2、JX-18 各自回执及 JX-18 工包。

# DB-1、DB-2 与 JX-18 候选组合复验

基线 `e1931a717320edc87f223ccf0303256da2149881`。在独立检出同时应用了第九声音频节点、移动雪人靶接线和内置浏览器引导重试候选。三份附件收录在 `3b45ee6`、`fcdb709`、`9220f92`。候选对原树 `git apply --check --whitespace=error`，组合后 `git diff --check`，两者通过。JX-18 的入口 HTML 加载层保留 DB-2 的移动靶 HUD；DB-2 的 viewer 接线区与 DB-1 的塔钟音频文件独立。

```bash
node --import tsx --test --test-concurrency=2 tests/town-blockout-{ninth-bell,hook-one,clocktower-function,moving-range,snowball,snowball-world,snowball-board,ice-palace-snowball,snowfight,movement,entry,touch-controls,viewport,desktop-look}.test.ts
npm run typecheck
```

14 个测试文件 **85/85**，失败 0；根 TypeScript 退出 0。为候选定向复验。DB-2、JX-18 真 Chromium 独立工作流跟踪实际输入和请求，DB-1 正式天气、到场计数与双端音频另验。DB-4 按 `f60062d` 进入午间上线后的 OPT-1。
