// Cabinet models use edge coordinates in ticks of 1/64 metre.
// The front of either display case is +x. These are interpretation models.
type CabinetBox = (x: number, y: number, z: number, width: number, height: number, depth: number, paint: string, emit?: boolean) => void;
type Piece = (x: number, y: number, z: number, w: number, h: number, d: number, paint: string, emit?: boolean) => void;

function platform(piece: Piece, base: string, inlay: string) {
  piece(-25, 77, -60, 50, 2, 120, base);
  piece(-24, 79, -59, 48, 1, 118, inlay);
}

function icePalace(piece: Piece) {
  const dark = '#22618b';
  const white = '#d5fbff';
  const ice = ['#73b6dc', '#96d1e8', '#a7ddf5', '#57a6d8'];
  platform(piece, dark, '#a9e9ff');
  piece(-18, 80, -50, 29, 3, 100, '#7fc4e4');
  for (let i = 0; i < 4; i++) piece(12 + 3 * i, 80, -11 - i, 3, 5 - i, 22 + 2 * i, ice[i]);
  for (const wing of [-1, 1]) {
    const z = wing * 39;
    piece(-18, 83, z - 11, 24, 23, 22, '#6aa7ce');
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        piece(6, 84 + row * 4, z - 10 + col * 5, 1, 3, 4, ice[(row + col) % ice.length]);
      }
    }
    piece(7, 88, z - 5, 1, 12, 10, dark);
    piece(8, 90, z - 4, 1, 8, 8, wing < 0 ? '#c4caff' : '#f0adf3', true);
    piece(9, 93, z - 4, 1, 1, 8, '#abdef8');
    piece(9, 90, z - 1, 1, 8, 1, '#abdef8');
    for (let tier = 0; tier < 5; tier++) {
      piece(-19 + 2 * tier, 106 + 3 * tier, z - 13 + 2 * tier, 27 - 4 * tier, 3, 26 - 4 * tier,
        tier % 2 ? ice[2] : white);
    }
    piece(-8, 121, z - 2, 4, 2, 4, '#e7aef9', true);
    const wallZ = wing < 0 ? -27 : 12;
    piece(-16, 83, wallZ, 19, 14, 15, '#82b7df');
    for (let i = 0; i < 4; i++) piece(3, 96, wallZ + 1 + i * 4, 2, 4, 2, white);
    piece(4, 86, wallZ + 2, 1, 5, 4, '#d2e8ff', true);
    piece(4, 86, wallZ + 9, 1, 5, 4, '#d2e8ff', true);
  }
  piece(-18, 83, -14, 3, 18, 28, dark);
  for (const z of [-15, 10]) {
    piece(-15, 83, z, 21, 19, 6, '#92d5ee');
    for (let j = 0; j < 4; j++) piece(6, 84 + j * 4, z, 1, 1, 6, '#e0f7ff');
  }
  for (let row = 0; row < 5; row++) {
    piece(-15, 94 + row, -10 + row, 21, 1, 2, white);
    piece(-15, 94 + row, 8 - row, 21, 1, 2, white);
  }
  piece(-17, 101, -16, 25, 4, 32, '#85c6e9');
  for (let tier = 0; tier < 5; tier++) {
    piece(-18 + 2 * tier, 105 + 3 * tier, -17 + 2 * tier, 27 - tier * 4, 3, 34 - 4 * tier,
      tier % 2 ? '#99c9e9' : white);
  }
  piece(-8, 120, -3, 5, 4, 6, '#bfc2f6', true);
  for (const z of [-54, -29, 27, 52]) {
    piece(17, 80, z, 6, 2, 6, dark);
    piece(18, 82, z + 1, 4, 5, 4, '#e2feff', true);
    piece(17, 87, z, 6, 1, 6, '#5ba6d6');
  }
}

