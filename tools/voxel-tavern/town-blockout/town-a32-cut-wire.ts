import {BufferAttribute,BufferGeometry,type Mesh} from 'three';
export type CutWire={position:Float32Array;index:Uint16Array|Uint32Array;color?:Float32Array;normal?:Float32Array};
export function packCutGeometry(g:BufferGeometry):CutWire{
 const pos=g.getAttribute('position'),idx=g.getIndex();
 if(!pos||!idx)throw Error('Indexed cut geometry required');
 return {position:Float32Array.from(pos.array),index:idx.array instanceof Uint16Array?Uint16Array.from(idx.array):Uint32Array.from(idx.array),
 color:g.getAttribute('color')?Float32Array.from(g.getAttribute('color').array):undefined,
 normal:g.getAttribute('normal')?Float32Array.from(g.getAttribute('normal').array):undefined};
}
export function unpackCutGeometry(w:CutWire){
 const g=new BufferGeometry();
 g.setAttribute('position',new BufferAttribute(w.position,3));g.setIndex(new BufferAttribute(w.index,1));
 if(w.color)g.setAttribute('color',new BufferAttribute(w.color,3));
 if(w.normal)g.setAttribute('normal',new BufferAttribute(w.normal,3));
 g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export const cutTransfers=(w:CutWire)=>[w.position.buffer,w.index.buffer,...(w.color?[w.color.buffer]:[]),...(w.normal?[w.normal.buffer]:[])] as ArrayBuffer[];
export type CutRequest={tread:CutWire;tiles:{id:number;wire:CutWire}[]};
export type CutReply={cuts:{id:number;wire:CutWire|null}[];ms:number};
export function intersectingCutTiles(tiles:readonly Mesh[],tread:BufferGeometry){
 tread.computeBoundingBox();const b=tread.boundingBox!;
 return tiles.filter(m=>{
  const g=m.geometry;if(!g.boundingBox)g.computeBoundingBox();const a=g.boundingBox!;
  return a.max.x>=b.min.x&&a.min.x<=b.max.x&&a.max.z>=b.min.z&&a.min.z<=b.max.z;
 });
}
