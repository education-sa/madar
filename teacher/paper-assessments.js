const rows = (value) => Array.isArray(value) ? value : [];
const numberAr = (value, digits = 1) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? new Intl.NumberFormat("ar-SA", { maximumFractionDigits: digits }).format(Number(value)) : "—";
const percent = (value) => value === null || value === undefined || value === "" ? "—" : `${numberAr(value)}٪`;
const dateTimeInput = (value) => String(value || "").replace(" ", "T").slice(0, 16);
const safeNumber = (value) => value === "" || value === null || value === undefined ? null : Number(value);

function optionRows(options, selected, escapeHtml, empty = "اختاري") {
  return `<option value="">${escapeHtml(empty)}</option>${rows(options).map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selected) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}`;
}

function freshDraft(query) {
  return {
    id: 0, classId: query.get("classId") || "", stage: query.get("stage") || "", gradeLabel: query.get("gradeLabel") || "",
    academicYear: query.get("academicYear") || "", semester: query.get("semester") || "first", title: "", testType: "periodic_1",
    assessmentDate: new Date(Date.now() + 10800000).toISOString().slice(0, 10), mode: "teacher_aggregate", threshold: 80,
    subject: "", unit: "", lesson: "", instructions: "", opensAt: "", closesAt: "", questions: [], sourceFiles: [],
  };
}

function statusClass(status) {
  return ["approved", "open"].includes(status) ? "is-approved" : ["submitted", "draft"].includes(status) ? "is-pending" : status === "returned" ? "is-returned" : "is-closed";
}

function chartList(items, threshold, escapeHtml, kind) {
  if (!items.length) return '<div class="skill-files__empty paper-assessment__empty-small"><h3>لا توجد نتائج متاحة</h3><p>ستظهر النتائج بعد إدخال الدرجات.</p></div>';
  return `<div class="skill-files__chart-list">${items.map((item) => {
    const notReady = item.value === null || item.value === undefined;
    const value = notReady ? 0 : Math.max(0, Math.min(100, Number(item.value) || 0));
    return `<article class="skill-files__chart-row ${notReady ? "is-paper-empty" : ""}"><div><strong>${escapeHtml(item.label)}</strong><span>${notReady ? escapeHtml(item.state || "لم تسجل") : percent(value)}</span></div><div class="skill-files__track" style="--skill-threshold:${threshold}%"><i class="${value >= threshold ? "is-mastered" : ""}" style="--skill-bar:${value}%"></i></div>${kind === "skill" ? `<small>${numberAr(item.completed, 0)} درجة مدخلة</small>` : ""}</article>`;
  }).join("")}</div>`;
}

