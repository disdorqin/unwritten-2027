/** Cabinet miniatures. Design-space faces and thicknesses are integer 1/64 m ticks. */
type ExhibitBox = (x: number, y: number, z: number, w: number, h: number, d: number, paint: string, emit?: boolean) => void;
type Voxel = (x: number, y: number, z: number, w: number, h: number, d: number, paint: string, emit?: boolean) => void;

const tick = 1 / 64;
const ink = '#28333e';
const metal = '#738ba1';
const silver = '#b5c8cb';
const paper = '#fff1cb';
const gold = '#d6a051';
const oak = '#754833';
const azure = '#55c4d6';

function dais(v: Voxel, face: string, rim: string, edge: string) {
  v(-33, 77, -60, 66, 3, 120, edge);
  v(-32, 80, -59, 64, 2, 118, face);
  for (const x of [-32, 31]) v(x, 82, -58, 1, 1, 116, rim);
  for (const z of [-59, 58]) v(-32, 82, z, 64, 1, 1, rim);
  for (const z of [-54, 53]) v(32, 78, z, 1, 1, 5, rim);
}

// Illustration of a robot demonstration on a convention stage.
function robotDemo(v: Voxel) {
  const navy = '#344866', sky = '#75e2ed', porcelain = '#ede4ca', dark = '#454953', spindle = '#9fadae';
  dais(v, '#547491', sky, navy);
  v(-22, 82, -39, 46, 3, 76, navy);
  v(-20, 85, -37, 42, 1, 72, '#728da9');
  for (const z of [-35, 31]) {
    v(-12, 86, z, 35, 1, 3, sky, true);
    for (let x = -13; x <= 20; x += 5) v(x, 86, z + 1, 1, 1, 1, paper, true);
  }
  v(-25, 84, -35, 2, 31, 70, navy);
  v(-23, 87, -31, 1, 24, 62, '#36516f', true);
  for (const z of [-34, 31]) {
    v(-22, 85, z, 2, 29, 3, '#1e2c40');
    v(-20, 91, z + 1, 1, 22, 1, sky, true);
    for (let y = 93; y < 112; y += 5) v(-19, y, z + 1, 1, 1, 1, paper, true);
  }
  for (const z of [-17, -14, 11, 14]) {
    v(-21, 98, z, 1, 1, 3, '#74c1dc', true);
    v(-21, 99, z, 1, 5, 1, '#548db0', true);
  }
  for (const leg of [-9, 3]) {
    v(-4, 86, leg, 13, 3, 6, dark);
    v(-4, 89, leg + 1, 13, 1, 4, porcelain);
    v(-4, 90, leg + 1, 6, 9, 4, silver);
    v(2, 96, leg + 1, 1, 4, 4, spindle);
    v(3, 97, leg + 2, 1, 2, 2, '#595c68');
    v(-4, 99, leg, 7, 4, 6, dark);
    v(-3, 103, leg, 6, 7, 6, porcelain);
    v(3, 104, leg + 1, 1, 5, 1, '#acc1ca');
  }
  v(-5, 109, -9, 9, 4, 18, silver);
  v(-6, 113, -10, 11, 7, 20, porcelain);
  v(-5, 120, -8, 9, 2, 16, spindle);
  v(5, 114, -6, 1, 5, 12, '#698695');
  v(6, 116, -3, 1, 1, 6, sky, true);
  for (const side of [-1, 1]) {
    const shoulder = side < 0 ? -15 : 10;
    const arm = side < 0 ? -19 : 14;
    const hand = side < 0 ? -22 : 16;
    v(-4, 115, shoulder, 7, 5, 5, silver);
    v(3, 116, shoulder + 1, 1, 2, 2, '#adc5c7');
    v(-3, 109, arm, 5, 7, 5, porcelain);
    v(-4, 107, arm, 7, 2, 4, dark);
    v(-1, 103, hand, 7, 5, 4, porcelain);
    v(6, 103, hand, 2, 3, 4, dark);
    for (let j = 0; j < 3; j++) v(8, 103, hand + j, 2, 1, 1, silver);
  }
  v(-2, 122, -2, 5, 1, 4, dark);
  v(-4, 123, -6, 9, 2, 12, porcelain);
  v(-5, 125, -5, 10, 1, 10, silver);
  v(5, 123, -4, 1, 2, 8, navy);
  for (const z of [-3, 2]) v(6, 124, z, 1, 1, 1, sky, true);
  v(13, 86, 34, 9, 11, 11, navy);
  v(14, 97, 35, 7, 1, 9, sky, true);
  for (let z = 36; z < 43; z += 2) v(22, 92, z, 1, 1, 1, '#bdd7e1');
}

