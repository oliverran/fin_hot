import { useEffect,useState } from 'react';
import { Link,useLocation } from 'react-router';
import type { MarketDay } from '../backend/market.ts';
export const formatPercent=(n:number|null)=>n===null?'—':`${n.toFixed(2)}%`;
export default function MarketCard(){
 const {pathname}=useLocation();
 const active=/^\/daily(?:\/\d{4}-\d{2}-\d{2})?\/?$/.test(pathname);
 const before=pathname.match(/^\/daily\/(\d{4}-\d{2}-\d{2})/)?.[1];
 const [data,setData]=useState<MarketDay|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{setData(null);setFailed(false);if(!active)return;const c=new AbortController();fetch('/api/chronicle/market'+(before?'?before='+before:''),{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(setData).catch(()=>{if(!c.signal.aborted)setFailed(true)});return()=>c.abort();},[active,before]);
 if(!active)return null;
 return <aside className="card mx-auto my-4 max-w-5xl p-4" aria-label="市场背景"><h2 className="font-bold">{before?'此前市场背景':'最新市场背景（独立于日报）'}</h2>{data?<><p className="text-sm text-ink-3">交易日 {data.date} · 统计覆盖 {data.breadth.count} 只证券 · 数据后续修订可能更新</p><div className="mt-2 flex flex-wrap gap-4"><span>上涨 {data.breadth.up}</span><span>下跌 {data.breadth.down}</span><span>中位数 {formatPercent(data.breadth.median)}</span><span>成交额 {data.breadth.turnover===null?'—':(data.breadth.turnover/1e8).toFixed(0)+' 亿元'}</span></div><p className="mt-2 text-sm">{data.indices.map(x=>`${x.name} ${formatPercent(x.change)}`).join(' · ')}</p></>:<p className="text-sm">{failed?'市场背景读取失败':'暂无已同步市场背景'}</p>}<Link className="mt-2 block text-sm text-accent" to="/chronicle/market">查看行业、ETF 与两融 →</Link></aside>;
}
