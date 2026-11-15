// Fine architectural joinery and lived-in furnishings, all real voxel parts.
export function refineTavern({box,beam,mug,bottle}){
 const trim=(x,y,z,w,h,d,m='dark')=>box(m,x,y,z,w,h,d);
 // Column shoes, fluted timber faces and stepped corbels beneath both cornices.
 for(const base of [3,8])for(const x of [-7,-3,2,6]){
  trim(x-.0625,base,6.0625,1.125,.1875,.1875);
  trim(x+.0625,base+3.0625,6.0625,.875,.1875,.25);
  for(const dx of [.125,.8125])trim(x+dx,base+.1875,6.0625,.0625,2.875,.125,'wood');
  for(let k=0;k<4;k++)trim(x+.3125-k*.0625,base+3.25+k*.125,6.125+k*.125,.375+k*.125,.125,.1875,'wood');
 }
 // Separate exterior lintels/sills and gathered curtains behind each open window.
 for(const y of [4,9])for(const x of [-5,3]){
  trim(x-.125,y-.125,6.0625,2.25,.125,.4375,'wood');
  trim(x-.125,y+2,6.0625,2.25,.1875,.25);
  for(const dx of [-.125,2])trim(x+dx,y,6.0625,.125,2,.1875,'wood');
  for(const dx of [.0625,1.6875]){
   for(let p=0;p<4;p++)trim(x+dx+p*.0625,y+.125,5.3125+(p%2)*.0625,.0625,1.75,.0625,'shutter');
   trim(x+dx,y+.75,5.4375,.25,.0625,.0625,'gold');
  }
  for(let p=0;p<8;p++)trim(x+p*.25,y+1.8125,5.3125,.25,.1875-(p%2)*.0625,.125,'shutter');
 }
 // Visible, stepped diagonal gable braces and a four-character hanging sign.
 for(let i=0;i<28;i++)for(const side of [-1,1])trim(side<0?-5.5+i*.125:4.375-i*.125,12.375+i*.09375,6.0625,.1875,.1875,.125,'wood');
 for(let i=0;i<4;i++)trim(-2+i,6.25,6.625,1,.75,.125,`sign${i}`);
 trim(-2.125,6.125,6.6875,4.25,.125,.125,'wood');trim(-2.125,7,6.6875,4.25,.125,.125,'wood');
 for(const x of [-2.125,2])trim(x,6.25,6.6875,.125,.75,.125,'wood');
 // Wainscot panels set off the walls; keep the entrance and stair route clear.
 for(const base of [3,8]){
  for(let z=-5;z<5;z++)for(const x of [-5.9375,5.875]){
   trim(x,base+.125,z+.0625,.0625,.875,.875,'plank');
   trim(x-.03125,base+1,z,.125,.125,1,'wood');
   for(const zz of [z+.0625,z+.875])trim(x-.03125,base+.125,zz,.125,.875,.0625,'wood');
  }
  for(let x=-6;x<6;x++)if(x<-1||x>=1){
   trim(x+.0625,base+.125,4.875,.875,.75,.0625,'plank');
   trim(x,base+.9375,4.8125,1,.125,.125,'wood');
  }
 }
 // Drawer divisions, ring pulls and brass bar footrail.
 for(let x=-5;x<3;x++){
  for(const y of [3.125,3.5,3.875])trim(x+.0625,y,-1.8125,.875,.0625,.0625,'wood');
  for(const yy of [3.3125,3.6875]){
   trim(x+.4375,yy,-1.75,.125,.0625,.0625,'bronze');
   trim(x+.375,yy-.125,-1.6875,.0625,.125,.0625,'bronze');
   trim(x+.5625,yy-.125,-1.6875,.0625,.125,.0625,'bronze');
   trim(x+.375,yy-.125,-1.6875,.25,.0625,.0625,'bronze');
  }
  trim(x,3.1875,-1.625,1,.0625,.0625,'bronze');
  if(x%2===0)trim(x+.5,3,-1.625,.0625,.1875,.0625,'bronze');
 }
 function teapot(x,y,z){
  trim(x+.0625,y,z+.0625,.375,.3125,.375,'ceramic');trim(x+.125,y+.3125,z+.125,.25,.0625,.25,'ceramic');
  trim(x+.1875,y+.375,z+.1875,.125,.0625,.125,'bronze');
  trim(x+.4375,y+.125,z+.125,.125,.125,.1875,'ceramic');trim(x+.5,y+.25,z+.125,.125,.125,.1875,'ceramic');
  for(const yy of [y+.0625,y+.25])trim(x-.125,yy,z+.125,.1875,.0625,.1875,'bronze');
  trim(x-.125,y+.0625,z+.125,.0625,.25,.1875,'bronze');
 }
 // A tray of tea, a partly-open ledger, a pencil and a latched cash box.
 trim(-4.375,4.125,-2.875,1.375,.0625,.75,'wood');
 for(const z of [-2.875,-2.1875])trim(-4.375,4.1875,z,1.375,.0625,.0625,'bronze');
 teapot(-4.125,4.1875,-2.8125);mug(-3.5,4.1875,-2.75);
 trim(-1.125,4.125,-2.875,.875,.0625,.625,'book');
 trim(-1.0625,4.1875,-2.8125,.3125,.0625,.5,'paper');trim(-.6875,4.1875,-2.8125,.3125,.125,.5,'paper');
 trim(-.1875,4.125,-2.625,.0625,.0625,.5,'gold');
 trim(.5,4.125,-2.875,.75,.375,.625,'wood');trim(.5,4.5,-2.875,.75,.0625,.625,'dark');
 trim(.8125,4.3125,-2.1875,.125,.1875,.0625,'bronze');
 bottle(1.625,4.125,-2.8125,'wine',true);mug(2.1875,4.125,-3.875);
 // Suspended stemware with separate feet, stems and open bowls.
 beam('wood',-4.75,5.6875,-3.75,5.5,.125,.25);
 for(const x of [-4.5,.5])trim(x,5.8125,-3.625,.0625,.9375,.0625,'bronze');
 for(let x=-4.5;x<.75;x+=.5){
  trim(x,5.5625,-3.625,.1875,.0625,.1875,'bronze');trim(x+.0625,5.375,-3.5625,.0625,.1875,.0625,'cream');
  for(const dx of [0,.1875])trim(x-.03125+dx,5.125,-3.65625,.0625,.25,.25,'ceramic');
  for(const dz of [0,.1875])trim(x+.03125,5.125,-3.65625+dz,.125,.25,.0625,'ceramic');
 }
 function frame(x,y,z,w,h,mat){
  trim(x,y,z,w,h,.0625,'dark');trim(x+.125,y+.125,z+.0625,w-.25,h-.25,.0625,mat);
  for(const yy of [y,y+h-.0625])trim(x,yy,z+.125,w,.0625,.0625,'gold');
  for(const xx of [x,x+w-.0625])trim(xx,y,z+.125,.0625,h,.0625,'gold');
 }
 frame(-2.5,6.125,-4.9375,1.25,.5,'paper');frame(-.5,9.5,-4.9375,1.5,1.125,'painting');
 // Mantel clock and candlesticks; a woven basket and folded blankets upstairs.
 trim(3.5,4.5,-3.875,.5,.625,.1875,'wood');trim(3.5625,4.6875,-3.625,.375,.3125,.0625,'paper');
 for(const x of [2.9375,4.75]){trim(x,4.5,-3.75,.1875,.0625,.1875,'bronze');trim(x+.0625,4.5625,-3.6875,.0625,.3125,.0625,'bronze');trim(x+.03125,4.875,-3.71875,.125,.25,.125,'cream');}
 for(let i=0;i<3;i++)trim(-5.5,8.75+i*.125,.25,.625,.125,.75,i%2?'shutter':'cloth');
 trim(-5.625,8,1.9375,.75,.5,.625,'plank');for(let i=0;i<5;i++)trim(-5.625+i*.15625,8.0625,2.5625,.0625,.375,.0625,'wood');
 // A few meaningful table details, leaving plenty of empty working surface.
 for(const [x,y,z]of [[-4.75,3,-.25],[-.5,3,.5],[-4.75,8,-2.5]]){
  trim(x+1.3125,y+1,z+.125,.1875,.0625,.3125,'paper');
  trim(x+.0625,y+1,z+.875,.3125,.0625,.0625,'bronze');
  trim(x+.5625,y+1.0625,z+.625,.1875,.1875,.1875,'pot');
  trim(x+.625,y+1.25,z+.6875,.0625,.125,.0625,'green');
 }
}
