import {
  BoxGeometry, CanvasTexture, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, SRGBColorSpace,
  type BufferGeometry, type Material,
} from 'three';
import type { Box } from './landmark-kit';
import { type createMainSummitCable, type SummitCablePoint } from './main-summit-cable';
import { sampleNorthRidge350 } from './north-ridge-350-terrain';

type Cable = ReturnType<typeof createMainSummitCable>;
type Summit = {
  heightAt(east: number, north: number): number | undefined;
  enter(owner: Group): { colliders: readonly Box[] };
  leave(): void;
};
type Station = Parameters<Cable['ropes'][number]['dock']>[0];
type Bounds = { west: number; east: number; south: number; north: number };
type Solid = Bounds & { base: number; top: number };
type Door = { north: number; width: number };

const footRadius = .27;
const standingHeight = 1.8;
const supportEpsilon = .025;
const doorHeight = 2.45;
const wallHeight = 3.1;
const apronSouth = -22;
const seamNorth = -10;
const apronHalfWidth = 6;

const point = (east: number, north: number, height: number): SummitCablePoint => ({ east, north, height });
const middle = (min: number, max: number) => (min + max) / 2;

/** Mountable P-7 geometry in the P-1 survey frame. The caller owns the P-1 block. */
export function mountMainSummitCableStations(owner: Group, cable: Cable, summit: Summit) {
  const floor = cable.ropes[0].dock('cloud-deck').board.height;
  const frontRidgeAt = (east: number, north: number) => sampleNorthRidge350(300 + east, 676 + north);
  if (Math.abs((summit.heightAt(0, 0) ?? Infinity) - floor) > 1e-8 ||
      Math.abs(frontRidgeAt(0, seamNorth) - floor) > supportEpsilon) {
    throw new RangeError('P-7 requires coincident P-1 and P-2 arrival datum.');
  }
  const group = new Group();
  group.name = 'main-summit-station-facilities';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<CanvasTexture>();
  const solids: Solid[] = [];
  const staticCubes=new Map<Group,Mesh<BoxGeometry,Material>[]>();
  const staticBatches:InstancedMesh[]=[];
  const staticBatchGeometry=new BoxGeometry();geometries.add(staticBatchGeometry);
  const stone = material('#63717b');
  const ash = material('#84939d');
  const slate = material('#394852');
  const timber = material('#674d3e');
  const oak = material('#ad8155');
  const snow = material('#e0e7e7');
  const bronze = material('#bb9861');
  const amber = material('#f4cd83', '#5f461e');

  function material(color: string, emissive?: string) {
    const next = new MeshLambertMaterial({ color });
    if (emissive) next.emissive.set(emissive);
    materials.add(next);
    return next;
  }

  function cuboid(parent: Group, finish: Material, name: string, volume: Solid, solid = false) {
    const { west, east, south, north, base, top } = volume;
    const geometry = new BoxGeometry(east - west, top - base, north - south);
    const mesh = new Mesh(geometry, finish);
    mesh.name = name;
    mesh.position.set(middle(west, east), middle(base, top), -middle(south, north));
    geometries.add(geometry);
    parent.add(mesh);
    const list=staticCubes.get(parent)??[];list.push(mesh);staticCubes.set(parent,list);
    if (solid) solids.push(volume);
    return mesh;
  }

  function plaque(parent: Group, label: string, e: number, n: number, h: number, facing: -1 | 1, width: number) {
    cuboid(parent, timber, 'timber-sign-frame', {
      west: e - .055, east: e + .055, south: n - width / 2, north: n + width / 2, base: h - .27, top: h + .27,
    });
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#26343c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cfad73';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 59px system-ui, sans-serif';
    ctx.fillStyle = '#f8e8c5';
    ctx.fillText(label, 256, 66, 465);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const geometry = new PlaneGeometry(width - .10, .44);
    const finish = new MeshBasicMaterial({ map: texture });
    const mesh = new Mesh(geometry, finish);
    mesh.name = label;
    mesh.position.set(e + facing * .057, h, -n);
    mesh.rotation.y = facing * Math.PI / 2;
    geometries.add(geometry);
    materials.add(finish);
    textures.add(texture);
    parent.add(mesh);
  }

  function house(id: string, title: string, b: Bounds, y: number, westDoors: readonly Door[], eastDoors: readonly Door[]) {
    const building = new Group();
    building.name = id;
    group.add(building);
    const width = b.east - b.west;
    const centreEast = middle(b.west, b.east);
    const depth = b.north - b.south;
    const wall = .33;

    cuboid(building, slate, 'station-sill', { ...b, base: y - .20, top: y - .03 });
    cuboid(building, oak, 'flush-oak-waiting-room-floor', { ...b, base: y - .03, top: y + .012 });
    for (const north of [b.south + wall / 2, b.north - wall / 2]) {
      const shape = { west: b.west, east: b.east, south: north - wall / 2, north: north + wall / 2 };
      cuboid(building, stone, 'stone-gable-wall', { ...shape, base: y, top: y + wallHeight }, true);
      const eaveStart = y + wallHeight;
      for (let i = 0; i < 4; i++) {
        const inset = i * width * .105;
        cuboid(building, timber, 'stepped-timber-gable', {
          west: b.west + inset, east: b.east - inset, south: north - wall / 2, north: north + wall / 2,
          base: eaveStart + i * .15, top: eaveStart + (i + 1) * .15,
        });
      }
    }

    function side(side: 'west' | 'east', doors: readonly Door[]) {
      const east = side === 'west' ? b.west : b.east - wall;
      let south = b.south + wall;
      const finish = b.north - wall;
      const sorted = [...doors].sort((a, b) => a.north - b.north);
      function fill(s: number, n: number, lower: number, upper: number, surface: Material, kind: string) {
        if (n <= s) return;
        cuboid(building, surface, kind, { west: east, east: east + wall, south: s, north: n, base: y + lower, top: y + upper }, true);
      }
      for (const door of sorted) {
        const start = door.north - door.width / 2;
        const end = door.north + door.width / 2;
        fill(south, start, 0, .52, ash, 'station-masonry-plinth');
        fill(south, start, .52, wallHeight, timber, 'station-long-wall');
        fill(start, end, doorHeight, wallHeight, timber, 'station-door-lintel');
        cuboid(building, bronze, 'flush-threshold-inlay', {
          west: east - .12, east: east + wall + .12, south: start + .07, north: end - .07,
          base: y - .02, top: y + .003,
        });
        for (const jamb of [start - .12, end]) {
          cuboid(building, oak, 'station-door-casing', {
            west: east - .05, east: east + wall + .05, south: jamb, north: jamb + .12, base: y, top: y + doorHeight,
          });
        }
        south = end;
      }
      fill(south, finish, 0, .52, ash, 'station-masonry-plinth');
      fill(south, finish, .52, wallHeight, timber, 'station-long-wall');
    }
    side('west', westDoors);
    side('east', eastDoors);

    const overhang = .55;
    const roofRun = width / 2 + overhang;
    const roofRise = roofRun * .27;
    const roofSlant = Math.hypot(roofRun, roofRise);
    for (const sign of [-1, 1]) {
      const e = centreEast + sign * roofRun / 2;
      const h = y + wallHeight + .21 + roofRise / 2;
      const volume = {
        west: e - roofSlant / 2, east: e + roofSlant / 2, south: b.south - .52, north: b.north + .52,
        base: h - .12, top: h + .12,
      };
      const roof = cuboid(building, slate, 'sloped-slate-roof', volume);
      const angle = -sign * Math.atan2(roofRise, roofRun);
      roof.rotation.z = angle;
      const cover = cuboid(building, snow, 'thin-roof-snow', { ...volume, base: h + .12, top: h + .22 });
      cover.rotation.z = angle;
    }
    const signDoor = eastDoors[0] ?? westDoors[0];
    if (signDoor) plaque(building, title, eastDoors.length > 0 ? b.east + .03 : b.west - .03,
      signDoor.north, y + 2.76, eastDoors.length > 0 ? 1 : -1, Math.min(5.0, depth - .6));

    for (const n of [b.south + .75, b.north - .75]) {
      cuboid(building, timber, 'waiting-bench-stone-base', {
        west: centreEast - 1.05, east: centreEast + 1.05, south: n - .19, north: n + .19, base: y, top: y + .4,
      }, true);
      cuboid(building, oak, 'waiting-bench-oak-seat', {
        west: centreEast - 1.17, east: centreEast + 1.17, south: n - .25, north: n + .25, base: y + .40, top: y + .49,
      }, true);
      for (const e of [b.west + .51, b.east - .51]) cuboid(building, amber, 'station-lamp', {
        west: e - .11, east: e + .11, south: n - .11, north: n + .11, base: y + 2.34, top: y + 2.67,
      });
    }
    // Weathered masonry joints, eave brackets and panel grain within
    // the existing wall/roof envelopes. Door openings remain unchanged.
    for(const n of [b.south+wall/2,b.north-wall/2]){
      for(let row=0;row<4;row++){
        const base=y+.18+row*.62;
        cuboid(building,ash,'gable-mortar-course',{west:b.west+.08,east:b.east-.08,south:n-wall/2-.017,north:n+wall/2+.017,base,top:base+.035});
        for(let e=b.west+.65+(row%2)*.25;e<b.east-.28;e+=.9){
          cuboid(building,ash,'gable-stone-joint',{west:e,east:e+.027,south:n-wall/2-.018,north:n+wall/2+.018,base,top:base+.59});
        }
      }
      for(let e=b.west+.4;e<b.east-.3;e+=.85){
        cuboid(building,oak,'gable-eave-bracket',{west:e,east:e+.10,south:n-.28,north:n+.28,base:y+wallHeight-.32,top:y+wallHeight+.025});
      }
    }
    for(const sign of [-1,1]){
      const e=centreEast+sign*(roofRun-.10);
      for(let n=b.south-.40;n<b.north+.35;n+=.85){
        cuboid(building,oak,'roof-rafter-tail',{west:e-.11,east:e+.11,south:n-.07,north:n+.07,base:y+wallHeight+.02,top:y+wallHeight+.20});
      }
      for(const n of [b.south-.47,b.north+.47]){
        const eave=cuboid(building,timber,'roof-edge-fascia',{west:centreEast+sign*roofRun/2-roofSlant/2,east:centreEast+sign*roofRun/2+roofSlant/2,south:n-.08,north:n+.08,base:y+wallHeight+.12+roofRise/2,top:y+wallHeight+.29+roofRise/2});
        eave.rotation.z=-sign*Math.atan2(roofRise,roofRun);
      }
    }
    for(const n of [b.south+.75,b.north-.75]){
      for(let e=centreEast-.95;e<centreEast+1;e+=.38){
        cuboid(building,timber,'bench-slat-joint',{west:e,east:e+.023,south:n-.23,north:n+.23,base:y+.487,top:y+.493});
      }
    }
    return building;
  }

  function station(name: Station, title: string, bounds: Bounds) {
    const docks = cable.ropes.map(rope => rope.dock(name));
    const y = docks[0]!.approach.height;
    const centreE = middle(bounds.west, bounds.east);
    const centreN = middle(docks[0]!.approach.north, docks[1]!.approach.north);
    const entrance = point(bounds.east + 2, centreN, y);
    const hall = point(centreE, centreN, y);
    const group = house(`${name}-cable-station`, title, bounds, y,
      docks.map(({ approach }) => ({ north: approach.north, width: 2.3 })), [{ north: centreN, width: 2.7 }]);
    const routes = docks.map(({ approach, board }, index) => {
      const mark = index === 0 ? 'A' : 'B';
      plaque(group, mark, bounds.west - .035, approach.north, y + 2.73, -1, 1.4);
      cuboid(group, slate, `platform-${mark}-walkway`, {
        west: approach.east - .12, east: bounds.west, south: approach.north - 1.05, north: approach.north + 1.05,
        base: y - .15, top: y + .003,
      });
      cuboid(group, bronze, `platform-${mark}-inlay`, {
        west: approach.east - .12, east: bounds.west, south: approach.north - .03, north: approach.north + .03,
        base: y, top: y + .01,
      });
      return { mark, approach, board, path: [entrance, hall, point(centreE, approach.north, y), approach] };
    });
    return { group, bounds, entrance, hall, routes };
  }

  const stations = {
    'cloud-deck': station('cloud-deck', '云海台站', { west: -10, east: -3, south: -2.5, north: 15 }),
    summit: station('summit', '绝顶站', { west: 31, east: 39, south: 990, north: 1008 }),
  };
  const gateBlock = summit.enter(group);
  const guardroom = house('mountain-gate-guardroom', '山门值守', { west: 4.5, east: 12, south: 2.5, north: 11.5 },
    floor, [{ north: 7, width: 2.3 }], []);
  const deskBase = { west: 9.7, east: 10.65, south: 4.9, north: 7.1 };
  cuboid(guardroom, timber, 'gate-registration-desk', { ...deskBase, base: floor, top: floor + .88 }, true);
  cuboid(guardroom, oak, 'gate-registration-counter', { ...deskBase, base: floor + .88, top: floor + 1.0 }, true);
  plaque(guardroom, '班次与登记', 4.462, 9.48, floor + 1.85, -1, 2.2);
  const gateIn = point(0, 20, floor);
  const gateFrom = point(0, -14, frontRidgeAt(0, -14));
  const gate = { from: gateFrom, to: gateIn, route: [gateFrom, point(0, seamNorth, floor), gateIn],
    guardroom: [gateIn, point(0, 7, floor), point(7.25, 7, floor)],
    stationWalk: [gateIn, point(0, stations['cloud-deck'].entrance.north, floor), stations['cloud-deck'].entrance],
  };
  for (let n = -20; n <= 19; n++) {
    const y = n < seamNorth ? frontRidgeAt(0, n) : summit.heightAt(0, n)!;
    cuboid(group, n % 4 === 0 ? ash : slate, 'mountain-gate-apron-stone', {
      west: -1.66, east: 1.66, south: n + .02, north: n + .98, base: y - .08, top: y + .012,
    });
  }
  // Batch only the tracked static station cubes, per building so an
  // entire distant building can still be frustum-culled. Amber emission
  // remains a distinct material; all other opaque Lambert tints share one.
  const batchMaterial=new MeshLambertMaterial({color:'#ffffff'});materials.add(batchMaterial);
  const scale=new Matrix4();
  for(const [parent,cubes]of staticCubes){
    for(const light of [false,true]){
      const parts=cubes.filter(m=>(m.material===amber)===light);
      if(!parts.length)continue;
      const batch=new InstancedMesh(staticBatchGeometry,light?amber:batchMaterial,parts.length);
      batch.name=(parent.name||'station')+(light?'-lamp-batch':'-static-batch');
      batch.userData.partNames=parts.map(p=>p.name);
      for(const [i,p]of parts.entries()){
        const {width,height,depth}=p.geometry.parameters;p.updateMatrix();
        scale.makeScale(width,height,depth);
        batch.setMatrixAt(i,p.matrix.clone().multiply(scale));
        if(!light)batch.setColorAt(i,(p.material as MeshLambertMaterial).color);
        parent.remove(p);geometries.delete(p.geometry);p.geometry.dispose();
      }
      batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();parent.add(batch);staticBatches.push(batch);
    }
  }
  owner.add(group);

  function heightAt(east: number, north: number) {
    if (north >= seamNorth) return summit.heightAt(east, north);
    if (north < apronSouth || Math.abs(east) > apronHalfWidth) return undefined;
    // The two offsets are the witnessed C-01 review apron, pending a live host anchor.
    return frontRidgeAt(east, north);
  }

  function blocked(east: number, north: number, feet: number, radius = footRadius, bodyHeight = standingHeight) {
    function hits(bounds: Bounds, base: number, top: number) {
      if (feet + bodyHeight - supportEpsilon <= base || feet + supportEpsilon >= top) return false;
      const dx = Math.max(bounds.west - east, east - bounds.east, 0);
      const dn = Math.max(bounds.south - north, north - bounds.north, 0);
      return Math.hypot(dx, dn) < radius;
    }
    for (const s of solids) if (hits(s, s.base, s.top)) return true;
    for (const { min, max } of gateBlock.colliders) {
      if (hits({ west: min[0], east: max[0], south: -max[2], north: -min[2] }, min[1], max[1])) return true;
    }
    return false;
  }

  let disposed = false;
  return { group, stations, gate, heightAt, blocked, dispose() {
    if (disposed) return;
    disposed = true;
    summit.leave();
    group.removeFromParent();
    for(const batch of staticBatches)batch.dispose();
    group.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const finish of materials) finish.dispose();
    for (const texture of textures) texture.dispose();
  } };
}
