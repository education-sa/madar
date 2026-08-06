// SPA logic for the owner ("مالكة الموقع") dashboard. Every write action here calls a
// /api/owner/* endpoint that is independently enforced server-side by requireOwnerAuth —
// this file only controls what is *shown*, never what is *allowed*.
const content = document.getElementById("content");
const pageTitle = document.getElementById("pageTitle");
const toastRoot = document.getElementById("toastRoot");
const modalRoot = document.getElementById("modalRoot");
const sidebar = document.getElementById("sidebar");
let csrfToken = "";
let currentOwner = null;
const SCHOOL_EMAIL_DOMAIN = "@mkhg.moe.gov.sa";
function composeSchoolEmail(value) {
  const input = String(value || "").trim().toLowerCase();
  return input.includes("@") ? input : `${input}${SCHOOL_EMAIL_DOMAIN}`;
}

const TITLES = {
  home: "نظرة عامة",
  users: "إدارة جميع المستخدمين",
  teachers: "حسابات المعلمات",
  students: "حسابات الطالبات",
  parents: "حسابات أولياء الأمور",
  tests: "الاختبارات والنتائج",
  preview: "معاينة صفحات المستخدمين",
  permissions: "الأدوار والصلاحيات",
  activity: "سجل العمليات",
  settings: "الإعدادات",
  system: "حالة النظام والنسخ الاحتياطية",
};

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`/api/owner${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(method !== "GET" && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    window.location.href = "/owner/login.html";
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ");
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function openModal(html, className = "") {
  modalRoot.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal-box ${className}">${html}</div></div>`;
  modalRoot.querySelector("#modalOverlay").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlay") closeModal();
  });
}

function confirmAction(message, onConfirm) {
  openModal(`
    <div class="confirm-box">
      <div class="ic">⚠️</div>
      <p>${message}</p>
      <div class="modal-actions" style="justify-content:center">
        <button class="btn btn-outline" id="cancelConfirm">إلغاء</button>
        <button class="btn btn-danger" id="okConfirm">تأكيد</button>
      </div>
    </div>
  `);
  modalRoot.querySelector("#cancelConfirm").addEventListener("click", closeModal);
  modalRoot.querySelector("#okConfirm").addEventListener("click", async () => {
    closeModal();
    try { await onConfirm(); } catch (error) { toast(error.message); }
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------- Routes ----------------
async function renderHome() {
  content.innerHTML = `<div class="stat-grid" id="statGrid"><div class="empty-state">جارٍ التحميل...</div></div>`;
  const s = await api("/summary");
  content.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-icon">👩‍🏫</div><div class="stat-value">${s.teachers}</div><div class="stat-label">حسابات المعلمات (${s.teachersDisabled} معطّلة)</div></div>
      <div class="stat-card"><div class="stat-icon">🎓</div><div class="stat-value">${s.students}</div><div class="stat-label">حسابات الطالبات (${s.studentsDisabled} معطّلة)</div></div>
      <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-value">${s.tests}</div><div class="stat-label">إجمالي الاختبارات</div></div>
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">${s.results}</div><div class="stat-label">إجمالي نتائج الاختبارات</div></div>
      <div class="stat-card"><div class="stat-icon">🏢</div><div class="stat-value">${s.admins || 0}</div><div class="stat-label">حسابات الإداريين</div></div>
      <div class="stat-card"><div class="stat-icon">👪</div><div class="stat-value">${s.parents || 0}</div><div class="stat-label">حسابات أولياء الأمور</div></div>
    </div>
    <div class="card">
      <p class="section-title">مرحبًا بكِ في لوحة مالكة الموقع</p>
      <p style="color:var(--muted); font-size:.9rem">أنتِ مسجلة بدور <strong>OWNER</strong>، وهو أعلى دور في النظام. من هنا يمكنكِ إدارة جميع الحسابات والصلاحيات، معاينة صفحات الأدوار، ومتابعة سجل العمليات دون الاطلاع على كلمات المرور أو رموز الدخول.</p>
    </div>
  `;
}

async function renderTeachers() {
  content.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const teachers = await api("/teachers");
  content.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary btn-sm" id="addTeacherBtn">+ إنشاء حساب معلمة</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${teachers
            .map(
              (t) => `
            <tr>
              <td>${esc(t.name)}</td>
              <td>${esc(t.email)}</td>
              <td>${t.status === "pending" ? '<span class="badge badge-orange">بانتظار الموافقة</span>' : t.status === "disabled" ? '<span class="badge badge-red">معطّل</span>' : '<span class="badge badge-green">نشط</span>'}</td>
              <td>${new Date(t.created_at).toLocaleDateString("ar-SA")}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" data-reset="${t.id}">إعادة تعيين كلمة المرور</button>
                <button class="btn ${t.status === "pending" ? "btn-primary" : "btn-secondary"} btn-sm" data-toggle="${t.id}" data-status="${esc(t.status)}">${t.status === "pending" ? "موافقة وتفعيل" : t.status === "disabled" ? "تفعيل" : "تعطيل"}</button>
                <button class="btn btn-danger btn-sm" data-delete="${t.id}">حذف</button>
              </td>
            </tr>`
            )
            .join("") || `<tr><td colspan="5" class="empty-state">لا توجد حسابات معلمات بعد</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  content.querySelector("#addTeacherBtn").addEventListener("click", () => {
    openModal(`
      <h3>إنشاء حساب معلمة جديد</h3>
      <form id="teacherForm">
        <div class="form-grid full">
          <div class="field"><label>اسم المعلمة</label><input type="text" id="tName" required /></div>
          <div class="field"><label>البريد الإلكتروني</label><div class="owner-school-email" dir="ltr"><input type="text" id="tEmail" inputmode="email" autocomplete="username" placeholder="اسم المستخدم" required /><span>@mkhg.moe.gov.sa</span></div></div>
          <div class="field"><label>كلمة المرور المبدئية</label><input type="password" id="tPass" required minlength="10" placeholder="10 أحرف على الأقل، منها حرف ورقم" /></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="cancelTeacher">إلغاء</button>
          <button type="submit" class="btn btn-primary">إنشاء الحساب</button>
        </div>
      </form>
    `);
    modalRoot.querySelector("#cancelTeacher").addEventListener("click", closeModal);
    modalRoot.querySelector("#teacherForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/teachers", {
          method: "POST",
          body: JSON.stringify({
            name: modalRoot.querySelector("#tName").value,
            email: composeSchoolEmail(modalRoot.querySelector("#tEmail").value),
            password: modalRoot.querySelector("#tPass").value,
          }),
        });
        closeModal();
        toast("تم إنشاء حساب المعلمة");
        renderTeachers();
      } catch (err) {
        toast(err.message);
      }
    });
  });

  content.querySelectorAll("[data-toggle]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const status = btn.dataset.status === "active" ? "disabled" : "active";
      await api(`/teachers/${btn.dataset.toggle}/status`, { method: "PUT", body: JSON.stringify({ status }) });
      toast(status === "active" ? "تمت الموافقة وتفعيل الحساب" : "تم تعطيل الحساب");
      renderTeachers();
    })
  );

  content.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () =>
      confirmAction("سيتم تعطيل حساب المعلمة وحذفه مؤقتًا، مع إمكانية استعادته من إدارة جميع المستخدمين.", async () => {
        await api(`/teachers/${btn.dataset.delete}`, { method: "DELETE" });
        toast("تم الحذف المؤقت للحساب");
        renderTeachers();
      })
    )
  );

  content.querySelectorAll("[data-reset]").forEach((btn) =>
    btn.addEventListener("click", () => {
      openModal(`
        <h3>إعادة تعيين كلمة المرور</h3>
        <form id="resetForm">
          <div class="field"><label>كلمة المرور الجديدة</label><input type="password" id="newPass" required minlength="10" placeholder="10 أحرف على الأقل، منها حرف ورقم" /></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancelReset">إلغاء</button>
            <button type="submit" class="btn btn-primary">حفظ</button>
          </div>
        </form>
      `);
      modalRoot.querySelector("#cancelReset").addEventListener("click", closeModal);
      modalRoot.querySelector("#resetForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await api(`/teachers/${btn.dataset.reset}/reset-password`, {
            method: "PUT",
            body: JSON.stringify({ newPassword: modalRoot.querySelector("#newPass").value }),
          });
          closeModal();
          toast("تم تحديث كلمة المرور");
        } catch (err) {
          toast(err.message);
        }
      });
    })
  );
}

