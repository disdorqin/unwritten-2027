# 部署包说明（新小镇静态站 · 预览上线）

本包把"朋友办好 443 + DNS 后立刻上线"所需的全部文件备齐。盘点依据与差异说明见
`../部署盘点与就绪清单.md`；上线后由 Muse 按 `../上线验收清单-MUSE.md` 做公网验收。

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `Dockerfile.townsite` | 多阶段构建：Node 阶段构建 tools/voxel-tavern 生产包，Caddy 阶段托管 dist |
| `Caddyfile` | town.disdorqin.cn 静态托管（根路径直达 town-blockout.html）；域名是占位，待 Thomas 确认 |
| `docker-compose.yaml` | 单个 web 服务（80/443、证书卷、日志上限） |
| `deploy.sh` | 一键部署：拉集成分支最新头 → 构建 → 起容器 → 健康检查；`--rollback` 回滚上一镜像 |
| `docker-compose.nodeapp.yaml` | 仓库既有 tools/compose.yaml **原文备份**（旧 Node 应用方案，勿与本包混用） |
| `Caddyfile.nodeapp` | 仓库既有 tools/Caddyfile **原文备份**（reverse_proxy town:3000） |

## 服务器上的落位

1. 把仓库克隆到 `/opt/unwritten-2027`（docs/deployment.md 的既有口径；
   注意服务器交接目录是 `/opt/apps`，两者关系见盘点清单第 6 节，上线前由 GPT 与朋友对齐）。
2. 把本包的 `Dockerfile.townsite`、`Caddyfile`、`docker-compose.yaml`、`deploy.sh`
   放到仓库根（与仓库自带根 Dockerfile 并存，互不覆盖）。
3. `chmod +x deploy.sh && ./deploy.sh`

## 注意

- 构建上下文必须是仓库根：`town-railway.ts` 引用 `docs/p0-layout-draft.json`，
  只打包 tools/voxel-tavern 子树必失败。
- 仓库是私有仓库，服务器 git 拉取需要只读凭据（deploy key 等），由 GPT/朋友预先配好；
  配不通时改走"本地构建 dist 打包上传"备选（盘点清单第 5 节）。
- 静态预览没有服务端：无 /healthz、无信件数据卷、无多人。页面内已有"单人预览"口径。
- 不要对本包的 compose 执行 `down -v`：会删 certificates 卷，证书需重新签发。
