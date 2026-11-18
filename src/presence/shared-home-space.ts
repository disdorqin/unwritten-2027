export const sharedHomeOrigin = { east: 626, north: 498, height: 150 } as const;
export const sharedHomeLayer = 1;

// The room occupies reserved coordinates inside the existing centimetre wire format.
// Only the client filters avatars across this room boundary.
export function isSharedHomePosition(east: number, north: number, height: number): boolean {
  return height >= sharedHomeOrigin.height - .5 && height <= sharedHomeOrigin.height + 6 &&
    Math.abs(east - sharedHomeOrigin.east) <= 7 && Math.abs(north - sharedHomeOrigin.north) <= 6;
}
