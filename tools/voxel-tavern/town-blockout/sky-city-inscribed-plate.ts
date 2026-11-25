import {BoxGeometry,CanvasTexture,Group,Mesh,MeshBasicMaterial,MeshLambertMaterial,PlaneGeometry,SRGBColorSpace} from 'three';
export const skyCityPlaqueCopy=Object.freeze({'T-01':'观星台','T-02':'门环未合，候声而开','T-03':'浮晶·一'});
export function skyCityInscribedPlate(id:keyof typeof skyCityPlaqueCopy,width:number,height:number){
  const group=new Group();group.name='sky-city-inscription-'+id;
  group.userData.text=skyCityPlaqueCopy[id];
  const base=new Mesh(new BoxGeometry(width,height,.065),new MeshLambertMaterial({color:'#8f805c'}));group.add(base);
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.round(768*height/width);
    const c=canvas.getContext('2d');if(c){
      c.fillStyle='#786343';c.fillRect(0,0,canvas.width,canvas.height);c.strokeStyle='#c8b58a';c.lineWidth=9;c.strokeRect(7,7,canvas.width-14,canvas.height-14);
      c.textAlign='center';c.textBaseline='middle';c.fillStyle='#e9ddbd';c.font='bold '+Math.floor(canvas.height*.59)+'px Microsoft YaHei,sans-serif';
      c.fillText(skyCityPlaqueCopy[id],canvas.width/2,canvas.height/2,canvas.width-40);
      const tex=new CanvasTexture(canvas);tex.colorSpace=SRGBColorSpace;
      const face=new Mesh(new PlaneGeometry(width-.04,height-.04),new MeshBasicMaterial({map:tex}));
      face.position.z=.034;face.name='sky-city-inscription-face-'+id;group.add(face);
    }
  }
  return group;
}