function winterArena(piece: Piece) {
  platform(piece, '#334556', '#c7dce8');
  // Ice-rink diorama on the left, robot demonstration platform on the right.
  piece(-19, 80, -55, 38, 2, 49, '#adcfe0');
  piece(-22, 82, -50, 44, 1, 39, '#d9f8ff');
  piece(-19, 82, -54, 38, 1, 47, '#d9f8ff');
  piece(-18, 83, -32, 36, 1, 1, '#7c9bc6');
  for (const x of [-21, 20]) {
    for (let n = 0; n < 7; n++) piece(x, 82, -49 + 6 * n, 1, 4, 5, n % 2 ? '#4585b1' : '#739bc1');
  }
  for (const z of [-53, -8]) piece(-15, 82, z, 30, 4, 1, '#4585b1');
  for (const z of [-49, -12]) {
    for (const x of [-4, 4]) piece(x, 83, z, 1, 4, 1, '#b55065');
    piece(-4, 87, z, 9, 1, 1, '#a73749');
  }
  for (const [x, z, color] of [[5, -37, '#be5365'], [-8, -23, '#5c83bf']] as const) {
    piece(x - 3, 83, z - 2, 6, 1, 1, '#586775');
    piece(x - 3, 83, z + 2, 5, 1, 1, '#586775');
    piece(x - 1, 84, z - 2, 3, 5, 2, '#344468');
    piece(x - 2, 84, z + 1, 2, 5, 2, '#344468');
    piece(x - 2, 89, z - 2, 4, 5, 5, color);
    piece(x - 1, 94, z - 1, 3, 3, 3, '#e4bbab');
    piece(x - 2, 97, z - 1, 4, 1, 4, '#dceaff');
  }
  piece(-20, 80, 4, 40, 3, 49, '#463748');
  piece(-18, 83, 6, 36, 1, 45, '#989ca8');
  piece(13, 84, 8, 1, 1, 41, '#ffca9c', true);
  const metal = '#e8e0cc';
  const joint = '#425169';
  for (const z of [19, 33]) {
    piece(-6, 84, z, 12, 2, 7, joint);
    piece(-5, 86, z + 1, 8, 11, 5, metal);
    piece(-4, 94, z + 1, 10, 3, 5, '#8b95aa');
    piece(-4, 97, z + 1, 8, 7, 5, joint);
    piece(4, 95, z + 2, 1, 2, 3, '#d49a61');
  }
  piece(-7, 103, 19, 13, 4, 21, joint);
  piece(-9, 107, 17, 17, 10, 25, metal);
  piece(8, 109, 21, 1, 6, 17, '#566981');
  for (let stripe = 0; stripe < 5; stripe++) piece(9, 110 + stripe, 24, 1, 1, 11, stripe % 2 ? '#5a809a' : '#85b9db');
  for (const z of [11, 42]) {
    piece(-6, 112, z, 11, 5, 6, metal);
    piece(-4, 107, z + 1, 7, 5, 4, joint);
    piece(-2, 101, z + 1, 6, 6, 4, metal);
    for (let finger = 0; finger < 3; finger++) piece(2, 99, z + finger * 2, 2, 2, 1, joint);
  }
  piece(-4, 117, 25, 8, 2, 8, '#768294');
  piece(-7, 119, 23, 13, 5, 12, metal);
  piece(6, 120, 24, 1, 3, 10, '#4a596e');
  for (const z of [26, 31]) piece(7, 121, z, 1, 1, 2, '#b2eeff', true);
}