function pitch(v: Voxel) {
  const grass = ['#67905b', '#568052'];
  const marking = '#ffedbc';
  const brick = '#925141';
  const concrete = '#bda78c';
  const web = '#d9e6dd';
  dais(v, brick, gold, '#714737');
  for (let i = 0; i < 8; i++) v(-16, 82, -48 + i * 12, 44, 2, 12, grass[i % 2]);
  for (const x of [-15, 26]) v(x, 84, -46, 1, 1, 92, marking);
  for (const z of [-46, 0, 45]) v(-15, 84, z, 42, 1, 1, marking);
  // Circle and goal-area markings sit on the upper tick layer of the grass.
  for (const x of [0, 11]) v(x, 84, -4, 1, 1, 9, marking);
  for (const z of [-6, 6]) v(2, 84, z, 8, 1, 1, marking);
  for (const x of [1, 10]) for (const z of [-5, 5]) v(x, 84, z, 1, 1, 1, marking);
  for (const end of [-1, 1]) {
    const z = end < 0 ? -46 : 45;
    const net = z + end * 5;
    const yard = z - end * 8;
    v(-6, 84, yard, 24, 1, 1, marking);
    for (const x of [-6, 17]) v(x, 84, Math.min(z, yard), 1, 1, 8, marking);
    for (const x of [-1, 12]) v(x, 85, z, 1, 7, 1, marking);
    v(-1, 92, z, 14, 1, 1, marking);
    for (const x of [-1, 12]) v(x, 85, net, 1, 6, 1, web);
    for (let x = 1; x < 12; x += 2) v(x, 85, net, 1, 5, 1, web);
    for (const y of [87, 90]) v(-1, y, net, 14, 1, 1, web);
  }
  for (let rank = 0; rank < 3; rank++) {
    const x = -22 - rank * 3, y = 85 + rank * 3;
    v(x, 82, -43, 4, y - 81, 83, concrete);
    v(x + 3, y, -43, 1, 1, 83, '#e4cdb0');
    for (let i = 0; i < 18; i++) {
      const z = -41 + i * 4 + Math.floor(i / 6) * 4;
      v(x + 1, y + 1, z, 2, 2, 3, (i + rank) % 4 ? '#a54746' : '#dcad65');
      if (i % 3 === rank) {
        v(x + 1, y + 3, z + 1, 2, 2, 2, ['#f0c491', '#be7956', '#bd8c65'][rank]);
        v(x + 1, y + 5, z + 1, 2, 1, 2, ink);
      }
    }
  }
  for (const z of [-45, -16, 13, 42]) {
    v(-31, 83, z, 1, 21, 1, ink);
    v(-31, 104, z, 7, 1, 1, silver);
  }
  v(-32, 105, -47, 9, 1, 92, '#7b423a');
  v(-31, 106, -46, 7, 1, 90, '#a75c4d');
  for (const z of [-53, 52]) for (const x of [-23, 24]) {
    v(x, 82, z, 2, 2, 2, concrete);
    v(x, 84, z, 1, 15, 1, ink);
    v(x - 1, 99, z - 2, 3, 1, 5, metal);
    v(x - 1, 100, z - 2, 3, 1, 5, marking, true);
  }
  for (const [x, z, shirt] of [[-7, 14, '#db5050'], [14, 26, '#eedc95'], [9, -19, '#db5050'], [-10, -33, '#eedc95'], [21, 4, '#db5050'], [6, -4, '#eedc95']] as const) {
    v(x, 85, z, 2, 2, 1, ink);
    v(x, 87, z - 1, 2, 2, 3, shirt);
    v(x, 89, z, 2, 2, 1, '#d6976b');
  }
  v(5, 85, -1, 2, 2, 2, paper);
  v(6, 86, 0, 1, 1, 1, ink);
}

