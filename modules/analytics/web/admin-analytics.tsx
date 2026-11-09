// 后台「指标监控」页：访客指标的今日概览、每日趋势与三张排行榜，运维的进程、接口、模型与队列，
// 以及按密钥来源分渠道的模型费用（费用读取来自 costs 模块的 /api/admin/costs）。
// 数据来自 /api/admin/analytics 与 /api/admin/costs（server.ts 的 adminHandler 守卫），页面自身不落任何数据。
// 模块的后台页没有 +types 产物，props 自己声明。
import { SITE } from "@aihot/site";
import type {
  AdminAnalytics,
  AdminAnalyticsEntry,
  AdminAnalyticsHttpRoute,
  AdminAnalyticsModelRow,
  AdminAnalyticsQueue,
  AdminAnalyticsRank,
  AdminCostChannel,
  AdminCostModel,
  AdminCosts,
} from "@aihot/contracts/admin";
import { adminGet } from "@aihot/web/lib/admin.server";
import { bj, money, num } from "@aihot/web/features/admin/format";
import { AdminPage, Badge, Card, DataTable, FilterChips, Stat, Time, type Column } from "@aihot/web/features/admin/ui";
import type { ReactNode } from "react";

export async function loader({ request }: { request: Request }): Promise<{ analytics: AdminAnalytics; costs: AdminCosts }> {
  const days = new URL(request.url).searchParams.get("days") ?? "30";
  const [analytics, costs] = await Promise.all([
    adminGet<AdminAnalytics>(request, `/api/admin/analytics?days=${encodeURIComponent(days)}`),
    adminGet<AdminCosts>(request, `/api/admin/costs?days=${encodeURIComponent(days)}`),
  ]);
  return { analytics, costs };
}

export const meta = () => [{ title: `指标监控 · ${SITE.name} 后台` }];

