import assert from 'node:assert/strict';
import { createUndergroundReview } from './tools/voxel-tavern/town-blockout/town-expansion-review-underground.ts';
import { createMeteorCrater } from './tools/voxel-tavern/town-blockout/meteor-crater.ts';

let rendered;
createUndergroundReview(view => { rendered = view; }).show();
assert.ok(rendered);
const mesh = rendered.group.children[0];
assert.ok(mesh.isMesh);
const geometry = mesh.geometry;
const points = geometry.attributes.position.array;
const faces = geometry.index.array;
assert.equal(points.constructor.name, 'Float32Array');

const crater = createMeteorCrater({
  terraces: [{ outerRadius: 50, innerRadius: 46, depth: 7 },
    { outerRadius: 41, innerRadius: 37, depth: 16 }, { outerRadius: 32, innerRadius: 27, depth: 26 }],
  mainTrail: { startBearing: .7, turns: 3.5, halfWidth: 1, shoulderWidth: 1, maxGrade: .1 },
});
const triangleTolerance = 1e-7;
const lines = [0, -.27, .27].map(offset => {
  const hits = [];
  const edges = { count: 0, aboveTenPercent: 0, peakGrade: 0, maxError: 0 };
  let previous;
  for (let i=0; i<=1500; i++) {
    const point = crater.mainTrailPoint(i/1500);
    const scale = 1 + offset / Math.hypot(point.east, point.north);
    const p = [point.east * scale, -point.north * scale];
    let y;
    for (let index=0; index<faces.length; index+=3) {
      const a = 3*faces[index], b=3*faces[index+1], c=3*faces[index+2];
      const bx=points[b]-points[a], bz=points[b+2]-points[a+2];
      const cx=points[c]-points[a], cz=points[c+2]-points[a+2];
      const px=p[0]-points[a], pz=p[1]-points[a+2];
      const divisor=bx*cz-bz*cx;
      if (divisor===0) continue;
      const vb=(px*cz-pz*cx)/divisor;
      const vc=(bx*pz-bz*px)/divisor;
      const va=1-vb-vc;
      if (Math.min(va,vb,vc) >= -triangleTolerance) {
        y=va*points[a+1]+vb*points[b+1]+vc*points[c+1];
        break;
      }
    }
    if (y === undefined) {
      previous=undefined;
      continue;
    }
    if (previous) {
      const grade=Math.abs(y-previous.y)/Math.hypot(p[0]-previous.p[0],p[1]-previous.p[1]);
      edges.count++;
      if (grade>.10) edges.aboveTenPercent++;
      edges.peakGrade=Math.max(edges.peakGrade,grade);
    }
    previous={p,y};
    edges.maxError=Math.max(edges.maxError,Math.abs(y-point.heightOffset));
    hits.push(i);
  }
  return { offset, hits: hits.length, firstHit: hits[0], lastHit: hits.at(-1),
    edgeCount:edges.count, edgesAbove10Percent:edges.aboveTenPercent,
    peakPercent:(100*edges.peakGrade).toFixed(6), maxError:edges.maxError.toFixed(9) };
});
console.log(JSON.stringify({ snapshot:process.cwd().split('/').at(-1), vertices:points.length/3, triangles:faces.length/3, lines },null,2));
