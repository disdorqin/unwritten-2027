import { npcScript, type NpcName } from './town-npc-dialogue';

export const UNLOCK_AT = '2026-12-31T20:00:00';
export const townMailKeys = { wall: 'unwritten.wall.v1', timebox: 'unwritten.timebox.v1' } as const;
export const townMailLimits = { wall: 60, recipient: 12, letter: 200, signature: 8, sealed: 5, wallItems: 200, cooldown: 3000 };
export const townMailRecipients = { friend: '跨年夜的朋友', npc: '镇民', self: '明年的自己', town: '小镇' } as const;
export const townMailNpcNames = Object.keys(npcScript) as NpcName[];

type RecipientType = keyof typeof townMailRecipients;
type AuthorType = 'player' | 'npc';
type Entry = { id: string; authorType: AuthorType; authorName: string; body: string; createdAt: number };
type Message = Entry & { kind: 'wall'; pinned: boolean };
export type Letter = Entry & {
  kind: 'letter'; recipientType: RecipientType; recipientName: string; signature: string;
  sealedAt: number; openedAt: number | null; fromNpc: boolean;
};
type Envelope = Pick<Letter, 'id' | 'recipientName' | 'sealedAt'>;
type Collection<Item> = { version: 1; items: Item[] };
type LetterDraft = Pick<Letter, 'recipientType' | 'recipientName' | 'body' | 'signature'>;
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
type RejectReason = 'empty' | 'length' | 'blocked' | 'duplicate' | 'cooldown' | 'capacity' | 'storage' | 'locked' | 'missing';
type Result = { ok: true } | { ok: false; reason: RejectReason };
type EventBase = { actor: 'player:local'; t: number };
export type TownMailEvent = EventBase & (
  | { type: 'wall.post'; target: 'postoffice.wall'; payload: { messageId: string; body: string } }
  | { type: 'timebox.seal'; target: 'postoffice.timebox'; payload: Pick<Letter, 'body' | 'recipientType' | 'recipientName'> & { letterId: string } }
  | { type: 'timebox.open'; target: 'postoffice.timebox'; payload: { letterId: string } }
);

// Muse supplies the versioned NPC content. Built-in letters never enter local storage.
const NPC_LETTERS: readonly (Letter & { authorType: 'npc'; fromNpc: true })[] = [];

const defaultAuthor = '一位镇民';
const patterns = {
  insults: /傻逼|傻[比批]|操你[妈娘]|滚你[妈娘]|妈的|去死吧|废物|垃圾东西|蠢货|fuck|bitch/i,
  spam: /兼职刷单|免费赚钱|稳赚不赔|博彩|代开发票|点击链接|加群领取|点击购买|扫码加群/,
  contacts: /(?:\+?86[\s\-·.]*)?(?:\(?1[3-9]\d\)?)[\s\-·.]*\d(?:[\s\-·.]*\d){7}|[\w.%+-]+@[\w.-]+\.[a-z]{2,}|(?:加(?:我|好友)?|联系|搜|我的)?\s*(?:微信|微\s*信号|wechat|vx|v信|qq|企鹅号|微博|抖音|小红书|telegram|tg|discord)(?:号|账号|id)?\s*[:：=+@／/\-]?\s*[a-z\d_][a-z\d_.\-]{3,}/i,
};
const usableText = (value: string) => /[^\p{White_Space}\p{P}\p{Cf}]/u.test(value);
export const townMailTextLength = (value: string) => Array.from(value).length;
const containsBlockedText = (value: string) =>
  Object.values(patterns).some(rule => rule.test(value.normalize('NFKC').replace(/\p{Cf}/gu, '')));
const reject = (reason: RejectReason): Result => ({ ok: false, reason });
const ok: Result = { ok: true };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 8.64e15;
function base(value: Record<string, unknown>) {
  return typeof value.id === 'string' && value.id.length > 0 &&
    (value.authorType === 'player' || value.authorType === 'npc') &&
    typeof value.authorName === 'string' && typeof value.body === 'string' && isTime(value.createdAt);
}
function isMessage(value: unknown): value is Message {
  return record(value) && base(value) && value.kind === 'wall' && typeof value.pinned === 'boolean';
}
function isRecipient(value: unknown): value is RecipientType {
  return typeof value === 'string' && Object.hasOwn(townMailRecipients, value);
}
function isPlayerLetter(value: unknown): value is Letter {
  return record(value) && base(value) && value.kind === 'letter' && value.authorType === 'player' &&
    isRecipient(value.recipientType) && typeof value.recipientName === 'string' &&
    typeof value.signature === 'string' && isTime(value.sealedAt) &&
    (value.openedAt === null || isTime(value.openedAt)) && value.fromNpc === false;
}

