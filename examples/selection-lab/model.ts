// Synthetic, hand-authored evidence only. No models, network clients or database imports.
import { SELECTION } from "../../industry/selection.ts";
import { tierThreshold, shownScore, scoresSelect } from "../../packages/backend/src/editorial/selection-scores.ts";

export const example = {
  kind: "synthetic-tutorial",
  title: "虚构交易所公布新的信息披露时间表",
  date: "2026-01-15T09:00:00+08:00",
  source: "示例交易所（虚构）",
  url: "https://exchange.example/disclosure-timetable",
  material: "示例交易所公告：自 2026 年 3 月 1 日起，示例板块公司应在每个季度结束后的 15 个工作日内提交更新后的信息披露表。此条材料为教学虚构，不对应任何真实规则。",
  summary: "示例交易所调整示例板块的信息披露时间表，计划于 3 月 1 日生效。",
  evidence: "自 2026 年 3 月 1 日起，示例板块公司应在每个季度结束后的 15 个工作日内提交更新后的信息披露表。",
  grouping: "教学预设：公告与引用该公告的媒体报道属于同一条新闻；转载本身不代表新事实。这里没有运行归组模型或发布流程。",
  thresholds: SELECTION.thresholds,
  defaults: { tier: "T1", first: 59, second: 61, status: "complete" },
};

export function evaluate(query: URLSearchParams) {
  const allowed = ["tier", "first", "second", "status"];
  for (const key of query.keys()) {
    if (!allowed.includes(key) || query.getAll(key).length !== 1) throw new Error("Unknown or repeated parameter");
  }
  const tier = query.get("tier") ?? example.defaults.tier;
  if (!["T1", "T1_5", "T2", "EXCLUDE_MP"].includes(tier)) throw new Error("Unknown source tier");
  const score = (key: "first" | "second") => {
    const text = query.get(key) ?? String(example.defaults[key]);
    if (!/^(?:\d|[1-9]\d|100)$/.test(text)) throw new Error("Scores must be integers from 0 to 100");
    return Number(text);
  };
  const first = score("first");
  const second = score("second");
  const status = query.get("status") ?? example.defaults.status;
  if (!["complete", "missing", "refused"].includes(status)) throw new Error("Unknown score status");
  const threshold = tierThreshold(tier);
  const scores = threshold === null ? null : {
    model: "synthetic-no-model", threshold, values: status === "missing" ? [first] : [first, second],
    receiptIds: [], reused: false, refused: status === "refused",
  };
  return {
    kind: example.kind, tier, first, second, status, threshold,
    shownScore: shownScore(scores),
    sum: scores && status === "complete" ? first + second : null,
    passesScoreGate: scoresSelect(scores),
    note: "这里只判断分数是否够候选门槛，不代表已发布或进入日报；还需相关性、新闻身份、新增价值、归组与发布规则。",
  };
}
