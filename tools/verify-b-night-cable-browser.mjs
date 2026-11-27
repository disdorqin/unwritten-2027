import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createPresenceServer} from '../src/presence/server.ts';
import {createCableLineAuthority} from '../src/presence/cable-line-authority.ts';
import {createOrdinaryTownNightSchedule} from '../src/shared/town-night-window.ts';
import {summitPresenceBounds} from '../src/shared/za22-summit-presence-domain.ts';
const repo=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.argv[2]??'');
assert.ok(process.argv[2]&&/^[dD]:[/\\]/.test(out)&&!existsSync(out),'Fresh D-drive evidence directory required');await mkdir(out,{recursive:true});
const require=createRequire(path.join(repo,'package.json')),{chromium}=require('playwright'),root=path.join(repo,'tools','voxel-tavern');
const {createServer}=await import(pathToFileURL(createRequire(path.join(root,'package.json')).resolve('vite')).href);
const epoch=Date.UTC(2026,0,1),scheduleAt=createOrdinaryTownNightSchedule({dawnEpoch:epoch,beaconOffsetsAfterDusk:Array(12).fill(50000),cueFreshnessMs:60000});
let clock=epoch,web,browser,town,summit,failure;const errors=[],results=[];
const wallNow=()=>clock;
const auth=createCableLineAuthority(wallNow);
for(const line of [1,2]){
 for(const event of [{kind:'wake',impact:'sled'},...Array.from({length:9},()=>({kind:'strike-rust'})),{kind:'pull-brake'},{kind:'pry-cable',effort:1},...Array.from({length:3},()=>({kind:'tighten-cable'})),...[0,1,2,3].flatMap(index=>[{kind:'take-weight',index},{kind:'hang-weight',index}])])auth.applyEvent(line,event);
 assert.equal(auth.snapshot(line).stage,'full-line');
}
try{
 const shared={wallNow,cableLineAuthority:auth,requireSummitCableRelease:true,connectionLog(){}};
 town=await createPresenceServer({...shared,townNight:{dawnEpoch:epoch,scheduleAt},townOutdoorWeather:{dawnEpoch:epoch}});
 summit=await createPresenceServer({...shared,...summitPresenceBounds,summitRoom:true,townNightFeed:town.townNightFeed,townOutdoorWeatherFeed:town.townOutdoorWeatherFeed});
 web=await createServer({root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(out,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[repo]},proxy:{'^/presence-summit(?:/|$)':{target:'http://127.0.0.1:'+summit.address().port,ws:true,rewrite:p=>p.replace('/presence-summit','/presence')},'^/presence(?:/|$)':{target:'http://127.0.0.1:'+town.address().port,ws:true}}}}});await web.listen();
 const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
 browser=await chromium.launch({headless:true,executablePath:chrome,args:['--use-gl=angle','--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 for(const line of [1,2]){
  clock=epoch+1000;
  const pages=await Promise.all([0,1].map(async i=>{
   const ctx=await browser.newContext({viewport:{width:880,height:540},deviceScaleFactor:1});
   await ctx.addInitScript(({name})=>{localStorage.setItem('unwritten.presence.name.v1',name);const Native=window.WebSocket;let active;window.WebSocket=new Proxy(Native,{construct(target,args){const ws=Reflect.construct(target,args);active=ws;return ws}});window.__closeReviewSocket=()=>active?.close(1000,'fixture reconnect');},{name:'B'+line+'乘客'+i});
   const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await p.goto('http://127.0.0.1:'+web.httpServer.address().port+'/town-night-b-cable-review.html?line='+line,{waitUntil:'domcontentloaded',timeout:45000});return p;
  }));
  const state=p=>p.evaluate(()=>window.__nightBCableReview.state());
  const wait=(p,fn,arg)=>p.waitForFunction(fn,arg,{timeout:20000});
  await Promise.all(pages.map(p=>wait(p,()=>{const s=window.__nightBCableReview?.state();return s?.bound&&s.frame>3&&s.clock&&s.epoch&&s.dawn&&s.people.length>=2})));
  const initial=await state(pages[0]),leg=initial.legMs;
  async function jump(offset){
   clock=epoch+Math.ceil(offset);
   await Promise.all(pages.map(p=>p.evaluate(()=>window.__closeReviewSocket())));
   await Promise.all(pages.map(p=>wait(p,expected=>{const s=window.__nightBCableReview.state();return s.clock>=expected&&s.clock<expected+8500&&s.people.length>=2},clock)));
  }
  async function press(action){await Promise.all(pages.map(p=>p.keyboard.press('e')));await Promise.all(pages.map(p=>wait(p,a=>window.__nightBCableReview.state().lastAction===a,action)));}
  async function capture(name,expectRide){
   await Promise.all(pages.map(p=>wait(p,expect=>{const s=window.__nightBCableReview.state();return !!s.ride===expect&&s.people.length>=2&&(!expect||s.ride.synchronized)},expectRide)));
   const ss=await Promise.all(pages.map(state));
   if(expectRide){for(const s of ss){assert.ok(Math.hypot(s.ride.feet.east-s.visual.east,s.ride.feet.north-s.visual.north,s.ride.feet.height-s.visual.height)<.5);assert.ok(s.people.some(p=>p.id!==s.self&&Math.hypot(p.east-s.ride.feet.east,p.north-s.ride.feet.north,p.height-s.ride.feet.height)<12));}}
   results.push({line,name,states:ss});await pages[0].screenshot({path:path.join(out,'line'+line+'-'+name+'.jpg'),type:'jpeg',quality:83});console.log(JSON.stringify({line,name,station:ss[0].ride?.station,whiteout:ss[0].ride?.whiteout,people:ss[0].people.length,feet:ss[0].ride?.feet??ss[0].feet}));
  }
  await jump(1000);await press('board');await capture('board',true);
  await jump(line===1?30000:110000);await press('blocked-exit');await capture('moving-reconnected',true);
  if(line===2)assert.equal((await state(pages[0])).ride.whiteout,true);
  await jump(leg+1000);await press('exit');await capture('arrival',false);
  const returnStart=2*leg<=360000?leg:600000;
  await jump(returnStart+1000);await press('board');await capture('return-board',true);
  await jump(returnStart+(line===1?30000:110000));await capture('return-moving',true);
  await jump(returnStart+leg+1000);await press('exit');await capture('return-arrival',false);
  for(const p of pages)await p.context().close();
 }
 assert.equal(errors.length,0);
}catch(e){failure=e.stack??String(e);}
finally{await browser?.close();await web?.close();await summit?.close();await town?.close();await rm(path.join(out,'.vite-cache'),{recursive:true,force:true});await writeFile(path.join(out,'report.json'),JSON.stringify({scope:'isolated actual two browsers, real Presence client/server and E controls; seeded repaired lines, server clock jumps via real reconnect, fixed dock starting points; not continuous or normal town entry',sha:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),results,errors,failure,complete:!failure},null,2));}
if(failure)throw Error(failure);
