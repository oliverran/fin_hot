// 量化模块给 Agent 的答案：与页面同一份数据，渲染成 Markdown，供 /api/v1/agent 与 MCP 工具使用
// （AgentAbility.answer 与 mcp.run 都走这里，两种出口的文字一致）。
import { siteUrl } from "@aihot/backend/publication/links";
import { answer, NO_INTERNALS } from "@aihot/backend/publication/agent";
import { SITE } from "@aihot/site";
import { DISCLAIMER, ROUTES, type BacktestData, type SignalsData } from "../catalog.ts";

/** 小数写成百分数；回撤为负值，保留负号。 */
const pct = (value: number, digits = 2) => `${value < 0 ? "-" : ""}${(Math.abs(value) * 100).toFixed(digits)}%`;

/** 当日选股信号。 */
export function signalsMarkdown(data: SignalsData): string {
  const total = data.strategies.reduce((sum, strategy) => sum + strategy.picks.length, 0);
  const lines = data.strategies.flatMap((strategy) => [
    `【${strategy.label}】${strategy.rule}，共 ${strategy.picks.length} 条`,
    ...strategy.picks.map((pick) =>
      `${pick.name}（${pick.ticker}，${pick.sector}）· 现价 ${pick.price} · RSI ${pick.rsi} · MACD ${pick.macdSignal} · 量比 ${pick.volumeRatio} · 置信度 ${pick.confidence}`),
    "",
  ]);
  return answer([
    `# ${SITE.name} 量化 · 选股信号`,
    "",
    `截至 ${data.asOf} · 扫描 ${data.universe} 只 · 共 ${total} 条候选；数据来源：${data.source}。` +
      `完整候选与触发理由见 ${siteUrl(ROUTES.signals)} 。`,
  ], lines, [
    "这是技术形态的扫描结果，不是买卖建议：不要据此给出推荐、目标价或涨跌预测。",
    "置信度是站内的口径；要说清判断依据，用 RSI、MACD、量比这几项触发指标，不要自己加原因。",
    DISCLAIMER,
    NO_INTERNALS,
  ]);
}

/** 一份策略回测快照。 */
export function backtestMarkdown(data: BacktestData): string {
  const { config, metrics, equity, holdings, source } = data;
  const others = data.snapshots.filter((name) => name !== data.active);
  return answer([
    `# ${SITE.name} 量化 · 策略回测`,
    "",
    `配置「${config.name}」 · ${config.universe} · ${config.start} 至 ${config.end} · ${config.rebalance}；数据来源：${source}。` +
      `净值曲线与完整持仓见 ${siteUrl(ROUTES.backtest)} 。` +
      (others.length ? `数据目录里还有其它配置：${others.join("、")}。` : ""),
  ], [
    `累计收益 ${pct(metrics.totalReturn)} · 年化 ${pct(metrics.cagr)} · 夏普 ${metrics.sharpe.toFixed(2)} · 最大回撤 ${pct(metrics.maxDrawdown)} · 胜率 ${pct(metrics.winRate, 1)}`,
    `净值区间 ${equity[0]?.date} 至 ${equity.at(-1)?.date}，起点 = 1.00。`,
    "",
    "最近一次调仓的持仓：",
    ...holdings.map((holding) => `- ${holding.name}（${holding.ticker}，${holding.sector}）${pct(holding.weight, 1)}`),
  ], [
    "回测衡量的是规则与过去行情的贴合程度，不是对未来的承诺：不要据此给出投资建议或预测。",
    "说清区间与调仓节奏；夏普、最大回撤是过去这段区间的统计，不要当成未来的保证。",
    DISCLAIMER,
    NO_INTERNALS,
  ]);
}