function securityTerminal(v: Voxel) {
  const green = '#74cbb0', fern = '#458079', peach = '#e4ae75';
  dais(v, '#436569', green, '#405453');
  v(-24, 83, -48, 39, 3, 58, oak);
  for (const z of [-45, 6]) for (const x of [-22, 9]) v(x, 82, z, 3, 6, 3, ink);
  v(-15, 86, -32, 12, 2, 18, ink);
  v(-10, 88, -28, 4, 5, 10, metal);
  v(-15, 92, -41, 6, 29, 37, ink);
  v(-9, 94, -39, 1, 25, 33, '#304858', true);
  for (const z of [-38, -7]) v(-8, 97, z, 1, 19, 1, green, true);
  v(-8, 97, -37, 1, 1, 29, green, true);
  v(-8, 115, -37, 1, 1, 29, green, true);
  // A pixel shield, explicitly decorative, in the terminal face.
  for (const [i, width] of [1, 3, 5, 7, 9, 9, 9, 7].entries()) {
    const z = -23 - Math.floor(width / 2);
    v(-7, 101 + i, z, 1, 1, width, fern, true);
    v(-6, 101 + i, z, 1, 1, 1, green, true);
    v(-6, 101 + i, z + width - 1, 1, 1, 1, green, true);
  }
  for (const [y, z] of [[104, -25], [103, -24], [104, -23], [105, -22], [106, -21]]) v(-6, y, z, 1, 1, 1, paper, true);
  for (const y of [92, 122]) v(-14, y, -42, 5, 1, 39, silver);
  for (const z of [-38, -35, -32]) v(-8, 93, z, 1, 1, 1, peach, true);
  v(0, 86, -35, 11, 2, 26, silver);
  for (let y = 0; y < 4; y++) for (let key = 0; key < 12; key++) {
    const x = 1 + y * 2, z = -34 + key * 2;
    v(x, 88, z, 1, 1, 1, key % 5 ? ink : '#789b99');
  }
  v(9, 88, -28, 1, 1, 9, '#4c5e67');
  v(3, 86, 0, 6, 2, 5, silver);
  v(5, 88, 2, 2, 1, 1, ink);
  v(-22, 82, 22, 32, 3, 28, ink);
  v(-22, 85, 24, 4, 35, 24, '#415762');
  for (const z of [24, 46]) v(9, 85, z, 2, 38, 2, silver);
  for (let i = 0; i < 7; i++) {
    const h = 86 + i * 5;
    v(-18, h, 26, 27, 4, 20, i % 2 ? '#546b71' : '#3c515c');
    for (let j = 0; j < 7; j++) v(9, h + 1, 27 + j * 2, 1, 1, 1, ink);
    for (const z of [42, 44]) v(9, h + 2, z, 1, 1, 1, i % 3 ? green : peach, true);
  }
  v(-22, 122, 23, 33, 2, 26, silver);
}

