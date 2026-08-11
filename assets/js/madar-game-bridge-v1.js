(function installMadarGameBridge(global){
  "use strict";
  if(global.MadarGameBridge)return;
  let port=null,nonce="",config=null,sequence=0;
  const pending=new Map();
  let resolveReady,rejectReady;
  const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  function sendHandshake(){if(window.parent!==window)window.parent.postMessage({type:"madar:ready",runtime:"madar-game-bridge-v1"},"*");}
  function request(event,payload={}){
    return readyPromise.then(()=>new Promise((resolve,reject)=>{
      const requestId=`g${Date.now().toString(36)}${(++sequence).toString(36)}`;
      const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error("لم تستجب منصة مدار للعبة في الوقت المحدد."));},20000);
      pending.set(requestId,{resolve,reject,timeout});
      port.postMessage({type:"madar:request",nonce,requestId,event,payload});
    }));
  }
  window.addEventListener("message",(event)=>{
    if(event.source!==window.parent||event.data?.type!=="madar:connect"||event.data?.runtime!=="madar-game-bridge-v1"||!event.ports?.[0])return;
    if(port)return;
    port=event.ports[0];nonce=String(event.data.nonce||"");config=event.data.config||{};
    port.onmessage=(message)=>{
      const data=message.data||{};
      if(data.nonce!==nonce||data.type!=="madar:response")return;
      const item=pending.get(data.requestId);if(!item)return;
      clearTimeout(item.timeout);pending.delete(data.requestId);
      data.ok===false?item.reject(new Error(data.error||"تعذّر تنفيذ طلب اللعبة.")):item.resolve(data.payload||{});
    };
    port.start?.();resolveReady(config);
  });
  const timer=setInterval(()=>{if(port){clearInterval(timer);return;}sendHandshake();},500);
  setTimeout(()=>{if(!port){clearInterval(timer);rejectReady(new Error("تعذّر ربط اللعبة بمنصة مدار."));}},20000);
  sendHandshake();
  global.MadarGameBridge=Object.freeze({
    runtime:"madar-game-bridge-v1",
    ready:()=>readyPromise,
    startRound:(difficulty,questionCount)=>request("round_started",{difficulty,questionCount}),
    submitAnswer:(payload)=>request("question_answered",payload||{}),
    finishRound:(payload)=>request("round_finished",payload||{}),
    requestCertificate:()=>request("certificate_requested",{}),
  });
})(window);
