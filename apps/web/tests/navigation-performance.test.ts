// Failure modes, fixed before changing public loaders or prefetch:
// - returning to a page that was already open still needs the network;
// - query variants mix content/SEO, or restores lose their anchor;
// - hovering downloads pages, a press no longer loads data or its click asks again, scroll-through touches
//   download it, or a failed prefetch breaks the current page;
// - visits renew deadlines, expired/errors stay cached, or refresh stops working;
// - Agent tabs choose an invalid panel or leave canonical/history behind;
// - search downloads two whole pages, requests before opening, or never retries/updates suggestions.
// Reader work failures fixed before changing enhancement and return-position code:
// - offscreen code downloads/runs immediately, visible code stays plain, or raw copying changes;
// - tiny/linked pictures become zoom buttons, or language changes keep old handlers;
// - a deep return loses its anchor, or folded dates confuse the anchor search.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, after, test } from "node:test";
import { chromium, webkit, expect, type Browser } from "@playwright/test";
import type { ReportDetail } from "@aihot/contracts/site";
import { FIXTURE_AT as at, fakeApi, feedItem, itemDetail, startWebServer, visit, type WebServer } from "./web-server.ts";

const item = feedItem({id:'navigation-fixture',title:'性能检查文章'});
const detail = itemDetail({id:item.id,title:item.title,originalTitle:'Fixture article'});
const codeSource='import json\n\nwith open("data.json") as file:\n    data = json.load(file)\n\nfor record in data:\n    print(record["title"])\n';
const readerBody=Array.from({length:30},(_,i)=>`<p>阅读段落 ${i}：先阅读文章，再查看后面的代码和图片。正文保持可读，图片和代码在需要时增强。</p>`).join('')
  +`<pre><code>${codeSource}</code></pre><pre><code>x = 1</code></pre>`
  +Array.from({length:12},(_,i)=>`<img src="/reader-image/${i}.svg" alt="正文配图 ${i}" width="640" height="360" loading="lazy">`).join('')
  +'<img src="/reader-image/tiny.svg" alt="小图标" width="16" height="16" loading="lazy"><a href="https://example.org"><img src="/reader-image/linked.svg" alt="链接图片" width="640" height="360" loading="lazy"></a>';
