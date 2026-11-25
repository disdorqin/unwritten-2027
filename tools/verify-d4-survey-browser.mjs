import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createServer} from 'vite';

const [project,destination]=process.argv.slice(2);
assert.ok(project&&destination,'node tools/verify-d4-survey-browser.mjs . <D-evidence>');
const root=path.resolve(project),out=path.resolve(destination);
assert.match(out,/^[dD]:[/\\]/);
await mkdir(out,{recursive:true});
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const chrome=process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:
  'C:/Program Files/Google/Chrome/Application/chrome.exe');
let server,browser,context,page,failure;
const screenshots=[],reviews=[],errors=[],started=Date.now();
try{
  server=await createServer({
    root:path.join(root,'tools','voxel-tavern'),
    configFile:path.join(root,'tools','voxel-tavern','vite.config.ts'),
    cacheDir:path.join(out,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},
    logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}},
  });
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:chrome,
    args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:
      ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1320,height:790},deviceScaleFactor:1,locale:'zh-CN'});
  page=await context.newPage();
  page.on('pageerror',e=>errors.push('page:'+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console:'+m.text())});
  page.on('response',r=>{if(r.status()>=400)errors.push('http:'+r.status()+':'+r.url())});
  const url='http://127.0.0.1:'+server.httpServer.address().port+'/survey-engraving-firstperson-review.html';
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>window.__d4SurveyReview?.state()?.frames>=7,{timeout:30000});
  async function snap(name,station,night){
    const state=await page.evaluate(()=>window.__d4SurveyReview.state());
    assert.equal(state.id,station);
    assert.equal(state.night,night);
    assert.equal(state.markerCount,3,'M7 must not create a fourth station pillar');
    assert.equal(state.hasRealTexture,true);
    assert.deepEqual(state.actualText,state.approvedText);
    assert.ok(state.renderedDraws>0);
    if(station==='M7'){
      assert.equal(state.m7Circle,true);
      assert.equal(state.m7Marker,true);
    }
    await page.screenshot({path:path.join(out,name+'.png'),timeout:16000});
    screenshots.push(name+'.png');
    reviews.push({name,...state});
  }
  for(let i=1;i<=4;i++){
    await page.keyboard.press(String(i));
    await page.keyboard.press('d');
    await snap('d4-m'+(i+3)+'-day-inscription','M'+(i+3),false);
    await page.keyboard.press('n');
    await snap('d4-m'+(i+3)+'-night-inscription','M'+(i+3),true);
  }
  assert.deepEqual(errors,[]);
}catch(e){failure=String(e)}
finally{
  const cleanupErrors=[];
  for(const [name,stop]of [['page',()=>page?.close()],['context',()=>context?.close()],
    ['browser',()=>browser?.close()],['server',()=>server?.close()]]){
    try{await stop()}catch(e){cleanupErrors.push(name+':'+String(e))}
  }
  const report={passed:!failure&&errors.length===0&&cleanupErrors.length===0,
    screenshots,reviews,errors,cleanupErrors,failure,elapsedMs:Date.now()-started,
    acceptance:'Model rendered at human eye camera positions, but is NOT a playable default viewer/Presence walk. Formal D4 quality gate remains open.'};
  await writeFile(path.join(out,'d4-four-inscription-model-browser.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,screenshots:screenshots.length,
    stations:reviews.map(x=>x.name),draws:reviews[0]?.renderedDraws,
    errors,cleanupErrors,failure,elapsedMs:report.elapsedMs}));
  if(!report.passed)process.exitCode=1;
}
