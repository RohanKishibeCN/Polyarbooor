import type { TradeRecord } from './types.js';

type MarketSummary = {
  count: number;
  profit: number;
  result: string;
};

export class TradeLedger {
  trades: TradeRecord[] = [];
  events: string[] = [];
  marketsMonitored = new Set<string>();
  failedOrders = 0;
  circuitBreaks = 0;
  private _startDate: string = new Date().toISOString().slice(0, 10);
  private _balanceStart = 0;
  private _balanceLow = Infinity;

  recordTrade(record: TradeRecord) {
    this.trades.push(record);
  }

  recordMarket(slug: string) {
    this.marketsMonitored.add(slug);
  }

  recordEvent(event: string) {
    this.events.push(event);
  }

  setBalanceSnapshot(current: number) {
    if (this._balanceStart === 0) this._balanceStart = current;
    if (current < this._balanceLow) this._balanceLow = current;
  }

  buildSummaryText(
    currentBalance: number,
    dryRun: boolean,
    uptimeSeconds: number,
    opportunitiesFound: number,
  ): string {
    const n = this.trades.length;
    if (n === 0) return emptySummary(currentBalance, dryRun, uptimeSeconds);

    const totalInvested = this.trades.reduce(
      (s, t) => s + t.totalInvestment,
      0,
    );
    const totalProfit = this.trades.reduce(
      (s, t) => s + t.expectedProfit,
      0,
    );
    const estGas = n * 2 * 0.02;
    const netPnl = totalProfit - estGas;
    const pnlPct =
      totalInvested > 0 ? (netPnl / totalInvested) * 100 : 0;
    const maxDd =
      this._balanceStart > 0 && this._balanceLow < this._balanceStart
        ? ((this._balanceStart - this._balanceLow) / this._balanceStart) *
          100
        : 0;

    const avgCost =
      this.trades.reduce((s, t) => s + t.vwapUp + t.vwapDown, 0) / n;
    const avgSpread = round(
      this.trades.reduce(
        (s, t) =>
          s + Math.abs(t.vwapUp - 0.5) + Math.abs(t.vwapDown - 0.5),
        0,
      ) /
        (n * 2),
      3,
    );
    const partials = this.trades.filter((t) => t.partiallyFilled).length;
    const successRate =
      opportunitiesFound > 0
        ? ((n / opportunitiesFound) * 100).toFixed(1)
        : '0.0';

    // Top 5
    const byMarket = new Map<string, MarketSummary>();
    for (const t of this.trades) {
      const slug = t.marketSlug.replace('btc-updown-15m-', '').slice(0, 8);
      const entry = byMarket.get(slug) ?? { count: 0, profit: 0, result: '' };
      entry.count += 1;
      entry.profit += t.expectedProfit;
      entry.result = t.marketResult || '';
      byMarket.set(slug, entry);
    }
    const top5 = [...byMarket.entries()]
      .sort((a, b) => b[1].profit - a[1].profit)
      .slice(0, 5);
    const top5Lines = top5.map(
      ([slug, data], i) =>
        `${i + 1}. btc-...${slug} — ${data.count} trade(s), +$${data.profit.toFixed(2)}${data.result ? ` (${data.result} won)` : ''}`,
    );
    const remaining = byMarket.size - top5.length;
    if (remaining > 0)
      top5Lines.push(`... and ${remaining} other markets`);

    const mode = dryRun ? '🔸 DRY_RUN' : '🔴 LIVE';
    const h = Math.floor(uptimeSeconds / 3600);
    const m = Math.floor((uptimeSeconds % 3600) / 60);

    return `📊 [ACCOUNT]
Balance: $${currentBalance.toFixed(2)} USDC | Mode: ${mode}
PnL: ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%) | MaxDD: ${maxDd.toFixed(2)}%
Uptime: ${h}h ${m}m

🔄 [FLOW]
Markets: ${this.marketsMonitored.size} | Opps Detected: ${opportunitiesFound} | Executed: ${n}
Success Rate: ${successRate}% | Avg Spread: ±${avgSpread.toFixed(3)}

📦 [ARBITRAGE]
Avg Pair Cost: $${avgCost.toFixed(4)} | Avg Profit/Trade: $${(totalProfit / n).toFixed(2)}
Total Invested: $${totalInvested.toFixed(2)} | Expected Return: $${(totalInvested + totalProfit).toFixed(2)}
Est Net PnL: ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)} | Est Gas: -$${estGas.toFixed(2)}

⚠️ [RISK]
Partial Fills: ${partials} | Failed Orders: ${this.failedOrders} | Circuit Breaks: ${this.circuitBreaks}

📈 [TOP_MARKETS]
${top5Lines.join('\n')}`;
  }

  reset() {
    this.trades = [];
    this.events = [];
    this.marketsMonitored.clear();
    this.failedOrders = 0;
    this.circuitBreaks = 0;
    this._startDate = new Date().toISOString().slice(0, 10);
    this._balanceStart = 0;
    this._balanceLow = Infinity;
  }
}

function emptySummary(
  balance: number,
  dryRun: boolean,
  uptimeSeconds: number,
): string {
  const mode = dryRun ? '🔸 DRY_RUN' : '🔴 LIVE';
  const h = Math.floor(uptimeSeconds / 3600);
  const m = Math.floor((uptimeSeconds % 3600) / 60);
  return `📊 [ACCOUNT]
Balance: $${balance.toFixed(2)} USDC | Mode: ${mode}
Uptime: ${h}h ${m}m

🔄 [FLOW]
No arbitrage trades today.`;
}

function round(n: number, decimals: number) {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}
