import {allRows,requestData,finite,providerDate,type DataRequest} from './data-client.ts';
import {readProvider} from './provider.ts';
import {saveSnapshot,readSnapshot} from './snapshots.ts';
export interface CompanyRecord {code:string;name:string;industry:string;date:string|null;pe:number|null;pb:number|null;dividendYield:number|null;marketValue:number|null}
export interface CompanySnapshot {updatedAt:string;records:CompanyRecord[]}
export async function refreshCompanies(request:DataRequest=requestData){
 const provider=await readProvider();if(!provider?.expectedDate)throw Error('No calendar');
 const date=provider.expectedDate;
 const names=await allRows('stock_basic',{list_status:'L'},request);
 const metrics=await allRows('daily_basic',{trade_date:date.replaceAll('-','')},request);
 if(!names.length||!metrics.length)throw Error('Empty company data');
 if(metrics.some(r=>providerDate(r.trade_date)!==date))throw Error('Wrong company data date');
 const byCode=new Map(metrics.map(r=>[String(r.ts_code),r]));
 const records=names.map(r=>{const d=byCode.get(String(r.ts_code));return {code:String(r.ts_code),name:String(r.name),industry:String(r.industry??''),date:d?date:null,pe:finite(d?.pe_ttm),pb:finite(d?.pb),dividendYield:finite(d?.dv_ttm),marketValue:finite(d?.total_mv)};});
 const snapshot={updatedAt:new Date().toISOString(),records};await saveSnapshot('companies',snapshot);return snapshot;
}
export async function findCompanies(query:string){const snapshot=await readSnapshot<CompanySnapshot>('companies');const q=query.trim().toUpperCase();return {updatedAt:snapshot?.updatedAt??null,items:q?(snapshot?.records??[]).filter(r=>r.code.includes(q)||r.name.includes(query.trim())).slice(0,20):[]};}
