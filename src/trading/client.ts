import axios from 'axios';
import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import type { Settings, OrderParams, RawOrderBook } from '../types.js';
import { logger } from '../utils/logger.js';

let cachedClient: ClobClient | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClobClient = any;

function getSigner(settings: Settings) {
  const formattedKey = settings.privateKey.startsWith('0x')
    ? (settings.privateKey as `0x${string}`)
    : (`0x${settings.privateKey}` as `0x${string}`);

  const account = privateKeyToAccount(formattedKey);
  return createWalletClient({
    account,
    chain: polygon,
    transport: http(),
  });
}

export function getClient(settings: Settings): ClobClient {
  if (cachedClient) return cachedClient;

  if (!settings.privateKey) {
    throw new Error('POLYMARKET_PRIVATE_KEY is required for trading');
  }

  const signer = getSigner(settings);
  const host = settings.clobHost;
  const chainId = settings.chainId;

  cachedClient = new ClobClient(
    host,
    chainId,
    signer,
    undefined,
    settings.signatureType,
    settings.funder || undefined,
  );

  logger.info('正在从私钥派生用户 API 凭证...');
  const derived = cachedClient.createOrDeriveApiKey();
  (cachedClient as AnyClobClient).setApiCreds(derived);

  const address =
    (cachedClient as AnyClobClient).getAddress?.() ?? settings.funder;
  logger.info('✅ API 凭证配置成功');
  if (!settings.hideCredentials) {
    logger.info(`   钱包地址: ${address}`);
  }
  logger.info(`   资金方: ${settings.funder}`);

  return cachedClient;
}

export async function getBalance(settings: Settings): Promise<number> {
  try {
    const client = getClient(settings);
    const result = await (client as AnyClobClient).getBalanceAllowance({
      asset_type: 'COLLATERAL' as unknown as number,
      signature_type: settings.signatureType,
    });

    if (result && typeof result === 'object' && 'balance' in result) {
      const raw = parseFloat(
        (result as Record<string, string>).balance,
      );
      return raw / 1_000_000;
    }
    return 0;
  } catch (e) {
    logger.error(`获取余额时出错: ${e}`);
    return 0;
  }
}

export async function placeOrder(
  settings: Settings,
  side: 'BUY' | 'SELL',
  tokenId: string,
  price: number,
  size: number,
): Promise<unknown> {
  const client = getClient(settings);
  const sideEnum = side === 'BUY' ? Side.BUY : Side.SELL;

  const signedOrder = await client.createOrder({
    tokenID: tokenId,
    price,
    size,
    side: sideEnum,
  });

  return (client as AnyClobClient).postOrder(signedOrder, OrderType.GTC);
}

export async function placeOrdersFast(
  settings: Settings,
  orders: OrderParams[],
): Promise<unknown[]> {
  const results: unknown[] = [];

  for (const order of orders) {
    try {
      const result = await placeOrder(
        settings,
        order.side,
        order.tokenId,
        order.price,
        order.size,
      );
      results.push(result);
    } catch (e) {
      results.push({ error: String(e) });
    }
  }

  return results;
}

export async function getFullOrderBook(
  tokenId: string,
  host: string,
): Promise<RawOrderBook> {
  const url = `${host}/book?token_id=${tokenId}`;
  const { data } = await axios.get<RawOrderBook>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });
  return data;
}

export async function getLastTradePrice(
  tokenId: string,
  host: string,
): Promise<number> {
  const url = `${host}/last-trade-price?token_id=${tokenId}`;
  const { data } = await axios.get<{ price: string }>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });
  return parseFloat(data.price);
}

export async function getPositions(
  settings: Settings,
  tokenIds: string[],
): Promise<Record<string, { size: number; avgPrice: number }>> {
  try {
    const addr = settings.funder;
    if (!addr) {
      logger.error('未配置 POLYMARKET_FUNDER 地址');
      return {};
    }

    const url = `https://data-api.polymarket.com/positions?user=${addr}`;
    const { data } = await axios.get<unknown[]>(url, { timeout: 10000 });

    const result: Record<string, { size: number; avgPrice: number }> = {};
    for (const pos of data) {
      const item = pos as Record<string, unknown>;
      const tokenId = item.asset as string;
      if (tokenId && tokenIds.includes(tokenId)) {
        result[tokenId] = {
          size: parseFloat((item.size as string) ?? '0'),
          avgPrice: parseFloat((item.avg_price as string) ?? '0'),
        };
      }
    }
    return result;
  } catch (e) {
    logger.error(`获取持仓时出错: ${e}`);
    return {};
  }
}
