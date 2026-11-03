// Temporary PR #4 diagnostics. Preserve test output, then show bounded protocol timing around the
// unchanged article assertion. Raw local-fixture protocol stays in the short-lived CI artifact.
import { readFileSync } from 'node:fs';

type Call={key:string;method:string;at:number;end?:number;params:string;response?:unknown};
const calls=new Map<string,Call>();
let diagnostic:any;
let unparsed=0;
const timeline:{received:number;record:any}[]=[];
const timelineMarkers:{at:number;method:string;params:any}[]=[];
const lines=readFileSync(process.argv[2],'utf8').split('\n');
function decode(value:any):any{
  if(value?.o)return Object.fromEntries(value.o.map((p:any)=>[p.k,decode(p.v)]));
  if(value?.a)return value.a.map(decode);
  if(value&&typeof value==='object'&&'v' in value)return value.v;
  return value;
}
function accept(message:any,direction:string,at:number,target:string){
  if(message.method==='Target.sendMessageToTarget'||message.method==='Target.dispatchMessageFromTarget'){
    try{accept(JSON.parse(message.params.message),direction,at,`${message.pageProxyId??''}/${message.params.targetId}`);}catch{unparsed++;}
    return;
  }
  if(message.method==='Timeline.eventRecorded')timeline.push({received:at,record:message.params.record});
  else if(message.method?.startsWith('Timeline.'))timelineMarkers.push({at,method:message.method,params:message.params});
  const key=`${target}/${message.id}`;
  if(direction==='SEND'&&message.id!==undefined){
    calls.set(key,{key,method:message.method,at,params:JSON.stringify(message.params?.arguments?.filter((a:any)=>a.value&&typeof a.value==='object')??message.params??{})});
  }else if(direction==='RECV'&&message.id!==undefined){
    const call=calls.get(key);
    if(call){call.end=at;call.response=message.result??message.error;}
  }
}
for(const original of lines){
  const line=original.replace(/\x1b\[[0-9;]*m/g,'');
  const protocol=line.match(/(\d{4}-\d\d-\d\dT\S+) pw:protocol (SEND ►|◀ RECV) (.+)$/);
  if(protocol){
    try{accept(JSON.parse(protocol[3]),protocol[2].includes('SEND')?'SEND':'RECV',Date.parse(protocol[1]),'browser');}catch{unparsed++;}
    continue;
  }
  console.log(original);
  const record=line.match(/NAVIGATION_(?:FAILURE_DIAGNOSTIC|TIMING_SUCCESS) (.+)$/);
  if(record)try{diagnostic=JSON.parse(record[1]);}catch{}
}
const start=diagnostic?.phases.find((p:any)=>p.phase==='body-assert-start')?.at;
const end=diagnostic?.phases.find((p:any)=>p.phase==='failure-caught'||p.phase==='body-assert-passed')?.at;
if(start!==undefined&&end!==undefined){
  const selected=[...calls.values()].filter(c=>c.at>=start-250&&c.at<=end+400&&c.method==='Runtime.callFunctionOn'&&(c.params.includes('固定正文')||c.end===undefined||c.end-c.at>=250));
  const summary=selected.map(c=>({
    key:c.key,method:c.method,start:c.at-start,end:c.end===undefined?null:c.end-start,
    duration:c.end===undefined?null:c.end-c.at,
    article:c.params.includes('固定正文'),expect:c.params.includes('to.be.visible'),
    matches:decode((c.response as any)?.result?.value)?.matches,
    stages:decode((c.response as any)?.result?.value)?.__navigationExpectTrace,
    response:JSON.stringify(c.response)?.slice(0,250),
  }));
  console.log('NAVIGATION_PROTOCOL_SUMMARY',JSON.stringify({start,end,unparsed,calls:summary}));
}else console.log('NAVIGATION_PROTOCOL_SUMMARY',JSON.stringify({unparsed,error:'No completed article assertion diagnostic found'}));

const baseline=timelineMarkers.find(m=>m.method==='Timeline.recordingStarted');
const flat:any[]=[];
function flatten(record:any,received:number,depth=0){
  flat.push({type:record.type,start:record.startTime,end:record.endTime,
    relativeStartMs:baseline?1000*(record.startTime-baseline.params.startTime):null,
    durationMs:record.endTime===undefined?null:1000*(record.endTime-record.startTime),
    received,depth,data:record.data,stackTrace:record.stackTrace});
  for(const child of record.children??[])flatten(child,received,depth+1);
}
for(const item of timeline)flatten(item.record,item.received);
const counts:Record<string,number>={};
for(const record of flat)counts[record.type]=(counts[record.type]??0)+1;
console.log('NAVIGATION_TIMELINE_SUMMARY',JSON.stringify({markers:timelineMarkers,
  commands:[...calls.values()].filter(c=>c.method.startsWith('Timeline.')).map(c=>({method:c.method,at:c.at,end:c.end,response:c.response})),
  rootCount:timeline.length,totalCount:flat.length,counts,
  longest:flat.filter(r=>r.durationMs>=10).sort((a,b)=>b.durationMs-a.durationMs).slice(0,35),
}));