async function renderStudents() {
  content.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const students = await api("/students");
  content.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary btn-sm" id="createStudentBtn">+ إنشاء حساب طالبة</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الفصل</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>
          ${students
            .map(
              (s) => `
            <tr>
              <td>${esc(s.name)}</td>
              <td>${esc(s.email)}</td>
              <td>${esc(s.class_name || "—")}</td>
              <td>${s.status === "disabled" ? '<span class="badge badge-red">معطّل</span>' : '<span class="badge badge-green">نشط</span>'}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" data-reset-student="${s.id}">تعيين كلمة مرور</button>
                <button class="btn btn-secondary btn-sm" data-toggle="${s.id}" data-status="${esc(s.status)}">${s.status === "disabled" ? "تفعيل" : "تعطيل"}</button>
                <button class="btn btn-danger btn-sm" data-delete="${s.id}">حذف</button>
              </td>
            </tr>`
            )
            .join("") || `<tr><td colspan="5" class="empty-state">لا توجد طالبات بعد</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  content.querySelector("#createStudentBtn").onclick = () => openCreateStudentOwnerModal();

  content.querySelectorAll("[data-toggle]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const disabled = btn.dataset.status !== "disabled";
      await api(`/students/${btn.dataset.toggle}/status`, { method: "PUT", body: JSON.stringify({ disabled }) });
      toast(disabled ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
      renderStudents();
    })
  );

  content.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () =>
      confirmAction("سيتم تعطيل حساب الطالبة وحذفه مؤقتًا، مع إمكانية استعادته من إدارة جميع المستخدمين.", async () => {
        await api(`/students/${btn.dataset.delete}`, { method: "DELETE" });
        toast("تم الحذف المؤقت للحساب");
        renderStudents();
      })
    )
  );

  content.querySelectorAll("[data-reset-student]").forEach((btn) =>
    btn.addEventListener("click", () => {
      openModal(`
        <h3>تعيين كلمة مرور مؤقتة للطالبة</h3>
        <form id="studentResetForm">
          <div class="field"><label>كلمة المرور الجديدة</label><input type="password" id="studentNewPass" required minlength="10" placeholder="10 أحرف على الأقل، منها حرف ورقم" /></div>
          <p style="color:var(--muted);font-size:.82rem">سيُطلب من الطالبة تغييرها بعد أول دخول.</p>
          <div class="modal-actions"><button type="button" class="btn btn-outline" id="cancelStudentReset">إلغاء</button><button class="btn btn-primary">حفظ</button></div>
        </form>`);
      modalRoot.querySelector("#cancelStudentReset").onclick = closeModal;
      modalRoot.querySelector("#studentResetForm").onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api(`/students/${btn.dataset.resetStudent}/reset-password`, { method: "PUT", body: JSON.stringify({ newPassword: modalRoot.querySelector("#studentNewPass").value }) });
          closeModal();
          toast("تم تعيين كلمة المرور المؤقتة");
        } catch (error) { toast(error.message); }
      };
    })
  );
}

async function renderTests() {
  content.innerHTML = `<div class="empty-state">جارٍ التحميل...</div>`;
  const tests = await api("/tests");
  content.innerHTML = `
    <div class="card">
      <table>
        <thead><tr><th>العنوان</th><th>المعلمة</th><th>النوع</th><th>الحالة</th><th>عدد النتائج</th><th></th></tr></thead>
        <tbody>
          ${tests
            .map(
              (t) => `
            <tr>
              <td>${esc(t.title)}</td>
              <td>${esc(t.teacher_name)}</td>
              <td>${esc(t.category)}</td>
              <td><span class="badge badge-purple">${esc(t.status)}</span></td>
              <td>${t.results_count}</td>
              <td><button class="btn btn-danger btn-sm" data-delete="${t.id}">حذف</button></td>
            </tr>`
            )
            .join("") || `<tr><td colspan="6" class="empty-state">لا توجد اختبارات بعد</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  content.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () =>
      confirmAction("هل تريدين حذف هذا الاختبار وجميع نتائجه؟", async () => {
        await api(`/tests/${btn.dataset.delete}`, { method: "DELETE" });
        toast("تم الحذف");
        renderTests();
      })
    )
  );
}

async function renderActivity() {
  content.innerHTML = `<div class="empty-state">جارٍ تحميل سجل العمليات...</div>`;
  const logs = await api("/activity-log");
  content.innerHTML = `
    <div class="card activity-intro"><h3>سجل عمليات مالك الموقع والنظام</h3><p>تُعرض هوية المنفذ الحقيقية وعنوان IP ونوع المتصفح، مع إخفاء كلمات المرور والرموز السرية تلقائيًا.</p></div>
    <div class="card table-card"><div class="table-scroll"><table>
      <thead><tr><th>المنفذ</th><th>الإجراء</th><th>وضع المعاينة</th><th>عنوان IP</th><th>التاريخ</th><th>التفاصيل</th></tr></thead>
      <tbody>${logs.map((l,index)=>`
        <tr>
          <td>${l.actor_role === "owner" ? `<span class="badge badge-purple">OWNER</span> ${esc(l.owner_name || "")}` : l.actor_role === "teacher" ? `<span class="badge badge-gray">معلمة</span> ${esc(l.teacher_name || "")}` : l.actor_role === "student" ? `<span class="badge badge-green">طالبة</span> ${esc(l.student_name || "")}` : ["admin","parent"].includes(l.actor_role) ? `<span class="badge badge-orange">${l.actor_role === "admin" ? "إداري" : "ولي أمر"}</span> ${esc(l.platform_name || "")}` : `<span class="badge badge-orange">${esc(l.actor_role || "النظام")}</span>`}</td>
          <td><strong>${esc(l.action)}</strong><small class="cell-sub">${esc(l.details || "")}</small></td>
          <td>${l.preview_role ? `<span class="role-chip role-${String(l.preview_role).toLowerCase()}">${esc(l.preview_role)}</span>` : "—"}</td>
          <td dir="ltr">${esc(l.ip_address || "—")}</td>
          <td>${new Date(l.created_at).toLocaleString("ar-SA")}</td>
          <td><button class="btn btn-outline btn-sm" data-activity-detail="${index}">عرض</button></td>
        </tr>`).join("") || `<tr><td colspan="6" class="empty-state">لا يوجد نشاط بعد</td></tr>`}</tbody>
    </table></div></div>`;
  content.querySelectorAll("[data-activity-detail]").forEach(button=>button.onclick=()=>openActivityDetail(logs[Number(button.dataset.activityDetail)]));
}

function openActivityDetail(log) {
  let before = null, after = null;
  try { before = log.before_data ? JSON.parse(log.before_data) : null; } catch (_) { before = log.before_data; }
  try { after = log.after_data ? JSON.parse(log.after_data) : null; } catch (_) { after = log.after_data; }
  openModal(`<h3>${esc(log.action)}</h3><div class="activity-detail-grid"><div><b>التاريخ والوقت</b><span>${new Date(log.created_at).toLocaleString("ar-SA")}</span></div><div><b>عنوان IP</b><span dir="ltr">${esc(log.ip_address || "—")}</span></div><div class="full-span"><b>الجهاز أو المتصفح</b><span dir="ltr">${esc(log.user_agent || "—")}</span></div><div class="full-span"><b>التفاصيل</b><span>${esc(log.details || "—")}</span></div></div>${before!==null?`<h4>البيانات قبل التعديل</h4><pre class="audit-json">${esc(JSON.stringify(before,null,2))}</pre>`:""}${after!==null?`<h4>البيانات بعد التعديل</h4><pre class="audit-json">${esc(JSON.stringify(after,null,2))}</pre>`:""}<div class="modal-actions"><button class="btn btn-outline" id="closeActivityDetail">إغلاق</button></div>`,"wide-user-modal");
  modalRoot.querySelector("#closeActivityDetail").onclick=closeModal;
}

function ownerStageGrades(stage) {
  return {
    "ابتدائي": ["رابع ابتدائي", "خامس ابتدائي", "سادس ابتدائي"],
    "متوسط": ["أول متوسط", "ثاني متوسط", "ثالث متوسط"],
    "ثانوي": ["أول ثانوي", "ثاني ثانوي", "ثالث ثانوي"],
  }[stage] || [];
}

function openOwnerAccountSettings() {
  openModal(`
    <h3>معلومات مالكة الموقع والحساب</h3>
    <div class="form-grid"><div class="field"><label>الاسم</label><input id="ownerName" value="${esc(currentOwner?.name || "")}"></div><div class="field"><label>البريد الإلكتروني</label><input type="email" id="ownerEmail" value="${esc(currentOwner?.email || "")}" readonly><small class="readonly-email-note">بريد مالكة الموقع محفوظ كما هو ولن تغيّره هذه الإضافة.</small></div></div>
    <button class="btn btn-secondary btn-sm" id="saveOwnerProfile">حفظ الاسم</button>
    <p class="section-title" style="margin-top:24px">تغيير كلمة المرور</p>
    <div class="form-grid"><div class="field"><label>الحالية</label><input type="password" id="ownerCurrentPassword"></div><div class="field"><label>الجديدة</label><input type="password" minlength="10" id="ownerNewPassword"></div><div class="field"><label>تأكيد الجديدة</label><input type="password" minlength="10" id="ownerConfirmPassword"></div></div>
    <div class="modal-actions"><button class="btn btn-outline" id="ownerSecuritySettings">حماية الحساب والمصادقة الثنائية</button><button class="btn btn-outline" id="verifiedOwnerCreation">إنشاء OWNER إضافي موثّق</button><button class="btn btn-outline" id="closeOwnerAccount">إغلاق</button><button class="btn btn-primary" id="saveOwnerPassword">تغيير كلمة المرور</button></div>
  `);
  modalRoot.querySelector("#closeOwnerAccount").onclick = closeModal;
  modalRoot.querySelector("#ownerSecuritySettings").onclick = openOwnerSecuritySettings;
  modalRoot.querySelector("#verifiedOwnerCreation").onclick = openVerifiedOwnerCreation;
  modalRoot.querySelector("#saveOwnerProfile").onclick = async () => {
    try {
      currentOwner = await api("/me", { method: "PUT", body: JSON.stringify({ name: modalRoot.querySelector("#ownerName").value.trim() }) });
      document.getElementById("ownerNameLabel").textContent = currentOwner.name;
      toast("تم حفظ المعلومات");
    } catch (error) { toast(error.message); }
  };
  modalRoot.querySelector("#saveOwnerPassword").onclick = async () => {
    try {
      await api("/me", { method: "PUT", body: JSON.stringify({ currentPassword: modalRoot.querySelector("#ownerCurrentPassword").value, newPassword: modalRoot.querySelector("#ownerNewPassword").value, confirmPassword: modalRoot.querySelector("#ownerConfirmPassword").value }) });
      toast("تم تغيير كلمة المرور");
      closeModal();
    } catch (error) { toast(error.message); }
  };
}

const RESET_COUNT_LABELS = {
  tests: "الاختبارات",
  testModels: "نماذج وأسئلة الاختبارات",
  questionDistributions: "توزيعات الأسئلة",
  attempts: "محاولات الطالبات",
  answers: "إجابات الطالبات",
  gradesAndResults: "الدرجات والنتائج",
  studentAnalyses: "تحليلات الطالبات",
  questionAnalyses: "تحليلات الأسئلة",
  skillAnalyses: "تحليلات المهارات",
  followUpRecords: "سجلات الدرجات والمتابعة",
  weeklyAcademicRecords: "السجلات الدراسية الأسبوعية",
  documents: "المستندات والموارد",
  studentFiles: "ملفات الطالبات",
  parentFiles: "ملفات أولياء الأمور",
  activityRecords: "سجلات الأنشطة المرتبطة بالعام",
  learningStyleCampaigns: "استبانات أنماط التعلم المنشورة",
  learningStyleResults: "نتائج أنماط التعلم",
  physicalFiles: "الملفات الفعلية في التخزين",
  motivationPoints: "نقاط التحفيز",
  notifications: "الإشعارات",
  remedialPlans: "الخطط العلاجية",
};

function resetCountsHtml(counts = {}) {
  return Object.entries(RESET_COUNT_LABELS).map(([key, label]) => `<div class="reset-count-item"><span>${esc(label)}</span><strong>${Number(counts[key] || 0).toLocaleString("ar-SA")}</strong></div>`).join("");
}

function openAcademicResetConfirmation(preview) {
  const deleteItems = [
    { key: "tests", label: "الاختبارات ونماذجها وتوزيعات أسئلتها" },
    { key: "followUp", label: "سجلات المتابعة الدراسية التابعة للعام السابق" },
    { key: "weekly", label: "السجلات الأسبوعية والواجبات والمتابعة" },
    { key: "documents", label: "المستندات وملفات الطالبات المرتبطة بالعام السابق فقط" },
    { key: "learningStyle", label: "نشر ونتائج استبانات أنماط التعلم التابعة للعام السابق" },
    { key: "motivation", label: "نقاط التحفيز" },
    { key: "notifications", label: "الإشعارات" },
    { key: "remedial", label: "الخطط العلاجية" },
  ];
  openModal(`
    <div class="reset-final-modal">
      <div class="danger-modal-icon">⚠️</div>
      <h3>تأكيد نهائي: بدء عام دراسي جديد</h3>
      <p class="danger-lead">هذه العملية نهائية ولا يمكن التراجع عنها بعد تنفيذها. سيُحذف فقط العام <strong>${esc(preview.targetAcademicYear)}</strong>، وسيبقى العام الحالي <strong>${esc(preview.currentAcademicYear)}</strong>.</p>
      <div class="reset-modal-columns">
        <section><h4>البيانات التي ستُحذف</h4><div class="reset-select-grid">${deleteItems.map((item) => `<label class="reset-select-item"><input type="checkbox" data-reset-delete-item="${item.key}" checked> <span>${esc(item.label)}</span></label>`).join("")}</div></section>
        <section class="preserved-list"><h4>البيانات التي ستبقى</h4><ul>${(preview.preserved || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul></section>
      </div>
      <div class="reset-count-grid modal-count-grid">${resetCountsHtml(preview.counts)}</div>
      <label class="field confirmation-field">للتأكيد اكتبي العبارة التالية يدويًا: <b>بدء عام جديد</b><input id="resetConfirmationPhrase" autocomplete="off" placeholder="بدء عام جديد"></label>
      <div id="resetExecutionStatus"></div>
      <div class="modal-actions"><button class="btn btn-outline" id="cancelYearReset">إلغاء</button><button class="btn btn-danger destructive-confirm" id="confirmYearReset" disabled>حذف بيانات العام السابق وبدء العام الجديد</button></div>
    </div>
  `, "wide-reset-modal");
  const phrase = modalRoot.querySelector("#resetConfirmationPhrase");
  const confirm = modalRoot.querySelector("#confirmYearReset");
  const cancel = modalRoot.querySelector("#cancelYearReset");
  phrase.addEventListener("input", () => { confirm.disabled = phrase.value.trim() !== "بدء عام جديد"; });
  cancel.onclick = closeModal;
  confirm.onclick = async () => {
    if (confirm.disabled) return;
    const selectedItems = [...modalRoot.querySelectorAll("[data-reset-delete-item]")]
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.dataset.resetDeleteItem);
    confirm.disabled = true;
    cancel.disabled = true;
    phrase.disabled = true;
    confirm.innerHTML = '<span class="button-spinner"></span> جارٍ تنفيذ الحذف الآمن...';
    modalRoot.querySelector("#resetExecutionStatus").innerHTML = '<div class="reset-loading-message">تُحذف البيانات داخل معاملة آمنة. لا تغلقي الصفحة ولا تعيدي الضغط.</div>';
    try {
      const result = await api("/academic-year/reset", { method: "POST", body: JSON.stringify({ targetAcademicYear: preview.targetAcademicYear, confirmationPhrase: phrase.value.trim(), previewHash: preview.previewHash, selectedItems }) });
      modalRoot.querySelector("#resetExecutionStatus").innerHTML = `<div class="reset-success-message">${esc(result.message)}</div>`;
      confirm.textContent = "تمت العملية بنجاح";
      toast("تم تنفيذ بدء العام الجديد وفق الاختيارات المحددة.");
      setTimeout(() => { closeModal(); renderSettings(); }, 1700);
    } catch (error) {
      modalRoot.querySelector("#resetExecutionStatus").innerHTML = `<div class="reset-error-message">${esc(error.message)}</div>`;
      confirm.textContent = "إعادة المحاولة";
      phrase.disabled = false;
      cancel.disabled = false;
      confirm.disabled = phrase.value.trim() !== "بدء عام جديد";
    }
  };
}

async function renderSettings() {
  content.innerHTML = `<div class="empty-state">جارٍ تحميل إعدادات المدرسة والمدة الدراسية...</div>`;
  const [settings, platformSettings] = await Promise.all([api("/academic-year"), api("/settings")]);
  const registrationEnabled = platformSettings.teacher_registration_enabled !== "false";
  const years = (settings.availableArchiveYears || []).filter((year) => year !== settings.academicYear);
  const targetYear = years.includes(settings.defaultArchiveYear) ? settings.defaultArchiveYear : (years[0] || "");
  const hasArchiveYears = years.length > 0;
  const archiveUnavailableMessage = hasArchiveYears ? "" : '<div class="reset-error-message">لا يوجد عام دراسي سابق في النظام حاليًا. النظام يمنع حذف العام الحالي فقط، لذلك يلزم وجود عام سابق لتفعيل زر بدء العام الجديد.</div>';

  content.innerHTML = `
    <div class="settings-page-head"><div><h3>إعدادات المدرسة والمدة الدراسية</h3><p>هذه الصفحة مخصصة لمالكة الموقع، ومنها تُدار عملية بدء عام دراسي جديد بأمان.</p></div><button class="btn btn-outline" id="openOwnerAccountSettings">إعدادات حساب المالكة</button></div>
    <div class="owner-settings-two-boxes">
      <section class="card academic-period-card">
        <div class="settings-card-heading"><span class="settings-card-icon">🗓️</span><div><h3>إعدادات المدة الدراسية</h3><p>احفظي المدة والفصل الدراسي الحالي بصورة مستقلة.</p></div></div>
        <div id="ownerPeriodMessage"></div>
        <form id="ownerPeriodForm">
          <div class="form-grid full">
            <div class="field"><label>تاريخ بداية المدة الدراسية</label><input type="date" id="ownerPeriodStart" value="${esc(settings.periodStartDate || "")}" required></div>
            <div class="field"><label>تاريخ نهاية المدة الدراسية</label><input type="date" id="ownerPeriodEnd" value="${esc(settings.periodEndDate || "")}" required></div>
            <div class="field"><label>الفصل الدراسي</label><select id="ownerSemester"><option value="first" ${settings.currentSemester === "first" ? "selected" : ""}>الفصل الدراسي الأول</option><option value="second" ${settings.currentSemester === "second" ? "selected" : ""}>الفصل الدراسي الثاني</option></select></div>
          </div>
          <button class="btn btn-primary" id="saveOwnerPeriod">حفظ إعدادات المدة الدراسية</button>
        </form>

        <section class="new-year-danger-zone">
          <div class="danger-zone-title"><span>⚠️</span><div><h4>بدء عام دراسي جديد</h4><p>الحذف نهائي ويقتصر على بيانات العام السابق المحدد فقط.</p></div></div>
          <label class="field"><span>العام الدراسي السابق المراد أرشفته وحذفه</span><select id="archiveYearSelect">${years.length ? years.map((year) => `<option value="${esc(year)}" ${year === targetYear ? "selected" : ""}>${esc(year)}</option>`).join("") : '<option value="">لا توجد بيانات لعام سابق</option>'}</select></label>
          <div class="reset-count-grid" id="resetCountGrid"><div class="reset-count-placeholder">اختاري عامًا سابقًا لعرض البيانات التي ستُحذف.</div></div>
          <div id="resetPreviewMessage">${archiveUnavailableMessage}</div>
          <div class="danger-actions"><button class="btn btn-outline" id="refreshResetPreview" ${hasArchiveYears ? "" : "disabled"}>تحديث أعداد البيانات</button><a class="btn btn-outline" id="downloadFullBackup" href="/api/owner/academic-year/backup?year=${encodeURIComponent(targetYear)}" ${hasArchiveYears ? "" : 'aria-disabled="true"'}>تحميل نسخة احتياطية كاملة</a><button class="btn btn-danger destructive-button" id="startNewAcademicYear" ${hasArchiveYears ? "" : "disabled"}>حذف الاختبارات والدرجات والتحليلات وبدء عام جديد</button></div>
          <p class="irreversible-warning">لا يمكن التراجع عن عملية الحذف بعد نجاحها. حمّلي النسخة الاحتياطية قبل التنفيذ.</p>
        </section>
      </section>

      <section class="card school-settings-card">
        <div class="settings-card-heading"><span class="settings-card-icon">🏫</span><div><h3>إعدادات المدرسة</h3><p>تُستخدم تلقائيًا في رؤوس وتذييلات جميع التقارير وملفات PDF.</p></div></div>
        <div id="ownerSchoolMessage"></div>
        <form id="ownerSchoolForm">
          <div class="form-grid">
            <div class="field"><label>إدارة التعليم</label><input id="ownerEducationDepartment" value="${esc(settings.educationDepartment || "")}" required></div>
            <div class="field"><label>مكتب التعليم</label><input id="ownerEducationOffice" value="${esc(settings.educationOffice || "")}"></div>
            <div class="field"><label>اسم المدرسة</label><input id="ownerSchoolName" value="${esc(settings.schoolName || "")}" required></div>
            <div class="field"><label>اسم مديرة المدرسة</label><input id="ownerLeaderName" value="${esc(settings.schoolLeaderName || "")}"></div>
            <div class="field"><label>العام الدراسي الحالي/الجديد</label><input id="ownerAcademicYear" value="${esc(settings.academicYear || "")}" placeholder="مثال: ١٤٤٨هـ" required></div>
          </div>
          <div class="school-logo-settings"><h4>شعارات التقارير والطباعة</h4><div class="logo-preview-grid"><div class="logo-preview-card"><img src="${esc(settings.madarLogoUrl || "/assets/print/madar-logo.svg")}" alt="شعار مدار"><span>شعار مدار الأصلي</span></div><div class="logo-preview-card"><img src="${esc(settings.visionLogoUrl || "/vision-2030-logo.png")}" alt="شعار رؤية السعودية 2030"><span>شعار رؤية السعودية ٢٠٣٠</span></div>${settings.additionalLogoUrl ? `<div class="logo-preview-card optional-logo-card"><img src="${esc(settings.additionalLogoUrl)}" alt="الشعار الإضافي"><span>${esc(settings.additionalLogoName || "الشعار الإضافي")}</span>${settings.additionalLogoUrl ? '<button type="button" class="btn btn-danger btn-sm" id="deleteOwnerAdditionalLogo">حذف الشعار</button>' : ''}</div>` : ""}</div><div class="optional-logo-upload"><label class="field">شعار المدرسة الإضافي<input type="file" id="setOwnerAdditionalLogo" accept="image/png,image/jpeg,image/webp" /></label><button class="btn btn-outline" type="button" id="uploadOwnerAdditionalLogo">إضافة شعار المدرسة</button></div><p class="settings-help">يظهر في التقارير والطباعة شعار مدار وشعار رؤية السعودية 2030، مع الشعار الإضافي إن وُجد.</p></div>
          <button class="btn btn-primary" id="saveOwnerSchool">حفظ إعدادات المدرسة</button>
        </form>
        <div class="platform-setting-row"><span>السماح للمعلمات بإنشاء حساب جديد من صفحة الدخول</span><button class="btn btn-sm ${registrationEnabled ? "btn-danger" : "btn-primary"}" id="toggleRegistration">${registrationEnabled ? "تعطيل الإنشاء" : "تفعيل الإنشاء"}</button></div>
      </section>
    </div>
  `;

  content.querySelector("#openOwnerAccountSettings").onclick = openOwnerAccountSettings;

  content.querySelector("#ownerPeriodForm").onsubmit = async (event) => {
    event.preventDefault(); const button = content.querySelector("#saveOwnerPeriod"); const message = content.querySelector("#ownerPeriodMessage"); button.disabled = true;
    try { await api("/academic-year/period", { method: "PUT", body: JSON.stringify({ periodStartDate: content.querySelector("#ownerPeriodStart").value, periodEndDate: content.querySelector("#ownerPeriodEnd").value, currentSemester: content.querySelector("#ownerSemester").value }) }); message.innerHTML = '<div class="form-success">تم حفظ إعدادات المدة الدراسية.</div>'; toast("تم حفظ إعدادات المدة الدراسية"); }
    catch (error) { message.innerHTML = `<div class="form-error">${esc(error.message)}</div>`; } finally { button.disabled = false; }
  };
  content.querySelector("#ownerSchoolForm").onsubmit = async (event) => {
    event.preventDefault(); const button = content.querySelector("#saveOwnerSchool"); const message = content.querySelector("#ownerSchoolMessage"); button.disabled = true;
    try { await api("/academic-year/school", { method: "PUT", body: JSON.stringify({ educationDepartment: content.querySelector("#ownerEducationDepartment").value.trim(), educationOffice: content.querySelector("#ownerEducationOffice").value.trim(), schoolName: content.querySelector("#ownerSchoolName").value.trim(), schoolLeaderName: content.querySelector("#ownerLeaderName").value.trim(), academicYear: content.querySelector("#ownerAcademicYear").value.trim() }) }); message.innerHTML = '<div class="form-success">تم حفظ إعدادات المدرسة.</div>'; toast("تم حفظ إعدادات المدرسة"); setTimeout(renderSettings, 600); }
    catch (error) { message.innerHTML = `<div class="form-error">${esc(error.message)}</div>`; } finally { button.disabled = false; }
  };
  content.querySelector("#uploadOwnerAdditionalLogo").onclick = async () => {
    const input = content.querySelector("#setOwnerAdditionalLogo");
    if (!input.files?.[0]) { toast("اختاري صورة للشعار الإضافي."); return; }
    const button = content.querySelector("#uploadOwnerAdditionalLogo");
    button.disabled = true;
    const form = new FormData();
    form.append("file", input.files[0]);
    try {
      await api("/academic-year/additional-logo", { method: "POST", body: form });
      toast("تم رفع شعار المدرسة الإضافي.");
      renderSettings();
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  };
  const deleteOwnerAdditionalLogo = content.querySelector("#deleteOwnerAdditionalLogo");
  if (deleteOwnerAdditionalLogo) {
    deleteOwnerAdditionalLogo.onclick = () => confirmAction("هل تريدين حذف شعار المدرسة الإضافي؟", async () => {
      await api("/academic-year/additional-logo", { method: "DELETE" });
      toast("تم حذف شعار المدرسة الإضافي.");
      renderSettings();
    });
  }
  const archiveSelect = content.querySelector("#archiveYearSelect");
  const previewButton = content.querySelector("#refreshResetPreview");
  const resetButton = content.querySelector("#startNewAcademicYear");
  const backupLink = content.querySelector("#downloadFullBackup");
  const loadPreview = async () => {
    const year = archiveSelect.value; if (!year) return;
    previewButton.disabled = true; resetButton.disabled = true; content.querySelector("#resetPreviewMessage").innerHTML = '<div class="reset-loading-message">جارٍ فحص العلاقات وحساب البيانات المرتبطة بالعام السابق...</div>';
    try { currentPreview = await api(`/academic-year/preview?year=${encodeURIComponent(year)}`); content.querySelector("#resetCountGrid").innerHTML = resetCountsHtml(currentPreview.counts); content.querySelector("#resetPreviewMessage").innerHTML = '<div class="reset-preview-safe">تم الفحص. الحسابات والإيميلات وبنوك الأسئلة غير داخلة في الحذف.</div>'; resetButton.disabled = false; }
    catch (error) { currentPreview = null; content.querySelector("#resetPreviewMessage").innerHTML = `<div class="reset-error-message">${esc(error.message)}</div>`; }
    finally { previewButton.disabled = false; }
  };
  archiveSelect.onchange = () => { const year = archiveSelect.value; backupLink.href = `/api/owner/academic-year/backup?year=${encodeURIComponent(year)}`; resetButton.disabled = true; currentPreview = null; if (year) loadPreview(); };
  previewButton.onclick = loadPreview;
  resetButton.onclick = async () => { if (!currentPreview || currentPreview.targetAcademicYear !== archiveSelect.value) await loadPreview(); if (currentPreview) openAcademicResetConfirmation(currentPreview); };
  if (!hasArchiveYears) {
    content.querySelector("#resetCountGrid").innerHTML = '<div class="reset-count-placeholder">لا توجد بيانات لعام سابق، لذلك لا يمكن بدء العام الجديد من هذا التابع.</div>';
  } else if (archiveSelect.value) loadPreview();
}



const ROLE_NAMES = { OWNER: "مالك الموقع", ADMIN: "إداري", TEACHER: "معلم", STUDENT: "طالب", PARENT: "ولي أمر" };
const STATUS_NAMES = { active: "نشط", disabled: "معطّل", pending: "بانتظار الموافقة", deleted: "محذوف مؤقتًا" };
let ownerUsersMeta = null;

function userStatusBadge(user) {
  if (user.deleted_at) return '<span class="badge badge-red">محذوف مؤقتًا</span>';
  if (user.status === "active") return '<span class="badge badge-green">نشط</span>';
  if (user.status === "pending") return '<span class="badge badge-orange">بانتظار الموافقة</span>';
  return '<span class="badge badge-red">معطّل</span>';
}

async function loadUsersTable() {
  const q = content.querySelector("#ownerUserSearch")?.value.trim() || "";
  const role = content.querySelector("#ownerUserRoleFilter")?.value || "";
  const status = content.querySelector("#ownerUserStatusFilter")?.value || "";
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  const data = await api(`/users?${params.toString()}`);
  const tbody = content.querySelector("#ownerUsersBody");
  if (!tbody) return;
  tbody.innerHTML = data.items.map((u) => `
    <tr>
      <td><strong>${esc(u.name)}</strong><small class="cell-sub">${esc(u.subject_type)} #${u.id}</small></td>
      <td>${esc(u.emailDisplay || u.email)}</td>
      <td><span class="role-chip role-${String(u.role_code).toLowerCase()}">${esc(u.roleName || ROLE_NAMES[u.role_code] || u.role_code)}</span></td>
      <td>${userStatusBadge(u)}</td>
      <td>${u.last_login_at ? new Date(u.last_login_at).toLocaleString("ar-SA") : "—"}</td>
      <td><button class="btn btn-outline btn-sm" data-user-detail="${esc(u.subject_type)}:${u.id}">${u.isProtected ? "عرض الحساب المحمي" : "عرض وإدارة"}</button></td>
    </tr>`).join("") || '<tr><td colspan="6" class="empty-state">لا توجد نتائج مطابقة.</td></tr>';
  tbody.querySelectorAll("[data-user-detail]").forEach((button) => button.onclick = () => {
    const [type, id] = button.dataset.userDetail.split(":");
    openOwnerUserDetails(type, Number(id));
  });
}

async function renderUsers(presetRole = "") {
  content.innerHTML = '<div class="empty-state">جارٍ تحميل المستخدمين والصلاحيات...</div>';
  ownerUsersMeta = await api("/users/meta");
  content.innerHTML = `
    <div class="owner-rbac-intro card">
      <div><span class="owner-role-seal">OWNER</span><h3>إدارة المستخدمين من مكان واحد</h3><p>لا تعرض المنصة كلمات المرور أو <code>password_hash</code>. المتاح فقط هو إعادة تعيين كلمة المرور، والتعطيل أو الحذف المؤقت ثم الاستعادة.</p></div>
      <button class="btn btn-primary" id="createAnyUser">+ إنشاء مستخدم</button>
    </div>
    <div class="toolbar owner-user-filters">
      <input id="ownerUserSearch" class="toolbar-input" placeholder="بحث بالاسم أو البريد الإلكتروني">
      <select id="ownerUserRoleFilter"><option value="">جميع الأدوار</option>${Object.entries(ownerUsersMeta.roles).map(([code,name])=>`<option value="${code}">${esc(name)}</option>`).join("")}</select>
      <select id="ownerUserStatusFilter"><option value="">الحسابات الحالية</option><option value="active">نشط</option><option value="disabled">معطّل</option><option value="pending">بانتظار الموافقة</option><option value="deleted">المحذوفة مؤقتًا</option></select>
      <button class="btn btn-outline btn-sm" id="refreshOwnerUsers">تحديث</button>
    </div>
    <div class="card table-card"><div class="table-scroll"><table><thead><tr><th>المستخدم</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th>الإجراءات</th></tr></thead><tbody id="ownerUsersBody"><tr><td colspan="6" class="empty-state">جارٍ التحميل...</td></tr></tbody></table></div></div>`;
  content.querySelector("#createAnyUser").onclick = openCreateOwnerUser;
  content.querySelector("#refreshOwnerUsers").onclick = loadUsersTable;
  let timer;
  content.querySelector("#ownerUserSearch").oninput = () => { clearTimeout(timer); timer = setTimeout(loadUsersTable, 260); };
  content.querySelector("#ownerUserRoleFilter").onchange = loadUsersTable;
  content.querySelector("#ownerUserStatusFilter").onchange = loadUsersTable;

  if (presetRole) {
    content.querySelector("#ownerUserRoleFilter").value = presetRole;
  }

  await loadUsersTable();
}

async function renderParents() {
  content.innerHTML = '<div class="empty-state">جارٍ تحميل حسابات أولياء الأمور...</div>';
  const data = await api("/users?role=PARENT");
  content.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn btn-primary btn-sm" id="createParentBtn">+ إنشاء حساب ولي أمر</button>
    </div>
    <div class="card table-card">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>البريد الإلكتروني</th>
              <th>الحالة</th>
              <th>تاريخ الإنشاء</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((u) => `
              <tr>
                <td><strong>${esc(u.name)}</strong></td>
                <td>${esc(u.emailDisplay || u.email)}</td>
                <td>${userStatusBadge(u)}</td>
                <td>${new Date(u.created_at).toLocaleDateString("ar-SA")}</td>
                <td style="display:flex; gap:6px; flex-wrap:wrap">
                  <button class="btn btn-outline btn-sm" data-parent-link="${u.id}">ربط</button>
                  <button class="btn btn-outline btn-sm" data-reset="${u.id}">إعادة تعيين كلمة المرور</button>
                  <button class="btn ${u.status === "active" ? "btn-secondary" : "btn-primary"} btn-sm" data-toggle="${u.id}" data-status="${esc(u.status)}">${u.status === "active" ? "تعطيل" : "تفعيل"}</button>
                  <button class="btn btn-danger btn-sm" data-delete="${u.id}">حذف</button>
                </td>
              </tr>
            `).join("") || '<tr><td colspan="5" class="empty-state">لا توجد حسابات أولياء أمور بعد.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  content.querySelector("#createParentBtn").onclick = () => openCreateOwnerUser("PARENT");

  content.querySelectorAll("[data-parent-link]").forEach((button) => {
    button.onclick = async () => openParentLinksModal(Number(button.dataset.parentLink));
  });

  content.querySelectorAll("[data-reset]").forEach((button) => {
    button.onclick = () => openSimplePasswordReset("platform", Number(button.dataset.reset));
  });

  content.querySelectorAll("[data-toggle]").forEach((button) => {
    button.onclick = async () => {
      const id = Number(button.dataset.toggle);
      const nextStatus = button.dataset.status === "active" ? "disabled" : "active";
      try {
        await api(`/users/platform/${id}`, { method: "PUT", body: JSON.stringify({ status: nextStatus }) });
        toast(nextStatus === "active" ? "تم تفعيل حساب ولي الأمر" : "تم تعطيل حساب ولي الأمر");
        renderParents();
      } catch (error) {
        toast(error.message);
      }
    };
  });

  content.querySelectorAll("[data-delete]").forEach((button) => {
    button.onclick = () => confirmAction("هل تريدين حذف حساب ولي الأمر مؤقتًا؟", async () => {
      await api(`/users/platform/${button.dataset.delete}/soft-delete`, { method: "DELETE" });
      toast("تم حذف حساب ولي الأمر مؤقتًا");
      renderParents();
    });
  });
}

async function openParentLinksModal(parentId) {
  try {
    const data = await api(`/users/platform/${parentId}`);
    const children = Array.isArray(data.children) ? data.children : [];
    openModal(`
      <div class="confirm-box" style="max-width:680px">
        <div class="ic">👩‍🎓</div>
        <h3>الطالبات المرتبطات بولي الأمر</h3>
        <p class="safe-note">هذه قائمة بإيميلات الطالبات اللاتي يتابعهن هذا الحساب، ويُعرفن في النظام باسم بنات ولي الأمر.</p>
        ${children.length ? `
          <div class="impact-grid">
            ${children.map((child) => `
              <div>
                <span>${esc(child.name || "—")}</span>
                <b dir="ltr">${esc(child.email || "—")}</b>
              </div>
            `).join("")}
          </div>
        ` : '<p class="safe-note">لا توجد طالبات مرتبطة بهذا الحساب بعد.</p>'}
        <div class="modal-actions" style="justify-content:center">
          <button class="btn btn-outline" id="closeParentLinks">إغلاق</button>
        </div>
      </div>
    `);
    modalRoot.querySelector("#closeParentLinks").onclick = closeModal;
  } catch (error) {
    toast(error.message);
  }
}

function classOptions(selected = "") {
  return (ownerUsersMeta?.classes || []).map((c) => `<option value="${c.id}" ${String(c.id)===String(selected)?"selected":""}>${esc(c.stage)} — ${esc(c.grade_label)} — الفصل ${esc(c.name)} (${esc(c.teacher_name)})</option>`).join("");
}

async function openCreateStudentOwnerModal() {
  if (!ownerUsersMeta) {
    ownerUsersMeta = await api("/users/meta");
  }
  openModal(`
    <h3>إنشاء حساب طالبة جديد</h3>
    <form id="studentCreateForm">
      <div class="form-grid full">
        <div class="field">
          <label>الدور</label>
          <input type="text" value="طالبة" readonly aria-readonly="true" />
        </div>
        <div class="field"><label>اسم الطالبة</label><input type="text" id="studentName" required /></div>
        <div class="field"><label>اسم المستخدم المدرسي</label><div class="owner-school-email" dir="ltr"><input type="text" id="studentEmail" inputmode="email" autocomplete="username" placeholder="اسم المستخدم" required /><span>@mkhg.moe.gov.sa</span></div></div>
        <div class="field"><label>الفصل</label><select id="studentClass" required><option value="">اختاري الفصل</option>${classOptions()}</select></div>
        <div class="field"><label>كلمة المرور المبدئية</label><input type="password" id="studentPassword" required minlength="10" placeholder="10 أحرف على الأقل، منها حرف ورقم" /></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-outline" id="cancelStudentCreate">إلغاء</button>
        <button type="submit" class="btn btn-primary">إنشاء الحساب</button>
      </div>
    </form>
  `);
  modalRoot.querySelector("#cancelStudentCreate").onclick = closeModal;
  modalRoot.querySelector("#studentCreateForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          roleCode: "STUDENT",
          name: modalRoot.querySelector("#studentName").value.trim(),
          email: composeSchoolEmail(modalRoot.querySelector("#studentEmail").value),
          password: modalRoot.querySelector("#studentPassword").value,
          classId: modalRoot.querySelector("#studentClass").value || null,
        }),
      });
      closeModal();
      toast("تم إنشاء حساب الطالبة");
      renderStudents();
    } catch (error) {
      toast(error.message);
    }
  };
}

async function openCreateOwnerUser(presetRole = "") {
  if (!ownerUsersMeta) {
    ownerUsersMeta = await api("/users/meta");
  }
  openModal(`
    <h3>إنشاء حساب جديد</h3>
    <form id="createOwnerUserForm">
      <div class="form-grid">
        <div class="field"><label>الدور</label><select id="newUserRole" required>${Object.entries(ownerUsersMeta.creatableRoles).map(([code,name])=>`<option value="${code}" ${presetRole===code?"selected":""}>${esc(name)}</option>`).join("")}</select></div>
        <div class="field"><label>الاسم</label><input id="newUserName" required></div>
        <div class="field" id="newUserEmailWrap"><label>اسم المستخدم المدرسي</label><div class="owner-school-email" dir="ltr"><input id="newUserEmail" required placeholder="اسم المستخدم"><span>@mkhg.moe.gov.sa</span></div><small id="newUserEmailHelp">لا يُطلب البريد عند اختيار ولي أمر.</small></div>
        <div class="field"><label>كلمة المرور المبدئية</label><input type="password" id="newUserPassword" minlength="10" required></div>
        <div class="field full-span" id="newUserClassWrap" hidden><label>فصل الطالبة</label><select id="newUserClass"><option value="">اختاري الفصل</option>${classOptions()}</select></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="cancelCreateUser">إلغاء</button><button class="btn btn-primary" type="submit">إنشاء الحساب</button></div>
    </form>`);
  const role = modalRoot.querySelector("#newUserRole");
  const classWrap = modalRoot.querySelector("#newUserClassWrap");
  const emailWrap = modalRoot.querySelector("#newUserEmailWrap");
  const emailInput = modalRoot.querySelector("#newUserEmail");
  const sync = () => {
    classWrap.hidden = role.value !== "STUDENT";
    emailWrap.hidden = role.value === "PARENT";
    emailInput.required = role.value !== "PARENT";
  };
  role.onchange = sync; sync();
  modalRoot.querySelector("#cancelCreateUser").onclick = closeModal;
  modalRoot.querySelector("#createOwnerUserForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        roleCode: role.value,
        name: modalRoot.querySelector("#newUserName").value.trim(),
        password: modalRoot.querySelector("#newUserPassword").value,
        classId: modalRoot.querySelector("#newUserClass").value || null,
      };
      if (role.value !== "PARENT") payload.email = composeSchoolEmail(modalRoot.querySelector("#newUserEmail").value);
      await api("/users", { method:"POST", body:JSON.stringify(payload) });
      closeModal(); toast("تم إنشاء الحساب وتطبيق الدور المحدد"); loadUsersTable();
      if (role.value === "STUDENT") renderStudents();
      if (role.value === "PARENT") renderParents();
    } catch (error) { toast(error.message); }
  };
}

async function openOwnerUserDetails(subjectType, id) {
  try {
    const data = await api(`/users/${subjectType}/${id}`);
    const u = data.user;
    const protectedOwner = u.role_code === "OWNER";
    const impactItems = Object.values(data.impact.items || {}).filter((item)=>Number(item.count)>0);
    openModal(`
      <div class="user-detail-head"><div><span class="role-chip role-${String(u.role_code).toLowerCase()}">${esc(ROLE_NAMES[u.role_code] || u.role_code)}</span><h3>${esc(u.name)}</h3><p>${u.role_code === "PARENT" ? "الدخول بالاسم الأول والأخير" : `<span dir="ltr">${esc(u.email)}</span>`}</p></div>${protectedOwner?'<span class="protected-owner-badge">🛡️ حساب محمي</span>':''}</div>
      <div class="impact-summary"><strong>تأثير الحذف</strong><span>${Number(data.impact.linkedRecords || 0).toLocaleString("ar-SA")} سجل مرتبط</span><span>${Number(data.impact.files || 0).toLocaleString("ar-SA")} ملف فعلي</span></div>
      ${impactItems.length ? `<div class="impact-grid">${impactItems.map(item=>`<div><span>${esc(item.label)}</span><b>${Number(item.count).toLocaleString("ar-SA")}</b></div>`).join("")}</div>` : '<p class="safe-note">لا توجد سجلات مرتبطة مباشرة بهذا الحساب.</p>'}
      ${protectedOwner ? '<p class="protected-message">لا يمكن تعديل دور OWNER أو تعطيله أو حذفه من إدارة المستخدمين. ويُعدّل الحساب من إعدادات مالك الموقع فقط.</p>' : `
      <form id="editOwnerUserForm">
        <div class="form-grid"><div class="field"><label>الاسم</label><input id="editUserName" value="${esc(u.name)}"></div>${u.role_code === "PARENT" ? "" : `<div class="field"><label>البريد</label><input id="editUserEmail" dir="ltr" value="${esc(u.email)}"></div>`}<div class="field"><label>الحالة</label><select id="editUserStatus"><option value="active" ${u.status==='active'?'selected':''}>نشط</option><option value="disabled" ${u.status==='disabled'?'selected':''}>معطّل</option></select></div></div>
        <div class="modal-actions"><button type="submit" class="btn btn-primary">حفظ البيانات</button></div>
      </form>
      <div class="user-security-actions">
        <button class="btn btn-outline btn-sm" id="resetAnyUserPassword">إعادة تعيين كلمة المرور</button>
        <button class="btn btn-outline btn-sm" id="changeAnyUserRole">نقل إلى دور آخر</button>
        ${u.deleted_at ? '<button class="btn btn-secondary btn-sm" id="restoreAnyUser">استعادة الحساب</button><button class="btn btn-danger btn-sm" id="permanentDeleteAnyUser">حذف نهائي</button>' : '<button class="btn btn-danger btn-sm" id="softDeleteAnyUser">حذف مؤقت</button>'}
      </div>`}
      <div class="modal-actions"><button class="btn btn-outline" id="closeUserDetails">إغلاق</button></div>
    `, "wide-user-modal");
    modalRoot.querySelector("#closeUserDetails").onclick = closeModal;
    if (protectedOwner) return;
    modalRoot.querySelector("#editOwnerUserForm").onsubmit = async (event) => {
      event.preventDefault();
      try { const payload={name:modalRoot.querySelector("#editUserName").value.trim(),status:modalRoot.querySelector("#editUserStatus").value}; const emailField=modalRoot.querySelector("#editUserEmail"); if(emailField) payload.email=emailField.value.trim(); await api(`/users/${subjectType}/${id}`, {method:"PUT",body:JSON.stringify(payload)}); toast("تم تحديث بيانات المستخدم"); closeModal(); loadUsersTable(); } catch(error){ toast(error.message); }
    };
    modalRoot.querySelector("#resetAnyUserPassword").onclick = () => openSimplePasswordReset(subjectType,id);
    modalRoot.querySelector("#changeAnyUserRole").onclick = () => openRoleTransfer(subjectType,id,u.role_code,data.impact);
    const soft = modalRoot.querySelector("#softDeleteAnyUser");
    if (soft) soft.onclick = () => confirmAction(`سيُعطّل حساب ${esc(u.name)} ويُحذف مؤقتًا مع بقاء بياناته قابلة للاستعادة.`, async()=>{await api(`/users/${subjectType}/${id}/soft-delete`,{method:"DELETE"});toast("تم الحذف المؤقت");closeModal();loadUsersTable();});
    const restore = modalRoot.querySelector("#restoreAnyUser");
    if (restore) restore.onclick = async()=>{try{await api(`/users/${subjectType}/${id}/restore`,{method:"POST",body:"{}"});toast("تمت استعادة الحساب");closeModal();loadUsersTable();}catch(error){toast(error.message)}};
    const permanent = modalRoot.querySelector("#permanentDeleteAnyUser");
    if (permanent) permanent.onclick = () => openPermanentUserDelete(subjectType,id,u,data.impact);
  } catch (error) { toast(error.message); }
}

function openSimplePasswordReset(subjectType,id) {
  openModal(`<h3>إعادة تعيين كلمة المرور</h3><p class="safe-note">لن تظهر كلمة المرور الحالية أو قيمة التشفير. اكتبي كلمة مرور جديدة فقط.</p><div class="field"><label>كلمة المرور الجديدة</label><input type="password" id="genericNewPassword" minlength="10"></div><div class="modal-actions"><button class="btn btn-outline" id="cancelGenericReset">إلغاء</button><button class="btn btn-primary" id="confirmGenericReset">حفظ</button></div>`);
  modalRoot.querySelector("#cancelGenericReset").onclick=closeModal;
  modalRoot.querySelector("#confirmGenericReset").onclick=async()=>{try{await api(`/users/${subjectType}/${id}/reset-password`,{method:"PUT",body:JSON.stringify({newPassword:modalRoot.querySelector("#genericNewPassword").value})});toast("تمت إعادة تعيين كلمة المرور");closeModal();}catch(error){toast(error.message)}};
}

function openRoleTransfer(subjectType,id,currentRole,impact) {
  const roles=Object.entries(ownerUsersMeta.creatableRoles).filter(([code])=>code!==currentRole);
  openModal(`<h3>نقل المستخدم إلى دور آخر</h3><p class="danger-lead">تتطلب العملية كلمة مرور مالك الموقع. إذا كان للحساب سجلات مرتبطة فلن يسمح الخادم بالنقل حتى لا تضيع العلاقات.</p><div class="form-grid full"><div class="field"><label>الدور الجديد</label><select id="transferRole">${roles.map(([code,name])=>`<option value="${code}">${esc(name)}</option>`).join("")}</select></div><div class="field" id="transferClassWrap" hidden><label>فصل الطالبة</label><select id="transferClass"><option value="">اختاري الفصل</option>${classOptions()}</select></div><div class="field"><label>كلمة مرور مالك الموقع</label><input type="password" id="transferOwnerPassword"></div></div><div class="modal-actions"><button class="btn btn-outline" id="cancelTransfer">إلغاء</button><button class="btn btn-primary" id="confirmTransfer">تنفيذ النقل</button></div>`);
  const role=modalRoot.querySelector("#transferRole"), wrap=modalRoot.querySelector("#transferClassWrap");
  const sync=()=>wrap.hidden=role.value!=="STUDENT";role.onchange=sync;sync();
  modalRoot.querySelector("#cancelTransfer").onclick=closeModal;
  modalRoot.querySelector("#confirmTransfer").onclick=async()=>{try{await api(`/users/${subjectType}/${id}/role`,{method:"PUT",body:JSON.stringify({roleCode:role.value,classId:modalRoot.querySelector("#transferClass").value||null,currentPassword:modalRoot.querySelector("#transferOwnerPassword").value})});toast("تم تغيير الدور بأمان");closeModal();loadUsersTable();}catch(error){toast(error.message)}};
}

function openPermanentUserDelete(subjectType,id,user,impact) {
  openModal(`<div class="confirm-box"><div class="ic">⛔</div><h3>حذف نهائي لا يمكن التراجع عنه</h3><p>سيُحذف الحساب وقرابة <strong>${Number(impact.linkedRecords||0).toLocaleString("ar-SA")}</strong> سجل و<strong>${Number(impact.files||0).toLocaleString("ar-SA")}</strong> ملف مرتبط به.</p><div class="form-grid full"><div class="field"><label>كلمة مرور مالك الموقع</label><input type="password" id="permanentOwnerPassword"></div><div class="field"><label>اكتبي: حذف نهائي</label><input id="permanentDeletePhrase"></div></div><div class="modal-actions"><button class="btn btn-outline" id="cancelPermanentDelete">إلغاء</button><button class="btn btn-danger" id="confirmPermanentDelete" disabled>حذف نهائي</button></div></div>`);
  const phrase=modalRoot.querySelector("#permanentDeletePhrase"), button=modalRoot.querySelector("#confirmPermanentDelete");
  phrase.oninput=()=>button.disabled=phrase.value.trim()!=="حذف نهائي";
  modalRoot.querySelector("#cancelPermanentDelete").onclick=closeModal;
  button.onclick=async()=>{button.disabled=true;try{await api(`/users/${subjectType}/${id}/permanent-delete`,{method:"DELETE",body:JSON.stringify({currentPassword:modalRoot.querySelector("#permanentOwnerPassword").value,confirmation:phrase.value.trim()})});toast("تم الحذف النهائي");closeModal();loadUsersTable();}catch(error){toast(error.message);button.disabled=false}};
}

async function renderPermissions() {
  content.innerHTML='<div class="empty-state">جارٍ تحميل مصفوفة الصلاحيات...</div>';
  const data=await api("/permissions");
  const categories=[...new Set(data.catalog.map(p=>p.category))];
  content.innerHTML=`<div class="card owner-rbac-intro"><div><span class="owner-role-seal">RBAC</span><h3>نظام الصلاحيات المركزي</h3><p>دور OWNER ثابت بأعلى صلاحيات ولا يمكن لأي مستخدم تخفيضه أو منح نفسه هذا الدور.</p></div></div><div class="permission-role-grid">${Object.entries(data.roles).map(([code,role])=>`<section class="card permission-role-card" data-role-card="${code}"><div class="permission-role-head"><div><h3>${esc(role.name)}</h3><code>${code}</code></div>${role.immutable?'<span class="protected-owner-badge">كامل ومحمي</span>':'<button class="btn btn-primary btn-sm" data-save-role="'+code+'">حفظ الصلاحيات</button>'}</div>${categories.map(category=>`<fieldset><legend>${esc(category)}</legend>${data.catalog.filter(p=>p.category===category).map(p=>`<label><input type="checkbox" value="${p.code}" ${role.permissions.includes(p.code)?'checked':''} ${role.immutable?'disabled':''}><span>${esc(p.name)}</span></label>`).join("")}</fieldset>`).join("")}</section>`).join("")}</div>`;
  content.querySelectorAll("[data-save-role]").forEach(button=>button.onclick=async()=>{const card=content.querySelector(`[data-role-card="${button.dataset.saveRole}"]`);const permissions=[...card.querySelectorAll('input:checked')].map(i=>i.value);button.disabled=true;try{await api(`/permissions/${button.dataset.saveRole}`,{method:"PUT",body:JSON.stringify({permissions})});toast("تم حفظ صلاحيات الدور");}catch(error){toast(error.message)}finally{button.disabled=false}});
}

async function renderPreview() {
  content.innerHTML='<div class="empty-state">جارٍ تحميل حسابات المعاينة...</div>';
  const options=await api("/preview/options");
  const configs=[
    ["ADMIN","عرض صفحات الإداري","🏢",options.admins,true],
    ["TEACHER","عرض صفحات المعلم","👩‍🏫",options.teachers,false],
    ["STUDENT","عرض صفحات الطالب","🎓",options.students,false],
    ["PARENT","عرض صفحات ولي الأمر","👪",options.parents,true],
  ];
  content.innerHTML=`<div class="card preview-intro"><h3>معاينة صفحات المستخدمين دون معرفة كلمات المرور</h3><p>تبقى هوية المنفذ الحقيقية هي هوية OWNER، ويظهر شريط واضح أعلى الصفحة، وتُسجل بداية المعاينة ونهايتها في سجل العمليات.</p></div><div class="preview-role-grid">${configs.map(([code,title,icon,users,optional])=>`<section class="card preview-role-card"><span class="preview-role-icon">${icon}</span><h3>${title}</h3><select data-preview-user="${code}"><option value="">${optional?'معاينة عامة للدور':'اختاري حسابًا فعليًا'}</option>${users.map(u=>`<option value="${u.id}">${esc(u.name)}${code === "PARENT" ? "" : ` — ${esc(u.email)}`}</option>`).join("")}</select><button class="btn btn-primary" data-start-preview="${code}">بدء المعاينة</button></section>`).join("")}</div>`;
  content.querySelectorAll("[data-start-preview]").forEach(button=>button.onclick=async()=>{const code=button.dataset.startPreview;const userId=content.querySelector(`[data-preview-user="${code}"]`).value;if(["TEACHER","STUDENT"].includes(code)&&!userId){toast("اختاري حسابًا فعليًا لهذا الدور");return;}button.disabled=true;try{const result=await api("/preview/start",{method:"POST",body:JSON.stringify({roleCode:code,userId:userId||0})});location.href=result.redirect;}catch(error){toast(error.message);button.disabled=false}});
}

function openVerifiedOwnerCreation() {
  openModal(`
    <div class="verified-owner-modal">
      <h3>إنشاء حساب OWNER إضافي موثّق</h3>
      <div class="danger-note"><strong>عملية شديدة الحساسية</strong><p>هذا الحساب سيحصل على جميع صلاحيات مالك الموقع. لن يتغير بريد حسابك الحالي، ولا يمكن تنفيذ العملية دون إعادة إدخال كلمة مرورك وعبارة التأكيد.</p></div>
      <div class="form-grid">
        <div class="field"><label>اسم المالك الجديد</label><input id="newVerifiedOwnerName" autocomplete="off"></div>
        <div class="field"><label>البريد الكامل للمالك الجديد</label><input type="email" id="newVerifiedOwnerEmail" dir="ltr" autocomplete="off"></div>
        <div class="field"><label>كلمة مرور المالك الجديد</label><input type="password" id="newVerifiedOwnerPassword" minlength="10" autocomplete="new-password"></div>
        <div class="field"><label>كلمة مرورك الحالية</label><input type="password" id="verifiedOwnerCurrentPassword" autocomplete="current-password"></div>
        <div class="field"><label>رمز المصادقة الثنائية <small>(عند تفعيلها)</small></label><input id="verifiedOwnerOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div>
        <div class="field"><label>اكتبي «نقل الملكية»</label><input id="verifiedOwnerPhrase" autocomplete="off"></div>
      </div>
      <div class="modal-actions"><button class="btn btn-outline" id="cancelVerifiedOwner">إلغاء</button><button class="btn btn-danger" id="confirmVerifiedOwner" disabled>إنشاء حساب OWNER</button></div>
    </div>
  `,"wide-user-modal");
  const phrase=modalRoot.querySelector("#verifiedOwnerPhrase");
  const confirmButton=modalRoot.querySelector("#confirmVerifiedOwner");
  phrase.addEventListener("input",()=>{confirmButton.disabled=phrase.value.trim()!=="نقل الملكية";});
  modalRoot.querySelector("#cancelVerifiedOwner").onclick=closeModal;
  confirmButton.onclick=async()=>{
    confirmButton.disabled=true;
    confirmButton.textContent="جارٍ التحقق والإنشاء...";
    try {
      await api("/ownership/verified-owner",{method:"POST",body:JSON.stringify({
        name:modalRoot.querySelector("#newVerifiedOwnerName").value.trim(),
        email:modalRoot.querySelector("#newVerifiedOwnerEmail").value.trim(),
        password:modalRoot.querySelector("#newVerifiedOwnerPassword").value,
        currentPassword:modalRoot.querySelector("#verifiedOwnerCurrentPassword").value,
        otp:modalRoot.querySelector("#verifiedOwnerOtp").value.trim(),
        confirmation:phrase.value.trim(),
      })});
      toast("تم إنشاء حساب OWNER الموثّق دون تغيير بريدك الحالي");
      closeModal();
    } catch(error) {
      toast(error.message);
      confirmButton.disabled=phrase.value.trim()!=="نقل الملكية";
      confirmButton.textContent="إنشاء حساب OWNER";
    }
  };
}

async function openOwnerSecuritySettings() {
  try {
    const security=await api("/security");
    openModal(`<h3>حماية حساب مالك الموقع</h3><div class="security-status ${security.twoFactorEnabled?'enabled':'disabled'}"><strong>المصادقة الثنائية</strong><span>${security.twoFactorEnabled?'مفعّلة':'غير مفعّلة'}</span></div><p class="safe-note">مدة الخمول قبل تسجيل الخروج التلقائي: ${Math.round(Number(security.sessionIdleSeconds||1800)/60)} دقيقة.</p>${security.twoFactorEnabled?`<div class="form-grid full"><div class="field"><label>كلمة المرور الحالية</label><input type="password" id="securityPassword"></div><div class="field"><label>رمز التطبيق</label><input inputmode="numeric" maxlength="6" id="securityOtp"></div></div><div class="modal-actions"><button class="btn btn-outline" id="closeSecurity">إغلاق</button><button class="btn btn-danger" id="disableTwoFactor">تعطيل المصادقة الثنائية</button></div>`:`<div class="field"><label>كلمة المرور الحالية</label><input type="password" id="securityPassword"></div><div id="twoFactorSetupArea"></div><div class="modal-actions"><button class="btn btn-outline" id="closeSecurity">إغلاق</button><button class="btn btn-primary" id="setupTwoFactor">بدء الإعداد</button></div>`}`);
    modalRoot.querySelector("#closeSecurity").onclick=closeModal;
    const disable=modalRoot.querySelector("#disableTwoFactor");
    if(disable)disable.onclick=async()=>{try{await api("/security/disable",{method:"POST",body:JSON.stringify({currentPassword:modalRoot.querySelector("#securityPassword").value,otp:modalRoot.querySelector("#securityOtp").value})});toast("تم تعطيل المصادقة الثنائية");closeModal();}catch(error){toast(error.message)}};
    const setup=modalRoot.querySelector("#setupTwoFactor");
    if(setup)setup.onclick=async()=>{try{const result=await api("/security/setup",{method:"POST",body:JSON.stringify({currentPassword:modalRoot.querySelector("#securityPassword").value})});modalRoot.querySelector("#twoFactorSetupArea").innerHTML=`<div class="two-factor-secret"><p>أضيفي المفتاح التالي في تطبيق المصادقة:</p><code dir="ltr">${esc(result.secret)}</code></div><div class="field"><label>الرمز المكوّن من ٦ أرقام</label><input inputmode="numeric" maxlength="6" id="enableSecurityOtp"></div><button class="btn btn-primary" id="enableTwoFactor">تأكيد التفعيل</button>`;setup.hidden=true;modalRoot.querySelector("#enableTwoFactor").onclick=async()=>{try{await api("/security/enable",{method:"POST",body:JSON.stringify({currentPassword:modalRoot.querySelector("#securityPassword").value,otp:modalRoot.querySelector("#enableSecurityOtp").value})});toast("تم تفعيل المصادقة الثنائية");closeModal();}catch(error){toast(error.message)}};}catch(error){toast(error.message)}};
  } catch(error){toast(error.message)}
}


async function renderSystem() {
  const [status, backupsData, requestsData] = await Promise.all([
    api("/system/status"), api("/system/backups"), api("/system/password-requests")
  ]);
  const bytes = (value) => {
    const n=Number(value||0); if(n<1024)return `${n} ب`; if(n<1024**2)return `${(n/1024).toFixed(1)} ك.ب`; if(n<1024**3)return `${(n/1024**2).toFixed(1)} م.ب`; return `${(n/1024**3).toFixed(2)} ج.ب`;
  };
  const dirs=status.directories||[], backups=backupsData.items||[], requests=requestsData.items||[];
  content.innerHTML=`
    <section class="system-hero"><div><small>المراقبة والحماية</small><h2>حالة منصة مدار</h2><p>فحص الاتصال والجداول والتخزين والنسخ الاحتياطية دون عرض كلمات المرور أو مفاتيح النظام.</p></div><span>🛡️</span></section>
    <div class="system-stat-grid">
      <article><span>قاعدة البيانات</span><strong>${status.database.connected?"متصلة":"غير متصلة"}</strong><small>${esc(status.database.name)} · ${esc(status.database.serverVersion)}</small></article>
      <article><span>حجم قاعدة البيانات</span><strong>${bytes(status.database.sizeBytes)}</strong><small>${status.database.tables} جدول</small></article>
      <article><span>إصدار PHP</span><strong>${esc(status.runtime.phpVersion)}</strong><small>${esc(status.runtime.sapi)}</small></article>
      <article><span>آخر نسخة</span><strong>${status.lastBackup?esc(status.lastBackup.status):"لا توجد"}</strong><small>${status.lastBackup?formatDate(status.lastBackup.created_at):"أنشئي نسخة الآن"}</small></article>
    </div>
    ${status.database.missingTables?.length?`<div class="system-warning">⚠️ جداول ناقصة: ${status.database.missingTables.map(esc).join("، ")}</div>`:""}
    <div class="owner-two-column">
      <section class="card"><div class="section-head"><div><small>التخزين</small><h3>المجلدات المهمة</h3></div></div><div class="system-list">${dirs.map(d=>`<div><span>${esc(d.name)}</span><strong>${d.exists?"موجود":"مفقود"} · ${d.writable?"قابل للكتابة":"غير قابل للكتابة"}</strong><small>${bytes(d.size)}</small></div>`).join("")}</div></section>
      <section class="card"><div class="section-head"><div><small>النسخ اليومية</small><h3>النسخ والاستعادة الآمنة</h3></div></div><p class="safe-note">يتضمن المشروع ملف <code>scripts/daily_backup.php</code> للنسخ المجدول، وملف <code>scripts/restore_backup.php</code> للاستعادة من Terminal فقط حتى لا تُنفذ بالخطأ من المتصفح. تُنشأ نسخة أمان تلقائيًا قبل الاستعادة.</p><button class="btn btn-primary" id="createSystemBackup">إنشاء نسخة احتياطية الآن</button></section>
    </div>
    <section class="card"><div class="section-head"><div><small>السجل</small><h3>النسخ الاحتياطية</h3></div><span>${backups.length} نسخة</span></div><div class="table-wrap"><table><thead><tr><th>الملف</th><th>النوع</th><th>الحجم</th><th>الحالة</th><th>التاريخ</th><th>الإجراءات</th></tr></thead><tbody>${backups.length?backups.map(b=>`<tr><td>${esc(b.file_name)}</td><td>${esc(b.backup_type)}</td><td>${bytes(b.size_bytes)}</td><td>${esc(b.status)}</td><td>${formatDate(b.created_at)}</td><td><div class="row-actions"><a class="btn btn-outline btn-sm" href="/api/owner/system/backups/${b.id}/download">تنزيل</a><button class="btn btn-outline btn-sm" data-verify-backup="${b.id}">تحقق</button><button class="btn btn-danger btn-sm" data-delete-backup="${b.id}">حذف</button></div></td></tr>`).join(""):`<tr><td colspan="6">لا توجد نسخ بعد.</td></tr>`}</tbody></table></div></section>
    <section class="card"><div class="section-head"><div><small>الأمان</small><h3>طلبات إعادة كلمة المرور للمعلمات والإداريين</h3></div><span>${requests.length} طلب</span></div><div class="system-request-list">${requests.length?requests.map(r=>`<article><div><strong>${esc([r.first_name,r.last_name].filter(Boolean).join(" ")||r.identifier_hint||"طلب حساب")}</strong><small>${esc(r.requested_role)} · ${formatDate(r.created_at)}</small></div><div class="row-actions"><button class="btn btn-primary btn-sm" data-resolve-reset="${r.id}">إعادة التعيين</button><button class="btn btn-outline btn-sm" data-reject-reset="${r.id}">رفض</button></div></article>`).join(""):`<div class="empty-state">لا توجد طلبات معلقة.</div>`}</div></section>
    <section class="card"><div class="section-head"><div><small>الأخطاء</small><h3>آخر أخطاء النظام غير المحلولة</h3></div></div>${status.errors?.length?`<div class="system-error-list">${status.errors.map(e=>`<article class="${esc(e.severity)}"><strong>${esc(e.source)}</strong><p>${esc(e.message)}</p><small>${formatDate(e.created_at)}</small></article>`).join("")}</div>`:`<div class="empty-state">لا توجد أخطاء مسجلة.</div>`}</section>`;
  content.querySelector("#createSystemBackup").onclick=async(event)=>{const b=event.currentTarget;b.disabled=true;b.textContent="جارٍ إنشاء النسخة...";try{await api("/system/backups/create",{method:"POST",body:"{}"});toast("تم إنشاء النسخة الاحتياطية");renderSystem();}catch(error){toast(error.message);b.disabled=false;b.textContent="إنشاء نسخة احتياطية الآن";}};
  content.querySelectorAll("[data-verify-backup]").forEach(b=>b.onclick=async()=>{try{const result=await api("/system/backups/verify",{method:"POST",body:JSON.stringify({id:Number(b.dataset.verifyBackup)})});toast(result.ok?"النسخة سليمة":"فشل التحقق من النسخة");renderSystem();}catch(error){toast(error.message)}});
  content.querySelectorAll("[data-delete-backup]").forEach(b=>b.onclick=()=>confirmAction("حذف ملف النسخة الاحتياطية نهائيًا؟",async()=>{await api(`/system/backups/${b.dataset.deleteBackup}`,{method:"DELETE",body:"{}"});toast("تم حذف النسخة");renderSystem();}));
  content.querySelectorAll("[data-resolve-reset]").forEach(b=>b.onclick=()=>openOwnerResetRequest(Number(b.dataset.resolveReset)));
  content.querySelectorAll("[data-reject-reset]").forEach(b=>b.onclick=()=>confirmAction("رفض طلب إعادة كلمة المرور؟",async()=>{await api(`/system/password-requests/${b.dataset.rejectReset}`,{method:"PUT",body:JSON.stringify({status:"rejected",note:"رفض بواسطة المالكة"})});toast("تم رفض الطلب");renderSystem();}));
}

function openOwnerResetRequest(id){
  openModal(`<h3>إعادة تعيين كلمة المرور</h3><p class="safe-note">لن تظهر كلمة المرور القديمة. سيُستبدل بها رمز جديد فقط.</p><div class="field"><label>كلمة المرور الجديدة</label><input id="ownerResetPassword" type="password" minlength="10" placeholder="10 أحرف على الأقل وحرف ورقم"></div><div class="modal-actions"><button class="btn btn-outline" id="cancelOwnerReset">إلغاء</button><button class="btn btn-primary" id="saveOwnerReset">حفظ</button></div>`);
  modalRoot.querySelector("#cancelOwnerReset").onclick=closeModal;
  modalRoot.querySelector("#saveOwnerReset").onclick=async()=>{try{await api(`/system/password-requests/${id}`,{method:"PUT",body:JSON.stringify({status:"resolved",newPassword:modalRoot.querySelector("#ownerResetPassword").value})});toast("تمت إعادة تعيين كلمة المرور");closeModal();renderSystem();}catch(error){toast(error.message)}};
}

const routes = {
  home: renderHome,
  users: renderUsers,
  teachers: renderTeachers,
  students: renderStudents,
  parents: renderParents,
  tests: renderTests,
  preview: renderPreview,
  permissions: renderPermissions,
  activity: renderActivity,
  settings: renderSettings,
  system: renderSystem,
};

function navigate(route) {
  if (!routes[route]) route = "home";
  document.querySelectorAll(".nav-item[data-route]").forEach((el) => el.classList.toggle("active", el.dataset.route === route));
  pageTitle.textContent = TITLES[route];
  sidebar.classList.remove("open");
  routes[route]().catch((err) => {
    if (err.message !== "unauthorized") {
      content.innerHTML = `<div class="empty-state">حدث خطأ: ${esc(err.message)}</div>`;
    }
  });
}

document.querySelectorAll(".nav-item[data-route]").forEach((el) =>
  el.addEventListener("click", () => navigate(el.dataset.route))
);

document.getElementById("menuToggle").addEventListener("click", () => sidebar.classList.toggle("open"));

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await api("/logout", { method: "POST" });
  window.location.href = "/owner/login.html";
});

(async function init() {
  try {
    currentOwner = await api("/me");
    csrfToken = currentOwner.csrfToken || csrfToken;
    document.getElementById("ownerNameLabel").textContent = currentOwner.name;
    document.getElementById("avatarCircle").textContent = currentOwner.name.trim()[0] || "م";
    navigate("home");
  } catch (err) {
    // api() already redirects to login on 401/403
  }
})();
