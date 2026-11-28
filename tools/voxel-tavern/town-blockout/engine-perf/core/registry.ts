import type {ChunkDescriptor} from './contracts';
export class ChunkRegistry{
 private readonly chunks=new Map<string,ChunkDescriptor>();
 register(c:ChunkDescriptor){
  if(!c.owner||!c.id||!c.revision||![c.west,c.east,c.south,c.north].every(Number.isFinite)||c.west>c.east||c.south>c.north)throw new RangeError('Invalid descriptor');
  const id=JSON.stringify([c.owner,c.id]);const old=this.chunks.get(id);
  if(old&&old.revision===c.revision)throw Error('Duplicate chunk revision: '+id);
  this.chunks.set(id,Object.freeze({...c}));return old;
 }
 remove(owner:string,id:string){return this.chunks.delete(JSON.stringify([owner,id]));}
 list():readonly ChunkDescriptor[]{return Array.from(this.chunks.values());}
}
