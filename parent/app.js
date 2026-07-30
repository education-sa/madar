const csrfKey = "madar-parent-csrf";
let csrfToken = sessionStorage.getItem(csrfKey) || "";
const state = { me: null, summary: null, children: [], childId: 0, tab: "overview" };
const el = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const response = await fetch(`/api/parent${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.href = "/login.html?role=parent";
    throw new Error("انتهت جلسة الدخول.");
  }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية.");
  if (data.csrfToken) {
    csrfToken = data.csrfToken;
    sessionStorage.setItem(csrfKey, csrfToken);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function arNumber(value) { return Number(value || 0).toLocaleString("ar-SA", { maximumFractionDigits: 1 }); }
function formatDate(value) { return value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(new Date(String(value).replace(" ", "T"))) : "—"; }
function styleLabel(value) { return ({ visual: "بصري", auditory: "سمعي", reading_writing: "قرائي/كتابي", kinesthetic: "حركي/تطبيقي", mixed: "مختلط", unknown: "غير محدد" })[value] || "غير محدد"; }
function testType(value) { return ({ pre_diagnostic: "تشخيصي قبلي", post_diagnostic: "تشخيصي بعدي", quiz: "اختبار قصير" })[value] || value || "—"; }
function statusLabel(value) { return ({ active: "نشط", published: "منشور", closed: "مغلق", draft: "مسودة", in_progress: "قيد الحل", submitted: "تم التسليم", graded: "تم التصحيح", pending: "قيد الانتظار", completed: "مكتمل", late: "متأخر", present: "حضور", absent: "غياب", excused: "بعذر", needs_review: "يحتاج مراجعة", missing: "لم يُسلّم" })[value] || value || "—"; }
function statusClass(value) { return ["completed", "present", "graded", "submitted", "approved", "active"].includes(value) ? "status-good" : ["late", "pending", "in_progress", "excused", "needs_review"].includes(value) ? "status-warn" : "status-bad"; }
function showToast(message) { const toast = el("parentToast"); toast.textContent = message; toast.hidden = false; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.hidden = true; }, 3500); }
function empty(icon, title, text) { return `<div class="empty-state"><span>${icon}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`; }
function loading() { el("parentContent").innerHTML = '<div class="loading-card"><span></span><p>جارٍ تحميل بيانات الابنة...</p></div>'; }

function renderSummary() {
  const s = state.summary || {};
  el("parentSummary").innerHTML = [
    ["👧", s.childCount, "عدد الأبناء المرتبطين"],
    ["⭐", s.totalPoints, "مجموع نقاط التحفيز"],
    ["📈", `${arNumber(s.averageProgress)}٪`, "متوسط التقدم"],
    ["📝", `${arNumber(s.averageTests)}٪`, "متوسط نتائج الاختبارات"],
  ].map(([icon, value, label]) => {
    const display = typeof value === "number" ? arNumber(value) : String(value);
    return `<article class="summary-card"><span class="summary-icon">${icon}</span><div><strong>${escapeHtml(display)}</strong><small>${label}</small></div></article>`;
  }).join("");
}

function renderChildren() {
  el("childrenCount").textContent = `${arNumber(state.children.length)} أبناء`;
  el("childrenSwitcher").innerHTML = state.children.map((child) => `
    <button class="child-choice ${child.id === state.childId ? "active" : ""}" type="button" data-child="${child.id}">
      <span class="child-avatar">${escapeHtml(child.name.trim().charAt(0) || "ط")}</span>
      <span><strong>${escapeHtml(child.name)}</strong><small>${escapeHtml(`${child.stage} · ${child.gradeLabel} · ${child.className}`)}</small></span>
      <b>${arNumber(child.progressPercent)}٪ تقدم</b>
    </button>`).join("");
  document.querySelectorAll("[data-child]").forEach((button) => button.addEventListener("click", () => selectChild(Number(button.dataset.child))));
}

function renderSelectedHead() {
  const child = state.children.find((item) => item.id === state.childId);
  if (!child) return;
  el("selectedChildHead").innerHTML = `<div><h2>${escapeHtml(child.name)}</h2><p>${escapeHtml(`${child.stage} · ${child.gradeLabel} · ${child.className} · المعلمة: ${child.teacherName || "—"}`)}</p></div><span class="selected-child-badge">${styleLabel(child.learningStyle)}</span>`;
}

async function selectChild(id) {
  state.childId = id;
  state.tab = "overview";
  renderChildren(); renderSelectedHead();
  document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
  await loadTab();
}

function renderOverview(data) {
  const c = data.cards || {};
  const s = data.student || {};
  const learning = data.learningAssessment;
  const learningScores = learning ? [
    ["بصري", learning.visual_score], ["سمعي", learning.auditory_score], ["قرائي/كتابي", learning.reading_writing_score], ["حركي", learning.kinesthetic_score],
  ] : [];
  el("parentContent").innerHTML = `
    <div class="detail-grid">
      ${[["⭐","نقاط التحفيز",c.points],["📝","متوسط الاختبارات",`${arNumber(c.testAverage)}٪`],["🏆","أفضل نتيجة",`${arNumber(c.bestTest)}٪`],["📅","نسبة الحضور",`${arNumber(c.attendanceRate)}٪`],["📁","ملفات الإنجاز",c.portfolioFiles],["✅","الواجبات المكتملة",`${c.assignmentsCompleted || 0}/${c.assignmentsTotal || 0}`],["📈","مستوى التقدم",`${arNumber(s.progressPercent)}٪`],["🎨","نمط التعلم",styleLabel(s.learningStyle)]].map(([icon,label,value])=>`<article class="detail-card"><span>${icon} ${label}</span><strong>${escapeHtml(value)}</strong></article>`).join("")}
    </div>
    <div class="content-grid-two">
      <section class="panel-card"><h3>بيانات الابنة الدراسية</h3><div class="info-list">
        <div class="info-row"><span>المرحلة والصف</span><strong>${escapeHtml(`${s.stage || "—"} · ${s.gradeLabel || "—"}`)}</strong></div>
        <div class="info-row"><span>الفصل</span><strong>${escapeHtml(s.className || "—")}</strong></div>
        <div class="info-row"><span>العام الدراسي</span><strong>${escapeHtml(s.academicYear || "—")}</strong></div>
        <div class="info-row"><span>المعلمة</span><strong>${escapeHtml(s.teacherName || "—")}</strong></div>
        <div class="info-row"><span>البريد المدرسي</span><strong dir="ltr">${escapeHtml(s.email || "—")}</strong></div>
      </div></section>
      <section class="panel-card"><h3>نتيجة نمط التعلم</h3>${learning ? `<div class="score-bars">${learningScores.map(([label,score])=>`<div class="score-row"><span>${label}</span><div class="progress-track"><i style="width:${Math.min(100,Number(score||0)*10)}%"></i></div><b>${arNumber(score)}</b></div>`).join("")}</div><div class="info-row"><span>النمط الغالب</span><strong>${styleLabel(learning.result_style)}</strong></div>` : empty("🎨","لم تُكمل الاستبانة بعد","تظهر النتيجة هنا بعد إكمال استبانة أنماط التعلم.")}</section>
    </div>`;
}

function renderTests(data) {
  const attempts = data.attempts || [], available = data.availableTests || [];
  el("parentContent").innerHTML = `
    <div class="content-grid-two">
      <section class="panel-card"><h3>الاختبارات المتاحة والمنشورة</h3>${available.length ? `<div class="table-wrap"><table class="parent-table"><thead><tr><th>الاختبار</th><th>النوع</th><th>الحالة</th><th>أفضل نتيجة</th></tr></thead><tbody>${available.map(t=>`<tr><td>${escapeHtml(t.title)}</td><td>${testType(t.test_type)}</td><td><span class="status-pill ${statusClass(t.status)}">${statusLabel(t.status)}</span></td><td>${t.best_percentage===null?"لم تحل":`${arNumber(t.best_percentage)}٪`}</td></tr>`).join("")}</tbody></table></div>`:empty("📝","لا توجد اختبارات منشورة","ستظهر اختبارات الابنة هنا بعد نشرها.")}</section>
      <section class="panel-card"><h3>سجل الدرجات والمحاولات</h3>${attempts.length ? `<div class="table-wrap"><table class="parent-table"><thead><tr><th>الاختبار</th><th>الدرجة</th><th>النسبة</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${attempts.map(a=>`<tr><td>${escapeHtml(a.title)}</td><td>${arNumber(a.score)}/${arNumber(a.total_points)}</td><td><strong>${arNumber(a.percentage)}٪</strong></td><td><span class="status-pill ${statusClass(a.status)}">${statusLabel(a.status)}</span></td><td>${formatDate(a.submitted_at || a.started_at)}</td></tr>`).join("")}</tbody></table></div>`:empty("📋","لا توجد محاولات بعد","بعد حل الاختبارات ستظهر الدرجات هنا.")}</section>
    </div>`;
}

function renderAnalysis(data) {
  const skills = data.skills || [], performance = data.performance || [], learning = data.learningAssessment;
  el("parentContent").innerHTML = `
    <div class="detail-grid"><article class="detail-card"><span>📈 التقدم العام</span><strong>${arNumber(data.progressPercent)}٪</strong></article><article class="detail-card"><span>🎨 نمط التعلم</span><strong>${styleLabel(data.learningStyle)}</strong></article><article class="detail-card"><span>🧠 عدد المهارات المقاسة</span><strong>${arNumber(skills.length)}</strong></article><article class="detail-card"><span>📝 أنواع الاختبارات</span><strong>${arNumber(performance.length)}</strong></article></div>
    <div class="content-grid-two">
      <section class="panel-card"><h3>إتقان المهارات</h3>${skills.length ? `<div class="score-bars">${skills.map(skill=>`<div class="score-row"><span title="${escapeHtml(skill.name)}">${escapeHtml(skill.name)}</span><div class="progress-track"><i style="width:${Math.max(0,Math.min(100,Number(skill.mastery_percent||0)))}%"></i></div><b>${arNumber(skill.mastery_percent)}٪</b></div>`).join("")}</div>`:empty("🧠","لا توجد مهارات مقاسة","تظهر المهارات بعد تصحيح الاختبارات المرتبطة بها.")}</section>
      <section class="panel-card"><h3>الأداء حسب نوع الاختبار</h3>${performance.length ? `<div class="info-list">${performance.map(row=>`<div class="info-row"><span>${testType(row.test_type)} · ${arNumber(row.attempts)} محاولة</span><strong>${arNumber(row.average)}٪ متوسط · ${arNumber(row.best)}٪ أفضل</strong></div>`).join("")}</div>`:empty("📊","لا يوجد تحليل بعد","تظهر مؤشرات الأداء بعد وجود نتائج مصححة.")} ${learning?`<div class="info-row"><span>آخر استبانة تعلم</span><strong>${styleLabel(learning.result_style)} · ${formatDate(learning.completed_at)}</strong></div>`:""}</section>
    </div>`;
}

function renderPoints(data) {
  const entries = data.entries || [];
  el("parentContent").innerHTML = `<div class="points-total"><span>⭐</span><div><small>مجموع نقاط مدار</small><strong>${arNumber(data.total)}</strong></div></div>${entries.length?`<div class="timeline">${entries.map(row=>`<article class="timeline-item"><span class="timeline-dot">${Number(row.points)>=0?"⭐":"➖"}</span><div><h4>${Number(row.points)>=0?"+":""}${arNumber(row.points)} نقطة</h4><p>${escapeHtml(row.reason || row.details || "نقاط تحفيزية")}${row.teacher_name?` · المعلمة: ${escapeHtml(row.teacher_name)}`:""}</p></div><small>${formatDate(row.created_at)}</small></article>`).join("")}</div>`:empty("⭐","لا توجد نقاط مسجلة","ستظهر نقاط التحفيز التي تضيفها المعلمة هنا.")}`;
}

function renderFollowUp(data) {
  const attendance = data.attendance || [], assignments = data.assignments || [], periods = data.periods || [], weeklyScores = data.weeklyScores || [];
  el("parentContent").innerHTML = `<div class="content-grid-two">
    <section class="panel-card"><h3>الحضور والغياب</h3>${attendance.length?`<div class="table-wrap"><table class="parent-table"><thead><tr><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>${attendance.map(r=>`<tr><td>${formatDate(r.record_date)}</td><td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td></tr>`).join("")}</tbody></table></div>`:empty("📅","لا توجد سجلات حضور","ستظهر سجلات الحضور بعد إدخالها من المعلمة.")}</section>
    <section class="panel-card"><h3>الواجبات والمهام</h3>${assignments.length?`<div class="timeline">${assignments.map(r=>`<article class="timeline-item"><span class="timeline-dot">📘</span><div><h4>${escapeHtml(r.title)}</h4><p>موعد التسليم: ${formatDate(r.due_date)}</p></div><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></article>`).join("")}</div>`:empty("📘","لا توجد واجبات مسجلة","ستظهر الواجبات والمهام هنا.")}</section>
    <section class="panel-card"><h3>درجات المتابعة الفترية</h3>${periods.length?`<div class="table-wrap"><table class="parent-table"><thead><tr><th>الفترة</th><th>اختبار</th><th>مشاركة</th><th>واجب</th><th>مهام</th><th>نهائي</th></tr></thead><tbody>${periods.map(r=>`<tr><td>${arNumber(r.period_no)}</td><td>${r.periodic_test_score??"—"}</td><td>${r.participation_score??"—"}</td><td>${r.homework_score??"—"}</td><td>${r.tasks_score??"—"}</td><td>${r.final_exam_score??"—"}</td></tr>`).join("")}</tbody></table></div>`:empty("📖","لا توجد درجات متابعة","ستظهر درجات سجل المتابعة هنا.")}</section>
    <section class="panel-card"><h3>المهام الأسبوعية</h3>${weeklyScores.length?`<div class="table-wrap"><table class="parent-table"><thead><tr><th>المهمة</th><th>التاريخ</th><th>الدرجة</th><th>الحالة</th></tr></thead><tbody>${weeklyScores.map(r=>`<tr><td>${escapeHtml(r.title)}</td><td>${formatDate(r.item_date)}</td><td>${r.score??"—"}/${r.max_score}</td><td><span class="status-pill ${statusClass(r.record_status)}">${statusLabel(r.record_status)}</span></td></tr>`).join("")}</tbody></table></div>`:empty("✅","لا توجد مهام أسبوعية","ستظهر تفاصيل المتابعة الأسبوعية هنا.")}</section>
  </div>`;
}

function renderFiles(data) {
  const files = data.files || [], resources = data.resources || [], childId = state.childId;
  el("parentContent").innerHTML = `<div class="content-grid-two">
    <section class="panel-card"><h3>ملفات إنجاز الابنة</h3>${files.length?`<div class="file-grid">${files.map(f=>`<article class="file-item"><h4>📎 ${escapeHtml(f.title)}</h4><p>${escapeHtml(f.note || f.teacherComment || "ملف ضمن إنجازات الطالبة")}</p><div class="file-meta"><span>${escapeHtml(f.originalName)}</span><span>${formatDate(f.createdAt)}</span></div><a href="/api/parent/children/${childId}/files/${f.id}/download" target="_blank" rel="noopener">فتح الملف</a></article>`).join("")}</div>`:empty("📁","لا توجد ملفات إنجاز","ستظهر ملفات الابنة المرفوعة هنا.")}</section>
    <section class="panel-card"><h3>الموارد التعليمية من المعلمة</h3>${resources.length?`<div class="file-grid">${resources.map(r=>`<article class="file-item"><h4>📚 ${escapeHtml(r.title)}</h4><p>${escapeHtml(r.description || "مورد تعليمي")}</p><div class="file-meta"><span>${escapeHtml(r.category)}</span><span>${formatDate(r.createdAt)}</span></div>${r.resourceType==="link"?`<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">فتح الرابط</a>`:`<a href="/api/parent/children/${childId}/resources/${r.id}/file" target="_blank" rel="noopener">فتح المورد</a>`}</article>`).join("")}</div>`:empty("📚","لا توجد موارد متاحة","ستظهر أوراق العمل والملخصات والفيديوهات هنا.")}</section>
  </div>`;
}

function renderCommunity(data) {
  const posts = data.posts || [];
  el("parentContent").innerHTML = posts.length ? `<div class="community-grid">${posts.map(post=>`<article class="community-post"><div class="post-meta"><span>${escapeHtml(post.teacher_name || "معلمة مدار")}</span><span>${formatDate(post.created_at)}</span></div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.body).replace(/\n/g,"<br>")}</p><div class="post-meta"><span>${escapeHtml(post.class_name || "جميع الفصول")}</span><span>مجمع مدار</span></div></article>`).join("")}</div>` : empty("💬","لا توجد رسائل في مجمع مدار","ستظهر إعلانات ورسائل المعلمات لأولياء الأمور هنا.");
}


function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value).replace(" ", "T"))) : "—";
}
function eventTypeLabel(value) {
  return ({ test: "اختبار", homework: "واجب", task: "مهمة", meeting: "لقاء", announcement: "إعلان", remedial: "خطة علاجية", other: "موعد" })[value] || "موعد";
}
function renderCalendar(data) {
  const items = (data.items || []).filter((item) => !item.student_name || Number(state.childId) === Number(item.student_id || state.childId));
  el("parentContent").innerHTML = `<section class="panel-card parent-wide-card"><div class="section-heading"><div><span>المواعيد القادمة</span><h2>تقويم الأسرة التعليمي</h2></div><small>${arNumber(items.length)} موعد</small></div>${items.length ? `<div class="parent-calendar-grid">${items.map(item => `<article class="parent-calendar-item"><time>${formatDateTime(item.starts_at)}</time><span>${eventTypeLabel(item.event_type)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || "موعد مسجل من المعلمة")}</p><small>${escapeHtml(item.student_name || item.class_name || "جميع الأبناء المرتبطين")}</small></article>`).join("")}</div>` : empty("📅", "لا توجد مواعيد قادمة", "ستظهر الاختبارات والواجبات واللقاءات التي تحددها المعلمة هنا.")}</section>`;
}
function renderMessages(data) {
  const items = (data.items || []).filter(item => Number(item.student_id) === Number(state.childId));
  const child = state.children.find(item => Number(item.id) === Number(state.childId));
  el("parentContent").innerHTML = `<div class="content-grid-two"><section class="panel-card"><h3>إرسال رسالة خاصة للمعلمة</h3><p class="muted-copy">تُحفظ الرسائل داخل مدار وتخص الابنة المختارة فقط.</p><form id="parentMessageForm" class="parent-message-form"><label>العنوان<input id="parentMessageSubject" maxlength="190" required placeholder="مثال: متابعة الواجب"></label><label>الرسالة<textarea id="parentMessageBody" maxlength="3000" required placeholder="اكتبي رسالتك بوضوح"></textarea></label><button type="submit">إرسال الرسالة</button></form></section><section class="panel-card"><h3>سجل المراسلات · ${escapeHtml(child?.name || "الابنة")}</h3>${items.length ? `<div class="parent-message-thread">${items.map(item => `<article class="parent-message ${item.sender_role === "parent" ? "from-parent" : "from-teacher"}"><div><strong>${item.sender_role === "parent" ? "أنتِ" : escapeHtml(item.teacher_name || "المعلمة")}</strong><time>${formatDateTime(item.created_at)}</time></div><h4>${escapeHtml(item.subject)}</h4><p>${escapeHtml(item.body).replace(/\n/g,"<br>")}</p></article>`).join("")}</div>` : empty("✉️", "لا توجد مراسلات", "يمكنك إرسال أول رسالة للمعلمة من النموذج.")}</section></div>`;
  el("parentMessageForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await api("/enhancements/messages", { method: "POST", body: JSON.stringify({ studentId: state.childId, subject: el("parentMessageSubject").value.trim(), body: el("parentMessageBody").value.trim() }) });
      showToast("تم إرسال الرسالة للمعلمة.");
      renderMessages(await api("/enhancements/messages"));
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });
}


function renderRemedial(data) {
  const plans=data.plans||[],games=data.games||[];
  const status=(v)=>({planned:"مخططة",in_progress:"قيد التنفيذ",completed:"مكتملة",reassessed:"تمت إعادة القياس",cancelled:"ملغاة"})[v]||v;
  el("parentContent").innerHTML=`<section class="panel-card parent-wide-card"><div class="section-heading"><div><span>الدعم التعليمي</span><h2>الخطة العلاجية للابنة</h2></div><small>${arNumber(plans.length)} خطة</small></div>${plans.length?`<div class="parent-remedial-grid">${plans.map(p=>`<article><div><span>${status(p.status)}</span><small>${p.due_date?formatDate(p.due_date):"بدون موعد"}</small></div><h3>${escapeHtml(p.skill_name||p.title)}</h3><p>${escapeHtml(p.recommended_activity||p.diagnosis||"")}</p><div class="parent-plan-metrics"><span>قبل: ${arNumber(p.before_percent)}٪</span><span>الهدف: ${arNumber(p.target_percent)}٪</span><span>بعد: ${p.after_percent==null?"—":`${arNumber(p.after_percent)}٪`}</span></div></article>`).join("")}</div>`:empty("🌟","لا توجد خطة علاجية نشطة","ستظهر الخطط التي تنشئها المعلمة لدعم المهارات هنا.")}</section><section class="panel-card parent-wide-card"><h3>آخر نتائج الألعاب التعليمية</h3>${games.length?`<div class="table-wrap"><table class="parent-table"><thead><tr><th>اللعبة</th><th>المستوى</th><th>الدقة</th><th>النقاط</th><th>التاريخ</th></tr></thead><tbody>${games.map(g=>`<tr><td>${g.game_key==="percentage-challenge"?"تحدي النسبة المئوية":escapeHtml(g.game_key)}</td><td>${escapeHtml(g.difficulty)}</td><td>${arNumber(g.accuracy)}٪</td><td>${arNumber(g.score)}</td><td>${formatDate(g.played_at)}</td></tr>`).join("")}</tbody></table></div>`:empty("🎮","لا توجد محاولات ألعاب","ستظهر نتائج الألعاب المحفوظة في حساب الابنة هنا.")}</section>`;
}
function renderHelp() {
  el("parentContent").innerHTML=`<section class="panel-card parent-wide-card"><div class="section-heading"><div><span>دليل الأسرة</span><h2>مركز مساعدة ولي الأمر</h2></div></div><div class="parent-help-grid">${[["🏠","نظرة عامة","ملخص سريع للدرجات والحضور والنقاط والملفات."],["📝","الاختبارات","جميع محاولات الابنة ودرجاتها بعد التصحيح."],["📊","التحليل","تفصيل مستوى المهارات ونقاط القوة والاحتياج."],["🩺","الخطة العلاجية","الأنشطة التي تقترحها المعلمة والنتيجة قبل العلاج وبعده."],["✉️","الرسائل","تواصل مدرسي خاص بخصوص الابنة دون دردشة عامة."],["💬","مجمع مدار","إعلانات المعلمة للفصل أو لأولياء الأمور."]].map(([i,t,d])=>`<article><span>${i}</span><h3>${t}</h3><p>${d}</p></article>`).join("")}</div><p class="muted-copy">لا يستطيع ولي الأمر تعديل الدرجات أو النقاط، ولا يرى إلا الأبناء المرتبطين بحسابه.</p><p><a href="/privacy.html" target="_blank">سياسة الخصوصية</a> · <a href="/terms.html" target="_blank">شروط الاستخدام</a></p></section>`;
}

async function loadTab() {
  if (!state.childId) return;
  loading();
  try {
    if (state.tab === "community") return renderCommunity(await api("/community"));
    if (state.tab === "calendar") return renderCalendar(await api("/enhancements/calendar"));
    if (state.tab === "messages") return renderMessages(await api("/enhancements/messages"));
    if (state.tab === "remedial") return renderRemedial(await api(`/enhancements/remedial?studentId=${state.childId}`));
    if (state.tab === "help") return renderHelp();
    const data = await api(`/children/${state.childId}/${state.tab}`);
    ({ overview: renderOverview, tests: renderTests, analysis: renderAnalysis, points: renderPoints, "follow-up": renderFollowUp, files: renderFiles }[state.tab] || renderOverview)(data);
  } catch (error) {
    el("parentContent").innerHTML = empty("⚠️", "تعذّر تحميل القسم", error.message);
  }
}

async function init() {
  try {
    state.me = await api("/me");
    el("parentName").textContent = state.me.name;
    state.summary = await api("/summary");
    state.children = state.summary.linkedStudents || [];
    renderSummary(); renderChildren();
    if (!state.children.length) {
      el("emptyParent").hidden = false;
      return;
    }
    el("parentWorkspace").hidden = false;
    state.childId = state.children[0].id;
    renderChildren(); renderSelectedHead();
    await loadTab();
  } catch (error) { showToast(error.message); }
}

document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", async () => {
  state.tab = button.dataset.tab;
  document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("active", item === button));
  await loadTab();
}));
el("parentLogout").addEventListener("click", async () => {
  try {
    const result = await api("/logout", { method: "POST", body: "{}" });
    sessionStorage.removeItem(csrfKey);
    location.href = result.previewEnded ? (result.redirect || "/owner/dashboard") : "/login.html?role=parent";
  } catch (error) { showToast(error.message); }
});
init();
