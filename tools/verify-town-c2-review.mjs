import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(process.argv[2]??'docs/交流区/GPT/town-c2-20261124-实走原件');
const cache=resolve(out,'.vite-cache');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sourceTreeHash=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim();
const sourceStatus=execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
const sourceTree={root,commit:sourceCommit,tree:sourceTreeHash,dirty:sourceStatus.length>0,status:sourceStatus};
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<link rel="icon" href="data:,"><style>html,body{margin:0;overflow:hidden;background:#111820}canvas{display:block}</style>'+
  '<script type="module" src="/tools/fixtures/town-c2-review.ts"></script></html>';
await mkdir(out,{recursive:true});
const app=await createServer({
  configFile:false,root,publicDir:false,cacheDir:cache,resolve:{dedupe:['three']},
  plugins:[{name:'town-c2-independent-review',configureServer(vite){
    vite.middlewares.use((req,res,next)=>{
      if(req.url?.split('?')[0]!=='/town-c2-review')return next();
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
    });
  }}],
  server:{host:'127.0.0.1',port:0,hmr:false},
});
const report={
  schema:'town-c2-first-person-review/v1',
  sourceCommit,sourceTree,
  scope:'C2-01..06 independent offline first-person visual and ground-step review; real mounts, fixture input',
  uncertified:[
    'not production world/Presence/multiplayer certification',
    'highWaterOffsetM=1 and high/mid/low selection are explicit fixture-only inputs',
    'water overlay adds no collider; underground step uses mine.queryPassage, not production swimming authority',
    'SwiftShader headless FPS is a review sample, not a device performance benchmark',
    'screenshots and API checks do not replace human visual acceptance',
  ],
  errors:{pageerror:[],consoleError:[],requestFailed:[]},views:{},walks:{},fpsSample:null,passed:false,
};
let browser,problem;
async function settle(page){
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
}
function watch(page,label){
  page.on('pageerror',error=>report.errors.pageerror.push(label+': '+error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.consoleError.push(label+': '+message.text());});
  page.on('requestfailed',request=>report.errors.requestFailed.push(label+': '+request.url()+': '+(request.failure()?.errorText??'failed')));
}
async function openReview(page,mode){
  await page.goto('http://127.0.0.1:'+app.httpServer.address().port+'/town-c2-review?mode='+mode,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.townC2Review?.inspect().frames>2);
  assert.equal(await page.evaluate(()=>window.townC2Review.inspect().mode),mode);
}
async function capture(page,file){
  await settle(page);
  const stats=await page.evaluate(()=>window.townC2Review.inspect());
  assert.equal(stats.firstPersonEyeHeight,1.67);
  assert.equal(stats.pointerLock,true);
  assert.equal(stats.productionCertified,false);
  assert.ok(stats.collisionChecks>0,file+' did not query ground/collision');
  assert.ok(stats.render.calls>0&&stats.render.triangles>0,file+' rendered no geometry');
  const shot=await page.screenshot({path:resolve(out,file)});
  assert.ok(shot.byteLength>1000,file+' looks blank');
  report.views[file]={...stats,bytes:shot.byteLength};
  return stats;
}
try{
  await app.listen();
  const addr=app.httpServer.address();
  assert.ok(addr&&typeof addr==='object');
  const executablePath=existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined;
  browser=await chromium.launch({executablePath,headless:true,args:[
    '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--disable-features=PointerLock','--disable-background-timer-throttling','--disable-renderer-backgrounding',
  ]});
  report.renderer={executablePath:executablePath??'Playwright bundled Chromium',headless:true,gl:'SwiftShader'};

  const crater=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  watch(crater,'crater');
  await crater.addInitScript(()=>{
    Object.defineProperty(Element.prototype,'requestPointerLock',{
      configurable:true,value(){throw new Error('PointerLock is disabled in the C2 review fixture');},
    });
  });
  await openReview(crater,'crater');
  const craterShots=[
    ['crater/central-mound',false,'town-c2-crater-central-mound-day.png'],
    ['crater/central-mound',true,'town-c2-crater-central-mound-night.png'],
    ['crater/collapse-fan',false,'town-c2-crater-collapse-fan-day.png'],
    ['crater/collapse-fan',true,'town-c2-crater-collapse-fan-night.png'],
    ['crater/gully',false,'town-c2-crater-gully-day.png'],
    ['crater/gully',true,'town-c2-crater-gully-night.png'],
    ['crater/molten-near',false,'town-c2-crater-molten-near-day.png'],
    ['crater/molten-near',true,'town-c2-crater-molten-near-night.png'],
    ['crater/molten-rim-invisible',false,'town-c2-crater-molten-rim-invisible-day.png'],
    ['crater/molten-rim-invisible',true,'town-c2-crater-molten-rim-invisible-night.png'],
    ['crater/inscription',false,'town-c2-crater-inscription-day.png'],
    ['crater/inscription',true,'town-c2-crater-inscription-night.png'],
    ['crater/warm-chain-night',false,'town-c2-crater-warm-chain-day.png'],
    ['crater/warm-chain-night',true,'town-c2-crater-warm-chain-night.png'],
  ];
  for(const [name,isNight,file] of craterShots){
    assert.equal(await crater.evaluate(args=>window.townC2Review.setView(args.name)&&window.townC2Review.setNight(args.isNight),{name,isNight}),true,'blocked review view: '+name);
    const stats=await capture(crater,file);
    assert.equal(stats.mode,'crater');assert.ok(stats.crater.colliderCount>0);
    assert.ok(Object.values(stats.crater.mounted).every(Boolean),file+' is missing a real C2 mount');
    assert.equal(stats.crater.centralMound.materialFamilies,3);
    assert.equal(stats.crater.brokenCircle.featureCount,8);
    assert.equal(stats.crater.inscription.hasText,false);
    assert.equal(stats.crater.warmLightChain.lampCount,16);
    if(name==='crater/molten-near'){
      assert.equal(stats.crater.moltenBeads.beadsVisible,true);
      assert.equal(stats.crater.moltenInsideRimGuard,true);
      assert.ok(stats.crater.moltenBeads.footprintDistance<=15);
    }
    if(name==='crater/molten-rim-invisible'){
      assert.equal(stats.crater.moltenBeads.beadsVisible,false);
      assert.equal(stats.crater.moltenInsideRimGuard,false);
    }
    if(name==='crater/warm-chain-night'&&isNight){
      assert.equal(stats.crater.warmLightChain.isNightLit,true);
      assert.equal(stats.crater.warmLightChain.activeLightCount,16);
    }
    if(name==='crater/warm-chain-night'&&!isNight){
      assert.equal(stats.crater.warmLightChain.isNightLit,false);
      assert.equal(stats.crater.warmLightChain.activeLightCount,0);
    }
  }

  assert.equal(await crater.evaluate(()=>{
    window.townC2Review.setView('crater/molten-near');window.townC2Review.setNight(true);window.townC2Review.resetFPS();return true;
  }),true);
  const sampleStarted=Date.now();
  await crater.waitForTimeout(20000);
  report.fpsSample={scene:'crater/molten-near-night',requestedMs:20000,wallMs:Date.now()-sampleStarted,
    stats:await crater.evaluate(()=>window.townC2Review.inspect()),certification:'fixture-only SwiftShader sample'};
  assert.ok(report.fpsSample.wallMs>=19000);
  assert.ok(report.fpsSample.stats.frames>0&&Number.isFinite(report.fpsSample.stats.fps));

  assert.equal(await crater.evaluate(()=>window.townC2Review.setView('crater/trail-walk')&&window.townC2Review.setNight(false)),true);
  await crater.keyboard.down('w');
  const craterStep=await crater.evaluate(()=>window.townC2Review.step(.7));
  await crater.keyboard.up('w');
  assert.equal(craterStep,true,'crater ground step rejected');
  report.walks.crater=await crater.evaluate(()=>window.townC2Review.inspect());
  assert.ok(report.walks.crater.walked>1.5&&report.walks.crater.trustedW>0&&report.walks.crater.rejected===0);
  await crater.close();

  const underground=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  watch(underground,'underground');
  await underground.addInitScript(()=>{
    Object.defineProperty(Element.prototype,'requestPointerLock',{
      configurable:true,value(){throw new Error('PointerLock is disabled in the C2 review fixture');},
    });
  });
  await openReview(underground,'underground');
  for(const level of ['high','mid','low']){
    assert.equal(await underground.evaluate(level=>window.townC2Review.setView('underground/'+level)&&window.townC2Review.setWater(level),level),true);
    const stats=await capture(underground,'town-c2-underground-water-'+level+'.png');
    assert.equal(stats.mode,'underground');assert.equal(stats.underground.water.level,level);
    assert.equal(stats.underground.water.colliders,0);
    assert.equal(stats.underground.fixtureHighWaterOffsetM,1);
    assert.equal(stats.underground.water.surfaceRiseM,level==='high'?1:0);
    assert.equal(stats.underground.water.waterMode,level==='high'?'raised':level==='low'?'hidden':'baseline');
    assert.equal(stats.underground.water.riverbedShortcutVisible,level==='low');
  }
  assert.equal(await underground.evaluate(()=>window.townC2Review.setWater('mid')&&window.townC2Review.setView('underground/gallery-walk')),true);
  await underground.keyboard.down('w');
  const mineStep=await underground.evaluate(()=>window.townC2Review.step(.7));
  await underground.keyboard.up('w');
  assert.equal(mineStep,true,'mine queryPassage ground step rejected');
  report.walks.underground=await underground.evaluate(()=>window.townC2Review.inspect());
  assert.ok(report.walks.underground.walked>1.5&&report.walks.underground.trustedW>0&&report.walks.underground.rejected===0);
  await underground.close();

  assert.deepEqual(report.errors.pageerror,[]);
  assert.deepEqual(report.errors.consoleError,[]);
  assert.deepEqual(report.errors.requestFailed,[]);
  report.passed=true;
}catch(error){problem=error;report.failure=String(error);}
finally{
  await browser?.close().catch(()=>{});
  await app.close().catch(()=>{});
  await rm(cache,{recursive:true,force:true});
  report.finishedAt=new Date().toISOString();
  await writeFile(resolve(out,'source-commit.txt'),sourceCommit+'\n','utf8');
  await writeFile(resolve(out,'source-tree.txt'),sourceTreeHash+'\n','utf8');
  await writeFile(resolve(out,'review-stats.json'),JSON.stringify(report,null,2),'utf8');
}
console.log(JSON.stringify({passed:report.passed,out,sourceCommit,views:Object.keys(report.views),walks:report.walks,
  fps:report.fpsSample?.stats.fps,errors:report.errors,failure:report.failure},null,2));
if(problem)throw problem;
