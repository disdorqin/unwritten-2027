import { browserTextStorage, type StorageAccess } from './town-text-store';

export const tavernStoryRoles = ['innkeeper', 'waiter'] as const;
export type TavernStoryRole = (typeof tavernStoryRoles)[number];
export type TavernStoryClue = `tavern-drunk-talk-${TavernStoryRole}`;

type StoryAction = Readonly<{ label: string; run(): boolean }>;
type StoryCopy = Readonly<Partial<Record<TavernStoryClue, string>>>;
export type TavernHotWineReceipt = Readonly<{ kind: 'tavern-hot-wine-consumed'; id: string }>;
type TavernStoryHost = {
  inTavern(): boolean;
  npcHasDrunk(role: TavernStoryRole): boolean;
  canOrderHotWine(): boolean;
  orderHotWine(): void;
  showAncestors(): void;
};
const storagePrefix = 'unwritten:tavern-drunk-talk:v1:';

const clueFor = (role: TavernStoryRole): TavernStoryClue => `tavern-drunk-talk-${role}`;

export function createTavernStory(host: TavernStoryHost, storage: StorageAccess | undefined = browserTextStorage(),
  approvedCopy: StoryCopy = {}) {
  const heard = new Set<TavernStoryClue>();
  const presentedWine = new Set<string>();

  function has(id: TavernStoryClue) {
    if (heard.has(id)) return true;
    try {
      if (storage?.getItem(storagePrefix + id) === '1') {
        heard.add(id);
        return true;
      }
    } catch { /* A restricted browser can still collect the clue in this session. */ }
    return false;
  }

  function record(id: TavernStoryClue) {
    heard.add(id);
    try { storage?.setItem(storagePrefix + id, '1'); }
    catch { /* Keep the local session's discovery. */ }
  }

  function conversationActions(role: TavernStoryRole, showLine: (line: string) => void): StoryAction[] {
    if (!host.inTavern() || !tavernStoryRoles.includes(role)) return [];
    const id = clueFor(role);
    const result: StoryAction[] = [];
    if (host.npcHasDrunk(role) && !has(id)) result.push({
      label: '听一段醉话',
      run() {
        if (!host.inTavern() || !host.npcHasDrunk(role) || has(id)) return false;
        record(id);
        const copy = approvedCopy[id]?.trim();
        if (copy) showLine(copy);
        return true;
      },
    });
    if (role === 'innkeeper' && host.canOrderHotWine()) result.push({
      label: '点一杯热酒',
      run() {
        if (!host.inTavern() || !host.canOrderHotWine()) return false;
        host.orderHotWine();
        return true;
      },
    });
    return result;
  }

  // Read only an accepted hot-wine consumption receipt from the host. Ordinary sips,
  // hovering over the menu and unauthenticated environmental effects must not call this.
  function hotWineConsumed(receipt: TavernHotWineReceipt) {
    const id = typeof receipt?.id === 'string' ? receipt.id.trim() : '';
    if (receipt?.kind !== 'tavern-hot-wine-consumed' || !id || presentedWine.has(id)) return false;
    presentedWine.add(id);
    if (!host.inTavern()) return false;
    host.showAncestors();
    return true;
  }

  function journal() {
    return tavernStoryRoles.map(clueFor).filter(has).map(id => ({ id, text: approvedCopy[id]?.trim() ?? '' }));
  }

  return { conversationActions, hotWineConsumed, journal };
}
