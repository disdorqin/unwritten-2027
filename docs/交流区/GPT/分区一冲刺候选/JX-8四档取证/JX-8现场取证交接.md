本轮已读 Muse 新文件：《工包 JX-8·攻防自由形态》《玩法与场景口径修订（晚）》§1、《未写镇雪墙自由堆砌设计》《联络轮审核-1946》以及自由雪墙旧浏览器原件回执 `2c8e664`。

# JX-8 发布版对照与浏览器取证交接

Git 发布版 `75859a094757c5dcee8b874eef86ec37f4204907` 与检索时集成 `aa8ab90` 的自由雪墙、雪橇碰撞、presence、viewer 和对应测试无差分。现役已接自由堆墙及撞墙四档，无需复用旧堡垒正式模式或重新合线。

## 实际取证

```sh
node --import tsx --test --test-isolation=none tests/town-blockout-snowfight.test.ts tests/town-blockout-sled-retune.test.ts tests/town-blockout-sled-wall-impact.test.ts tests/server/snowfight.test.ts tests/server/plaza-snowwall-protection.test.ts
```

Linux Node 24.22.3 定向 **25/25**、0 失败，2270.964079 ms。两端 WS 实收 8 m/s 清 [3]、15 m/s 清 [1,2]（此前已清顶层）、22.01 m/s 清全部 [0,1,2,3]，45.2 m/s 正确上报 46。骑乘真实步进夹具 24.0440032766→16.8308022936 m/s，过四层后保留 70% 速度。合法自由点、拒放区、晚加入与仪式清理回归通过。

旧原件 `2c8e664` 的 Chrome A/B 已验长按取雪、三层互见与三发雪球打塌。它还在旧撞墙阈值下实滑 6.85 m/s 清一层，仅作为历史浏览器证据。当前 Chromium 156 在 Linux executor 打空白页之前因 `process_singleton_posix.cc:297 socket() EPERM` 退出，发布版四档浏览器实滑未取证。

## 下次原生浏览器验收

`verify-jx8-native-browser.mjs` 已通过 `node --check`，从锁定发布 SHA 的全新工作树运行。它在独立 loopback 应用上使用两个 Chromium 上下文，按实际键鼠输入驱动，观察两端 WS 清层、原生 HUD 和位置，并收截图。计划文件可单档运行，只提交已实地选线的速度档。`bandsNotRun` 会列出余档，四档齐全才满足整包门。可用的 `band` 为 `under-8`、`8-to-15`、`15-to-22`、`over-22`，每段提供墙格 `gx/gy`、纵向 `axis`（`east/north`）、朝行进轴的 `sign`（+1/-1），以及装料、布墙、上橇的 `setup` 和碰撞的 `run` 键鼠动作列表。支持 `destination`、`press`、`hold`、`click`、`drag` 和 `mouse-hold`，动作可指派 A/B。尚无实地跑通的计划文件。准备完成后在 GitHub Actions Linux 用以下入口。

```sh
JX8_INPUT_PLAN=/path/to/surveyed-plan.json JX8_BROWSER_URL=http://127.0.0.1:4173/town-blockout.html node --import tsx <集成工作树>/tools/verify-jx8-native-browser.mjs
```

现役地形与实际雪橇函数的候选线搜索有 6、10、17 m/s 合法终点若干，5 橇架/3° 步长直线扫未找到 22.4–22.7 m/s 的合法终点。采样未纳入实体遮挡和实际玩家转向，不能代替该段实滑或单独用于销账。沿旧试路线 16 m 广场铺地只适合低档；高档需更长合法路线或实测下坡、转向、漂移组合。补做广场和转运站等现役雪橇架扫描。加入实际铁路台板及坡道支撑、森林和街景阻挡后，最接近上档的直行线由过山车站向东达到 20.305339 m/s。未筛出合法且可碰到四层墙的 >22 m/s 直行点。`survey-jx8-sled-approaches.mts` 属地形约束预筛，需在发布检出的 tools/ 运行；正式验收仍使用真实原生控制。
