// لوحة تحكم المعلمة - منطق العرض والتنقل بين الأقسام (SPA بسيطة بدون مكتبات خارجية)

const contentEl = document.getElementById("content");
const pageTitleEl = document.getElementById("pageTitle");
const modalRoot = document.getElementById("modalRoot");
const toastRoot = document.getElementById("toastRoot");

const ROUTE_TITLES = {
  home: "الرئيسية",
  profile: "الأداء الوظيفي",
  "student-panel": "قائمة الطالبات",
  "student-files": "ملفات الطالبات",
  "follow-up": "سجل متابعة",
  motivation: "نقاط تحفيزية",
  "tests-panel": "الاختبارات",
  "tests-pre": "الاختبار التشخيصي القبلي",
  "tests-post": "الاختبار التشخيصي البعدي",
  "tests-quiz": "الاختبارات القصيرة",
  "question-bank": "بنك الأسئلة الذكي",
  "analysis-panel": "تحليل النتائج",
  "analysis-student": "تحليل لكل طالبة",
  "analysis-class": "تحليل الفصل العام",
  "analysis-skill": "تحليل كل مهارة",
  "analysis-learning": "أنماط التعلم",
  "games-panel": "الألعاب",
  "interactive-games": "الألعاب التفاعلية",
  competitions: "المسابقات",
  "strategies-panel": "الاستراتيجيات",
  "flipped-classroom": "الصف المقلوب",
  "library-panel": "الموارد المكتبية",
  videos: "الفيديوهات",
  training: "التدريبات",
  "knowledge-exchange": "تبادل المعرفة",
  reports: "التقارير",
  notifications: "الإشعارات",
  classes: "الفصول والمجموعات",
  activity: "سجل الأنشطة",
  settings: "الإعدادات",
};

let currentTeacher = null;
let allClasses = [];
let allSkills = [];
let csrfToken = "";

// ---------- Helpers ----------
async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const method = (options.method || "GET").toUpperCase();
  const res = await fetch(`/api/teacher${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(method !== "GET" && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    window.location.href = "login.html";
    throw new Error("unauthorized");
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || "حدث خطأ غير متوقع.");
  if (data?.csrfToken) csrfToken = data.csrfToken;
  return data;
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  toastRoot.innerHTML = "";
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(html, className = "") {
  modalRoot.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-box ${escapeHtml(className)}" role="dialog" aria-modal="true">${html}</div></div>`;
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}
function closeModal() {
  modalRoot.innerHTML = "";
}

function confirmAction(message, onConfirm) {
  openModal(`
    <div class="confirm-box">
      <div class="ic">⚠️</div>
      <p>${escapeHtml(message)}</p>
      <div class="modal-actions" style="justify-content:center">
        <button class="btn btn-outline" id="cancelConfirm">إلغاء</button>
        <button class="btn btn-danger" id="okConfirm">تأكيد</button>
      </div>
    </div>
  `);
  document.getElementById("cancelConfirm").onclick = closeModal;
  document.getElementById("okConfirm").onclick = async () => {
    closeModal();
    try { await onConfirm(); } catch (error) { toast(error.message); }
  };
}

function formatDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
}

function progressColorBadge(p) {
  if (p >= 70) return "badge-green";
  if (p >= 45) return "badge-orange";
  return "badge-red";
}

// ---------- Bootstrapping ----------
async function boot() {
  try {
    currentTeacher = await api("/me");
    csrfToken = currentTeacher.csrfToken || csrfToken;
  } catch {
    return;
  }
  document.getElementById("teacherNameLabel").textContent = currentTeacher.name;

  try {
    allClasses = await api("/students/classes");
  } catch {}
  try {
    allSkills = await api("/data/skills");
  } catch {}

  refreshNotifBell();

  document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });
  const logoutTeacher = async () => {
    await api("/logout", { method: "POST" });
    window.location.href = "login.html";
  };
  document.getElementById("logoutBtn").addEventListener("click", logoutTeacher);
  document.getElementById("headerLogoutBtn").addEventListener("click", logoutTeacher);
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
  document.getElementById("bellBtn").addEventListener("click", () => navigate("notifications"));

  window.addEventListener("hashchange", () => {
    const route = location.hash.replace("#", "");
    if (ROUTES[route]) navigate(route);
  });

  const initialRoute = location.hash.replace("#", "");
  navigate(ROUTES[initialRoute] ? initialRoute : "home");
}

async function refreshNotifBell() {
  try {
    const notifs = await api("/data/notifications");
    document.getElementById("bellDot").hidden = !notifs.some((n) => !n.is_read);
  } catch {}
}

function navigate(route) {
  document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === route);
  });
  document.getElementById("sidebar").classList.remove("open");
  if (location.hash.replace("#", "") !== route) location.hash = route;
  pageTitleEl.textContent = ROUTE_TITLES[route] || "";
  contentEl.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const renderer = ROUTES[route];
  if (renderer) renderer();
}

// ==========================================================================
// الرئيسية
// ==========================================================================
async function renderHome() {
  const data = await api("/dashboard/summary");
  const maxClassAvg = Math.max(1, ...data.classLevels.map((c) => c.avg_progress));
  contentEl.innerHTML = `
    <div class="stat-grid">
      ${statCard("🎓", data.studentCount, "عدد الطالبات")}
      ${statCard("📋", data.publishedTests, "الاختبارات المنشورة")}
      ${statCard("✅", data.completedResults, "الاختبارات المكتملة")}
      ${statCard("📈", data.averageProgress + "%", "متوسط الفصل")}
      ${statCard("🆘", data.needSupportCount, "بحاجة إلى دعم")}
    </div>
    <div class="grid-2">
      <div class="card">
        <h3 class="section-title">مستوى الفصول</h3>
        ${data.classLevels
          .map(
            (c) => `
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:6px">
              <span>${escapeHtml(c.name)} (${c.student_count} طالبة)</span>
              <strong>${c.avg_progress}%</strong>
            </div>
            <div class="progress-bar"><span style="width:${(c.avg_progress / maxClassAvg) * 100}%"></span></div>
          </div>`
          )
          .join("") || `<div class="empty-state">لا توجد بيانات فصول بعد.</div>`}

        <h3 class="section-title" style="margin-top:22px">اختصارات سريعة</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="quickTest">+ اختبار جديد</button>
          <button class="btn btn-secondary btn-sm" id="quickStudent">+ طالبة جديدة</button>
          <button class="btn btn-outline btn-sm" id="quickNote">+ ملاحظة</button>
        </div>
      </div>
      <div class="card">
        <h3 class="section-title">آخر الأنشطة</h3>
        ${
          data.recentActivity.length
            ? `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:12px">
              ${data.recentActivity
                .map(
                  (a) => `<li style="font-size:.85rem"><strong>${escapeHtml(a.action)}</strong><br><span style="color:var(--muted)">${escapeHtml(a.details || "")} · ${formatDate(a.created_at)}</span></li>`
                )
                .join("")}
            </ul>`
            : `<div class="empty-state">لا توجد أنشطة مسجّلة بعد.</div>`
        }
        <h3 class="section-title" style="margin-top:20px">تنبيهات</h3>
        ${
          data.notifications.length
            ? data.notifications
                .map((n) => `<div class="skill-pill"><span>${escapeHtml(n.title)}</span>${n.is_read ? "" : '<span class="badge badge-orange">جديد</span>'}</div>`)
                .join("")
            : `<div class="empty-state">لا توجد تنبيهات.</div>`
        }
      </div>
    </div>
  `;
  document.getElementById("quickTest").onclick = () => openTestsPanel("quiz");
  document.getElementById("quickStudent").onclick = () => openStudentPanel("manage");
  document.getElementById("quickNote").onclick = () => openStudentPanel("list");
}

function statCard(icon, value, label) {
  return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

// ==========================================================================
// الأداء الوظيفي
// ==========================================================================
const PERFORMANCE_AREAS = [
  "أداء الواجبات الوظيفية",
  "التفاعل مع المجتمع المهني",
  "التفاعل مع أولياء الأمور",
  "التنويع في استراتيجيات التدريس",
  "تحسين نتائج المتعلمين",
  "إعداد وتنفيذ خطة التعلم",
  "توظيف تقنيات ووسائل التعلم",
  "تهيئة بيئة تعليمية",
  "الإدارة الصفية الإيجابية",
  "تقويم تعلم المتعلمين",
];
let performancePanelMode = 0;

async function renderProfile() {
  contentEl.innerHTML = `
    <div class="student-panel-tabs performance-panel-tabs" role="tablist" aria-label="مجالات الأداء الوظيفي">
      ${PERFORMANCE_AREAS.map((area,index) => `<button class="tab-btn ${performancePanelMode === index ? "active" : ""}" type="button" data-performance-area="${index}" aria-selected="${performancePanelMode === index ? "true" : "false"}">${escapeHtml(area)}</button>`).join("")}
    </div>
    <div id="performanceAreaContent"></div>
  `;
  document.querySelectorAll("[data-performance-area]").forEach((button) => {
    button.onclick = () => {
      performancePanelMode = Number(button.dataset.performanceArea);
      renderProfile();
    };
  });
}

// ==========================================================================
// لوحة الطالبة: الأسماء والإدارة في صفحة واحدة
// ==========================================================================
let studentPanelMode = "list";
let studentsState = { search: "", classId: "", stage: "", page: 1 };

function openStudentPanel(mode = "list") {
  studentPanelMode = mode;
  navigate("student-panel");
}

async function renderStudentPanel() {
  contentEl.innerHTML = `
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام لوحة الطالبة">
      <button class="tab-btn ${studentPanelMode === "list" ? "active" : ""}" data-student-panel="list">أسماء الطالبات</button>
      <button class="tab-btn ${studentPanelMode === "manage" ? "active" : ""}" data-student-panel="manage">إدارة الطالبات</button>
    </div>
    <div id="studentPanelContent"></div>
  `;
  document.querySelectorAll("[data-student-panel]").forEach((button) => {
    button.onclick = () => {
      studentPanelMode = button.dataset.studentPanel;
      renderStudentPanel();
    };
  });
  const target = document.getElementById("studentPanelContent");
  if (studentPanelMode === "manage") await renderStudentsManage(target);
  else await renderStudentsList(target);
}

async function importStudentsFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const data = await api("/students/import", { method: "POST", body: formData });
  const updated = Number(data.updated || 0);
  toast(`تمت إضافة ${data.created} طالبة${updated ? ` وتحديث ${updated}` : ""}.`);
  if (data.errors?.length) {
    openModal(`
      <h3>اكتمل الاستيراد مع ملاحظات</h3>
      <p>تمت إضافة ${data.created} وتحديث ${updated} طالبة، وتعذرت معالجة ${data.errors.length} من الصفوف.</p>
      <ul class="import-errors">${data.errors.slice(0, 40).map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
      <div class="modal-actions"><button class="btn btn-primary" id="closeImportResult">حسنًا</button></div>
    `);
    document.getElementById("closeImportResult").onclick = closeModal;
  }
  return data;
}

function bindStudentImport(inputId, onImported) {
  document.getElementById(inputId).addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await importStudentsFile(file);
      await onImported();
    } catch (error) {
      toast(error.message || "تعذّر استيراد الملف.");
    } finally {
      event.target.value = "";
    }
  });
}

