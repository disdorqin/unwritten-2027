export const icePalaceProgressKey = 'unwritten.ice-palace.v1';
export const palaceBlockPushScale = .8;
const plateReleaseMs = 1_500;
const stairDoorMs = 10 * 60_000;
const vaultDoorMs = 20_000;

type Lever = 'pine' | 'sailboat' | 'lighthouse';
type Bell = 'low' | 'mid' | 'high';
type IcePalaceProgress = {
  key: boolean;
  throneRoom: boolean;
  gallery: boolean;
  mirrorCache: boolean;
  stairOpenUntil: number;
  completed: boolean;
};
const levers: readonly Lever[] = ['pine', 'sailboat', 'lighthouse'];
const bells: readonly Bell[] = ['low', 'high', 'mid'];

function loadProgress(raw: string | null): IcePalaceProgress {
  let saved: Partial<IcePalaceProgress> | null = null;
  try { saved = raw ? JSON.parse(raw) : null; } catch { /* An unreadable save can start fresh. */ }
  return {
    key: saved?.key === true,
    throneRoom: saved?.throneRoom === true,
    gallery: saved?.gallery === true,
    mirrorCache: saved?.mirrorCache === true,
    stairOpenUntil: typeof saved?.stairOpenUntil === 'number' && Number.isFinite(saved.stairOpenUntil)
      ? Math.max(0, saved.stairOpenUntil) : 0,
    completed: saved?.completed === true,
  };
}

export function createIcePalacePuzzles(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const progress = loadProgress(storage?.getItem(icePalaceProgressKey) ?? null);
  let leverIndex = 0;
  let bellInputs: Bell[] = [];
  const mirrors: [number, number] = progress.mirrorCache ? [2, 4] : [1, 1];
  let platePressed = false;
  let plateUntil = 0;
  let vaultUntil = 0;

  function save() {
    storage?.setItem(icePalaceProgressKey, JSON.stringify(progress));
  }

  function setPlateContact(now: number, playerOnPlate: boolean, blockOnPlate: boolean) {
    const pressed = playerOnPlate || blockOnPlate;
    if (platePressed && !pressed) plateUntil = now + plateReleaseMs;
    platePressed = pressed;
  }

  return {
    setPlateContact,
    plateOpen(now: number) { return platePressed || now < plateUntil; },
    collectKey(now: number) {
      if (progress.key || (!platePressed && now >= plateUntil)) return false;
      progress.key = true;
      save();
      return true;
    },
    openThroneRoom() {
      if (!progress.key || progress.throneRoom) return false;
      progress.throneRoom = true;
      save();
      return true;
    },
    pullGalleryLever(lever: Lever) {
      if (!progress.throneRoom || progress.gallery) return 'inactive';
      if (levers[leverIndex] !== lever) {
        leverIndex = 0;
        return 'reset';
      }
      leverIndex++;
      if (leverIndex < levers.length) return 'progress';
      progress.gallery = true;
      save();
      return 'opened';
    },
    rotateMirror(index: 0 | 1) {
      if (!progress.gallery || progress.mirrorCache) return null;
      mirrors[index] = mirrors[index] % 4 + 1;
      if (mirrors[0] === 2 && mirrors[1] === 4) {
        progress.mirrorCache = true;
        save();
      }
      return mirrors[index];
    },
    ringBell(bell: Bell, now: number) {
      if (!progress.mirrorCache) return 'inactive';
      bellInputs.push(bell);
      if (bellInputs.length < bells.length) return 'progress';
      const correct = bells.every((value, index) => bellInputs[index] === value);
      bellInputs = [];
      if (!correct) return 'reset';
      progress.stairOpenUntil = now + stairDoorMs;
      save();
      return 'opened';
    },
    pullVaultLever(now: number) {
      if (now >= progress.stairOpenUntil) return false;
      vaultUntil = now + vaultDoorMs;
      return true;
    },
    vaultOpen(now: number) { return now < vaultUntil; },
    finishVault(now: number) {
      if (!progress.key || progress.completed || now >= vaultUntil) return false;
      progress.completed = true;
      save();
      return true;
    },
    state(now: number) {
      return { ...progress, leverIndex, mirrors: [...mirrors] as const,
        stairOpen: now < progress.stairOpenUntil, vaultOpen: now < vaultUntil };
    },
  };
}
