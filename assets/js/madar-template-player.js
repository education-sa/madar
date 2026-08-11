(function runTemplateGame(){
  "use strict";
  const $=(id)=>document.getElementById(id);const bridge=window.MadarGameBridge;
  const screens={setup:$("templateSetup"),play:$("templatePlay"),result:$("templateResult")};
  const state={config:null,difficulty:"easy",questions:[],index:0,score:0,correct:0,startedAt:0,questionStartedAt:0,answer:null,result:null};
  const ar=(value)=>new Intl.NumberFormat("ar-SA",{useGrouping:false}).format(Number(value)||0);
  const esc=(value)=>String(value??"").replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[character]));
  const labels={easy:"بسيط",medium:"متوسط",hard:"متقدم",multiple_choice:"اختيار من متعدد",true_false:"صح أو خطأ",matching:"مطابقة وتوصيل",ordering:"ترتيب الخطوات"};
  function screen(name){Object.entries(screens).forEach(([key,node])=>node.classList.toggle("is-active",key===name));window.scrollTo({top:0,behavior:"smooth"});}
  function toast(message){const node=$("templateToast");node.textContent=message;node.classList.add("is-visible");setTimeout(()=>node.classList.remove("is-visible"),2500);}
  function shuffle(items){const copy=[...items];for(let i=copy.length-1;i>0;i-=1){const values=new Uint32Array(1);crypto.getRandomValues(values);const j=values[0]%(i+1);[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
  async function initialize(){
    try{const config=await bridge.ready();state.config=config;const game=config.game||{};$("templateGameName").textContent=game.name||"لعبة تفاعلية";$("templateDescription").textContent=game.description||"أجيبي عن الأسئلة وتابعي تقدمك في مدار.";$("templateLessonMeta").textContent=game.unitNumber&&game.lessonNumber?`${ar(game.unitNumber)}-${ar(game.lessonNumber)} · ${game.lessonName||""}`:"—";
      const difficulties=Array.isArray(game.difficulties)&&game.difficulties.length?game.difficulties:["easy"];
      state.difficulty=difficulties[0];$("templateLevels").innerHTML=difficulties.map((item,index)=>`<button type="button" class="template-level${index===0?" is-selected":""}" data-level="${item}">${labels[item]||item}</button>`).join("");
      $("templateLevels").querySelectorAll("[data-level]").forEach((button)=>button.onclick=()=>{$("templateLevels").querySelectorAll("[data-level]").forEach((item)=>item.classList.toggle("is-selected",item===button));state.difficulty=button.dataset.level;});
      $("templateQuestionCount").textContent=`عدد أسئلة الجولة: ${ar(game.questionCount||10)}`;$("templateStart").disabled=false;
    }catch(error){toast(error.message||"تعذّر تهيئة اللعبة.");}
  }
  async function start(){
    const button=$("templateStart");button.disabled=true;
    try{const response=await bridge.startRound(state.difficulty,Number(state.config.game.questionCount)||10);state.questions=Array.isArray(response.questions)?response.questions:[];if(!state.questions.length)throw new Error("لا توجد أسئلة متاحة لهذا المستوى.");Object.assign(state,{index:0,score:0,correct:0,startedAt:Date.now(),result:null});screen("play");renderQuestion();}
    catch(error){toast(error.message||"تعذّر بدء الجولة.");}finally{button.disabled=false;}
  }
  function renderQuestion(){
    const question=state.questions[state.index];state.answer=null;state.questionStartedAt=Date.now();$("templateCounter").textContent=`السؤال ${ar(state.index+1)} من ${ar(state.questions.length)}`;$("templateLevelLabel").textContent=`المستوى ${labels[state.difficulty]||state.difficulty}`;$("templateProgress").style.width=`${state.index/state.questions.length*100}%`;$("templateScore").textContent=ar(state.score);$("templateQuestionType").textContent=labels[question.type]||question.type;$("templatePrompt").textContent=question.prompt;$("templateFeedback").hidden=true;$("templateFeedback").classList.remove("is-wrong");
    const area=$("templateAnswerArea");
    if(question.type==="multiple_choice")area.innerHTML=`<div class="template-options">${question.options.map((option,index)=>`<button class="template-option" type="button" data-answer="${index}">${esc(option)}</button>`).join("")}</div>`;
    else if(question.type==="true_false")area.innerHTML='<div class="template-options"><button class="template-option" type="button" data-answer="true">صح</button><button class="template-option" type="button" data-answer="false">خطأ</button></div>';
    else if(question.type==="matching"){
      const rights=shuffle(question.options.map((pair)=>pair.right));area.innerHTML=`<div class="template-matching">${question.options.map((pair,index)=>`<label class="template-match-row"><strong>${esc(pair.left)}</strong><select data-match="${index}"><option value="">اختاري المطابقة</option>${rights.map((right)=>`<option value="${esc(right)}">${esc(right)}</option>`).join("")}</select></label>`).join("")}</div><button class="template-primary template-submit" id="templateSubmitComplex" type="button">تحقق من الإجابة</button>`;
    }else{
      state.answer=shuffle(question.options);area.innerHTML='<div class="template-ordering" id="templateOrdering"></div><button class="template-primary template-submit" id="templateSubmitComplex" type="button">تحقق من الترتيب</button>';renderOrdering();
    }
    area.querySelectorAll("[data-answer]").forEach((button)=>button.onclick=()=>submitSimple(button,question.type==="true_false"?button.dataset.answer==="true":Number(button.dataset.answer)));
    const complex=$("templateSubmitComplex");if(complex)complex.onclick=()=>{if(question.type==="matching"){const pairs=question.options.map((pair,index)=>({left:pair.left,right:area.querySelector(`[data-match="${index}"]`).value}));if(pairs.some((pair)=>!pair.right)){toast("أكملي جميع المطابقات أولًا.");return;}submitAnswer(pairs);}else submitAnswer(state.answer);};
  }
  function renderOrdering(){const root=$("templateOrdering");if(!root)return;root.innerHTML=state.answer.map((step,index)=>`<div class="template-order-step"><strong>${ar(index+1)}</strong><span>${esc(step)}</span><div class="template-order-controls"><button type="button" data-up="${index}" ${index===0?"disabled":""}>↑</button><button type="button" data-down="${index}" ${index===state.answer.length-1?"disabled":""}>↓</button></div></div>`).join("");root.querySelectorAll("[data-up]").forEach((button)=>button.onclick=()=>{const i=Number(button.dataset.up);[state.answer[i-1],state.answer[i]]=[state.answer[i],state.answer[i-1]];renderOrdering();});root.querySelectorAll("[data-down]").forEach((button)=>button.onclick=()=>{const i=Number(button.dataset.down);[state.answer[i+1],state.answer[i]]=[state.answer[i],state.answer[i+1]];renderOrdering();});}
  function submitSimple(button,value){$("templateAnswerArea").querySelectorAll("button").forEach((item)=>item.disabled=true);button.classList.add("is-selected");submitAnswer(value,button);}
  async function submitAnswer(answer,button=null){
    const question=state.questions[state.index];
    try{const result=await bridge.submitAnswer({questionKey:question.key,answer,durationMs:Date.now()-state.questionStartedAt});state.score=Number(result.score||state.score);state.correct=Number(result.correctCount||state.correct);$("templateScore").textContent=ar(state.score);if(button)button.classList.add(result.correct?"is-correct":"is-wrong");$("templateFeedback").classList.toggle("is-wrong",!result.correct);$("templateFeedbackTitle").textContent=result.correct?"إجابة صحيحة!":"الإجابة غير صحيحة";$("templateExplanation").textContent=result.explanation||"";$("templateNext").textContent=state.index+1>=state.questions.length?"عرض النتيجة":"السؤال التالي";$("templateFeedback").hidden=false;}
    catch(error){toast(error.message||"تعذّر التحقق من الإجابة.");$("templateAnswerArea").querySelectorAll("button").forEach((item)=>item.disabled=false);}
  }
  async function next(){state.index+=1;if(state.index<state.questions.length){renderQuestion();return;}await finish();}
  async function finish(){
    const duration=Math.max(1,Math.round((Date.now()-state.startedAt)/1000));
    try{const result=await bridge.finishRound({durationSeconds:duration,questionCount:state.questions.length,correctCount:state.correct,score:state.score});state.result=result;$("templateFinalScore").textContent=`${ar(result.score)} / ${ar(state.questions.reduce((sum,q)=>sum+Number(q.points||0),0))}`;$("templateFinalCorrect").textContent=`${ar(result.correctCount)} / ${ar(result.questionCount)}`;$("templateFinalAccuracy").textContent=`${ar(result.accuracy)}٪`;$("templateFinalDuration").textContent=`${ar(duration)} ثانية`;$("templateResultMessage").textContent=result.preview?"اكتملت المعاينة ولن تُحفظ نتيجة.":"تم حفظ نتيجتك الفعلية في مدار.";$("templateSaveStatus").textContent=result.awardedPoints?`أضيفت ${ar(result.awardedPoints)} نقطة إلى رصيدكِ.`:"";$("templateCertificate").hidden=!result.certificate;screen("result");}
    catch(error){toast(error.message||"تعذّر حفظ النتيجة.");}
  }
  $("templateStart").onclick=start;$("templateNext").onclick=next;$("templateReplay").onclick=()=>screen("setup");$("templateCertificate").onclick=()=>bridge.requestCertificate().catch((error)=>toast(error.message));initialize();
})();
