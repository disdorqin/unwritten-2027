import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial } from 'three';
import { buildCloudStoneRing, cloudStoneRingAnchor } from './main-summit-cloud-terrace-ring';
import { buildCloudTerraceFurnishings } from './main-summit-cloud-terrace-furnishings';

/**
 * Window D D4 assembled art. Only visuals, collisions and isolated
 * proximity interactions live here. ZD-05 portal state is authoritative
 * elsewhere; this cannot ignite, teleport, board, register an account,
 * change weather, create collectibles or affect daily scoring.
 */
export function mountCloudTerraceArt(owner: Group) {
  const group = new Group();
  group.name = 'cloud-terrace-ref-m03-m34-m36-m82-built-art';
  const ring = buildCloudStoneRing();
  const furnishings = buildCloudTerraceFurnishings();
  group.add(ring.group, furnishings.group);
  owner.add(group);

  // Both builders already use unit boxes. Consolidate every opaque,
  // untextured Lambert box (including the story board) into one instance
  // batch. Per-instance colours are baked from the original batches, while
  // transparent runes, unlit lantern cores and the textured inscription stay
  // as separate render objects. No animated wind object is touched.
  group.updateMatrixWorld(true);
  const toLocal = group.matrixWorld.clone().invert();
  const sources: Mesh[] = [];
  for (const part of [ring.group, furnishings.group]) {
    part.traverse(object => {
      if (!(object instanceof Mesh) || !(object.geometry instanceof BoxGeometry) ||
        !(object.material instanceof MeshLambertMaterial) || object.material.map ||
        object.material.transparent || object.material.opacity !== 1 || !object.material.depthWrite) return;
      sources.push(object);
    });
  }
  const instanceCount = sources.reduce((count, source) =>
    count + (source instanceof InstancedMesh ? source.count : 1), 0);
  const boxGeometry = new BoxGeometry(1, 1, 1);
  const boxMaterial = new MeshLambertMaterial({ color: '#ffffff' });
  const boxes = new InstancedMesh(boxGeometry, boxMaterial, instanceCount);
  boxes.name = 'cloud-terrace-static-lambert-boxes';
  const relative = new Matrix4(), local = new Matrix4(), color = new Color();
  let index = 0;
  for (const source of sources) {
    const material = source.material as MeshLambertMaterial;
    const count = source instanceof InstancedMesh ? source.count : 1;
    for (let instance = 0; instance < count; instance++) {
      if (source instanceof InstancedMesh) {
        source.getMatrixAt(instance, local);
        if (source.instanceColor) source.getColorAt(instance, color);
        else color.set('#ffffff');
      } else {
        const parameters = (source.geometry as BoxGeometry).parameters;
        local.makeScale(parameters.width, parameters.height, parameters.depth);
        color.copy(material.color);
      }
      color.multiply(material.color);
      relative.multiplyMatrices(toLocal, source.matrixWorld).multiply(local);
      boxes.setMatrixAt(index, relative);
      boxes.setColorAt(index++, color);
    }
    source.removeFromParent();
  }
  boxes.instanceMatrix.needsUpdate = true;
  if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
  boxes.computeBoundingSphere();
  group.add(boxes);
  const disposeBoxes = () => {
    boxes.dispose(); boxGeometry.dispose(); boxMaterial.dispose();
  };

  let disposed = false, night = false;
  const stats = () => {
    const meshes: Mesh[] = [];
    group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    return {
      pieces: ring.count + furnishings.count,
      draws: meshes.length,
      meshCount: meshes.length,
      ringSegments: ring.segmentCount,
    ringMissing: ring.missingSlices,
    lanternCount: furnishings.lanterns.length,
      night, ringAnchor: cloudStoneRingAnchor,
    };
  };
  function blocked(east:number,north:number,feet:number,radius:number,bodyHeight:number){
    return !disposed && (ring.blocked(east,north,feet,radius,bodyHeight) ||
      furnishings.blocked(east,north,feet,radius,bodyHeight));
  }
  function inspect(what:'ring'|'supplies',verb:'view'|'listen'|'touch',
    player:Readonly<{east:number;north:number;height:number}>,authorized:boolean){
    if(disposed)return {accepted:false as const,message:'场景已离开。'};
    if(what==='ring') {
      if(verb==='touch')return ring.touch(player,authorized);
      if(!authorized||![player?.east,player?.north,player?.height].every(Number.isFinite)||
        Math.hypot(player.east-cloudStoneRingAnchor.east,
          player.north-cloudStoneRingAnchor.north)>4.2||
        Math.abs(player.height-cloudStoneRingAnchor.height)>1.65)
        return {accepted:false as const,message:'先走近石环。'};
      return {accepted:true as const,message:verb==='view'
        ?'石环里盛着云。微弱的青辉，只沿着内侧旧刻槽流动。'
        :'风穿过断开的环顶，像远处有人拨了一下铜铃。'};
    }
    return furnishings.interact(verb,player,authorized);
  }
  return {
    group,ring,furnishings,stats,blocked,inspect,
    setNight(next:boolean) {
      if(disposed)return;
      night=next;
      ring.setNight(next);furnishings.setNight(next);
    },
    dispose() {
      if(disposed)return;
      disposed=true;disposeBoxes();ring.dispose();furnishings.dispose();
      group.removeFromParent();group.clear();
    },
  };
}
