export type UndergroundMiningPoint = Readonly<{
  layer: string;
  east: number;
  north: number;
  height: number;
}>;

export type UndergroundMiningTargetKind = 'ore' | 'gate-rubble' | 'gate-ice' | 'gate-wood' | 'thin-wall';
export type UndergroundMiningSurface = 'rock' | 'crystal' | 'rubble' | 'ice' | 'wood';

export type UndergroundMiningTargetView = Readonly<{
  id: string;
  kind: UndergroundMiningTargetKind;
  at: UndergroundMiningPoint;
  surface: UndergroundMiningSurface;
  mineral?: string;
  strikes: number;
  hits: number;
  open: boolean;
  regrowAt?: number;
}>;

export type UndergroundMiningCore = Readonly<{
  id: string;
  at: UndergroundMiningPoint;
  mineral: string;
  amount: number;
}>;

export type UndergroundMiningReceipt =
  | Readonly<{
      action: 'strike';
      target: UndergroundMiningTargetView;
      core?: UndergroundMiningCore;
      sound: Readonly<{ at: UndergroundMiningPoint; surface: UndergroundMiningSurface }>;
    }>
  | Readonly<{ action: 'pickup'; core: UndergroundMiningCore }>;
