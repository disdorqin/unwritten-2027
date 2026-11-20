# ZA-30 默认山体热修

从分区一主干 `a569d5b` 取 `viewer.ts` 前像 `921fae33fe4aa4f3397ef365f3c6dfec14ae1861`。应用[一文件热修补片](za30-default-summit-on-a569d5b.patch)得 `48f4ca7448293e87fd77e4a46a9535b7d75edee0`，候选 `1dd1b794`。原发布针 `b1cd43a2` 上独立验贴，同一 viewer 结果。

主相机默认远裁面 2400 米。主峰 E350/N1676/Y800，从出生点朝正北的视轴深 1,496 米。远景粗模仍用已验北向世界对齐 `(300, 0, -676)` 和原雾外双面材质，实际提交为 1 draw / 1,450 tris。`summitSkyline=on` 只追加采样报告。广场合影用自己的原相机。见 [独立射线复算](za30-skyline-proof.jsonl)。

两端 TypeScript、生产 town-preview 构建与主峰、缆车、云海台、山门、坑口、三房联机定向 31/31。旧发布原生带参证据保留作历史路线回归。

## 裸链复验

在 exact 产品候选上应用[独立 QA 补片](za30-bare-qa.patch)，运行 `node tools/verify-za22-local.mjs bare <验收目录>`。选择本机 Chrome 与 D3D11 时设置 `ZA22_HARDWARE=1`。QA 使用全新浏览器、无参根链接、正常缓存初态和真实键鼠，采样真实 WebSocket、HUD 及浏览器送给 WebGL 的数据。统计类查询单独使用。`north`、`mountain-bare` 和 `crater-bare` 可独立运行。山门专场在新 Chromium context 选择游戏原有鼠标拖拽回退，真实鼠标按下、拖动、释放。山门与坑口使用正式 Presence 服务入口及受控测试日程，分区开窗和线包仍从真实服务产生。

- 北望已验。真键从 E223/N180/Y12 到 E235.8/N180/Y12，朝北微仰。WebGL 连续两帧索引哈希 `2706687782` 命中同一已测绘粗峰，视轴峰深 1,578.210 m、远裁约 2400，每帧 1 draw / 1,450 tris。全程 4 点 / 21 位姿 / 0 错。`za30-default-summit-native-north-v3a/north-summit.png` SHA256 `dd336ebc5ab5ca8f57329ea4fb672d75f132ceb998a2d43600ce8a03110853d0`，JSON `6b7ffbee6417a6ce058308cdf78eab18ec70a9395d65ccfdd41366688e43dccc`。
- 坑口已验。独立新上下文从 E223/N180/Y12，跨西域到 E−70.7/N159/Y10.78，真实授权后跨沿到 E−71.8/N159/Y10.77，退出到 E−67.3/N159。18 点 / 385 位姿 / 0 错。原件 `za30-default-summit-native-bare-v3/crater-inside.png` SHA256 `ccc4cb56fdeef52343302dd8fd3d7b9d2a34ac0369f809d64d7db88378a53e54`，聚合 JSON `52d89e0cef188100bee449ae02dd6675043536a221d60931241881ae244550f9`。该 JSON 的北望探针和山线锁鼠尝试已分别转独立复验。
