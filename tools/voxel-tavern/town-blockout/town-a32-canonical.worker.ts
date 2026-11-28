import {createTownD2R30Massif} from './town-d2-r30-massif';
import {sampleD2CanonicalCollision} from './town-d2-r30-collision';
import {createMainSummitBlock,mainSummitLayout} from './main-summit-block';
import {createMainSummitTrail} from './main-summit-trail';
import {packCutGeometry,cutTransfers} from './town-a32-cut-wire';
import type {A32CanonicalWire} from './town-a32-canonical-wire';
import type {Mesh} from 'three';
self.onmessage=(event:MessageEvent<number>)=>{
 const arrivalHeight=event.data,start=performance.now();
 try{
  const survey=createMainSummitBlock(mainSummitLayout,arrivalHeight,100);
  let trail:A32CanonicalWire['trail'];
  try{const t=createMainSummitTrail(survey.heightAt,arrivalHeight);trail={points:t.points,metrics:t.metrics};}finally{survey.dispose();}
  const source=createTownD2R30Massif({arrivalHeight});
  let massif:A32CanonicalWire['massif'];
  try{massif=source.group.children.map(o=>({name:o.name,wire:packCutGeometry((o as Mesh).geometry)}));}finally{source.dispose();}
  const heights=sampleD2CanonicalCollision(arrivalHeight),reply:A32CanonicalWire={arrivalHeight,trail,massif,heights,ms:performance.now()-start};
  self.postMessage(reply,{transfer:[heights.buffer as ArrayBuffer,...massif.flatMap(m=>cutTransfers(m.wire))]});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
