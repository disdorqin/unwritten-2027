// Runtime projection of Muse's NPC人设与台词-v2.md and its fact-bank policy.
// This module includes only dialogue presented to visitors.
import script from './town-npc-dialogue.json';
import expansion from './town-npc-expansion.json';
import { npcAddedDialogue } from './town-npc-added-dialogue';

export type NpcName = keyof typeof script;
type ScriptPeriod = '傍晚' | '夜里' | '跨年夜';
export type NpcPeriod = ScriptPeriod | '白天';

type RoleScript = {
  greetings: Record<ScriptPeriod, string[]>;
  farewells: Record<ScriptPeriod, string>;
  smallTalk: string[];
  facts: Readonly<Partial<Record<number, string>>>;
  broad: Readonly<Partial<Record<number, string>>>;
  refusals: string[];
};
export const npcScript: Readonly<Record<NpcName, RoleScript>> = script;

// Authored dialogue can be ready before actors or their activity sites are installed.
export const npcAuthoredDialogue = { ...npcScript, ...npcAddedDialogue } as const;

export const npcAuthoredQuestionTopics = [
  { id: 'familiarity', label: '问你们怎么认识', section: 'host', index: 0, fact: false },
  { id: 'current-work', label: '问镇长近况', section: 'host', index: 1, fact: true },
  { id: 'character', label: '问镇长为人', section: 'host', index: 2, fact: false },
  { id: 'introduction', label: '听一句介绍', section: 'host', index: 3, fact: true },
  { id: 'contact', label: '问联系方式', section: 'outside', index: 0, fact: false },
  { id: 'residence', label: '问住处', section: 'outside', index: 1, fact: false },
] as const;

type AuthoredQuestion = Readonly<{ verdict: '可答' | '挡回'; text: string }>;
type AuthoredQuestions = Readonly<Record<'host' | 'outside', readonly AuthoredQuestion[]>>;

export function answerAuthoredNpcQuestion(questions: AuthoredQuestions, id: unknown): {
  kind: 'fact' | 'refusal';
  text: string;
} | undefined {
  const topic = npcAuthoredQuestionTopics.find(option => option.id === id);
  const row = topic && questions[topic.section][topic.index];
  if (row?.text && row.verdict === '挡回') return { kind: 'refusal', text: row.text };
  if (row?.text && topic?.fact && row.verdict === '可答') return { kind: 'fact', text: row.text };
  const fallback = questions.host[0];
  if (fallback?.text && fallback.verdict === '挡回') return { kind: 'refusal', text: fallback.text };
}

export type TownNpcGuide = 'seating' | 'stage' | 'postcard' | 'wishes' | 'ice' |
  'lantern' | 'mixing' | 'spring' | 'castle' | 'rail' | 'bell';
type ExpandedRole = {
  life: string[];
  newYear: string[];
  weather: string[];
  guides: Readonly<Partial<Record<TownNpcGuide, string>>>;
  neighbors: string[];
  familiar: Record<'初见' | '再访' | '常客', string[]>;
  holidayFacts?: Readonly<Partial<Record<number, string>>>;
};
type Expansion = Record<NpcName, ExpandedRole> & { 通用: { newYear: string[]; weather: string[] } };
export const npcExpansion: Expansion = expansion;

const shanghaiClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai', hourCycle: 'h23', hour: '2-digit',
  month: '2-digit', day: '2-digit',
});

export function npcPeriod(now: Date, isDaytime = false): NpcPeriod {
  const pieces = shanghaiClock.formatToParts(now);
  const hour = Number(pieces.find(piece => piece.type === 'hour')?.value);
  const month = pieces.find(piece => piece.type === 'month')?.value;
  const day = pieces.find(piece => piece.type === 'day')?.value;
  if ((month === '12' && day === '31' && hour >= 18) || (month === '01' && day === '01' && hour < 2)) return '跨年夜';
  if (isDaytime || (hour >= 6 && hour < 18)) return '白天';
  return hour >= 20 || hour < 6 ? '夜里' : '傍晚';
}

// Time-neutral opening lines borrowed from Muse's scripted evening greetings.
const daytimeGreetings: Readonly<Record<NpcName, string>> = {
  罗大江: script.罗大江.greetings.傍晚[0],
  苏小满: script.苏小满.greetings.傍晚[1],
  顾长明: script.顾长明.greetings.傍晚[0],
  乔麦: script.乔麦.greetings.傍晚[1],
  柳三弦: script.柳三弦.greetings.傍晚[1],
  钟铁生: script.钟铁生.greetings.傍晚[0],
};

