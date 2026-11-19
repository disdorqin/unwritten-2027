export const residentDossierRoles = [
  'mayor', 'railmaster', 'firekeeper', 'registrar', 'palace-guard', 'market-representative',
  'troupe-leader', 'bell-keeper', 'courier', 'lake-fisher', 'mine-watch', 'sky-watch',
  'foothill-registrar', 'mascot',
] as const;

export type TownEnvironmentRole = typeof residentDossierRoles[number];
type Anchor = readonly [east: number, north: number, feet: number];
type Locate = (role: TownEnvironmentRole) => Anchor | undefined;

// Only actions whose subject and trigger accompany the task book.
export const residentHabitBeats = {
  'before-story': { role: 'mayor', action: 'pour-tea' },
  'mine-news-returned': { role: 'firekeeper', action: 'add-wood-and-pause', logs: 3 },
  'after-palace-progress': { role: 'palace-guard', action: 'wipe-lock', lettering: 'unreadable' },
  'world-anomaly-advanced': { role: 'registrar', action: 'mark-register' },
  'flying-device-assembled': { role: 'sky-watch', action: 'try-locked-gate' },
} as const satisfies Record<string, { role: TownEnvironmentRole; action: string; logs?: number; lettering?: string }>;

type NamedBond = readonly [TownEnvironmentRole, TownEnvironmentRole, string?];
export const residentNamedBonds = [
  ['mayor', 'railmaster', 'new-years-eve-drink'],
  ['railmaster', 'bell-keeper'],
  ['bell-keeper', 'troupe-leader'],
  ['firekeeper', 'lake-fisher'],
  ['lake-fisher', 'mayor'],
  ['registrar', 'sky-watch', 'flags-and-lights'],
  ['palace-guard', 'troupe-leader'],
  ['market-representative', 'courier', 'offer-food'],
  ['courier', 'mine-watch'],
] as const satisfies readonly NamedBond[];

function valid(anchor: Anchor | undefined): anchor is Anchor {
  return !!anchor && anchor.every(Number.isFinite);
}

export function residentHabitAt(trigger: keyof typeof residentHabitBeats, locate: Locate) {
  const beat = residentHabitBeats[trigger];
  const anchor = locate(beat.role);
  if (valid(anchor)) return { ...beat, anchor };
}

export function residentBondBetween(first: TownEnvironmentRole, second: TownEnvironmentRole, locate: Locate) {
  if (first === second) return;
  const bond = residentNamedBonds.find(([a, b]) => (a === first && b === second) || (b === first && a === second));
  const mascotBondsTown = first === 'mascot' || second === 'mascot';
  if (!bond && !mascotBondsTown) return;
  const roleA = bond?.[0] ?? 'mascot';
  const roleB = bond?.[1] ?? (first === 'mascot' ? second : first);
  const anchorA = locate(roleA), anchorB = locate(roleB);
  if (!valid(anchorA) || !valid(anchorB)) return;
  return { roles: [roleA, roleB] as const, anchors: [anchorA, anchorB] as const, cue: bond?.[2] };
}
