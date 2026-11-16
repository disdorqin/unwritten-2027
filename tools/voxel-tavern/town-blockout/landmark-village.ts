import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { Box, TownPlot } from './landmark-kit';

type Piece = { color: string; center: [number, number, number]; size: [number, number, number] };

export function buildVillageLandmark(plot: TownPlot) {
  const group = new Group();
  const pieces: Piece[] = [];
  const solids: Box[] = [];
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
    for (const x of [-7.5, 7.5]) {
      for (const z of [-4.7, 4.7]) {
        add(beam, x, 3.3, z, .75, 5.6, .72);
        add(red, x, 3.35, z, .89, 5, .85);
        add(gold, x, 5.65, z, 1, .35, 1);
        add(window, x, 4.5, z + .55, .5, .55, .52);
      }
    }
    for (let step = 0; step < 6; step++) {
      const y = 6.13 + .25 * step;
      const d = 12.7 - 1.6 * step;
      add(roof, 0, y, 0, 18.7 - .35 * step, .31, d);
      add(snow, 0, y + .15, 0, 18.55 - .35 * step, .13, d - .15);
    }
    for (const x of [-5, -2.5, 0, 2.5, 5]) {
      add(red, x, 2.45, -4.55, 2.5, 3.6, .12);
      add(gold, x, 4.16, -4.47, 2.1, .12, .15);
    }
    add(wood, 0, .14, -6.2, 7, .28, 1.6);
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
  return group;
}
