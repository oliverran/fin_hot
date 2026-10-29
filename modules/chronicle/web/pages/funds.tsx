import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import type {fundSummary} from '../../backend/funds.ts';
type Summary=ReturnType<typeof fundSummary>;
export default function FundsPage(){
 const [data,setData]=useState<Summary|null>(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{const c=new AbortController();fetch('/api/chronicle/funds',{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{setData(d);setLoaded(true)}).catch(()=>{if(!c.signal.aborted)setFailed(true)});return()=>c.abort();},[]);
 return <main className="pb-12"><Link to="/chronicle">← 编年史</Link><h1 className="mt-4 text-3xl font-bold">公募披露持仓与共识</h1><p className="mt-4">范围：在运作的场外股票型及混合型公募，剔除名称或投资类型标明指数、ETF、联接、增强的产品；分类依赖供应商标签，不能保证识别所有被动产品。</p><p className="mt-2 text-sm text-ink-3">A/C 等份额按基金公司与标准化名称近似归组，每组仅取一份已披露组合，避免份额类别重复计数。披露范围随报告类型不同，不视为完整实时仓位；本页不做组合回测。</p>
 {failed?<p role="alert">读取失败，请重试。</p>:!loaded?<p>正在读取…</p>:!data?<p>尚未启动批量同步。</p>:<><section className="card my-5 p-4"><h2 className="font-bold">报告期 {data.period} · 截至 {data.asOf} 已公开</h2><p>基金份额代码 {data.total} 个；已处理 {data.processed}；待处理 {data.total-data.processed}</p><p>有披露 {data.reported}；暂无披露 {data.empty}；同步失败 {data.failed}；可统计产品组 {data.products}</p><p className="text-sm">分批同步期间排名会变化，不能当作全市场结论。公告日期晚于当前日期的持仓不参与统计。</p></section>
 <h2 className="text-xl font-bold">已披露样本的共同持仓</h2><div className="overflow-x-auto"><table className="mt-4 w-full text-left"><thead><tr><th>证券代码</th><th>持有产品组</th><th>样本占比</th><th>持有者平均股票市值占比</th></tr></thead><tbody>{data.leaders.map(x=><tr key={x.symbol}><td>{x.symbol}</td><td>{x.products}</td><td>{x.share?.toFixed(1)??'—'}%</td><td>{x.averageWeight?.toFixed(2)??'—'}%</td></tr>)}</tbody></table></div></>}
 </main>;
}
