import {
  BoxGeometry, Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  Object3D,
} from 'three';
import type { SummitExpeditionSite } from './main-summit-expedition-sites';

type Status = Readonly<{ siteId: string; kind: string; touched: number; appearanceChanged: boolean }>;

function glyphPlate(group: Group, x: number, z: number,
  base: MeshLambertMaterial, star: MeshBasicMaterial,
  slabShape: BoxGeometry, starShape: BoxGeometry) {
  const tile = new Group();
  tile.name = 'three-star-map-fragment';
  tile.position.set(x, 0, z);
  const stone = new Mesh(slabShape, base);
  stone.position.y = .27;
  tile.add(stone);
  const marks = new InstancedMesh(starShape, star, 9);
  const pose = new Object3D();
  for (let dot = 0; dot < 9; dot++) {
    pose.position.set(-.49 + (dot % 3) * .49, .37,
      -.55 + Math.floor(dot / 3) * .52);
    pose.scale.set(.08, .02, .075);
    pose.updateMatrix();
    marks.setMatrixAt(dot, pose.matrix);
  }
  marks.computeBoundingSphere();
  marks.name = 'moving-star-map-inlay';
  tile.add(marks);
  group.add(tile);
  return { tile, marks };
}

/**
 * Reified R6 scene feedback. All effects consume only *accepted local activity
 * receipts*; this module never authorizes touch, changes global world state,
 * revives the cable machinery, or writes multiplayer progress.
 */
