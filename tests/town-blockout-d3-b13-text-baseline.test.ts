import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {houseDoorBookCopy,houseDoorZones} from '../tools/voxel-tavern/town-blockout/town-house-door-book';
import {
  beaconDriftTableSeconds,surveyPlateLines,surveyNotesPageText,
  surveyRubbingUnlockCount,createSurveyRubbings,
} from '../tools/voxel-tavern/town-blockout/town-survey';

const doc=readFileSync(new URL('../docs/交流区/GPT/2026-11-21-窗D-D3-B13底本与测绘线文案定版.md',import.meta.url),'utf8');

test('D3 is a literal three-line transcription of B official M4–M7 survey plate authority',()=>{
  for(let i=4;i<=7;i++){
    const id=`M${i}` as 'M4'|'M5'|'M6'|'M7';
    const lines=surveyPlateLines(id);
    assert.equal(lines.length,3);
    assert.equal(beaconDriftTableSeconds[i-1],50+(i-1)*11);
    assert.ok(doc.includes(`| ${id} | ${lines[0]} | ${lines[1]} | ${lines[2]} |`),
      `D text must match exact B-window in-game plate lines for ${id}`);
  }
  assert.equal(surveyRubbingUnlockCount,5);
  assert.ok(doc.includes(surveyNotesPageText));
  const scratch=createSurveyRubbings();
  for(const id of ['M4','M5','M6','M7'] as const)scratch.record(id);
  assert.equal(scratch.notesUnlocked(),false);
  scratch.record('M3');assert.equal(scratch.notesUnlocked(),true);
});

test('D3 B13 baseline copies official hundred-door texts, not invented gameplay copy',()=>{
  for(const original of [houseDoorBookCopy.title,houseDoorBookCopy.introduction,
      houseDoorBookCopy.blocked])assert.ok(doc.includes(original));
  for(const [,name]of houseDoorZones)assert.ok(doc.includes(name));
  assert.ok(doc.includes('冷路未验、未放行'));
  for(const number of ['66.6','62.5','79.1','91.7','83.3','76,723,200']) {
    assert.ok(doc.includes(number));
  }
  assert.equal(houseDoorZones.length,5);
});
