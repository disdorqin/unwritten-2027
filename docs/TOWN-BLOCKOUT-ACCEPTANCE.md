# A4 集成验收记录：town-blockout-integration @931c166（2026-11-17）

按 docs/TOWN-BLOCKOUT.md 的 A4（集成与验收）职责，对 `town-blockout-integration` @ `931c166` 做阶段验收。GPT 侧工作仍在进行，本记录是阶段验收，不是最终合并决定。本文件放在主助手分支 `town-blockout-main` 上，未直接改动 integration 分支，避免干扰进行中的工作。

## 分支状态（2026-11-17 查）
- `main` @ `5346569` 未动（初搭任务书），无 PR。
- `town-blockout-ground` @ `8182246`：地形与可走预览，2 个提交。
- `town-blockout-integration` @ `931c166`：在 ground 之上 +9 个提交，最新 2026-11-17 09:48 CST，是当前主力线。
- `town-blockout-main` @ `6bd1626`：A3 灰盒单文件版，与 integration 是重复实现，待定去留。

## 已验证（实测，非看提交信息推断）
1. **生产构建通过**：完整下载该分支 `tools/voxel-tavern` 后，`npm ci` → `node build-tavern.mjs`（生成 gitignore 的 tavern.json）→ `npm run build` 成功。townBlockout 包 336.6 KB（gzip 160.1 KB），tavern 包 1,189 KB，仅有 chunk 体积警告。
2. **运行时渲染正常**：本地无头 Chrome（1280×800，软件渲染）打开 `town-blockout.html`，无 JS 报错；俯瞰下雪夜全镇完整（钟楼、河与四桥、冰湖、灯塔光束、旋转木马、四区街区、森林与路灯）。页面自报 65 处建筑与设施 · 1311 株树。
3. **第一人称可用**：可切入第一人称（广场出生点正对钟楼）；点击画布聚焦后 WASD 可行走并有位移（软件渲染帧率低，位移速度不代表真机速度，真机速度待验）。
4. **跳转坐标准确**：「前往 → 纪念馆入口」落点为 东 350.0 m · 北 249.0 m · 地面 23.0 m，与 layout.json 中 memorial 的 connect [350, 249, 23] 一致；菜单共 19 个地点（广场、四街区、两街巷、12 地块）。
5. **跨年预演可触发**：点击后出现 3 秒倒计时显示（本地试玩版）。
6. **内容抽查**：museum-catalog 的 12 个月展品带出处 URL 与图片授权/署名，十二月按 LANDMARKS.md 说明留空待事件发生后更新。
7. 控制台仅 2 个 404：favicon 与 `buildings/index.json`（见下条偏差 1），后者在代码里已做静默兜底，不影响使用。

## 与任务书 / PLAN 的偏差和欠项
1. **B3 交付形式不同**：任务书要求 GLB + `index.json` 交付到 `tools/voxel-tavern/public/town-blockout/buildings/`；integration 改走代码程序化建模（`landmark-*.ts`）。viewer 的 GLB 替换通道已经实现（`loadBuildings()` 读取 `buildings/index.json`，校验 id/file/colliders/floors/ramps 后替换），但仓库里没有该目录、没有任何 GLB，通道为空。需决定：接受程序化路线并修订任务书，或按原规格补交 GLB。
2. **钟楼二层以上暂无步行通道**（LANDMARKS.md 自记欠项）。
3. **暖房 door 坐标**：layout.json 中 glasshouse 的 door 为 [362, 96]，在其地块西边线（365.5）外 3.5 米（A3 分支 2026-11-16 已标注此疑点）。integration 的暖房是西向入口，该点更像门前接点而非任务书定义的「入口中心」，应修正坐标或改注说明。
4. **灯塔无正式支路**：terrain 以 connect→door 直线段生成路面、野地可走（与 A3 假设一致），是否接受待确认。
5. **状态文档未更新**：README / docs/PLAN.md 尚未反映 integration 进展；预览中的信件（本机寄存）、旋转木马、跨年预演均为本地试玩，不是 PLAN 的联机正式版；新联机（P2）、真机性能、公网部署仍未做，不能计入已完成。
6. **未验证项**：四区回广场的四条短路 + 外环全程步行、钟楼/酒馆/邮局逐栋门洞与楼梯、其余建筑入口与碰撞逐项 — 需真机或更长的自动路线测试补齐。

## 建议下一步（待 Thomas 定）
- 以 integration 为主线开 PR 回 main；`town-blockout-main` 灰盒分支留档或删除。
- 修正暖房 door 坐标（或改注为门前接点）。
- 后续精修时同步更新 README 与 PLAN 的状态段落。

验收人：Muse（游戏分支对话，A4 角色）。本地验证副本与截图保留在验收方工作区，未入库。