const report = (kind:'daily'|'weekly'|'monthly'): ReportDetail => ({kind,key:kind==='daily'?'2026-10-04':kind==='weekly'?'2026-W40':'2026-10',issueNumber:1,title:'Fixture '+kind,generatedAt:at,lead:{title:'Fixture '+kind,leadParagraph:'Fixture report'},leadItemId:null,overview:null,highlights:[],sections:[],flashes:[],cover:null,metrics:{},readingMinutes:1,prev:null,next:null});
const hits: string[] = [];
let suggestionsVersion=1;
let failing='';
let ttl=60;
let web:WebServer;
let origin:string;
let chrome:Browser;
let safari:Browser;
const api=fakeApi((url,res,req)=>{
  const p=url.pathname;
  if(p==='/api/site/meta'||p==='/api/site/track')return;
  hits.push(req.url!);
  if(p===failing){res.statusCode=503;return {code:'unavailable'};}
  if(p==='/api/site/search/suggestions')return {topics:[{slug:'cicc',name:'中金公司',group:'company'}],hot:[{rank:1,title:'建议版本 '+suggestionsVersion,to:'/story/fixture'}]};
  if(p==='/api/site/topics')return {groups:[],topics:[{slug:'cicc',name:'中金公司',group:'company',definition:'Fixture',brand:null,total:0,recent:0,indexable:false,latest:null}]};
  if(p==='/api/site/hot')return {computedAt:at,windowHours:48,entries:[{rank:1,story:{publicId:'fixture',title:'建议版本 '+suggestionsVersion},heat:10,trend:'flat',trendPct:0,badges:[],participantCount:0,sourceCount:0,sourceNames:[],participants:[],spark:[],summary:null,latest:null,cover:null}]};
  if(p==='/api/site/timeline'){
    res.setHeader('X-Accel-Expires','@'+(Math.floor(Date.now()/1000)+ttl));
    const category=url.searchParams.get('category');
    const shown={...item,title:category?'分类 '+category:'性能检查文章'};
    if(url.searchParams.get('tag')==='long-reading'){
      const cards=Array.from({length:180},(_,i)=>({key:'long-'+i,anchorAt:i<60?at:'2026-10-03T08:00:00.000Z',item:{...item,id:'long-'+i,title:'长列表文章 '+i,summary:'用于核实深处阅读返回的固定摘要。'.repeat(3)},group:null}));
      return {filters:{channel:'all',category:null,tag:'long-reading'},cards,nextCursor:null,hot:null,dayCounts:{'2026-10-04':60,'2026-10-03':120}};
    }
    return {filters:{channel:'all',category,tag:null},cards:[{key:shown.id,anchorAt:at,item:shown,group:null}],nextCursor:null,hot:null,dayCounts:{'2026-10-04':1}};
  }
  if(p==='/api/site/pool'){
    const page=Number(url.searchParams.get('page')||1);
    return {filters:{channel:'all',category:null,tag:null,q:null,tab:'time'},items:[{...item,title:'全部第 '+page+' 页'}],page,pageCount:3,total:3,todayCount:1,freshness:at};
  }
  if(p==='/api/site/items/navigation-fixture')return detail;
  if(p==='/api/site/items/navigation-fixture/original')return {...detail,body:{zh:null,original:'<p>Original fixture</p>',zhKind:null,complete:true},bodyLanguage:'original'};
  if(p==='/api/site/items/reader-fixture')return {...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:readerBody}};
  if(p==='/api/site/items/reader-fixture/original')return {...detail,id:'reader-fixture',title:'阅读增强检查',body:{...detail.body,zh:null,original:'<p>Original reader text</p>'},bodyLanguage:'original'};
  if(p.startsWith('/api/site/items/long-'))return {...detail,id:p.split('/').at(-1),title:'长列表详情'};
  const kind=p.match(/^\/api\/site\/reports\/(daily|weekly|monthly)\/latest-page$/)?.[1] as 'daily'|'weekly'|'monthly'|undefined;
  if(kind){const r=report(kind);return {report:r,index:[{key:r.key,issueNumber:1,title:r.title,count:0}]};}
});

before(async()=>{
  // Started together; whatever started is stopped in after() even when another one failed.
  const started=await Promise.allSettled([
    startWebServer(api).then(w=>{web=w;origin=w.origin;}),
    chromium.launch({channel:'chromium'}).then(b=>{chrome=b;}),
    webkit.launch().then(b=>{safari=b;}),
  ]);
  for(const result of started)if(result.status==='rejected')throw result.reason;
});
after(async()=>{
  await chrome?.close();await safari?.close();
  await web?.stop();
});

