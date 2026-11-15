// Original 16px game textures, authored in code. No Minecraft asset files.
export async function makeVoxelTexture(name:string,hex:string):Promise<HTMLImageElement>{
 const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d')!;
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 let seed=[...name].reduce((a,b)=>a*31+b.charCodeAt(0),17)>>>0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const shade=(n:number)=>`rgb(${rgb.map(v=>Math.max(0,Math.min(255,Math.round(v+n)))).join(',')})`;
 for(let y=0;y<16;y++)for(let x=0;x<16;x++){
  let n=(random()-.5)*22;
  if(['plank','wood','dark'].includes(name)){
   const horizontal=name==='plank';const u=horizontal?y:x,v=horizontal?x:y;
   n+=(u%4===0?-28:u%4===1?12:0)+(v%8===((Math.floor(u/4)%2)*4)?-15:0);
   if((x===5&&y===6)||(x===6&&y===7)||(x===11&&y===13))n-=20;
  }else if(['brick','stone','roof'].includes(name)){
   const row=Math.floor(y/4),joint=(x+(row%2)*4)%8;
   if(y%4===0||joint===0)n-=name==='roof'?30:38;
   else if(y%4===1||joint===1)n+=18;
  }else if(name==='cobble'){
   const seeds=[[1,2],[7,1],[13,3],[3,9],[10,8],[15,12],[5,15]];
   const distances=seeds.map(([a,b])=>(x-a)**2+(y-b)**2).sort((a,b)=>a-b);
   n+=distances[1]-distances[0]<6?-30:((x+y)%3)*5;
  }else if(name==='plaster'){n*=.55;if(y===15)n-=9;}
  else if(name==='cloth'){n+=(x%2===y%2?9:-7);if(x===1||x===14||y===1||y===14)n+=55;}
  else if(name==='glow'){n=28-Math.abs(x-7.5)*3;if(x%4===0)n-=17;}
  else if(name==='green'){n+=(x+y)%4===0?-25:9;}
  else if(name==='book'){if(y===2||y===13)n+=65;if(x===0||x===15)n-=32;}
  else if(name==='iron'){if((x===3||x===12)&&(y===3||y===12))n+=45;}
  else if(name==='bottle'){n*=.4;if(x===3||x===4)n+=30;}
  else if(name==='snow'){n*=.35;if((x+y*3)%17===0)n-=15;}
  else if(name==='pot'){if(y===2||y===12)n-=24;}
  ctx.fillStyle=shade(n);ctx.fillRect(x,y,1,1);
 }
 const img=new Image();img.src=c.toDataURL('image/png');await img.decode();return img;
}
