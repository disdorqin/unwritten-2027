import { tavernModelToPlot } from './landmark-tavern';
import { layout } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';
import { createTavernMixBook, getTavernRecipe, type TavernRecipe } from './tavern-mix-book';
import { renderTavernMixPanel } from './tavern-mix-panel';
import { createTavernMixProps } from './tavern-mix-props';
import type { TavernDrinkFeedback } from './tavern-drink-effects';

const mixSeconds = 2.2;
const drinkStages = ['', '微醺', '上头', '酒意已满'] as const;
type MixSession = {
  generation: number;
  panel: HTMLElement;
  dialog: HTMLDialogElement | null;
  view: ReturnType<typeof renderTavernMixPanel>;
  active?: { recipe: TavernRecipe; elapsed: number };
  served?: TavernRecipe;
};

export function createTavernActivity(context: TownActivityContext, drinkFeedback?: TavernDrinkFeedback, onDrink?: () => void) {
  const plot = layout.plots.find(({ id }) => id === 'tavern')!;
  const [east, north, altitude] = plot.origin;
  const modelToPlot = tavernModelToPlot(plot);
  const worldPoint = (point: readonly [number, number, number]) => {
    const [x, y, z] = modelToPlot(...point);
    return { x: east + x, n: north - z, y: altitude + y };
  };
  const spots: TownActivity['spots'] = [];
  const counterApproach = worldPoint([-1.6875, 3, -.22]);
  const counterTop = worldPoint([-1.85, 4.13, -2.43]);
  const book = createTavernMixBook();
  let props: ReturnType<typeof createTavernMixProps> | undefined;
  let session: MixSession | undefined;
  let held: TavernRecipe | undefined;
  // Session generation guard (R3-D2): every openMixer() bumps the generation.
  // Delayed cleanup paths (the shared dialog's 'close' event, which the
  // browser dispatches asynchronously, and the frame-loop guard) must only
  // ever tear down the session they belong to. The dialog is the viewer's
  // single shared #place-card element, so a 'close' event queued by an older
  // session's take() can be dispatched after a new session has already opened
  // on the same element; attributing each programmatic close to the
  // generation that requested it keeps that stale event from killing the new
  // session (whose mix() would then refuse every submission).
  let sessionGeneration = 0;
  let closingGeneration: number | undefined;
  let wiredDialog: HTMLDialogElement | null = null;

  function closeMixer(generation?: number) {
    if (!session) return;
    if (generation !== undefined && session.generation !== generation) return;
    session.view.cancel();
    session.dialog?.classList.remove('tavern-mix-card');
    session = undefined;
    props?.hide();
  }

  function onDialogClose() {
    const closing = closingGeneration;
    closingGeneration = undefined;
    // A close initiated by an older session (take() -> dialog.close()) says
    // nothing about a newer session now using the same dialog: skip it.
    if (closing !== undefined && session && session.generation !== closing) return;
    closeMixer();
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
      generation: ++sessionGeneration,
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
          context.announce(`端起了「${held.name}」，找个地方可以喝一口。`);
          // Attribute the queued 'close' event to this session's generation
          // before closing, so the shared-dialog handler can tell it apart
          // from a genuine close of any newer session.
          closingGeneration = current.generation;
          dialog?.close();
          return true;
        },
      }),
    };
    session = current;
    // One permanent close handler per dialog element (the viewer reuses a
    // single shared dialog); per-session { once: true } listeners would also
    // fire for a previous session's still-queued close event.
    if (dialog && dialog !== wiredDialog) {
      wiredDialog = dialog;
      dialog.addEventListener('close', onDialogClose);
    }
  }

  spots.push({
    x: counterApproach.x, n: counterApproach.n, ground: counterApproach.y,
    range: 1.2, label: '在吧台调酒', run: openMixer,
  });

  return {
    spots,
    getMixIds: book.ids,
    carryAction() {
      const drink = held;
      if (!drink || drinkFeedback?.isDrinking()) return undefined;
      return {
        label: `喝一口「${drink.name}」`,
        run() {
          if (held !== drink) return;
          if (drinkFeedback) {
            const started = drinkFeedback.sip(drink.color, level => {
              onDrink?.();
              context.announce(`喝了一口「${drink.name}」 · 空杯 · ${drinkStages[level]}`);
            });
            if (!started) return;
            context.announce(`举杯喝「${drink.name}」`);
          } else {
            onDrink?.();
            context.announce(`喝了一口「${drink.name}」`);
          }
          held = undefined;
        },
      };
    },
    update(dt: number) {
      const current = session;
      if (!current) return;
      if (!current.panel.isConnected || current.dialog?.open === false) {
        closeMixer(current.generation);
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