async function renderStudentsList(target = contentEl) {
  target.innerHTML = `
    <div id="studentAccountRequests"></div>
    <div class="card">
      <div class="toolbar">
        <input id="stSearch" placeholder="بحث بالاسم أو البريد..." value="${escapeHtml(studentsState.search)}" />
        <select id="stClass"><option value="">كل الفصول</option>${allClasses.map((c) => `<option value="${c.id}" ${String(c.id) === String(studentsState.classId) ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select>
        <select id="stStage"><option value="">كل المراحل</option>${["ابتدائي", "متوسط", "ثانوي"].map((stage) => `<option value="${stage}" ${studentsState.stage === stage ? "selected" : ""}>${stage}</option>`).join("")}</select>
        <div class="spacer"></div>
        <a class="btn btn-outline btn-sm" href="/api/teacher/reports/students.xlsx">تصدير Excel</a>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">استيراد Excel / مدرستي<input type="file" id="studentsImportInput" accept=".xlsx,.csv,.txt" hidden /></label>
      </div>
      <p class="import-help">يقبل ملفات Excel بصيغة XLSX وملفات CSV العربية، ويتعرّف تلقائيًا على أعمدة الاسم والبريد والمرحلة والفصل حتى لو بدأ الجدول بعد عدة أسطر.</p>
      <div id="studentsTableWrap"></div>
    </div>
  `;
  document.getElementById("stSearch").addEventListener("input", (e) => { studentsState.search = e.target.value; studentsState.page = 1; loadStudentsTable(); });
  document.getElementById("stClass").addEventListener("change", (e) => { studentsState.classId = e.target.value; studentsState.page = 1; loadStudentsTable(); });
  document.getElementById("stStage").addEventListener("change", (e) => { studentsState.stage = e.target.value; studentsState.page = 1; loadStudentsTable(); });
  bindStudentImport("studentsImportInput", loadStudentsTable);
  await Promise.all([loadStudentAccountRequests(), loadStudentsTable()]);
}

async function loadStudentAccountRequests() {
  const wrap = document.getElementById("studentAccountRequests");
  if (!wrap) return;
  const data = await api("/students/requests");
  const requests = data.items || [];
  wrap.innerHTML = `
    <section class="card student-account-requests" aria-labelledby="studentRequestsTitle">
      <div class="student-request-heading">
        <div><span class="student-request-icon" aria-hidden="true">👩‍🎓</span><div><h3 id="studentRequestsTitle">طلبات إنشاء حساب الطالبات</h3><p>وافقي على الطلب لتستطيع الطالبة تسجيل الدخول، أو ارفضي الطلب غير الصحيح.</p></div></div>
        <span class="badge ${requests.length ? "badge-orange" : "badge-green"}">${requests.length} بانتظار المراجعة</span>
      </div>
      ${requests.length ? `<div class="table-wrap"><table><thead><tr><th>اسم الطالبة</th><th>البريد الإلكتروني</th><th>المرحلة</th><th>الفصل</th><th>تاريخ الطلب</th><th>الإجراء</th></tr></thead><tbody>${requests.map((request) => `<tr><td><strong>${escapeHtml(request.name)}</strong></td><td>${escapeHtml(request.email)}</td><td>${escapeHtml(`${request.stage} · ${request.gradeLabel}`)}</td><td>${escapeHtml(request.className)}</td><td>${formatDate(request.createdAt)}</td><td><div class="student-request-actions"><button class="btn btn-primary btn-sm" type="button" data-approve-student-request="${request.id}">موافقة</button><button class="btn btn-danger btn-sm" type="button" data-reject-student-request="${request.id}">رفض</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="student-request-empty">لا توجد طلبات حساب جديدة الآن.</div>'}
    </section>
  `;
  const reviewRequest = (id, action, name) => {
    const approval = action === "approve";
    confirmAction(approval ? `هل تريدين الموافقة على حساب الطالبة ${name}؟` : `هل تريدين رفض طلب حساب الطالبة ${name}؟`, async () => {
      const result = await api(`/students/requests/${id}`, { method: "PUT", body: JSON.stringify({ action }) });
      toast(result.message);
      await Promise.all([loadStudentAccountRequests(), loadStudentsTable()]);
    });
  };
  requests.forEach((request) => {
    wrap.querySelector(`[data-approve-student-request="${request.id}"]`).onclick = () => reviewRequest(request.id, "approve", request.name);
    wrap.querySelector(`[data-reject-student-request="${request.id}"]`).onclick = () => reviewRequest(request.id, "reject", request.name);
  });
}

async function loadStudentsTable() {
  const wrap = document.getElementById("studentsTableWrap");
  const qs = new URLSearchParams({
    search: studentsState.search,
    classId: studentsState.classId,
    level: studentsState.stage,
    page: studentsState.page,
    pageSize: 8,
  });
  const data = await api(`/students?${qs}`);
  if (!data.items.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="ic">🔍</div>لا توجد نتائج مطابقة.</div>`;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  wrap.innerHTML = `<div class="table-wrap">
    <table>
      <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>المرحلة</th><th>الفصل</th><th>آخر نشاط</th></tr></thead>
      <tbody>
        ${data.items
          .map(
            (s) => `<tr>
              <td><a href="#" class="student-link" data-id="${s.id}" style="color:var(--purple-700);font-weight:700">${escapeHtml(s.name)}</a></td>
              <td>${escapeHtml(s.email)}</td>
              <td>${escapeHtml(s.stage || s.level || "—")}</td>
              <td>${escapeHtml(s.class_name || "—")}</td>
              <td>${s.last_active ? formatDate(s.last_active) : "—"}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table></div>
    <div class="pagination">
      ${Array.from({ length: totalPages }, (_, i) => i + 1)
        .map((p) => `<button data-page="${p}" class="${p === studentsState.page ? "active" : ""}">${p}</button>`)
        .join("")}
    </div>
  `;
  wrap.querySelectorAll(".student-link").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openStudentProfile(a.dataset.id);
    })
  );
  wrap.querySelectorAll(".pagination button").forEach((btn) =>
    btn.addEventListener("click", () => {
      studentsState.page = Number(btn.dataset.page);
      loadStudentsTable();
    })
  );
}

async function openStudentProfile(id) {
  const data = await api(`/students/${id}/profile`);
  const { student, results, skills, notes, attendance, assignments } = data;
  const learningLabels = { visual: "بصري", auditory: "سمعي", reading_writing: "قرائي/كتابي", kinesthetic: "حركي/تطبيقي", mixed: "مختلط", unknown: "غير محدد" };
  openModal(`
    <h3>ملف المتابعة: ${escapeHtml(student.name)}</h3>
    <p style="color:var(--muted);font-size:.85rem;margin-top:-8px">${escapeHtml(student.email)} · ${escapeHtml(student.class_name || "—")} · ${escapeHtml(student.level)}</p>

    <h4 style="margin:16px 0 8px;font-size:.9rem">نسبة التقدم العامة</h4>
    <div class="progress-bar" style="margin-bottom:6px"><span style="width:${student.progress_percent}%"></span></div>
    <p style="font-size:.8rem;color:var(--muted)">${student.progress_percent}%</p>

    <h4 style="margin:16px 0 8px;font-size:.9rem">نمط التعلّم الإرشادي</h4>
    <div class="skill-pill"><span>${learningLabels[student.learning_style] || "غير محدد"}</span><select id="profileLearningStyle">
      ${Object.entries(learningLabels).map(([value, label]) => `<option value="${value}" ${student.learning_style === value ? "selected" : ""}>${label}</option>`).join("")}
    </select><button class="btn btn-outline btn-sm" id="saveLearningStyle">حفظ</button></div>
    <p style="font-size:.75rem;color:var(--muted)">النتيجة إرشادية مرنة وليست تشخيصًا ثابتًا.</p>

    <h4 style="margin:16px 0 8px;font-size:.9rem">الدرجات</h4>
    ${
      results.length
        ? results.map((r) => `<div class="skill-pill"><span>${escapeHtml(r.title)}</span><span>${r.status === "completed" ? `${r.score}/${r.total_points}` : "لم تُنجز"}</span></div>`).join("")
        : `<p style="font-size:.82rem;color:var(--muted)">لا توجد نتائج اختبارات بعد.</p>`
    }

    <h4 style="margin:16px 0 8px;font-size:.9rem">مستوى المهارات</h4>
    ${
      skills.length
        ? skills.map((s) => `<div class="skill-pill"><span>${escapeHtml(s.name)}</span><span class="badge ${progressColorBadge(s.mastery_percent)}">${s.mastery_percent}%</span></div>`).join("")
        : `<p style="font-size:.82rem;color:var(--muted)">لا توجد بيانات مهارات بعد.</p>`
    }

    <h4 style="margin:16px 0 8px;font-size:.9rem">الحضور (آخر 30 يوم)</h4>
    <p style="font-size:.82rem">حاضرة: ${attendance.filter((a) => a.status === "present").length} · غائبة: ${attendance.filter((a) => a.status === "absent").length} · متأخرة: ${attendance.filter((a) => a.status === "late").length}</p>
    <div class="form-grid"><div class="field">التاريخ<input type="date" id="attendanceDate" value="${new Date().toISOString().slice(0, 10)}"></div><div class="field">الحالة<select id="attendanceStatus"><option value="present">حاضرة</option><option value="absent">غائبة</option><option value="late">متأخرة</option><option value="excused">غياب بعذر</option></select></div></div>
    <button class="btn btn-outline btn-sm" id="saveAttendance" style="margin-top:8px">حفظ الحضور</button>

    <h4 style="margin:16px 0 8px;font-size:.9rem">الواجبات</h4>
    ${
      assignments.length
        ? assignments.map((a) => `<div class="skill-pill"><span>${escapeHtml(a.title)}${a.due_date ? ` · ${escapeHtml(a.due_date)}` : ""}</span><select data-assignment-status="${a.id}"><option value="pending" ${a.status === "pending" ? "selected" : ""}>قيد الانتظار</option><option value="completed" ${a.status === "completed" ? "selected" : ""}>مكتمل</option><option value="late" ${a.status === "late" ? "selected" : ""}>متأخر</option></select><button class="btn btn-danger btn-sm" data-delete-assignment="${a.id}">حذف</button></div>`).join("")
        : `<p style="font-size:.82rem;color:var(--muted)">لا توجد واجبات مسجّلة.</p>`
    }
    <div class="form-grid"><div class="field">واجب جديد<input id="assignmentTitle" placeholder="عنوان الواجب"></div><div class="field">موعد التسليم<input type="date" id="assignmentDueDate"></div></div>
    <button class="btn btn-outline btn-sm" id="addAssignment" style="margin-top:8px">إضافة واجب</button>

    <h4 style="margin:16px 0 8px;font-size:.9rem">الملاحظات</h4>
    <div id="notesList">
      ${
        notes.length
          ? notes.map((n) => `<div class="skill-pill" style="display:block"><div>${escapeHtml(n.content)}</div><div style="color:var(--muted);font-size:.75rem;margin-top:4px">${formatDate(n.created_at)}</div></div>`).join("")
          : `<p style="font-size:.82rem;color:var(--muted)">لا توجد ملاحظات بعد.</p>`
      }
    </div>
    <div class="field" style="margin-top:12px">
      <textarea id="newNoteText" placeholder="أضيفي ملاحظة جديدة..."></textarea>
    </div>
    <div class="modal-actions">
      <a class="btn btn-outline btn-sm" href="/api/teacher/reports/student/${student.id}.pdf" target="_blank">تصدير PDF</a>
      <button class="btn btn-outline" id="closeProfileModal">إغلاق</button>
      <button class="btn btn-primary" id="addNoteBtn">إضافة ملاحظة</button>
    </div>
  `);
  document.getElementById("closeProfileModal").onclick = closeModal;
  document.getElementById("saveLearningStyle").onclick = async () => {
    await api(`/students/${id}/learning-style`, { method: "PUT", body: JSON.stringify({ style: document.getElementById("profileLearningStyle").value }) });
    toast("تم تحديث نمط التعلّم.");
  };
  document.getElementById("saveAttendance").onclick = async () => {
    await api(`/students/${id}/attendance`, { method: "PUT", body: JSON.stringify({ date: document.getElementById("attendanceDate").value, status: document.getElementById("attendanceStatus").value }) });
    toast("تم حفظ الحضور.");
    openStudentProfile(id);
  };
  document.getElementById("addAssignment").onclick = async () => {
    const title=document.getElementById("assignmentTitle").value.trim();
    if (!title) return toast("اكتبي عنوان الواجب.");
    await api(`/students/${id}/assignments`, { method: "POST", body: JSON.stringify({ title, dueDate: document.getElementById("assignmentDueDate").value || null }) });
    toast("تمت إضافة الواجب.");
    openStudentProfile(id);
  };
  document.querySelectorAll("[data-assignment-status]").forEach((select) => select.onchange = async () => {
    await api(`/students/${id}/assignments/${select.dataset.assignmentStatus}`, { method: "PUT", body: JSON.stringify({ status: select.value }) });
    toast("تم تحديث حالة الواجب.");
  });
  document.querySelectorAll("[data-delete-assignment]").forEach((button) => button.onclick = async () => {
    await api(`/students/${id}/assignments/${button.dataset.deleteAssignment}`, { method: "DELETE" });
    toast("تم حذف الواجب.");
    openStudentProfile(id);
  });
  document.getElementById("addNoteBtn").onclick = async () => {
    const text = document.getElementById("newNoteText").value.trim();
    if (!text) return;
    try {
      await api(`/students/${id}/notes`, { method: "POST", body: JSON.stringify({ content: text }) });
      toast("تمت إضافة الملاحظة.");
      openStudentProfile(id);
    } catch (err) {
      toast(err.message);
    }
  };
}

// ==========================================================================
// إدارة الطالبات
// ==========================================================================
async function renderStudentsManage(target = contentEl) {
  target.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <button class="btn btn-primary btn-sm" id="addStudentBtn">+ إضافة طالبة</button>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">
          استيراد Excel / مدرستي<input type="file" id="manageImportInput" accept=".xlsx,.csv,.txt" hidden />
        </label>
        <a class="btn btn-outline btn-sm" href="/api/teacher/reports/students.xlsx">تصدير Excel</a>
      </div>
      <p class="import-help">الأعمدة المطلوبة: اسم الطالبة، البريد الإلكتروني، والفصل. تُقرأ عناوين Excel العربية وعناوين ملفات مدرستي الشائعة تلقائيًا، وكلمة المرور المؤقتة اختيارية.</p>
      <div id="manageTableWrap"></div>
    </div>
  `;
  document.getElementById("addStudentBtn").onclick = () => openStudentForm();
  bindStudentImport("manageImportInput", loadManageTable);
  await loadManageTable();
}

async function loadManageTable() {
  const wrap = document.getElementById("manageTableWrap");
  const data = await api("/students?pageSize=100");
  if (!data.items.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="ic">🎓</div>لا توجد طالبات مسجّلات حتى الآن. أضيفي أول طالبة.</div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap">
    <table>
      <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>المرحلة</th><th>الفصل</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${data.items
          .map(
            (s) => `<tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.email)}</td>
              <td>${escapeHtml(s.stage || s.level || "—")}</td>
              <td>${escapeHtml(s.class_name || "—")}</td>
              <td>
                <button class="btn btn-outline btn-sm" data-edit="${s.id}">تعديل</button>
                <button class="btn btn-secondary btn-sm" data-reset-student="${s.id}" data-name="${escapeHtml(s.name)}">كلمة مرور</button>
                <button class="btn btn-danger btn-sm" data-del="${s.id}" data-name="${escapeHtml(s.name)}">حذف</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table></div>
  `;
  wrap.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const s = data.items.find((x) => x.id == btn.dataset.edit);
      openStudentForm(s);
    })
  );
  wrap.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => {
      confirmAction(`هل تأكيد حذف الطالبة "${btn.dataset.name}"؟ لا يمكن التراجع عن هذا الإجراء.`, async () => {
        await api(`/students/${btn.dataset.del}`, { method: "DELETE" });
        toast("تم حذف الطالبة.");
        loadManageTable();
      });
    })
  );
  wrap.querySelectorAll("[data-reset-student]").forEach((btn) =>
    btn.addEventListener("click", () => openStudentPasswordForm(btn.dataset.resetStudent, btn.dataset.name))
  );
}

function openStudentPasswordForm(studentId, studentName) {
  openModal(`
    <h3>كلمة مرور الطالبة: ${escapeHtml(studentName)}</h3>
    <div id="studentPasswordMsg"></div>
    <div class="field">كلمة المرور المؤقتة<input id="studentTemporaryPassword" type="password" minlength="10" placeholder="10 أحرف على الأقل، منها حرف ورقم"></div>
    <p style="color:var(--muted);font-size:.82rem">سيُطلب من الطالبة تغييرها بعد أول دخول.</p>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelStudentPassword">إلغاء</button><button class="btn btn-primary" id="saveStudentPassword">حفظ</button></div>`);
  document.getElementById("cancelStudentPassword").onclick = closeModal;
  document.getElementById("saveStudentPassword").onclick = async () => {
    try {
      await api(`/students/${studentId}/reset-password`, { method: "PUT", body: JSON.stringify({ newPassword: document.getElementById("studentTemporaryPassword").value }) });
      closeModal();
      toast("تم تعيين كلمة المرور المؤقتة.");
    } catch (error) {
      document.getElementById("studentPasswordMsg").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    }
  };
}

