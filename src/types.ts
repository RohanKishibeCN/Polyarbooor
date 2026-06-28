export interface Settings {
  // API 凭证
  privateKey: string;
  signatureType: number;
  funder: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;

  // 市场配置
  marketSlug: string;
  marketId: string;
  yesTokenId: string;
  noTokenId: string;

  // 策略参数
  targetPairCost: number;
  orderSize: number;
  maxSinglePrice: number;
  minNetProfit: number;

  // 风控参数
  dryRun: boolean;
  maxTradesPerMarket: number;
  minTimeRemainingMinutes: number;
  balanceSlack: number;
  cooldownSeconds: number;
  maxImbalance: number;
  maxDailyLoss: number;
  maxConsecutiveFailures: number;

  // Gas & 网络
  estGasPerOrder: number;
  clobHost: string;
  chainId: number;
  httpTimeout: number;
  apiRetryCount: number;
  apiRetryDelay: number;

  // 监控
  scanInterval: number;
  marketSwitchDelay: number;

  // Notion
  notionEnabled: boolean;
  notionApiKey: string;
  notionDatabaseId: string;

  // 日志
  verbose: boolean;
  logFile: string;
  hideCredentials: boolean;
}

export interface MarketInfo {
  marketId: string;
  yesTokenId: string;
  noTokenId: string;
  outcomes: string[];
  question: string;
  startDate: string;
  endDate: string;
}

export interface VwapResult {
  vwap: number;
  totalSize: number;
  levelsUsed: number;
  maxPrice: number;
  filled: boolean;
}

export interface OrderBookLevel {
  price: string;
  size: string;
}

export interface RawOrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface ArbitrageOpportunity {
  vwapUp: number;
  vwapDown: number;
  totalCost: number;
  profitPerShare: number;
  netProfit: number;
  grossProfit: number;
  estGas: number;
  orderSize: number;
  totalInvestment: number;
  expectedPayout: number;
  upDepthLevels: number;
  downDepthLevels: number;
  upMaxPrice: number;
  downMaxPrice: number;
  timestamp: string;
}

export interface OrderParams {
  side: 'BUY' | 'SELL';
  tokenId: string;
  price: number;
  size: number;
}

export interface TradeRecord {
  timestamp: string;
  marketSlug: string;
  vwapUp: number;
  vwapDown: number;
  orderSize: number;
  totalInvestment: number;
  expectedProfit: number;
  partiallyFilled: boolean;
  marketResult: string;
}