export async function renderTeacherPaperAssessments({ container, api, escapeHtml, toast, getAcademicQuery, onRender }) {
  const query = new URLSearchParams(getAcademicQuery("attachments"));
  const state = { context: null, assessments: [], editing: false, draft: freshDraft(query), detail: null, detailMode: "skills", submissionDetail: null, gradeRows: [] };
  const qKey = (question, index) => String(question.id || question.questionId || question.clientKey || `new-${index}`);

  async function loadContext(classId = state.draft.classId) {
    const params = new URLSearchParams(query);
    if (classId) params.set("classId", classId);
    state.context = await api(`/attachments/paper/context?${params}`);
    if (!state.context.migrationReady) return;
    if (!state.draft.classId && rows(state.context.classes).length) {
      state.draft.classId = String(state.context.classes[0].value);
      return loadContext(state.draft.classId);
    }
    const selectedClass = state.context.selectedClass || rows(state.context.classes).find((item) => String(item.value) === String(state.draft.classId));
    if (selectedClass) {
      state.draft.stage = selectedClass.stage || "";
      state.draft.gradeLabel = selectedClass.gradeLabel || "";
      if (!state.draft.academicYear) state.draft.academicYear = selectedClass.academicYear || "";
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

  function studentsForGrid() {
    const source = rows(state.detail?.gradebook?.students).length ? state.detail.gradebook.students : rows(state.context?.students);
    return source.map((student) => ({
      studentId: Number(student.studentId ?? student.value ?? student.id),
      studentName: String(student.studentName ?? student.label ?? student.name ?? "—"),
      answers: { ...(student.answers || {}) }, status: student.status || "draft", submissionId: student.submissionId || null,
    })).filter((student) => Number.isFinite(student.studentId));
  }

  function hydrateGradeRows() {
    const existing = new Map(state.gradeRows.map((row) => [String(row.studentId), row]));
    state.gradeRows = studentsForGrid().map((student) => {
      const previous = existing.get(String(student.studentId));
      return { ...student, answers: { ...student.answers, ...(previous?.answers || {}) } };
    });
  }

  function syncDraft() {
    const form = container.querySelector("[data-paper-form]");
    if (!form) return;
    const data = new FormData(form);
    ["classId", "academicYear", "semester", "title", "testType", "assessmentDate", "mode", "subject", "unit", "lesson", "instructions", "opensAt", "closesAt"].forEach((key) => { state.draft[key] = String(data.get(key) || ""); });
    state.draft.threshold = Math.max(0, Math.min(100, Number(data.get("threshold")) || 0));
    container.querySelectorAll("[data-paper-question-row]").forEach((element) => {
      const index = Number(element.dataset.paperQuestionRow); const item = state.draft.questions[index]; if (!item) return;
      item.number = element.querySelector('[name="number"]')?.value || "";
      item.text = element.querySelector('[name="text"]')?.value || "";
      item.maxPoints = Number(element.querySelector('[name="maxPoints"]')?.value) || 0;
    });
    syncGradeInputs();
  }

  function syncGradeInputs(scope = container) {
    scope.querySelectorAll?.("[data-grade-student][data-grade-question]").forEach((input) => {
      const row = state.gradeRows.find((item) => String(item.studentId) === String(input.dataset.gradeStudent));
      if (row) row.answers[String(input.dataset.gradeQuestion)] = input.value;
    });
  }

  function gradeStats(questions, gradeRows) {
    const questionStats = questions.map((question, index) => {
      const key = qKey(question, index); const max = Number(question.maxPoints) || 0; let earned = 0; let completed = 0;
      gradeRows.forEach((row) => { const value = safeNumber(row.answers?.[key]); if (value !== null && Number.isFinite(value) && value >= 0 && value <= max) { earned += value; completed += 1; } });
      return { key, label: `السؤال ${question.number || index + 1}`, skillName: question.skillName || "غير مرتبطة", earned, possible: max * completed, completed, value: completed && max > 0 ? earned / (max * completed) * 100 : null };
    });
    const skillMap = new Map();
    questionStats.forEach((item) => { const current = skillMap.get(item.skillName) || { label:item.skillName,earned:0,possible:0,completed:0 }; current.earned += item.earned; current.possible += item.possible; current.completed += item.completed; skillMap.set(item.skillName,current); });
    const skillStats = [...skillMap.values()].map((item) => ({ ...item, value:item.possible > 0 ? item.earned / item.possible * 100 : null }));
    return { questionStats, skillStats };
  }

  function gradebookHtml(questions, gradeRows, { editable = true, preview = false } = {}) {
    if (!questions.length) return '<div class="paper-assessment__grid-empty"><strong>أضيفي أسئلة الاختبار أولًا</strong><p>ستظهر شبكة الدرجات فور إضافة سؤال.</p></div>';
    if (!gradeRows.length) return '<div class="paper-assessment__grid-empty"><strong>لا توجد طالبات في الفصل المحدد</strong><p>اختاري فصلًا يحتوي على طالبات لإظهار شبكة الدرجات.</p></div>';
    const possible = questions.reduce((sum, question) => sum + (Number(question.maxPoints) || 0), 0);
    const { questionStats, skillStats } = gradeStats(questions, gradeRows);
    return `<section class="paper-assessment__gradebook" data-paper-gradebook><div class="paper-assessment__gradebook-head"><div><span>شبكة الدرجات</span><h3>${preview ? "معاينة جدول إدخال المعلمة" : "درجات الطالبات"}</h3><p>${preview ? "يمكنكِ الكتابة الآن، ولن تُحفظ هذه القيم قبل حفظ الاختبار ثم حفظ الدرجات." : "الحسابات لحظية، ولا تدخل في التحليل الرسمي إلا بعد اعتماد النتائج."}</p></div><span class="paper-status ${editable ? "is-pending" : "is-approved"}">${editable ? "مسودة درجات" : "نتائج معتمدة"}</span></div><p class="paper-assessment__scroll-hint">مرّري الجدول أفقيًا لرؤية جميع الأسئلة والنتائج.</p><div class="skill-files__table-scroll paper-assessment__grade-scroll"><table class="paper-assessment__grade-table"><thead><tr><th class="is-student">اسم الطالبة</th>${questions.map((question,index) => `<th><span>السؤال ${escapeHtml(question.number || index + 1)}</span><small>من ${numberAr(question.maxPoints)}</small></th>`).join("")}<th class="is-summary is-total">المجموع</th><th class="is-summary is-percent">النسبة</th><th class="is-summary is-status">حالة الإتقان</th></tr></thead><tbody>${gradeRows.map((student) => {
      const values = questions.map((question,index) => safeNumber(student.answers?.[qKey(question,index)]));
      const valid = values.map((value,index) => value !== null && Number.isFinite(value) && value >= 0 && value <= (Number(questions[index].maxPoints)||0));
      const invalid = values.some((value,index) => value !== null && !valid[index]); const earned = values.reduce((sum,value,index) => sum + (valid[index] ? value : 0),0); const complete = valid.every(Boolean); const ratio = possible > 0 ? earned / possible * 100 : 0;
      const pendingLabel = invalid ? "درجة غير صالحة" : "غير مكتمل";
      return `<tr data-grade-row="${student.studentId}"><td class="is-student"><strong>${escapeHtml(student.studentName)}</strong></td>${questions.map((question,index) => { const key=qKey(question,index); const value=student.answers?.[key] ?? ""; return `<td><input class="paper-assessment__grade-input" type="number" inputmode="decimal" min="0" max="${Number(question.maxPoints)||0}" step="0.01" value="${escapeHtml(value)}" data-grade-student="${student.studentId}" data-grade-question="${escapeHtml(key)}" aria-label="درجة ${escapeHtml(student.studentName)} في السؤال ${escapeHtml(question.number || index+1)} من ${numberAr(question.maxPoints)}" ${editable ? "" : "disabled"}><small class="paper-assessment__field-error" aria-live="polite"></small></td>`; }).join("")}<td class="is-summary is-total" data-row-total>${complete ? numberAr(earned,2) : `${numberAr(earned,2)}*`} / ${numberAr(possible,2)}</td><td class="is-summary is-percent" data-row-percent>${complete ? percent(ratio) : pendingLabel}</td><td class="is-summary is-status" data-row-status><span class="skill-files__status ${complete && ratio >= Number(state.draft.threshold || state.detail?.assessment?.threshold || 80) ? "is-mastered" : complete ? "" : "is-not-tested"}">${complete ? (ratio >= Number(state.draft.threshold || state.detail?.assessment?.threshold || 80) ? "متقنة" : "تحتاج دعمًا") : pendingLabel}</span></td></tr>`;
    }).join("")}</tbody></table></div><div class="paper-assessment__preview"><div><span>معاينة قبل الاعتماد</span><h3>إتقان الأسئلة والمهارات</h3><p>الحساب يعتمد على الخلايا المكتملة فقط، ولا يظهر في التحليل الرسمي قبل الاعتماد.</p></div><div class="paper-assessment__preview-columns"><section><h4>الأسئلة</h4>${chartList(questionStats,state.draft.threshold || state.detail?.assessment?.threshold || 80,escapeHtml,"question")}</section><section><h4>المهارات</h4>${chartList(skillStats,state.draft.threshold || state.detail?.assessment?.threshold || 80,escapeHtml,"skill")}</section></div></div></section>`;
  }

  function editorHtml() {
    if (!state.editing) return "";
    const context = state.context || {}; const d = state.draft; const isLegacy = Boolean(d.legacy);
    const skillPicker = `<div class="paper-assessment__add"><select data-paper-new-skill aria-label="اختيار المهارة المرتبطة بالسؤال">${optionRows(context.skills,"",escapeHtml,"اختاري المهارة")}</select><button type="button" class="btn btn-primary" data-paper-add-item>إضافة سؤال</button></div>`;
    const questionRows = `<div class="paper-assessment__rows">${d.questions.map((item,index) => `<article data-paper-question-row="${index}"><div><strong>${escapeHtml(item.skillName)}</strong><small>السؤال مرتبط بهذه المهارة</small></div><label>رقم السؤال<input name="number" maxlength="40" required value="${escapeHtml(item.number)}"></label><label>الدرجة القصوى<input name="maxPoints" type="number" min="0.01" max="1000" step="0.01" required value="${item.maxPoints}"></label><label class="paper-assessment__wide">وصف اختياري<input name="text" maxlength="500" value="${escapeHtml(item.text || "")}"></label><button type="button" class="btn btn-danger" data-paper-remove-question="${index}">إزالة</button></article>`).join("")}</div>`;
    const sourceReady = Boolean(context.sourceFileReady); const sourceFiles = rows(d.sourceFiles);
    return `<section class="card paper-assessment__editor"><div class="skill-files__section-title"><div><span>${d.id ? "تعديل المسودة" : "اختبار جديد"}</span><h3>إعداد الاختبار الورقي</h3></div><button type="button" class="btn btn-light" data-paper-cancel>إغلاق</button></div>${isLegacy ? '<div class="paper-assessment__legacy"><strong>اختبار قديم بتسجيل مجمّع</strong><p>يمكن عرضه للقراءة، ولا يمكن تحويله إلى شبكة أسئلة.</p></div>' : `<form data-paper-form><div class="skill-files__filter-grid">
      <div class="paper-assessment__form-band"><strong>بيانات الاختبار والفصل</strong><small>المعلومات الأساسية لتحديد الاختبار وطالباته.</small></div>
      <label class="skill-files__field"><span>اسم الاختبار *</span><input name="title" maxlength="190" required value="${escapeHtml(d.title)}" placeholder="مثال: الاختبار الفتري الأول"></label>
      <label class="skill-files__field"><span>نوع الاختبار *</span><select name="testType" required>${optionRows(context.testTypes,d.testType,escapeHtml)}</select></label>
      <label class="skill-files__field"><span>المرحلة</span><input value="${escapeHtml(d.stage || query.get("stage") || "—")}" readonly></label>
      <label class="skill-files__field"><span>الصف</span><input value="${escapeHtml(d.gradeLabel || query.get("gradeLabel") || "—")}" readonly></label>
      <label class="skill-files__field"><span>الفصل *</span><select name="classId" required>${optionRows(context.classes,d.classId,escapeHtml)}</select></label>
      <div class="paper-assessment__form-band"><strong>المحتوى الدراسي</strong><small>المادة والوحدة والدرس المرتبط بالاختبار.</small></div>
      <label class="skill-files__field"><span>المادة *</span><input name="subject" maxlength="190" required value="${escapeHtml(d.subject)}"></label>
      <label class="skill-files__field"><span>الوحدة <small>عند الحاجة</small></span><input name="unit" maxlength="190" value="${escapeHtml(d.unit)}"></label>
      <label class="skill-files__field"><span>الدرس <small>عند الحاجة</small></span><input name="lesson" maxlength="190" value="${escapeHtml(d.lesson)}"></label>
      <div class="paper-assessment__form-band"><strong>إدارة الدرجات</strong><small>طريقة الإدخال والمواعيد وعتبة الإتقان.</small></div>
      <label class="skill-files__field"><span>طريقة الإدخال *</span><select name="mode"><option value="teacher_aggregate" ${d.mode === "teacher_aggregate" ? "selected" : ""}>المعلمة</option><option value="student_entry" ${d.mode === "student_entry" ? "selected" : ""}>الطالبة</option></select></label>
      <label class="skill-files__field"><span>عتبة الإتقان</span><input name="threshold" type="number" min="0" max="100" step="1" value="${d.threshold}"><small>القيمة الافتراضية ٨٠٪.</small></label>
      <label class="skill-files__field"><span>تاريخ الاختبار *</span><input name="assessmentDate" type="date" required value="${escapeHtml(d.assessmentDate)}"></label>
      <label class="skill-files__field"><span>العام الدراسي</span><input name="academicYear" readonly value="${escapeHtml(d.academicYear)}"></label>
      <label class="skill-files__field"><span>الفصل الدراسي</span><select name="semester"><option value="first" ${d.semester === "first" ? "selected" : ""}>الأول</option><option value="second" ${d.semester === "second" ? "selected" : ""}>الثاني</option></select></label>
      ${d.mode === "student_entry" ? `<label class="skill-files__field"><span>فتح التسجيل</span><input name="opensAt" type="datetime-local" value="${escapeHtml(dateTimeInput(d.opensAt))}"></label><label class="skill-files__field"><span>إغلاق التسجيل</span><input name="closesAt" type="datetime-local" value="${escapeHtml(dateTimeInput(d.closesAt))}"></label>` : ""}
      <label class="skill-files__field paper-assessment__instructions"><span>تعليمات الطالبات</span><textarea name="instructions" maxlength="2000" rows="3">${escapeHtml(d.instructions)}</textarea></label>
      <label class="skill-files__field paper-assessment__source"><span>صورة أو PDF ورقة الاختبار <small>اختياري</small></span><input type="file" name="sourceFile" accept="application/pdf,image/jpeg,image/png,image/webp" ${sourceReady && d.id ? "" : "disabled"}><small>${sourceReady ? (d.id ? "يُرفع الملف عند تنفيذ الإجراء المباشر." : "احفظي الاختبار أولًا إذا أردتِ إرفاق ورقة المصدر.") : `رفع ورقة المصدر غير مفعّل حاليًا${context.sourceFileMigration ? ` (${escapeHtml(context.sourceFileMigration)})` : ""}.`}</small>${sourceFiles.map(file=>`<span class="paper-assessment__source-file"><a href="${file.url}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a><button type="button" data-paper-delete-source="${file.id}">حذف</button></span>`).join("")}</label>
    </div><div class="skill-files__section-title paper-assessment__questions-title"><div><span>الأسئلة</span><h3>ربط كل سؤال بمهارته ودرجته القصوى</h3></div></div>${skillPicker}${questionRows}${d.mode === "teacher_aggregate" ? gradebookHtml(d.questions,state.gradeRows,{preview:true}) : '<p class="paper-assessment__student-route-note">بعد النشر ستنقل كل طالبة درجات ورقتها، ثم تصل النتيجة إليكِ بانتظار المراجعة.</p>'}<div class="skill-files__manual-actions"><button type="submit" class="btn btn-primary" data-paper-save>${d.mode === "teacher_aggregate" ? "الاعتماد مباشرة" : "الحفظ والنشر مباشرة"}</button><small>${d.mode === "teacher_aggregate" ? "يشترط إدخال درجات جميع الطالبات والأسئلة." : "سيصبح الاختبار متاحًا للطالبات فورًا."}</small></div></form>`}</section>`;
  }

  function listHtml() {
    return `<section class="card paper-assessment__list"><div class="skill-files__section-title"><div><span>السجل</span><h3>الاختبارات الورقية</h3></div><button type="button" class="btn btn-primary" data-paper-new>اختبار جديد</button></div>${state.assessments.length ? `<div class="skill-files__saved-list">${state.assessments.map((item) => `<article><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.className)} · ${escapeHtml(item.testTypeLabel)} · ${escapeHtml(item.modeLabel)}</p><small><span class="paper-status ${statusClass(item.status)}">${escapeHtml(item.statusLabel)}</span> · ${numberAr(item.questionCount || item.skillCount,0)} ${item.questionCount ? "سؤال" : "مهارة"}${item.mode === "student_entry" ? ` · ${numberAr(item.pendingCount,0)} بانتظار الاعتماد` : ""}</small></div><div><button type="button" class="btn btn-light" data-paper-open="${item.id}">فتح</button><button type="button" class="btn btn-danger" data-paper-delete="${item.id}" data-paper-title="${escapeHtml(item.title)}">حذف</button>${item.status === "draft" ? `<button type="button" class="btn btn-light" data-paper-edit="${item.id}">تعديل</button>` : ""}</div></article>`).join("")}</div>` : '<div class="skill-files__empty"><h3>لا توجد اختبارات ورقية</h3><p>أنشئي الاختبار الأول وحددي طريقة إدخال درجاته.</p></div>'}</section>`;
  }

  function submissionDetailHtml() {
    if (!state.submissionDetail) return "";
    const detail = state.submissionDetail; const editable = detail.submission.status === "submitted";
    const possible = rows(detail.answers).reduce((sum,answer)=>sum+(Number(answer.maxPoints)||0),0); const earned = rows(detail.answers).reduce((sum,answer)=>sum+(Number(answer.earnedPoints)||0),0);
    return `<section class="card paper-assessment__submission-detail"><div class="skill-files__section-title"><div><span>مراجعة ورقة طالبة</span><h3>${escapeHtml(detail.submission.studentName)}</h3><p><span class="paper-status ${statusClass(detail.submission.status)}">${escapeHtml(detail.submission.statusLabel)}</span> · ${numberAr(earned,2)} من ${numberAr(possible,2)}</p></div><button class="btn btn-light" data-paper-close-submission>إغلاق</button></div><div class="skill-files__table-scroll"><table><thead><tr><th>السؤال</th><th>المهارة</th><th>الدرجة</th></tr></thead><tbody>${rows(detail.answers).map((answer,index) => `<tr><td>${escapeHtml(answer.number || index+1)}${answer.text ? `<small>${escapeHtml(answer.text)}</small>` : ""}</td><td>${escapeHtml(answer.skillName)}</td><td><div class="paper-assessment__review-input"><input type="number" inputmode="decimal" min="0" max="${answer.maxPoints}" step="0.01" value="${answer.earnedPoints ?? ""}" data-review-answer="${answer.questionId || answer.id}" aria-label="درجة ${escapeHtml(detail.submission.studentName)} في السؤال ${escapeHtml(answer.number || index+1)}" ${editable ? "" : "disabled"}><span>من ${numberAr(answer.maxPoints)}</span></div></td></tr>`).join("")}</tbody></table></div>${detail.files?.length ? `<div class="paper-assessment__files">${detail.files.map((file) => `<a class="btn btn-light" target="_blank" rel="noopener" href="${file.url}">${escapeHtml(file.name)}</a>`).join("")}</div>` : '<p class="skill-files__mode-note">لم ترفق الطالبة صورة للورقة.</p>'}${editable ? '<div class="skill-files__manual-actions"><button class="btn btn-light" data-paper-save-review>حفظ التعديلات</button><button class="btn btn-primary" data-paper-approve-review>اعتماد النتيجة</button><small>الحفظ لا يعتمد النتيجة.</small></div>' : ""}</section>`;
  }

  function detailHtml() {
    if (!state.detail) return "";
    const { assessment, analysis = {} } = state.detail; const questions = rows(state.detail.gradebook?.questions).length ? state.detail.gradebook.questions : rows(state.detail.questions); const legacy = assessment.mode === "teacher_aggregate" && !questions.length;
    const actions = assessment.mode === "student_entry" ? (assessment.status === "draft" ? '<button class="btn btn-primary" data-paper-action="publish">نشر للطالبات</button>' : assessment.status === "open" ? '<button class="btn btn-danger" data-paper-action="close">إغلاق التسجيل</button>' : '<button class="btn btn-light" data-paper-action="reopen">إعادة فتح التسجيل</button>') : "";
    const officialQuestionItems = rows(analysis.questionRows).map((row) => ({ label:`السؤال ${row.number}`,value:row.masteryPercent,state:"لا توجد نتائج معتمدة",completed:row.participants }));
    const officialSkillItems = rows(analysis.skillRows).map((row) => ({ label:row.skillName,value:row.averagePerformance ?? row.masteryPercent,state:"لا توجد نتائج معتمدة",completed:row.participants }));
    const legacyTable = `<div class="paper-assessment__legacy"><strong>سجل قديم للقراءة فقط</strong><p>هذا الاختبار يستخدم تسجيل الإتقان المجمّع السابق، لذلك لا يمكن تحويله تلقائيًا إلى درجات أسئلة.</p></div><div class="paper-assessment__chart">${chartList(officialSkillItems,assessment.threshold,escapeHtml,"skill")}</div>`;
    const studentDetails = `<div class="paper-assessment__student-details"><div class="skill-files__section-title"><div><span>مراجعة واعتماد</span><h3>تفاصيل كل طالبة</h3><p>الدرجات لا تدخل في التحليل الرسمي إلا بعد اعتماد المعلمة.</p></div><button type="button" class="btn btn-primary" data-paper-bulk-approve>اعتماد المحدد</button></div><div class="skill-files__table-scroll"><table><thead><tr><th><input type="checkbox" data-paper-select-all aria-label="تحديد النتائج المعلقة"></th><th>الطالبة</th><th>الحالة</th><th>الدرجة</th><th>النسبة</th><th>المهارات المتقنة</th><th>الإجراء</th></tr></thead><tbody>${rows(analysis.studentRows).map((row) => `<tr><td>${row.status === "submitted" ? `<input type="checkbox" aria-label="تحديد نتيجة ${escapeHtml(row.studentName)}" data-paper-submission-select="${row.submissionId}">` : ""}</td><td><strong>${escapeHtml(row.studentName)}</strong></td><td><span class="paper-status ${statusClass(row.status)}">${escapeHtml(row.statusLabel)}</span></td><td>${row.percent === null ? "—" : `${numberAr(row.earned)} / ${numberAr(row.possible)}`}</td><td>${row.percent === null ? "—" : percent(row.percent)}</td><td>${row.status === "approved" ? `${numberAr(row.masteredSkills,0)} من ${numberAr(row.skillCount,0)}` : "بعد الاعتماد"}</td><td>${row.submissionId ? `<button class="btn btn-light" data-paper-view-submission="${row.submissionId}">عرض الورقة</button>${row.status === "submitted" ? `<button class="btn btn-primary" data-paper-approve="${row.submissionId}">اعتماد</button><button class="btn btn-danger" data-paper-return="${row.submissionId}">إعادة</button>` : row.status === "approved" ? `<button class="btn btn-light" data-paper-return="${row.submissionId}">إعادة فتح</button>` : ""}` : "—"}</td></tr>`).join("")}</tbody></table></div></div>`;
    const studentBody = state.detailMode === "skills" ? `<div class="paper-assessment__preview-columns"><section class="paper-assessment__chart"><h4>إتقان الأسئلة</h4>${chartList(officialQuestionItems,assessment.threshold,escapeHtml,"question")}</section><section class="paper-assessment__chart"><h4>إتقان المهارات</h4>${chartList(officialSkillItems,assessment.threshold,escapeHtml,"skill")}</section></div>` : studentDetails;
    const teacherBody = legacy ? legacyTable : `${gradebookHtml(questions,state.gradeRows,{editable:assessment.status !== "closed"})}${assessment.status !== "closed" ? '<div class="skill-files__manual-actions"><button class="btn btn-light" data-paper-save-grades>حفظ الدرجات</button><button class="btn btn-primary" data-paper-approve-grades>اعتماد النتائج</button><small>الحفظ يبقي النتائج مسودة وخارج التحليل الرسمي.</small></div>' : ""}`;
    return `<section class="card paper-assessment__detail"><div class="skill-files__section-title"><div><span>${escapeHtml(assessment.testTypeLabel)}</span><h3>${escapeHtml(assessment.title)}</h3><p>${escapeHtml(assessment.className)} · ${escapeHtml(assessment.modeLabel)} · العتبة ${numberAr(assessment.threshold,0)}٪</p></div><div class="paper-assessment__actions">${actions}<button class="btn btn-light" data-paper-close-detail>إغلاق العرض</button></div></div>${assessment.mode === "student_entry" ? `<section class="skill-files__metrics"><article><span>طالبات الفصل</span><strong>${numberAr(analysis.summary?.totalStudents,0)}</strong></article><article><span>المسجلات</span><strong>${numberAr(analysis.summary?.registered,0)}</strong></article><article><span>بانتظار الاعتماد</span><strong>${numberAr(analysis.summary?.pending,0)}</strong></article><article><span>المعتمدات</span><strong>${numberAr(analysis.summary?.approved,0)}</strong></article><article><span>معادة للتعديل</span><strong>${numberAr(analysis.summary?.returned,0)}</strong></article><article><span>لم تسجل</span><strong>${numberAr(analysis.summary?.notRegistered,0)}</strong></article></section><div class="skill-files__mode"><button class="${state.detailMode === "skills" ? "is-active" : ""}" data-paper-detail-mode="skills">تحليل الأسئلة والمهارات</button><button class="${state.detailMode === "students" ? "is-active" : ""}" data-paper-detail-mode="students">تفاصيل الطالبات${Number(analysis.summary?.pending||0)>0?` (${numberAr(analysis.summary.pending,0)} بانتظار الاعتماد)`:""}</button></div>${studentBody}` : teacherBody}</section>${submissionDetailHtml()}`;
  }

  function render() {
    if (!state.context?.migrationReady) { container.innerHTML = `<section class="card skill-files__migration"><span>!</span><div><h2>الاختبارات الورقية تحتاج تفعيل الجداول</h2><p>شغّلي ملف التفعيل يدويًا مرة واحدة.</p><code>${escapeHtml(state.context?.migrationFile || "migration_20260810_paper_assessments.sql")}</code></div></section>`; return; }
    container.innerHTML = `<section class="card skill-files__hero"><div><span>اختبارات الورق داخل مدار</span><h2>الاختبارات الورقية</h2><p>أدخلي درجات كل سؤال أو انشري نموذج نقل الدرجات للطالبات، ثم راجعي النتائج واعتمديها.</p></div><button class="btn btn-primary" data-paper-new>اختبار جديد</button></section>${editorHtml()}${detailHtml()}${listHtml()}`;
    onRender?.(); bind(); bindGradebook();
  }

  function bindGradebook() {
    container.querySelectorAll(".paper-assessment__grade-input,[data-review-answer]").forEach((input) => input.addEventListener("input", () => {
      const number = safeNumber(input.value); const max = Number(input.max); const invalid = number !== null && (!Number.isFinite(number) || number < 0 || number > max);
      input.setCustomValidity(invalid ? `أدخلي درجة من صفر إلى ${max}` : ""); input.classList.toggle("is-invalid",invalid);
      const error = input.parentElement?.querySelector(".paper-assessment__field-error"); if (error) error.textContent = invalid ? `الحد الأقصى ${numberAr(max)}` : "";
      if (input.matches(".paper-assessment__grade-input")) { syncGradeInputs(); updateGradebookPreview(); }
    }));
  }

  function updateGradebookPreview() {
    const gradebook = container.querySelector("[data-paper-gradebook]"); if (!gradebook) return;
    const questions = state.editing ? state.draft.questions : (rows(state.detail?.gradebook?.questions).length ? state.detail.gradebook.questions : rows(state.detail?.questions));
    const possible=questions.reduce((sum,question)=>sum+(Number(question.maxPoints)||0),0);const threshold=Number(state.draft.threshold||state.detail?.assessment?.threshold||80);
    state.gradeRows.forEach((student)=>{const tr=gradebook.querySelector(`[data-grade-row="${student.studentId}"]`);if(!tr)return;const values=questions.map((question,index)=>safeNumber(student.answers?.[qKey(question,index)]));const valid=values.map((value,index)=>value!==null&&Number.isFinite(value)&&value>=0&&value<=(Number(questions[index].maxPoints)||0));const invalid=values.some((value,index)=>value!==null&&!valid[index]);const earned=values.reduce((sum,value,index)=>sum+(valid[index]?value:0),0);const complete=valid.every(Boolean);const ratio=possible>0?earned/possible*100:0;const pendingLabel=invalid?"درجة غير صالحة":"غير مكتمل";tr.querySelector("[data-row-total]").textContent=`${numberAr(earned,2)}${complete?"":"*"} / ${numberAr(possible,2)}`;tr.querySelector("[data-row-percent]").textContent=complete?percent(ratio):pendingLabel;tr.querySelector("[data-row-status]").innerHTML=`<span class="skill-files__status ${complete&&ratio>=threshold?"is-mastered":complete?"":"is-not-tested"}">${complete?(ratio>=threshold?"متقنة":"تحتاج دعمًا"):pendingLabel}</span>`;});
    const snapshot=gradebookHtml(questions,state.gradeRows,{editable:state.editing||state.detail?.assessment?.status!=="closed",preview:state.editing});const template=document.createElement("template");template.innerHTML=snapshot;const nextPreview=template.content.querySelector(".paper-assessment__preview");const currentPreview=gradebook.querySelector(".paper-assessment__preview");if(nextPreview&&currentPreview)currentPreview.replaceWith(nextPreview);
  }

  function validateGradeInputs(selector = ".paper-assessment__grade-input", requireComplete = false) {
    const inputs = [...container.querySelectorAll(selector)]; let valid = true;
    inputs.forEach((input) => { const value=safeNumber(input.value); const invalid=(requireComplete&&value===null)||(value!==null&&(!Number.isFinite(value)||value<0||value>Number(input.max))); input.setCustomValidity(invalid ? (value===null ? "هذه الدرجة مطلوبة للاعتماد" : `الدرجة يجب أن تكون بين صفر و${input.max}`) : ""); if(invalid&&valid){input.reportValidity();input.focus();} valid=valid&&!invalid; });
    return valid;
  }

  function gradePayload() { syncGradeInputs(); return { rows:state.gradeRows.map((row)=>({studentId:row.studentId,answers:{...row.answers}})) }; }
  async function openAssessment(id) {
    state.detail=await api(`/attachments/paper/${id}`);
    const pendingCount=Number(state.detail?.analysis?.summary?.pending||0);
    state.detailMode=state.detail?.assessment?.mode==="student_entry"&&pendingCount>0?"students":"skills";
    state.submissionDetail=null;
    state.gradeRows=[];
    hydrateGradeRows();
    render();
  }

  async function editAssessment(id) {
    const detail=await api(`/attachments/paper/${id}`); const a=detail.assessment; state.detail=detail;
    state.draft={id:a.id,classId:String(a.classId),stage:a.stage||query.get("stage")||"",gradeLabel:a.gradeLabel||query.get("gradeLabel")||"",academicYear:a.academicYear,semester:a.semester,title:a.title,testType:a.testType,assessmentDate:a.assessmentDate,mode:a.mode,threshold:a.threshold,subject:a.subject||"",unit:a.unit||"",lesson:a.lesson||"",instructions:a.instructions||"",opensAt:a.opensAt||"",closesAt:a.closesAt||"",questions:rows(detail.questions).map((x,index)=>({id:x.id,clientKey:String(x.id),skillId:String(x.skillId),skillName:x.skillName,number:x.number,text:x.text||"",maxPoints:x.maxPoints,sortOrder:x.sortOrder??index})),sourceFiles:rows(detail.sourceFiles),legacy:a.mode==="teacher_aggregate"&&!rows(detail.questions).length&&rows(detail.skills).length>0};
    await loadContext(state.draft.classId);state.editing=true;state.gradeRows=[];hydrateGradeRows();state.detail=null;render();
  }

  function bind() {
    container.querySelectorAll("[data-paper-new]").forEach((button)=>button.onclick=()=>{state.draft=freshDraft(query);if(!state.draft.classId&&state.context.classes?.[0])state.draft.classId=String(state.context.classes[0].value);state.editing=true;state.detail=null;state.gradeRows=[];hydrateGradeRows();render();});
    container.querySelector("[data-paper-cancel]")?.addEventListener("click",()=>{state.editing=false;render();});
    const form=container.querySelector("[data-paper-form]");
    form?.querySelector('[name="classId"]')?.addEventListener("change",async(event)=>{syncDraft();state.draft.classId=event.target.value;state.draft.questions=[];state.gradeRows=[];await loadContext(state.draft.classId);hydrateGradeRows();render();});
    form?.querySelector('[name="mode"]')?.addEventListener("change",event=>{syncDraft();state.draft.mode=event.target.value;render();});
    form?.querySelector('[name="threshold"]')?.addEventListener("input",event=>{state.draft.threshold=Math.max(0,Math.min(100,Number(event.target.value)||0));updateGradebookPreview();});
    container.querySelector("[data-paper-add-item]")?.addEventListener("click",()=>{syncDraft();const id=container.querySelector("[data-paper-new-skill]")?.value;const skill=rows(state.context.skills).find(x=>String(x.value)===String(id));if(!skill){toast("اختاري مهارة أولًا.","error");return;}state.draft.questions.push({clientKey:`new-${Date.now()}-${state.draft.questions.length}`,skillId:String(id),skillName:skill.label,number:String(state.draft.questions.length+1),text:"",maxPoints:1});render();});
    container.querySelectorAll("[data-paper-remove-question]").forEach(button=>button.onclick=()=>{syncDraft();const removed=state.draft.questions.splice(Number(button.dataset.paperRemoveQuestion),1)[0];state.gradeRows.forEach(row=>delete row.answers[qKey(removed,0)]);render();});
    form?.addEventListener("submit",async(event)=>{
      event.preventDefault();
      syncDraft();
      if(!state.draft.questions.length){toast("أضيفي سؤالًا واحدًا على الأقل.","error");return;}
      if(!form.reportValidity())return;
      const teacherMode=state.draft.mode==="teacher_aggregate";
      if(teacherMode&&!validateGradeInputs(".paper-assessment__grade-input",true))return;
      const draftQuestions=[...state.draft.questions];
      const gradeSnapshot=teacherMode?state.gradeRows.map(row=>({
        studentId:row.studentId,
        values:draftQuestions.map((question,index)=>row.answers?.[qKey(question,index)]??""),
      })):[];
      const confirmation=teacherMode
        ?"اعتماد النتائج مباشرة وإدخالها في التحليل الرسمي؟ بعد الاعتماد ستُقفل الدرجات."
        :"حفظ الاختبار ونشره للطالبات مباشرة؟";
      if(!confirm(confirmation))return;
      const payload={...state.draft,questions:draftQuestions.map(({skillId,number,text,maxPoints})=>({skillId,number,text,maxPoints}))};
      delete payload.sourceFiles;
      const submitButton=form.querySelector("[data-paper-save]");
      if(submitButton)submitButton.disabled=true;
      try{
        const result=await api("/attachments/paper",{method:"POST",body:JSON.stringify(payload)});
        const source=form.querySelector('[name="sourceFile"]')?.files?.[0];
        if(source&&state.context.sourceFileReady){const filePayload=new FormData();filePayload.append("files[]",source);await api(`/attachments/paper/${result.id}/source-files`,{method:"POST",body:filePayload});}
        if(teacherMode){
          const saved=await api(`/attachments/paper/${result.id}`);
          const savedQuestions=rows(saved.questions);
          if(savedQuestions.length!==draftQuestions.length)throw new Error("تعذّر مطابقة الأسئلة المحفوظة مع جدول الدرجات.");
          const approvalRows=gradeSnapshot.map(row=>({studentId:row.studentId,answers:Object.fromEntries(savedQuestions.map((question,index)=>[String(question.id),row.values[index]]))}));
          await api(`/attachments/paper/${result.id}/approve-grades`,{method:"POST",body:JSON.stringify({rows:approvalRows})});
          toast("تم حفظ الاختبار واعتماد النتائج مباشرة.");
        }else{
          await api(`/attachments/paper/${result.id}/publish`,{method:"POST",body:"{}"});
          toast("تم حفظ الاختبار ونشره للطالبات مباشرة.");
        }
        state.editing=false;
        await loadList();
        await openAssessment(result.id);
      }catch(error){
        if(submitButton)submitButton.disabled=false;
        toast(error.message||"تعذّر تنفيذ الإجراء المباشر.","error");
      }
    });
    container.querySelectorAll("[data-paper-delete-source]").forEach(button=>button.onclick=async()=>{if(!confirm("حذف ملف ورقة الاختبار؟"))return;try{await api(`/attachments/paper/${state.draft.id}/source-files/${button.dataset.paperDeleteSource}/delete`,{method:"POST",body:"{}"});toast("تم حذف ملف الورقة.");await editAssessment(state.draft.id);}catch(error){toast(error.message,"error");}});
    container.querySelectorAll("[data-paper-open]").forEach(button=>button.onclick=()=>openAssessment(button.dataset.paperOpen).catch(error=>toast(error.message,"error")));
    container.querySelectorAll("[data-paper-edit]").forEach(button=>button.onclick=()=>editAssessment(button.dataset.paperEdit).catch(error=>toast(error.message,"error")));
    container.querySelectorAll("[data-paper-delete]").forEach(button=>button.onclick=async()=>{const title=button.dataset.paperTitle||"الاختبار الورقي";if(!confirm(`حذف «${title}» من السجل؟ ستختفي بيانات الاختبار ونتائجه من حسابات المعلمة والطالبات.`))return;try{await api(`/attachments/paper/${button.dataset.paperDelete}/delete`,{method:"POST",body:"{}"});toast("تم حذف الاختبار الورقي من السجل.");state.detail=null;state.submissionDetail=null;await loadList();render();}catch(error){toast(error.message,"error");}});
    container.querySelector("[data-paper-close-detail]")?.addEventListener("click",()=>{state.detail=null;state.submissionDetail=null;render();});
    container.querySelectorAll("[data-paper-action]").forEach(button=>button.onclick=async()=>{const action=button.dataset.paperAction;if(!confirm(action==="publish"?"نشر الاختبار لطالبات الفصل؟":action==="close"?"تأكيد إغلاق التسجيل؟":"إعادة فتح التسجيل؟"))return;try{await api(`/attachments/paper/${state.detail.assessment.id}/${action}`,{method:"POST",body:"{}"});toast("تم تحديث حالة الاختبار.");await loadList();await openAssessment(state.detail.assessment.id);}catch(error){toast(error.message,"error");}});
    container.querySelector("[data-paper-save-grades]")?.addEventListener("click",async()=>{if(!validateGradeInputs())return;try{await api(`/attachments/paper/${state.detail.assessment.id}/grades`,{method:"POST",body:JSON.stringify(gradePayload())});toast("تم حفظ الدرجات كمسودة.");await openAssessment(state.detail.assessment.id);}catch(error){toast(error.message,"error");}});
    container.querySelector("[data-paper-approve-grades]")?.addEventListener("click",async()=>{if(!validateGradeInputs(".paper-assessment__grade-input",true))return;if(!confirm("اعتماد النتائج وإدخالها في التحليل الرسمي؟ لن يمكن تعديلها بعد الاعتماد."))return;try{await api(`/attachments/paper/${state.detail.assessment.id}/approve-grades`,{method:"POST",body:JSON.stringify(gradePayload())});toast("تم اعتماد النتائج.");await loadList();await openAssessment(state.detail.assessment.id);}catch(error){toast(error.message,"error");}});
    container.querySelectorAll("[data-paper-detail-mode]").forEach(button=>button.onclick=()=>{state.detailMode=button.dataset.paperDetailMode;render();});
    container.querySelectorAll("[data-paper-view-submission]").forEach(button=>button.onclick=async()=>{try{state.submissionDetail=await api(`/attachments/paper/${state.detail.assessment.id}/submissions/${button.dataset.paperViewSubmission}`);render();}catch(error){toast(error.message,"error");}});
    container.querySelector("[data-paper-close-submission]")?.addEventListener("click",()=>{state.submissionDetail=null;render();});
    container.querySelector("[data-paper-save-review]")?.addEventListener("click",()=>saveSubmissionReview(false));
    container.querySelector("[data-paper-approve-review]")?.addEventListener("click",()=>saveSubmissionReview(true));
    container.querySelectorAll("[data-paper-approve]").forEach(button=>button.onclick=()=>review(button.dataset.paperApprove,"approve"));
    container.querySelectorAll("[data-paper-return]").forEach(button=>button.onclick=()=>review(button.dataset.paperReturn,"return"));
    container.querySelector("[data-paper-select-all]")?.addEventListener("change",event=>container.querySelectorAll("[data-paper-submission-select]").forEach(input=>{input.checked=event.target.checked;}));
    container.querySelector("[data-paper-bulk-approve]")?.addEventListener("click",async()=>{const ids=[...container.querySelectorAll("[data-paper-submission-select]:checked")].map(x=>Number(x.dataset.paperSubmissionSelect)).filter(Number.isFinite);if(!ids.length){toast("حددي نتائج بانتظار الاعتماد.","error");return;}if(!confirm("اعتماد النتائج المحددة وإدخالها في التحليل الرسمي؟"))return;try{await api(`/attachments/paper/${state.detail.assessment.id}/approve-bulk`,{method:"POST",body:JSON.stringify({ids})});toast("تم اعتماد النتائج المحددة.");await loadList();await openAssessment(state.detail.assessment.id);}catch(error){toast(error.message,"error");}});
  }

  async function saveSubmissionReview(approve) {
    if(!validateGradeInputs("[data-review-answer]",true))return;const submissionId=state.submissionDetail.submission.id;const answers={};container.querySelectorAll("[data-review-answer]").forEach(input=>{answers[input.dataset.reviewAnswer]=input.value;});
    if(approve&&!confirm("حفظ التعديلات ثم اعتماد نتيجة الطالبة وإدخالها في التحليل الرسمي؟"))return;
    try{await api(`/attachments/paper/${state.detail.assessment.id}/submissions/${submissionId}/grades`,{method:"POST",body:JSON.stringify({answers})});if(approve){await review(submissionId,"approve",false);return;}toast("تم حفظ تعديلات الدرجات دون اعتمادها.");state.submissionDetail=await api(`/attachments/paper/${state.detail.assessment.id}/submissions/${submissionId}`);render();}catch(error){toast(error.message,"error");}
  }
  async function review(submissionId,action,ask=true){const note=action==="return"?prompt("ملاحظة للطالبة عند إعادة النتيجة:","يرجى مراجعة الدرجات وإعادة التسليم."):"";if(action==="return"&&note===null)return;if(ask&&action==="approve"&&!confirm("اعتماد نتيجة الطالبة وإدخالها في التحليل الرسمي؟"))return;try{await api(`/attachments/paper/${state.detail.assessment.id}/submissions/${submissionId}/${action}`,{method:"POST",body:JSON.stringify({note})});toast(action==="approve"?"تم اعتماد النتيجة.":"أعيدت النتيجة للطالبة.");await loadList();await openAssessment(state.detail.assessment.id);}catch(error){toast(error.message,"error");}}

  container.innerHTML='<div class="skill-files__loading">جارٍ تحميل الاختبارات الورقية…</div>';
  try{await loadContext();if(state.context.migrationReady)await loadList();hydrateGradeRows();render();}catch(error){container.innerHTML=`<section class="skill-files__empty"><h3>تعذّر تحميل الاختبارات الورقية</h3><p>${escapeHtml(error.message||"حدث خطأ غير متوقع.")}</p></section>`;}
}
