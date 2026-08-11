const rows = (value) => Array.isArray(value) ? value : [];
const numberAr = (value, digits = 1) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? new Intl.NumberFormat("ar-SA", { maximumFractionDigits: digits }).format(Number(value)) : "—";
const percent = (value) => value === null || value === undefined || value === "" ? "—" : `${numberAr(value)}٪`;
const dateTimeInput = (value) => String(value || "").replace(" ", "T").slice(0, 16);

function optionRows(options, selected, escapeHtml, empty = "اختاري") {
  return `<option value="">${escapeHtml(empty)}</option>${rows(options).map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selected) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}`;
}

function freshDraft(query) {
  return {
    id: 0, classId: query.get("classId") || "", academicYear: query.get("academicYear") || "", semester: query.get("semester") || "first",
    title: "", testType: "periodic_1", assessmentDate: new Date(Date.now() + 10800000).toISOString().slice(0, 10),
    mode: "teacher_aggregate", threshold: 80, subject: "", unit: "", lesson: "", instructions: "", opensAt: "", closesAt: "",
    skills: [], questions: [],
  };
}

function statusClass(status) {
  return ["approved", "open"].includes(status) ? "is-approved" : ["submitted", "draft"].includes(status) ? "is-pending" : status === "returned" ? "is-returned" : "is-closed";
}

function chartList(items, threshold, escapeHtml, kind) {
  if (!items.length) return '<div class="skill-files__empty"><h3>لا توجد نتائج متاحة</h3><p>ستظهر النتائج بعد التسجيل والاعتماد.</p></div>';
  return `<div class="skill-files__chart-list">${items.map((item) => {
    const notReady = item.value === null || item.value === undefined;
    const value = notReady ? 0 : Math.max(0, Math.min(100, Number(item.value) || 0));
    return `<article class="skill-files__chart-row ${notReady ? "is-paper-empty" : ""}"><div><strong>${escapeHtml(item.label)}</strong><span>${notReady ? escapeHtml(item.state || "لم تسجل") : percent(value)}</span></div><div class="skill-files__track" style="--skill-threshold:${threshold}%"><i class="${value >= threshold ? "is-mastered" : ""}" style="--skill-bar:${value}%"></i></div>${kind === "skill" ? `<small>${numberAr(item.participants, 0)} مشاركة · ${numberAr(item.mastered, 0)} متقنة</small>` : ""}</article>`;
  }).join("")}</div>`;
}

