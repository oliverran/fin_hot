import { useEffect,useState } from 'react';
import { Link } from 'react-router';
import { Canvas } from '../chart.tsx';
import type { ProviderSnapshot } from '../../backend/provider.ts';
import { percentile,periodReturn,monthReturns } from '../../analytics.ts';
const pct=(v:number|null)=>v===null?'—':v.toFixed(2)+'%';
export default function SectorData(){
 const [data,setData]=useState<ProviderSnapshot|null>(null),[loaded,setLoaded]=useState(false),[error,setError]=useState(false),[selected,setSelected]=useState('');
 useEffect(()=>{const c=new AbortController();fetch('/api/chronicle/provider',{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(v=>{setData(v);setLoaded(true)}).catch(()=>{if(!c.signal.aborted)setError(true)});return()=>c.abort()},[]);
 const sectors=data?.indices.filter(x=>x.classification==='SW2021-L1')??[];
 const end=data?.expectedDate,calendar=data?.calendar??[];
 const benchmark=data?.indices.find(x=>x.code==='000300.SH');
 const benchmark20=benchmark&&end?periodReturn(benchmark,calendar,end,20):null;
 const rows=sectors.map(x=>({x,r20:end?periodReturn(x,calendar,end,20):null})).sort((a,b)=>(b.r20??-Infinity)-(a.r20??-Infinity));
 const current=data?.indices.find(x=>x.code===selected)??sectors[0]??data?.indices[0];
 const months=new Map<string,string>();for(const day of calendar.filter(d=>end&&d<=end))months.set(day.slice(0,7),day);
 const endpoints=[...months.values()].slice(-13);
 return <main className="pb-12"><Link to="/chronicle">← 编年史</Link><h1 className="mt-4 text-3xl font-bold">申万行业轮动与估值</h1><p className="mt-3">统一申万 2021 版一级行业，历史覆盖从 2021 年起；宽基保留 2020 年起历史。缺失和未更新的行业不参与同期排名。</p>
 {error?<p role="alert">数据读取失败，请刷新重试。</p>:!loaded?<p>正在读取…</p>:!data?<p>尚未同步数据。</p>:<><p className="mt-4 text-sm">来源：{data.source} · 最近同步：{data.updatedAt} · 应有交易日：{end??'日历不可用'}</p>{data.errors?.length? <p role="status">{data.errors.join('；')}</p>:null}
 <h2 className="mt-6 text-xl font-bold">行业表现与历史估值分位</h2><p className="text-sm">统一交易日计算。PE 与 PB 分位使用近五年已取得正值观测，至少 252 条；PE 采用申万接口口径，不标为 PE-TTM。超额为同期涨幅减沪深 300 涨幅（百分点）。</p>
 <div className="overflow-x-auto"><table className="my-4 w-full text-left text-sm"><thead><tr><th>行业</th><th>截至</th><th>1日</th><th>5日</th><th>20日</th><th>60日</th><th>20日超额</th><th>PE分位</th><th>PB分位</th></tr></thead><tbody>{rows.map(({x,r20})=><tr key={x.code}><th><button className="text-accent" onClick={()=>setSelected(x.code)}>{x.name}</button></th><td>{x.bars.at(-1)?.date??'缺失'}</td>{[1,5,20,60].map(n=><td key={n}>{pct(end?periodReturn(x,calendar,end,n):null)}</td>)}<td>{r20!==null&&benchmark20!==null?(r20-benchmark20).toFixed(2):'—'}</td><td>{pct(end?percentile(x.valuations,'pe',end):null)}</td><td>{pct(end?percentile(x.valuations,'pb',end):null)}</td></tr>)}</tbody></table></div>
 <h2 className="mt-6 text-xl font-bold">最近十二个月轮动</h2><p className="text-sm">末列为当月截至应有交易日；各行业必须具有相同月末端点，缺失留空。</p><div className="overflow-x-auto"><table className="my-4 w-full text-sm"><thead><tr><th>行业</th>{endpoints.slice(1).map(d=><th key={d}>{d.slice(0,7)}</th>)}</tr></thead><tbody>{sectors.map(x=><tr key={x.code}><th>{x.name}</th>{monthReturns(x,endpoints).map((v,i)=><td key={i} style={{background:v===null?'transparent':v>=0?'rgba(179,64,42,0.12)':'rgba(47,125,92,0.12)'}}>{pct(v)}</td>)}</tr>)}</tbody></table></div>
 <label className="block mt-6">查看走势 <select value={current?.code??''} onChange={e=>setSelected(e.target.value)}>{data.indices.map(x=><option value={x.code} key={x.code}>{x.name}</option>)}</select></label>
 {current&&<section className="card mt-4 p-4"><h2 className="text-xl font-bold">{current.name}</h2><p className="text-sm">行情覆盖 {current.bars[0]?.date??'缺失'} — {current.bars.at(-1)?.date??'缺失'} {end&&current.bars.at(-1)?.date!==end?'· 未更新到应有交易日':''}</p>{current.error&&<p>{current.error}</p>}{current.bars.length>0&&<div className="h-[360px]"><Canvas data={{meta:{id:current.code,name:current.name,type:'line'},series:current.bars.map(b=>({date:b.date,value:b.close}))}}/></div>}
 <p>{current.peBasis??'PE'}：{current.valuations.at(-1)?.pe??'缺失'} · PB：{current.valuations.at(-1)?.pb??'缺失'} · 估值日期 {current.valuations.at(-1)?.date??'缺失'}</p></section>}
 </>}
 </main>;
}