function springPlanting(piece: Piece) {
  platform(piece, '#5b493f', '#8e7752');
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 5; col++) {
      const x = -22 + col * 9;
      const z = -56 + row * 13;
      piece(x, 80, z, 8, 1, 12, (row + col) % 3 ? '#927c56' : '#a08b62');
    }
  }
  for (const [x, z, height] of [[-14, -39, 34], [-15, -10, 40], [-11, 24, 33], [6, 42, 35]] as const) {
    piece(x - 4, 81, z - 4, 9, 1, 9, '#65482f');
    piece(x - 1, 82, z - 1, 3, height - 5, 3, '#805b3f');
    piece(x - 3, 82, z + 3, 1, 16, 1, '#b68e59');
    piece(x + 3, 82, z - 3, 1, 17, 1, '#b68e59');
    piece(x - 3, 93, z - 3, 7, 1, 1, '#d6bd90');
    for (const sign of [-1, 1]) {
      for (let n = 0; n < 7; n++) {
        const dx = sign * n;
        piece(x + dx, 82 + height - 15 + n, z + sign * n, 2, 3, 1, '#896145');
        const leaf = ['#508654', '#689858', '#82a962'][n % 3];
        if (n % 2 === 0) piece(x + dx - 3, 82 + height - 13 + n, z + sign * n - 4, 7, 4, 8, leaf);
      }
    }
    piece(x - 4, 82 + height - 5, z - 5, 9, 4, 11, '#699b5a');
    piece(x - 3, 82 + height - 1, z - 3, 7, 2, 7, '#9eb56b');
  }
  // A small spade, soil layers and a visitor engaging with the exhibit.
  piece(14, 81, -25, 8, 1, 13, '#6e4f34');
  piece(15, 82, -23, 6, 1, 9, '#533f30');
  piece(11, 82, -27, 2, 13, 2, '#a17d4c');
  piece(10, 83, -28, 4, 5, 4, '#7d99a2');
  piece(10, 94, -27, 4, 2, 2, '#deb27d');
  for (const z of [2, 6]) {
    piece(15, 81, z, 5, 2, 3, '#565060');
    piece(16, 83, z, 3, 7, 3, '#596579');
  }
  piece(15, 90, 2, 6, 7, 7, '#d7a166');
  piece(16, 97, 3, 4, 4, 5, '#d7ac98');
  piece(15, 101, 2, 6, 1, 7, '#c77d4d');
  piece(15, 102, 3, 5, 2, 5, '#d89761');
  piece(18, 94, -2, 2, 3, 5, '#d7a166');
  piece(19, 92, -3, 2, 3, 2, '#d7ac98');
}

function lunarGallery(piece: Piece) {
  platform(piece, '#242d4c', '#373f5c');
  const moon = ['#aaa6a0', '#bcb9b1', '#8d8d92', '#757985'];
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 10; j++) {
      const x = -22 + 5 * i;
      const z = 4 + j * 5;
      const basin = Math.hypot(x + 1, (z - 30) * .98);
      const rim = basin > 11 && basin < 17;
      const h = basin < 11 ? 1 : rim ? 4 : 2;
      piece(x, 80, z, 5, h, 5, moon[rim ? 1 : basin < 11 ? 2 : (i + j * 3) % 4]);
    }
  }
  for (const [x, z] of [[-12, 11], [16, 41], [12, 14], [5, 42]] as const) {
    piece(x, 82, z, 3, 2, 4, '#c8c0ae');
    piece(x, 84, z + 1, 2, 1, 2, '#ded8ca');
  }
  // Landing legs, descent stage, cabin, antenna and surface instruments.
  for (const x of [-12, 11]) {
    for (const z of [15, 32]) {
      piece(x, 84, z, 4, 1, 4, '#735e4b');
      for (let n = 0; n < 5; n++) {
        const inset = x < 0 ? n : -n;
        piece(x + inset + 1, 85 + n, z + (z === 15 ? n : -n), 2, 2, 2, '#b88e62');
      }
    }
  }
  piece(-7, 90, 19, 16, 7, 16, '#ca9b63');
  piece(-6, 97, 21, 14, 3, 13, '#9a977e');
  piece(-5, 100, 22, 12, 9, 11, '#e4e1ce');
  piece(7, 102, 24, 1, 5, 7, '#52627d');
  piece(8, 104, 25, 1, 1, 5, '#a2c0e0', true);
  piece(-4, 109, 24, 9, 3, 7, '#cfd3cc');
  piece(-1, 112, 26, 1, 5, 1, '#c3ab83');
  piece(-3, 117, 23, 5, 1, 6, '#d0d5d8');
  piece(16, 84, 46, 7, 2, 6, '#887b68');
  for (const z of [45, 51]) piece(16, 82, z, 7, 2, 1, '#4a4b59');
  piece(18, 86, 47, 1, 4, 1, '#a7adb3');
  piece(17, 90, 47, 3, 1, 2, '#c7d0d4');
  // An orbital craft on a discrete dark support across the other half.
  piece(-5, 80, -34, 10, 2, 10, '#455270');
  piece(-1, 82, -29, 2, 18, 2, '#666886');
  piece(-5, 100, -39, 11, 11, 22, '#e1dcc9');
  piece(-3, 102, -43, 7, 7, 4, '#a9b1ba');
  piece(-3, 102, -17, 7, 7, 3, '#9c978e');
  for (const x of [-24, 6]) {
    piece(x, 105, -29, 18, 2, 4, '#a6926d');
    piece(x + 1, 106, -39, 16, 2, 21, '#314c77');
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) {
      piece(x + 2 + row * 3, 108, -38 + col * 4, 2, 1, 3, ['#567ba5', '#456890', '#7399c5'][(row + col) % 3]);
    }
  }
}

