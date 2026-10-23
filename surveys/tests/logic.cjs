'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const ref=fs.readFileSync(path.join(root,'public/assets/reference.js'),'utf8');
const app=fs.readFileSync(path.join(root,'public/assets/app.js'),'utf8');
const qr=fs.readFileSync(path.join(root,'public/assets/qr.js'),'utf8');
for(const script of [ref,app,qr])new vm.Script(script);
const ctx=vm.createContext({TextEncoder});
vm.runInContext('const TRI=["لا","نوعاً ما","نعم"];'+ref.slice(ref.indexOf('function getQuestions('),ref.indexOf('function getRatingColor(')),ctx);
const survey={axes:[{name:'محور',qs:[{text:'إيجابي',type:'rating3',options:['لا','نوعاً ما','نعم']},{text:'سلبي',type:'rating3',reverse:true,options:['لا','نوعاً ما','نعم']},{text:'اختيار',type:'choice',options:['أ','ب']},{text:'خماسي',type:'rating5',options:['1','2','3','4','5']}]}]};
let result=ctx.computeAggregate(survey,[{answers:{q1:2,q2:0,q3:1,q4:4}}]);assert.equal(result.overall,100);assert.equal(result.totalScored,3);assert.deepEqual(Array.from(result.questions[1].counts),[1,0,0]);assert.equal(result.questions[2].meanScore,null);
assert.equal(ctx.computeAggregate(survey,[]).overall,null);
assert.equal(ctx.computeAggregate(survey,[{answers:{q1:-1,q2:10,q4:'4'}}]).totalScored,0);
assert.equal(ctx.computeAggregate(survey,[{answers:{q1:1,q2:1,q4:2}}]).overall,50);
const weighted=ctx.computeAggregate(survey,[{answers:{q1:2,q2:0,q4:4}},{answers:{q1:0}}]);assert.equal(weighted.overall,75);
vm.runInContext(qr,ctx);
// Independently read the matrix, remove function modules, reverse mask and decode byte payload.
const payload='https://example.com/surveys/?s='+'a'.repeat(48);
const svg=ctx.makeQR(payload),matrix=Array.from({length:41},()=>Array(41).fill(0));
for(const m of svg.matchAll(/M(\d+),(\d+)h1v1h-1z/g))matrix[Number(m[2])-4][Number(m[1])-4]=1;
const reserved=Array.from({length:41},()=>Array(41).fill(false));
for(let r=0;r<41;r++)for(let c=0;c<41;c++)reserved[r][c]=(r<=8&&c<=8)||(r<=8&&c>=33)||(r>=33&&c<=8)||r===6||c===6||(r>=32&&r<=36&&c>=32&&c<=36);
// Outside finder bounds only format strips need reserving (covered by rectangles).
let format=0;for(let i=0;i<15;i++){const r=i<6?i:i<8?i+1:41-15+i;format|=matrix[r][8]<<i;}
assert.equal(format,0x77c4);
let row=40,dir=-1,bits=[];
for(let c=40;c>0;c-=2){if(c===6)c--;while(true){for(let k=0;k<2;k++)if(!reserved[row][c-k])bits.push(matrix[row][c-k]^((row+c-k)%2===0?1:0));row+=dir;if(row<0||row>=41){row-=dir;dir=-dir;break;}}}
assert.equal(bits.length,1383); // 172 codewords + seven remainder bits
const words=[];for(let i=0;i<1376;i+=8)words.push(bits.slice(i,i+8).reduce((a,b)=>a*2+b,0));
const blocks=[[],[]];for(let i=0;i<136;i++)blocks[i%2].push(words[i]);const bytes=[...blocks[0],...blocks[1]],stream=bytes.flatMap(x=>Array.from({length:8},(_,i)=>(x>>>(7-i))&1));
const read=(start,n)=>stream.slice(start,start+n).reduce((a,b)=>a*2+b,0);assert.equal(read(0,4),4);assert.equal(read(4,8),payload.length);assert.equal(Buffer.from(Array.from({length:payload.length},(_,i)=>read(12+i*8,8))).toString(),payload);
// Each Reed-Solomon block must have zero syndromes for all 18 generator roots.
const exp=[1];for(let i=1;i<255;i++){let x=exp[i-1]<<1;exp[i]=x&256?x^0x11d:x;}const log=[];exp.forEach((x,i)=>log[x]=i);const mult=(a,b)=>!a||!b?0:exp[(log[a]+log[b])%255];
for(let b=0;b<2;b++){const code=[...blocks[b],...Array.from({length:18},(_,i)=>words[136+2*i+b])];for(let power=0;power<18;power++){let v=0;for(const w of code)v=mult(v,exp[power])^w;assert.equal(v,0);}}
assert.throws(()=>ctx.makeQR('x'.repeat(135)));
console.log('PASS: JS syntax; scoring/reversal; raw counts; empty/invalid values; custom exclusions; weighted means; QR format, payload, block parity, capacity.');
// Exercise the real API wrapper and submission function without browser or server.
(async()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{id,style:{},value:'',checked:false,textContent:'',className:'',innerHTML:'',disabled:false,addEventListener(){},querySelector(){return null},querySelectorAll(){return[]},classList:{add(){},remove(){}}});return elements.get(id);};
 let mode='ok',submitted=0,lastRequest=null;
 const context=vm.createContext({TextEncoder,URL,URLSearchParams,FormData,Blob,structuredClone,console,setTimeout,clearTimeout,navigator:{},location:{search:'?s='+'a'.repeat(48),pathname:'/surveys/',href:'https://example.com/surveys/'},history:{replaceState(){}},MutationObserver:class {observe(){}},window:{addEventListener(){}},document:{getElementById:el,createElement:()=>el('created')},fetch:async(url,options={})=>{
  const op=new URL(url,'https://example.com/').searchParams.get('op');lastRequest={op,options};
  if(op==='session')return{ok:true,status:200,json:async()=>({csrf:'csrf-test',auth_mode:'standalone',user:null})};
  if(op==='submit'){submitted++;if(mode==='error')return{ok:false,status:409,json:async()=>({error:'سبق حفظ التقييم.'})};}
  return{ok:true,status:200,json:async()=>({ok:true})};
 }});
 vm.runInContext(ref,context);vm.runInContext(app,context);
 vm.runInContext('portal=()=>{};route=async()=>{};renderAccount=()=>{};',context);
 await new Promise(resolve=>setImmediate(resolve));
 vm.runInContext("sessionInfo={csrf:'csrf-test'};me={id:7,name:'معلمة'};currentRemote={id:12};ALL_Q=[{id:'q1',num:1}];TOTAL_Q=1;state={answers:{q1:2},notes:'ملاحظة'};goTo=i=>{currentScreen=i};updateNav=()=>{};",context);
 await vm.runInContext('submitSurvey()',context);assert.equal(submitted,0);
 el('identityConsent').checked=true;
 await vm.runInContext('submitSurvey()',context);assert.equal(submitted,1);assert.equal(vm.runInContext('currentScreen',context),4);assert.equal(lastRequest.options.headers['X-CSRF-Token'],'csrf-test');
 const payload=JSON.parse(lastRequest.options.body);assert.equal(payload.identity_consent,true);assert.equal(payload.reviewerName,undefined);assert.equal(payload.id,12);
 mode='error';vm.runInContext('currentScreen=3',context);await vm.runInContext('submitSurvey()',context);assert.equal(vm.runInContext('currentScreen',context),3);assert.equal(el('appNotice').textContent,'سبق حفظ التقييم.');assert.equal(vm.runInContext('busy',context),false);
 console.log('PASS: real client submission requires identity consent; sends CSRF; omits user-supplied identity; displays success only after server acknowledgment; retains review on rejected save. DOM is simulated, not a browser.');
})().catch(err=>{console.error(err);process.exitCode=1;});
