import type {dataOverview} from '../backend/data-overview.ts';
export default function DataOverview({data}:{data:unknown}){
 const value=data as Awaited<ReturnType<typeof dataOverview>>;
 return <section className="card mt-5 p-4"><h2 className="text-lg font-bold">Pro 数据覆盖与待核查线索</h2><p>应有交易日：{value.expectedDate??'未知'} · 市场快照：{value.marketDate??'缺失'} · 最近同步：{value.updatedAt??'尚未同步'}</p>{value.errors.map(e=><p key={e}>{e}</p>)}{value.funds&&<p>基金批次：{value.funds.processed}/{value.funds.total}，失败 {value.funds.failed}</p>}<p className="mt-3 text-sm">以下仅按当日变化幅度排序供人工核查，不自动发布、推送或改变新闻评分。</p><ul className="mt-2 list-disc pl-5">{value.clues.map(x=><li key={x}>{x}</li>)}</ul></section>;
}
