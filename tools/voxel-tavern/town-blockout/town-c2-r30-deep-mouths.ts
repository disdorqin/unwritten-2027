import type { C2DeepLayer } from './town-c2-r30-layer-seams.js';

export type C2R30DeepMouth = Readonly<{
  layer: C2DeepLayer;
  axis: 'north' | 'east';
  at: number;
  centre: number;
  width: number;
  height: number;
}>;

/** Mirrors C-R04's receiving sockets; C remains the world/domain authority. */
const deepMouths = {
  'minus140-to-minus165': {
    from: { layer: 'minus140', axis: 'north', at: 198, centre: 0, width: 3.4, height: 3.24 },
    to: { layer: 'minus165', axis: 'east', at: 0, centre: 0, width: 3.4, height: 3.24 },
  },
  'minus165-to-minus190': {
    from: { layer: 'minus165', axis: 'east', at: 180, centre: 0, width: 3.4, height: 3.24 },
    to: { layer: 'minus190', axis: 'north', at: 0, centre: 0, width: 3.4, height: 3.24 },
  },
} as const satisfies Readonly<Record<string, Readonly<{ from: C2R30DeepMouth; to: C2R30DeepMouth }>>>;

export const c2R30DeepMouths = Object.freeze({
  'minus140-to-minus165': Object.freeze({
    from: Object.freeze(deepMouths['minus140-to-minus165'].from),
    to: Object.freeze(deepMouths['minus140-to-minus165'].to),
  }),
  'minus165-to-minus190': Object.freeze({
    from: Object.freeze(deepMouths['minus165-to-minus190'].from),
    to: Object.freeze(deepMouths['minus165-to-minus190'].to),
  }),
});

export function c2R30MouthDistance(mouth: C2R30DeepMouth, east: number, north: number) {
  return mouth.axis === 'north' ? Math.abs(north - mouth.at) : Math.abs(east - mouth.at);
}

export function c2R30MouthLateral(mouth: C2R30DeepMouth, east: number, north: number) {
  return mouth.axis === 'north' ? east - mouth.centre : north - mouth.centre;
}
