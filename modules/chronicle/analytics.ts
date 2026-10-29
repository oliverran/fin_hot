import type { ProviderIndex } from './backend/provider.ts';
export function percentile(rows:Array<{date:string;pe:number|null;pb:number|null}>,key:'pe'|'pb',asOf:string):number|null {
 const start=new Date(Date.parse(asOf)-5*365.25*86400000).toISOString().slice(0,10);
 const values=rows.filter(r=>r.date>=start&&r.date<=asOf).map(r=>r[key]).filter((v):v is number=>v!==null&&Number.isFinite(v)&&v>0);
 const current=rows.find(r=>r.date===asOf)?.[key];
 if(values.length<252||current===null||current===undefined)return null;
 return values.filter(v=>v<=current).length/values.length*100;
}
export function periodReturn(index:ProviderIndex,calendar:string[],end:string,count:number):number|null {
 const at=calendar.indexOf(end);if(at<count)return null;
 const first=index.bars.find(b=>b.date===calendar[at-count]),last=index.bars.find(b=>b.date===end);
 return first&&last?(last.close/first.close-1)*100:null;
}
export function monthReturns(index:ProviderIndex,endpoints:string[]):Array<number|null>{
 return endpoints.slice(1).map((end,i)=>{const first=index.bars.find(b=>b.date===endpoints[i]),last=index.bars.find(b=>b.date===end);return first&&last?(last.close/first.close-1)*100:null;});
}
