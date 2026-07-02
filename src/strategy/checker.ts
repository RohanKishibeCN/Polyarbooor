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

  if (!upBook || !downBook) {
    logger.debug('获取订单簿失败');
    return null;
  }

  const upAsks = upBook.asks.filter((a) => parseFloat(a.price) > 0);
  const downAsks = downBook.asks.filter((a) => parseFloat(a.price) > 0);

  const upVwap = calcVwap(settings.orderSize, upAsks);
  const downVwap = calcVwap(settings.orderSize, downAsks);

  if (!upVwap || !downVwap) {
    const upDepth = upAsks.reduce((s, a) => s + parseFloat(a.size), 0);
    const downDepth = downAsks.reduce((s, a) => s + parseFloat(a.size), 0);
    logger.info(
      `深度不足: UP=${upDepth.toFixed(0)}股, DOWN=${downDepth.toFixed(0)}股 (需要 ${settings.orderSize}股)`,
    );
    return null;
  }

  const totalCost = upVwap.vwap + downVwap.vwap;
  if (totalCost >= settings.targetPairCost) {
    logger.info(
      `总成本 ${totalCost.toFixed(4)} ≥ 阈值 ${settings.targetPairCost} (UP=${upVwap.vwap.toFixed(4)}, DOWN=${downVwap.vwap.toFixed(4)})`,
    );
    return null;
  }

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
