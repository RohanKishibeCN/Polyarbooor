import axios from 'axios';
import type { MarketInfo } from '../types.js';
import { logger } from '../utils/logger.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';

export async function fetchMarketFromSlug(slug: string): Promise<MarketInfo> {
  const cleanSlug = slug.split('?')[0];

  // 方式一：Gamma REST API（优先，更可靠）
  try {
    const { data: markets } = await axios.get<Record<string, unknown>[]>(
      `${GAMMA_API}/markets?slug=${cleanSlug}`,
      { timeout: 10000 },
    );

    if (markets && markets.length > 0) {
      const m = markets[0];
      const clobTokens = (m.clobTokenIds as string[]) ?? [];
      const outcomes = (m.outcomes as string[]) ?? [];

      if (clobTokens.length === 2 && outcomes.length === 2) {
        logger.info(`✅ Gamma API 获取市场信息成功: ${cleanSlug}`);
        return {
          marketId: (m.id as string) ?? '',
          yesTokenId: clobTokens[0],
          noTokenId: clobTokens[1],
          outcomes,
          question: (m.question as string) ?? '',
          startDate: (m.startDate as string) ?? '',
          endDate: (m.endDate as string) ?? '',
        };
      }
    }
  } catch {
    logger.warn('Gamma API 获取失败，尝试备用方案...');
  }

  // 方式二：网页抓取（备用）
  const url = `https://polymarket.com/event/${cleanSlug}`;
  const { data } = await axios.get<string>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });

  // 尝试 __NEXT_DATA__
  const nextMatch = data.match(
    /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
  );
  if (nextMatch) {
    const payload = JSON.parse(nextMatch[1]);
    const queries =
      payload?.props?.pageProps?.dehydratedState?.queries ?? [];

    let market: Record<string, unknown> | null = null;
    for (const q of queries) {
      const qData = q?.state?.data;
      if (qData && typeof qData === 'object' && 'markets' in qData) {
        const mks = qData.markets as Record<string, unknown>[];
        for (const mk of mks) {
          if (mk.slug === cleanSlug) {
            market = mk;
            break;
          }
        }
      }
      if (market) break;
    }

    if (market) {
      const clobTokens = (market.clobTokenIds as string[]) ?? [];
      const outcomes = (market.outcomes as string[]) ?? [];
      if (clobTokens.length === 2 || outcomes.length === 2) {
        return {
          marketId: (market.id as string) ?? '',
          yesTokenId: clobTokens[0],
          noTokenId: clobTokens[1],
          outcomes,
          question: (market.question as string) ?? '',
          startDate: (market.startDate as string) ?? '',
          endDate: (market.endDate as string) ?? '',
        };
      }
    }
  }

  // 方式三：从 HTML 中直接提取 clobTokenIds（最后尝试）
  const tokenMatch = data.match(/"clobTokenIds":\[(\d+),(\d+)\]/);
  if (tokenMatch) {
    const outcomes = ['Up', 'Down'];
    logger.info('✅ 从 HTML 中提取到 clobTokenIds');
    return {
      marketId: cleanSlug,
      yesTokenId: tokenMatch[1],
      noTokenId: tokenMatch[2],
      outcomes,
      question: cleanSlug,
      startDate: '',
      endDate: '',
    };
  }

  throw new Error(
    `无法获取市场信息: ${cleanSlug} — 所有解析方式均失败`,
  );
}

export function nextSlug(slug: string): string {
  const m = slug.match(/(.+-)(\d+)$/);
  if (!m) throw new Error(`Slug not in expected format: ${slug}`);
  const prefix = m[1];
  const num = parseInt(m[2], 10);
  return `${prefix}${num + 900}`;
}

export function parseIso(dt: string): Date | null {
  if (!dt) return null;
  try {
    return new Date(dt);
  } catch {
    return null;
  }
}
