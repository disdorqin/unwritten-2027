import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshLambertMaterial, Object3D, Vector3 } from 'three';
import type { TownActivity, TownActivityContext, TownActivitySpot } from './town-activity';
import type { TownSnowballTarget } from './town-snow-target';
import { voxelPersonParts as parts, type VoxelPersonPart as Part } from './town-voxel-person';
import { snowballGravity, snowballSpeed } from './town-snowball';
import { answerNpcQuestion, npcAuthoredDialogue, npcExpansion, npcGreeting, npcFarewell, npcPeriod, npcQuestions,
  type NpcName, type TownNpcGuide } from './town-npc-dialogue';

type Point = readonly [east: number, north: number];

const roles: ReadonlyArray<{
  name: NpcName;
  job: string;
  home: Point;
  stroll: Point;
  indoorFloor?: number;
  palette: readonly string[];
}> = [
  { name: '罗大江', job: '酒馆老板', home: [157.75, 230.46], stroll: [157.8, 230.5], indoorFloor: 16.9,
    palette: ['#e3ad7b', '#5a3431', '#913b38', '#e0c6a4', '#503c42', '#db7943', '#f1c774', '#8e5837'] },
  { name: '苏小满', job: '邮局邮差', home: [264, 198], stroll: [264, 194.8],
    palette: ['#edbd94', '#3b4658', '#3f7180', '#e4d29b', '#374654', '#bf5850', '#f2dec4', '#a86c41'] },
  { name: '顾长明', job: '灯塔看守', home: [408, 87.5], stroll: [405.8, 90.2],
    palette: ['#d6ae8e', '#29374a', '#3a5374', '#bfb7a2', '#383c4d', '#d4a655', '#ffcb6c', '#584354'] },
  { name: '乔麦', job: '灯坊匠人', home: [115, 115], stroll: [111.8, 114.5],
    palette: ['#eead85', '#583139', '#65744a', '#c49b64', '#434634', '#b63838', '#f9b959', '#a34335'] },
  { name: '柳三弦', job: '舞台班主', home: [230, 169], stroll: [226.8, 169],
    palette: ['#e8bd9c', '#322b42', '#804371', '#e1a760', '#48344e', '#b13e52', '#ffd58d', '#694066'] },
  { name: '钟铁生', job: '火车站站长', home: [526, 309], stroll: [522.8, 309],
    palette: ['#d9a377', '#233147', '#36536b', '#b55a43', '#2e3748', '#e0b558', '#efd3a0', '#6e4939'] },
];

type NpcSnowballThrow = (origin: Vector3, direction: Vector3, by: string, power: number) => boolean;

const battleRoles: Partial<Record<NpcName, { at: Point; start: string; hit: string }>> = {
  罗大江: { at: [211, 191], start: '下雪天不打雪仗，那还是冬天吗？接招！', hit: '哎哟！好小子，砸得准！看我的！' },
  苏小满: { at: [233, 194], start: '送信我最快，砸人我也不差哦！', hit: '信差点掉雪里啦——这发我记下了！' },
  乔麦: { at: [214, 179], start: '做灯的手稳，砸雪球更稳。', hit: '砸得好！我这团回敬你，接稳了。' },
  柳三弦: { at: [233, 177], start: '台上唱戏，台下打仗，今儿都齐了！', hit: '好一发！这身段都给我砸出来了。' },
};

const snowHat = [
  [[0, 1.96, .015], [.49, .12, .44], '#edf7ff'],
  [[-.046, 2.07, -.022], [.37, .12, .35], '#e4f3ff'],
  [[.035, 2.166, .008], [.235, .09, .23], '#f6fbff'],
] as const;

