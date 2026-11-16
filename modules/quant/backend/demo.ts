// 离线合成数据：不访问任何外部行情。选股信号（backend/daily.ts）与策略回测（backend/snapshot.ts）
// 都优先读站外产物，读不到时回落到这里，保证页面在没接 Python 的机器上也有内容可看。
// 数值由固定种子生成，同一份数据在服务端与浏览器、每次请求之间都一致。
import {
  QUANT_SOURCE, STRATEGIES,
  type BacktestData, type EquityPoint, type Signal, type SignalsData, type StrategyKey,
} from "../catalog.ts";

/** 固定种子的伪随机数（mulberry32）：同一份示例每次请求都相同。 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串的稳定散列，用来给每个策略取种子。 */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** 示范股票池：主板代码（与工具默认过滤创业板一致）。 */
const UNIVERSE: readonly { ticker: string; name: string; sector: string }[] = [
  { ticker: "600519", name: "贵州茅台", sector: "白酒" },
  { ticker: "000858", name: "五粮液", sector: "白酒" },
  { ticker: "601318", name: "中国平安", sector: "保险" },
  { ticker: "600036", name: "招商银行", sector: "银行" },
  { ticker: "601899", name: "紫金矿业", sector: "有色金属" },
  { ticker: "600276", name: "恒瑞医药", sector: "医药" },
  { ticker: "000651", name: "格力电器", sector: "家电" },
  { ticker: "601012", name: "隆基绿能", sector: "新能源" },
  { ticker: "600030", name: "中信证券", sector: "证券" },
  { ticker: "601668", name: "中国建筑", sector: "建筑" },
  { ticker: "600900", name: "长江电力", sector: "电力" },
  { ticker: "601088", name: "中国神华", sector: "煤炭" },
  { ticker: "600887", name: "伊利股份", sector: "食品" },
  { ticker: "000333", name: "美的集团", sector: "家电" },
  { ticker: "601857", name: "中国石油", sector: "石油" },
  { ticker: "600028", name: "中国石化", sector: "石油" },
];

const DAYS = 250;

/** 从 2024-01-02 起跳过周末，取 250 个交易日。 */
function tradingDates(count: number): string[] {
  const out: string[] = [];
  const cursor = new Date(Date.UTC(2024, 0, 2));
  while (out.length < count) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const DATES = tradingDates(DAYS);

const REASONING: Record<StrategyKey, (s: { name: string; rsi: number; volumeRatio: number }) => string> = {
  "超卖反弹": (s) => `${s.name}：RSI 回落到 ${s.rsi}，MACD 由绿转红，超跌后的技术性反弹窗口打开；量能温和，留意上方均线压力。`,
  "趋势向好": (s) => `${s.name}：5/10/20 日均线多头排列，MACD 持续为正，RSI ${s.rsi} 仍在中性区间，趋势未过热。`,
  "放量突破": (s) => `${s.name}：成交较 20 日均量放大 ${s.volumeRatio} 倍，价格站上平台，RSI ${s.rsi} 未进入过热区。`,
};

export function signalsData(): SignalsData {
  const asOf = DATES.at(-1)!;
  const strategies = STRATEGIES.map((strategy) => {
    const random = rng(hash(strategy.key));
    const offset = hash(`${strategy.key}·pick`) % UNIVERSE.length;
    const picks: Signal[] = [];
    for (let i = 0; i < 4; i++) {
      const stock = UNIVERSE[(offset + i * 3) % UNIVERSE.length]!;
      const rsi = round(28 + random() * 38, 1);
      const volumeRatio = round(1.1 + random() * 1.6);
      picks.push({
        date: asOf,
        ticker: stock.ticker,
        name: stock.name,
        sector: stock.sector,
        recommendationType: strategy.key,
        price: round(6 + random() * 130),
        rsi,
        macdSignal: strategy.key === "超卖反弹" ? "金叉" : "多头",
        volumeRatio,
        confidence: Math.round(62 + random() * 33),
        reasoning: REASONING[strategy.key]({ name: stock.name, rsi, volumeRatio }),
      });
    }
    return { key: strategy.key, label: strategy.label, rule: strategy.rule, blurb: strategy.blurb, picks };
  });
  return { asOf, source: QUANT_SOURCE, universe: UNIVERSE.length, strategies };
}

export function backtestData(): BacktestData {
  const random = rng(0x5eed);
  const name = "超卖反弹 · 等权组合";
  // 第一个交易日是起点（净值 1.00），日收益从第二天开始记，与站外产物归一化后的口径一致。
  let value = 1;
  let peak = 1;
  let maxDrawdown = 0;
  const equity: EquityPoint[] = [{ date: DATES[0]!, equity: 1 }];
  const dailyReturns: number[] = [];
  for (let i = 1; i < DATES.length; i++) {
    const ret = 0.00045 + (random() - 0.5) * 0.021;
    dailyReturns.push(ret);
    value *= 1 + ret;
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
    equity.push({ date: DATES[i]!, equity: round(value, 4) });
  }
  const first = equity[0]!.equity;
  const last = equity.at(-1)!.equity;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const sd = Math.sqrt(dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (dailyReturns.length - 1));
  const weights = UNIVERSE.slice(0, 8).map((_, i) => 1 - i * 0.06);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const holdings = UNIVERSE.slice(0, 8).map((stock, i) => ({ ticker: stock.ticker, name: stock.name, sector: stock.sector, weight: round(weights[i]! / weightSum, 4) }));
  return {
    config: {
      name,
      universe: `示范股票池 ${UNIVERSE.length} 只（主板）`,
      start: DATES[0]!,
      end: DATES.at(-1)!,
      rebalance: "每周一收盘调仓",
    },
    source: QUANT_SOURCE,
    metrics: {
      totalReturn: round(last / first - 1, 4),
      cagr: round((last / first) ** (252 / dailyReturns.length) - 1, 4),
      sharpe: round((mean / sd) * Math.sqrt(252), 2),
      maxDrawdown: round(maxDrawdown, 4),
      winRate: round(dailyReturns.filter((r) => r > 0).length / dailyReturns.length, 4),
    },
    equity,
    holdings,
    snapshots: [name],
    active: name,
  };
}