// One engine per behaviour: WebKit for what phone readers do (iPhone Safari), Chromium for desktop-only
// pointer behaviour such as hover and mouse presses. The router and caches are the same code in both.
test('SSR list and visited query variants return offline without another read',async()=>{
  // Temporary diagnostics: protocol traffic is restricted to this local-fixture test process.
  const debug=createRequire(import.meta.url)('playwright-core/lib/utilsBundle').debug;
  let previousDebug:string|undefined;
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  const nodeGaps:{at:number;gap:number}[]=[];
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const phases:{phase:string;at:number}[]=[];
  const mark=(phase:string)=>phases.push({phase,at:Date.now()});
  mark('test-start');
  if(process.env.NAVIGATION_TRACE_LEVEL==='detailed')await context.addInitScript(()=>{
    const scope=globalThis as any;
    const events:any[]=[];
    scope.__navigationTiming=events;
    const record=(event:string,extra:unknown=null)=>events.push({event,at:performance.now(),extra});
    document.addEventListener('click',(event)=>{
      const link=(event.target as Element)?.closest?.('a');
      if(!link?.getAttribute('href')?.startsWith('/items/navigation-fixture'))return;
      record('activation');
      let previewSeen=false;
      const observer=new MutationObserver(()=>{
        if(!previewSeen&&document.querySelector('article[aria-busy]')){previewSeen=true;record('preview-in-dom');}
        if(Array.from(document.querySelectorAll('p')).some(p=>p.textContent==='固定正文')){
          record('body-in-dom');observer.disconnect();
        }
      });
      observer.observe(document,{childList:true,subtree:true,characterData:true});
    },true);
    const doc=document as any;
    const start=doc.startViewTransition?.bind(document);
    record('capabilities',{viewTransition:!!start,prefetch:document.createElement('link').relList.supports('prefetch'),level:'detailed'});
    if(!start)return;
    doc.startViewTransition=(callback:any)=>{
      record('start');
      const detail=scope.__reactRouterDataRouter?.state.loaderData?.['routes/item']?.detail;
      if(detail)detail.then(()=>record('detail-resolved'),(error:unknown)=>record('detail-rejected',String(error)));
      const transition=start(()=>{
        record('callback-start');
        const result=callback();
        Promise.resolve(result).then(()=>record('callback-resolved'),(error:unknown)=>record('callback-rejected',String(error)));
        return result;
      });
      for(const event of ['updateCallbackDone','ready','finished'])transition[event].then(
        ()=>record(event), (error:unknown)=>record(event+':rejected',String(error)),
      );
      return transition;
    };
  });
  const page=await context.newPage();
  try{
    mark('visit-start');
    await visit(page,origin+'/');
    mark('visit-done');
    await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible();
    previousDebug=debug.disable();
    debug.enable([previousDebug,'pw:protocol'].filter(Boolean).join(','));
    mark('click-start');
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();
    mark('click-done');
    mark('body-assert-start');
    let lastBeat=Date.now();
    heartbeat=setInterval(()=>{
      const now=Date.now();
      if(now-lastBeat>250&&nodeGaps.length<20)nodeGaps.push({at:now,gap:now-lastBeat});
      lastBeat=now;
    },100);
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    clearInterval(heartbeat);
    mark('body-assert-passed');
    console.error('NAVIGATION_TIMING_SUCCESS',JSON.stringify({phases,nodeGaps,state:await page.evaluate(()=>({now:performance.now(),timeOrigin:performance.timeOrigin,dateNow:Date.now(),events:(globalThis as any).__navigationTiming,resources:performance.getEntriesByType('resource').map(r=>r.toJSON())}))}));
    await context.setOffline(true);
    await page.goBack();
    await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible({timeout:1500});
    await context.setOffline(false);
    await page.getByRole('button',{name:/^筛选/}).click();
    await page.getByRole('link',{name:'AI金融',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-finance',exact:true})).toBeVisible();
    await page.getByRole('button',{name:/^筛选/}).click();
    await page.getByRole('link',{name:'公募私募',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 funds',exact:true})).toBeVisible();
    await context.setOffline(true);
    await page.goBack();
    await expect(page.getByRole('link',{name:'分类 ai-finance',exact:true})).toBeVisible({timeout:1500});
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+'/?category=ai-finance');
  }catch(error){
    clearInterval(heartbeat);
    mark('failure-caught');
    // Temporary failure-only diagnostics. Do not change the navigation, assertion or timing before failure.
    const state=await page.evaluate(async()=>{
      const router=(globalThis as any).__reactRouterDataRouter;
      const state=router?.state;
      const data=state?.loaderData?.['routes/item'];
      const detail=data?.detail;
      const promise=detail?{
        tracked:detail._tracked,hasData:'_data' in detail,hasError:'_error' in detail,
        itemId:detail._data?.item?.id,body:detail._data?.item?.body,error:String(detail._error),status:detail.status,
      }:null;
      const root=(document as any)[Object.keys(document).find(key=>key.startsWith('__reactContainer$'))??'']?.stateNode;
      const snapshot={
        now:performance.now(),timeOrigin:performance.timeOrigin,dateNow:Date.now(),events:(globalThis as any).__navigationTiming,
        bodyVisible:!!Array.from(document.querySelectorAll('p')).find(p=>p.textContent==='固定正文'),
        root:root?{pending:root.pendingLanes,suspended:root.suspendedLanes,pinged:root.pingedLanes,warm:root.warmLanes,callback:!!root.callbackNode,priority:root.callbackPriority,commitBlocked:!!root.cancelPendingCommit}:null,
        url:location.href,navigation:state?.navigation,errors:state?.errors,
        loaderKeys:Object.keys(state?.loaderData??{}),previewId:data?.preview?.id,promise,
        busy:!!document.querySelector('article[aria-busy]'),visibility:document.visibilityState,
        transitions:document.getAnimations().map(a=>({state:a.playState,time:a.currentTime,start:a.startTime,timeline:a.timeline?.currentTime,pseudo:(a.effect as KeyframeEffect)?.pseudoElement})),
        resources:performance.getEntriesByType('resource').map(r=>r.toJSON()),
      };
      const resolution=detail?await Promise.race([
        detail.then((v:any)=>({state:'resolved',itemId:v?.item?.id,body:v?.item?.body}), (e:unknown)=>({state:'rejected',error:String(e)})),
        new Promise(resolve=>setTimeout(()=>resolve({state:'pending after failure'}),1000)),
      ]):null;
      return {...snapshot,resolution};
    });
    console.error('NAVIGATION_FAILURE_DIAGNOSTIC',JSON.stringify({phases,nodeGaps,state,hits,server: web.logs()}));
    throw error;
  }finally{
    clearInterval(heartbeat);
    try{await context.close();}finally{if(previousDebug!==undefined)debug.enable(previousDebug);}
  }
});

test('hover downloads nothing, a press fetches article data once for its click, touches that move do not, and failed prefetch does not replace the current page',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  const press={button:0,pointerType:'mouse',isPrimary:true};
  try{
    await visit(page,origin+'/');
    const link=page.getByRole('link',{name:'性能检查文章',exact:true});
    const start=hits.length;
    // In one task, as a scroll moves within the hold that makes a still touch a press; two calls can be further apart.
    await link.evaluate(a=>{for(const type of ['touchstart','touchmove'])a.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,composed:true}));});
    await link.hover();await page.waitForTimeout(300);
    await page.getByRole('heading',{name:'精选',exact:true}).click();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,0);
    await link.click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/items/')).length,1,'the click reuses the prefetch its press started');
    const fresh=await chrome.newContext();const freshPage=await fresh.newPage();
    try{
      await visit(freshPage,origin+'/');failing='/api/site/items/navigation-fixture';
      const failed=freshPage.waitForResponse(r=>r.url().includes('/items/navigation-fixture.data')&&r.status()===503);
      await freshPage.getByRole('link',{name:'性能检查文章',exact:true}).dispatchEvent('pointerdown',press);await failed;
      await expect(freshPage.getByRole('heading',{name:'精选',exact:true})).toBeVisible();
    }finally{await fresh.close();}
  }finally{failing='';await context.close();}
});