function openStudentForm(student) {
  const selectedClass = allClasses.find((item) => String(item.id) === String(student?.class_id || ""));
  openModal(`
    <h3>${student ? "تعديل بيانات الطالبة" : "إضافة طالبة جديدة"}</h3>
    <div id="studentFormMsg"></div>
    <div class="form-grid">
      <div class="field">الاسم<input id="sfName" value="${escapeHtml(student?.name || "")}" /></div>
      <div class="field">البريد الإلكتروني<input id="sfEmail" value="${escapeHtml(student?.email || "")}" /></div>
      <div class="field">الفصل
        <select id="sfClass">
          <option value="">اختاري الفصل</option>
          ${allClasses.map((c) => `<option value="${c.id}" ${student?.class_id == c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">المرحلة<input id="sfStage" value="${escapeHtml(selectedClass?.level || student?.stage || student?.level || "")}" readonly /></div>
      ${student ? "" : '<div class="field">كلمة المرور المؤقتة<input id="sfPassword" type="password" minlength="10" placeholder="10 أحرف على الأقل وحرف ورقم" /></div>'}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelStudentForm">إلغاء</button>
      <button class="btn btn-primary" id="saveStudentForm">حفظ</button>
    </div>
  `);
  document.getElementById("cancelStudentForm").onclick = closeModal;
  document.getElementById("sfClass").onchange = (event) => {
    const selected = allClasses.find((item) => String(item.id) === String(event.target.value));
    document.getElementById("sfStage").value = selected?.level || "";
  };
  document.getElementById("saveStudentForm").onclick = async () => {
    const payload = {
      name: document.getElementById("sfName").value.trim(),
      email: document.getElementById("sfEmail").value.trim(),
      classId: document.getElementById("sfClass").value || null,
      temporaryPassword: document.getElementById("sfPassword")?.value || undefined,
    };
    if (!payload.classId) {
      document.getElementById("studentFormMsg").innerHTML = '<div class="form-error">اختاري فصلًا للطالبة.</div>';
      return;
    }
    try {
      if (student) {
        await api(`/students/${student.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/students", { method: "POST", body: JSON.stringify(payload) });
      }
      closeModal();
      toast("تم حفظ بيانات الطالبة.");
      loadManageTable();
    } catch (err) {
      document.getElementById("studentFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">${escapeHtml(err.message)}</div>`;
    }
  };
}

const PORTFOLIO_CATEGORY_META = {
  homework: { label: "واجب", icon: "📖" },
  worksheet: { label: "ورقة عمل", icon: "📝" },
  task: { label: "مهمة", icon: "📌" },
  project: { label: "مشروع", icon: "🏗️" },
  achievement_image: { label: "صورة إنجاز", icon: "🖼️" },
  other: { label: "ملف آخر", icon: "📎" },
};

const PORTFOLIO_REVIEW_META = {
  pending: { label: "بانتظار المراجعة", icon: "⏳" },
  approved: { label: "تم الاعتماد", icon: "✅" },
  needs_revision: { label: "يحتاج تعديل", icon: "✏️" },
};

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} بايت`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} كيلوبايت`;
  return `${(size / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function portfolioReviewBadge(status) {
  const review = PORTFOLIO_REVIEW_META[status] || PORTFOLIO_REVIEW_META.pending;
  return `<span class="portfolio-review-badge ${escapeHtml(status || "pending")}">${review.icon} ${review.label}</span>`;
}

function openStudentFilePreview(file) {
  const source = `/api/teacher/student-files/${file.id}/file`;
  const preview = file.mimeType === "application/pdf"
    ? `<iframe class="portfolio-preview-frame" src="${source}" title="معاينة ${escapeHtml(file.title)}"></iframe>`
    : `<img class="portfolio-preview-image" src="${source}" alt="معاينة ${escapeHtml(file.title)}" />`;
  openModal(`
    <header class="portfolio-dialog-header">
      <div><span>${escapeHtml(file.studentName)} · ${escapeHtml(file.className || "—")}</span><h3>${escapeHtml(file.title)}</h3></div>
      <button class="dialog-close" id="closePortfolioPreview" type="button" aria-label="إغلاق">×</button>
    </header>
    <div class="portfolio-preview-stage">${preview}</div>
    <div class="modal-actions"><a class="btn btn-primary" href="/api/teacher/student-files/${file.id}/download">تنزيل الملف</a><button class="btn btn-outline" id="dismissPortfolioPreview" type="button">إغلاق</button></div>
  `,"portfolio-preview-dialog");
  document.getElementById("closePortfolioPreview").onclick=closeModal;
  document.getElementById("dismissPortfolioPreview").onclick=closeModal;
}

function openStudentFileReview(file) {
  const alreadyAwarded=Number(file.awardedPoints||0)>0;
  const review=PORTFOLIO_REVIEW_META[file.reviewStatus]||PORTFOLIO_REVIEW_META.pending;
  openModal(`
    <header class="portfolio-dialog-header">
      <div><span>مراجعة عمل الطالبة</span><h3>${escapeHtml(file.studentName)} · ${escapeHtml(file.className||"—")}</h3></div>
      <button class="dialog-close" id="closePortfolioReview" type="button" aria-label="إغلاق">×</button>
    </header>
    <div class="portfolio-review-summary">
      <div><small>عنوان العمل</small><strong>${escapeHtml(file.title)}</strong></div>
      <div><small>النوع</small><strong>${escapeHtml((PORTFOLIO_CATEGORY_META[file.category]||PORTFOLIO_CATEGORY_META.other).label)}</strong></div>
      <div><small>الحالة الحالية</small><strong>${review.icon} ${review.label}</strong></div>
    </div>
    <label class="form-group portfolio-comment-field">تعليق للطالبة
      <textarea id="portfolioTeacherComment" maxlength="1000" placeholder="اكتبي ملاحظتك أو التعديل المطلوب...">${escapeHtml(file.teacherComment||"")}</textarea>
    </label>
    ${alreadyAwarded?`<div class="portfolio-awarded-note">✨ أضيفت للطالبة <strong>${Number(file.awardedPoints)} من نقاط مدار</strong> عند اعتماد هذا العمل.</div>`:`
      <fieldset class="portfolio-points-fieldset">
        <legend>نقاط مدار عند الاعتماد</legend>
        <p>اختاري عددًا سريعًا أو اكتبي عددًا آخر. لن تُضاف النقاط إلا عند الاعتماد.</p>
        <div class="portfolio-points-row">
          ${[1,2,5,10].map(points=>`<button class="portfolio-point-choice" type="button" data-portfolio-points="${points}">${points===1?'⭐':points===2?'⭐⭐':points===5?'🏅':'👑'}<strong>${points}</strong></button>`).join("")}
          <label class="portfolio-manual-points">عدد آخر<input id="portfolioManualPoints" type="number" min="1" max="1000" inputmode="numeric" placeholder="مثال: 7" /></label>
        </div>
      </fieldset>`}
    <div id="portfolioReviewMessage"></div>
    <div class="modal-actions portfolio-review-actions">
      <button class="btn btn-outline" id="savePortfolioComment" type="button">حفظ التعليق</button>
      <button class="btn btn-warning" id="requestPortfolioRevision" type="button" ${alreadyAwarded?'disabled title="سبق اعتماد العمل وإضافة نقاطه"':''}>طلب تعديل</button>
      <button class="btn btn-primary" id="approvePortfolioFile" type="button">${alreadyAwarded?'حفظ الاعتماد':'اعتماد وإضافة نقاط مدار ✨'}</button>
    </div>
  `,"portfolio-review-dialog");

  document.getElementById("closePortfolioReview").onclick=closeModal;
  let selectedPoints=0;
  const pointButtons=[...document.querySelectorAll("[data-portfolio-points]")];
  const manual=document.getElementById("portfolioManualPoints");
  pointButtons.forEach(button=>{
    button.onclick=()=>{
      selectedPoints=Number(button.dataset.portfolioPoints);
      pointButtons.forEach(choice=>choice.classList.toggle("selected",choice===button));
      if(manual) manual.value="";
    };
  });
  if(manual) manual.oninput=()=>{
    selectedPoints=0;
    pointButtons.forEach(choice=>choice.classList.remove("selected"));
  };

  async function saveReview(status) {
    const comment=document.getElementById("portfolioTeacherComment").value.trim();
    const message=document.getElementById("portfolioReviewMessage");
    const points=alreadyAwarded?Number(file.awardedPoints):(Number(manual?.value||0)||selectedPoints);
    if(status==="needs_revision"&&!comment) {
      message.innerHTML='<div class="form-error">اكتبي للطالبة التعديل المطلوب أولًا.</div>';
      return;
    }
    if(status==="approved"&&!alreadyAwarded&&points<1) {
      message.innerHTML='<div class="form-error">حددي نقاط مدار قبل اعتماد العمل.</div>';
      return;
    }
    message.innerHTML="";
    const controls=[...document.querySelectorAll(".portfolio-review-dialog button")];
    controls.forEach(control=>control.disabled=true);
    try {
      const result=await api(`/student-files/${file.id}/review`,{method:"PUT",body:JSON.stringify({status,comment,points})});
      closeModal();
      const success=status==="approved"
        ? result.pointsAdded?`تم اعتماد العمل وإضافة ${result.pointsAdded} من نقاط مدار ✨`:"تم حفظ اعتماد العمل."
        : status==="needs_revision"?"تم إرسال طلب التعديل للطالبة.":"تم حفظ تعليقكِ للطالبة.";
      toast(success);
      await renderStudentFiles();
    } catch(error) {
      controls.forEach(control=>control.disabled=false);
      if(alreadyAwarded) document.getElementById("requestPortfolioRevision").disabled=true;
      message.innerHTML=`<div class="form-error">${escapeHtml(error.message)}</div>`;
    }
  }
  document.getElementById("savePortfolioComment").onclick=()=>saveReview(file.reviewStatus||"pending");
  document.getElementById("requestPortfolioRevision").onclick=()=>saveReview("needs_revision");
  document.getElementById("approvePortfolioFile").onclick=()=>saveReview("approved");
}

async function renderStudentFiles() {
  const data = await api("/student-files");
  contentEl.innerHTML = `
    <section class="student-files-hero">
      <div class="student-files-hero-icon" aria-hidden="true">📁</div>
      <div><span>إدارة الطالبات</span><h3>ملفات الطالبات</h3><p>هنا تظهر الواجبات وأوراق العمل والمهام والمشاريع وصور الإنجاز التي ترفعها الطالبات من حساباتهن.</p></div>
      <strong>${data.files.length} ملف</strong>
    </section>
    <div class="card">
      <div class="toolbar">
        <input id="studentFilesSearch" placeholder="بحث باسم الطالبة أو عنوان العمل..." />
        <select id="studentFilesCategory"><option value="">كل أنواع الأعمال</option>${Object.entries(PORTFOLIO_CATEGORY_META).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join("")}</select>
      </div>
      <div id="studentFilesWrap">
        ${data.files.length ? `<div class="table-wrap"><table id="studentFilesTable"><thead><tr><th>الطالبة والفصل</th><th>عنوان الملف ونوعه</th><th>تاريخ الرفع</th><th>الحالة</th><th>المعاينة والتنزيل</th><th>المراجعة</th></tr></thead><tbody>${data.files.map((file) => {
          const meta = PORTFOLIO_CATEGORY_META[file.category] || PORTFOLIO_CATEGORY_META.other;
          const search = `${file.studentName} ${file.studentEmail} ${file.title} ${file.note} ${file.className}`.toLocaleLowerCase("ar");
          const fileKind = file.mimeType === "application/pdf" ? "PDF" : "صورة";
          return `<tr data-student-file data-category="${escapeHtml(file.category)}" data-search="${escapeHtml(search)}">
            <td><strong>${escapeHtml(file.studentName)}</strong><br><small>${escapeHtml(file.className || "—")} · ${escapeHtml(file.studentEmail)}</small></td>
            <td><strong>${escapeHtml(file.title)}</strong><br><span class="portfolio-type-badge"><i aria-hidden="true">${meta.icon}</i>${meta.label}</span><small class="portfolio-file-meta">${fileKind} · ${escapeHtml(file.originalName)} · ${formatFileSize(file.sizeBytes)}</small></td>
            <td>${formatDate(file.createdAt)}</td>
            <td>${portfolioReviewBadge(file.reviewStatus)}${file.awardedPoints?`<small class="portfolio-points-added">+${Number(file.awardedPoints)} نقطة</small>`:""}</td>
            <td><div class="portfolio-table-actions"><button class="btn btn-secondary btn-sm" type="button" data-preview-file="${file.id}">معاينة</button><a class="btn btn-outline btn-sm" href="/api/teacher/student-files/${file.id}/download">تنزيل</a></div></td>
            <td><button class="btn btn-primary btn-sm" type="button" data-review-file="${file.id}">${file.reviewStatus==="pending"?"مراجعة":"فتح المراجعة"}</button></td>
          </tr>`;
        }).join("")}</tbody></table></div><div class="empty-state" id="studentFilesNoResults" hidden>لا توجد ملفات مطابقة للبحث.</div>` : '<div class="empty-state"><div class="ic">📁</div><p>لم ترفع الطالبات أعمالًا بعد.</p></div>'}
      </div>
    </div>`;

  if (!data.files.length) return;
  const searchInput = document.getElementById("studentFilesSearch");
  const categoryInput = document.getElementById("studentFilesCategory");
  const rows = [...document.querySelectorAll("[data-student-file]")];
  const noResults = document.getElementById("studentFilesNoResults");
  function filterFiles() {
    const search = searchInput.value.trim().toLocaleLowerCase("ar");
    const category = categoryInput.value;
    let visible = 0;
    rows.forEach((row) => {
      const matches = (!search || row.dataset.search.includes(search)) && (!category || row.dataset.category === category);
      row.hidden = !matches;
      if (matches) visible++;
    });
    noResults.hidden = visible !== 0;
  }
  searchInput.oninput = filterFiles;
  categoryInput.onchange = filterFiles;
  document.querySelectorAll("[data-preview-file]").forEach(button=>button.onclick=()=>openStudentFilePreview(data.files.find(file=>file.id===Number(button.dataset.previewFile))));
  document.querySelectorAll("[data-review-file]").forEach(button=>button.onclick=()=>openStudentFileReview(data.files.find(file=>file.id===Number(button.dataset.reviewFile))));
}

// ========================================================================== 
// سجل المتابعة
// ==========================================================================
let followUpPeriod = 1;
let followUpMode = "tracking";
let followUpRowsById = new Map();
let followUpLoadedSettings = {};

function cleanScore(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function scoreInput(studentId, field, value, max) {
  return `<input class="score-input" type="number" min="0" max="${Number(max)}" step="0.5" data-student="${studentId}" data-score="${field}" value="${value === null || value === undefined ? "" : escapeHtml(value)}" />`;
}

function maxSetting(name, label, value) {
  return `<label class="score-setting">${label}<input class="max-input" type="number" min="0.5" max="1000" step="0.5" data-max-setting="${name}" value="${escapeHtml(value)}" /></label>`;
}

async function renderFollowUp() {
  const trackingMode = followUpMode === "tracking";
  contentEl.innerHTML = `
    <div class="card">
      <div class="follow-up-main-tabs" role="tablist" aria-label="أقسام سجل المتابعة">
        <button class="follow-up-main-tab ${trackingMode ? "active" : ""}" type="button" data-follow-mode="tracking" role="tab" aria-selected="${trackingMode}"><span aria-hidden="true">📖</span><strong>متابعة</strong><small>الحضور والواجب والمشاركة والمهام</small></button>
        <button class="follow-up-main-tab ${!trackingMode ? "active" : ""}" type="button" data-follow-mode="tests" role="tab" aria-selected="${!trackingMode}"><span aria-hidden="true">📝</span><strong>الاختبارات</strong><small>الفترة الأولى والثانية والثالثة</small></button>
      </div>
      ${trackingMode ? `
        <div class="follow-up-categories follow-up-action-buttons" role="group" aria-label="خيارات المتابعة">
          <button type="button"><span aria-hidden="true">🗓️</span><strong>الحضور</strong></button>
          <button type="button"><span aria-hidden="true">📖</span><strong>الواجب</strong></button>
          <button type="button"><span aria-hidden="true">🙋‍♀️</span><strong>المشاركة</strong></button>
          <button type="button"><span aria-hidden="true">📚</span><strong>المهام</strong></button>
        </div>
      ` : `
        <div class="toolbar">
          <div class="tabs" style="margin:0">
            ${[1, 2, 3].map((period) => `<button class="tab-btn ${followUpPeriod === period ? "active" : ""}" data-follow-period="${period}">${period === 1 ? "الفترة الأولى" : period === 2 ? "الفترة الثانية" : "الفترة الثالثة"}</button>`).join("")}
          </div>
          <div class="spacer"></div>
          <input id="followUpSearch" placeholder="بحث بالاسم أو البريد..." />
        </div>
        <div id="followUpContent"><div class="empty-state">جارٍ تحميل جدول الاختبارات...</div></div>
      `}
    </div>
  `;
  document.querySelectorAll("[data-follow-mode]").forEach((button) => {
    button.onclick = () => {
      followUpMode = button.dataset.followMode;
      renderFollowUp();
    };
  });
  if (trackingMode) return;
  document.querySelectorAll("[data-follow-period]").forEach((button) => {
    button.onclick = () => {
      followUpPeriod = Number(button.dataset.followPeriod);
      renderFollowUp();
    };
  });
  await loadFollowUpPeriod();
  document.getElementById("followUpSearch").oninput = (event) => {
    const query = event.target.value.trim().toLocaleLowerCase("ar");
    document.querySelectorAll("#followUpTable tbody tr").forEach((row) => {
      row.hidden = query !== "" && !row.dataset.search.includes(query);
    });
  };
}

async function loadFollowUpPeriod() {
  const data = await api(`/follow-up?period=${followUpPeriod}`);
  const target = document.getElementById("followUpContent");
  const settings = data.settings;
  followUpLoadedSettings = { ...settings };
  followUpRowsById = new Map(data.rows.map((row) => [Number(row.id), row]));
  const settingsHtml = followUpPeriod < 3
    ? [
        maxSetting("periodicTestMax", "الدرجة الكاملة للاختبار الفتري", settings.periodicTestMax),
        maxSetting("participationMax", "الدرجة الكاملة للمشاركة", settings.participationMax),
        maxSetting("homeworkMax", "الدرجة الكاملة للواجبات", settings.homeworkMax),
        maxSetting("tasksMax", "الدرجة الكاملة للمهام", settings.tasksMax),
      ].join("")
    : [
        maxSetting("quizMax", "الدرجة الكاملة لكل اختبار فوري", settings.quizMax),
        maxSetting("participationMax", "الدرجة الكاملة لمتوسط المشاركة", settings.participationMax),
        maxSetting("homeworkMax", "الدرجة الكاملة لمتوسط الواجبات", settings.homeworkMax),
        maxSetting("tasksMax", "الدرجة الكاملة لمتوسط المهام", settings.tasksMax),
        maxSetting("finalExamMax", "الدرجة الكاملة للاختبار النهائي", settings.finalExamMax),
      ].join("");

  const rowsHtml = data.rows.map((row) => {
    const searchText = escapeHtml(`${row.name} ${row.email}`.toLocaleLowerCase("ar"));
    if (followUpPeriod < 3) {
      return `<tr data-student-id="${row.id}" data-search="${searchText}">
        <td>${escapeHtml(row.email)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${scoreInput(row.id, "periodicTestScore", row.periodicTestScore, settings.periodicTestMax)}</td>
        <td>${scoreInput(row.id, "participationScore", row.participationScore, settings.participationMax)}</td>
        <td>${scoreInput(row.id, "homeworkScore", row.homeworkScore, settings.homeworkMax)}</td>
        <td>${scoreInput(row.id, "tasksScore", row.tasksScore, settings.tasksMax)}</td>
        <td class="tracking-total">${cleanScore(row.total)}</td>
      </tr>`;
    }
    return `<tr data-student-id="${row.id}" data-search="${searchText}">
      <td>${escapeHtml(row.email)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${scoreInput(row.id, "quizOneScore", row.quizOneScore, settings.quizMax)}</td>
      <td>${scoreInput(row.id, "quizTwoScore", row.quizTwoScore, settings.quizMax)}</td>
      <td><span class="tracking-derived" data-derived="quiz">${cleanScore(row.quizAverage)}</span></td>
      <td><span class="tracking-derived" data-derived="participation" data-ratio="${Number(row.participationRatio || 0)}">${cleanScore(row.participationAverage)}</span></td>
      <td><span class="tracking-derived" data-derived="homework" data-ratio="${Number(row.homeworkRatio || 0)}">${cleanScore(row.homeworkAverage)}</span></td>
      <td><span class="tracking-derived" data-derived="tasks" data-ratio="${Number(row.tasksRatio || 0)}">${cleanScore(row.tasksAverage)}</span></td>
      <td>${scoreInput(row.id, "finalExamScore", row.finalExamScore, settings.finalExamMax)}</td>
      <td class="tracking-total">${cleanScore(row.total)}</td>
    </tr>`;
  }).join("");

  target.innerHTML = `
    <p class="tracking-note">حددي الدرجة الكاملة لكل بند، ثم أدخلي درجات الطالبات واحفظي السجل.</p>
    ${followUpPeriod === 3 ? '<p class="tracking-note">متوسطات المشاركة والواجبات والمهام تُحسب تلقائيًا من الفترتين الأولى والثانية مع مراعاة الدرجة الكاملة في كل فترة.</p>' : ""}
    <div class="score-settings">${settingsHtml}</div>
    ${data.rows.length ? `<div class="table-wrap"><table id="followUpTable"><thead><tr>${followUpPeriod < 3
      ? "<th>البريد الإلكتروني</th><th>اسم الطالبة</th><th>الاختبار الفتري</th><th>المشاركة</th><th>الواجبات</th><th>المهام</th><th>المجموع</th>"
      : "<th>البريد الإلكتروني</th><th>اسم الطالبة</th><th>اختبار فوري 1</th><th>اختبار فوري 2</th><th>متوسط الاختبارين</th><th>متوسط المشاركة</th><th>متوسط الواجبات</th><th>متوسط المهام</th><th>الاختبار النهائي</th><th>المجموع</th>"
    }</tr></thead><tbody>${rowsHtml}</tbody></table></div>` : '<div class="empty-state">لا توجد طالبات في فصولك بعد.</div>'}
    <div class="modal-actions"><button class="btn btn-primary" id="saveFollowUp" ${data.rows.length ? "" : "disabled"}>حفظ سجل الفترة</button></div>
  `;

  document.querySelectorAll(".score-input").forEach((input) => {
    input.oninput = () => recalculateFollowUpRow(input.closest("tr"));
  });
  document.querySelectorAll(".max-input").forEach((input) => {
    input.oninput = () => {
      updateFollowUpMaximums();
      document.querySelectorAll("#followUpTable tbody tr").forEach(recalculateFollowUpRow);
    };
  });
  document.getElementById("saveFollowUp").onclick = saveFollowUpPeriod;
}

function currentMax(name) {
  return Number(document.querySelector(`[data-max-setting="${name}"]`)?.value || 0);
}

function updateFollowUpMaximums() {
  const mapping = followUpPeriod < 3
    ? { periodicTestScore: "periodicTestMax", participationScore: "participationMax", homeworkScore: "homeworkMax", tasksScore: "tasksMax" }
    : { quizOneScore: "quizMax", quizTwoScore: "quizMax", finalExamScore: "finalExamMax" };
  Object.entries(mapping).forEach(([field, maxName]) => {
    document.querySelectorAll(`[data-score="${field}"]`).forEach((input) => { input.max = currentMax(maxName); });
  });
}

function numericInput(row, field) {
  const value = row.querySelector(`[data-score="${field}"]`)?.value;
  return value === "" || value === undefined ? null : Number(value);
}

function recalculateFollowUpRow(row) {
  if (!row) return;
  let total = 0;
  if (followUpPeriod < 3) {
    ["periodicTestScore", "participationScore", "homeworkScore", "tasksScore"].forEach((field) => { total += numericInput(row, field) || 0; });
  } else {
    const quizValues = [numericInput(row, "quizOneScore"), numericInput(row, "quizTwoScore")].filter((value) => value !== null);
    const quizAverage = quizValues.length ? quizValues.reduce((sum, value) => sum + value, 0) / quizValues.length : 0;
    row.querySelector('[data-derived="quiz"]').textContent = cleanScore(quizValues.length ? quizAverage : null);
    const derivedMaxes = { participation: "participationMax", homework: "homeworkMax", tasks: "tasksMax" };
    let derivedTotal = 0;
    Object.entries(derivedMaxes).forEach(([key, maxName]) => {
      const element = row.querySelector(`[data-derived="${key}"]`);
      const value = Number(element.dataset.ratio || 0) * currentMax(maxName);
      element.textContent = cleanScore(value);
      derivedTotal += value;
    });
    total = quizAverage + derivedTotal + (numericInput(row, "finalExamScore") || 0);
  }
  row.querySelector(".tracking-total").textContent = cleanScore(total);
}

async function saveFollowUpPeriod() {
  const button = document.getElementById("saveFollowUp");
  button.disabled = true;
  const settings = { ...followUpLoadedSettings };
  document.querySelectorAll(".max-input").forEach((input) => { settings[input.dataset.maxSetting] = Number(input.value); });
  const fields = followUpPeriod < 3
    ? ["periodicTestScore", "participationScore", "homeworkScore", "tasksScore"]
    : ["quizOneScore", "quizTwoScore", "finalExamScore"];
  const rows = [...document.querySelectorAll("#followUpTable tbody tr")].map((row) => {
    const original = followUpRowsById.get(Number(row.dataset.studentId)) || {};
    const record = { studentId: Number(row.dataset.studentId) };
    fields.forEach((field) => {
      const input = row.querySelector(`[data-score="${field}"]`);
      record[field] = input ? numericInput(row, field) : (original[field] ?? null);
    });
    return record;
  });
  try {
    await api("/follow-up", { method: "PUT", body: JSON.stringify({ period: followUpPeriod, settings, rows }) });
    toast("تم حفظ سجل المتابعة.");
    await loadFollowUpPeriod();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
}

// ==========================================================================
// النقاط التحفيزية
// ==========================================================================
async function renderMotivation() {
  const data = await api("/motivation");
  const categoryMeta = {
    homework: { label: "واجب", icon: "📖" },
    participation: { label: "مشاركة", icon: "🙋‍♀️" },
    attendance: { label: "حضور", icon: "🗓️" },
    task: { label: "مهمة", icon: "📚" },
    other: { label: "سبب آخر", icon: "💡" },
  };
  contentEl.innerHTML = `
    <section class="motivation-intro">
      <div><span>نقاط تحفيزية</span><h3>نقاط مدار ✨</h3><p>كافئي إنجازات طالباتكِ، وستظهر كل إضافة مباشرة في حساب الطالبة وفي قسمها المناسب.</p></div>
    </section>
    <div class="grid-2">
      <div class="card">
        <div class="toolbar"><h3 class="section-title" style="margin:0">طالباتي</h3><div class="spacer"></div><input id="motivationSearch" placeholder="بحث بالاسم أو البريد..." /></div>
        ${data.students.length ? `<div class="table-wrap"><table id="motivationTable"><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>المرحلة</th><th>الفصل</th><th>نقاط مدار</th><th>إجراء</th></tr></thead><tbody>${data.students.map((student) => `<tr data-search="${escapeHtml(`${student.name} ${student.email}`.toLocaleLowerCase("ar"))}"><td>${escapeHtml(student.name)}</td><td>${escapeHtml(student.email)}</td><td>${escapeHtml(student.stage)}</td><td>${escapeHtml(student.class_name || "—")}</td><td class="points-total">${Number(student.points || 0)}</td><td><button class="btn btn-secondary btn-sm" data-motivation-student="${student.id}">إضافة نقاط</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">لا توجد طالبات في فصولك بعد.</div>'}
      </div>
      <div class="card">
        <h3 class="section-title">آخر إضافات نقاط مدار</h3>
        <div class="history-list">${data.history.length ? data.history.map((entry) => {
          const meta = categoryMeta[entry.reason_type] || categoryMeta.other;
          const reasonText = entry.details || entry.reason;
          const batch = Boolean(entry.is_batch);
          const title = batch ? `إضافة جماعية · ${Number(entry.student_count)} طالبة` : entry.student_name;
          const place = batch && entry.class_name ? ` · ${entry.class_name}` : "";
          return `<div class="history-item ${batch ? "history-item-batch" : ""}"><div class="history-reason-icon" aria-hidden="true">${batch ? "👩‍👩‍👧‍👧" : meta.icon}</div><div class="history-copy"><strong>${escapeHtml(title)}</strong><br><small>${escapeHtml(reasonText)} · ${escapeHtml(meta.label)}${escapeHtml(place)} · ${formatDate(entry.created_at)}</small></div><span class="badge ${Number(entry.points) >= 0 ? "badge-green" : "badge-red"}">${Number(entry.points) >= 0 ? "+" : ""}${entry.points}${batch ? " لكل طالبة" : ""}</span>${batch ? `<button class="btn btn-outline btn-sm undo-batch-button" type="button" data-undo-motivation-batch="${escapeHtml(entry.batch_id)}">تراجع</button>` : ""}</div>`;
        }).join("") : '<div class="empty-state">لم تُضف نقاط مدار بعد.</div>'}</div>
      </div>
    </div>
  `;
  document.querySelectorAll("[data-motivation-student]").forEach((button) => {
    const student = data.students.find((item) => String(item.id) === String(button.dataset.motivationStudent));
    button.onclick = () => openMotivationForm(student, data.students);
  });
  document.querySelectorAll("[data-undo-motivation-batch]").forEach((button) => {
    button.onclick = () => confirmAction("هل تريدين التراجع عن العملية الجماعية كاملة وحذف نقاطها من جميع الطالبات المحددات؟", async () => {
      const result = await api(`/motivation/batch/${button.dataset.undoMotivationBatch}`, { method: "DELETE" });
      toast(`تم التراجع عن نقاط ${result.studentCount} طالبة.`);
      await renderMotivation();
    });
  });
  document.getElementById("motivationSearch").oninput = (event) => {
    const query = event.target.value.trim().toLocaleLowerCase("ar");
    document.querySelectorAll("#motivationTable tbody tr").forEach((row) => { row.hidden = query && !row.dataset.search.includes(query); });
  };
}

function openMotivationForm(student, students = []) {
  const studentList = students.length ? students : [student];
  const reasons = {
    homework: { label: "واجب", icon: "📖" },
    participation: { label: "مشاركة", icon: "🙋‍♀️" },
    attendance: { label: "حضور", icon: "🗓️✅" },
    task: { label: "مهمة", icon: "📚" },
    other: { label: "سبب آخر", icon: "💡" },
  };
  openModal(`
    <form id="madarPointsForm" class="madar-points-form">
      <header class="points-dialog-header">
        <div><span>✨ نقاط مدار</span><h3 id="motivationDialogTitle">إضافة نقاط للطالبة</h3></div>
        <button class="dialog-close" id="closeMotivation" type="button" aria-label="إغلاق">×</button>
      </header>
      <div class="points-dialog-body">
        <div class="motivation-mode-tabs" role="tablist" aria-label="طريقة إضافة النقاط">
          <button type="button" class="motivation-mode-tab selected" data-points-mode="single" role="tab" aria-selected="true">طالبة واحدة</button>
          <button type="button" class="motivation-mode-tab" data-points-mode="batch" role="tab" aria-selected="false">إضافة جماعية</button>
        </div>
        <div class="point-recipient" id="singlePointRecipient"><span>اسم الطالبة</span><strong>${escapeHtml(student.name)}</strong><small>الرصيد الحالي: ${Number(student.points || 0)} نقطة</small></div>
        <section class="batch-recipient" id="batchPointRecipient" hidden>
          <div class="batch-filter-grid">
            <label class="field">المرحلة<select id="motivationStage"><option value="">اختاري المرحلة</option></select></label>
            <label class="field">الصف<select id="motivationGrade" disabled><option value="">اختاري الصف</option></select></label>
            <label class="field">الفصل<select id="motivationClass" disabled><option value="">اختاري الفصل</option></select></label>
          </div>
          <div id="batchStudentPicker" class="batch-student-picker"><p>اختاري المرحلة ثم الصف والفصل لعرض الطالبات.</p></div>
        </section>
        <div id="motivationMsg"></div>

        <section class="points-form-section">
          <h4><span>١</span> اختاري عدد النقاط</h4>
          <div class="point-choice-grid" role="group" aria-label="اختيار سريع لعدد النقاط">
            <button type="button" class="point-choice" data-points="1" aria-pressed="false"><b aria-hidden="true">⭐</b><strong>نقطة واحدة</strong><small>1 نقطة</small></button>
            <button type="button" class="point-choice" data-points="2" aria-pressed="false"><b aria-hidden="true">⭐⭐</b><strong>نجمتان</strong><small>نقطتان</small></button>
            <button type="button" class="point-choice" data-points="5" aria-pressed="false"><b aria-hidden="true">🏅</b><strong>ميدالية</strong><small>5 نقاط</small></button>
            <button type="button" class="point-choice crown-choice" data-points="10" aria-pressed="false"><b aria-hidden="true">👑</b><strong>تاج</strong><small>10 نقاط · للمبدعة</small></button>
          </div>
          <div class="choice-separator"><span>أو إدخال يدوي</span></div>
          <label class="manual-points-field">عدد النقاط
            <input id="motivationManualPoints" type="number" inputmode="numeric" min="1" max="1000" step="1" placeholder="مثال: 3 أو 7 أو 15" />
          </label>
        </section>

        <section class="points-form-section">
          <h4><span>٢</span> اختاري سبب النقاط</h4>
          <div class="reason-choice-grid" role="group" aria-label="سبب النقاط">
            ${Object.entries(reasons).map(([key, item]) => `<button type="button" class="reason-choice" data-reason="${key}" aria-pressed="false"><b aria-hidden="true">${item.icon}</b><strong>${item.label}</strong></button>`).join("")}
          </div>
          <label class="field other-reason-field" id="otherReasonWrap" hidden>اكتبي السبب الآخر
            <input id="motivationOtherReason" maxlength="255" placeholder="مثال: تعاون مميز مع زميلاتها" />
          </label>
        </section>

        <section class="points-form-section">
          <h4><span>٣</span> تفاصيل قصيرة <small>اختياري</small></h4>
          <label class="field"><textarea id="motivationDetails" maxlength="500" placeholder="مثل: إكمال واجب النسبة المئوية، أو مشاركة متميزة في حل التمرين"></textarea></label>
        </section>
      </div>

      <footer class="points-sticky-footer">
        <div class="points-summary" id="motivationSummary" aria-live="polite">اختاري عدد النقاط وسببها ليظهر الملخص هنا.</div>
        <div class="modal-actions points-actions"><button class="btn btn-outline" id="cancelMotivation" type="button">إلغاء</button><button class="btn btn-primary add-points-button" id="saveMotivation" type="submit" disabled>أضيفي النقاط ✨</button></div>
      </footer>
    </form>
  `, "madar-points-dialog");

  const form = document.getElementById("madarPointsForm");
  const quickChoices = [...form.querySelectorAll("[data-points]")];
  const reasonChoices = [...form.querySelectorAll("[data-reason]")];
  const manualInput = document.getElementById("motivationManualPoints");
  const otherWrap = document.getElementById("otherReasonWrap");
  const otherInput = document.getElementById("motivationOtherReason");
  const detailsInput = document.getElementById("motivationDetails");
  const summary = document.getElementById("motivationSummary");
  const saveButton = document.getElementById("saveMotivation");
  const dialogTitle = document.getElementById("motivationDialogTitle");
  const singleRecipient = document.getElementById("singlePointRecipient");
  const batchRecipient = document.getElementById("batchPointRecipient");
  const stageSelect = document.getElementById("motivationStage");
  const gradeSelect = document.getElementById("motivationGrade");
  const classSelect = document.getElementById("motivationClass");
  const studentPicker = document.getElementById("batchStudentPicker");
  const modeTabs = [...form.querySelectorAll("[data-points-mode]")];
  const selectedStudentIds = new Set();
  let currentMode = "single";
  let selectedPoints = null;
  let selectedReason = "";

  const uniqueValues = (items) => [...new Set(items.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ar"));
  const setOptions = (select, values, placeholder) => {
    select.innerHTML = `<option value="">${placeholder}</option>${values.map((value) => `<option value="${escapeHtml(value.value ?? value)}">${escapeHtml(value.label ?? value)}</option>`).join("")}`;
  };
  setOptions(stageSelect, uniqueValues(studentList.map((item) => item.stage)), "اختاري المرحلة");

  function updateSelectedCount() {
    const count = selectedStudentIds.size;
    const counter = document.getElementById("batchSelectedCount");
    if (counter) counter.textContent = `${count} طالبة محددة`;
    const allButton = document.getElementById("selectAllBatchStudents");
    const checkboxes = [...studentPicker.querySelectorAll("[data-batch-student]")];
    if (allButton) allButton.textContent = checkboxes.length && checkboxes.every((box) => box.checked) ? "إلغاء تحديد الجميع" : "تحديد الجميع";
    updateSummary();
  }

  function renderBatchStudents() {
    selectedStudentIds.clear();
    if (!classSelect.value) {
      studentPicker.innerHTML = "<p>اختاري الفصل لعرض طالباته.</p>";
      updateSummary();
      return;
    }
    const classStudents = studentList.filter((item) => String(item.class_id) === classSelect.value);
    if (!classStudents.length) {
      studentPicker.innerHTML = '<p>لا توجد طالبات في هذا الفصل.</p>';
      updateSummary();
      return;
    }
    studentPicker.innerHTML = `<div class="batch-picker-head"><strong>طالبات الفصل</strong><span id="batchSelectedCount">0 طالبة محددة</span><button type="button" class="btn btn-outline btn-sm" id="selectAllBatchStudents">تحديد الجميع</button></div><div class="batch-student-list">${classStudents.map((item) => `<label class="batch-student-option"><input type="checkbox" data-batch-student="${item.id}" /><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.email)}</small></span></label>`).join("")}</div><small class="batch-picker-note">يمكنكِ إلغاء تحديد الغائبات أو أي طالبة قبل الحفظ.</small>`;
    studentPicker.querySelectorAll("[data-batch-student]").forEach((checkbox) => {
      checkbox.onchange = () => {
        const id = Number(checkbox.dataset.batchStudent);
        if (checkbox.checked) selectedStudentIds.add(id); else selectedStudentIds.delete(id);
        updateSelectedCount();
      };
    });
    document.getElementById("selectAllBatchStudents").onclick = () => {
      const checkboxes = [...studentPicker.querySelectorAll("[data-batch-student]")];
      const selectAll = !checkboxes.every((checkbox) => checkbox.checked);
      selectedStudentIds.clear();
      checkboxes.forEach((checkbox) => {
        checkbox.checked = selectAll;
        if (selectAll) selectedStudentIds.add(Number(checkbox.dataset.batchStudent));
      });
      updateSelectedCount();
    };
    updateSelectedCount();
  }

  stageSelect.onchange = () => {
    const grades = uniqueValues(studentList.filter((item) => item.stage === stageSelect.value).map((item) => item.grade_label));
    setOptions(gradeSelect, grades, "اختاري الصف");
    gradeSelect.disabled = !stageSelect.value;
    setOptions(classSelect, [], "اختاري الفصل");
    classSelect.disabled = true;
    renderBatchStudents();
  };
  gradeSelect.onchange = () => {
    const matches = studentList.filter((item) => item.stage === stageSelect.value && item.grade_label === gradeSelect.value);
    const classes = [...new Map(matches.map((item) => [String(item.class_id), { value: String(item.class_id), label: item.class_name }])).values()];
    setOptions(classSelect, classes, "اختاري الفصل");
    classSelect.disabled = !gradeSelect.value;
    renderBatchStudents();
  };
  classSelect.onchange = renderBatchStudents;

  function clearQuickChoices() {
    quickChoices.forEach((button) => {
      button.classList.remove("selected");
      button.setAttribute("aria-pressed", "false");
    });
  }

  function updateSummary() {
    const summaryReasons = { homework: "الواجب", participation: "المشاركة", attendance: "الحضور", task: "المهمة" };
    const reasonText = detailsInput.value.trim() || (selectedReason === "other" ? otherInput.value.trim() : summaryReasons[selectedReason] || reasons[selectedReason]?.label || "");
    const validPoints = Number.isInteger(selectedPoints) && selectedPoints >= 1 && selectedPoints <= 1000;
    const validReason = Boolean(selectedReason) && (selectedReason !== "other" || Boolean(otherInput.value.trim()));
    const validRecipients = currentMode === "single" || (Boolean(classSelect.value) && selectedStudentIds.size > 0);
    const ready = validPoints && validReason && validRecipients;
    saveButton.disabled = !ready;
    summary.classList.toggle("ready", ready);
    const pointText = selectedPoints === 1 ? "نقطة واحدة" : selectedPoints === 2 ? "نقطتين" : `${selectedPoints} نقاط`;
    if (ready && currentMode === "batch") summary.textContent = `إضافة ${pointText} إلى ${selectedStudentIds.size} طالبة بسبب ${reasonText}.`;
    else if (ready) summary.textContent = `سيتم إضافة ${pointText} للطالبة ${student.name} بسبب ${reasonText}.`;
    else if (currentMode === "batch" && !selectedStudentIds.size) summary.textContent = "اختاري الفصل وحددي الطالبات، ثم اختاري عدد النقاط وسببها.";
    else summary.textContent = "اختاري عدد النقاط وسببها ليظهر الملخص هنا.";
  }

  modeTabs.forEach((tab) => {
    tab.onclick = () => {
      currentMode = tab.dataset.pointsMode;
      modeTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", selected ? "true" : "false");
      });
      singleRecipient.hidden = currentMode !== "single";
      batchRecipient.hidden = currentMode !== "batch";
      dialogTitle.textContent = currentMode === "batch" ? "إضافة نقاط جماعية" : "إضافة نقاط للطالبة";
      saveButton.textContent = currentMode === "batch" ? "إضافة النقاط للطالبات المحددات" : "أضيفي النقاط ✨";
      updateSummary();
    };
  });

  quickChoices.forEach((button) => {
    button.onclick = () => {
      clearQuickChoices();
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      manualInput.value = "";
      selectedPoints = Number(button.dataset.points);
      updateSummary();
    };
  });

  manualInput.oninput = () => {
    clearQuickChoices();
    const value = Number(manualInput.value);
    selectedPoints = manualInput.value !== "" && Number.isInteger(value) ? value : null;
    updateSummary();
  };

  reasonChoices.forEach((button) => {
    button.onclick = () => {
      reasonChoices.forEach((choice) => {
        choice.classList.toggle("selected", choice === button);
        choice.setAttribute("aria-pressed", choice === button ? "true" : "false");
      });
      selectedReason = button.dataset.reason;
      otherWrap.hidden = selectedReason !== "other";
      if (otherWrap.hidden) otherInput.value = "";
      else otherInput.focus();
      updateSummary();
    };
  });

  otherInput.oninput = updateSummary;
  detailsInput.oninput = updateSummary;
  document.getElementById("closeMotivation").onclick = closeModal;
  document.getElementById("cancelMotivation").onclick = closeModal;
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      saveButton.disabled = true;
      const common = { points: selectedPoints, category: selectedReason, otherReason: otherInput.value.trim(), details: detailsInput.value.trim() };
      const result = currentMode === "batch"
        ? await api("/motivation/batch", { method: "POST", body: JSON.stringify({ ...common, classId: Number(classSelect.value), studentIds: [...selectedStudentIds] }) })
        : await api(`/motivation/${student.id}`, { method: "POST", body: JSON.stringify(common) });
      if (currentMode === "single") student.points = result.total;
      closeModal();
      toast(currentMode === "batch" ? `تمت إضافة نقاط مدار إلى ${result.studentCount} طالبة ✨` : `تمت إضافة ${selectedPoints} من نقاط مدار للطالبة ${student.name} ✨`);
      await renderMotivation();
    } catch (error) {
      updateSummary();
      document.getElementById("motivationMsg").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    }
  };
}

// ==========================================================================
// الاختبارات (قبلي / بعدي / قصيرة)
// ==========================================================================
const TEST_TYPE_LABELS = { pre_diagnostic: "تشخيصي قبلي", post_diagnostic: "تشخيصي بعدي", quiz: "اختبار قصير" };
let testsPanelMode = "pre_diagnostic";

function openTestsPanel(type = "pre_diagnostic") {
  testsPanelMode = type;
  navigate("tests-panel");
}

async function renderTestsPanel() {
  contentEl.innerHTML = `
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام الاختبارات">
      <button class="tab-btn ${testsPanelMode === "pre_diagnostic" ? "active" : ""}" data-tests-panel="pre_diagnostic">الاختبار التشخيصي القبلي</button>
      <button class="tab-btn ${testsPanelMode === "post_diagnostic" ? "active" : ""}" data-tests-panel="post_diagnostic">الاختبار التشخيصي البعدي</button>
      <button class="tab-btn ${testsPanelMode === "quiz" ? "active" : ""}" data-tests-panel="quiz">الاختبارات القصيرة</button>
    </div>
    <div id="testsPanelContent"></div>
  `;
  document.querySelectorAll("[data-tests-panel]").forEach((button) => {
    button.onclick = () => {
      testsPanelMode = button.dataset.testsPanel;
      renderTestsPanel();
    };
  });
  await renderTestsSection(testsPanelMode)(document.getElementById("testsPanelContent"));
}

function renderTestsSection(type) {
  return async (target = contentEl) => {
    target.innerHTML = `
      <div class="card">
        <div class="toolbar">
          <button class="btn btn-primary btn-sm" id="newTestBtn">+ إنشاء اختبار</button>
        </div>
        <div id="testsWrap"></div>
      </div>
    `;
    document.getElementById("newTestBtn").onclick = () => openTestForm(type);
    await loadTestsList(type);
  };
}

async function loadTestsList(type) {
  const wrap = document.getElementById("testsWrap");
  const tests = await api(`/tests?type=${type}`);
  if (!tests.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="ic">📝</div>لا توجد اختبارات من هذا النوع بعد.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>العنوان</th><th>المهارة</th><th>الحالة</th><th>عدد الأسئلة</th><th>الإجابات</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${tests
          .map(
            (t) => `<tr>
              <td>${escapeHtml(t.title)}</td>
              <td>${escapeHtml(t.question_source === "lesson_bank" ? "جميع مهارات المنهج" : (t.skill_name || "—"))}</td>
              <td><span class="badge ${t.status === "published" ? "badge-green" : "badge-gray"}">${t.status === "published" ? "منشور" : "مسودة"}</span></td>
              <td>${t.question_source === "lesson_bank" ? `${t.approved_lesson_count}/${t.question_count} مهارة معتمدة` : t.question_count}</td>
              <td>${t.completed_count}/${t.assigned_count}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-outline btn-sm" data-edit="${t.id}">تعديل</button>
                <button class="btn btn-secondary btn-sm" data-dup="${t.id}">نسخ</button>
                <button class="btn ${t.status === "published" ? "btn-outline" : "btn-primary"} btn-sm" data-toggle="${t.id}" data-status="${t.status}">${t.status === "published" ? "إلغاء النشر" : "نشر"}</button>
                <button class="btn btn-outline btn-sm" data-results="${t.id}">النتائج</button>
                <a class="btn btn-outline btn-sm" href="/api/teacher/reports/test/${t.id}.pdf" target="_blank">طباعة</a>
                <a class="btn btn-outline btn-sm" href="/api/teacher/reports/test/${t.id}.pdf?answerKey=1" target="_blank">نموذج الإجابة</a>
                <button class="btn btn-danger btn-sm" data-del="${t.id}" data-title="${escapeHtml(t.title)}">حذف</button>
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => openTestForm(type, await api(`/tests/${b.dataset.edit}`))));
  wrap.querySelectorAll("[data-dup]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/tests/${b.dataset.dup}/duplicate`, { method: "POST" });
      toast("تم نسخ الاختبار كمسودة.");
      loadTestsList(type);
    })
  );
  wrap.querySelectorAll("[data-toggle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const action = b.dataset.status === "published" ? "unpublish" : "publish";
      await api(`/tests/${b.dataset.toggle}/${action}`, { method: "POST" });
      toast(action === "publish" ? "تم نشر الاختبار." : "تم إلغاء نشر الاختبار.");
      loadTestsList(type);
    })
  );
  wrap.querySelectorAll("[data-results]").forEach((b) => b.addEventListener("click", () => openTestResults(b.dataset.results)));
  wrap.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () =>
      confirmAction(`هل تأكيد حذف الاختبار "${b.dataset.title}"؟`, async () => {
        await api(`/tests/${b.dataset.del}`, { method: "DELETE" });
        toast("تم حذف الاختبار.");
        loadTestsList(type);
      })
    )
  );
}

