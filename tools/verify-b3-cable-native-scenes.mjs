/**
 * B-3 cable station native player scene smoke; no shadow state, no simulated
 * repair, no synthetic camera coordinates, and no production viewer edits.
 * A mountain-site screenshot via location chooser is not proof of a cable ride.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';
const [project,evidence]=process.argv.slice(2);
assert.ok(project&&evidence);
const root=path.resolve(project),out=path.resolve(evidence);
assert.match(out,/^[dD]:[/\\]/);
await mkdir(out,{recursive:true});
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const chrome=process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:
 'C:/Program Files/Google/Chrome/Application/chrome.exe');
let server,browser,context,page,failure;
const errors=[],screens=[],walk=[];
async function coords() {
 const hud=await page.locator('#position').innerText();
 const m=hud.match(/东\s*(-?\d+(?:\.\d+)?)\s*m\s*·\s*北\s*(-?\d+(?:\.\d+)?)/);
 return {hud,east:m?Number(m[1]):null,north:m?Number(m[2]):null};
}
async function setLight(day) {
 const current=(await page.locator('#lighting').innerText()).includes('白昼');
 if(current===day)return;
 await page.locator('#town-panel-toggle').click();
 await page.locator('#lighting').click();
 await page.locator('#town-settings-close').click();
}
async function capture(name,kind,phase){
 await page.waitForTimeout(1100);
 const p=await coords();
 const profile=await page.evaluate(()=>window.__b3frames?.slice(-8)??[]);
 const median=vals=>vals.sort((a,b)=>a-b)[Math.floor(vals.length/2)]??null;
 const record={name,kind,phase,position:p,profile:profile.length?{
  calls:median(profile.map(x=>x.calls)),triangles:median(profile.map(x=>x.triangles)),
  cameraY:profile.at(-1)?.cameraY??null}:null,
  screenshot:name+'.png'};
 if(!record.profile)throw Error('missing actual viewer renderer profile');
 await page.screenshot({path:path.join(out,name+'.png')});
 screens.push(record);
 return record;
}
async function choose(label){
 await page.locator('#town-panel-toggle').click();
 await page.locator('#jump').selectOption({label});
 await page.waitForTimeout(1100);
 return await coords();
}
try{
 server=await createServer({root:path.join(root,'tools','voxel-tavern'),
 configFile:path.join(root,'tools','voxel-tavern','vite.config.ts'),
 cacheDir:path.join(out,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},
 logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}}});
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:chrome,args:process.platform==='win32'?
 ['--use-gl=angle','--use-angle=d3d11']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 context=await browser.newContext({viewport:{width:1140,height:700},deviceScaleFactor:.7,locale:'zh-CN'});
 page=await context.newPage();
 await page.addInitScript(()=>{
  Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined});
  localStorage.setItem('unwritten.quality.tier.v1','smooth');
  window.__b3frames=[];
  document.addEventListener('town-frame-profile',e=>{
   window.__b3frames.push(e.detail);
   if(window.__b3frames.length>40)window.__b3frames.shift();
  },true);
 });
 page.on('pageerror',e=>errors.push('page:'+e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push('http:'+r.status()+':'+r.url())});
 const port=server.httpServer.address().port;
 assert.equal((await page.goto('http://127.0.0.1:'+port+'/town-blockout.html?profile',
 {waitUntil:'domcontentloaded',timeout:65000})).status(),200);
 await page.waitForFunction(()=>document.querySelector('#town-entry')?.hidden===true,{timeout:90000});
 await page.waitForFunction(()=>document.querySelector('#position')?.textContent.includes('东 '),{timeout:90000});
 const train=await choose('火车站');
 await setLight(true);
 const before=await coords();
 // Train arrival selector faces the train platforms. A native mouse drag
 // rotates to north: use a real keyboard W segment and report its outcome.
 await page.keyboard.down('w'); await page.waitForTimeout(2400); await page.keyboard.up('w');
 const after=await coords();
 walk.push({label:'from-train-station-toward-cable-base',train,before,after,
  movedMetres:before.east===null?null:Math.hypot(after.east-before.east,after.north-before.north)});
 await capture('cable-base-approach-day','native train stop + W walking, NOT necessarily repair trigger','day');
 await setLight(false);
 await capture('cable-base-approach-night','same physical player position','night');
 // Native built-in chooser changes domain: a real mounted mountain scene,
 // but not a verified cable boarding trip. Record it as site-only evidence.
 const summit=await choose('星港坪');
 await setLight(false);
 await capture('cable-upper-terrain-night','native chooser summit domain, NOT full-line ride','night');
 await setLight(true);
 await capture('cable-upper-terrain-day','native chooser summit domain, NOT full-line ride','day');
 walk.push({label:'summit-choice',summit,meaning:'scene handoff, not cable travel'});
}catch(e){failure=String(e?.stack??e)}
finally{
 const cleanup=[];
 for(const [name,close] of [['page',()=>page?.close()],['context',()=>context?.close()],
  ['browser',()=>browser?.close()],['server',()=>server?.close()]]) {
  try{await close()}catch(e){cleanup.push(name+':'+String(e))}
 }
 const result={passed:!failure&&!cleanup.length,kind:'native default town scene screenshot partial only',
  fullLineTravelPassed:false,nightDenyObserved:false,threePhysicalFaultsWalked:false,
  missing:['walk base/mid/summit stations from ground, no chooser','3 faults physical E sequence',
  'dormant->one-station->repaired full-line live route','both cable lines day up/down and night locked'],
  screens,walk,errors,failure,cleanup};
 await writeFile(path.join(out,'b3-cable-native-scene-report.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({passed:result.passed,screens:screens.map(s=>({name:s.name,at:s.position,
  calls:s.profile.calls,triangles:s.profile.triangles})),walk,errors:errors.slice(0,7),failure,cleanup}));
 if(!result.passed)process.exitCode=1;
}
