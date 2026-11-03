// Temporary PR #4 diagnostics. Preserve test output, then show bounded protocol timing around the
// unchanged article assertion. Raw local-fixture protocol stays in the short-lived CI artifact.
import { readFileSync } from 'node:fs';

type Call={key:string;method:string;at:number;end?:number;params:string;response?:unknown};
const calls=new Map<string,Call>();
let diagnostic:any;
let unparsed=0;
const lines=readFileSync(process.argv[2],'utf8').split('\n');
function accept(message:any,direction:string,at:number,target:string){
  if(message.method==='Target.sendMessageToTarget'||message.method==='Target.dispatchMessageFromTarget'){
    try{accept(JSON.parse(message.params.message),direction,at,`${message.pageProxyId??''}/${message.params.targetId}`);}catch{unparsed++;}
    return;
  }
  const key=`${target}/${message.id}`;
  if(direction==='SEND'&&message.id!==undefined){
    calls.set(key,{key,method:message.method,at,params:JSON.stringify(message.params??{})});
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
  const selected=[...calls.values()].filter(c=>c.at>=start-250&&c.at<=end+400&&c.method.startsWith('Runtime.'));
  const summary=selected.map(c=>({
    key:c.key,method:c.method,start:c.at-start,end:c.end===undefined?null:c.end-start,
    duration:c.end===undefined?null:c.end-c.at,
    article:c.params.includes('固定正文'),expect:c.params.includes('to.be.visible'),
    response:JSON.stringify(c.response)?.slice(0,700),
  }));
  console.log('NAVIGATION_PROTOCOL_SUMMARY',JSON.stringify({start,end,unparsed,calls:summary}));
}else console.log('NAVIGATION_PROTOCOL_SUMMARY',JSON.stringify({unparsed,error:'No completed article assertion diagnostic found'}));
