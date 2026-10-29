import { allRows, requestData, finite, providerDate, compactDate, type DataRequest, type DataRow } from './data-client.ts';
import { readProvider } from './provider.ts';
import { readSnapshot, saveSnapshot } from './snapshots.ts';
export interface MarketDay {
 date: string; observedAt: string;
 breadth: { count: number; up: number; down: number; flat: number; median: number | null; turnover: number | null };
 indices: Array<{name:string;change:number|null}>;
 industries: Array<{name:string;change:number|null}>;
 margin: Array<{exchange:string;balance:number|null;buy:number|null;repay:number|null}>;
 etfs: Array<{code:string;name:string;shares:number;previous:number|null;change:number|null}>;
 errors: string[];
}
export interface MarketSnapshot { updatedAt: string; days: MarketDay[] }
export function marketBreadth(rows: DataRow[]) {
 const values=rows.map(r=>finite(r.pct_chg)).filter((n):n is number=>n!==null).sort((a,b)=>a-b);
 const amounts=rows.map(r=>finite(r.amount));
 const middle=Math.floor(values.length/2);
 return {count:values.length,up:values.filter(n=>n>0).length,down:values.filter(n=>n<0).length,flat:values.filter(n=>n===0).length,
 median:values.length?(values.length%2?values[middle]!:(values[middle-1]!+values[middle]!)/2):null,
 turnover:amounts.length&&amounts.every(n=>n!==null)?amounts.reduce<number>((a,b)=>a+b!,0)*1000:null};
}
export async function refreshMarket(request: DataRequest=requestData):Promise<MarketSnapshot> {
 const provider=await readProvider();
 if(!provider?.expectedDate||!provider.calendar?.length)throw Error('Trading calendar is required');
 const previous=await readSnapshot<MarketSnapshot>('market');
 const days=new Map((previous?.days??[]).map(d=>[d.date,d]));
 const dates=provider.calendar.filter(d=>d<=provider.expectedDate!).slice(-5);
 const names=new Map<string,string>();
 try{for(const r of await allRows('fund_basic',{market:'E'},request))names.set(String(r.ts_code),String(r.name));}catch{/* Tickers remain visible when the name catalog is unavailable. */}
 for(const date of dates){
  const errors:string[]=[];
  const read=async(api:string,day:string)=>{try{const rows=await allRows(api,{trade_date:compactDate(day)},request);if(rows.some(r=>providerDate(r.trade_date)!==day))throw Error('Wrong date');return rows;}catch{errors.push(`${api} ${day} 不可用`);return [];}};
  const stocks=await read('daily',date);
  if(!stocks.length){continue;} // Never replace an existing day with an empty provider response.
  const marginRows=await read('margin',date), shares=await read('fund_share',date);
  const prevDate=provider.calendar.filter(d=>d<date).at(-1);
  const prior=prevDate?await read('fund_share',prevDate):[];
  const priorByCode=new Map(prior.map(r=>[String(r.ts_code),finite(r.fd_share)]));
  const etfs=shares.filter(r=>r.fund_type==='ETF').flatMap(r=>{
    const value=finite(r.fd_share);if(value===null||value<0)return [];
    const previous=priorByCode.get(String(r.ts_code))??null;
    return [{code:String(r.ts_code),name:names.get(String(r.ts_code))??String(r.ts_code),shares:value,previous,change:previous!==null&&previous>0?(value/previous-1)*100:null}];
  });
  const performance=(kind:string)=>provider.indices.filter(x=>x.kind===kind).flatMap(x=>{
    const at=x.bars.findIndex(b=>b.date===date);
    if(at<1||x.bars[at-1]!.date!==prevDate)return [];
    return [{name:x.name,change:(x.bars[at]!.close/x.bars[at-1]!.close-1)*100}];
  });
  const day:MarketDay={date,observedAt:new Date().toISOString(),breadth:marketBreadth(stocks),indices:performance('broad'),industries:performance('sector'),
    margin:marginRows.map(r=>({exchange:String(r.exchange_id),balance:finite(r.rzye),buy:finite(r.rzmre),repay:finite(r.rzche)})),etfs,errors};
  days.set(date,day);
 }
 const snapshot={updatedAt:new Date().toISOString(),days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))};
 await saveSnapshot('market',snapshot);return snapshot;
}
export async function readMarket(before?:string) {
 const data=await readSnapshot<MarketSnapshot>('market');
 return data?.days.filter(d=>!before||d.date<before).at(-1)??null;
}
