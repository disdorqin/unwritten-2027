import assert from 'node:assert/strict';
import { test } from 'node:test';
import { townOutdoorWeatherAt } from '../src/presence/town-outdoor-weather';
import { buildTownWindbreakCourt } from '../tools/voxel-tavern/town-blockout/town-g09-windbreak-model';
import { createTownWindbreakGameplay, type WindbreakActionRequest } from
  '../tools/voxel-tavern/town-blockout/town-g09-windbreak-interactions';

test('R6 independent shelter interaction returns validated local anchors and host-owned requests', () => {
  const model = buildTownWindbreakCourt({east:100,north:200,ground:12});
  const outgoing: WindbreakActionRequest[] = [];
  let now = 10000;
  const gameplay = createTownWindbreakGameplay(model, {
    now: () => now,
    weather: () => undefined,
    requestAction: action => outgoing.push(action),
  });
  const sit = gameplay.interact({east:98,north:201,feetHeight:12.5});
  assert.equal(sit?.kind,'sit');
  assert.deepEqual(sit?.world,[98,201,12.875]);
  assert.equal(outgoing.length,1);
  assert.equal(gameplay.interact({east:98,north:201,feetHeight:12.5}),undefined);
  now+=501;
  assert.equal(gameplay.interact({east:90,north:200.25,feetHeight:12.5})?.kind,'warmth');
  now+=501;
  assert.equal(gameplay.interact({east:100,north:207,feetHeight:13})?.kind,'photo');
  assert.deepEqual(outgoing.map(action=>action.kind),['sit','warmth','photo']);
  gameplay.dispose();
  model.dispose();
});

test('R6 public notice reads only host weather, never accepts player-authored phase', () => {
  const model=buildTownWindbreakCourt({east:100,north:200,ground:12});
  const weather=townOutdoorWeatherAt(Date.UTC(2026,0,1)+45*60_000,Date.UTC(2026,0,1));
  const outgoing:WindbreakActionRequest[]=[];
  const gameplay=createTownWindbreakGameplay(model,{
    now:()=>1000, weather:()=>weather, requestAction: action=>outgoing.push(action),
  });
  const read=gameplay.interact({east:111.25,north:201.5,feetHeight:12.25});
  assert.equal(read?.kind,'read-weather');
  assert.deepEqual(read?.weather,weather);
  assert.deepEqual(outgoing[0],read);
  gameplay.dispose();model.dispose();
});

test('R6 world pose yaw rotates action anchors while distant/non-finite visitors cannot trigger actions', () => {
  const model=buildTownWindbreakCourt({east:100,north:200,ground:12,yaw:Math.PI/2});
  const outgoing:WindbreakActionRequest[]=[];
  const gameplay=createTownWindbreakGameplay(model,{
    now:()=>2000, weather:()=>undefined, requestAction: action=>outgoing.push(action),
  });
  const rotated=gameplay.interact({east:99,north:198,feetHeight:12.5});
  assert.equal(rotated?.id,'windbreak-rest');
  assert.ok(Math.abs(rotated.world[0]-99)<1e-9);
  assert.ok(Math.abs(rotated.world[1]-198)<1e-9);
  assert.equal(gameplay.interact({east:999,north:999,feetHeight:12}),undefined);
  assert.equal(gameplay.interact({east:NaN,north:198,feetHeight:12}),undefined);
  assert.equal(gameplay.interact({east:99,north:198,feetHeight:28}),undefined);
  assert.equal(outgoing.length,1);
  gameplay.dispose();model.dispose();
});
