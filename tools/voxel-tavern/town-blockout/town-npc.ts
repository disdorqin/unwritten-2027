import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshLambertMaterial, Object3D, Vector3 } from 'three';
import type { TownActivity, TownActivityContext, TownActivitySpot } from './town-activity';
import type { TownSnowballTarget } from './town-snow-target';
import { snowballGravity, snowballSpeed } from './town-snowball';
import { answerNpcQuestion, npcExpansion, npcQuestions, npcScript,
  type NpcName, type NpcPeriod, type TownNpcGuide } from './town-npc-dialogue';

type Point = readonly [east: number, north: number];
type Size = readonly [x: number, y: number, z: number];
type Part = readonly [center: Size, size: Size, material: number, swing?: number];

const roles: ReadonlyArray<{
  name: NpcName;
  job: string;
  home: Point;
  stroll: Point;
  palette: readonly string[];
}> = [
  { name: '罗大江', job: '酒馆老板', home: [158.5, 218], stroll: [155.5, 217],
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

// All six costumes share these silhouettes and one box geometry. The instance palette
// varies the apron, satchel, lamp, tool pouch, sash and station insignia by character.
const parts: readonly Part[] = [
  [[0, 1.12, 0], [.58, .66, .36], 2],
  [[0, .74, 0], [.56, .11, .365], 4],
  [[0, .82, .189], [.32, .13, .026], 3],
  [[0, 1.06, .19], [.37, .39, .032], 3],
  [[-.10, 1.24, .211], [.043, .20, .02], 5],
  [[.12, 1.18, .211], [.09, .076, .02], 6],
  [[0, 1.39, 0], [.44, .12, .4], 5],
  [[.14, 1.23, .202], [.14, .30, .02], 5],
  [[0, 1.64, 0], [.43, .44, .41], 0],
  [[0, 1.83, 0], [.474, .16, .45], 1],
  [[0, 1.79, -.204], [.449, .28, .052], 1],
  [[0, 1.88, .13], [.49, .087, .334], 1],
  [[0, 1.875, .297], [.468, .024, .019], 5],
  [[0, 1.90, .248], [.08, .065, .033], 6],
  [[-.095, 1.661, .21], [.061, .046, .02], 1],
  [[.095, 1.661, .21], [.061, .046, .02], 1],
  [[0, 1.532, .211], [.078, .026, .02], 7],
  [[-.139, .411, 0], [.246, .66, .27], 4, -1],
  [[.139, .411, 0], [.246, .66, .27], 4, 1],
  [[-.139, .112, .045], [.252, .22, .36], 1, -1],
  [[.139, .112, .045], [.252, .22, .36], 1, 1],
  [[-.139, .214, .118], [.248, .045, .239], 5, -1],
  [[.139, .214, .118], [.248, .045, .239], 5, 1],
  [[-.394, 1.168, 0], [.199, .55, .29], 2, 1],
  [[.394, 1.168, 0], [.199, .55, .29], 2, -1],
  [[-.394, .898, 0], [.182, .155, .20], 3, 1],
  [[.394, .898, 0], [.182, .155, .20], 3, -1],
  [[-.394, .816, 0], [.167, .136, .18], 0, 1],
  [[.394, .816, 0], [.167, .136, .18], 0, -1],
  [[.346, .79, .204], [.27, .285, .18], 7],
  [[.346, .843, .264], [.285, .089, .063], 5],
  [[.346, .771, .3], [.11, .10, .018], 6],
  [[.29, .86, .166], [.026, .32, .023], 7],
];

// Chest designs share nine color slots: mug, envelope, beacon, paper lantern, opera mask, railway insignia.
const chestPatterns = ['066060060', '060606666', '060666060', '060666666', '606666060', '666060606'];
const guideDefaults = new Set<TownNpcGuide>(['seating', 'stage', 'postcard', 'wishes', 'ice', 'lantern']);
const savedVisitKey = 'unwritten:town-npc-visits';
const shanghaiClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai', hourCycle: 'h23', hour: '2-digit',
  month: '2-digit', day: '2-digit',
});

function townPeriod(now: Date): NpcPeriod {
  const pieces = shanghaiClock.formatToParts(now);
  const hour = Number(pieces.find(piece => piece.type === 'hour')?.value);
  const month = pieces.find(piece => piece.type === 'month')?.value;
  const day = pieces.find(piece => piece.type === 'day')?.value;
  if ((month === '12' && day === '31' && hour >= 18) || (month === '01' && day === '01' && hour < 2)) return '跨年夜';
  return hour >= 20 || hour < 6 ? '夜里' : '傍晚';
}

