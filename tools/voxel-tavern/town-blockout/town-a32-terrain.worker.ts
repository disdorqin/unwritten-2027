import {sampleTerrainGrid} from './terrain';
self.onmessage=()=>{
 try{
  const started=performance.now(),samples=sampleTerrainGrid();
  self.postMessage({samples,ms:performance.now()-started}, {transfer:[samples.elevation.buffer as ArrayBuffer,samples.surfaces.buffer as ArrayBuffer]});
 }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
