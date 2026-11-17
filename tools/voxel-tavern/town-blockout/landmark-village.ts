import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Box, TownPlot } from './landmark-kit';

type Piece = { color: string; center: [number, number, number]; size: [number, number, number] };

export function buildVillageLandmark(plot: TownPlot) {
  const group = new Group();
  const pieces: Piece[] = [];
  const solids: Box[] = [];
  const floors: Box[] = [];
  const add = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
    pieces.push({color, center: [x, y, z], size: [w, h, d]});
  };
  const brick = '#777d8a', wood = '#744737', beam = '#422e2e', red = '#883738';
  const snow = '#e4edf6', roof = '#4b5066', window = '#ffa455', gold = '#c68d4d';
  function cabin(x: number, z: number, w: number, d: number, h: number, color: string) {
    add(brick, x, .27, z, w + .25, .54, d + .25);
    for (let y = .65; y < h; y += .35) {
      add(y % .7 < .35 ? wood : color, x, y, z, w, .34, d);
    }
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) add(beam, x + side * w / 2, h / 2, z + end * d / 2, .24, h, .24);
      for (const y of [1.65, h - .35]) add(beam, x + side * w / 2, y, z, .22, .15, d);
      add(beam, x + side * 1.65, 1.9, z + d / 2 + .04, 1.28, 1.34, .15);
      add(window, x + side * 1.65, 1.9, z + d / 2 + .13, 1.03, 1.08, .08);
      add(beam, x + side * 1.65, 1.9, z + d / 2 + .18, .075, 1.07, .04);
      add(beam, x + side * 1.65, 1.9, z + d / 2 + .18, 1.03, .075, .04);
      add(brick, x + side * 1.65, 1.28, z + d / 2 + .16, 1.45, .2, .43);
      add(red, x + side * .87, 2.65, z + d / 2 + .42, .34, .43, .34);
      add(gold, x + side * .87, 2.83, z + d / 2 + .42, .38, .11, .38);
    }
    add(beam, x, 1.14, z + d / 2 + .1, 1.2, 2.15, .16);
    add(color, x, 1.14, z + d / 2 + .2, .9, 1.94, .08);
    for (let step = 0; step < 9; step++) {
      const span = (w + 1) * (1 - step / 9);
      const y = h + .17 + step * .29;
      add(roof, x, y, z, span, .34, d + .85);
      add(snow, x, y + .17, z + .02, span - .06, .13, d + .73);
    }
    add(brick, x - w / 3, h + 1.3, z - d / 4, .65, 2.4, .7);
    add(snow, x - w / 3, h + 2.5, z - d / 4, .76, .15, .8);
    solids.push({min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2]});
  }
  if (plot.id === 'cabins') {
    cabin(-9, -1, 7.3, 10, 3.4, '#8a5541');
    cabin(1, -4, 7.5, 9, 3.7, '#785647');
    cabin(10, 2.2, 7.5, 8.5, 3.2, '#975745');
  } else {
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
      add(roof, 0, y, 0, 18.7 - .35 * step, .31, d);
      add(snow, 0, y + .15, 0, 18.55 - .35 * step, .13, d - .15);
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
  return group;
}
