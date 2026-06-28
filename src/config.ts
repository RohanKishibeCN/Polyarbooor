import dotenv from 'dotenv';
import type { Settings } from './types.js';

dotenv.config({ override: true });

function envStr(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseFloat(v) : fallback;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (!v) return fallback;
  return v.toLowerCase() === 'true';
}

export function loadSettings(): Settings {
  return {
    privateKey: envStr('POLYMARKET_PRIVATE_KEY'),
    signatureType: envInt('POLYMARKET_SIGNATURE_TYPE', 1),
    funder: envStr('POLYMARKET_FUNDER'),
    apiKey: envStr('POLYMARKET_API_KEY'),
    apiSecret: envStr('POLYMARKET_API_SECRET'),
    apiPassphrase: envStr('POLYMARKET_API_PASSPHRASE'),

    marketSlug: envStr('POLYMARKET_MARKET_SLUG'),
    marketId: envStr('POLYMARKET_MARKET_ID'),
    yesTokenId: envStr('POLYMARKET_YES_TOKEN_ID'),
    noTokenId: envStr('POLYMARKET_NO_TOKEN_ID'),

    targetPairCost: envNum('TARGET_PAIR_COST', 0.99),
    orderSize: envNum('ORDER_SIZE', 50),
    maxSinglePrice: envNum('MAX_SINGLE_PRICE', 0.75),
    minNetProfit: envNum('MIN_NET_PROFIT', 0.10),

    dryRun: envBool('DRY_RUN', true),
    maxTradesPerMarket: envInt('MAX_TRADES_PER_MARKET', 0),
    minTimeRemainingMinutes: envInt('MIN_TIME_REMAINING_MINUTES', 1),
    balanceSlack: envNum('BALANCE_SLACK', 0.15),
    cooldownSeconds: envNum('COOLDOWN_SECONDS', 5),
    maxImbalance: envNum('MAX_IMBALANCE', 5),
    maxDailyLoss: envNum('MAX_DAILY_LOSS', 50),
    maxConsecutiveFailures: envInt('MAX_CONSECUTIVE_FAILURES', 5),

    estGasPerOrder: envNum('EST_GAS_PER_ORDER', 0.02),
    clobHost: envStr('POLYMARKET_CLOB_HOST', 'https://clob.polymarket.com'),
    chainId: envInt('POLYMARKET_CHAIN_ID', 137),
    httpTimeout: envNum('HTTP_TIMEOUT', 15),
    apiRetryCount: envInt('API_RETRY_COUNT', 3),
    apiRetryDelay: envNum('API_RETRY_DELAY', 1.0),

    scanInterval: envNum('SCAN_INTERVAL', 2),
    marketSwitchDelay: envNum('MARKET_SWITCH_DELAY', 30),

    notionEnabled: envBool('NOTION_ENABLED', false),
    notionApiKey: envStr('NOTION_API_KEY'),
    notionDatabaseId: envStr('NOTION_DATABASE_ID'),

    verbose: envBool('VERBOSE', false),
    logFile: envStr('LOG_FILE'),
    hideCredentials: envBool('HIDE_CREDENTIALS', true),
  };
}
