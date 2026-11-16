import { test } from "node:test";
import assert from "node:assert/strict";
import { initPhysics, Simulation } from "../src/shared/simulation.js";
import { TOWN_LAYOUT } from "../src/shared/town.js";
import { museumExhibitNear } from "../src/shared/museum.js";
await initPhysics();

test("museum doorway allows entry and exit; back and front walls block walking", () => {
  const sim = new Simulation(true, TOWN_LAYOUT), player = sim.addPlayer(1);
  let seq = 0;
  const walk = (z: number, steps: number) => {
    for (let i = 0; i < steps; i++) {
      sim.motor(player, { seq: ++seq, x: 0, z, yaw: 0, pitch: 0, buttons: 0 }); sim.step();
    }
  };
  try {
    sim.restore(player, { ...player.state, x: -18, y: 1, z: 3 });
    walk(1, 300);
    assert.ok(player.state.z < -9.3 && player.state.z > -9.6, `back wall: ${player.state.z}`);
    assert.equal(museumExhibitNear(player.state)?.id, "months");
    assert.ok(Math.abs(player.state.y - 0.97) < 0.08);
    walk(-1, 300);
    assert.ok(player.state.z > 1, "can leave through the same doorway");
    sim.restore(player, { ...player.state, x: -21, y: 1, z: 3 });
    walk(1, 180);
    assert.ok(player.state.z > 0.4 && player.state.z < 0.8, "solid front wall blocks entry outside doorway");
  } finally { sim.dispose(); }
});

test("museum reading is local to reachable indoor exhibits", () => {
  assert.equal(museumExhibitNear({ x: -21, y: 1, z: -8 })?.id, "welcome");
  assert.equal(museumExhibitNear({ x: -15, y: 1, z: -8 })?.id, "visit");
  for (const p of [{ x: -18, y: 1, z: -11 }, { x: -18, y: 5, z: -9 }, { x: 17, y: 1, z: -5 }, { x: -18, y: 1, z: 1 }]) assert.equal(museumExhibitNear(p), undefined);
});