let questionDraft = [];

function openTestForm(type, test) {
  const dynamicBankTest = test?.question_source === "lesson_bank";
  questionDraft = test?.questions?.map((q) => ({
    type: q.type,
    questionText: q.question_text,
    options: q.options || ["", "", "", ""],
    correctAnswer: q.correct_answer,
    points: q.points,
  })) || [];

  openModal(`
    <h3>${test ? "تعديل الاختبار" : "إنشاء اختبار — " + TEST_TYPE_LABELS[type]}</h3>
    <div id="testFormMsg"></div>
    <div class="form-grid">
      <div class="field">عنوان الاختبار<input id="tfTitle" value="${escapeHtml(test?.title || "")}" /></div>
      <div class="field">المهارة
        <select id="tfSkill"><option value="">بدون مهارة</option>${allSkills.map((s) => `<option value="${s.id}" ${test?.skill_id == s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select>
      </div>
      <div class="field">الفصل
        <select id="tfClass"><option value="">اختاري الفصل</option>${allClasses.map((c) => `<option value="${c.id}" ${test?.class_id == c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select>
      </div>
      <div class="field">مدة الاختبار (دقيقة)<input type="number" id="tfDuration" value="${test?.duration_minutes || 20}" /></div>
      <div class="field">عدد المحاولات<input type="number" min="1" max="5" id="tfAttempts" value="${test?.max_attempts || 1}" /></div>
      <div class="field">تاريخ البداية<input type="datetime-local" id="tfStart" value="${test?.start_at ? test.start_at.slice(0, 16) : ""}" /></div>
      <div class="field">تاريخ النهاية<input type="datetime-local" id="tfEnd" value="${test?.end_at ? test.end_at.slice(0, 16) : ""}" /></div>
      <label class="field" style="display:flex;align-items:center;gap:8px;flex-direction:row"><input type="checkbox" id="tfShuffle" style="width:auto" ${test ? (Number(test.shuffle_questions) ? "checked" : "") : "checked"}> ترتيب الأسئلة عشوائيًا</label>
      <label class="field" style="display:flex;align-items:center;gap:8px;flex-direction:row"><input type="checkbox" id="tfShowResult" style="width:auto" ${test ? (Number(test.show_result) ? "checked" : "") : "checked"}> إظهار النتيجة للطالبة بعد التسليم</label>
    </div>

    ${dynamicBankTest ? `<div class="diagnostic-bank-notice"><strong>اختبار مرتبط ببنك الأسئلة</strong><p>يسحب النظام سؤالًا عشوائيًا واحدًا من كل رمز درس ويحفظ نسخة مختلفة لكل طالبة. المعتمد الآن ${Number(test.approved_lesson_count || 0)} من ${Number(test.expected_lesson_count || 0)} مهارة.</p></div>` : `<h4 style="margin:18px 0 10px">الأسئلة</h4><div id="questionsWrap"></div><button class="btn btn-secondary btn-sm" id="addQuestionBtn">+ إضافة سؤال</button>`}

    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelTestForm">إلغاء</button>
      <button class="btn btn-secondary" id="saveDraftBtn">حفظ كمسودة</button>
      <button class="btn btn-primary" id="savePublishBtn">${test?.status === "published" ? "حفظ" : "حفظ ونشر"}</button>
    </div>
  `);
  if (!dynamicBankTest) {
    renderQuestionsEditor();
    document.getElementById("addQuestionBtn").onclick = () => {
      questionDraft.push({ type: "mcq", questionText: "", options: ["", "", "", ""], correctAnswer: "", points: 1 });
      renderQuestionsEditor();
    };
  }
  document.getElementById("cancelTestForm").onclick = closeModal;
  document.getElementById("saveDraftBtn").onclick = () => submitTestForm(type, test, false);
  document.getElementById("savePublishBtn").onclick = () => submitTestForm(type, test, true);
}

function renderQuestionsEditor() {
  const wrap = document.getElementById("questionsWrap");
  if (!questionDraft.length) {
    wrap.innerHTML = `<p style="font-size:.82rem;color:var(--muted)">لا توجد أسئلة بعد. أضيفي سؤالًا واحدًا على الأقل قبل النشر.</p>`;
    return;
  }
  wrap.innerHTML = questionDraft
    .map(
      (q, idx) => `
    <div class="question-card">
      <div class="qhead">
        <strong>سؤال ${idx + 1}</strong>
        <button class="btn btn-danger btn-sm" data-remove-q="${idx}">حذف</button>
      </div>
      <div class="form-grid">
        <div class="field">نوع السؤال
          <select data-q="${idx}" data-field="type">
            <option value="mcq" ${q.type === "mcq" ? "selected" : ""}>اختيار من متعدد</option>
            <option value="true_false" ${q.type === "true_false" ? "selected" : ""}>صح أو خطأ</option>
            <option value="short_answer" ${q.type === "short_answer" ? "selected" : ""}>إجابة قصيرة</option>
          </select>
        </div>
        <div class="field">الدرجة<input type="number" min="1" data-q="${idx}" data-field="points" value="${q.points}" /></div>
      </div>
      <div class="field" style="margin-top:10px">نص السؤال<textarea data-q="${idx}" data-field="questionText">${escapeHtml(q.questionText)}</textarea></div>
      ${
        q.type === "mcq"
          ? `<div class="field" style="margin-top:10px">الخيارات (اكتبي الإجابة الصحيحة بالضبط في حقل "الإجابة الصحيحة" أدناه)</div>
             ${[0, 1, 2, 3]
               .map(
                 (i) => `<div class="option-row"><input type="text" placeholder="خيار ${i + 1}" data-q="${idx}" data-field="opt${i}" value="${escapeHtml(q.options?.[i] || "")}" /></div>`
               )
               .join("")}
             <div class="field">الإجابة الصحيحة (نفس نص أحد الخيارات)<input data-q="${idx}" data-field="correctAnswer" value="${escapeHtml(q.correctAnswer || "")}" /></div>`
          : q.type === "true_false"
          ? `<div class="field" style="margin-top:10px">الإجابة الصحيحة
              <select data-q="${idx}" data-field="correctAnswer">
                <option value="صح" ${["صح", "true"].includes(q.correctAnswer) ? "selected" : ""}>صح</option>
                <option value="خطأ" ${["خطأ", "false"].includes(q.correctAnswer) ? "selected" : ""}>خطأ</option>
              </select>
            </div>`
          : `<div class="field" style="margin-top:10px">الإجابة الصحيحة النموذجية<input data-q="${idx}" data-field="correctAnswer" value="${escapeHtml(q.correctAnswer || "")}" /></div>`
      }
    </div>
  `
    )
    .join("");

  wrap.querySelectorAll("[data-remove-q]").forEach((btn) =>
    btn.addEventListener("click", () => {
      questionDraft.splice(Number(btn.dataset.removeQ), 1);
      renderQuestionsEditor();
    })
  );
  wrap.querySelectorAll("[data-q]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.q);
      const field = e.target.dataset.field;
      if (field.startsWith("opt")) {
        const optIdx = Number(field.replace("opt", ""));
        questionDraft[idx].options[optIdx] = e.target.value;
      } else if (field === "type") {
        questionDraft[idx].type = e.target.value;
        questionDraft[idx].options = questionDraft[idx].options || ["", "", "", ""];
        renderQuestionsEditor();
      } else {
        questionDraft[idx][field] = e.target.value;
      }
    });
  });
}

