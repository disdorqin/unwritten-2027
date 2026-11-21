import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface.js';
import { mountUndergroundDomainHost } from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import { createUndergroundDreamChain, type DreamChainEvent } from '../tools/voxel-tavern/town-blockout/underground-dream-chain.js';
import type { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';

type Road = ReturnType<typeof mountWestCraterRoad>;
const liveAnchor = { east: -120, north: 185, rimHeight: 10.7773, yaw: 0 };

function fakeRoad(): Road {
  const surface = mountMeteorCraterSurface(liveAnchor);
  return {
    anchor: { ...liveAnchor },
    heightAt: (east: number, north: number) => surface.heightAt(east, north),
  } as unknown as Road;
}

function makeChain() {
  const road = fakeRoad();
  const domainHost = mountUndergroundDomainHost({ parent: new Group(), road });
  assert.equal(domainHost.kind, 'ready');
  if (domainHost.kind !== 'ready') throw new Error('domain host must mount');
  const registration = domainHost.registration;
  assert.equal(registration.kind, 'ready');
  if (registration.kind !== 'ready') throw new Error('registration must be ready');
  const winchPoint = registration.connection.winch;
  let now = 1_000_000;
  let foot = { east: winchPoint.east, north: winchPoint.north, height: winchPoint.height };
  const events: DreamChainEvent[] = [];
  const chain = createUndergroundDreamChain({
    registration,
    now: () => now,
    playerId: 'local-player',
    readLocalFoot: () => foot,
    onEvent: (event) => { events.push(event); },
  });
  assert.equal(chain.kind, 'ready');
  if (chain.kind !== 'ready') throw new Error('chain must be ready');
  return {
    chain, events,
    setFoot: (next: typeof foot) => { foot = next; },
    advance: (ms: number) => { now += ms; },
  };
}

const shaftFoot = { east: -120, north: 185, height: -24.2227 };
const mineLanding = { east: -119, north: 189, height: -90 };

function windOpen(ctx: ReturnType<typeof makeChain>) {
  // One sample per 100 ms of held E: 3 turns x 2500 ms = 7500 ms to open.
  for (let i = 0; i < 80; i++) {
    const result = ctx.chain.holdWinch();
    if (result.kind === 'opened') return result;
    ctx.advance(100);
  }
  throw new Error('winch never opened');
}

test('the winch opens only after a full held-E winding at the handle', () => {
  const ctx = makeChain();
  assert.equal(ctx.chain.coverOpen(), false);
  const early = ctx.chain.holdWinch();
  assert.equal(early.kind, 'winding');
  ctx.chain.releaseWinch();
  ctx.advance(10_000);
  const opened = windOpen(ctx);
  assert.equal(opened.kind, 'opened');
  assert.equal(ctx.chain.coverOpen(), true);
  assert.equal(ctx.chain.firstFallPending(), true);
  assert.ok(ctx.events.some(event => event.kind === 'well-opened'));
});

test('the winch refuses a player standing away from the handle', () => {
  const ctx = makeChain();
  ctx.setFoot({ east: -100, north: 185, height: -24.2227 });
  assert.equal(ctx.chain.holdWinch().kind, 'unreachable');
});

test('first fall: the opener walks into the bore, falls, and wakes in the mine', async () => {
  const ctx = makeChain();
  windOpen(ctx);
  // Still at the handle: no fall order while standing at the winch.
  assert.equal(ctx.chain.requestFirstFall(), undefined);
  ctx.setFoot({ ...shaftFoot });
  const fall = ctx.chain.requestFirstFall();
  assert.ok(fall);
  assert.equal(fall.trip.first, true);
  const landing = await ctx.chain.requestLanding(fall.trip.id);
  assert.deepEqual(landing, mineLanding);
  assert.equal(ctx.chain.phase(), 'mine');
  assert.equal(ctx.chain.firstFallPending(), false);
  assert.deepEqual(ctx.chain.cageAvailable(), { down: true, up: true });
});

test('cage rides run both ways through the lift and the domain handoff', async () => {
  const ctx = makeChain();
  windOpen(ctx);
  ctx.setFoot({ ...shaftFoot });
  const fall = ctx.chain.requestFirstFall()!;
  await ctx.chain.requestLanding(fall.trip.id);

  // Up: the cage still stands at the crater floor after the fall, so the
  // first request calls the empty cage down before the ride can depart.
  ctx.setFoot({ ...mineLanding });
  assert.equal(ctx.chain.requestCageRide('up'), undefined);
  assert.equal(ctx.chain.pendingRide(), 'up');
  ctx.advance(26_000);
  ctx.chain.update();
  const upEvent = ctx.events.filter(event => event.kind === 'trip-started').at(-1);
  assert.ok(upEvent && upEvent.kind === 'trip-started');
  const up = upEvent.trip;
  assert.equal(up.direction, 'up');
  const upLanding = ctx.chain.requestLanding(up.id);
  ctx.advance(26_000);
  ctx.chain.update();
  assert.deepEqual(await upLanding, shaftFoot);
  assert.equal(ctx.chain.phase(), 'surface');

  // Down again as a cage ride (no second first fall); the cage is at the
  // surface now, so this departs immediately.
  ctx.setFoot({ ...shaftFoot });
  const down = ctx.chain.requestCageRide('down');
  assert.ok(down);
  assert.equal(down.first, false);
  const downLanding = ctx.chain.requestLanding(down.id);
  ctx.advance(26_000);
  ctx.chain.update();
  assert.deepEqual(await downLanding, mineLanding);
  assert.equal(ctx.chain.phase(), 'mine');
});

test('cage rides stay locked until the first fall has happened', () => {
  const ctx = makeChain();
  windOpen(ctx);
  ctx.setFoot({ ...shaftFoot });
  assert.equal(ctx.chain.requestCageRide('down'), undefined);
});
