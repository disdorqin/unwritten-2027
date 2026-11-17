import type { MuseumBuilder } from './museum-kit';

type Point = [number, number, number];
const timber = '#6e4034';
const redwood = '#8f4239';
const innerWood = '#623930';
const dark = '#412d38';
const gold = '#bea16c';
const bronze = '#a8693d';
const stone = '#65738a';
const plaster = '#bea086';
const blueTile = ['#394657', '#4f5c70', '#566175', '#465469'];
const stoneColors = ['#788398', '#8491a5', '#69788e', '#758195'];
const snowColors = ['#d8e4f4', '#cfddf0', '#dfeaf4'];
const goldGlow = '#ffba6c';

export function addMuseumShell(m: MuseumBuilder) {
  const { box, beam, solid, label, light, detailBox } = m;
  const grain = '#502f2b';
  const gilding = '#dbab70';
  const tileLip = '#8294aa';
  const fine = 1 / 64;
  const front = 13;
  const back = -14;
  const halfWidth = 20;
  const center = (front + back) / 2;
  const top = 11.1;

  // The sandstone base is shallow above the road datum, so the same apron
  // can be crossed directly from the site approach or from the side courtyards.
  for (let i = -20; i <= 20; i++) {
    for (let j = 0; j < 5; j++) {
      const z = 13.07 + j * .96;
      if (Math.abs(i) < 4.25 && j > 1) continue;
      const h = j < 2 ? .279 : .17;
      box(stoneColors[(i + j + 24) % 4], i * 1.03, h / 2 - .05, z, 1.01, h + .1, .93);
    }
  }
  for (let j = 0; j < 5; j++) {
    const h = .255 - j * .045;
    const z = 14.66 + j * .66;
    box(stone, 0, h / 2 - .05, z, 8.1, h + .1, .66);
    for (let i = -4; i <= 4; i++) box(stoneColors[(i + j + 4) % 4], i * .89, h - .018, z, .877, .027, .65);
    for (const side of [-1, 1]) box(gold, side * 3.85, h + .006, z - .24, .035, .017, .06);
  }
  for (const side of [-1, 1]) {
    const x = 6.45 * side;
    box(stone, x, .24, 16.1, .67, .57, 3.17);
    box('#a2afc1', x, .52, 16.1, .82, .14, 3.28);
    const z = 17.64;
    solid('#7a879c', x, .49, z, .61, 1.03, .69);
    box('#a2afc1', x, 1.01, z, .77, .15, .82);
    box(snowColors[2], x, 1.105, z, .72, .077, .75);
  }

  function frameWindow(x: number, y: number, z: number, width: number, height: number, yaw: number, variant: number) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const part = (paint: string, u: number, v: number, layer: number, w: number, h: number, d: number, emit = false) =>
      box(paint, x + u * cos + layer * sin, y + v, z - u * sin + layer * cos, w, h, d, yaw, emit);
    const paneW = width / 7;
    const paneH = height / 8;
    // Tinted backing strips sit behind the finer, individually modeled wood grid.
    const glass = ['#cb8c52', '#d49a5e', '#e1ad72'];
    for (let col = 0; col < 7; col++) part(glass[(col * 5 + Math.abs(variant)) % 3],
      (col - 3) * paneW, 0, 0, paneW - .015, height - .022, .085, true);
    for (const side of [-1, 1]) {
      const layer = side * .078;
      for (let u = -3; u <= 3; u++) part(u === 0 ? bronze : '#684434', (u + .5) * paneW, 0, layer, .05, height, .044);
      for (const v of [-3.5, -2.5, -1.5, 0, 1.5, 2.5, 3.5]) part(timber, 0, v * paneH, layer, width, .043, .06);
      for (const u of [-1, 1]) {
        part(dark, u * (width + .15) / 2, 0, side * .083, .17, height + .26, .19);
        part(redwood, u * (width + .24) / 2, 0, layer, .087, height + .15, .20);
      }
      part(redwood, 0, height / 2 + .07, layer, width + .29, .14, .19);
      part(redwood, 0, -height / 2 - .07, layer, width + .29, .14, .19);
    }
    part(stone, 0, -height / 2 - .17, .08, width + .52, .16, .54);
    part(bronze, 0, height / 2 + .16, .12, width + .39, .07, .31);
    if (width < 1) return;

    // Recessed beads cap the crossing rails; gilt studs leave the window grid visible.
    const inlay = (paint: string, u: number, v: number, layer: number, w: number, h: number, d: number) =>
      detailBox(paint, x + u * cos + layer * sin, y + v, z - u * sin + layer * cos, w, h, d, yaw);
    for (const side of [-1, 1]) {
      for (const edge of [-1, 1]) {
        inlay(gilding, edge * (width / 2 + .086), 0, .192 * side, fine, height + .12, fine);
        inlay(grain, edge * (width / 2 + .111), 0, .195 * side, fine, height + .14, fine);
      }
      for (const v of [-1, 1]) {
        inlay(gilding, 0, v * (height / 2 + .07), .189 * side, width + .20, fine, fine);
        for (const u of [-1, 1]) {
          inlay(bronze, u * (width / 2 + .082), v * (height / 2 + .067), .206 * side, .094, .094, fine * 2);
          inlay(gold, u * (width / 2 + .082), v * (height / 2 + .067), .226 * side, .046, .046, fine);
        }
      }
      for (const u of [-2, 0, 2]) {
        inlay(grain, (u + .5) * paneW, 0, .123 * side, .084, .083, fine * 2);
        inlay(gilding, (u + .5) * paneW, 0, .143 * side, fine * 2, fine * 2, fine);
      }
    }
  }

  const buildBand = (x: number, z: number, width: number, yaw: number, windows: number, split: boolean) => {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const part = (paint: string, u: number, y: number, offset: number, w: number, h: number, d: number) =>
      box(paint, x + u * cos + offset * sin, y, z - u * sin + offset * cos, w, h, d, yaw);
    const gap = Math.min(2.8, width / windows - .68);
    const bay = width / windows;
    for (const [floor, bottom, windowY] of [[0, .28, 2.75], [1, 5.65, 8.27]]) {
      if (split && floor === 1) continue;
      for (let i = 0; i < windows; i++) {
        const u = (i + .5) * bay - width / 2;
        const windowHeight = floor === 0 ? 2.57 : 2.73;
        const bandBelow = windowY - windowHeight / 2 - bottom;
        const bandAbove = (floor === 0 ? 5.65 : top) - windowY - windowHeight / 2;
        const edge = (bay - gap) / 2;
        part(floor ? plaster : stone, u, bottom + bandBelow / 2, 0, bay + .022, bandBelow, .31);
        part(floor ? redwood : timber, u, windowY + (windowHeight + bandAbove) / 2, 0, bay + .022, bandAbove, .3);
        for (const side of [-1, 1]) {
          part(floor ? plaster : timber, u + side * (gap + edge) / 2, windowY, 0, edge + .018, windowHeight, .31);
          part(dark, u + side * (gap / 2 + .07), windowY, .16, .11, windowHeight + .17, .11);
        }
        frameWindow(x + u * cos, windowY, z - u * sin, gap - .15, windowHeight - .15, yaw, i * 17 + floor + Math.round(x));
        const pier = u - bay / 2;
        part(redwood, pier, bottom + 2.66, .21, .29, 5.2, .29);
        part(bronze, pier, bottom + 4.96, .25, .36, .1, .33);
        if (floor === 0) {
          for (let r = 0; r < 4; r++) {
            for (let j = 0; j < Math.floor(bay * 1.3); j++) {
              const stoneU = pier + .23 + j * .7 + (r % 2) * .12;
              if (stoneU > pier + bay - .29) continue;
              part(stoneColors[(j + r + i) % 4], stoneU, .42 + r * .265, .17, .57, .234, .042);
            }
          }
        }
      }
      part(redwood, width / 2, bottom + 2.66, .21, .29, 5.2, .29);
      part(dark, 0, bottom + .26, .19, width + .11, .23, .12);
    }
  };

  for (const side of [-1, 1]) {
    const width = 17;
    const x = side * 11.5;
    buildBand(x, front, width, 0, 4, false);
    m.collider(x, 5.5, front, width, 11, .36);
  }
  buildBand(0, back, 40, Math.PI, 9, false);
  m.collider(0, 5.5, back, 40, 11, .36);
  buildBand(halfWidth, center, 27, Math.PI / 2, 6, false);
  m.collider(halfWidth, 5.5, center, .36, 11, 27);
  buildBand(-halfWidth, center, 27, -Math.PI / 2, 6, true);
  m.collider(-halfWidth, 2.82, center, .36, 5.64, 27);
  for (const [south, north, windows] of [[front, -2.2, 3], [-5.8, back, 2]]) {
    const z = (south + north) / 2;
    // Floor index one is built separately here, so the west wall opens directly over the terrace.
    const bay = (south - north) / windows;
    for (let i = 0; i < windows; i++) {
      const pos = north + (i + .5) * bay;
      const gap = Math.min(2.9, bay - .8);
      box(plaster, -halfWidth, 6.24, pos, .3, 1.18, bay + .02);
      box(redwood, -halfWidth, 10.48, pos, .34, 1.28, bay + .02);
      frameWindow(-halfWidth, 8.21, pos, gap - .09, 2.70, -Math.PI / 2, i + 7);
      const pier = (bay - gap) / 2;
      for (const side of [-1, 1]) box(plaster, -halfWidth, 8.32, pos + side * (gap + pier) / 2, .32, 3.53, pier + .03);
      box(redwood, -halfWidth - .22, 8.35, pos - bay / 2, .39, 5.4, .27);
    }
    m.collider(-halfWidth, 8.37, z, .36, 5.44, south - north);
  }
  solid(redwood, -halfWidth, 10.21, -4, .43, 1.76, 3.6);
  for (const z of [-2.26, -5.74]) {
    box(redwood, -halfWidth, 7.43, z, .56, 3.55, .15);
    box(gold, -halfWidth - .29, 7.09, z, .028, .89, .17);
  }

  // Full upper wall above the south entrance. Door panels are opened against
  // the entrance piers, outside the movement envelope.
  solid(timber, 0, 5.07, front, 6, 1.16, .39);
  box(stone, 0, 6.28, front, 6.02, 1.26, .35);
  for (const x of [-1.48, 1.48]) frameWindow(x, 8.32, front, 2.57, 2.55, 0, Math.round(x) + 5);
  solid(redwood, 0, 10.48, front, 6.03, 1.21, .41);
  m.collider(0, 8.48, front, 6, 5.24, .36);
  box(redwood, 0, 8.4, front, .24, 3.44, .29);
  for (const side of [-1, 1]) {
    const x = 3 * side;
    box(dark, x, 2.43, front + .04, .28, 4.3, .59);
    box(redwood, side * 3.28, 2.32, front - .7, .19, 4.02, 1.27, .17 * side);
    for (const y of [1.18, 2.4, 3.48]) box(gold, side * 3.25, y, front - .43, .23, .07, .12);
  }
  for (const y of [5.55, 10.86]) {
    for (const z of [back - .19, front + .2]) {
      box(dark, 0, y, z, 40.49, .26, .57);
      box(bronze, 0, y + .17, z, 40.43, .055, .63);
    }
    for (const side of [-1, 1]) {
      const x = side * 20.16;
      if (side < 0 && y < 6) {
        for (const [a, b] of [[back, -5.81], [-2.18, front]]) box(dark, x, y, (a + b) / 2, .5, .26, b - a);
      } else box(dark, x, y, center, .5, .26, 27.5);
    }
  }
  function lantern(x: number, y: number, z: number, scale: number) {
    const w = .56 * scale, h = .67 * scale;
    for (let k = 0; k < 5; k++) {
      const l = Math.sin((k + .6) * Math.PI / 5);
      box(k === 2 ? '#e58a56' : '#a8413f', x, y + (k - 2) * h / 5, z, w * (.79 + .24 * l), h / 5 + .015, w * (.79 + .24 * l));
    }
    box(goldGlow, x, y, z + w * .52, w * .57, h * .62, .04, 0, true);
    for (const a of [-1, 1]) {
      box(bronze, x, y + a * h * .58, z, w * .64, .08, w * .68);
      box('#f9a870', x + a * w * .35, y, z + w * .51, .034, h * .67, .055);
    }
    box(dark, x, y + h * .79, z, .046, .23 * scale, .04);
    box(gold, x, y - h * .73, z, .053, .19 * scale, .058);
    box('#ae4640', x, y - h * .91, z, .115 * scale, .21 * scale, .105);
  }
  function bracket(x: number, y: number, z: number, side: number, scale: number) {
    for (let k = 0; k < 4; k++) {
      const u = k * .19 * scale;
      const lift = k * .185 * scale;
      box(k % 2 === 0 ? dark : redwood, x, y + lift, z + u * side, (.32 + k * .24) * scale, .19 * scale, (.51 + k * .16) * scale);
      const face = z + side * (u + (.27 + k * .08) * scale);
      box(bronze, x - .01, y + lift - .07 * scale, face, (.14 + k * .055) * scale, .064 * scale, .078);
      const wing = (.32 + k * .24) * scale;
      const edgeY = y + lift - .032 * scale;
      detailBox(grain, x, edgeY, face + side * .043, wing * .76, fine * 2, fine * 2);
      detailBox(gilding, x, edgeY + fine * 2, face + side * .045, wing * .58, fine, fine);
      for (const sign of [-1, 1]) {
        detailBox(bronze, x + sign * wing * .29, edgeY, face + side * .054, .074, .093, fine * 2);
        detailBox(gilding, x + sign * wing * .29, edgeY, face + side * .066, .043, .043, fine);
      }
    }
  }
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    for (const z of [front + .25, back - .25]) bracket(i * 4.59, 10.55, z, z > 0 ? 1 : -1, 1);
  }
  for (const side of [-1, 1]) {
    const x = side * 20.21;
    for (const z of [-12.7, -9, -5.3, -1.6, 2.1, 5.8, 9.5, 12.8]) {
      for (let k = 0; k < 4; k++) {
        const lift = k * .185;
        box(k % 2 ? redwood : dark, x + k * .19 * side, 10.54 + lift, z, .51 + k * .15, .19, .32 + k * .24);
        box(bronze, x + side * (.29 + k * .26), 10.50 + lift, z, .075, .07, .18 + k * .047);
      }
    }
  }
  for (const side of [-1, 1]) {
    for (const [x, z] of [[4.77, 16.3], [8.36, 15.7]]) {
      const cx = x * side;
      box(stone, cx, .54, z, .88, .61, .91);
      box('#9aa4ae', cx, .83, z, .91, .15, .93);
      solid(timber, cx, 4.68, z, .55, 7.7, .59);
      box(redwood, cx, 4.68, z + .302, .38, 7.63, .076);
      for (const y of [1.04, 1.15, 7.89, 8.18]) box(bronze, cx, y, z, .67, .078, .686);
      bracket(cx, 8.18, z, 1, 1.1);
      lantern(cx - .72 * side, 6.61, z - .1, 1.28);
    }
    for (const x of [10.6, 15.84]) lantern(x * side, 4.66, front + .6, .86);
    const banner = side * 4.87;
    box(bronze, banner, 4.97, 16.66, .88, .09, .17);
    box('#a34736', banner, 3.34, 16.67, .75, 3.16, .05);
    for (const dx of [-.33, .33]) box(gold, banner + dx, 3.32, 16.71, .035, 3, .024);
    box(bronze, banner, 1.88, 16.717, .67, .071, .02);
    light(side * 8, 4.5, 16.5, '#ffb574', 86, 13);
    for (const x of [4.77, 8.36, 12.6, 16.67, 20.17]) {
      const z = x === 4.77 ? 16.3 : x === 8.36 ? 15.7 : front + .31;
      const y = x < 9 ? 7.57 : 9.70;
      for (const offset of [-.09, .09]) {
        box(dark, x * side + offset, y, z + .32, .086, .78, .06);
        box(bronze, x * side + offset, y - .28, z + .35, .063, .043, .013);
      }
      box(bronze, x * side, y + .27, z + .353, .24, .061, .016);
    }
  }
  box(dark, 0, 8.71, 16.02, 14.4, .46, .7);
  box(redwood, 0, 8.42, 16.17, 14.18, .23, .53);
  box(gold, 0, 7.84, 16.34, 7.81, 1.63, .2);
  box(dark, 0, 7.84, 16.48, 7.65, 1.47, .24);
  label('2026 纪念馆', 0, 7.86, 16.624, 7.51, 1.22);
  for (const row of [7.14, 8.56]) {
    detailBox(grain, 0, row, 16.626, 7.46, fine * 4, fine * 2);
    detailBox(gilding, 0, row, 16.650, 7.34, fine, fine);
    for (let i = -18; i <= 18; i++) {
      const x = i * .19;
      detailBox(bronze, x, row, 16.656, .067, fine * 2, fine);
    }
  }
  for (const side of [-1, 1]) {
    const x = side * 3.70;
    detailBox(grain, x, 7.85, 16.627, fine * 4, 1.42, fine * 2);
    detailBox(gilding, x, 7.85, 16.650, fine, 1.38, fine);
    for (const y of [7.26, 8.44]) {
      box(bronze, side * 3.64, y, 16.65, .13, .13, .048);
      detailBox(gold, side * 3.64, y, 16.679, .060, .060, fine);
    }
  }

  // Carved cloud-and-water limestone panels mark the two flanking bays.
  // The straight stone plinth remains the containing silhouette and collider.
  for (const side of [-1, 1]) {
    const cx = side * 8.09;
    const panelY = .89;
    const faceZ = front + .34;
    box(stone, cx, panelY, faceZ, 2.13, .89, .22);
    detailBox('#5a6678', cx, panelY, faceZ + .115, 1.98, .75, fine * 2);
    for (const frameSide of [-1, 1]) {
      detailBox('#a8b3bd', cx, panelY + frameSide * .375, faceZ + .146, 2.04, fine * 2, fine * 2);
      detailBox('#a8b3bd', cx + frameSide * 1.005, panelY, faceZ + .146, fine * 2, .74, fine * 2);
    }
    for (let petal = -3; petal <= 3; petal++) {
      const px = cx + petal * .25;
      const py = panelY + .034 * (3 - Math.abs(petal));
      for (let step = 0; step < 4; step++) {
        const w = .0625 + step * fine * 2;
        detailBox(step === 2 ? '#b8bec6' : '#8c9bad', px, py + step * .047, faceZ + .163 + fine * step, w, fine * 2, fine * 2);
      }
    }
    for (const row of [-.24, -.17, -.10]) {
      for (let i = -8; i <= 8; i++) {
        const wave = ((i + 24) % 5 - 2) * fine;
        detailBox(i % 2 ? '#acbac7' : '#7c8d9e', cx + i * .105, panelY + row + wave, faceZ + .162, .082, fine, fine);
      }
    }
  }

  function roof(cx: number, cz: number, width: number, depth: number, y: number, rise: number) {
    const half = depth / 2;
    const courses = Math.ceil(half / .7);
    const step = half / courses;
    const curve = (progress: number) => y + rise * Math.pow(progress, 1.57);
    const mid: Point = [cx, y - .13, cz];
    box(timber, ...mid, width - .21, .23, depth - .11);
    for (const side of [-1, 1]) {
      for (let r = 0; r < courses; r++) {
        const rate = r / courses;
        const courseWidth = width - rate * Math.min(width * .15, 3.1);
        const roofY = curve(rate);
        const z = cz + side * (half - (r + .5) * step);
        const overlap = curve((r + 1) / courses) - roofY + .16;
        box(blueTile[r % 4], cx, roofY - overlap / 2 + .08, z, courseWidth, overlap + .15, step + .035);
        const slots = Math.floor(courseWidth / .67);
        const cell = courseWidth / slots;
        for (let i = 0; i < slots; i++) {
          const x = cx + (i + .5) * cell - courseWidth / 2;
          const end = Math.min(i, slots - i - 1);
          const tip = end < 5 ? Math.pow(1 - end / 5, 2) * Math.pow(Math.max(0, 1 - r / 4), 2) * .97 : 0;
          const thickness = .095 + ((i * 13 + r * 7) % 8) * .012;
          box(blueTile[(r + i + 1) % 4], x, roofY + tip + .05, z, cell + .012, .158 + tip * .15, step + .07);
          if (r < 3 && (i + 3 * r) % 17 !== 3) {
            box(snowColors[(i + r * 3) % 3], x, roofY + tip + .129 + thickness / 2,
              z, cell - .035, thickness, step - .035);
          }
          if (r === 0) {
            const lip = z + side * .32;
            box(blueTile[2], x, roofY + tip - .106, z + side * .2, .14, .12, .23);
            detailBox(tileLip, x, roofY + tip - .098, lip, .10, .059, fine * 2);
            detailBox(blueTile[0], x, roofY + tip - .093, lip + side * fine, .047, .031, fine * 2);
            if (i % 5 === 2) {
              box(snowColors[2], x, roofY + tip - .21, z + side * .255, .042, .22, .044);
              detailBox(snowColors[0], x, roofY + tip - .30, z + side * .267, fine, .12, fine);
            }
          }
        }
        if (r >= 3) for (let i = 0; i < slots; i += 3) {
          const size = Math.min(3, slots - i);
          const thickness = .11 + ((i + r) % 4) * .018;
          const x = cx + (i + size / 2) * cell - courseWidth / 2;
          box(snowColors[(i / 3 + r) % 3], x, roofY + .129 + thickness / 2, z, cell * size - .05, thickness, step - .055);
        }
      }
    }
    const ridge = width - Math.min(width * .15, 3.1);
    box(dark, cx, y + rise + .22, cz, ridge, .49, .54);
    box(snowColors[0], cx, y + rise + .47, cz, ridge - .27, .125, .38);
    for (let rub = .39; rub < ridge - .39; rub += .54) {
      const x = cx - ridge / 2 + rub;
      for (const side of [-1, 1]) {
        detailBox(tileLip, x, y + rise + .26, cz + side * .277, .21, .12, fine * 2);
        detailBox(dark, x, y + rise + .262, cz + side * .295, .10, .06, fine);
      }
    }
    for (const side of [-1, 1]) {
      const x = cx + side * (ridge / 2 - .13);
      box(bronze, x, y + rise + .41, cz, .31, .63, .51);
      box(gold, x + .23 * side, y + rise + .72, cz, .35, .22, .39);
      box(dark, x + .41 * side, y + rise + .82, cz, .22, .27, .34);
      box(snowColors[2], x + .41 * side, y + rise + .98, cz, .21, .067, .34);
      for (let step = 0; step < 5; step++) {
        detailBox(step % 2 ? bronze : gilding,
          x + side * (.085 * step - .29), y + rise + .55 + fine * step * 3,
          cz, .12, .043, .305 - .03 * step);
      }
    }
  }
  // The wings read as separate galleries and the raised center as a double-eaved pavilion.
  for (const side of [-1, 1]) roof(side * 14.8, center, 13.2, 29.1, 11.27, 1.77);
  roof(0, center, 23.2, 31, 11.62, 2.14);
  for (const z of [-10.3, 9.6]) {
    box(dark, 0, 13.52, z, 18.45, 2.39, .42);
    box(timber, 0, 14.41, z, 18.59, .26, .49);
    const side = Math.sign(z);
    const glaze = z + .242 * side;
    for (let x = -8.65; x <= 8.65; x += .86) frameWindow(x, 13.78, glaze, .64, .69, z > 0 ? 0 : Math.PI, Math.round(x + 11));
    for (let x = -8.65; x <= 8.65; x += 1.72) bracket(x, 14.47, z + .09 * side, side, .67);
  }
  for (const side of [-1, 1]) box(timber, side * 9.03, 13.6, -.35, .4, 2.20, 20.1);
  roof(0, -.35, 21.4, 23.9, 14.75, 3.48);
  roof(0, 16.1, 18.45, 5.3, 9.05, 1.3);
  for (const side of [-1, 1]) {
    const x = side * 9.05;
    for (const z of [13.14, 18.46]) {
      beam(bronze, [x - side * .84, 9.28, z], [x + side * .22, 9.89, z], .12);
      box(gold, x + side * .26, 9.99, z, .19, .2, .24);
    }
  }
}
