export const tavernBases = [
  { id: 'apple', label: '热苹果汁' },
  { id: 'black-tea', label: '红茶' },
  { id: 'pear', label: '梨汁' },
] as const;

export const tavernAddIns = [
  { id: 'cinnamon', label: '肉桂' },
  { id: 'orange-peel', label: '橙皮' },
  { id: 'ginger', label: '姜片' },
] as const;

export type TavernRecipe = {
  readonly id: string;
  readonly name: string;
  readonly base: (typeof tavernBases)[number]['id'];
  readonly addIn: (typeof tavernAddIns)[number]['id'];
  readonly color: string;
};

export const tavernRecipes = [
  { id: 'fireplace-apple', name: '炉火苹果', base: 'apple', addIn: 'cinnamon', color: '#c97a43' },
  { id: 'orange-black-tea', name: '橙香红茶', base: 'black-tea', addIn: 'orange-peel', color: '#a74434' },
  { id: 'snow-pear', name: '雪夜姜梨', base: 'pear', addIn: 'ginger', color: '#e4c17c' },
] as const satisfies readonly TavernRecipe[];

export function getTavernRecipe(base: string, addIn: string): TavernRecipe | undefined {
  return tavernRecipes.find(recipe => recipe.base === base && recipe.addIn === addIn);
}

type MixStorage = Pick<Storage, 'getItem' | 'setItem'>;
const recipeIds = new Set<string>(tavernRecipes.map(recipe => recipe.id));
const discoveryKey = 'unwritten:2027-tavern-mix:';

function browserStorage(): MixStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function createTavernMixBook(storage: MixStorage | undefined = browserStorage()) {
  const discovered = new Set<string>();
  const stored = new Set<string>();

  function has(id: string): boolean {
    if (!recipeIds.has(id)) return false;
    if (discovered.has(id)) return true;
    try {
      if (storage?.getItem(discoveryKey + id) === '1') {
        discovered.add(id);
        stored.add(id);
      }
    } catch {
      // A restricted browser can still keep a session-only recipe book.
    }
    return discovered.has(id);
  }

  function record(id: string): boolean {
    if (!recipeIds.has(id)) return false;
    const firstDiscovery = !has(id);
    discovered.add(id);
    if (storage && !stored.has(id)) {
      try {
        // Separate keys let different tabs discover different drinks without overwriting each other.
        storage.setItem(discoveryKey + id, '1');
        stored.add(id);
      } catch {
        // Keep the discovery in this session and retry when the player makes this drink again.
      }
    }
    return firstDiscovery;
  }

  function ids(): readonly string[] {
    return tavernRecipes.map(recipe => recipe.id).filter(has);
  }

  return { ids, record, has };
}
