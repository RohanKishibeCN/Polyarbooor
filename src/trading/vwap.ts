// ============================================================
//  VWAP — 正确的订单簿排序支持
//
//  Polymarket CLOB /book 返回格式:
//    asks: [max ... min]  ← 从最贵到最便宜
//    bids: [min ... max]  ← 从最便宜到最贵
//
//  对于 VWAP 买入 (吃 ask): 需要从最便宜的开始 → 迭代 asks 从尾部
//  对于 bid 侧做市: 需要知道当前最高 bid → bids 数组尾部
// ============================================================

import type { OrderBookLevel, VwapResult } from '../types.js';

/**
 * 计算买入 VWAP — 从订单簿末尾 (最便宜) 开始迭代
 * Polymarket /book asks: [0.99, 0.98, ..., 0.51] → 最佳 ask 在末尾
 */
export function calcBuyVwap(
  orderSize: number,
  asks: OrderBookLevel[],
): VwapResult | null {
  let remaining = orderSize;
  let totalCost = 0;
  let totalFilled = 0;
  let levels = 0;
  let maxPrice = 0;

  for (let i = asks.length - 1; i >= 0; i--) {
    if (remaining <= 0) break;

    const price = parseFloat(asks[i].price);
    const size = parseFloat(asks[i].size);
    const take = Math.min(size, remaining);

    totalCost += price * take;
    totalFilled += take;
    remaining -= take;
    levels += 1;
    if (price > maxPrice) maxPrice = price;
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

/**
 * 获取当前最佳 ask 价格 (买方能拿到的最低价)
 * Polymarket /book asks: [0.99, 0.98, ..., 0.51] → best ask = 数组尾部
 */
export function getBestAsk(asks: OrderBookLevel[]): number | null {
  if (!asks || asks.length === 0) return null;
  return parseFloat(asks[asks.length - 1].price);
}

/**
 * 获取当前最佳 bid 价格 (卖方能拿到的最高价)
 * Polymarket /book bids: [0.01, 0.02, ..., 0.50] → best bid = 数组尾部
 */
export function getBestBid(bids: OrderBookLevel[]): number | null {
  if (!bids || bids.length === 0) return null;
  return parseFloat(bids[bids.length - 1].price);
}

/**
 * 获取 bid 侧的流动性深度 (从最佳 bid 向下累加)
 * 用于做市分析: 在我们出价以上有多少 MM 流动性
 */
export function getBidDepthAbove(
  bids: OrderBookLevel[],
  ourBidPrice: number,
): { depth: number; totalValue: number; mmMaxPrice: number } {
  let depth = 0;
  let totalValue = 0;
  let mmMaxPrice = 0;

  for (let i = bids.length - 1; i >= 0; i--) {
    const price = parseFloat(bids[i].price);
    mmMaxPrice = Math.max(mmMaxPrice, price);

    // 只统计在我们要价之上的流动性 (MM 会先匹配掉)
    if (price >= ourBidPrice) {
      const size = parseFloat(bids[i].size);
      depth += size;
      totalValue += price * size;
    } else {
      break; // 价格更低了，不再统计
    }
  }

  return { depth, totalValue, mmMaxPrice };
}

/**
 * 获取 ask 侧深度 (从最佳 ask 向下)
 */
export function getAskDepthBelow(
  asks: OrderBookLevel[],
  ourAskPrice: number,
): { depth: number; totalValue: number; mmMinPrice: number } {
  let depth = 0;
  let totalValue = 0;
  let mmMinPrice = Infinity;

  for (let i = asks.length - 1; i >= 0; i--) {
    const price = parseFloat(asks[i].price);
    if (price < mmMinPrice) mmMinPrice = price;

    if (price <= ourAskPrice) {
      const size = parseFloat(asks[i].size);
      depth += size;
      totalValue += price * size;
    } else {
      break;
    }
  }

  return { depth, totalValue, mmMinPrice: mmMinPrice === Infinity ? 0 : mmMinPrice };
}

/**
 * 用于做市侧套利检测:
 * 计算双边 bid 的价差
 *
 * 如果 bestBid(UP) + bestBid(DOWN) < targetPairCost,
 * 意味着如果我们出价 = bestBid, 双边都能成交的话有利润。
 *
 * 但实际操作中需要高于 MM 的 bid 才能优先成交,
 * 所以需要加一个溢价增量。
 */
export function computeSpreadEfficiency(
  yesBids: OrderBookLevel[],
  noBids: OrderBookLevel[],
  yesAsks: OrderBookLevel[],
  noAsks: OrderBookLevel[],
): {
  yesBestBid: number;
  noBestBid: number;
  yesBestAsk: number;
  noBestAsk: number;
  bidPairCost: number;
  askPairCost: number;
  spreadWidth: number;
  isSymmetric: boolean;
} {
  const yesBestBid = getBestBid(yesBids) ?? 0;
  const noBestBid = getBestBid(noBids) ?? 0;
  const yesBestAsk = getBestAsk(yesAsks) ?? 1;
  const noBestAsk = getBestAsk(noAsks) ?? 1;

  const bidPairCost = yesBestBid + noBestBid;
  const askPairCost = yesBestAsk + noBestAsk;
  const spreadWidth = yesBestAsk - yesBestBid + noBestAsk - noBestBid;

  const isSymmetric =
    Math.abs(yesBestBid - noBestBid) < 0.03 &&
    Math.abs(yesBestAsk - noBestAsk) < 0.03;

  return {
    yesBestBid,
    noBestBid,
    yesBestAsk,
    noBestAsk,
    bidPairCost,
    askPairCost,
    spreadWidth,
    isSymmetric,
  };
}
