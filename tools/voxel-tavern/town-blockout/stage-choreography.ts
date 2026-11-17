type Mark = readonly [x: number, z: number, heading: number];
type Formation = 'line' | 'wedge' | 'duet' | 'solo' | 'arc' | 'circle';

export const stageProgram = [
  { id: 'opening', start: 0, end: 62, announcement: '第一幕 · 鼓灯迎新', guest: true },
  { id: 'duet', start: 62, end: 119, announcement: '第二幕 · 双影踏雪', guest: false },
  { id: 'solo', start: 119, end: 158, announcement: '第三幕 · 梅雪独舞', guest: false },
  { id: 'props', start: 158, end: 226, announcement: '第四幕 · 扇影灯河', guest: false },
  { id: 'finale', start: 226, end: 300, announcement: '第五幕 · 满台团圆', guest: true },
] as const;
export const stageProgramDuration = 300;

const marks: Record<Formation, readonly Mark[]> = {
  line: [[-4.5, -.75, 0], [-1.5, -.75, 0], [1.5, -.75, 0], [4.5, -.75, 0]],
  wedge: [[-4.5, .75, .18], [-1.5, -.65, .11], [1.5, -1.75, 0], [4.5, .8, -.18]],
  duet: [[-4.55, 1.36, -.25], [-1.48, -1.56, -.37], [1.48, -1.56, .37], [4.55, 1.36, .25]],
  solo: [[-4.5, 1.2, -.24], [0, -2.6, 0], [2.5, .75, .18], [4.6, 1.2, .22]],
  arc: [[-5.0, .25, -.25], [-1.85, -2.0, -.14], [1.65, -2.0, .10], [4.9, .25, .25]],
  circle: [[-3.2, -2.48, .12], [-1.25, 1.85, -.16], [1.48, 1.85, .16], [3.35, -2.48, -.12]],
};
const travelMarks: ReadonlyArray<readonly [number, Formation]> = [
  [0, 'line'], [12, 'line'], [28, 'wedge'], [60, 'wedge'], [76, 'duet'], [117, 'duet'],
  [132, 'solo'], [155, 'solo'], [172, 'arc'], [224, 'arc'], [241, 'circle'],
  [267, 'circle'], [284, 'line'], [300, 'line'],
];
const tau = Math.PI * 2;
const smooth = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function envelope(t: number, start: number, end: number, ramp: number) {
  return smooth((t - start) / ramp) * smooth((end - t) / ramp);
}
export function stageClock(time: number) {
  return ((time % stageProgramDuration) + stageProgramDuration) % stageProgramDuration;
}

export function sampleStagePose(t: number, i: number, reducedMotion = false) {
  let index = 1;
  while (index < travelMarks.length - 1 && t > travelMarks[index][0]) index++;
  const [startTime, from] = travelMarks[index - 1];
  const [endTime, to] = travelMarks[index];
  const fromMark = marks[from][i];
  const toMark = marks[to][i];
  const blend = smooth((t - startTime) / (endTime - startTime));
  const x = mix(fromMark[0], toMark[0], blend);
  const z = mix(fromMark[1], toMark[1], blend);
  const heading = mix(fromMark[2], toMark[2], blend);

  const opening = envelope(t, 3, 60, 5);
  const duet = envelope(t, 68, 114, 5);
  const solo = envelope(t, 126, 154, 4);
  const props = envelope(t, 164, 222, 4);
  const finale = envelope(t, 230, 285, 5);
  const bow = envelope(t, 286, 299, 2.8);
  const calm = reducedMotion ? .46 : 1;
  const phase = t * tau / 2.5;
  const paired = i === 1 || i === 2 ? 1 : .20;
  const soloist = i === 1 ? 1 : .11;
  const dance = (opening + duet * paired + solo * soloist + props * .85 + finale) * calm;
  const beat = Math.sin(phase) * (opening + finale) + Math.sin(phase + i * 1.8) * (duet + solo + props);
  const tempo = Math.sin(phase + i * (duet + props) * .58);
  const duetReach = duet * paired * (.47 + .26 * Math.sin(phase + .8));
  const soloReach = solo * soloist * (.72 + .24 * Math.sin(phase - .3));
  const propReach = props * ((i === 1 || i === 3) ? .65 : .13);
  return {
    x: x + dance * beat * .265,
    z: z + dance * Math.sin(phase * .5) * .22,
    y: .52 + dance * (1 - Math.cos(phase * 2)) * .044,
    heading: heading + dance * tempo * .35,
    tilt: -bow * .55 + dance * Math.cos(phase) * .06,
    armLift: dance * (.44 + .29 * tempo) + props * .22 * calm,
    leftReach: calm * (i === 1 ? duetReach : duetReach * .15),
    rightReach: calm * ((i === 2 ? duetReach : duetReach * .15) + soloReach + propReach),
    swing: dance * (.33 * Math.sin(phase + i * .11)) - bow * .23,
    stride: dance * Math.cos(phase) * .24,
    prop: props,
    solo,
    finale,
  };
}
