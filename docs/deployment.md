# Deploying

## UNWRITTEN 2027：当前服务器方案

博客仓库 `disdorqin/disdorqin.github.io` 的 `astro.config.mjs` 配置了
`https://disdorqin.cn`。游戏拟使用 `town.disdorqin.cn`，复用该域名的子域名。
以下是准备好的配置，尚未部署到服务器，也未创建 DNS 记录。

| 配置 | 值 |
| --- | --- |
| DNS 类型 | A |
| 主机记录 | town |
| 目标 IPv4 | 49.234.39.194 |
| 公网入站 | TCP 80、443 |
| 游戏内部监听 | 3000，仅容器网络可达 |

在已安装 Docker Engine 与 Compose 插件的服务器上，把本仓库放到
`/opt/unwritten-2027`，确认 DNS 已指向服务器、80/443 未被其他服务占用后运行：

```sh
cd /opt/unwritten-2027
docker compose -p unwritten -f tools/compose.yaml up -d --build
docker compose -p unwritten -f tools/compose.yaml ps
curl --fail https://town.disdorqin.cn/healthz
```

Caddy 自动申请和续期 HTTPS 证书，并转发 WebSocket；游戏运行一个 Node 进程。
更新代码后重复 `up -d --build`。信件写入独立的 `letters` 数据卷，重建容器仍保留；
不要运行 `down -v`，该参数会删除数据卷。构建上下文已排除运行时信件。
服务重启后房间会重建，信件保留；请在无人游玩时更新。

双人验收：两台设备打开 HTTPS 地址，用不同昵称加入同一邀请码，检查互见、移动、
聊天和刷新重连；进入邮局写信，确认成功回执，再重启 `town` 检查数据卷仍在。
手机另检查竖屏和横屏的按钮、滑动转向及阅读/写信窗口。

当前尚缺服务器登录通道和 DNS 管理权限。截图显示实例到期时间为
2026-12-12，早于跨年开放日；上线前需要确认续期安排。

以下保留上游部署说明；本项目当前采用上面的 Node 方案。

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