function readCollection<Item>(storage: StorageAccess | undefined, key: string, guard: (item: unknown) => item is Item): Item[] {
  if (!storage) return [];
  let raw: string | null;
  try { raw = storage.getItem(key); }
  catch { return []; }
  if (raw === null) return [];
  try {
    // Add a migration step here when an older collection version becomes supported.
    const parsed: unknown = JSON.parse(raw);
    if (record(parsed) && parsed.version === 1 && Array.isArray(parsed.items) && parsed.items.every(guard)) {
      return parsed.items;
    }
  } catch { /* Preserve the source below. */ }
  try {
    storage.setItem(key + '.bak', raw);
    storage.setItem(key, JSON.stringify({ version: 1, items: [] }));
  } catch { /* A read-only browser still opens the empty panel. */ }
  return [];
}

function writeCollection<Item>(storage: StorageAccess | undefined, key: string, items: Item[]) {
  if (!storage) return false;
  try {
    const payload: Collection<Item> = { version: 1, items };
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch { return false; }
}

function validate(value: string, width: number, required = true): RejectReason | undefined {
  if ((!value && required) || (value && !usableText(value))) return 'empty';
  if (townMailTextLength(value) > width) return 'length';
  if (containsBlockedText(value)) return 'blocked';
}

export function createTownMailStore(storage: StorageAccess | undefined, clock = Date.now,
  onEvent: (event: TownMailEvent) => void = () => {}) {
  const messages = () => readCollection(storage, townMailKeys.wall, isMessage);
  const letters = () => readCollection(storage, townMailKeys.timebox, isPlayerLetter);
  const makeId = (time: number) => String(time) + '-' + Math.random().toString(36).slice(2, 12);
  const openedNpc = new Map<string, number>();
  let lastLocalWrite = -Infinity;
  let boxOpened = false;
  const hasOpened = (items: Letter[]) => boxOpened || items.some(item => item.openedAt !== null);
  const allow = (items: Letter[], time: number) => time >= new Date(UNLOCK_AT).getTime() || hasOpened(items);
  const cooled = (time: number, ...sets: readonly Entry[][]) => time - sets.reduce((latest, items) =>
    items.reduce((max, item) => item.authorType === 'player' && item.createdAt <= time ? Math.max(max, item.createdAt) : max,
      latest), lastLocalWrite <= time ? lastLocalWrite : -Infinity) >= townMailLimits.cooldown;
  const notify = (event: TownMailEvent) => {
    try { onEvent(event); }
    catch { /* Local persistence does not depend on an event consumer. */ }
  };

  function postMessage(input: string): Result {
    const body = input.trim();
    const issue = validate(body, townMailLimits.wall);
    if (issue) return reject(issue);
    const items = messages();
    if (items.some(item => item.body === body && item.authorType === 'player')) return reject('duplicate');
    const t = clock();
    if (!cooled(t, items, letters())) return reject('cooldown');
    const message: Message = { id: makeId(t), kind: 'wall', authorType: 'player', authorName: defaultAuthor, body, createdAt: t, pinned: false };
    items.push(message);
    while (items.length > townMailLimits.wallItems) {
      let oldest = -1;
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        if (item.authorType === 'player' && !item.pinned && (oldest < 0 || item.createdAt < items[oldest].createdAt)) oldest = index;
      }
      if (oldest < 0) break;
      items.splice(oldest, 1);
    }
    if (!items.includes(message)) return reject('capacity');
    if (!writeCollection(storage, townMailKeys.wall, items)) return reject('storage');
    lastLocalWrite = t;
    notify({ type: 'wall.post', actor: 'player:local', target: 'postoffice.wall', payload: { messageId: message.id, body }, t });
    return ok;
  }

  function sealLetter(input: LetterDraft): Result {
    const recipientType = input.recipientType;
    if (!isRecipient(recipientType)) return reject('missing');
    const body = input.body.trim();
    const signature = input.signature.trim();
    const recipientName = recipientType === 'self' || recipientType === 'town' ? townMailRecipients[recipientType] : input.recipientName.trim();
    if (recipientType === 'npc' && !townMailNpcNames.some(name => name === recipientName)) return reject('missing');
    const issue = validate(body, townMailLimits.letter) || validate(recipientName, townMailLimits.recipient) ||
      validate(signature, townMailLimits.signature, false);
    if (issue) return reject(issue);
    const items = letters();
    if (items.length >= townMailLimits.sealed) return reject('capacity');
    if (items.some(item => item.body === body)) return reject('duplicate');
    const t = clock();
    if (!cooled(t, items, messages())) return reject('cooldown');
    const openedAt = hasOpened(items) ? t : null;
    const letter: Letter = { id: makeId(t), kind: 'letter', authorType: 'player', authorName: signature || defaultAuthor,
      body, createdAt: t, recipientType, recipientName, signature, sealedAt: t, openedAt, fromNpc: false };
    if (!writeCollection(storage, townMailKeys.timebox, [...items, letter])) return reject('storage');
    lastLocalWrite = t;
    notify({ type: 'timebox.seal', actor: 'player:local', target: 'postoffice.timebox',
      payload: { letterId: letter.id, recipientType, recipientName, body }, t });
    if (openedAt !== null) openEvent(letter.id, t);
    return ok;
  }

  const openEvent = (letterId: string, t: number) =>
    notify({ type: 'timebox.open', actor: 'player:local', target: 'postoffice.timebox', payload: { letterId }, t });
  function readLetter(id: string): { letter?: Letter; reason?: RejectReason } {
    const t = clock();
    const items = letters();
    if (!allow(items, t)) return { reason: 'locked' };
    const letter = items.find(item => item.id === id);
    if (letter) {
      if (letter.openedAt === null) {
        letter.openedAt = t;
        if (!writeCollection(storage, townMailKeys.timebox, items)) return { reason: 'storage' };
        openEvent(id, t);
      }
      return { letter };
    }
    const npc = NPC_LETTERS.find(item => item.id === id);
    if (!npc) return { reason: 'missing' };
    if (!openedNpc.has(id)) {
      openedNpc.set(id, t);
      openEvent(id, t);
    }
    return { letter: { ...npc, openedAt: openedNpc.get(id)! } };
  }

  function openTimebox(): Result {
    const items = letters();
    const t = clock();
    if (!allow(items, t)) return reject('locked');
    const unsealed = items.filter(item => item.openedAt === null);
    for (const item of unsealed) item.openedAt = t;
    if (unsealed.length && !writeCollection(storage, townMailKeys.timebox, items)) return reject('storage');
    for (const item of unsealed) openEvent(item.id, t);
    for (const { id } of NPC_LETTERS) {
      if (openedNpc.has(id)) continue;
      openedNpc.set(id, t);
      openEvent(id, t);
    }
    boxOpened = true;
    return ok;
  }

  function retractLetter(id: string): Result {
    const items = letters();
    if (allow(items, clock())) return reject('locked');
    if (!items.some(item => item.id === id)) return reject('missing');
    return writeCollection(storage, townMailKeys.timebox, items.filter(item => item.id !== id)) ? ok : reject('storage');
  }

  function timeboxStatus(includeReadOnlyNpc = false) {
    const items = letters();
    const t = clock();
    const ready = allow(items, t);
    if (ready && !items.length && !NPC_LETTERS.length) boxOpened = true;
    const visible = ready && includeReadOnlyNpc ? [...items, ...NPC_LETTERS] : items;
    const envelopes: Envelope[] = visible.map(({ id, recipientName, sealedAt }) => ({ id, recipientName, sealedAt }));
    return {
      ready, opened: hasOpened(items),
      remainingHours: Math.max(0, Math.ceil((new Date(UNLOCK_AT).getTime() - t) / 3_600_000)),
      count: items.length, envelopes,
    };
  }

  function publicLetters() {
    const items = letters();
    if (!allow(items, clock())) return [];
    return items.filter(item => item.recipientType === 'town' && item.openedAt !== null)
      .concat(NPC_LETTERS.filter(item => item.recipientType === 'town' && openedNpc.has(item.id))
        .map(item => ({ ...item, openedAt: openedNpc.get(item.id)! })))
      .sort((a, b) => b.sealedAt - a.sealedAt);
  }

  return {
    postMessage, sealLetter, readLetter, openTimebox, retractLetter, timeboxStatus, publicLetters,
    wallMessages: () => messages().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt),
  };
}
