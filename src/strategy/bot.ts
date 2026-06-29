import type { Settings } from '../types.js';
import { findCurrentBtc15minMarket } from '../market/discovery.js';
import { fetchMarketFromSlug } from '../market/lookup.js';
import { getClient, getBalance } from '../trading/client.js';
import { checkArbitrage } from './checker.js';
import { executeArbitrage } from './executor.js';
import { TradeLedger } from '../trade_ledger.js';
import { NotionReporter } from '../notion_reporter.js';
import { logger } from '../utils/logger.js';

export class SimpleArbitrageBot {
  private settings: Settings;
  yesTokenId: string;
  noTokenId: string;
  marketId: string;
  marketSlug: string;
  marketEndTimestamp: number | null = null;
  opportunitiesFound = 0;
  tradesExecuted = 0;
  totalInvested = 0;
  totalSharesBought = 0;
  currentMarketTrades = 0;
  consecutiveFailures = 0;

  ledger: TradeLedger;
  private notion: NotionReporter;
  private _lastPushDate: string;
  private _startTime: number;

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

    this.marketSlug = '';
    this.marketId = '';
    this.yesTokenId = '';
    this.noTokenId = '';
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
    let slug: string;
    try {
      slug = await findCurrentBtc15minMarket();
    } catch {
      if (this.settings.marketSlug) {
        slug = this.settings.marketSlug;
        logger.info(`使用配置的市场: ${slug}`);
      } else {
        throw new Error('Could not find BTC 15min market and no slug configured');
      }
    }

    logger.info(`正在获取市场信息: ${slug}`);
    const info = await fetchMarketFromSlug(slug);

    this.marketSlug = slug;
    this.marketId = info.marketId;
    this.yesTokenId = info.yesTokenId;
    this.noTokenId = info.noTokenId;

    if (info.endDate) {
      const endMs = Date.parse(info.endDate);
      if (!isNaN(endMs)) {
        this.marketEndTimestamp = Math.floor(endMs / 1000);
      }
    }
    if (!this.marketEndTimestamp) {
      const match = slug.match(/btc-updown-15m-(\d+)/);
      if (match) {
        this.marketEndTimestamp = parseInt(match[1], 10) + 900;
      }
    }

    await getClient(this.settings);

    logger.info(`市场 ID: ${this.marketId}`);
    logger.info(`UP Token: ${this.yesTokenId}`);
    logger.info(`DOWN Token: ${this.noTokenId}`);
    logger.info(`结束时间戳: ${this.marketEndTimestamp ?? 'Unknown'}`);

