import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {existsSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=resolve('.'),out=resolve(process.argv[2]??'.evidence/d-r30-m1');
await mkdir(out,{recursive:true});
let server,browser,page,failure;
const frames=[],errors=[];
try{
 server=await createServer({root:join(root,'tools/voxel-tavern'),configFile:join(root,'tools/voxel-tavern/vite.config.ts'),cacheDir:join(out,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}}});
 await server.listen();
 const chrome=process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:'C:/Program Files/Google/Chrome/Application/chrome.exe');
 browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-gl=angle','--use-angle=d3d11']});
 page=await browser.newPage({viewport:{width:1140,height:700},deviceScaleFactor:.8,locale:'zh-CN'});
 await page.addInitScript(()=>{
  Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined});
  localStorage.setItem('unwritten.quality.tier.v1','smooth');
  document.addEventListener('town-frame-profile',e=>{window.__m1Frame=e.detail},true);
 });
 page.on('pageerror',e=>errors.push('page:'+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('console:'+m.text())});
 page.on('response',r=>{if(r.status()>=400)errors.push('http:'+r.status()+':'+r.url())});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/town-blockout.html?profile',{waitUntil:'domcontentloaded',timeout:65000});
 await page.waitForFunction(()=>document.querySelector('#town-entry')?.hidden||!document.querySelector('#town-entry-continue')?.hidden||!document.querySelector('#town-entry-error')?.hidden,null,{timeout:60000});
 if(await page.locator('#town-entry-error').isVisible())throw Error('Entry failed: '+await page.locator('#town-entry-error').innerText());
 if(await page.locator('#town-entry-continue').isVisible())await page.locator('#town-entry-continue').click();
 await page.waitForFunction(()=>window.__m1Frame?.ridge?.changed>100000&&document.querySelector('#town-entry')?.hidden,null,{timeout:65000});
 const snap=async(name)=>{
  await page.waitForTimeout(450);
  const state=await page.evaluate(()=>({position:document.querySelector('#position')?.textContent,day:document.querySelector('#lighting')?.textContent,frame:window.__m1Frame}));
  assert.ok(state.frame.calls>0&&state.frame.ridge.roads===2);
  assert.ok(Math.abs(state.frame.ridge.foot[2]-state.frame.ridge.surface)<.5,'feet and actual ridge surface agree');
  await page.screenshot({path:join(out,name+'.png')});frames.push({name,...state});console.log('M1',JSON.stringify({name,position:state.position,ridge:state.frame.ridge,calls:state.frame.calls,triangles:state.frame.triangles}));
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
 await go('火车站',526,305);await snap('east-side-station-day');await day();await snap('east-side-station-night');
 assert.equal(errors.filter(e=>e.startsWith('page:')).length,0);
}catch(e){failure=String(e);console.error(failure)}
finally{
 await browser?.close();await server?.close();
 const report={passed:!failure,frames,errors,failure,realPresence:false,scope:'normal town entry; menu locations and native keyboard movement; not full mountain traversal'};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,frames:frames.length,errors:errors.slice(0,10),failure}));
 if(failure)process.exitCode=1;
}
