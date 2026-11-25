type Options = Readonly<{
  room: AudioNode;
  hearth: AudioNode;
  output: AudioNode;
}>;

const standing = { room: 1, hearth: .2 };
const seated = { room: .63, hearth: .38 };
const transitionSeconds = .04;

/** Mix two host-owned sources while the camp accepts a seated player. */
export function createUndergroundCampAmbience({ room, hearth, output }: Options) {
  const { context } = output;
  if (room.context !== context || hearth.context !== context) {
    throw new RangeError('Camp ambience inputs and output must share an audio context');
  }
  const roomGain = context.createGain();
  const hearthGain = context.createGain();
  roomGain.gain.value = standing.room;
  hearthGain.gain.value = standing.hearth;
  const campGain = context.createGain();
  campGain.gain.value = 0;
  room.connect(roomGain).connect(campGain);
  hearth.connect(hearthGain).connect(campGain);
  campGain.connect(output);
  let sitting = false;
  let inCamp = false;
  let disposed = false;

  function ramp(gain: AudioParam, level: number) {
    const now = context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(level, now, transitionSeconds);
  }

  return {
    setInCamp(active: boolean) {
      if (disposed || inCamp === active) return;
      inCamp = active;
      ramp(campGain.gain, active ? 1 : 0);
    },
    setSeated(active: boolean) {
      if (disposed || sitting === active) return;
      sitting = active;
      const levels = active ? seated : standing;
      ramp(roomGain.gain, levels.room);
      ramp(hearthGain.gain, levels.hearth);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      room.disconnect(roomGain);
      hearth.disconnect(hearthGain);
      roomGain.disconnect();
      hearthGain.disconnect();
      campGain.disconnect();
    },
  };
}
