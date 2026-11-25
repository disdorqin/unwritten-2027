// Runtime projection of the approved town dialogue manuscripts.
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
};
export const npcScript: Readonly<Record<NpcName, RoleScript>> = script;

// Authored dialogue can be ready before actors or their activity sites are installed.
export const npcAuthoredDialogue = { ...npcScript, ...npcAddedDialogue } as const;

export type TownNpcGuide = 'seating' | 'stage' | 'postcard' | 'wishes' | 'ice' |
  'lantern' | 'mixing' | 'spring' | 'castle' | 'rail' | 'bell';
type ExpandedRole = {
  life: string[];
  newYear: string[];
  weather: string[];
  guides: Readonly<Partial<Record<TownNpcGuide, string>>>;
  neighbors: string[];
  familiar: Record<'初见' | '再访' | '常客', string[]>;
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
