// 代码图谱生成器：机械扫描 import 关系，产出 docs/code-graph.json 与统计摘要。
// 用法：node tools/code-graph/generate.mjs [--root <仓库根>] [--out <输出json路径>]
// 纪律：图谱由源码机械生成，不许手写节点/边；重跑即刷新，文档引用数字以本脚本输出为准。
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = resolve(opt('--root', process.cwd()));
const OUT = resolve(opt('--out', join(ROOT, 'docs/code-graph.json')));

const SCAN_DIRS = ['tools/voxel-tavern/town-blockout', 'src'];
const files = [];
function walk(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) files.push(p);
  }
}
SCAN_DIRS.forEach(walk);

const idOf = (p) => p.replace(/\\/g, '/');
const fileSet = new Set(files.map(idOf));
const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

const nodes = new Map();
const edges = [];
for (const f of files) {
  const id = idOf(f);
  const base = basename(f, '.ts');
  const seg = base.replace(/^town-/, '').split('-')[0];
  nodes.set(id, { id, prefix: seg, lines: readFileSync(join(ROOT, f), 'utf8').split('\n').length });
}
for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  const from = idOf(f);
  let m;
  while ((m = importRe.exec(src))) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue;
    let target = idOf(relative(ROOT, resolve(dirname(join(ROOT, f)), spec)));
    if (!target.endsWith('.ts')) target += '.ts';
    if (fileSet.has(target)) edges.push({ from, to: target });
  }
}

const inDeg = new Map(), outDeg = new Map();
for (const e of edges) {
  outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1);
  inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
}
const viewerId = 'tools/voxel-tavern/town-blockout/viewer.ts';
const mounted = new Set(edges.filter(e => e.from === viewerId).map(e => e.to));
const orphans = [...nodes.keys()].filter(id => !inDeg.has(id) && id !== viewerId);

const byPrefix = {};
for (const n of nodes.values()) byPrefix[n.prefix] = (byPrefix[n.prefix] || 0) + 1;

const graph = {
  generatedAt: new Date().toISOString(),
  base: 'town-blockout-integration（生成时工作树）',
  nodeCount: nodes.size,
  edgeCount: edges.length,
  nodes: [...nodes.values()].map(n => ({ ...n, in: inDeg.get(n.id) || 0, out: outDeg.get(n.id) || 0, mountedByViewer: mounted.has(n.id) })),
  edges,
};
writeFileSync(OUT, JSON.stringify(graph, null, 1));

const topIn = [...inDeg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(JSON.stringify({
  nodeCount: nodes.size, edgeCount: edges.length,
  byPrefix: Object.fromEntries(Object.entries(byPrefix).sort((a, b) => b[1] - a[1])),
  viewerDirectImports: mounted.size,
  orphanCount: orphans.length,
  topHubs: topIn.map(([id, d]) => `${id} (${d})`),
}, null, 1));
