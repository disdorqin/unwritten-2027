import {
  BoxGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, type Material,
} from 'three';

export const orbitalStatusSemantics = {
  airlock: { red: 'offline-systems', green: ['teleport', 'minimum-life-support'] },
  cockpit: { green: ['navigation-log', 'orbit-keeping'], lastPageLamp: 'off-after-final-page' },
  observatory: { indicators: 'none' },
  living: { systems: 'mostly-offline', effects: 'display-only' },
  teleport: { anchors: 'warm-white-after-physical-visit', hub: 'always-lit' },
} as const;

const activeGreen = 0x82d9a9;
const offLens = 0x17222b;
const lightsLayerName = 'orbital-status-display';

/**
 * Adds a presentation layer to the existing two-room host, without registering
 * anchors, changing walkable ground, or granting any additional system access.
 */
export function mountOrbitalStatusDisplay(host: Group) {
  const airlock = host.getObjectByName('orbital-airlock');
  const cockpit = host.getObjectByName('orbital-cockpit');
  const wall = airlock?.getObjectByName('orbital-status-wall');
  const logBay = cockpit?.getObjectByName('blank-log-bay');
  const pageLamp = logBay?.getObjectByName('log-page-lamp');
  const teleport = airlock?.getObjectByName('status-teleport');
  const lifeSupport = airlock?.getObjectByName('status-life-support');
  if (!(airlock instanceof Group) || !(cockpit instanceof Group) || !(wall instanceof Mesh) ||
      !(logBay instanceof Group) || !(pageLamp instanceof Mesh) || !(teleport instanceof Mesh) ||
      !(lifeSupport instanceof Mesh) || host.getObjectByName(lightsLayerName)) {
    throw new RangeError('Expected an unmodified S-2 status wall and cockpit log host.');
  }
  const redCount = airlock.children.filter(object => object.name === 'status-red').length;
  if (redCount !== 16) throw new RangeError('S-2 status wall must retain its sixteen red positions.');

  const airlockLayer = new Group();
  airlockLayer.name = lightsLayerName;
  const cockpitLayer = new Group();
  cockpitLayer.name = 'orbital-cockpit-status-display';
  const retainedPageLamp = pageLamp.material;
  const dark = new MeshStandardMaterial({ color: 0x2b404c, roughness: .92, metalness: .28 });
  const mount = new MeshStandardMaterial({ color: 0x51606a, roughness: .86, metalness: .27 });
  const darkLamp = new MeshBasicMaterial({ color: offLens });
  const green = new MeshBasicMaterial({ color: activeGreen });
  const materials = [dark, mount, darkLamp, green];

  function box(parent: Group, name: string, material: Material,
    x: number, y: number, z: number, width: number, height: number, depth: number) {
    const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  const vent = new Group();
  vent.name = 'orbital-life-support-vent';
  vent.position.set(wall.position.x + 3.02, wall.position.y + .68, wall.position.z + .045);
  vent.rotation.y = Math.PI;
  vent.userData.output = 'minimum';
  airlockLayer.add(vent);
  box(vent, 'vent-outer-panel', mount, 0, 0, 0, .83, .42, .075);
  box(vent, 'vent-recess', dark, 0, 0, .042, .69, .29, .018);
  for (const y of [-.09, -.03, .03, .09]) {
    box(vent, 'vent-slat', mount, 0, y, .058, .6, .02, .014);
  }
  for (const [name, side] of [['navigation-log', -1], ['orbit-keeping', 1]] as const) {
    const y = logBay.position.y + .025;
    const x = logBay.position.x + side * .43;
    const z = logBay.position.z + .15;
    box(cockpitLayer, name + '-housing', mount, x, y, z, .153, .035, .058);
    const lamp = box(cockpitLayer, name + '-status', green, x, y + .022, z, .1, .014, .036);
    lamp.userData.state = 'green';
  }

  airlock.add(airlockLayer);
  cockpit.add(cockpitLayer);
  let disposed = false;
  let pageReached = false;
  return {
    counts: { red: redCount, green: 2, off: 0 },
    get pageReached() { return pageReached; },
    setLastLogPageReached(reached: boolean) {
      if (disposed) return;
      pageReached = reached;
      pageLamp.material = reached ? darkLamp : retainedPageLamp;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pageLamp.material = retainedPageLamp;
      for (const layer of [airlockLayer, cockpitLayer]) {
        layer.traverse(object => {
          if (object instanceof Mesh) object.geometry.dispose();
        });
        layer.removeFromParent();
      }
      for (const material of materials) material.dispose();
    },
  };
}
