const epoch = Date.UTC(2026, 0, 1);
export const trainAcceleration = 2.2;
export const trainTopSpeed = 11;
export const railDwellSeconds = 12;

type Stop = { id: string; distance: number; speed: number };
type Phase = { leg: number; distance: number; stopped: boolean; secondsLeft: number };

export function createRailTimetable<T extends Stop>(stops: readonly T[], routeLength: number) {
  let cycleSeconds = 0;
  const legs = stops.map((from, i) => {
    const to = stops[(i + 1) % stops.length];
    const length = to.distance > from.distance ? to.distance - from.distance : routeLength - from.distance + to.distance;
    const speed = Math.min(trainTopSpeed, from.speed, Math.sqrt(length * trainAcceleration));
    const rampSeconds = speed / trainAcceleration;
    const rampMetres = speed * rampSeconds / 2;
    const cruiseSeconds = Math.max(0, length - 2 * rampMetres) / speed;
    const travelSeconds = rampSeconds * 2 + cruiseSeconds;
    const offset = cycleSeconds;
    cycleSeconds += railDwellSeconds + travelSeconds;
    return { from, to, length, speed, rampSeconds, rampMetres, cruiseSeconds, travelSeconds, offset };
  });

  function sample(now: number, phase: Phase) {
    const elapsed = (now - epoch) / 1000;
    const clock = ((elapsed % cycleSeconds) + cycleSeconds) % cycleSeconds;
    let i = legs.length - 1;
    while (i > 0 && clock < legs[i].offset) i--;
    const leg = legs[i];
    const stationTime = clock - leg.offset;
    const movingTime = stationTime - railDwellSeconds;
    phase.leg = i;
    phase.stopped = movingTime < 0;
    if (phase.stopped) {
      phase.distance = leg.from.distance;
      phase.secondsLeft = -movingTime;
    } else {
      const left = leg.travelSeconds - movingTime;
      const moved = movingTime < leg.rampSeconds ? trainAcceleration * movingTime ** 2 / 2
        : left < leg.rampSeconds ? leg.length - trainAcceleration * left ** 2 / 2
          : leg.rampMetres + leg.speed * (movingTime - leg.rampSeconds);
      phase.distance = leg.from.distance + moved;
      phase.secondsLeft = left;
    }
    return phase;
  }

  function arrival(phase: Phase, stopId: string) {
    const active = legs[phase.leg];
    if (phase.stopped && active.from.id === stopId) return { metres: 0, seconds: 0 };
    let seconds = phase.secondsLeft + (phase.stopped ? active.travelSeconds : 0);
    let i = (phase.leg + 1) % legs.length;
    let checks = 0;
    while (checks < legs.length && legs[i].from.id !== stopId) {
      seconds += railDwellSeconds + legs[i].travelSeconds;
      i = (i + 1) % legs.length;
      checks++;
    }
    const distance = legs[i].from.distance - phase.distance;
    return { metres: distance > 0 ? distance : distance + routeLength, seconds };
  }

  return { legs, sample, arrival, cycleSeconds };
}
