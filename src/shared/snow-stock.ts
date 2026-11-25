export const snowResourceLimit = 50;
export const snowWallCost = 3;
export const snowWallBuildLayers = 3;

export function createSnowballStock(onChange?: () => void) {
  let amount = 0;
  let reserved = 0;

  const available = () => amount - reserved;

  function spendThrow() {
    if (available() < 1) return false;
    amount--;
    onChange?.();
    return true;
  }

  return {
    amount: () => amount,
    available,
    gather() {
      if (amount >= snowResourceLimit) return false;
      amount++;
      onChange?.();
      return true;
    },
    spendThrow,
    /** Reserve while a wall request is in flight. Only an accepted placement spends snow. */
    reserveWall() {
      if (available() < snowWallCost) return;
      reserved += snowWallCost;
      let pending = true;
      return (accepted: boolean) => {
        if (!pending) return;
        pending = false;
        reserved -= snowWallCost;
        if (accepted) {
          amount -= snowWallCost;
          onChange?.();
        }
      };
    },
  };
}

export type SnowballStock = ReturnType<typeof createSnowballStock>;
