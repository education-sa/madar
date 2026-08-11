import { renderTeacherPaperAssessments } from "./paper-assessments.js?v=2";

let activeRequest = null;

const ANALYSIS_FILTERS = [
  ["academicYear", "العام الدراسي", "academicYears"],
  ["semester", "الفصل الدراسي", "periods"],
  ["subject", "المادة", "subjects"],
  ["unit", "الوحدة", "units"],
  ["lesson", "الدرس", "lessons"],
  ["testId", "الاختبار", "tests"],
  ["testType", "نوع الاختبار", "testTypes"],
  ["studentId", "الطالبة", "students"],
  ["skillId", "المهارة", "skills"],
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function arabicNumber(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("ar-SA", { maximumFractionDigits: digits }).format(number) : "—";
}

function percent(value) {
  return `${arabicNumber(value)}٪`;
}

function fileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 1) return "٠ بايت";
  if (size < 1024) return `${arabicNumber(size, 0)} بايت`;
  if (size < 1048576) return `${arabicNumber(size / 1024)} ك.ب`;
  return `${arabicNumber(size / 1048576)} م.ب`;
}

function selectControl({ key, label, options, value, escapeHtml, target = "analysis", allowAll = true, required = false, emptyLabel = "" }) {
  const rows = list(options);
  return `<label class="skill-files__field"><span>${escapeHtml(label)}${required ? " <b aria-hidden=\"true\">*</b>" : ""}</span>
    <select data-${target}-filter="${escapeHtml(key)}" ${required ? "required" : ""}>
      <option value="">${escapeHtml(emptyLabel || (allowAll ? "الجميع" : "اختاري"))}</option>
      ${rows.map((option) => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
    </select>
  </label>`;
}

function emptyState(title, message, escapeHtml) {
  return `<section class="skill-files__empty" role="status"><span aria-hidden="true">◇</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></section>`;
}

function statusBadge(status) {
  if (status === "not_tested") return '<span class="skill-files__status is-not-tested">لم تختبر</span>';
  const mastered = status === "mastered" || status === true;
  return `<span class="skill-files__status ${mastered ? "is-mastered" : "is-developing"}">${mastered ? "متقنة" : "غير متقنة"}</span>`;
}

