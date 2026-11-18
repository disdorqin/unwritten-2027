import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D, Vector3 } from 'three';
import type { Box, Ramp, TownPlot } from './landmark-kit';
import { addCommunityTheaterDetails } from './community-theater';
import { addTownWindow } from './town-window';
import { housePortalPlaque, type TownHousePortal } from './town-house-portals';

type Piece = { color: string; center: [number, number, number]; size: [number, number, number] };

export function buildVillageLandmark(plot: TownPlot) {
  const group = new Group();
  const pieces: Piece[] = [];
  const solids: Box[] = [];
  const floors: Box[] = [];
  const ramps: Ramp[] = [];
  const housePortalStands: [number, number][] = [];
  const add = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    pieces.push({color, center: [x, y, z], size: [w, h, d]});
  };
  const brick = '#777d8a', wood = '#744737', beam = '#422e2e', red = '#883738';
  const snow = '#e4edf6', roof = '#4b5066', window = '#ffa455', gold = '#c68d4d';
  function bounds(x: number, bottom: number, z: number, w: number, h: number, d: number): Box {
    return { min: [x - w / 2, bottom, z - d / 2], max: [x + w / 2, bottom + h, z + d / 2] };
  }
  function solid(color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    add(color, x, y, z, w, h, d);
    solids.push(bounds(x, y - h / 2, z, w, h, d));
  }
  function cabin(x: number, z: number, w: number, d: number, h: number, color: string, walkIn = false) {
    const front = z + d / 2;
    const floor = .54;
    const frame = .24;
    const door = { left: -.82, right: .82, bottom: floor, top: 2.79 };
    const windows = [-1.65, 1.65].map(offset => ({ left: offset - .54, right: offset + .54, bottom: 1.36, top: 2.44 }));
    add(brick, x, floor / 2, z, w + .25, floor, d + .25);
    for (let y = .65; y < h; y += .35) {
      const tint = y % .7 < .35 ? wood : color;
      if (!walkIn) {
        add(tint, x, y, z, w, .34, d);
        continue;
      }
      for (const side of [-1, 1]) add(tint, x + side * (w / 2 - frame / 2), y, z, frame, .34, d);
      add(tint, x, y, z - d / 2 + frame / 2, w, .34, frame);
    }

    if (walkIn) {
      const openings = [windows[0], door, windows[1]];
      const frontTimbers = (left: number, right: number, bottom: number, top: number) => {
        if (right <= left || top <= bottom) return;
        solids.push(bounds(x + (left + right) / 2, bottom, front - frame / 2, right - left, top - bottom, frame));
        for (let base = bottom, i = 0; base < top; base += .29, i++) {
          const rise = Math.min(.29, top - base);
          add(i % 2 ? color : wood, x + (left + right) / 2, base + rise / 2, front - frame / 2, right - left, rise, frame);
        }
      };
      let left = -w / 2;
      for (const opening of openings) {
        frontTimbers(left, opening.left, floor, h);
        frontTimbers(opening.left, opening.right, floor, opening.bottom);
        frontTimbers(opening.left, opening.right, opening.top, h);
        left = opening.right;
      }
      frontTimbers(left, w / 2, floor, h);
      for (const side of [-1, 1]) solids.push(bounds(x + side * (w / 2 - frame / 2), floor, z, frame, h - floor, d));
      solids.push(bounds(x, floor, z - d / 2 + frame / 2, w, h - floor, frame));
      floors.push(bounds(x, 0, z, w + .25, floor, d + .25));
      for (let offset = -w / 2 + .16, i = 0; offset < w / 2 - .15; offset += .32, i++) {
        add(i % 2 ? '#a36b48' : '#88583a', x + offset, floor + .012, z, .314, .024, d - .46);
      }
      add(brick, x, .135, front + .47, 1.96, .27, .9);
      add(snow, x, .273, front + .77, 1.85, .014, .24);
      floors.push(bounds(x, 0, front + .47, 1.96, .27, .9));
      for (const side of [-1, 1]) add(beam, x + side * .85, 1.67, front + .03, .14, 2.26, .22);
      add(beam, x, 2.82, front + .03, 1.84, .19, .23);
      add(red, x, floor + .029, z + .54, 1.55, .018, 2.2);
      for (const side of [-1, 1]) add(gold, x + side * .69, floor + .041, z + .54, .06, .01, 2.2);

      solid(brick, x - 2.52, 1.05, z - 2.68, 1.39, 1.02, 1.35);
      add(beam, x - 2.52, .98, z - 1.994, .88, .61, .07);
      add(window, x - 2.52, .92, z - 1.945, .57, .25, .06);
      add(brick, x - 2.52, 1.64, z - 2.68, 1.6, .18, 1.54);
      solid(beam, x + 2.49, .75, z - 2.42, 1.43, .42, 2.35);
      add('#aa5147', x + 2.49, 1.01, z - 2.42, 1.36, .13, 2.24);
      add('#ddc1a1', x + 2.49, 1.11, z - 3.18, 1.04, .16, .51);
      solid(wood, x - 2.19, 1.05, z + 1.31, 1.33, 1.02, .86);
      add(beam, x - 2.19, 1.58, z + 1.31, 1.48, .13, .99);
      for (const side of [-1, 1]) add(gold, x - 2.19 + side * .17, 1.21, z + .869, .06, .15, .035);
      add(beam, x, h - .27, z, w - .21, .19, .2);
      add(gold, x, h - .47, z, .09, .28, .09);
      add(window, x, h - .68, z, .32, .32, .32);
      add(beam, x, h - .88, z, .37, .08, .37);
    }
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) add(beam, x + side * w / 2, h / 2, z + end * d / 2, .24, h, .24);
      for (const y of [1.65, h - .35]) add(beam, x + side * w / 2, y, z, .22, .15, d);
      const windowX = x + side * 1.65;
      if (walkIn) {
        for (const edge of [-1, 1]) {
          add(beam, windowX + edge * .59, 1.9, front + .04, .10, 1.30, .15);
          add(beam, windowX, 1.9 + edge * .59, front + .04, 1.28, .1, .15);
        }
        addTownWindow(group, { x: windowX, y: 1.9, z: front - .08, width: 1.08, height: 1.08, yaw: 0, ground: floor, style: 'tavern' });
      } else {
        add(beam, windowX, 1.9, front + .04, 1.28, 1.34, .15);
        add(window, windowX, 1.9, front + .13, 1.03, 1.08, .08);
        add(beam, windowX, 1.9, front + .18, .075, 1.07, .04);
        add(beam, windowX, 1.9, front + .18, 1.03, .075, .04);
      }
      add(brick, x + side * 1.65, 1.28, z + d / 2 + .16, 1.45, .2, .43);
      add(red, x + side * .87, 2.65, z + d / 2 + .42, .34, .43, .34);
      add(gold, x + side * .87, 2.83, z + d / 2 + .42, .38, .11, .38);
    }
    if (!walkIn) {
      add(beam, x, 1.14, front + .1, 1.2, 2.15, .16);
      add(color, x, 1.14, front + .2, .9, 1.94, .08);
      for (const mark of housePortalPlaque) {
        add(mark.color, x + mark.x, 1.22 + mark.y, front + .286 + mark.z, mark.w, mark.h, mark.d);
      }
      housePortalStands.push([x, front + 1.42]);
    }
    for (let step = 0; step < 9; step++) {
      const span = (w + 1) * (1 - step / 9);
      const y = h + .17 + step * .29;
      add(roof, x, y, z, span, .34, d + .85);
      add(snow, x, y + .17, z + .02, span - .06, .13, d + .73);
    }
    add(brick, x - w / 3, h + 1.3, z - d / 4, .65, 2.4, .7);
    add(snow, x - w / 3, h + 2.5, z - d / 4, .76, .15, .8);
    if (!walkIn) solids.push(bounds(x, 0, z, w, h, d));
  }
  if (plot.id === 'cabins') {
    cabin(-9, -1, 7.3, 10, 3.4, '#8a5541');
    cabin(1, -4, 7.5, 9, 3.7, '#785647');
    cabin(10, 2.2, 7.5, 8.5, 3.2, '#975745', true);
  } else {
    const expandedTheater = plot.origin[0] === 238 && plot.origin[1] === 140;
    const roofWidth = expandedTheater ? 18 : 18.7;
    add(brick, 0, .2, 0, 17.5, .4, 11.5);
    add(wood, 0, .43, 0, 17.1, .18, 11.1);
    for (let x = -8.25, i = 0; x < 8.55; x += .5, i++) {
      add(i % 3 ? '#8a5841' : '#744737', x, .515, 0, .482, .016, 11.1);
    }
    add(red, 0, .44, -5.57, 16.9, .15, .14);
    add(gold, 0, .52, -5.66, 16.7, .045, .09);
    floors.push(
      { min: [-3.5, .05, -7], max: [3.5, .28, -5.4] },
      { min: [-8.55, .34, -5.55], max: [8.55, .52, 5.55] },
    );
    for (const x of [-7.5, 7.5]) {
      for (const z of [-4.7, 4.7]) {
        add(beam, x, 3.3, z, .75, 5.6, .72);
        add(red, x, 3.35, z, .89, 5, .85);
        add(gold, x, 5.65, z, 1, .35, 1);
        add(window, x, 4.5, z - .55, .5, .55, .52);
        solids.push({ min: [x - .46, .5, z - .43], max: [x + .46, 5.9, z + .43] });
      }
    }
    for (let step = 0; step < 6; step++) {
      const y = 6.13 + .25 * step;
      const d = 12.7 - 1.6 * step;
      add(roof, 0, y, 0, roofWidth - .35 * step, .31, d);
      add(snow, 0, y + .15, 0, roofWidth - .15 - .35 * step, .13, d - .15);
    }
    // The north opening faces the plaza. The painted backdrop is on the south edge.
    for (const x of [-6.4, -3.2, 0, 3.2, 6.4]) {
      add(red, x, 2.55, 4.58, 3.14, 4.04, .17);
      add(beam, x, 4.55, 4.45, 3.08, .19, .18);
      add(gold, x, 4.32, 4.45, 2.65, .08, .1);
      for (const edge of [-1.28, 1.28]) {
        add('#a95742', x + edge, 2.52, 4.47, .07, 3.44, .08);
      }
    }
    solids.push({ min: [-8, .52, 4.45], max: [8, 4.64, 4.67] });
    for (let i = 0; i < 24; i++) {
      const theta = i * Math.PI / 12;
      add(gold, 1.31 * Math.cos(theta), 2.92 + 1.26 * Math.sin(theta), 4.42, .26, .22, .11);
    }
    for (const side of [-1, 1]) {
      const x = side * 6.4;
      add(beam, x, 5.39, -4.35, .07, .48, .07);
      add(beam, x, 5.15, -4.35, .67, .12, .57);
      add(window, x, 4.92, -4.35, .57, .39, .48);
      add(beam, x, 4.69, -4.35, .65, .1, .55);
      add(red, x, 4.48, -4.35, .13, .28, .13);
      for (const offset of [-.24, .24]) add(gold, x + offset, 4.92, -4.61, .051, .39, .035);

      const drum = side * 5.55;
      for (const dx of [-.39, .39]) add(beam, drum + dx, .82, 1.72, .12, .6, .75);
      add(beam, drum, .91, 1.72, .98, .1, .88);
      add(red, drum, 1.21, 1.72, 1.02, .55, .9);
      add('#e2bf8b', drum, 1.51, 1.72, 1.06, .11, .94);
      for (const dx of [-.4, -.2, 0, .2, .4]) add(gold, drum + dx, 1.31, 1.25, .055, .06, .05);
      solids.push({ min: [drum - .53, .52, 1.25], max: [drum + .53, 1.57, 2.19] });
    }
    add(wood, 0, .14, -6.2, 7, .28, 1.6);
    add(gold, 0, .274, -6.93, 6.92, .045, .08);
    if (expandedTheater) {
      addCommunityTheaterDetails(group, add, floors, ramps, plot.origin[0], plot.origin[1]);
    }
  }

  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const warmMaterial = new MeshLambertMaterial({ emissive: window, emissiveIntensity: .52 });
  for (const glowing of [false, true]) {
    const batch = pieces.filter(piece => (piece.color === window) === glowing);
    const mesh = new InstancedMesh(geometry, glowing ? warmMaterial : material, batch.length);
    const dummy = new Object3D();
    batch.forEach(({color, center, size}, i) => {
      dummy.position.set(...center);
      dummy.scale.set(...size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, new Color(color));
    });
    group.add(mesh);
  }
  group.userData.colliders = solids;
  group.userData.floors = floors;
  group.userData.ramps = ramps;
  group.userData.housePortalStands = housePortalStands;
  return group;
}

export function villageHousePortals(group: Group, heightAt: (x: number, n: number) => number): TownHousePortal[] {
  const stands = group.userData.housePortalStands as [number, number][];
  group.updateWorldMatrix(true, false);
  const forward = new Vector3(0, 0, 1).transformDirection(group.matrixWorld);
  return stands.map(([localX, localZ], index) => {
    const point = group.localToWorld(new Vector3(localX, 0, localZ));
    const x = point.x, n = -point.z;
    return { id: `village:${index}`, x, n, ground: heightAt(x, n), exitYaw: Math.atan2(forward.x, -forward.z) };
  });
}