// Replace shared cargo, apron and chest pixels with six readable silhouettes in the same batch.
const costumes: Readonly<Record<NpcName, readonly Part[]>> = {
  // Innkeeper: long cloth apron, a folded towel and a chunky tankard with a square handle.
  罗大江: [
    [[0, .98, .197], [.40, .47, .055], 3],
    [[0, .705, .191], [.52, .35, .06], 3],
    [[0, .87, .227], [.53, .060, .032], 7],
    [[-.135, 1.252, .211], [.054, .145, .026], 3],
    [[.135, 1.252, .211], [.054, .145, .026], 3],
    [[.135, .78, .239], [.135, .224, .035], 6],
    [[-.427, .764, .282], [.185, .227, .184], 7],
    [[-.427, .872, .282], [.203, .048, .204], 6],
    [[-.555, .781, .282], [.049, .145, .066], 5],
    [[-.514, .832, .282], [.058, .045, .066], 5],
    [[-.514, .730, .282], [.058, .045, .066], 5],
  ],
  // Postal courier: a wide messenger bag, stepped shoulder strap and visible envelopes.
  苏小满: [
    [[.175, 1.307, .20], [.103, .14, .07], 3],
    [[.12, 1.194, .210], [.107, .115, .057], 3],
    [[.048, 1.109, .217], [.115, .099, .046], 3],
    [[-.039, 1.021, .218], [.118, .100, .042], 3],
    [[-.135, .922, .225], [.117, .116, .045], 3],
    [[-.335, .779, .226], [.309, .245, .163], 7],
    [[-.335, .888, .266], [.326, .082, .116], 5],
    [[-.33, .833, .324], [.087, .069, .028], 6],
    [[-.39, .957, .212], [.125, .101, .026], 6],
    [[-.254, .936, .218], [.126, .068, .026], 6],
    [[.0, 1.876, .310], [.19, .036, .025], 5],
    [[.0, 1.916, .241], [.12, .051, .028], 6],
  ],
  // Lighthouse keeper: thick coat and a narrow glass storm lantern in a metal cage.
  顾长明: [
    [[0, 1.13, .182], [.51, .50, .069], 2],
    [[-.092, 1.137, .226], [.058, .46, .026], 3],
    [[-.165, 1.379, .164], [.156, .10, .163], 3],
    [[.151, 1.379, .164], [.156, .10, .163], 3],
    [[.083, 1.231, .229], [.039, .049, .035], 5],
    [[.083, 1.026, .229], [.039, .049, .035], 5],
    [[-.416, .692, .247], [.184, .19, .176], 6],
    [[-.416, .579, .247], [.23, .068, .215], 1],
    [[-.416, .800, .247], [.21, .063, .198], 1],
    [[-.497, .690, .333], [.029, .172, .025], 5],
    [[-.335, .690, .333], [.029, .172, .025], 5],
    [[-.416, .854, .247], [.049, .051, .050], 5],
  ],
  // Lantern maker: a split workshop apron, tools and a warm paper lantern with stepped ribs.
  乔麦: [
    [[0, 1.036, .213], [.43, .406, .061], 7],
    [[-.109, .756, .216], [.191, .226, .063], 7],
    [[.109, .756, .216], [.191, .226, .063], 7],
    [[.112, .91, .259], [.19, .131, .046], 3],
    [[.089, 1.02, .272], [.031, .146, .028], 6],
    [[.152, 1.026, .272], [.027, .156, .027], 1],
    [[-.423, .792, .233], [.238, .204, .216], 5],
    [[-.423, .909, .233], [.178, .05, .163], 3],
    [[-.423, .677, .233], [.178, .048, .163], 3],
    [[-.423, .779, .349], [.212, .026, .029], 6],
    [[-.423, .855, .349], [.211, .024, .029], 6],
    [[-.423, .624, .233], [.063, .061, .061], 6],
  ],
  // Troupe leader: gold-trimmed long robe, headpiece and folding fan with distinct steps.
  柳三弦: [
    [[0, .588, 0], [.52, .331, .381], 2],
    [[0, .431, .013], [.53, .045, .387], 3],
    [[0, .86, .212], [.53, .090, .052], 5],
    [[-.13, 1.23, .22], [.075, .236, .042], 3],
    [[-.035, 1.116, .22], [.074, .241, .041], 3],
    [[.051, 1.011, .22], [.074, .195, .041], 3],
    [[-.178, 1.943, .156], [.079, .132, .070], 5],
    [[.178, 1.943, .156], [.079, .132, .070], 5],
    [[0, 1.914, .272], [.205, .054, .04], 6],
    [[-.432, .786, .255], [.108, .147, .071], 7],
    [[-.433, .878, .255], [.238, .101, .071], 3],
    [[-.433, .967, .255], [.326, .088, .075], 6],
    [[-.431, 1.017, .255], [.267, .03, .075], 5],
  ],
  // Stationmaster: deep peaked cap, uniform lapels, gold buttons and a signal whistle.
  钟铁生: [
    [[0, 1.846, .262], [.464, .053, .269], 1],
    [[0, 1.912, .032], [.503, .092, .44], 2],
    [[0, 1.885, .255], [.466, .034, .037], 3],
    [[0, 1.911, .277], [.093, .065, .025], 5],
    [[-.163, 1.329, .182], [.188, .052, .15], 5],
    [[.163, 1.329, .182], [.188, .052, .15], 5],
    [[-.117, 1.183, .213], [.071, .266, .037], 3],
    [[.117, 1.183, .213], [.071, .266, .037], 3],
    [[.0, 1.103, .235], [.042, .043, .025], 5],
    [[.0, .969, .235], [.042, .043, .025], 5],
    [[.204, 1.079, .221], [.035, .201, .026], 6],
    [[.204, .981, .245], [.113, .052, .056], 5],
  ],
};
const guideDefaults = new Set<TownNpcGuide>(['seating', 'stage', 'postcard', 'wishes', 'ice', 'lantern']);
const savedVisitKey = 'unwritten:town-npc-visits';