test('SSR all-pages and report kinds return offline with their own content',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await visit(page,origin+'/all');
    await page.locator('a[href="/all?page=2"]').first().click();
    await expect(page.getByRole('link',{name:'全部第 2 页',exact:true})).toBeVisible();
    await context.setOffline(true);await page.goBack();
    await expect(page.getByRole('link',{name:'全部第 1 页',exact:true})).toBeVisible({timeout:1500});
    await context.setOffline(false);await visit(page,origin+'/daily');
    await page.getByRole('link',{name:'周报',exact:true}).click();
    await expect(page.locator('#report-start')).toContainText('周报');
    await context.setOffline(true);await page.getByRole('link',{name:'日报',exact:true}).click();
    await expect(page.locator('#report-start')).toContainText('日报',{timeout:1500});
  }finally{await context.close();}
});

// A prefetch of the newly selected link must not be mistaken for an explicit refresh of that page.
// Disable HTTP reuse here: otherwise the browser cache can hide a lost document-level result.
test('a press on a selected link preserves visited data and the next revisit starts no data request',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  const requests:string[]=[];
  await context.route('**/*.data*',route=>route.continue());
  page.on('request',request=>{if(request.url().includes('.data'))requests.push(request.url());});
  try{
    await visit(page,origin+'/');
    await page.getByRole('link',{name:'AI金融',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-finance',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'AI金融',exact:true}).dispatchEvent('pointerdown',{button:0,pointerType:'mouse',isPrimary:true});
    await page.waitForTimeout(150);
    await page.getByRole('link',{name:'公募私募',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 funds',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'公募私募',exact:true}).dispatchEvent('pointerdown',{button:0,pointerType:'mouse',isPrimary:true});
    await page.waitForTimeout(150);
    const before=requests.length;
    await page.getByRole('link',{name:'AI金融',exact:true}).click();
    await expect(page.getByRole('link',{name:'分类 ai-finance',exact:true})).toBeVisible();
    assert.deepEqual(requests.slice(before),[],'neither prefetch nor navigation may evict and reload a still-valid visited page');
  }finally{await context.close();}
});

test('a revisit never renews the original deadline; an expired read shows an error and a reload asks again',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await page.clock.install();ttl=1;
    await visit(page,origin+'/');
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    failing='/api/site/timeline';
    await page.clock.runFor(1500);
    await page.goBack();await expect(page.getByRole('heading',{name:'暂时无法加载',exact:true})).toBeVisible();
    failing='';ttl=60;
    await page.reload();await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible();
  }finally{ttl=60;failing='';await context.close();}
});

test('SSR freshness spent in an upstream cache is not renewed by HTML hydration',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    ttl=0;await visit(page,origin+'/');
    await page.getByRole('link',{name:'性能检查文章',exact:true}).click();await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    const start=hits.length;ttl=60;
    await page.goBack();await expect(page.getByRole('link',{name:'性能检查文章',exact:true})).toBeVisible();
    assert.equal(hits.slice(start).filter(x=>x.startsWith('/api/site/timeline')).length,1);
  }finally{ttl=60;await context.close();}
});

