import { tavernModelToPlot } from './landmark-tavern';
import { layout } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';
import { createTavernMixBook, getTavernRecipe, type TavernRecipe } from './tavern-mix-book';
import { renderTavernMixPanel } from './tavern-mix-panel';
import { createTavernMixProps } from './tavern-mix-props';

const mixSeconds = 2.2;
type MixSession = {
  panel: HTMLElement;
  dialog: HTMLDialogElement | null;
  view: ReturnType<typeof renderTavernMixPanel>;
  active?: { recipe: TavernRecipe; elapsed: number };
  served?: TavernRecipe;
};

export function createTavernActivity(context: TownActivityContext) {
  const plot = layout.plots.find(({ id }) => id === 'tavern')!;
  const [east, north, altitude] = plot.origin;
  const modelToPlot = tavernModelToPlot(plot);
  const worldPoint = (point: readonly [number, number, number]) => {
    const [x, y, z] = modelToPlot(...point);
    return { x: east + x, n: north - z, y: altitude + y };
  };
  const seats = [
    { label: '坐在一楼餐桌旁', approach: [1.56, 3, 2.53], eye: [.75, 4.4, 2.23], yaw: -.24 },
    { label: '坐在二楼阅览长凳', approach: [-3.87, 8, 1.36], eye: [-5.25, 9.48, 1.36], yaw: Math.PI / 2 },
  ] as const;
  const spots: TownActivity['spots'] = seats.map(({ label, approach, eye, yaw }) => {
    const { x, n, y: ground } = worldPoint(approach);
    const seat = worldPoint(eye);
    return { x, n, ground, range: 1.05, label, run: () => context.sit({ x: seat.x, n: seat.n, eyeY: seat.y, yaw }) };
  });
  const counterApproach = worldPoint([-1.85, 3, -.78]);
  const counterTop = worldPoint([-1.85, 4.13, -2.43]);
  const book = createTavernMixBook();
  let props: ReturnType<typeof createTavernMixProps> | undefined;
  let session: MixSession | undefined;
  let held: TavernRecipe | undefined;

  function closeMixer() {
    if (!session) return;
    session.view.cancel();
    session.dialog?.classList.remove('tavern-mix-card');
    session = undefined;
    props?.hide();
  }

  function openMixer() {
    closeMixer();
    context.face(counterTop.x, counterTop.n, counterTop.y + .22);
    const parent = context.open('未写酒馆 · 吧台调酒', '选基底和配料，调好的特调会记进你的戳册。');
    const panel = document.createElement('div');
    parent.append(panel);
    const dialog = panel.closest('dialog');
    dialog?.classList.add('tavern-mix-card');
    const current: MixSession = {
      panel, dialog,
      view: renderTavernMixPanel(panel, {
        ids: book.ids,
        mix(base, addIn) {
          if (session !== current || current.active) return false;
          const recipe = getTavernRecipe(base, addIn);
          if (!recipe) return false;
          current.served = undefined;
          current.active = { recipe, elapsed: 0 };
          props ??= createTavernMixProps(context.scene, counterTop);
          props.update(recipe.color, 0);
          return true;
        },
        take(recipeId) {
          if (session !== current || current.served?.id !== recipeId) return false;
          held = current.served;
          current.served = undefined;
          props?.hide();
          context.announce(`端起了「${held.name}」，离开吧台后可以喝一口。`);
          dialog?.close();
          return true;
        },
      }),
    };
    session = current;
    dialog?.addEventListener('close', () => { if (session === current) closeMixer(); }, { once: true });
  }

  spots.push({
    x: counterApproach.x, n: counterApproach.n, ground: counterApproach.y,
    range: 1.2, label: '在吧台调酒', run: openMixer,
  });

  return {
    spots,
    getMixIds: book.ids,
    carryAction() {
      if (!held) return undefined;
      return {
        label: `喝一口「${held.name}」`,
        run() {
          if (!held) return;
          context.announce(`喝了一口「${held.name}」`);
          held = undefined;
        },
      };
    },
    update(dt: number) {
      const current = session;
      if (!current) return;
      if (!current.panel.isConnected || current.dialog?.open === false) {
        closeMixer();
        return;
      }
      const mix = current.active;
      if (!mix || !Number.isFinite(dt) || dt <= 0) return;
      mix.elapsed += Math.min(.1, dt);
      const progress = Math.min(1, mix.elapsed / mixSeconds);
      props?.update(mix.recipe.color, progress);
      current.view.setProgress(progress);
      if (progress < 1) return;
      current.active = undefined;
      current.served = mix.recipe;
      current.view.finish(mix.recipe, book.record(mix.recipe.id));
    },
  };
}
