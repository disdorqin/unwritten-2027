const warningIntervalMs = 10_000;
const freezeWarning = '冷得迈不开步了，找个火堆烤烤火。';

export function playTownTemperatureWarning(getAudioContext: () => AudioContext) {
  try {
    const context = getAudioContext();
    if (context.state !== 'running') return;
    const at = context.currentTime;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = 'sine';
    tone.frequency.value = 523;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(.026, at + .022);
    gain.gain.linearRampToValueAtTime(0, at + .23);
    tone.connect(gain).connect(context.destination);
    tone.addEventListener('ended', () => { tone.disconnect(); gain.disconnect(); }, { once: true });
    tone.start(at);
    tone.stop(at + .24);
  } catch { /* The visible warning stays available when Web Audio is unavailable. */ }
}

export function createTownTemperatureHud(parent: HTMLElement, warn: (message: string) => void) {
  const document = parent.ownerDocument;
  const root = document.createElement('div');
  const label = document.createElement('label');
  const icon = document.createElement('span');
  const title = document.createElement('span');
  const meter = document.createElement('progress');
  const warning = document.createElement('span');
  root.className = 'town-temperature';
  root.hidden = warning.hidden = true;
  icon.className = 'town-temperature-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '❄';
  title.textContent = '体温';
  meter.max = 100;
  warning.className = 'town-temperature-warning';
  warning.textContent = '体温见底';
  label.append(icon, title, meter);
  root.append(label, warning);
  parent.append(root);
  let nextWarningAt = -Infinity;
  let lastPercent = -1;

  return {
    update(personalFrost: number | undefined, now: number) {
      const visible = personalFrost !== undefined && Number.isFinite(personalFrost);
      if (root.hidden === visible) root.hidden = !visible;
      if (!visible) return;
      const fraction = Math.max(0, Math.min(1, (3 - personalFrost) / 3));
      const percent = Math.ceil(fraction * 100);
      if (percent !== lastPercent) {
        meter.value = percent;
        lastPercent = percent;
        root.classList.toggle('is-freezing', fraction === 0);
        warning.hidden = fraction > 0;
      }
      if (fraction === 0 && Number.isFinite(now) && now >= nextWarningAt) {
        nextWarningAt = now + warningIntervalMs;
        warn(freezeWarning);
      }
    },
  };
}