test('Agent tabs finish offline with matching canonical; invalid direct tabs and anchored links keep a panel',async()=>{
  const context=await chrome.newContext();const page=await context.newPage();
  try{
    await visit(page,origin+'/agent');
    await context.setOffline(true);
    await page.getByRole('tablist',{name:'接入方式'}).getByRole('tab',{selected:true}).click();
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    for(const [tab,name] of [['mcp',/^MCP/],['rss',/^RSS/],['api',/^REST API/]] as const){
      const choice=page.getByRole('tab',{name});
      // The active track was exercised above; compare navigation through every remaining track.
      if(await choice.getAttribute('aria-selected')==='true')continue;
      const target=await choice.getAttribute('href');
      await choice.click();
      await expect(page).toHaveURL(origin+target,{timeout:1500});
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',origin+target);
      await expect(page.locator('#agent-panel')).toHaveAttribute('aria-labelledby','agent-tab-'+tab);
      await expect(page.locator('#agent-panel')).not.toBeEmpty();
    }
    await context.setOffline(false);
    await visit(page,origin+'/agent?tab=unknown');
    await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#agent-panel')).not.toBeEmpty();
    await visit(page,origin+'/agent#agent-api-recovery');
    await expect(page.locator('#agent-api-recovery')).toBeVisible();
  }finally{await context.close();}
});

test('phone suggestions load only on opening, use one small read, retry failures and update on reopening',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  // Module cards refresh independently; count every core site read, including unwanted full pages.
  const siteReads=()=>hits.filter(path=>path.startsWith('/api/site/'));
  try{
    suggestionsVersion=1;await visit(page,origin+'/');
    assert.equal(hits.filter(x=>x==='/api/site/search/suggestions').length,0);
    let start=siteReads().length;
    // An unrelated quote refresh must not be mistaken for search overfetch.
    await page.evaluate(()=>fetch('/api/chronicle/live?code=sh000001&kind=minute').then(r=>r.text()));
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByRole('link',{name:'1 建议版本 1',exact:true})).toBeVisible();
    assert.deepEqual(siteReads().slice(start),['/api/site/search/suggestions']);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    suggestionsVersion=2;start=siteReads().length;
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByRole('link',{name:'1 建议版本 2',exact:true})).toBeVisible();
    assert.deepEqual(siteReads().slice(start),['/api/site/search/suggestions']);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    failing='/api/site/search/suggestions';await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByRole('link',{name:'1 建议版本 2',exact:true})).not.toBeVisible();
    await page.getByRole('button',{name:'取消',exact:true}).click();failing='';suggestionsVersion=3;
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.getByRole('link',{name:'1 建议版本 3',exact:true})).toBeVisible();
  }finally{failing='';await context.close();}
});

