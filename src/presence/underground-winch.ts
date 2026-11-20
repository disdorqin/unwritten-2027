export type UndergroundWinchUsePoint = Readonly<{
  domainId: string;
  east: number;
  north: number;
  height: number;
  horizontalReach: number;
  verticalReach: number;
}>;

export type UndergroundWinchAcceptedFoot = Readonly<{
  playerId: string;
  domainId: string;
  east: number;
  north: number;
  height: number;
}>;

// Bind to UndergroundEntryOptions.canUseWinch. The caller takes playerId from
// the authenticated session and reads the latest live foot accepted by movement.
export function createUndergroundWinchAccess(
  usePoint: UndergroundWinchUsePoint,
  readAcceptedFoot: (playerId: string) => UndergroundWinchAcceptedFoot | undefined,
) {
  const { domainId, east, north, height, horizontalReach, verticalReach } = usePoint;
  if (!domainId || ![east, north, height, horizontalReach, verticalReach].every(Number.isFinite) ||
      horizontalReach < 0 || verticalReach < 0) {
    throw new RangeError('The winch needs a domain and a finite use point with non-negative reach');
  }

  return function canUseWinch(playerId: string): boolean {
    if (!playerId) return false;
    const foot = readAcceptedFoot(playerId);
    return foot !== undefined && foot.playerId === playerId && foot.domainId === domainId &&
      Math.hypot(foot.east - east, foot.north - north) <= horizontalReach &&
      Math.abs(foot.height - height) <= verticalReach;
  };
}
