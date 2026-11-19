import type { Box } from './landmark-kit';
import type { MarketStallKind } from './market-stall-layout';

type StockBuilder = (
  color: string, x: number, y: number, z: number, w: number, h: number, d: number,
  shape?: 'box' | 'round' | 'cylinder', glow?: boolean, rotation?: number,
) => void;

export function displayMarketStock(put: StockBuilder, kind: MarketStallKind, width: number) {
  const tray = '#74462d';
  const brass = '#d18b38';
  const red = '#a8352f';

  for (let index = 0; index < 7; index++) {
    const x = (index - 3) * (width - .7) / 7;
    put(tray, x, 1.56, 1.17, .54, .11, .64);
    switch (kind) {
      case '糖葫芦':
        for (let bead = 0; bead < 3; bead++) put(red, x, 1.71 + bead * .155, 1.17, .18, .17, .18, 'round');
        put('#c68f51', x, 1.82, 1.17, .024, .53, .024);
        break;
      case '干果炒货':
        put('#92562e', x, 1.65, 1.19, .44, .13, .44, 'cylinder');
        put(['#d49742', '#9f692e', '#c78c59'][index % 3], x, 1.72, 1.19, .36, .13, .37, 'round');
        break;
      case '吃食':
        for (const side of [-1, 1]) {
          put('#c98e57', x + side * .11, 1.64, 1.17, .025, .028, .43);
          put(index % 2 ? '#a34229' : '#d28046', x + side * .11, 1.70, 1.2, .16, .13, .32, 'box', false, side * .08);
        }
        break;
      case '热饮':
        put('#ba9655', x, 1.64, 1.20, .34, .06, .34, 'cylinder');
        put(index % 2 ? '#b54035' : '#315b60', x, 1.79, 1.20, .24, .28, .24, 'cylinder');
        put('#8a4f23', x, 1.94, 1.20, .215, .02, .215, 'cylinder');
        put(brass, x + .14, 1.81, 1.20, .076, .13, .06);
        break;
      case '灯笼':
        put(index % 2 ? red : '#db7132', x, 1.82, 1.17, .32, .36, .32, 'round', true);
        for (const y of [1.64, 2]) put(brass, x, y, 1.17, .18, .045, .18, 'cylinder');
        put(tray, x, 2.06, 1.17, .041, .08, .04);
        break;
      case '杂货':
        for (const dx of [-.13, .13]) {
          const color = ['#d4a562', '#8d6237', '#b64c33'][(index + Number(dx > 0)) % 3];
          put(color, x + dx, 1.76, 1.2, .20, .31, .32);
          put('#e4b879', x + dx, 1.79, 1.37, .12, .12, .018);
        }
        break;
      case '布匹/围巾':
        for (let fold = 0; fold < 3; fold++) {
          put(['#743b62', '#38666d', '#953d3b', '#c99a55'][(index + fold) % 4],
            x, 1.65 + fold * .076, 1.18, .40, .076, .44 - fold * .035);
          put('#e4bf92', x, 1.66 + fold * .076, 1.404 - fold * .018, .22, .030, .02);
        }
        break;
      case '春联年画':
        put(index % 2 ? '#bc342d' : '#a4272c', x, 1.63, 1.19, .38, .035, .5);
        put('#dc994e', x, 1.65, 1.19, .27, .014, .32);
        put('#462b24', x + .08, 1.67, 1.03, .04, .04, .39, 'box', false, .16);
        break;
      case '玩具/套圈':
        put(index % 2 ? '#4c6961' : '#b54e35', x, 1.78, 1.16, .23, .31, .23, 'cylinder');
        put('#edb15b', x, 1.95, 1.16, .21, .075, .21, 'round');
        for (const side of [-1, 1]) {
          put('#bb823f', x + side * .18, 1.63, 1.20, .036, .036, .39);
          put('#bb823f', x, 1.63, 1.20 + side * .18, .34, .036, .036);
        }
        break;
    }
  }
}

type MarketTable = { x: number; z: number; base: number };
export const marketDiningBench = { offset: .82, top: .42 } as const;
export const marketDiningTables: readonly MarketTable[] = [
  { x: 4.6, z: 16.35, base: 9.296916 },
  { x: 4.6, z: 13.2, base: 9.4758 },
  { x: 6.9, z: 16.35, base: 8.977299 },
  { x: 6.9, z: 13.2, base: 9.1442 },
];

export function addMarketFrontFurniture(put: StockBuilder, originY: number): Box[] {
  const colliders: Box[] = [];
  const wood = '#8e5031';
  const trim = '#40251d';

  function block(color: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    put(color, x, y + h / 2, z, w, h, d);
    colliders.push({ min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + h, z + d / 2] });
  }

  function table(x: number, z: number, base: number, width: number, depth: number) {
    const y = base - originY;
    block(wood, x, y + .68, z, width, .11, depth);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) put(trim, x + side * (width / 2 - .09), y + .29, z + end * (depth / 2 - .08), .10, .78, .10);
      const benchZ = z + side * marketDiningBench.offset;
      block(wood, x, y + marketDiningBench.top - .12, benchZ, width * .86, .12, .29);
      for (const end of [-1, 1]) put(trim, x + end * width * .30, y + .12, benchZ, .12, .48, .20);
    }
    for (const dx of [-width / 4, .02, width / 4]) {
      put('#ead2ab', x + dx, y + .815, z, .16, .05, .16, 'cylinder');
      put('#ac572f', x + dx, y + .852, z, .10, .04, .10, 'round');
    }
  }

  table(-5.5, 17.4, 9.3914, 3.1, .82);
  table(-5.5, 12.8, 9.7125, 3.1, .82);
  for (const { x, z, base } of marketDiningTables) table(x, z, base, 1.08, .92);

  for (const [x, z, base] of [[-16.6, 18.6, 9], [16.7, 18.5, 9.0288], [-3.3, 13, 9.7618], [3.45, 13, 9.6925]]) {
    const y = base - originY;
    block('#805338', x, y - .12, z, .85, .60, .63);
    for (const side of [-1, 1]) put('#4d3024', x + side * .28, y + .30, z, .075, .44, .66);
    put('#9b6b3c', x, y + .60, z, .45, .22, .43, 'box', false, .08);
    put('#803628', x + .59, y + .20, z - .19, .37, .62, .38, 'cylinder');
    put('#b97837', x + .59, y + .51, z - .19, .25, .08, .26, 'cylinder');
  }
  return colliders;
}