function cargoDiorama(piece: Piece) {
  platform(piece, '#283249', '#48546c');
  piece(-4, 80, -33, 8, 2, 62, '#3a465c');
  for (const z of [-21, 21]) {
    piece(-5, 82, z - 2, 10, 2, 4, '#56627b');
    piece(-2, 84, z - 1, 4, 9, 2, '#9e8666');
  }
  // Ring-like pixel sections along the cargo ship axis.
  for (const [z, d, size] of [[-41, 6, 8], [-35, 8, 12], [-27, 40, 15], [13, 14, 12], [27, 8, 8]] as const) {
    for (let dy = -size; dy < size; dy++) {
      const radius = Math.floor(Math.sqrt(Math.max(1, size * size - (dy + .5) ** 2)));
      const shade = dy < -5 ? '#878b97' : dy > 6 ? '#f4ecdd' : (dy % 3 ? '#d2d8d5' : '#bec6c7');
      piece(-radius, 109 + dy, z, radius * 2, 1, d, shade);
    }
  }
  for (const z of [-34, -26, -18, -10, -2, 7, 16, 25]) {
    piece(15, 102, z, 1, 13, 1, '#8d97a2');
    for (let i = 0; i < 3; i++) piece(16, 104 + i * 4, z - 2, 1, 1, 1, '#ddddca');
  }
  piece(16, 107, -16, 1, 7, 17, '#485d77');
  piece(17, 108, -14, 1, 5, 6, '#c4826b');
  piece(17, 108, -6, 1, 1, 5, '#dce5ea');
  piece(17, 110, -6, 1, 1, 8, '#c2c5d7');
  piece(17, 112, -6, 1, 1, 6, '#dce5ea');
  for (const sign of [-1, 1]) {
    const edge = sign < 0 ? -57 : 35;
    piece(-1, 108, sign < 0 ? -43 : 33, 2, 2, 4, '#a4a8b7');
    piece(-14, 108, edge, 28, 2, 20, '#315384');
    for (let x = 0; x < 7; x++) for (let z = 0; z < 5; z++) {
      piece(-13 + x * 4, 110, edge + 1 + z * 4, 3, 1, 3, ['#769fcd', '#4c78ab', '#597daf'][(x + z) % 3]);
    }
    piece(-14, 110, edge, 28, 1, 1, '#b7af96');
    piece(-14, 110, edge + 19, 28, 1, 1, '#b7af96');
  }
  for (let i = 0; i < 6; i++) piece(18 + i, 115 + (i % 2), 26 + i, 1, 1, 1, '#eae4cc');
}