/** 一排柱子：高度按当天的数值取，悬停浮出当天的具体数字。 */
function Bars<T extends { day: string }>({ days, value, title, label, peak, height = "h-20" }: {
  days: T[];
  value: (day: T) => number;
  title: (day: T) => string;
  label: string;
  /** 图注里「峰值」怎么写；默认按计数，费用这类带单位的单独给。 */
  peak?: (max: number) => ReactNode;
  height?: string;
}) {
  const max = Math.max(1e-9, ...days.map(value));
  return (
    <figure>
      <div className={`flex items-stretch gap-[3px] ${height}`} role="img" aria-label={label}>
        {days.map((day) => {
          const h = (value(day) / max) * 100;
          return (
            <div key={day.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="w-full rounded-mark bg-accent/70 transition-colors group-hover:bg-accent" style={{ height: `${h}%` }} />
              <div
                className="pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-control border border-line bg-raised px-2 py-1 text-[11.5px] leading-tight text-ink shadow-lg group-hover:block"
                style={{ bottom: `calc(${h}% + 6px)` }}
              >
                {title(day)}
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-ink-4">
        <span className="num">{days[0]?.day}</span>
        <span>峰值 {peak ? peak(max) : num(max)}</span>
        <span className="num">{days.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}

/** 卡片里的一组小指标：标签在上、数值在下，不再各自加边框。 */
function Metrics({ items }: { items: Array<{ label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "ok" | "bad" }> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {items.map((m, i) => (
        <div key={i}>
          <div className="text-[12px] text-ink-3">{m.label}</div>
          <div className={`num mt-0.5 text-[18px] font-semibold tracking-tight ${m.tone === "bad" ? "text-hot" : m.tone === "ok" ? "text-ok" : "text-ink"}`}>{m.value}</div>
          {m.hint && <div className="mt-0.5 text-[11.5px] text-ink-4">{m.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/** 秒数说成人话。 */
function uptimeText(sec: number): string {
  return sec < 3600 ? `${Math.max(1, Math.round(sec / 60))} 分钟` : sec < 86400 ? `${(sec / 3600).toFixed(1)} 小时` : `${(sec / 86400).toFixed(1)} 天`;
}

const QUEUE_STATE: Record<string, { label: string; tone: "ok" | "warn" | "muted" }> = {
  active: { label: "执行中", tone: "ok" },
  created: { label: "排队", tone: "muted" },
  retry: { label: "重试", tone: "warn" },
};

const viewColumns: Array<Column<AdminAnalyticsRank>> = [
  { key: "key", label: "去处", render: (r) => <span className="break-all font-mono text-[12.5px] text-ink">{r.key}</span> },
  { key: "views", label: "浏览", align: "right", render: (r) => num(r.views) },
  { key: "visitors", label: "访客", align: "right", render: (r) => num(r.visitors) },
];

const entryColumns: Array<Column<AdminAnalyticsEntry>> = [
  { key: "key", label: "入口", render: (r) => <span className="text-ink">{r.key}</span> },
  { key: "clicks", label: "点击", align: "right", render: (r) => num(r.clicks) },
  { key: "visitors", label: "访客", align: "right", render: (r) => num(r.visitors) },
];

const routeColumns: Array<Column<AdminAnalyticsHttpRoute>> = [
  { key: "key", label: "路由", render: (r) => <span className="break-all font-mono text-[12.5px] text-ink">{r.key}</span> },
  { key: "requests", label: "请求", align: "right", render: (r) => num(r.requests) },
  { key: "errors", label: "错误", align: "right", render: (r) => (r.errors ? <span className="text-hot">{num(r.errors)}</span> : num(0)) },
  { key: "msAvg", label: "平均", align: "right", render: (r) => `${num(r.msAvg)} ms` },
  { key: "msP95", label: "P95", align: "right", render: (r) => `${num(r.msP95)} ms` },
  { key: "msMax", label: "最慢", align: "right", render: (r) => `${num(r.msMax)} ms` },
];

const queueColumns: Array<Column<AdminAnalyticsQueue>> = [
  { key: "name", label: "队列", render: (r) => <span className="break-all font-mono text-[12.5px] text-ink">{r.name}</span> },
  { key: "state", label: "状态", render: (r) => { const s = QUEUE_STATE[r.state]; return <Badge tone={s?.tone ?? "muted"}>{s?.label ?? r.state}</Badge>; } },
  { key: "n", label: "条数", align: "right", render: (r) => num(r.n) },
  { key: "oldest", label: "最早", align: "right", render: (r) => <Time at={r.oldest} /> },
];

export default function AdminAnalytics({ loaderData }: { loaderData: { analytics: AdminAnalytics; costs: AdminCosts } }) {
  const data = loaderData.analytics;
  const costs = loaderData.costs;
  const ops = data.ops;
  const currency = ops.models.currency ?? "CNY";
  const costCurrency = costs.totals.currency ?? "CNY";
  const windowViews = data.trend.reduce((sum, d) => sum + d.views, 0);

  const channelColumns: Array<Column<AdminCostChannel>> = [
    {
      key: "service",
      label: "渠道",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-mono text-[12.5px] text-ink">{r.service}</div>
          {r.apiKeyEnv && <div className="mt-0.5 text-[11.5px] text-ink-4">密钥 {r.apiKeyEnv}</div>}
        </div>
      ),
    },
    { key: "calls", label: "调用", align: "right", render: (r) => num(r.calls) },
    { key: "failed", label: "失败", align: "right", render: (r) => (r.failed ? <span className="text-hot">{num(r.failed)}</span> : num(0)) },
    { key: "tokensIn", label: "入 token", align: "right", render: (r) => num(r.tokensIn) },
    { key: "tokensOut", label: "出 token", align: "right", render: (r) => num(r.tokensOut) },
    { key: "tokensCached", label: "命中缓存", align: "right", render: (r) => num(r.tokensCached) },
    { key: "unpriced", label: "未定价", align: "right", render: (r) => (r.unpriced ? <span className="text-hot" title="这些调用没有单价，金额未计入">{num(r.unpriced)}</span> : num(0)) },
    { key: "cost", label: "花费", align: "right", render: (r) => money(r.cost, r.currency ?? costCurrency) },
  ];

  const costModelColumns: Array<Column<AdminCostModel>> = [
    { key: "service", label: "渠道", render: (r) => <span className="font-mono text-[12.5px] text-ink">{r.service}</span> },
    { key: "model", label: "模型", render: (r) => <span className="break-all font-mono text-[12.5px]">{r.model}</span> },
    { key: "calls", label: "调用", align: "right", render: (r) => num(r.calls) },
    { key: "failed", label: "失败", align: "right", render: (r) => (r.failed ? <span className="text-hot">{num(r.failed)}</span> : num(0)) },
    { key: "tokensIn", label: "入 token", align: "right", render: (r) => num(r.tokensIn) },
    { key: "tokensOut", label: "出 token", align: "right", render: (r) => num(r.tokensOut) },
    { key: "tokensCached", label: "命中缓存", align: "right", render: (r) => num(r.tokensCached) },
    { key: "unpriced", label: "未定价", align: "right", render: (r) => (r.unpriced ? <span className="text-hot" title="这些调用没有单价，金额未计入">{num(r.unpriced)}</span> : num(0)) },
    { key: "cost", label: "花费", align: "right", render: (r) => money(r.cost, r.currency ?? costCurrency) },
  ];

  const modelColumns: Array<Column<AdminAnalyticsModelRow>> = [
    { key: "purpose", label: "用途", render: (r) => <span className="text-ink">{r.purpose}</span> },
    { key: "model", label: "模型", render: (r) => <span className="break-all font-mono text-[12.5px]">{r.model}</span> },
    { key: "calls", label: "调用", align: "right", render: (r) => num(r.calls) },
    { key: "failed", label: "失败", align: "right", render: (r) => (r.failed ? <span className="text-hot">{num(r.failed)}</span> : num(0)) },
    { key: "msP95", label: "P95", align: "right", render: (r) => `${num(r.msP95)} ms` },
    { key: "cost", label: "成本", align: "right", render: (r) => money(r.cost, currency) },
  ];

  return (
    <AdminPage
      title="指标监控"
      subtitle="公开页的匿名统计：每次页面浏览与关键入口点击各记一条，只存随机访客号，不含 IP、账号或用户代理；下半页是站自己的运行指标，末段是按密钥来源分渠道的模型费用。"
      actions={<FilterChips param="days" options={[{ value: "14", label: "近 14 天" }, { value: "30", label: "近 30 天" }, { value: "90", label: "近 90 天" }]} />}
    >
      <h2 className="text-[16px] font-semibold text-ink">访客</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="今日浏览" value={num(data.today.views)} hint={data.today.day} />
        <Stat label="今日访客" value={num(data.today.visitors)} />
        <Stat label="今日入口点击" value={num(data.today.clicks)} />
        <Stat label="窗口浏览" value={num(windowViews)} hint={`近 ${data.days} 天累计`} />
      </div>
      <Card title="每日浏览趋势" right={`近 ${data.days} 天`} className="mt-4">
        <Bars
          days={data.trend}
          height="h-28"
          label={`近 ${data.days} 天每日浏览量`}
          value={(d) => d.views}
          title={(d) => `${d.day}：浏览 ${d.views}，访客 ${d.visitors}，点击 ${d.clicks}`}
        />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="页面排行" right={`近 ${data.days} 天`} pad={false}>
          <DataTable rows={data.pages} columns={viewColumns} rowKey={(r) => r.key} empty="这段时间没有页面浏览" />
        </Card>
        <Card title="板块排行" right={`近 ${data.days} 天`} pad={false}>
          <DataTable rows={data.modules} columns={viewColumns} rowKey={(r) => r.key} empty="这段时间没有页面浏览" />
        </Card>
        <Card title="入口点击排行" right={`近 ${data.days} 天`} pad={false}>
          <DataTable rows={data.entries} columns={entryColumns} rowKey={(r) => r.key} empty="这段时间没有入口点击" />
        </Card>
      </div>

      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-ink">运维</h2>
        <span className="text-[12px] text-ink-4">读于 {bj(ops.checkedAt, true)}</span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Card title="进程资源" right="api 进程">
          <Metrics
            items={[
              { label: "已运行", value: uptimeText(ops.process.uptimeSec), hint: `PID ${ops.process.pid}` },
              { label: "常驻内存", value: `${num(ops.process.rssMb, 1)} MB`, hint: `堆 ${num(ops.process.heapUsedMb, 1)} MB` },
              { label: "CPU", value: `${num(ops.process.cpuPercent, 1)}%`, hint: "单核占比" },
              { label: "事件循环延迟", value: `${num(ops.process.loopLagMs)} ms`, tone: ops.process.loopLagMs > 200 ? "bad" : undefined, hint: `负载 ${num(ops.process.load1, 2)}` },
            ]}
          />
        </Card>
        <Card title="接口耗时与错误率" right={`近 ${data.days} 天`}>
          <Metrics
            items={[
              { label: "今日请求", value: num(ops.http.today.requests) },
              { label: "今日错误 (5xx)", value: num(ops.http.today.errors), tone: ops.http.today.errors ? "bad" : "ok" },
              { label: "今日平均", value: `${num(ops.http.today.msAvg)} ms` },
              { label: "今日 P95", value: `${num(ops.http.today.msP95)} ms` },
            ]}
          />
          <div className="mt-4">
            <Bars
              days={ops.http.trend}
              label={`近 ${data.days} 天每日请求量`}
              value={(d) => d.requests}
              title={(d) => `${d.day}：请求 ${d.requests}，错误 ${d.errors}，平均 ${d.msAvg} ms，P95 ${d.msP95} ms`}
            />
          </div>
        </Card>
      </div>

      <Card title="接口排行" right={`近 ${data.days} 天，按请求量`} className="mt-4" pad={false}>
        <DataTable rows={ops.http.routes} columns={routeColumns} rowKey={(r) => r.key} empty="这段时间没有接口请求" />
      </Card>

      <Card title="模型调用成本与延迟" right={`近 ${data.days} 天`} className="mt-4">
        <Metrics
          items={[
            { label: "调用", value: num(ops.models.calls) },
            { label: "失败", value: num(ops.models.failed), tone: ops.models.failed ? "bad" : "ok" },
            { label: "实付成本", value: money(ops.models.cost, currency), hint: `${num(ops.models.tokensIn)} 入 / ${num(ops.models.tokensOut)} 出 token` },
            { label: "P95 延迟", value: `${num(ops.models.msP95)} ms` },
          ]}
        />
        <div className="mt-4">
          <Bars
            days={ops.models.trend}
            label={`近 ${data.days} 天每日模型调用`}
            value={(d) => d.calls}
            title={(d) => `${d.day}：调用 ${d.calls}，失败 ${d.failed}，成本 ${money(d.cost, currency)}`}
          />
        </div>
      </Card>

      <Card title="按用途与模型" right={`近 ${data.days} 天`} className="mt-4" pad={false}>
        <DataTable rows={ops.models.rows} columns={modelColumns} rowKey={(r) => `${r.purpose}/${r.model}`} empty="这段时间没有模型调用" />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="采集吞吐" right={`近 ${data.days} 天`}>
          <Metrics
            items={[
              { label: "采集次数", value: num(ops.collect.runs) },
              { label: "失败", value: num(ops.collect.failed), tone: ops.collect.failed ? "bad" : "ok" },
              { label: "抓到条目", value: num(ops.collect.found) },
              { label: "新增条目", value: num(ops.collect.fresh) },
            ]}
          />
          <div className="mt-4">
            <Bars
              days={ops.collect.trend}
              label={`近 ${data.days} 天每日新增条目`}
              value={(d) => d.fresh}
              title={(d) => `${d.day}：采集 ${d.runs} 次，失败 ${d.failed}，抓到 ${d.found}，新增 ${d.fresh}`}
            />
          </div>
        </Card>
        <Card title="队列积压" right="当前" pad={false}>
          <DataTable rows={ops.jobs.backlog} columns={queueColumns} rowKey={(r) => `${r.name}/${r.state}`} empty="队列里没有等待的任务" />
        </Card>
      </div>

      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-ink">费用</h2>
        <span className="text-[12px] text-ink-4">按密钥来源分渠道 · 近 {data.days} 天</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="花费" value={money(costs.totals.cost, costCurrency)} hint={`近 ${data.days} 天`} />
        <Stat label="调用" value={num(costs.totals.calls)} />
        <Stat label="失败" value={num(costs.totals.failed)} tone={costs.totals.failed ? "bad" : undefined} />
        <Stat label="Token" value={`${num(costs.totals.tokensIn)} / ${num(costs.totals.tokensOut)}`} hint="入 / 出" />
      </div>

      <Card title="每日花费趋势" right={`近 ${data.days} 天`} className="mt-4">
        <Bars
          days={costs.trend}
          height="h-28"
          label={`近 ${data.days} 天每日花费`}
          value={(d) => d.cost}
          peak={(max) => money(max, costCurrency)}
          title={(d) => `${d.day}：${money(d.cost, costCurrency)}，调用 ${num(d.calls)}，失败 ${num(d.failed)}`}
        />
      </Card>

      <Card title="按渠道（密钥来源）" right={`近 ${data.days} 天，按花费排序`} className="mt-4" pad={false}>
        <DataTable rows={costs.channels} columns={channelColumns} rowKey={(r) => r.service} empty="这段时间没有模型调用" />
      </Card>

      <Card title="按渠道与模型" right={`近 ${data.days} 天，按花费排序`} className="mt-4" pad={false}>
        <DataTable rows={costs.models} columns={costModelColumns} rowKey={(r) => `${r.service}/${r.model}`} empty="这段时间没有模型调用" />
      </Card>
    </AdminPage>
  );
}
