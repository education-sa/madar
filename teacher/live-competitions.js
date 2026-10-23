const STATUS_LABELS={lobby:"ردهة الانتظار",question_open:"السؤال مفتوح",question_closed:"أُغلقت الإجابات",completed:"اكتملت",cancelled:"ملغاة"};
const DIFFICULTY_LABELS={easy:"سهل",medium:"متوسط",hard:"صعب"};

export function createTeacherLiveCompetitions({api,escapeHtml,toast,confirmAction,getClasses}){
  const state={root:null,classId:sessionStorage.getItem("madarLiveCompetitionClass")||"",filters:{unit:"",lesson:"",skillId:"",difficulty:""},meta:null,live:null,timer:null,clockTimer:null,abort:null,errorCount:0,active:false,serverNowMs:0,receivedAtMs:0};

  const sound = createCompetitionAudio();
  function mountAudioControls() {
    const panel = document.createElement('section');
    panel.className = 'card';
    panel.setAttribute('aria-label','أصوات المسابقة');
    panel.style.cssText = 'padding:16px;margin:16px 0;display:flex;flex-wrap:wrap;gap:12px;align-items:center';
    panel.innerHTML = '<button type="button" class="btn btn-primary" data-contest-sound></button><button type="button" class="btn btn-outline" data-contest-sound-test>تجربة الصوت والتشجيع</button><p data-contest-sound-status role="status" style="margin:0;flex-basis:100%"></p>';
    state.root.querySelector('[data-live-workspace]').before(panel);
    const toggle = panel.querySelector('[data-contest-sound]');
    const status = panel.querySelector('[data-contest-sound-status]');
    const refresh = () => { toggle.textContent = sound.enabled() ? '🔇 كتم الصوت' : '🔊 تفعيل الصوت'; toggle.setAttribute('aria-pressed',String(sound.enabled())); status.textContent = sound.description(); };
    toggle.onclick = async () => { if (sound.enabled()) sound.mute(); else await sound.activate(); refresh(); };
    panel.querySelector('[data-contest-sound-test]').onclick = async () => { await sound.activate(); sound.test(); refresh(); };
    refresh();
  }
  const esc=escapeHtml;
  const ar=(value)=>new Intl.NumberFormat("ar-SA",{useGrouping:false}).format(Number(value)||0);
  const ms=(value)=>value==null?"—":`${(Number(value)/1000).toFixed(1)} ث`;

  function classes(){return (getClasses()||[]).filter(item=>Number(item.student_count||0)>=0);}
  function stop(){sound.reset();state.active=false;clearTimeout(state.timer);clearInterval(state.clockTimer);state.timer=null;state.clockTimer=null;state.abort?.abort();state.abort=null;window.removeEventListener("online",refreshNow);document.removeEventListener("visibilitychange",refreshNow);}
  function refreshNow(){if(document.hidden)sound.silence();if(!state.active||!state.live)return;clearTimeout(state.timer);poll();}
  function bindLifecycle(){window.removeEventListener("online",refreshNow);document.removeEventListener("visibilitychange",refreshNow);window.addEventListener("online",refreshNow);document.addEventListener("visibilitychange",refreshNow);}
  function schedule(){if(!state.active||!state.live)return;const status=state.live.session?.status;const base=document.hidden?9000:status==="question_open"?900:2500;const delay=Math.min(15000,base*Math.max(1,2**state.errorCount))+Math.round(Math.random()*280);clearTimeout(state.timer);state.timer=setTimeout(poll,delay);}
  function syncClock(){const value=Date.parse(String(state.live?.serverNow||"").replace(" ","T"));if(Number.isFinite(value)){state.serverNowMs=value;state.receivedAtMs=Date.now();}}
  async function poll(){if(!state.active||!state.live)return;state.abort?.abort();state.abort=new AbortController();try{const data=await api(`/competitions/sessions/${state.live.session.id}/state`,{cache:"no-store",signal:state.abort.signal});state.errorCount=0;state.live=data;syncClock();renderLive();}catch(error){if(error.name!=="AbortError"){state.errorCount=Math.min(4,state.errorCount+1);setConnection(false,error.message);}}finally{schedule();}}
  function setConnection(ok,message=""){const node=state.root?.querySelector("[data-live-connection]");if(node){node.className=`live-connection ${ok?"is-online":"is-offline"}`;node.textContent=ok?"● متصل بالخادم":`● تعذر التحديث${message?` — ${message}`:""}`;}}
  function query(){const params=new URLSearchParams({classId:state.classId,...state.filters});return params.toString();}

  async function render(root){stop();state.root=root;state.active=true;bindLifecycle();const list=classes();if(!state.classId||!list.some(item=>String(item.id)===String(state.classId)))state.classId=String(list[0]?.id||"");root.innerHTML=`<section class="live-contest-hero"><div><small>ساحة مدار الصفية</small><h1>مسابقة النجوم المباشرة</h1><p>السؤال نفسه يصل إلى جميع الطالبات، والسرعة والصحة تُحسبان من الخادم.</p></div><span aria-hidden="true">✦</span></section><div data-live-workspace><div class="live-loading" role="status">جارٍ تجهيز ساحة المسابقة…</div></div>`;mountAudioControls();if(!state.classId){workspace().innerHTML='<div class="card live-empty"><span>👩‍🎓</span><h2>أضيفي فصلًا أولًا</h2><p>تحتاج المسابقة فصلًا مسجلًا وفيه طالبة نشطة واحدة على الأقل.</p></div>';return;}await loadMeta();}
  const workspace=()=>state.root?.querySelector("[data-live-workspace]");
  async function loadMeta(){if(!state.active)return;workspace().innerHTML='<div class="live-loading" role="status">جارٍ قراءة بنك الأسئلة…</div>';try{state.meta=await api(`/competitions/meta?${query()}`,{cache:"no-store"});state.errorCount=0;if(state.meta.activeSession){await openSession(state.meta.activeSession.id);return;}renderSetup();}catch(error){renderError(error);}}
  function renderError(error){if(!workspace())return;const migration=error.status===503||error.data?.migrationReady===false;workspace().innerHTML=`<div class="card live-error"><span aria-hidden="true">${migration?"⚙️":"!"}</span><h2>${migration?"يلزم تجهيز قاعدة المسابقات":"تعذر فتح المسابقات"}</h2><p>${esc(error.message)}</p>${migration?'<code>database/migration_20260912_live_competitions.sql</code>':`<button class="btn btn-primary" data-live-retry>إعادة المحاولة</button>`}</div>`;workspace().querySelector("[data-live-retry]")?.addEventListener("click",loadMeta);}
  function optionList(values,selected,allLabel){return `<option value="">${allLabel}</option>${values.map(value=>`<option value="${esc(value)}" ${String(value)===String(selected)?"selected":""}>${esc(value)}</option>`).join("")}`;}
  function renderSetup(){const m=state.meta;const classOptions=classes().map(item=>`<option value="${item.id}" ${String(item.id)===String(state.classId)?"selected":""}>${esc(item.name)} · ${esc(item.grade_label||item.level||"")}</option>`).join("");const available=Math.max(0,Number(m.availableCount||0));workspace().innerHTML=`
    <section class="live-setup-layout"><form class="card live-setup" data-live-create><header><span>١</span><div><small>إعداد سريع</small><h2>أنشئي مسابقة جديدة</h2><p>سيتم نسخ الأسئلة المختارة إلى المسابقة حتى لا تتغير لاحقًا.</p></div></header>
      <div class="live-form-grid"><label class="field live-wide">اسم المسابقة<input name="title" maxlength="190" required value="مسابقة النجوم"></label><label class="field live-wide">الفصل<select name="classId">${classOptions}</select></label><label class="field">الوحدة<select name="unit">${optionList(m.filters.units,state.filters.unit,"كل الوحدات")}</select></label><label class="field">الدرس<select name="lesson">${optionList(m.filters.lessons,state.filters.lesson,"كل الدروس")}</select></label><label class="field">المهارة<select name="skillId"><option value="">كل المهارات</option>${m.filters.skills.map(item=>`<option value="${item.id}" ${String(item.id)===String(state.filters.skillId)?"selected":""}>${esc(item.name)}</option>`).join("")}</select></label><label class="field">الصعوبة<select name="difficulty"><option value="">كل المستويات</option>${m.filters.difficulties.map(value=>`<option value="${value}" ${value===state.filters.difficulty?"selected":""}>${DIFFICULTY_LABELS[value]}</option>`).join("")}</select></label><label class="field">عدد الأسئلة<input name="questionCount" type="number" min="1" max="${Math.min(30,available)||1}" value="${Math.min(10,available)||1}" required></label><label class="field">زمن السؤال بالثواني<input name="questionTimeSeconds" type="number" min="5" max="120" value="30" required></label></div>
      <div class="live-availability ${available?"has-questions":"is-empty"}"><span aria-hidden="true">${available?"✓":"!"}</span><div><strong>${ar(available)} سؤال متاح</strong><small>${m.class.studentCount?`${ar(m.class.studentCount)} طالبة نشطة في ${esc(m.class.name)}`:"لا توجد طالبات نشطات في الفصل"}</small></div></div><button class="btn btn-primary live-create-button" type="submit" ${!available||!m.class.studentCount?"disabled":""}>إنشاء المسابقة وفتح الردهة</button></form>${historyMarkup(m.history)}</section>`;
    const form=workspace().querySelector("[data-live-create]");form.elements.classId.onchange=event=>{state.classId=event.target.value;sessionStorage.setItem("madarLiveCompetitionClass",state.classId);state.filters={unit:"",lesson:"",skillId:"",difficulty:""};loadMeta();};
    ["unit","lesson","skillId","difficulty"].forEach(name=>{form.elements[name].onchange=event=>{state.filters[name]=event.target.value;if(name==="unit"){state.filters.lesson="";state.filters.skillId="";}if(name==="lesson")state.filters.skillId="";loadMeta();};});
    form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector("[type=submit]");button.disabled=true;button.textContent="جارٍ إنشاء المسابقة…";const values=new FormData(form);try{const data=await api("/competitions/sessions",{method:"POST",body:JSON.stringify({title:values.get("title"),classId:Number(values.get("classId")),unit:values.get("unit"),lesson:values.get("lesson"),skillId:Number(values.get("skillId")||0),difficulty:values.get("difficulty"),questionCount:Number(values.get("questionCount")),questionTimeSeconds:Number(values.get("questionTimeSeconds"))})});toast("تم إنشاء المسابقة. افتحيها عندما تكون الطالبات جاهزات.");state.live=data;renderLive();schedule();}catch(error){toast(error.message);button.disabled=false;button.textContent="إنشاء المسابقة وفتح الردهة";}};
    workspace().querySelectorAll("[data-live-history]").forEach(button=>button.onclick=()=>openResults(Number(button.dataset.liveHistory)));
  }
  function historyMarkup(items=[]){return `<aside class="card live-history"><header><small>آخر ٢٠ مسابقة</small><h2>سجل المسابقات</h2></header>${items.length?`<div class="live-history-list">${items.map(item=>`<button type="button" data-live-history="${item.id}"><span><strong>${esc(item.title)}</strong><small>${item.status==="completed"?"مكتملة":"ملغاة"} · ${new Date(item.completed_at||item.created_at).toLocaleDateString("ar-SA")}</small></span><b>فتح النتائج</b></button>`).join("")}</div>`:'<div class="live-mini-empty">لا توجد مسابقات سابقة لهذا الفصل.</div>'}</aside>`;}
  async function openSession(id){try{state.live=await api(`/competitions/sessions/${id}/state`,{cache:"no-store"});syncClock();renderLive();schedule();}catch(error){renderError(error);}}
  async function openResults(id){workspace().innerHTML='<div class="live-loading">جارٍ فتح النتائج…</div>';try{const data=await api(`/competitions/sessions/${id}/results`,{cache:"no-store"});renderResults(data.session,data.results,true);}catch(error){renderError(error);}}
  function clock(){const session=state.live?.session;if(!session?.questionEndsAt||session.status!=="question_open")return 0;const parse=value=>Date.parse(String(value||"").replace(" ","T"));const now=state.serverNowMs+Math.max(0,Date.now()-state.receivedAtMs);return Math.max(0,Math.ceil((parse(session.questionEndsAt)-now)/1000));}
  function renderLive(){if(!state.active||!workspace()||!state.live)return;const session=state.live.session;sound.update(state.live,clock());clearInterval(state.clockTimer);state.clockTimer=session.status==="question_open"?setInterval(()=>{if(state.active)renderLive();},1000):null;if(session.status==="completed"){renderResults(session,state.live.results,false);return;}if(session.status==="cancelled"){renderResults(session,state.live.results||{hasWinner:false,podium:[],rows:[]},false);return;}if(session.status==="lobby")renderLobby();else renderQuestion();setConnection(true);}
  function renderLobby(){const d=state.live;const s=d.session;const joined=d.participants.filter(item=>item.joined).length;workspace().innerHTML=`<section class="live-arena live-lobby"><header class="live-arena-head"><div><small>ردهة الانتظار</small><h1>${esc(s.title)}</h1><p>${esc(s.className)} · ${ar(s.questionCount)} أسئلة · ${ar(s.questionTimeSeconds)} ثانية</p></div><span class="live-connection is-online" data-live-connection>● متصل بالخادم</span></header><div class="live-lobby-count"><strong>${ar(joined)}</strong><span>من ${ar(d.participants.length)} انضممن الآن</span></div><div class="live-student-grid">${d.participants.map(item=>`<div class="${item.joined?"is-ready":""}"><span aria-hidden="true">${item.joined?"✓":"○"}</span><strong>${esc(item.studentName)}</strong><small>${item.joined?item.connected?"متصلة":"انضمت — الاتصال متقطع":"بانتظار الدخول"}</small></div>`).join("")}</div><footer class="live-actions"><button class="btn btn-primary" data-live-action="start">بدء السؤال الأول</button><button class="btn btn-danger" data-live-cancel>إلغاء المسابقة</button></footer></section>`;bindActions();}
  function starsMarkup(participants){const max=Math.max(200,...participants.map(item=>Number(item.score)||0));return `<div class="live-star-scroll" tabindex="0" aria-label="أعمدة نقاط الطالبات"><div class="live-star-columns">${participants.map(item=>{const height=Math.max(8,Math.round((Number(item.score)||0)/max*100));return `<article class="live-star-column"><strong>${ar(item.score)}</strong><div class="live-star-track"><div style="height:${height}%"><span aria-hidden="true">★</span></div></div><h3>${esc(item.studentName)}</h3><small>المركز ${ar(item.rank)}</small></article>`;}).join("")}</div></div>`;}
  function renderQuestion(){const d=state.live,s=d.session,q=d.question||{},open=s.status==="question_open",remaining=clock(),last=Number(s.currentQuestionNo)===Number(s.questionCount);workspace().innerHTML=`<section class="live-arena"><header class="live-arena-head"><div><small>السؤال ${ar(s.currentQuestionNo)} من ${ar(s.questionCount)}</small><h1>${esc(s.title)}</h1><p>${esc(s.className)} · ${STATUS_LABELS[s.status]}</p></div><div class="live-arena-status"><span class="live-connection is-online" data-live-connection>● متصل بالخادم</span><strong class="live-clock ${remaining<=5&&open?"is-ending":""}" aria-label="الوقت المتبقي">${open?ar(remaining):"مغلق"}</strong></div></header><div class="live-question-card"><div class="live-question-meta"><span>${esc(DIFFICULTY_LABELS[q.difficulty]||q.difficulty||"")}</span><span>${esc(q.skillName||q.lessonName||"")}</span><b>${ar(d.answerCount)} / ${ar(d.participants.length)} أجبن</b></div><h2>${esc(q.prompt||"")}</h2><ol>${(q.options||[]).map((option,index)=>`<li class="${!open&&Number(q.correctOptionNo)===index+1?"is-correct":""}"><b>${["أ","ب","جـ","د","هـ","و"][index]||ar(index+1)}</b><span>${esc(option)}</span>${!open&&Number(q.correctOptionNo)===index+1?"<em>الإجابة الصحيحة</em>":""}</li>`).join("")}</ol>${!open?`<div class="live-reveal"><strong>✓ ${ar(d.correctCount||0)} إجابة صحيحة</strong><span>${d.fastestCorrect?`⚡ الأسرع: ${esc(d.fastestCorrect.studentName)} خلال ${ms(d.fastestCorrect.responseMs)}`:"لم تصل إجابة صحيحة لهذا السؤال"}</span>${q.explanation?`<p>${esc(q.explanation)}</p>`:""}</div>`:""}</div><section class="live-scoreboard"><header><div><small>الترتيب المباشر</small><h2>أعمدة النجوم</h2></div><span>★ النقاط تتحدث مع كل إجابة</span></header>${starsMarkup(d.participants)}</section><div class="live-rank-list">${d.participants.map(item=>`<div><b>${ar(item.rank)}</b><span>${esc(item.studentName)}</span><strong>${ar(item.score)} نقطة</strong><small>${item.answeredCount?`${ar(item.correctCount)} صحيحة من ${ar(item.answeredCount)}`:"لم تجب بعد"}</small></div>`).join("")}</div><footer class="live-actions">${open?'<button class="btn btn-danger" data-live-action="close-question">إغلاق الإجابات</button>':`<button class="btn btn-primary" data-live-action="${last?"finish":"next"}">${last?"إنهاء المسابقة وإظهار النتائج":"السؤال التالي"}</button>`}<button class="btn btn-outline" data-live-cancel>إلغاء المسابقة</button></footer></section>`;bindActions();}
  function bindActions(){workspace().querySelectorAll("[data-live-action]").forEach(button=>button.onclick=()=>transition(button.dataset.liveAction,button));workspace().querySelector("[data-live-cancel]")?.addEventListener("click",()=>confirmAction("إلغاء المسابقة الحالية نهائيًا؟ ستبقى في السجل بحالة ملغاة.",()=>transition("cancel")));}
  async function transition(action,button){if(sound.enabled())await sound.activate();if(button){button.disabled=true;button.textContent="جارٍ التنفيذ…";}try{state.live=await api(`/competitions/sessions/${state.live.session.id}/${action}`,{method:"POST",body:JSON.stringify({expectedStateVersion:state.live.session.stateVersion})});syncClock();renderLive();schedule();}catch(error){toast(error.message);if(error.status===409)await poll();else if(button)button.disabled=false;}}
  function podiumMarkup(results){if(!results?.hasWinner||!results.podium?.length)return '<div class="live-no-winner"><span>☆</span><h2>لا يوجد فائز</h2><p>لم تُسجل إجابة صحيحة مكتملة في هذه المسابقة.</p></div>';const ranks=new Map();results.podium.forEach(item=>{if(!ranks.has(item.rank))ranks.set(item.rank,[]);ranks.get(item.rank).push(item);});return `<div class="live-podium">${[2,1,3].map(rank=>{const items=ranks.get(rank)||[];return `<article class="rank-${rank} ${items.length?"":"is-empty"}"><span>${rank===1?"👑":"★"}</span><strong>${items.length?items.map(item=>esc(item.studentName)).join("، "):"—"}</strong><b>${items.length?`${ar(items[0].score)} نقطة`:""}</b><small>${items.length>1?`المركز ${ar(rank)} · ${ar(items.length)} مشتركات`:`المركز ${ar(rank)}`}</small></article>`;}).join("")}</div>`;}
  function renderResults(session,results,history){sound.silence();clearTimeout(state.timer);workspace().innerHTML=`<section class="live-results"><header><small>${session.status==="cancelled"?"مسابقة ملغاة":"النتائج النهائية"}</small><h1>${esc(session.title)}</h1><p>${esc(session.className||"")} · ${ar(session.questionCount||0)} أسئلة</p></header>${podiumMarkup(results)}<div class="live-results-table"><table><thead><tr><th>المركز</th><th>الطالبة</th><th>النقاط</th><th>الصحيحة</th><th>الإجابات</th><th>متوسط السرعة</th></tr></thead><tbody>${(results.rows||[]).map(row=>`<tr class="${row.rank===1?"is-first":""}"><td>${row.rank?ar(row.rank):"—"}</td><td>${esc(row.studentName)}${!row.participated?"<small>لم تشارك</small>":""}</td><td>${ar(row.score)}</td><td>${ar(row.correctCount)}</td><td>${ar(row.answeredCount)}</td><td>${ms(row.averageResponseMs)}</td></tr>`).join("")||'<tr><td colspan="6">لا توجد نتائج مسجلة.</td></tr>'}</tbody></table></div><footer class="live-actions"><button type="button" class="btn btn-primary" data-live-print aria-label="طباعة تحليل نتائج المسابقة">🖨️ طباعة تحليل النتائج</button><button class="btn btn-outline" data-live-new>مسابقة جديدة</button>${history?'<button class="btn btn-outline" data-live-back>العودة إلى السجل</button>':""}</footer></section>`;workspace().querySelector("[data-live-print]").onclick=()=>{showCompetitionReport(buildCompetitionReport(session,results));};workspace().querySelector("[data-live-new]").onclick=()=>{state.live=null;state.filters={unit:"",lesson:"",skillId:"",difficulty:""};loadMeta();};workspace().querySelector("[data-live-back]")?.addEventListener("click",loadMeta);}
  return {render,stop};
}

