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
type NpcLetter = Letter & { authorType: 'npc'; fromNpc: true; title: string };
type PlayerEnvelope = Pick<Letter, 'id' | 'recipientName' | 'sealedAt'>;
type NpcEnvelope = Pick<NpcLetter, 'id' | 'authorName' | 'fromNpc'> &
  ({ title: string; recipientName: string } | { title?: undefined; recipientName?: undefined });
type Envelope = PlayerEnvelope | NpcEnvelope;
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

// Muse's NPC时光信件-v1. Built-in letters never enter local storage.
const npcLetterTime = new Date(UNLOCK_AT).getTime();
const NPC_LETTERS: readonly NpcLetter[] = [
  {
    npcId: "luo-dajiang", authorName: "罗大江",
    recipientName: "未来的访客", title: "炉子给你留着火",
    body: "开箱的你，见字如面。我是酒馆的罗大江。这封信投进箱子的时候，窗外正下着雪，我的汤还在炉子上咕嘟着。乐天张罗这一镇子的跨年局，图的就是大家能凑一块儿，暖和暖和。你要是读到这封信，先别急着赶路，来我酒馆坐坐，第一碗热汤算我的。日子跟熬汤一个理儿，急不得，火候到了，自然就香了。愿你新的一年，家里炉火旺，心里有热乎气。镇子不大，可灯都给你亮着呢。",
  },
  {
    npcId: "su-xiaoman", authorName: "苏小满",
    recipientName: "2027 年开箱的人", title: "这封信，我亲自送到明年",
    body: "猜猜我是谁？邮局的苏小满，全镇腿最快的人——这封信，我可是提前一年投的，绕了个大圈，亲手送到你手里。送信这些年，我最大的心得就是：再远的路，一步一步走，总有送到的时候。你读到它的时候，跨年钟声该敲响了。这一年里你等过的信、盼过的人，但愿都有了回音。没等到的也别急，说不定就在下一趟邮包里。好啦，我还要去送下一封——新年快乐，替我向 2027 年问声好！",
  },
  {
    npcId: "gu-changming", authorName: "顾长明",
    recipientName: "明年的自己", title: "灯还亮着",
    body: "明年的我，见字好。塔上的灯，今夜又转了一圈。一年到头，我说的话不多，想的都在这几行里。守塔的规矩没变：灯别灭，人别走。这一年，镇子大了些，人也多了些，湖上的冰化了又冻。都好。我没什么大愿望。就盼明年的今夜，灯还亮着，雪还下着，你还能爬上塔来，陪湖坐一会儿。人这一辈子，守住一盏灯，也算守住了日子。钟声快响了。下塔吧，路滑，慢些走。",
  },
  {
    npcId: "qiao-mai", authorName: "乔麦",
    recipientName: "未来的访客", title: "愿你这一年亮堂",
    body: "你好呀，我是灯坊的乔麦，扎灯的。写这封信的时候，我手上正糊着跨年夜广场那盏大灯，浆糊还没干透。扎灯的人最懂一个理儿：纸再薄，透了光就是亮的；日子再难，熬过去就是暖的。这一年你要是顺风顺水，我替你高兴；要是有过磕磕绊绊，也别往心里去——灯芯剪一剪，还能再亮。开箱这天，全镇的灯一起亮，你站在广场上抬头看看，有一盏是我扎的。新的一年，愿你心里有光，眼前有路，亮堂堂地往前走。",
  },
  {
    npcId: "liu-sanxian", authorName: "柳三弦",
    recipientName: "未来的看官", title: "好戏，刚刚开场",
    body: "台下的看官，柳三弦这厢有礼了！这封信封进箱子的时候，我们班子正排跨年夜的压轴戏，锣鼓家伙都擦得锃亮。唱戏的人信一句话：没有过不去的场，只有没唱完的戏。这一年您要是唱过几段难的，也别往心里搁——落幕了，咱再开新场。今晚钟声一响，满台灯偶都给您拜年。愿您新的一年，台上台下都有人喝彩，日子过得比戏文还热闹。得嘞，锣鼓催了，我得上台——好戏，这才刚刚开场！",
  },
  {
    npcId: "zhong-tiesheng", authorName: "钟铁生",
    recipientName: "未来的旅客", title: "本站欢迎您，明年见",
    body: "未来的旅客，你好。本人钟铁生，雪镇火车站站长。按本站时刻表，这封信应在跨年夜二十点整送达你手中——本站的信，从不晚点。过去一年，本镇的车次把每一位朋友都稳稳当当送到了新年跟前。我想说的是：人生如行车，偶有晚点，不必慌张，站台上总有人等你。愿你新的一年，出行平安，进站出站，皆有灯光。跨年夜本站所有车次只进不出，把朋友们都接进来过年。本人会在站台上，迎你。站长钟铁生，报站完毕。",
  },
  {
    npcId: "qian-mancang", authorName: "钱满仓",
    recipientName: "未来的客人", title: "开箱大吉，和气生财",
    body: "开箱的客官，钱满仓给您道喜啦！这封信投箱的时候，我的年集正热闹，糖炒栗子的香气能飘半条街。这集市、这镇子，都是乐天张罗着给朋友们跨年聚的局，我就是跟着沾光，支个摊子凑个热闹。我做买卖这些年悟出一个理儿：钱要赚，话要暖，买卖做到最后，做的是人情。新的一年，我的摊子照样支在老地方，好货给您留着，热茶给您备着。就盼您常来常往，日子红红火火——和气生财，这四个字，送您了！",
  },
  {
    npcId: "ding-xiaodou", authorName: "丁小豆",
    recipientName: "未来的访客", title: "一个准信儿，提前一年告诉你",
    body: "嘿，读信的你，我跟你说个准信儿——我是丁小豆，集市上跑堂的，消息最灵的那个。这个准信儿我提前一年就知道了，一直憋着没说：跨年夜这天，你会特别开心！不信？你看，你这不是读到我的信了嘛。跑堂这一年，我端着托盘满街跑，听了满耳朵的新鲜事，就明白一个理儿：日子过得快，热乎气儿不能凉。新的一年，要是你路过集市，喊一声小豆，我请你喝碗热汤——说好了的，不许赖账。好啦，托盘还等着我呢，新年快乐！",
  },
  {
    npcId: "tao-erniang", authorName: "陶二娘",
    recipientName: "未来的客人", title: "甜的在后头",
    body: "读信的你，我是陶二娘，卖糖葫芦的。先说好，这封信不甜，话糙理不糙。裹糖葫芦有个讲究：糖熬过了头发苦，熬不到又粘牙——过日子也一样，火候最难拿。可我见得多了，再难的日子，也没见谁被难住一辈子。你要是这一年过得有点苦，别急，甜的都在后头呢。开箱这天来我摊上，报这封信，我多给你裹一层糖，再多塞你一颗——别推，推了就是不给我面子。新的一年，愿你嘴里甜，心里也甜。",
  },
].map(({ npcId, authorName, recipientName, title, body }) => ({
  id: 'npc-' + npcId, kind: 'letter', authorType: 'npc', authorName, recipientName, title, body,
  recipientType: recipientName === townMailRecipients.self ? 'self' : 'friend',
  signature: authorName, createdAt: npcLetterTime, sealedAt: npcLetterTime, openedAt: null, fromNpc: true,
}));

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
  const hasOpened = (items: Letter[]) => boxOpened || openedNpc.size > 0 || items.some(item => item.openedAt !== null);
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
  function readLetter(id: string): { letter?: Letter | NpcLetter; reason?: RejectReason } {
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
    const opened = hasOpened(items);
    const envelopes: Envelope[] = items.map(({ id, recipientName, sealedAt }) => ({ id, recipientName, sealedAt }));
    if (includeReadOnlyNpc) {
      for (const { id, authorName, title, recipientName } of NPC_LETTERS) {
        const envelope = { id, authorName, fromNpc: true } as const;
        envelopes.push(opened ? { ...envelope, title, recipientName } : envelope);
      }
    }
    return {
      ready, opened,
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