test('reader enhancements wait for visible code and update only the picture that loaded',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const scripts:string[]=[];page.on('request',r=>{if(r.url().includes('/assets/')&&r.url().includes('highlight-'))scripts.push(r.url());});
  await page.route('**/reader-image/*.svg',route=>route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${route.request().url().endsWith('/tiny.svg')?16:640}" height="360"><rect width="640" height="360" fill="red"/></svg>`}));
  try{
    await visit(page,origin+'/items/reader-fixture');
    await expect(page.getByRole('heading',{name:'阅读增强检查',exact:true})).toBeVisible();
    await expect(page.locator('.code-block-copy')).toHaveCount(2);
    assert.deepEqual(scripts,[],'reading the introduction must not download the offscreen highlighter');
    const source=page.locator('.prose pre code').first();
    assert.equal(await source.textContent(),codeSource);
    await source.scrollIntoViewIfNeeded();
    await expect(source).toHaveClass(/hljs/);
    assert.equal(await source.textContent(),codeSource,'colouring preserves the copyable text');
    assert.equal(scripts.length,1);
    await page.locator('.code-block-copy').first().click();
    await expect(page.locator('.code-block-copy').first()).toHaveText('已复制');
    assert.equal(await page.locator('.prose pre code').nth(1).textContent(),'x = 1');
    for(let i=0;i<12;i++){
      const picture=page.locator(`.prose img[alt="正文配图 ${i}"]`);
      await picture.scrollIntoViewIfNeeded();
      await expect(picture).toHaveAttribute('role','button');
    }
    const tiny=page.locator('.prose img[alt="小图标"]');await tiny.scrollIntoViewIfNeeded();
    await expect(tiny).not.toHaveAttribute('role','button');
    await expect(page.locator('.prose a img')).not.toHaveAttribute('role','button');
    await page.getByRole('navigation',{name:'正文语言'}).getByRole('link',{name:'原文',exact:true}).click();
    await expect(page.getByText('Original reader text',{exact:true})).toBeVisible();
    assert.equal(await page.locator('.code-block-copy').count(),0);
  }finally{await context.close();}
});

test('deep reading returns to its anchor, including folded dates',async()=>{
  const context=await safari.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  try{
    await visit(page,origin+'/?tag=long-reading');
    await expect(page.locator('[data-card-key]')).toHaveCount(180);
    await page.getByRole('button',{name:'收起10月4日',exact:true}).click();
    await expect(page.locator('[data-card-key]')).toHaveCount(120);
    await page.getByRole('link',{name:'长列表文章 160',exact:true}).scrollIntoViewIfNeeded();
    const before=await page.evaluate(()=>{
      const first=[...document.querySelectorAll<HTMLElement>('[data-card-key]')].find(e=>e.getBoundingClientRect().bottom>72)!;
      return {key:first.dataset.cardKey!,top:first.getBoundingClientRect().top};
    });
    await page.getByRole('link',{name:'长列表文章 160',exact:true}).click();
    await expect(page.getByText('固定正文',{exact:true})).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-card-key]')).toHaveCount(120);
    await expect.poll(()=>page.locator(`[data-card-key="${before.key}"]`).evaluate((e,top)=>Math.abs(e.getBoundingClientRect().top-top),before.top)).toBeLessThan(2);
    await expect(page.getByRole('button',{name:'展开10月4日',exact:true})).toBeVisible();
  }finally{await context.close();}
});
