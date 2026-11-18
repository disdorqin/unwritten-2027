import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const muse = new URL('../docs/交流区/Muse/背景音乐重设计稿-v2.1.md', import.meta.url);
const previewPage = new URL('../docs/交流区/GPT/未写镇BGM-v3-试听30秒.html', import.meta.url);
const [design, html] = await Promise.all([muse, previewPage].map(path => readFile(path, 'utf8')));

const oldBars = [...design.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+)\|\s*([\d *]+)\|\s*([^|]+)\|/gm)]
  .map(([, number, notation, midi], index) => {
    assert.equal(Number(number), index + 1);
    const times = [...notation.matchAll(/\(([\d.]+)\)/g)].map(match => Number(match[1]));
    const pitches = midi.replaceAll('*', '').trim().split(/\s+/).map(Number);
    assert.equal(pitches.length, times.length);
    return pitches.map((pitch, i) => [pitch, times[i]]);
  });
const scoreMarkup = html.match(/<script id="score" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(scoreMarkup, 'The audition must expose the exact score its synthesizer reads');
const score = JSON.parse(scoreMarkup[1]);
const { bars, bpm, previewBars, graces } = score;

assert.equal(bpm, 88);
assert.equal(previewBars, 11);
assert.equal(bars.length, 16);
assert.equal(oldBars.length, bars.length);
assert.deepEqual(bars.map(row => row.reduce((sum, note) => sum + note[1], 0)), Array(16).fill(4));
assert.deepEqual(bars.map(row => row.map(note => note[1])), oldBars.map(row => row.map(note => note[1])));
assert.deepEqual([3, 7, 11, 15].map(index => bars[index].at(-1)), [[69, 2], [62, 2], [69, 2], [62, 4]]);
const adjustments = bars.flatMap((row, index) => row.flatMap(([midi], note) =>
  oldBars[index][note][0] === midi ? [] : [{ bar: index + 1, note: note + 1, from: oldBars[index][note][0], midi }]));
assert.deepEqual(adjustments.map(({ bar, note }) => [bar, note]), [[3, 2], [5, 2], [13, 2]]);
assert.deepEqual(bars[2], bars[12]);
assert.equal(graces.length, 3);

const excerpts = [
  // Textbook p. 50, first 12 note attacks in the first theme, 1=G.
  { title: '喜洋洋', tonic: 67, pitches: [74, 74, 76, 74, 71, 69, 74, 74, 76, 74, 71, 69] },
  // 1936 Pathé restoration score v1.1, first 16 note attacks marked 骨幹（參考）.
  { title: '步步高', tonic: 67, pitches: [67, 67, 71, 69, 67, 66, 64, 66, 67, 66, 67, 71, 67, 64, 64, 64] },
  // WKU score p. 1, first 14 verse note attacks, no instrumental intro, transcribed in a common C scale.
  { title: '恭喜恭喜', tonic: 60, pitches: [57, 59, 60, 62, 65, 64, 64, 64, 69, 69, 64, 64, 62, 62] }
];

function linearize(rows, ornaments = []) {
  return rows.flatMap((row, barIndex) => row.flatMap(([midi], noteIndex) => {
    const bar = barIndex + 1;
    const note = noteIndex + 1;
    const grace = ornaments.find(candidate => candidate.bar === bar && candidate.note === note);
    return [...(grace ? [{ ...grace, grace: true }] : []), { midi, bar, note }];
  }));
}

function compareFiveNotes(project, reference) {
  const count = 5;
  const matches = [];
  let checked = 0;
  for (let i = 0; i + count <= project.length; i++) {
    const phrase = project.slice(i, i + count);
    const first = phrase[0];
    for (let j = 0; j + count <= reference.pitches.length; j++) {
      checked++;
      const ref = reference.pitches.slice(j, j + count);
      const sameIntervals = phrase.every(({ midi }, n) => midi - first.midi === ref[n] - ref[0]);
      if (!sameIntervals) continue;
      const sameTonic = phrase.every(({ midi }, n) => midi - 62 === ref[n] - reference.tonic);
      matches.push({ bar: first.bar, note: first.note, referenceNote: j + 1, sameTonic });
    }
  }
  return { checked, matches };
}

const v21 = linearize(oldBars);
const v3 = linearize(bars);
const v3WithGraces = linearize(bars, graces);
const v3Preview = linearize(bars.slice(0, previewBars), graces);
const results = excerpts.map(reference => ({
  title: reference.title,
  referenceNotes: reference.pitches.length,
  v21: compareFiveNotes(v21, reference),
  v3: compareFiveNotes(v3, reference),
  v3WithGraces: compareFiveNotes(v3WithGraces, reference),
  v3Preview: compareFiveNotes(v3Preview, reference),
}));

assert.deepEqual([...new Set(results[0].v21.matches.map(hit => hit.bar + '-' + hit.note))], ['3-2', '4-4', '5-1']);
assert.equal(results[0].v21.matches.length, 6);
assert.ok(results[0].v21.matches.every(hit => hit.sameTonic));
for (const result of results) {
  assert.equal(result.v3.matches.length, 0, result.title + ' main lead');
  assert.equal(result.v3WithGraces.matches.length, 0, result.title + ' lead with grace notes');
  assert.equal(result.v3Preview.matches.length, 0, result.title + ' audition with grace notes');
}
console.log(JSON.stringify({
  bars: bars.length, previewBars, bpm, adjustments, graces,
  leadNotes: v3.length, previewLeadNotes: v3Preview.length - graces.length,
  results,
}, null, 2));
