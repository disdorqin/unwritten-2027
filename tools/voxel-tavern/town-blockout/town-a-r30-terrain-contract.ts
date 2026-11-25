/** I1 / A-R01. Coordinates are ENH metres; the render world is (E,H,-N).
 * No fixture coordinates or additional height field. Each source reads its
 * existing authoritative surface; only the owner can register a new source.
 */
export type SurfaceId='town-ground'|'town-water'|'west-ground'|'crater-road'|'front-ridge-road'|'front-ridge-ground';
export type SupportQuery=Readonly<{east:number;north:number;hintHeight?:number;movement?:'walk'|'sled'|'spawn'}>;
export type SupportSample=Readonly<{height:number;surfaceId:SurfaceId;ready:true;passable:boolean;
  normal:readonly [number,number,number];grade:number}>;
type HeightAt=(east:number,north:number,hintHeight?:number)=>number|undefined;
type Source={id:SurfaceId;heightAt:HeightAt};
export type TerrainSupportSources=Readonly<{
  town:HeightAt;townReady:(east:number,north:number)=>boolean;
  west:HeightAt;westReady:(east:number,north:number)=>boolean;
  westId?:(east:number,north:number)=>'west-ground'|'crater-road';
  water?:HeightAt;ridgeRoad?:HeightAt;ridgeGround?:HeightAt;
  passable?:(east:number,north:number)=>boolean;
}>;
export function createTerrainSupportContract(s:TerrainSupportSources){
  function resolve(q:SupportQuery):{source:Source;height:number}|undefined{
    const {east,north}=q;
    if(!Number.isFinite(east)||!Number.isFinite(north))return;
    const hint=Number.isFinite(q.hintHeight)?q.hintHeight:undefined;
    if(east<0){
      if(!s.westReady(east,north))return;
      const height=s.west(east,north,hint);
      return height!==undefined&&Number.isFinite(height)?
        {source:{id:s.westId?.(east,north)??'west-ground',heightAt:s.west},height}:undefined;
    }
    if(!s.townReady(east,north))return;
    // Explicit road leg priority. D owns continuous leg selection; the
    // caller's real current support is passed, never replaced with Infinity.
    const candidates:Source[]=[
      ...(s.ridgeRoad?[{id:'front-ridge-road' as const,heightAt:s.ridgeRoad}]:[]),
      ...(s.ridgeGround?[{id:'front-ridge-ground' as const,heightAt:s.ridgeGround}]:[]),
      ...(s.water?[{id:'town-water' as const,heightAt:s.water}]:[]),
      {id:'town-ground',heightAt:s.town},
    ];
    for(const source of candidates){
      const height=source.heightAt(east,north,hint);
      if(height!==undefined&&Number.isFinite(height))return {source,height};
    }
  }
  function heightAt(east:number,north:number,hintHeight?:number){
    return resolve({east,north,hintHeight})?.height;
  }
  function sample(q:SupportQuery):SupportSample|undefined{
    const resolved=resolve(q);if(!resolved)return;
    const {source,height}=resolved, d=.125;
    // Use the same chosen source and height hint on both sides of the
    // derivative. A missing neighbour gets a one-sided derivative.
    const axis=(de:number,dn:number)=>{
      const a=source.heightAt(q.east-de,q.north-dn,height);
      const b=source.heightAt(q.east+de,q.north+dn,height);
      if(a!==undefined&&b!==undefined&&Number.isFinite(a)&&Number.isFinite(b))return (b-a)/(2*d);
      if(b!==undefined&&Number.isFinite(b))return (b-height)/d;
      if(a!==undefined&&Number.isFinite(a))return (height-a)/d;
      return 0;
    };
    const dx=axis(d,0),dn=axis(0,d),l=Math.hypot(dx,1,dn);
    return {height,surfaceId:source.id,ready:true,passable:s.passable?.(q.east,q.north)??true,
      normal:[-dx/l,1/l,dn/l],grade:Math.hypot(dx,dn)};
  }
  return {heightAt,sample};
}

/** A's immutable H0 samples for D foothill blending. No mountain fixture. */
export function sampleTerrainEdge(heightAt:(east:number,north:number)=>number,
  points:readonly (readonly [number,number])[]){
  return points.map(([east,north])=>{
    const height=heightAt(east,north);
    if(![east,north,height].every(Number.isFinite))throw new RangeError('Invalid terrain boundary sample');
    return {east,north,height:Math.fround(height)};
  });
}
