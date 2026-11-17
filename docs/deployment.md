# Deploying

## UNWRITTEN 2027 单人预览上线

`town.disdorqin.cn` 的根路径由 Caddy 提供小镇单人预览
`tools/voxel-tavern/town-blockout.html`。本次上线使用仓库中的
`tools/compose.town-preview.yaml`，由它从仓库根目录构建并打包小镇。

腾讯云 Ubuntu 的统一部署目录为 `/opt/apps/unwritten-2027`。
上线前确认服务器可供授权操作，已安装 Docker Engine 和 Compose 插件，且已取得通过验收的提交。
域名 A 记录指向 `49.234.39.194`，安全组和系统防火墙放行 TCP 80、443，
并确认两个端口均可由本服务绑定。

将验收通过的确切提交检出到该目录后执行以下命令。每条命令成功后再执行下一条。

```sh
cd /opt/apps/unwritten-2027
export TOWN_RELEASE="$(git rev-parse HEAD)"
docker compose -p unwritten-preview -f tools/compose.town-preview.yaml config --quiet
docker compose -p unwritten-preview -f tools/compose.town-preview.yaml build web
docker compose -p unwritten-preview -f tools/compose.town-preview.yaml up -d --no-build --pull never
docker compose -p unwritten-preview -f tools/compose.town-preview.yaml ps
curl --fail --show-error --silent --retry 10 --retry-all-errors --retry-delay 2 https://town.disdorqin.cn/healthz
curl --fail --show-error --silent --output /dev/null https://town.disdorqin.cn/
```

HTTPS 健康检查应返回 `town-preview <完整提交 SHA>`，其中 SHA 必须与
`TOWN_RELEASE` 一致。再从公网用桌面和手机浏览器打开域名，确认加载、第一人称和游玩。
Caddy 自动签发和续期证书，证书数据保存在 `unwritten-preview` 项目的独立卷中。

更新时从新的验收提交重新构建。保留上一个已上线的镜像，回滚时将
`TOWN_RELEASE` 设为上一个已部署的完整 SHA，再执行同一条 `up -d --no-build --pull never` 命令
并核对健康检查。保留 Compose 的证书卷。

Muse 的部署盘点、备选包和公网验收清单留在 `docs/交流区/Muse`。
交接记录中的服务器到期日为 2026-12-12，跨年开放前需确认续期。

## 上游多人部署参考

`tools/compose.yaml` 与 `tools/Caddyfile` 属于仓库根目录的 Node 多人应用。
下方保留其上游部署参考。

There are two shapes. The same client bundle serves both and picks one at
runtime, so there is no separate build.

| Deploy | Authority | Who can join | What you run |
| --- | --- | --- | --- |
| Node host | the server, as always | everyone | one always-on process |
| Static CDN | the room creator's browser | direct-connectable peers only | nothing |
| Static CDN + TURN credentials | the room creator's browser | everyone | nothing; you pay a TURN provider per GB |

`GET /healthz` is the discriminator. A Node deploy answers it with JSON before
static assets are served; a CDN answers with a 404 or with `index.html`, and
either way the client falls back to browser hosting. `?net=server` and
`?net=p2p` force a mode, which is how both are exercised against one dev server.

## Connectivity

Browser hosting connects players to the host over WebRTC. Most home networks
allow that with STUN alone, which is free and already configured. A minority —
symmetric NAT, carrier-grade NAT on mobile, strict corporate and university
networks — cannot, and in browser-hosted mode **those players cannot join at
all**. This is a real difference from the Node deploy, where the server is
always reachable and only voice ever degrades to a relay.

If you need that last group, either run the Node deploy or paste TURN
credentials from a provider into `public/config.json`:

```json
{
  "iceServers": [
    { "urls": ["stun:stun.l.google.com:19302"] },
    { "urls": "turn:turn.example.net:3478", "username": "…", "credential": "…" }
  ]
}
```

That file is read at boot and can be edited on the CDN without rebuilding.
`config.json` also accepts a `broker` object (`host`, `port`, `path`, `secure`,
`key`) to point at your own PeerJS broker instead of the public cloud one.

We deliberately do not document running your own TURN server. If you are
willing to operate a box, run the Node deploy on it instead: one network hop
rather than two, no relay bandwidth, and everyone can join.

Browser hosting also ends the room when the host closes their tab — there is no
host migration — and the host can see every peer's public IP and is trusted
with authority. For a game among friends that is usually fine; for anything
public, use the Node deploy.

## Static hosting

```sh
npm run build:client   # dist/client, and nothing else
```

`npm run build` emits two directories: `dist/client`, the browser bundle, and
`dist/server`, the compiled Node authority that `npm start` runs. A CDN needs
only the first, so `build:client` skips the server compile entirely.

