import {
  fireworksCooldownMs, fireworksSiteRangeMetres, fireworksThemeLabels, publicFireworksStand, type FireworksTheme,
} from '../../../src/presence/firework-sites';
import type { TownActivity, TownActivityContext } from './town-activity';

const themes = Object.keys(fireworksThemeLabels) as FireworksTheme[];
const pendingMs = 750;

export function createTownFireworksActivity(
  context: Pick<TownActivityContext, 'open' | 'announce'>,
  grid: { heightAt(east: number, north: number): number },
  request: (seed: number, theme: FireworksTheme) => void,
  isShowActive: () => boolean,
  now: () => number = () => performance.now(),
) {
  let nextStart = 0;
  let retryAfter = 0;

  function canStart() {
    const time = now();
    const wait = nextStart - time;
    if (wait > 0) {
      context.announce(`烟花师傅在装填 · ${Math.ceil(wait / 1_000)} 秒`);
      return false;
    }
    if (isShowActive()) {
      context.announce('全镇已有一场烟花，等这一场结束再来。');
      return false;
    }
    return time >= retryAfter;
  }

  const { east: x, north: n } = publicFireworksStand;
  const activity = {
    spots: [{
      x, n, ground: grid.heightAt(x, n), range: fireworksSiteRangeMetres,
      label: '点放一场烟花',
      run() {
        if (!canStart()) return;
        const panel = context.open('广场烟花台', '选一种配色，放一场烟花。夜里抬头看更亮。');
        for (const theme of themes) {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.fireworksTheme = theme;
          button.textContent = fireworksThemeLabels[theme];
          button.addEventListener('click', () => {
            if (!canStart()) return;
            retryAfter = now() + pendingMs;
            panel.closest('dialog')?.close();
            request(crypto.getRandomValues(new Uint32Array(1))[0], theme);
          });
          panel.append(button);
        }
      },
    }],
  } satisfies TownActivity;

  return {
    ...activity,
    markStarted(ageMs = 0) {
      if (!Number.isFinite(ageMs)) return;
      const remaining = Math.max(0, fireworksCooldownMs - Math.max(0, ageMs));
      nextStart = Math.max(nextStart, now() + remaining);
      retryAfter = 0;
    },
  };
}
