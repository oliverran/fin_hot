import {readMarket} from './market.ts';
import {readProvider} from './provider.ts';
import {readFundSummary} from './funds.ts';
export async function dataOverview(){
 const [market,provider,funds]=await Promise.all([readMarket(),readProvider(),readFundSummary()]);
 const clues=market?[...market.industries.filter(x=>x.change!==null).sort((a,b)=>Math.abs(b.change!)-Math.abs(a.change!)).slice(0,3).map(x=>`${market.date} ${x.name}涨跌幅 ${x.change!.toFixed(2)}%，核对同期政策、公告与报道。`),...market.etfs.filter(x=>x.change!==null).sort((a,b)=>Math.abs(b.change!)-Math.abs(a.change!)).slice(0,3).map(x=>`${market.date} ${x.name}份额变化 ${x.change!.toFixed(2)}%，先核查拆分与申赎口径。`)]:[];
 return {updatedAt:provider?.updatedAt,expectedDate:provider?.expectedDate,errors:provider?.errors??[],marketDate:market?.date,funds,clues};
}
