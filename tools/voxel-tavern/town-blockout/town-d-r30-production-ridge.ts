import type {Object3D} from 'three';
import type {createTerrainGrid} from './terrain';
import {createAR30RidgeOwnership} from './town-a-r30-ridge-ownership';
import {buildFrontRidgeR30Field,frontRidgeR30Bounds,mountFrontRidgeR30} from './town-d-r30-front-ridge';
import {buildMiddleEastRoadbed,middleEastExtendedControls,middleSouthRoadControls} from './town-d-r30-upper-roadbed';
import {auditRidgeRoadSurface} from './town-d-r30-roadbed';
import {mountRidgeForest,ridgeForestRouteClearance} from './town-d-r30-forest';
import {mountRidgeRoadFurniture} from './town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from './town-d-r30-retaining-banks';
import {mountNorthRidgeMiddleStation} from './north-ridge-middle-station';
type Grid=ReturnType<typeof createTerrainGrid>;
type Options=Parameters<typeof createAR30RidgeOwnership>[0];
/** M1 production only: actual rail geometry defines the protected H0.
 * No old spiral support, no uncertified cable/domain transfer. */
export function mountProductionRidge(owner:Object3D,grid:Grid,options:Options){
 const ownership=createAR30RidgeOwnership({...options,cloudApron:true});
 const allowed=(e:number,n:number)=>ownership.distance(e,n)>0;
 const natural=buildFrontRidgeR30Field(grid.groundHeightAt,ownership.weight);
 let field=natural;
 const south=buildMiddleEastRoadbed(field,allowed,middleSouthRoadControls);
 if(south.ok&&'field'in south)field=south.field;
 const east=buildMiddleEastRoadbed(field,allowed,middleEastExtendedControls);
 if(east.ok&&'field'in east)field=east.field;
 // Never publish an overlapping or protected cut merely because individual
 // segments passed. Fall back to the natural mountain, not the old shell.
 const accepted=[south,east].filter(r=>r.ok&&'field'in r);
 const coherent=accepted.every(r=>auditRidgeRoadSurface(field,r.route).maxGrade<=.12+1e-6)&&
 field.elevation.every((v,i)=>Math.abs(v-natural.elevation[i]!)<=8.00001);
 const roads=coherent?accepted:[];
 if(!coherent)field=natural;
 const patch=grid.installGroundPatch(frontRidgeR30Bounds,field.vertexAt,allowed);
 const roadAt=(e:number,n:number)=>roads.some(r=>r.roadAt?.(e,n)===true);
 const model=mountFrontRidgeR30(field,roadAt,patch.ownsCell);owner.add(model.group);
 const clearance=ridgeForestRouteClearance(roads.map(r=>r.route));
 const forest=mountRidgeForest(field,(e,n,r)=>ownership.distance(e,n)>r+3&&clearance(e,n,r));owner.add(forest.group);
 const furniture=roads.map(r=>mountRidgeRoadFurniture(field,r.route,allowed));
 const banks=roads.map(r=>mountRidgeRetainingBanks(field,r.route,allowed));
 for(const asset of [...furniture,...banks])owner.add(asset.group);
 // The old terminal footprint is preserved; mid station is mounted only
 // when its actual platform datum is supported by this exact field.
 const stationReady=Array.from({length:13},(_,i)=>i-6).every(de=>Array.from({length:9},(_,i)=>i-4).every(dn=>Math.abs((field.heightAt(440+de,520+dn)??-1)-140)<.001));
 const station=stationReady?mountNorthRidgeMiddleStation(owner):undefined;
 function heightAt(e:number,n:number){
  return patch.ownsCell(Math.floor(e),Math.floor(n))?grid.heightAt(e,n):undefined;
 }
 // A small frame step must not allow walking up a rock face merely
 // because its per-frame elevation increment is below the old step limit.
 // Natural snow slopes remain explorable; engineered roads keep their
 // separately certified 12% bound. Actual steps/platforms are exempt.
 function allowsUphill(from:{east:number;north:number;height:number},to:{east:number;north:number;height:number}){
  const a=heightAt(from.east,from.north),b=heightAt(to.east,to.north);
  if(a===undefined&&b===undefined)return true;
  const h0=a??grid.heightAt(from.east,from.north),h1=b??grid.heightAt(to.east,to.north);
  if(Math.abs(from.height-h0)>.04||Math.abs(to.height-h1)>.04)return true;
  const d=Math.hypot(to.east-from.east,to.north-from.north);
  return d<1e-6||h1-h0<=.85*d+1e-5;
 }
 return {field,ownership,ownsCell:patch.ownsCell,changedVertices:patch.changedVertices,roads,stationReady,model,forest,heightAt,allowsUphill,
  blocked(e:number,n:number,h:number,r=.27){return forest.blocked(e,n,h,r)||!!station?.blocked(e,n,h,r)||furniture.some(f=>f.blocked(e,n,h))||banks.some(b=>b.blocked(e,n,h))},
  setNight(night:boolean){station?.setNight(night);furniture.forEach(f=>f.setNight(night))},
  updateView(e:number,n:number){model.updateView(e,n);forest.updateView(e,n);banks.forEach(b=>b.updateView(e,n))},
  transportReady:false as const,
 };
}
