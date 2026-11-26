import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const checkout=fileURLToPath(new URL('../',import.meta.url)),root=path.join(checkout,'tools','voxel-tavern');
const out=path.resolve(process.argv[2]??'');assert.match(out,/^[dD]:[/\\]/);
await mkdir(out,{recursive:true});let server,browser,failed;const errors=[],frames=[];
try{
 server=await createServer({root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(out,'.vite'),logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[checkout]}}});await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1100,height:700}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(String(r.status())+' '+r.url())});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+(process.argv.includes('--dock')?'/d-r30-transport-review.html?dock=1':process.argv.includes('--transport')?'/d-r30-transport-review.html':process.argv.includes('--road')?'/d-r30-front-ridge-preview.html?road=1':'/d-r30-front-ridge-preview.html'),{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ridgeR30?.state().frames>10,null,{timeout:60000});
 for(const i of [0,1,2,3,4]){
   await page.keyboard.press(String(i+1));await page.waitForFunction(i=>window.__ridgeR30.state().index===i,i);
   if(i===0&&process.argv.includes('--dock')){await page.keyboard.down('w');try{await page.waitForFunction(()=>window.__ridgeR30.state().n>353,null,{timeout:15000})}finally{await page.keyboard.up('w')}}
   if(i===2){const previous=await page.evaluate(()=>window.__ridgeR30.state().walked);await page.keyboard.down('w');try{await page.waitForFunction(p=>window.__ridgeR30.state().walked>p+2,previous,{timeout:10000})}finally{await page.keyboard.up('w')}}
   for(const night of [false,true]){
     await page.waitForFunction(v=>window.__ridgeR30.state().night===v,night);
     const initial=await page.evaluate(()=>window.__ridgeR30.state().frames);
     await page.waitForFunction(f=>window.__ridgeR30.state().frames>=f+3,initial);
     const state=await page.evaluate(()=>window.__ridgeR30.state());assert.ok(Math.abs(state.h-state.ground)<1e-6);assert.ok(state.draws>0);
     const name='ridge-'+(i+1)+(night?'-night':'-day')+'.jpg';
     await page.locator('aside').evaluate(e=>e.style.visibility='hidden');await page.screenshot({path:path.join(out,name),quality:84});await page.locator('aside').evaluate(e=>e.style.visibility='');
     frames.push({name,...state});await page.keyboard.press('n');
   }
 }
 assert.deepEqual(errors,[]);
}catch(e){failed=String(e)}
finally{await browser?.close();await server?.close();const report={passed:!failed&&!errors.length,reviewOnly:true,frames,errors,failed};await writeFile(path.join(out,'ridge-review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1}
