# 窗 B 交 A 窗 · viewer 公共批包（2026-11-21，总控 13:00 裁定第 1 条）

viewer.ts 是单写公共文件。本包两段由窗 B 备好，请 A 窗在本轮公共批里与星港坪传送修复一并落（一次动文件、一次过门）。若 A 本轮回执未落此段，窗 B 下轮持公共批锁代落（先在交流区喊单）。

## 基线与证据

- 基线：主干 `town-blockout-integration` @ `f9c88551`（批8）。
- 落法：按顺序在仓根 `git apply` 两段 patch（两段改动行不重叠）。
- apply-check 证据（窗 B 于 pristine `f9c88551` worktree 实测，2026-11-21）：
  - `git apply --check zb28-phase-viewer.patch` → 通过；apply 后 `git apply --check zb17-first-hear-viewer.patch` → 通过；
  - 两段全落后 viewer.ts 与窗 B 本地暂存栈（`705571b5`+`77b401f1`）的 viewer.ts **逐字节相同**。
- 过门证据（窗 B 本地栈上）：tsc 0；定向测试 21/21（guard-duty/guard-scenes/za31/first-beacon/night-window）＋ first-beacon/night-beacon 11/11。

## 两段内容

1. **zb28-phase-viewer.patch**（ZB-28）：`updateGuardPosts` 的值班判定由 `shift==='night'` 粗二值改接 `za29GuardDutyForPhase(presence.getTownNightWindow()?.phase)`，import 同步。依赖：同批的 ZB-28 叶子包（guard-duty/guard-scenes，窗 B 本地 `705571b5`，总控批推）——叶子先行或同批均可，viewer 段单独落会缺 `za29GuardDutyForPhase` 导出而 tsc 红，请与叶子包同批。
2. **zb17-first-hear-viewer.patch**（ZB-17）：文件尾接 `createTownFirstBeacon`＋信标接收器（钟声走 `festival.playThirteenthBell`），首听图鉴条目静默追加护照面板。叶子 `town-first-beacon.ts` 已在主干，无额外依赖。入梦链以此段落定为齐（总控裁定语）。

## 附：对 A 窗对齐一项（总控已转，备查）

烟花摊位坐标口径：现行实现摊位在 (154, 97.5)（viewer 已接线）；旧 `personal-firework-stall` 的柜台位 (154, 109.65) 已裁定归档，A 场景件以 97.5 为准。

## 追补 · 第三段（窗 B，2026-11-21 13:2x）

3. **zb29-snowman-viewer.patch**（ZB-29 包 2b）：景观层挂载注册雪人场景（守位六尊＋老雪）、夜相位变化时以本地玩家注视作观察者跑 ZB-29 夜 tick、每帧推进转头、雪人旁出现「拍拍雪人」交互。依赖：ZB-29 包 1/2a（`town-snowman.ts`/`town-snowman-scene.ts`，窗 B 本地 `b66587d5`/场景件提交）须同批或先行。基线同为 `f9c88551` 系（在前两段之后 apply；与前两段改动行不重叠）。老雪落点暂锚镇公所门前 (186,216)，待老宅锚点勘定移位（数据一行）。

## 追补（2026-11-21 第 2 轮·形）：第四段 ZB-30 湖面玩法挂载

- 文件：`zb30-lake-play-viewer.patch`（在前三段之后 apply；已在本地栈顶基线 apply-check 通过）
- 内容：冰车骑行接管镇域移动分支（A/D/方向键=撑杆）、风筝放/收/收放线/断线拾回、陀螺台一杆＋本地榜一行字幕。
- 依赖：ZB-30 包 1/2（叶子＋场景件）先行或同批；叶子含本轮新增的 kite `land()`（在窗 B 本地栈 ZB-30 包 3 提交内，批推时同行）。

## 追补（2026-11-21 第 2 轮·形）：第五段 ZB-31 爬树挂载

- 文件：`zb31-tree-climb-viewer.patch`（在前四段之后 apply；栈顶基线 apply-check 通过）
- 内容：古松树干旁 E 起爬、W/S/方向键逐段、E 上下文（上爬/采松塔/跳下）、空格松手跌落（高度钉释放回普通落地）、树冠首达台词（鸟巢/松王夜望微光）。
- 依赖：ZB-31 包 1 叶子先行或同批。跌落的体温扣减只挂了叶子钩子与字幕——ZB-20 体温计未落地，计量待其系统接入。

