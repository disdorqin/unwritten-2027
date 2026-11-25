import * as THREE from 'three';
import {
  resolveOrbitalGateTravel, type OrbitalGate, type OrbitalGateEndpoint,
  type OrbitalGateHost, type OrbitalGatePose, type OrbitalGateState,
} from '../../../src/presence/orbital-gates.js';
import { createOrbitalEarlyRooms } from './orbital-early-rooms.js';
import { mountOrbitalStatusDisplay } from './orbital-status-display.js';
import type { ExpansionView } from './town-expansion-review-renderer.js';

const gateLabel = { starport: '星港太空门', core: '地宫核心舱门' } as const;
const fixtureGround: OrbitalGatePose = { east: 0, north: 0, height: 0, yaw: 0 };

export function createOrbitalReview(show: (view: ExpansionView) => void) {
  const rooms = createOrbitalEarlyRooms();
  mountOrbitalStatusDisplay(rooms.group);
  rooms.group.traverse(object => {
    if (object.name === 'orbital-cutaway-shell') object.visible = false;
  });
  const ground = new THREE.Group();
  const landingPad = new THREE.Mesh(
    new THREE.BoxGeometry(6, .2, 5), new THREE.MeshStandardMaterial({ color: 0x546b81 }),
  );
  landingPad.position.y = -.1;
  ground.add(landingPad);
  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, .13, 8, 24), new THREE.MeshStandardMaterial({ color: 0x8fc6d8 }),
  );
  frame.position.set(0, 1.35, -.8);
  ground.add(frame);

  const pointOf = (point: { x: number; n: number; ground: number }, yaw = 0): OrbitalGatePose =>
    ({ east: point.x, north: point.n, height: point.ground, yaw });
  const landing: Record<OrbitalGateEndpoint, OrbitalGateState> = {
    'starport-ground': { site: 'starport', pose: fixtureGround },
    'core-ground': { site: 'core', pose: fixtureGround },
    'starport-airlock': { site: 'airlock', pose: pointOf(rooms.ports.starport.arrival, rooms.ports.starport.arrival.yaw) },
    'core-airlock': { site: 'airlock', pose: pointOf(rooms.ports.coreVault.arrival, rooms.ports.coreVault.arrival.yaw) },
  };
  const approaches: Record<OrbitalGateEndpoint, OrbitalGatePose> = {
    'starport-ground': fixtureGround,
    'core-ground': fixtureGround,
    'starport-airlock': pointOf(rooms.ports.starport.approach),
    'core-airlock': pointOf(rooms.ports.coreVault.approach),
  };
  const host: OrbitalGateHost = {
    // Preview switches stand in for the production unlock record. This host is only used by the review page.
    isOpen: () => unlocked,
    isAtOpening(endpoint, pose) {
      const point = approaches[endpoint];
      return Math.hypot(pose.east - point.east, pose.north - point.north, pose.height - point.height) <= .75;
    },
    landingAt: endpoint => landing[endpoint],
    isLegalLanding(endpoint, pose) {
      return landing[endpoint].site !== 'airlock' ||
        (rooms.isWalkable(pose.east, pose.north) && rooms.floorHeightAt(pose.east, pose.north) === pose.height);
    },
  };

  let state: OrbitalGateState = landing['starport-ground'];
  let unlocked = false;
  let last = '试验门默认关闭。';
  let cockpit = false;

  function travel(gate: OrbitalGate, direction: 'enter' | 'return') {
    const result = resolveOrbitalGateTravel({ gate, direction }, state, host);
    if (result.ok) {
      state = result.state;
      cockpit = false;
      last = gateLabel[gate] + (direction === 'enter' ? '抵达对应气闸口。' : '返回对应地面门口。');
    } else {
      const descriptions = { locked: '试验门仍锁定。', 'wrong-origin': '当前走查点不在对应门口。',
        'invalid-landing': '目标落脚点未通过检查。', 'invalid-request': '请求格式无效。' };
      last = descriptions[result.reason];
    }
    render();
  }

  function changeApproach(gate: OrbitalGate) {
    const pose = approaches[gate === 'starport' ? 'starport-airlock' : 'core-airlock'];
    if (!rooms.isWalkable(pose.east, pose.north)) {
      last = '门前脚点不可走。';
    } else {
      state = { site: 'airlock', pose };
      cockpit = false;
      last = '已选择' + gateLabel[gate] + '的气闸侧门前走查点。';
    }
    render();
  }

  function render() {
    if (state.site !== 'airlock') {
      const gate = state.site;
      show({
        group: ground, target: new THREE.Vector3(0, .65, 0), span: 7, location: gateLabel[gate] + ' · 局部外门夹具',
        status: last,
        actions: [
          [unlocked ? '锁定试验门' : '打开试验门旗标', () => { unlocked = !unlocked; last = unlocked ? '试验门从宿主旗标开启。' : '试验门已关闭。'; render(); }],
          ['经当前门进入气闸', () => travel(gate, 'enter')],
          ['选取另一外门夹具', () => { state = landing[gate === 'starport' ? 'core-ground' : 'starport-ground']; last = '已切换独立外门夹具。'; render(); }],
        ],
      });
      return;
    }
    const { pose } = state;
    const target = cockpit
      ? new THREE.Vector3(rooms.cockpit.leftHand.x, rooms.cockpit.leftHand.ground + 1, -rooms.cockpit.leftHand.n)
      : new THREE.Vector3(pose.east, pose.height + .75, -pose.north);
    show({
      group: rooms.group, target, span: cockpit ? 9 : 10, location: cockpit ? '驾驶舱 · 控制台与主舷窗' : '气闸舱 · 两道返程门',
      status: last,
      actions: [
        ['检视星港侧门前点', () => changeApproach('starport')],
        ['检视地宫侧门前点', () => changeApproach('core')],
        ['返回星港', () => travel('starport', 'return')],
        ['返回地宫', () => travel('core', 'return')],
        ['检视驾驶舱', () => { cockpit = true; last = '控制台左右手位已登记。航行日志原件留空待审。'; render(); }],
      ],
    });
  }

  return { show: render };
}
