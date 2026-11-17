#!/usr/bin/env bash
# deploy.sh — UNWRITTEN 2027 新小镇静态站一键部署（在服务器上运行）
#
# 用法：
#   ./deploy.sh             拉集成分支最新头 → 构建镜像 → 起容器 → 健康检查
#   ./deploy.sh --rollback  回滚到上一个镜像（构建失败或上线后发现问题时）
#
# 前置条件（缺一不可，脚本只做本机侧检查，公网侧由 Muse 上线验收核对）：
#   1. 朋友已在腾讯云控制台放行 443（80 已放行）；
#   2. DNS 已生效：town.disdorqin.cn 的 A 记录指向本机公网 IP 49.234.39.194
#      （Caddy 自动签发 Let's Encrypt 证书依赖 DNS + 80/443 公网可达）；
#   3. 本目录即仓库根（APP_DIR），部署包文件（Dockerfile.townsite / Caddyfile /
#      docker-compose.yaml / deploy.sh）已放在仓库根；
#   4. 服务器能读取私有仓库 disdorqin/unwritten-2027（git clone/pull 需要凭据：
#      deploy key 或其他只读授权，由 GPT/朋友预先配好；配不通时的备选方案见
#      ../部署盘点与就绪清单.md 第 5 节——本地构建 dist 后打包上传）。
#
# 说明：静态站没有 Node 应用的 /healthz 端点，健康检查以 HTTPS 200 + 关键资源 200 为准。

set -euo pipefail

DOMAIN="${DOMAIN:-town.disdorqin.cn}"
BRANCH="${BRANCH:-town-blockout-integration}"
APP_DIR="${APP_DIR:-/opt/unwritten-2027}"
IMAGE="unwritten-townsite:current"
IMAGE_PREV="unwritten-townsite:prev"
cd "$APP_DIR"

compose() { docker compose -p unwritten-townsite -f docker-compose.yaml "$@"; }

healthcheck() {
  # 用 --resolve 直连本机 Caddy，绕开 DNS/公网链路，只验服务本身；
  # 公网可达性与证书有效性由 Muse 在外部验收（见 ../上线验收清单-MUSE.md）。
  local ok=1
  for path in "/" "/town-blockout.html"; do
    code=$(curl -sk --resolve "$DOMAIN:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://$DOMAIN$path" || echo 000)
    echo "  $path -> $code"
    [ "$code" = "200" ] || ok=0
  done
  # dist 在镜像内，本机无副本，资源级检查留给 Muse 的公网验收；此处以页面 200 为准
  [ "$ok" = "1" ]
}

if [ "${1:-}" = "--rollback" ]; then
  echo "== 回滚到上一镜像 =="
  docker image inspect "$IMAGE_PREV" >/dev/null 2>&1 || { echo "没有 prev 镜像，无法回滚"; exit 1; }
  docker tag "$IMAGE_PREV" "$IMAGE"
  compose up -d --no-build
  healthcheck && echo "回滚完成且健康检查通过" || { echo "回滚后健康检查未通过，请人工检查"; exit 1; }
  exit 0
fi

echo "== 1/5 检查 Docker / Compose =="
docker version >/dev/null
docker compose version >/dev/null

echo "== 2/5 拉取集成分支最新头（$BRANCH）=="
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
SHA=$(git rev-parse HEAD)
echo "   HEAD = $SHA"
echo "$SHA" > .deployed-sha

echo "== 3/5 保留当前镜像为回滚点 =="
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker tag "$IMAGE" "$IMAGE_PREV"
  echo "   已标记 $IMAGE_PREV"
else
  echo "   首次部署，无旧镜像可留"
fi

echo "== 4/5 构建并启动 =="
compose up -d --build
compose ps

echo "== 5/5 健康检查（本机侧）=="
for i in $(seq 1 15); do
  if healthcheck; then
    echo "部署成功：$DOMAIN @ $SHA"
    echo "回滚命令：./deploy.sh --rollback"
    exit 0
  fi
  sleep 2
done
echo "健康检查 30 秒内未通过。常见原因：443 未放行 / DNS 未生效导致 Caddy 签证书失败。"
echo "排查：docker compose -p unwritten-townsite logs web --tail=50"
exit 1
