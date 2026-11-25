import assert from 'node:assert/strict';
import { createMeteorCrater, meteorCraterFloorRadius, meteorCraterRimRadius } from './meteor-crater.ts';

const crater = createMeteorCrater({
  terraces: [{ outerRadius: 50, innerRadius: 46, depth: 7 }, { outerRadius: 41, innerRadius: 37, depth: 16 },
    { outerRadius: 32, innerRadius: 27, depth: 26 }],
  mainTrail: { startBearing: .7, turns: 3.5, halfWidth: 1, shoulderWidth: 1, maxGrade: .1 },
});
const mesh = crater.buildPreviewSurface(meteorCraterRimRadius / 30);
const run = meteorCraterRimRadius - meteorCraterFloorRadius;
function samples(direction, north, stride) {
  const points = Math.ceil(run / stride);
  const result = [];
  for (let i = 0; i <= points; i++) {
    const east = direction * (meteorCraterRimRadius - Math.min(run, stride * i));
    const height = mesh.heightAt(east, north);
    assert.notEqual(height, undefined, `no supporting triangle at E${east},N${north}`);
    result.push({ east, height });
  }
  return result;
}
function changes(points) {
  return points.slice(1).map((point, index) => ({
    span: Math.abs(point.east - points[index].east), dy: point.height - points[index].height, to: point,
  }));
}
const report = [];
for (const [name, direction] of [['west', -1], ['east', 1]]) for (const north of [0, -.27, .27]) {
  const dense = samples(direction, north, .025);
  const edges = changes(dense);
  const native = changes(samples(direction, north, 11.3 / 60));
  const steepest = edges.reduce((a, b) => Math.abs(a.dy) / a.span > Math.abs(b.dy) / b.span ? a : b);
  const rounded = n => +n.toFixed(6);
  report.push({
    direction: name, north, denseSamples: dense.length,
    startHeight: rounded(dense[0].height), endHeight: rounded(dense.at(-1).height),
    peakAbsoluteGradePercent: rounded(100 * Math.abs(steepest.dy) / steepest.span),
    steepestDestEast: rounded(steepest.to.east),
    uphillEdgesOverTolerance: edges.filter(edge => edge.dy > .025).length,
    largestNativeStep: rounded(Math.max(...native.map(edge => Math.abs(edge.dy)))),
    nativeEdgesOverStepHeight: native.filter(edge => Math.abs(edge.dy) > .43).length,
  });
}
console.log(JSON.stringify({ context: 'radial diagnostic-only samples of the intact preview mesh',
  triangles: mesh.indices.length / 3, routes: report }, null, 2));
