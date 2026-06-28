import axios from 'axios';
import { logger } from '../utils/logger.js';

export async function findCurrentBtc15minMarket(): Promise<string> {
  logger.info('正在搜索当前活跃的 BTC 15分钟市场...');

  const pageUrl = 'https://polymarket.com/crypto/15M';
  const { data } = await axios.get<string>(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });

  const pattern = /btc-updown-15m-(\d+)/g;
  const matches = [...data.matchAll(pattern)].map((m) => m[1]);

  if (!matches.length) {
    throw new Error('No active BTC 15min market found');
  }

  const latest = Math.max(...matches.map(Number));
  const slug = `btc-updown-15m-${latest}`;
  logger.info(`✅ 找到市场: ${slug}`);
  return slug;
}
