import type { VwapResult } from '../types.js';

export function calcVwap(
  orderSize: number,
  asks: { price: string; size: string }[],
): VwapResult | null {
  let remaining = orderSize;
  let totalCost = 0;
  let totalFilled = 0;
  let levels = 0;
  let maxPrice = 0;

  for (const ask of asks) {
    if (remaining <= 0) break;

    const price = parseFloat(ask.price);
    const size = parseFloat(ask.size);
    const take = Math.min(size, remaining);

    totalCost += price * take;
    totalFilled += take;
    remaining -= take;
    levels += 1;
    maxPrice = price;
  }

  if (totalFilled < orderSize) return null;

  return {
    vwap: totalCost / totalFilled,
    totalSize: totalFilled,
    levelsUsed: levels,
    maxPrice,
    filled: remaining <= 0,
  };
}
