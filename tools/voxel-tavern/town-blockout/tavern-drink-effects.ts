import { Quaternion, type PerspectiveCamera } from 'three';

const storageKey = 'unwritten:tavern-dizziness:v1';
const unitMillis = 45_000;
const sipMillis = 480;
const emptyCupMillis = 220;
const waveCycle = 2_400;
const breathCycle = 11_000;
const breathMillis = 300;
const radians = Math.PI / 180;

export type DrinkLevel = 0 | 1 | 2 | 3 | 4;

export type TavernDrinkFeedback = {
  sip(color: string, onFinish: (level: DrinkLevel) => void): boolean;
  isDrinking(): boolean;
};

const motionPreference = () => typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;

export function createTavernDrinkEffects() {
  let units = 0;
  let level: DrinkLevel = 0;
  let soaking = false;
  let credit = 0;
  let settledAt = performance.now();
  let swayStartedAt = 0;
  let breathStartedAt = 0;
  let decayTimer: ReturnType<typeof setTimeout> | undefined;
  let cupTimer: ReturnType<typeof setTimeout> | undefined;
  let cup: HTMLDivElement | undefined;
  let sipping = false;
  let vignette: HTMLDivElement | undefined;
  let setting: HTMLButtonElement | undefined;
  let showingFirstPerson = true;
  const reducedMotion = motionPreference();
  let preference: string | null = null;
  try { preference = localStorage.getItem(storageKey); } catch { /* Storage is optional. */ }
  let motionEnabled = preference === 'on' || (preference !== 'off' && !reducedMotion?.matches);

  const savedOrientation = new Quaternion();
  let tiltedCamera: PerspectiveCamera | undefined;
  let savedFov = 0;
  let changedFov = false;

  function updateAppearance() {
    if (!level) {
      vignette?.remove();
      vignette = undefined;
    } else if (typeof document !== 'undefined') {
      if (!vignette) {
        vignette = document.createElement('div');
        vignette.className = 'tavern-drink-vignette';
        vignette.setAttribute('aria-hidden', 'true');
        vignette.hidden = !showingFirstPerson;
        (document.getElementById('scene') ?? document.body).append(vignette);
      }
      vignette.dataset.level = String(level);
      vignette.dataset.still = String(!motionEnabled);
    }
    setting?.setAttribute('aria-pressed', String(motionEnabled));
  }

  function setMotionEnabled(enabled: boolean) {
    motionEnabled = enabled;
    if (!enabled && tiltedCamera) restore(tiltedCamera);
    if (cup) cup.dataset.still = String(!enabled);
    updateAppearance();
  }

  function mountSettings(parent: HTMLElement) {
    if (!setting) {
      setting = document.createElement('button');
      setting.type = 'button';
      setting.textContent = '饮酒眩晕';
      setting.title = '关闭后仅保留酒意暗角，不再移动镜头。';
      setting.addEventListener('click', () => {
        preference = motionEnabled ? 'off' : 'on';
        try { localStorage.setItem(storageKey, preference); } catch { /* Keep this session's choice. */ }
        setMotionEnabled(preference === 'on');
      });
      reducedMotion?.addEventListener('change', () => {
        if (preference !== 'on' && preference !== 'off') setMotionEnabled(!reducedMotion.matches);
      });
    }
    setting.setAttribute('aria-pressed', String(motionEnabled));
    parent.append(setting);
  }

  function selectLevel(now: number) {
    const next = Math.min(4, units) as DrinkLevel;
    if (level === next) return;
    if (!level && next) swayStartedAt = now;
    if (level < 4 && next === 4) breathStartedAt = now;
    level = next;
    updateAppearance();
  }

  function settle(now: number) {
    if (units) {
      credit += Math.max(0, now - settledAt) * (soaking ? 2 : 1);
      const expired = Math.min(units, Math.floor(credit / unitMillis));
      units -= expired;
      credit = units ? credit - expired * unitMillis : 0;
      selectLevel(now);
    }
    settledAt = now;
  }

  function scheduleDecay() {
    if (decayTimer !== undefined) clearTimeout(decayTimer);
    decayTimer = undefined;
    if (!units) return;
    decayTimer = setTimeout(() => {
      settle(performance.now());
      scheduleDecay();
    }, Math.ceil((unitMillis - credit) / (soaking ? 2 : 1)));
  }

  function setSoaking(next: boolean) {
    if (soaking === next) return;
    settle(performance.now());
    soaking = next;
    scheduleDecay();
  }

  function drinkHot() {
    const now = performance.now();
    settle(now);
    if (!level) return false;
    // Clear any units above the visual cap so hot tea always drops one visible level.
    units = level - 1;
    if (!units) credit = 0;
    selectLevel(now);
    scheduleDecay();
    return true;
  }

  function sip(color: string, onFinish: (level: DrinkLevel) => void) {
    if (sipping) return false;
    sipping = true;
    if (cupTimer !== undefined) clearTimeout(cupTimer);
    cup?.remove();
    if (typeof document !== 'undefined') {
      cup = document.createElement('div');
      cup.className = 'tavern-drink-cup';
      cup.style.setProperty('--drink-color', color);
      cup.setAttribute('aria-hidden', 'true');
      cup.hidden = !showingFirstPerson;
      cup.dataset.still = String(!motionEnabled);
      (document.getElementById('scene') ?? document.body).append(cup);
    }
    cupTimer = setTimeout(() => {
      const now = performance.now();
      settle(now);
      units++;
      selectLevel(now);
      scheduleDecay();
      sipping = false;
      if (cup) cup.dataset.empty = 'true';
      cupTimer = setTimeout(() => {
        cup?.remove();
        cup = undefined;
        cupTimer = undefined;
      }, emptyCupMillis);
      onFinish(level);
    }, sipMillis);
    return true;
  }

  function apply(camera: PerspectiveCamera, now: number, moving: boolean, firstPerson = true) {
    if (showingFirstPerson !== firstPerson) {
      showingFirstPerson = firstPerson;
      if (vignette) vignette.hidden = !firstPerson;
      if (cup) cup.hidden = !firstPerson;
    }
    if (!firstPerson || !motionEnabled || !level) return;
    tiltedCamera = camera;
    savedOrientation.copy(camera.quaternion);
    const wave = (now - swayStartedAt) * (2 * Math.PI / waveCycle);
    if (level === 1) {
      camera.rotateZ(.4 * radians * Math.sin(wave));
      return;
    }
    const walkScale = level < 4 && moving ? 1.5 : 1;
    const roll = level < 4 ? .9 : 1.3;
    camera.rotateY(.20 * radians * walkScale * Math.sin(wave * .62 + .6));
    camera.rotateZ(roll * radians * walkScale * Math.sin(wave));
    if (level !== 4) return;
    const sinceFull = now - breathStartedAt;
    const breath = sinceFull % breathCycle;
    if (sinceFull >= breathCycle && breath < breathMillis) {
      savedFov = camera.fov;
      camera.fov += .32 * Math.sin(Math.PI * breath / breathMillis);
      camera.updateProjectionMatrix();
      changedFov = true;
    }
  }

  function restore(camera: PerspectiveCamera) {
    if (tiltedCamera !== camera) return;
    camera.quaternion.copy(savedOrientation);
    if (changedFov) {
      camera.fov = savedFov;
      camera.updateProjectionMatrix();
      changedFov = false;
    }
    tiltedCamera = undefined;
  }

  return { sip, isDrinking: () => sipping, drinkHot, apply, restore, setSoaking, mountSettings,
    getLevel: () => level, setMotionEnabled };
}
