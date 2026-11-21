import { Group } from 'three';
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
  let disposed = false, night = false;
  const stats = () => ({
    pieces: ring.count + furnishings.count,
    draws: ring.draws + furnishings.draws,
    ringSegments: ring.segmentCount,
    ringMissing: ring.missingSlices,
    lanternCount: furnishings.lanterns.length,
    night, ringAnchor: cloudStoneRingAnchor,
  });
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
      disposed=true;ring.dispose();furnishings.dispose();
      group.removeFromParent();group.clear();
    },
  };
}
