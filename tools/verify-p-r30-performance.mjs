import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '@playwright/test';
import {cpus,totalmem} from 'node:os';
import {buildBR30NativeRoute} from './verify-b-r30-native-route.ts';
const [origin,out]=process.argv.slice(2);
const route=buildBR30NativeRoute(),rim=route.lip,road=route.points.find(p=>p.t>=.58),floor=route.floor;
const hardware=process.env.ZA22_HARDWARE==='1',production=process.env.P_PRODUCTION==='1';
const mobile=process.env.P_VIEWPORT==='mobile';
const [width,height]=(mobile?'390x844':process.env.P_VIEWPORT??'960x540').split('x').map(Number),dpr=Number(process.env.P_DPR??1);
assert.ok(Number.isInteger(width)&&width>=320&&Number.isInteger(height)&&height>=240&&Number.isFinite(dpr)&&dpr>0&&dpr<=2,'Invalid profile viewport or DPR');
assert.ok(['smooth','balanced','fine'].includes(process.env.P_QUALITY??'smooth'),'Invalid explicit quality');
const report={scope:production?'normal production gates; render-only camera probes explicitly marked; no state overrides or player-pose write':'production town-preview normal entry; paired render-only camera probes explicitly marked; no player-pose write; same browser/raster/quality',production,hardwareRequested:hardware,cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryGB:totalmem()/1024**3,viewport:{width,height},deviceScaleFactor:dpr,quality:process.env.P_QUALITY??'smooth',samples:[],errors:[],startup:[],movement:[]};
let browser,page;
const vec=p=>[p.east,p.height+1.65,-p.north];
const target=[route.anchor.east,route.anchor.rimHeight-24,-route.anchor.north];
async function sample(id,enabled,camera,move=false,crosslineProbe=false,p2Enabled=enabled,p3Enabled=p2Enabled,globalLights=production?true:p3Enabled,smallInstances=true,coalesceInstances=true,propBatches=true){
 await page.evaluate(d=>document.dispatchEvent(new CustomEvent('town-p1-perf-control',{detail:d})),{enabled,camera,crosslineProbe,p2Enabled,p3Enabled,globalLights,smallInstances,coalesceInstances,propBatches});
 await page.evaluate(()=>new Promise(resolve=>{let n=0;const start=performance.now();function f(t){if(++n>=10||t-start>9000)resolve();else requestAnimationFrame(f);}requestAnimationFrame(f);}));
 let touch;
 const startPose=move?await page.locator('#position').textContent():undefined;
 if(move==='touch'){
  const pad=await page.locator('#touch-walk').boundingBox();assert.ok(pad,'Production touch walk pad missing');
  touch=await page.context().newCDPSession(page);const x=pad.x+pad.width/2,y=pad.y+pad.height/2;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-42}]});
 }else if(move)await page.keyboard.down('w');
 let result;
 try{result=await page.evaluate(()=>new Promise(resolve=>{
   const rows=[],frames=[],gaps=[],long=[],start=performance.now();let prev;
   const listener=e=>rows.push(e.detail),frame=e=>frames.push(e.detail);
   const observer=new PerformanceObserver(l=>long.push(...l.getEntries().map(x=>x.duration)));try{observer.observe({entryTypes:['longtask']})}catch{}
   document.addEventListener('town-p1-render-profile',listener);
   document.addEventListener('town-frame-profile',frame,true);
   function tick(t){if(prev!==undefined)gaps.push(t-prev);prev=t;if(t-start<5000||(gaps.length<40&&t-start<14000)){requestAnimationFrame(tick);return;}
    document.removeEventListener('town-p1-render-profile',listener);document.removeEventListener('town-frame-profile',frame,true);observer.disconnect();
    resolve({duration:t-start,rows,frames,gaps,long,position:document.querySelector('#position')?.textContent,lighting:document.querySelector('#lighting')?.textContent});}
   requestAnimationFrame(tick);
 }));}finally{if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();}else if(move)await page.keyboard.up('w');}
 if(move==='touch'){
  const coords=s=>{const m=/东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/.exec(s??'');assert.ok(m,'Missing actual player HUD');return [+m[1],+m[2]];};
  const a=coords(startPose),b=coords(result.position);assert.ok(Math.hypot(b[0]-a[0],b[1]-a[1])>.5,'Native touch did not move');
  report.movement.push({mode:'native touch',start:a,end:b});
 }
 const stats=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?{n:a.length,median:a[Math.floor((a.length-1)*.5)],p95:a[Math.max(0,Math.ceil(a.length*.95)-1)],max:a.at(-1)}:null;};
 const get=k=>stats(result.rows.map(x=>x[k])),viewer=k=>stats(result.frames.map(x=>x[k]));
 assert.ok(result.rows.length>0&&result.frames.length>0,'Missing actual render or viewer profile');
 const row={id,enabled,crosslineProbe,p2Enabled,p3Enabled,globalLights,smallInstances,coalesceInstances,propBatches,propSavedDraws:stats(result.rows.map(x=>x.props?.savedDraws)),coalescedDraws:stats(result.rows.map(x=>x.coalesced?.savedDraws)),smallInstanceCulled:get('smallInstanceCulled'),probe:!!camera,move,position:result.position,lighting:result.lighting,frames:result.gaps.length,duration:result.duration,fps:1000*result.gaps.length/result.duration,frameMs:stats(result.gaps),draws:get('draws'),tris:get('tris'),renderCpuMs:get('renderCpuMs'),gpuMs:get('gpuMs'),excludedLights:get('excludedLights'),geometries:get('geometries'),textures:get('textures'),movementMs:viewer('movementMs'),weatherMs:viewer('weatherMs'),detailMs:viewer('detailMs'),longTasks:stats(result.long),renderer:result.rows.at(-1),p95Reliable:result.gaps.length>=40};
 report.samples.push({...row,raw:result});console.log(JSON.stringify(row));await writeFile(join(out,'p1-performance.json'),JSON.stringify(report,null,2));
}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:hardware?['--use-gl=angle','--use-angle=d3d11']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 report.browser=browser.version();const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:dpr,locale:'zh-CN',isMobile:mobile,hasTouch:mobile});page=await context.newPage();
 await page.addInitScript(quality=>{Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined});localStorage.setItem('unwritten.quality.tier.v1',quality);window.__pStartup=[];document.addEventListener('town-p1-render-profile',e=>{window.__pLatest=e.detail;if(window.__pStartup.length<150)window.__pStartup.push(e.detail)});},report.quality);
 page.on('pageerror',e=>report.errors.push('page:'+e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push('console:'+m.text())});page.on('response',r=>{if(r.status()>=400)report.errors.push('http:'+r.status()+':'+r.url())});
 const begin=Date.now();await page.goto(new URL(production?'/?profile&pPerfMeasure'+(process.env.P_COALESCE_AB==='1'?'&pCoalesceCandidate':''):'/?profile&pPerfCompare',origin).href,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>document.querySelector('#town-entry')?.hidden===true||document.querySelector('#town-entry-continue')?.hidden===false||document.querySelector('#town-entry-error')?.hidden===false,{timeout:90000});
 assert.notEqual(await page.locator('#town-entry-error').evaluate(x=>x.hidden),false,'entry error');
 if(await page.locator('#town-entry-continue').isVisible())await page.locator('#town-entry-continue').click();
 await page.locator('#scene canvas').waitFor({state:'visible',timeout:90000});
 await page.waitForFunction(()=>window.__pStartup.length>5,{timeout:60000});
 report.startup=await page.evaluate(()=>({samples:window.__pStartup,elapsed:performance.now(),resources:performance.getEntriesByType('resource').length,canvas:[document.querySelector('#scene canvas').width,document.querySelector('#scene canvas').height]}));report.startup.wallMs=Date.now()-begin;
 report.gpu=await page.evaluate(()=>{const gl=document.querySelector('#scene canvas').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?{vendor:gl.getParameter(e.UNMASKED_VENDOR_WEBGL),renderer:gl.getParameter(e.UNMASKED_RENDERER_WEBGL)}:null;});
 console.log(JSON.stringify({phase:'startup',gpu:report.gpu,cpu:report.cpu,wallMs:report.startup.wallMs,canvas:report.startup.canvas}));
 const p3=process.env.P3_COMPARE==='1',p2=p3||process.env.P2_COMPARE==='1';
 const floorOnly=process.env.P1_SCOPE==='floor';
 if(production){await page.waitForFunction(()=>window.__pLatest?.pendingCells===0&&(window.__pLatest?.pendingOcclusionBounds??0)===0&&(window.__pLatest?.pendingCoalesced??0)===0&&(window.__pLatest?.pendingProps??0)===0,{timeout:60000}).catch(()=>{report.warmupWarning='Cell or occlusion-bound warmup did not report zero in sampling window';});}
 const lightAB=production&&process.env.P_LIGHT_AB==='1',smallAB=production&&process.env.P_SMALL_INSTANCE_AB==='1',coalesceAB=production&&process.env.P_COALESCE_AB==='1',propAB=production&&process.env.P_PROP_AB==='1';
 assert.ok(Number(lightAB)+Number(smallAB)+Number(coalesceAB)+Number(propAB)<=1,'Isolate only one optimization in the paired run');
 if(!floorOnly){if(!production)await sample('plaza',p2,undefined,false,false,false);if(lightAB)await sample('plaza',true,undefined,false,false,true,true,false);if(coalesceAB)await sample('plaza-coalesce-off',true,undefined,false,false,true,true,true,true,false);if(propAB)await sample('plaza-prop-off',true,undefined,false,false,true,true,true,true,true,false);await sample('plaza',true);}
 await page.locator('#town-panel-toggle').click();await page.locator('#jump').selectOption({label:'陨石坑口'});if(await page.locator('#town-settings').evaluate(d=>d.open))await page.locator('#town-settings-close').click();
 await page.waitForFunction(()=>{const t=document.querySelector('#position')?.textContent??'',m=/东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/.exec(t);return m&&Math.hypot(+m[1]-2,+m[2]-159)<1.2},{timeout:45000});
 for(const [id,p]of ((coalesceAB||propAB)?[['rim-outward',rim],['floor',floor]]:[['rim',rim],['haul',road],['floor',floor]])){
  if(floorOnly&&id!=='floor')continue;
  const camera={position:vec(p),target:id==='rim-outward'?[224,12,-188]:id==='floor'?[route.anchor.east,route.anchor.rimHeight-35+1.4,-route.anchor.north]:target};
  if(!production){await sample(id,p2,camera,false,false,false);await page.screenshot({path:join(out,id+'-baseline.png'),timeout:20000});}if(lightAB)await sample(id,true,camera,false,false,true,true,false);if(smallAB)await sample(id+'-small-off',true,camera,false,false,true,true,true,false);if(coalesceAB)await sample(id+'-coalesce-off',true,camera,false,false,true,true,true,true,false);if(propAB)await sample(id+'-prop-off',true,camera,false,false,true,true,true,true,true,false);await sample(id,true,camera);if(smallAB){await sample(id+'-small-off-repeat',true,camera,false,false,true,true,true,false);await sample(id+'-small-on-repeat',true,camera);}
  await page.screenshot({path:join(out,id+'-optimized.png'),timeout:20000});
  if(id==='floor'&&!production){
    if(p2&&!p3){await sample(id,true,camera,false,true,false);await page.screenshot({path:join(out,id+'-crossline-p1.png'),timeout:20000});}
    if(p3){await sample(id,true,camera,false,true,true,false);await page.screenshot({path:join(out,id+'-crossline-p2.png'),timeout:20000});}
    await sample(id,true,camera,false,true);await page.screenshot({path:join(out,id+'-crossline-probe.png'),timeout:20000});
  }
 }
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('town-p1-perf-control',{detail:{enabled:true}})));
 if(!floorOnly){
  if(mobile)await sample('actual-mouth-touch',true,undefined,'touch');
  else{await page.locator('#scene canvas').click({position:{x:Math.round(width*.44),y:Math.round(height*.5)}});await sample('actual-mouth-movement',true,undefined,true);}
 }
 report.complete=true;
}catch(e){report.failure=e.stack??String(e);process.exitCode=1;console.log(report.failure);}
finally{await writeFile(join(out,'p1-performance.json'),JSON.stringify(report,null,2));await browser?.close();}
