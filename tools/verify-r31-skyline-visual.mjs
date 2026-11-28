import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('tools/voxel-tavern'),out=resolve(process.argv[2]??'.evidence/r31-skyline-visual');
await mkdir(out,{recursive:true});
let server,browser;
try{
 server=await createServer({root,mode:'town-preview',logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false},plugins:[{name:'skyline-review',configureServer(s){s.middlewares.use('/__skyline-review',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0"><canvas id="view"></canvas></body></html>');});}}]});
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:'C:/Program Files/Google/Chrome/Application/chrome.exe'),args:['--use-gl=angle','--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__skyline-review');
 const results=[];
 for(const [id,position,target] of [['front-mid',[440,141.65,-520],[350,405,-1500]],['front-upper',[336,300,-640],[350,460,-1500]],['front-west',[80,75,-520],[350,390,-1500]]]){
  for(const version of ['old','new']){
   const metrics=await page.evaluate(async({version,position,target})=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const old=await import('/town-blockout/town-d2-r30-skyline.ts');
    const next=await import('/town-blockout/town-r31-public-skyline.ts');
    const canvas=document.querySelector('#view');
    const renderer=window.__renderer??=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,540,false);
    const scene=new T.Scene();scene.background=new T.Color('#aebfd2');scene.fog=new T.Fog('#aebfd2',250,2300);
    scene.add(new T.AmbientLight('#ffffff',1.1));
    const sun=new T.DirectionalLight('#fff2db',1.35);sun.position.set(-200,600,250);scene.add(sun);
    const ground=new T.Mesh(new T.PlaneGeometry(640,800),new T.MeshLambertMaterial({color:'#c7d1d6'}));ground.rotation.x=-Math.PI/2;ground.position.set(320,0,-400);scene.add(ground);
    const g=version==='old'?old.buildR30TownSkyline():next.buildR31PublicSkyline(800);
    const m=new T.Mesh(g,new T.MeshLambertMaterial({vertexColors:true,fog:true}));m.position.set(300,0,-676);scene.add(m);
    const camera=new T.PerspectiveCamera(58,960/540,.1,2400);camera.position.set(...position);camera.lookAt(...target);
    renderer.render(scene,camera);
    const result={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,minY:g.boundingBox.min.y,maxY:g.boundingBox.max.y};
    g.dispose();m.material.dispose();ground.geometry.dispose();ground.material.dispose();return result;
   },{version,position,target});
   await page.screenshot({path:join(out,id+'-'+version+'.png')});
   results.push({id,version,position,target,...metrics});
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(join(out,'review.json'),JSON.stringify({scope:'isolated renderer comparison of exact old and new public horizon; surveyed representative camera coordinates, NOT native movement or full game screenshots',results,errors},null,2));
 console.log(JSON.stringify(results));
}finally{await browser?.close();await server?.close();}
