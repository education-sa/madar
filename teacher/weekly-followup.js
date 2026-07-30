// إضافة مستقلة للمتابعة الأسبوعية. لا تعدّل كود سجل الاختبارات القديم.
const weeklySavedState = JSON.parse(sessionStorage.getItem("madarWeeklyFollowUp") || "null") || {};
let weeklyFollowUpSection = weeklySavedState.section || "attendance";
let weeklyFollowUpWeek = Number(weeklySavedState.week || 1);
let weeklyFollowUpClassId = Number(weeklySavedState.classId || 0);
let weeklyFollowUpDayIndex = Number(weeklySavedState.dayIndex || 0);
let weeklyFollowUpStage = weeklySavedState.stage || "";
let weeklyFollowUpGrade = weeklySavedState.grade || "";
let weeklyFollowUpSearch = weeklySavedState.search || "";

const WEEKLY_ACADEMIC_GRADES = {
  "ابتدائي": ["رابع ابتدائي", "خامس ابتدائي", "سادس ابتدائي"],
  "متوسط": ["أول متوسط", "ثاني متوسط", "ثالث متوسط"],
  "ثانوي": ["أول ثانوي", "ثاني ثانوي", "ثالث ثانوي"],
};

function weeklyNormalizeGrade(stage, label) {
  const text = String(label || "").replace(/الصف/g, "").replace(/\s+/g, " ").trim();
  const ordinal = text.includes("الرابع") || text.includes("رابع") ? "رابع"
    : text.includes("الخامس") || text.includes("خامس") ? "خامس"
    : text.includes("السادس") || text.includes("سادس") ? "سادس"
    : text.includes("الأول") || text.includes("اول") || text.includes("أول") ? "أول"
    : text.includes("الثاني") || text.includes("ثاني") ? "ثاني"
    : text.includes("الثالث") || text.includes("ثالث") ? "ثالث" : "";
  if (stage === "ابتدائي" && ["رابع", "خامس", "سادس"].includes(ordinal)) return `${ordinal} ابتدائي`;
  if (stage === "متوسط" && ["أول", "ثاني", "ثالث"].includes(ordinal)) return `${ordinal} متوسط`;
  if (stage === "ثانوي" && ["أول", "ثاني", "ثالث"].includes(ordinal)) return `${ordinal} ثانوي`;
  return text;
}

function saveWeeklyState() {
  sessionStorage.setItem("madarWeeklyFollowUp", JSON.stringify({
    section: weeklyFollowUpSection,
    week: weeklyFollowUpWeek,
    classId: weeklyFollowUpClassId,
    dayIndex: weeklyFollowUpDayIndex,
    stage: weeklyFollowUpStage,
    grade: weeklyFollowUpGrade,
    search: weeklyFollowUpSearch,
  }));
}
let weeklyFollowUpData = null;
let weeklyFollowUpInitialized = false;
let weeklyFollowUpContextKey = "";
let weeklyCsrfToken = "";

