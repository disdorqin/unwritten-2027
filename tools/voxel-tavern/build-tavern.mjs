// All dimensions are metres, quantized to 1/16 m. No imported GLB.
import {writeFileSync} from 'node:fs';
const boxes=[];
const palette={snow:'#e1e5df',stone:'#656d73',wood:'#684335',edge:'#342a29',plank:'#98734e',plaster:'#d3bd96',tile:'#34434d',red:'#9c3e32',gold:'#dfa855',glow:'#ffcb76',green:'#596c51',cream:'#e7d6ac'};
const box=(m,x,y,z,w,h,d)=>boxes.push({m,b:[x,y,z,x+w,y+h,z+d].map(v=>Math.round(v*16)/16)});
// A 12 x 10 m two-storey timber tavern, front is +z.
box('stone',-6,2,-5,12,.5,10);box('plank',-6,2.5,-5,12,.25,10);
for(let x=-6;x<6;x+=.5)box('edge',x,2.75,-5,.0625,.0625,10);
for(const y of [2.75,6.25]) {
  box('plaster',-6,y,-5,12,3.25,.25);
  for(const x of [-6,5.75]) {
    box('plaster',x,y,-5,.25,3.25,10);
    for(const z of [-2,1,3]) {
      box('edge',x-.0625,y+.75,z,.375,1.75,1.5);
      box('gold',x-.125,y+.875,z+.125,.5,1.5,1.25);
      for(let zz=z+.1875;zz<z+1.5;zz+=.3125)box('edge',x-.1875,y+.875,zz,.5625,1.5,.0625);
    }
  }
  // Open central entrance and balcony door.
  box('plaster',-6,y,4.75,4.75,3.25,.25);box('plaster',1.25,y,4.75,4.75,3.25,.25);
  box('edge',-1.375,y,4.625,.25,3,.5);box('edge',1.125,y,4.625,.25,3,.5);
  box('edge',-1.375,y+2.625,4.625,2.75,.375,.5);
  for(const x of [-6,-3,3,5.75])for(const z of [-5,4.75])box('wood',x,y,z,.25,3.5,.25);
  for(const yy of [y,y+2.75,y+3.125])box('edge',-6,yy,4.625,12,.1875,.5);
  for(const x of [-4.5,3]) {
    box('edge',x,y+.75,4.875,1.5,1.5,.125);
    box('gold',x+.125,y+.875,5,1.25,1.25,.0625);
    for(let xx=x+.125;xx<x+1.5;xx+=.3125)box('edge',xx,y+.875,5.0625,.0625,1.25,.0625);
    box('edge',x,y+1.4375,5.0625,1.5,.0625,.0625);
  }
}
// Upper floor leaves a stairwell at the right rear.
box('plank',-6,6,-5,9,.25,10);box('plank',3,6,1,3,.25,4);
box('plank',-6,6,5,12,.25,1.5);
for(let x=-6;x<=6;x+=.5)box('wood',x,6.25,6.25,.125,1.125,.125);
for(const y of [6.625,7.25])box('edge',-6,y,6.25,12,.125,.125);
for(const x of [-6,5.875])box('edge',x,7.25,5,.125,.125,1.375);
// Stair steps use exactly the same boxes for rendering and collision.
for(let i=0;i<14;i++)box('plank',3.5,2.75+i*.25,-4.5+i*.375,1.75,.25,.375);
for(let i=0;i<14;i++)box('wood',3.375,3+i*.25,-4.5+i*.375,.125,.875,.125);
// Stepped gable roof, slate bands, snow caps and raised corner eaves.
for(let i=0;i<13;i++)for(const side of [-1,1]) {
 const x=side<0?-7+i*.5:6.5-i*.5;
 box('tile',x,9.5+i*.25,-6,.5,.3125,13);
 box('snow',x,9.8125+i*.25,-6,.5,.125,13);
 for(let z=-6;z<7;z+=.5)box('edge',x,9.5+i*.25,z,.5,.0625,.0625);
}
box('tile',-.5,12.75,-6,1,.25,13);box('snow',-.5,13,-6,1,.1875,13);
for(const x of [-7,6.5])for(const z of [-6,6.5])box('tile',x,9.75,z,.5,.5,.5);
// Bar, back cabinets, shelves and bottles.
box('wood',-4.5,2.75,-3.5,6,1,.625);box('edge',-4.625,3.75,-3.625,6.25,.125,.875);
for(let x=-4.25;x<1.5;x+=.75)box('plank',x,2.875,-2.875,.5,.75,.0625);
for(const y of [3,4,5]) {
 box('edge',-5, y,-4.75,7,.125,.5);
 for(let x=-4.75;x<2;x+=.5) {
   box((Math.round(x*4)%3)?'green':'red',x,y+.125,-4.625,.1875,.375,.1875);
   box('gold',x+.0625,y+.5,-4.5625,.0625,.125,.0625);
 }
}
for(const x of [-5,-2,1.875])box('wood',x,2.75,-4.75,.125,2.5,.5);
function chair(x,y,z){box('plank',x,y+.5,z,.75,.125,.75);for(const a of [0,.625])for(const b of [0,.625])box('edge',x+a,y,z+b,.125,.5,.125);box('wood',x,y+.625,z,.75,.625,.125);}
function table(x,y,z){box('plank',x,y+.875,z,1.5,.125,1);for(const a of [0,1.375])for(const b of [0,.875])box('edge',x+a,y,z+b,.125,.875,.125);box('cream',x+.5,y+1,z+.25,.25,.0625,.25);box('red',x+.875,y+1,z+.375,.1875,.25,.1875);}
for(const [x,z] of [[-4,0],[0,1],[-3,3]]) {table(x,2.75,z);chair(x-.375,2.75,z-1);chair(x+.875,2.75,z+1.125);}
for(const [x,z] of [[-4,-2],[0,2]]){table(x,6.25,z);chair(x-.375,6.25,z-1);chair(x+.875,6.25,z+1.125);}
// Hearth and a small raised performance corner.
box('stone',-5.75,2.75,-.5,1,2,1.5);box('edge',-4.75,2.875,-.25,.0625,1,1);
box('glow',-4.6875,3,-.125,.0625,.5,.75);box('plank',-5.75,2.75,2,1.5,.25,2);
for(const y of [6.5,7.25,8]) {box('wood',-5.75,y,-4.625,4,.125,.5);for(let x=-5.5;x<-2;x+=.25)box((Math.round(x*4)%2)?'red':'green',x,y+.125,-4.5625,.125,.5,.375);}
// Hanging lanterns, wall brackets and narrow tassels.
for(const [x,y,z] of [[-1.875,4.5,5.5],[1.875,4.5,5.5],[-4,8,5.75],[4,8,5.75],[-1,5,-.5]]) {
 box('edge',x,y+.75,z,.0625,.5,.0625);box('red',x-.25,y,z-.25,.5625,.75,.5625);
 box('glow',x-.1875,y+.125,z-.3125,.4375,.5,.0625);
 for(const yy of [y,y+.6875])box('gold',x-.25,yy,z-.25,.5625,.0625,.5625);
 box('gold',x,y-.375,z,.0625,.375,.0625);
}
// Entrance steps and paired planters.
for(let i=0;i<3;i++)box('stone',-1.5,2-i*.1875,5+i*.5,3,.1875,.5);
for(const x of [-2.5,2]){box('wood',x,2,5.25,.5,.5,.5);box('snow',x,2.5,5.25,.5,.125,.5);}
// Clip architectural pieces into voxel cells, preserving exact fractional boxes.
const cells=new Map();
for(const {m,b} of boxes)for(let x=Math.floor(b[0]);x<Math.ceil(b[3]);x++)for(let y=Math.floor(b[1]);y<Math.ceil(b[4]);y++)for(let z=Math.floor(b[2]);z<Math.ceil(b[5]);z++) {
 const p=[Math.max(b[0]-x,0),Math.max(b[1]-y,0),Math.max(b[2]-z,0),Math.min(b[3]-x,1),Math.min(b[4]-y,1),Math.min(b[5]-z,1)];
 if(p[3]<=p[0]||p[4]<=p[1]||p[5]<=p[2])continue;
 const k=[x,y,z].join(',');if(!cells.has(k))cells.set(k,[]);cells.get(k).push({m,b:p});
}
const catalogue=[],ids=new Map(),voxels=[];
for(const [key,parts] of cells){const sig=JSON.stringify(parts);if(!ids.has(sig)){ids.set(sig,catalogue.length+2);catalogue.push(parts);}voxels.push([...key.split(',').map(Number),ids.get(sig)]);}
writeFileSync(new URL('./tavern.json',import.meta.url),JSON.stringify({palette,catalogue,voxels,stats:{pieces:boxes.length,cells:cells.size,types:catalogue.length,grid:1/16}}));
console.log({pieces:boxes.length,cells:cells.size,types:catalogue.length});
