import axios from 'axios';
import { logger } from '../utils/logger.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';

export async function findCurrentBtc15minMarket(): Promise<string> {
  logger.info('正在搜索当前活跃的 BTC 15分钟市场...');

  // 方式一：Gamma REST API（优先）
  try {
    const { data: markets } = await axios.get<Record<string, unknown>[]>(
      `${GAMMA_API}/markets?tag=crypto&limit=100&closed=false`,
      { timeout: 10000 },
    );

    const btcMarkets = markets.filter((m) => {
      const slug = m.slug as string;
      return slug && slug.startsWith('btc-updown-15m-');
    });

    if (btcMarkets.length > 0) {
      // 按时间戳降序排列，取最新的
      btcMarkets.sort((a, b) => {
        const aTs = parseInt((a.slug as string).split('-').pop() ?? '0', 10);
        const bTs = parseInt((b.slug as string).split('-').pop() ?? '0', 10);
        return bTs - aTs;
      });
      const slug = btcMarkets[0].slug as string;
      logger.info(`✅ Gamma API 找到市场: ${slug}`);
      return slug;
    }
  } catch {
    logger.warn('Gamma API 搜索失败，尝试网页搜索...');
  }

  // 方式二：网页抓取（备用）
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
  logger.info(`✅ 网页搜索找到市场: ${slug}`);
  return slug;
}
