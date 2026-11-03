// 公开页面按板块归组：埋点只上报地址，板块名由地址前缀算出来，后台的排行与趋势都按它聚合。
// 前缀即站内的一级入口，与侧栏的分组一致；先长的前缀放前面，避免 /chronicle 抢走 /chronicle/…
const GROUPS: ReadonlyArray<readonly [prefix: string, name: string]> = [
  ["/us-market", "美股编年史"],
  ["/chronicle", "编年史"],
  ["/items", "内容详情"],
  ["/story", "内容详情"],
  ["/topics", "主题"],
  ["/hot", "热点榜"],
  ["/all", "全部动态"],
  ["/daily", "日报"],
  ["/weekly", "日报"],
  ["/monthly", "日报"],
  ["/starred", "收藏"],
  ["/more", "我的"],
  ["/agent", "Agent 接入"],
  ["/changelog", "更新日志"],
  ["/feedback", "反馈"],
  ["/about", "关于"],
  ["/terms", "关于"],
  ["/privacy", "关于"],
];

/** 地址属于哪个板块；不认得的地址（含首页）归入「精选」。 */
export function groupOf(path: string): string {
  const clean = (path.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  if (clean === "") return "精选";
  for (const [prefix, name] of GROUPS) if (clean === prefix || clean.startsWith(`${prefix}/`)) return name;
  return "精选";
}