async function submitTestForm(type, existingTest, publish) {
  const dynamicBankTest = existingTest?.question_source === "lesson_bank";
  const title = document.getElementById("tfTitle").value.trim();
  if (!title) {
    document.getElementById("testFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">يرجى إدخال عنوان الاختبار.</div>`;
    return;
  }
  if (publish && !dynamicBankTest && !questionDraft.length) {
    document.getElementById("testFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">لا يمكن نشر اختبار بدون أسئلة.</div>`;
    return;
  }
  if (publish && !document.getElementById("tfClass").value) {
    document.getElementById("testFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">اختاري الفصل قبل نشر الاختبار.</div>`;
    return;
  }
  const payload = {
    title,
    type,
    skillId: document.getElementById("tfSkill").value || null,
    classId: document.getElementById("tfClass").value || null,
    durationMinutes: Number(document.getElementById("tfDuration").value) || 20,
    maxAttempts: Number(document.getElementById("tfAttempts").value) || 1,
    shuffleQuestions: document.getElementById("tfShuffle").checked,
    showResult: document.getElementById("tfShowResult").checked,
    startAt: document.getElementById("tfStart").value || null,
    endAt: document.getElementById("tfEnd").value || null,
    questions: dynamicBankTest ? undefined : questionDraft.map((q) => ({
      type: q.type,
      questionText: q.questionText,
      options: q.type === "mcq" ? q.options.filter(Boolean) : null,
      correctAnswer: q.correctAnswer,
      points: Number(q.points) || 1,
    })),
  };
  try {
    let saved;
    if (existingTest) {
      saved = await api(`/tests/${existingTest.id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      saved = await api("/tests", { method: "POST", body: JSON.stringify(payload) });
    }
    if (publish) await api(`/tests/${saved.id}/publish`, { method: "POST" });
    closeModal();
    toast(publish ? "تم حفظ ونشر الاختبار." : "تم حفظ الاختبار كمسودة.");
    loadTestsList(type);
  } catch (err) {
    document.getElementById("testFormMsg").innerHTML = `<div class="form-error" style="margin-bottom:10px">${escapeHtml(err.message)}</div>`;
  }
}

async function openTestResults(testId) {
  const results = await api(`/tests/${testId}/results`);
  openModal(`
    <h3>نتائج الاختبار</h3>
    ${
      results.length
        ? `<table><thead><tr><th>الطالبة</th><th>الحالة</th><th>الدرجة</th><th>المراجعة</th></tr></thead><tbody>
        ${results
          .map(
            (r) => `<tr><td>${escapeHtml(r.student_name)}</td><td><span class="badge ${r.status === "completed" ? "badge-green" : "badge-gray"}">${r.status === "completed" ? "مكتمل" : r.status === "in_progress" ? "قيد التنفيذ" : "لم يبدأ"}</span></td><td>${r.status === "completed" ? `${r.score}/${r.total_points}` : "—"}</td><td>${r.status === "completed" ? `<button class="btn ${Number(r.review_required) ? "btn-secondary" : "btn-outline"} btn-sm" data-review-attempt="${r.id}">${Number(r.review_required) ? `تحتاج مراجعة (${r.review_required})` : "عرض الإجابات"}</button>` : "—"}</td></tr>`
          )
          .join("")}
      </tbody></table>`
        : `<div class="empty-state">لم تبدأ أي طالبة هذا الاختبار بعد.</div>`
    }
    <div class="modal-actions"><button class="btn btn-outline" id="closeResultsModal">إغلاق</button></div>
  `);
  document.getElementById("closeResultsModal").onclick = closeModal;
  document.querySelectorAll("[data-review-attempt]").forEach((button) => button.onclick = () => openAttemptReview(testId,button.dataset.reviewAttempt));
}

async function openAttemptReview(testId,attemptId) {
  const attempt=await api(`/tests/${testId}/attempts/${attemptId}`);
  openModal(`
    <h3>إجابات ${escapeHtml(attempt.student_name)}</h3>
    <p style="color:var(--muted)">الدرجة الحالية: ${attempt.score}/${attempt.total_points} (${attempt.percentage}%)</p>
    <div id="reviewMessage"></div>
    ${attempt.answers.map((answer,index)=>`<div class="question-card"><strong>${index+1}. ${escapeHtml(answer.question_text)}</strong><p>إجابة الطالبة: <b>${escapeHtml(answer.answer_text||"بدون إجابة")}</b></p><p style="color:var(--muted)">الإجابة النموذجية: ${escapeHtml(answer.correct_answer)}${answer.explanation?` · ${escapeHtml(answer.explanation)}`:""}</p><div class="field">الدرجة المستحقة من ${answer.points}<input type="number" min="0" max="${answer.points}" step="0.5" value="${answer.points_earned}" data-answer-grade="${answer.id}"></div></div>`).join("")}
    <div class="modal-actions"><button class="btn btn-outline" id="cancelAttemptReview">إلغاء</button><button class="btn btn-primary" id="saveAttemptReview">حفظ التصحيح</button></div>`);
  document.getElementById("cancelAttemptReview").onclick=closeModal;
  document.getElementById("saveAttemptReview").onclick=async()=>{
    const grades=[...document.querySelectorAll("[data-answer-grade]")].map((input)=>({answerId:Number(input.dataset.answerGrade),pointsEarned:Number(input.value)}));
    try {
      await api(`/tests/${testId}/attempts/${attemptId}`,{method:"PUT",body:JSON.stringify({grades})});
      closeModal();toast("تم حفظ التصحيح وتحديث التحليلات.");openTestResults(testId);
    } catch(error){document.getElementById("reviewMessage").innerHTML=`<div class="form-error">${escapeHtml(error.message)}</div>`;}
  };
}

// ==========================================================================
// تحليل النتائج
// ==========================================================================
let analysisPanelMode = "student";

function openAnalysisPanel(mode = "student") {
  analysisPanelMode = mode;
  navigate("analysis-panel");
}

async function renderAnalysisPanel() {
  contentEl.innerHTML = `
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام تحليل النتائج">
      <button class="tab-btn ${analysisPanelMode === "student" ? "active" : ""}" data-analysis-panel="student">تحليل لكل طالبة</button>
      <button class="tab-btn ${analysisPanelMode === "class" ? "active" : ""}" data-analysis-panel="class">تحليل الفصل العام</button>
      <button class="tab-btn ${analysisPanelMode === "skill" ? "active" : ""}" data-analysis-panel="skill">تحليل كل مهارة</button>
    </div>
    <div id="analysisPanelContent"></div>
  `;
  document.querySelectorAll("[data-analysis-panel]").forEach((button) => {
    button.onclick = () => {
      analysisPanelMode = button.dataset.analysisPanel;
      renderAnalysisPanel();
    };
  });
  const target = document.getElementById("analysisPanelContent");
  if (analysisPanelMode === "class") await renderAnalysisClass(target);
  else if (analysisPanelMode === "skill") await renderAnalysisSkill(target);
  else await renderAnalysisStudent(target);
}

async function renderAnalysisStudent(target = contentEl) {
  const studentsData = await api("/students?pageSize=100");
  target.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <select id="anStudent"><option value="">اختاري طالبة</option>${studentsData.items.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select>
      </div>
      <div id="anStudentWrap"><div class="empty-state">اختاري طالبة لعرض تحليلها.</div></div>
    </div>
  `;
  document.getElementById("anStudent").addEventListener("change", async (e) => {
    if (!e.target.value) return;
    const data = await api(`/analysis/student/${e.target.value}`);
    const wrap = document.getElementById("anStudentWrap");
    wrap.innerHTML = `
      <h4 class="section-title">الدرجات والتطور</h4>
      ${
        data.results.length
          ? data.results.map((r) => `<div class="skill-pill"><span>${escapeHtml(r.title)}</span><span>${r.score}/${r.total_points} (${Math.round((r.score / r.total_points) * 100)}%)</span></div>`).join("")
          : `<p style="font-size:.82rem;color:var(--muted)">لا توجد نتائج مكتملة بعد.</p>`
      }
      <div class="grid-2" style="margin-top:18px">
        <div>
          <h4 class="section-title">مهارات متقنة</h4>
          ${data.mastered.length ? data.mastered.map((s) => `<div class="skill-pill"><span>${escapeHtml(s.name)}</span><span class="badge badge-green">${s.mastery_percent}%</span></div>`).join("") : `<p style="font-size:.82rem;color:var(--muted)">لا يوجد بعد.</p>`}
        </div>
        <div>
          <h4 class="section-title">تحتاج دعمًا</h4>
          ${data.needsSupport.length ? data.needsSupport.map((s) => `<div class="skill-pill"><span>${escapeHtml(s.name)}</span><span class="badge badge-red">${s.mastery_percent}%</span></div>`).join("") : `<p style="font-size:.82rem;color:var(--muted)">لا يوجد.</p>`}
        </div>
      </div>
    `;
  });
}

async function renderAnalysisClass(target = contentEl) {
  target.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <select id="anClass"><option value="">كل الفصول</option>${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
      </div>
      <div id="anClassWrap"></div>
    </div>
  `;
  async function load() {
    const classId = document.getElementById("anClass").value;
    const data = await api(`/analysis/class?classId=${classId}`);
    document.getElementById("anClassWrap").innerHTML = `
      <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
        ${statCard("📊", data.average + "%", "متوسط الفصل")}
        ${statCard("⬆️", data.highest + "%", "أعلى درجة")}
        ${statCard("⬇️", data.lowest + "%", "أقل درجة")}
        ${statCard("✅", data.passRate + "%", "نسبة النجاح")}
      </div>
      <h4 class="section-title">توزيع الدرجات</h4>
      ${data.distribution
        .map(
          (d) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:4px"><span>${d.label}</span><strong>${d.count} طالبة</strong></div><div class="progress-bar"><span style="width:${data.studentCount ? (d.count / data.studentCount) * 100 : 0}%"></span></div></div>`
        )
        .join("")}
      <h4 class="section-title" style="margin-top:18px">مقارنة التشخيص القبلي والبعدي</h4>
      ${
        Object.keys(data.prePost || {}).length
          ? [["pre_diagnostic", "تشخيصي قبلي"], ["post_diagnostic", "تشخيصي بعدي"]].filter(([key]) => data.prePost[key] !== undefined).map(([key, label]) => `<div class="skill-pill"><span>${label}</span><span>${Math.round(data.prePost[key] || 0)}%</span></div>`).join("")
          : `<p style="font-size:.82rem;color:var(--muted)">لا توجد بيانات كافية للمقارنة.</p>`
      }
    `;
  }
  document.getElementById("anClass").addEventListener("change", load);
  await load();
}

async function renderAnalysisSkill(target = contentEl) {
  const data = await api("/analysis/skills");
  target.innerHTML = `
    <div class="card">
      ${data
        .map(
          (s) => `
        <div style="margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <strong>${escapeHtml(s.name)}</strong>
            <span class="badge ${progressColorBadge(s.averageMastery)}">متوسط الإتقان: ${s.averageMastery}%</span>
          </div>
          <p style="font-size:.82rem;color:var(--muted);margin:4px 0">متقنات: ${s.masteredCount} · بحاجة إلى تدخل علاجي: ${s.needsSupportCount}</p>
          ${
            s.needsSupportStudents.length
              ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${s.needsSupportStudents.map((st) => `<span class="badge badge-red">${escapeHtml(st.name)}</span>`).join("")}</div>`
              : ""
          }
        </div>`
        )
        .join("") || `<div class="empty-state">لا توجد مهارات مسجّلة بعد.</div>`}
    </div>
  `;
}

// ==========================================================================
// التقارير
// ==========================================================================
async function renderReports() {
  contentEl.innerHTML = `
    <div class="card">
      <h3 class="section-title">تصدير التقارير</h3>
      <div style="display:flex;flex-direction:column;gap:14px;max-width:420px">
        <a class="btn btn-secondary btn-block" href="/api/teacher/reports/students.xlsx">تصدير قائمة الطالبات (Excel)</a>
        <div class="field">
          تقرير فصل (PDF)
          <select id="repClass">${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
        </div>
        <a class="btn btn-secondary btn-block" id="repClassLink" href="#" target="_blank">تنزيل تقرير الفصل</a>
      </div>
      <p style="font-size:.8rem;color:var(--muted);margin-top:16px">لتصدير تقرير طالبة محددة (PDF)، افتحي ملف متابعتها من «لوحة الطالبة».</p>
    </div>
  `;
  function updateLink() {
    document.getElementById("repClassLink").href = `/api/teacher/reports/class.pdf?classId=${document.getElementById("repClass").value}`;
  }
  document.getElementById("repClass").addEventListener("change", updateLink);
  updateLink();
}

// ==========================================================================
// الإشعارات
// ==========================================================================
async function renderNotifications() {
  const notifs = await api("/data/notifications");
  contentEl.innerHTML = `
    <div class="card">
      ${
        notifs.length
          ? notifs
              .map(
                (n) => `<div class="skill-pill" style="display:flex;align-items:center">
            <div><strong>${escapeHtml(n.title)}</strong><br><span style="color:var(--muted);font-size:.8rem">${escapeHtml(n.message || "")} · ${formatDate(n.created_at)}</span></div>
            <div style="display:flex;gap:6px">
              ${n.is_read ? "" : `<button class="btn btn-outline btn-sm" data-read="${n.id}">تمييز كمقروء</button>`}
              <button class="btn btn-danger btn-sm" data-delnotif="${n.id}">حذف</button>
            </div>
          </div>`
              )
              .join("")
          : `<div class="empty-state"><div class="ic">🔔</div>لا توجد إشعارات حاليًا.</div>`
      }
    </div>
  `;
  contentEl.querySelectorAll("[data-read]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/data/notifications/${b.dataset.read}/read`, { method: "PUT" });
      renderNotifications();
      refreshNotifBell();
    })
  );
  contentEl.querySelectorAll("[data-delnotif]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/data/notifications/${b.dataset.delnotif}`, { method: "DELETE" });
      renderNotifications();
      refreshNotifBell();
    })
  );
}

