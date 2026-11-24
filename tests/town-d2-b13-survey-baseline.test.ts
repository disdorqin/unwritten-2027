import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import * as baselineModule from '../tools/voxel-tavern/town-blockout/town-d2-b13-survey-baseline';
import {b13SurveyBaseline} from '../tools/voxel-tavern/town-blockout/town-d2-b13-survey-baseline';
import {surveyPlateLines} from '../tools/voxel-tavern/town-blockout/town-survey';

const expectedPlateLines = {
  M4: ['M4', '入云', '过此入云海 · 跟着铃走'],
  M5: ['M5', '鞍口', '风口 · 站稳了再量'],
  M6: ['M6', '雪原', '离顶不远 · 话别多说'],
  M7: ['M7', '望顶', '绝顶在望 · 一步一喘'],
} as const;

function assertDeeplyFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value), 'every baseline object and array must be frozen');
  for (const child of Object.values(value)) assertDeeplyFrozen(child, seen);
}

function findForbiddenGateData(value: unknown, found: string[] = [], path = 'baseline'): string[] {
  if (value === null || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    if (value.length === 12) found.push(`${path}: twelve-item array`);
    if (value.length === 3 && value.every(item => typeof item === 'number')) {
      found.push(`${path}: numeric triple`);
    }
    value.forEach((item, index) => findForbiddenGateData(item, found, `${path}[${index}]`));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (['gates', 'sledGates', 'officialGatePositions', 'east', 'north', 'halfWidth'].includes(key)) {
      found.push(`${path}.${key}`);
    }
    findForbiddenGateData(child, found, `${path}.${key}`);
  }
  return found;
}

test('B13 baseline records the D2 integration base and current M4–M7 copy literally', () => {
  assert.deepEqual(b13SurveyBaseline.integrationBaseline, {
    branch: 'town-blockout-lane-d2',
    integrationCommit: '5ce6a55d',
    package: 'B13 测绘线底本包',
  });
  assert.deepEqual(b13SurveyBaseline.surveyLine.stationIds, ['M4', 'M5', 'M6', 'M7']);
  assert.deepEqual(b13SurveyBaseline.surveyLine.canonicalPlateLines, expectedPlateLines);
  assert.deepEqual(b13SurveyBaseline.surveyLine.source, {
    path: 'docs/交流区/Muse/设计-全图文字件总表-2026-11-22.md',
    lines: '134-138',
  });
});

test('M4–M7 values agree with the cited current text table', () => {
  const table = readFileSync(new URL(
    '../docs/交流区/Muse/设计-全图文字件总表-2026-11-22.md', import.meta.url,
  ), 'utf8');
  for (const [station, lines] of Object.entries(expectedPlateLines)) {
    assert.ok(table.includes(`${station}／${lines[1]}（站名）／${lines[2]}（副行）`), station);
  }
});

test('the elevation row stays missing and unfinalized without invented text or values', () => {
  const row = b13SurveyBaseline.surveyLine.elevationRow;
  assert.equal(row.status, '缺·未定稿');
  assert.equal(row.approved, false);
  assert.deepEqual(row.stationIds, ['M4', 'M5', 'M6', 'M7']);
  assert.deepEqual(Object.keys(row).sort(), ['approved', 'note', 'source', 'stationIds', 'status']);
  assert.doesNotMatch(JSON.stringify(row), /TBD|TODO|\?\?\?|×××/);
});

test('D-03 pins 0/12 valid positions, 12/12 rejected preview candidates and 6037.881m', () => {
  const audit = b13SurveyBaseline.d03GateAudit;
  assert.equal(audit.status, '阻塞');
  assert.equal(audit.officialValidGatePositions, '0/12');
  assert.equal(audit.officialGateCount, 0);
  assert.equal(audit.requiredGateCount, 12);
  assert.equal(audit.oldPreviewCandidateRejection, '12/12');
  assert.equal(audit.oldPreviewCandidatesRejected, 12);
  assert.equal(audit.oldPreviewCandidateCount, 12);
  assert.equal(audit.nominalLengthMetres, 6037.881);
  assert.equal(audit.officialPositionsExported, false);
  assert.equal(audit.gateGeometryExported, false);
  assert.deepEqual(audit.sources, [
    {
      path: 'docs/交流区/提单/D-03-绝顶雪橇十二旗门正式测绘门禁.md',
      lines: '3-7,22-29',
    },
    {
      path: 'docs/交流区/GPT/2026-11-21-窗D-D03十二门否决测绘与B13底本移交.md',
      lines: '17-42',
    },
  ]);
});

