// 后台「费用看板」页：窗口内模型调用按渠道（调用用的密钥来源）与模型的 token 与费用。
// 数据来自 /api/admin/costs（server.ts 的 adminHandler 守卫），页面自身不落任何数据。
// 模块的后台页没有 +types 产物，props 自己声明。
import { SITE } from "@aihot/site";
import type { AdminCostChannel, AdminCostModel, AdminCosts } from "@aihot/contracts/admin";
import { adminGet } from "@aihot/web/lib/admin.server";
import { money, num } from "@aihot/web/features/admin/format";
import { AdminPage, Card, DataTable, FilterChips, Stat, type Column } from "@aihot/web/features/admin/ui";

export async function loader({ request }: { request: Request }): Promise<AdminCosts> {
  const days = new URL(request.url).searchParams.get("days") ?? "14";
  return adminGet<AdminCosts>(request, `/api/admin/costs?days=${encodeURIComponent(days)}`);
}

export const meta = () => [{ title: `费用看板 · ${SITE.name} 后台` }];

/** 一排柱子：高度按当天的花费取，悬停看当天的详情。 */
function Bars({ days, currency }: { days: AdminCosts["trend"]; currency: string }) {
  const max = Math.max(1e-9, ...days.map((d) => d.cost));
  return (
    <figure>
      <div className="flex items-stretch gap-[3px] h-28" role="img" aria-label={`近 ${days.length} 天每日花费`}>
        {days.map((d) => (
          <div key={d.day} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.day}：${money(d.cost, currency)}，调用 ${d.calls}，失败 ${d.failed}`}>
            <div className="w-full rounded-mark bg-accent/70 transition-colors group-hover:bg-accent" style={{ height: `${(d.cost / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-ink-4">
        <span className="num">{days[0]?.day}</span>
        <span>峰值 {money(max, currency)}</span>
        <span className="num">{days.at(-1)?.day}</span>
      </figcaption>
    </figure>
  );
}

export default function AdminCosts({ loaderData }: { loaderData: AdminCosts }) {
  const data = loaderData;
  const currency = data.totals.currency ?? "CNY";

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
    { key: "cost", label: "花费", align: "right", render: (r) => money(r.cost, r.currency ?? currency) },
  ];

  const modelColumns: Array<Column<AdminCostModel>> = [
    { key: "service", label: "渠道", render: (r) => <span className="font-mono text-[12.5px] text-ink">{r.service}</span> },
    { key: "model", label: "模型", render: (r) => <span className="break-all font-mono text-[12.5px]">{r.model}</span> },
    { key: "calls", label: "调用", align: "right", render: (r) => num(r.calls) },
    { key: "failed", label: "失败", align: "right", render: (r) => (r.failed ? <span className="text-hot">{num(r.failed)}</span> : num(0)) },
    { key: "tokensIn", label: "入 token", align: "right", render: (r) => num(r.tokensIn) },
    { key: "tokensOut", label: "出 token", align: "right", render: (r) => num(r.tokensOut) },
    { key: "tokensCached", label: "命中缓存", align: "right", render: (r) => num(r.tokensCached) },
    { key: "unpriced", label: "未定价", align: "right", render: (r) => (r.unpriced ? <span className="text-hot" title="这些调用没有单价，金额未计入">{num(r.unpriced)}</span> : num(0)) },
    { key: "cost", label: "花费", align: "right", render: (r) => money(r.cost, r.currency ?? currency) },
  ];

  return (
    <AdminPage
      title="费用看板"
      subtitle="按密钥的来源分渠道：默认模型记作 llm（读 LLM_*），具名预设各用自己的环境变量。服务商没有回传费用的调用按 service_prices 的单价估算，没有单价的记为未定价。"
      actions={<FilterChips param="days" options={[{ value: "14", label: "近 14 天" }, { value: "30", label: "近 30 天" }, { value: "90", label: "近 90 天" }]} />}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="花费" value={money(data.totals.cost, currency)} hint={`近 ${data.days} 天`} />
        <Stat label="调用" value={num(data.totals.calls)} />
        <Stat label="失败" value={num(data.totals.failed)} tone={data.totals.failed ? "bad" : undefined} />
        <Stat label="Token" value={`${num(data.totals.tokensIn)} / ${num(data.totals.tokensOut)}`} hint="入 / 出" />
      </div>

      <Card title="每日花费趋势" right={`近 ${data.days} 天`} className="mt-4">
        <Bars days={data.trend} currency={currency} />
      </Card>

      <Card title="按渠道" right={`近 ${data.days} 天，按花费排序`} className="mt-4" pad={false}>
        <DataTable rows={data.channels} columns={channelColumns} rowKey={(r) => r.service} empty="这段时间没有模型调用" />
      </Card>

      <Card title="按模型" right={`近 ${data.days} 天，按花费排序`} className="mt-4" pad={false}>
        <DataTable rows={data.models} columns={modelColumns} rowKey={(r) => `${r.service}/${r.model}`} empty="这段时间没有模型调用" />
      </Card>
    </AdminPage>
  );
}