export function mountSummitExpeditionDynamics(
  owner: Group, approved: readonly SummitExpeditionSite[],
) {
  const group = new Group();
  group.name = 'main-summit-expedition-local-dynamics';
  owner.add(group);
  const slabShape = new BoxGeometry(1.47, .19, 1.86);
  const pinShape = new BoxGeometry(1, 1, 1);
  const fireShape = new BoxGeometry(.23, .19, 1.15);
  const stakeShape = new BoxGeometry(.31, .22, .31);
  const plaqueShape = new BoxGeometry(.58, .14, .58);
  const slate = new MeshLambertMaterial({ color: '#b0bbb8' });
  const brass = new MeshBasicMaterial({ color: '#b9a477' });
  const darkTimber = new MeshLambertMaterial({ color: '#593f30' });
  const seal = new MeshBasicMaterial({ color: '#b5a36d' });
  const geometries = [slabShape, pinShape, fireShape, stakeShape, plaqueShape];
  const materials = [slate, brass, darkTimber, seal];
  const mapPlates: Group[] = [];
  const mapInstanced: InstancedMesh[] = [];
  const fires = new Map<string, Mesh[]>();
  const status = new Map<string, Status>();
  const icePins: { meshes: InstancedMesh; siteId: string }[] = [];
  const seals: Mesh[] = [];

  function atSite(site: SummitExpeditionSite) {
    const section = new Group();
    section.name = site.id + '-dynamic-visuals';
    section.position.set(site.east, site.height, -site.north);
    section.rotation.y = site.yaw;
    group.add(section);
    status.set(site.id, { siteId: site.id, kind: site.kind, touched: 0, appearanceChanged: false });
    return section;
  }

  for (const site of approved) {
    if (site.kind === 'observatory') {
      const section = atSite(site);
      for (let slab = 0; slab < 3; slab++) {
        const x = -2.1 + slab * 2.1;
        const z = .2 + (slab % 2) * .4;
        const { tile, marks } = glyphPlate(section, x, z, slate, brass, slabShape, pinShape);
        tile.name = 'moving-star-fragment-' + (slab + 1);
        mapPlates.push(tile);
        mapInstanced.push(marks);
      }
    } else if (site.kind === 'shelter') {
      const section = atSite(site);
      const logs = [];
      for (let log = 0; log < 3; log++) {
        const mesh = new Mesh(fireShape, darkTimber);
        mesh.name = 'physically-fed-hearth-log-' + (log + 1);
        mesh.position.set(-2.1 + log * .23, .81 + log * .11, -1.05);
        mesh.scale.setScalar(.0001);
        section.add(mesh);
        logs.push(mesh);
      }
      fires.set(site.id, logs);
    } else if (site.kind === 'icefall') {
      const section = atSite(site);
      const material = new MeshBasicMaterial({ color: '#ffffff' });
      materials.push(material);
      const pegs = new InstancedMesh(stakeShape, material, 6);
      pegs.name = 'six-inspected-rope-anchors';
      const pose = new Object3D();
      for (let peg = 0; peg < 6; peg++) {
        pose.position.set(-6.7 + peg * 2.6, 4.8 + peg * 5.1 + .45, .9);
        pose.updateMatrix();
        pegs.setMatrixAt(peg, pose.matrix);
        pegs.setColorAt(peg, new Color('#86705f'));
      }
      pegs.computeBoundingSphere();
      section.add(pegs);
      icePins.push({ meshes: pegs, siteId: site.id });
    } else if (site.kind === 'summit-flag') {
      const section = atSite(site);
      const token = new Mesh(plaqueShape, seal);
      token.name = 'signed-year-stamp';
      token.position.set(-1.25, .66, -1.6);
      token.visible = false;
      section.add(token);
      seals.push(token);
    }
  }

  const wheelGroup = new Group();
  wheelGroup.name = 'machine-inspection-candidate';
  wheelGroup.position.set(-21, 347, -7);
  wheelGroup.rotation.y = Math.PI / 2;
  group.add(wheelGroup);
  const machineMarks: Mesh[] = [];
  for (const x of [-3.45, -3.22]) {
    const mark = new Mesh(plaqueShape, seal);
    mark.name = 'brake-inspected-mark';
    mark.position.set(x, 2.33, -2.28);
    mark.visible = false;
    wheelGroup.add(mark);
    machineMarks.push(mark);
  }
  status.set('expedition-cable-machine-room', {
    siteId: 'expedition-cable-machine-room', kind: 'machine-hall',
    touched: 0, appearanceChanged: false,
  });

  let disposed = false;
  function apply(siteId: string, count: number) {
    const old = status.get(siteId);
    if (!old || disposed || !Number.isSafeInteger(count) || count < old.touched) return false;
    const max = old.kind === 'icefall' ? 6 : old.kind === 'observatory' || old.kind === 'machine-hall'
      || old.kind === 'shelter' ? 3 : 1;
    const touched = Math.min(max, count);
    if (touched === old.touched) return true;
    if (old.kind === 'observatory') {
      for (let i = 0; i < mapPlates.length; i++) {
        const moved = i < touched;
        mapPlates[i]!.position.x = -2.1 + i * 2.1 + (moved ? 1.1 - i * 1.1 : 0);
        mapPlates[i]!.position.z = moved ? 0 : .2 + (i % 2) * .4;
        mapPlates[i]!.position.y = moved ? .14 : 0;
      }
    }
    for (const log of fires.get(siteId) ?? []) {
      const i = Number(log.name.at(-1)) - 1;
      log.scale.setScalar(i < touched ? 1 : .0001);
    }
    for (const pins of icePins.filter(p => p.siteId === siteId)) {
      for (let peg = 0; peg < pins.meshes.count; peg++) {
        pins.meshes.setColorAt(peg, new Color(peg < touched ? '#f5ce7e' : '#86705f'));
      }
      pins.meshes.instanceColor!.needsUpdate = true;
    }
    if (old.kind === 'summit-flag') for (const stamp of seals) stamp.visible = touched > 0;
    if (old.kind === 'machine-hall') for (const [index, mark] of machineMarks.entries()) {
      mark.visible = index < touched;
    }
    status.set(siteId, { ...old, touched, appearanceChanged: true });
    return true;
  }

  return {
    group, apply,
    snapshot: () => Object.fromEntries(status.entries()),
    visuals: {
      movingStarFragments: mapPlates.length,
      hearthLogs: [...fires.values()].reduce((sum, logs) => sum + logs.length, 0),
      ropeAnchors: icePins.reduce((sum, pins) => sum + pins.meshes.count, 0),
      mechanicalInspectionMarks: machineMarks.length,
      yearStampCount: seals.length,
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of mapInstanced) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
