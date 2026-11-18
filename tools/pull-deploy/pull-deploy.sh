#!/usr/bin/env bash
# Only a verified origin/town-release advance can switch the running town-preview project.
set -Eeuo pipefail

REPO_DIR="${REPO_DIR:-/opt/apps/unwritten-2027}"
STATE_DIR="$REPO_DIR/.pull-deploy"
LOCK_FILE="${TOWN_PREVIEW_LOCK_FILE:-/opt/apps/.unwritten-town-preview.lock}"
HEALTH_URL="${TOWN_PREVIEW_HEALTH_URL:-https://town.disdorqin.cn/healthz}"
TARGET_REF=refs/heads/town-release
TRACKING_REF=refs/remotes/origin/town-release
LIVE_SHA="$REPO_DIR/.deployed-sha"
LIVE_PREV="$REPO_DIR/.deployed-sha.prev"
export GIT_TERMINAL_PROMPT=0
umask 077
mkdir -p "$STATE_DIR"
LOG="$STATE_DIR/pull-deploy.log"
exec >>"$LOG" 2>&1
log() { printf '%s %s\n' "$(date -Is)" "$*"; }
fail() { log "$*"; exit 1; }

exec 9>"$LOCK_FILE"
flock -n 9 || { log "another town-preview release is in progress, skip"; exit 0; }

read_sha() { if [[ -f "$1" ]]; then cat "$1"; fi; }

write_sha() {
  local path="$1" sha="$2" tmp
  tmp=$(mktemp "$path.XXXXXX") || return 1
  if printf '%s\n' "$sha" >"$tmp" &&
      { [[ ! -e $path ]] || chmod --reference="$path" "$tmp"; } &&
      mv -f "$tmp" "$path"; then return 0; fi
  rm -f "$tmp"
  return 1
}

health_exact() {
  local sha="$1" timeout="${2:-8}"
  curl -fsS --connect-timeout 4 --max-time "$timeout" "$HEALTH_URL" | cmp -s - <(printf 'town-preview %s' "$sha")
}

wait_health() {
  local sha="$1" deadline=$((SECONDS + 90)) remaining
  while (( SECONDS < deadline )); do
    remaining=$((deadline - SECONDS))
    if (( remaining > 8 )); then remaining=8; fi
    health_exact "$sha" "$remaining" && return 0
    (( SECONDS < deadline )) && sleep 1
  done
  return 1
}

sync_state() {
  local live="$1" previous="$2" acknowledged="$3"
  write_sha "$STATE_DIR/prev-sha" "$previous" &&
    write_sha "$STATE_DIR/deployed-sha" "$live" &&
    write_sha "$STATE_DIR/release-sha" "$acknowledged"
}

worktree() {
  local sha="$1" tree="$REPO_DIR-release-$1"
  if [[ ! -d "$tree" ]]; then git worktree add --detach "$tree" "$sha" >&2 || return 1; fi
  [[ $(git -C "$tree" rev-parse HEAD) = "$sha" && -z $(git -C "$tree" status --porcelain) ]] || return 1
  printf '%s' "$tree"
}

compose() {
  local sha="$1" tree="$2"; shift 2
  TOWN_RELEASE="$sha" docker compose -p unwritten-preview -f "$tree/tools/compose.town-preview.yaml" -f "$override" "$@"
}

cd "$REPO_DIR"
git fetch --quiet --no-tags origin "+$TARGET_REF:$TRACKING_REF" || fail "fetch failed: $TARGET_REF"
target=$(git rev-parse --verify "$TRACKING_REF^{commit}") || fail "cannot resolve $TRACKING_REF"
live=$(read_sha "$LIVE_SHA")
previous=$(read_sha "$LIVE_PREV")
acknowledged=$(read_sha "$STATE_DIR/release-sha")
[[ $target =~ ^[0-9a-f]{40}$ && $live =~ ^[0-9a-f]{40}$ && $previous =~ ^[0-9a-f]{40}$ ]] ||
  fail "invalid release ref or live town-preview ledger"
health_exact "$live" || fail "public healthz disagrees with live ledger: $live"

if [[ $target = "$live" || $target = "$acknowledged" ]]; then
  if [[ $target != "$acknowledged" || $live != "$(read_sha "$STATE_DIR/deployed-sha")" ||
        $previous != "$(read_sha "$STATE_DIR/prev-sha")" ]]; then
    log "polled origin/town-release: $target"
    log "healthz exact: town-preview $live"
    sync_state "$live" "$previous" "$target" || fail "cannot synchronize verified deployment state"
    log "deployed-sha recorded: $live"
    log "prev-sha recorded: $previous"
    log "release acknowledged; existing containers retained"
  fi
  exit 0
fi

active_files=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' unwritten-preview-web-1) ||
  fail "cannot inspect active Compose configuration"
IFS=, read -r -a active_configs <<<"$active_files"
override=''
for config in "${active_configs[@]}"; do
  case "$config" in "$REPO_DIR"/.presence-*.yaml) override="$config";; esac
done
[[ -n $override && -r $override ]] || fail "cannot locate the active presence Compose override"
old_tree=$(worktree "$live") || fail "cannot verify rollback worktree: $live"
docker image inspect "unwritten-town-preview:$live" "unwritten-town-presence:$live" >/dev/null ||
  fail "verified rollback images unavailable: $live"
new_tree=$(worktree "$target") || fail "cannot verify target worktree: $target"
log "release change: $live -> $target"
compose "$target" "$new_tree" config --quiet || fail "invalid target Compose configuration"
compose "$target" "$new_tree" build web presence || fail "build failed, running release retained: $live"
now=$(git ls-remote --exit-code origin "$TARGET_REF") || fail "cannot recheck the release ref after build"
[[ $now = "$target"$'\t'"$TARGET_REF" ]] || fail "release ref advanced during build; retry at the next poll"

rollback() {
  log "rolling back to $live"
  if compose "$live" "$old_tree" up -d --no-build --pull never --wait --wait-timeout 55 && wait_health "$live"; then
    write_sha "$LIVE_PREV" "$previous" &&
      write_sha "$LIVE_SHA" "$live" &&
      sync_state "$live" "$previous" "$acknowledged" || fail "rollback healthy but could not restore ledger"
    log "rollback verified: $live"
  else
    log "ROLLBACK FAILED — manual intervention needed"
  fi
  exit 1
}
trap rollback INT TERM
if compose "$target" "$new_tree" up -d --no-build --pull never --wait --wait-timeout 55 && wait_health "$target"; then
  write_sha "$LIVE_PREV" "$live" && write_sha "$LIVE_SHA" "$target" &&
    sync_state "$target" "$live" "$target" || rollback
  trap - INT TERM
  log "deployed OK: $target"
else
  log "DEPLOY FAILED: $target"
  rollback
fi
