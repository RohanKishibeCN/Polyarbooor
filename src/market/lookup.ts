import axios from 'axios';
import type { MarketInfo } from '../types.js';

export async function fetchMarketFromSlug(slug: string): Promise<MarketInfo> {
  const cleanSlug = slug.split('?')[0];
  const url = `https://polymarket.com/event/${cleanSlug}`;

  const { data } = await axios.get<string>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000,
  });

  const match = data.match(
    /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
  );
  if (!match) throw new Error('__NEXT_DATA__ payload not found');

  const payload = JSON.parse(match[1]);
  const queries =
    payload?.props?.pageProps?.dehydratedState?.queries ?? [];

  let market: Record<string, unknown> | null = null;
  for (const q of queries) {
    const qData = q?.state?.data;
    if (qData && typeof qData === 'object' && 'markets' in qData) {
      const markets = qData.markets as Record<string, unknown>[];
      for (const mk of markets) {
        if (mk.slug === cleanSlug) {
          market = mk;
          break;
        }
      }
    }
    if (market) break;
  }

  if (!market) throw new Error('Market slug not found in dehydrated state');

  const clobTokens = (market.clobTokenIds as string[]) ?? [];
  const outcomes = (market.outcomes as string[]) ?? [];
  if (clobTokens.length !== 2 || outcomes.length !== 2) {
    throw new Error('Expected binary market with two clob tokens');
  }

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