export function npcGreeting(name: NpcName, period: NpcPeriod, visitsBefore: number): string {
  const familiarity = visitsBefore === 0 ? '初见' : visitsBefore < 4 ? '再访' : '常客';
  const familiar = npcExpansion[name].familiar[familiarity];
  const lineIndex = Math.floor(visitsBefore / 2);
  const useFamiliar = visitsBefore % 2 === 0 && period !== '跨年夜';
  if (period === '白天') {
    if (!useFamiliar) return daytimeGreetings[name];
    const suitable = familiar.filter(line => !/今晚|今夜|夜里|天黑/.test(line));
    return suitable[lineIndex % suitable.length] ?? daytimeGreetings[name];
  }
  const greetings = useFamiliar ? familiar : npcAuthoredDialogue[name].greetings[period];
  return greetings[lineIndex % greetings.length];
}

export function npcFarewell(name: NpcName, period: NpcPeriod): string {
  if (period === '白天') {
    // Keep the existing line's safety advice without saying that it is about to get dark.
    if (name === '顾长明') return '下塔慢点，台阶滑。';
    return npcAuthoredDialogue[name].farewells.傍晚;
  }
  return npcAuthoredDialogue[name].farewells[period];
}

type Question = readonly [id: number, label: string];
export const npcQuestions: ReadonlyArray<{ title: string; questions: ReadonlyArray<Question> }> = [
  { title: '相识', questions: [
    [1, '你是怎么认识他的？'], [2, '你们认识多久了？第一次见面是什么时候？'],
    [3, '你对他的第一印象是什么？'], [4, '你们最近一次见面做了什么？'],
  ] },
  { title: '关系', questions: [
    [5, '你们是什么关系？'], [6, '你们关系怎么样？'],
    [7, '他遇到事会找你吗？'], [8, '你们闹过别扭吗？'],
    [9, '他的优点和毛病分别是什么？'],
  ] },
  { title: '日常', questions: [
    [10, '他平时喜欢干什么？'], [11, '他有什么口头禅？'], [12, '他最近在忙什么？'],
    [13, '他爱吃什么？'], [14, '他熬夜吗？'],
  ] },
  { title: '熟人话题', questions: [
    [15, '讲一件他的糗事？'], [16, '他有没有什么怪癖？'],
    [17, '他开心或低落时是什么样？'], [18, '他有什么想做还没做的事？'],
    [19, '用一句话介绍他？'], [20, '有他自己都不知道的事吗？'],
  ] },
  { title: '镇上都知道的事', questions: [
    [21, '张乐天是谁？'], [22, '他做什么工作？'], [23, '他用什么语言？'],
    [24, '他通常怎么选工作资源？'], [25, '他为什么张罗这座小镇？'],
  ] },
];

const facts = new Set([12, 19, 21, 22, 23, 24, 25]);
const broad = new Set([10, 18]);
const refusalIndex: Record<NpcName, Readonly<Partial<Record<number, number>>>> = {
  罗大江: { 8: 6, 9: 7, 11: 4, 13: 5, 16: 7, 17: 8 },
  苏小满: { 8: 7, 9: 4, 13: 5, 14: 6, 16: 4, 17: 8 },
  顾长明: { 5: 7, 6: 7, 9: 4, 13: 5, 14: 6, 16: 4, 17: 8 },
  乔麦: { 5: 7, 6: 7, 9: 4, 11: 6, 13: 5, 16: 4, 17: 8 },
  柳三弦: { 8: 7, 9: 4, 11: 6, 13: 5, 16: 4, 17: 8 },
  钟铁生: { 8: 7, 9: 4, 13: 5, 14: 6, 16: 4, 17: 8 },
};
const commonRefusalIndex: Readonly<Partial<Record<number, number>>> = { 1: 0, 2: 1, 3: 2, 15: 3, 20: 9 };
const fallback: Record<NpcName, string> = {
  罗大江: '先暖暖手吧。这事儿，你问他本人去。',
  苏小满: '这问题不在派送范围里，你得问他本人。',
  顾长明: '这事，问他本人。',
  乔麦: '我只管我的灯。乐天的事，你问他本人。',
  柳三弦: '这段不能替人唱。您问正主儿去。',
  钟铁生: '无资料可报。请向本人问询。完毕。',
};

export function answerNpcQuestion(name: NpcName, id: number, holiday = false): {
  kind: 'fact' | 'broad' | 'refusal';
  text: string;
} {
  const role = npcAuthoredDialogue[name];
  const holidayAnswer = holiday ? npcExpansion[name].holidayFacts?.[id] : undefined;
  const fact = facts.has(id) ? holidayAnswer ?? role.facts[id] : undefined;
  if (fact) return { kind: 'fact', text: fact };
  const generalAnswer = broad.has(id) ? holidayAnswer ?? role.broad[id] : undefined;
  if (generalAnswer) return { kind: 'broad', text: generalAnswer };
  const index = refusalIndex[name][id] ?? commonRefusalIndex[id];
  return { kind: 'refusal', text: index === undefined ? fallback[name] : role.refusals[index] };
}
