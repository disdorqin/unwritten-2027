# C 盘旧工作树 933665db 与 7ffd1056：恢复归档与清理闸口

核实日期：2026-11-21（北京时间）。归档目标为 **D:\computer learning\game_exe\kuanian** 的独立 Git 仓库（其 `.git` 目录），项目内容通过该目录的 `.worktrees\window-b` 施工分支提交。**本次没有删除 C 盘任何项目数据，也没有改写 D 盘游戏默认玩家场景。**

## 源目录和重复判定

- `C:\Users\37813\.devspace\worktrees\unwritten-2027-933665db`：原 `lane-build` 主工程源提交 `792828e9` 是正式 D 盘 `lane-build` 历史祖先；2026-11-21 20:43 旧工作树又自行快进到 `bc679c5a`，与 D 盘 B 分支当前提交一致，说明迁移期间旧目录仍有巡检任务访问，不能仅凭某次空闲认定永久停用。
- `C:\Users\37813\.devspace\worktrees\unwritten-2027-7ffd1056`：根提交 `f432243a` 已包含于当前集成历史。根工作树没有 Git 非忽略文件改动。
- 两目录根部本身无需覆盖 D 盘现役源代码，历史分支/局部试验存在相同文件但过期，**不得把旧 `viewer.ts` 或 `src/presence/server.ts` 强行合并进新主线**。

## 已完成的无损 Git 源码快照迁移

使用不触碰旧工作树原有 Git index 的**临时 Git index**，把含未提交改动及非忽略未跟踪材料的候选工作树写成全树快照，逐个登记 `refs/archive/cdrive-20261121/`，然后从正式 D 盘仓库 `legacy-local` 读取并复制 Git 对象。

| 所属 C 目录 | 独立嵌套 Git worktree | 原根 HEAD | 证据缓存归档 | 共计引用 |
|---|---:|---:|---:|---:|
| 933665db | 21 | 1 | 1 | 23 |
| 7ffd1056 | 77 | 1 | 1 | 79 |
| **合计** | **98** | **2** | **2** | **102** |

D 盘通过 `git for-each-ref --format='%(refname)' refs/archive/cdrive-20261121` 回读 **102** 条归档引用；原 C 盘两处嵌套工作树中 **44 个存在非忽略的未提交修改/新增文件**，采用独立临时 index 从**当前工作目录重新取树**，逐项与归档 `^{tree}` 比较，**44/44 一致**。此操作没有重置旧工作树的原 index/改动。注意：此项确认的是 Git 覆盖范围（原版提交、tracked、nonignored untracked），不包含本来就被 .gitignore 排除的可再生 node_modules 和所有临时 dist。

- 示例：`refs/archive/cdrive-20261121/933665db/lane-resident-20261119` 包含旧 NPC 代码及六张原始对比截图；
- 示例：`refs/archive/cdrive-20261121/7ffd1056/games-stage5-20261119` 包含旧镜湖场景、山地竞速原型及相应测试；
- 示例：`refs/archive/cdrive-20261121/7ffd1056/town-batch-cert` 保留旧铁路/场景整合包；其旧候选绝不能直接复写当前主干。

另单独保存未注册为 Git worktree 的旧缓存**证据**：`refs/archive/cdrive-20261121/evidence-933665db`（391 个文件项）及 `refs/archive/cdrive-20261121/evidence-7ffd1056`（923 个文件项）。这些包含 933 的老版集市/广场截图与 JSON 轨迹，7ffd 的 M4–M6 证据、内存测量日志、旧 .wav/.mp3 等。D 盘已实际从这些 Git 对象读回 `node_modules/.cache/lane-market-0be8571-candidate-memorial.png`（223,682 字节）和 `node_modules/.cache/unwritten-bgm-v21-30s.wav`（1,440,044 字节）。

## 实体文件补存（不挂载，不改运行版）

相较当前远端集成清单，发现 7ffd 的镜湖/山地若干未入正式树旧实验源码。为使它们在 D 盘普通文件浏览器中也易检索，本窗从已归档 Git 对象提取六份只读参考文本，位于本目录下：

