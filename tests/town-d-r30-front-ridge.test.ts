import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildFrontRidgeR30Field,mountFrontRidgeR30,frontRidgeR30Bounds,ridgeFarIndices} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge';
test('D-R01 one height field preserves the survey pads and shared boundaries',()=>{
 const h0=(e:number,n:number)=>Math.fround(12+e*.001+n*.002);
 const f=buildFrontRidgeR30Field(h0,()=>1);
 for(const [e,n,h] of [[320,650,350],[440,520,140],[526,329,18],[336,640,347]])assert.equal(f.heightAt(e!,n!),h);
 for(const side of ['south','north','west','east'] as const)for(const p of f.edge(side))assert.equal(p.height,h0(p.east,p.north));
 assert.equal(f.heightAt(320,269),undefined);
 const m=mountFrontRidgeR30(f);
 try{
  assert.equal(m.group.children.length,90);
  for(const mesh of m.group.children as import('three').Mesh[]){
   const pos=mesh.geometry.getAttribute('position'),norm=mesh.geometry.getAttribute('normal');
   for(let i=0;i<pos.count;i+=97){
    assert.equal(pos.getY(i),f.heightAt(pos.getX(i),-pos.getZ(i)));
    assert.ok(norm.getY(i)>0);
   }
  }
 }finally{m.dispose()}
});
test('far chunks retain every fine boundary vertex and cover their complete area',()=>{
 for(const [cols,rows]of [[65,65],[65,19]]){
  const index=ridgeFarIndices(cols!,rows!),used=new Set(index);
  for(let z=0;z<rows!;z++){assert.ok(used.has(z*cols!));assert.ok(used.has(z*cols!+cols!-1))}
  for(let x=0;x<cols!;x++){assert.ok(used.has(x));assert.ok(used.has((rows!-1)*cols!+x))}
  let area=0;
  for(let i=0;i<index.length;i+=3){
   const [a,b,c]=index.slice(i,i+3),ax=a!%cols!,az=Math.floor(a!/cols!),bx=b!%cols!,bz=Math.floor(b!/cols!),cx=c!%cols!,cz=Math.floor(c!/cols!);
   const doubled=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
   assert.ok(doubled>0);area+=doubled/2;
  }
  assert.equal(area,(cols!-1)*(rows!-1));
  assert.ok(index.length<6*(cols!-1)*(rows!-1)*.4);
 }
});
test('mixed ownership far LOD covers precisely the owned cells and preserves each seam edge',()=>{
 const cols=65,rows=65,owns=(x:number,z:number)=>x>=8&&z>=5&&x<59&&z<61&&!(x>=27&&x<38&&z>=24&&z<39);
 const indices=ridgeFarIndices(cols,rows,4,owns),used=new Set(indices);let owned=0,area=0;
 for(let z=0;z<rows-1;z++)for(let x=0;x<cols-1;x++)if(owns(x,z)){
  owned++;
  if(x===0||!owns(x-1,z))assert.ok(used.has(z*cols+x)&&used.has((z+1)*cols+x));
  if(x===cols-2||!owns(x+1,z))assert.ok(used.has(z*cols+x+1)&&used.has((z+1)*cols+x+1));
  if(z===0||!owns(x,z-1))assert.ok(used.has(z*cols+x)&&used.has(z*cols+x+1));
  if(z===rows-2||!owns(x,z+1))assert.ok(used.has((z+1)*cols+x)&&used.has((z+1)*cols+x+1));
 }
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=indices.slice(i,i+3),ax=a!%cols,az=Math.floor(a!/cols),bx=b!%cols,bz=Math.floor(b!/cols),cx=c!%cols,cz=Math.floor(c!/cols);
  const d=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);assert.ok(d>0);area+=d/2;
  assert.ok(owns(Math.floor((ax+bx+cx)/3),Math.floor((az+bz+cz)/3)));
 }
 assert.equal(area,owned);assert.ok(indices.length<owned*6*.45);
});
test('host protection has final authority, even at a survey pad',()=>{
 const f=buildFrontRidgeR30Field(()=>12,(e,n)=>e===440&&n===520?0:1);
 assert.equal(f.heightAt(440,520),12);
});
