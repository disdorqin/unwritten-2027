import { browserTextStorage, type StorageAccess } from './town-text-store';

export const townStoryDisplayKey = 'unwritten.story.display.v1';
export const townStoryModes = [
  { value: 'guest', label: '游客', strength: .3 },
  { value: 'explore', label: '探索', strength: .65 },
  { value: 'story', label: '故事', strength: 1 },
] as const;

type TownStoryChoice = typeof townStoryModes[number];
export type TownStoryMode = TownStoryChoice['value'];

const defaultMode = townStoryModes[1];

function knownMode(value: unknown) {
  return townStoryModes.find(mode => mode.value === value);
}

export function createTownStoryDisplay(storage = browserTextStorage()) {
  let choice: TownStoryChoice = defaultMode;
  try {
    choice = knownMode(storage?.getItem(townStoryDisplayKey)) ?? defaultMode;
  } catch { /* Display can still be changed for this visit. */ }

  const listeners = new Set<(mode: TownStoryMode) => void>();
  return {
    mode: () => choice.value,

    setMode(value: unknown) {
      const next = knownMode(value);
      if (!next || next === choice) return choice.value;
      choice = next;
      try { storage?.setItem(townStoryDisplayKey, next.value); }
      catch { /* Keep this visit's choice. */ }
      for (const listener of listeners) listener(choice.value);
      return choice.value;
    },

    subscribe(listener: (mode: TownStoryMode) => void) {
      listeners.add(listener);
      listener(choice.value);
      return () => { listeners.delete(listener); };
    },

    /** Multiply existing visibility for authorized souls, night traces and footprints. */
    strength(authorized: boolean) {
      if (authorized !== true) return 0;
      return choice.strength;
    },

    /** The host supplies its silent atlas update and the current viewer's access decision. */
    appendAtlasLine(authorized: boolean, appendSilently: () => void) {
      if (authorized !== true) return false;
      appendSilently();
      return true;
    },
  };
}

export function mountTownStoryControl(
  select: HTMLSelectElement,
  display: ReturnType<typeof createTownStoryDisplay>,
) {
  const options = townStoryModes.map(({ value, label }) => {
    const option = select.ownerDocument.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  });
  select.replaceChildren(...options);
  if (!select.hasAttribute('aria-label') && !select.hasAttribute('aria-labelledby') && !select.labels?.length) {
    select.setAttribute('aria-label', '故事显示模式');
  }
  const unsubscribe = display.subscribe(mode => { select.value = mode; });
  function change() { select.value = display.setMode(select.value); }
  select.addEventListener('change', change);

  return () => {
    select.removeEventListener('change', change);
    unsubscribe();
  };
}
