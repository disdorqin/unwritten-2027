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

test("tavern visitors enter, climb to the upper landing and reach a guarded balcony", () => {
  const sim = new Simulation(true, TOWN_LAYOUT), player = sim.addPlayer(1);
  let seq = 0;
  const walk = (x: number, z: number, ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      sim.motor(player, { seq: ++seq, x, z, yaw: 0, pitch: 0, buttons: 0 }); sim.step();
    }
  };
  try {
    sim.restore(player, { ...player.state, x: 17, y: 1, z: -13 });
    walk(0, 1, 280);
    assert.ok(player.state.z < -21.8 && player.state.z > -22.5, "entry aisle reaches the bar without passing through it");
    sim.restore(player, { ...player.state, x: 21.4, y: 1, z: -16.9 });
    walk(0, 1, 340);
    assert.ok(player.state.y > 4.4 && player.state.y < 4.7, "stairs reach the actual upper-floor height");
    for (let i = 0; i < 200 && player.state.x > 16.4; i++) walk(-1, 0, 1);
    assert.ok(player.state.x > 16.0 && player.state.x < 16.7, "upper rear landing connects to the main floor");
    walk(0, -1, 400);
    assert.ok(player.state.z > -15 && player.state.z < -14.3, "the balcony rail stops outward movement");
    assert.ok(player.state.y > 4.4, "visitor stays on the upper floor and balcony");
  } finally { sim.dispose(); }
});
