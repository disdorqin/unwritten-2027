import type { TownActivitySpot } from './town-activity';
import { nearCampfire, type CampfireSite } from './town-campfires';
import type { createTownNpcActivity } from './town-npc';
import { residentZodiacClues, type TownResidentName, type TownResidentStation } from './town-npc-residents';

export const townResidentStations = {
  forest: { actor: [122.35, 405.75, 18.945520], talk: [122.35, 404.75, 19.242463] },
  lakeside: { actor: [338.70, 110.45, 8.313988], talk: [339.60, 110.45, 8.373581] },
  hotSpring: { actor: [556.08, 163, 15.18], talk: [555.20, 162.75, 15.18] },
  palace: { actor: [491.75, 74, 12.17], talk: [491.75, 72.65, 12.17] },
} as const satisfies Record<string, TownResidentStation>;

export const marketResidentNames = ['贾明灯', '文墨生', '胡六环'] as const;
type MarketName = typeof marketResidentNames[number];
type PalaceProgress = { key: boolean; throneRoom: boolean; gallery: boolean; mirrorCache: boolean; stairOpen: boolean };

type StationOptions = {
  campfires: readonly CampfireSite[];
  canStand: (x: number, n: number, ground: number) => boolean;
  isNight: () => boolean;
  forestChop: () => TownActivitySpot | undefined;
  mainFishing: () => TownActivitySpot | undefined;
  hotSpringFire?: () => CampfireSite | undefined;
  palaceProgress?: () => PalaceProgress | undefined;
  marketStall?: (name: MarketName) => { station: TownResidentStation; activity?: TownActivitySpot } | undefined;
  canCollect?: Parameters<typeof residentZodiacClues>[1];
  awakenedGoldGoat?: () => boolean;
  plazaGathering?: ReturnType<typeof createPlazaResidentGathering>;
};

// Use an existing NPC stroll cycle for the length of one gathering round.
const plazaGatheringRoundMs = 27_000;

export function createPlazaResidentGathering(
  canStand: StationOptions['canStand'],
) {
  const stations = new Map<MarketName, TownResidentStation>();
  let until = 0;
  return {
    start(at: number, hour: number, fires: readonly CampfireSite[]) {
      until = at + plazaGatheringRoundMs;
      stations.clear();
      const plazaFire = fires.find(fire => fire.id === 'plaza-brazier-a');
      if (!plazaFire) return;
      for (const { approach, x, n, ground } of plazaFire.seats) {
        // Keep one merchant at their stall. Reuse only validated plaza anchor pairs.
        const actor = [x, n, ground] as const;
        const talk = [approach.x, approach.n, approach.ground] as const;
        if (!canStand(...actor) || !canStand(...talk)) continue;
        const name = marketResidentNames[(hour + stations.size) % marketResidentNames.length];
        stations.set(name, { actor, talk });
        if (stations.size === marketResidentNames.length - 1) break;
      }
    },
    tick(now: number, ordinary: boolean) {
      if (!ordinary || now >= until) stations.clear();
    },
    station(name: MarketName) { return stations.get(name); },
  };
}

export function palaceStewardGuides(progress?: PalaceProgress) {
  if (!progress) return [];
  const first = !progress.key ? 0 : progress.throneRoom && progress.gallery && progress.mirrorCache && !progress.stairOpen ? 3 : 4;
  return [first, 1, 2, 5];
}

export function registerTownResidentStations(npc: Pick<ReturnType<typeof createTownNpcActivity>, 'registerResident'>, options: StationOptions) {
  const validated = new WeakSet<TownResidentStation>();
  function safe(station: TownResidentStation) {
    if (validated.has(station)) return station;
    if (!options.canStand(...station.actor) || !options.canStand(...station.talk)) return undefined;
    validated.add(station);
    return station;
  }

  function byFire(station: TownResidentStation, fire?: CampfireSite) {
    if (!fire) return undefined;
    const fires = [fire];
    if (!nearCampfire(fires, ...station.actor) || !nearCampfire(fires, ...station.talk)) return undefined;
    return safe(station);
  }
  const forest = options.campfires.find(site => site.id === 'forest');
  const lake = options.campfires.find(site => site.id === 'lakeside');
  function clueOptions(name: TownResidentName) {
    return { clues: () => residentZodiacClues(name, options.canCollect ?? (() => false),
      options.awakenedGoldGoat?.()) };
  }
  const forestSpot = npc.registerResident('樊樵', () =>
    options.forestChop() ? byFire(townResidentStations.forest, forest) : undefined, clueOptions('樊樵'));
  const fishingSpot = npc.registerResident('翁寒江', () => {
    const evening = options.isNight() && byFire(townResidentStations.hotSpring, options.hotSpringFire?.());
    return evening || (options.mainFishing() ? byFire(townResidentStations.lakeside, lake) : undefined);
  }, clueOptions('翁寒江'));
  const palaceSpot = npc.registerResident('秦知礼', () =>
    options.palaceProgress?.() ? safe(townResidentStations.palace) : undefined, {
    ...clueOptions('秦知礼'), guides: () => palaceStewardGuides(options.palaceProgress?.()),
  });

  const stallSpots = marketResidentNames.map(name => npc.registerResident(name, () => {
    const stall = options.marketStall?.(name);
    return stall?.activity ? options.plazaGathering?.station(name) ?? safe(stall.station) : undefined;
  }, { ...clueOptions(name), activity: () => options.marketStall?.(name)?.activity }));
  return [forestSpot, fishingSpot, palaceSpot, ...stallSpots];
}
