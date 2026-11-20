type Location = Readonly<{ domainId: string; east: number; north: number; height: number }>;
type AcceptedFoot = Location & Readonly<{ playerId: string }>;
type Options = Readonly<{
  readAcceptedFoot(playerId: string): AcceptedFoot | undefined;
  isInsideMineArea(location: Location): boolean;
  readNightEntryOpen(): boolean | undefined;
}>;

function validLocation(location: Location): boolean {
  return location.domainId.trim() !== '' &&
    [location.east, location.north, location.height].every(Number.isFinite);
}

/** Check the entry edge before the movement host commits its destination. The night clock is owned by window B. */
export function createUndergroundNightAdmission({ readAcceptedFoot, isInsideMineArea, readNightEntryOpen }: Options) {
  return (playerId: string, destination: Location): boolean => {
    if (!playerId || !validLocation(destination)) return false;
    if (!isInsideMineArea(destination)) return true;
    const previous = readAcceptedFoot(playerId);
    if (!previous || previous.playerId !== playerId || !validLocation(previous)) return false;
    return isInsideMineArea(previous) || readNightEntryOpen() === true;
  };
}
