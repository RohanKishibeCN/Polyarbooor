import axios from 'axios';
import type { Settings, ArbitrageOpportunity, RawOrderBook, ScannedMarket } from '../types.js';
import { calcBuyVwap, computeSpreadEfficiency } from '../trading/vwap.js';
import { getFullOrderBook } from '../trading/client.js';
import { logger } from '../utils/logger.js';

export async function checkBidSideArb(
  settings: Settings,
  yesTokenId: string,
  noTokenId: string,
): Promise<ArbitrageOpportunity | null> {
  const [yesBook, noBook] = await Promise.all([
    getFullOrderBook(yesTokenId, settings.clobHost).catch(() => null),
    getFullOrderBook(noTokenId, settings.clobHost).catch(() => null),
  ]);

  if (!yesBook || !noBook) return null;

  const eff = computeSpreadEfficiency(
    yesBook.bids,
    noBook.bids,
    yesBook.asks,
    noBook.asks,
  );

  if (eff.isSymmetric && eff.spreadWidth < 0.04) {
    return null;
  }

  const minPriceIncrement = 0.01;
  const ourBid = Math.max(eff.yesBestBid, eff.noBestBid) + minPriceIncrement;
  const totalCost = ourBid * 2;
  const estGas = settings.estGasPerOrder * 2;
  const grossProfit = (1.0 - totalCost) * settings.orderSize;
  const netProfit = grossProfit - estGas;

  if (netProfit < settings.minNetProfit) {
    return null;
  }

  const investment = totalCost * settings.orderSize;

  return {
    vwapUp: ourBid,
    vwapDown: ourBid,
    totalCost,
    profitPerShare: 1.0 - totalCost,
    netProfit,
    grossProfit,
    estGas,
    orderSize: settings.orderSize,
    totalInvestment: investment,
    expectedPayout: 1.0 * settings.orderSize,
    upDepthLevels: 0,
    downDepthLevels: 0,
    upMaxPrice: ourBid,
    downMaxPrice: ourBid,
    timestamp: new Date().toISOString(),
  };
}

export async function scanMarkets(
  settings: Settings,
): Promise<ScannedMarket[]> {
  const GAMMA = 'https://gamma-api.polymarket.com';
  const results: ScannedMarket[] = [];

  try {
    const { data: rawList } = await axios.get(
      `${GAMMA}/markets?closed=false&limit=200`,
      { timeout: 15000 },
    );
    const markets = rawList as Record<string, unknown>[];

    const binary = markets.filter((m) => {
      const ids = m.clobTokenIds;
      if (!ids) return false;
      const tokens = typeof ids === 'string' ? JSON.parse(ids) : ids;
      return Array.isArray(tokens) && tokens.length === 2;
    });

    const batchSize = 20;
    for (let i = 0; i < binary.length; i += batchSize) {
      const batch = binary.slice(i, i + batchSize);
      const promises = batch.map(async (m) => {
        try {
          const tokens = typeof m.clobTokenIds === 'string'
            ? JSON.parse(m.clobTokenIds as string)
            : (m.clobTokenIds as string[]);

          const [yesBook, noBook] = await Promise.all([
            getFullOrderBook(tokens[0], settings.clobHost),
            getFullOrderBook(tokens[1], settings.clobHost),
          ]);

          if (!yesBook || !noBook) return null;

          const eff = computeSpreadEfficiency(
            yesBook.bids,
            noBook.bids,
            yesBook.asks,
            noBook.asks,
          );

          const ourBid = Math.max(eff.yesBestBid, eff.noBestBid) + 0.01;
          const totalCost = ourBid * 2;
          const profit = 1.0 - totalCost;
          let scoreHint: string;

          if (eff.spreadWidth > 0.10) {
            scoreHint = `⚡ 宽价差 ${eff.spreadWidth.toFixed(2)}, 潜在利润 ${(profit * settings.orderSize).toFixed(2)}`;
          } else if (eff.spreadWidth > 0.04) {
            scoreHint = `📊 中等价差 ${eff.spreadWidth.toFixed(2)}`;
          } else {
            scoreHint = `↔ 窄价差, 不做`;
          }

          return {
            slug: (m.slug as string) || '',
            question: (m.question as string) || '',
            yesTokenId: tokens[0],
            noTokenId: tokens[1],
            endDate: (m.endDate as string) || '',
            yesBestBid: eff.yesBestBid,
            noBestBid: eff.noBestBid,
            yesBestAsk: eff.yesBestAsk,
            noBestAsk: eff.noBestAsk,
            spreadWidth: eff.spreadWidth,
            isSymmetric: eff.isSymmetric,
            bidPairCost: eff.bidPairCost,
            scoreHint,
          };
        } catch {
          return null;
        }
      });

      const batchResults = (await Promise.all(promises)).filter(Boolean) as ScannedMarket[];
      results.push(...batchResults);
    }

    results.sort((a, b) => b.spreadWidth - a.spreadWidth);
  } catch (e) {
    logger.error(`市场扫描失败: ${e}`);
  }

  return results;
}
