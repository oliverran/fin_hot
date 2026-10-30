import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LIVE_CHARTS } from '../../catalog.ts';
import { Canvas } from '../chart.tsx';
import type { Screen } from '@aihot/web/components/shell/screens';
export const handle: Screen = {tab:'chronicle',name:'区间复盘'};
type Result = {dates:string[];seriesData:Record<string,number[]>;missing:string[];summaries:Array<{name:string;count:number;change:number|null;drawdown:number|null;volatility:number|null}>;events:Array<{id:string;title:string;date:string;url:string}>};
const choices=LIVE_CHARTS.filter(c=>c.kind==='index');
export default function ComparePage(){
 const [codes,setCodes]=useState(['sh000300','sh000905']);
 const [start,setStart]=useState('2020-01-01'),[end,setEnd]=useState(new Date().toISOString().slice(0,10));
 const [data,setData]=useState<Result|null>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();setData(null);setError('');
 fetch('/api/chronicle/compare?'+new URLSearchParams({codes:codes.join(','),start,end}),{signal:c.signal}).then(r=>{if(!r.ok)throw Error('请选择有效日期和至少一个指数');return r.json();}).then(setData).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[codes,start,end]);
 const pct=(v:number|null)=>v===null?'—':v.toFixed(2)+'%';
 return <main className="pb-14"><Link to="/chronicle" className="text-accent">← A股编年史</Link><h1 className="mt-4 text-3xl font-bold">多指数对比与区间复盘</h1>
 <p className="mt-3 text-sm text-ink-3">按共同交易日对齐，起点归一为 100；价格指数，不含分红再投资。新闻标记表示同期报道，不表示因果关系。</p>
 <fieldset className="mt-5 flex flex-wrap gap-4"><legend>对比指数</legend>{choices.map(c=><label key={c.code}><input type="checkbox" checked={codes.includes(c.code)} onChange={e=>setCodes(e.target.checked?[...codes,c.code]:codes.filter(v=>v!==c.code))}/> {c.indexName}</label>)}</fieldset>
 <div className="my-5 flex flex-wrap gap-4"><label>开始日期 <input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>结束日期 <input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
 {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">正在读取真实数据…</p>}
 {data&&<>{data.missing.length>0&&<p role="status">尚未取得数据：{data.missing.join('、')}。请取消这些指数后对比。</p>}
 {data.dates.length<2?<p>所选区间共同交易日不足，无法计算。</p>:<><p className="text-sm">实际区间：{data.dates[0]} — {data.dates.at(-1)}，{data.dates.length} 个共同交易日</p><div className="h-[420px]" role="img" aria-label="多指数归一化走势"><Canvas data={{meta:{id:'compare',name:'起点 100',type:'multi-line',events:data.events.filter(e=>data.dates.includes(e.date))},series:{dates:data.dates,seriesData:data.seriesData}}}/></div></>}
 <div className="mt-5 grid gap-4 sm:grid-cols-2">{data.summaries.map(s=><section key={s.name} className="card p-4"><h2 className="font-bold">{s.name}</h2><p>区间涨跌幅：{pct(s.change)}</p><p>最大回撤：{pct(s.drawdown)}</p><p>年化波动率：{pct(s.volatility)}</p></section>)}</div>
 <h2 className="mt-8 text-xl font-bold">同期精选新闻</h2><p className="text-sm text-ink-3">按站内时间线日期展示，最多最近 100 条；站点未收录不代表当时没有事件。</p>{data.events.length===0&&<p className="mt-3">此区间暂无已收录新闻。</p>}<ul className="mt-4 space-y-3">{data.events.map(e=><li key={e.id}><time>{e.date}</time> · <a className="text-accent" href={e.url} target="_blank" rel="noreferrer">{e.title}</a></li>)}</ul></>}
 </main>;
}
