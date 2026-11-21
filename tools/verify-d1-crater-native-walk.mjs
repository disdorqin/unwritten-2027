import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'vite';

/**
 * D1: actual town viewer, ordinary native first-person mouse + WASD.
 * The camera is NEVER teleported programmatically, and the walk
 * has to traverse the same existing west road/collision as a player.
 */
const [project,dir]=process.argv.slice(2);
assert.ok(project&&dir);
const root=path.resolve(project),out=path.resolve(dir);
assert.match(out,/^[dD]:[/\\]/);
await mkdir(out,{recursive:true});
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const chrome=process.env.CHROMIUM_PATH??(existsSync(chromium.executablePath())?undefined:
  'C:/Program Files/Google/Chrome/Application/chrome.exe');
let server,browser,context,page,failure;
const shots=[],positions=[],warnings=[],errors=[];
let heading=0,started=Date.now(),facingCalibrated=false;
const posRx=/东\s*(-?[\d.]+)\s*m\s*·\s*北\s*(-?[\d.]+)\s*m/;
function delta(from,to){return ((to-from+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI}
// Grounded by the same crater.mainTrailPoint(f) fixture used by B-01:
// a 0.01 progress stride follows the TURN rather than cutting across the
// physical bowl between two endpoints many tens of metres apart.
const route=[
  {tag:'crater-lip',east:-71.5335,north:159},
  {tag:'descent-01',east:-78.64,north:149.28},
  {tag:'descent-02',east:-87.63,north:141.40},
  {tag:'descent-03',east:-98.07,north:135.71},
  {tag:'descent-04',east:-109.42,north:132.46},
  {tag:'descent-05',east:-121.13,north:131.76},
  {tag:'descent-06',east:-132.63,north:133.63},
  {tag:'descent-07',east:-143.38,north:137.94},
  {tag:'descent-08',east:-152.86,north:144.44},
  {tag:'descent-09',east:-160.64,north:152.80},
  {tag:'descent-10',east:-166.37,north:162.59},
  {tag:'descent-11',east:-169.80,north:173.33},
  {tag:'descent-12',east:-170.80,north:184.48},
  {tag:'descent-13',east:-169.35,north:195.50},
  {tag:'descent-14',east:-165.55,north:205.86},
  {tag:'descent-15',east:-159.62,north:215.09},
  {tag:'descent-16',east:-151.88,north:222.74},
];
async function read(){
  const data=await page.evaluate(()=>({
    hud:document.querySelector('#position')?.textContent,
    day:document.querySelector('#lighting')?.textContent,
    entryHidden:document.querySelector('#town-entry')?.hidden,
  }));
  const match=posRx.exec(data.hud||'');
  return {...data,east:match?Number(match[1]):NaN,north:match?Number(match[2]):NaN};
}
async function screenshot(name){
  const at=await read();
  await page.screenshot({path:path.join(out,name+'.png'),timeout:18000});
  shots.push(name+'.png');positions.push({name,...at,headingEstimated:heading});
  return at;
}
async function face(next){
  let remain=delta(heading,next);
  while(Math.abs(remain)>.006){
    const chunk=Math.max(-1.12,Math.min(1.12,remain));
    const pixel=Math.round(chunk/.003);
    const left=pixel<0?625:360;
    // A real game action banner occupies the centre around Y435. Never
    // drag from a HUD overlay: the browser would report pointer motion
    // but the Three.js canvas would receive NONE of it. Use Y575.
    const landing=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x:left,y:575});
    assert.equal(landing,'CANVAS','Native view drag must begin on the unobstructed WebGL canvas');
    await page.mouse.move(left,575);
    await page.mouse.down();
    try{await page.mouse.move(left+pixel,575,{steps:Math.max(2,Math.ceil(Math.abs(pixel)/42))});}
    finally{await page.mouse.up();}
    heading+=pixel*.003;
    remain=delta(heading,next);
  }
}
async function walk(goal){
  const start=await read();
  const x=goal.east-start.east,n=goal.north-start.north;
  const want=Math.atan2(x,n);
  await face(want);
  // Renderer yaw is deliberately not exported by the live viewer. Infer
  // the actual forward heading from a SHORT legal movement, then correct
  // for any pointer-lock fallback gesture that did not rotate the view.
  for(let calibration=0;!facingCalibrated&&calibration<3;calibration++){
    const before=await read();
    await page.keyboard.down('w');
    await page.waitForTimeout(850);
    await page.keyboard.up('w');
    const after=await read();
    const de=after.east-before.east,dn=after.north-before.north;
    if(Math.hypot(de,dn)<.14){
      warnings.push({reason:'cannot-calibrate-facing-no-native-motion',calibration,before,after});
      break;
    }
    const measured=Math.atan2(de,dn),gap=delta(measured,want);
    warnings.push({reason:'native-facing-calibration',calibration,measured,want,gap});
    heading=measured;
    if(Math.abs(gap)<.16){facingCalibrated=true;break;}
    await face(want);
  }
  const begin=Date.now();
  let last=await read();
  const sprint=Math.hypot(x,n)>23;
  if(sprint)await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  try{
    while(Date.now()-begin<38000){
      await page.waitForTimeout(sprint?350:145);
      const here=await read();
      if(!Number.isFinite(here.east))throw Error('Player HUD missing during movement');
      const distance=Math.hypot(goal.east-here.east,goal.north-here.north);
      const forward=(here.east-start.east)*Math.sin(want)+(here.north-start.north)*Math.cos(want);
      if(distance<2.9||forward>=Math.hypot(x,n)-1.65)break;
      if(Date.now()-begin>2500&&Math.hypot(here.east-last.east,here.north-last.north)<.001){
        warnings.push({at:here,reason:'blocked-by-authoritative-world',goal:goal.tag});
        break;
      }
      last=here;
    }
  }finally{await page.keyboard.up('w');if(sprint)await page.keyboard.up('Shift');}
  const actual=await read();
  const error=Math.hypot(goal.east-actual.east,goal.north-actual.north);
  positions.push({name:goal.tag,actual,goal,error});
  // The visible pole/fence collar stops the centre ≈3.23m before the
  // nominal first lip centre; a 3.5m approach is sufficient for the next
  // original walking bend, but is NOT a formal registration/interaction.
  return error<3.5;
}
try{
  server=await createServer({root:path.join(root,'tools','voxel-tavern'),
    configFile:path.join(root,'tools','voxel-tavern','vite.config.ts'),
    cacheDir:path.join(out,'.vite-cache'),optimizeDeps:{noDiscovery:true,include:[]},
    logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[root]}}});
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:chrome,
    args:process.platform==='win32'?['--use-gl=angle','--use-angle=d3d11']:
      ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  context=await browser.newContext({viewport:{width:1160,height:760},deviceScaleFactor:.55,locale:'zh-CN'});
  page=await context.newPage();
  await page.addInitScript(()=>{
    Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined});
    localStorage.setItem('unwritten.quality.tier.v1','smooth');
  });
  page.on('pageerror',e=>errors.push('page:'+e.message));
  page.on('console',e=>{if(e.type()==='error'&&!e.text().includes('404'))errors.push('console:'+e.text())});
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/town-blockout.html',
    {waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#scene canvas').waitFor({state:'visible',timeout:40000});
  await page.locator('#town-panel-toggle').click();
  await page.locator('#jump').selectOption({label:'陨石坑口'});
  const mouth=await read();
  assert.ok(Math.abs(mouth.east-2)<.1&&Math.abs(mouth.north-159)<.1,JSON.stringify(mouth));
  heading=Math.atan2(226-mouth.east,223-mouth.north);
  await screenshot('crater-mouth-start-night-real-player');
  for(const [index,goal]of route.entries()){
    const pass=await walk(goal);
    await screenshot('crater-real-step-'+(index+1)+'-'+goal.tag);
    if(!pass){warnings.push({reason:'route-stopped-before-next-waypoint',goal,where:await read()});break;}
  }
  // Final review station must be physically INSIDE the bowl, not the
  // mouth. Face true north through ordinary native canvas motion.
  const inside=await read();
  assert.ok(inside.east<-120&&inside.north>195,
    'No crater-interior screenshot unless native movement reached its foot');
  await face(0);
  await screenshot('crater-interior-facing-north-night');
  await page.locator('#town-panel-toggle').click();
  await page.locator('#lighting').click();
  await page.locator('#town-settings-close').click();
  await screenshot('crater-interior-facing-north-day');
}catch(e){failure=String(e);}
finally{
  const cleanupErrors=[];
  for(const [label,cleanup]of [['page',()=>page?.close()],['context',()=>context?.close()],
    ['browser',()=>browser?.close()],['server',()=>server?.close()]]){
    try{await cleanup()}catch(e){cleanupErrors.push(label+':'+String(e))}
  }
  const interiorNight=positions.find(p=>p.name==='crater-interior-facing-north-night');
  const interiorDay=positions.find(p=>p.name==='crater-interior-facing-north-day');
  const legitInterior=interiorNight&&interiorDay&&
    interiorNight.east<-120&&interiorNight.north>195&&
    interiorNight.east===interiorDay.east&&interiorNight.north===interiorDay.north&&
    Math.abs(interiorNight.headingEstimated)<.06&&Math.abs(interiorDay.headingEstimated)<.06;
  const report={passed:!failure&&!cleanupErrors.length,elapsedMs:Date.now()-started,
    verifiedSameFootCraterInteriorDayNight:Boolean(legitInterior),
    screenshots:shots,positions,warnings,errors,cleanupErrors,failure,
    caveat:'Single-player Vite dev route; no websocket authoritative cross-domain session; route walk gaps/blocked points cannot be called completed crater-interior acceptance.'};
  await writeFile(path.join(out,'d1-real-crater-native-path.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,timeMs:report.elapsedMs,
    shots:shots.length,steps:positions.map(x=>({name:x.name,error:x.error,at:x.actual?{
      east:x.actual.east,north:x.actual.north}:undefined})),warnings,errors:errors.slice(0,5),failure,cleanupErrors}));
  if(!report.passed)process.exitCode=1;
}
