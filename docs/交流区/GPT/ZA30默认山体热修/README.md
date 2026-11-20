# ZA-30 默认山体热修

从分区一主干 `a569d5b` 取 `viewer.ts` 前像 `921fae33fe4aa4f3397ef365f3c6dfec14ae1861`。应用[一文件热修补片](za30-default-summit-on-a569d5b.patch)得 `48f4ca7448293e87fd77e4a46a9535b7d75edee0`，候选 `1dd1b794`。原发布针 `b1cd43a2` 上独立验贴，同一 viewer 结果。

主相机默认远裁面 2400 米。主峰 E350/N1676/Y800，从出生点朝正北的视轴深 1,496 米。远景粗模仍用已验北向世界对齐 `(300, 0, -676)` 和原雾外双面材质，实际提交为 1 draw / 1,450 tris。`summitSkyline=on` 只追加采样报告。广场合影用自己的原相机。见 [独立射线复算](za30-skyline-proof.jsonl)。

两端 TypeScript、生产 town-preview 构建与主峰、缆车、云海台、山门、坑口、三房联机定向 31/31。旧发布原生带参证据保留作历史路线回归。

## 裸链复验

在 exact 产品候选上应用[独立 QA 补片](za30-bare-qa.patch)，运行 `node tools/verify-za22-local.mjs bare <验收目录>`。选择本机 Chrome 与 D3D11 时设置 `ZA22_HARDWARE=1`。QA 使用全新浏览器、无参根链接、正常缓存初态和真实键鼠，采样真实 WebSocket、HUD 及浏览器送给 WebGL 的数据。统计类查询单独使用。