- `tools/voxel-tavern/town-blockout/mirror-lake-scene.ts.txt`
- `tools/voxel-tavern/town-blockout/mirror-lake-site.ts.txt`
- `tools/voxel-tavern/town-blockout/mountain-rally.ts.txt`
- `tools/voxel-tavern/town-blockout/north-ridge-terrain.ts.txt`
- `tests/town-blockout-mirror-lake.test.ts.txt`
- `tests/town-blockout-mountain-rally.test.ts.txt`

**对应真正字节级原版以 Git 归档引用为准**；上述 `.txt` 是便于审图和复用的文本镜像，可能被写入工具归一化行尾。没有把这些旧文件装入现在的 `src/`、`tools/` 或测试路径，更没有声称旧功能可在默认游戏场景进入。

目前 933 的冰晶宫活动、集市摆件、镇民模块名称已能在当前远端集成树中查到，优先以正式版为准；933 的老版复验脚本与截图只作归档证据，无需回滚现役代码。7ffd 的旧镜湖竞速等候选等待玩法负责人比对新系统后再决定是否移植，不能直接归类为“已完工”。

## C 盘空间占用及未删项

此前以 Windows Robocopy /L /BYTES 扫描的**逻辑文件大小**：

- `933665db` 4.307 GiB，内 `node_modules\.cache` 3.879 GiB；
- `7ffd1056` 16.733 GiB，内 `node_modules\.cache` 16.155 GiB；
- 合计约 **21.04 GiB** 文件内容，不等于将来删除时实际回收空间（NTFS 硬链接/复用可能影响净回收量）。
- 两处缓存内 *非 Git 工作树* 的顶层目录合计仅约 0.026+0.067 GiB，原始证据和直接缓存文件均已单独归档。绝大部分占用来自临时 Git 工作树及其安装依赖、打包目录、缓存/预览副本。

## 自动巡检路径已迁 D（无修改原日程）

既有 **未写镇分支施工巡检** 自动任务已更新为只用 `D:\computer learning\game_exe\kuanian\.worktrees\window-b`（DevSpace `ws_9b2f9588e7`），不得回退 `ws_1a90fcbd84`；既有 **未写镇窗 C 地下巡检** 已更新为只用 `D:\computer learning\game_exe\kuanian\.worktrees\window-c`（`ws_a42c8e8f3c`），明确禁用 7ffd 旧目录作为工作目标。两项更新均返回成功且保留原调度。其他独立执行者与在途会话仍应复查是否引用旧路径。

## 删除前最后护栏（必须执行，不可直接删除父目录）

1. 按目标 C 路径核所有 DevSpace/终端/自动化是否还在引用旧树；迁移期间 933 曾发生 Git fast-forward，故不能跳过这个步骤。需先停止旧环境使用（现有两项自动巡检已改路径）。
2. **对两个目标下面的 98 条嵌套 Git worktree 从最深一层向上逐项办理**；包含未提交改动者先核 D 中对应 `refs/archive/...` 的 SHA；再用 Git 官方 `worktree remove` 正式注销。不可在 Git 未解除关联时直接让 Windows 文件管理器批量删除外层目录。
3. 清理旧缓存及两个根 worktree 后再用 `git worktree list --porcelain` 核对目标路径登记为 0；核 D 盘 `refs/archive/cdrive-20261121` 仍然 102 条，抽查上文两个二进制文件可读；再测 C 盘 `Get-PSDrive C` 的实际可用容量。
4. 允许重建的依赖和打包缓存不建议转存到主仓；其它 C 盘项目目录与 `D:\computer learning\vibe_coding\unwritten-2027` 的旧仓库元数据**不在此单删除范围内**。任一不确定的后台窗口/未忽略的私人数据优先保留，单独清障。

**截至本回执：D 盘归档已完成且可回读，C 盘未执行删除，C 盘释放量 0。** 归档 ref 只在本机正式 D 盘仓库，并未把这些 102 个历史候选全部推送 GitHub；不能用 GitHub 没有同名 branch 误判 D 盘归档失败。

恢复示例（仅查看，不修改运行树）：

```powershell
git -C "D:\computer learning\game_exe\kuanian" show "refs/archive/cdrive-20261121/7ffd1056/games-stage5-20261119:tools/voxel-tavern/town-blockout/mountain-rally.ts"
git -C "D:\computer learning\game_exe\kuanian" for-each-ref --format="%(refname)" refs/archive/cdrive-20261121
```
