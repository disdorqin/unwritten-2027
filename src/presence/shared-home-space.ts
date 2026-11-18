export const sharedHomeOrigin = { east: 613, north: 24, height: 520 } as const;
export const sharedHomeLayer = 1;

// The room occupies reserved coordinates inside the existing centimetre wire format.
// The altitude band separates it from outdoor clients sharing the horizontal cell.
export function isSharedHomePosition(east: number, north: number, height: number): boolean {
  return height >= sharedHomeOrigin.height - .5 && height <= sharedHomeOrigin.height + 6 &&
    Math.abs(east - sharedHomeOrigin.east) <= 6 && Math.abs(north - sharedHomeOrigin.north) <= 6;
}
