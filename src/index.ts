import { loadSettings } from './config.js';
import { SimpleArbitrageBot } from './strategy/bot.js';
import { logger } from './utils/logger.js';

async function main() {
  const settings = loadSettings();

  if (!settings.privateKey) {
    logger.error('❌ 错误: .env 中未配置 POLYMARKET_PRIVATE_KEY');
    process.exit(1);
  }

  try {
    const bot = new SimpleArbitrageBot(settings);
    await bot.init();
    await bot.monitor(settings.scanInterval * 1000);
  } catch (e) {
    logger.error(`❌ 致命错误: ${e}`);
    process.exit(1);
  }
}

main();
