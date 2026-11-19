export const mirrorLake = {
  center: [50, 185],
  radius: [27, 55],
  height: 10,
} as const;

export function mirrorLakeSignedDistance(east: number, north: number) {
  const [cx, cn] = mirrorLake.center;
  const [rx, rn] = mirrorLake.radius;
  return (Math.hypot((east - cx) / rx, (north - cn) / rn) - 1) * rn;
}

export const mirrorLakeIceInset = .5;

export function isMirrorLakeIce(east: number, north: number) {
  return mirrorLakeSignedDistance(east, north) < -mirrorLakeIceInset;
}
