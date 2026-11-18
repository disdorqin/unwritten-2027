#!/usr/bin/env bash
# 未写镇拉取式部署（服务器侧）：轮询 release 分支，变了就按 town-preview 现行流程重建上线。
# 设计：Muse 侧只需把验收过的代码推到 town-release 分支即可触发部署，不再需要任何人 SSH 进服务器逐步操作。
# 安全：healthz 必须精确等于 "town-preview <完整SHA>" 才算成功；失败自动回滚到上一个已部署 SHA。
# 安装与口径见 docs/交流区/Muse/给GPT-拉取式部署一次性安装-2026-11-19.md
set -euo pipefail

# ===== 安装时必须核对的配置 =====
REPO_DIR="${REPO_DIR:-/home/ubuntu/unwritten-2027}"   # 服务器上的仓库检出目录（装有只读 Deploy Key 的那份）
RELEASE_BRANCH="${RELEASE_BRANCH:-town-release}"     # 只认这个分支的头
# =================================

export HOME="${HOME:-/home/ubuntu}"
STATE_DIR="$REPO_DIR/.pull-deploy"
mkdir -p "$STATE_DIR"
LOG="$STATE_DIR/pull-deploy.log"
exec 9>"$STATE_DIR/lock"
flock -n 9 || { echo "$(date -Is) another run in progress, skip" >>"$LOG"; exit 0; }

log() { echo "$(date -Is) $*" >>"$LOG"; }

cd "$REPO_DIR"
git fetch --quiet origin "$RELEASE_BRANCH"
TARGET="$(git rev-parse "origin/$RELEASE_BRANCH")"
DEPLOYED="$(cat "$STATE_DIR/deployed-sha" 2>/dev/null || echo none)"
if [ "$TARGET" = "$DEPLOYED" ]; then
  exit 0
fi
log "release change: $DEPLOYED -> $TARGET"

deploy_sha() {
  local sha="$1"
  git checkout --quiet "$sha"
  export TOWN_RELEASE="$sha"
  docker compose -f tools/compose.town-preview.yaml build
  docker compose -f tools/compose.town-preview.yaml up -d
  # healthz 精确匹配门：最多等 90 秒
  for i in $(seq 1 30); do
    body="$(curl -s http://127.0.0.1/healthz || true)"
    if [ "$body" = "town-preview $sha" ]; then
      return 0
    fi
    sleep 3
  done
  return 1
}

if deploy_sha "$TARGET"; then
  echo "$DEPLOYED" >"$STATE_DIR/prev-sha"
  echo "$TARGET" >"$STATE_DIR/deployed-sha"
  log "deployed OK: $TARGET"
else
  log "DEPLOY FAILED for $TARGET, rolling back to $DEPLOYED"
  if [ "$DEPLOYED" != "none" ] && deploy_sha "$DEPLOYED"; then
    log "rollback OK: $DEPLOYED"
  else
    log "ROLLBACK ALSO FAILED — manual intervention needed"
  fi
  exit 1
fi
