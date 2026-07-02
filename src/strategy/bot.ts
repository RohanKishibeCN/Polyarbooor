import type { Settings, ScannedMarket } from '../types.js';
import { getClient } from '../trading/client.js';
import { checkBidSideArb, scanMarkets } from './checker.js';
import { executeMakerArb } from './executor.js';
import { TradeLedger } from '../trade_ledger.js';
import { NotionReporter } from '../notion_reporter.js';
import { logger } from '../utils/logger.js';

export class MakerBot {
  private settings: Settings;
  private ledger: TradeLedger;
  private notion: NotionReporter;
  private _lastPushDate: string;
  private _startTime: number;

  opportunitiesFound = 0;
  tradesExecuted = 0;
  consecutiveFailures = 0;

  constructor(settings: Settings) {
    this.settings = settings;
    logger.setVerbose(settings.verbose);

    this.ledger = new TradeLedger();
    this.notion = new NotionReporter(
      settings.notionApiKey,
      settings.notionDatabaseId,
      settings.notionEnabled,
    );
    this._lastPushDate = '';
    this._startTime = Date.now();
  }

  private getCstDate(): string {
    const now = new Date();
    const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return cst.toISOString().slice(0, 10);
  }

  private getCstHourMinute(): { h: number; m: number } {
    const now = new Date();
    const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return { h: cst.getUTCHours(), m: cst.getUTCMinutes() };
  }

  private getYesterdayCst(): string {
    const now = new Date();
    const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    cst.setUTCDate(cst.getUTCDate() - 1);
    return cst.toISOString().slice(0, 10);
  }

  async init(): Promise<void> {
    await getClient(this.settings);
  }

  async run(): Promise<void> {
    logger.info('='.repeat(70));
    logger.info('🚀 Polyarbooor — Bid侧做市套利引擎已启动');
    logger.info('='.repeat(70));
    logger.info(`模式: ${this.settings.dryRun ? '🔸 模拟' : '🔴 真实交易'}`);
    logger.info(`订单数量: ${this.settings.orderSize} 股/边`);
    logger.info(`最小净利润: $${this.settings.minNetProfit}`);
    logger.info(`市场扫描间隔: ${this.settings.marketScanIntervalMinutes} 分钟`);
    logger.info(`扫描间隔: ${this.settings.scanInterval}秒`);
    logger.info('='.repeat(70));
    logger.info('📅 每日 09:05 (UTC+8) 推送前一日汇总到 Notion');
    logger.info('');

    const scanIntervalMs = Math.max(this.settings.scanInterval * 1000, 2000);
    const marketRescanMs = this.settings.marketScanIntervalMinutes * 60 * 1000;

    let lastMarketScan = 0;
    let activeMarkets: ScannedMarket[] = [];
    let currentMarketIndex = 0;

    while (true) {
      const now = Date.now();

      // 市场重扫描
      if (activeMarkets.length === 0 || now - lastMarketScan > marketRescanMs) {
        logger.info('\n🔍 正在扫描市场...');
        const allMarkets = await scanMarkets(this.settings);

        // 过滤: 只保留价差 > 0.04 的市场 (非高效市场)
        activeMarkets = allMarkets.filter(
          (m) => m.spreadWidth > 0.04,
        );
        lastMarketScan = now;
        currentMarketIndex = 0;

        if (activeMarkets.length === 0) {
          logger.info('❌ 未找到价差足够的市场。所有二元市场均被做市商充分覆盖。');
          logger.info(`⏳ ${marketRescanMs / 60000} 分钟后重扫描...`);
        } else {
          logger.info(`✅ 找到 ${activeMarkets.length} 个高价差候选市场 (价差 > 4¢):`);
          for (const m of activeMarkets.slice(0, 5)) {
            logger.info(
              `   ${m.scoreHint} | ${m.question.slice(0, 50)}`,
            );
          }
          if (activeMarkets.length > 5) {
            logger.info(`   ... 还有 ${activeMarkets.length - 5} 个`);
          }
        }
      }

      // 如果找到了候选市场，轮询检测套利
      if (activeMarkets.length > 0) {
        const market = activeMarkets[currentMarketIndex];
        currentMarketIndex = (currentMarketIndex + 1) % activeMarkets.length;

        const opp = await checkBidSideArb(
          this.settings,
          market.yesTokenId,
          market.noTokenId,
        );

        if (opp) {
          this.opportunitiesFound += 1;
          const success = await executeMakerArb(opp, {
            settings: this.settings,
            yesTokenId: market.yesTokenId,
            noTokenId: market.noTokenId,
            marketSlug: market.slug,
            onTradeRecord: (record) => {
              this.ledger.recordTrade(record);
              this.tradesExecuted += 1;
              this.consecutiveFailures = 0;
            },
            onPartialFill: (imbalance) => {
              logger.warn(`⚠️ 部分成交: 不平衡=${imbalance.toFixed(2)}`);
            },
          });

          if (!success) {
            this.consecutiveFailures += 1;
            this.ledger.failedOrders += 1;
            if (
              this.settings.maxConsecutiveFailures > 0 &&
              this.consecutiveFailures >= this.settings.maxConsecutiveFailures
            ) {
              logger.error(`🛑 连续失败 ${this.consecutiveFailures} 次，触发熔断`);
              this.ledger.circuitBreaks += 1;
              process.exit(1);
            }
          }
        }
      }

      await this.checkScheduledPush();
      await sleep(scanIntervalMs);
    }

    process.on('SIGINT', async () => {
      logger.info('\n🛑 机器人已被用户停止');
      process.exit(0);
    });
  }

  private async checkScheduledPush() {
    const today = this.getCstDate();
    if (today === this._lastPushDate) return;

    const { h, m } = this.getCstHourMinute();
    if (h < 9 || (h === 9 && m < 5)) return;

    this._lastPushDate = today;

    const summaryDate = this.getYesterdayCst();
    const text = this.ledger.buildSummaryText(
      0,
      this.settings.dryRun,
      (Date.now() - this._startTime) / 1000,
      this.opportunitiesFound,
    );
    const title = `${summaryDate} BTC Arb Summary`;
    await this.notion.pushTextPage(summaryDate, title, text);

    this.ledger.reset();
    this._startTime = Date.now();
    this.opportunitiesFound = 0;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
