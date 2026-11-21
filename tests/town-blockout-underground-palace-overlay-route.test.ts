import assert from 'node:assert/strict';
import test from 'node:test';
import { mountUndergroundPalaceDressing } from '../tools/voxel-tavern/town-blockout/underground-palace-dressing.js';
import { createUndergroundPalaceShell } from '../tools/fixtures/underground-palace-d-shell-snapshot.js';

// Independent regression against Window D's *pinned* 2026-11-21 geometry.
// This is NOT the live palace authority, official -190m underground domain,
// validated multiplayer player, or a reason to open the vault.
test('U-11 overlay does not alter D snapshot walking route or sealed vault', () => {
  const shell = createUndergroundPalaceShell();
  const original = shell.route.map(([e,n]) => shell.canStand(e,n,.27));
  assert.equal(original.length,14);
  assert.ok(original.every(Boolean),'D shell guide endpoints must accept a 27cm capsule');
  const mounted = mountUndergroundPalaceDressing(shell.group);
  try {
    assert.equal(mounted.isVaultPresent,false);
    assert.ok(mounted.visualPieceCount>=7500);
    assert.equal(shell.route.length,14);
    assert.deepEqual(shell.route.map(([e,n]) => shell.canStand(e,n,.27)),original,
      'C-only visual geometry must not mutate the authority-owned D blocker list');
  } finally {
    mounted.dispose();
    shell.dispose();
  }
});

test('U-11 D shell snapshot route is continuously clear between each pair of stations', () => {
  const shell = createUndergroundPalaceShell();
  try {
    const route = shell.route;
    for (let segment=1; segment<route.length; segment++) {
      const [fromE,fromN] = route[segment-1]!;
      const [toE,toN] = route[segment]!;
      const steps=Math.ceil(Math.hypot(toE-fromE,toN-fromN)/.11);
      for(let i=0;i<=steps;i++){
        const t=i/steps;
        const e=fromE+(toE-fromE)*t;
        const n=fromN+(toN-fromN)*t;
        assert.ok(shell.canStand(e,n,.27),
          'pinned D shell route blocked at segment '+segment+' step '+i+
          ' point E='+e.toFixed(3)+' N='+n.toFixed(3));
      }
    }
  } finally {
    shell.dispose();
  }
});
