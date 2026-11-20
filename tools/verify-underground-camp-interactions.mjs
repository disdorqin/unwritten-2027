import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

assert.ok(process.argv[2], 'Use: node tools/verify-underground-camp-interactions.mjs <evidence-dir>');
const output = resolve(process.argv[2]);
const repo = fileURLToPath(new URL('../', import.meta.url));
const mineSource = '2966d9f05329084b8fb9072f997f5da6e7a4586a:tools/voxel-tavern/town-blockout/underground-mine-layout.ts';
const expectedMineBlob = '1f1ab0da6785b1df3ab3112870940f5b7f3a6921';
const mine = execFileSync('git', ['show', mineSource], { cwd: repo });
assert.equal(createHash('sha1').update(`blob ${mine.length}\0`).update(mine).digest('hex'), expectedMineBlob);
const scratch = await mkdtemp(resolve(tmpdir(), 'camp-review-'));
const localMine = resolve(scratch, 'first-mine.ts');
await writeFile(localMine, mine);
await mkdir(output, { recursive: true });
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="icon" href="data:,">
<style>body{margin:0;background:#242421;color:#f0e9dc;font:16px system-ui} output{position:absolute;bottom:20px;left:24px;padding:6px;background:#242421}</style>
<main><output></output></main><script type="module" src="/tools/fixtures/underground-camp-interactions-review.ts"></script>`;
const server = await createServer({
  configFile: false, root: repo, publicDir: false, cacheDir: resolve(scratch, 'vite'),
  resolve: { alias: [
    { find: '@first-mine', replacement: localMine },
    { find: /^three$/, replacement: resolve(repo, 'node_modules/three/build/three.module.js') },
  ] },
  plugins: [{ name: 'camp-review', configureServer(vite) {
    vite.middlewares.use('/camp-review', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });
  } }],
  server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [repo, scratch] } },
});

let browser;
try {
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 740, height: 500 } });
  page.setDefaultTimeout(12_000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto(`http://127.0.0.1:${address.port}/camp-review`);
  await page.waitForFunction(() => typeof window.campInteractionsProbe?.inspect === 'function');
  await page.locator('canvas').click();
  await page.evaluate(() => window.addEventListener('keydown', event => {
    window.lastCampReviewKey = { code: event.code, key: event.key, repeat: event.repeat,
      altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
      target: event.target?.tagName, prevented: event.defaultPrevented, trusted: event.isTrusted };
  }));
  const go = id => page.evaluate(id => window.campInteractionsProbe.go(id), id);
  const inspect = () => page.evaluate(() => window.campInteractionsProbe.inspect());
  const hint = page.locator('output');
  const prompt = async text => {
    try {
      await page.waitForFunction(text => document.querySelector('output').textContent.includes(text), text);
    } catch (error) {
      console.error('Prompt missed:', text, (await hint.textContent()), await inspect(),
        await page.evaluate(() => window.lastCampReviewKey));
      throw error;
    }
    assert.equal(await hint.isVisible(), true);
  };
  await go('dorm-1');
  await page.waitForFunction(() => {
    const audio = window.campInteractionsProbe.inspect().audio;
    return audio.state === 'running' && audio.room > .0275 && audio.hearth > .0055;
  });
  const standingAudio = (await inspect()).audio;
  async function expectAudio(roomRange, hearthRange) {
    await page.waitForFunction(({ baseline, roomRange, hearthRange }) => {
      const audio = window.campInteractionsProbe.inspect().audio;
      const room = audio.room / baseline.room;
      const hearth = audio.hearth / baseline.hearth;
      return room >= roomRange[0] && room <= roomRange[1] &&
        hearth >= hearthRange[0] && hearth <= hearthRange[1];
    }, { baseline: standingAudio, roomRange, hearthRange });
    return (await inspect()).audio;
  }
  const beds = [];
  for (let i = 1; i <= 6; i++) {
    const id = 'dorm-' + i;
    await go(id);
    await prompt('床边坐下');
    await page.keyboard.press('KeyE');
    await prompt('起身');
    const sat = await inspect();
    assert.equal(sat.seat, id);
    const seatedAudio = await expectAudio([.55, .74], [1.65, 2.15]);
    if (i === 1) {
      await page.evaluate(() => window.campInteractionsProbe.tick(2500));
      await page.waitForFunction(() => window.campInteractionsProbe.inspect().interaction.rested);
      await page.screenshot({ path: resolve(output, 'seated.png') });
    }
    await page.keyboard.press('KeyE');
    await prompt('床边坐下');
    const stood = await inspect();
    assert.equal(stood.seat, null);
    const restoredAudio = await expectAudio([.90, 1.10], [.90, 1.10]);
    beds.push({ id, seatedAudio, restoredAudio });
  }
  await go('dorm-1');
  await prompt('床边坐下');
  await page.keyboard.press('KeyE');
  await expectAudio([.55, .74], [1.65, 2.15]);
  await page.evaluate(() => window.campInteractionsProbe.leaveCamp());
  const outsideAudio = await expectAudio([0, .10], [0, .10]);
  await go('bowl');
  const reenteredAudio = await expectAudio([.90, 1.10], [.90, 1.10]);
  await prompt('留碗');
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.campInteractionsProbe.inspect().relics.length === 1);
  await page.keyboard.press('e');
  const bowl = await inspect();
  assert.deepEqual(bowl.relics, ['mine-canteen-left-bowl:食堂的留碗']);
  await page.screenshot({ path: resolve(output, 'left-bowl.png') });

  await go('memorial');
  const offered = [];
  for (let count = 1; count <= 3; count++) {
    await prompt('献一盏灯');
    await page.keyboard.press('e');
    await page.waitForFunction(n => window.campInteractionsProbe.inspect().tookLamp === n, count);
    await page.waitForFunction(n => window.campInteractionsProbe.inspect().visible.length === n, count === 3 ? 5 : count + 1);
    const state = await inspect();
    assert.equal(state.litNicheIds.length, count);
    assert.equal(state.extraCampLightCount, count === 3 ? 2 : 0);
    assert.equal(state.lanterns, 3 - count);
    assert.ok(state.visible.length <= 5);
    offered.push(state);
  }
  await page.keyboard.press('e');
  assert.equal((await inspect()).tookLamp, 3);
  await page.evaluate(() => window.campInteractionsProbe.headlamp(false));
  await page.waitForFunction(() => window.campInteractionsProbe.inspect().visible.length === 5);
  const lighting = await inspect();
  assert.equal(lighting.visible.filter(name => name.endsWith('guide/light')).length, 2);
  await go('memorial-wide');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: resolve(output, 'three-lamps.png') });
  await page.evaluate(() => window.campInteractionsProbe.clear());
  await page.waitForFunction(() => window.campInteractionsProbe.inspect().visible.length === 0);
  const cleared = await inspect();
  assert.deepEqual(cleared.litNicheIds, []);
  assert.equal(cleared.extraCampLightCount, 0);
  await go('dorm-five-detail');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: resolve(output, 'dorm-five.png') });

  await page.evaluate(() => window.campInteractionsProbe.headlamp(true));
  const enter = id => page.evaluate(id => window.campInteractionsProbe.enterPickaxe(id), id);
  await enter('review-a');
  await prompt('捡起旧铁镐');
  const aimed = (await inspect()).pickaxe;
  assert.equal(aimed.firstHit, 'mine-camp-old-pickaxe');
  assert.equal(aimed.visible, true);
  assert.equal(aimed.foot[1], -91);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await page.screenshot({ path: resolve(output, 'old-pickaxe-aimed.png') });
  await page.evaluate(() => window.campInteractionsProbe.aimAtPickaxe(false));
  const away = (await inspect()).pickaxe;
  assert.notEqual(away.firstHit, 'mine-camp-old-pickaxe');
  assert.ok(!(await hint.textContent()).includes('捡起旧铁镐'));
  await page.keyboard.press('e');
  assert.deepEqual((await inspect()).pickaxe.attemptedProfiles, []);

  await page.evaluate(() => window.campInteractionsProbe.aimAtPickaxe(true));
  await prompt('捡起旧铁镐');
  await page.keyboard.press('e');
  await page.waitForFunction(() => !window.campInteractionsProbe.inspect().pickaxe.visible);
  const picked = (await inspect()).pickaxe;
  assert.deepEqual(picked.receipts, ['review-a']);
  assert.deepEqual(picked.notices, ['review-a']);
  const key = await page.evaluate(() => window.lastCampReviewKey);
  assert.equal(key.code, 'KeyE');
  assert.equal(key.trusted, true);
  assert.equal(key.prevented, true);

  await enter('review-a');
  const reentry = (await inspect()).pickaxe;
  assert.equal(reentry.visible, false);
  assert.ok(!(await hint.textContent()).includes('捡起旧铁镐'));
  await page.keyboard.press('e');
  assert.deepEqual((await inspect()).pickaxe.attemptedProfiles, ['review-a']);
  await enter('review-b');
  await prompt('捡起旧铁镐');
  assert.equal((await inspect()).pickaxe.visible, true);
  await page.keyboard.press('e');
  await page.waitForFunction(() => !window.campInteractionsProbe.inspect().pickaxe.visible);
  const second = (await inspect()).pickaxe;
  assert.deepEqual(second.receipts, ['review-a', 'review-b']);
  assert.deepEqual(second.notices, second.receipts);
  assert.deepEqual(second.attemptedProfiles, second.receipts);
  assert.deepEqual([...errors, ...(await inspect()).errors], []);
  const evidence = { browser: browser.version(), mineBlob: expectedMineBlob, beds,
    audio: { scope: 'Stereo fixture signals through the actual camp mix, measured separately.', standingAudio, outsideAudio, reenteredAudio },
    relics: bowl.relics,
    offered, lighting, cleared, pickaxe: {
      scope: 'Registered aim and accepted footing in the original mine. Inventory persistence is a fixture port shared by two sequential profiles.',
      aimed, away, picked, key, reentry, second,
    }, errors };
  await writeFile(resolve(output, 'camp-interactions.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('Camp interactions: six seat cycles, one relic, three offerings, two guide lights, and a sight-gated pickaxe grant per profile.');
} finally {
  try { await browser?.close(); } finally {
    await server.close();
    await rm(scratch, { force: true, recursive: true });
  }
}
