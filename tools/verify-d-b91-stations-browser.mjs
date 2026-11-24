import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createServer} from 'vite';
const checkout=fileURLToPath(new URL('../',import.meta.url)),root=path.join(checkout,'tools','voxel-tavern');
const out=path.resolve(process.argv[2]??'');
assert.match(out,/^[dD]:[/\\]/);
await mkdir(out,{recursive:true});
const {chromium}=createRequire(path.join(checkout,'package.json'))('playwright');
let server,browser,page,failure;
const frames=[],errors=[];
try{
 server=await createServer({root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(out,'.vite-cache'),logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[checkout]}}});
 await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=d3d11']});
 page=await browser.newPage({viewport:{width:1000,height:660}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(String(r.status())+' '+r.url())});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/d-b91-stations-review.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__stationReview?.state().frames>3,null,{timeout:45000});
 for(const i of (process.argv.includes('--formation')?[5]:[0,1,2,3,4])){
   await page.keyboard.press(String(i+1));
   await page.waitForFunction(i=>window.__stationReview.state().selected===i,i);
   if(i===5){await page.waitForFunction(()=>window.__stationReview.state().formationVisible&&window.__stationReview.state().formationSeconds>.2,null,{timeout:15000})}
   if(i===0){
     const before=await page.evaluate(()=>window.__stationReview.state().walked);
     await page.keyboard.down('w');
     try{await page.waitForFunction(b=>window.__stationReview.state().walked>b+.8,before,{timeout:10000})}
     finally{await page.keyboard.up('w')}
   }
   for(const night of [false,true]){
     await page.waitForFunction(n=>window.__stationReview.state().night===n,night);
     const state=await page.evaluate(()=>window.__stationReview.state());
     const name='station-'+(i+1)+(night?'-night':'-day')+'.jpg';
     assert.ok(state.draws>0);
     await page.screenshot({path:path.join(out,name),quality:83});
     frames.push({name,...state});await page.keyboard.press('n');
   }
 }
 assert.deepEqual(errors,[]);
}catch(e){failure=String(e)}
finally{
 await browser?.close();await server?.close();
 const report={passed:!failure&&!errors.length,reviewOnly:true,frames,errors,failure};
 await writeFile(path.join(out,'station-review.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
 if(!report.passed)process.exitCode=1;
}
