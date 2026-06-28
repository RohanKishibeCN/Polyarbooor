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
  const matches = [...data.matchAll(pattern)].map((m) => parseInt(m[1], 10));

  if (!matches.length) {
    throw new Error('No active BTC 15min market found');
  }

  const now = Math.floor(Date.now() / 1000);

  // 找时间戳最接近当前时间且未结束的市场
  // BTC 15min 市场周期 = 900 秒，找当前 15 分钟窗口对应的 slug
  const currentWindow = Math.floor(now / 900) * 900;

  // 首先尝试精确匹配当前 15 分钟窗口
  // 如果没有，找最近的一个
  let bestSlug: number | null = null;
  let smallestDiff = Infinity;

  for (const ts of matches) {
    // slug 时间戳是市场的开始时间，在 +900 秒后结束
    // 市场应满足：ts <= now < ts + 900
    if (ts <= now && now < ts + 900) {
      bestSlug = ts;
      break;
    }
    // 作为后备，找最接近当前窗口的
    const diff = Math.abs(ts - currentWindow);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      bestSlug = ts;
    }
  }

  if (!bestSlug) {
    throw new Error('No active BTC 15min market found');
  }

  const slug = `btc-updown-15m-${bestSlug}`;
  logger.info(`✅ 找到当前市场: ${slug}`);
  return slug;
}