export function createTownNpcActivity(
  context: TownActivityContext,
  heightAt: (east: number, north: number) => number,
  guideEnabled: (feature: TownNpcGuide) => boolean = feature => guideDefaults.has(feature),
  isDaytime?: () => boolean,
): TownActivity & {
  snowballTargets: readonly TownSnowballTarget[];
  updateSnowFight(dt: number, enabled: boolean, player: TownSnowballTarget | undefined, throwSnowball: NpcSnowballThrow): void;
} {
  const actorParts = roles.map(({ name }) => [...parts, ...costumes[name]]);
  let costumeCount = 0;
  const actorStarts = actorParts.map(kit => {
    const start = costumeCount;
    costumeCount += kit.length;
    return start;
  });
  const hatStart = costumeCount;
  const heldStart = hatStart + roles.length * snowHat.length;
  const villagers = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(),
    heldStart + roles.length);
  villagers.name = 'town-npc-shared-skins';
  villagers.instanceMatrix.setUsage(DynamicDrawUsage);
  // Positions change during short walks, so keep one inexpensive batch alive for the town.
  villagers.frustumCulled = false;
  context.scene.add(villagers);
  const transform = new Object3D();
  const color = new Color();
  const strollClocks = roles.map((_, index) => index * 2.35);
  const reboundTime = .32;
  const flinches = roles.map(() => ({ remaining: 0, x: 0, z: 0, axis: new Vector3(1, 0, 0) }));
  const hats = roles.map(() => ({ layers: 0, remaining: 0 }));
  const fighters = roles.map(({ name }) => {
    const role = battleRoles[name];
    return role && { role, nextThrow: 0, stock: 0, gesture: 0, introduced: false };
  });
  const throwOrigin = new Vector3();
  const throwDirection = new Vector3();
  let battlePlayer: TownSnowballTarget | undefined;
  let battleTime = 0;
  let nextBattleLine = 0;
  let active: { role: NpcName; panel: HTMLElement } | undefined;

  const spots: TownActivitySpot[] = roles.map(({ name, home, indoorFloor }, index) => ({
    x: home[0], n: home[1], ground: indoorFloor ?? heightAt(...home), range: 2.15,
    label: `和${name}聊天`,
    run: () => openConversation(index),
  }));
  const snowballTargets: TownSnowballTarget[] = roles.map(({ name }, index) => ({
    id: `npc:${name}`,
    label: name,
    x: spots[index].x,
    y: spots[index].ground,
    z: -spots[index].n,
    radius: .50,
    height: 1.95,
    shape: 'capsule',
    onHit(x, z) {
      const flinch = flinches[index];
      const length = Math.hypot(x, z);
      const directed = Number.isFinite(length) && length > 0;
      flinch.x = directed ? x / length : 0;
      flinch.z = directed ? z / length : 1;
      flinch.axis.set(flinch.z, 0, -flinch.x);
      flinch.remaining = reboundTime;
      hats[index].layers = Math.min(snowHat.length, hats[index].layers + 1);
      hats[index].remaining = 10;
      const fighter = fighters[index];
      if (battlePlayer && fighter) sayBattleLine(index, fighter.role.hit);
    },
  }));
  const facing = roles.map(({ home, stroll }) => Math.atan2(stroll[0] - home[0], home[1] - stroll[1]));
  const talkTurns = roles.map(() => ({ smallTalk: 0, newYear: 0, guides: 0, neighbors: 0 }));
  let visits: Partial<Record<NpcName, number>> = {};
  try {
    const previous: unknown = JSON.parse(localStorage.getItem(savedVisitKey) ?? 'null');
    if (previous && typeof previous === 'object') {
      for (const { name } of roles) {
        const count = (previous as Record<string, unknown>)[name];
        if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) visits[name] = count;
      }
    }
  } catch { /* Private browsers keep the visit counts for this session. */ }

  function moveNpc(index: number, x: number, n: number, indoorFloor?: number) {
    const spot = spots[index];
    const target = snowballTargets[index];
    spot.x = target.x = x;
    spot.n = n;
    target.z = -n;
    spot.ground = target.y = indoorFloor ?? heightAt(x, n);
  }

  function sayBattleLine(index: number, line: string) {
    if (!battlePlayer || active || battleTime < nextBattleLine) return false;
    const target = snowballTargets[index];
    if (Math.hypot(battlePlayer.x - target.x, battlePlayer.z - target.z) > 21) return false;
    context.announce(`${roles[index].name}：${line}`);
    nextBattleLine = battleTime + 1.4;
    return true;
  }

  function updateSnowFight(dt: number, enabled: boolean, player: TownSnowballTarget | undefined, throwSnowball: NpcSnowballThrow) {
    // The square and its approaches share the original town map coordinates.
    const inside = enabled && player && player.x >= 185 && player.x <= 257 && player.z >= -218 && player.z <= -161;
    if (!inside || !player) {
      battlePlayer = undefined;
      return;
    }
    if (!battlePlayer) {
      battleTime = 0;
      nextBattleLine = 0;
      for (let i = 0; i < fighters.length; i++) {
        const fighter = fighters[i];
        if (!fighter) continue;
        fighter.nextThrow = 2.5 + i * .24;
        fighter.stock = 0;
        fighter.gesture = 0;
        fighter.introduced = false;
        if (active?.role !== roles[i].name) moveNpc(i, ...fighter.role.at);
      }
    }
    battlePlayer = player;
    battleTime += dt;
    for (let i = 0; i < fighters.length; i++) {
      const fighter = fighters[i];
      if (!fighter || active?.role === roles[i].name) continue;
      fighter.gesture = Math.max(0, fighter.gesture - dt);
      const actor = snowballTargets[i];
      let opponent: TownSnowballTarget | undefined;
      let distance = 26;
      function consider(target: TownSnowballTarget) {
        const range = Math.hypot(target.x - actor.x, target.z - actor.z);
        if (range >= 1.4 && range < distance) {
          opponent = target;
          distance = range;
        }
      }
      consider(player);
      for (let j = 0; j < fighters.length; j++) {
        if (j !== i && fighters[j] && active?.role !== roles[j].name) consider(snowballTargets[j]);
      }
      if (!opponent) continue;
      const yaw = Math.atan2(opponent.x - actor.x, opponent.z - actor.z);
      facing[i] = yaw;
      if (fighter.stock === 0 && battleTime >= fighter.nextThrow - .5) fighter.stock++;
      if (fighter.stock === 0 || battleTime < fighter.nextThrow) continue;
      const chance = .45 - .30 * Math.max(0, Math.min(1, (distance - 3) / 20));
      const reach = distance - .64;
      const missAngle = Math.asin(Math.min(.94, .82 / reach)) + .12 + Math.random() * .14;
      const error = Math.random() < chance ? 0 : (Math.random() < .5 ? -1 : 1) * missAngle;
      const aim = yaw + error;
      throwOrigin.set(actor.x + Math.sin(yaw) * .64, actor.y + 1.3, actor.z + Math.cos(yaw) * .64);
      const power = Math.min(.95, .28 + .019 * distance);
      const speedSquared = snowballSpeed(power) ** 2;
      const rise = opponent.y + opponent.height * .66 - throwOrigin.y;
      const discriminant = speedSquared ** 2 - snowballGravity * (snowballGravity * reach ** 2 + 2 * rise * speedSquared);
      const pitch = discriminant >= 0
        ? Math.atan((speedSquared - Math.sqrt(discriminant)) / (snowballGravity * reach))
        : Math.PI / 4;
      throwDirection.set(Math.sin(aim) * Math.cos(pitch), Math.sin(pitch), Math.cos(aim) * Math.cos(pitch));
      if (throwSnowball(throwOrigin, throwDirection, actor.id, power)) {
        fighter.stock--;
        fighter.gesture = .28;
        fighter.nextThrow = battleTime + 2.5 + Math.random() * 1.5;
        if (!fighter.introduced) fighter.introduced = sayBattleLine(i, fighter.role.start);
      }
    }
  }

  function openConversation(index: number) {
    const { name, job } = roles[index];
    const spot = spots[index];
    context.face(spot.x, spot.n, spot.ground + 1.61);
    const panel = context.open(`${name} · ${job}`, ' ');
    active = { role: name, panel };
    const dialogue = npcAuthoredDialogue[name];
    const stories = npcExpansion[name];
    const turns = talkTurns[index];
    const period = npcPeriod(new Date(), isDaytime?.());
    const visitsBefore = visits[name] ?? 0;
    visits[name] = visitsBefore + 1;
    try { localStorage.setItem(savedVisitKey, JSON.stringify(visits)); }
    catch { /* The in-memory count still works. */ }
    const speech = document.createElement('p');
    speech.setAttribute('role', 'status');
    speech.textContent = npcGreeting(name, period, visitsBefore);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
    const selector = document.createElement('select');
    selector.setAttribute('aria-label', '关于张乐天的问题');
    selector.style.cssText = 'width:100%;min-width:0;font:inherit;padding:7px;border-radius:6px';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '选一个关于张乐天的问题';
    selector.append(placeholder);
    for (const { title, questions } of npcQuestions) {
      const group = document.createElement('optgroup');
      group.label = title;
      for (const [id, label] of questions) {
        const opt = document.createElement('option');
        opt.value = String(id);
        opt.textContent = label;
        group.append(opt);
      }
      selector.append(group);
    }

    function action(label: string, onClick: () => void) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = onClick;
      controls.append(button);
      return button;
    }
    const ask = action('问一句', () => {
      if (selector.value) speech.textContent = answerNpcQuestion(name, Number(selector.value), period === '跨年夜').text;
    });
    ask.disabled = true;
    selector.onchange = () => { ask.disabled = !selector.value; };
    const smallTalk = [...dialogue.smallTalk, ...stories.life, ...stories.weather, ...npcExpansion.通用.weather];
    const newYear = [...stories.newYear, ...npcExpansion.通用.newYear];
    action('聊聊雪镇', () => { speech.textContent = smallTalk[turns.smallTalk++ % smallTalk.length]; });
    action('聊聊镇民', () => { speech.textContent = stories.neighbors[turns.neighbors++ % stories.neighbors.length]; });
    action('聊聊跨年', () => { speech.textContent = newYear[turns.newYear++ % newYear.length]; });
    action('附近有什么好玩的？', () => {
      const guides = Object.entries(stories.guides).filter(([feature]) => guideEnabled(feature as TownNpcGuide));
      speech.textContent = guides.length ? guides[turns.guides++ % guides.length][1] : '先到街上走走，看看雪和灯吧。';
    });
    action('道别', () => {
      panel.closest('dialog')?.close();
      context.announce(npcFarewell(name, period));
    });
    panel.append(speech, selector, controls);
  }

  function pose(index: number, gait: number) {
    const spot = spots[index];
    const yaw = facing[index];
    const cosine = Math.cos(yaw), sine = Math.sin(yaw);
    const flinch = flinches[index];
    const recoil = Math.sin(Math.PI * flinch.remaining / reboundTime) * .14;
    const kit = actorParts[index];
    const first = actorStarts[index];
    for (let offset = 0; offset < kit.length; offset++) {
      const [[x, y, z], size, , swing] = kit[offset];
      const step = swing ? gait * swing : 0;
      const throwGesture = battlePlayer && swing && x > .32 && y > .75
        ? Math.sin(Math.PI * (fighters[index]?.gesture ?? 0) / .28) : 0;
      const reach = (1.44 - y) * throwGesture;
      const forward = z + step * .105 + reach * .82;
      const lean = y * recoil;
      transform.position.set(spot.x + x * cosine + forward * sine + flinch.x * lean,
        spot.ground + y - lean * .32 + Math.abs(step) * .065 + reach * .62,
        -spot.n - x * sine + forward * cosine + flinch.z * lean);
      transform.rotation.set(-step * .25 - throwGesture, yaw, 0, 'YXZ');
      if (recoil > 0) transform.rotateOnWorldAxis(flinch.axis, recoil);
      transform.scale.set(...size);
      transform.updateMatrix();
      villagers.setMatrixAt(first + offset, transform.matrix);
    }
    for (let layer = 0; layer < snowHat.length; layer++) {
      const [[x, y, z], [width, height, depth]] = snowHat[layer];
      const visible = hats[index].layers > layer ? 1 : 0;
      const lean = y * recoil;
      transform.position.set(spot.x + x * cosine + z * sine + flinch.x * lean,
        spot.ground + y - lean * .32, -spot.n - x * sine + z * cosine + flinch.z * lean);
      transform.rotation.set(0, yaw, 0);
      if (recoil > 0) transform.rotateOnWorldAxis(flinch.axis, recoil);
      transform.scale.set(width * visible, height * visible, depth * visible);
      transform.updateMatrix();
      villagers.setMatrixAt(hatStart + index * snowHat.length + layer, transform.matrix);
    }
    const fighter = fighters[index];
    const holding = Boolean(battlePlayer && fighter?.stock);
    const heldSize = holding ? .22 : 0;
    transform.position.set(spot.x + .40 * cosine + .34 * sine, spot.ground + 1.15,
      -spot.n - .40 * sine + .34 * cosine);
    transform.rotation.set(.40, yaw + .3, .27);
    transform.scale.setScalar(heldSize);
    transform.updateMatrix();
    villagers.setMatrixAt(heldStart + index, transform.matrix);
  }

  roles.forEach(({ palette }, index) => {
    pose(index, 0);
    const first = actorStarts[index];
    actorParts[index].forEach(([, , tint], offset) => {
      villagers.setColorAt(first + offset, color.set(palette[tint]));
    });
    snowHat.forEach(([, , tint], layer) => {
      villagers.setColorAt(hatStart + index * snowHat.length + layer, color.set(tint));
    });
    villagers.setColorAt(heldStart + index, color.set('#f5fbff'));
  });
  villagers.instanceMatrix.needsUpdate = true;
  if (villagers.instanceColor) villagers.instanceColor.needsUpdate = true;

  return {
    spots,
    snowballTargets,
    updateSnowFight,
    update(dt) {
      if (active && (!active.panel.isConnected || !active.panel.closest('dialog')?.open)) active = undefined;
      let changed = false;
      for (let i = 0; i < roles.length; i++) {
        const { name, home, stroll, indoorFloor } = roles[i];
        const flinch = flinches[i];
        const reacting = flinch.remaining > 0;
        if (reacting) flinch.remaining = Math.max(0, flinch.remaining - dt);
        const hat = hats[i];
        const wasWearingSnow = hat.layers > 0;
        if (wasWearingSnow) {
          hat.remaining = Math.max(0, hat.remaining - dt);
          if (!hat.remaining) hat.layers = 0;
        }
        const snowMelted = wasWearingSnow && !hat.layers;
        if (active?.role === name) {
          if (reacting || snowMelted) { pose(i, 0); changed = true; }
          continue;
        }
        const fighter = fighters[i];
        if (battlePlayer && fighter) {
          const [east, north] = fighter.role.at;
          const phase = battleTime * .9 + i;
          moveNpc(i, east + .65 * Math.sin(phase), north + .5 * Math.cos(phase));
          pose(i, .32 * Math.sin(battleTime * 5 + i));
          changed = true;
          continue;
        }
        const spot = spots[i];
        // Stagger pauses and keep routes near the role's accessible street entrance.
        const period = 27 + i * 1.7;
        if (!reacting) strollClocks[i] = (strollClocks[i] + dt) % period;
        const phase = strollClocks[i];
        const outward = phase < 14;
        const progress = outward ? Math.min(1, Math.max(0, (phase - 9) / 4))
          : 1 - Math.min(1, (phase - 14) / 4);
        const x = home[0] + (stroll[0] - home[0]) * progress;
        const n = home[1] + (stroll[1] - home[1]) * progress;
        const moving = x !== spot.x || n !== spot.n;
        if (!moving && !reacting && !snowMelted) continue;
        if (moving) {
          moveNpc(i, x, n, indoorFloor);
          facing[i] = Math.atan2(stroll[0] - home[0], home[1] - stroll[1]) + (outward ? 0 : Math.PI);
        }
        const gait = progress > 0 && progress < 1 ? Math.sin(phase * 7) : 0;
        pose(i, gait);
        changed = true;
      }
      if (changed) villagers.instanceMatrix.needsUpdate = true;
    },
  };
}
