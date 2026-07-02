import { loadSettings } from './config.js';
import { MakerBot } from './strategy/bot.js';
import { logger } from './utils/logger.js';

async function main() {
  const settings = loadSettings();

  if (!settings.privateKey) {
    logger.error('❌ 错误: .env 中未配置 POLYMARKET_PRIVATE_KEY');
    process.exit(1);
  }

  const RETRY_DELAY_MS = 15000;

  while (true) {
    try {
      const bot = new MakerBot(settings);
      await bot.init();
      await bot.run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`❌ 发生错误: ${msg}`);
      logger.info(`⏳ ${RETRY_DELAY_MS / 1000} 秒后自动重试...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}

main();