const weeklyEscape = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
function weeklyCleanScore(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
async function weeklyEnsureCsrf() {
  if (weeklyCsrfToken) return;
  const response = await fetch("/api/teacher/me");
  if (response.status === 401) { location.href = "login.html"; throw new Error("انتهت جلسة الدخول."); }
  const data = await response.json();
  weeklyCsrfToken = data.csrfToken || "";
}
async function weeklyApi(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isFormData = options.body instanceof FormData;
  if (method !== "GET" && method !== "HEAD") await weeklyEnsureCsrf();
  const response = await fetch(`/api/teacher${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(method !== "GET" && method !== "HEAD" && weeklyCsrfToken ? { "X-CSRF-Token": weeklyCsrfToken } : {}),
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) { location.href = "login.html"; throw new Error("انتهت جلسة الدخول."); }
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;
  if (!response.ok) throw new Error(data?.error || "حدث خطأ غير متوقع.");
  if (data?.csrfToken) weeklyCsrfToken = data.csrfToken;
  return data;
}
function weeklyToast(message) {
  const root = document.getElementById("toastRoot");
  if (!root) return alert(message);
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  root.innerHTML = "";
  root.appendChild(element);
  setTimeout(() => element.remove(), 3000);
}
function weeklyOpenModal(html, className = "") {
  const root = document.getElementById("modalRoot");
  root.innerHTML = `<div class="modal-overlay" id="weeklyModalOverlay"><div class="modal-box ${weeklyEscape(className)}" role="dialog" aria-modal="true">${html}</div></div>`;
  document.getElementById("weeklyModalOverlay").onclick = (event) => { if (event.target.id === "weeklyModalOverlay") weeklyCloseModal(); };
}
function weeklyCloseModal() { const root = document.getElementById("modalRoot"); if (root) root.innerHTML = ""; }
function weeklyConfirmAction(message, onConfirm) {
  weeklyOpenModal(`<div class="confirm-box"><div class="ic">⚠️</div><p>${weeklyEscape(message)}</p><div class="modal-actions" style="justify-content:center"><button class="btn btn-outline" id="weeklyCancelConfirm">إلغاء</button><button class="btn btn-danger" id="weeklyOkConfirm">تأكيد</button></div></div>`);
  document.getElementById("weeklyCancelConfirm").onclick = weeklyCloseModal;
  document.getElementById("weeklyOkConfirm").onclick = async () => { weeklyCloseModal(); try { await onConfirm(); } catch (error) { weeklyToast(error.message); } };
}

// ============================================================================
// المتابعة الأسبوعية التفصيلية
// ============================================================================
const WEEKLY_SECTION_LABELS = { attendance: "الحضور", participation: "المشاركة", homework: "الواجبات", tasks: "المهام" };
const WEEKLY_STATE_LABELS = { complete: "مكتمل", review: "يحتاج مراجعة", empty: "لم يسجل بعد" };

function weeklyTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weeklyCurrentWeek(settings) {
  if (!settings?.academic_start_date) return 1;
  const start = new Date(`${settings.academic_start_date}T00:00:00`);
  const today = new Date(`${weeklyTodayString()}T00:00:00`);
  const days = Math.floor((today - start) / 86400000);
  return Math.max(1, Math.min(60, Math.floor(days / 7) + 1));
}

function weeklyStateBadge(state) {
  return `<span class="weekly-state weekly-state-${state}"><i></i>${WEEKLY_STATE_LABELS[state] || state}</span>`;
}

function weeklyDateLabel(day) {
  return `${day.name}${day.date ? `<small>${weeklyEscape(day.date)}</small>` : "<small>بدون تاريخ</small>"}`;
}

function weeklyClassList(data, stage = weeklyFollowUpStage, grade = weeklyFollowUpGrade) {
  return data.classes.filter((item) => item.level === stage && weeklyNormalizeGrade(stage, item.grade_label) === grade);
}

function weeklyApplySearch() {
  const input = document.getElementById("followUpSearch");
  if (input) {
    if (input.value !== weeklyFollowUpSearch) input.value = weeklyFollowUpSearch;
    if (!input.dataset.weeklySearchBound) {
      input.dataset.weeklySearchBound = "1";
      input.addEventListener("input", () => {
        weeklyFollowUpSearch = input.value.trim().toLocaleLowerCase("ar");
        saveWeeklyState();
        weeklyApplySearch();
      });
    }
  }
  const query = weeklyFollowUpSearch.trim().toLocaleLowerCase("ar");
  document.querySelectorAll("#weeklySectionBody table tbody tr").forEach((row) => {
    row.hidden = query !== "" && !row.textContent.toLocaleLowerCase("ar").includes(query);
  });
}

function weeklySyncTopAction(data) {
  const host = document.getElementById("followUpTopAction");
  if (!host) return;
  if (!data?.students?.length) { host.innerHTML = ""; return; }
  const day = data.days?.[weeklyFollowUpDayIndex];
  const itemCount = (data.items || []).filter((item) => weeklyFollowUpSection === "tasks" ? item.item_type === "task" : item.item_type !== "task").length;
  const config = {
    attendance: ["saveWeeklyAttendance", "حفظ تحضير اليوم", !day?.date],
    participation: ["saveWeeklyParticipation", "حفظ المشاركة", !day?.date],
    homework: ["saveWeeklyItems", "حفظ الواجبات", itemCount === 0],
    tasks: ["saveWeeklyItems", "حفظ المهام", itemCount === 0],
  }[weeklyFollowUpSection] || ["", "", true];
  host.innerHTML = config[0] ? `<button class="btn btn-primary" type="button" id="${config[0]}" ${config[2] ? "disabled" : ""}>${config[1]}</button>` : "";
}

async function renderWeeklyFollowUp() {
  const target = document.getElementById("weeklyFollowUpContent");
  if (!target) return;
  const classQuery = weeklyFollowUpClassId ? `&classId=${weeklyFollowUpClassId}` : "";
  try {
    const data = await weeklyApi(`/weekly-follow-up?week=${weeklyFollowUpWeek}${classQuery}`);
    weeklyFollowUpData = data;
    const nextContextKey = `${data.settings?.academic_year || ""}|${data.settings?.current_semester || ""}|${data.settings?.academic_start_date || ""}`;
    if (nextContextKey !== weeklyFollowUpContextKey) {
      weeklyFollowUpContextKey = nextContextKey;
      weeklyFollowUpInitialized = false;
    }
    if (!weeklyFollowUpInitialized && data.settings?.academic_start_date) {
      weeklyFollowUpInitialized = true;
      const currentWeek = weeklyCurrentWeek(data.settings);
      weeklyFollowUpDayIndex = Math.min(4, Math.max(0, new Date().getDay()));
      if (currentWeek !== weeklyFollowUpWeek) {
        weeklyFollowUpWeek = currentWeek;
        saveWeeklyState();
        await renderWeeklyFollowUp();
        return;
      }
    } else {
      weeklyFollowUpInitialized = true;
    }
    if (!data.classes.length) {
      target.innerHTML = '<div class="empty-state"><div class="ic">🏷️</div>أنشئي فصلًا وأضيفي الطالبات أولًا.</div>';
      return;
    }

    const fetchedClass = data.class || data.classes[0];
    if (!WEEKLY_ACADEMIC_GRADES[weeklyFollowUpStage]) weeklyFollowUpStage = fetchedClass.level || "ابتدائي";
    const gradeOptions = WEEKLY_ACADEMIC_GRADES[weeklyFollowUpStage] || [];
    const fetchedGrade = weeklyNormalizeGrade(weeklyFollowUpStage, fetchedClass.grade_label);
    if (!gradeOptions.includes(weeklyFollowUpGrade)) weeklyFollowUpGrade = gradeOptions.includes(fetchedGrade) ? fetchedGrade : (gradeOptions[0] || "");

    const matchingClasses = weeklyClassList(data);
    const selectedClass = matchingClasses.find((item) => Number(item.id) === weeklyFollowUpClassId) || matchingClasses[0] || null;
    if (selectedClass && Number(data.class?.id || 0) !== Number(selectedClass.id)) {
      weeklyFollowUpClassId = Number(selectedClass.id);
      saveWeeklyState();
      await renderWeeklyFollowUp();
      return;
    }
    if (selectedClass) weeklyFollowUpClassId = Number(selectedClass.id);
    weeklyFollowUpWeek = Number(data.week || 1);
    saveWeeklyState();
    if (weeklyFollowUpDayIndex > 4) weeklyFollowUpDayIndex = 0;
    const sectionStateKey = weeklyFollowUpSection === "attendance" ? "attendanceState" : weeklyFollowUpSection === "participation" ? "participationState" : weeklyFollowUpSection === "homework" ? "homeworkState" : "tasksState";
    const semesterLabel = data.settings?.semester_label || "الترم الأول";
    const classOptions = matchingClasses.length
      ? matchingClasses.map((item) => `<option value="${item.id}" ${Number(item.id) === weeklyFollowUpClassId ? "selected" : ""}>${weeklyEscape(item.name)}</option>`).join("")
      : '<option value="">لا يوجد فصل مسجل لهذا الصف</option>';
    const details = selectedClass
      ? `<div class="weekly-status-legend"><span class="green"></span> مكتمل <span class="yellow"></span> يحتاج مراجعة <span class="red"></span> لم يسجل بعد</div>
         <div class="weekly-days">${data.days.map((day) => `<button type="button" class="weekly-day ${weeklyFollowUpDayIndex === day.index ? "active" : ""}" data-weekly-day="${day.index}">${weeklyDateLabel(day)}${weeklyStateBadge(day[sectionStateKey] || "empty")}</button>`).join("")}</div>
         <div id="weeklySectionBody">${renderWeeklySectionBody(data)}</div>`
      : '<div id="weeklySectionBody"><div class="empty-state">لا يوجد فصل مسجل للمرحلة والصف المختارين.</div></div>';

    target.innerHTML = `
      <section class="weekly-followup-shell">
        <div class="weekly-navigation">
          <div class="weekly-selectors">
            <label>المرحلة<select id="weeklyStageSelect">${Object.keys(WEEKLY_ACADEMIC_GRADES).map((stage) => `<option value="${stage}" ${stage === weeklyFollowUpStage ? "selected" : ""}>${stage}</option>`).join("")}</select></label>
            <label>الصف<select id="weeklyGradeSelect">${gradeOptions.map((grade) => `<option value="${grade}" ${grade === weeklyFollowUpGrade ? "selected" : ""}>${grade}</option>`).join("")}</select></label>
            <label>الفصل<select id="weeklyClassSelect" ${matchingClasses.length ? "" : "disabled"}>${classOptions}</select></label>
            <label>الفصل الدراسي<select class="weekly-term-select" disabled><option>${weeklyEscape(semesterLabel)}</option></select></label>
          </div>
          <div class="weekly-week-controls">
            <button class="btn btn-outline btn-sm" id="weeklyPrev">الأسبوع السابق</button>
            <strong>الأسبوع ${weeklyFollowUpWeek}</strong>
            <button class="btn btn-outline btn-sm" id="weeklyNext">الأسبوع التالي</button>
            <button class="btn btn-secondary btn-sm" id="weeklyCurrent">الأسبوع الحالي</button>
            <button class="btn btn-outline btn-sm" id="weeklyToday">اليوم الحالي</button>
          </div>
          <div class="weekly-file-actions">
            <span class="weekly-year-label">العام الدراسي: ${weeklyEscape(data.settings?.academic_year || "—")}</span>
            <button class="btn btn-outline btn-sm" id="weeklyImport">استيراد</button>
            <button class="btn btn-outline btn-sm" id="weeklyExport">تصدير Excel</button>
            <button class="btn btn-primary btn-sm" id="weeklyPrint">طباعة عامة</button>
          </div>
        </div>
        ${details}
      </section>`;
    bindWeeklyNavigation(data);
    weeklySyncTopAction(selectedClass ? data : null);
    if (selectedClass) bindWeeklySection(data);
    weeklyApplySearch();
  } catch (error) {
    target.innerHTML = `<div class="empty-state">${weeklyEscape(error.message)}</div>`;
  }
}

function bindWeeklyNavigation(data) {
  document.getElementById("weeklyStageSelect").onchange = (event) => {
    weeklyFollowUpStage = event.target.value;
    weeklyFollowUpGrade = (WEEKLY_ACADEMIC_GRADES[weeklyFollowUpStage] || [])[0] || "";
    weeklyFollowUpClassId = Number(weeklyClassList(data, weeklyFollowUpStage, weeklyFollowUpGrade)[0]?.id || 0);
    saveWeeklyState();
    renderWeeklyFollowUp();
  };
  document.getElementById("weeklyGradeSelect").onchange = (event) => {
    weeklyFollowUpGrade = event.target.value;
    weeklyFollowUpClassId = Number(weeklyClassList(data)[0]?.id || 0);
    saveWeeklyState();
    renderWeeklyFollowUp();
  };
  const classSelect = document.getElementById("weeklyClassSelect");
  if (classSelect && !classSelect.disabled) classSelect.onchange = (event) => { weeklyFollowUpClassId = Number(event.target.value); saveWeeklyState(); renderWeeklyFollowUp(); };
  document.getElementById("weeklyPrev").onclick = () => { weeklyFollowUpWeek = Math.max(1, weeklyFollowUpWeek - 1); saveWeeklyState(); renderWeeklyFollowUp(); };
  document.getElementById("weeklyNext").onclick = () => { weeklyFollowUpWeek = Math.min(60, weeklyFollowUpWeek + 1); saveWeeklyState(); renderWeeklyFollowUp(); };
  document.getElementById("weeklyCurrent").onclick = () => { weeklyFollowUpWeek = weeklyCurrentWeek(data.settings); saveWeeklyState(); renderWeeklyFollowUp(); };
  document.getElementById("weeklyToday").onclick = () => {
    const index = data.days.findIndex((day) => day.date === weeklyTodayString());
    if (index >= 0) { weeklyFollowUpDayIndex = index; saveWeeklyState(); renderWeeklyFollowUp(); }
    else { weeklyFollowUpWeek = weeklyCurrentWeek(data.settings); weeklyFollowUpDayIndex = Math.min(4, Math.max(0, new Date().getDay())); saveWeeklyState(); renderWeeklyFollowUp(); }
  };
  document.querySelectorAll("[data-weekly-day]").forEach((button) => button.onclick = () => { weeklyFollowUpDayIndex = Number(button.dataset.weeklyDay); saveWeeklyState(); renderWeeklyFollowUp(); });
  document.getElementById("weeklyExport").onclick = () => openWeeklyExport(data);
  document.getElementById("weeklyPrint").onclick = () => openWeeklyPrint(data);
  document.getElementById("weeklyImport").onclick = () => openWeeklyImport(data);
}

function renderWeeklySectionBody(data) {
  if (!data.students.length) return '<div class="empty-state">لا توجد طالبات في هذا الفصل.</div>';
  if (weeklyFollowUpSection === "attendance") return renderWeeklyAttendance(data);
  if (weeklyFollowUpSection === "participation") return renderWeeklyParticipation(data);
  return renderWeeklyItems(data, weeklyFollowUpSection);
}

function renderWeeklyAttendance(data) {
  const day = data.days[weeklyFollowUpDayIndex];
  if (!day?.date) return weeklyMissingDateMessage();
  const options = [
    ["", "لم يسجل"], ["present", "حاضرة"], ["absent", "غائبة"], ["late", "متأخرة"], ["excused", "بعذر"],
  ];
  const rows = data.students.map((student) => {
    const status = data.attendance[String(student.id)]?.[day.date] || "";
    return `<tr><td>${weeklyEscape(student.name)}</td><td>${weeklyEscape(student.email)}</td><td><select class="weekly-status-select status-${status || "empty"}" data-attendance-student="${student.id}">${options.map(([value, label]) => `<option value="${value}" ${status === value ? "selected" : ""}>${label}</option>`).join("")}</select></td></tr>`;
  }).join("");
  return `<div class="weekly-section-head"><div><span>تحضير سريع</span><h3>${day.name} · ${weeklyEscape(day.date)}</h3><p>اختاري «الجميع حاضر» ثم غيّري فقط الطالبات الغائبات أو المتأخرات.</p></div><div class="weekly-quick-actions"><button class="btn btn-secondary btn-sm" data-attendance-all="present">الجميع حاضر</button><button class="btn btn-outline btn-sm" data-attendance-all="absent">الجميع غائب</button><button class="btn btn-outline btn-sm" data-attendance-all="">تفريغ اليوم</button></div></div><div class="table-wrap"><table class="weekly-record-table"><thead><tr><th>اسم الطالبة</th><th>البريد</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderWeeklyParticipation(data) {
  const day = data.days[weeklyFollowUpDayIndex];
  if (!day?.date) return weeklyMissingDateMessage();
  const existingMax = data.students.map((student) => data.participation[String(student.id)]?.[day.date]?.maxScore).find((value) => value) || 1;
  const rows = data.students.map((student) => {
    const record = data.participation[String(student.id)]?.[day.date] || {};
    return `<tr><td>${weeklyEscape(student.name)}</td><td><input class="weekly-score-input" type="number" min="0" step="0.5" data-participation-score="${student.id}" value="${record.score ?? ""}"></td><td><select data-participation-status="${student.id}"><option value="" ${!record.status ? "selected" : ""}>لم يسجل</option><option value="completed" ${record.status === "completed" ? "selected" : ""}>مكتمل</option><option value="needs_review" ${record.status === "needs_review" ? "selected" : ""}>يحتاج مراجعة</option></select></td><td><input class="weekly-note-input" data-participation-note="${student.id}" value="${weeklyEscape(record.note || "")}" placeholder="ملاحظة اختيارية"></td></tr>`;
  }).join("");
  return `<div class="weekly-section-head"><div><span>مشاركة يومية</span><h3>${day.name} · ${weeklyEscape(day.date)}</h3><p>يمكن تسجيل الدرجة للجميع بضغطة واحدة ثم تعديل الحالات الاستثنائية.</p></div><label class="weekly-max-field">الدرجة الكاملة<input id="participationMaxScore" type="number" min="0.5" step="0.5" value="${existingMax}"></label><div class="weekly-quick-actions"><button class="btn btn-secondary btn-sm" id="participationAllFull">الجميع كامل</button><button class="btn btn-outline btn-sm" id="participationAllReview">الجميع يحتاج مراجعة</button><button class="btn btn-outline btn-sm" id="participationClear">تفريغ اليوم</button></div></div><div class="table-wrap"><table class="weekly-record-table"><thead><tr><th>اسم الطالبة</th><th>الدرجة</th><th>حالة التسجيل</th><th>ملاحظة</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function weeklyMissingDateMessage() {
  return '<div class="weekly-missing-date"><strong>يرجى تحديد تاريخ بداية الترم من إعدادات العام الدراسي والمدرسة أولًا.</strong><p>تُنشأ أسابيع المتابعة تلقائيًا من تاريخ بداية الترم الحالي.</p></div>';
}

function renderWeeklyItems(data, section) {
  const items = data.items.filter((item) => section === "tasks" ? item.item_type === "task" : item.item_type !== "task");
  const title = section === "tasks" ? "المهام" : "الواجبات";
  const totalMax = items.reduce((sum, item) => sum + Number(item.maxScore || 0), 0);
  const headers = items.map((item) => `<th><div class="weekly-item-head"><strong>${weeklyEscape(item.title)}</strong><small>${weeklyEscape(item.item_date)} · ${item.item_type === "platform_homework" ? "منصة" : item.item_type === "school_homework" ? "مدرسة" : `مهمة ${item.sort_order || ""}`} · ${item.maxScore} درجات</small><span><button type="button" data-edit-weekly-item="${item.id}" title="تعديل">✏️</button><button type="button" data-delete-weekly-item="${item.id}" title="حذف">🗑️</button></span></div></th>`).join("");
  const rows = data.students.map((student) => {
    let sum = 0;
    const cells = items.map((item) => {
      const record = item.scores[String(student.id)] || {};
      sum += Number(record.score || 0);
      return `<td><div class="weekly-item-cell"><input type="number" min="0" max="${item.maxScore}" step="0.5" data-item-score="${item.id}" data-student-id="${student.id}" value="${record.score ?? ""}"><select data-item-status="${item.id}" data-student-id="${student.id}"><option value="" ${!record.status ? "selected" : ""}>لم يسجل</option><option value="completed" ${record.status === "completed" ? "selected" : ""}>مكتمل</option><option value="needs_review" ${record.status === "needs_review" ? "selected" : ""}>مراجعة</option><option value="missing" ${record.status === "missing" ? "selected" : ""}>لم تسلم</option><option value="excused" ${record.status === "excused" ? "selected" : ""}>معذورة</option></select></div></td>`;
    }).join("");
    return `<tr><td class="weekly-student-name">${weeklyEscape(student.name)}</td>${cells}<td class="weekly-total-cell" data-weekly-row-total>${weeklyCleanScore(sum)} / ${weeklyCleanScore(totalMax)}</td></tr>`;
  }).join("");
  return `<div class="weekly-section-head"><div><span>متابعة ${title}</span><h3>${title} · الأسبوع ${data.week}</h3><p>${section === "homework" ? "يدعم واجبات المنصة وواجبات المدرسة، مع حساب الدرجة الكاملة والمجموع تلقائيًا." : "أضيفي أعمدة المهام حسب الحاجة وحددي تاريخ ودرجة كل مهمة."}</p></div><div class="weekly-quick-actions">${section === "homework" ? '<button class="btn btn-secondary btn-sm" id="createHomeworkPlan">إنشاء خطة ٤ واجبات</button>' : ""}<button class="btn btn-outline btn-sm" id="addWeeklyItem">${section === "tasks" ? "إضافة مهمة" : "إضافة واجب"}</button></div></div>${items.length ? `<div class="weekly-item-tools"><label>البند السريع<select id="weeklyActiveItem">${items.map((item) => `<option value="${item.id}">${weeklyEscape(item.title)}</option>`).join("")}</select></label><button class="btn btn-outline btn-sm" id="itemAllFull">الجميع كامل</button><button class="btn btn-outline btn-sm" id="itemAllMissing">الجميع لم تسلم</button><span>مجموع الدرجات الكاملة: <strong>${weeklyCleanScore(totalMax)}</strong></span></div><div class="table-wrap"><table class="weekly-record-table weekly-items-table"><thead><tr><th>اسم الطالبة</th>${headers}<th>المجموع</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty-state">لا توجد ${title} في هذا الأسبوع. استخدمي زر الإضافة لبدء التسجيل.</div>`}`;
}

function bindWeeklySection(data) {
  if (weeklyFollowUpSection === "attendance") return bindWeeklyAttendance(data);
  if (weeklyFollowUpSection === "participation") return bindWeeklyParticipation(data);
  bindWeeklyItems(data, weeklyFollowUpSection);
}

function bindWeeklyAttendance(data) {
  document.querySelectorAll("[data-attendance-all]").forEach((button) => button.onclick = () => {
    document.querySelectorAll("[data-attendance-student]").forEach((select) => { select.value = button.dataset.attendanceAll; select.className = `weekly-status-select status-${select.value || "empty"}`; });
  });
  document.querySelectorAll("[data-attendance-student]").forEach((select) => select.onchange = () => { select.className = `weekly-status-select status-${select.value || "empty"}`; });
  const save = document.getElementById("saveWeeklyAttendance");
  if (save) save.onclick = async () => {
    const day = data.days[weeklyFollowUpDayIndex];
    const entries = [...document.querySelectorAll("[data-attendance-student]")].map((select) => ({ studentId: Number(select.dataset.attendanceStudent), status: select.value }));
    save.disabled = true;
    try { await weeklyApi("/weekly-follow-up/attendance", { method: "PUT", body: JSON.stringify({ classId: weeklyFollowUpClassId, date: day.date, entries }) }); weeklyToast("تم حفظ تحضير اليوم."); await renderWeeklyFollowUp(); } catch (error) { weeklyToast(error.message); save.disabled = false; }
  };
}

function bindWeeklyParticipation(data) {
  const maxInput = document.getElementById("participationMaxScore");
  const fill = (mode) => {
    const max = Number(maxInput.value || 1);
    data.students.forEach((student) => {
      const score = document.querySelector(`[data-participation-score="${student.id}"]`);
      const status = document.querySelector(`[data-participation-status="${student.id}"]`);
      if (mode === "full") { score.value = max; status.value = "completed"; }
      if (mode === "review") { if (score.value === "") score.value = 0; status.value = "needs_review"; }
      if (mode === "clear") { score.value = ""; status.value = ""; }
    });
  };
  document.getElementById("participationAllFull").onclick = () => fill("full");
  document.getElementById("participationAllReview").onclick = () => fill("review");
  document.getElementById("participationClear").onclick = () => fill("clear");
  document.getElementById("saveWeeklyParticipation").onclick = async () => {
    const button = document.getElementById("saveWeeklyParticipation"); const day = data.days[weeklyFollowUpDayIndex]; const maxScore = Number(maxInput.value || 1);
    const entries = data.students.map((student) => ({ studentId: Number(student.id), score: document.querySelector(`[data-participation-score="${student.id}"]`).value, status: document.querySelector(`[data-participation-status="${student.id}"]`).value, note: document.querySelector(`[data-participation-note="${student.id}"]`).value, maxScore }));
    button.disabled = true;
    try { await weeklyApi("/weekly-follow-up/participation", { method: "PUT", body: JSON.stringify({ classId: weeklyFollowUpClassId, date: day.date, entries }) }); weeklyToast("تم حفظ المشاركة اليومية."); await renderWeeklyFollowUp(); } catch (error) { weeklyToast(error.message); button.disabled = false; }
  };
}

function bindWeeklyItems(data, section) {
  document.getElementById("addWeeklyItem")?.addEventListener("click", () => openWeeklyItemForm(data, section));
  document.getElementById("createHomeworkPlan")?.addEventListener("click", async () => {
    const dates = data.days.map((day) => day.date);
    if (dates.slice(0, 4).some((date) => !date)) return weeklyToast("أكملي تواريخ الأحد إلى الأربعاء أولًا.");
    try { const result = await weeklyApi("/weekly-follow-up/items", { method: "POST", body: JSON.stringify({ classId: weeklyFollowUpClassId, week: data.week, quickPlan: true, dates }) }); weeklyToast(result.created ? `تم إنشاء ${result.created} واجبات.` : "خطة الواجبات موجودة مسبقًا."); await renderWeeklyFollowUp(); } catch (error) { weeklyToast(error.message); }
  });
  document.querySelectorAll("[data-edit-weekly-item]").forEach((button) => button.onclick = () => openWeeklyItemForm(data, section, data.items.find((item) => Number(item.id) === Number(button.dataset.editWeeklyItem))));
  document.querySelectorAll("[data-delete-weekly-item]").forEach((button) => button.onclick = () => weeklyConfirmAction("هل تريدين حذف هذا البند ودرجاته؟", async () => { await weeklyApi(`/weekly-follow-up/items/${button.dataset.deleteWeeklyItem}`, { method: "DELETE" }); weeklyToast("تم حذف البند."); await renderWeeklyFollowUp(); }));
  const setActiveItem = (status, full) => {
    const itemId = document.getElementById("weeklyActiveItem")?.value;
    const item = data.items.find((entry) => String(entry.id) === String(itemId));
    if (!item) return;
    document.querySelectorAll(`[data-item-status="${itemId}"]`).forEach((select) => { select.value = status; });
    document.querySelectorAll(`[data-item-score="${itemId}"]`).forEach((input) => { input.value = full ? item.maxScore : 0; });
    updateWeeklyItemTotals(data, section);
  };
  document.getElementById("itemAllFull")?.addEventListener("click", () => setActiveItem("completed", true));
  document.getElementById("itemAllMissing")?.addEventListener("click", () => setActiveItem("missing", false));
  document.querySelectorAll("[data-item-score]").forEach((input) => input.oninput = () => updateWeeklyItemTotals(data, section));
  document.getElementById("saveWeeklyItems")?.addEventListener("click", async () => {
    const button = document.getElementById("saveWeeklyItems"); button.disabled = true;
    const items = data.items.filter((item) => section === "tasks" ? item.item_type === "task" : item.item_type !== "task");
    try {
      for (const item of items) {
        const scores = data.students.map((student) => ({ studentId: Number(student.id), score: document.querySelector(`[data-item-score="${item.id}"][data-student-id="${student.id}"]`)?.value || "", status: document.querySelector(`[data-item-status="${item.id}"][data-student-id="${student.id}"]`)?.value || "" }));
        await weeklyApi(`/weekly-follow-up/items/${item.id}`, { method: "PUT", body: JSON.stringify({ scores }) });
      }
      weeklyToast(`تم حفظ ${WEEKLY_SECTION_LABELS[section]}.`); await renderWeeklyFollowUp();
    } catch (error) { weeklyToast(error.message); button.disabled = false; }
  });
}

function updateWeeklyItemTotals(data, section) {
  const items = data.items.filter((item) => section === "tasks" ? item.item_type === "task" : item.item_type !== "task");
  const max = items.reduce((sum, item) => sum + Number(item.maxScore || 0), 0);
  document.querySelectorAll(".weekly-items-table tbody tr").forEach((row, rowIndex) => {
    const student = data.students[rowIndex];
    const total = items.reduce((sum, item) => sum + Number(document.querySelector(`[data-item-score="${item.id}"][data-student-id="${student.id}"]`)?.value || 0), 0);
    row.querySelector("[data-weekly-row-total]").textContent = `${weeklyCleanScore(total)} / ${weeklyCleanScore(max)}`;
  });
}

function openWeeklyDateSettings() {
  location.hash = "settings";
}

function openWeeklyItemForm(data, section, item = null) {
  const typeOptions = section === "tasks" ? '<option value="task">مهمة</option>' : '<option value="platform_homework">واجب منصة</option><option value="school_homework">واجب مدرسة</option>';
  const defaultDate = item?.item_date || data.days[weeklyFollowUpDayIndex]?.date || data.days.find((day) => day.date)?.date || "";
  const suggestedTitle = item?.title || (section === "tasks" ? `مهمة ${data.items.filter((entry) => entry.item_type === "task").length + 1}` : "واجب منصة");
  weeklyOpenModal(`<h3>${item ? "تعديل البند" : section === "tasks" ? "إضافة مهمة" : "إضافة واجب"}</h3><div class="form-grid"><label class="field">النوع<select id="weeklyItemType" ${item ? "disabled" : ""}>${typeOptions}</select></label><label class="field">العنوان<input id="weeklyItemTitle" value="${weeklyEscape(suggestedTitle)}" placeholder="مثل: واجب منصة درس النسبة"></label><label class="field">التاريخ<input type="date" id="weeklyItemDate" value="${weeklyEscape(defaultDate)}"></label><label class="field">الدرجة الكاملة<input type="number" min="0.5" step="0.5" id="weeklyItemMax" value="${item?.maxScore || 1}"></label></div><div class="modal-actions"><button class="btn btn-outline" id="cancelWeeklyItem">إلغاء</button><button class="btn btn-primary" id="saveWeeklyItem">حفظ</button></div>`);
  if (item) document.getElementById("weeklyItemType").value = item.item_type;
  document.getElementById("cancelWeeklyItem").onclick = weeklyCloseModal;
  document.getElementById("saveWeeklyItem").onclick = async () => {
    const payload = { classId: weeklyFollowUpClassId, week: data.week, itemType: document.getElementById("weeklyItemType").value, title: document.getElementById("weeklyItemTitle").value.trim(), date: document.getElementById("weeklyItemDate").value, maxScore: Number(document.getElementById("weeklyItemMax").value || 1) };
    try { if (item) await weeklyApi(`/weekly-follow-up/items/${item.id}`, { method: "PUT", body: JSON.stringify(payload) }); else await weeklyApi("/weekly-follow-up/items", { method: "POST", body: JSON.stringify(payload) }); weeklyCloseModal(); weeklyToast("تم حفظ البند."); await renderWeeklyFollowUp(); } catch (error) { weeklyToast(error.message); }
  };
}

function openWeeklyExport(data) {
  weeklyOpenModal(`<h3>تصدير سجل المتابعة</h3><p class="weekly-modal-note">اختاري الأقسام التي تريدينها داخل ملف Excel.</p><div class="weekly-print-options">${Object.entries(WEEKLY_SECTION_LABELS).map(([key, label]) => `<label><input type="checkbox" data-export-section="${key}" checked> ${label}</label>`).join("")}</div><div class="modal-actions"><button class="btn btn-outline" id="cancelWeeklyExport">إلغاء</button><button class="btn btn-primary" id="runWeeklyExport">تصدير Excel</button></div>`);
  document.getElementById("cancelWeeklyExport").onclick = weeklyCloseModal;
  document.getElementById("runWeeklyExport").onclick = () => { const sections = [...document.querySelectorAll("[data-export-section]:checked")].map((input) => input.dataset.exportSection).join(","); window.open(`/api/teacher/weekly-follow-up/export.xlsx?classId=${weeklyFollowUpClassId}&week=${data.week}&sections=${encodeURIComponent(sections)}`, "_blank"); weeklyCloseModal(); };
}

function openWeeklyPrint(data) {
  weeklyOpenModal(`
    <h3>طباعة سجل المتابعة</h3>
    <p class="weekly-modal-note">اختاري الطباعة العامة لدمج الحضور والمشاركة والواجبات والمهام في جدول واحد، أو اختاري سجلًا منفصلًا.</p>
    <div class="weekly-print-type-list">
      <label><input type="radio" name="weeklyPrintType" value="general" checked><span><strong>طباعة عامة</strong><small>الحضور والمشاركة والواجبات والمهام في جدول واحد</small></span></label>
      <label><input type="radio" name="weeklyPrintType" value="attendance"><span><strong>سجل الحضور</strong><small>جدول الحضور فقط</small></span></label>
      <label><input type="radio" name="weeklyPrintType" value="participation"><span><strong>سجل المشاركة</strong><small>جدول المشاركة فقط</small></span></label>
      <label><input type="radio" name="weeklyPrintType" value="homework"><span><strong>سجل الواجبات</strong><small>جدول الواجبات فقط</small></span></label>
      <label><input type="radio" name="weeklyPrintType" value="tasks"><span><strong>سجل المهام</strong><small>جدول المهام فقط</small></span></label>
    </div>
    <label class="field">عرض المهام في الطباعة
      <select id="weeklyTaskPrintMode"><option value="symbols">رموز صح وخطأ وتأخر</option><option value="grades">الدرجة عند وجودها</option></select>
    </label>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelWeeklyPrint">إلغاء</button><button class="btn btn-primary" id="runWeeklyPrint">معاينة وطباعة PDF</button></div>`);
  document.getElementById("cancelWeeklyPrint").onclick = weeklyCloseModal;
  document.getElementById("runWeeklyPrint").onclick = () => {
    const type = document.querySelector('input[name="weeklyPrintType"]:checked')?.value || "general";
    const layout = type === "general" ? "general" : "separate";
    const sections = type === "general" ? "attendance,participation,homework,tasks" : type;
    const taskMode = document.getElementById("weeklyTaskPrintMode").value;
    window.open(`/api/teacher/weekly-follow-up/print?classId=${weeklyFollowUpClassId}&week=${data.week}&sections=${encodeURIComponent(sections)}&layout=${layout}&taskMode=${encodeURIComponent(taskMode)}`, "_blank");
    weeklyCloseModal();
  };
}

function openWeeklyImport(data) {
  weeklyOpenModal(`<h3>استيراد سجل المتابعة</h3><p class="weekly-modal-note">استخدمي ملف Excel الذي تم تصديره من مدار، عدّلي البيانات ثم أعيدي رفعه.</p><label class="field">ملف XLSX أو CSV<input type="file" id="weeklyImportFile" accept=".xlsx,.csv,.txt"></label><div id="weeklyImportResult"></div><div class="modal-actions"><button class="btn btn-outline" id="cancelWeeklyImport">إلغاء</button><button class="btn btn-primary" id="runWeeklyImport">استيراد الملف</button></div>`);
  document.getElementById("cancelWeeklyImport").onclick = weeklyCloseModal;
  document.getElementById("runWeeklyImport").onclick = async () => {
    const file = document.getElementById("weeklyImportFile").files?.[0]; if (!file) return weeklyToast("اختاري ملفًا أولًا.");
    const form = new FormData(); form.append("file", file); form.append("classId", weeklyFollowUpClassId); form.append("week", data.week);
    try { const result = await weeklyApi("/weekly-follow-up/import", { method: "POST", body: form }); document.getElementById("weeklyImportResult").innerHTML = `<div class="form-success">تم استيراد ${result.imported} سجل.${result.errors.length ? `<br>${result.errors.slice(0, 5).map(weeklyEscape).join("<br>")}` : ""}</div>`; weeklyToast("تم استيراد سجل المتابعة."); await renderWeeklyFollowUp(); } catch (error) { document.getElementById("weeklyImportResult").innerHTML = `<div class="form-error">${weeklyEscape(error.message)}</div>`; }
  };
}


function weeklyEnhanceTrackingView() {
  const categories = document.querySelector(".follow-up-categories.follow-up-action-buttons");
  if (!categories) return;
  const buttons = [...categories.querySelectorAll(":scope > button")];
  if (buttons.length < 4) return;
  const sections = ["attendance", "participation", "homework", "tasks"];
  buttons.forEach((button, index) => {
    const section = sections[index];
    button.dataset.weeklySection = section;
    button.classList.toggle("active", weeklyFollowUpSection === section);
    button.onclick = () => {
      weeklyFollowUpSection = section;
      saveWeeklyState();
      buttons.forEach((item) => item.classList.toggle("active", item.dataset.weeklySection === section));
      renderWeeklyFollowUp();
    };
  });
  let target = document.getElementById("weeklyFollowUpContent");
  if (!target) {
    target = document.createElement("div");
    target.id = "weeklyFollowUpContent";
    target.innerHTML = '<div class="empty-state">جارٍ تحميل سجل المتابعة الأسبوعي...</div>';
    categories.insertAdjacentElement("afterend", target);
    renderWeeklyFollowUp();
  }
  weeklyApplySearch();
}
const weeklyObserver = new MutationObserver(() => weeklyEnhanceTrackingView());
weeklyObserver.observe(document.getElementById("content"), { childList: true, subtree: true });
window.addEventListener("hashchange", () => setTimeout(weeklyEnhanceTrackingView, 50));
setTimeout(weeklyEnhanceTrackingView, 100);