// ==========================================================================
// الفصول والمجموعات
// ==========================================================================
async function renderClasses() {
  contentEl.innerHTML = `
    <div class="card">
      <div class="toolbar"><button class="btn btn-primary btn-sm" id="addClassBtn">+ إضافة فصل</button></div>
      <div id="classesWrap"></div>
    </div>
  `;
  document.getElementById("addClassBtn").onclick = () => openClassForm();
  await loadClassesTable();
}

async function loadClassesTable() {
  const classes = await api("/data/classes");
  allClasses = classes;
  const wrap = document.getElementById("classesWrap");
  wrap.innerHTML = classes.length
    ? `<table><thead><tr><th>اسم الفصل</th><th>المستوى</th><th>عدد الطالبات</th><th>إجراءات</th></tr></thead><tbody>
      ${classes
        .map(
          (c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.level)}</td><td>${c.student_count}</td>
          <td><button class="btn btn-outline btn-sm" data-editc="${c.id}">تعديل</button> <button class="btn btn-danger btn-sm" data-delc="${c.id}" data-name="${escapeHtml(c.name)}">حذف</button></td></tr>`
        )
        .join("")}
    </tbody></table>`
    : `<div class="empty-state">لا توجد فصول بعد.</div>`;

  wrap.querySelectorAll("[data-editc]").forEach((b) =>
    b.addEventListener("click", () => openClassForm(classes.find((c) => c.id == b.dataset.editc)))
  );
  wrap.querySelectorAll("[data-delc]").forEach((b) =>
    b.addEventListener("click", () =>
      confirmAction(`هل تأكيد حذف الفصل "${b.dataset.name}"؟`, async () => {
        await api(`/data/classes/${b.dataset.delc}`, { method: "DELETE" });
        toast("تم حذف الفصل.");
        loadClassesTable();
      })
    )
  );
}

function openClassForm(cls) {
  openModal(`
    <h3>${cls ? "تعديل الفصل" : "إضافة فصل جديد"}</h3>
    <div class="form-grid full">
      <div class="field">اسم الفصل<input id="cfName" value="${escapeHtml(cls?.name || "")}" /></div>
      <div class="field">المستوى
        <select id="cfLevel">${["ابتدائي", "متوسط", "ثانوي"].map((l) => `<option value="${l}" ${cls?.level === l ? "selected" : ""}>${l}</option>`).join("")}</select>
      </div>
      <div class="field">الصف<input id="cfGrade" value="${escapeHtml(cls?.grade_label || "")}" placeholder="مثال: الصف الثاني المتوسط" /></div>
      <div class="field">العام الدراسي<input id="cfYear" value="${escapeHtml(cls?.academic_year || "")}" placeholder="مثال: 1448" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelClassForm">إلغاء</button>
      <button class="btn btn-primary" id="saveClassForm">حفظ</button>
    </div>
  `);
  document.getElementById("cancelClassForm").onclick = closeModal;
  document.getElementById("saveClassForm").onclick = async () => {
    const payload = {
      name: document.getElementById("cfName").value.trim(),
      level: document.getElementById("cfLevel").value,
      gradeLabel: document.getElementById("cfGrade").value.trim(),
      academicYear: document.getElementById("cfYear").value.trim(),
    };
    if (cls) await api(`/data/classes/${cls.id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/data/classes", { method: "POST", body: JSON.stringify(payload) });
    closeModal();
    toast("تم حفظ الفصل.");
    loadClassesTable();
  };
}

