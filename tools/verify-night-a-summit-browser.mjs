import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const checkout=fileURLToPath(new URL('../',import.meta.url)),root=path.join(checkout,'tools','voxel-tavern'),out=path.resolve(process.argv[2]);
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:checkout,encoding:'utf8'}).trim();
await mkdir(out,{recursive:true});let server,browser,failed;const errors=[],frames=[];
try{
 server=await createServer({root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(out,'.vite'),logLevel:'error',optimizeDeps:{noDiscovery:true,include:[]},server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[checkout]}}});await server.listen();
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1100,height:700}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(String(r.status())+' '+r.url())});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/town-night-a-summit-review.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__southReview?.state().frames>5,null,{timeout:60000});
 await page.locator('aside').evaluate(e=>e.style.visibility='hidden');
 for(let i=0;i<4;i++){await page.keyboard.press(String(i+1));for(const night of [false,true]){
 await page.waitForFunction(({i,night})=>{const s=window.__southReview.state();return s.index===i&&s.night===night},{i,night});await page.waitForTimeout(150);
 const name=['south-valley','gate','plaza','gully'][i]+(night?'-night':'-day');const state=await page.evaluate(()=>window.__southReview.state());assert.ok(state.draws>0&&state.renderTriangles>0);await page.screenshot({path:path.join(out,name+'.jpg'),quality:82});frames.push({name,...state});await page.keyboard.press('n');
 }}
 assert.deepEqual(errors,[]);
}catch(e){failed=String(e)}
finally{await browser?.close();await server?.close();await rm(path.join(out,'.vite'),{recursive:true,force:true});const report={source,passed:!failed&&!errors.length,reviewOnly:true,frames,errors,failed};await writeFile(path.join(out,'review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1}
