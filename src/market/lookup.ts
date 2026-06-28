import axios from 'axios';
import type { MarketInfo } from '../types.js';
import { logger } from '../utils/logger.js';

const GAMMA_API = 'https://gamma-api.polymarket.com';

export async function fetchMarketFromSlug(slug: string): Promise<MarketInfo> {
  const cleanSlug = slug.split('?')[0];

  const { data } = await axios.get<Record<string, unknown>>(
    `${GAMMA_API}/markets/slug/${cleanSlug}`,
    { timeout: 10000 },
  );

  const clobTokenIdsRaw = data.clobTokenIds as string | undefined;
  const outcomesRaw = data.outcomes as string | undefined;
  const conditionId = data.conditionId as string | undefined;

  if (!clobTokenIdsRaw) {
    throw new Error(`市场未找到 CLOB token: ${cleanSlug}`);
  }

  // Gamma API 返回的 clobTokenIds/outcomes 是 JSON 字符串，需解析
  const clobTokens: string[] = JSON.parse(clobTokenIdsRaw);
  const outcomes: string[] = outcomesRaw ? JSON.parse(outcomesRaw) : [];

  if (!clobTokens || clobTokens.length !== 2) {
    throw new Error(`Expected 2 clob tokens, got ${clobTokens?.length ?? 0}`);
  }

  const marketId = conditionId
    ? conditionId.startsWith('0x')
      ? conditionId.slice(2)
      : conditionId
    : (data.id as string) ?? cleanSlug;

  logger.info(`✅ 市场信息获取成功: ${cleanSlug}`);

  return {
    marketId,
    yesTokenId: clobTokens[0],
    noTokenId: clobTokens[1],
    outcomes: outcomes.length === 2 ? outcomes : ['Up', 'Down'],
    question: (data.question as string) ?? cleanSlug,
    startDate: (data.startDate as string) ?? '',
    endDate: (data.endDate as string) ?? '',
  };
}
