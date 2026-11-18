const claimMs = 3_000;
const termMs = 5 * 60_000;
const awayMs = 10_000;
const hitLimit = 3;

export function createIceThrone(onChange: (owned: boolean) => void) {
  let claimSince: number | undefined;
  let crownedAt: number | undefined;
  let leftAt: number | undefined;
  let hits = 0;
  let needsReseat = false;

  function abdicate(seated: boolean) {
    claimSince = crownedAt = leftAt = undefined;
    hits = 0;
    needsReseat = seated;
    onChange(false);
  }

  return {
    update(now: number, seated: boolean) {
      if (crownedAt !== undefined) {
        if (!seated) leftAt ??= now;
        if (now - crownedAt >= termMs || (leftAt !== undefined && now - leftAt > awayMs)) {
          abdicate(seated);
        } else if (seated) {
          leftAt = undefined;
        }
        return;
      }
      if (!seated) {
        claimSince = undefined;
        needsReseat = false;
      } else if (!needsReseat) {
        claimSince ??= now;
        if (now - claimSince >= claimMs) {
          crownedAt = now;
          onChange(true);
        }
      }
    },
    receiveConfirmedHit(seated: boolean) {
      if (crownedAt !== undefined && ++hits >= hitLimit) abdicate(seated);
    },
    owned: () => crownedAt !== undefined,
  };
}
