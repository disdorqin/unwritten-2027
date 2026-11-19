// Architectural dimensions are metres. The tower is built from Y=2 to Y=98.
const centerX=-3, centerZ=37.5;
const faces=['north','south','west','east'];

export function buildGrandClocktower({box,beam,lantern,dynamicHands=false}) {
 function face(side,material,u,y,n,width,height,depth){
  if(side==='north')beam(material,centerX+u,y,centerZ-n-depth,width,height,depth);
  else if(side==='south')beam(material,centerX-u-width,y,centerZ+n,width,height,depth);
  else if(side==='west')beam(material,centerX-n-depth,y,centerZ-u-width,depth,height,width);
  else beam(material,centerX+n,y,centerZ+u,depth,height,width);
 }
 function square(material,y,half,height){
  beam(material,centerX-half,y,centerZ-half,half*2,height,half*2);
 }
 function band(y,half,height,material,projection=.375){
  for(const side of faces)face(side,material,-half-projection,y,half,2*(half+projection),height,projection);
 }
 function radialStone(material,x,z,y,r,height,thickness){
  for(let row=-r;row<r;row+=.5){
   const distance=Math.abs(row+.25);
   if(distance>=r)continue;
   const edge=Math.floor(Math.sqrt(r*r-distance*distance)*2)/2;
   const hole=Math.max(0,r-thickness);
   const inner=distance<hole?Math.floor(Math.sqrt(hole*hole-distance*distance)*2)/2:0;
   if(inner>0){
    box(material,x+row,y,z-edge,.5,height,edge-inner);
    box(material,x+row,y,z+inner,.5,height,edge-inner);
   }else if(edge>0)beam(material,x+row,y,z-edge,.5,height,edge*2);
  }
 }
 function bell(x,y,z,r){
  const steps=[
   [0,1,.1875,'gold'],[.1875,1,.375,'bronze'],[.5625,.9,.4375,'brass'],
   [1,.78,.5,'bronze'],[1.5,.69,.75,'brass'],[2.25,.63,.75,'bronze'],
   [3,.58,.5,'brass'],[3.5,.51,.4375,'bronze'],[3.9375,.38,.1875,'gold'],
  ];
  const scale=r/2.5;
  for(const [dy,radius,height,material] of steps){
   const ring=Math.max(.5,Math.round(r*radius*2)/2);
   radialStone(material,x,z,y+dy*scale,ring,height*scale,dy>3.5?ring:.5);
  }
  beam('iron',x-.1875,y-.375,z-.1875,.375,4.9*scale,.375);
  box('bronze',x-.3125,y-.5,z-.3125,.625,.375,.625);
  beam('dark',x-.3125,y+4.18*scale,z-1.125,.625,.375,2.25);
 }
 function lancet(side,u,y,n,w,h){
  face(side,'dark',u,y,n,w,h,.125);
  face(side,'limestone',u-.1875,y-.25,n,w+.375,.25,.3125);
  for(const edge of [u-.125,u+w])face(side,'blueStone',edge,y,n+.0625,.125,h,.25);
  for(let dx=.1875;dx<w-.1;dx+=.3125){
   const height=h-1.125-Math.abs(dx-w/2)*.7;
   if(height>1)face(side,'glow',u+dx,y+.375,n+.125,.1875,height,.0625);
  }
  for(let i=0;i<4;i++){
   const inset=i*.1875;
   face(side,'limestone',u+inset,y+h+i*.1875,n+.0625,w-inset*2,.1875,.25);
  }
  face(side,'brass',u+w/2-.0625,y+.25,n+.25,.125,h-.5,.0625);
  face(side,'dark',u+.0625,y+h*.42,n+.25,w-.125,.125,.0625);
  face(side,'oxblood',u-.125,y-.375,n+.125,w+.25,.125,.125);
 }

 // A flat north passage and an open doorway 3.75 m wide lead into the hall.
 square('blueStone',2,6.5,.125);
 square('limestone',2.125,6.125,.125);
 for(let x=-6;x<6;x++)for(let z=-6;z<6;z++){
  const dark=Math.abs(x)>=5||Math.abs(z)>=5||(Math.abs(x)+Math.abs(z))%6===0;
  box(dark?'paveEdge':'paving',centerX+x,2.25,centerZ+z,1,.0625,1);
 }
 for(const side of faces){
  face(side,'blueStone',-6.25,2.3125,5.25,12.5,.1875,.4375);
  if(side==='north'){
   face(side,'limestone',-5.75,2.5,5,3.875,9.75,.625);
   face(side,'limestone',1.875,2.5,5,3.875,9.75,.625);
   face(side,'ivory',-1.875,8.125,5,3.75,4.125,.625);
   for(let i=0;i<8;i++){
    const t=i*.1875;
    for(const offset of [-1,1]){
     const u=offset*(1.875-t);
     face(side,i%2?'ivory':'limestone',u-.1875,6.625+t,5.5625,.375,.25,.5);
    }
   }
   for(const u of [-2.25,1.875]){
    face(side,'blueStone',u-.0625,2.5,5.5625,.5,.5625,.5625);
    face(side,'limestone',u,3.0625,5.625,.375,3.625,.375);
    face(side,'brass',u-.125,6.6875,5.5625,.625,.1875,.625);
   }
   face(side,'dark',-1.875,8.625,5.6875,3.75,1.75,.25);
   face(side,'brass',-2,8.5,5.875,4,.125,.1875);
   face(side,'brass',-2,10.375,5.875,4,.125,.1875);
   for(let i=0;i<5;i++){
    const u=(i-2)*.56,yy=9.4375+Math.abs(i-2)*.1875;
    face(side,'gold',u-.1875,yy,5.9375,.375,.375,.125);
    face(side,'garnet',u-.0625,yy+.125,6.0625,.125,.125,.0625);
   }
  }else face(side,'limestone',-5.75,2.5,5,11.5,9.75,.625);
  for(const u of [-4.75,3.25])lancet(side,u,4.0625,5.625,1.5,3.625);
  for(const u of [-5.8125,5.125]){
   face(side,'blueStone',u-.125,2.5,5.5625,.9375,.5625,.5);
   face(side,'ivory',u,3.0625,5.625,.6875,8.75,.375);
   for(const y of [5.125,8.125,11.125])face(side,'brass',u-.0625,y,5.8125,.8125,.125,.25);
  }
 }
 for(const x of [-7.3125,1.1875])for(const z of [33.625,38.25,41.5])lantern(x,6.25,z);
 for(const x of [-7.125,-.25]){
  for(const z of [34.25,39.75]){
   beam('dark',x,2.3125,z,1.25,.4375,2);
   beam('runner',x+.125,2.75,z+.125,1,.125,1.75);
   beam('wood',x+.125,2.875,z,1,.5,.1875);
  }
 }
 beam('cloth',-4.25,2.3125,33.25,2.5,.0625,6.5);
 for(const x of [-4.3125,-1.75])beam('brass',x,2.3125,33.25,.0625,.0625,6.5);
 beam('blueStone',-5.25,2.3125,40.75,4.5,.25,1.75);
 for(const x of [-4.75,-1.875]){
  beam('dark',x,2.5625,40.875,.625,4.25,.625);
  box('gold',x-.125,6.8125,40.75,.875,.25,.875);
  lantern(x,4.125,41.75);
 }
 beam('wood',-4.875,7.0625,40.75,3.75,.4375,.875);
 bell(-3,3.5,41.625,.875);
 square('wood',12.25,5.5625,.5);

 // Repeated pilasters frame recessed stained lancets on all four elevations.
 band(12,5.625,.5,'blueStone',.5);
 band(12.5,5.625,.25,'brass',.375);
 const storyStarts=[13,21.5,30,38.5,47];
 for(const y of storyStarts){
  for(const side of faces){
   for(let u=-5;u<5;u+=.5){
    const pilaster=Math.abs(u+.25)>4.25||Math.abs(u+.25)<.5;
    const panel=Math.abs(u+.25)>1.125&&Math.abs(u+.25)<3.5;
    const material=pilaster?'ivory':panel?'limestone':'blueStone';
    face(side,material,u,y,4.5,.5,8,pilaster?.875:panel?.5:.625);
   }
   for(const u of [-3.625,1.5])lancet(side,u,y+1.5,5,2.125,4.625);
   for(const u of [-4.875,-.375,4.25]){
    face(side,'limestone',u-.125,y+.25,5.25,.75,.375,.375);
    face(side,'ivory',u,y+.625,5.25,.5,6.625,.25);
    face(side,'blueStone',u-.125,y+7.25,5.25,.75,.375,.3125);
   }
  }
  band(y+8,5.25,.3125,'blueStone');
  band(y+8.3125,5.25,.125,'snowFeather',.3125);
 }

 // Clock chamber. Four lighted dials, gold ticks and dark, raised hands.
 const dialY=67,dialN=5.5;
 square('blueStone',55,5.5,.5);
 band(55.5,5.5,.5,'brass',.5);
 for(const side of faces){
  face(side,'limestone',-5.5,56,5,11,17,.5);
  for(const u of [-5.375,4.5]){
   face(side,'ivory',u,56,5.5,.875,17,.5);
   face(side,'blueStone',u-.0625,57,5.875,1,.3125,.1875);
  }
  for(let i=0;i<7;i++){
   const u=(i-3)*1.24;
   face(side,'oxblood',u-.4375,58.1875,dialN,.875,2.125,.1875);
   for(let j=0;j<4;j++){
    const step=j*.0625;
    face(side,'brass',u-.25+step,58.4375+j*.375,dialN+.1875,.5-step*2,.125,.0625);
   }
  }
  const unit=.25;
  for(let row=-15;row<=15;row++){
   let last,from=-15;
   for(let col=-15;col<=16;col++){
    const r=col===16?Infinity:Math.hypot(col*unit,row*unit);
    const m=r>3.625?undefined:r>3.3125?'gold':r>3?'dark':(row+col)%5===0?'ivory':'glow';
    if(col===-15){last=m;continue;}
    if(m===last)continue;
    if(last)face(side,last,(from-.5)*unit,dialY+(row-.5)*unit,dialN,(col-from)*unit,unit,.25);
    last=m;from=col;
   }
  }
  function mark(material,angle,distance,width){
   const x=Math.sin(angle)*distance;
   const y=dialY+Math.cos(angle)*distance;
   face(side,material,x-width/2,y-width/2,dialN+.25,width,width,.125);
  }
  for(let i=0;i<60;i++){
   const angle=2*Math.PI*i/60;
   if(i%5!==0)mark('dark',angle,2.74,.125);
   else for(const r of [2.3,2.49,2.68])mark(i%15?'dark':'teal',angle,r,.25);
  }
  const hands=[{angle:Math.PI*11.6/6,length:2.58,width:.25},{angle:Math.PI*10.7/6,length:1.72,width:.3125}];
  if(!dynamicHands)for(const {angle,length,width} of hands){
   for(let d=0;d<length;d+=.12){
    const widen=d>length-.5?.125:0;
    const x=Math.sin(angle)*d, y=dialY+Math.cos(angle)*d;
    face(side,'dark',x-(width+widen)/2,y-(width+widen)/2,dialN+.375,width+widen,width+widen,.125);
   }
  }
  mark('gold',0,0,.4375);
  for(const u of [-4.125,4.125]){
   face(side,'wineTile',u-.1875,dialY-1.875,dialN,.375,3.75,.1875);
   for(const dy of [-1.5,1.5])face(side,'gold',u-.25,dialY+dy,dialN+.1875,.5,.3125,.125);
  }
 }
 band(61,5.5,.375,'blueStone',.5);
 band(61.375,5.5,.125,'brass',.375);
 band(72,5.5,.375,'brass',.5);
 band(72.375,5.5,.5,'limestone',.625);

 // Open belfry, with real geometry for the bell crown, skirt and clapper.
 square('blueStone',73,6,.625);
 for(const side of faces){
  for(const u of [-5.25,-1.875,1.5,4.625]){
   face(side,'limestone',u,73.625,4.625,.625,8,.625);
   face(side,'dark',u+.0625,74.25,5.25,.5,6.75,.1875);
   for(const y of [74.1875,80.875])face(side,'brass',u-.125,y,5.125,.875,.25,.25);
  }
  for(const u of [-3.6875,-.3125,3.0625]){
   for(let i=0;i<5;i++){
    const arch=i*.25,width=2.75-i*.5;
    face(side,i%2?'gold':'limestone',u-width/2,79.625+arch,4.875,width,.25,.5);
   }
   face(side,'blueStone',u-1.3125,74.25,4.875,2.625,.3125,.5);
   for(let i=0;i<7;i++)face(side,'iron',u-1.125+i*.375,74.5625,5.125,.125,1.125,.125);
  }
  face(side,'limestone',-5.125,81,4.75,10.25,1.125,.625);
 }
 bell(centerX,75.625,centerZ,2.5);
 for(const x of [-6.1875,-.4375])bell(x,76.75,centerZ+.25,1.25);
 for(const x of [-5.5,-1.375])for(const z of [34.3125,40.5])lantern(x,78.6875,z);
 square('dark',81.8125,5.375,.4375);

 // A stepped slate spire, snowy ridgelines, gold finials and corner pinnacles.
 band(82.25,5.5,.4375,'blueStone',.625);
 band(82.6875,5.5,.1875,'snowFeather',.5625);
 for(let i=0;i<22;i++){
  const y=82.875+i*.625;
  const half=Math.max(.3125,5.75-i*.25);
  const depth=Math.min(.3125,half);
  for(const side of faces){
   face(side,i%4===0?'roofGlaze':'roofShadow',-half,y,half-depth,half*2,.625,depth);
   for(let u=-half+.125;u<half-.25;u+=.5){
    const shade=(Math.floor((u+half)*2)+i*7)%9;
    if(shade<2)face(side,'snowFeather',u,y+.5,half-.0625,.375,.125,.125);
    else if(shade===4)face(side,'roof',u,y+.125,half,.375,.3125,.0625);
   }
   for(const u of [-half,half-.125])face(side,'brass',u,y,half,.125,.625,.125);
  }
 }
 for(const dx of [-4.6875,4.6875])for(const dz of [-4.6875,4.6875]){
  const x=centerX+dx,z=centerZ+dz;
  box('ivory',x-.375,82.875,z-.375,.75,1.125,.75);
  for(let i=0;i<4;i++)box(i%2?'roofShadow':'blueStone',x-.4375+i*.09375,84+i*.375,z-.4375+i*.09375,.875-i*.1875,.375,.875-i*.1875);
  box('gold',x-.125,85.5,z-.125,.25,.5,.25);
 }
 box('gold',centerX-.3125,96.625,centerZ-.3125,.625,.375,.625);
 box('brass',centerX-.125,97,centerZ-.125,.25,.625,.25);
 box('gold',centerX-.1875,97.625,centerZ-.1875,.375,.375,.375);
}
