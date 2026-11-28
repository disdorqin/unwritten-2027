import {cutNightBWestTerrain} from './town-night-b-summit-west-cut';
import {cutTransfers,packCutGeometry,unpackCutGeometry,type CutRequest,type CutReply} from './town-a32-cut-wire';
self.onmessage=(event:MessageEvent<CutRequest>)=>{
 const start=performance.now(),tread=unpackCutGeometry(event.data.tread);
 try{
  const cuts:CutReply['cuts']=[];
  for(const {id,wire} of event.data.tiles){
   const source=unpackCutGeometry(wire);
   try{const cut=cutNightBWestTerrain(source,tread).geometry;
    try{cuts.push({id,wire:cut===source?null:packCutGeometry(cut)});}
    finally{if(cut!==source)cut.dispose();}
   }finally{source.dispose();}
  }
  const reply:CutReply={cuts,ms:performance.now()-start};
  self.postMessage(reply,{transfer:cuts.flatMap(c=>c.wire?cutTransfers(c.wire):[])});
 }catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}
 finally{tread.dispose();}
};
