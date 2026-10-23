'use strict';
/* Madar Surveys 2026: extended question types. Works with legacy rating answers. */
const msTypeLabels = {rating3:'المقياس الثلاثي',rating5:'المقياس الخماسي',choice:'اختيار واحد',multi:'اختيار متعدد',short:'إجابة قصيرة',long:'إجابة مطولة',stars:'تقييم بالنجوم',boolean:'صح أو خطأ',grid:'جدول تقييم'};
const msBank = {
 'التخطيط والإعداد':['كانت أهداف النشاط واضحة منذ البداية.','كانت الأنشطة مناسبة لاحتياجات المشاركات.','ساعد التنظيم على تحقيق الأهداف.'],
 'استراتيجيات التدريس':['تنوعت استراتيجيات التدريس بما يناسب المتعلمات.','أتاحت الأنشطة فرصة التفاعل والمشاركة.','رُوعيت الفروق الفردية بين الطالبات.'],
 'التقنية والوسائل':['أسهم توظيف التقنية في تحقيق أهداف النشاط.','كانت الوسائل التعليمية واضحة ومناسبة.','تم التعامل مع الأعطال التقنية بفاعلية.'],
 'التقويم والتطوير':['كانت أدوات التقويم مناسبة للأهداف.','قدمت التغذية الراجعة بصورة واضحة.','ما أبرز مقترحاتك للتطوير؟']
};
let msSaveTimer=null, msAutoSaving=false;
function msQuestionPosition(){return customSurvey.axes.slice(0,editorAxis).reduce((n,a)=>n+a.qs.length,0)+(editQuestionIndex===null?customSurvey.axes[editorAxis].qs.length+1:editQuestionIndex+1);}
function msConditionalChoices(){
 const max=msQuestionPosition(), all=customSurvey.axes.flatMap(a=>a.qs);
 return all.map((q,i)=>({q,number:i+1})).filter(x=>x.number<max&&['rating3','rating5','choice','boolean','stars'].includes(x.q.type||'rating3'));
}
function msAdvancedFields(q=null){
 const old=stage.querySelector('.madar-advanced-fields');if(old)old.remove();
 const selector=document.getElementById('bType');if(!selector)return;
 const type=selector.value;
 const wrapper=document.createElement('div');wrapper.className='madar-advanced-fields';
 const allowed=msConditionalChoices();
 wrapper.innerHTML=`
   <label class="madar-advanced-check"><input id="msRequired" type="checkbox" ${(q?.required??true)?'checked':''}> سؤال إلزامي</label>
   ${type==='grid'?`<label>عبارات جدول التقييم (كل عبارة في سطر)<textarea id="msGridRows" rows="4" placeholder="جودة المحتوى\nوضوح الشرح\nالتفاعل">${e((q?.rows||[]).join('\n'))}</textarea></label>`:''}
   <label>إظهار السؤال بشرط (اختياري)
    <select id="msConditionQuestion"><option value="">يظهر للجميع</option>${allowed.map(({q:prev,number})=>`<option value="${number}" ${Number(q?.showIf?.question)===number?'selected':''}>السؤال ${number} — ${e(prev.text.slice(0,65))}</option>`).join('')}</select></label>
   <label id="msConditionOptionLabel">إذا كانت إجابة السؤال السابق <select id="msConditionOption"></select></label>
   <p class="madar-note">الشرط يعتمد على سؤال اختيار سابق. لا تدخل الإجابات عن الأسئلة المخفية في النتائج.</p>`;
 const anchor=document.getElementById('customOptions')?.closest('label') || document.getElementById('bType').closest('label');
 anchor.after(wrapper);
 const question=document.getElementById('msConditionQuestion');
 const update=()=>{
  const selected=allowed.find(c=>c.number===Number(question.value));
  const option=document.getElementById('msConditionOption'),label=document.getElementById('msConditionOptionLabel');
  label.hidden=!selected;
  option.innerHTML=selected?selected.q.options.map((v,i)=>`<option value="${i}" ${q?.showIf?.question===selected.number&&q?.showIf?.option===i?'selected':''}>${e(v)}</option>`).join(''):'';
 };question.addEventListener('change',update);update();
 const custom=document.getElementById('customOptions');
 if(custom)custom.hidden=!['choice','multi','grid'].includes(type);
 document.getElementById('bReverse').disabled=!['rating3','rating5','stars'].includes(type);
 if(['multi','grid'].includes(type)){
  const options=document.getElementById('bOptions');
  if(!options.value.trim())options.value=type==='multi'?'تطبيق عملي|شرح نظري|عمل جماعي':'ممتاز|جيد جدًا|جيد|يحتاج تحسين';
 }
}
const msBaseRenderBuilder=renderBuilder;
renderBuilder=function(...args){
 msBaseRenderBuilder(...args);
 const card=stage.querySelector('.builder-card'),selector=document.getElementById('bType');
 if(!card||!selector||(!templateEditingId&&customSurvey.kind!=='custom'))return;
 const typeOptions=[['multi','اختيار متعدد'],['short','إجابة قصيرة'],['long','إجابة مطولة'],['stars','تقييم بالنجوم 1–5'],['boolean','صح أو خطأ'],['grid','جدول تقييم']];
 typeOptions.forEach(([value,label])=>selector.add(new Option(label,value)));
 selector.addEventListener('change',()=>msAdvancedFields());
 const q=editQuestionIndex!==null?customSurvey.axes[editorAxis].qs[editQuestionIndex]:null;
 if(q)selector.value=q.type||'rating3';
 msAdvancedFields(q);
 card.querySelectorAll('.q-item').forEach((item,i)=>{
  const q=customSurvey.axes[editorAxis].qs[i];
  const detail=document.createElement('small');detail.className='madar-q-type';detail.textContent=(msTypeLabels[q.type]||'مقياس ثلاثي')+(q.required===false?' · اختياري':'')+(q.showIf?' · مشروط':'');item.append(detail);
 });
 const toolbox=card.querySelector('.madar-question-type-actions');
 if(toolbox){[['multi','اختيار متعدد'],['short','إجابة قصيرة'],['long','إجابة مطولة'],['stars','النجوم'],['boolean','صح/خطأ'],['grid','جدول تقييم']].forEach(([type,label])=>{
  const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.onclick=()=>madarChooseQuestionType(type);toolbox.append(btn);
 });
  const caption=card.querySelector('.madar-question-toolbox small');if(caption)caption.textContent='الأنواع الجديدة تحفظ وتتحقق من الإجابات على الخادم مع تقارير متوافقة.';
 }
 if(!card.querySelector('.ms-question-bank')){
  const details=document.createElement('details');details.className='ms-question-bank';details.innerHTML=`<summary>بنك أسئلة مقترحة</summary><p>أسئلة قابلة للتعديل. اختاري سؤالًا لإضافته إلى المحور الحالي.</p><div class="ms-bank-tabs">${Object.keys(msBank).map((section,i)=>`<button type="button" onclick="msBankCategory(${i})">${e(section)}</button>`).join('')}</div><div id="msBankItems"></div>`;
  card.querySelector('.madar-question-toolbox')?.after(details);
 }
 // Only previously saved drafts get background saves; new surveys are saved explicitly.
 if(!card.dataset.msAutoHook){card.dataset.msAutoHook='yes';card.addEventListener('change',msQueueDraftSave);card.addEventListener('input',ev=>{if(['bTitle','bLesson','madarAxisLabel'].includes(ev.target.id))msQueueDraftSave();});}
};
const msBaseEditQuestion=editQuestion;
editQuestion=function(i){msBaseEditQuestion(i);msAdvancedFields(customSurvey.axes[editorAxis].qs[i]);};
const msBaseAddQuestion=addQuestion;
addQuestion=function(){
 const title=document.getElementById('newQText')?.value.trim();if(!title){notify('اكتبي نص السؤال أولًا.',true);return;}
 const type=document.getElementById('bType').value;
 const opts=['rating3'].includes(type)?[...TRI]:['rating5','stars'].includes(type)?['1','2','3','4','5']:type==='boolean'?['صح','خطأ']:['short','long'].includes(type)?[]:document.getElementById('bOptions').value.split('|').map(v=>v.trim()).filter(Boolean);
 if(!['short','long'].includes(type)&&(opts.length<2||opts.length>10||new Set(opts).size!==opts.length)){notify('حددي بين خيارين و10 خيارات مختلفة.',true);return;}
 const q={text:title,type,options:opts,reverse:['rating3','rating5','stars'].includes(type)&&document.getElementById('bReverse').checked,required:document.getElementById('msRequired')?.checked??true};
 if(type==='grid'){
  q.rows=(document.getElementById('msGridRows')?.value||'').split('\n').map(v=>v.trim()).filter(Boolean);
  if(q.rows.length<1||q.rows.length>12||new Set(q.rows).size!==q.rows.length){notify('اكتبي من عبارة إلى 12 عبارة مختلفة في جدول التقييم.',true);return;}
 }
 const ref=document.getElementById('msConditionQuestion')?.value;
 if(ref)q.showIf={question:Number(ref),option:Number(document.getElementById('msConditionOption').value)};
 const list=customSurvey.axes[editorAxis].qs;
 if(editQuestionIndex===null){if(list.length>=100)return notify('الحد الأقصى 100 سؤال للمحور.',true);list.push(q);}
 else list[editQuestionIndex]=q;
 editQuestionIndex=null;renderBuilder();msQueueDraftSave();
};
function msBankCategory(index){
 const section=Object.keys(msBank)[index],area=document.getElementById('msBankItems');if(!area)return;
 area.innerHTML=msBank[section].map((item,i)=>`<button type="button" onclick="msPickBank(${index},${i})">+ ${e(item)}</button>`).join('');
}
function msPickBank(a,i){
 const text=msBank[Object.keys(msBank)[a]][i];
 document.getElementById('newQText').value=text;
 document.getElementById('bType').value=text.includes('مقترحاتك')?'long':'rating3';
 document.getElementById('bType').dispatchEvent(new Event('change'));
 notify('نُسخ السؤال إلى المحرر. عدّليه واضغطي إضافة لحفظه.');
}
function msQueueDraftSave(){
 if(!editingId||personalTemplateEditingId||templateEditingId||busy||currentAppState!=='builder'||customSurvey.kind!=='custom')return;
 clearTimeout(msSaveTimer);
 msSaveTimer=setTimeout(msSilentSave,2200);
}
async function msSilentSave(){
 if(msAutoSaving||busy||!editingId||currentAppState!=='builder'||personalTemplateEditingId||templateEditingId)return;
 if(customSurvey.axes.some(a=>!a.name.trim()||!a.qs.length))return;
 msAutoSaving=true;
 try{
  const result=await api('save',{...customSurvey,id:editingId,revision:editingRevision});
  editingRevision=result.survey.revision;
  const label=stage.querySelector('.ms-auto-status')||document.createElement('div');label.className='ms-auto-status';label.textContent='✓ حُفظت التعديلات تلقائيًا';
  stage.querySelector('.builder-title')?.after(label);
 }catch(error){notify('تعذر الحفظ التلقائي: '+error.message,true);}finally{msAutoSaving=false;}
}
const msBaseInitSurveyEngine=initSurveyEngine;
initSurveyEngine=function(...args){
 msBaseInitSurveyEngine(...args);
 ALL_Q.forEach(q=>{
  const card=document.getElementById('card-'+q.id),wrapper=card?.querySelector('.custom-bar-wrapper');if(!wrapper)return;
  const type=q.type||'rating3';
  if(type==='multi')wrapper.innerHTML=`<fieldset class="ms-advanced-answer"><legend>اختاري إجابة واحدة أو أكثر</legend>${q.options.map((v,i)=>`<label><input type="checkbox" data-ms-q="${q.id}" value="${i}"> ${e(v)}</label>`).join('')}</fieldset>`;
  else if(type==='short')wrapper.innerHTML=`<label class="ms-advanced-answer">إجابة قصيرة<input class="ms-answer-text" data-ms-q="${q.id}" maxlength="300" placeholder="اكتبي إجابتك هنا"></label>`;
  else if(type==='long')wrapper.innerHTML=`<label class="ms-advanced-answer">إجابة مطولة<textarea class="ms-answer-text" data-ms-q="${q.id}" maxlength="4000" rows="5" placeholder="اكتبي ملاحظاتك ومقترحاتك هنا"></textarea></label>`;
  else if(type==='grid')wrapper.innerHTML=`<div class="ms-table-wrap"><table class="ms-grid-answer"><thead><tr><th>العبارة</th>${q.options.map(x=>`<th>${e(x)}</th>`).join('')}</tr></thead><tbody>${(q.rows||[]).map((r,ri)=>`<tr><th>${e(r)}</th>${q.options.map((_,oi)=>`<td><label><input type="radio" data-ms-q="${q.id}" name="${q.id}_row${ri}" data-row="${ri}" value="${oi}" aria-label="${e(r)} — ${e(q.options[oi])}"></label></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if(q.required===false)card.insertAdjacentHTML('beforeend','<p class="ms-optional">هذا السؤال اختياري ويمكن تخطيه.</p>');
  if(q.showIf)card.insertAdjacentHTML('beforeend','<p class="ms-optional">يظهر هذا السؤال وفق إجابتك السابقة.</p>');
 });
 stage.querySelectorAll('[data-ms-q]').forEach(input=>input.addEventListener('input',msAnswerChange));
};
function msAnswerChange(event){
 const input=event.target,id=input.dataset.msQ,q=ALL_Q.find(q=>q.id===id);if(!q)return;
 if(q.type==='multi'){
  const values=[...stage.querySelectorAll(`[data-ms-q="${id}"]:checked`)].map(el=>Number(el.value));
  if(values.length)state.answers[id]=values.sort((a,b)=>a-b);else delete state.answers[id];
 }else if(q.type==='grid'){
  const radios=[...stage.querySelectorAll(`[data-ms-q="${id}"]:checked`)];
  if(radios.length)state.answers[id]=Object.fromEntries(radios.map(el=>[el.dataset.row,Number(el.value)]));else delete state.answers[id];
 }else{if(input.value.trim())state.answers[id]=input.value.trim();else delete state.answers[id];}
 updateNav();updateProgress();
}
function msIsVisible(q){return !q.showIf||state.answers['q'+q.showIf.question]===q.showIf.option;}
function msHasAnswer(q){
 if(!msIsVisible(q)||q.required===false)return true;
 const v=state.answers[q.id];
 if(v===undefined||v===null)return false;
 if(q.type==='multi')return Array.isArray(v)&&v.length>0;
 if(q.type==='grid')return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===(q.rows||[]).length;
 if(q.type==='short'||q.type==='long')return typeof v==='string'&&v.trim().length>0;
 return Number.isInteger(v)&&v>=0&&v<q.options.length;
}
const msBaseSelectAnswer=selectAnswer;
selectAnswer=function(id,index){
 msBaseSelectAnswer(id,index);
 ALL_Q.forEach(q=>{if(q.showIf&&!msIsVisible(q))delete state.answers[q.id];});
};
const msBaseGoTo=goTo;
goTo=function(index){
 if(currentAppState==='survey'&&index>=1&&index<=TOTAL_Q){
  const d=index>currentScreen?1:-1;
  while(index>=1&&index<=TOTAL_Q&&!msIsVisible(ALL_Q[index-1]))index+=d;
  if(index<1)index=0;
 }
 msBaseGoTo(index);
};
const msBaseUpdateNav=updateNav;
updateNav=function(){
 msBaseUpdateNav();
 if(currentAppState==='survey'&&currentScreen>=1&&currentScreen<=TOTAL_Q){const q=ALL_Q[currentScreen-1];btnNext.disabled=!msHasAnswer(q);}
};
function msAnswerDisplay(q,answer,answers=state.answers){
 if(q.showIf&&answers['q'+q.showIf.question]!==q.showIf.option)return 'لم يظهر السؤال';
 if(answer===undefined||answer===null)return 'لم تُجب';
 if(q.type==='multi')return Array.isArray(answer)?answer.map(i=>q.options[i]||'').join('، '):'—';
 if(['short','long'].includes(q.type))return String(answer);
 if(q.type==='grid')return(q.rows||[]).map((r,i)=>r+': '+(q.options[answer[i]]||'—')).join(' | ');
 return q.options[answer]??'—';
}
buildReview=function(){
 const target=document.getElementById('reviewContent');if(!target)return;
 target.innerHTML='<h2>مراجعة الإجابات قبل الإرسال</h2>'+ALL_Q.filter(msIsVisible).map(q=>`<div class="review-axis"><div class="ra-head"><span class="ra-title">${e(q.num+'. '+q.text)}</span><button class="ra-edit" onclick="goTo(${q.num})">تعديل</button></div><div class="ra-answers"><span class="ra-chip mid">${e(msAnswerDisplay(q,state.answers[q.id]))}</span></div></div>`).join('');
};
submitSurvey=async function(){
 if(!currentRemote){notify('هذه معاينة فقط، لا تُحفظ الإجابات قبل نشر الاستبيان.',true);return;}
 if(busy)return;
 const missing=ALL_Q.find(q=>msIsVisible(q)&&!msHasAnswer(q));
 if(missing){goTo(missing.num);notify('يرجى إكمال السؤال المطلوب.',true);return;}
 const accepted=Object.fromEntries(Object.entries(state.answers).filter(([key])=>{const q=ALL_Q.find(q=>q.id===key);return q&&msIsVisible(q)&&state.answers[key]!==undefined;}));
 if(!document.getElementById('identityConsent')?.checked){goTo(TOTAL_Q+1);notify('يلزم الموافقة على إرسال التقييم باسمك.',true);return;}
 busy=true;btnNext.disabled=true;
 try{await api(guestMode?'guest_submit':'submit',{id:currentRemote.id,token:new URLSearchParams(location.search).get('s'),answers:accepted,notes:state.notes,identity_consent:true});goTo(TOTAL_Q+3);}
 catch(err){notify(err.message,true);}finally{busy=false;updateNav();}
};
const msBaseScoreable=isScoreable;
isScoreable=function(q){return msBaseScoreable(q)||q.type==='stars';};
const msBaseAggregate=computeAggregate;
computeAggregate=function(survey,responses){
 const data=msBaseAggregate(survey,responses);
 data.questions.forEach(q=>{
  if(q.type==='multi'){
   q.counts=q.options.map((_,i)=>responses.reduce((n,r)=>n+(Array.isArray(r.answers?.[q.id])&&r.answers[q.id].includes(i)?1:0),0));
   q.answered=responses.filter(r=>Array.isArray(r.answers?.[q.id])).length;
  }
  if(q.type==='grid')q.gridRows=(q.rows||[]).map((row,i)=>({row,counts:q.options.map((_,o)=>responses.reduce((n,r)=>n+(r.answers?.[q.id]?.[i]===o?1:0),0))}));
  if(['short','long'].includes(q.type))q.textAnswers=responses.filter(r=>typeof r.answers?.[q.id]==='string'&&r.answers[q.id].trim()).map(r=>({name:r.reviewerName,text:r.answers[q.id]}));
 });
 return data;
};
const msBaseCompactBar=compactBar;
compactBar=function(q){
 if(['multi','grid','short','long'].includes(q.type))return '<div class="stacked-track"><span class="chart-no-data">تفاصيل هذا السؤال تظهر في التقرير بالأسفل</span></div>';
 return msBaseCompactBar(q);
};
const msBaseReport=renderAggregateReport;
renderAggregateReport=function(survey,data,demo=false){
 msBaseReport(survey,data,demo);
 if(!data.participants)return;
 // Replace legacy one-choice detail cells with accurate displays for every answer type.
 stage.querySelectorAll('.reviewer-details').forEach((detail,i)=>{
  const answers=data.responses[i]?.answers||{};
  detail.querySelectorAll('.review-answer-row b').forEach((cell,j)=>{
   const q=data.questions[j];if(q)cell.textContent=msAnswerDisplay(q,answers[q.id],answers);
  });
 });
 const types=data.questions.filter(q=>['multi','short','long','grid'].includes(q.type));
 if(!types.length)return;
 const section=document.createElement('section');section.className='ms-advanced-report compact-sheet';
 section.innerHTML='<h2>التحليل التفصيلي للأسئلة المتقدمة</h2>'+types.map(q=>{
  let body='';
  if(q.type==='multi')body='<p>يمكن للمشاركة اختيار أكثر من إجابة، لذلك قد يتجاوز مجموع النسب 100%.</p>'+q.options.map((opt,i)=>`<div class="ms-report-row"><span>${e(opt)}</span><b>${q.counts[i]} (${q.answered?((q.counts[i]/q.answered)*100).toFixed(1):'0'}%)</b></div>`).join('');
  else if(['short','long'].includes(q.type))body=(q.textAnswers||[]).map(x=>`<div class="ms-report-comment"><b>${e(x.name)}</b><p>${e(x.text)}</p></div>`).join('')||'<p>لا توجد إجابات نصية.</p>';
  else if(q.type==='grid')body=(q.gridRows||[]).map(row=>`<div class="ms-report-grid-row"><b>${e(row.row)}</b>${q.options.map((opt,i)=>`<span>${e(opt)}: ${row.counts[i]}</span>`).join('')}</div>`).join('');
  return `<div class="ms-report-section"><h3>${e(q.text)}</h3>${body}</div>`;
 }).join('');
 stage.querySelector('.compact-bottom')?.before(section);
};

async function msSchoolPublish(id){
 try{const r=await api('school_template_publish',{id,enabled:true});notify(r.message);}
 catch(err){notify(err.message,true);}
}
async function msSchoolUnpublish(id){
 if(!confirm('إيقاف ظهور القالب في مكتبة مدرستك؟ النسخ الموجودة لدى زميلاتك لن تتأثر.'))return;
 try{const r=await api('school_template_publish',{id,enabled:false});notify(r.message);}
 catch(err){notify(err.message,true);}
}
async function msSchoolLibrary(){
 try{
  const result=await api('school_template_list');
  portal(`<section class="survey-tools madar-personal-library"><p class="tools-kicker">تبادل الخبرات</p><h1>مكتبة قوالب المدرسة</h1>
    <p>القوالب المتاحة من معلمات مدرستك. كل استخدام يحفظ نسخة مستقلة قابلة للتعديل.</p>
    ${result.notice?`<p class="error-box">${e(result.notice)}</p>`:''}
    <div class="madar-my-templates">${result.items.map(t=>`<article class="portal-card"><h2>${e(t.name)}</h2><p>من إعداد: ${e(t.author)}</p>
      <button onclick="msSchoolImport(${Number(t.id)})">حفظ نسخة في مكتبتي</button></article>`).join('')||'<p>لا توجد قوالب منشورة في مكتبة مدرستك بعد.</p>'}</div>
    <button onclick="personalTemplateLibrary()">العودة إلى مكتبتي</button></section>`);
 }catch(err){notify(err.message,true);}
}
async function msSchoolImport(id){
 try{const r=await api('school_template_import',{id});await personalTemplateLibrary('received');notify(r.message);}
 catch(err){notify(err.message,true);}
}
async function msSendToTeacher(id){
 try{
  const result=await api('template_recipients');
  portal(`<section class="portal-card ms-recipients"><h1>إرسال قالب إلى معلمات مدار</h1>
   <p>ستحصل كل معلمة على نسخة مستقلة من القالب في مكتبتها، دون أي نتائج أو بيانات مشاركات.</p>
   <label>اختاري المعلمات (حتى 20 معلمة)
     <select id="msTeacherSelect" multiple size="9">${result.items.map(u=>`<option value="${Number(u.id)}">${e(u.name)}</option>`).join('')}</select></label>
   <p class="madar-note">على ماك: اضغطي ⌘ لاختيار أكثر من معلمة.</p>
   <div class="portal-actions"><button onclick="msSubmitToTeachers(${id})">إرسال النسخ</button><button onclick="personalTemplateLibrary()">إلغاء</button></div></section>`);
 }catch(err){notify(err.message,true);}
}
async function msSubmitToTeachers(id){
 const element=document.getElementById('msTeacherSelect');
 const recipients=[...element.selectedOptions].map(o=>Number(o.value));
 if(!recipients.length)return notify('اختاري معلمة واحدة على الأقل.',true);
 try{const r=await api('template_send',{id,recipients});await personalTemplateLibrary();notify(r.message);}
 catch(err){notify(err.message,true);}
}

// Participant history must also support non-numeric responses.
listParticipated=async function(){
 try{
  const result=await api('participated');
  portal('<h1>الاستبيانات التي شاركت فيها</h1>'+result.items.map(s=>{
   const answers=JSON.parse(s.answers),qs=getQuestions(JSON.parse(s.definition));
   return `<details class="portal-card"><summary>${e(s.title)} · ${e(s.teacher)} · ${e(s.submitted_at)} UTC</summary>${qs.map(q=>`<p>${e(q.text)}: <b>${e(msAnswerDisplay(q,answers[q.id],answers))}</b></p>`).join('')}<p>${e(s.notes)}</p></details>`;
  }).join('')+(result.items.length?'':'<p>لا توجد مشاركات سابقة.</p>'));
 }catch(err){notify(err.message,true);}
};


// Reuse the stored required flag; show only an accessible star toggle.
function madarRequiredStar(){
 const input=document.getElementById('msRequired'),row=stage.querySelector('.add-q-row');if(!input||!row)return;
 input.hidden=true;
 let mark=stage.querySelector('.madar-required-star');if(!mark){mark=document.createElement('span');mark.className='madar-required-star';}
 const button=document.createElement('button');button.type='button';button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01z"/></svg>';
 button.style.cssText='display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;padding:3px;box-shadow:none;cursor:pointer;flex:none';
 const update=()=>{button.style.color=input.checked?'#16a34a':'#9ca3af';button.setAttribute('aria-pressed',String(input.checked));button.setAttribute('aria-label',input.checked?'سؤال إجباري':'سؤال غير إجباري');button.title=input.checked?'سؤال إجباري':'سؤال غير إجباري';};
 button.onclick=()=>{input.checked=!input.checked;update();input.dispatchEvent(new Event('change',{bubbles:true}));notify(input.checked?'هذا السؤال إجباري.':'هذا السؤال غير إجباري.');};
 const oldLabel=input.closest('label');mark.replaceChildren(input,button);if(oldLabel&&oldLabel!==mark)oldLabel.remove();update();
 const heading=stage.querySelector('.madar-question-heading');if(heading)heading.append(mark);else row.before(mark);
}
const compactBuilderBase=renderBuilder;
renderBuilder=function(...args){
 compactBuilderBase(...args);
 const card=stage.querySelector('.builder-card'),axis=document.getElementById('madarAxisLabel');if(!card||!axis)return;
 customSurvey.performance=true;const performance=document.getElementById('bPerformance');if(performance){performance.checked=true;performance.closest('label').hidden=true;}card.querySelector('.question-pages')?.remove();
 const row=card.querySelector('.add-q-row'),field=document.getElementById('newQText');if(!row||!field)return;
 const composer=document.createElement('div');composer.className='madar-compact-composer';
 const heading=document.createElement('div');heading.className='madar-question-heading';heading.style.cssText='display:flex;align-items:center;gap:8px;margin:14px 0 8px';
 const label=document.createElement('label');label.htmlFor='newQText';label.style.cssText='font-weight:800;color:#432a6e;margin:0';const number=editQuestionIndex===null?customSurvey.axes[editorAxis].qs.length+1:editQuestionIndex+1;label.textContent=number===1?'السؤال الأول':'السؤال '+number;heading.append(label);
 axis.closest('label').after(composer);composer.append(heading,row);row.style.cssText='display:flex;flex-direction:column;align-items:stretch;gap:10px;margin-bottom:14px';
 field.style.cssText=axis.style.cssText;field.style.width='100%';field.style.boxSizing='border-box';field.style.minHeight='52px';field.style.padding='12px 16px';field.style.border='1px solid #ded5ee';field.style.borderRadius='12px';field.style.font='inherit';field.style.background='#fff';
 field.placeholder='اكتبي السؤال أو اختاريه من بنك الأسئلة المقترحة';field.setAttribute('aria-label',label.textContent);const add=row.querySelector('button');if(add)add.style.cssText+=';align-self:flex-start;padding:10px 22px';madarRequiredStar();
};
const compactAdvancedFieldsBase=msAdvancedFields;
msAdvancedFields=function(...args){
 const previous=document.getElementById('msRequired')?.checked;
 stage.querySelector('.madar-required-star')?.remove();compactAdvancedFieldsBase(...args);
 if(!args[0]&&previous!==undefined)document.getElementById('msRequired').checked=previous;
 madarRequiredStar();
};

function madarSimplifyQuestionTools(){
 const bank=stage.querySelector('.ms-question-bank'),type=document.getElementById('bType')?.closest('label');if(bank&&type&&!type.closest('.madar-answer-type-box')){bank.after(type);type.style.cssText='display:block;margin:12px 0 0;width:100%';}
 stage.querySelector('.madar-question-toolbox')?.setAttribute('hidden','');
 document.getElementById('msConditionQuestion')?.closest('label')?.setAttribute('hidden','');
 document.getElementById('msConditionOptionLabel')?.setAttribute('hidden','');
 stage.querySelector('.madar-advanced-fields .madar-note')?.setAttribute('hidden','');
 document.getElementById('bReverse')?.closest('label')?.setAttribute('hidden','');
}
const simpleBuilderBase=renderBuilder;
renderBuilder=function(...args){simpleBuilderBase(...args);madarSimplifyQuestionTools();};
const simpleFieldsBase=msAdvancedFields;
msAdvancedFields=function(...args){simpleFieldsBase(...args);madarSimplifyQuestionTools();};

const matchedAnswerBuilderBase=renderBuilder;
renderBuilder=function(...args){
 matchedAnswerBuilderBase(...args);
 const bank=stage.querySelector('.ms-question-bank'),field=document.getElementById('bType')?.closest('label');if(!bank||!field)return;
 const box=document.createElement('details');box.className=bank.className+' madar-answer-type-box';
 const summary=document.createElement('summary');summary.textContent='نوع إجابة السؤال الجديد';box.append(summary);
 const content=document.createElement('div');content.style.cssText='padding:12px 0 0';content.append(field);box.append(content);bank.after(box);
 const selector=document.getElementById('bType');field.hidden=true;const tiles=document.createElement('div');tiles.id='msAnswerTypeTiles';tiles.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px';
 for(const option of selector.options){const button=document.createElement('button');button.type='button';button.textContent=option.textContent;button.dataset.value=option.value;button.style.cssText='font:inherit;font-size:13px;font-weight:700;padding:12px;border-radius:12px;border:1px solid #ded5ee;background:#fff;color:#51337e;cursor:pointer';button.onclick=()=>{selector.value=option.value;selector.dispatchEvent(new Event('change'));notify('نوع الإجابة: '+option.textContent);};tiles.append(button);}
 content.append(tiles);selector.addEventListener('change',madarRefreshAnswerTiles);madarRefreshAnswerTiles();
 for(const node of [...field.childNodes])if(node.nodeType===Node.TEXT_NODE)node.remove();
 field.style.cssText='display:block;margin:0;width:100%';document.getElementById('bType').setAttribute('aria-label','نوع إجابة السؤال الجديد');
};

function madarRefreshAnswerTiles(){const selected=document.getElementById('bType')?.value;stage.querySelectorAll('#msAnswerTypeTiles button').forEach(button=>{const active=button.dataset.value===selected;button.setAttribute('aria-pressed',String(active));button.style.background=active?'#ede5fa':'#fff';button.style.borderColor=active?'#8560ba':'#ded5ee';button.style.boxShadow=active?'0 0 0 1px #8560ba':'none';});}

const displayModeBuilderBase=renderBuilder;
renderBuilder=function(...args){
 displayModeBuilderBase(...args);const card=stage.querySelector('.builder-card');if(!card||!document.getElementById('bType'))return;
 card.querySelectorAll('p').forEach(p=>{if(p.textContent.includes('الشعار من ملف مدرستك.'))p.remove();});
 const box=document.createElement('fieldset');box.style.cssText='border:1px solid #ded5ee;border-radius:14px;padding:14px;margin:18px 0';box.innerHTML='<legend style="font-weight:800;color:#51337e;padding:0 6px">طريقة العرض</legend>';
 for(const [value,text] of [['question','سؤال مستقل'],['axis','محور مستقل']]){const label=document.createElement('label');label.style.cssText='display:inline-flex;align-items:center;gap:8px;margin-inline-end:20px;font-weight:700;cursor:pointer';const input=document.createElement('input');input.type='radio';input.name='surveyDisplayMode';input.value=value;input.checked=(customSurvey.display_mode||'question')===value;input.onchange=()=>{customSurvey.display_mode=value;msQueueDraftSave();};label.append(input,document.createTextNode(text));box.append(label);}
 (card.querySelector('.madar-answer-type-box')||card.querySelector('.builder-extras')).after(box);
};
let madarAxisPages=[];
function madarAxisMode(){return currentAppState==='survey'&&activeSurvey?.display_mode==='axis';}
const axisModeInitBase=initSurveyEngine;
initSurveyEngine=function(...args){
 madarAxisPages=[];axisModeInitBase(...args);if(!madarAxisMode())return;
 let index=0;activeSurvey.axes.forEach(axis=>{const numbers=axis.qs.map(()=>++index);if(!numbers.length)return;const first=numbers[0],container=stage.querySelector('.screen[data-idx="'+first+'"] .question-container');numbers.forEach((number,i)=>{const card=document.getElementById('card-q'+number);card.style.marginBottom='18px';if(i)container.append(card);});madarAxisPages.push({first,numbers});});
};
const axisModeGoBase=goTo;
goTo=function(index){
 if(madarAxisMode()&&madarAxisPages.length&&index>=1&&index<=TOTAL_Q){
  const current=madarAxisPages.find(p=>p.first===currentScreen);
  if(current&&index===currentScreen+1){const next=madarAxisPages[madarAxisPages.indexOf(current)+1];index=next?next.first:TOTAL_Q+1;}
  else index=madarAxisPages.find(p=>p.numbers.includes(index))?.first??index;
 }
 (madarAxisMode()?msBaseGoTo:axisModeGoBase)(index);if(madarAxisMode())madarUpdateAxisCards();
};
function madarUpdateAxisCards(){ALL_Q.forEach(q=>{const card=document.getElementById('card-'+q.id);if(card)card.hidden=!msIsVisible(q);});}
const axisModeNavBase=updateNav;
updateNav=function(){axisModeNavBase();if(!madarAxisMode())return;const page=madarAxisPages.find(p=>p.first===currentScreen);if(page)btnNext.disabled=page.numbers.some(n=>!msHasAnswer(ALL_Q[n-1]));};
const axisModeAnswerBase=selectAnswer;
selectAnswer=function(...args){axisModeAnswerBase(...args);if(madarAxisMode()){clearTimeout(advanceTimer);madarUpdateAxisCards();updateNav();}};
const axisModeTextBase=msAnswerChange;
msAnswerChange=function(...args){axisModeTextBase(...args);if(madarAxisMode()){madarUpdateAxisCards();updateNav();}};

const modeCloneBase=madarCloneTemplateToBuilder;madarCloneTemplateToBuilder=function(t,...args){modeCloneBase(t,...args);customSurvey.display_mode=t.definition.display_mode||'question';renderBuilder();};

function madarHideEmptyExtras(){const extras=stage.querySelector('.builder-extras');if(!extras)return;const advanced=extras.querySelector('.madar-advanced-fields');if(advanced)advanced.hidden=![...advanced.children].some(child=>!child.hidden);extras.hidden=![...extras.children].some(child=>!child.hidden);}
const emptyExtrasBuilderBase=renderBuilder;renderBuilder=function(...args){emptyExtrasBuilderBase(...args);madarHideEmptyExtras();};
const emptyExtrasFieldsBase=msAdvancedFields;msAdvancedFields=function(...args){emptyExtrasFieldsBase(...args);madarHideEmptyExtras();};

const referencePrintBase=renderAggregateReport;
renderAggregateReport=function(survey,data,demo=false){
 referencePrintBase(survey,data,demo);
 const host=stage.querySelector('.analysis-container');if(!host)return;
 const pct=n=>n===null||!Number.isFinite(n)?'—':n.toFixed(1).replace(/\.0$/,'')+'%';
 const values=data.questions.map(q=>q.meanScore).filter(n=>n!==null&&Number.isFinite(n));
 const paper=document.createElement('section');paper.className='reference-paper';
 const logo='<div class="rp-authority"><div>المملكة العربية السعودية</div><div>وزارة التعليم</div><div>مكتب تعليم الخرمة بالطائف</div><div>مجمع مدارس ظليم للبنات</div></div>';
 paper.innerHTML='<header class="rp-header">'+logo+'<div><small>'+e(SCHOOL_NAME)+'</small><h1>تقرير تحليل الاستبيان</h1><h2>'+e(survey.title)+'</h2><p>'+e(survey.teacher)+' · '+e(survey.lesson||'')+'</p></div><img src="'+e(VISION_2030_LOGO)+'" alt="رؤية 2030"></header>'+
 '<div class="rp-meta">تاريخ التقرير: '+new Date().toLocaleDateString('ar-SA')+'</div><h3>ملخص نتائج الأسئلة</h3><table class="rp-table"><thead><tr><th>م</th><th>السؤال</th><th>المحور</th><th>الإجابات</th><th>المتوسط</th></tr></thead><tbody>'+data.questions.map((q,i)=>'<tr><td>'+(i+1)+'</td><td>'+e(q.text)+'</td><td>'+e(data.axes[q.axisNo]?.name||q.axisName||'')+'</td><td>'+Number(q.answered)+'</td><td>'+pct(q.meanScore)+'</td></tr>').join('')+'</tbody></table>'+
 '<div class="rp-stats">'+[[data.participants,'عدد المشاركات'],[data.questions.length,'عدد الأسئلة'],[pct(data.overall),'المتوسط العام'],[values.length?pct(Math.max(...values)):'—','أعلى نسبة'],[values.length?pct(Math.min(...values)):'—','أدنى نسبة']].map(([v,l])=>'<div><b>'+e(String(v))+'</b><span>'+l+'</span></div>').join('')+'</div>'+
 '<h3>مقارنة نتائج الأسئلة</h3><div class="rp-legend"><i></i> متوسط التقييم</div><div class="rp-chart">'+data.questions.map((q,i)=>'<div class="rp-row"><strong>'+(i+1)+'. '+e(q.text)+'</strong>'+(q.meanScore===null?'<span class="rp-no-score">'+e(q.options.map((o,j)=>o+': '+q.counts[j]).join(' · '))+'</span><b>—</b>':'<span class="rp-track"><i style="width:'+Math.max(0,Math.min(100,q.meanScore))+'%"></i></span><b>'+pct(q.meanScore)+'</b>')+'</div>').join('')+'</div>'+
 '<div class="rp-bottom"><section><h3>نتائج المحاور</h3>'+data.axes.map(a=>'<p>'+e(a.name)+' <b>'+pct(a.score)+'</b></p>').join('')+'</section><section><h3>التوصيات</h3><p>'+e(data.overall===null?'لا توجد إجابات رقمية كافية لقياس الأداء.':data.overall<70?'تعزيز الجوانب الأقل تقييمًا، وتنويع الأنشطة، وإعادة القياس بعد تطبيق التحسينات.':'تعزيز الممارسات الأعلى تقييمًا ومتابعة فرص التحسين في الأسئلة الأقل نتيجة.')+'</p></section></div><footer>'+e(SCHOOL_NAME)+' · استبيانات مدار <span>1 / 1</span></footer>';
 host.append(paper);
 const preview=document.createElement('button');preview.type='button';preview.textContent='معاينة صفحة الطباعة';preview.onclick=()=>{host.classList.add('reference-preview');paper.style.zoom=String(Math.min(1,(window.innerWidth-45)/720));};stage.querySelector('.report-actions')?.append(preview);
 const back=document.createElement('button');back.type='button';back.className='rp-preview-back';back.textContent='العودة للتحليل';back.onclick=()=>{host.classList.remove('reference-preview');paper.style.zoom='';};host.prepend(back);
};
window.addEventListener('beforeprint',()=>{const paper=stage.querySelector('.reference-paper');if(!paper)return;paper.style.zoom='1';const height=Math.max(paper.scrollHeight,paper.getBoundingClientRect().height);paper.style.zoom=String(Math.min(1,1035/height));});
window.addEventListener('afterprint',()=>{const paper=stage.querySelector('.reference-paper');if(paper)paper.style.zoom=stage.querySelector('.reference-preview')?String(Math.min(1,(window.innerWidth-45)/720)):'';});

const axesFirstReportBase=renderAggregateReport;
renderAggregateReport=function(survey,data,...args){
 axesFirstReportBase(survey,data,...args);const paper=stage.querySelector('.reference-paper');if(!paper)return;
 const table=paper.querySelector('.rp-table');if(table){table.previousElementSibling?.remove();table.remove();}
 const questionHeading=[...paper.querySelectorAll('h3')].find(h=>h.textContent==='مقارنة نتائج الأسئلة');if(!questionHeading)return;questionHeading.textContent='تحليل كل سؤال';
 const section=document.createElement('section');section.className='rp-axis-analysis';const pct=n=>n===null?'—':n.toFixed(1).replace(/\.0$/,'')+'%';
 section.innerHTML='<h3>تحليل المحاور</h3>'+data.axes.map((axis,i)=>'<div class="rp-row"><strong>'+(i+1)+'. '+e(axis.name)+'</strong><span class="rp-track"><i style="width:'+(axis.score===null?0:Math.max(0,Math.min(100,axis.score)))+'%"></i></span><b>'+pct(axis.score)+'</b></div>').join('');questionHeading.before(section);
 const oldAxes=paper.querySelector('.rp-bottom section');if(oldAxes?.querySelector('h3')?.textContent==='نتائج المحاور')oldAxes.remove();const bottom=paper.querySelector('.rp-bottom');if(bottom)bottom.style.gridTemplateColumns='1fr';
};

const feedbackPrintBase=renderAggregateReport;
renderAggregateReport=function(survey,data,...args){
 feedbackPrintBase(survey,data,...args);const bottom=stage.querySelector('.reference-paper .rp-bottom');if(!bottom)return;
 const scored=data.questions.filter(q=>q.meanScore!==null&&Number.isFinite(q.meanScore));const list=descending=>[...scored].sort((a,b)=>descending?b.meanScore-a.meanScore:a.meanScore-b.meanScore).slice(0,3).map(q=>'<li><b>'+e(q.text)+' ('+q.meanScore.toFixed(1).replace(/\.0$/,'')+'%)</b></li>').join('')||'<li>لا توجد نتائج رقمية كافية.</li>';
 bottom.style.gridTemplateColumns='1fr 1fr';bottom.innerHTML='<section><h3>أعلى 3 مؤشرات</h3><ul style="padding-right:17px;font-size:10px">'+list(true)+'</ul></section><section><h3>↗ أبرز 3 فرص للتحسين</h3><ul style="padding-right:17px;font-size:10px">'+list(false)+'</ul></section>';
};
