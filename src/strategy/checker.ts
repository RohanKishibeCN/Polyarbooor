import type { Settings, ArbitrageOpportunity, RawOrderBook } from '../types.js';
import { calcVwap } from '../trading/vwap.js';
import { getFullOrderBook } from '../trading/client.js';
import { logger } from '../utils/logger.js';

export async function checkArbitrage(
  settings: Settings,
  yesTokenId: string,
  noTokenId: string,
): Promise<ArbitrageOpportunity | null> {
  const [upBook, downBook] = await Promise.all([
    getFullOrderBook(yesTokenId, settings.clobHost).catch(() => null),
    getFullOrderBook(noTokenId, settings.clobHost).catch(() => null),
  ]);

  if (!upBook || !downBook) return null;

  const upAsks = filterValidAsks(upBook, settings.maxSinglePrice);
  const downAsks = filterValidAsks(downBook, settings.maxSinglePrice);

  const upVwap = calcVwap(settings.orderSize, upAsks);
  const downVwap = calcVwap(settings.orderSize, downAsks);

  if (!upVwap || !downVwap) {
    logger.debug('订单簿深度不足，无法满足 order_size');
    return null;
  }

  if (
    upVwap.vwap >= settings.maxSinglePrice ||
    downVwap.vwap >= settings.maxSinglePrice
  ) {
    return null;
  }

  const totalCost = upVwap.vwap + downVwap.vwap;
  if (totalCost >= settings.targetPairCost) return null;

  const estGas = settings.estGasPerOrder * 2;
  const grossProfit = (1.0 - totalCost) * settings.orderSize;
  const netProfit = grossProfit - estGas;

  if (netProfit < settings.minNetProfit) {
    logger.debug(`净利润 $${netProfit.toFixed(4)} 低于阈值 $${settings.minNetProfit}`);
    return null;
  }

  const investment = totalCost * settings.orderSize;

  return {
    vwapUp: upVwap.vwap,
    vwapDown: downVwap.vwap,
    totalCost,
    profitPerShare: 1.0 - totalCost,
    netProfit,
    grossProfit,
    estGas,
    orderSize: settings.orderSize,
    totalInvestment: investment,
    expectedPayout: 1.0 * settings.orderSize,
    upDepthLevels: upVwap.levelsUsed,
    downDepthLevels: downVwap.levelsUsed,
    upMaxPrice: upVwap.maxPrice,
    downMaxPrice: downVwap.maxPrice,
    timestamp: new Date().toISOString(),
  };
}

function filterValidAsks(book: RawOrderBook, maxPrice: number) {
  return book.asks.filter(
    (a) => parseFloat(a.price) > 0 && parseFloat(a.price) < maxPrice,
  );
}
