import {CanvasTexture,Color,Group,InstancedMesh,MeshBasicMaterial,Object3D,PlaneGeometry,SRGBColorSpace,DoubleSide} from 'three';
import type {FrontRidgeR30Field} from './town-d-r30-front-ridge';
// Review-only distant cloud sea. It lies below the actual 347m terrace;
// no fog, no support surface, and no changes to either weather authority.
const hash=(i:number)=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v)};
export function mountCloudseaVista(field:FrontRidgeR30Field){
 const group=new Group();group.name='d-r30-cloudsea-vista';
 if(typeof document==='undefined')return {group,count:0,setNight(_night:boolean){},dispose(){}};
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
 const ctx=canvas.getContext('2d')!;
 // A soft-edged layered cloud, baked once into a shared texture, with
 // intentionally asymmetric lobes to avoid visible repeating circles.
 for(let i=0;i<19;i++){
  const x=32+hash(i*7+5)*192,y=32+hash(i*7+6)*64,r=22+hash(i*7+7)*34;
  const grad=ctx.createRadialGradient(x,y,r*.18,x,y,r);
  grad.addColorStop(0,'rgba(255,255,255,.90)');grad.addColorStop(.48,'rgba(245,249,255,.60)');grad.addColorStop(1,'rgba(222,234,244,0)');
  ctx.fillStyle=grad;ctx.fillRect(x-r,y-r,r*2,r*2);
 }
 const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
 const material=new MeshBasicMaterial({map:texture,color:'#e0ebf0',transparent:true,depthWrite:false,side:DoubleSide,opacity:.86});
 const geo=new PlaneGeometry(1,1),puffs:{e:number;n:number;y:number;w:number;d:number;angle:number;tilt:number}[]=[];
 // Keep the active near slope clear; cloud layer is a distant vista
 // only and is rejected where the terrain intrudes into its footprint.
 for(let i=0;i<520;i++){
  const a=hash(i*11+1)*Math.PI*2,r=185+hash(i*11+2)*880,e=320+Math.cos(a)*r,n=650+Math.sin(a)*r;
  const y=299+hash(i*11+3)*34,w=46+hash(i*11+4)*105,d=25+hash(i*11+5)*62;
  if([[0,0],[-w*.4,0],[w*.4,0],[0,d*.4],[0,-d*.4]].some(([de,dn])=>(field.heightAt(e+de!,n+dn!)??-100)>y-12))continue;
  puffs.push({e,n,y,w,d,angle:hash(i*11+6)*Math.PI*2,tilt:-Math.PI/2+(hash(i*11+7)-.5)*.28});
 }
 const batch=new InstancedMesh(geo,material,puffs.length),tmp=new Object3D(),tint=new Color();
 puffs.forEach((p,i)=>{
  tmp.position.set(p.e,p.y,-p.n);tmp.rotation.set(p.tilt,0,p.angle);tmp.scale.set(p.w,p.d,1);tmp.updateMatrix();
  batch.setMatrixAt(i,tmp.matrix);batch.setColorAt(i,tint.setHSL(.57,.13,.78+hash(i*13+3)*.18));
 });
 batch.computeBoundingSphere();group.add(batch);
 return {group,count:puffs.length,setNight(night:boolean){material.color.set(night?'#7187aa':'#e0ebf0');material.opacity=night?.68:.86},dispose(){group.removeFromParent();batch.dispose();geo.dispose();material.dispose();texture.dispose()}};
}
