import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

assert.ok(process.argv[2], 'Use: node tools/verify-underground-crystal-mimic.mjs <evidence-dir>');
const output = resolve(process.argv[2]);
const repo = fileURLToPath(new URL('../', import.meta.url));
const caveCommit = '25ff93454c93777d16583cdac1de9f36b9c277ba';
const sourceDir = 'tools/voxel-tavern/town-blockout';
const sources = {
  layout: ['underground-crystal-cave.ts', '3c4cca383331e606cff026fed51e2ff00f28048b'],
  scene: ['underground-crystal-cave-scene.ts', '1a44081908b7a4b6e5cd6ad911da68e623e292de'],
};
const digest = (contents, name) => createHash(name).update(contents).digest('hex');
function provenance(file, contents) {
  const blob = createHash('sha1').update(`blob ${contents.length}\0`).update(contents).digest('hex');
  return { file, blob, sha256: digest(contents, 'sha256') };
}
const caveFiles = Object.entries(sources).map(([key, [file, expected]]) => {
  const contents = execFileSync('git', ['show', `${caveCommit}:${sourceDir}/${file}`], { cwd: repo });
  const pin = provenance(file, contents);
  assert.equal(pin.blob, expected);
  return [key, pin, contents];
});
const mimicFile = 'underground-crystal-mimic.ts';
const pins = Object.fromEntries(caveFiles.map(([key, pin]) => [key, pin]));
pins.mimic = provenance(mimicFile, await readFile(resolve(repo, sourceDir, mimicFile)));
const scratch = await mkdtemp(resolve(tmpdir(), 'u3-crystal-review-'));
let server;
let browser;
const errors = [];
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="icon" href="data:,">
<style>body{margin:0;background:#182333;color:#e4ebf3;font:14px system-ui}header{height:44px;padding:0 18px;display:flex;align-items:center;justify-content:space-between}canvas{display:block}</style>
<header>左：U‑9 真晶簇　右：U‑3 候选<span></span></header><main></main><script type="module" src="/tools/fixtures/underground-crystal-mimic-review.ts"></script></html>`;

try {
  await Promise.all(caveFiles.map(([, pin, contents]) => writeFile(resolve(scratch, pin.file), contents)));
  await mkdir(output, { recursive: true });
  server = await createServer({
    configFile: false, root: repo, publicDir: false, cacheDir: resolve(scratch, 'vite'),
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: [
      { find: '@u9-layout', replacement: resolve(scratch, pins.layout.file) },
      { find: '@u9-scene', replacement: resolve(scratch, pins.scene.file) },
      { find: /^three$/, replacement: resolve(repo, 'node_modules/three/build/three.module.js') },
    ] },
    plugins: [{ name: 'u3-review', configureServer(vite) {
      vite.middlewares.use('/u3-review', (_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(html);
      });
    } }],
    server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [repo, scratch] } },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page=await browser.newPage({viewport:{width:1120,height:824}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>errors.push(String(request.failure()?.errorText)+' '+request.url()));
  page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${response.url()}`);});
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(`http://127.0.0.1:${address.port}/u3-review`,{waitUntil:'networkidle',timeout:15000});
  await page.waitForFunction(()=>typeof window.mimicProbe?.inspection==='function',null,{timeout:12000});
  const inspection=await page.evaluate(()=>window.mimicProbe.inspection());
  const frames={};
  async function capture(t,label,file,gaze=false){
    const frame=await page.evaluate(({t,gaze,label})=>window.mimicProbe.update(t,gaze,label),{t,gaze,label});
    const png=await page.screenshot({path:resolve(output,file),animations:'disabled'});
    frames[file]={...frame,sha256:digest(png,'sha256')};
    return frame;
  }
  const sweep=(a,b,step,gaze)=>page.evaluate(args=>window.mimicProbe.range(...args),[a,b,step,gaze]);
  const refresh=(t,gaze=false)=>page.evaluate(({t,gaze})=>window.mimicProbe.update(t,gaze),{t,gaze});
  const hit=(t,id,weapon)=>page.evaluate(({t,id,weapon})=>window.mimicProbe.hit(t,id,weapon),{t,id,weapon});
  const before=await capture(0,'0.0 秒 · 伪装静止','paired-rest.png');
  const firstHalf=await sweep(100,2000,100,false);
  const peak=await capture(2000,'2.0 秒 · 呼吸峰值','paired-breath-peak.png');
  const secondHalf=await sweep(2100,4000,100,false);
  const oneCycle=await capture(4000,'4.0 秒 · 归回原高','paired-breath-return.png');
  const breath=[before,...firstHalf,...secondHalf];
  const gaze=await sweep(4000,7000,100,true);
  const recognition=gaze.at(-1);
  const openStart=await sweep(7100,7600,100,false);
  const halfway=await capture(7600,'识破 +0.6 秒 · 展开中','reveal-mid.png');
  const openEnd=await sweep(7700,8200,100,false);
  const unfold=[...openStart,...openEnd];
  const stood=await capture(8200,'识破 +1.2 秒 · 站直停顿','reveal-stood.png');
  const latePause=await refresh(8699);
  const premature=await hit(8699,'paused-attack','snowball');
  const combat=await capture(8700,'识破 +1.7 秒 · 战斗状态','reveal-combat.png');
  const actions=[await hit(8701,'combat-snowball','snowball'),await hit(8702,'pick-1','pickaxe'),await hit(8703,'pick-1','pickaxe'),await hit(8704,'pick-2','pickaxe'),await hit(8705,'pick-3','pickaxe')];
  const defeat=await capture(8705,'击败 · 同型晶碎屑','same-mineral-drop.png');
  const lastGlint=await refresh(18704);
  const off=await refresh(18705);
  const rise=peak.tip[1]-before.tip[1];
  const maxRootDrift=Math.max(...[...breath,...gaze,...unfold,combat,defeat].map(frame=>frame.rootDrift));
  const maxU9Drift=Math.max(...[...breath,...gaze,...unfold,combat,defeat].map(frame=>frame.originalDrift));
  const evidence={browser:browser.version(),caveCommit,pins,inspection,measurements:{rise,peak:peak.state.breathScale,periodMs:4000,maxRootDrift,maxU9Drift},frames,breath,gaze,unfold,recognition,halfway,stood,latePause,premature,combat,actions,defeat,lastGlint,off,errors};
  await writeFile(resolve(output,'u3-crystal-browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  assert.deepEqual(errors,[]);
  assert.equal(inspection.region,'crystal-hall');
  assert.equal(inspection.pathOffset,1.65);
  assert.ok(inspection.standable&&inspection.sameGeometry&&inspection.gapToRoute>.27);
  assert.equal(breath.length,41);
  assert.equal(before.state.breathScale,1);
  assert.equal(peak.state.breathScale,1.025);
  assert.equal(oneCycle.state.breathScale,1);
  assert.ok(rise>.02&&rise<.035);
  assert.equal(maxRootDrift,0);
  assert.equal(maxU9Drift,0);
  assert.ok(gaze.every(frame=>frame.sight.clear));
  assert.equal(gaze.at(-2).state.phase,'disguised');
  assert.equal(recognition.result.kind,'revealed');
  assert.equal(recognition.result.damage,0);
  assert.equal(recognition.state.recognition.source,'gaze');
  assert.equal(halfway.state.unfoldProgress,.5);
  assert.equal(stood.state.phase,'pausing');
  assert.equal(latePause.state.canAttack,false);
  assert.equal(premature.kind,'immune');
  assert.equal(combat.state.canAttack,true);
  assert.deepEqual(actions.map(action=>action.kind),['slowed','damaged','duplicate','damaged','defeated']);
  assert.deepEqual(defeat.state.drop,{crystalKind:'blue-crystal',grade:2});
  assert.ok(lastGlint.state.glowOpacity>0);
  assert.equal(off.state.glowOpacity,0);
  assert.ok(Object.values(frames).every(frame=>frame.glError===0));
  console.log(JSON.stringify({pins,inspection,frames:Object.keys(frames),rise,maxRootDrift,maxU9Drift,recognition,actions,errors}));
} catch (error) {
  console.error(error, errors);
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } finally {
    try { await server?.close(); } finally { await rm(scratch, { force: true, recursive: true }); }
  }
}
