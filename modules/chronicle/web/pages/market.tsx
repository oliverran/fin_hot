import {useEffect,useState} from 'react';
import {Link} from 'react-router';
import type {MarketDay} from '../../backend/market.ts';
import {formatPercent} from '../market-card.tsx';
export default function MarketPage(){
 const [data,setData]=useState<MarketDay|null>(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{const c=new AbortController();fetch('/api/chronicle/market',{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{setData(d);setLoaded(true)}).catch(()=>{if(!c.signal.aborted)setFailed(true)});return()=>c.abort();},[]);
 const etfs=data?.etfs.filter(x=>x.change!==null).sort((a,b)=>Math.abs(b.change!)-Math.abs(a.change!)).slice(0,30)??[];
 return <main className="pb-12"><Link to="/chronicle">← 编年史</Link><h1 className="mt-4 text-3xl font-bold">市场背景、ETF 与两融</h1>{failed?<p role="alert">读取失败，请重试。</p>:!loaded?<p>正在读取…</p>:!data?<p>尚未同步。</p>:<>
 <p className="mt-3">交易日 {data.date} · 来源：Tushare Pro 配置服务 · 最近读取 {data.observedAt}</p>
 {data.errors.length>0&&<p role="status">部分数据缺失：{data.errors.join('；')}</p>}
 <section className="card mt-5 p-4"><h2 className="text-xl font-bold">市场宽度</h2><p>有涨跌幅记录 {data.breadth.count} 只：上涨 {data.breadth.up} / 下跌 {data.breadth.down} / 平盘 {data.breadth.flat}</p><p>中位数涨跌幅 {formatPercent(data.breadth.median)}；成交额 {data.breadth.turnover===null?'缺失':(data.breadth.turnover/1e8).toFixed(2)+' 亿元'}</p><p className="text-sm text-ink-3">以接口当日返回的 A 股记录为样本，停牌或缺报证券不计入；不是指数加权收益。</p></section>
 <section className="card mt-5 p-4"><h2 className="text-xl font-bold">行业当日表现</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[...data.industries].sort((a,b)=>(b.change??0)-(a.change??0)).map(x=><p key={x.name}>{x.name} {formatPercent(x.change)}</p>)}</div></section>
 <section className="card mt-5 p-4"><h2 className="text-xl font-bold">融资观察</h2><p className="text-sm">交易所数据可能晚于行情披露；只显示上述交易日已返回的市场，不将缺失交易所计为零。</p><table className="mt-3 w-full text-left"><thead><tr><th>交易所</th><th>融资余额（亿元）</th><th>买入减偿还（亿元）</th></tr></thead><tbody>{data.margin.map(x=><tr key={x.exchange}><td>{x.exchange}</td><td>{x.balance===null?'—':(x.balance/1e8).toFixed(2)}</td><td>{x.buy===null||x.repay===null?'—':((x.buy-x.repay)/1e8).toFixed(2)}</td></tr>)}</tbody></table>{!data.margin.length&&<p>暂无该日两融数据。</p>}</section>
 <section className="card mt-5 p-4"><h2 className="text-xl font-bold">ETF 份额变化</h2><p className="text-sm">覆盖 {data.etfs.length} 只，展示变化幅度最大的 30 只；与上一交易日比较。份额变化不是资金净流入，拆分等公司行为需核查。</p><div className="overflow-x-auto"><table className="mt-3 w-full text-left"><thead><tr><th>ETF</th><th>份额（万份）</th><th>份额变化</th></tr></thead><tbody>{etfs.map(x=><tr key={x.code}><td>{x.name} <small>{x.code}</small></td><td>{x.shares.toFixed(2)}</td><td>{formatPercent(x.change)}</td></tr>)}</tbody></table></div></section>
 </>}</main>;
}
