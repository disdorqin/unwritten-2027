import { test } from "node:test";
import assert from "node:assert/strict";
import { initPhysics, Simulation } from "../src/shared/simulation.js";
import { TOWN_LAYOUT } from "../src/shared/town.js";
await initPhysics();

test("town uses the shared motor, settles on snow and blocks the clocktower", () => {
  const sim = new Simulation(true, TOWN_LAYOUT), player = sim.addPlayer(1);
  try {
    let seq = 0;
    const step = (z = 0) => {
      sim.motor(player, { seq: ++seq, x: 0, z, yaw: 0, pitch: 0, buttons: 0 }); sim.step();
    };
    for (let i = 0; i < 120; i++) step();
    assert.ok(player.state.flags & 1, "spawn should settle on ground");
    assert.ok(Math.abs(player.state.y - 0.87) < 0.08);
    for (let i = 0; i < 600; i++) step(1);
    assert.ok(player.state.z > -4.8 && player.state.z < -4, "closed tower must stop walking through it");
    assert.equal(sim.props.size, 0, "town should contain no inherited weapons");
    assert.equal(sim.doors.size, 0);
  } finally { sim.dispose(); }
});

test("custom-layout spawn count wraps independently of the original eight spots", () => {
  const sim = new Simulation(true, { ...TOWN_LAYOUT, spawns: [[4, 1, 12], [6, 1, 12]] });
  try {
    assert.equal(sim.addPlayer(1).state.x, 4);
    assert.equal(sim.addPlayer(2).state.x, 6);
    assert.equal(sim.addPlayer(3).state.x, 4);
  } finally { sim.dispose(); }
});

test("the post office doorway is walkable and its writing desk blocks movement", () => {
  const sim = new Simulation(true, TOWN_LAYOUT), player = sim.addPlayer(1);
  try {
    sim.restore(player, { ...player.state, x: 17, y: 1, z: 3 });
    for (let seq = 1; seq <= 240; seq++) {
      sim.motor(player, { seq, x: 0, z: 1, yaw: 0, pitch: 0, buttons: 0 }); sim.step();
    }
    assert.ok(player.state.z < -3.8 && player.state.z > -4.2, "walk through the open entrance and stop at the desk");
    assert.ok(Math.abs(player.state.y - 0.97) < 0.08);
  } finally { sim.dispose(); }
});