function openingMatch(piece: Piece) {
  platform(piece, '#354b57', '#5c747c');
  for (let stripe = 0; stripe < 10; stripe++) {
    piece(-18, 80, -48 + 9 * stripe, 37, 3, 9, stripe % 2 ? '#6c8e4d' : '#527546');
  }
  const chalk = '#ebecdb';
  for (const x of [-17, 17]) piece(x, 83, -47, 1, 1, 88, chalk);
  for (const z of [-47, -3, 40]) piece(-17, 83, z, 35, 1, 1, chalk);
  for (const z of [-37, 29]) {
    for (const x of [-9, 8]) piece(x, 83, z, 1, 1, 10, chalk);
    piece(-9, 83, z, 18, 1, 1, chalk);
  }
  for (let i = 0; i < 20; i++) {
    const angle = i * Math.PI / 10;
    piece(Math.round(6 * Math.cos(angle)), 83, Math.round(6 * Math.sin(angle)) - 3, 1, 1, 1, chalk);
  }
  for (const z of [-48, 41]) {
    piece(-5, 83, z, 1, 6, 1, '#f8eaca');
    piece(5, 83, z, 1, 6, 1, '#f8eaca');
    piece(-5, 89, z, 11, 1, 1, '#f8eaca');
    const back = z < 0 ? z - 3 : z + 3;
    for (let x = -4; x < 5; x += 2) piece(x, 84, back, 1, 5, 1, '#bdcfc1');
    for (let y = 85; y < 89; y += 2) piece(-4, y, back, 9, 1, 1, '#bdcfc1');
  }
  for (const [x, z, color] of [[1,-4,'#c56d5a'],[4,-26,'#c56d5a'],[-5,-15,'#c56d5a'],[7,10,'#80a6c7'],[-8,15,'#80a6c7'],[-5,30,'#80a6c7']] as const) {
    piece(x, 83, z, 2, 2, 2, '#323e51');
    piece(x, 85, z, 2, 3, 2, color);
    piece(x, 88, z, 2, 2, 2, '#d6aa87');
  }
  piece(3, 84, -4, 1, 1, 1, '#fffdf5');
  // Behind the touchline, bleachers and the scoreboard remain in view.
  for (let tier = 0; tier < 3; tier++) {
    const x = -21 - tier * 2, y = 83 + tier * 3;
    piece(x, 81, -46, 2, y - 81 + 1, 85, '#949199');
    for (let seat = 0; seat < 16; seat++) {
      piece(x, y + 1, -44 + seat * 5, 2, 1, 4, ['#9a5369', '#c89b65', '#598b9d'][(seat + tier) % 3]);
    }
  }
  for (const z of [49, 56]) piece(-9, 81, z, 2, 19, 2, '#6e6b6e');
  piece(-11, 96, 47, 5, 13, 13, '#363f51');
  piece(-6, 98, 48, 1, 9, 11, '#728892');
  for (const z of [50, 56]) {
    for (const y of [99, 104]) piece(-5, y, z, 1, 1, 2, '#fcdda5', true);
    piece(-5, 100, z, 1, 4, 1, '#f9d894', true);
  }
  for (const z of [-53, 44]) {
    piece(20, 81, z, 2, 20, 2, '#6b7c87');
    piece(18, 100, z - 3, 4, 3, 8, '#778994');
    for (const dz of [-2, 1, 4]) piece(21, 101, z + dz, 1, 1, 2, '#f8dfbb', true);
  }
}

const westernCases = [icePalace, winterArena, springPlanting, lunarGallery, cargoDiorama, openingMatch];

export function buildWestDetail(month: number, box: CabinetBox): boolean {
  const build = westernCases[month - 1];
  if (!build) return false;
  build((x, y, z, w, h, d, paint, emit) =>
    box((x + w / 2) / 64, (y + h / 2) / 64, (z + d / 2) / 64, w / 64, h / 64, d / 64, paint, emit));
  return true;
}
