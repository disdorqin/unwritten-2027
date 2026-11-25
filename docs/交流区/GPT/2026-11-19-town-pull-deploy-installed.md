基线 SHA：`9ff8344fa6b0ad83d8f512f7bcd76f84bd72fad4`（安装起点、`origin/town-release` 与现役公网逐字核对一致）。

# town-preview 拉取式部署安装回执

1. 从基线创建并推送 `town-release`。`git ls-remote` 实测 `refs/heads/town-release` 为完整基线 SHA。
2. 以 `git rev-parse --show-toplevel` 核验服务器 Deploy Key 检出目录为 `/opt/apps/unwritten-2027`。服务器脚本 `/opt/apps/unwritten-2027/tools/pull-deploy/pull-deploy.sh` 实测为 `ubuntu` 所有、权限 `0755`。已装脚本的 Git blob 为 `c0d703e82de1b852a73461c20e5aaddd69610984`，与集成线提交 `809bc96cbd000cfb19011d967f0a309c13975171` 的脚本字节一致。
3. `cron` 实测为 `active`。读回 `ubuntu` 的 crontab，以下有效条目恰有一行：

   ```cron
   */2 * * * * REPO_DIR=/opt/apps/unwritten-2027 TOWN_REHEARSAL_BUILD=on /opt/apps/unwritten-2027/tools/pull-deploy/pull-deploy.sh
   ```

   系统实际触发记录：`Nov 19 07:50:01 VM-0-7-ubuntu CRON[2416876]: (ubuntu) CMD (REPO_DIR=/opt/apps/unwritten-2027 TOWN_REHEARSAL_BUILD=on /opt/apps/unwritten-2027/tools/pull-deploy/pull-deploy.sh)`。
4. 手动首跑于 `2026-11-19T07:49:34+08:00` 启动，在模拟 cron 的精简环境中实测退出码为 `0`。前后 web/presence 容器 ID 相同，因首跑的 release ref 已在公网运行，仅初始化拉取状态。复读 `.pull-deploy/deployed-sha`、`release-sha` 与基线相同，`prev-sha` 与正式回滚账本一致，为 `799b571fa1150a75a22cdf11cf05881dae259025`。

安装时按现役配置修正了原脚本的 Compose 项目名、presence 覆盖文件、本机 HTTP 验活和原地 checkout。现脚本沿用 `unwritten-preview`、共用发布锁、独立工作树、HTTPS 精确验活及已保留的回滚镜像。隔离运行验证覆盖同版本首跑、正文多换行/传输错误拒绝、新 release 切换、构建失败、回滚、手动更新不被旧 ref 覆盖。公网自动跨版本切换及故障回滚：未验。

复查公网 `/healthz` 实测原文：

```text
town-preview 9ff8344fa6b0ad83d8f512f7bcd76f84bd72fad4
```

手动首跑日志末 5 行原文：

```text
2026-11-19T07:49:37+08:00 polled origin/town-release: 9ff8344fa6b0ad83d8f512f7bcd76f84bd72fad4
2026-11-19T07:49:37+08:00 healthz exact: town-preview 9ff8344fa6b0ad83d8f512f7bcd76f84bd72fad4
2026-11-19T07:49:37+08:00 deployed-sha recorded: 9ff8344fa6b0ad83d8f512f7bcd76f84bd72fad4
2026-11-19T07:49:37+08:00 prev-sha recorded: 799b571fa1150a75a22cdf11cf05881dae259025
2026-11-19T07:49:37+08:00 release acknowledged; existing containers retained
```
