export const flightFuelCanFullPowerMs = 600_000;

type FlightFuelThrottle = 'off' | 'cruise' | 'full';

export type FlightFuelSnapshot = Readonly<{
  remainingFullPowerMs: number;
  throttle: FlightFuelThrottle;
}>;

const throttleRates: Record<FlightFuelThrottle, number> = { off: 0, cruise: 0.5, full: 1 };

export function flightFuelDisplayReading(
  { remainingFullPowerMs, throttle }: FlightFuelSnapshot,
  capacityFullPowerMs = flightFuelCanFullPowerMs,
) {
  if (!Number.isFinite(remainingFullPowerMs) || remainingFullPowerMs < 0 ||
      !Number.isFinite(capacityFullPowerMs) || capacityFullPowerMs <= 0) {
    throw new RangeError('Flight fuel display requires valid fuel and capacity');
  }
  const seconds = Math.ceil(remainingFullPowerMs / 1000);
  const ratio = Math.min(1, remainingFullPowerMs / capacityFullPowerMs);
  const rate = remainingFullPowerMs === 0 ? 0 : throttleRates[throttle];
  const notice = remainingFullPowerMs === 0 ? '已耗尽' : ratio <= 0.1 ? '余量低' : '';
  const time = [Math.floor(seconds / 60), seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
  return { ratio, rate, notice, time };
}

/** Mount only in the powered aircraft controls. Fuel accounting stays with the caller. */
export function mountFlightFuelDisplay(
  controls: HTMLElement,
  initial: FlightFuelSnapshot,
  capacityFullPowerMs = flightFuelCanFullPowerMs,
) {
  const owner = controls.ownerDocument;
  const panel = owner.createElement('section');
  panel.className = 'flight-fuel-display';
  panel.setAttribute('aria-label', '星尘粉燃料');
  panel.innerHTML = `
    <div class="flight-fuel-heading"><span>星尘粉</span><output aria-label="满推余量" aria-live="off"></output></div>
    <meter min="0" max="1" aria-label="燃料余量"></meter>
    <div class="flight-fuel-details"><span>耗率 <strong></strong></span><span role="status"></span></div>
  `;
  const meter = panel.querySelector('meter')!;
  const time = panel.querySelector('output')!;
  const rate = panel.querySelector('strong')!;
  const notice = panel.querySelector('[role="status"]')!;

  function update(snapshot: FlightFuelSnapshot) {
    const reading = flightFuelDisplayReading(snapshot, capacityFullPowerMs);
    meter.value = reading.ratio;
    meter.setAttribute('aria-valuetext', `${reading.time} 满推余量`);
    time.value = `${reading.time} 满推`;
    rate.textContent = `${reading.rate}×`;
    if (notice.textContent !== reading.notice) notice.textContent = reading.notice;
  }

  update(initial);
  controls.append(panel);
  return { update, dispose: () => panel.remove() };
}
