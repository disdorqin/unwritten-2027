export type PresencePose = { east: number; north: number; height: number; yaw: number };
export type PresenceSample = PresencePose & { time: number; seq: number };

const turn = 2 * Math.PI;
export const presenceInterpolateDelay = 120;
const extrapolationLimit = 250;
const teleportDistanceSquared = 12 ** 2;
const maxHistory = 8;
export const presenceRecordBytes = 12;
export const presenceMaxVisible = 48;

function wrapYaw(yaw: number) {
  return ((yaw % turn) + turn) % turn;
}

function shortArc(from: number, to: number) {
  return wrapYaw(to - from + Math.PI) - Math.PI;
}

export function writePresencePose(pose: PresencePose, seq: number, target: DataView) {
  const cm = (value: number) => Math.max(0, Math.min(65535, Math.round(value * 100)));
  target.setUint16(0, 0, true);
  target.setUint16(2, cm(pose.east), true);
  target.setUint16(4, cm(pose.north), true);
  target.setUint16(6, cm(pose.height), true);
  target.setUint16(8, Math.round(wrapYaw(pose.yaw) * 65536 / turn) & 65535, true);
  target.setUint16(10, seq, true);
}

export function visitPresenceSnapshot(
  data: ArrayBuffer, read: (id: number, east: number, north: number, height: number, yaw: number, seq: number) => void,
) {
  if (data.byteLength < 1) return false;
  const view = new DataView(data);
  const count = view.getUint8(0);
  if (count > presenceMaxVisible || data.byteLength !== 1 + count * presenceRecordBytes) return false;
  for (let offset = 1; offset < data.byteLength; offset += presenceRecordBytes) {
    read(view.getUint16(offset, true), view.getUint16(offset + 2, true) / 100,
      view.getUint16(offset + 4, true) / 100, view.getUint16(offset + 6, true) / 100,
      view.getUint16(offset + 8, true) * turn / 65536, view.getUint16(offset + 10, true));
  }
  return true;
}

export function pushPresenceSample(history: PresenceSample[], sample: PresenceSample) {
  const previous = history.at(-1);
  if (previous) {
    const sequenceAdvance = (sample.seq - previous.seq) & 65535;
    if (sequenceAdvance === 0 || sequenceAdvance >= 32768) return false;
    const distance = (sample.east - previous.east) ** 2 + (sample.north - previous.north) ** 2 +
      (sample.height - previous.height) ** 2;
    if (distance >= teleportDistanceSquared || sample.time - previous.time > 650) history.length = 0;
  }
  history.push(sample);
  if (history.length > maxHistory) history.shift();
  return true;
}

export function samplePresencePose(history: readonly PresenceSample[], now: number, output: PresencePose) {
  if (!history.length) return;
  const target = now - presenceInterpolateDelay;
  const first = history[0];
  if (history.length === 1 || target <= first.time) {
    output.east = first.east;
    output.north = first.north;
    output.height = first.height;
    output.yaw = first.yaw;
    return;
  }
  let left = history[history.length - 2];
  let right = history[history.length - 1];
  for (let i = 1; i < history.length; i++) {
    if (history[i].time >= target) {
      left = history[i - 1];
      right = history[i];
      break;
    }
  }
  // Hold the capped prediction through a receive gap. The next real sample can correct it.
  const time = Math.min(target, right.time + extrapolationLimit);
  const amount = right.time > left.time ? (time - left.time) / (right.time - left.time) : 1;
  output.east = left.east + (right.east - left.east) * amount;
  output.north = left.north + (right.north - left.north) * amount;
  output.height = left.height + (right.height - left.height) * amount;
  output.yaw = wrapYaw(left.yaw + shortArc(left.yaw, right.yaw) * Math.min(1, amount));
}