    const balance = await getBalance(this.settings);
    this.ledger.setBalanceSnapshot(balance);
  }

  getTimeRemaining(): string {
    if (!this.marketEndTimestamp) return 'Unknown';
    const now = Math.floor(Date.now() / 1000);
    const remaining = this.marketEndTimestamp - now;
    if (remaining <= 0) return 'CLOSED';
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins}m ${secs}s`;
  }

  async runOnce(): Promise<boolean> {
    const timeRemaining = this.getTimeRemaining();
    if (timeRemaining === 'CLOSED') return false;

    const opp = await checkArbitrage(this.settings, this.yesTokenId, this.noTokenId);
    if (opp) {
      this.opportunitiesFound += 1;
      if (!this.preTradeCheck(timeRemaining)) return false;

      const success = await executeArbitrage(opp, {
        settings: this.settings,
        yesTokenId: this.yesTokenId,
        noTokenId: this.noTokenId,
        marketSlug: this.marketSlug,
        onTradeRecord: (record) => {
          this.ledger.recordTrade(record);
          this.tradesExecuted += 1;
          this.currentMarketTrades += 1;
          this.totalInvested += record.totalInvestment;
          this.totalSharesBought += record.orderSize * 2;
          this.consecutiveFailures = 0;
        },
        onPartialFill: (imbalance) => {
          if (imbalance > this.settings.maxImbalance) {
            logger.warn(`⚠️ 不平衡超过阈值: ${imbalance}`);
          }
        },
      });

      if (!success) {
        this.consecutiveFailures += 1;
        this.ledger.failedOrders += 1;
        if (this.settings.maxConsecutiveFailures > 0 && this.consecutiveFailures >= this.settings.maxConsecutiveFailures) {
          logger.error(`🛑 连续失败 ${this.consecutiveFailures} 次，触发熔断`);
          this.ledger.circuitBreaks += 1;
          process.exit(1);
        }
      }
      return true;
    }

    const balance = await getBalance(this.settings);
    this.ledger.setBalanceSnapshot(balance);
    return false;
  }

  private preTradeCheck(timeRemaining: string): boolean {
    if (this.settings.minTimeRemainingMinutes > 0 && this.marketEndTimestamp) {
      const now = Math.floor(Date.now() / 1000);
      const remainingMin = (this.marketEndTimestamp - now) / 60;
      if (remainingMin < this.settings.minTimeRemainingMinutes) {
        return false;
      }
    }
    if (this.settings.maxTradesPerMarket > 0 && this.currentMarketTrades >= this.settings.maxTradesPerMarket) {
      return false;
    }
    return true;
  }

  async monitor(intervalMs: number = 0): Promise<void> {
    logger.info('='.repeat(70));
    logger.info('🚀 BTC 15分钟套利机器人已启动');
    logger.info('='.repeat(70));
    logger.info(`市场: ${this.marketSlug}`);
    logger.info(`剩余时间: ${this.getTimeRemaining()}`);
    logger.info(`模式: ${this.settings.dryRun ? '🔸 模拟' : '🔴 真实交易'}`);
    logger.info(`成本阈值: $${this.settings.targetPairCost}`);
    logger.info(`订单数量: ${this.settings.orderSize} 股`);
    logger.info(`扫描间隔: ${this.settings.scanInterval}秒`);
    logger.info('='.repeat(70));
    logger.info('📅 每日 09:05 (UTC+8) 推送前一日汇总到 Notion');
    logger.info('');

    let scanCount = 0;
    const minInterval = Math.max(intervalMs, 2000);

    while (true) {
      scanCount += 1;
      logger.info(`\n[Scan #${scanCount}] ${new Date().toISOString().slice(11, 19)}`);

      if (this.getTimeRemaining() === 'CLOSED') {
        logger.info('\n🚨 市场已关闭！');
        logger.info('\n🔄 正在搜索下一个 BTC 15分钟市场...');
        try {
          const newSlug = await findCurrentBtc15minMarket();
          if (newSlug !== this.marketSlug) {
            logger.info(`✅ 找到新市场: ${newSlug}`);
            this.currentMarketTrades = 0;
            this.marketSlug = newSlug;
            const info = await fetchMarketFromSlug(newSlug);
            this.marketId = info.marketId;
            this.yesTokenId = info.yesTokenId;
            this.noTokenId = info.noTokenId;
            const match = newSlug.match(/btc-updown-15m-(\d+)/);
            if (match) this.marketEndTimestamp = parseInt(match[1], 10) + 900;
            scanCount = 0;
          } else {
            logger.info('⏳ 等待新市场... (30秒)');
            await sleep(this.settings.marketSwitchDelay * 1000);
          }
        } catch (e) {
          logger.error(`搜索新市场时出错: ${e}`);
          await sleep(30000);
        }
      } else {
        await this.runOnce();
        logger.info(`发现的机会: ${this.opportunitiesFound}/${scanCount}`);
      }

      await this.checkScheduledPush();
      await sleep(minInterval);
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
    const balance = await getBalance(this.settings);
    const uptime = (Date.now() - this._startTime) / 1000;
    const text = this.ledger.buildSummaryText(balance, this.settings.dryRun, uptime, this.opportunitiesFound);
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
