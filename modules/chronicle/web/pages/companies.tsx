import {useState,useEffect} from 'react';
import {Link,useSearchParams} from 'react-router';
import type {CompanyRecord} from '../../backend/companies.ts';
export default function Companies(){
 const [params,setParams]=useSearchParams();const query=params.get('q')??'';
 const [draft,setDraft]=useState(query),[items,setItems]=useState<CompanyRecord[]>([]),[state,setState]=useState('');
 useEffect(()=>{if(!query){setItems([]);return;}const c=new AbortController();setState('正在查询…');fetch('/api/chronicle/companies?q='+encodeURIComponent(query),{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{setItems(d.items);setState(d.updatedAt?(d.items.length?'':'没有匹配证券'):'数据尚未同步');}).catch(()=>{if(!c.signal.aborted)setState('读取失败')});return()=>c.abort()},[query]);
 return <main className="pb-12"><Link to="/chronicle">← A股编年史</Link><h1 className="mt-4 text-3xl font-bold">上市公司背景卡</h1><p className="mt-3">按证券代码或名称查询，数据来自已同步快照；不根据新闻中的模糊名称自动猜测上市主体。</p><form className="my-5 flex gap-3" onSubmit={e=>{e.preventDefault();setParams({q:draft})}}><label>公司或代码 <input value={draft} maxLength={60} onChange={e=>setDraft(e.target.value)}/></label><button className="text-accent">查询</button></form><p role="status">{state}</p><div className="grid gap-4 sm:grid-cols-2">{items.map(x=><section key={x.code} className="card p-4"><h2 className="font-bold">{x.name} {x.code}</h2><p>供应商行业：{x.industry} · 指标日期 {x.date??'缺失'}</p><p>PE-TTM {x.pe??'—'} · PB {x.pb??'—'}</p><p>股息率TTM {x.dividendYield===null?'—':x.dividendYield.toFixed(2)+'%'} · 总市值 {x.marketValue===null?'—':(x.marketValue/10000).toFixed(2)+'亿元'}</p><Link className="text-accent" to={'/all?q='+encodeURIComponent(x.name)}>检索站内相关报道 →</Link></section>)}</div></main>;
}
