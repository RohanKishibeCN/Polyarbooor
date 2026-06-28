import { loadSettings } from './config.js';
import { SimpleArbitrageBot } from './strategy/bot.js';
import { logger } from './utils/logger.js';

async function main() {
  const settings = loadSettings();

  if (!settings.privateKey) {
    logger.error('❌ 错误: .env 中未配置 POLYMARKET_PRIVATE_KEY');
    process.exit(1);
  }

  // 重试循环 — 出错后自动重试，不崩溃退出
  const RETRY_DELAY_MS = 15000;  // 每次重试间隔 15 秒

  while (true) {
    try {
      const bot = new SimpleArbitrageBot(settings);
      await bot.init();
      await bot.monitor(settings.scanInterval * 1000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`❌ 发生错误: ${msg}`);
      logger.info(`⏳ ${RETRY_DELAY_MS / 1000} 秒后自动重试...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

main();
