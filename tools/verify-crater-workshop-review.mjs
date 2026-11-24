import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const out=resolve(process.argv[2]||'');
assert.ok(process.argv[2],'Explicit fresh evidence path required');
await mkdir(out);
const root=resolve('tools/voxel-tavern');
const server=await createServer({root,configFile:false,optimizeDeps:{entries:['crater-workshop-review.html']},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}});
let browser;
const errors=[],shots=[];
try{
  await server.listen();
  const port=server.httpServer.address().port;
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+(m.location().url??''))});
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(r.status()+' '+r.url())});
  await page.goto('http://127.0.0.1:'+port+'/crater-workshop-review.html',{waitUntil:'networkidle',timeout:60000});
  await page.waitForFunction(()=>window.__craterWorkshopReview?.().frame>5,undefined,{timeout:60000});
  for(const id of ['bellows','calibration','sorting','weighing','turnout']){
    await page.locator('#site').selectOption(id);
    await page.waitForFunction(id=>window.__craterWorkshopReview().site===id&&window.__craterWorkshopReview().target===id,id);
    // A short real native walk back and forward at the surveyed work foot.
    const before=await page.evaluate(()=>window.__craterWorkshopReview());
    await page.keyboard.down('s');await page.waitForTimeout(140);await page.keyboard.up('s');
    const stepped=await page.evaluate(()=>window.__craterWorkshopReview());
    await page.keyboard.down('w');await page.waitForTimeout(140);await page.keyboard.up('w');
    await page.locator('#site').selectOption(id);
    for(const night of [false,true]){
      if((await page.evaluate(()=>window.__craterWorkshopReview())).night!==night)await page.locator('#lighting').click();
      await page.waitForTimeout(240);
      const snap=await page.evaluate(()=>window.__craterWorkshopReview());
      assert.equal(snap.target,id);
      const name=id+'-'+(night?'night':'day')+'.png';
      await page.screenshot({path:join(out,name)});
      shots.push({file:name,...snap,walked:Math.hypot(stepped.east-before.east,stepped.north-before.north)});
    }
  }
  const fps=await page.evaluate(async()=>{const start=window.__craterWorkshopReview().frame,t=performance.now();await new Promise(r=>setTimeout(r,1000));return (window.__craterWorkshopReview().frame-start)*1000/(performance.now()-t)});
  await writeFile(join(out,'report.json'),JSON.stringify({scope:'surveyed first-person model review, not production multiplayer or completed gameplay',errors,shots,fps},null,2));
  console.log(JSON.stringify({errors,shots:shots.map(s=>({file:s.file,target:s.target,walked:s.walked})),fps}));
  assert.equal(errors.length,0);
}finally{
  if(browser)await browser.close();await server.close();
}