// ==========================================================================
// سجل الأنشطة
// ==========================================================================
async function renderActivity() {
  const logs = await api("/data/activity-log");
  contentEl.innerHTML = `
    <div class="card">
      ${
        logs.length
          ? `<table><thead><tr><th>الإجراء</th><th>التفاصيل</th><th>التاريخ</th></tr></thead><tbody>
            ${logs.map((l) => `<tr><td>${escapeHtml(l.action)}</td><td>${escapeHtml(l.details || "—")}</td><td>${formatDate(l.created_at)}</td></tr>`).join("")}
          </tbody></table>`
          : `<div class="empty-state">لا توجد أنشطة مسجّلة بعد.</div>`
      }
    </div>
  `;
}

// ==========================================================================
// الإعدادات
// ==========================================================================
async function renderSettings() {
  contentEl.innerHTML = `
    <div class="card" style="max-width:560px">
      <h3 class="section-title">إعدادات الحساب</h3>
      <div id="settingsPasswordMessage"></div>
      <div class="field" style="margin-bottom:22px">
        بريد المعلمة
        <input type="email" value="${escapeHtml(currentTeacher.email)}" readonly aria-label="بريد المعلمة" />
      </div>
      <form id="settingsPasswordForm">
        <h3 class="section-title">تغيير كلمة المرور</h3>
        <div class="form-grid full">
          <div class="field">كلمة المرور الحالية<input type="password" id="settingsCurrentPassword" autocomplete="current-password" required /></div>
          <div class="field">كلمة المرور الجديدة<input type="password" id="settingsNewPassword" autocomplete="new-password" minlength="10" required /></div>
          <div class="field">تأكيد كلمة المرور الجديدة<input type="password" id="settingsConfirmPassword" autocomplete="new-password" minlength="10" required /></div>
        </div>
        <p style="font-size:.76rem;color:var(--muted);line-height:1.7">يجب أن تتكون كلمة المرور الجديدة من 10 أحرف على الأقل، وتحتوي حرفًا ورقمًا.</p>
        <button class="btn btn-primary" id="saveSettingsPassword" type="submit">تغيير كلمة المرور</button>
      </form>
    </div>
  `;
  document.getElementById("settingsPasswordForm").onsubmit = async (event) => {
    event.preventDefault();
    const message = document.getElementById("settingsPasswordMessage");
    const currentPassword = document.getElementById("settingsCurrentPassword").value;
    const newPassword = document.getElementById("settingsNewPassword").value;
    const confirmPassword = document.getElementById("settingsConfirmPassword").value;
    if (newPassword !== confirmPassword) {
      message.innerHTML = '<div class="form-error" style="margin-bottom:14px">كلمتا المرور الجديدة غير متطابقتين.</div>';
      return;
    }
    const button = document.getElementById("saveSettingsPassword");
    button.disabled = true;
    message.innerHTML = "";
    try {
      await api("/me", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      message.innerHTML = '<div class="form-success" style="margin-bottom:14px">تم تغيير كلمة المرور بنجاح.</div>';
      event.target.reset();
    } catch (error) {
      message.innerHTML = `<div class="form-error" style="margin-bottom:14px">${escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
    }
  };
}

// ==========================================================================
// بنك الأسئلة الذكي
// ==========================================================================
const BANK_STYLE = { easy: "سهل", medium: "متوسط", hard: "متقدم" };
const BANK_TYPE = { mcq: "اختيار متعدد", true_false: "صح أو خطأ", short_answer: "إجابة قصيرة" };

async function renderQuestionBank() {
  const rows = await api("/question-bank");
  const importedPending = rows.filter((q) => q.source === "imported" && q.review_status === "pending");
  const importedBatch = importedPending[0]?.import_batch || "";
  contentEl.innerHTML = `
    <div class="toolbar">
      <button class="btn btn-primary btn-sm" id="aiQuestionsBtn">✨ توليد أسئلة بالذكاء الاصطناعي</button>
      <button class="btn btn-secondary btn-sm" id="manualQuestionBtn">+ سؤال يدوي</button>
      <button class="btn btn-outline btn-sm" id="testFromBankBtn">إنشاء اختبار من المحدد</button>
      ${importedPending.length ? `<button class="btn btn-secondary btn-sm" id="approveImportedBtn">اعتماد بنك التشخيص المستورد (${importedPending.length})</button>` : ""}
      <div class="spacer"></div>
      <span class="badge badge-orange">أسئلة الذكاء الاصطناعي تحتاج مراجعة قبل استخدامها</span>
    </div>
    <div class="card">
      ${rows.length ? `<table><thead><tr><th></th><th>السؤال</th><th>الموضوع والرمز</th><th>الصعوبة</th><th>المصدر</th><th>المراجعة</th><th>إجراءات</th></tr></thead><tbody>
        ${rows.map((q) => `<tr>
          <td><input type="checkbox" data-bank-select="${q.id}" ${q.review_status !== "approved" ? "disabled" : ""}></td>
          <td><strong>${escapeHtml(q.questionText)}</strong><br><small>${BANK_TYPE[q.type] || q.type}</small></td>
          <td>${escapeHtml(q.skill_name || q.topic)}<br><small>${q.lesson_code ? `رمز الدرس: ${escapeHtml(q.lesson_code)} · ` : ""}${escapeHtml(q.grade_label)}</small></td>
          <td>${BANK_STYLE[q.difficulty] || q.difficulty}</td>
          <td><span class="badge ${q.source === "ai" ? "badge-purple" : q.source === "imported" ? "badge-green" : "badge-gray"}">${q.source === "ai" ? "ذكاء اصطناعي" : q.source === "imported" ? "مستورد من Excel" : "يدوي"}</span></td>
          <td><span class="badge ${q.review_status === "approved" ? "badge-green" : q.review_status === "rejected" ? "badge-red" : "badge-orange"}">${q.review_status === "approved" ? "معتمد" : q.review_status === "rejected" ? "مرفوض" : "بانتظار المراجعة"}</span></td>
          <td><button class="btn btn-outline btn-sm" data-bank-edit="${q.id}">مراجعة وتعديل</button> ${q.review_status !== "approved" ? `<button class="btn btn-secondary btn-sm" data-approve="${q.id}">اعتماد</button>` : ""} <button class="btn btn-danger btn-sm" data-bank-delete="${q.id}">حذف</button></td>
        </tr>`).join("")}
      </tbody></table>` : `<div class="empty-state">لا توجد أسئلة بعد. أضيفي سؤالًا يدويًا أو استخدمي التوليد الذكي.</div>`}
    </div>`;

  document.getElementById("aiQuestionsBtn").onclick = openAiQuestionForm;
  document.getElementById("manualQuestionBtn").onclick = () => openBankQuestionForm();
  document.getElementById("testFromBankBtn").onclick = createTestFromSelectedBank;
  if (document.getElementById("approveImportedBtn")) document.getElementById("approveImportedBtn").onclick = () => confirmAction(`هل راجعتِ بنك التشخيص وتريدين اعتماد أسئلته الـ${importedPending.length}؟`, async () => {
    const result = await api("/question-bank/bulk-review", { method: "POST", body: JSON.stringify({ importBatch: importedBatch, status: "approved" }) });
    toast(`تم اعتماد ${result.updated} سؤالًا. أصبح الاختبار جاهزًا للنشر.`);
    renderQuestionBank();
  });
  contentEl.querySelectorAll("[data-bank-edit]").forEach((button) => button.onclick = () => openBankQuestionForm(rows.find((item) => item.id == button.dataset.bankEdit)));
  contentEl.querySelectorAll("[data-approve]").forEach((button) => button.onclick = async () => {
    const q = rows.find((item) => item.id == button.dataset.approve);
    await api(`/question-bank/${q.id}`, { method: "PUT", body: JSON.stringify(bankQuestionPayload(q, "approved")) });
    toast("تم اعتماد السؤال.");
    renderQuestionBank();
  });
  contentEl.querySelectorAll("[data-bank-delete]").forEach((button) => button.onclick = () => confirmAction("هل تريدين حذف هذا السؤال؟", async () => {
    await api(`/question-bank/${button.dataset.bankDelete}`, { method: "DELETE" });
    toast("تم حذف السؤال.");
    renderQuestionBank();
  }));
}

function bankQuestionPayload(q, reviewStatus = "approved") {
  return {
    stage: q.stage, gradeLabel: q.grade_label, topic: q.topic, difficulty: q.difficulty,
    type: q.type, questionText: q.questionText, options: q.options, correctAnswer: q.correctAnswer,
    explanation: q.explanation || "", points: Number(q.points) || 1, skillId: q.skill_id || null, reviewStatus,
  };
}

function openBankQuestionForm(question = null) {
  openModal(`
    <h3>${question ? "مراجعة وتعديل السؤال" : "إضافة سؤال إلى البنك"}</h3>${question?.source === "ai" ? '<p style="color:var(--muted);font-size:.82rem">راجعي نص السؤال وخياراته وإجابته وشرحه قبل الاعتماد.</p>' : ""}<div id="bankFormMsg"></div>
    <div class="form-grid">
      <div class="field">المرحلة<select id="bStage">${["ابتدائي","متوسط","ثانوي"].map((value)=>`<option ${question?.stage===value?"selected":""}>${value}</option>`).join("")}</select></div>
      <div class="field">الصف<input id="bGrade" value="${escapeHtml(question?.grade_label||"")}" placeholder="مثال: الصف الثاني المتوسط"></div>
      <div class="field">الموضوع<input id="bTopic" value="${escapeHtml(question?.topic||"")}" placeholder="مثال: المعادلات الخطية"></div>
      <div class="field">الصعوبة<select id="bDifficulty">${[["easy","سهل"],["medium","متوسط"],["hard","متقدم"]].map(([value,label])=>`<option value="${value}" ${question?.difficulty===value?"selected":""}>${label}</option>`).join("")}</select></div>
      <div class="field">نوع السؤال<select id="bType">${[["mcq","اختيار متعدد"],["true_false","صح أو خطأ"],["short_answer","إجابة قصيرة"]].map(([value,label])=>`<option value="${value}" ${question?.type===value?"selected":""}>${label}</option>`).join("")}</select></div>
      <div class="field">النقاط<input id="bPoints" type="number" min="0.5" step="0.5" value="${Number(question?.points)||1}"></div>
    </div>
    <div class="field" style="margin-top:10px">نص السؤال<textarea id="bText">${escapeHtml(question?.questionText||"")}</textarea></div>
    <div class="field" style="margin-top:10px">الخيارات — خيار في كل سطر<textarea id="bOptions">${escapeHtml((question?.options||[]).join("\n"))}</textarea></div>
    <div class="field" style="margin-top:10px">الإجابة الصحيحة<input id="bAnswer" value="${escapeHtml(question?.correctAnswer||"")}"></div>
    <div class="field" style="margin-top:10px">شرح الإجابة<textarea id="bExplanation">${escapeHtml(question?.explanation||"")}</textarea></div>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelBankForm">إلغاء</button><button class="btn btn-primary" id="saveBankForm">${question?.review_status === "pending" ? "حفظ واعتماد" : "حفظ السؤال"}</button></div>`);
  document.getElementById("cancelBankForm").onclick = closeModal;
  document.getElementById("saveBankForm").onclick = async () => {
    try {
      await api(question ? `/question-bank/${question.id}` : "/question-bank", { method: question ? "PUT" : "POST", body: JSON.stringify({
        stage: document.getElementById("bStage").value, gradeLabel: document.getElementById("bGrade").value.trim(),
        topic: document.getElementById("bTopic").value.trim(), difficulty: document.getElementById("bDifficulty").value,
        type: document.getElementById("bType").value, questionText: document.getElementById("bText").value.trim(),
        options: document.getElementById("bOptions").value.split("\n").map((v) => v.trim()).filter(Boolean),
        correctAnswer: document.getElementById("bAnswer").value.trim(), explanation: document.getElementById("bExplanation").value.trim(),
        points: Number(document.getElementById("bPoints").value) || 1, skillId: question?.skill_id || null, reviewStatus: question?.review_status === "rejected" ? "rejected" : "approved",
      }) });
      closeModal(); toast(question ? "تم حفظ ومراجعة السؤال." : "تمت إضافة السؤال."); renderQuestionBank();
    } catch (error) { document.getElementById("bankFormMsg").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
  };
}

function openAiQuestionForm() {
  openModal(`
    <h3>توليد أسئلة بالذكاء الاصطناعي</h3><p style="color:var(--muted);font-size:.85rem">ستُحفظ الأسئلة بحالة «بانتظار المراجعة» ولن تدخل أي اختبار تلقائيًا.</p><div id="aiFormMsg"></div>
    <div class="form-grid">
      <div class="field">المرحلة<select id="aiStage"><option>ابتدائي</option><option>متوسط</option><option>ثانوي</option></select></div>
      <div class="field">الصف<input id="aiGrade" placeholder="مثال: الصف الأول المتوسط"></div>
      <div class="field">الموضوع أو الدرس<input id="aiTopic" placeholder="مثال: العبارات الجبرية"></div>
      <div class="field">المهارة<select id="aiSkill"><option value="">بدون تحديد</option>${allSkills.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}</select></div>
      <div class="field">الصعوبة<select id="aiDifficulty"><option value="easy">سهل</option><option value="medium">متوسط</option><option value="hard">متقدم</option></select></div>
      <div class="field">عدد الأسئلة<input id="aiCount" type="number" min="1" max="20" value="5"></div>
    </div>
    <div class="field" style="margin-top:10px">أنواع الأسئلة<select id="aiTypes" multiple><option value="mcq" selected>اختيار متعدد</option><option value="true_false">صح أو خطأ</option><option value="short_answer">إجابة قصيرة</option></select></div>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelAiForm">إلغاء</button><button class="btn btn-primary" id="runAiForm">✨ ولّدي الأسئلة</button></div>`);
  document.getElementById("cancelAiForm").onclick = closeModal;
  document.getElementById("runAiForm").onclick = async () => {
    const button = document.getElementById("runAiForm"); button.disabled = true; button.textContent = "جارٍ التوليد والفحص...";
    try {
      const result = await api("/ai/generate-questions", { method: "POST", body: JSON.stringify({
        stage: document.getElementById("aiStage").value, gradeLabel: document.getElementById("aiGrade").value.trim(),
        topic: document.getElementById("aiTopic").value.trim(), skillId: document.getElementById("aiSkill").value || null,
        difficulty: document.getElementById("aiDifficulty").value, count: Number(document.getElementById("aiCount").value),
        types: [...document.getElementById("aiTypes").selectedOptions].map((o) => o.value),
      }) });
      closeModal(); toast(`تم توليد ${result.created} أسئلة بانتظار مراجعتكِ.`); renderQuestionBank();
    } catch (error) { document.getElementById("aiFormMsg").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; button.disabled = false; button.textContent = "✨ ولّدي الأسئلة"; }
  };
}

function createTestFromSelectedBank() {
  const ids = [...contentEl.querySelectorAll("[data-bank-select]:checked")].map((box) => Number(box.dataset.bankSelect));
  if (!ids.length) return toast("اختاري سؤالًا معتمدًا واحدًا على الأقل.");
  openModal(`<h3>إنشاء اختبار من بنك الأسئلة</h3><div class="form-grid full">
    <div class="field">عنوان الاختبار<input id="bankTestTitle"></div>
    <div class="field">النوع<select id="bankTestType"><option value="quiz">اختبار قصير</option><option value="pre_diagnostic">تشخيصي قبلي</option><option value="post_diagnostic">تشخيصي بعدي</option></select></div>
    <div class="field">الفصل<select id="bankTestClass"><option value="">اختاري الفصل</option>${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select></div>
  </div><div class="modal-actions"><button class="btn btn-outline" id="cancelBankTest">إلغاء</button><button class="btn btn-primary" id="saveBankTest">إنشاء كمسودة</button></div>`);
  document.getElementById("cancelBankTest").onclick = closeModal;
  document.getElementById("saveBankTest").onclick = async () => {
    const title=document.getElementById("bankTestTitle").value.trim();
    const classId=document.getElementById("bankTestClass").value;
    const testType=document.getElementById("bankTestType").value;
    if (!title || !classId) return toast("اكتبي عنوان الاختبار واختاري الفصل.");
    const saved = await api("/tests", { method: "POST", body: JSON.stringify({ title, type: testType, classId, durationMinutes: 20, questions: [] }) });
    await api(`/tests/${saved.id}/add-bank-questions`, { method: "POST", body: JSON.stringify({ questionIds: ids }) });
    closeModal(); toast("تم إنشاء الاختبار كمسودة وإضافة الأسئلة."); openTestsPanel(testType);
  };
}

async function renderAnalysisLearning() {
  const data = await api("/analysis/learning-styles");
  const labels = { visual: "بصري", auditory: "سمعي", reading_writing: "قرائي/كتابي", kinesthetic: "حركي/تطبيقي", mixed: "مختلط", unknown: "غير محدد" };
  contentEl.innerHTML = `<div class="card"><h3 class="section-title">توزيع أنماط التعلّم داخل الفصول</h3><p style="color:var(--muted)">${escapeHtml(data.notice)}</p>${data.items.length ? data.items.map((item) => `<div class="skill-pill"><div><strong>${labels[item.style] || item.style}</strong><br><small>${escapeHtml(data.recommendations[item.style] || "")}</small></div><span class="badge badge-purple">${item.count} طالبة · متوسط ${item.average_progress || 0}%</span></div>`).join("") : '<div class="empty-state">لم تُسجّل الطالبات نتائج الاستبانة بعد.</div>'}</div>`;
}

const EDUCATIONAL_CONTENT = {
  "interactive-games": {
    icon: "🕹️",
    group: "الألعاب",
    title: "الألعاب التفاعلية",
    description: "مساحة تنظيم الألعاب التعليمية التي تساعد الطالبات على التدريب بطريقة ممتعة وتفاعلية.",
    hint: "يمكن إضافة ألعاب جديدة وربطها بالدروس والمهارات لاحقًا.",
  },
  competitions: {
    icon: "🏆",
    group: "الألعاب",
    title: "المسابقات",
    description: "مساحة إعداد المسابقات الصفية والتحديات التحفيزية بين الطالبات.",
    hint: "يمكن إضافة نظام المسابقات والترتيب والجوائز في خطوة لاحقة.",
  },
  "flipped-classroom": {
    icon: "🔄",
    group: "الاستراتيجيات التعليمية",
    title: "الصف المقلوب",
    description: "مكان تجهيز المحتوى الذي تطّلع عليه الطالبة قبل الحصة، ثم تطبيقه ومناقشته داخل الفصل.",
    hint: "يمكن إضافة استراتيجيات تعليمية أخرى إلى هذا القسم لاحقًا.",
  },
  videos: {
    icon: "🎬",
    group: "الموارد المكتبية",
    title: "الفيديوهات",
    description: "مكتبة مرتبة لدروس الفيديو والشروحات المرئية التي تشاركها المعلمة مع طالباتها.",
    hint: "ستظهر هنا الفيديوهات التعليمية عند إضافتها.",
  },
  training: {
    icon: "📒",
    group: "الموارد المكتبية",
    title: "التدريبات",
    description: "مكتبة للتدريبات والتمارين التي تساعد الطالبات على ترسيخ المفاهيم وإتقانها.",
    hint: "يمكن إضافة أوراق العمل والملفات التعليمية إلى المكتبة لاحقًا.",
  },
};

let gamesPanelMode = "interactive-games";

function openGamesPanel(mode = "interactive-games") {
  gamesPanelMode = mode;
  navigate("games-panel");
}

function renderGamesPanel() {
  contentEl.innerHTML = `
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام الألعاب">
      <button class="tab-btn ${gamesPanelMode === "interactive-games" ? "active" : ""}" data-games-panel="interactive-games">الألعاب التفاعلية</button>
      <button class="tab-btn ${gamesPanelMode === "competitions" ? "active" : ""}" data-games-panel="competitions">المسابقات</button>
    </div>
    <div id="gamesPanelContent"></div>
  `;
  document.querySelectorAll("[data-games-panel]").forEach((button) => {
    button.onclick = () => {
      gamesPanelMode = button.dataset.gamesPanel;
      renderGamesPanel();
    };
  });
  renderEducationalContent(gamesPanelMode, document.getElementById("gamesPanelContent"));
}

function openStrategiesPanel() {
  navigate("strategies-panel");
}

function renderStrategiesPanel() {
  contentEl.innerHTML = `
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام الاستراتيجيات">
      <button class="tab-btn active" type="button" aria-selected="true">الصف المقلوب</button>
    </div>
    <div id="strategiesPanelContent"></div>
  `;
  renderEducationalContent("flipped-classroom", document.getElementById("strategiesPanelContent"));
}

let libraryPanelMode = "videos";

function openLibraryPanel(mode = "videos") {
  libraryPanelMode = mode;
  navigate("library-panel");
}

function renderLibraryPanel() {
  contentEl.innerHTML = `
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام الموارد المكتبية">
      <button class="tab-btn ${libraryPanelMode === "videos" ? "active" : ""}" data-library-panel="videos">الفيديوهات</button>
      <button class="tab-btn ${libraryPanelMode === "training" ? "active" : ""}" data-library-panel="training">التدريبات</button>
    </div>
    <div id="libraryPanelContent"></div>
  `;
  document.querySelectorAll("[data-library-panel]").forEach((button) => {
    button.onclick = () => {
      libraryPanelMode = button.dataset.libraryPanel;
      renderLibraryPanel();
    };
  });
  renderEducationalContent(libraryPanelMode, document.getElementById("libraryPanelContent"));
}

let knowledgeExchangeMode = "worksheet";

const KNOWLEDGE_META = {
  worksheet: { label: "أوراق عمل", icon: "📝", hint: "ارفعي ورقة عمل بصيغة PDF أو صورة." },
  summary: { label: "ملخصات", icon: "📄", hint: "ارفعي ملخصًا بصيغة PDF أو صورة." },
  video: { label: "فيديوهات", icon: "🎬", hint: "أضيفي رابطًا من يوتيوب أو أي موقع فيديو آخر." },
};

async function renderKnowledgeExchange() {
  const data = await api("/knowledge-exchange");
  const meta = KNOWLEDGE_META[knowledgeExchangeMode];
  const resources = data.resources.filter((item) => item.category === knowledgeExchangeMode);
  contentEl.innerHTML = `
    <section class="knowledge-hero">
      <span aria-hidden="true">🤝</span>
      <div><small>مشاركة المحتوى مع الطالبات</small><h2>تبادل المعرفة</h2><p>أضيفي أوراق العمل والملخصات وروابط الفيديو لتظهر مباشرة في حسابات طالباتكِ.</p></div>
    </section>
    <div class="student-panel-tabs knowledge-tabs" role="tablist" aria-label="أقسام تبادل المعرفة">
      ${Object.entries(KNOWLEDGE_META).map(([key, item]) => `<button class="tab-btn ${knowledgeExchangeMode === key ? "active" : ""}" type="button" data-knowledge-mode="${key}"><span aria-hidden="true">${item.icon}</span> ${item.label}</button>`).join("")}
    </div>
    <div class="knowledge-layout">
      <form class="card knowledge-form" id="knowledgeResourceForm" enctype="multipart/form-data">
        <div class="knowledge-card-heading"><span aria-hidden="true">${meta.icon}</span><div><h3>إضافة ${meta.label}</h3><p>${meta.hint}</p></div></div>
        <label class="field">العنوان<input id="knowledgeTitle" maxlength="190" required placeholder="اكتبي عنوان المورد"></label>
        <label class="field">وصف مختصر <small>اختياري</small><textarea id="knowledgeDescription" maxlength="1000" placeholder="اكتبي وصفًا يساعد الطالبة على معرفة محتوى المورد"></textarea></label>
        ${knowledgeExchangeMode === "video"
          ? '<label class="field">رابط الفيديو<input id="knowledgeUrl" type="url" inputmode="url" required dir="ltr" placeholder="https://www.youtube.com/watch?v=..."></label>'
          : '<label class="field knowledge-file-field">اختيار ملف PDF أو صورة<input id="knowledgeFile" type="file" accept="application/pdf,image/*" required><small>الحد الأقصى 15 ميجابايت.</small></label>'}
        <div id="knowledgeFormMessage"></div>
        <button class="btn btn-primary knowledge-submit" type="submit">${knowledgeExchangeMode === "video" ? "إضافة رابط الفيديو" : "رفع المورد"}</button>
      </form>
      <section class="card knowledge-list-card">
        <div class="knowledge-card-heading"><span aria-hidden="true">📚</span><div><h3>${meta.label} المضافة</h3><p>${resources.length} مورد</p></div></div>
        <div class="knowledge-resource-list">${resources.length ? resources.map((item) => {
          const action = item.resourceType === "link"
            ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">مشاهدة الفيديو</a>`
            : `<a class="btn btn-secondary btn-sm" href="/api/teacher/knowledge-exchange/${item.id}/file" target="_blank" rel="noopener">معاينة الملف</a>`;
          return `<article class="knowledge-resource-item"><span class="knowledge-resource-icon" aria-hidden="true">${meta.icon}</span><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || "بدون وصف")}</p><small>${formatDate(item.createdAt)}${item.originalName ? ` · ${escapeHtml(item.originalName)}` : ""}</small></div><div class="knowledge-resource-actions">${action}<button class="btn btn-outline btn-sm" type="button" data-delete-knowledge="${item.id}">حذف</button></div></article>`;
        }).join("") : `<div class="empty-state"><div class="ic">${meta.icon}</div>لم تُضف ${meta.label} بعد.</div>`}</div>
      </section>
    </div>`;

  document.querySelectorAll("[data-knowledge-mode]").forEach((button) => {
    button.onclick = () => {
      knowledgeExchangeMode = button.dataset.knowledgeMode;
      renderKnowledgeExchange().catch((error) => { contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`; });
    };
  });
  document.querySelectorAll("[data-delete-knowledge]").forEach((button) => {
    button.onclick = () => confirmAction("هل تريدين حذف هذا المورد من حسابات الطالبات؟", async () => {
      await api(`/knowledge-exchange/${button.dataset.deleteKnowledge}`, { method: "DELETE" });
      toast("تم حذف المورد.");
      await renderKnowledgeExchange();
    });
  });
  document.getElementById("knowledgeResourceForm").onsubmit = async (event) => {
    event.preventDefault();
    const submit = event.submitter || event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true;
    const formData = new FormData();
    formData.set("category", knowledgeExchangeMode);
    formData.set("title", document.getElementById("knowledgeTitle").value.trim());
    formData.set("description", document.getElementById("knowledgeDescription").value.trim());
    if (knowledgeExchangeMode === "video") formData.set("url", document.getElementById("knowledgeUrl").value.trim());
    else if (document.getElementById("knowledgeFile").files[0]) formData.set("file", document.getElementById("knowledgeFile").files[0]);
    try {
      await api("/knowledge-exchange", { method: "POST", body: formData });
      toast(`تمت إضافة ${meta.label} إلى تبادل المعرفة.`);
      await renderKnowledgeExchange();
    } catch (error) {
      document.getElementById("knowledgeFormMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
      submit.disabled = false;
    }
  };
}

