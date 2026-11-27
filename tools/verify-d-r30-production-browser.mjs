import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {existsSync} from 'node:fs';
import {createServer,preview} from 'vite';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {chromium} from 'playwright';
const root=resolve('.'),out=resolve(process.argv[2]??'.evidence/d-r30-m1');
await mkdir(out,{recursive:true});
let server,browser,page,failure,presence;
const frames=[],errors=[],mobileResults=[],roadWalk=[];
const longRoad=process.argv.includes('--long-road');
const buildPath=process.argv[3]?resolve(process.argv[3]):undefined;
let received=0,sent=0;
try{
 if(buildPath){
  const compiled=join(out,'presence-server');
  execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.server.json','--outDir',compiled],{cwd:root,stdio:'inherit'});
  presence=spawn(process.execPath,[join(compiled,'presence/index.js')],{cwd:root,windowsHide:true,env:{...process.env,
    NODE_ENV:'production',PRESENCE_HOST:'127.0.0.1',PRESENCE_PORT:'0',
    TOWN_NIGHT_BEACON_RECEIPT:join(out,'night.json'),TOWN_WEATHER_WARNING_RECEIPT:join(out,'weather.json')},stdio:['ignore','pipe','pipe']});
  const port=await new Promise((ok,fail)=>{
   const timer=setTimeout(()=>fail(Error('Presence startup timeout')),20000);
   presence.once('exit',code=>{clearTimeout(timer);fail(Error('Presence exit '+code))});
   let buffer='';
   presence.stdout.on('data',chunk=>{buffer+=chunk;const match=buffer.match(/Town presence listening on (\d+)/);if(match){clearTimeout(timer);ok(Number(match[1]))}});
   presence.stderr.on('data',chunk=>console.error(String(chunk)));
  });
  server=await preview({root:join(root,'tools/voxel-tavern'),configFile:join(root,'tools/voxel-tavern/vite.config.ts'),mode:'town-preview',build:{outDir:buildPath},logLevel:'error',plugins:[{name:'m1-local-preview-health',configurePreviewServer(s){s.middlewares.use((req,res,next)=>{const p=new URL(req.url,'http://localhost').pathname;if(p==='/healthz'){res.setHeader('Cache-Control','no-store');res.end('town-preview local');return}if(p==='/favicon.ico'&&!existsSync(join(buildPath,'favicon.ico'))){res.statusCode=204;res.end();return}next()})}}],
    preview:{host:'127.0.0.1',port:0,proxy:{'/presence':{target:'http://127.0.0.1:'+port,ws:true}}}});
 }else{
  server=await createServer({root:join(root,'tools/voxel-tavern'),mode:'town-preview',configFile:join(root,'tools/voxel-tavern/vite.config.ts'),cacheDir:join(out,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}}});
  await server.listen();
 }
 const chrome=process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:'C:/Program Files/Google/Chrome/Application/chrome.exe');
 browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-gl=angle','--use-angle=d3d11']});
 page=await browser.newPage({viewport:{width:1140,height:700},deviceScaleFactor:.8,locale:'zh-CN'});
 await page.addInitScript(()=>{
  Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined});
  localStorage.setItem('unwritten.quality.tier.v1','smooth');
  document.addEventListener('town-frame-profile',e=>{window.__m1Frame=e.detail},true);
 });
 page.on('websocket',ws=>{if(ws.url().includes('/presence')){ws.on('framereceived',()=>received++);ws.on('framesent',()=>sent++)}});
 page.on('pageerror',e=>errors.push('page:'+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('console:'+m.text()+' '+m.location().url)});
 page.on('response',r=>{if(r.status()>=400)errors.push('http:'+r.status()+':'+r.url())});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/town-blockout.html?profile'+(longRoad?'&mRoadSurvey':''),{waitUntil:'domcontentloaded',timeout:65000});
 await page.waitForFunction(()=>document.querySelector('#town-entry')?.hidden||!document.querySelector('#town-entry-continue')?.hidden||!document.querySelector('#town-entry-error')?.hidden,null,{timeout:60000});
 if(await page.locator('#town-entry-error').isVisible())throw Error('Entry failed: '+await page.locator('#town-entry-error').innerText());
 if(await page.locator('#town-entry-continue').isVisible())await page.locator('#town-entry-continue').click();
 await page.waitForFunction(()=>window.__m1Frame?.ridge?.changed>100000&&document.querySelector('#town-entry')?.hidden,null,{timeout:65000});
 const snap=async(name)=>{
  await page.waitForTimeout(450);
  const state=await page.evaluate(()=>({position:document.querySelector('#position')?.textContent,day:document.querySelector('#lighting')?.textContent,frame:window.__m1Frame}));
  assert.ok(state.frame.calls>0&&state.frame.ridge.roads===3);
  assert.ok(state.frame.craterPerf.exteriorCertified&&state.frame.ridge.terraceMounted&&state.frame.ridge.cloudSeam.physicalReady);
  assert.equal(state.frame.ridge.cloudSeam.domainReady,false);
  assert.equal(state.frame.craterPerf.undergroundVisible,false);
  assert.ok(Math.abs(state.frame.ridge.foot[2]-(state.frame.ridge.support??state.frame.ridge.surface))<.5,'feet and actual physical support agree');
  await page.screenshot({path:join(out,name+'.png')});frames.push({name,...state});console.log('M1',JSON.stringify({name,position:state.position,ridge:{...state.frame.ridge,roadGuide:undefined},calls:state.frame.calls,triangles:state.frame.triangles}));
 };
 const day=async()=>{
  await page.locator('#town-panel-toggle').click();await page.locator('#lighting').click();await page.locator('#town-settings-close').click();
 };
 const go=async(label,e,n)=>{
  await page.locator('#town-panel-toggle').click();await page.locator('#jump').selectOption({label});
  if(await page.locator('#town-settings-close').isVisible())await page.locator('#town-settings-close').click();
  await page.waitForFunction(([e,n])=>{const f=window.__m1Frame?.ridge?.foot;return f&&Math.hypot(f[0]-e,f[1]-n)<12},[e,n],{timeout:12000});
 };
 await snap('spawn-night');await day();await snap('spawn-day');
 await go('山口',290,300);await snap('mountain-foot-day');await day();await snap('mountain-foot-night');await day();
 await go('山口站',296,520);await snap('west-side-day');await day();await snap('west-side-night');await day();
 // Normal keyboard locomotion, not synthetic camera position injection.
 const before=await page.evaluate(()=>window.__m1Frame.ridge.foot);
 await page.keyboard.down('w');await page.waitForTimeout(1800);await page.keyboard.up('w');
 const after=await page.evaluate(()=>window.__m1Frame.ridge.foot);
 if(Math.hypot(after[0]-before[0],after[1]-before[1])<.5){
  await page.keyboard.down('s');await page.waitForTimeout(1800);await page.keyboard.up('s');
 }
 await snap('west-side-walk');
 const last=frames.at(-1).frame.ridge.foot;assert.ok(Math.hypot(last[0]-before[0],last[1]-before[1])>.5,'normal player moved');
 await go('火车站',526,305);await snap('east-side-station-day');await day();await snap('east-side-station-night');await day();
 const travel=async(key,condition)=>{
  await page.keyboard.down(key);
  try{await page.waitForFunction(condition,null,{timeout:14000})}finally{await page.keyboard.up(key)}
 };
 await travel('w',()=>window.__m1Frame.ridge.foot[1]>=349.5);
 await snap('cable-dock-day');
 const dock=frames.at(-1).frame.ridge;assert.ok(dock.cableMounted&&Math.abs(dock.foot[2]-26)<.06&&dock.foot[2]-dock.surface>1);
 await day();await snap('cable-dock-night');
 await travel('w',()=>window.__m1Frame.ridge.foot[1]>=354.8);
 await travel('a',()=>window.__m1Frame.ridge.foot[0]<=516.5);
 await snap('native-dock-to-ground-road');
 const road=frames.at(-1).frame.ridge;assert.ok(Math.abs(road.foot[2]-road.surface)<.12);
 if(longRoad){
  const path=await page.evaluate(()=>window.__m1Frame.ridge.roadGuide);
  assert.ok(path.at(-1).cum>280);
  const project=f=>{
   let best={dist:Infinity,cum:0};
   for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b.east-a.east,dn=b.north-a.north,s=dx*dx+dn*dn;
    if(!s)continue;
    const t=Math.max(0,Math.min(1,((f[0]-a.east)*dx+(f[1]-a.north)*dn)/s));
    const dist=Math.hypot(f[0]-a.east-dx*t,f[1]-a.north-dn*t);
    if(dist<best.dist)best={dist,cum:a.cum+(b.cum-a.cum)*t};
   }return best;
  };
  const at=m=>{
   const i=Math.max(1,path.findIndex(p=>p.cum>=m));const a=path[i-1],b=path[i],t=(m-a.cum)/(b.cum-a.cum);
   return [a.east+(b.east-a.east)*t,a.north+(b.north-a.north)*t];
  };
  const canvas=await page.locator('#scene canvas').boundingBox(),cx=canvas.x+canvas.width*.5,cy=canvas.y+canvas.height*.46;
  async function steer(delta){
   while(Math.abs(delta)>.018){
    const px=Math.sign(delta)*Math.min(380,Math.round(Math.abs(delta)/.003));
    if(Math.abs(px)<6)break;
    await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+px,cy);await page.mouse.up();delta-=px*.003;
   }
  }
  const total=path.at(-1).cum;
  async function follow(direction,target){
   const begin=Date.now();let lastProgress=-Infinity,stalled=0;
   for(let k=0;k<1300;k++){
    const r=await page.evaluate(()=>window.__m1Frame.ridge),p=project(r.foot);
    roadWalk.push({direction,cum:p.cum,dist:p.dist,foot:r.foot,surface:r.surface,moveReject:r.moveReject});
    if(p.dist>1.35||Math.abs(r.foot[2]-r.surface)>.12)throw Error('road deviation '+JSON.stringify(roadWalk.at(-1)));
    if(direction*(p.cum-target)>=-.45){console.log('long road checkpoint',JSON.stringify({direction,cum:p.cum,foot:r.foot,seconds:(Date.now()-begin)/1000}));return;}
    if(direction*p.cum>lastProgress+.1){lastProgress=direction*p.cum;stalled=0;}else if(++stalled>14)throw Error('road movement stalled '+JSON.stringify(roadWalk.at(-1)));
    const aim=at(Math.min(total,Math.max(0,p.cum+direction*2.2)));
    const heading=Math.atan2(aim[0]-r.foot[0],aim[1]-r.foot[1]);
    await steer(Math.atan2(Math.sin(heading-r.heading),Math.cos(heading-r.heading)));
    await page.keyboard.down('w');try{await page.waitForTimeout(Math.min(210,Math.max(65,Math.abs(target-p.cum)*90)))}finally{await page.keyboard.up('w')}
    if(k%40===0)console.log('long road progress',JSON.stringify(roadWalk.at(-1)));
   }
   throw Error('long road input budget');
  }
  await follow(1,total);await snap('long-road-end');await follow(-1,5.5);await snap('long-road-return');
  const r=await page.evaluate(()=>window.__m1Frame.ridge);
  await steer(Math.atan2(Math.sin(-r.heading),Math.cos(-r.heading)));
 }
 await travel('d',()=>window.__m1Frame.ridge.foot[0]>=525.9);
 await snap('native-ground-road-to-dock');
 await travel('s',()=>window.__m1Frame.ridge.foot[1]<=306);
 await snap('station-dock-return');
 await go('陨石坑口',2,159);await snap('crater-mouth-production');
 const samples=await page.evaluate(()=>new Promise(resolve=>{const times=[],draws=[],tris=[];let prior,start;function tick(t){start??=t;if(prior!==undefined)times.push(t-prior);prior=t;if(window.__m1Frame){draws.push(window.__m1Frame.calls);tris.push(window.__m1Frame.triangles)}if(t-start<3500){requestAnimationFrame(tick);return}const q=(a,p)=>a.sort((x,y)=>x-y)[Math.max(0,Math.ceil(a.length*p)-1)];const gl=document.querySelector('#scene canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');resolve({frames:times.length,p95:q(times,.95),median:q(times,.5),fps:times.length*1000/(t-start),draws:q(draws,.5),triangles:q(tris,.5),gpu:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)});}requestAnimationFrame(tick)}));
 console.log('normal crater mouth frame samples',JSON.stringify(samples));frames.at(-1).timing=samples;
 if(process.argv.includes('--mobile')&&buildPath){
  await go('火车站',526,305);
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN'});
  const phone=await context.newPage();let mSent=0,mReceived=0;
  await phone.addInitScript(()=>{Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined});localStorage.setItem('unwritten.quality.tier.v1','smooth');document.addEventListener('town-frame-profile',e=>window.__m1Frame=e.detail,true)});
  phone.on('pageerror',e=>errors.push('mobile page:'+e.message));
  phone.on('console',m=>{if(m.type()==='error')errors.push('mobile console:'+m.text())});
  phone.on('response',r=>{if(r.status()>=400)errors.push('mobile http:'+r.status()+':'+r.url())});
  phone.on('websocket',ws=>{if(ws.url().includes('/presence')){ws.on('framereceived',()=>mReceived++);ws.on('framesent',()=>mSent++)}});
  await phone.goto('http://127.0.0.1:'+server.httpServer.address().port+'/town-blockout.html?profile',{waitUntil:'domcontentloaded',timeout:65000});
  await phone.waitForFunction(()=>document.querySelector('#town-entry')?.hidden||!document.querySelector('#town-entry-continue')?.hidden||!document.querySelector('#town-entry-error')?.hidden,null,{timeout:60000});
  if(await phone.locator('#town-entry-error').isVisible())throw Error('mobile entry error');
  if(await phone.locator('#town-entry-continue').isVisible())await phone.locator('#town-entry-continue').tap();
  await phone.waitForFunction(()=>window.__m1Frame?.ridge?.terraceMounted&&document.querySelector('#town-entry')?.hidden,null,{timeout:60000});
  await phone.locator('#town-panel-toggle').tap();await phone.locator('#jump').selectOption({label:'火车站'});if(await phone.locator('#town-settings-close').isVisible())await phone.locator('#town-settings-close').tap();
  await phone.waitForFunction(()=>{const f=window.__m1Frame?.ridge?.foot;return f&&Math.hypot(f[0]-526,f[1]-305)<2},null,{timeout:12000});
  await page.waitForFunction(()=>document.querySelector('#town-presence-status')?.textContent?.includes('2 人'),null,{timeout:20000});
  await phone.waitForFunction(()=>document.querySelector('#town-presence-status')?.textContent?.includes('2 人'),null,{timeout:20000});
  const start=await phone.evaluate(()=>window.__m1Frame.ridge.foot);
  const pad=await phone.locator('#touch-walk').boundingBox();assert.ok(pad);
  const cdp=await context.newCDPSession(phone),px=pad.x+pad.width/2,py=pad.y+pad.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px,y:py}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px,y:py-42}]});
  await phone.waitForTimeout(1700);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const end=await phone.evaluate(()=>window.__m1Frame.ridge.foot);
  assert.ok(Math.hypot(end[0]-start[0],end[1]-start[1])>.5,'mobile native touch moved');
  await phone.screenshot({path:join(out,'mobile-touch-station.png')});
  const dual={start,end,mSent,mReceived,desktopStatus:await page.locator('#town-presence-status').textContent(),mobileStatus:await phone.locator('#town-presence-status').textContent()};assert.ok(mSent>0&&mReceived>0);mobileResults.push(dual);console.log('mobile dual',JSON.stringify(dual));await context.close();
 }
 assert.equal(errors.filter(e=>e.startsWith('page:')).length,0);
 if(buildPath){assert.ok(received>0&&sent>0,'real Presence bidirectional WS required');assert.equal(errors.length,0);}
}catch(e){failure=String(e);console.error(failure)}
finally{
 await browser?.close();await server?.close();
 if(presence&&presence.exitCode===null){presence.kill();await Promise.race([once(presence,'exit'),new Promise(r=>setTimeout(r,3000))])}
 const report={passed:!failure,frames,mobileResults,roadWalk,errors,failure,realPresence:!!buildPath&&received>0&&sent>0,received,sent,scope:'normal town entry; menu locations and native keyboard movement; not full mountain traversal'};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,frames:frames.length,realPresence:report.realPresence,received,sent,errors:errors.slice(0,10),failure}));
 if(failure)process.exitCode=1;
}
