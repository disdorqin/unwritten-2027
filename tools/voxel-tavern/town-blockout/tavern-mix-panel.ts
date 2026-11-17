import { getTavernRecipe, tavernAddIns, tavernBases, tavernRecipes, type TavernRecipe } from './tavern-mix-book';

type MixPanelOptions = {
  ids(): readonly string[];
  mix(base: string, addIn: string): boolean;
  take(recipeId: string): boolean;
};

function textNode<K extends keyof HTMLElementTagNameMap>(tag: K, text: string) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function picker(label: string, name: string, ingredients: readonly { id: string; label: string }[]) {
  const field = document.createElement('label');
  field.append(textNode('span', label));
  const select = document.createElement('select');
  select.name = name;
  select.required = true;
  select.append(new Option('请选择', ''));
  for (const { id, label } of ingredients) select.append(new Option(label, id));
  field.append(select);
  return { field, select };
}

export function renderTavernMixPanel(panel: HTMLElement, options: MixPanelOptions) {
  const activity = document.createElement('section');
  activity.className = 'tavern-mix-panel';
  activity.setAttribute('aria-label', '酒馆调酒');
  const form = document.createElement('form');
  form.className = 'tavern-mix-form';

  const bookHeader = document.createElement('div');
  bookHeader.className = 'tavern-mix-book-header';
  const collection = document.createElement('span');
  bookHeader.append(textNode('h3', '冬夜酒单'), collection);
  const recipes = document.createElement('ul');
  recipes.className = 'tavern-mix-recipes';

  const choices = document.createElement('div');
  choices.className = 'tavern-mix-choices';
  const { field: baseField, select: base } = picker('基底', 'tavern-base', tavernBases);
  const { field: addInField, select: addIn } = picker('风味', 'tavern-add-in', tavernAddIns);
  choices.append(baseField, addInField);

  const formStatus = document.createElement('p');
  formStatus.className = 'tavern-mix-form-status';
  formStatus.setAttribute('role', 'status');
  const mixButton = textNode('button', '开始调制');
  mixButton.type = 'submit';
  mixButton.dataset.action = 'mix';
  form.append(bookHeader, recipes, choices, formStatus, mixButton);

  const mixing = document.createElement('div');
  mixing.className = 'tavern-mix-progress';
  mixing.hidden = true;
  const vessel = document.createElement('div');
  vessel.className = 'tavern-mix-vessel';
  vessel.setAttribute('aria-hidden', 'true');
  const liquid = document.createElement('span');
  vessel.append(liquid);
  const phaseStatus = textNode('p', '倒入基底');
  phaseStatus.tabIndex = -1;
  phaseStatus.setAttribute('role', 'status');
  const meter = document.createElement('progress');
  meter.max = 1;
  meter.value = 0;
  meter.setAttribute('aria-label', '调制进度');
  mixing.append(vessel, phaseStatus, meter);

  const result = document.createElement('div');
  result.className = 'tavern-mix-result';
  result.dataset.tavernResult = '';
  result.hidden = true;
  const resultHeading = document.createElement('h3');
  resultHeading.tabIndex = -1;
  const resultStatus = document.createElement('p');
  resultStatus.setAttribute('role', 'status');
  const resultActions = document.createElement('div');
  resultActions.className = 'tavern-mix-result-actions';
  const takeButton = textNode('button', '端起这杯');
  takeButton.type = 'button';
  takeButton.dataset.action = 'take';
  const againButton = textNode('button', '再调一杯');
  againButton.type = 'button';
  againButton.dataset.action = 'again';
  resultActions.append(takeButton, againButton);
  result.append(resultHeading, resultStatus, resultActions);
  activity.append(form, mixing, result);
  panel.append(activity);

  function updateChoices() {
    const selected = getTavernRecipe(base.value, addIn.value);
    for (const { recipe, button } of recipeCards) {
      button.setAttribute('aria-pressed', String(recipe.id === selected?.id));
    }
    formStatus.textContent = base.value && addIn.value && !selected
      ? '请按酒单上的配方搭配。'
      : '';
    mixButton.disabled = !selected;
  }

  const recipeCards = tavernRecipes.map(recipe => {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.recipe = recipe.id;
    button.style.setProperty('--recipe-color', recipe.color);
    const label = textNode('strong', recipe.name);
    const baseLabel = tavernBases.find(item => item.id === recipe.base)?.label ?? recipe.base;
    const addInLabel = tavernAddIns.find(item => item.id === recipe.addIn)?.label ?? recipe.addIn;
    const ingredients = textNode('span', [baseLabel, addInLabel].join(' + '));
    ingredients.className = 'tavern-mix-ingredient-list';
    const stamp = textNode('small', '已收录');
    stamp.className = 'tavern-mix-stamp';
    stamp.hidden = true;
    button.append(label, ingredients, stamp);
    button.onclick = () => {
      base.value = recipe.base;
      addIn.value = recipe.addIn;
      updateChoices();
    };
    row.append(button);
    recipes.append(row);
    return { recipe, button, stamp };
  });

  function updateBook() {
    const ids = new Set(options.ids());
    let count = 0;
    for (const { recipe, stamp } of recipeCards) {
      const discovered = ids.has(recipe.id);
      stamp.hidden = !discovered;
      if (discovered) count++;
    }
    collection.textContent = `已收录 ${count}/${recipeCards.length}`;
  }

  let finished: TavernRecipe | undefined;

  function setProgress(value: number) {
    const progress = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    if (mixing.hidden) return;
    meter.value = progress;
    liquid.style.setProperty('--fill', `${Math.round(progress * 100)}%`);
    const phase = progress < .34 ? '倒入基底' : progress < .67 ? '加入风味' : '搅拌装杯';
    if (phaseStatus.textContent !== phase) phaseStatus.textContent = phase;
  }

  function finish(recipe: TavernRecipe, discovered: boolean) {
    if (mixing.hidden) return;
    finished = recipe;
    mixing.hidden = true;
    result.hidden = false;
    resultHeading.textContent = recipe.name;
    resultHeading.style.setProperty('--recipe-color', recipe.color);
    resultStatus.textContent = discovered ? '调制完成，已收录进酒单。' : '调制完成，这杯特调已在酒单里。';
    takeButton.disabled = false;
    updateBook();
    resultHeading.focus({ preventScroll: true });
  }

  function cancel() {
    finished = undefined;
    result.hidden = true;
    mixing.hidden = true;
    form.hidden = false;
    updateBook();
    updateChoices();
  }

  form.onsubmit = event => {
    event.preventDefault();
    const recipe = getTavernRecipe(base.value, addIn.value);
    if (!recipe || form.hidden) return;
    form.hidden = true;
    mixing.hidden = false;
    liquid.style.setProperty('--recipe-color', recipe.color);
    setProgress(0);
    if (options.mix(base.value, addIn.value)) {
      if (!mixing.hidden) phaseStatus.focus({ preventScroll: true });
    } else {
      cancel();
      formStatus.textContent = '暂时无法调制，请再试一次。';
      mixButton.focus({ preventScroll: true });
    }
  };
  base.onchange = addIn.onchange = updateChoices;
  takeButton.onclick = () => {
    if (!finished || takeButton.disabled) return;
    if (options.take(finished.id)) {
      takeButton.disabled = true;
      resultStatus.textContent = '已端起这杯特调。';
    } else {
      resultStatus.textContent = '这杯特调暂时拿不起来，请再试一次。';
    }
  };
  againButton.onclick = () => {
    cancel();
    base.focus({ preventScroll: true });
  };

  updateBook();
  updateChoices();
  return { setProgress, finish, cancel };
}
