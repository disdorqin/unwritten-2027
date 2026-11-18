import { Color, Object3D, type InstancedMesh } from 'three';
import type { TownActivityContext, TownActivitySpot } from './town-activity';
import { npcAddedDialogue } from './town-npc-added-dialogue';
import { palaceStewardDialogue } from './town-npc-palace-dialogue';
import { voxelPersonParts, type VoxelPersonPart } from './town-voxel-person';

const costumes = {
  樊樵: { job: '守林人', palette: ['#d6aa83', '#483a2b', '#4c6850', '#b69a71', '#423a36', '#89534b', '#e1c17f', '#695b48'],
    extra: [[[-.38, .91, .23], [.22, .28, .14], 7]] },
  翁寒江: { job: '冰钓老手', palette: ['#dbb394', '#473e39', '#466577', '#b7bdc0', '#2d4350', '#7f5b5a', '#d4bd83', '#7b6148'],
    extra: [[[.37, .77, .24], [.26, .22, .19], 6]] },
  秦知礼: { job: '宫殿礼仪官', palette: ['#e4b893', '#3b3949', '#637890', '#c7e1e5', '#3e4e68', '#80546b', '#eacf8b', '#6e6b83'],
    extra: [[[0, 1.04, .23], [.11, .50, .048], 3]] },
  贾明灯: { job: '灯笼摊主', palette: ['#d8a778', '#523637', '#9d4d39', '#e5be76', '#56383f', '#ba5b48', '#f4d48b', '#874a32'],
    extra: [[[.39, .82, .27], [.17, .23, .17], 6]] },
  文墨生: { job: '春联年画摊主', palette: ['#d9af87', '#363743', '#566371', '#dec7a1', '#414354', '#9c5760', '#ecd6a1', '#5c4c42'],
    extra: [[[-.39, .84, .21], [.15, .34, .08], 6]] },
  胡六环: { job: '套圈摊主', palette: ['#dba87e', '#493331', '#805344', '#ccb876', '#413c4f', '#97652f', '#e9cb74', '#71463a'],
    extra: [[[.38, .81, .23], [.24, .09, .23], 6]] },
} as const satisfies Record<string, { job: string; palette: readonly string[]; extra: readonly VoxelPersonPart[] }>;

export type TownResidentName = keyof typeof costumes;
export const townResidentNames = Object.keys(costumes) as TownResidentName[];
export const townResidentCapacity = townResidentNames.reduce((count, name) =>
  count + voxelPersonParts.length + costumes[name].extra.length, 0);

type Position = readonly [east: number, north: number, feet: number];
export type TownResidentStation = { actor: Position; talk: Position };
export type TownResidentOptions = {
  guides?(): readonly number[];
  clues?(): readonly string[];
  activity?(): Pick<TownActivitySpot, 'label' | 'run' | 'available'> | undefined;
};

const residentDialogue = {
  贾明灯: npcAddedDialogue.贾明灯,
  文墨生: npcAddedDialogue.文墨生,
  胡六环: npcAddedDialogue.胡六环,
  翁寒江: npcAddedDialogue.翁寒江,
  樊樵: npcAddedDialogue.樊樵,
  秦知礼: palaceStewardDialogue,
};

type ResidentRegistration = {
  name: TownResidentName;
  locate(): TownResidentStation | undefined;
  options: TownResidentOptions;
  spot: TownActivitySpot;
  site?: TownResidentStation;
};

function sameStation(a?: TownResidentStation, b?: TownResidentStation) {
  return a === b || !!(a && b && a.actor.every((value, i) => value === b.actor[i]) &&
    a.talk.every((value, i) => value === b.talk[i]));
}

