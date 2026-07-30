// إضافة مستقلة للمتابعة الأسبوعية. لا تعدّل كود سجل الاختبارات القديم.
let weeklyFollowUpSection = "attendance";
let weeklyFollowUpWeek = 1;
let weeklyFollowUpClassId = 0;
let weeklyFollowUpDayIndex = 0;
let weeklyFollowUpData = null;
let weeklyFollowUpInitialized = false;
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

async function renderWeeklyFollowUp() {
  const target = document.getElementById("weeklyFollowUpContent");
  if (!target) return;
  const classQuery = weeklyFollowUpClassId ? `&classId=${weeklyFollowUpClassId}` : "";
  try {
    const data = await weeklyApi(`/weekly-follow-up?week=${weeklyFollowUpWeek}${classQuery}`);
    weeklyFollowUpData = data;
    if (!weeklyFollowUpInitialized && data.settings?.academic_start_date) {
      weeklyFollowUpInitialized = true;
      const currentWeek = weeklyCurrentWeek(data.settings);
      weeklyFollowUpDayIndex = Math.min(4, Math.max(0, new Date().getDay()));
      if (currentWeek !== weeklyFollowUpWeek) {
        weeklyFollowUpWeek = currentWeek;
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
    weeklyFollowUpClassId = Number(data.class?.id || data.classes[0].id);
    weeklyFollowUpWeek = Number(data.week || 1);
    const selectedClass = data.classes.find((item) => Number(item.id) === weeklyFollowUpClassId) || data.classes[0];
    const stages = [...new Set(data.classes.map((item) => item.level))];
    const grades = [...new Set(data.classes.filter((item) => item.level === selectedClass.level).map((item) => item.grade_label))];
    const matchingClasses = data.classes.filter((item) => item.level === selectedClass.level && item.grade_label === selectedClass.grade_label);
    if (weeklyFollowUpDayIndex > 4) weeklyFollowUpDayIndex = 0;
    const sectionStateKey = weeklyFollowUpSection === "attendance" ? "attendanceState" : weeklyFollowUpSection === "participation" ? "participationState" : weeklyFollowUpSection === "homework" ? "homeworkState" : "tasksState";
    target.innerHTML = `
      <section class="weekly-followup-shell">
        <div class="weekly-navigation">
          <div class="weekly-selectors">
            <label>المرحلة<select id="weeklyStageSelect">${stages.map((stage) => `<option value="${weeklyEscape(stage)}" ${stage === selectedClass.level ? "selected" : ""}>${weeklyEscape(stage)}</option>`).join("")}</select></label>
            <label>الصف<select id="weeklyGradeSelect">${grades.map((grade) => `<option value="${weeklyEscape(grade)}" ${grade === selectedClass.grade_label ? "selected" : ""}>${weeklyEscape(grade)}</option>`).join("")}</select></label>
            <label>الفصل<select id="weeklyClassSelect">${matchingClasses.map((item) => `<option value="${item.id}" ${Number(item.id) === weeklyFollowUpClassId ? "selected" : ""}>${weeklyEscape(item.name)}</option>`).join("")}</select></label>
          </div>
          <div class="weekly-week-controls">
            <button class="btn btn-outline btn-sm" id="weeklyPrev">الأسبوع السابق</button>
            <strong>الأسبوع ${weeklyFollowUpWeek}</strong>
            <button class="btn btn-outline btn-sm" id="weeklyNext">الأسبوع التالي</button>
            <button class="btn btn-secondary btn-sm" id="weeklyCurrent">الأسبوع الحالي</button>
            <button class="btn btn-outline btn-sm" id="weeklyToday">اليوم الحالي</button>
          </div>
          <div class="weekly-file-actions">
            <button class="btn btn-outline btn-sm" id="weeklyDateSettings">إعداد التواريخ</button>
            <button class="btn btn-outline btn-sm" id="weeklyImport">استيراد</button>
            <button class="btn btn-outline btn-sm" id="weeklyExport">تصدير Excel</button>
            <button class="btn btn-primary btn-sm" id="weeklyPrint">طباعة PDF</button>
          </div>
        </div>
        <div class="weekly-status-legend"><span class="green"></span> مكتمل <span class="yellow"></span> يحتاج مراجعة <span class="red"></span> لم يسجل بعد</div>
        <div class="weekly-days">${data.days.map((day) => `<button type="button" class="weekly-day ${weeklyFollowUpDayIndex === day.index ? "active" : ""}" data-weekly-day="${day.index}">${weeklyDateLabel(day)}${weeklyStateBadge(day[sectionStateKey] || "empty")}</button>`).join("")}</div>
        <div id="weeklySectionBody">${renderWeeklySectionBody(data)}</div>
      </section>`;
    bindWeeklyNavigation(data);
    bindWeeklySection(data);
  } catch (error) {
    target.innerHTML = `<div class="empty-state">${weeklyEscape(error.message)}</div>`;
  }
}

function bindWeeklyNavigation(data) {
  document.getElementById("weeklyStageSelect").onchange = (event) => {
    const next = data.classes.find((item) => item.level === event.target.value);
    if (next) { weeklyFollowUpClassId = Number(next.id); renderWeeklyFollowUp(); }
  };
  document.getElementById("weeklyGradeSelect").onchange = (event) => {
    const stage = document.getElementById("weeklyStageSelect").value;
    const next = data.classes.find((item) => item.level === stage && item.grade_label === event.target.value);
    if (next) { weeklyFollowUpClassId = Number(next.id); renderWeeklyFollowUp(); }
  };
  document.getElementById("weeklyClassSelect").onchange = (event) => { weeklyFollowUpClassId = Number(event.target.value); renderWeeklyFollowUp(); };
  document.getElementById("weeklyPrev").onclick = () => { weeklyFollowUpWeek = Math.max(1, weeklyFollowUpWeek - 1); renderWeeklyFollowUp(); };
  document.getElementById("weeklyNext").onclick = () => { weeklyFollowUpWeek = Math.min(60, weeklyFollowUpWeek + 1); renderWeeklyFollowUp(); };
  document.getElementById("weeklyCurrent").onclick = () => { weeklyFollowUpWeek = weeklyCurrentWeek(data.settings); renderWeeklyFollowUp(); };
  document.getElementById("weeklyToday").onclick = () => {
    const index = data.days.findIndex((day) => day.date === weeklyTodayString());
    if (index >= 0) { weeklyFollowUpDayIndex = index; renderWeeklyFollowUp(); }
    else { weeklyFollowUpWeek = weeklyCurrentWeek(data.settings); weeklyFollowUpDayIndex = Math.min(4, Math.max(0, new Date().getDay())); renderWeeklyFollowUp(); }
  };
  document.querySelectorAll("[data-weekly-day]").forEach((button) => button.onclick = () => { weeklyFollowUpDayIndex = Number(button.dataset.weeklyDay); renderWeeklyFollowUp(); });
  document.getElementById("weeklyDateSettings").onclick = () => openWeeklyDateSettings(data);
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
  return `<div class="weekly-section-head"><div><span>تحضير سريع</span><h3>${day.name} · ${weeklyEscape(day.date)}</h3><p>اختاري «الجميع حاضر» ثم غيّري فقط الطالبات الغائبات أو المتأخرات.</p></div><div class="weekly-quick-actions"><button class="btn btn-secondary btn-sm" data-attendance-all="present">الجميع حاضر</button><button class="btn btn-outline btn-sm" data-attendance-all="absent">الجميع غائب</button><button class="btn btn-outline btn-sm" data-attendance-all="">تفريغ اليوم</button></div></div><div class="table-wrap"><table class="weekly-record-table"><thead><tr><th>اسم الطالبة</th><th>البريد</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table></div><div class="weekly-save-bar"><button class="btn btn-primary" id="saveWeeklyAttendance">حفظ تحضير اليوم</button></div>`;
}

function renderWeeklyParticipation(data) {
  const day = data.days[weeklyFollowUpDayIndex];
  if (!day?.date) return weeklyMissingDateMessage();
  const existingMax = data.students.map((student) => data.participation[String(student.id)]?.[day.date]?.maxScore).find((value) => value) || 1;
  const rows = data.students.map((student) => {
    const record = data.participation[String(student.id)]?.[day.date] || {};
    return `<tr><td>${weeklyEscape(student.name)}</td><td><input class="weekly-score-input" type="number" min="0" step="0.5" data-participation-score="${student.id}" value="${record.score ?? ""}"></td><td><select data-participation-status="${student.id}"><option value="" ${!record.status ? "selected" : ""}>لم يسجل</option><option value="completed" ${record.status === "completed" ? "selected" : ""}>مكتمل</option><option value="needs_review" ${record.status === "needs_review" ? "selected" : ""}>يحتاج مراجعة</option></select></td><td><input class="weekly-note-input" data-participation-note="${student.id}" value="${weeklyEscape(record.note || "")}" placeholder="ملاحظة اختيارية"></td></tr>`;
  }).join("");
  return `<div class="weekly-section-head"><div><span>مشاركة يومية</span><h3>${day.name} · ${weeklyEscape(day.date)}</h3><p>يمكن تسجيل الدرجة للجميع بضغطة واحدة ثم تعديل الحالات الاستثنائية.</p></div><label class="weekly-max-field">الدرجة الكاملة<input id="participationMaxScore" type="number" min="0.5" step="0.5" value="${existingMax}"></label><div class="weekly-quick-actions"><button class="btn btn-secondary btn-sm" id="participationAllFull">الجميع كامل</button><button class="btn btn-outline btn-sm" id="participationAllReview">الجميع يحتاج مراجعة</button><button class="btn btn-outline btn-sm" id="participationClear">تفريغ اليوم</button></div></div><div class="table-wrap"><table class="weekly-record-table"><thead><tr><th>اسم الطالبة</th><th>الدرجة</th><th>حالة التسجيل</th><th>ملاحظة</th></tr></thead><tbody>${rows}</tbody></table></div><div class="weekly-save-bar"><button class="btn btn-primary" id="saveWeeklyParticipation">حفظ المشاركة</button></div>`;
}

function weeklyMissingDateMessage() {
  return '<div class="weekly-missing-date"><strong>لم يحدد تاريخ هذا اليوم.</strong><p>استخدمي «إعداد التواريخ» لإدخال بداية العام تلقائيًا أو كتابة تواريخ الأسبوع يدويًا.</p><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'weeklyDateSettings\').click()">إعداد التواريخ</button></div>';
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
  return `<div class="weekly-section-head"><div><span>متابعة ${title}</span><h3>${title} · الأسبوع ${data.week}</h3><p>${section === "homework" ? "يدعم واجبات المنصة وواجبات المدرسة، مع حساب الدرجة الكاملة والمجموع تلقائيًا." : "أضيفي أعمدة المهام حسب الحاجة وحددي تاريخ ودرجة كل مهمة."}</p></div><div class="weekly-quick-actions">${section === "homework" ? '<button class="btn btn-secondary btn-sm" id="createHomeworkPlan">إنشاء خطة ٤ واجبات</button>' : ""}<button class="btn btn-outline btn-sm" id="addWeeklyItem">${section === "tasks" ? "إضافة مهمة" : "إضافة واجب"}</button></div></div>${items.length ? `<div class="weekly-item-tools"><label>البند السريع<select id="weeklyActiveItem">${items.map((item) => `<option value="${item.id}">${weeklyEscape(item.title)}</option>`).join("")}</select></label><button class="btn btn-outline btn-sm" id="itemAllFull">الجميع كامل</button><button class="btn btn-outline btn-sm" id="itemAllMissing">الجميع لم تسلم</button><span>مجموع الدرجات الكاملة: <strong>${weeklyCleanScore(totalMax)}</strong></span></div><div class="table-wrap"><table class="weekly-record-table weekly-items-table"><thead><tr><th>اسم الطالبة</th>${headers}<th>المجموع</th></tr></thead><tbody>${rows}</tbody></table></div><div class="weekly-save-bar"><button class="btn btn-primary" id="saveWeeklyItems">حفظ ${title}</button></div>` : `<div class="empty-state">لا توجد ${title} في هذا الأسبوع. استخدمي زر الإضافة لبدء التسجيل.</div>`}`;
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

function openWeeklyDateSettings(data) {
  weeklyOpenModal(`<h3>إعداد تواريخ الأسابيع</h3><p class="weekly-modal-note">يمكن توليد التواريخ تلقائيًا من بداية العام، أو إدخال تواريخ هذا الأسبوع يدويًا.</p><div class="form-grid"><label class="field">طريقة التاريخ<select id="weeklyDateMode"><option value="auto" ${data.settings.date_mode === "auto" ? "selected" : ""}>تلقائي من بداية العام</option><option value="manual" ${data.settings.date_mode === "manual" ? "selected" : ""}>إدخال يدوي</option></select></label><label class="field">تاريخ بداية العام<input type="date" id="weeklyAcademicStart" value="${weeklyEscape(data.settings.academic_start_date || "")}"></label></div><h4>تواريخ الأسبوع ${data.week}</h4><div class="weekly-date-grid">${data.days.map((day) => `<label>${day.name}<input type="date" data-manual-weekly-date="${day.index}" value="${weeklyEscape(day.date || "")}"></label>`).join("")}</div><div class="modal-actions"><button class="btn btn-outline" id="cancelWeeklyDates">إلغاء</button><button class="btn btn-primary" id="saveWeeklyDates">حفظ التواريخ</button></div>`);
  document.getElementById("cancelWeeklyDates").onclick = weeklyCloseModal;
  document.getElementById("saveWeeklyDates").onclick = async () => {
    const dates = [...document.querySelectorAll("[data-manual-weekly-date]")].map((input) => input.value);
    try { await weeklyApi("/weekly-follow-up/settings", { method: "PUT", body: JSON.stringify({ dateMode: document.getElementById("weeklyDateMode").value, academicStartDate: document.getElementById("weeklyAcademicStart").value, week: data.week, dates }) }); weeklyCloseModal(); weeklyToast("تم حفظ تواريخ المتابعة."); await renderWeeklyFollowUp(); } catch (error) { weeklyToast(error.message); }
  };
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
  weeklyOpenModal(`<h3>إعدادات طباعة المتابعة</h3><div class="weekly-print-options">${Object.entries(WEEKLY_SECTION_LABELS).map(([key, label]) => `<label><input type="checkbox" data-print-section="${key}" checked> ${label}</label>`).join("")}</div><label class="field">شكل الطباعة<select id="weeklyPrintLayout"><option value="separate">كل سجل في جدول منفصل</option><option value="combined">جمع الواجبات والمشاركة والمهام في جدول واحد</option></select></label><div class="modal-actions"><button class="btn btn-outline" id="cancelWeeklyPrint">إلغاء</button><button class="btn btn-primary" id="runWeeklyPrint">معاينة وطباعة PDF</button></div>`);
  document.getElementById("cancelWeeklyPrint").onclick = weeklyCloseModal;
  document.getElementById("runWeeklyPrint").onclick = () => { const sections = [...document.querySelectorAll("[data-print-section]:checked")].map((input) => input.dataset.printSection).join(","); const layout = document.getElementById("weeklyPrintLayout").value; window.open(`/api/teacher/weekly-follow-up/print?classId=${weeklyFollowUpClassId}&week=${data.week}&sections=${encodeURIComponent(sections)}&layout=${layout}`, "_blank"); weeklyCloseModal(); };
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
  const sections = ["attendance", "homework", "participation", "tasks"];
  buttons.forEach((button, index) => {
    const section = sections[index];
    button.dataset.weeklySection = section;
    button.classList.toggle("active", weeklyFollowUpSection === section);
    button.onclick = () => {
      weeklyFollowUpSection = section;
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
}
const weeklyObserver = new MutationObserver(() => weeklyEnhanceTrackingView());
weeklyObserver.observe(document.getElementById("content"), { childList: true, subtree: true });
window.addEventListener("hashchange", () => setTimeout(weeklyEnhanceTrackingView, 50));
setTimeout(weeklyEnhanceTrackingView, 100);