test('D-03 values agree with both cited audit documents', () => {
  const ticket = readFileSync(new URL(
    '../docs/交流区/提单/D-03-绝顶雪橇十二旗门正式测绘门禁.md', import.meta.url,
  ), 'utf8');
  const receipt = readFileSync(new URL(
    '../docs/交流区/GPT/2026-11-21-窗D-D03十二门否决测绘与B13底本移交.md', import.meta.url,
  ), 'utf8');
  assert.ok(ticket.includes('6,037.881 m'));
  assert.ok(ticket.includes('没有虚构完整有效 12 旗门'));
  assert.ok(receipt.includes('12/12 旧候选被否决，有效正式门位表 0/12'));
});

test('B13 cold-route evidence keeps all five peak-frame values and the unreleased state', () => {
  const evidence = b13SurveyBaseline.b13ColdRouteEvidence;
  assert.equal(evidence.custody, 'B13 托管·冷路证据');
  assert.equal(evidence.status, '未验、未放行');
  assert.equal(evidence.frameLimitMs, 50);
  assert.deepEqual(evidence.originalFourRunPeakFrameMs, [66.6, 62.5, 79.1, 91.7]);
  assert.deepEqual(evidence.acquisitionFrame, {
    frame: 68,
    frameMs: 83.3,
    totalFrames: 192,
    evidenceCommit: 'feda50e',
  });
  assert.deepEqual(evidence.source, {
    path: 'docs/交流区/Muse/回执-D窗首份-对账与移交清点-2026-11-21.md',
    lines: '41-46',
  });
});

test('B13 cold-route values agree with the cited handover receipt', () => {
  const receipt = readFileSync(new URL(
    '../docs/交流区/Muse/回执-D窗首份-对账与移交清点-2026-11-21.md', import.meta.url,
  ), 'utf8');
  assert.ok(receipt.includes('66.6 / 62.5 / 79.1 / 91.7 ms'));
  assert.ok(receipt.includes('第 68 帧 83.3 ms'));
  assert.ok(receipt.includes('状态＝未验、未放行'));
});

test('legacy town-survey derived lines and their current-copy differences are preserved', () => {
  const difference = b13SurveyBaseline.legacyTownSurveyDifference;
  assert.equal(difference.source.path, 'tools/voxel-tavern/town-blockout/town-survey.ts');
  assert.equal(difference.source.symbol, 'surveyPlateLines');
  assert.equal(difference.canonicalSource.path,
    'docs/交流区/Muse/设计-全图文字件总表-2026-11-22.md');
  assert.ok(difference.summary.includes('觇标／标尺／方位'));
  assert.ok(difference.summary.includes('编号／站名／副行'));
  assert.ok(difference.summary.includes('旧模块保持不改'));
  assert.deepEqual(difference.stations.map(row => row.station), ['M4', 'M5', 'M6', 'M7']);
  for (const row of difference.stations) {
    assert.deepEqual(row.legacyLines, surveyPlateLines(row.station));
    assert.deepEqual(row.canonicalLines, expectedPlateLines[row.station]);
    assert.notDeepEqual(row.legacyLines, row.canonicalLines);
  }
});

test('the module exports no gate array or formal positions and is deeply immutable', () => {
  assert.deepEqual(Object.keys(baselineModule), ['b13SurveyBaseline']);
  assert.deepEqual(findForbiddenGateData(b13SurveyBaseline), []);
  assertDeeplyFrozen(b13SurveyBaseline);
  assert.equal(Reflect.set(b13SurveyBaseline.surveyLine.canonicalPlateLines.M4, 0, 'changed'), false);
  assert.equal(Reflect.set(b13SurveyBaseline.d03GateAudit, 'officialGateCount', 12), false);
  assert.equal(Reflect.set(b13SurveyBaseline.b13ColdRouteEvidence.originalFourRunPeakFrameMs, 0, 1), false);
});
