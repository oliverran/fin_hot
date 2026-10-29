import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allRows,providerDate } from '../backend/data-client.ts';
import { expectedTradingDate,syncStart,type ProviderIndex } from '../backend/provider.ts';
import { marketBreadth } from '../backend/market.ts';
import { eligibleFund,productGroup,fundSummary,type FundSnapshot } from '../backend/funds.ts';
import { percentile,periodReturn } from '../analytics.ts';

test('分页发现接口忽略 offset 时停止，不发布重复数据',async()=>{
 let calls=0;await assert.rejects(()=>allRows('stub',{},async()=>{calls++;return Array.from({length:1000},(_,i)=>({id:i}));}),/did not advance/);assert.equal(calls,2);
});
test('交易日历跨假期和盘后时点决定应有日期',()=>{
 const calendar=['2026-09-30','2026-10-09','2026-10-12'];
 assert.equal(expectedTradingDate(calendar,new Date('2026-10-08T12:00:00Z')),'2026-09-30');
 assert.equal(expectedTradingDate(calendar,new Date('2026-10-09T09:00:00Z')),'2026-09-30');
 assert.equal(expectedTradingDate(calendar,new Date('2026-10-09T12:00:00Z')),'2026-10-09');
});
test('同步只回补近期，跨月重新核对完整历史',()=>{
 const index:ProviderIndex={code:'x',name:'x',kind:'broad',bars:[{date:'2026-10-28',close:100}],valuations:[],lastFullSync:'2026-10-01'};
 assert.equal(syncStart(index,new Date('2026-10-29T12:00:00Z'),'2020-01-01'),'2026-10-21');
 assert.equal(syncStart(index,new Date('2026-11-02T12:00:00Z'),'2020-01-01'),'2020-01-01');
});
test('宽度只统计有效收益，成交额缺失不按零计',()=>{
 assert.deepEqual(marketBreadth([{pct_chg:2,amount:10},{pct_chg:-1,amount:20},{pct_chg:0,amount:30}]),{count:3,up:1,down:1,flat:1,median:0,turnover:60000});
 assert.equal(marketBreadth([{pct_chg:2,amount:null}]).turnover,null);
 assert.throws(()=>providerDate('20260230'));
});
test('估值样本不足和非共同端点不会生成分位或回报',()=>{
 assert.equal(percentile([{date:'2026-10-29',pe:10,pb:1}],'pe','2026-10-29'),null);
 assert.equal(periodReturn({code:'x',name:'x',kind:'sector',bars:[{date:'2026-10-29',close:100}],valuations:[]},['2026-10-28','2026-10-29'],'2026-10-29',1),null);
});
test('基金过滤被动产品，公告日隔离未来持仓，份额类别不重复计数',()=>{
 assert.equal(eligibleFund({status:'L',market:'O',fund_type:'混合型',name:'测试指数增强',invest_type:'混合型'}),false);
 assert.equal(productGroup('测试混合-A','基金公司'),productGroup('测试混合-C','基金公司'));
 const group=productGroup('测试混合-A','基金公司');
 const data:FundSnapshot={period:'20260930',catalogAt:'2026-10-29',updatedAt:'2026-10-29',members:['a','c'].map(code=>({code,name:code,manager:'m',group,found:null})),observations:['a','c'].map(code=>({code,state:'reported',checkedAt:'2026-10-29',holdings:[{symbol:'600000.SH',announced:'2026-10-28',weight:10,value:100},{symbol:'600001.SH',announced:'2026-10-30',weight:5,value:50}]}))};
 const summary=fundSummary(data,'2026-10-29');assert.equal(summary.products,1);assert.equal(summary.leaders.length,1);assert.equal(summary.leaders[0]!.products,1);
});