export function createTownResidentController(
  batch: InstancedMesh, bodyStart: number, context: Pick<TownActivityContext, 'face' | 'open'>,
  visit: (name: TownResidentName) => number, isNewYear: () => boolean,
) {
  const registered = new Map<TownResidentName, ResidentRegistration>();
  const pose = new Object3D();
  const color = new Color();
  batch.count = bodyStart;

  function redraw() {
    let index = bodyStart;
    for (const { name, site } of registered.values()) {
      if (!site) continue;
      const { palette, extra } = costumes[name];
      const [east, north, floor] = site.actor;
      const yaw = Math.atan2(site.talk[0] - east, north - site.talk[1]);
      const cosine = Math.cos(yaw), sine = Math.sin(yaw);
      for (const [[x, y, z], size, tint] of [...voxelPersonParts, ...extra]) {
        pose.position.set(east + x * cosine + z * sine, floor + y, -north - x * sine + z * cosine);
        pose.rotation.set(0, yaw, 0);
        pose.scale.set(...size);
        pose.updateMatrix();
        batch.setMatrixAt(index, pose.matrix);
        batch.setColorAt(index, color.set(palette[tint]));
        index++;
      }
    }
    batch.count = index;
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
  }

  function update() {
    let changed = false;
    for (const entry of registered.values()) {
      const site = entry.locate();
      if (sameStation(site, entry.site)) continue;
      entry.site = site;
      if (site) [entry.spot.x, entry.spot.n, entry.spot.ground] = site.talk;
      changed = true;
    }
    if (changed) redraw();
  }

  function register(name: TownResidentName, locate: ResidentRegistration['locate'], options: TownResidentOptions = {}) {
    const existing = registered.get(name);
    if (existing) {
      Object.assign(existing, { locate, options });
      update();
      return existing.spot;
    }
    const spot: TownActivitySpot = {
      x: 0, n: 0, ground: 0, range: .85, label: `和${name}聊天`,
      available: () => entry.site !== undefined,
      run() {
        if (!entry.site) return;
        const [east, north, floor] = entry.site.actor;
        context.face(east, north, floor + 1.61);
        openResidentDialog(entry, context.open(`${name} · ${costumes[name].job}`, ' '), visit(name), isNewYear());
      },
    };
    const entry: ResidentRegistration = { name, locate, options, spot };
    registered.set(name, entry);
    update();
    return spot;
  }

  return { register, update };
}

function openResidentDialog({ name, options }: ResidentRegistration, panel: HTMLElement, visits: number, isNewYear: boolean) {
  const role = residentDialogue[name];
  const speech = document.createElement('p');
  speech.setAttribute('role', 'status');
  const greeting = isNewYear ? role.newYear : visits === 0 ? role.familiar.初见
    : visits < 4 ? role.familiar.再访 : role.familiar.常客;
  speech.textContent = greeting[visits % greeting.length];
  const controls = document.createElement('div');
  controls.className = 'town-mail-form';
  function action(label: string, run: () => void) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = run;
    controls.append(button);
  }
  function rotate(label: string, lines: readonly string[]) {
    if (!lines.length) return;
    let turn = 0;
    action(label, () => { speech.textContent = lines[turn++ % lines.length]; });
  }
  const guides = options.guides?.().map(index => role.guides[index]).filter((line): line is NonNullable<typeof line> => !!line);
  rotate('请讲讲这里的玩法', guides ?? role.guides);
  rotate('问生肖线索', options.clues?.() ?? (name === '秦知礼' ? [palaceStewardDialogue.clues[0]] : []));
  rotate('聊聊镇民', role.gossip);
  rotate('聊聊跨年', role.newYear);
  const questions = ['问你们怎么认识', '问镇长近况', '问镇长为人', '听一句介绍', '问联系方式', '问住处'];
  [...role.questions.host, ...role.questions.outside].forEach(({ text }, index) =>
    action(questions[index], () => { speech.textContent = text; }));
  const activity = options.activity?.();
  if (activity && activity.available?.() !== false) action(activity.label, () => {
    if (activity.available?.() === false) return;
    panel.closest('dialog')?.close();
    activity.run();
  });
  action('道别', () => { panel.closest('dialog')?.close(); });
  panel.append(speech, controls);
}

type ResidentClueId = 'ox' | 'monkey' | 'dragon' | 'rooster' | 'rabbit' | 'snake' | 'tiger';

export function residentZodiacClues(
  name: TownResidentName, available: (id: ResidentClueId) => boolean, awakenedGoldGoat = false,
  authorizedSnakeClue?: string,
) {
  if (name === '秦知礼') return [palaceStewardDialogue.clues[awakenedGoldGoat ? 1 : 0]];
  const ids = {
    贾明灯: ['ox', 'monkey'], 文墨生: ['ox', 'dragon'], 胡六环: ['ox', 'rooster'],
    翁寒江: ['rabbit'], 樊樵: ['tiger'],
  } as const;
  const clues: string[] = [];
  ids[name].forEach((id, index) => {
    if (available(id)) clues.push(residentDialogue[name].clues[index]);
  });
  // The old bridge clue remains in the first corpus. The active lighthouse port supplies its approved replacement.
  if (name === '翁寒江' && authorizedSnakeClue && available('snake')) clues.push(authorizedSnakeClue);
  return clues;
}