function autumnStop(v: Voxel) {
  const green = '#5e7755', stone = '#a7a18e', sand = '#ad8b65', light = '#f7c36e';
  const reds = ['#de7f46', '#c5573e', '#eaa653', '#ffbd68'];
  dais(v, green, gold, '#4d533c');
  v(-32, 82, -60, 24, 2, 120, '#758362');
  v(-8, 82, -60, 15, 2, 120, sand);
  v(7, 82, -60, 14, 2, 120, '#6795a0');
  for (let z = -56; z < 55; z += 6) {
    const offset = Math.floor(2 * Math.sin(z * .13));
    v(10 + offset, 84, z, 8, 1, 1, '#a7b9a8');
    const face = [sand, '#a98e78', '#c8a57a'][((z + 56) / 6) % 3];
    v(-5, 84, z, 10, 1, 4, face);
    if (z % 12) v(21, 83, z, 5, 2, 4, '#7e8574');
  }
  for (const j of [-1, 1]) {
    const z = j < 0 ? -37 : 12;
    v(-30, 84, z, 21, 4, 22, '#b1a28c');
    v(-29, 88, z + 1, 19, 13, 20, '#d9c7a8');
    for (const side of [1, 17]) v(-10, 88, z + side, 1, 13, 2, oak);
    v(-10, 94, z + 5, 1, 5, 4, light, true);
    v(-10, 94, z + 13, 1, 5, 4, light, true);
    for (const side of [5, 13]) {
      v(-9, 96, z + side, 1, 1, 4, oak);
      v(-9, 94, z + side + 2, 1, 5, 1, oak);
    }
    for (let layer = 0; layer < 6; layer++) {
      const x = -32 + 2 * layer, w = 25 - 4 * layer;
      v(x, 101 + layer, z - 2, w, 1, 26, layer % 2 ? '#53616a' : '#384e59');
      v(x + w - 1, 102 + layer, z - 3, 1, 1, 28, '#648389');
    }
    for (const r of [-1, 1]) v(-10, 96, z + (r < 0 ? 1 : 20), 2, 3, 3, '#cd5c3f', true);
  }
  for (const [x, z, color] of [[-24, -53, 0], [-14, -10, 1], [-20, 44, 2], [25, -22, 3], [24, 45, 1]]) {
    v(x, 84, z, 2, 14, 2, oak);
    v(x - 1, 94, z - 1, 4, 8, 4, reds[color]);
    for (const [dx, dz, h] of [[1, -4, 1], [-3, 1, 0], [2, 2, 3], [0, 4, 2]]) {
      v(x + dx, 96 + h, z + dz, 4, 4, 4, reds[(color + h) % reds.length]);
      v(x + dx + 1, 100 + h, z + dz + 1, 2, 1, 2, '#efab66');
    }
    for (const [dx, dz] of [[-3, 2], [0, -2], [6, 3]]) v(x + dx, 84, z + dz, 1, 1, 1, reds[color]);
  }
  for (let x = 4; x <= 22; x++) {
    const height = 88 + Math.min(3, x - 4, 22 - x);
    v(x, height, 29, 1, 1, 11, (x % 2) ? stone : '#bcb49b');
    if (x % 3 === 1) for (const z of [28, 40]) v(x, height + 1, z, 1, 5, 1, oak);
    for (const z of [28, 40]) v(x, height + 5, z, 1, 1, 1, '#86513d');
  }
}

function connectedCanal(v: Voxel) {
  const water = '#518288', roof = '#4a565c', glow = '#aee8e3', deep = '#24475b';
  dais(v, '#719193', glow, '#375b61');
  v(-31, 82, -58, 24, 3, 114, '#8d8a73');
  v(5, 82, -58, 26, 3, 114, '#a19b87');
  v(-7, 82, -57, 12, 1, 114, water);
  for (let z = -54; z < 54; z += 6) {
    v(-5 + (((z + 54) / 6) % 3), 83, z, 6, 1, 1, '#86b1ae');
    v(5, 85, z, 3, 1, 4, '#d0c4a3');
    v(-10, 85, z, 3, 1, 4, '#bfb89c');
  }
  for (const [z, width] of [[-51, 24], [-18, 17]]) {
    v(-28, 85, z, 16, 11, width, '#eddfbc');
    v(-13, 85, z + 3, 1, 7, 5, oak);
    v(-13, 90, z + 11, 1, 4, 4, '#e1ab63', true);
    v(-12, 92, z + 11, 1, 1, 4, oak);
    for (let i = 0; i < 5; i++) {
      v(-30 + i * 2, 96 + i, z - 1, 21 - i * 4, 1, width + 2, i % 2 ? roof : '#394e55');
      v(-11 - 2 * i, 97 + i, z - 2, 1, 1, width + 4, '#748285');
    }
  }
  for (let x = -8; x <= 6; x++) {
    const lift = Math.min(5, x + 8, 6 - x);
    v(x, 86 + lift, 24, 1, 2, 11, '#c2b69b');
    for (const z of [23, 35]) v(x, 90 + lift, z, 1, 1, 1, '#a39984');
    if (x % 3 === 1) for (const z of [23, 35]) v(x, 88 + lift, z, 1, 3, 1, '#dec9a9');
  }
  // An illuminated expo circuit on a separate pavilion deck, not the original venue.
  v(10, 85, -45, 19, 4, 90, deep);
  v(11, 89, -44, 17, 1, 88, '#50888a');
  v(16, 90, -39, 1, 1, 78, glow, true);
  for (const [i, z] of [-35, -14, 9, 32].entries()) {
    v(14, 90, z, 9, 1, 1, glow, true);
    v(20, 91, z - 4, 7, 1, 8, '#324a60');
    v(22, 92, z - 2, 3, 3 + 2 * i, 4, '#5c95a2');
    v(22, 95 + 2 * i, z - 2, 3, 1, 4, glow, true);
    for (const dx of [0, 2]) for (const dz of [-3, 3]) v(22 + dx, 92, z + dz, 1, 1, 1, '#d5e4d1', true);
  }
  for (const z of [-48, 47]) {
    v(9, 85, z, 2, 29, 2, roof);
    v(29, 85, z, 2, 29, 2, roof);
    v(9, 112, z, 22, 2, 2, silver);
  }
  v(8, 114, -49, 24, 1, 99, roof);
  for (const x of [11, 29]) v(x, 115, -48, 1, 1, 97, glow, true);
}