function analysisTable(data, mode, helpers) {
  const { escapeHtml } = helpers;
  const rows = mode === "quick" ? list(data.quickRows) : list(data.detailedRows);
  const headers = mode === "quick"
    ? ["المهارة", "الأسئلة", "الدرجة العظمى", "المشاركات", "المتقنات", "غير المتقنات", "متوسط الأداء", "نسبة الإتقان", "الحالة"]
    : ["الطالبة", "الفصل", "المهارة", "الدرجة", "النسبة", "عدد الإجابات", "الحالة"];
  const body = rows.map((row) => mode === "quick"
    ? `<tr><td><strong>${escapeHtml(row.skillName || "—")}</strong></td><td>${arabicNumber(row.questionCount, 0)}</td><td>${arabicNumber(row.maximum)}</td><td>${arabicNumber(row.participants, 0)}</td><td>${arabicNumber(row.masteredStudents, 0)}</td><td>${arabicNumber(row.notMasteredStudents, 0)}</td><td>${percent(row.averagePerformance)}</td><td>${percent(row.masteryPercent)}</td><td>${statusBadge(row.status)}</td></tr>`
    : `<tr><td><strong>${escapeHtml(row.studentName || "—")}</strong></td><td>${escapeHtml(row.className || "—")}</td><td>${escapeHtml(row.skillName || "—")}</td><td>${row.status === "not_tested" ? "—" : `${arabicNumber(row.earned)} / ${arabicNumber(row.possible)}`}</td><td>${row.status === "not_tested" ? "—" : percent(row.percent)}</td><td>${arabicNumber(row.responses, 0)}</td><td>${statusBadge(row.status)}</td></tr>`).join("");
  return `<section class="card skill-files__table-card"><div class="skill-files__section-title"><div><span>${mode === "quick" ? "ملخص المهارات" : "التفاصيل"}</span><h3>${mode === "quick" ? "الإتقان حسب المهارة" : "نتيجة كل طالبة في كل مهارة"}</h3></div><small>${arabicNumber(rows.length, 0)} صف</small></div>
    <div class="skill-files__table-scroll"><table><thead><tr>${headers.map((header) => `<th scope="col">${header}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function analysisChart(data, escapeHtml) {
  const rows = list(data.chart);
  if (!rows.length) return "";
  return `<section class="card skill-files__chart" aria-labelledby="skill-chart-title"><div class="skill-files__section-title"><div><span>مخطط الإتقان</span><h3 id="skill-chart-title">نسبة الإتقان حسب المهارة</h3></div><small>العتبة: ${arabicNumber(data.threshold, 0)}٪</small></div>
    <div class="skill-files__chart-list" role="list">${rows.map((row) => { const description = `${row.label}: ${percent(row.value)}، المشاركات ${arabicNumber(row.participants, 0)}، المتقنات ${arabicNumber(row.masteredStudents, 0)}`; return `<article role="listitem" class="skill-files__chart-row" title="${escapeHtml(description)}"><div><strong>${escapeHtml(row.label || "—")}</strong><span>${percent(row.value)}</span></div><div class="skill-files__track" role="img" aria-label="${escapeHtml(description)}" style="--skill-threshold:${Math.max(0, Math.min(100, Number(data.threshold) || 0))}%"><i class="${row.mastered ? "is-mastered" : ""}" style="--skill-bar:${Math.max(0, Math.min(100, Number(row.value) || 0))}%"></i></div></article>`; }).join("")}</div>
  </section>`;
}

function renderAnalysisContent(container, state, data, helpers) {
  const { escapeHtml } = helpers;
  const filters = data?.filters || {};
  const ready = data?.status === "ready";
  const summary = data?.summary || {};
  container.innerHTML = `<section class="card skill-files__hero">
      <div><span>قراءة مباشرة من نتائج الاختبارات</span><h2>تحليل المهارات</h2><p>تُحتسب آخر محاولة مكتملة لكل طالبة واختبار، وتُعرض فقط الأسئلة المرتبطة بمهارات فعلية.</p></div>
      <button type="button" class="btn btn-primary" data-skill-print ${ready ? "" : "disabled"}>تصدير التقرير PDF</button>
    </section>
    <section class="card skill-files__filters" aria-label="فلاتر تحليل المهارات">
      <div class="skill-files__section-title"><div><span>نطاق التحليل</span><h3>تصفية النتائج الحقيقية</h3></div><button type="button" class="btn btn-light" data-analysis-reset>إعادة ضبط</button></div>
      <div class="skill-files__filter-grid">${ANALYSIS_FILTERS.map(([key, label, source]) => selectControl({ key, label, options: filters[source], value: state.analysisFilters[key], escapeHtml })).join("")}
        <label class="skill-files__field"><span>من تاريخ</span><input type="date" value="${escapeHtml(state.analysisFilters.dateFrom)}" data-analysis-filter="dateFrom"></label>
        <label class="skill-files__field"><span>إلى تاريخ</span><input type="date" value="${escapeHtml(state.analysisFilters.dateTo)}" data-analysis-filter="dateTo"></label>
        <label class="skill-files__field skill-files__threshold"><span>عتبة الإتقان</span><div><input type="range" min="0" max="100" step="1" value="${state.threshold}" data-threshold-range aria-label="عتبة الإتقان"><input type="number" min="0" max="100" step="1" value="${state.threshold}" data-threshold-number aria-label="عتبة الإتقان بالنسبة المئوية"><b>٪</b></div></label>
      </div>
    </section>
    <div class="skill-files__mode" role="group" aria-label="طريقة عرض التحليل"><button type="button" data-analysis-mode="quick" class="${state.analysisMode === "quick" ? "is-active" : ""}" aria-pressed="${state.analysisMode === "quick"}">ملخص المهارات</button><button type="button" data-analysis-mode="detailed" class="${state.analysisMode === "detailed" ? "is-active" : ""}" aria-pressed="${state.analysisMode === "detailed"}">تفاصيل الطالبات</button></div>
    ${ready ? `<section class="skill-files__metrics" aria-label="ملخص التحليل"><article><span>إجمالي طالبات النطاق</span><strong>${arabicNumber(summary.totalStudents, 0)}</strong></article><article><span>المشاركات</span><strong>${arabicNumber(summary.participants, 0)}</strong></article><article><span>المتقنات</span><strong>${arabicNumber(summary.masteredStudents, 0)}</strong></article><article><span>غير المتقنات</span><strong>${arabicNumber(summary.notMasteredStudents, 0)}</strong></article><article><span>لم تختبر</span><strong>${arabicNumber(summary.notTestedStudents, 0)}</strong></article><article><span>الأداء العام</span><strong>${percent(summary.overallPercent)}</strong></article></section>${Number(summary.unweightedResponses) > 0 ? `<p class="skill-files__calculation-note">استُخدم عدد الإجابات الصحيحة في ${arabicNumber(summary.unweightedResponses, 0)} إجابة لأن أسئلتها بلا وزن موجب.</p>` : ""}${state.analysisMode === "quick" ? analysisChart(data, escapeHtml) : ""}${analysisTable(data, state.analysisMode, helpers)}` : emptyState("لا توجد نتائج متاحة", data?.message || "لا توجد نتائج مرتبطة بمهارات ضمن الاختيار الحالي.", escapeHtml)}`;
}

function renderMigration(container, context, escapeHtml) {
  container.innerHTML = `<section class="card skill-files__migration" role="alert"><span aria-hidden="true">!</span><div><h2>المرفقات جاهزة برمجيًا وتحتاج تفعيل الجدول</h2><p>${escapeHtml(`شغّلي الملف ${context.migrationFile} مرة واحدة يدويًا، ثم أعيدي فتح الصفحة.`)}</p><code>${escapeHtml(context.migrationFile)}</code></div></section>`;
}

function attachmentFiltersHtml(state, context, escapeHtml) {
  const controls = [
    selectControl({ key: "academicYear", label: "العام الدراسي", options: context.academicYears, value: state.fileFilters.academicYear, escapeHtml, target: "file" }),
    selectControl({ key: "semester", label: "الفصل الدراسي", options: context.periods, value: state.fileFilters.semester, escapeHtml, target: "file" }),
    selectControl({ key: "subject", label: "المادة", options: context.subjects, value: state.fileFilters.subject, escapeHtml, target: "file" }),
    selectControl({ key: "unit", label: "الوحدة", options: context.units, value: state.fileFilters.unit, escapeHtml, target: "file" }),
    selectControl({ key: "lesson", label: "الدرس", options: context.lessons, value: state.fileFilters.lesson, escapeHtml, target: "file" }),
    selectControl({ key: "testId", label: "الاختبار", options: context.tests, value: state.fileFilters.testId, escapeHtml, target: "file" }),
    selectControl({ key: "testType", label: "نوع الاختبار", options: context.testTypes, value: state.fileFilters.testType, escapeHtml, target: "file" }),
    selectControl({ key: "studentId", label: "الطالبة", options: context.students, value: state.fileFilters.studentId, escapeHtml, target: "file" }),
    selectControl({ key: "skillId", label: "المهارة", options: context.skills, value: state.fileFilters.skillId, escapeHtml, target: "file" }),
  ];
  return `${controls.join("")}<label class="skill-files__field"><span>نوع الملف</span><select data-file-filter="fileType"><option value="">الجميع</option><option value="image" ${state.fileFilters.fileType === "image" ? "selected" : ""}>صور</option><option value="pdf" ${state.fileFilters.fileType === "pdf" ? "selected" : ""}>PDF</option></select></label><label class="skill-files__field"><span>من تاريخ</span><input type="date" value="${escapeHtml(state.fileFilters.dateFrom)}" data-file-filter="dateFrom"></label><label class="skill-files__field"><span>إلى تاريخ</span><input type="date" value="${escapeHtml(state.fileFilters.dateTo)}" data-file-filter="dateTo"></label><label class="skill-files__field"><span>بحث بالاسم أو الملاحظة</span><input type="search" value="${escapeHtml(state.fileFilters.search)}" data-file-search placeholder="اكتبي كلمة البحث"></label>`;
}

function uploadFormHtml(state, context, academic, escapeHtml) {
  const selectedClassId = state.uploadClassId || academic.get("classId") || "";
  const selectedClass = list(context.classes).find((item) => String(item.value) === String(selectedClassId));
  const studentOptions = list(context.students).filter((item) => !selectedClassId || String(item.classId) === String(selectedClassId));
  const testOptions = list(context.tests).filter((item) => !selectedClassId || item.classId === null || String(item.classId) === String(selectedClassId));
  return `<section class="card skill-files__upload"><div class="skill-files__section-title"><div><span>رفع آمن</span><h3>إضافة مرفقات</h3></div><small>PDF أو صور · ١٠ م.ب للملف</small></div>
    <form data-upload-form novalidate><div class="skill-files__upload-grid">
      ${selectControl({ key: "classId", label: "الفصل", options: context.classes, value: selectedClassId, escapeHtml, target: "upload", allowAll: false, required: true })}
      ${selectControl({ key: "studentId", label: "الطالبة (اختياري)", options: studentOptions, value: state.uploadStudentId, escapeHtml, target: "upload", emptyLabel: "مرفق عام للفصل" })}
      ${selectControl({ key: "testId", label: "الاختبار (اختياري)", options: testOptions, value: state.uploadTestId, escapeHtml, target: "upload", emptyLabel: "دون اختبار محدد" })}
      ${selectControl({ key: "skillId", label: "المهارة (اختياري)", options: context.skills, value: state.uploadSkillId, escapeHtml, target: "upload", emptyLabel: "دون مهارة محددة" })}
      ${selectControl({ key: "subjectName", label: "المادة (اختياري)", options: context.subjects, value: state.uploadSubject, escapeHtml, target: "upload", emptyLabel: "دون تحديد" })}
      ${selectControl({ key: "unitName", label: "الوحدة (اختياري)", options: context.units, value: state.uploadUnit, escapeHtml, target: "upload", emptyLabel: "دون تحديد" })}
      ${selectControl({ key: "lessonName", label: "الدرس (اختياري)", options: context.lessons, value: state.uploadLesson, escapeHtml, target: "upload", emptyLabel: "دون تحديد" })}
      <label class="skill-files__field skill-files__note"><span>ملاحظة (اختياري)</span><textarea name="note" maxlength="1000" rows="3" placeholder="وصف مختصر للمرفقات"></textarea></label>
      <label class="skill-files__drop"><input type="file" name="files[]" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" multiple required><span aria-hidden="true">＋</span><strong>اختاري الملفات</strong><small>حتى ١٠ ملفات وبإجمالي ٤٠ م.ب</small></label>
    </div><input type="hidden" name="academicYear" value="${escapeHtml(state.fileFilters.academicYear || academic.get("academicYear") || "")}"><input type="hidden" name="semester" value="${escapeHtml(state.fileFilters.semester || academic.get("semester") || "")}"><button class="btn btn-primary" type="submit" data-upload-submit>رفع المرفقات</button>${selectedClass ? `<p class="skill-files__scope-note">سيُحفظ السياق تحت ${escapeHtml(selectedClass.label)} · ${escapeHtml((state.fileFilters.semester || academic.get("semester")) === "second" ? "الفصل الدراسي الثاني" : "الفصل الدراسي الأول")}</p>` : ""}</form>
  </section>`;
}

function attachmentCard(file, state, helpers) {
  const { escapeHtml, formatDate } = helpers;
  const checked = state.selectedFiles.has(Number(file.id));
  const isImage = String(file.mimeType || "").startsWith("image/");
  const previewUrl = `/api/teacher/attachments/${file.id}/file`;
  const context = [file.className, file.studentName, file.testTitle, file.skillName].filter(Boolean).join(" · ");
  return `<article class="skill-files__file ${checked ? "is-selected" : ""}"><label class="skill-files__check"><input type="checkbox" data-file-select="${file.id}" ${checked ? "checked" : ""}><span class="sr-only">تحديد ${escapeHtml(file.originalName)}</span></label>
    <a class="skill-files__preview ${isImage ? "is-image" : "is-pdf"}" href="${previewUrl}" target="_blank" rel="noopener" aria-label="معاينة ${escapeHtml(file.originalName)}">${isImage ? `<img src="${previewUrl}" alt="معاينة ${escapeHtml(file.originalName)}" loading="lazy">` : "<strong>PDF</strong>"}</a>
    <div class="skill-files__file-body"><h3 title="${escapeHtml(file.originalName)}">${escapeHtml(file.originalName)}</h3><p>${escapeHtml(context || "مرفق عام للفصل")}</p><div class="skill-files__file-meta"><span>${fileSize(file.sizeBytes)}</span><span>${escapeHtml(formatDate(file.createdAt))}</span></div>${file.note ? `<blockquote>${escapeHtml(file.note)}</blockquote>` : ""}${[file.subjectName, file.unitName, file.lessonName].some(Boolean) ? `<div class="skill-files__tags">${[file.subjectName, file.unitName, file.lessonName].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}</div>
    <div class="skill-files__file-actions"><a class="btn btn-light" href="${previewUrl}?download=1">تنزيل</a><button class="btn btn-danger" type="button" data-file-delete="${file.id}">حذف</button></div></article>`;
}

function renderAttachmentList(container, state, context, response, academic, helpers, uploadContext = context) {
  const { escapeHtml } = helpers;
  const files = list(response.files);
  container.innerHTML = `${uploadFormHtml(state, uploadContext, academic, escapeHtml)}
    <section class="card skill-files__filters"><div class="skill-files__section-title"><div><span>الأرشيف</span><h3>البحث في المرفقات</h3></div><button type="button" class="btn btn-light" data-file-reset>إعادة ضبط</button></div><div class="skill-files__filter-grid">${attachmentFiltersHtml(state, context, escapeHtml)}</div></section>
    <section class="card skill-files__file-toolbar" aria-label="إجراءات المرفقات"><div><label><input type="checkbox" data-select-all ${files.length && files.every((file) => state.selectedFiles.has(Number(file.id))) ? "checked" : ""}> تحديد الظاهر</label><strong>${arabicNumber(files.length, 0)} مرفق</strong><span data-selected-count>${arabicNumber(state.selectedFiles.size, 0)} محدد</span></div><div><button type="button" class="btn btn-light" data-export-zip ${files.length ? "" : "disabled"}>تنزيل ZIP</button><button type="button" class="btn btn-light" data-export-pdf ${files.length ? "" : "disabled"}>الصور إلى PDF</button><button type="button" class="btn btn-danger" data-delete-selected ${state.selectedFiles.size ? "" : "disabled"}>حذف المحدد</button></div></section>
    ${files.length ? `<section class="skill-files__file-list" aria-label="قائمة المرفقات">${files.map((file) => attachmentCard(file, state, helpers)).join("")}</section>` : emptyState("لا توجد مرفقات", "لا توجد مرفقات مطابقة للفلاتر الحالية. يمكنك رفع الملفات من النموذج أعلاه.", escapeHtml)}`;
}

function manualScoreKey(studentId, skillId) {
  return `${studentId}:${skillId}`;
}

function manualAnalysis(draft, context) {
  const students = list(context.students);
  const totalStudents = students.length;
  const rows = draft.items.map((item) => {
    const questions = Math.max(1, Number(item.questionCount) || 1);
    if (draft.mode === "quick") {
      const mastered = Math.max(0, Math.min(totalStudents, Number(item.masteredCount) || 0));
      const masteryPercent = totalStudents ? (mastered / totalStudents) * 100 : 0;
      return { ...item, participants: totalStudents, mastered, masteryPercent, averagePerformance: masteryPercent };
    }
    let totalCorrect = 0; let mastered = 0;
    students.forEach((student) => {
      const correct = Math.max(0, Math.min(questions, Number(draft.scores[manualScoreKey(student.value, item.skillId)]) || 0));
      totalCorrect += correct;
      if ((correct / questions) * 100 >= draft.threshold) mastered += 1;
    });
    return {
      ...item,
      participants: totalStudents,
      mastered,
      masteryPercent: totalStudents ? (mastered / totalStudents) * 100 : 0,
      averagePerformance: totalStudents ? (totalCorrect / (totalStudents * questions)) * 100 : 0,
    };
  });
  const overall = rows.length ? rows.reduce((sum, row) => sum + row.masteryPercent, 0) / rows.length : 0;
  return { rows, totalStudents, overall };
}

function manualMigrationNotice(context, escapeHtml) {
  if (context.manualReady) return "";
  return `<section class="card skill-files__migration skill-files__migration--compact" role="status"><span aria-hidden="true">!</span><div><h2>يمكنك معاينة التقويم الآن</h2><p>الحفظ سيُفعّل بعد تشغيل ملف قاعدة البيانات مرة واحدة، بعد اعتماد الواجهة.</p><code>${escapeHtml(context.migrationFile || "migration_20260809_teacher_analysis_attachments.sql")}</code></div></section>`;
}

function manualSavedAssessments(assessments, escapeHtml) {
  return `<section class="card skill-files__manual-saved"><div class="skill-files__section-title"><div><span>السجل المحفوظ</span><h3>التقويمات اليدوية السابقة</h3></div><small>${arabicNumber(assessments.length, 0)} تقويم</small></div>
    ${assessments.length ? `<div class="skill-files__saved-list">${assessments.map((assessment) => `<article><div><strong>${escapeHtml(assessment.title || "تقويم مهارات")}</strong><p>${escapeHtml(assessment.className || "—")} · ${escapeHtml(assessment.assessmentDate || "")} · ${assessment.mode === "detailed" ? "مفصل" : "سريع"}</p><small>${arabicNumber(assessment.skillCount, 0)} مهارة · العتبة ${arabicNumber(assessment.threshold, 0)}٪</small></div><div><button type="button" class="btn btn-light" data-manual-open="${assessment.id}">فتح</button><button type="button" class="btn btn-danger" data-manual-delete="${assessment.id}">حذف</button></div></article>`).join("")}</div>` : emptyState("لا توجد تقويمات محفوظة", "أنشئي أول تقويم يدوي من النموذج أعلاه.", escapeHtml)}
  </section>`;
}

function renderManualContent(container, state, context, assessments, helpers) {
  const { escapeHtml } = helpers;
  const draft = state.manual;
  const analysis = manualAnalysis(draft, context);
  const selectedSkillIds = new Set(draft.items.map((item) => String(item.skillId)));
  const availableSkills = list(context.skills).filter((skill) => !selectedSkillIds.has(String(skill.value)));
  const canSave = context.manualReady && draft.classId && draft.items.length && analysis.totalStudents;
  const skillSetup = draft.items.length ? `<div class="skill-files__manual-skills">${draft.items.map((item) => `<article><div><strong>${escapeHtml(item.skillName)}</strong><small>عدد الأسئلة في هذه المهارة</small></div><input type="number" min="1" max="1000" value="${Number(item.questionCount) || 1}" data-manual-questions="${item.skillId}" aria-label="عدد أسئلة ${escapeHtml(item.skillName)}"><button type="button" class="btn btn-danger" data-manual-remove-skill="${item.skillId}">إزالة</button></article>`).join("")}</div>` : emptyState("لم تُضف مهارات بعد", "اختاري مهارة وحددي عدد أسئلتها ثم اضغطي إضافة.", escapeHtml);
  const inputTable = !draft.items.length ? "" : draft.mode === "quick"
    ? `<div class="skill-files__table-scroll"><table><thead><tr><th>المهارة</th><th>عدد طالبات الفصل</th><th>عدد المتقنات</th></tr></thead><tbody>${draft.items.map((item) => `<tr><td><strong>${escapeHtml(item.skillName)}</strong></td><td>${arabicNumber(analysis.totalStudents, 0)}</td><td><input class="skill-files__score-input" type="number" min="0" max="${analysis.totalStudents}" value="${Number(item.masteredCount) || 0}" data-manual-mastered="${item.skillId}" aria-label="عدد المتقنات في ${escapeHtml(item.skillName)}"></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="skill-files__table-scroll"><table class="skill-files__manual-grid"><thead><tr><th>الطالبة</th>${draft.items.map((item) => `<th>${escapeHtml(item.skillName)}<small>من ${arabicNumber(item.questionCount, 0)}</small></th>`).join("")}</tr></thead><tbody>${list(context.students).map((student) => `<tr><td><strong>${escapeHtml(student.label)}</strong></td>${draft.items.map((item) => `<td><input class="skill-files__score-input" type="number" min="0" max="${Number(item.questionCount) || 1}" value="${Number(draft.scores[manualScoreKey(student.value, item.skillId)]) || 0}" data-manual-score="${student.value}:${item.skillId}" aria-label="درجة ${escapeHtml(student.label)} في ${escapeHtml(item.skillName)}"></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const analysisHtml = analysis.rows.length ? `<section class="card skill-files__manual-analysis"><div class="skill-files__section-title"><div><span>مخطط الإتقان</span><h3>نسبة الإتقان حسب المهارة</h3></div><small>العتبة: ${arabicNumber(draft.threshold, 0)}٪</small></div><div class="skill-files__manual-metrics"><article><span>الطالبات</span><strong>${arabicNumber(analysis.totalStudents, 0)}</strong></article><article><span>المهارات</span><strong>${arabicNumber(analysis.rows.length, 0)}</strong></article><article><span>متوسط الإتقان</span><strong>${percent(analysis.overall)}</strong></article></div><div class="skill-files__chart-list" role="list">${analysis.rows.map((row) => { const description = `${row.skillName}: ${percent(row.masteryPercent)}`; return `<article role="listitem" class="skill-files__chart-row" title="${escapeHtml(description)}"><div><strong>${escapeHtml(row.skillName)}</strong><span>${percent(row.masteryPercent)}</span></div><div class="skill-files__track" role="img" aria-label="${escapeHtml(description)}" style="--skill-threshold:${Math.max(0, Math.min(100, Number(draft.threshold) || 0))}%"><i class="${row.masteryPercent >= draft.threshold ? "is-mastered" : ""}" style="--skill-bar:${Math.max(0, Math.min(100, row.masteryPercent))}%"></i></div></article>`; }).join("")}</div><div class="skill-files__table-scroll"><table><thead><tr><th>المهارة</th><th>المتقنات</th><th>نسبة الإتقان</th><th>متوسط الأداء</th></tr></thead><tbody>${analysis.rows.map((row) => `<tr><td><strong>${escapeHtml(row.skillName)}</strong></td><td>${arabicNumber(row.mastered, 0)} من ${arabicNumber(row.participants, 0)}</td><td>${percent(row.masteryPercent)}</td><td>${percent(row.averagePerformance)}</td></tr>`).join("")}</tbody></table></div></section>` : "";
  container.innerHTML = `${manualMigrationNotice(context, escapeHtml)}
    <section class="card skill-files__hero"><div><span>إدخال وحفظ من المعلمة</span><h2>تقويم مهارات يدوي</h2><p>اختاري الفصل والمهارات، ثم أدخلي عدد المتقنات سريعًا أو درجات كل طالبة بالتفصيل.</p></div><button type="button" class="btn btn-light" data-manual-new>تقويم جديد</button></section>
    <section class="card skill-files__manual-editor"><div class="skill-files__section-title"><div><span>${draft.id ? "تعديل التقويم" : "تقويم جديد"}</span><h3>بيانات التقويم</h3></div>${draft.id ? `<small>رقم ${arabicNumber(draft.id, 0)}</small>` : ""}</div>
      <div class="skill-files__filter-grid">
        ${selectControl({ key: "classId", label: "الفصل", options: context.classes, value: draft.classId, escapeHtml, target: "manual", allowAll: false, required: true })}
        <label class="skill-files__field"><span>عنوان التقويم</span><input type="text" maxlength="190" value="${escapeHtml(draft.title)}" data-manual-text="title" placeholder="مثال: تقويم مهارات الوحدة الثالثة"></label>
        <label class="skill-files__field"><span>تاريخ التقويم</span><input type="date" value="${escapeHtml(draft.assessmentDate)}" data-manual-text="assessmentDate"></label>
        <label class="skill-files__field"><span>عتبة الإتقان</span><div class="skill-files__threshold-inline"><input type="number" min="0" max="100" value="${draft.threshold}" data-manual-text="threshold"><b>٪</b></div></label>
        ${selectControl({ key: "subject", label: "المادة", options: context.subjects, value: draft.subject, escapeHtml, target: "manual" })}
        ${selectControl({ key: "unit", label: "الوحدة", options: context.units, value: draft.unit, escapeHtml, target: "manual" })}
        ${selectControl({ key: "lesson", label: "الدرس", options: context.lessons, value: draft.lesson, escapeHtml, target: "manual" })}
      </div>
      <div class="skill-files__manual-add"><label class="skill-files__field"><span>المهارة</span><select data-manual-new-skill><option value="">اختاري مهارة</option>${availableSkills.map((skill) => `<option value="${escapeHtml(skill.value)}">${escapeHtml(skill.label)}</option>`).join("")}</select></label><label class="skill-files__field"><span>عدد الأسئلة</span><input type="number" min="1" max="1000" value="4" data-manual-new-questions></label><button type="button" class="btn btn-primary" data-manual-add-skill>إضافة المهارة</button></div>
      ${skillSetup}
      <div class="skill-files__mode" role="group" aria-label="طريقة إدخال التقويم"><button type="button" data-manual-mode="quick" class="${draft.mode === "quick" ? "is-active" : ""}" aria-pressed="${draft.mode === "quick"}">إدخال سريع</button><button type="button" data-manual-mode="detailed" class="${draft.mode === "detailed" ? "is-active" : ""}" aria-pressed="${draft.mode === "detailed"}">إدخال مفصل</button></div>
      <p class="skill-files__mode-note">${draft.mode === "quick" ? `أدخلي عدد الطالبات المتقنات لكل مهارة من أصل ${arabicNumber(analysis.totalStudents, 0)} طالبة.` : "أدخلي عدد الإجابات الصحيحة لكل طالبة في كل مهارة."}</p>
      ${inputTable}
      <div class="skill-files__manual-actions"><button type="button" class="btn btn-primary" data-manual-save ${canSave ? "" : "disabled"}>${draft.id ? "حفظ التعديلات" : "حفظ التقويم"}</button><button type="button" class="btn btn-light" data-manual-print ${draft.items.length ? "" : "disabled"}>طباعة / حفظ PDF</button>${!context.manualReady ? "<small>الحفظ غير مفعّل قبل تشغيل ملف قاعدة البيانات.</small>" : !analysis.totalStudents ? "<small>لا توجد طالبات نشطات في الفصل المحدد.</small>" : ""}</div>
    </section>
    ${analysisHtml}
    ${context.manualReady ? manualSavedAssessments(assessments, escapeHtml) : ""}`;
}

export async function renderSkillAttachments({ root, academicSelectorHtml, bindAcademicSelector, getAcademicQuery, rerender, api, escapeHtml, formatDate, openPrint, printTable, toast }) {
  activeRequest?.abort();
  const initialAcademic = new URLSearchParams(getAcademicQuery("attachments"));
  const initialAcademicYear = initialAcademic.get("academicYear") || "";
  const initialSemester = initialAcademic.get("semester") || "";
  const initialClassId = initialAcademic.get("classId") || "";
  const today = new Date(Date.now() + (3 * 60 * 60 * 1000)).toISOString().slice(0, 10);
  const state = {
    tab: "analysis", analysisMode: "quick", threshold: 80,
    analysisFilters: { academicYear: initialAcademicYear, semester: initialSemester, subject: "", unit: "", lesson: "", testId: "", testType: "", studentId: "", skillId: "", dateFrom: "", dateTo: "" },
    fileFilters: { academicYear: initialAcademicYear, semester: initialSemester, subject: "", unit: "", lesson: "", testId: "", testType: "", studentId: "", skillId: "", fileType: "", search: "", dateFrom: "", dateTo: "" },
    selectedFiles: new Set(), uploadClassId: initialClassId, uploadStudentId: "", uploadTestId: "", uploadSkillId: "", uploadSubject: "", uploadUnit: "", uploadLesson: "",
    manual: { id: 0, classId: initialClassId, academicYear: initialAcademicYear, semester: initialSemester, title: "", assessmentDate: today, threshold: 80, mode: "quick", subject: "", unit: "", lesson: "", items: [], scores: {} },
  };
  const helpers = { escapeHtml, formatDate };
  root.innerHTML = `${academicSelectorHtml("attachments")}<section class="skill-files" aria-label="تحليل المهارات والمرفقات"><header class="skill-files__page-head"><div><span>مساحة الأدلة التعليمية</span><h1>تحليل المهارات والمرفقات</h1><p>نتائج الاختبارات الإلكترونية، والاختبارات الورقية، وأرشيف المرفقات في مساحة واحدة.</p></div></header><nav class="skill-files__tabs" role="tablist" aria-label="أقسام الصفحة"><button type="button" role="tab" class="is-active" data-main-tab="analysis" aria-selected="true">نتائج الاختبارات</button><button type="button" role="tab" data-main-tab="paper" aria-selected="false">الاختبارات الورقية</button><button type="button" role="tab" data-main-tab="files" aria-selected="false">المرفقات</button></nav><div class="skill-files__content"><div class="skill-files__loading" role="status">جارٍ تحميل البيانات…</div></div></section>`;
  bindAcademicSelector("attachments", rerender);
  const workspace = root.querySelector(".skill-files");
  const content = workspace.querySelector(".skill-files__content");

  function academicParams() {
    return new URLSearchParams(getAcademicQuery("attachments"));
  }

  function queryWith(values = {}, preserveClass = false) {
    const query = academicParams();
    Object.entries(values).forEach(([key, value]) => { if (value !== "" && value !== null && value !== undefined) query.set(key, value); else query.delete(key); });
    if (!preserveClass && Object.prototype.hasOwnProperty.call(values, "academicYear") && String(values.academicYear || "") !== initialAcademicYear) query.delete("classId");
    return query;
  }

  function normalizeFilters(filters) {
    const map = { academicYear: "academicYears", semester: "periods", subject: "subjects", unit: "units", lesson: "lessons", testId: "tests", testType: "testTypes", studentId: "students", skillId: "skills" };
    Object.entries(map).forEach(([key, source]) => {
      if (state.analysisFilters[key] && !list(filters[source]).some((item) => String(item.value) === String(state.analysisFilters[key]))) state.analysisFilters[key] = "";
    });
  }

  async function loadAnalysis() {
    content.innerHTML = '<div class="skill-files__loading" role="status">جارٍ حساب نتائج المهارات…</div>';
    activeRequest?.abort();
    const controller = new AbortController(); activeRequest = controller;
    try {
      const query = queryWith({ ...state.analysisFilters, threshold: state.threshold });
      const data = await api(`/attachments/analysis?${query}`, { signal: controller.signal });
      if (!workspace.isConnected || state.tab !== "analysis" || controller.signal.aborted) return;
      normalizeFilters(data.filters || {});
      renderAnalysisContent(content, state, data, helpers);
      bindAnalysis(data);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (!workspace.isConnected || state.tab !== "analysis") return;
      content.innerHTML = emptyState("تعذّر تحميل التحليل", error.message || "حدث خطأ غير متوقع.", escapeHtml);
    }
  }

  function printAnalysis(data) {
    if (data.status !== "ready") return;
    const quick = state.analysisMode === "quick";
    const headers = quick ? ["المهارة", "الأسئلة", "الدرجة العظمى", "المشاركات", "المتقنات", "غير المتقنات", "متوسط الأداء", "نسبة الإتقان", "الحالة"] : ["الطالبة", "الفصل", "المهارة", "الدرجة", "النسبة", "الإجابات", "الحالة"];
    const rows = (quick ? list(data.quickRows) : list(data.detailedRows)).map((row) => quick
      ? [row.skillName, arabicNumber(row.questionCount, 0), arabicNumber(row.maximum), arabicNumber(row.participants, 0), arabicNumber(row.masteredStudents, 0), arabicNumber(row.notMasteredStudents, 0), percent(row.averagePerformance), percent(row.masteryPercent), row.mastered ? "متقنة" : "غير متقنة"]
      : [row.studentName, row.className, row.skillName, row.status === "not_tested" ? "—" : `${arabicNumber(row.earned)} / ${arabicNumber(row.possible)}`, row.status === "not_tested" ? "—" : percent(row.percent), arabicNumber(row.responses, 0), row.status === "not_tested" ? "لم تختبر" : row.mastered ? "متقنة" : "غير متقنة"]);
    const query = academicParams();
    const filters = data.filters || {};
    const labelOf = (source, value) => list(filters[source]).find((item) => String(item.value) === String(value))?.label || "";
    const contextParts = [
      ["المرحلة", query.get("stage")], ["الصف", query.get("gradeLabel")], ["الفصل", labelOf("classes", query.get("classId"))],
      ["العام الدراسي", labelOf("academicYears", state.analysisFilters.academicYear)], ["الفصل الدراسي", labelOf("periods", state.analysisFilters.semester)],
      ["المادة", labelOf("subjects", state.analysisFilters.subject)], ["الوحدة", labelOf("units", state.analysisFilters.unit)],
      ["الدرس", labelOf("lessons", state.analysisFilters.lesson)], ["الاختبار", labelOf("tests", state.analysisFilters.testId)],
      ["نوع الاختبار", labelOf("testTypes", state.analysisFilters.testType)], ["الطالبة", labelOf("students", state.analysisFilters.studentId)],
      ["المهارة", labelOf("skills", state.analysisFilters.skillId)], ["من", state.analysisFilters.dateFrom], ["إلى", state.analysisFilters.dateTo],
    ].filter(([, value]) => value && value !== "all").map(([label, value]) => `${label}: ${value}`);
    const safeRows = rows.map((row) => row.map((cell) => escapeHtml(cell)));
    openPrint({ title: "تحليل المهارات", classId: query.get("classId") || "", orientation: quick ? "portrait" : "landscape", bodyHtml: `<h2 class="report-title">تحليل المهارات</h2><div class="print-note">تاريخ التقرير: ${escapeHtml(formatDate(new Date()))}<br>عتبة الإتقان: ${arabicNumber(state.threshold, 0)}٪${contextParts.length ? `<br>${escapeHtml(contextParts.join(" — "))}` : ""}</div>${printTable(headers, safeRows, "skill-analysis-print")}` });
  }

  function bindAnalysis(data) {
    content.querySelectorAll("[data-analysis-filter]").forEach((select) => select.addEventListener("change", () => {
      const key = select.dataset.analysisFilter; state.analysisFilters[key] = select.value;
      if (["academicYear", "semester", "testType", "testId"].includes(key)) { state.analysisFilters.subject = ""; state.analysisFilters.unit = ""; state.analysisFilters.lesson = ""; state.analysisFilters.skillId = ""; }
      if (key === "subject") { state.analysisFilters.unit = ""; state.analysisFilters.lesson = ""; state.analysisFilters.skillId = ""; }
      if (key === "unit") { state.analysisFilters.lesson = ""; state.analysisFilters.skillId = ""; }
      loadAnalysis();
    }));
    content.querySelectorAll("[data-analysis-mode]").forEach((button) => button.addEventListener("click", () => { state.analysisMode = button.dataset.analysisMode; renderAnalysisContent(content, state, data, helpers); bindAnalysis(data); }));
    content.querySelector("[data-analysis-reset]")?.addEventListener("click", () => { Object.keys(state.analysisFilters).forEach((key) => { state.analysisFilters[key] = ""; }); state.analysisFilters.academicYear = initialAcademicYear; state.analysisFilters.semester = initialSemester; state.threshold = 80; loadAnalysis(); });
    const range = content.querySelector("[data-threshold-range]"); const number = content.querySelector("[data-threshold-number]");
    const updateThreshold = (value) => { state.threshold = Math.max(0, Math.min(100, Number(value) || 0)); loadAnalysis(); };
    range?.addEventListener("change", () => updateThreshold(range.value)); number?.addEventListener("change", () => updateThreshold(number.value));
    content.querySelector("[data-skill-print]")?.addEventListener("click", () => printAnalysis(data));
  }

  function fileQuery() {
    return queryWith(state.fileFilters);
  }

  function uploadQuery() {
    return queryWith({
      academicYear: state.fileFilters.academicYear, semester: state.fileFilters.semester,
      classId: state.uploadClassId, studentId: "", testType: "", testId: state.uploadTestId,
      subject: state.uploadSubject, unit: state.uploadUnit, lesson: state.uploadLesson, skillId: state.uploadSkillId,
      fileType: "", search: "", dateFrom: "", dateTo: "",
    }, true);
  }

  async function loadFiles() {
    content.innerHTML = '<div class="skill-files__loading" role="status">جارٍ تحميل المرفقات…</div>';
    activeRequest?.abort();
    const controller = new AbortController(); activeRequest = controller;
    try {
      const [context, uploadContext] = await Promise.all([
        api(`/attachments/context?${fileQuery()}`, { signal: controller.signal }),
        api(`/attachments/context?${uploadQuery()}`, { signal: controller.signal }),
      ]);
      if (!workspace.isConnected || state.tab !== "files" || controller.signal.aborted) return;
      if (!context.migrationReady) { renderMigration(content, context, escapeHtml); return; }
      uploadContext.classes = context.classes;
      const response = await api(`/attachments?${fileQuery()}`, { signal: controller.signal });
      if (!workspace.isConnected || state.tab !== "files" || controller.signal.aborted) return;
      const visibleIds = new Set(list(response.files).map((file) => Number(file.id)));
      state.selectedFiles = new Set([...state.selectedFiles].filter((id) => visibleIds.has(id)));
      renderAttachmentList(content, state, context, response, academicParams(), helpers, uploadContext);
      bindFiles(context, response, uploadContext);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (!workspace.isConnected || state.tab !== "files") return;
      content.innerHTML = emptyState("تعذّر تحميل المرفقات", error.message || "حدث خطأ غير متوقع.", escapeHtml);
    }
  }

  function exportUrl(type) {
    const query = fileQuery();
    if (state.selectedFiles.size) query.set("ids", [...state.selectedFiles].join(","));
    return `/api/teacher/attachments/${type}?${query}`;
  }

  async function deleteFiles(ids) {
    if (!ids.length) return;
    const message = ids.length === 1 ? "هل تريدين حذف هذا المرفق نهائيًا؟" : `هل تريدين حذف ${ids.length} مرفقات محددة؟`;
    if (!window.confirm(message)) return;
    try {
      await api("/attachments/delete", { method: "POST", body: JSON.stringify({ ids }) });
      state.selectedFiles.clear(); toast("تم حذف المرفقات المحددة."); await loadFiles();
    } catch (error) { toast(error.message || "تعذّر حذف المرفقات.", "error"); }
  }

  function bindFiles(context, response, uploadContext = context) {
    content.querySelector("[data-upload-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget; const files = form.querySelector('input[type="file"]')?.files || [];
      const classId = form.querySelector('[data-upload-filter="classId"]')?.value || "";
      const academicYear = form.querySelector('[name="academicYear"]')?.value || "";
      const semester = form.querySelector('[name="semester"]')?.value || "";
      if (!classId) { toast("اختاري الفصل قبل الرفع.", "error"); return; }
      if (!academicYear) { toast("حددي العام الدراسي أولًا.", "error"); return; }
      if (!semester) { toast("حددي الفصل الدراسي من إعدادات العام الدراسي أولًا.", "error"); return; }
      if (!files.length) { toast("اختاري ملفًا واحدًا على الأقل.", "error"); return; }
      if (files.length > 10 || [...files].some((file) => file.size > 10485760) || [...files].reduce((sum, file) => sum + file.size, 0) > 41943040) { toast("تحققي من حدود الرفع: ١٠ ملفات، ١٠ م.ب للملف، و٤٠ م.ب إجمالًا.", "error"); return; }
      const data = new FormData(form);
      content.querySelectorAll("[data-upload-filter]").forEach((select) => data.set(select.dataset.uploadFilter, select.value));
      const submit = form.querySelector("[data-upload-submit]"); submit.disabled = true; submit.textContent = "جارٍ الرفع…";
      try { const result = await api("/attachments", { method: "POST", body: data }); toast(`تم رفع ${arabicNumber(result.uploaded, 0)} مرفق.`); await loadFiles(); }
      catch (error) { toast(error.message || "تعذّر رفع المرفقات.", "error"); submit.disabled = false; submit.textContent = "رفع المرفقات"; }
    });
    content.querySelectorAll("[data-upload-filter]").forEach((select) => select.addEventListener("change", () => {
      const key = select.dataset.uploadFilter;
      const stateMap = { classId: "uploadClassId", studentId: "uploadStudentId", testId: "uploadTestId", skillId: "uploadSkillId", subjectName: "uploadSubject", unitName: "uploadUnit", lessonName: "uploadLesson" };
      state[stateMap[key]] = select.value;
      if (key === "classId") { state.uploadStudentId = ""; state.uploadTestId = ""; state.uploadSkillId = ""; state.uploadSubject = ""; state.uploadUnit = ""; state.uploadLesson = ""; }
      if (key === "testId") { state.uploadSkillId = ""; state.uploadSubject = ""; state.uploadUnit = ""; state.uploadLesson = ""; }
      if (key === "subjectName") { state.uploadUnit = ""; state.uploadLesson = ""; state.uploadSkillId = ""; }
      if (key === "unitName") { state.uploadLesson = ""; state.uploadSkillId = ""; }
      if (key === "lessonName") state.uploadSkillId = "";
      if (["classId", "testId", "subjectName", "unitName", "lessonName"].includes(key)) loadFiles();
    }));
    content.querySelectorAll("[data-file-filter]").forEach((select) => select.addEventListener("change", () => {
      const key = select.dataset.fileFilter; state.fileFilters[key] = select.value;
      if (["academicYear", "semester", "testType", "testId"].includes(key)) { state.fileFilters.subject = ""; state.fileFilters.unit = ""; state.fileFilters.lesson = ""; state.fileFilters.skillId = ""; }
      if (key === "subject") { state.fileFilters.unit = ""; state.fileFilters.lesson = ""; state.fileFilters.skillId = ""; }
      if (key === "unit") { state.fileFilters.lesson = ""; state.fileFilters.skillId = ""; }
      loadFiles();
    }));
    const search = content.querySelector("[data-file-search]");
    search?.addEventListener("change", () => { state.fileFilters.search = search.value.trim(); loadFiles(); });
    content.querySelector("[data-file-reset]")?.addEventListener("click", () => { Object.keys(state.fileFilters).forEach((key) => { state.fileFilters[key] = ""; }); state.fileFilters.academicYear = initialAcademicYear; state.fileFilters.semester = initialSemester; state.selectedFiles.clear(); loadFiles(); });
    content.querySelectorAll("[data-file-select]").forEach((checkbox) => checkbox.addEventListener("change", () => { const id = Number(checkbox.dataset.fileSelect); if (checkbox.checked) state.selectedFiles.add(id); else state.selectedFiles.delete(id); renderAttachmentList(content, state, context, response, academicParams(), helpers, uploadContext); bindFiles(context, response, uploadContext); }));
    content.querySelector("[data-select-all]")?.addEventListener("change", (event) => { list(response.files).forEach((file) => { if (event.target.checked) state.selectedFiles.add(Number(file.id)); else state.selectedFiles.delete(Number(file.id)); }); renderAttachmentList(content, state, context, response, academicParams(), helpers, uploadContext); bindFiles(context, response, uploadContext); });
    content.querySelectorAll("[data-file-delete]").forEach((button) => button.addEventListener("click", () => deleteFiles([Number(button.dataset.fileDelete)])));
    content.querySelector("[data-delete-selected]")?.addEventListener("click", () => deleteFiles([...state.selectedFiles]));
    content.querySelector("[data-export-zip]")?.addEventListener("click", () => window.open(exportUrl("export.zip"), "_blank", "noopener"));
    content.querySelector("[data-export-pdf]")?.addEventListener("click", () => window.open(exportUrl("export.pdf"), "_blank", "noopener"));
  }

  function manualQuery() {
    return queryWith({
      classId: state.manual.classId,
      subject: state.manual.subject,
      unit: state.manual.unit,
      lesson: state.manual.lesson,
      testId: "", testType: "", studentId: "", skillId: "", fileType: "", search: "", dateFrom: "", dateTo: "",
    }, true);
  }

  function resetManualDraft(context = null) {
    const currentClass = state.manual.classId || initialClassId || "";
    state.manual = {
      id: 0,
      classId: currentClass,
      academicYear: context?.defaults?.academicYear || initialAcademicYear,
      semester: context?.defaults?.semester || initialSemester,
      title: "",
      assessmentDate: today,
      threshold: 80,
      mode: "quick",
      subject: context?.defaults?.subject || "",
      unit: "",
      lesson: "",
      items: [],
      scores: {},
    };
  }

  async function loadManual() {
    content.innerHTML = '<div class="skill-files__loading" role="status">جارٍ تحميل التقويم اليدوي…</div>';
    activeRequest?.abort();
    const controller = new AbortController(); activeRequest = controller;
    try {
      let context = await api(`/attachments/manual/context?${manualQuery()}`, { signal: controller.signal });
      if (!workspace.isConnected || state.tab !== "manual" || controller.signal.aborted) return;
      if (!state.manual.classId && list(context.classes).length) {
        state.manual.classId = String(context.classes[0].value);
        context = await api(`/attachments/manual/context?${manualQuery()}`, { signal: controller.signal });
      }
      if (!state.manual.id && !state.manual.subject && context.defaults?.subject) state.manual.subject = context.defaults.subject;
      let assessments = [];
      if (context.manualReady) {
        const response = await api(`/attachments/manual?${manualQuery()}`, { signal: controller.signal });
        assessments = list(response.assessments);
      }
      if (!workspace.isConnected || state.tab !== "manual" || controller.signal.aborted) return;
      renderManualContent(content, state, context, assessments, helpers);
      bindManual(context, assessments);
    } catch (error) {
      if (error.name === "AbortError") return;
      if (!workspace.isConnected || state.tab !== "manual") return;
      content.innerHTML = emptyState("تعذّر تحميل التقويم اليدوي", error.message || "حدث خطأ غير متوقع.", escapeHtml);
    }
  }

  function rerenderManual(context, assessments) {
    renderManualContent(content, state, context, assessments, helpers);
    bindManual(context, assessments);
  }

  function bindManual(context, assessments) {
    content.querySelectorAll("[data-manual-filter]").forEach((select) => select.addEventListener("change", () => {
      const key = select.dataset.manualFilter;
      if (key === "classId") {
        state.manual.classId = select.value;
        state.manual.id = 0; state.manual.subject = ""; state.manual.unit = ""; state.manual.lesson = ""; state.manual.items = []; state.manual.scores = {};
      } else if (key === "subject") {
        state.manual.subject = select.value; state.manual.unit = ""; state.manual.lesson = "";
      } else if (key === "unit") {
        state.manual.unit = select.value; state.manual.lesson = "";
      } else if (key === "lesson") {
        state.manual.lesson = select.value;
      }
      loadManual();
    }));
    content.querySelectorAll("[data-manual-text]").forEach((input) => input.addEventListener("change", () => {
      const key = input.dataset.manualText;
      if (key === "threshold") {
        state.manual.threshold = Math.max(0, Math.min(100, Number(input.value) || 0));
        rerenderManual(context, assessments);
      } else {
        state.manual[key] = input.value;
      }
    }));
    content.querySelector("[data-manual-add-skill]")?.addEventListener("click", () => {
      const skillId = content.querySelector("[data-manual-new-skill]")?.value || "";
      const questions = Math.max(1, Math.min(1000, Number(content.querySelector("[data-manual-new-questions]")?.value) || 0));
      const skill = list(context.skills).find((item) => String(item.value) === String(skillId));
      if (!skill) { toast("اختاري مهارة صحيحة أولًا.", "error"); return; }
      if (state.manual.items.some((item) => String(item.skillId) === String(skillId))) { toast("المهارة مضافة بالفعل.", "error"); return; }
      state.manual.items.push({ skillId: String(skill.value), skillName: skill.label, questionCount: questions, masteredCount: 0 });
      rerenderManual(context, assessments);
    });
    content.querySelectorAll("[data-manual-questions]").forEach((input) => input.addEventListener("change", () => {
      const item = state.manual.items.find((row) => String(row.skillId) === String(input.dataset.manualQuestions));
      if (!item) return;
      item.questionCount = Math.max(1, Math.min(1000, Number(input.value) || 1));
      Object.keys(state.manual.scores).forEach((key) => {
        if (key.endsWith(`:${item.skillId}`)) state.manual.scores[key] = Math.min(item.questionCount, Number(state.manual.scores[key]) || 0);
      });
      rerenderManual(context, assessments);
    }));
    content.querySelectorAll("[data-manual-remove-skill]").forEach((button) => button.addEventListener("click", () => {
      const skillId = String(button.dataset.manualRemoveSkill);
      state.manual.items = state.manual.items.filter((item) => String(item.skillId) !== skillId);
      Object.keys(state.manual.scores).forEach((key) => { if (key.endsWith(`:${skillId}`)) delete state.manual.scores[key]; });
      rerenderManual(context, assessments);
    }));
    content.querySelectorAll("[data-manual-mastered]").forEach((input) => input.addEventListener("change", () => {
      const item = state.manual.items.find((row) => String(row.skillId) === String(input.dataset.manualMastered));
      if (!item) return;
      item.masteredCount = Math.max(0, Math.min(list(context.students).length, Number(input.value) || 0));
      rerenderManual(context, assessments);
    }));
    content.querySelectorAll("[data-manual-score]").forEach((input) => input.addEventListener("change", () => {
      const [studentId, skillId] = String(input.dataset.manualScore).split(":");
      const item = state.manual.items.find((row) => String(row.skillId) === skillId);
      state.manual.scores[manualScoreKey(studentId, skillId)] = Math.max(0, Math.min(Number(item?.questionCount) || 1, Number(input.value) || 0));
      rerenderManual(context, assessments);
    }));
    content.querySelectorAll("[data-manual-mode]").forEach((button) => button.addEventListener("click", () => {
      const nextMode = button.dataset.manualMode;
      if (nextMode === state.manual.mode) return;
      if (nextMode === "quick" && state.manual.mode === "detailed") {
        const computed = manualAnalysis(state.manual, context);
        state.manual.items.forEach((item) => { item.masteredCount = computed.rows.find((row) => String(row.skillId) === String(item.skillId))?.mastered || 0; });
      }
      state.manual.mode = nextMode;
      rerenderManual(context, assessments);
    }));
    content.querySelector("[data-manual-new]")?.addEventListener("click", () => { resetManualDraft(context); loadManual(); });
    content.querySelector("[data-manual-print]")?.addEventListener("click", () => {
      const computed = manualAnalysis(state.manual, context);
      if (!computed.rows.length) return;
      const quick = state.manual.mode === "quick";
      const headers = quick
        ? ["المهارة", "عدد الأسئلة", "المتقنات", "نسبة الإتقان", "متوسط الأداء"]
        : ["الطالبة", ...state.manual.items.map((item) => item.skillName)];
      const rows = quick
        ? computed.rows.map((row) => [row.skillName, arabicNumber(row.questionCount, 0), `${arabicNumber(row.mastered, 0)} من ${arabicNumber(row.participants, 0)}`, percent(row.masteryPercent), percent(row.averagePerformance)])
        : list(context.students).map((student) => [student.label, ...state.manual.items.map((item) => `${arabicNumber(state.manual.scores[manualScoreKey(student.value, item.skillId)] || 0, 0)} من ${arabicNumber(item.questionCount, 0)}`)]);
      const safeRows = rows.map((row) => row.map((cell) => escapeHtml(cell)));
      const className = context.selectedClass?.name || list(context.classes).find((item) => String(item.value) === String(state.manual.classId))?.label || "";
      const title = state.manual.title.trim() || "تقويم مهارات يدوي";
      openPrint({
        title,
        classId: state.manual.classId,
        orientation: quick ? "portrait" : "landscape",
        bodyHtml: `<h2 class="report-title">${escapeHtml(title)}</h2><div class="print-note">الفصل: ${escapeHtml(className)}<br>تاريخ التقويم: ${escapeHtml(state.manual.assessmentDate)}<br>عتبة الإتقان: ${arabicNumber(state.manual.threshold, 0)}٪</div>${printTable(headers, safeRows, "manual-skill-assessment-print")}`,
      });
    });
    content.querySelector("[data-manual-save]")?.addEventListener("click", async () => {
      const academic = academicParams();
      const payload = {
        id: state.manual.id || undefined,
        classId: state.manual.classId,
        academicYear: state.manual.academicYear || academic.get("academicYear") || context.defaults?.academicYear || "",
        semester: state.manual.semester || academic.get("semester") || context.defaults?.semester || "",
        title: state.manual.title,
        assessmentDate: state.manual.assessmentDate,
        threshold: state.manual.threshold,
        mode: state.manual.mode,
        subject: state.manual.subject,
        unit: state.manual.unit,
        lesson: state.manual.lesson,
        items: state.manual.items.map((item) => ({
          skillId: item.skillId,
          questionCount: item.questionCount,
          masteredCount: state.manual.mode === "quick" ? item.masteredCount : undefined,
          scores: state.manual.mode === "detailed" ? list(context.students).map((student) => ({ studentId: student.value, correctCount: state.manual.scores[manualScoreKey(student.value, item.skillId)] || 0 })) : undefined,
        })),
      };
      const button = content.querySelector("[data-manual-save]"); button.disabled = true; button.textContent = "جارٍ الحفظ…";
      try {
        const result = await api("/attachments/manual", { method: "POST", body: JSON.stringify(payload) });
        state.manual.id = Number(result.id) || 0;
        toast(state.manual.id ? "تم حفظ التقويم اليدوي." : "تم إنشاء التقويم اليدوي.");
        await loadManual();
      } catch (error) {
        toast(error.message || "تعذّر حفظ التقويم اليدوي.", "error");
        button.disabled = false; button.textContent = state.manual.id ? "حفظ التعديلات" : "حفظ التقويم";
      }
    });
    content.querySelectorAll("[data-manual-open]").forEach((button) => button.addEventListener("click", async () => {
      try {
        const response = await api(`/attachments/manual/${button.dataset.manualOpen}`);
        const assessment = response.assessment || {};
        const scores = {};
        list(response.items).forEach((item) => list(item.scores).forEach((score) => { if (score.studentId) scores[manualScoreKey(score.studentId, item.skillId)] = Number(score.correctCount) || 0; }));
        state.manual = {
          id: Number(assessment.id) || 0,
          classId: String(assessment.classId || ""),
          academicYear: assessment.academicYear || initialAcademicYear,
          semester: assessment.semester || initialSemester,
          title: assessment.title || "",
          assessmentDate: assessment.assessmentDate || today,
          threshold: Number.isFinite(Number(assessment.threshold)) ? Number(assessment.threshold) : 80,
          mode: assessment.mode === "detailed" ? "detailed" : "quick",
          subject: assessment.subject || "", unit: assessment.unit || "", lesson: assessment.lesson || "",
          items: list(response.items).map((item) => ({ skillId: String(item.skillId || ""), skillName: item.skillName || "—", questionCount: Number(item.questionCount) || 1, masteredCount: Number(item.masteredCount) || 0 })),
          scores,
        };
        await loadManual();
      } catch (error) { toast(error.message || "تعذّر فتح التقويم.", "error"); }
    }));
    content.querySelectorAll("[data-manual-delete]").forEach((button) => button.addEventListener("click", async () => {
      const id = Number(button.dataset.manualDelete);
      if (!window.confirm("هل تريدين حذف هذا التقويم اليدوي؟")) return;
      try {
        await api("/attachments/manual/delete", { method: "POST", body: JSON.stringify({ id }) });
        if (state.manual.id === id) resetManualDraft(context);
        toast("تم حذف التقويم اليدوي."); await loadManual();
      } catch (error) { toast(error.message || "تعذّر حذف التقويم.", "error"); }
    }));
  }

  workspace.querySelectorAll("[data-main-tab]").forEach((button) => button.addEventListener("click", () => {
    state.tab = button.dataset.mainTab;
    workspace.querySelectorAll("[data-main-tab]").forEach((item) => { const active = item.dataset.mainTab === state.tab; item.classList.toggle("is-active", active); item.setAttribute("aria-selected", String(active)); });
    if (state.tab === "analysis") loadAnalysis();
    else if (state.tab === "paper") renderTeacherPaperAssessments({ container: content, api, escapeHtml, toast, getAcademicQuery });
    else loadFiles();
  }));
  await loadAnalysis();
}