// Competition audio: device-local effects and optional local Arabic speech.
function createCompetitionAudio() {
  let enabled = false, context = null, sessionId = null, questionKey = null;
  let lastSecond = null, phraseIndex = 0, generation = 0, speaking = false;
  let speechTimer = null, currentUtterance = null;
  const counts = new Map(), queue = [], nodes = new Set();
  const synth = window.speechSynthesis;
  const phrases = [name => `${name}، إجابة صحيحة!`, name => `ممتازة يا ${name}!`, name => `بارك الله فيك يا ${name}!`, name => `أحسنت يا ${name}!`, name => `رائعة يا ${name}!`];
  const voice = () => synth?.getVoices().find(item => /^ar(?:-|_)/i.test(item.lang) && item.localService);
  function silence() {
    generation++; queue.length = 0; speaking = false;
    clearTimeout(speechTimer); speechTimer = null;
    if (currentUtterance) synth?.cancel();
    currentUtterance = null;
    nodes.forEach(node => { try { node.stop(); } catch (_) {} });
    nodes.clear();
  }
  async function activate() {
    enabled = true;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio && !context) context = new Audio();
      if (context?.state === 'suspended') await context.resume();
    } catch (_) {}
    return enabled;
  }
  function tone(frequency, delay = 0, duration = .1, volume = .055) {
    if (!enabled || document.hidden || context?.state !== 'running') return;
    try {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const at = context.currentTime + delay;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
      oscillator.connect(gain); gain.connect(context.destination);
      nodes.add(oscillator);
      oscillator.onended = () => { nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at); oscillator.stop(at + duration + .02);
    } catch (_) {}
  }
  function cheer() { [523.25,659.25,783.99,1046.5].forEach((note,i) => tone(note,i*.085,.16,.065)); }
  function sayNext() {
    if (speaking || !enabled || document.hidden || !queue.length) return;
    const selected = voice();
    if (!selected || !window.SpeechSynthesisUtterance) { queue.length = 0; return; }
    const item = queue.shift(), token = generation;
    const utterance = new window.SpeechSynthesisUtterance(item);
    utterance.voice = selected; utterance.lang = selected.lang; utterance.rate = 1.05; utterance.volume = .9;
    currentUtterance = utterance; speaking = true;
    let done = false;
    const finish = () => {
      if (done || token !== generation) return;
      done = true; clearTimeout(speechTimer); currentUtterance = null; speaking = false;
      speechTimer = setTimeout(sayNext,180);
    };
    utterance.onend = finish; utterance.onerror = finish;
    speechTimer = setTimeout(() => { if (token === generation) { synth.cancel(); finish(); } },6000);
    try { synth.speak(utterance); } catch (_) { finish(); }
  }
  function praise(name) {
    if (!enabled || document.hidden) return;
    const firstName = String(name || 'بطلة').trim().split(/\s+/)[0].slice(0,40);
    if (queue.length < 60) queue.push(phrases[phraseIndex++ % phrases.length](firstName));
    sayNext();
  }
  function update(data, remaining) {
    const session = data?.session;
    if (!session) return;
    const fresh = sessionId !== String(session.id);
    if (fresh) { silence(); counts.clear(); sessionId = String(session.id); questionKey = null; lastSecond = null; }
    const key = `${session.id}:${session.currentQuestionNo}`;
    if (key !== questionKey) {
      silence(); questionKey = key; lastSecond = null;
      if (!fresh && session.status === 'question_open') { tone(523,0,.15); tone(784,.16,.2); }
    }
    let correct = false;
    for (const item of data.participants || []) {
      const id = String(item.studentId ?? item.id ?? item.studentName);
      const value = Number(item.correctCount) || 0, previous = counts.get(id);
      counts.set(id,Math.max(previous || 0,value));
      if (!fresh && previous != null && value > previous && ['question_open','question_closed'].includes(session.status)) {
        correct = true; praise(item.studentName);
      }
    }
    if (correct) cheer();
    if (session.status === 'question_open' && Number.isFinite(remaining) && remaining >= 0 && remaining !== lastSecond) {
      const previous = lastSecond; lastSecond = remaining;
      if (remaining > 0) {
        const volume = speaking ? .018 : .04;
        tone(remaining <= 5 ? 880 : 440,0,.065,volume);
        if (remaining <= 5) tone(1100,.17,.065,volume);
      } else if (previous > 0) { tone(392,0,.22); tone(294,.24,.3); }
    }
    if (['completed','cancelled'].includes(session.status)) silence();
  }
  function reset() { silence(); counts.clear(); sessionId = null; questionKey = null; lastSecond = null; }
  return {
    activate, update, reset, silence,
    enabled: () => enabled,
    mute: () => { enabled = false; silence(); },
    test: () => { silence(); cheer(); praise('فاطمة'); },
    description: () => !enabled ? 'فعّلي الصوت لسماع العدّ والتشجيع من شاشة المعلمة.' : voice() ? 'الصوت مفعّل: عدّ تنازلي وتشجيع بأسماء الطالبات.' : 'المؤثرات مفعّلة. نطق الأسماء يحتاج صوتًا عربيًا محليًا على الجهاز.'
  };
}