function renderEducationalContent(key, target = contentEl) {
  const section = EDUCATIONAL_CONTENT[key];
  target.innerHTML = `
    <div class="card educational-ready-card">
      <div class="empty-state"><div class="ic" aria-hidden="true">${section.icon}</div><h3>قسم ${escapeHtml(section.title)} جاهز</h3><p>${escapeHtml(section.hint)}</p></div>
    </div>`;
}

// ==========================================================================
const ROUTES = {
  home: renderHome,
  profile: renderProfile,
  "student-panel": renderStudentPanel,
  "student-files": renderStudentFiles,
  "follow-up": renderFollowUp,
  motivation: renderMotivation,
  "tests-panel": renderTestsPanel,
  "tests-pre": () => openTestsPanel("pre_diagnostic"),
  "tests-post": () => openTestsPanel("post_diagnostic"),
  "tests-quiz": () => openTestsPanel("quiz"),
  "question-bank": renderQuestionBank,
  "analysis-panel": renderAnalysisPanel,
  "analysis-student": () => openAnalysisPanel("student"),
  "analysis-class": () => openAnalysisPanel("class"),
  "analysis-skill": () => openAnalysisPanel("skill"),
  "analysis-learning": renderAnalysisLearning,
  "games-panel": renderGamesPanel,
  "interactive-games": () => openGamesPanel("interactive-games"),
  competitions: () => openGamesPanel("competitions"),
  "strategies-panel": renderStrategiesPanel,
  "flipped-classroom": openStrategiesPanel,
  "library-panel": renderLibraryPanel,
  videos: () => openLibraryPanel("videos"),
  training: () => openLibraryPanel("training"),
  "knowledge-exchange": () => renderKnowledgeExchange().catch((error) => { contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`; }),
  reports: renderReports,
  notifications: renderNotifications,
  classes: renderClasses,
  activity: renderActivity,
  settings: renderSettings,
};

boot();
