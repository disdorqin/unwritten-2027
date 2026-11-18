// Keep this order: the corresponding market-stall-N IDs are saved in the tasting ledger.
export const marketStallLayouts = [
  [-12.5, -4.8, 6.8, '#a1342d', '糖葫芦'],
  [-4.38, -4.4, 6.4, '#92562e', '干果炒货'],
  [4.25, -4.95, 6.7, '#8a312d', '吃食'],
  [12.4, -4.6, 6.55, '#2e6a67', '热饮'],
] as const;

export type ExistingMarketStallKind = typeof marketStallLayouts[number][4];
