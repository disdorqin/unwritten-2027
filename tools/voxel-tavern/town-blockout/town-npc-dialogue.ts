// Runtime projection of Muse's NPC人设与台词-v2.md and its fact-bank policy.
// This module includes only dialogue presented to visitors.
import script from './town-npc-dialogue.json';
import expansion from './town-npc-expansion.json';

export type NpcName = keyof typeof script;
export type NpcPeriod = '傍晚' | '夜里' | '跨年夜';

type RoleScript = {
  greetings: Record<NpcPeriod, string[]>;
  farewells: Record<NpcPeriod, string>;
  smallTalk: string[];
  facts: Readonly<Partial<Record<number, string>>>;
  broad: Readonly<Partial<Record<number, string>>>;
  refusals: string[];
};
export const npcScript: Readonly<Record<NpcName, RoleScript>> = script;

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
  const role = npcScript[name];
  const holidayAnswer = holiday ? npcExpansion[name].holidayFacts?.[id] : undefined;
  const fact = facts.has(id) ? holidayAnswer ?? role.facts[id] : undefined;
  if (fact) return { kind: 'fact', text: fact };
  const generalAnswer = broad.has(id) ? holidayAnswer ?? role.broad[id] : undefined;
  if (generalAnswer) return { kind: 'broad', text: generalAnswer };
  const index = refusalIndex[name][id] ?? commonRefusalIndex[id];
  return { kind: 'refusal', text: index === undefined ? fallback[name] : role.refusals[index] };
}