export function createTownNpcActivity(
  context: TownActivityContext,
  heightAt: (east: number, north: number) => number,
  guideEnabled: (feature: TownNpcGuide) => boolean = feature => guideDefaults.has(feature),
): TownActivity & {
  snowballTargets: readonly TownSnowballTarget[];
  updateSnowFight(dt: number, enabled: boolean, player: TownSnowballTarget | undefined, throwSnowball: NpcSnowballThrow): void;
} {
  const skinParts: readonly Part[] = [
    ...parts,
    ...Array.from({ length: 9 }, (_, i): Part => [
      [((i % 3) - 1) * .047, 1.055 + (1 - Math.floor(i / 3)) * .047, .214], [.046, .046, .016], 3,
    ]),
  ];
  const villagers = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(),
    roles.length * (skinParts.length + snowHat.length + 1));
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

  const spots: TownActivitySpot[] = roles.map(({ name, home }, index) => ({
    x: home[0], n: home[1], ground: heightAt(...home), range: 2.15,
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

  function moveNpc(index: number, x: number, n: number) {
    const spot = spots[index];
    const target = snowballTargets[index];
    spot.x = target.x = x;
    spot.n = n;
    target.z = -n;
    spot.ground = target.y = heightAt(x, n);
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
    const dialogue = npcScript[name];
    const stories = npcExpansion[name];
    const turns = talkTurns[index];
    const period = townPeriod(new Date());
    const visitsBefore = visits[name] ?? 0;
    visits[name] = visitsBefore + 1;
    try { localStorage.setItem(savedVisitKey, JSON.stringify(visits)); }
    catch { /* The in-memory count still works. */ }
    const familiar = stories.familiar[visitsBefore === 0 ? '初见' : visitsBefore < 4 ? '再访' : '常客'];
    const greetings = period === '跨年夜' || visitsBefore % 2 === 1 ? dialogue.greetings[period] : familiar;
    const speech = document.createElement('p');
    speech.setAttribute('role', 'status');
    speech.textContent = greetings[Math.floor(visitsBefore / 2) % greetings.length];

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
      context.announce(dialogue.farewells[period]);
    });
    panel.append(speech, selector, controls);
  }

  function pose(index: number, gait: number) {
    const spot = spots[index];
    const yaw = facing[index];
    const cosine = Math.cos(yaw), sine = Math.sin(yaw);
    const flinch = flinches[index];
    const recoil = Math.sin(Math.PI * flinch.remaining / reboundTime) * .14;
    for (let offset = 0; offset < skinParts.length; offset++) {
      const [[x, y, z], size, , swing] = skinParts[offset];
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
      const instance = index * skinParts.length + offset;
      villagers.setMatrixAt(instance, transform.matrix);
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
      villagers.setMatrixAt(roles.length * skinParts.length + index * snowHat.length + layer, transform.matrix);
    }
    const fighter = fighters[index];
    const holding = Boolean(battlePlayer && fighter?.stock);
    const heldSize = holding ? .22 : 0;
    transform.position.set(spot.x + .40 * cosine + .34 * sine, spot.ground + 1.15,
      -spot.n - .40 * sine + .34 * cosine);
    transform.rotation.set(.40, yaw + .3, .27);
    transform.scale.setScalar(heldSize);
    transform.updateMatrix();
    villagers.setMatrixAt(roles.length * (skinParts.length + snowHat.length) + index, transform.matrix);
  }

  roles.forEach(({ palette }, index) => {
    pose(index, 0);
    skinParts.forEach(([, , tint], offset) => {
      const pattern = chestPatterns[index][offset - parts.length];
      // Treat zero as base cloth so the picture stays flush with the rest of the costume.
      villagers.setColorAt(index * skinParts.length + offset, color.set(palette[Number(pattern) || tint]));
    });
    snowHat.forEach(([, , tint], layer) => {
      villagers.setColorAt(roles.length * skinParts.length + index * snowHat.length + layer, color.set(tint));
    });
    villagers.setColorAt(roles.length * (skinParts.length + snowHat.length) + index, color.set('#f5fbff'));
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
        const { name, home, stroll } = roles[i];
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
          moveNpc(i, x, n);
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
