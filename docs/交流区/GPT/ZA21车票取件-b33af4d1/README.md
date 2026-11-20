# ZA-21 售票窗与图鉴取件

底本 `b33af4d16c09d79ca06e1ee148d7751f7f93b7e3`，票据候选 `8b1a8e0846895e13ffc6956edf953cd7bb84c3cf`，结果树 `ce041effde440af81d0102454cb1a7eaa83506a4`。从 lane-a 原件 `29f28cd654b96726490913b23f136436da556ff6` 机械取四文件，[补片](za21-station-ticket-on-b33af4d1.patch) SHA256 `2501f26b82b5fce91bdda72d5fb1ec8dadde3ea3e1a94b81ae18232311fabb75`。验收后已拉取主干 `05dc1e09`，新增 ZA-15 门册两笔，不涉及四文件。补片已在最新树的临时索引严格验贴。

viewer 前像 `921fae33fe4aa4f3397ef365f3c6dfec14ae1861`，结果 `f78d2936a779ea9c77526633241bfa578cdf0d92`。仅新增引入票据模块、护照扩展图鉴戳、同一站体登记领取和查图鉴动作。座标、ZA-22、ZA-27、时钟和联机主干保持现版。

车站、护照和原夜间车次测试 5/5，根端和服务端 TypeScript、生产 town-preview（272 模块）构建通过。旧 [Windows 实走回执](../2026-11-20-ZA21售票窗实走回执.md) 原验收源 `f8ae836`，50 点、939 位姿帧、0 错；本轮未重跑浏览器。旧验证脚本补片与 04/ZA-19 同文件参数和入口存在文本冲突，保持主干现版验证器。

本站票据与本机收藏图鉴可单独取件。当前主干的 04 已搭建 `town-night-beacon` 和 `town-night-window` 实时通道，viewer 尚无信标接收器。后续午夜广播接同一个 `presence.onTownNightBeacon` 的 `stationBroadcast` 效果，使用正式时刻表、审核素材及 G-03 白望山现身条件。本件不挂广播、人物或身份授权。

本轮已读 Muse 新文件：无新增。