export async function renderTeacherPaperAssessments({ container, api, escapeHtml, toast, getAcademicQuery }) {
  const query = new URLSearchParams(getAcademicQuery("attachments"));
  const state = { context: null, assessments: [], editing: false, draft: freshDraft(query), detail: null, detailMode: "skills", submissionDetail: null };

  async function loadContext(classId = state.draft.classId) {
    const params = new URLSearchParams(query);
    if (classId) params.set("classId", classId);
    state.context = await api(`/attachments/paper/context?${params}`);
    if (!state.context.migrationReady) return;
    if (!state.draft.classId && rows(state.context.classes).length) {
      state.draft.classId = String(state.context.classes[0].value);
      return loadContext(state.draft.classId);
    }
    if (!state.draft.academicYear) state.draft.academicYear = state.context.defaults?.academicYear || "";
    if (!state.draft.semester) state.draft.semester = state.context.defaults?.semester || "first";
    if (!state.draft.subject) state.draft.subject = state.context.defaults?.subject || "";
  }

  async function loadList() {
    const params = new URLSearchParams(query);
    if (state.draft.classId) params.set("classId", state.draft.classId);
    const response = await api(`/attachments/paper?${params}`);
    state.assessments = rows(response.assessments);
  }

  function syncDraft() {
    const form = container.querySelector("[data-paper-form]");
    if (!form) return;
    const data = new FormData(form);
    ["classId","academicYear","semester","title","testType","assessmentDate","mode","subject","unit","lesson","instructions","opensAt","closesAt"].forEach((key) => { state.draft[key] = String(data.get(key) || ""); });
    state.draft.threshold = Math.max(0, Math.min(100, Number(data.get("threshold")) || 0));
    container.querySelectorAll("[data-paper-skill-row]").forEach((element) => {
      const index = Number(element.dataset.paperSkillRow); const item = state.draft.skills[index]; if (!item) return;
      item.participants = Math.max(0, Number(element.querySelector('[name="participants"]')?.value) || 0);
      item.mastered = Math.max(0, Number(element.querySelector('[name="mastered"]')?.value) || 0);
    });
    container.querySelectorAll("[data-paper-question-row]").forEach((element) => {
      const index = Number(element.dataset.paperQuestionRow); const item = state.draft.questions[index]; if (!item) return;
      item.number = element.querySelector('[name="number"]')?.value || "";
      item.text = element.querySelector('[name="text"]')?.value || "";
      item.maxPoints = Number(element.querySelector('[name="maxPoints"]')?.value) || 0;
    });
  }

  function editorHtml() {
    if (!state.editing) return "";
    const context = state.context || {};
    const d = state.draft;
    const skillPicker = `<div class="paper-assessment__add"><select data-paper-new-skill>${optionRows(context.skills, "", escapeHtml, "اختاري المهارة")}</select><button type="button" class="btn btn-primary" data-paper-add-item>${d.mode === "student_entry" ? "إضافة سؤال" : "إضافة مهارة"}</button></div>`;
    const aggregate = d.mode === "teacher_aggregate" ? `${skillPicker}<div class="paper-assessment__rows">${d.skills.map((item,index) => `<article data-paper-skill-row="${index}"><div><strong>${escapeHtml(item.skillName)}</strong><small>إدخال مجمع دون أسماء الطالبات</small></div><label>المشاركات<input name="participants" type="number" min="0" max="${rows(context.students).length}" value="${item.participants}"></label><label>المتقنات<input name="mastered" type="number" min="0" max="${rows(context.students).length}" value="${item.mastered}"></label><button type="button" class="btn btn-danger" data-paper-remove-skill="${index}">إزالة</button></article>`).join("")}</div>`
      : `${skillPicker}<div class="paper-assessment__rows">${d.questions.map((item,index) => `<article data-paper-question-row="${index}"><div><strong>${escapeHtml(item.skillName)}</strong><small>السؤال مرتبط بهذه المهارة</small></div><label>رقم السؤال<input name="number" maxlength="40" value="${escapeHtml(item.number)}"></label><label>الدرجة العظمى<input name="maxPoints" type="number" min="0.01" max="1000" step="0.01" value="${item.maxPoints}"></label><label class="paper-assessment__wide">وصف اختياري<input name="text" maxlength="500" value="${escapeHtml(item.text || "")}"></label><button type="button" class="btn btn-danger" data-paper-remove-question="${index}">إزالة</button></article>`).join("")}</div>`;
    return `<section class="card paper-assessment__editor"><div class="skill-files__section-title"><div><span>${d.id ? "تعديل المسودة" : "اختبار جديد"}</span><h3>إعداد الاختبار الورقي</h3></div><button type="button" class="btn btn-light" data-paper-cancel>إغلاق</button></div>
      <form data-paper-form><div class="skill-files__filter-grid">
        <label class="skill-files__field"><span>الفصل *</span><select name="classId" required>${optionRows(context.classes,d.classId,escapeHtml)}</select></label>
        <label class="skill-files__field"><span>اسم الاختبار *</span><input name="title" maxlength="190" required value="${escapeHtml(d.title)}" placeholder="مثال: الاختبار الفتري الأول"></label>
        <label class="skill-files__field"><span>نوع الاختبار *</span><select name="testType">${optionRows(context.testTypes,d.testType,escapeHtml)}</select></label>
        <label class="skill-files__field"><span>تاريخ الاختبار *</span><input name="assessmentDate" type="date" required value="${escapeHtml(d.assessmentDate)}"></label>
        <label class="skill-files__field"><span>طريقة تسجيل النتائج *</span><select name="mode"><option value="teacher_aggregate" ${d.mode === "teacher_aggregate" ? "selected" : ""}>تسجيل مجمع بواسطة المعلمة</option><option value="student_entry" ${d.mode === "student_entry" ? "selected" : ""}>تسجيل فردي بواسطة الطالبات</option></select></label>
        <label class="skill-files__field"><span>عتبة الإتقان</span><input name="threshold" type="number" min="0" max="100" value="${d.threshold}"><small>تُعد الطالبة متقنة للمهارة إذا بلغت هذه النسبة أو تجاوزتها.</small></label>
        <label class="skill-files__field"><span>العام الدراسي</span><input name="academicYear" readonly value="${escapeHtml(d.academicYear)}"></label>
        <label class="skill-files__field"><span>الفصل الدراسي</span><select name="semester"><option value="first" ${d.semester === "first" ? "selected" : ""}>الأول</option><option value="second" ${d.semester === "second" ? "selected" : ""}>الثاني</option></select></label>
        <label class="skill-files__field"><span>المادة</span><input name="subject" maxlength="190" value="${escapeHtml(d.subject)}"></label>
        <label class="skill-files__field"><span>الوحدة</span><input name="unit" maxlength="190" value="${escapeHtml(d.unit)}"></label>
        <label class="skill-files__field"><span>الدرس</span><input name="lesson" maxlength="190" value="${escapeHtml(d.lesson)}"></label>
        ${d.mode === "student_entry" ? `<label class="skill-files__field"><span>فتح التسجيل</span><input name="opensAt" type="datetime-local" value="${escapeHtml(dateTimeInput(d.opensAt))}"></label><label class="skill-files__field"><span>إغلاق التسجيل</span><input name="closesAt" type="datetime-local" value="${escapeHtml(dateTimeInput(d.closesAt))}"></label>` : ""}
        <label class="skill-files__field paper-assessment__instructions"><span>تعليمات الطالبات</span><textarea name="instructions" maxlength="2000" rows="3">${escapeHtml(d.instructions)}</textarea></label>
      </div><div class="skill-files__section-title"><div><span>${d.mode === "student_entry" ? "الأسئلة" : "المهارات"}</span><h3>${d.mode === "student_entry" ? "ربط كل سؤال بمهارته ودرجته" : "تسجيل عدد المشاركات والمتقنات"}</h3></div></div>${aggregate}
      <div class="skill-files__manual-actions"><button type="submit" class="btn btn-primary" data-paper-save>حفظ المسودة</button></div></form></section>`;
  }

  function listHtml() {
    return `<section class="card paper-assessment__list"><div class="skill-files__section-title"><div><span>السجل</span><h3>الاختبارات الورقية</h3></div><button type="button" class="btn btn-primary" data-paper-new>اختبار جديد</button></div>${state.assessments.length ? `<div class="skill-files__saved-list">${state.assessments.map((item) => `<article><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.className)} · ${escapeHtml(item.testTypeLabel)} · ${escapeHtml(item.modeLabel)}</p><small><span class="paper-status ${statusClass(item.status)}">${escapeHtml(item.statusLabel)}</span> · ${numberAr(item.questionCount || item.skillCount,0)} ${item.mode === "student_entry" ? "سؤال" : "مهارة"}${item.mode === "student_entry" ? ` · ${numberAr(item.pendingCount,0)} بانتظار الاعتماد` : ""}</small></div><div><button type="button" class="btn btn-light" data-paper-open="${item.id}">فتح</button>${item.status === "draft" ? `<button type="button" class="btn btn-light" data-paper-edit="${item.id}">تعديل</button><button type="button" class="btn btn-danger" data-paper-delete="${item.id}">حذف</button>` : ""}</div></article>`).join("")}</div>` : '<div class="skill-files__empty"><h3>لا توجد اختبارات ورقية</h3><p>أنشئي الاختبار الأول وحددي طريقة جمع نتائجه.</p></div>'}</section>`;
  }

  function detailHtml() {
    if (!state.detail) return "";
    const { assessment, analysis } = state.detail;
    const actions = assessment.status === "draft" ? (assessment.mode === "student_entry" ? `<button class="btn btn-primary" data-paper-action="publish">نشر للطالبات</button>` : `<button class="btn btn-primary" data-paper-action="close">اعتماد النتائج المجمعة</button>`) : assessment.status === "open" ? `<button class="btn btn-danger" data-paper-action="close">إغلاق التسجيل</button>` : assessment.mode === "student_entry" ? `<button class="btn btn-light" data-paper-action="reopen">إعادة فتح التسجيل</button>` : "";
    const skillItems = rows(analysis.skillRows).map((row) => ({ label: row.skillName, value: row.masteryPercent, state: "لا توجد نتائج معتمدة", participants: row.participants, mastered: row.mastered }));
    const aggregateTable = `<div class="skill-files__table-scroll"><table><thead><tr><th>المهارة</th><th>المشاركات</th><th>المتقنات</th><th>غير المتقنات</th><th>نسبة الإتقان</th></tr></thead><tbody>${rows(analysis.skillRows).map((row) => `<tr><td><strong>${escapeHtml(row.skillName)}</strong></td><td>${numberAr(row.participants,0)}</td><td>${numberAr(row.mastered,0)}</td><td>${numberAr(row.notMastered,0)}</td><td>${percent(row.masteryPercent)}</td></tr>`).join("")}</tbody></table></div>`;
    const skillSummary = `<div class="paper-assessment__chart">${chartList(skillItems,assessment.threshold,escapeHtml,"skill")}</div>${aggregateTable}`;
    const studentDetails = `<div class="paper-assessment__student-details"><div class="skill-files__section-title"><div><span>مراجعة واعتماد</span><h3>تفاصيل كل طالبة</h3><p>الدرجات تظهر للمراجعة، ولا تدخل في ملخص المهارات إلا بعد الاعتماد.</p></div><button type="button" class="btn btn-primary" data-paper-bulk-approve>اعتماد المحدد</button></div><div class="skill-files__table-scroll"><table><thead><tr><th><input type="checkbox" data-paper-select-all aria-label="تحديد النتائج المعلقة"></th><th>الطالبة</th><th>الحالة</th><th>الدرجة</th><th>النسبة</th><th>المهارات المتقنة</th><th>الإجراء</th></tr></thead><tbody>${rows(analysis.studentRows).map((row) => `<tr><td>${row.status === "submitted" ? `<input type="checkbox" aria-label="تحديد نتيجة ${escapeHtml(row.studentName)}" data-paper-submission-select="${row.submissionId}">` : ""}</td><td><strong>${escapeHtml(row.studentName)}</strong></td><td><span class="paper-status ${statusClass(row.status)}">${escapeHtml(row.statusLabel)}</span></td><td>${row.percent === null ? "—" : `${numberAr(row.earned)} / ${numberAr(row.possible)}`}</td><td>${row.percent === null ? "—" : percent(row.percent)}</td><td>${row.status === "approved" ? `${numberAr(row.masteredSkills,0)} من ${numberAr(row.skillCount,0)}` : "بعد الاعتماد"}</td><td>${row.submissionId ? `<button class="btn btn-light" data-paper-view-submission="${row.submissionId}">عرض الورقة</button>${row.status === "submitted" ? `<button class="btn btn-primary" data-paper-approve="${row.submissionId}">اعتماد</button><button class="btn btn-danger" data-paper-return="${row.submissionId}">إعادة</button>` : row.status === "approved" ? `<button class="btn btn-light" data-paper-return="${row.submissionId}">إعادة فتح</button>` : ""}` : "—"}</td></tr>`).join("")}</tbody></table></div></div>`;
    const analysisBody = assessment.mode === "teacher_aggregate" || state.detailMode === "skills" ? skillSummary : studentDetails;
    return `<section class="card paper-assessment__detail"><div class="skill-files__section-title"><div><span>${escapeHtml(assessment.testTypeLabel)}</span><h3>${escapeHtml(assessment.title)}</h3><p>${escapeHtml(assessment.className)} · ${escapeHtml(assessment.modeLabel)} · العتبة ${numberAr(assessment.threshold,0)}٪</p></div><div class="paper-assessment__actions">${actions}<button class="btn btn-light" data-paper-close-detail>إغلاق العرض</button></div></div>
      ${assessment.mode === "student_entry" ? `<section class="skill-files__metrics"><article><span>طالبات الفصل</span><strong>${numberAr(analysis.summary.totalStudents,0)}</strong></article><article><span>المسجلات</span><strong>${numberAr(analysis.summary.registered,0)}</strong></article><article><span>بانتظار الاعتماد</span><strong>${numberAr(analysis.summary.pending,0)}</strong></article><article><span>المعتمدات</span><strong>${numberAr(analysis.summary.approved,0)}</strong></article><article><span>معادة للتعديل</span><strong>${numberAr(analysis.summary.returned,0)}</strong></article><article><span>لم تسجل</span><strong>${numberAr(analysis.summary.notRegistered,0)}</strong></article></section><div class="skill-files__mode"><button class="${state.detailMode === "skills" ? "is-active" : ""}" data-paper-detail-mode="skills">ملخص المهارات</button><button class="${state.detailMode === "students" ? "is-active" : ""}" data-paper-detail-mode="students">تفاصيل الطالبات</button></div>` : ""}
      ${analysisBody}</section>${submissionDetailHtml()}`;
  }

  function submissionDetailHtml() {
    if (!state.submissionDetail) return "";
    const detail = state.submissionDetail;
    return `<section class="card paper-assessment__submission-detail"><div class="skill-files__section-title"><div><span>ورقة طالبة</span><h3>${escapeHtml(detail.submission.studentName)}</h3><p>${escapeHtml(detail.submission.statusLabel)} · ${detail.submission.percent === null ? "—" : percent(detail.submission.percent)}</p></div><button class="btn btn-light" data-paper-close-submission>إغلاق</button></div><div class="skill-files__table-scroll"><table><thead><tr><th>السؤال</th><th>المهارة</th><th>الدرجة</th></tr></thead><tbody>${rows(detail.answers).map((answer) => `<tr><td>${escapeHtml(answer.number)}${answer.text ? `<small>${escapeHtml(answer.text)}</small>` : ""}</td><td>${escapeHtml(answer.skillName)}</td><td>${answer.earnedPoints === null ? "—" : `${numberAr(answer.earnedPoints)} / ${numberAr(answer.maxPoints)}`}</td></tr>`).join("")}</tbody></table></div>${detail.files.length ? `<div class="paper-assessment__files">${detail.files.map((file) => `<a class="btn btn-light" target="_blank" rel="noopener" href="${file.url}">${escapeHtml(file.name)}</a>`).join("")}</div>` : '<p class="skill-files__mode-note">لم ترفق الطالبة صورة للورقة.</p>'}</section>`;
  }

  function render() {
    if (!state.context?.migrationReady) {
      container.innerHTML = `<section class="card skill-files__migration"><span>!</span><div><h2>الاختبارات الورقية تحتاج تفعيل الجداول</h2><p>شغّلي الملف التالي مرة واحدة بعد نسخ المشروع.</p><code>${escapeHtml(state.context?.migrationFile || "migration_20260810_paper_assessments.sql")}</code></div></section>`;
      return;
    }
    container.innerHTML = `<section class="card skill-files__hero"><div><span>اختبارات الورق داخل مدار</span><h2>الاختبارات الورقية</h2><p>سجلي أعداد الإتقان مباشرة، أو انشري نموذجًا تدخل فيه كل طالبة درجات ورقتها ثم اعتمدي النتائج.</p></div><button class="btn btn-primary" data-paper-new>اختبار جديد</button></section>${editorHtml()}${detailHtml()}${listHtml()}`;
    bind();
  }

  async function openAssessment(id) { state.detail = await api(`/attachments/paper/${id}`); state.detailMode = "skills"; state.submissionDetail = null; render(); }

  async function editAssessment(id) {
    const detail = await api(`/attachments/paper/${id}`); const a = detail.assessment;
    state.draft = { id:a.id,classId:String(a.classId),academicYear:a.academicYear,semester:a.semester,title:a.title,testType:a.testType,assessmentDate:a.assessmentDate,mode:a.mode,threshold:a.threshold,subject:a.subject||"",unit:a.unit||"",lesson:a.lesson||"",instructions:a.instructions||"",opensAt:a.opensAt||"",closesAt:a.closesAt||"",skills:rows(detail.skills).map(x=>({skillId:String(x.skillId),skillName:x.skillName,participants:x.participants,mastered:x.mastered})),questions:rows(detail.questions).map(x=>({skillId:String(x.skillId),skillName:x.skillName,number:x.number,text:x.text||"",maxPoints:x.maxPoints})) };
    await loadContext(state.draft.classId); state.editing = true; state.detail = null; render();
  }

  function bind() {
    container.querySelectorAll("[data-paper-new]").forEach((button) => button.onclick = () => { state.draft = freshDraft(query); if (!state.draft.classId && state.context.classes?.[0]) state.draft.classId=String(state.context.classes[0].value); state.editing=true;state.detail=null;render(); });
    container.querySelector("[data-paper-cancel]")?.addEventListener("click",()=>{state.editing=false;render();});
    const form = container.querySelector("[data-paper-form]");
    form?.querySelector('[name="classId"]')?.addEventListener("change",async(event)=>{syncDraft();state.draft.classId=event.target.value;state.draft.skills=[];state.draft.questions=[];await loadContext(state.draft.classId);render();});
    form?.querySelector('[name="mode"]')?.addEventListener("change",event=>{syncDraft();state.draft.mode=event.target.value;render();});
    container.querySelector("[data-paper-add-item]")?.addEventListener("click",()=>{syncDraft();const id=container.querySelector("[data-paper-new-skill]")?.value;const skill=rows(state.context.skills).find(x=>String(x.value)===String(id));if(!skill){toast("اختاري مهارة أولًا.","error");return;}if(state.draft.mode==="teacher_aggregate"){if(state.draft.skills.some(x=>String(x.skillId)===String(id))){toast("المهارة مضافة بالفعل.","error");return;}state.draft.skills.push({skillId:String(id),skillName:skill.label,participants:0,mastered:0});}else{state.draft.questions.push({skillId:String(id),skillName:skill.label,number:String(state.draft.questions.length+1),text:"",maxPoints:1});}render();});
    container.querySelectorAll("[data-paper-remove-skill]").forEach(button=>button.onclick=()=>{syncDraft();state.draft.skills.splice(Number(button.dataset.paperRemoveSkill),1);render();});
    container.querySelectorAll("[data-paper-remove-question]").forEach(button=>button.onclick=()=>{syncDraft();state.draft.questions.splice(Number(button.dataset.paperRemoveQuestion),1);render();});
    form?.addEventListener("submit",async(event)=>{event.preventDefault();syncDraft();const payload={...state.draft,skills:state.draft.skills.map(({skillId,participants,mastered})=>({skillId,participants,mastered})),questions:state.draft.questions.map(({skillId,number,text,maxPoints})=>({skillId,number,text,maxPoints}))};try{const result=await api("/attachments/paper",{method:"POST",body:JSON.stringify(payload)});toast("تم حفظ مسودة الاختبار.");state.editing=false;await loadList();await openAssessment(result.id);}catch(error){toast(error.message||"تعذّر الحفظ.","error");}});
    container.querySelectorAll("[data-paper-open]").forEach(button=>button.onclick=()=>openAssessment(button.dataset.paperOpen).catch(error=>toast(error.message,"error")));
    container.querySelectorAll("[data-paper-edit]").forEach(button=>button.onclick=()=>editAssessment(button.dataset.paperEdit).catch(error=>toast(error.message,"error")));
    container.querySelectorAll("[data-paper-delete]").forEach(button=>button.onclick=async()=>{if(!confirm("حذف مسودة الاختبار؟"))return;try{await api(`/attachments/paper/${button.dataset.paperDelete}/delete`,{method:"POST",body:"{}"});toast("تم حذف المسودة.");await loadList();render();}catch(error){toast(error.message,"error");}});
    container.querySelector("[data-paper-close-detail]")?.addEventListener("click",()=>{state.detail=null;state.submissionDetail=null;render();});
    container.querySelectorAll("[data-paper-action]").forEach(button=>button.onclick=async()=>{const action=button.dataset.paperAction;if(!confirm(action==="publish"?"نشر الاختبار لطالبات الفصل؟":action==="close"?"تأكيد إغلاق أو اعتماد الاختبار؟":"إعادة فتح التسجيل؟"))return;try{await api(`/attachments/paper/${state.detail.assessment.id}/${action}`,{method:"POST",body:"{}"});toast("تم تحديث حالة الاختبار.");await loadList();await openAssessment(state.detail.assessment.id);}catch(error){toast(error.message,"error");}});
    container.querySelectorAll("[data-paper-detail-mode]").forEach(button=>button.onclick=()=>{state.detailMode=button.dataset.paperDetailMode;render();});
    container.querySelectorAll("[data-paper-view-submission]").forEach(button=>button.onclick=async()=>{try{state.submissionDetail=await api(`/attachments/paper/${state.detail.assessment.id}/submissions/${button.dataset.paperViewSubmission}`);render();}catch(error){toast(error.message,"error");}});
    container.querySelector("[data-paper-close-submission]")?.addEventListener("click",()=>{state.submissionDetail=null;render();});
    container.querySelectorAll("[data-paper-approve]").forEach(button=>button.onclick=()=>review(button.dataset.paperApprove,"approve"));
    container.querySelectorAll("[data-paper-return]").forEach(button=>button.onclick=()=>review(button.dataset.paperReturn,"return"));
    container.querySelector("[data-paper-select-all]")?.addEventListener("change",event=>container.querySelectorAll("[data-paper-submission-select]").forEach(input=>{input.checked=event.target.checked;}));
    container.querySelector("[data-paper-bulk-approve]")?.addEventListener("click",async()=>{const ids=[...container.querySelectorAll("[data-paper-submission-select]:checked")].map(x=>Number(x.dataset.paperSubmissionSelect)).filter(Number.isFinite);if(!ids.length){toast("حددي نتائج بانتظار الاعتماد.","error");return;}try{await api(`/attachments/paper/${state.detail.assessment.id}/approve-bulk`,{method:"POST",body:JSON.stringify({ids})});toast("تم اعتماد النتائج المحددة.");await loadList();await openAssessment(state.detail.assessment.id);}catch(error){toast(error.message,"error");}});
  }

  async function review(submissionId, action) { const note=action==="return"?prompt("ملاحظة للطالبة عند إعادة النتيجة:","يرجى مراجعة الدرجات وإعادة التسليم."):"";if(action==="return"&&note===null)return;try{await api(`/attachments/paper/${state.detail.assessment.id}/submissions/${submissionId}/${action}`,{method:"POST",body:JSON.stringify({note})});toast(action==="approve"?"تم اعتماد النتيجة.":"أعيدت النتيجة للطالبة.");await loadList();await openAssessment(state.detail.assessment.id);}catch(error){toast(error.message,"error");} }

  container.innerHTML = '<div class="skill-files__loading">جارٍ تحميل الاختبارات الورقية…</div>';
  try { await loadContext(); if (state.context.migrationReady) await loadList(); render(); } catch (error) { container.innerHTML=`<section class="skill-files__empty"><h3>تعذّر تحميل الاختبارات الورقية</h3><p>${escapeHtml(error.message||"حدث خطأ غير متوقع.")}</p></section>`; }
}