function blankCalendar(v: Voxel) {
  const cream = '#e4d9be', crimson = '#994f45', pine = '#47756c', frost = '#a9c5cb';
  dais(v, '#a2a6a2', frost, '#655a58');
  v(-31, 82, -56, 21, 2, 112, '#c1d2d3');
  v(7, 82, -56, 23, 2, 112, '#bacccb');
  v(-15, 82, -35, 30, 7, 70, oak);
  v(-14, 89, -34, 28, 1, 68, '#a87550');
  v(-15, 90, -27, 7, 31, 54, crimson);
  v(-8, 92, -25, 2, 27, 50, cream);
  v(-6, 93, -24, 1, 25, 48, paper);
  v(-5, 114, -24, 1, 4, 48, '#d4b279');
  for (const z of [-22, -7, 7, 22]) {
    v(-14, 120, z, 10, 3, 2, gold);
    v(-5, 118, z, 2, 3, 2, gold);
  }
  for (let day = 0; day < 7; day++) for (let week = 0; week < 4; week++) {
    const z = -22 + day * 6, y = 94 + week * 5;
    v(-5, y, z, 1, 1, 5, '#bb9b74');
    v(-5, y + 1, z, 1, 3, 1, '#bb9b74');
    v(-5, y + 1, z + 4, 1, 3, 1, '#bb9b74');
    v(-5, y + 4, z, 1, 1, 5, '#bb9b74');
  }
  for (const [x, z, height] of [[22, -41, 24], [24, 42, 19], [-19, 42, 29]]) {
    v(x, 83, z, 2, height, 2, oak);
    for (let row = 0; row < 4; row++) {
      const spread = 12 - row * 3, y = 89 + row * (height - 5) / 4;
      const floor = Math.floor(y);
      const left = x + 1 - Math.floor(spread / 2);
      v(left, floor, z - Math.floor(spread / 2), spread, 3, spread, pine);
      v(left + 1, floor + 3, z + 1 - Math.floor(spread / 2), spread - 2, 1, spread - 2, '#eceddd');
    }
  }
  v(20, 84, 0, 4, 2, 4, metal);
  v(21, 86, 1, 2, 9, 2, oak);
  v(19, 95, -1, 6, 1, 6, crimson);
  v(20, 96, 0, 4, 5, 4, '#f4c574', true);
  v(19, 101, -1, 6, 1, 6, crimson);
  v(20, 102, 0, 4, 1, 4, frost);
}

const exhibits = [robotDemo, pitch, securityTerminal, autumnStop, connectedCanal, blankCalendar] as const;

/** Lateral x faces the glass front; z is the cabinet's long axis. */
export function buildEastDetail(month: number, box: ExhibitBox): boolean {
  const render = exhibits[month - 7];
  if (!render) return false;
  render((x, y, z, width, height, depth, paint, emit) => {
    box((x + width / 2) * tick, (y + height / 2) * tick, (z + depth / 2) * tick,
      width * tick, height * tick, depth * tick, paint, emit);
  });
  return true;
}
