import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTownWeatherOptions } from '../../src/presence/town-weather-config';
import { createTownOutdoorWeatherHost } from '../../src/presence/town-outdoor-weather';

const dawn = Date.UTC(2026, 0, 1);
const windAt = dawn + 30 * 60_000;
const warningAt = windAt - 30_000;

test('G-09 durable warning receipt is atomic and suppresses replay after a process restart', t => {
  const directory = mkdtempSync(join(tmpdir(), 'unwritten-g09-restart-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'warning-receipt.json');
  const options = readTownWeatherOptions(dawn, path);
  assert.equal(options.dawnEpoch, dawn);
  assert.equal(options.restoredWarningAt, null);
  const emitted: unknown[] = [];
  let now = warningAt - 1;
  const host = createTownOutdoorWeatherHost({
    now: () => now, dawnEpoch: options.dawnEpoch,
    saveWarning: options.saveWarning,
    broadcast: event => emitted.push(event),
  }, options.restoredWarningAt);
  now = warningAt;
  host.tick();
  assert.equal(emitted.length, 1);
  assert.equal(readFileSync(path, 'utf8'), String(warningAt));
  assert.deepEqual(readTownWeatherOptions(dawn, path).restoredWarningAt, warningAt);
  const second = readTownWeatherOptions(dawn, path);
  const restarted = createTownOutdoorWeatherHost({
    now: () => now, dawnEpoch: second.dawnEpoch,
    saveWarning: second.saveWarning,
    broadcast: event => emitted.push(event),
  }, second.restoredWarningAt);
  assert.equal(restarted.snapshot().weather, 'clear-snow');
  restarted.tick();
  assert.equal(emitted.length, 1, 'same warning must not ring again after restart');
  now = windAt;
  restarted.tick();
  assert.equal(emitted.length, 2, 'new state change still publishes after restart');
});

test('G-09 startup refuses malformed or tampered receipts rather than silently replaying cues', t => {
  const directory = mkdtempSync(join(tmpdir(), 'unwritten-g09-receipt-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'warning.json');
  assert.throws(() => readTownWeatherOptions(-1, path), RangeError);
  assert.throws(() => readTownWeatherOptions(dawn, ''), RangeError);
  writeFileSync(path, '-1');
  assert.throws(() => readTownWeatherOptions(dawn, path), /Invalid town night beacon receipt/);
  writeFileSync(path, 'not json');
  assert.throws(() => readTownWeatherOptions(dawn, path), SyntaxError);
  writeFileSync(path, JSON.stringify({ at: warningAt }));
  assert.throws(() => readTownWeatherOptions(dawn, path), /Invalid town night beacon receipt/);
  writeFileSync(path, String(warningAt));
  assert.equal(readTownWeatherOptions(dawn, path).restoredWarningAt, warningAt);
});
