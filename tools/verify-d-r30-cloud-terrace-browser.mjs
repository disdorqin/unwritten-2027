import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const checkout=fileURLToPath(new URL('../',import.meta.url)),root=path.join(checkout,'tools','voxel-tavern');
const out=path.resolve(process.argv[2]??'');assert.match(out,/^[dD]:[/\\]/);
await mkdir(out,{recursive:true});let server,browser,failed;
const errors=[],frames=[],arrivals=[];
try{
 server=await createServer({root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(out,'.vite'),logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[checkout]}}});
 await server.listen();browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1100,height:700}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(String(r.status())+' '+r.url())});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/d-r30-cloud-terrace-review.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__cloudR30?.state().frames>5,null,{timeout:60000});
 async function shot(name){
  const old=await page.evaluate(()=>window.__cloudR30.state().frames);
  await page.waitForFunction(f=>window.__cloudR30.state().frames>=f+3,old);
  const s=await page.evaluate(()=>window.__cloudR30.state());
  assert.equal(s.foot.height,s.ground);assert.equal(s.foot.height,s.supported);assert.equal(s.blocked,false);assert.ok(s.draws>0);
  await page.locator('aside').evaluate(e=>e.style.visibility='hidden');await page.screenshot({path:path.join(out,name+'.jpg'),quality:84});await page.locator('aside').evaluate(e=>e.style.visibility='');
  frames.push({name,...s});
 }
 // Continuous one-player route, no camera relocations or teleport commands.
 for(const i of [4,1,0,2,3,5,6]){
  const before=await page.evaluate(()=>window.__cloudR30.state().walked);
  await page.keyboard.press(String(i+1));
  await page.waitForFunction(i=>window.__cloudR30.state().index===i,i);
  await page.keyboard.down('w');
  try{await page.waitForFunction(()=>window.__cloudR30.state().arrived,null,{timeout:45000})}finally{await page.keyboard.up('w')}
  const state=await page.evaluate(()=>window.__cloudR30.state());
  assert.ok(state.walked>before);arrivals.push(state);
  if(i<4){await page.keyboard.press('e');await page.waitForFunction(()=>window.__cloudR30.state().reply.includes('云海台 ·'))}
  await shot('point-'+(i+1)+'-day');
  await page.keyboard.press('n');await shot('point-'+(i+1)+'-night');await page.keyboard.press('n');
 }
 assert.deepEqual(errors,[]);
}catch(e){failed=String(e)}
finally{await browser?.close();await server?.close();const report={passed:!failed&&!errors.length,reviewOnly:true,frames,arrivals,errors,failed};await writeFile(path.join(out,'cloud-review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,frames:frames.length,arrivals:arrivals.map(a=>({index:a.index,foot:a.foot,walked:a.walked,draws:a.draws,tris:a.tris})),errors,failed}));if(!report.passed)process.exitCode=1}
