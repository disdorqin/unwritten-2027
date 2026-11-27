import { BoxGeometry, BufferGeometry, CylinderGeometry, Group, InstancedMesh, Line, LineBasicMaterial, Matrix4, Mesh,
  MeshLambertMaterial, Vector3 } from 'three';
import { summitCableSpec, type createMainSummitCable, type SummitCablePoint } from './main-summit-cable';

type Cable = ReturnType<typeof createMainSummitCable>;
const asVector = ({ east, north, height }: SummitCablePoint) => new Vector3(east, height, -north);

/** Geometry for the separately mounted main-summit domain. */
export function mountMainSummitCable(owner: Group, cable: Cable, groundAt: (east: number, north: number) => number | undefined, options:{controlPointSupports?:boolean}={}) {
  const group = new Group();
  group.name = 'main-summit-cable';
  const geometry = new Set<BufferGeometry>();
  const red = new MeshLambertMaterial({ color: '#a22328' });
  const window = new MeshLambertMaterial({ color: '#bed9e6', opacity: 0.64, transparent: true });
  const frame = new MeshLambertMaterial({ color: '#343a47' });
  const gold = new MeshLambertMaterial({ color: '#e7be75' });
  const platform = new MeshLambertMaterial({ color: '#7b7771' });
  const cableMaterial = new LineBasicMaterial({ color: '#454b55' });
  const pierMaterial=new MeshLambertMaterial({color:'#78858b'}),deckCube=new BoxGeometry();geometry.add(deckCube);
  const deckBatches:InstancedMesh[]=[],decks:{station:'cloud-deck'|'summit';cabin:number;east:number;north:number;height:number;yaw:number;maxGround:number;minGround:number;piers:number;interference:boolean}[]=[];
  const mat=new Matrix4();
  function deckBatch(deck:Group,m:MeshLambertMaterial,name:string,parts:number[][]){if(!parts.length)return;const batch=new InstancedMesh(deckCube,m,parts.length);batch.name=name;parts.forEach((p,i)=>batch.setMatrixAt(i,mat.makeScale(p[3]!,p[4]!,p[5]!).setPosition(p[0]!,p[1]!,p[2]!)));batch.computeBoundingSphere();deck.add(batch);deckBatches.push(batch);}

  function box(parent: Group, material: MeshLambertMaterial, size: [number, number, number], at: [number, number, number]) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    geometry.add(mesh.geometry);
    mesh.position.set(...at);
    parent.add(mesh);
  }

  const cars = cable.ropes.map((rope, index) => {
    const line = new BufferGeometry().setFromPoints(rope.points.map(asVector));
    geometry.add(line);
    group.add(new Line(line, cableMaterial));
    for (const station of ['cloud-deck', 'summit'] as const) {
      const { board, approach } = rope.dock(station);
      const deck = new Group();
      deck.position.copy(asVector(board).lerp(asVector(approach), 0.5));
      deck.rotation.y = -rope.sample(station === 'cloud-deck' ? 0 : rope.totalMetres).heading;
      deck.name='night-b-'+station+'-dock-'+index;
      const yaw=deck.rotation.y,east=deck.position.x,north=-deck.position.z,height=deck.position.y;
      const terrain=(x:number,z:number)=>groundAt(east+x*Math.cos(yaw)+z*Math.sin(yaw),north+x*Math.sin(yaw)-z*Math.cos(yaw));
      const groundSamples:number[]=[];let unknown=false;for(let x=-2.4;x<=2.4+.001;x+=.4)for(let z=-2.5;z<=2.5+.001;z+=.5){const h=terrain(x,z);if(h===undefined||!Number.isFinite(h))unknown=true;else groundSamples.push(h);}
      const minGround=groundSamples.length?Math.min(...groundSamples):Infinity,maxGround=groundSamples.length?Math.max(...groundSamples):Infinity;
      // Continuous deck top equals the canonical boarding datum. Rails run
      // along the approach-side end edges only; the cabin swept corridor and both transverse boarding paths stay open.
      deckBatch(deck,platform,'dock-stone-and-tread',[[0,-.07,0,4.8,.14,5],...Array.from({length:9},(_,i)=>[0,.004,(i-4)*.5,4.64,.008,.04])]);
      deckBatch(deck,gold,'dock-safety-inlay',[[index===0?-.55:.55,.013,0,.075,.026,4.5]]);
      const side=index===0?1:-1,rails:number[][]=[];for(const z of [-2.38,2.38]){rails.push([side*1.22,.92,z,2.10,.12,.10]);for(const x of [.23,1.22,2.17])rails.push([side*x,.48,z,.14,.96,.14]);}
      deckBatch(deck,frame,'dock-end-rails',rails);
      const piers:number[][]=[];for(const x of [-1.72,1.72])for(const z of [-1.85,1.85]){const hs=[-.35,0,.35].flatMap(dx=>[-.35,0,.35].map(dz=>terrain(x+dx,z+dz)));if(!hs.every((h):h is number=>h!==undefined&&Number.isFinite(h)))continue;const bottom=Math.min(...hs)-.20-height,top=-.14;if(top-bottom>.20)piers.push([x,(top+bottom)/2,z,.72,top-bottom,.72]);}
      deckBatch(deck,pierMaterial,'dock-grounded-piers',piers);
      decks.push({station,cabin:index,east,north,height,yaw,maxGround,minGround,piers:piers.length,interference:unknown||maxGround>height+.035});
      group.add(deck);
    }

    const car = new Group();
    const width = summitCableSpec.cabinHalfWidth * 2;
    const depth = summitCableSpec.cabinHalfLength * 2;
    const floor = -summitCableSpec.cabinFloorBelowRope;
    box(car, red, [width, 0.16, depth], [0, floor + 0.08, 0]);
    box(car, red, [width, 0.16, depth], [0, -0.48, 0]);
    box(car, frame, [0.26, 0.44, 0.26], [0, -0.2, 0]);
    const boardingSide = index === 0 ? 1 : -1;
    const door = new Group();
    for (const x of [-1, 1]) {
      const sideX = x * (width / 2 - 0.035);
      if (x === boardingSide) {
        for (const z of [-0.98, 0.98]) box(car, window, [0.035, 1.75, 0.90], [sideX, -1.22, z]);
        box(door, window, [0.04, 1.75, 1.06], [sideX, -1.22, 0]);
        car.add(door);
      } else {
        box(car, window, [0.035, 1.75, depth - 0.1], [sideX, -1.22, 0]);
      }
      box(car, gold, [0.04, 0.08, depth], [x * width / 2, floor + 0.39, 0]);
      for (const z of [-1, 1]) box(car, frame, [0.11, 1.40, 0.11], [x * (width / 2 - 0.08), -1.21, z * (depth / 2 - 0.08)]);
    }
    for (const z of [-1, 1]) box(car, window, [width - 0.1, 1.36, 0.035], [0, -1.21, z * (depth / 2 - 0.035)]);
    group.add(car);
    return { car, door };
  });

  const [first, second] = cable.ropes;
  for (let index = 1; options.controlPointSupports!==false && index < first.points.length - 1; index++) {
    const point = asVector(first.points[index]!).lerp(asVector(second.points[index]!), 0.5);
    const ground = groundAt(point.x, -point.z);
    if (ground === undefined) continue;
    const height = point.y + 0.25 - ground;
    if (height <= 0) continue;
    const pole = new Mesh(new CylinderGeometry(0.16, 0.36, height, 6), frame);
    geometry.add(pole.geometry);
    pole.position.copy(point);
    pole.position.y = ground + height / 2;
    group.add(pole);
    const crossbar = new Group();
    crossbar.position.copy(point);
    crossbar.rotation.y = -Math.atan2(first.points[index]!.north - second.points[index]!.north,
      second.points[index]!.east - first.points[index]!.east);
    box(crossbar, frame, [7.5, 0.22, 0.25], [0, 0.25, 0]);
    group.add(crossbar);
  }
  owner.add(group);

  function local(d:typeof decks[number],e:number,n:number){const dx=e-d.east,dn=n-d.north;return {x:dx*Math.cos(d.yaw)+dn*Math.sin(d.yaw),z:dx*Math.sin(d.yaw)-dn*Math.cos(d.yaw)};}
  return {
    decks:Object.freeze(decks.map(d=>Object.freeze({...d}))),
    supportAt(e:number,n:number,r=.27){for(const d of decks){if(d.interference)continue;const p=local(d,e,n);if(Math.abs(p.x)<=2.4-r&&Math.abs(p.z)<=2.5-r)return d.height;}},
    deckBlocked(e:number,n:number,h:number,r=.27){return decks.some(d=>{const p=local(d,e,n);return h+1.8>d.height&&h<d.height+1.02&&p.x*(d.cabin===0?1:-1)>.16-r&&p.x*(d.cabin===0?1:-1)<2.29+r&&Math.abs(Math.abs(p.z)-2.38)<.07+r;});},
    update(nowMs: number) {
      const states = cable.cabinsAt(nowMs);
      for (const state of states) {
        const { car, door } = cars[state.index]!;
        car.position.copy(asVector(state.ropePoint));
        car.rotation.y = -state.ropePoint.heading;
        door.position.z = state.canBoardOrExit ? 1.05 : 0;
      }
      return states;
    },
    dispose() {
      group.removeFromParent();
      for(const b of deckBatches)b.dispose();group.clear();
      for (const item of geometry) item.dispose();
      for (const material of [red, window, frame, gold, platform, pierMaterial, cableMaterial]) material.dispose();
    },
  };
}