Upload `dist/client` to any static host. HTTPS is required for microphone
access. No SPA fallback is needed — the app is one route — and leaving it off
is marginally better, because `/healthz` then answers 404 and mode detection
reads that as cleanly as it reads a fallback page.

On Netlify there are two routes, and mixing them up is the common failure:

- **Drag and drop.** Use *Add new site → Deploy manually* and drop
  `dist/client`. A manual-deploy site runs no build step. Dropping a folder on
  a site that already has build settings makes Netlify run *those* settings
  instead of serving your files, which fails before it ever looks at the
  upload.
- **From Git.** The committed `netlify.toml` sets `npm run build:client` and
  publishes `dist/client`, so connecting the repository needs no further
  configuration.

Vercel is covered by the committed `vercel.json`, which pins the same client-only
build and output directory and disables framework detection. Connecting the
repository deploys the static site and nothing else: there is no `api/`
directory, so Vercel has nothing it could turn into serverless functions, and
`dist/server` is never even built.

Each platform reads only its own file — `vercel.json`, `netlify.toml`,
`render.yaml`, `Dockerfile` — so shipping all four keeps the static and Node
deployments configured side by side without either affecting the other.

Cloudflare Pages and GitHub Pages want the same thing: build command
`npm run build:client`, output directory `dist/client`.

### GitHub Pages

The committed `.github/workflows/pages.yml` builds and publishes the static/P2P
client whenever `main` changes. It reads the repository's Pages base path from
GitHub and passes it to Vite, so project sites such as `/friendslop-base/` load
their scripts, fonts, model, audio, configuration and invite links correctly.

In the repository on GitHub, open **Settings → Pages**, set **Source** to
**GitHub Actions**, and then run the workflow or push to `main`. For the
`larshurrelb/friendslop-base` repository the default URL is
`https://larshurrelb.github.io/friendslop-base/`.

## Production locally

```sh
npm ci
npm run build
PORT=3000 npm start
```

The build emits static assets in `dist/client` and the Node server in
`dist/server`. `GET /healthz` returns a small JSON health response. The process
binds `0.0.0.0:$PORT`, default 3000. `/ws` and `/voice` upgrade that same listener.
No UDP ports are opened by Node. Browsers contact STUN and each other directly.

## Render

Push this repository to your Git provider. Create a Render Web Service using
its Dockerfile, or use the included `render.yaml` blueprint. Use one instance
and an always-on service for rooms. Set the health-check path to `/healthz`.
Render supplies HTTPS/WSS and routes HTTP and both WebSocket paths to the one
service port. There are no additional media or signaling services to create.

Official documentation: https://render.com/docs/websocket

Deployments and instance restarts clear all rooms. Do not enable multiple
replicas and assume a room can be joined through any instance: there is no
shared room store or sticky room routing in this starter. Scaling up one
instance preserves the architecture; scaling out needs further design.

## VPS with Docker

```sh
docker build -t friendslop-base .
docker run -d --name friendslop --restart unless-stopped \
  -p 3000:3000 -e PORT=3000 friendslop-base
```

This starts HTTP for a local smoke test. Remote voice requires HTTPS. If your
VPS already has TLS ingress, forward ordinary HTTP **and WebSocket upgrades**
for `/ws` and `/voice` to container port 3000, with suitably long idle timeouts.
The ingress is infrastructure; the application still has one Node process.

For a deployment without a reverse proxy, Node can terminate TLS itself. Obtain
a trusted certificate for your hostname using your normal certificate workflow,
then mount the certificate chain and private key read-only:

```sh
docker run -d --name friendslop --restart unless-stopped \
  -p 443:3000 -e PORT=3000 \
  -e TLS_CERT=/certs/fullchain.pem -e TLS_KEY=/certs/privkey.pem \
  -v /path/to/certificate-directory:/certs:ro \
  friendslop-base
```

The non-root container user must be able to read the mounted key. Keep the key
out of the repository and image. Certificate renewal remains the host's
responsibility; restart the process after renewal to load the new files.
Only port 443 needs public ingress in this variant. One container/Node process
serves assets, signaling, game state and relayed audio.

## Operations

Use a nearby region. Room restart is disruptive because state is intentionally
ephemeral. Graceful shutdown closes sockets with a restart code before exiting;
clients show reconnect status. Room codes from a lost process are not reusable.

Run `npm run bots` against the host to measure game throughput, and use multiple
real Chrome clients with forced relay to measure audio throughput. Synthetic
local Chrome tests validate routing and decoded signal, not WAN latency, NAT
coverage, physical microphone quality or echo cancellation on every device.
