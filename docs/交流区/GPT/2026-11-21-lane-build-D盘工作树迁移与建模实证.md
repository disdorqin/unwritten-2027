# 窗 B：D 盘正式工作树与七轮模型切片交付核对（2026-11-21）

**本轮已读七轮制与新根目录：** 用户 2026-11-21 七轮新令及新根；主窗口本机文档 `docs/交流区/Muse/主窗口通告-统一D盘根与七轮建模施工-2026-11-21.md`，原任务 `ZB-26.md`。

## 落盘与分支

- **唯一正式 Git 根**：`D:\computer learning\game_exe\kuanian`。B 窗独立 worktree 现已创建在 **`D:\computer learning\game_exe\kuanian\.worktrees\window-b`**，关联 `lane-build`。
- **迁移前 C 盘 B 工作树**：`C:\Users\37813\.devspace\worktrees\unwritten-2027-933665db`，原先与 `origin/lane-build` 对齐并有源码；2026-11-21 先在旧仓安全提交、正常推送 `5197a36072dc7ebda46de3cbbfaa595731a26054`，再从 D 盘正式新根正常 `git worktree add -b lane-build .worktrees/window-b origin/lane-build`；新 B worktree 同一 HEAD，干净且可读。
- 旧 C 盘源为**待确认归档/安全回退**，不是可以随手删除的临时文件。新根其他窗口工作树：`.worktrees/window-c`、`.worktrees/window-d`；另一个独立建模工作树 `.worktrees/window-b-model` 当时显示初始化锁，不触碰。
- 本轮没有改动 `viewer.ts`、Presence server、地形布局等共享单写文件；没有把未完工的 B 模型强并 integration；`main` 并不是现役集成分支。

## 本轮模型实交

- `tools/voxel-tavern/town-blockout/sled-model-kit.ts`：本窗 R1–R3 的雪橇与补给棚体素几何；`sled-visuals.ts` 按实例化批次挂载。
- `tools/voxel-tavern/sled-model-preview.html` + `tools/verify-sled-kit-browser.mjs`：真实浏览器独立样板、自动输出 D 盘截图。
- `tests/town-blockout-sled-model-kit.test.ts`：新增断言并沿用旧雪橇动画检查。
- 6/6 测试通过；`node tools/run.mjs check && node tools/run.mjs build` 通过；Chrome WebGL 1280×720 → 3 draws、4,106 tris、页面错误 0、HTTP 5xx 0，截图 `D:\computer learning\game_exe\kuanian\sled-depot-browser-smoke.png`。
- **D 盘原生复跑（追加核验）：** 在新建 `D:\computer learning\game_exe\kuanian\.worktrees\window-b`，依赖只安装到该 D 盘 worktree，npm 缓存限定在 D 盘根 `.npm-cache/`；`npm ci --ignore-scripts --no-audit --no-fund` 新增 148 个包，之后重新执行全部 6/6 定向、`check`、`build` 与 Chrome WebGL **全部通过**。系统 Chrome 仅临时验收后退出，不开启任何 watch 或常驻服务；仓库工作树 `git status` 干净。
- **边界**：这里只是独立资产近景预览，未完成整景 R1/R2 主体、图库 R4、交互 R6、手机/实机/出生点 12 站真实走路 R7。原 `ZB-26` 仍**已接领/在建**。请 A 窗审取公共接线与碰撞净空；不能以 6 项绿灯改成「已完工」。

## 尚未闭环的迁移

根仓管理代码与 B 窗新工作树已在 D 盘，**其他所有旧活动工作树、离线纹理/视频与未跟踪素材没有逐项校验完整**。若要清理旧路径，需总控进一步检查活跃窗口与 Git 工作树，并拿到明文清理许可。

本轮已读 Muse 新文件：`主窗口通告-统一D盘根与七轮建模施工-2026-11-21.md`（本机版本）；下轮应先 fetch 现役集成尖端重新核对。
