import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const checkout = process.cwd();
const root = path.join(checkout, 'tools', 'voxel-tavern');
const output = process.argv[2] && path.resolve(process.argv[2]);
assert.ok(output, 'Usage: run from the source checkout with an output directory');
await mkdir(output, { recursive: true });

const requireRoot = createRequire(path.join(checkout, 'package.json'));
const requireVite = createRequire(path.join(root, 'package.json'));
const vite = path.resolve(path.dirname(requireVite.resolve('vite/package.json')), 'dist/node/index.js');
const { createServer } = await import(pathToFileURL(vite));
const { chromium } = requireRoot('playwright');
const result = { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), status: 'failed' };

let server, browser;
try {
  server = await createServer({ root, configFile: false, logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.SKY_CITY_CHROME,
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/sky-city-review.html`;
  assert.equal((await page.goto(url)).status(), 200);

  result.collision = await page.evaluate(async () => {
    const { mountSkyCity } = await import('/town-blockout/sky-city.ts');
    const city = mountSkyCity({ add() {} });
    city.show('full');
    try {
      const model = city.footModel();
      const [gateX, gateY, gateZ] = model.gate;
      const paths = [
        { name: 'crystal court', from: { x: -8, y: 0, z: 0 }, to: { x: 8, y: 0, z: 0 } },
        { name: 'locked gate', from: { x: gateX - 2.5, y: gateY, z: gateZ }, to: { x: gateX + 2.5, y: gateY, z: gateZ } },
      ];
      return {
        paths: paths.map(({ name, from, to }) => ({
          name, from, to,
          startSupported: !!model.step(from, from.x, from.z),
          endSupported: !!model.step(to, to.x, to.z),
          forwardBlocked: model.step(from, to.x, to.z) === undefined,
          backwardBlocked: model.step(to, from.x, from.z) === undefined,
        })),
        clearMovement: model.step({ x: 0, y: 0, z: 10 }, 0, 15),
      };
    } finally {
      city.dispose();
    }
  });
  assert.deepEqual(result.collision.clearMovement, { x: 0, y: 0, z: 15 });
  for (const { name, startSupported, endSupported, forwardBlocked, backwardBlocked } of result.collision.paths) {
    assert.ok(startSupported && endSupported && forwardBlocked && backwardBlocked, name);
  }
  result.status = 'passed';
} catch (error) {
  result.failure = error.stack;
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  await writeFile(path.join(output, 'sky-city-sweep-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
