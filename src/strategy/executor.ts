import type {
  Settings,
  ArbitrageOpportunity,
  TradeRecord,
} from '../types.js';
import { placeOrdersFast, getPositions } from '../trading/client.js';
import { logger } from '../utils/logger.js';

export interface ExecutorDeps {
  settings: Settings;
  yesTokenId: string;
  noTokenId: string;
  marketSlug: string;
  onTradeRecord: (record: TradeRecord) => void;
  onPartialFill: (imbalance: number) => void;
}

export async function executeArbitrage(
  opp: ArbitrageOpportunity,
  deps: ExecutorDeps,
): Promise<boolean> {
  logger.info('='.repeat(70));
  logger.info('🎯 检测到套利机会');
  logger.info('='.repeat(70));
  logger.info(`VWAP Up:         $${opp.vwapUp.toFixed(4)}`);
  logger.info(`VWAP Down:       $${opp.vwapDown.toFixed(4)}`);
  logger.info(`总成本:          $${opp.totalCost.toFixed(4)}`);
  logger.info(`每股利润:        $${opp.profitPerShare.toFixed(4)}`);
  logger.info(`净利润:          $${opp.netProfit.toFixed(2)}`);
  logger.info(`预估Gas:         $${opp.estGas.toFixed(2)}`);
  logger.info(`订单数量:        ${opp.orderSize} 股（每边）`);
  logger.info(`总投资:          $${opp.totalInvestment.toFixed(2)}`);
  logger.info(`预期支付:        $${opp.expectedPayout.toFixed(2)}`);
  logger.info('='.repeat(70));

  const s = deps.settings;
  if (s.dryRun) {
    logger.info('🔸 模拟模式 — 记录交易，不实际下单');
    deps.onTradeRecord({
      timestamp: opp.timestamp,
      marketSlug: deps.marketSlug,
      vwapUp: opp.vwapUp,
      vwapDown: opp.vwapDown,
      orderSize: opp.orderSize,
      totalInvestment: opp.totalInvestment,
      expectedProfit: opp.netProfit,
      partiallyFilled: false,
      marketResult: '',
    });
    return true;
  }

  try {
    const upLimit = Math.round(opp.upMaxPrice * 1.002 * 1e4) / 1e4;
    const downLimit = Math.round(opp.downMaxPrice * 1.002 * 1e4) / 1e4;

    const orders = [
      {
        side: 'BUY' as const,
        tokenId: deps.yesTokenId,
        price: upLimit,
        size: s.orderSize,
      },
      {
        side: 'BUY' as const,
        tokenId: deps.noTokenId,
        price: downLimit,
        size: s.orderSize,
      },
    ];

    logger.info('\n📤 正在执行订单...');
    logger.info(`   UP:   ${s.orderSize} 股 @ $${upLimit.toFixed(4)}`);
    logger.info(`   DOWN: ${s.orderSize} 股 @ $${downLimit.toFixed(4)}`);

    const results = await placeOrdersFast(s, orders);
    const errors = results.filter(
      (r) => typeof r === 'object' && r !== null && 'error' in r,
    );
    if (errors.length > 0) {
      logger.error(`❌ 订单错误: ${JSON.stringify(errors)}`);
      return false;
    }

    await new Promise((r) => setTimeout(r, 2000));

    const positions = await getPositions(s, [
      deps.yesTokenId,
      deps.noTokenId,
    ]);
    const upShares = positions[deps.yesTokenId]?.size ?? 0;
    const downShares = positions[deps.noTokenId]?.size ?? 0;
    const imbalance = Math.abs(upShares - downShares);

    const partiallyFilled = imbalance > 0.1;
    if (partiallyFilled) {
      logger.warn(
        `⚠️ 持仓不平衡: UP=${upShares.toFixed(2)}, DOWN=${downShares.toFixed(2)}, 差异=${imbalance.toFixed(2)}`,
      );
      deps.onPartialFill(imbalance);
    }

    logger.info('\n' + '='.repeat(70));
    logger.info('✅ 套利执行成功');
    logger.info('='.repeat(70));

    deps.onTradeRecord({
      timestamp: opp.timestamp,
      marketSlug: deps.marketSlug,
      vwapUp: opp.vwapUp,
      vwapDown: opp.vwapDown,
      orderSize: opp.orderSize,
      totalInvestment: opp.totalInvestment,
      expectedProfit: opp.netProfit,
      partiallyFilled,
      marketResult: '',
    });

    return true;
  } catch (e) {
    logger.error(`\n❌ 执行套利时出错: ${e}`);
    return false;
  }
}
