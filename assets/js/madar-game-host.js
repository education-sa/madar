(function runMadarGameHost(){
  "use strict";
  const configNode=document.getElementById("madarPlayerConfig");
  const frame=document.getElementById("madarGameFrame");
  const statusNode=document.getElementById("madarPlayerStatus");
  if(!configNode||!frame)return;
  const config=JSON.parse(configNode.textContent||"{}");
  const state={port:null,csrf:"",runToken:"",certificate:null,attemptId:null,previewQuestions:[],previewIndex:0,previewScore:0,previewCorrect:0,previewStreak:0,previewBest:0};
  const setStatus=(message,error=false,hide=false)=>{statusNode.textContent=message;statusNode.classList.toggle("is-error",error);statusNode.classList.toggle("is-hidden",hide);};
  const ar=(value)=>new Intl.NumberFormat("ar-SA",{useGrouping:false}).format(Number(value)||0);
  async function studentApi(path,options={}){
    const method=(options.method||"GET").toUpperCase();
    const response=await fetch(`/api/student${path}`,{...options,headers:{"Content-Type":"application/json",Accept:"application/json",...(method!=="GET"&&state.csrf?{"X-CSRF-Token":state.csrf}:{}),...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"تعذّر الاتصال بنظام الألعاب.");
    return data;
  }
  async function ensureStudent(){
    if(config.preview)return;
    if(state.csrf)return;
    const response=await fetch("/api/student/me",{headers:{Accept:"application/json"}});const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.csrfToken)throw new Error("انتهت جلسة الطالبة. عودي إلى مدار وسجّلي الدخول.");
    state.csrf=data.csrfToken;
  }
  function cryptoShuffle(items){
    const copy=[...items];
    for(let i=copy.length-1;i>0;i-=1){const values=new Uint32Array(1);crypto.getRandomValues(values);const j=values[0]%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}
    return copy;
  }
  function publicPreviewQuestion(question){const {correctAnswer,explanation,...publicData}=question;return publicData;}
  function answersEqual(type,selected,correct){
    if(type==="multiple_choice")return Number(selected)===Number(correct);
    if(type==="true_false")return Boolean(selected)===Boolean(correct);
    if(type==="ordering")return JSON.stringify((selected||[]).map(String))===JSON.stringify((correct||[]).map(String));
    const map=(pairs)=>Object.fromEntries((pairs||[]).map((pair)=>[String(pair.left||"").trim(),String(pair.right||"").trim()]).sort(([a],[b])=>a.localeCompare(b,"ar")));
    return JSON.stringify(map(selected))===JSON.stringify(map(correct));
  }
  async function handleRequest(event,payload){
    if(event==="round_started"){
      const difficulty=String(payload.difficulty||"easy");const questionCount=Math.max(1,Math.min(200,Number(payload.questionCount)||Number(config.game.questionCount)||10));
      if(config.preview){
        state.previewQuestions=cryptoShuffle((config.previewQuestions||[]).filter((q)=>q.difficulty===difficulty)).slice(0,questionCount);
        state.previewIndex=0;state.previewScore=0;state.previewCorrect=0;state.previewStreak=0;state.previewBest=0;state.runToken="preview";
        setStatus("وضع المعاينة — لن تُحفظ نتيجة",false,true);
        return {runStarted:true,source:config.sourceType,questions:state.previewQuestions.map(publicPreviewQuestion),questionCount:config.sourceType==="template"?state.previewQuestions.length:questionCount,game:config.game,player:config.player,preview:true};
      }
      await ensureStudent();const data=await studentApi("/games/runs",{method:"POST",body:JSON.stringify({gameId:config.game.id,difficulty,questionCount})});
      state.runToken=data.runToken;state.attemptId=data.attemptId;setStatus("تم بدء الجولة وحفظها بأمان",false,true);const {runToken,attemptId,...publicRun}=data;return {...publicRun,runStarted:true};
    }
    if(event==="question_answered"){
      if(!state.runToken)throw new Error("ابدئي الجولة قبل إرسال الإجابة.");
      if(config.preview){
        if(config.sourceType!=="template")return {accepted:true,verificationSource:"package_reported"};
        const question=state.previewQuestions[state.previewIndex];if(!question||String(payload.questionKey)!==String(question.key))throw new Error("ترتيب السؤال لا يطابق المعاينة.");
        const correct=answersEqual(question.type,payload.answer,question.correctAnswer);state.previewIndex+=1;
        if(correct){state.previewCorrect+=1;state.previewStreak+=1;state.previewBest=Math.max(state.previewBest,state.previewStreak);state.previewScore+=Number(question.points)||0;}else state.previewStreak=0;
        return {correct,explanation:question.explanation||"",score:state.previewScore,correctCount:state.previewCorrect,streak:state.previewStreak,bestStreak:state.previewBest,completed:state.previewIndex>=state.previewQuestions.length};
      }
      return studentApi(`/games/runs/${encodeURIComponent(state.runToken)}/answers`,{method:"POST",body:JSON.stringify(payload||{})});
    }
    if(event==="round_finished"){
      if(!state.runToken)throw new Error("لا توجد جولة مفتوحة للحفظ.");
      if(config.preview){
        const total=config.sourceType==="template"?state.previewQuestions.length:Number(payload.questionCount||0);const correct=config.sourceType==="template"?state.previewCorrect:Number(payload.correctCount||0);
        return {saved:false,preview:true,score:config.sourceType==="template"?state.previewScore:Number(payload.score||0),correctCount:correct,questionCount:total,accuracy:total?Math.round(correct/total*100):0,certificate:null};
      }
      const data=await studentApi(`/games/runs/${encodeURIComponent(state.runToken)}/complete`,{method:"POST",body:JSON.stringify(payload||{})});
      state.certificate=data.certificate||null;state.attemptId=data.id||state.attemptId;setStatus(data.awardedPoints?`حُفظت النتيجة وأضيفت ${ar(data.awardedPoints)} نقطة`:`حُفظت النتيجة بنجاح`,false,false);return {saved:Boolean(data.saved),accuracy:data.accuracy,score:data.score,correctCount:data.correctCount,questionCount:data.questionCount,verificationSource:data.verificationSource,awardedPoints:data.awardedPoints||0,certificate:Boolean(data.certificate),message:data.message||null};
    }
    if(event==="certificate_requested"){
      if(!state.certificate)throw new Error(config.preview?"الشهادة لا تُصدر في وضع المعاينة.":"لا توجد شهادة متاحة لهذه الجولة.");
      openCertificate();return {shown:true};
    }
    throw new Error("حدث اللعبة غير مدعوم.");
  }
  function respond(requestId,ok,payload,error=""){
    state.port?.postMessage({type:"madar:response",nonce:config.channelNonce,requestId,ok,payload,error});
  }
  window.addEventListener("message",(event)=>{
    if(event.source!==frame.contentWindow||event.data?.type!=="madar:ready"||event.data?.runtime!=="madar-game-bridge-v1"||state.port)return;
    const channel=new MessageChannel();state.port=channel.port1;
    state.port.onmessage=async(message)=>{
      const data=message.data||{};if(data.type!=="madar:request"||data.nonce!==config.channelNonce||!data.requestId)return;
      try{respond(data.requestId,true,await handleRequest(String(data.event||""),data.payload||{}));}catch(error){setStatus(error.message||"تعذّر تنفيذ طلب اللعبة",true,false);respond(data.requestId,false,{},error.message||"تعذّر تنفيذ طلب اللعبة.");}
    };
    state.port.start?.();frame.contentWindow.postMessage({type:"madar:connect",runtime:"madar-game-bridge-v1",nonce:config.channelNonce,config:{game:config.game,player:config.player,preview:config.preview}},"*",[channel.port2]);
    setStatus(config.preview?"تم فتح وضع المعاينة":"اللعبة جاهزة",false,true);
    if(!config.preview&&config.certificateId){
      void (async()=>{try{await ensureStudent();state.certificate=await studentApi(`/games/certificates/${encodeURIComponent(config.certificateId)}`);openCertificate();}catch(error){setStatus(error.message||"تعذّر فتح الشهادة.",true,false);}})();
    }
  });
  setTimeout(()=>{if(!state.port)setStatus("اللعبة لم تتصل بواجهة مدار. هذه الحزمة تحتاج تهيئة MadarGameBridge.",true,false);},12000);
  function mountCertificate(){
    const root=document.getElementById("madarCertificateMount");if(root.innerHTML)return;
    root.innerHTML=`<div class="madar-cert-overlay" id="madarCertOverlay" hidden><div class="madar-cert-dialog"><div class="madar-cert-actions"><button class="primary" id="madarSaveCertificate" type="button">إرسال إلى ملف الإنجاز</button><button class="secondary" id="madarPrintCertificate" type="button">طباعة الشهادة / حفظ PDF</button><button class="secondary" id="madarCloseCertificate" type="button">إغلاق</button></div><section class="madar-certificate"><div class="madar-cert-inner"><div class="madar-cert-top"><div class="madar-cert-brand"><img src="/assets/print/madar-official-logo-transparent.png" alt="شعار مدار"><span><strong>مدار</strong><small>منصة الرياضيات التفاعلية</small></span></div><span class="madar-cert-seal">شهادة إتقان</span></div><h1>شهادة إتقان</h1><p class="madar-cert-intro">تمنح منصة مدار هذه الشهادة للطالبة</p><h2 class="madar-cert-student" data-cert="student">—</h2><p class="madar-cert-lesson">بعد إتمام درس <strong data-cert="lesson">—</strong></p><p class="madar-cert-code" data-cert="code">الوحدة — · الدرس —</p><div class="madar-cert-context"><span>المرحلة <strong data-cert="stage">—</strong></span><span>الصف <strong data-cert="grade">—</strong></span><span>الفصل الدراسي <strong data-cert="semester">—</strong></span><span>العام الدراسي <strong data-cert="year">—</strong></span></div><div class="madar-cert-facts"><span>المستوى <strong data-cert="level">—</strong></span><span>الدرجة <strong data-cert="mark">—</strong></span><span>النقاط <strong data-cert="score">—</strong></span><span>الوقت <strong data-cert="duration">—</strong></span></div><p class="madar-cert-issued" data-cert="issued"></p><div class="madar-cert-signatures"><div><small>اسم معلمة المادة</small><strong data-cert="teacher">—</strong><i></i></div><div><small>اسم المديرة</small><strong data-cert="leader">—</strong><i></i></div></div></div></section></div></div>`;
    document.getElementById("madarCloseCertificate").onclick=()=>{document.getElementById("madarCertOverlay").hidden=true;if(config.certificateId)window.location.assign(config.backPath||"/student/");};
    document.getElementById("madarPrintCertificate").onclick=()=>window.print();
    document.getElementById("madarSaveCertificate").onclick=saveCertificate;
  }
  function duration(value){const total=Math.max(0,Number(value)||0),minutes=Math.floor(total/60),seconds=Math.round(total%60);return minutes?`${ar(minutes)} د و${ar(seconds)} ث`:`${ar(seconds)} ثانية`;}
  function text(key,value){const node=document.querySelector(`[data-cert="${key}"]`);if(node)node.textContent=String(value??"").trim()||"—";}
  function openCertificate(){
    mountCertificate();const c=state.certificate||{};text("student",c.studentName);text("lesson",c.lessonName);text("code",c.unitNumber&&c.lessonNumber?`الوحدة ${ar(c.unitNumber)} · الدرس ${ar(c.lessonNumber)}`:"الوحدة — · الدرس —");text("stage",c.stageLabel);text("grade",c.gradeLabel);text("semester",c.semesterLabel);text("year",c.academicYear);text("level",c.levelLabel);text("mark",c.questionCount?`${ar(c.correctCount)} / ${ar(c.questionCount)}`:"—");text("score",c.score===0||c.score?`${ar(c.score)} نقطة`:"—");text("duration",duration(c.durationSeconds));text("teacher",c.teacherName);text("leader",c.schoolLeaderName);text("issued",c.issuedAt?`أُصدرت في ${new Date(c.issuedAt).toLocaleDateString("ar-SA")}`:"");
    const save=document.getElementById("madarSaveCertificate");save.hidden=c.enabled===false;save.disabled=Boolean(c.saved||c.portfolioId);save.textContent=save.disabled?"تم الإرسال إلى ملف الإنجاز ✓":"إرسال إلى ملف الإنجاز";document.getElementById("madarCertOverlay").hidden=false;
  }
  async function saveCertificate(){
    const button=document.getElementById("madarSaveCertificate");if(!state.certificate?.attemptId||button.disabled)return;button.disabled=true;button.textContent="جارٍ الإرسال…";
    try{const data=await studentApi("/games/certificates",{method:"POST",body:JSON.stringify({attemptId:state.certificate.attemptId})});state.certificate=data.certificate||state.certificate;button.textContent="تم الإرسال إلى ملف الإنجاز ✓";}catch(error){button.disabled=false;button.textContent="إرسال إلى ملف الإنجاز";setStatus(error.message,true,false);}
  }
  mountCertificate();
})();