## 追补（2026-11-21 第 2 轮·形）：第六段 ZB-35 跑图挂载

- 文件：`zb35-anchor-run-viewer.patch`（在前五段之后 apply；栈顶基线 apply-check 通过）
- 内容：五锚点环接线级场景（石环＋六矮灯，灯态 API 为准，装扮归分区一夜间回补替换）、夜窗内 E 点亮、个人灯态同步、完赛一行字幕。
- 依赖：ZB-35 包 1 叶子＋同批新增场景件 `town-anchor-run-scene.ts` 先行或同批。完赛全镇广播未接（与 ZB-33 榜面中继同批处理）。

## 追补（2026-11-21 第 2 轮·形）：第七段 ZB-33 环镇赛挂载

- 文件：`zb33-ring-race-viewer.patch`（在前六段之后 apply；栈顶基线 apply-check 通过）
- 内容：环镇赛逐帧观察（穿门触发）、光门灯态（暗/暖/绿）、个人最佳与幽灵橇本地存取回放、完赛/未完赛一行字幕。
- 依赖：ZB-33 包 1 叶子＋同批新增场景件 `town-grand-prix-ring-scene.ts`。成绩**未**接 presence 大奖赛中继——与 D2 三项赛同名冲突待总控裁定，裁定前环镇成绩只在本地，绝不冒名上 D2 榜。此段同时欠 ZB-35 完赛广播（同一裁定面）。

## 追补（2026-11-21 第 2 轮·形）：第八段 ZB-34 雪堡挂载

- 文件：`zb34-fortress-viewer.patch`（在前七段之后 apply；栈顶基线 apply-check 通过）
- 内容：两演练场记分牌/铃台/金铃/守卫雪人接线级场景、单人演练全流程（开战→抱铃→被击掉落→送回计分→轮换→结算）、守卫注册为雪球靶（两击散架）、抱铃者受击走 playerTarget 通路。
- 依赖：ZB-34 包 1 叶子＋同批新增场景件 `town-fortress-scene.ts`。**边界**：双人服务器权威对局需 presence 新增对局中继 kind，本段未做、未冒充；单人守方轮次为守时制（雪人攻方未建）。

## 追补（2026-11-21 第 2 轮·形）：第九段 ZB-36 冰雕挂载

- 文件：`zb36-ice-sculpture-viewer.patch`（在前八段之后 apply；栈顶基线 apply-check 通过）
- 内容：冰雕岛接线级场景（取冰台＋8 基座＋署名牌＋体素作品 InstancedMesh 逐敲重建）、取坯→抱坯→落座→敲角→立牌→投雪花全流程（本地托管）。
- 依赖：ZB-36 包 1 叶子＋同批新增场景件 `town-ice-sculpture-scene.ts`。边界：敲击点定位为「离玩家最近块」的接线级近似（精确敲点留第 3 轮·饰）；挖矿白名单第 4 类仍候窗 C 对齐，未碰挖矿代码；服务器权威与除夕结算广播未接。

## 追补（2026-11-21 第 3 轮·饰）：第十段精修

- 文件：`zb-r3-polish-viewer.patch`（在前九段之后 apply；栈顶基线 apply-check 通过）
- 内容：ZB-36 敲击改视线射线选块（瞄哪敲哪，无命中回退最近块）；ZB-30 陀螺改扫杆蓄力（约 2.8 秒周期，出杆行报蓄力百分比）。

## 追补（2026-11-21 第 5 轮·互提前）：第十一段 ZB-29 包 2c 自建雪人

- 文件：`zb29-build-viewer.patch`（含 `town-snowman-scene.ts` 的 addSnowman 扩展；在前十段之后 apply；栈顶基线 apply-check 通过）
- 内容：滚雪球（三档随滚距长大）→放下三球→净空合格处堆成雪人（入 scene views，夜里转头/共鸣自动纳入）→打扮循环叶子装饰表；三球档位不对可推倒重滚。「滚雪球」起始动作置于交互链末尾，不抢任何情境互动。