function buildCompetitionReport(session, results, printedAt = new Date()) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => Math.max(0, Number(value) || 0);
  const ar = value => new Intl.NumberFormat('ar-SA', {maximumFractionDigits:1}).format(value);
  const percent = (part,total) => total > 0 ? ar(part / total * 100) + '٪' : '—';
  const rows = (results?.rows || []).map(row => ({...row, answered:num(row.answeredCount), correct:Math.min(num(row.correctCount),num(row.answeredCount))}));
  const questions = num(session.questionCount), cancelled = session.status === 'cancelled';
  const participants = rows.filter(row => row.participated === true || row.participated === 1 || row.answered > 0);
  const answered = rows.reduce((sum,row) => sum + row.answered,0);
  const correct = rows.reduce((sum,row) => sum + row.correct,0);
  const timed = rows.filter(row => row.answered > 0 && row.averageResponseMs != null && Number.isFinite(Number(row.averageResponseMs)) && Number(row.averageResponseMs) >= 0);
  const timedAnswers = timed.reduce((sum,row) => sum + row.answered,0);
  const response = timedAnswers ? timed.reduce((sum,row) => sum + Number(row.averageResponseMs)*row.answered,0)/timedAnswers : null;
  const seconds = value => value == null ? '—' : ar(Number(value)/1000) + ' ث';
  const date = new Intl.DateTimeFormat('ar-SA',{dateStyle:'long',timeStyle:'short',timeZone:'Asia/Riyadh',calendar:'gregory'}).format(printedAt);
  const metric = (label,value,detail) => `<article class="metric"><small>${label}</small><strong>${value}</strong><span>${detail}</span></article>`;
  const recommendation = row => !row.answered ? 'متابعة سبب عدم المشاركة' : row.correct/row.answered < .5 ? 'مراجعة الإجابات الخاطئة وتقديم تدريب موجّه' : row.correct < row.answered ? 'مراجعة الأخطاء مع تعزيز الإجابات الصحيحة' : 'تعزيز الأداء بأسئلة إثرائية';
  const body = rows.map(row => `<tr><td>${row.rank ? ar(num(row.rank)) : '—'}</td><th scope="row">${esc(row.studentName)}${!row.answered ? '<small>لم تسجّل إجابة</small>' : ''}</th><td>${ar(num(row.score))}</td><td>${ar(row.answered)}</td><td>${ar(row.correct)}</td><td>${ar(row.answered-row.correct)}</td><td>${percent(row.correct,row.answered)}</td><td>${seconds(row.averageResponseMs == null || !Number.isFinite(Number(row.averageResponseMs)) ? null : num(row.averageResponseMs))}</td><td>${recommendation(row)}</td></tr>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تحليل نتائج المسابقة — ${esc(session.title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#eef0f5;color:#24304a;font:14px Tahoma,Arial,sans-serif;line-height:1.7}.toolbar{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;background:#24134b;color:white;z-index:1}.toolbar button{border:0;border-radius:10px;padding:12px 22px;background:#fff;color:#321766;font:700 15px Tahoma;cursor:pointer}.sheet{max-width:1180px;margin:24px auto;background:white;padding:36px;border-radius:16px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #59418a;padding-bottom:20px}.brand{font-size:30px;font-weight:bold;color:#402168}h1{font-size:26px;margin:4px 0}h2{font-size:18px;color:#402168;margin:24px 0 12px}p{margin:4px 0}.muted{color:#657086}.stamp{font-size:12px;text-align:left}.notice{background:#fff5dd;border:1px solid #e5c674;padding:12px 16px;border-radius:10px;margin:18px 0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.metric{background:#f6f4fa;border:1px solid #e5dfef;border-top:3px solid #7355a4;border-radius:10px;padding:16px}.metric small,.metric span{display:block}.metric strong{display:block;font-size:29px;color:#402168}.metric span{font-size:11px;color:#657086}.analysis{display:grid;grid-template-columns:1fr 1fr;gap:12px}.analysis p{border:1px solid #e2e5ed;border-radius:8px;padding:12px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}thead{background:#eee9f6;color:#321766}th,td{padding:10px 8px;border:1px solid #dddfe7;text-align:center;vertical-align:middle}th[scope=row]{text-align:right;min-width:120px}td:last-child{text-align:right;max-width:180px;font-size:11px}tbody tr:nth-child(even){background:#faf9fc}td small,th small{display:block;font-weight:normal;color:#657086}.notes{font-size:12px;color:#59657a;margin-top:18px}footer{border-top:1px solid #d9dce5;padding-top:12px;margin-top:22px;display:flex;justify-content:space-between;font-size:11px;color:#657086}.empty{text-align:center;padding:35px}.signatures{display:flex;justify-content:space-between;margin-top:28px;font-size:12px}
  @page{size:A4 landscape;margin:12mm}@media print{body{background:white;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{display:none}.sheet{max-width:none;margin:0;padding:0;border-radius:0}h1{font-size:23px}.metric{padding:10px}.metric strong{font-size:25px}.metrics{margin:16px 0}.table-wrap{overflow:visible}table{font-size:10px}th,td{padding:7px 5px}thead{display:table-header-group}tr,.metric,.analysis p,.notice,.signatures{break-inside:avoid}h2{break-after:avoid}.notes{font-size:10px}.stamp{font-size:10px}}@media screen and (max-width:700px){.sheet{padding:18px;margin:12px}.metrics{grid-template-columns:repeat(2,1fr)}header,.analysis{display:block}.stamp{text-align:right;margin-top:12px}.toolbar{padding:12px;font-size:12px}}
  </style></head><body><div class="toolbar"><span>معاينة تقرير النتائج · يمكن حفظه PDF من نافذة الطباعة</span><button type="button" onclick="window.print()">طباعة / حفظ PDF</button></div><main class="sheet"><header><div><div class="brand">مَدار</div><h1>تحليل نتائج المسابقة</h1><p><strong>${esc(session.title || 'مسابقة النجوم')}</strong> · ${esc(session.className || 'الفصل غير محدد')}</p><p class="muted">عدد الأسئلة المخطّط: ${ar(questions)} · الحالة: ${cancelled ? 'ملغاة' : session.status === 'completed' ? 'مكتملة' : 'غير مكتملة'}</p></div><div class="stamp">تاريخ إعداد التقرير<br>${esc(date)}<br>توقيت الرياض</div></header>
  ${cancelled ? '<div class="notice"><strong>نتائج جزئية لمسابقة ملغاة.</strong> يعرض هذا التقرير الإجابات المسجلة قبل الإلغاء، ولا يمثل تقييمًا مكتملًا لجميع أسئلة المسابقة.</div>' : ''}
  <section class="metrics">${metric('المشاركة',percent(participants.length,rows.length),`${ar(participants.length)} من ${ar(rows.length)} طالبة`)}${metric('دقة الإجابات',percent(correct,answered),`${ar(correct)} صحيحة من ${ar(answered)} إجابة مسجلة`)}${metric('الإجابات غير الصحيحة',ar(answered-correct),'من الإجابات المسجلة فقط')}${metric('متوسط زمن الإجابة',seconds(response),'متوسط مرجّح بعدد الإجابات المتاحة')}</section>
  <section class="analysis"><p><strong>تغطية أسئلة المسابقة:</strong> ${cancelled ? 'لا تُحسب للمسابقة الملغاة.' : `${percent(answered,rows.length*questions)} — ${ar(answered)} إجابة من ${ar(rows.length*questions)} فرصة إجابة مخططة.`}</p><p><strong>المتابعة المقترحة:</strong> ${!answered ? 'لم تُسجل إجابات تكفي للتحليل؛ تحققي من مشاركة الطالبات أولًا.' : `${ar(rows.filter(row=>row.answered>row.correct).length)} طالبة لديهن إجابات تحتاج مراجعة، و${ar(rows.filter(row=>!row.answered).length)} طالبة لم تسجّل إجابة.`}</p></section>
  <h2>نتائج الطالبات وخطوة المتابعة</h2><div class="table-wrap"><table><thead><tr><th>المركز</th><th>الطالبة</th><th>النقاط</th><th>الإجابات</th><th>الصحيحة</th><th>الخاطئة</th><th>دقة الإجابة</th><th>متوسط الزمن</th><th>متابعة مقترحة</th></tr></thead><tbody>${body || '<tr><td colspan="9" class="empty">لا توجد نتائج مسجلة لهذه المسابقة.</td></tr>'}</tbody></table></div>
  <div class="notes"><p>دقة الإجابة = الصحيحة ÷ الإجابات المسجلة. «—» تعني عدم توفر بيانات كافية، والإجابات غير المقدمة لا تُحسب أخطاء.</p><p>المتابعة اقتراح مبني على هذه المسابقة فقط. البيانات المتاحة لا تتضمن تفصيل الإجابات لكل سؤال أو مهارة.</p></div><div class="signatures"><span>اسم المعلمة: ................................</span><span>ملاحظات المتابعة: ........................................................</span></div><footer><span>مدار · تقرير نتائج المسابقة</span><span>للاستخدام التعليمي داخل المدرسة</span></footer></main></body></html>`;
}

