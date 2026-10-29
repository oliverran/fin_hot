import { beijingDate } from '@aihot/contracts/time';
import { allRows, requestData, providerDate, finite, type DataRequest, type DataRow } from './data-client.ts';
import { readSnapshot, saveSnapshot } from './snapshots.ts';
export interface FundMember {code:string;name:string;manager:string;group:string;found:string|null}
export interface Holding {symbol:string;announced:string;weight:number|null;value:number|null}
export interface FundObservation {code:string;state:'reported'|'empty'|'error';checkedAt:string;holdings:Holding[]}
export interface FundSnapshot {period:string;catalogAt:string;updatedAt:string;members:FundMember[];observations:FundObservation[]}
export function eligibleFund(row:DataRow):boolean {
 return row.status==='L' && row.market==='O' && /股票|混合/.test(String(row.fund_type))
  && !/指数|ETF|联接|被动|增强/.test(`${row.name} ${row.invest_type}`);
}
/** Provider does not supply a parent portfolio id; display this grouping explicitly as a name-based approximation. */
export function productGroup(name:string,manager:string):string {
 return `${manager}:${name.replace(/[-（(]?(?:[A-IZR]|人民币|美元|港币)(?:类|份额)?[）)]?$/u,'').trim()}`;
}
export function latestQuarter(today:string):string {
 const at=new Date(`${today}T00:00:00Z`),month=at.getUTCMonth();
 return new Date(Date.UTC(at.getUTCFullYear(),Math.floor(month/3)*3,0)).toISOString().slice(0,10).replaceAll('-','');
}
export async function refreshFunds(request:DataRequest=requestData, now=new Date(), batch=30):Promise<FundSnapshot> {
 const today=beijingDate(now),period=latestQuarter(today),old=await readSnapshot<FundSnapshot>(`funds-${period}`);
 let members=old?.members??[],catalogAt=old?.catalogAt??'';
 if(!members.length||Date.parse(today)-Date.parse(catalogAt)>7*86400000){
   const rows=await allRows('fund_basic',{market:'O',status:'L'},request);
   members=rows.filter(eligibleFund).map(row=>({code:String(row.ts_code),name:String(row.name),manager:String(row.management),
     group:productGroup(String(row.name),String(row.management)),found:row.found_date?providerDate(row.found_date):null})).filter(x=>!x.found||x.found.replaceAll('-','')<=period).sort((a,b)=>a.code.localeCompare(b.code));
   if(!members.length)throw Error('No eligible funds returned');catalogAt=today;
 }
 const observations=new Map((old?.observations??[]).map(o=>[o.code,o]));
 const due=members.filter(m=>!observations.has(m.code)||Date.parse(today)-Date.parse(observations.get(m.code)!.checkedAt)>86400000*7)
   .sort((a,b)=>(observations.get(a.code)?.checkedAt??'').localeCompare(observations.get(b.code)?.checkedAt??'')).slice(0,batch);
 const snapshot:FundSnapshot={period,catalogAt,updatedAt:now.toISOString(),members,observations:[...observations.values()]};
 for(const member of due){
  try{
   const rows=await allRows('fund_portfolio',{ts_code:member.code,period},request);
   if(rows.some(r=>r.ts_code!==member.code||String(r.end_date)!==period))throw Error('Provider ignored fund or period');
   const valid=rows.filter(r=>providerDate(r.ann_date)<=today);
   const bySymbol=new Map<string,Holding>();
   for(const row of valid){const holding={symbol:String(row.symbol),announced:providerDate(row.ann_date),weight:finite(row.stk_mkv_ratio),value:finite(row.mkv)};
    const prev=bySymbol.get(holding.symbol);if(!prev||prev.announced<=holding.announced)bySymbol.set(holding.symbol,holding);}
   observations.set(member.code,{code:member.code,state:bySymbol.size?'reported':'empty',checkedAt:now.toISOString(),holdings:[...bySymbol.values()]});
  }catch{const previous=observations.get(member.code);observations.set(member.code,{code:member.code,state:'error',checkedAt:now.toISOString(),holdings:previous?.holdings??[]});}
  snapshot.observations=[...observations.values()];await saveSnapshot(`funds-${period}`,snapshot);
 }
 await saveSnapshot('funds',snapshot);return snapshot;
}
export function fundSummary(data:FundSnapshot, asOf:string) {
 const groups=new Map<string,{member:FundMember;observation:FundObservation}>();
 const members=new Map(data.members.map(m=>[m.code,m]));
 for(const observation of data.observations){
  const member=members.get(observation.code);if(!member)continue;
  const holdings=observation.holdings.filter(h=>h.announced<=asOf);if(!holdings.length)continue;
  if(!groups.has(member.group))groups.set(member.group,{member,observation:{...observation,holdings}});
 }
 const stocks=new Map<string,{symbol:string;products:number;weightSum:number;weightCount:number}>();
 for(const {observation} of groups.values())for(const h of observation.holdings){const row=stocks.get(h.symbol)??{symbol:h.symbol,products:0,weightSum:0,weightCount:0};row.products++;if(h.weight!==null){row.weightSum+=h.weight;row.weightCount++;}stocks.set(h.symbol,row);}
 return {period:data.period,asOf,updatedAt:data.updatedAt,total:data.members.length,processed:data.observations.filter(o=>members.has(o.code)).length,
 reported:data.observations.filter(o=>o.state==='reported'&&members.has(o.code)).length,empty:data.observations.filter(o=>o.state==='empty'&&members.has(o.code)).length,
 failed:data.observations.filter(o=>o.state==='error'&&members.has(o.code)).length,products:groups.size,
 leaders:[...stocks.values()].sort((a,b)=>b.products-a.products||a.symbol.localeCompare(b.symbol)).slice(0,50).map(r=>({symbol:r.symbol,products:r.products,share:groups.size?r.products/groups.size*100:null,averageWeight:r.weightCount?r.weightSum/r.weightCount:null}))};
}
export async function readFundSummary(asOf=beijingDate(new Date())) {const data=await readSnapshot<FundSnapshot>('funds');return data?fundSummary(data,asOf):null;}