function showCompetitionReport(html) {
  document.querySelector('[data-competition-report]')?.remove();
  const dialog = document.createElement('dialog');
  dialog.dataset.competitionReport = '';
  dialog.setAttribute('aria-label','معاينة تحليل نتائج المسابقة');
  dialog.style.cssText = 'border:1px solid #d9d4e6;border-radius:16px;padding:0;width:min(1200px,96vw);max-width:96vw;height:94vh;max-height:94vh;background:#f3f2f7;box-shadow:0 20px 80px #24134b66;overflow:hidden';
  const bar = document.createElement('div');
  bar.style.cssText = 'height:54px;padding:8px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:white;color:#402168;font-family:Tahoma,Arial';
  const title = document.createElement('strong'); title.textContent = 'تحليل نتائج المسابقة';
  const close = document.createElement('button'); close.type='button';close.textContent='إغلاق المعاينة ×';
  close.style.cssText='border:1px solid #d8d0e9;background:#f6f3fa;color:#402168;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer';
  const frame = document.createElement('iframe');frame.title='تقرير تحليل نتائج المسابقة';
  frame.style.cssText='display:block;width:100%;height:calc(100% - 54px);border:0';frame.srcdoc=html;
  bar.append(title,close);dialog.append(bar,frame);document.body.append(dialog);
  close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();close.focus();
}
