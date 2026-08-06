// لوحة تحكم المعلمة - منطق العرض والتنقل بين الأقسام (SPA بسيطة بدون مكتبات خارجية)

const contentEl = document.getElementById("content");
const pageTitleEl = document.getElementById("pageTitle");
const modalRoot = document.getElementById("modalRoot");
const toastRoot = document.getElementById("toastRoot");

const ROUTE_TITLES = {
  home: "الرئيسية",
  profile: "الأداء الوظيفي",
  portfolio: "ملف الإنجاز",
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
  "parent-panel": "ولي الأمر",
  reports: "التقارير الذكية",
  "remedial-plans": "الخطط العلاجية",
  calendar: "التقويم والمواعيد",
  "help-center": "مركز المساعدة",
  notifications: "الإشعارات",
  classes: "إدارة الفصول",
  activity: "سجل الأنشطة",
  settings: "الإعدادات",
};

let currentTeacher = null;
let allClasses = [];
let allSkills = [];
let csrfToken = "";

let schoolSettings = null;
const ACADEMIC_GRADES = {
  "ابتدائي": ["رابع ابتدائي", "خامس ابتدائي", "سادس ابتدائي"],
  "متوسط": ["أول متوسط", "ثاني متوسط", "ثالث متوسط"],
  "ثانوي": ["أول ثانوي", "ثاني ثانوي", "ثالث ثانوي"],
};
const academicSelections = {
  followUp: JSON.parse(sessionStorage.getItem("madarAcademicFollowUp") || "null") || {},
  tests: JSON.parse(sessionStorage.getItem("madarAcademicTests") || "null") || {},
};
let recentCreatedTestId = Number(sessionStorage.getItem("madarRecentCreatedTestId") || 0);
let recentCreatedTestType = sessionStorage.getItem("madarRecentCreatedTestType") || "";

function normalizeGradeKey(stage, label) {
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

function selectedAcademicClass(kind) {
  const selection = academicSelections[kind];
  return allClasses.find((item) => String(item.id) === String(selection?.classId)) || null;
}

function actualAcademicGradeLabel(kind) {
  return selectedAcademicClass(kind)?.grade_label || academicSelections[kind]?.gradeLabel || "";
}

async function loadSchoolSettings(force = false) {
  if (!schoolSettings || force) schoolSettings = await api("/school-settings");
  return schoolSettings;
}

function normalizedAcademicYear(value) {
  return String(value || "").replace(/[^0-9-]/g, "");
}

function academicClasses(selection) {
  const matching = allClasses.filter((item) => (!selection.stage || item.level === selection.stage) && (!selection.gradeLabel || normalizeGradeKey(item.level, item.grade_label) === selection.gradeLabel));
  const selectedYear = normalizedAcademicYear(schoolSettings?.academicYear);
  if (!selectedYear) return matching;
  const sameYear = matching.filter((item) => normalizedAcademicYear(item.academic_year) === selectedYear);
  return sameYear.length ? sameYear : matching;
}

function normalizeAcademicSelection(kind) {
  const selection = academicSelections[kind];
  const firstClass = allClasses[0];
  if (!selection.stage) selection.stage = firstClass?.level || "ابتدائي";
  const grades = ACADEMIC_GRADES[selection.stage] || [];
  if (!grades.includes(selection.gradeLabel)) {
    const classGrade = normalizeGradeKey(selection.stage, allClasses.find((item) => item.level === selection.stage)?.grade_label);
    selection.gradeLabel = grades.includes(classGrade) ? classGrade : (grades[0] || "");
  }
  const classes = academicClasses(selection);
  if (!classes.some((item) => String(item.id) === String(selection.classId))) selection.classId = classes[0]?.id ? String(classes[0].id) : "";
  sessionStorage.setItem(kind === "followUp" ? "madarAcademicFollowUp" : "madarAcademicTests", JSON.stringify(selection));
  return selection;
}

async function prepareAcademicSelection(kind) {
  await loadSchoolSettings();
  return normalizeAcademicSelection(kind);
}

function arabicClassNumber(index) {
  return ["١", "٢", "٣", "٤", "٥", "٦"][index] || String(index + 1);
}

const SCHOOL_EMAIL_DOMAIN = "@mkhg.moe.gov.sa";
const STUDENT_STAGE_OPTIONS = ["ابتدائي", "متوسط", "ثانوي"];
const STUDENT_CLASS_NUMBERS = ["١", "٢", "٣", "٤"];

function schoolEmailLocalPart(email) {
  const value = String(email || "").trim().toLowerCase();
  return value.endsWith(SCHOOL_EMAIL_DOMAIN) ? value.slice(0, -SCHOOL_EMAIL_DOMAIN.length) : value.split("@")[0];
}

function composeSchoolEmail(localPart) {
  const value = String(localPart || "").trim().toLowerCase();
  return value.includes("@") ? value : `${value}${SCHOOL_EMAIL_DOMAIN}`;
}

function detectedClassNumber(name) {
  const original = String(name || "").trim();
  const digits = original.replace(/[١٢٣٤]/g, (digit) => ({ "١": "1", "٢": "2", "٣": "3", "٤": "4" }[digit]));
  const explicitDigit = digits.match(/(?:الفصل|فصل|class)\s*(?:رقم\s*)?([1-4])/i);
  if (explicitDigit) return Number(explicitDigit[1]);
  const explicitWord = original.match(/(?:الفصل|فصل)\s*(الأول|الاول|أول|الثاني|ثاني|الثالث|ثالث|الرابع|رابع)/u);
  if (explicitWord) {
    const word = explicitWord[1];
    if (/أول|الأول|الاول/u.test(word)) return 1;
    if (/ثاني|الثاني/u.test(word)) return 2;
    if (/ثالث|الثالث/u.test(word)) return 3;
    if (/رابع|الرابع/u.test(word)) return 4;
  }
  const simple = digits.match(/^\s*([1-4])\s*$/) || digits.match(/(?:^|[-–—])\s*([1-4])\s*$/);
  return simple ? Number(simple[1]) : 0;
}

function studentGradeOptions(stage, selectedGrade = "") {
  const grades = ACADEMIC_GRADES[stage] || [];
  return grades.map((grade) => `<option value="${grade}" ${grade === selectedGrade ? "selected" : ""}>${grade}</option>`).join("");
}

function studentClassesForSelection(stage, gradeLabel) {
  const slots = [null, null, null, null];
  const normalizedGrade = normalizeGradeKey(stage, gradeLabel);
  const leftovers = [];
  allClasses
    .filter((item) => item.level === stage && normalizeGradeKey(item.level, item.grade_label) === normalizedGrade)
    .forEach((item) => {
      const number = detectedClassNumber(item.name);
      if (number >= 1 && number <= 4 && !slots[number - 1]) slots[number - 1] = item;
      else leftovers.push(item);
    });
  slots.forEach((item, index) => {
    if (!item && leftovers.length) slots[index] = leftovers.shift();
  });
  return slots;
}

function studentClassNumberOptions(stage, gradeLabel, selectedClassId = "") {
  const classes = studentClassesForSelection(stage, gradeLabel);
  return STUDENT_CLASS_NUMBERS.map((number, index) => {
    const item = classes[index];
    const selected = item && String(item.id) === String(selectedClassId) ? "selected" : "";
    return item
      ? `<option value="${item.id}" data-class-number="${index + 1}" ${selected}>الفصل ${number}</option>`
      : `<option value="new-${index + 1}" data-class-number="${index + 1}">الفصل ${number} — سيُنشأ تلقائيًا</option>`;
  }).join("");
}

function shortGradeLabel(stage, gradeLabel) {
  const short = normalizeGradeKey(stage, gradeLabel).replace(/\s+(ابتدائي|متوسط|ثانوي)$/u, "");
  return stage !== "ابتدائي" && short === "أول" ? "أولى" : short;
}

function academicClassLabel(item, index) {
  const name = String(item?.name || "");
  const digitMatch = name.match(/(?:فصل|الفصل)?\s*([١٢٣٤1-4])(?:\D|$)/);
  const digitMap = { "1": "١", "2": "٢", "3": "٣", "4": "٤", "١": "١", "٢": "٢", "٣": "٣", "٤": "٤" };
  const normalizedDigit = digitMatch ? digitMap[digitMatch[1]] : arabicClassNumber(index);
  return `الفصل ${normalizedDigit}${name && !/^\s*(?:فصل|الفصل)?\s*[١٢٣٤1-4]\s*$/u.test(name) ? ` — ${escapeHtml(name)}` : ""}`;
}

function academicSelectorHtml(kind) {
  const selection = normalizeAcademicSelection(kind);
  const grades = ACADEMIC_GRADES[selection.stage] || [];
  const classes = academicClasses(selection);
  const semesterLabel = schoolSettings?.semesterLabel || "الترم الأول";
  return `<section class="academic-filter" data-academic-kind="${kind}">
    <div class="academic-filter-fields">
      <label>المرحلة<select data-academic-stage>${Object.keys(ACADEMIC_GRADES).map((value) => `<option value="${value}" ${selection.stage === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>الصف<select data-academic-grade>${grades.map((value) => `<option value="${value}" ${selection.gradeLabel === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>الفصل<select data-academic-class>${classes.length ? classes.map((item, index) => `<option value="${item.id}" ${String(selection.classId) === String(item.id) ? "selected" : ""}>${academicClassLabel(item, index)}</option>`).join("") : '<option value="">لا يوجد فصل مسجل لهذا الصف</option>'}</select></label>
    </div>
    <div class="semester-indicator"><strong>${escapeHtml(semesterLabel)}</strong></div>
  </section>`;
}

function bindAcademicSelector(kind, onChange) {
  const root = document.querySelector(`[data-academic-kind="${kind}"]`);
  if (!root) return;
  const selection = academicSelections[kind];
  root.querySelector("[data-academic-stage]").onchange = (event) => {
    selection.stage = event.target.value;
    selection.gradeLabel = (ACADEMIC_GRADES[selection.stage] || [])[0] || "";
    selection.classId = "";
    normalizeAcademicSelection(kind);
    onChange();
  };
  root.querySelector("[data-academic-grade]").onchange = (event) => {
    selection.gradeLabel = event.target.value;
    selection.classId = "";
    normalizeAcademicSelection(kind);
    onChange();
  };
  root.querySelector("[data-academic-class]").onchange = (event) => {
    selection.classId = event.target.value;
    normalizeAcademicSelection(kind);
    onChange();
  };
}

function academicQuery(kind) {
  const selection = normalizeAcademicSelection(kind);
  return new URLSearchParams({
    stage: selection.stage || "",
    gradeLabel: actualAcademicGradeLabel(kind),
    classId: selection.classId || "",
    academicYear: schoolSettings?.academicYear || "",
    semester: schoolSettings?.currentSemester || "first",
  }).toString();
}

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

  const raw = await res.text();
  let data = null;
  if (raw.trim()) {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      // دعم مؤقت لأي نسخة PHP قديمة تطبع Warning قبل JSON.
      for (let index = 0; index < raw.length; index += 1) {
        if (raw[index] !== "{" && raw[index] !== "[") continue;
        try {
          data = JSON.parse(raw.slice(index).trim());
          break;
        } catch (_) {}
      }
      if (data === null) {
        const plain = raw
          .replace(/<br\s*\/?\s*>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/gi, " ")
          .trim();
        throw new Error(plain || `استجابة غير صالحة من الخادم (${res.status}).`);
      }
    }
  }

  if (!res.ok) throw new Error(data?.error || `حدث خطأ في الخادم (${res.status}).`);
  if (data?.csrfToken) csrfToken = data.csrfToken;
  return data;
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const MADAR_MATH_ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const MADAR_MATH_OPTION_LABELS = ["أ", "ب", "جـ", "د"];

function usesArabicMathNotation(stage) {
  const value = String(stage || "").trim();
  return value.includes("ابتدائ") || value.includes("متوسط");
}

function arabicMathNumber(value, stage) {
  const text = String(value ?? "");
  if (!usesArabicMathNotation(stage)) return text;
  return text.replace(/\d/g, (digit) => MADAR_MATH_ARABIC_DIGITS[Number(digit)]);
}

function arabicMathDisplay(value, stage) {
  let text = String(value ?? "");
  if (!usesArabicMathNotation(stage)) return text;
  text = text
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    .replace(/!=/g, "≠")
    .replace(/\*|\\times/gi, "×")
    .replace(/\\div/gi, "÷")
    .replace(/\b(?:sqrt)\b/gi, "√")
    .replace(/\b(?:pi)\b/gi, "ط")
    .replace(/°\s*C\b/gi, "°س")
    .replace(/\bkm\s*\/\s*h\b/gi, "كلم/س")
    .replace(/\bm\s*\/\s*s\b/gi, "م/ث")
    .replace(/\bcm\s*\/\s*s\b/gi, "سم/ث")
    .replace(/(^|[^A-Za-z])x(?=$|[^A-Za-z])/gi, "$1س")
    .replace(/(^|[^A-Za-z])y(?=$|[^A-Za-z])/gi, "$1ص")
    .replace(/(^|[^A-Za-z])z(?=$|[^A-Za-z])/gi, "$1ع")
    .replace(/(^|[^A-Za-z])a(?=$|[^A-Za-z])/gi, "$1أ")
    .replace(/(^|[^A-Za-z])b(?=$|[^A-Za-z])/gi, "$1ب")
    .replace(/(^|[^A-Za-z])c(?=$|[^A-Za-z])/gi, "$1جـ")
    .replace(/(^|[^A-Za-z])d(?=$|[^A-Za-z])/gi, "$1د")
    .replace(/(^|[^A-Za-z])f(?=$|[^A-Za-z])/gi, "$1ف")
    .replace(/(^|[^A-Za-z])h(?=$|[^A-Za-z])/gi, "$1هـ")
    .replace(/(^|[^A-Za-z])k(?=$|[^A-Za-z])/gi, "$1ك")
    .replace(/(^|[^A-Za-z])l(?=$|[^A-Za-z])/gi, "$1ل")
    .replace(/(^|[^A-Za-z])m(?=$|[^A-Za-z])/gi, "$1م")
    .replace(/(^|[^A-Za-z])n(?=$|[^A-Za-z])/gi, "$1ن")
    .replace(/(^|[^A-Za-z])q(?=$|[^A-Za-z])/gi, "$1ق")
    .replace(/(^|[^A-Za-z])r(?=$|[^A-Za-z])/gi, "$1ر")
    .replace(/(^|[^A-Za-z])w(?=$|[^A-Za-z])/gi, "$1و")
    .replace(/(^|[^A-Za-z])cm(?=$|[^A-Za-z])/gi, "$1سم")
    .replace(/(^|[^A-Za-z])mm(?=$|[^A-Za-z])/gi, "$1ملم")
    .replace(/(^|[^A-Za-z])km(?=$|[^A-Za-z])/gi, "$1كلم")
    .replace(/(^|[^A-Za-z])kg(?=$|[^A-Za-z])/gi, "$1كجم")
    .replace(/(^|[^A-Za-z])ml(?=$|[^A-Za-z])/gi, "$1مل")
    .replace(/([0-9٠-٩])\.(?=[0-9٠-٩])/g, "$1٫")
    .replace(/%/g, "٪");
  return arabicMathNumber(text, stage);
}

function arabicMathHtml(value, stage) {
  const safe = escapeHtml(arabicMathDisplay(value, stage));
  if (!usesArabicMathNotation(stage)) return safe;
  return safe.replace(/([\p{L}\p{N})])\^([٠-٩0-9]+)/gu, "$1<sup>$2</sup>");
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
  initGlobalSearch();

  document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });
  const logoutTeacher = async () => {
    const result = await api("/logout", { method: "POST" });
    window.location.href = result?.previewEnded ? (result.redirect || "/owner/dashboard") : "login.html";
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
// ملف الإنجاز الإلكتروني للمعلمة
// ==========================================================================
let teacherPortfolioTab = "evidences";
const DEFAULT_TEACHER_EVIDENCES = [
  { id: 1, title: "خطة التخطيط الفصلي للرياضيات", category: "التخطيط والتحضير", date: "2026-01-15", note: "إعداد خطة متكاملة تشمل نواتج التعلم واستراتيجيات التدريس الحديثة.", status: "موثق" },
  { id: 2, title: "تقرير تحليل نتائج الاختبار التشخيصي", category: "تقويم التعلم وتحليله", date: "2026-02-10", note: "تحليل الإتقان وتحديد المهارات المستهدفة بالخطط العلاجية.", status: "موثق" },
  { id: 3, title: "تطبيق استراتيجية الصف المقلوب", category: "استراتيجيات التدريس", date: "2026-03-05", note: "استخدام الفيديوهات التفاعلية والأنشطة الرقمية في منصة مدار.", status: "مكتمل" },
  { id: 4, title: "شهادة حضور ورشة الألعاب التعليمية", category: "التطوير المهني", date: "2026-04-12", note: "ورشة عمل تخصصية لتصميم الألعاب الرقمية التفاعلية.", status: "معتمد" },
];

function getTeacherEvidences() {
  try {
    const saved = localStorage.getItem("madarTeacherEvidences");
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_TEACHER_EVIDENCES;
}

function saveTeacherEvidences(evidences) {
  try {
    localStorage.setItem("madarTeacherEvidences", JSON.stringify(evidences));
  } catch {}
}

async function renderPortfolio() {
  const teacherName = currentTeacher?.name || "المعلمة";
  const teacherEmail = currentTeacher?.email || "—";
  const evidences = getTeacherEvidences();

  let totalClasses = allClasses.length || 0;
  let totalStudentFiles = 0;
  try {
    const sfData = await api("/student-files");
    totalStudentFiles = sfData?.files?.length || 0;
  } catch {}

  contentEl.innerHTML = `
    <section class="student-files-hero" style="background: linear-gradient(135deg, #2b1055, #6336a5, #150050); border-radius: 20px; padding: 24px; color: #fff; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(40,15,80,0.18);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="student-files-hero-icon" style="background: rgba(255,255,255,0.15); width: 64px; height: 64px; border-radius: 16px; display: grid; place-items: center; font-size: 2rem;">📁</div>
          <div>
            <span style="color: #ffd769; font-weight: 700; font-size: 0.85rem;">ملف الإنجاز الإلكتروني</span>
            <h2 style="margin: 4px 0; font-size: 1.6rem; color: #fff;">ملف إنجاز المعلمة: ${escapeHtml(teacherName)}</h2>
            <p style="margin: 0; color: rgba(255,255,255,0.85); font-size: 0.9rem;">توثيق الشواهد والوثائق المهنية، السيرة والتطوير المهني، ونتاجات التعلم للعام الدراسي 1447 هـ / 2026 م</p>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-outline" style="background: rgba(255,255,255,0.12); color: #fff; border-color: rgba(255,255,255,0.3);" id="printPortfolioBtn" type="button"><span aria-hidden="true">🖨️</span> طباعة الملف</button>
          <button class="btn btn-primary" style="background: #ffbd28; color: #200545; border: none; font-weight: 800;" id="addEvidenceBtn" type="button"><span aria-hidden="true">➕</span> إضافة شاهد جديد</button>
        </div>
      </div>
    </section>

    <div class="enhancement-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <article class="enhancement-card" style="padding: 16px; border-radius: 16px; background: #fff; border: 1px solid var(--border);">
        <small style="color: var(--muted); font-size: 0.8rem;">الشواهد الموثقة</small>
        <strong style="display: block; font-size: 1.5rem; color: var(--purple-950); margin-top: 4px;">${evidences.length} شاهد</strong>
      </article>
      <article class="enhancement-card" style="padding: 16px; border-radius: 16px; background: #fff; border: 1px solid var(--border);">
        <small style="color: var(--muted); font-size: 0.8rem;">الفصول المستفيدة</small>
        <strong style="display: block; font-size: 1.5rem; color: var(--purple-950); margin-top: 4px;">${totalClasses} فصل</strong>
      </article>
      <article class="enhancement-card" style="padding: 16px; border-radius: 16px; background: #fff; border: 1px solid var(--border);">
        <small style="color: var(--muted); font-size: 0.8rem;">أعمال الطالبات المراجعة</small>
        <strong style="display: block; font-size: 1.5rem; color: var(--purple-950); margin-top: 4px;">${totalStudentFiles} عمل</strong>
      </article>
      <article class="enhancement-card" style="padding: 16px; border-radius: 16px; background: #fff; border: 1px solid var(--border);">
        <small style="color: var(--muted); font-size: 0.8rem;">عام التوثيق</small>
        <strong style="display: block; font-size: 1.5rem; color: var(--purple-950); margin-top: 4px;">1447 هـ</strong>
      </article>
    </div>

    <div class="student-panel-tabs" role="tablist" style="margin-bottom: 20px;">
      <button class="tab-btn ${teacherPortfolioTab === "evidences" ? "active" : ""}" id="tabEvidences" type="button">سجل الشواهد والوثائق</button>
      <button class="tab-btn ${teacherPortfolioTab === "bio" ? "active" : ""}" id="tabBio" type="button">السيرة والبيانات المهنية</button>
      <button class="tab-btn ${teacherPortfolioTab === "student-files" ? "active" : ""}" id="tabStudentFiles" type="button">ملفات أعمال الطالبات</button>
    </div>

    <div id="portfolioTabContent"></div>
  `;

  document.getElementById("printPortfolioBtn").onclick = () => window.print();
  document.getElementById("addEvidenceBtn").onclick = () => openAddEvidenceModal();

  const tabEvidences = document.getElementById("tabEvidences");
  const tabBio = document.getElementById("tabBio");
  const tabStudentFiles = document.getElementById("tabStudentFiles");

  tabEvidences.onclick = () => { teacherPortfolioTab = "evidences"; renderPortfolio(); };
  tabBio.onclick = () => { teacherPortfolioTab = "bio"; renderPortfolio(); };
  tabStudentFiles.onclick = () => { navigate("student-files"); };

  const contentWrap = document.getElementById("portfolioTabContent");

  if (teacherPortfolioTab === "evidences") {
    contentWrap.innerHTML = `
      <div class="card">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <h3 class="section-title" style="margin:0;">الشواهد والوثائق المهنية</h3>
          <div style="display: flex; gap: 10px;">
            <select id="filterCategory" style="padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border);">
              <option value="">جميع المجالات</option>
              <option value="التخطيط والتحضير">التخطيط والتحضير</option>
              <option value="تقويم التعلم وتحليله">تقويم التعلم وتحليله</option>
              <option value="استراتيجيات التدريس">استراتيجيات التدريس</option>
              <option value="التطوير المهني">التطوير المهني</option>
              <option value="بيئة التعلم والتفاعل الصفّي">بيئة التعلم والتفاعل الصفّي</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>عنوان الشاهد / الوثيقة</th>
                <th>المجال / التصنيف</th>
                <th>التاريخ</th>
                <th>ملاحظات وتفاصيل الإنجاز</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="evidencesTableBody">
              ${renderEvidencesRows(evidences)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById("filterCategory").onchange = (e) => {
      const cat = e.target.value;
      const filtered = cat ? evidences.filter(item => item.category === cat) : evidences;
      document.getElementById("evidencesTableBody").innerHTML = renderEvidencesRows(filtered);
      bindEvidenceActions(filtered);
    };

    bindEvidenceActions(evidences);
  } else if (teacherPortfolioTab === "bio") {
    contentWrap.innerHTML = `
      <div class="content-grid-two">
        <div class="card">
          <h3 class="section-title">بيانات المعلمة الأساسية</h3>
          <div class="info-list">
            <div class="info-row"><span>الاسم الكامل</span><strong>${escapeHtml(teacherName)}</strong></div>
            <div class="info-row"><span>البريد الإلكتروني</span><strong>${escapeHtml(teacherEmail)}</strong></div>
            <div class="info-row"><span>المادة التخصصية</span><strong>الرياضيات</strong></div>
            <div class="info-row"><span>السنة الدراسية</span><strong>1447 هـ / 2026 م</strong></div>
            <div class="info-row"><span>حالة التوثيق</span><strong><span class="badge badge-success" style="background:#ddf7eb; color:#176c4c; padding:4px 8px; border-radius:8px;">مفعل ونشط</span></strong></div>
          </div>
        </div>
        <div class="card">
          <h3 class="section-title">الرؤية والرسالة التربوية</h3>
          <p style="line-height: 1.8; color: var(--text-color); margin-bottom: 16px;">
            تقديم تعليم رياضيات ممتع وتفاعلي يميّز التفكير المنطقي، ويربط المفاهيم الرياضية بالحياة اليومية والتطبيقات الرقمية المعاصرة وفق أحدث الممارسات والتقنيات التربوية.
          </p>
          <h4 style="margin: 12px 0 6px; color: var(--purple-950);">الأهداف السامية:</h4>
          <ul style="padding-right: 20px; line-height: 1.8; color: var(--muted);">
            <li>رفع معدلات إتقان نواتج التعلم في مادة الرياضيات.</li>
            <li>تفعيل التعلم الرقمي والألعاب التفاعلية وأنماط التعلم.</li>
            <li>رعاية الطالبات وتحسين مستوياتهن بالخطط العلاجية والإثرائية.</li>
          </ul>
        </div>
      </div>
    `;
  }
}

function renderEvidencesRows(items) {
  if (!items.length) {
    return `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">لا توجد شواهد مضافة حاليًا.</td></tr>`;
  }
  return items.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.title)}</strong></td>
      <td><span class="portfolio-type-badge">${escapeHtml(item.category)}</span></td>
      <td>${escapeHtml(item.date)}</td>
      <td><small style="color:var(--muted);">${escapeHtml(item.note || "—")}</small></td>
      <td><span class="portfolio-review-badge approved">${escapeHtml(item.status || "موثق")}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" data-delete-evidence="${item.id}" type="button">حذف</button>
      </td>
    </tr>
  `).join("");
}

function bindEvidenceActions(items) {
  document.querySelectorAll("[data-delete-evidence]").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.deleteEvidence);
      const updated = getTeacherEvidences().filter(item => item.id !== id);
      saveTeacherEvidences(updated);
      toast("تم حذف الشاهد بنجاح.");
      renderPortfolio();
    };
  });
}

function openAddEvidenceModal() {
  openModal(`
    <h3>إضافة شاهد أو وثيقة إنجاز جديدة</h3>
    <p>أدخلي تفاصيل الشاهد أو الإنجاز لتثبيته في ملف الإنجاز الخاص بكِ.</p>
    <label class="field">عنوان الشاهد / الإنجاز
      <input id="evidenceTitle" placeholder="مثال: ورقة عمل تفاعلية لنواتج التعلم" required />
    </label>
    <label class="field">المجال / التصنيف
      <select id="evidenceCategory">
        <option value="التخطيط والتحضير">التخطيط والتحضير</option>
        <option value="تقويم التعلم وتحليله">تقويم التعلم وتحليله</option>
        <option value="استراتيجيات التدريس">استراتيجيات التدريس</option>
        <option value="التطوير المهني">التطوير المهني</option>
        <option value="بيئة التعلم والتفاعل الصفّي">بيئة التعلم والتفاعل الصفّي</option>
      </select>
    </label>
    <label class="field">التاريخ
      <input id="evidenceDate" type="date" value="${new Date().toISOString().split("T")[0]}" required />
    </label>
    <label class="field">تفاصيل وملاحظات الشاهد
      <textarea id="evidenceNote" placeholder="اكتبي وصفًا مختصرًا للإنجاز وأهم الشواهد المرتبطة به..."></textarea>
    </label>
    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelEvidence">إلغاء</button>
      <button class="btn btn-primary" id="saveEvidence">حفظ الشاهد</button>
    </div>
  `);
  document.getElementById("cancelEvidence").onclick = closeModal;
  document.getElementById("saveEvidence").onclick = () => {
    const title = document.getElementById("evidenceTitle").value.trim();
    const category = document.getElementById("evidenceCategory").value;
    const date = document.getElementById("evidenceDate").value;
    const note = document.getElementById("evidenceNote").value.trim();
    if (!title) return toast("يرجى كتابة عنوان الشاهد.");

    const items = getTeacherEvidences();
    items.unshift({
      id: Date.now(),
      title,
      category,
      date,
      note,
      status: "موثق"
    });
    saveTeacherEvidences(items);
    closeModal();
    toast("تمت إضافة الشاهد إلى ملف الإنجاز ✨");
    renderPortfolio();
  };
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
      <button class="tab-btn ${studentPanelMode === "classes" ? "active" : ""}" data-student-panel="classes">إدارة الفصول</button>
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
  else if (studentPanelMode === "classes") await renderClasses(target);
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

async function openStudentProfileLegacy(id) {
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
      <p class="import-help">الأعمدة المطلوبة: اسم الطالبة، البريد الإلكتروني، والفصل. نطاق البريد الثابت هو @mkhg.moe.gov.sa، ويمكن كتابة اسم المستخدم فقط. تُقرأ عناوين Excel العربية وعناوين ملفات مدرستي الشائعة تلقائيًا، وكلمة المرور المؤقتة اختيارية.</p>
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
  const defaultStage = selectedClass?.level || student?.stage || "ابتدائي";
  const availableGrades = ACADEMIC_GRADES[defaultStage] || [];
  const studentGrade = normalizeGradeKey(defaultStage, selectedClass?.grade_label || student?.grade_label || "");
  const defaultGrade = availableGrades.includes(studentGrade) ? studentGrade : (availableGrades[0] || "");
  openModal(`
    <h3>${student ? "تعديل بيانات الطالبة" : "إضافة طالبة جديدة"}</h3>
    <div id="studentFormMsg"></div>
    <div class="form-grid">
      <div class="field">الاسم<input id="sfName" value="${escapeHtml(student?.name || "")}" /></div>
      <div class="field">البريد الإلكتروني
        <div class="school-email-parts" dir="ltr">
          <input id="sfEmailLocal" value="${escapeHtml(schoolEmailLocalPart(student?.email || ""))}" inputmode="email" autocomplete="username" placeholder="اسم المستخدم" />
          <span>${SCHOOL_EMAIL_DOMAIN}</span>
        </div>
      </div>
      <div class="field">المرحلة
        <select id="sfStage">${STUDENT_STAGE_OPTIONS.map((stage) => `<option value="${stage}" ${stage === defaultStage ? "selected" : ""}>${stage}</option>`).join("")}</select>
      </div>
      <div class="field">الصف
        <select id="sfGrade">${studentGradeOptions(defaultStage, defaultGrade)}</select>
      </div>
      <div class="field">الفصل
        <select id="sfClass">${studentClassNumberOptions(defaultStage, defaultGrade, student?.class_id || "")}</select>
      </div>
      ${student ? "" : '<div class="field">كلمة المرور المؤقتة<input id="sfPassword" type="password" minlength="10" placeholder="10 أحرف على الأقل وحرف ورقم" /></div>'}
    </div>
    <p class="settings-help student-class-help">يمكن اختيار أي مرحلة وصف وفصل من ١ إلى ٤. إذا لم يكن الفصل منشأ فسينشئه النظام تلقائيًا عند حفظ الطالبة.</p>
    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelStudentForm">إلغاء</button>
      <button class="btn btn-primary" id="saveStudentForm">حفظ</button>
    </div>
  `);
  document.getElementById("cancelStudentForm").onclick = closeModal;
  const stageSelect = document.getElementById("sfStage");
  const gradeSelect = document.getElementById("sfGrade");
  const classSelect = document.getElementById("sfClass");
  const refreshClasses = (selectedClassId = "") => {
    classSelect.innerHTML = studentClassNumberOptions(stageSelect.value, gradeSelect.value, selectedClassId);
  };
  stageSelect.onchange = () => {
    gradeSelect.innerHTML = studentGradeOptions(stageSelect.value, (ACADEMIC_GRADES[stageSelect.value] || [])[0] || "");
    refreshClasses();
  };
  gradeSelect.onchange = () => refreshClasses();
  document.getElementById("saveStudentForm").onclick = async () => {
    const selectedOption = classSelect.selectedOptions[0];
    const classValue = classSelect.value;
    const payload = {
      name: document.getElementById("sfName").value.trim(),
      email: composeSchoolEmail(document.getElementById("sfEmailLocal").value),
      classId: /^\d+$/.test(classValue) ? Number(classValue) : null,
      stage: stageSelect.value,
      gradeLabel: gradeSelect.value,
      classNumber: Number(selectedOption?.dataset.classNumber || 0),
      temporaryPassword: document.getElementById("sfPassword")?.value || undefined,
    };
    if (!payload.name) {
      document.getElementById("studentFormMsg").innerHTML = '<div class="form-error">اكتبي اسم الطالبة.</div>';
      return;
    }
    if (!document.getElementById("sfEmailLocal").value.trim()) {
      document.getElementById("studentFormMsg").innerHTML = '<div class="form-error">اكتبي اسم المستخدم في البريد الإلكتروني.</div>';
      return;
    }
    try {
      if (student) await api(`/students/${student.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/students", { method: "POST", body: JSON.stringify(payload) });
      closeModal();
      allClasses = await api("/students/classes");
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
let followUpMode = sessionStorage.getItem("madarFollowUpMode") === "tests" ? "tests" : "tracking";
let followUpSection = sessionStorage.getItem("madarFollowUpSection") || "attendance";
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
  await loadSchoolSettings();
  if (!trackingMode) await prepareAcademicSelection("followUp");
  contentEl.innerHTML = `
    <div class="card follow-up-card">
      <div class="follow-up-top-row">
        <div class="follow-up-main-tabs" role="tablist" aria-label="أقسام سجل المتابعة">
          <button class="follow-up-main-tab ${trackingMode ? "active" : ""}" type="button" data-follow-mode="tracking" role="tab" aria-selected="${trackingMode}">
            <span aria-hidden="true">📖</span><span class="follow-up-tab-copy"><strong>متابعة</strong></span>
          </button>
          <button class="follow-up-main-tab ${!trackingMode ? "active" : ""}" type="button" data-follow-mode="tests" role="tab" aria-selected="${!trackingMode}">
            <span aria-hidden="true">📝</span><span class="follow-up-tab-copy"><strong>سجل الدرجات</strong></span>
          </button>
        </div>
        <div class="follow-up-top-tools">
          <label class="follow-up-search-box">
            <span aria-hidden="true">⌕</span>
            <input id="followUpSearch" placeholder="بحث باسم الطالبة أو البريد..." autocomplete="off" />
          </label>
          <div class="follow-up-top-action" id="followUpTopAction" aria-live="polite"></div>
        </div>
      </div>
      ${trackingMode ? `
        <div class="follow-up-categories follow-up-action-buttons" role="group" aria-label="خيارات المتابعة">
          <button type="button" class="${followUpSection === "attendance" ? "active" : ""}" data-follow-section="attendance" aria-pressed="${followUpSection === "attendance"}"><span aria-hidden="true">🗓️</span><strong>الحضور</strong></button>
          <button type="button" class="${followUpSection === "participation" ? "active" : ""}" data-follow-section="participation" aria-pressed="${followUpSection === "participation"}"><span aria-hidden="true">🙋‍♀️</span><strong>المشاركة</strong></button>
          <button type="button" class="${followUpSection === "homework" ? "active" : ""}" data-follow-section="homework" aria-pressed="${followUpSection === "homework"}"><span aria-hidden="true">📖</span><strong>الواجبات</strong></button>
          <button type="button" class="${followUpSection === "tasks" ? "active" : ""}" data-follow-section="tasks" aria-pressed="${followUpSection === "tasks"}"><span aria-hidden="true">📚</span><strong>المهام</strong></button>
        </div>
      ` : `
        ${academicSelectorHtml("followUp")}
        <div class="toolbar follow-up-period-toolbar">
          <div class="tabs" style="margin:0">
            ${[1, 2, 3].map((period) => `<button class="tab-btn ${followUpPeriod === period ? "active" : ""}" data-follow-period="${period}">${period === 1 ? "الفترة الأولى" : period === 2 ? "الفترة الثانية" : "الفترة الثالثة"}</button>`).join("")}
          </div>
          <div class="spacer"></div>
          <span class="follow-up-grade-note">جدول الدرجات محفوظ لكل ترم على حدة</span>
        </div>
        <div id="followUpContent"><div class="empty-state">جارٍ تحميل جدول الدرجات...</div></div>
      `}
    </div>
  `;
  document.querySelectorAll("[data-follow-mode]").forEach((button) => {
    button.onclick = () => {
      followUpMode = button.dataset.followMode;
      sessionStorage.setItem("madarFollowUpMode", followUpMode);
      renderFollowUp();
    };
  });
  if (trackingMode) {
    document.querySelectorAll("[data-follow-section]").forEach((button) => {
      button.onclick = () => {
        followUpSection = button.dataset.followSection;
        sessionStorage.setItem("madarFollowUpSection", followUpSection);
        renderFollowUp();
      };
    });
    return;
  }
  bindAcademicSelector("followUp", renderFollowUp);
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
  const data = await api(`/follow-up?period=${followUpPeriod}&${academicQuery("followUp")}`);
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
    const selection = normalizeAcademicSelection("followUp");
    await api("/follow-up", { method: "PUT", body: JSON.stringify({ period: followUpPeriod, settings, rows, stage: selection.stage, gradeLabel: actualAcademicGradeLabel("followUp"), classId: selection.classId, academicYear: schoolSettings?.academicYear || "", semester: schoolSettings?.currentSemester || "first" }) });
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
  contentEl.innerHTML = `
    <section class="motivation-frame-shell">
      <iframe class="motivation-app-frame" src="motivation.html?v=5" title="مشروع نقاط التحفيز" loading="eager"></iframe>
    </section>
  `;
}

// ==========================================================================
// الاختبارات (قبلي / بعدي / قصيرة)
// ==========================================================================
const TEST_TYPE_LABELS = { pre_diagnostic: "تشخيصي قبلي", post_diagnostic: "تشخيصي بعدي", quiz: "اختبار قصير" };
let testsPanelMode = "all";

function openTestsPanel(type = "pre_diagnostic") {
  testsPanelMode = type;
  // منع إعادة رسم الصفحة مرتين عند تغيير الرابط؛ كان ذلك يسبب سباقًا بين الفلاتر.
  if (location.hash.replace("#", "") === "tests-panel") {
    renderTestsPanel().catch(showTestsLoadError);
  } else {
    location.hash = "tests-panel";
  }
}

async function renderTestsPanel() {
  await prepareAcademicSelection("tests");
  contentEl.innerHTML = `
    ${academicSelectorHtml("tests")}
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام الاختبارات">
      <button class="tab-btn ${testsPanelMode === "all" ? "active" : ""}" data-tests-panel="all">كل الاختبارات</button>
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
  bindAcademicSelector("tests", renderTestsPanel);
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
    document.getElementById("newTestBtn").onclick = () => openTestForm(type === "all" ? "pre_diagnostic" : type);
    await loadTestsList(type);
  };
}

function showTestsLoadError(error) {
  const message = error?.message || "تعذر تحميل الاختبارات.";
  contentEl.innerHTML = `<div class="card form-error"><strong>تعذر إظهار الاختبارات</strong><p>${escapeHtml(message)}</p><button class="btn btn-primary btn-sm" id="retryTestsLoad" type="button">إعادة المحاولة</button></div>`;
  document.getElementById("retryTestsLoad")?.addEventListener("click", () => renderTestsPanel().catch(showTestsLoadError));
}

async function loadTestsList(type) {
  const wrap = document.getElementById("testsWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty-state">جارٍ تحميل الاختبارات المحفوظة...</div>`;

  try {
    const query = new URLSearchParams(academicQuery("tests"));
    if (type !== "all") query.set("type", type);
    if (recentCreatedTestId > 0 && (type === "all" || recentCreatedTestType === type)) query.set("includeId", String(recentCreatedTestId));
    const tests = await api(`/tests?${query.toString()}`);

    if (!Array.isArray(tests) || !tests.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="ic">📝</div><strong>لا توجد اختبارات محفوظة من هذا النوع.</strong><p>أنشئي اختبارًا جديدًا وسيظهر هنا مباشرة كمسودة.</p></div>`;
      return;
    }

    // ترتيب الاختبار المنشأ الآن أولًا، ثم اختبارات السياق الحالي، ثم بقية الاختبارات.
    tests.sort((a, b) => {
      const aRecent = Number(a.id) === recentCreatedTestId || Number(a.recent_created || 0) === 1;
      const bRecent = Number(b.id) === recentCreatedTestId || Number(b.recent_created || 0) === 1;
      if (aRecent !== bRecent) return aRecent ? -1 : 1;
      const aOutside = Number(a.outside_filter || 0);
      const bOutside = Number(b.outside_filter || 0);
      if (aOutside !== bOutside) return aOutside - bOutside;
      return Number(b.id) - Number(a.id);
    });

    const currentCount = tests.filter((t) => !Number(t.outside_filter || 0)).length;
    const outsideCount = tests.length - currentCount;
    wrap.innerHTML = `
      <div class="tests-visibility-summary">
        <div><strong>${tests.length}</strong><span>${type === "all" ? "إجمالي كل الاختبارات" : `إجمالي اختبارات ${escapeHtml(TEST_TYPE_LABELS[type] || "هذا النوع")}`}</span></div>
        <div><strong>${currentCount}</strong><span>للفصل والفلتر الحالي</span></div>
        ${outsideCount ? `<div class="tests-summary-outside"><strong>${outsideCount}</strong><span>اختبارات أخرى ظاهرة ولن تُخفى</span></div>` : ""}
      </div>
      <div class="tests-all-visible-note">تُعرض جميع الاختبارات المحفوظة من هذا النوع. الفلتر يميّز الاختبار فقط ولا يخفيه.</div>
      <div class="table-wrap tests-table-wrap">
        <table class="tests-list-table">
          <thead><tr><th>العنوان</th><th>نوع الاختبار</th><th>المرحلة والصف</th><th>الفصل</th><th>السنة والترم</th><th>المهارة</th><th>الحالة</th><th>عدد الأسئلة</th><th>الإجابات</th><th>إجراءات</th></tr></thead>
          <tbody>
            ${tests.map((t) => {
              const isRecent = Number(t.id) === recentCreatedTestId || Number(t.recent_created || 0) === 1;
              const isOutside = Number(t.outside_filter || 0) === 1;
              const semesterLabel = t.semester === "second" ? "الترم الثاني" : "الترم الأول";
              const testStage = t.stage || t.bank_stage || t.grade_label || t.bank_grade_label || "";
              return `<tr ${isRecent ? 'class="recent-created-test-row" data-recent-created-test-row="1"' : ""}>
                <td><strong>${escapeHtml(t.title)}</strong>${isRecent ? '<br><span class="badge badge-green">تم إنشاؤه الآن</span>' : ""}${isOutside ? '<br><span class="badge badge-orange">خارج الفلتر الحالي — لكنه ظاهر</span>' : ""}</td>
                <td><span class="badge badge-purple">${escapeHtml(TEST_TYPE_LABELS[t.type] || t.type || "اختبار")}</span></td>
                <td>${escapeHtml(`${t.stage || t.bank_stage || "—"} · ${t.grade_label || t.bank_grade_label || "—"}`)}</td>
                <td>${escapeHtml(t.class_name || "فصل محذوف أو غير محدد")}</td>
                <td>${arabicMathHtml(`${t.academic_year || "غير محددة"} · ${semesterLabel}`, testStage)}</td>
                <td>${escapeHtml(t.question_source === "lesson_bank" ? `${arabicMathNumber(t.expected_lesson_count || t.question_count || 0, testStage)} مهارة مختارة` : (t.skill_name || "أسئلة محددة"))}</td>
                <td><span class="badge ${t.status === "published" ? "badge-green" : t.status === "closed" ? "badge-red" : "badge-gray"}">${t.status === "published" ? "منشور" : t.status === "closed" ? "مغلق" : "مسودة"}</span></td>
                <td>${t.question_source === "lesson_bank" ? `${arabicMathNumber(Number(t.approved_lesson_count || 0), testStage)}/${arabicMathNumber(Number(t.question_count || 0), testStage)} مهارة معتمدة` : arabicMathNumber(Number(t.question_count || 0), testStage)}</td>
                <td>${arabicMathNumber(Number(t.completed_count || 0), testStage)}/${arabicMathNumber(Number(t.assigned_count || 0), testStage)}</td>
                <td class="tests-actions-cell">
                  <button class="btn btn-outline btn-sm" data-edit="${t.id}" data-test-type="${t.type}">تعديل</button>
                  <button class="btn btn-secondary btn-sm" data-dup="${t.id}" data-test-type="${t.type}">نسخ</button>
                  <button class="btn ${t.status === "published" ? "btn-outline" : "btn-primary"} btn-sm" data-toggle="${t.id}" data-status="${t.status}">${t.status === "published" ? "إلغاء النشر" : "نشر"}</button>
                  <button class="btn btn-outline btn-sm" data-results="${t.id}">النتائج</button>
                  <a class="btn btn-outline btn-sm" href="/api/teacher/reports/test/${t.id}.pdf" target="_blank">طباعة</a>
                  <a class="btn btn-outline btn-sm" href="/api/teacher/reports/test/${t.id}.pdf?answerKey=1" target="_blank">نموذج الإجابة</a>
                  <button class="btn btn-danger btn-sm" data-del="${t.id}" data-title="${escapeHtml(t.title)}">حذف</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;

    const recentRow = wrap.querySelector("[data-recent-created-test-row]");
    if (recentRow) {
      requestAnimationFrame(() => recentRow.scrollIntoView({ behavior: "smooth", block: "center" }));
      sessionStorage.removeItem("madarRecentCreatedTestId");
      sessionStorage.removeItem("madarRecentCreatedTestType");
      recentCreatedTestId = 0;
      recentCreatedTestType = "";
    }

    wrap.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => openTestForm(b.dataset.testType || (type === "all" ? "pre_diagnostic" : type), await api(`/tests/${b.dataset.edit}`))));
    wrap.querySelectorAll("[data-dup]").forEach((b) => b.addEventListener("click", async () => {
      const copied = await api(`/tests/${b.dataset.dup}/duplicate`, { method: "POST" });
      recentCreatedTestId = Number(copied.id || 0);
      recentCreatedTestType = b.dataset.testType || (type === "all" ? "pre_diagnostic" : type);
      toast("تم نسخ الاختبار كمسودة.");
      loadTestsList(type);
    }));
    wrap.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
      const action = b.dataset.status === "published" ? "unpublish" : "publish";
      await api(`/tests/${b.dataset.toggle}/${action}`, { method: "POST" });
      toast(action === "publish" ? "تم نشر الاختبار." : "تم إلغاء نشر الاختبار.");
      loadTestsList(type);
    }));
    wrap.querySelectorAll("[data-results]").forEach((b) => b.addEventListener("click", () => openTestResults(b.dataset.results)));
    wrap.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () =>
      confirmAction(`هل تأكيد حذف الاختبار "${b.dataset.title}"؟`, async () => {
        await api(`/tests/${b.dataset.del}`, { method: "DELETE" });
        toast("تم حذف الاختبار.");
        loadTestsList(type);
      })
    ));
  } catch (error) {
    wrap.innerHTML = `<div class="form-error tests-load-error"><strong>تعذر تحميل الاختبارات</strong><p>${escapeHtml(error.message)}</p><button class="btn btn-primary btn-sm" id="retryTestsList" type="button">إعادة المحاولة</button></div>`;
    document.getElementById("retryTestsList")?.addEventListener("click", () => loadTestsList(type));
  }
}

let questionDraft = [];
let questionDraftStage = "";

function openTestForm(type, test) {
  const selection = normalizeAcademicSelection("tests");
  const matchingClasses = academicClasses(selection);
  const selectedClassId = String(test?.class_id || selection.classId || "");
  const existingClass = test?.class_id ? allClasses.find((item) => String(item.id) === String(test.class_id)) : null;
  const formClasses = existingClass && !matchingClasses.some((item) => String(item.id) === String(existingClass.id)) ? [existingClass, ...matchingClasses] : matchingClasses;
  const dynamicBankTest = test?.question_source === "lesson_bank";
  questionDraftStage = test?.stage || test?.bank_stage || existingClass?.level || selection.stage || "";
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
    <div class="test-context-note">${escapeHtml(selection.stage)} · ${escapeHtml(selection.gradeLabel)} · ${escapeHtml(schoolSettings?.semesterLabel || "الترم الأول")} · ${escapeHtml(schoolSettings?.academicYear || "العام غير محدد")}</div>
    <div class="form-grid">
      <div class="field">عنوان الاختبار<input id="tfTitle" value="${escapeHtml(test?.title || "")}" /></div>
      <div class="field">المهارة
        <select id="tfSkill"><option value="">بدون مهارة</option>${allSkills.map((s) => `<option value="${s.id}" ${test?.skill_id == s.id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}</select>
      </div>
      <div class="field">الفصل
        <select id="tfClass"><option value="">اختاري الفصل</option>${formClasses.map((c, index) => `<option value="${c.id}" ${selectedClassId === String(c.id) ? "selected" : ""}>الفصل ${arabicClassNumber(index)} — ${escapeHtml(c.name)}</option>`).join("")}</select>
      </div>
      <div class="field diagnostic-duration-field"><span>مدة الاختبار (دقيقة)</span><div class="diagnostic-duration-row"><input type="number" min="1" max="240" id="tfDuration" value="${Number(test?.duration_minutes) === 0 ? 20 : (test?.duration_minutes || 20)}" ${Number(test?.duration_minutes) === 0 ? "disabled" : ""} /><label class="diagnostic-no-time-option"><input type="checkbox" id="tfNoTime" ${Number(test?.duration_minutes) === 0 ? "checked" : ""}> بدون وقت</label></div></div>
      <div class="field">عدد المحاولات<input type="number" min="1" max="5" id="tfAttempts" value="${test?.max_attempts || 1}" /></div>
      <div class="field">تاريخ البداية<input type="datetime-local" id="tfStart" value="${test?.start_at ? test.start_at.slice(0, 16) : ""}" /></div>
      <div class="field">تاريخ النهاية<input type="datetime-local" id="tfEnd" value="${test?.end_at ? test.end_at.slice(0, 16) : ""}" /></div>
      <label class="field" style="display:flex;align-items:center;gap:8px;flex-direction:row"><input type="checkbox" id="tfShuffle" style="width:auto" ${test ? (Number(test.shuffle_questions) ? "checked" : "") : "checked"}> ترتيب الأسئلة عشوائيًا</label>
      <label class="field" style="display:flex;align-items:center;gap:8px;flex-direction:row"><input type="checkbox" id="tfShowResult" style="width:auto" ${test ? (Number(test.show_result) ? "checked" : "") : "checked"}> إظهار النتيجة للطالبة بعد التسليم</label>
    </div>

    ${dynamicBankTest ? `<div class="diagnostic-bank-notice"><strong>اختبار مرتبط ببنك الأسئلة</strong><p>يسحب النظام سؤالًا عشوائيًا واحدًا من كل مهارة ويحفظ نسخة مختلفة لكل طالبة. المعتمد الآن ${Number(test.approved_lesson_count || 0)} من ${Number(test.expected_lesson_count || 0)} مهارة.</p></div>` : `<h4 style="margin:18px 0 10px">الأسئلة</h4><div id="questionsWrap"></div><button class="btn btn-secondary btn-sm" id="addQuestionBtn">+ إضافة سؤال</button>`}

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
  const testNoTime = document.getElementById("tfNoTime");
  const testDuration = document.getElementById("tfDuration");
  if (testNoTime && testDuration) testNoTime.onchange = () => { testDuration.disabled = testNoTime.checked; };
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
        <strong>سؤال ${arabicMathNumber(idx + 1, questionDraftStage)}</strong>
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
                 (i) => `<div class="option-row"><input type="text" placeholder="الخيار ${MADAR_MATH_OPTION_LABELS[i] || arabicMathNumber(i + 1, questionDraftStage)}" data-q="${idx}" data-field="opt${i}" value="${escapeHtml(q.options?.[i] || "")}" /></div>`
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
    durationMinutes: document.getElementById("tfNoTime")?.checked ? 0 : Math.max(1, Math.min(240, Number(document.getElementById("tfDuration").value) || 20)),
    maxAttempts: Number(document.getElementById("tfAttempts").value) || 1,
    shuffleQuestions: document.getElementById("tfShuffle").checked,
    showResult: document.getElementById("tfShowResult").checked,
    startAt: document.getElementById("tfStart").value || null,
    endAt: document.getElementById("tfEnd").value || null,
    academicYear: schoolSettings?.academicYear || "",
    semester: schoolSettings?.currentSemester || "first",
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
    <div class="modal-actions"><a class="btn btn-outline" href="/api/teacher/reports/test/${testId}.pdf?report=results" target="_blank">طباعة النتائج</a><a class="btn btn-outline" href="/api/teacher/reports/test/${testId}.pdf?report=analysis" target="_blank">طباعة التحليل</a><button class="btn btn-outline" id="closeResultsModal">إغلاق</button></div>
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

function analysisMasteryClass(value) {
  const percent = Number(value) || 0;
  if (percent >= 85) return "badge-green";
  if (percent >= 70) return "badge-purple";
  if (percent >= 50) return "badge-orange";
  return "badge-red";
}

function analysisScoreCell(score) {
  if (!score) return '<span class="analysis-no-score">—</span>';
  return `<strong>${Number(score.score).toFixed(1).replace(/\.0$/, "")}/${Number(score.totalPoints).toFixed(1).replace(/\.0$/, "")}</strong><small>${Math.round(Number(score.percentage) || 0)}%</small>`;
}

function analysisClassContext(classId) {
  const cls = allClasses.find((item) => String(item.id) === String(classId || ""));
  return {
    id: cls?.id || "",
    name: cls?.name || "جميع الفصول",
    stage: cls?.level || "جميع المراحل",
    grade: cls?.grade_label || "جميع الصفوف",
  };
}

function analysisPrintNumber(value, suffix = "") {
  const number = Number(value) || 0;
  return `${Number.isInteger(number) ? number : number.toFixed(1).replace(/\.0$/, "")}${suffix}`;
}

function analysisPrintTable(headers, rows, className = "") {
  return `<div class="print-table-wrap"><table class="${escapeHtml(className)}"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

async function openAnalysisPrint({ title, classId = "", bodyHtml = "", orientation = "portrait" }) {
  const popup = window.open("", "_blank");
  if (!popup) {
    toast("اسمحي بالنوافذ المنبثقة حتى تفتح معاينة الطباعة.", "error");
    return;
  }
  try { popup.opener = null; } catch (error) {}
  let settings = {};
  try {
    settings = await loadSchoolSettings();
  } catch (error) {
    settings = {};
  }
  const context = analysisClassContext(classId);
  const absoluteMadarLogo = new URL(settings.madarLogoUrl || "/assets/print/madar-logo.svg", window.location.origin).href;
  const absoluteVisionLogo = new URL(settings.visionLogoUrl || "/vision-2030-logo.png", window.location.origin).href;
  const absoluteAdditionalLogo = settings.additionalLogoUrl ? new URL(settings.additionalLogoUrl, window.location.origin).href : "";
  const governmentLines = [
    "<strong>المملكة العربية السعودية</strong>",
    settings.educationDepartment ? `<span>إدارة التعليم: ${escapeHtml(settings.educationDepartment)}</span>` : "",
    settings.educationOffice ? `<span>مكتب التعليم: ${escapeHtml(settings.educationOffice)}</span>` : "",
    settings.schoolName ? `<span>المدرسة: ${escapeHtml(settings.schoolName)}</span>` : "",
  ].filter(Boolean).join("");
  const leader = settings.schoolLeaderName || "____________________";
  const teacher = settings.teacherName || currentTeacher?.name || "____________________";
  const academicYear = settings.academicYear || "—";
  const semester = settings.semesterLabel || "—";
  const subjectName = settings.subjectName || "الرياضيات";
  const printStage = context.stage && context.stage !== "جميع المراحل" ? context.stage : (settings.stageLabel || context.stage || "—");
  const printGrade = context.grade && context.grade !== "جميع الصفوف" ? context.grade : (settings.gradeLabel || context.grade || "—");
  const pageOrientation = orientation === "landscape" ? "landscape" : "portrait";
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 ${pageOrientation}; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; direction: rtl; color: #28213a; font-family: Tahoma, Arial, sans-serif; background: #eef0f3; }
    .print-actions { position: sticky; top: 0; z-index: 20; display: flex; justify-content: center; gap: 10px; padding: 12px; background: #fff; border-bottom: 1px solid #ddd; }
    .print-actions button { border: 1px solid #5a2b82; border-radius: 9px; padding: 9px 18px; background: #5a2b82; color: #fff; font: inherit; cursor: pointer; }
    .print-actions button + button { background: #fff; color: #5a2b82; }
    .official-sheet { width: ${pageOrientation === "landscape" ? "297mm" : "210mm"}; min-height: ${pageOrientation === "landscape" ? "210mm" : "297mm"}; margin: 16px auto; padding: 7mm 8mm 18mm; background: #fff; box-shadow: 0 6px 24px rgba(25,20,35,.12); position: relative; }
    .official-frame { width: 100%; border-collapse: collapse; border: 0; table-layout: fixed; }
    .official-frame > thead > tr > td, .official-frame > tbody > tr > td { border: 0; padding: 0; vertical-align: top; }
    .official-header { display: grid; grid-template-columns: minmax(0,1fr) minmax(48mm,.72fr) minmax(0,1fr); grid-template-areas: "meta logo government"; gap: 6mm; align-items: center; border-bottom: 2px solid #765191; padding-bottom: 4mm; margin-bottom: 5mm; direction: ltr; }
    .government-copy { grid-area: government; direction: rtl; text-align: right; font-size: 9.2pt; line-height: 1.65; }
    .government-copy strong, .government-copy span { display: block; }
    .government-copy strong { font-size: 10.5pt; }
    .center-logo { grid-area: logo; direction: rtl; text-align: center; }
    .print-logo-row { display:flex;align-items:center;justify-content:center;gap:4mm;min-height:21mm; }
    .print-logo-row img { display:block;width:auto;height:auto;max-width:33mm;max-height:18mm;object-fit:contain; }
    .center-logo h1 { margin: 2mm 0 0; color: #4f266f; font-size: 15pt; line-height: 1.35; }
    .report-meta { grid-area: meta; direction: rtl; border: 1px solid #d8d0df; border-radius: 8px; background: #faf9fb; padding: 2.5mm 3mm; font-size: 8.8pt; line-height: 1.75; text-align: right; }
    .report-meta b { color: #5a2b82; }
    .report-content { width: 100%; max-width: 100%; overflow: hidden; padding-bottom: 14mm; }
    .report-title { margin: 0 0 4mm; color: #4f266f; font-size: 13pt; }
    .print-summary { display: grid; grid-template-columns: repeat(auto-fit,minmax(32mm,1fr)); gap: 3mm; margin: 0 0 5mm; }
    .print-summary > div { border: 1px solid #d9d1e1; border-radius: 7px; background: #faf8fd; padding: 3mm; text-align: center; }
    .print-summary strong { display: block; color: #4f266f; font-size: 14pt; margin-bottom: 1mm; }
    .print-summary span { font-size: 8.5pt; }
    h2, h3, h4 { color: #4f266f; break-after: avoid; }
    h2 { font-size: 13pt; margin: 5mm 0 2.5mm; }
    h3 { font-size: 11.5pt; margin: 4mm 0 2mm; }
    .print-note { border: 1px solid #ded6e8; border-radius: 7px; background: #f7f3fb; padding: 3mm; font-size: 8.5pt; line-height: 1.7; margin: 3mm 0; }
    .print-table-wrap { width: 100%; max-width: 100%; overflow: visible; margin: 3mm 0; }
    table:not(.official-frame) { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${pageOrientation === "landscape" ? "7.4pt" : "8.2pt"}; }
    table:not(.official-frame) thead { display: table-header-group; }
    table:not(.official-frame) th, table:not(.official-frame) td { border: 1px solid #b9b3bf; padding: 1.8mm; text-align: center; vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
    table:not(.official-frame) th { background: #f1edf5; color: #3f2555; font-weight: 700; }
    table:not(.official-frame) tr { break-inside: avoid; page-break-inside: avoid; }
    .question-print-table th:nth-child(1), .question-print-table td:nth-child(1) { width: 11%; }
    .question-print-table th:nth-child(2), .question-print-table td:nth-child(2) { width: 18%; }
    .question-print-table th:nth-child(3), .question-print-table td:nth-child(3) { width: 32%; text-align: right; }
    .question-print-table th:nth-child(4), .question-print-table td:nth-child(4) { width: 12%; }
    .question-print-table th:nth-child(5), .question-print-table td:nth-child(5) { width: 13%; }
    .question-print-table th:nth-child(6), .question-print-table td:nth-child(6) { width: 14%; }
    .mastery-good { color: #0b7a4b; font-weight: 700; }
    .mastery-mid { color: #8a5a00; font-weight: 700; }
    .mastery-low { color: #b3261e; font-weight: 700; }
    .official-footer { position: absolute; right: 8mm; left: 8mm; bottom: 6mm; display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; border-top: 1px solid #cfc7d5; padding-top: 2.5mm; font-size: 9pt; direction: rtl; }
    .official-footer span:first-child { text-align: right; }
    .official-footer span:last-child { text-align: left; }
    @media print {
      html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-actions { display: none !important; }
      .official-sheet { width: auto; min-height: 0; margin: 0; padding: 0 0 15mm; box-shadow: none; }
      .official-frame > thead { display: table-header-group; }
      .official-header { break-inside: avoid; }
      .official-footer { position: fixed; right: 0; left: 0; bottom: 0; }
    }
    @media (max-width: 850px) {
      .official-sheet { width: 100%; min-height: 0; margin: 0; padding: 14px; }
      .official-header { grid-template-columns: 1fr; grid-template-areas: "government" "logo" "meta"; }
      .official-footer { position: static; margin-top: 20px; }
    }
  </style>
</head>
<body>
  <div class="print-actions"><button type="button" onclick="window.print()">طباعة / حفظ PDF</button><button type="button" onclick="window.close()">إغلاق</button></div>
  <main class="official-sheet">
    <table class="official-frame">
      <thead><tr><td>
        <header class="official-header">
          <section class="government-copy">${governmentLines}</section>
          <section class="center-logo"><div class="print-logo-row"><img src="${absoluteMadarLogo}" alt="شعار مدار"><img src="${absoluteVisionLogo}" alt="شعار رؤية السعودية 2030">${absoluteAdditionalLogo ? `<img src="${absoluteAdditionalLogo}" alt="الشعار الإضافي">` : ""}</div><h1>${escapeHtml(title)}</h1></section>
          <section class="report-meta">
            <div><b>المادة:</b> ${escapeHtml(subjectName)}</div>
            <div><b>المرحلة والصف:</b> ${escapeHtml(`${printStage} — ${printGrade}`)}</div>
            <div><b>الفصل:</b> ${escapeHtml(context.name)}</div>
            <div><b>الفصل الدراسي:</b> ${escapeHtml(semester)}</div>
            <div><b>العام الدراسي:</b> ${escapeHtml(academicYear)}</div>
          </section>
        </header>
      </td></tr></thead>
      <tbody><tr><td><section class="report-content">${bodyHtml}</section></td></tr></tbody>
    </table>
    <footer class="official-footer"><span>مديرة المدرسة: ${escapeHtml(leader)}</span><span>المعلمة: ${escapeHtml(teacher)}</span></footer>
  </main>
</body>
</html>`);
  popup.document.close();
  popup.focus();
}

async function renderAnalysisPanel() {
  contentEl.innerHTML = `
    <section class="analysis-panel-root">
      <div class="student-panel-tabs" role="tablist" aria-label="أقسام تحليل النتائج">
        <button class="tab-btn ${analysisPanelMode === "student" ? "active" : ""}" data-analysis-panel="student">تحليل كل طالبة وسجل الدرجات</button>
        <button class="tab-btn ${analysisPanelMode === "class" ? "active" : ""}" data-analysis-panel="class">تحليل الفصل العام</button>
        <button class="tab-btn ${analysisPanelMode === "skill" ? "active" : ""}" data-analysis-panel="skill">تحليل أسئلة الاختبار والمهارات</button>
      </div>
      <div id="analysisPanelContent"></div>
    </section>
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
  target.innerHTML = `
    <div class="card analysis-controls-card">
      <div class="toolbar analysis-toolbar">
        <input id="anStudentSearch" type="search" placeholder="ابحثي باسم الطالبة أو بريدها الإلكتروني" />
        <select id="anStudentClass"><option value="">كل الفصول</option>${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
        <select id="anStudent"><option value="">اختاري طالبة لعرض تفاصيلها</option></select>
        <button class="btn btn-secondary analysis-print-btn" id="printAnalysisStudent" type="button" disabled>🖨️ طباعة PDF</button>
      </div>
      <div id="anStudentWrap"><div class="empty-state">ابحثي عن الطالبة أو اختاري اسمها لعرض درجتها وتطورها.</div></div>
    </div>
    <div class="card analysis-gradebook-card">
      <div class="analysis-card-heading">
        <div><span>سجل الدرجات التراكمي</span><h3>درجات الطالبات في جميع الاختبارات</h3></div>
        <small>يبدأ الجدول بالبريد الإلكتروني ثم الاسم، ويُضاف عمود تلقائي لكل اختبار جديد.</small>
      </div>
      <div id="analysisGradebookWrap"><div class="empty-state">جارٍ تحميل سجل الدرجات...</div></div>
    </div>
  `;

  let gradebook = { tests: [], rows: [] };
  let selectedStudentAnalysis = null;
  const searchInput = document.getElementById("anStudentSearch");
  const classSelect = document.getElementById("anStudentClass");
  const studentSelect = document.getElementById("anStudent");
  const printButton = document.getElementById("printAnalysisStudent");
  const gradebookWrap = document.getElementById("analysisGradebookWrap");

  function filteredRows() {
    const query = searchInput.value.trim().toLocaleLowerCase("ar");
    return gradebook.rows.filter((row) => !query || `${row.name} ${row.email}`.toLocaleLowerCase("ar").includes(query));
  }

  function fillStudentSelect() {
    const current = studentSelect.value;
    const rows = filteredRows();
    studentSelect.innerHTML = `<option value="">اختاري طالبة لعرض تفاصيلها</option>${rows.map((row) => `<option value="${row.studentId}">${escapeHtml(row.name)} — ${escapeHtml(row.email)}</option>`).join("")}`;
    if (rows.some((row) => String(row.studentId) === String(current))) studentSelect.value = current;
  }

  function drawGradebook() {
    const rows = filteredRows();
    if (!gradebook.tests.length) {
      gradebookWrap.innerHTML = '<div class="empty-state">لا توجد اختبارات في هذا الفصل بعد.</div>';
      return;
    }
    gradebookWrap.innerHTML = `
      <div class="analysis-gradebook-scroll">
        <table class="analysis-gradebook-table">
          <thead><tr>
            <th class="analysis-sticky-email">البريد الإلكتروني</th>
            <th class="analysis-sticky-name">اسم الطالبة</th>
            ${gradebook.tests.map((test) => `<th><strong>${escapeHtml(test.title)}</strong><small>${escapeHtml(TEST_TYPE_LABELS[test.type] || test.type)}</small></th>`).join("")}
          </tr></thead>
          <tbody>
            ${rows.map((row) => `<tr data-gradebook-row="${row.studentId}">
              <td class="analysis-sticky-email">${escapeHtml(row.email)}</td>
              <td class="analysis-sticky-name"><button type="button" class="analysis-student-link" data-analysis-student="${row.studentId}">${escapeHtml(row.name)}</button><small>${escapeHtml(row.className || "—")}</small></td>
              ${gradebook.tests.map((test) => `<td class="analysis-score-cell">${analysisScoreCell(row.scores?.[test.id])}</td>`).join("")}
            </tr>`).join("") || `<tr><td colspan="${gradebook.tests.length + 2}" class="empty-state">لا توجد طالبات مطابقة للبحث.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    gradebookWrap.querySelectorAll("[data-analysis-student]").forEach((button) => {
      button.onclick = async () => {
        studentSelect.value = button.dataset.analysisStudent;
        await loadStudent(button.dataset.analysisStudent);
        document.getElementById("anStudentWrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });
  }

  async function loadGradebook() {
    gradebookWrap.innerHTML = '<div class="empty-state">جارٍ تحميل سجل الدرجات...</div>';
    gradebook = await api(`/analysis/gradebook?classId=${encodeURIComponent(classSelect.value)}`);
    fillStudentSelect();
    drawGradebook();
  }

  async function loadStudent(studentId) {
    const wrap = document.getElementById("anStudentWrap");
    if (!studentId) {
      selectedStudentAnalysis = null;
      printButton.disabled = true;
      wrap.innerHTML = '<div class="empty-state">ابحثي عن الطالبة أو اختاري اسمها لعرض درجتها وتطورها.</div>';
      return;
    }
    wrap.innerHTML = '<div class="empty-state">جارٍ تحميل نتيجة الطالبة...</div>';
    const data = await api(`/analysis/student/${studentId}`);
    selectedStudentAnalysis = data;
    printButton.disabled = false;
    wrap.innerHTML = `
      <div class="analysis-student-summary">
        <div><span>الطالبة</span><strong>${escapeHtml(data.student.name)}</strong><small>${escapeHtml(data.student.email)} · ${escapeHtml(data.student.class_name || "—")}</small></div>
        <div><span>متوسط التقدم</span><strong>${Math.round(Number(data.student.progress_percent) || 0)}%</strong></div>
      </div>
      <h4 class="section-title">درجات الاختبارات</h4>
      ${data.results.length ? `<div class="table-wrap"><table><thead><tr><th>الاختبار</th><th>النوع</th><th>الدرجة</th><th>النسبة</th><th>التاريخ</th></tr></thead><tbody>${data.results.map((result) => `<tr><td><strong>${escapeHtml(result.title)}</strong></td><td>${escapeHtml(TEST_TYPE_LABELS[result.type] || result.type)}</td><td>${Number(result.score).toFixed(1).replace(/\.0$/, "")}/${Number(result.total_points).toFixed(1).replace(/\.0$/, "")}</td><td><span class="badge ${analysisMasteryClass(result.percentage)}">${Math.round(Number(result.percentage) || 0)}%</span></td><td>${formatDate(result.submitted_at)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">لم تُكمل الطالبة أي اختبار بعد.</div>'}
      <div class="grid-2 analysis-skill-columns">
        <div><h4 class="section-title">مهارات متقنة</h4>${data.mastered.length ? data.mastered.map((skill) => `<div class="skill-pill"><span>${escapeHtml(skill.name)}</span><span class="badge badge-green">${Math.round(skill.mastery_percent)}%</span></div>`).join("") : '<p class="analysis-muted">لا توجد بيانات كافية بعد.</p>'}</div>
        <div><h4 class="section-title">تحتاج دعمًا</h4>${data.needsSupport.length ? data.needsSupport.map((skill) => `<div class="skill-pill"><span>${escapeHtml(skill.name)}</span><span class="badge badge-red">${Math.round(skill.mastery_percent)}%</span></div>`).join("") : '<p class="analysis-muted">لا توجد مهارات منخفضة حاليًا.</p>'}</div>
      </div>
    `;
  }

  printButton.addEventListener("click", async () => {
    const data = selectedStudentAnalysis;
    if (!data?.student) { toast("اختاري طالبة أولًا.", "error"); return; }
    const resultRows = data.results.map((result) => [
      `<strong>${escapeHtml(result.title)}</strong>`,
      escapeHtml(TEST_TYPE_LABELS[result.type] || result.type),
      `${analysisPrintNumber(result.score)}/${analysisPrintNumber(result.total_points)}`,
      `<strong class="${Number(result.percentage) >= 70 ? "mastery-good" : Number(result.percentage) >= 50 ? "mastery-mid" : "mastery-low"}">${analysisPrintNumber(result.percentage, "%")}</strong>`,
      escapeHtml(formatDate(result.submitted_at)),
    ]);
    const masteredRows = data.mastered.map((skill) => [escapeHtml(skill.name), `<strong class="mastery-good">${analysisPrintNumber(skill.mastery_percent, "%")}</strong>`]);
    const supportRows = data.needsSupport.map((skill) => [escapeHtml(skill.name), `<strong class="mastery-low">${analysisPrintNumber(skill.mastery_percent, "%")}</strong>`]);
    const body = `
      <div class="print-summary"><div><strong>${escapeHtml(data.student.name)}</strong><span>اسم الطالبة</span></div><div><strong>${analysisPrintNumber(data.student.progress_percent, "%")}</strong><span>متوسط التقدم</span></div></div>
      <div class="print-note"><b>البريد الإلكتروني:</b> ${escapeHtml(data.student.email)} &nbsp; | &nbsp; <b>الفصل:</b> ${escapeHtml(data.student.class_name || "—")}</div>
      <h2>درجات الاختبارات</h2>
      ${resultRows.length ? analysisPrintTable(["الاختبار", "النوع", "الدرجة", "النسبة", "التاريخ"], resultRows) : '<p>لم تُكمل الطالبة أي اختبار بعد.</p>'}
      <h2>المهارات المتقنة</h2>
      ${masteredRows.length ? analysisPrintTable(["المهارة", "نسبة الإتقان"], masteredRows) : '<p>لا توجد بيانات كافية.</p>'}
      <h2>المهارات التي تحتاج دعمًا</h2>
      ${supportRows.length ? analysisPrintTable(["المهارة", "نسبة الإتقان"], supportRows) : '<p>لا توجد مهارات منخفضة حاليًا.</p>'}`;
    await openAnalysisPrint({ title: `تحليل نتائج الطالبة - ${data.student.name}`, classId: data.student.class_id, bodyHtml: body, orientation: "portrait" });
  });
  searchInput.addEventListener("input", () => { fillStudentSelect(); drawGradebook(); });
  classSelect.addEventListener("change", async () => { studentSelect.value = ""; await loadStudent(""); await loadGradebook(); });
  studentSelect.addEventListener("change", (event) => loadStudent(event.target.value));
  await loadGradebook();
}

async function renderAnalysisClass(target = contentEl) {
  target.innerHTML = `
    <div class="card">
      <div class="toolbar analysis-toolbar"><select id="anClass"><option value="">كل الفصول</option>${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select><button class="btn btn-secondary analysis-print-btn" id="printAnalysisClass" type="button" disabled>🖨️ طباعة PDF</button></div>
      <div id="anClassWrap"></div>
    </div>
  `;
  let currentClassAnalysis = null;
  const printButton = document.getElementById("printAnalysisClass");
  async function load() {
    const classId = document.getElementById("anClass").value;
    const data = await api(`/analysis/class?classId=${encodeURIComponent(classId)}`);
    currentClassAnalysis = data;
    printButton.disabled = false;
    document.getElementById("anClassWrap").innerHTML = `
      <div class="stat-grid analysis-class-stats">
        ${statCard("🎯", data.overallQuestionMastery + "%", "إتقان جميع الطالبات لجميع الأسئلة")}
        ${statCard("📊", data.average + "%", "متوسط درجات المحاولات")}
        ${statCard("⬆️", data.highest + "%", "أعلى درجة")}
        ${statCard("⬇️", data.lowest + "%", "أقل درجة")}
        ${statCard("✅", data.passRate + "%", "نسبة النجاح")}
      </div>
      <div class="analysis-explanation-note">نسبة الإتقان العامة = مجموع درجات جميع إجابات الطالبات ÷ مجموع الدرجات الممكنة لجميع الأسئلة × 100.</div>
      <h4 class="section-title">توزيع درجات المحاولات المكتملة</h4>
      ${data.distribution.map((item) => `<div class="analysis-distribution-row"><div><span>${item.label}</span><strong>${item.count} نتيجة</strong></div><div class="progress-bar"><span style="width:${data.completedAttempts ? (item.count / data.completedAttempts) * 100 : 0}%"></span></div></div>`).join("")}
      <h4 class="section-title">نسبة الإتقان حسب كل اختبار</h4>
      ${data.testMastery.length ? `<div class="table-wrap"><table><thead><tr><th>الاختبار</th><th>النوع</th><th>نسبة الإتقان</th></tr></thead><tbody>${data.testMastery.map((test) => `<tr><td><strong>${escapeHtml(test.title)}</strong></td><td>${escapeHtml(TEST_TYPE_LABELS[test.type] || test.type)}</td><td><span class="badge ${analysisMasteryClass(test.masteryPercent)}">${test.masteryPercent}%</span></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">لا توجد إجابات مكتملة بعد.</div>'}
      <h4 class="section-title">مقارنة التشخيص القبلي والبعدي</h4>
      ${Object.keys(data.prePost || {}).length ? [["pre_diagnostic", "تشخيصي قبلي"], ["post_diagnostic", "تشخيصي بعدي"]].filter(([key]) => data.prePost[key] !== undefined).map(([key, label]) => `<div class="skill-pill"><span>${label}</span><span>${Math.round(data.prePost[key] || 0)}%</span></div>`).join("") : '<p class="analysis-muted">لا توجد بيانات كافية للمقارنة.</p>'}
    `;
  }
  printButton.addEventListener("click", async () => {
    const data = currentClassAnalysis;
    if (!data) { toast("انتظري اكتمال تحميل التحليل.", "error"); return; }
    const distributionRows = data.distribution.map((item) => [escapeHtml(item.label), escapeHtml(`${item.count} نتيجة`)]);
    const testRows = data.testMastery.map((test) => [
      `<strong>${escapeHtml(test.title)}</strong>`,
      escapeHtml(TEST_TYPE_LABELS[test.type] || test.type),
      `<strong class="${Number(test.masteryPercent) >= 70 ? "mastery-good" : Number(test.masteryPercent) >= 50 ? "mastery-mid" : "mastery-low"}">${analysisPrintNumber(test.masteryPercent, "%")}</strong>`,
    ]);
    const prePostRows = [["pre_diagnostic", "تشخيصي قبلي"], ["post_diagnostic", "تشخيصي بعدي"]]
      .filter(([key]) => data.prePost?.[key] !== undefined)
      .map(([key, label]) => [label, `<strong>${analysisPrintNumber(data.prePost[key], "%")}</strong>`]);
    const body = `
      <div class="print-summary">
        <div><strong>${analysisPrintNumber(data.overallQuestionMastery, "%")}</strong><span>إتقان جميع الطالبات لجميع الأسئلة</span></div>
        <div><strong>${analysisPrintNumber(data.average, "%")}</strong><span>متوسط الدرجات</span></div>
        <div><strong>${analysisPrintNumber(data.highest, "%")}</strong><span>أعلى درجة</span></div>
        <div><strong>${analysisPrintNumber(data.lowest, "%")}</strong><span>أقل درجة</span></div>
        <div><strong>${analysisPrintNumber(data.passRate, "%")}</strong><span>نسبة النجاح</span></div>
      </div>
      <div class="print-note">نسبة الإتقان العامة = مجموع درجات جميع إجابات الطالبات ÷ مجموع الدرجات الممكنة لجميع الأسئلة × 100.</div>
      <h2>توزيع درجات المحاولات المكتملة</h2>
      ${analysisPrintTable(["الفئة", "عدد النتائج"], distributionRows)}
      <h2>نسبة الإتقان حسب كل اختبار</h2>
      ${testRows.length ? analysisPrintTable(["الاختبار", "النوع", "نسبة الإتقان"], testRows) : '<p>لا توجد إجابات مكتملة بعد.</p>'}
      <h2>مقارنة التشخيص القبلي والبعدي</h2>
      ${prePostRows.length ? analysisPrintTable(["نوع التشخيص", "متوسط الإتقان"], prePostRows) : '<p>لا توجد بيانات كافية للمقارنة.</p>'}`;
    await openAnalysisPrint({ title: "تحليل الفصل العام", classId: document.getElementById("anClass").value, bodyHtml: body, orientation: "portrait" });
  });
  document.getElementById("anClass").addEventListener("change", load);
  await load();
}

async function renderAnalysisSkill(target = contentEl) {
  const gradebook = await api("/analysis/gradebook");
  target.innerHTML = `
    <div class="card">
      <div class="analysis-card-heading"><div><span>تحليل الاختبار</span><h3>نسبة إتقان كل سؤال بمفرده</h3></div><small>تُحسب من إجابات جميع الطالبات في آخر محاولة مكتملة.</small></div>
      <div class="toolbar analysis-toolbar"><select id="analysisTestSelect"><option value="">اختاري اختبارًا</option>${gradebook.tests.map((test) => `<option value="${test.id}">${escapeHtml(test.title)} — ${escapeHtml(TEST_TYPE_LABELS[test.type] || test.type)}</option>`).join("")}</select><button class="btn btn-secondary analysis-print-btn" id="printAnalysisSkill" type="button" disabled>🖨️ طباعة PDF</button></div>
      <div id="analysisQuestionMasteryWrap"><div class="empty-state">اختاري اختبارًا لعرض نسبة إتقان السؤال الأول والثاني وبقية الأسئلة.</div></div>
    </div>
  `;

  const select = document.getElementById("analysisTestSelect");
  const wrap = document.getElementById("analysisQuestionMasteryWrap");
  const printButton = document.getElementById("printAnalysisSkill");
  let currentQuestionMastery = null;
  async function loadQuestionMastery() {
    if (!select.value) { currentQuestionMastery = null; printButton.disabled = true; wrap.innerHTML = '<div class="empty-state">اختاري اختبارًا لعرض نسبة إتقان كل سؤال.</div>'; return; }
    wrap.innerHTML = '<div class="empty-state">جارٍ حساب نسب الإتقان...</div>';
    const data = await api(`/analysis/question-mastery?testId=${encodeURIComponent(select.value)}`);
    currentQuestionMastery = data;
    printButton.disabled = false;
    wrap.innerHTML = `
      <div class="stat-grid analysis-question-stats">${statCard("🎯", data.overallMastery + "%", "إتقان الاختبار كاملًا")}${statCard("👩🏻‍🎓", data.studentCount, "عدد الطالبات المحتسبة")}${statCard("❓", data.items.length, "عدد الأسئلة")}</div>
      ${data.items.length ? `<div class="analysis-question-table-scroll"><table class="analysis-question-table"><thead><tr><th>السؤال</th><th>المهارة</th><th>نص السؤال</th><th>عدد الطالبات</th><th>الإجابات الصحيحة</th><th>نسبة الإتقان من 100%</th></tr></thead><tbody>${data.items.map((item) => `<tr><td><strong>السؤال ${item.number}</strong></td><td>${escapeHtml(item.skillName || "—")}</td><td><strong>${escapeHtml(item.questionText || "—")}</strong>${item.variantsCount > 1 ? `<small>استُخدمت ${item.variantsCount} صيغ مختلفة من السؤال لهذه المهارة.</small>` : ""}</td><td>${item.responses}</td><td>${item.correctResponses}</td><td><div class="analysis-mastery-cell"><span class="badge ${analysisMasteryClass(item.masteryPercent)}">${item.masteryPercent}%</span><div class="progress-bar"><span style="width:${Math.max(0, Math.min(100, item.masteryPercent))}%"></span></div></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">لم تُكمل أي طالبة هذا الاختبار بعد.</div>'}
    `;
  }
  printButton.addEventListener("click", async () => {
    const data = currentQuestionMastery;
    if (!data) { toast("اختاري اختبارًا أولًا.", "error"); return; }
    const selectedTest = gradebook.tests.find((test) => String(test.id) === String(select.value));
    const questionRows = data.items.map((item) => [
      `<strong>السؤال ${escapeHtml(item.number)}</strong>`,
      escapeHtml(item.skillName || "—"),
      `${escapeHtml(item.questionText || "—")}${item.variantsCount > 1 ? `<br><small>استُخدمت ${escapeHtml(item.variantsCount)} صيغ مختلفة.</small>` : ""}`,
      escapeHtml(item.responses),
      escapeHtml(item.correctResponses),
      `<strong class="${Number(item.masteryPercent) >= 70 ? "mastery-good" : Number(item.masteryPercent) >= 50 ? "mastery-mid" : "mastery-low"}">${analysisPrintNumber(item.masteryPercent, "%")}</strong>`,
    ]);
    const body = `
      <div class="print-summary"><div><strong>${analysisPrintNumber(data.overallMastery, "%")}</strong><span>إتقان الاختبار كاملًا</span></div><div><strong>${escapeHtml(data.studentCount)}</strong><span>عدد الطالبات المحتسبة</span></div><div><strong>${escapeHtml(data.items.length)}</strong><span>عدد الأسئلة</span></div></div>
      <h2>${escapeHtml(data.test?.title || selectedTest?.title || "تحليل الاختبار")}</h2>
      ${questionRows.length ? analysisPrintTable(["السؤال", "المهارة", "نص السؤال", "عدد الطالبات", "الإجابات الصحيحة", "نسبة الإتقان"], questionRows, "question-print-table") : '<p>لم تُكمل أي طالبة هذا الاختبار بعد.</p>'}`;
    await openAnalysisPrint({ title: "تحليل أسئلة الاختبار والمهارات", classId: selectedTest?.classId || "", bodyHtml: body, orientation: "landscape" });
  });
  select.addEventListener("change", loadQuestionMastery);
  const lastTest = gradebook.tests[gradebook.tests.length - 1];
  if (lastTest) { select.value = String(lastTest.id); await loadQuestionMastery(); }
}

// ==========================================================================
// التقارير
// ==========================================================================
async function renderReportsLegacy() {
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
async function renderNotificationsLegacy() {
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
// إدارة الفصول داخل قائمة الطالبات
// ==========================================================================
async function renderClasses(target = contentEl) {
  target.innerHTML = `
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
  if (!wrap) return;
  wrap.innerHTML = classes.length
    ? `<div class="table-wrap"><table><thead><tr><th>المرحلة</th><th>الصف</th><th>الفصل</th><th>عدد الطالبات</th><th>الإجراءات</th></tr></thead><tbody>
      ${classes.map((c) => {
        const classNumber = detectedClassNumber(c.name);
        return `<tr>
          <td>${escapeHtml(c.level)}</td>
          <td>${escapeHtml(shortGradeLabel(c.level, c.grade_label))}</td>
          <td>${classNumber ? arabicClassNumber(classNumber - 1) : escapeHtml(c.name)}</td>
          <td>${Number(c.student_count || 0)}</td>
          <td><button class="btn btn-outline btn-sm" data-editc="${c.id}">تعديل</button> <button class="btn btn-danger btn-sm" data-delc="${c.id}" data-name="${escapeHtml(c.name)}">حذف</button></td>
        </tr>`;
      }).join("")}
    </tbody></table></div>`
    : `<div class="empty-state">لا توجد فصول بعد. أضيفي المرحلة والصف والفصل من ١ إلى ٤.</div>`;

  wrap.querySelectorAll("[data-editc]").forEach((b) =>
    b.addEventListener("click", () => openClassForm(classes.find((c) => c.id == b.dataset.editc)))
  );
  wrap.querySelectorAll("[data-delc]").forEach((b) =>
    b.addEventListener("click", () =>
      confirmAction(`هل تأكيد حذف الفصل؟`, async () => {
        await api(`/data/classes/${b.dataset.delc}`, { method: "DELETE" });
        toast("تم حذف الفصل.");
        loadClassesTable();
      })
    )
  );
}

function openClassForm(cls) {
  const defaultStage = cls?.level || "ابتدائي";
  const normalizedGrade = normalizeGradeKey(defaultStage, cls?.grade_label || "");
  const grades = ACADEMIC_GRADES[defaultStage] || [];
  const defaultGrade = grades.includes(normalizedGrade) ? normalizedGrade : (grades[0] || "");
  const defaultNumber = detectedClassNumber(cls?.name || "") || 1;
  openModal(`
    <h3>${cls ? "تعديل الفصل" : "إضافة فصل جديد"}</h3>
    <div id="classFormMsg"></div>
    <div class="form-grid">
      <div class="field">المرحلة
        <select id="cfLevel">${STUDENT_STAGE_OPTIONS.map((level) => `<option value="${level}" ${defaultStage === level ? "selected" : ""}>${level}</option>`).join("")}</select>
      </div>
      <div class="field">الصف<select id="cfGrade">${studentGradeOptions(defaultStage, defaultGrade)}</select></div>
      <div class="field">الفصل
        <select id="cfNumber">${STUDENT_CLASS_NUMBERS.map((number, index) => `<option value="${index + 1}" ${defaultNumber === index + 1 ? "selected" : ""}>${number}</option>`).join("")}</select>
      </div>
      <div class="field">العام الدراسي<input id="cfYear" value="${escapeHtml(cls?.academic_year || schoolSettings?.academicYear || "")}" placeholder="مثال: 1448" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" id="cancelClassForm">إلغاء</button>
      <button class="btn btn-primary" id="saveClassForm">حفظ</button>
    </div>
  `);
  document.getElementById("cancelClassForm").onclick = closeModal;
  const levelSelect = document.getElementById("cfLevel");
  const gradeSelect = document.getElementById("cfGrade");
  levelSelect.onchange = () => {
    const firstGrade = (ACADEMIC_GRADES[levelSelect.value] || [])[0] || "";
    gradeSelect.innerHTML = studentGradeOptions(levelSelect.value, firstGrade);
  };
  document.getElementById("saveClassForm").onclick = async () => {
    const payload = {
      level: levelSelect.value,
      gradeLabel: gradeSelect.value,
      classNumber: Number(document.getElementById("cfNumber").value),
      academicYear: document.getElementById("cfYear").value.trim(),
    };
    try {
      if (cls) await api(`/data/classes/${cls.id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/data/classes", { method: "POST", body: JSON.stringify(payload) });
      closeModal();
      toast("تم حفظ الفصل.");
      await loadClassesTable();
    } catch (error) {
      document.getElementById("classFormMsg").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    }
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
async function openTeacherAccountSettings() {
  openModal(`
    <h3>إعدادات الحساب</h3>
    <div id="settingsPasswordMessage"></div>
    <div class="field" style="margin-bottom:18px">البريد الإلكتروني<input type="email" value="${escapeHtml(currentTeacher.email)}" readonly /></div>
    <form id="settingsPasswordForm">
      <div class="form-grid full">
        <div class="field">كلمة المرور الحالية<input type="password" id="settingsCurrentPassword" autocomplete="current-password" required /></div>
        <div class="field">كلمة المرور الجديدة<input type="password" id="settingsNewPassword" autocomplete="new-password" minlength="10" required /></div>
        <div class="field">تأكيد كلمة المرور الجديدة<input type="password" id="settingsConfirmPassword" autocomplete="new-password" minlength="10" required /></div>
      </div>
      <p class="settings-help">يجب أن تتكون كلمة المرور الجديدة من 10 أحرف على الأقل، وتحتوي حرفًا ورقمًا.</p>
      <div class="modal-actions"><button type="button" class="btn btn-outline" id="closeAccountSettings">إلغاء</button><button class="btn btn-primary" id="saveSettingsPassword" type="submit">تغيير كلمة المرور</button></div>
    </form>
  `);
  document.getElementById("closeAccountSettings").onclick = closeModal;
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
    try {
      await api("/me", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      toast("تم تغيير كلمة المرور بنجاح.");
      closeModal();
    } catch (error) {
      message.innerHTML = `<div class="form-error" style="margin-bottom:14px">${escapeHtml(error.message)}</div>`;
    } finally {
      button.disabled = false;
    }
  };
}

async function renderSettings() {
  const settings = await loadSchoolSettings(true);
  const additionalLogo = settings.hasAdditionalLogo
    ? `<div class="logo-preview-card optional-logo-card"><img src="${escapeHtml(settings.additionalLogoUrl)}" alt="الشعار الإضافي"><span>${escapeHtml(settings.additionalLogoName || "الشعار الإضافي")}</span>${settings.additionalLogoScope === "teacher" ? '<button type="button" class="btn btn-danger btn-sm" id="deleteAdditionalLogo">حذف الشعار</button>' : '<small class="settings-help">شعار المدرسة العام</small>'}</div>`
    : "";

  contentEl.innerHTML = `
    <div class="settings-page-head">
      <div><h3>إعدادات المدرسة والمدة الدراسية</h3><p>تُستخدم هذه البيانات تلقائيًا في جميع التقارير والمطبوعات وملفات PDF.</p></div>
      <button class="btn btn-outline" type="button" id="openAccountSettings">إعدادات الحساب</button>
    </div>
    <div class="settings-layout settings-two-boxes">
      <section class="card academic-period-card">
        <div class="settings-card-heading"><span class="settings-card-icon">🗓️</span><div><h3>إعدادات المدة الدراسية</h3><p>حددي المدة والفصل الدراسي الحالي، ثم احفظي هذا القسم مستقلًا.</p></div></div>
        <div id="academicPeriodMessage"></div>
        <form id="academicPeriodForm">
          <div class="form-grid full">
            <div class="field">تاريخ بداية المدة الدراسية<input type="date" id="setPeriodStart" value="${escapeHtml(settings.periodStartDate || "")}" required /></div>
            <div class="field">تاريخ نهاية المدة الدراسية<input type="date" id="setPeriodEnd" value="${escapeHtml(settings.periodEndDate || "")}" required /></div>
            <div class="field">الفصل الدراسي
              <select id="setCurrentSemester">
                <option value="first" ${settings.currentSemester === "first" ? "selected" : ""}>الفصل الدراسي الأول</option>
                <option value="second" ${settings.currentSemester === "second" ? "selected" : ""}>الفصل الدراسي الثاني</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary" id="saveAcademicPeriod" type="submit">حفظ إعدادات المدة الدراسية</button>
        </form>
        <div class="owner-only-note"><strong>بدء عام دراسي جديد</strong><span>حذف بيانات الأعوام السابقة متاح فقط من حساب مالكة الموقع، ولا يظهر داخل حساب المعلمة.</span></div>
      </section>

      <section class="card school-settings-card">
        <div class="settings-card-heading"><span class="settings-card-icon">🏫</span><div><h3>إعدادات المدرسة</h3><p>تظهر البيانات والشعارات تلقائيًا في رأس وتذييل جميع التقارير.</p></div></div>
        <div id="schoolSettingsMessage"></div>
        <form id="schoolSettingsForm">
          <div class="form-grid">
            <div class="field">إدارة التعليم<input id="setEducationDepartment" value="${escapeHtml(settings.educationDepartment || "")}" required /></div>
            <div class="field">مكتب التعليم<input id="setEducationOffice" value="${escapeHtml(settings.educationOffice || "")}" /></div>
            <div class="field">اسم المدرسة<input id="setSchoolName" value="${escapeHtml(settings.schoolName || "")}" required /></div>
            <div class="field">اسم مديرة المدرسة<input id="setSchoolLeaderName" value="${escapeHtml(settings.schoolLeaderName || "")}" /></div>
            <div class="field">اسم المعلمة<input id="setTeacherName" value="${escapeHtml(settings.teacherName || currentTeacher.name || "")}" required /></div>
            <div class="field">اسم المادة<input id="setSubjectName" value="${escapeHtml(settings.subjectName || "الرياضيات")}" required /></div>
            <div class="field">العام الدراسي<input id="setAcademicYear" value="${escapeHtml(settings.academicYear || "")}" placeholder="مثال: ١٤٤٨هـ" required /></div>
          </div>

          <div class="school-logo-settings">
            <h4>شعارات التقارير والطباعة</h4>
            <div class="logo-preview-grid">
              <div class="logo-preview-card"><img src="${escapeHtml(settings.madarLogoUrl || "/assets/print/madar-logo.svg")}" alt="شعار مدار"><span>شعار مدار الأصلي</span></div>
              <div class="logo-preview-card"><img src="${escapeHtml(settings.visionLogoUrl || "/vision-2030-logo.png")}" alt="شعار رؤية السعودية 2030"><span>شعار رؤية السعودية ٢٠٣٠</span></div>
              ${additionalLogo}
            </div>
            <div class="optional-logo-upload">
              <label class="field">شعار إضافي اختياري<input type="file" id="setAdditionalLogo" accept="image/png,image/jpeg,image/webp" /></label>
              <button class="btn btn-outline" type="button" id="uploadAdditionalLogo">رفع الشعار الإضافي</button>
            </div>
            <p class="settings-help">تُحافظ الطباعة على أبعاد الشعارات الأصلية، وإذا لم يُرفع شعار إضافي فلن يظهر له إطار أو مكان فارغ.</p>
          </div>
          <button class="btn btn-primary" id="saveSchoolSettings" type="submit">حفظ إعدادات المدرسة</button>
        </form>
      </section>
    </div>
  `;

  document.getElementById("openAccountSettings").onclick = openTeacherAccountSettings;

  document.getElementById("academicPeriodForm").onsubmit = async (event) => {
    event.preventDefault();
    const message = document.getElementById("academicPeriodMessage");
    const button = document.getElementById("saveAcademicPeriod");
    button.disabled = true;
    message.innerHTML = "";
    try {
      schoolSettings = await api("/school-settings/period", { method: "PUT", body: JSON.stringify({
        periodStartDate: document.getElementById("setPeriodStart").value,
        periodEndDate: document.getElementById("setPeriodEnd").value,
        currentSemester: document.getElementById("setCurrentSemester").value,
      }) });
      message.innerHTML = '<div class="form-success">تم حفظ إعدادات المدة الدراسية بنجاح.</div>';
      toast("تم حفظ إعدادات المدة الدراسية.");
    } catch (error) {
      message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    } finally { button.disabled = false; }
  };

  document.getElementById("schoolSettingsForm").onsubmit = async (event) => {
    event.preventDefault();
    const message = document.getElementById("schoolSettingsMessage");
    const button = document.getElementById("saveSchoolSettings");
    button.disabled = true;
    message.innerHTML = "";
    try {
      schoolSettings = await api("/school-settings/school", { method: "PUT", body: JSON.stringify({
        educationDepartment: document.getElementById("setEducationDepartment").value.trim(),
        educationOffice: document.getElementById("setEducationOffice").value.trim(),
        schoolName: document.getElementById("setSchoolName").value.trim(),
        schoolLeaderName: document.getElementById("setSchoolLeaderName").value.trim(),
        teacherName: document.getElementById("setTeacherName").value.trim(),
        subjectName: document.getElementById("setSubjectName").value.trim(),
        academicYear: document.getElementById("setAcademicYear").value.trim(),
      }) });
      message.innerHTML = '<div class="form-success">تم حفظ إعدادات المدرسة بنجاح.</div>';
      toast("تم حفظ إعدادات المدرسة.");
    } catch (error) {
      message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    } finally { button.disabled = false; }
  };

  document.getElementById("uploadAdditionalLogo").onclick = async () => {
    const input = document.getElementById("setAdditionalLogo");
    if (!input.files?.[0]) { toast("اختاري صورة للشعار الإضافي.", "error"); return; }
    const button = document.getElementById("uploadAdditionalLogo");
    button.disabled = true;
    const form = new FormData();
    form.append("file", input.files[0]);
    try {
      schoolSettings = await api("/school-settings/additional-logo", { method: "POST", body: form });
      toast("تم رفع الشعار الإضافي.");
      renderSettings();
    } catch (error) { toast(error.message, "error"); }
    finally { button.disabled = false; }
  };
  const deleteLogo = document.getElementById("deleteAdditionalLogo");
  if (deleteLogo) deleteLogo.onclick = () => confirmAction("هل تريدين حذف الشعار الإضافي؟", async () => {
    schoolSettings = await api("/school-settings/additional-logo", { method: "DELETE" });
    toast("تم حذف الشعار الإضافي.");
    renderSettings();
  });
}

// ==========================================================================
// بنك الأسئلة الذكي
// ==========================================================================
const BANK_STYLE = { easy: "سهل", medium: "متوسط", hard: "صعب" };
const BANK_TYPE = { mcq: "اختيار متعدد", true_false: "صح أو خطأ", short_answer: "إجابة قصيرة" };
const BANK_LEVEL = { unclassified: "غير مصنف", applied: "تطبيقي", logical: "منطقي", analytical: "تحليلي" };
const BANK_COGNITIVE = ["تحليلي", "استدلال", "منطقي", "تطبيقي"];
const BANK_CONTENT_SOURCE = ["كتاب الطالب", "الإنترنت"];
const QUESTION_BANK_GRADES = {
  "ابتدائي": [
    { value: "رابع ابتدائي", label: "رابع" },
    { value: "خامس ابتدائي", label: "خامس" },
    { value: "سادس ابتدائي", label: "سادس" },
  ],
  "متوسط": [
    { value: "أول متوسط", label: "أولى" },
    { value: "ثاني متوسط", label: "ثانية" },
    { value: "ثالث متوسط", label: "ثالثة" },
  ],
  "ثانوي": [
    { value: "أول ثانوي", label: "أولى" },
    { value: "ثاني ثانوي", label: "ثانية" },
    { value: "ثالث ثانوي", label: "ثالثة" },
  ],
};
const QUESTION_BANK_CLASSES = [
  { value: "1", label: "١" },
  { value: "2", label: "٢" },
  { value: "3", label: "٣" },
  { value: "4", label: "٤" },
  { value: "all", label: "كل الفصول" },
];
const QUESTION_BANK_TERMS = [
  { value: "الترم الأول", label: "الترم الأول" },
  { value: "الترم الثاني", label: "الترم الثاني" },
];
const QUESTION_DESIGN_MODES = {
  quick: { icon: "⚡", title: "توليد سريع", description: "أسئلة سريعة ومتوازنة للدرس", count: 5, difficulty: "medium", types: ["mcq", "true_false"] },
  diagnostic: { icon: "🩺", title: "تشخيصي", description: "قياس المهارات السابقة والفجوات", count: 10, difficulty: "medium", types: ["mcq", "true_false"] },
  periodic: { icon: "🗓️", title: "فتري", description: "أسئلة مناسبة لاختبار الفترة", count: 15, difficulty: "medium", types: ["mcq", "true_false", "short_answer"] },
  professional: { icon: "🧩", title: "احترافي", description: "تصميم سؤال يدوي كامل التفاصيل", manual: true },
  interactive: { icon: "🎮", title: "تفاعلي", description: "أسئلة قصيرة قابلة للتفاعل", count: 6, difficulty: "easy", types: ["mcq", "true_false"] },
  ai: { icon: "✨", title: "ذكاء اصطناعي", description: "توليد ذكي بإعدادات متقدمة", count: 5, difficulty: "medium", types: ["mcq"] },
};

let questionBankView = sessionStorage.getItem("madarQuestionBankView") || "design";
let questionBankRepositoryFiltered = sessionStorage.getItem("madarQuestionBankRepositoryFiltered") === "1";
let questionBankSelectedMode = sessionStorage.getItem("madarQuestionBankMode") || "quick";
let questionBankDesignChooserOpen = sessionStorage.getItem("madarQuestionBankChooserOpen") === "1";
const savedQuestionBankSelection = JSON.parse(sessionStorage.getItem("madarQuestionBankSelection") || "null") || {};
const questionBankSelection = {
  stage: savedQuestionBankSelection.stage || "ابتدائي",
  gradeLabel: savedQuestionBankSelection.gradeLabel || "رابع ابتدائي",
  classValue: savedQuestionBankSelection.classValue || "all",
  termLabel: savedQuestionBankSelection.termLabel || "الترم الأول",
};

function saveQuestionBankSelection() {
  const grades = QUESTION_BANK_GRADES[questionBankSelection.stage] || [];
  if (!grades.some((item) => item.value === questionBankSelection.gradeLabel)) {
    questionBankSelection.gradeLabel = grades[0]?.value || "";
  }
  sessionStorage.setItem("madarQuestionBankSelection", JSON.stringify(questionBankSelection));
}

function questionBankClassLabel(classValue = questionBankSelection.classValue) {
  if (classValue === "all" || !classValue) return "كل الفصول";
  const arabic = { "1": "١", "2": "٢", "3": "٣", "4": "٤" }[String(classValue)] || classValue;
  return `الفصل ${arabic}`;
}

function questionBankContext() {
  saveQuestionBankSelection();
  return {
    stage: questionBankSelection.stage,
    gradeLabel: questionBankSelection.gradeLabel,
    classLabel: questionBankClassLabel(),
    termLabel: questionBankSelection.termLabel,
  };
}

function questionBankTabsHtml(activeView) {
  return `<div class="question-bank-main-tabs" role="tablist" aria-label="أقسام بنك الأسئلة">
    <button class="question-bank-main-tab ${activeView === "design" ? "active" : ""}" data-question-bank-view="design" type="button">
      <span>✍️</span><strong>تصميم أسئلة</strong><small>اختيار المرحلة ونوع التصميم</small>
    </button>
    <button class="question-bank-main-tab ${activeView === "repository" ? "active" : ""}" data-question-bank-view="repository" type="button">
      <span>🗂️</span><strong>المستودع</strong><small>مراجعة وحفظ واستيراد الأسئلة</small>
    </button>
  </div>`;
}

function bindQuestionBankTabs() {
  contentEl.querySelectorAll("[data-question-bank-view]").forEach((button) => {
    button.onclick = () => {
      questionBankView = button.dataset.questionBankView;
      sessionStorage.setItem("madarQuestionBankView", questionBankView);
      renderQuestionBank();
    };
  });
}

function questionBankSegmentButtons(type, items, selectedValue) {
  return items.map((item) => `<button type="button" class="question-bank-choice ${String(item.value) === String(selectedValue) ? "active" : ""}" data-bank-choice="${type}" data-value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`).join("");
}

function questionBankSelectorHtml() {
  const grades = QUESTION_BANK_GRADES[questionBankSelection.stage] || [];
  return `<section class="question-bank-selector-card">
    <div class="question-bank-selector-heading">
      <div><span>🎯</span><div><h3>حددي نطاق الأسئلة</h3><p>المرحلة والصف والفصل والترم في سطر واحد.</p></div></div>
      <span class="question-bank-context-badge">${escapeHtml(questionBankSelection.stage)} · ${escapeHtml(questionBankSelection.gradeLabel)} · ${escapeHtml(questionBankClassLabel())} · ${escapeHtml(questionBankSelection.termLabel)}</span>
    </div>
    <div class="question-bank-selector-row">
      <div class="question-bank-selector-group"><label>المرحلة</label><div class="question-bank-choice-row">${questionBankSegmentButtons("stage", Object.keys(QUESTION_BANK_GRADES).map((value) => ({ value, label: value })), questionBankSelection.stage)}</div></div>
      <div class="question-bank-selector-group"><label>الصف</label><div class="question-bank-choice-row">${questionBankSegmentButtons("gradeLabel", grades, questionBankSelection.gradeLabel)}</div></div>
      <div class="question-bank-selector-group"><label>الفصل</label><div class="question-bank-choice-row compact">${questionBankSegmentButtons("classValue", QUESTION_BANK_CLASSES, questionBankSelection.classValue)}</div></div>
      <div class="question-bank-selector-group"><label>الترم</label><div class="question-bank-choice-row">${questionBankSegmentButtons("termLabel", QUESTION_BANK_TERMS, questionBankSelection.termLabel)}</div></div>
    </div>
  </section>`;
}

function bindQuestionBankSelector() {
  contentEl.querySelectorAll("[data-bank-choice]").forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.bankChoice;
      questionBankSelection[key] = button.dataset.value;
      if (key === "stage") questionBankSelection.gradeLabel = QUESTION_BANK_GRADES[questionBankSelection.stage]?.[0]?.value || "";
      saveQuestionBankSelection();
      renderQuestionBankDesign();
    };
  });
}

function questionBankSkillsForSelection() {
  const wantedGrade = normalizeGradeKey(questionBankSelection.stage, questionBankSelection.gradeLabel);
  return allSkills.filter((skill) => {
    if (skill.stage !== questionBankSelection.stage) return false;
    return normalizeGradeKey(skill.stage, skill.grade_label) === wantedGrade;
  });
}

function normalizeQuestionBankTermKey(value) {
  return String(value || "").normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآ]/g, "ا").replace(/[ة]/g, "ه").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function questionBankSkillHasTerm(skill, termLabel = questionBankSelection.termLabel) {
  const wantedTerm = normalizeQuestionBankTermKey(termLabel);
  const terms = String(skill?.question_terms || "").split("||").filter(Boolean).map(normalizeQuestionBankTermKey);
  return !wantedTerm || terms.includes(wantedTerm);
}

function questionBankSkillUnits(skill, termLabel = questionBankSelection.termLabel) {
  const wantedTerm = normalizeQuestionBankTermKey(termLabel);
  return [...new Set(String(skill?.unit_contexts || "")
    .split("||")
    .map((item) => {
      const separator = item.indexOf("::");
      return separator >= 0
        ? { term: item.slice(0, separator).trim(), unit: item.slice(separator + 2).trim() }
        : { term: "", unit: item.trim() };
    })
    .filter((item) => item.unit && (!wantedTerm || !item.term || normalizeQuestionBankTermKey(item.term) === wantedTerm))
    .map((item) => item.unit))];
}

function questionBankUnitButtonLabel(unitName) {
  const raw = String(unitName || "").trim();
  const western = raw.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const match = western.match(/(?:الوحدة|الفصل)?\s*(\d{1,2})/u);
  const ordinal = { 1: "الأولى", 2: "الثانية", 3: "الثالثة", 4: "الرابعة", 5: "الخامسة", 6: "السادسة", 7: "السابعة", 8: "الثامنة", 9: "التاسعة", 10: "العاشرة" }[Number(match?.[1])];
  if (ordinal) return `الوحدة ${ordinal}`;
  if (/^(?:الوحدة|الفصل)\s+/u.test(raw)) return raw.replace(/^الفصل/u, "الوحدة");
  return raw;
}

function questionBankUnitsForSkills(skills) {
  const names = [...new Set(skills.flatMap((skill) => questionBankSkillUnits(skill)))];
  return names.sort((a, b) => String(a).localeCompare(String(b), "ar", { numeric: true }));
}

function questionBankSkillCheckboxesHtml(skills) {
  if (!skills.length) {
    return `<div class="question-bank-no-skills">لا توجد مهارات محفوظة لهذا الصف حاليًا. اكتبي المهارة يدويًا في الحقل أسفل القائمة.</div>`;
  }
  return skills.map((skill) => {
    const units = questionBankSkillUnits(skill).join("||");
    return `<label class="question-bank-skill-option" data-question-bank-units="${escapeHtml(units)}">
      <input type="checkbox" value="${skill.id}" data-question-bank-skill>
      <span><strong>${escapeHtml(skill.name)}</strong>${skill.code ? `<small>${escapeHtml(skill.code)}</small>` : ""}</span>
    </label>`;
  }).join("");
}

function questionBankAutomaticWorkspaceHtml(modeKey, mode) {
  const skills = questionBankSkillsForSelection();
  const defaultCount = { quick: 3, diagnostic: 2, periodic: 3, interactive: 3, ai: 5 }[modeKey] || 3;
  const selectedTypes = mode.types || ["mcq"];
  return `<div class="question-bank-inline-workspace" id="questionDesignWorkspace" data-mode="${modeKey}">
    <div class="question-bank-workspace-head">
      <div><span class="question-bank-mode-icon">${mode.icon}</span><div><h3>${escapeHtml(mode.title)} حسب المهارات</h3><p>اختاري مهارة واحدة أو عدة مهارات، وسيُنشئ النظام أسئلة مستقلة لكل مهارة ويحفظها في المستودع للمراجعة.</p></div></div>
      <span class="question-bank-context-badge">${escapeHtml(questionBankSelection.stage)} · ${escapeHtml(questionBankSelection.gradeLabel)}</span>
    </div>
    <div id="questionDesignInlineMsg"></div>
    <section class="question-bank-skills-box">
      <div class="question-bank-skills-head"><div><strong>مهارات المنهج</strong><small>يمكن تحديد أكثر من مهارة.</small></div>${skills.length ? `<div><button class="btn btn-outline btn-sm" id="selectAllQuestionSkills" type="button">تحديد الكل</button><button class="btn btn-outline btn-sm" id="clearQuestionSkills" type="button">إلغاء التحديد</button></div>` : ""}</div>
      <div class="question-bank-skills-grid">${questionBankSkillCheckboxesHtml(skills)}</div>
      <label class="field question-bank-custom-skill">مهارات إضافية غير موجودة في القائمة
        <textarea id="questionBankCustomSkills" placeholder="اكتبي كل مهارة في سطر مستقل"></textarea>
      </label>
    </section>
    <div class="form-grid question-bank-generation-settings">
      <label class="field">سياق الدرس أو الوحدة<input id="questionBankTopicContext" placeholder="اختياري: مثال الوحدة الثالثة أو درس الكسور"></label>
      <label class="field">رمز درس للمهارات المكتوبة يدويًا<input id="questionBankLessonCode" placeholder="اختياري"></label>
      <label class="field">عدد الأسئلة لكل مهارة<input id="questionBankQuestionsPerSkill" type="number" min="1" max="10" value="${defaultCount}"></label>
      <label class="field">الصعوبة<select id="questionBankGenerationDifficulty"><option value="easy" ${mode.difficulty === "easy" ? "selected" : ""}>سهل</option><option value="medium" ${mode.difficulty !== "easy" && mode.difficulty !== "hard" ? "selected" : ""}>متوسط</option><option value="hard" ${mode.difficulty === "hard" ? "selected" : ""}>صعب</option></select></label>
    </div>
    <div class="question-bank-types-box"><strong>أنواع الأسئلة</strong><div>
      <label><input type="checkbox" value="mcq" data-question-bank-type ${selectedTypes.includes("mcq") ? "checked" : ""}> اختياري</label>
      <label><input type="checkbox" value="true_false" data-question-bank-type ${selectedTypes.includes("true_false") ? "checked" : ""}> صح أو خطأ</label>
      <label><input type="checkbox" value="short_answer" data-question-bank-type ${selectedTypes.includes("short_answer") ? "checked" : ""}> إجابة قصيرة</label>
    </div></div>
    <div class="question-bank-inline-actions">
      <p>الحد الأقصى في العملية الواحدة ٦٠ سؤالًا لحماية جودة التوليد.</p>
      <button class="btn btn-primary" id="runSkillQuestionDesign" type="button">${mode.icon} تصميم الأسئلة من المهارات</button>
    </div>
  </div>`;
}

function questionBankDiagnosticMatchingClasses() {
  const wantedGrade = normalizeGradeKey(questionBankSelection.stage, questionBankSelection.gradeLabel);
  const matching = allClasses.filter((item) => item.level === questionBankSelection.stage
    && normalizeGradeKey(item.level, item.grade_label) === wantedGrade);
  const selectedYear = normalizedAcademicYear(schoolSettings?.academicYear);
  if (!selectedYear) return matching;
  const sameYear = matching.filter((item) => normalizedAcademicYear(item.academic_year) === selectedYear);
  return sameYear.length ? sameYear : matching;
}

function questionBankDiagnosticTargetClasses() {
  const matchingClasses = questionBankDiagnosticMatchingClasses();
  if (questionBankSelection.classValue === "all") return matchingClasses;
  const selectedIndex = Math.max(0, Number(questionBankSelection.classValue || 1) - 1);
  return matchingClasses[selectedIndex] ? [matchingClasses[selectedIndex]] : [];
}

function questionBankDiagnosticWorkspaceHtml(mode) {
  const skills = questionBankSkillsForSelection().filter((skill) => questionBankSkillHasTerm(skill));
  const units = questionBankUnitsForSkills(skills);
  const targetClasses = questionBankDiagnosticTargetClasses();
  const targetLabel = questionBankSelection.classValue === "all"
    ? "كل الفصول المسجلة لهذا الصف"
    : questionBankClassLabel();
  return `<div class="question-bank-inline-workspace" id="questionDesignWorkspace" data-mode="diagnostic">
    <div class="question-bank-workspace-head">
      <div><span class="question-bank-mode-icon">${mode.icon}</span><div><h3>اختبار تشخيصي حسب المهارات</h3><p>يأخذ سؤالًا عشوائيًا واحدًا من الأسئلة المعتمدة لكل مهارة، دون استخدام الذكاء الاصطناعي. وقد يظهر لكل طالبة بديل مختلف من المهارة نفسها.</p></div></div>
      <span class="question-bank-context-badge">${escapeHtml(questionBankSelection.stage)} · ${escapeHtml(questionBankSelection.gradeLabel)} · ${escapeHtml(questionBankClassLabel())} · ${escapeHtml(questionBankSelection.termLabel)}</span>
    </div>
    <div id="questionDesignInlineMsg"></div>
    <section class="question-bank-skills-box">
      <div class="question-bank-skills-head">
        <div><strong>مهارات الاختبار</strong><small>اختاري الوحدة لعرض مهاراتها، ثم حددي المهارات المطلوبة.</small></div>
        <div class="question-bank-skills-controls">
          ${units.length ? `<div class="diagnostic-unit-buttons" role="group" aria-label="وحدات المنهج"><button class="diagnostic-unit-btn active" type="button" data-diagnostic-unit="">كل الوحدات</button>${units.map((unit) => `<button class="diagnostic-unit-btn" type="button" data-diagnostic-unit="${escapeHtml(unit)}" title="${escapeHtml(unit)}">${escapeHtml(questionBankUnitButtonLabel(unit))}</button>`).join("")}</div>` : ""}
          ${skills.length ? `<div class="question-bank-selection-buttons"><button class="btn btn-outline btn-sm" id="selectAllQuestionSkills" type="button">تحديد الظاهر</button><button class="btn btn-outline btn-sm" id="clearQuestionSkills" type="button">إلغاء التحديد</button></div>` : ""}
        </div>
      </div>
      <div class="question-bank-skills-grid">${questionBankSkillCheckboxesHtml(skills)}</div>
    </section>
    <div class="form-grid question-bank-generation-settings">
      <label class="field diagnostic-test-title-field">اسم الاختبار<input id="diagnosticBankTitle" value="تشخيصي قبلي - ${escapeHtml(questionBankSelection.gradeLabel)}" data-auto-title="تشخيصي قبلي - ${escapeHtml(questionBankSelection.gradeLabel)}" placeholder="مثال: الاختبار التشخيصي للمهارات الأساسية"></label>
      <label class="field">نوع الاختبار
        <select id="diagnosticBankTestType">
          <option value="pre_diagnostic">تشخيصي قبلي</option>
          <option value="post_diagnostic">تشخيصي بعدي</option>
          <option value="quiz">اختبار قصير</option>
        </select>
      </label>
      <div class="field diagnostic-duration-field"><span>المدة بالدقائق</span><div class="diagnostic-duration-row"><input id="diagnosticBankDuration" type="number" min="1" max="240" value="20"><label class="diagnostic-no-time-option"><input id="diagnosticBankNoTime" type="checkbox"> بدون وقت</label></div></div>
    </div>
    ${!targetClasses.length ? `<div class="form-error">لا يوجد ${escapeHtml(targetLabel)} ضمن ${escapeHtml(questionBankSelection.stage)} · ${escapeHtml(questionBankSelection.gradeLabel)}. أضيفي الفصل أولًا من إدارة الطالبات أو اختاري فصلًا مسجلًا من أعلى الصفحة.</div>` : ""}
    <div class="question-bank-inline-actions">
      <p>سيُرسل الاختبار إلى ${escapeHtml(targetLabel)} كمسودة، ثم يظهر مباشرة في خانة الاختبارات لمراجعته ونشره.</p>
      <div>
        <button class="btn btn-outline" id="previewDiagnosticTest" type="button" ${!targetClasses.length ? "disabled" : ""}>معاينة</button>
        <button class="btn btn-primary" id="sendDiagnosticToTests" type="button" ${!targetClasses.length ? "disabled" : ""}>إرسال الاختبار إلى خانة الاختبارات</button>
      </div>
    </div>
  </div>`;
}

function questionBankProfessionalWorkspaceHtml(mode) {
  const skills = questionBankSkillsForSelection();
  return `<div class="question-bank-inline-workspace" id="questionDesignWorkspace" data-mode="professional">
    <div class="question-bank-workspace-head"><div><span class="question-bank-mode-icon">${mode.icon}</span><div><h3>تصميم سؤال احترافي</h3><p>اكتبي السؤال كاملًا واربطِيه بمهارة محددة، ثم احفظيه مباشرة في المستودع.</p></div></div></div>
    <div id="questionDesignInlineMsg"></div>
    <div class="form-grid">
      <label class="field">المهارة<select id="inlineProfessionalSkill"><option value="">بدون ربط بمهارة</option>${skills.map((skill) => `<option value="${skill.id}">${escapeHtml(skill.name)}</option>`).join("")}</select></label>
      <label class="field">الموضوع أو الدرس<input id="inlineProfessionalTopic" placeholder="يُملأ تلقائيًا من المهارة عند تركه فارغًا"></label>
      <label class="field">الفصل أو الوحدة في الكتاب<input id="inlineProfessionalChapter" placeholder="اختياري"></label>
      <label class="field">رمز الدرس<input id="inlineProfessionalLessonCode" placeholder="اختياري"></label>
      <label class="field">مستوى السؤال<select id="inlineProfessionalLevel"><option value="unclassified">غير مصنف</option><option value="applied">تطبيقي</option><option value="logical">منطقي</option><option value="analytical">تحليلي</option></select></label>
      <label class="field">نوع السؤال<select id="inlineProfessionalType"><option value="mcq">اختيار متعدد</option><option value="true_false">صح أو خطأ</option><option value="short_answer">إجابة قصيرة</option></select></label>
      <label class="field">الصعوبة<select id="inlineProfessionalDifficulty"><option value="easy">سهل</option><option value="medium" selected>متوسط</option><option value="hard">صعب</option></select></label>
      <label class="field">النوع المعرفي<input id="inlineProfessionalCognitive" placeholder="اختياري"></label>
      <label class="field">مستوى بلوم<input id="inlineProfessionalBloom" placeholder="اختياري"></label>
      <label class="field">الدرجة<input id="inlineProfessionalPoints" type="number" min="0.5" step="0.5" value="1"></label>
    </div>
    <label class="field question-bank-wide-field">نص السؤال<textarea id="inlineProfessionalText" placeholder="اكتبي السؤال هنا"></textarea></label>
    <label class="field question-bank-wide-field" id="inlineProfessionalOptionsField">الخيارات — خيار في كل سطر<textarea id="inlineProfessionalOptions" placeholder="الخيار الأول&#10;الخيار الثاني&#10;الخيار الثالث&#10;الخيار الرابع"></textarea></label>
    <label class="field question-bank-wide-field">الإجابة الصحيحة<input id="inlineProfessionalAnswer" placeholder="اكتبي الإجابة كما تظهر في الخيارات"></label>
    <label class="field question-bank-wide-field">شرح الإجابة<textarea id="inlineProfessionalExplanation" placeholder="اختياري"></textarea></label>
    <div class="question-bank-inline-actions"><p>سيُحفظ السؤال معتمدًا، ويمكنكِ مراجعته وإرساله إلى الاختبارات من المستودع.</p><button class="btn btn-primary" id="saveInlineProfessionalQuestion" type="button">حفظ في المستودع</button></div>
  </div>`;
}

function questionBankDesignWorkspaceHtml(modeKey) {
  const mode = QUESTION_DESIGN_MODES[modeKey] || QUESTION_DESIGN_MODES.quick;
  if (modeKey === "diagnostic") return questionBankDiagnosticWorkspaceHtml(mode);
  return mode.manual ? questionBankProfessionalWorkspaceHtml(mode) : questionBankAutomaticWorkspaceHtml(modeKey, mode);
}

function renderQuestionBankDesign() {
  saveQuestionBankSelection();
  const chooserHidden = !questionBankDesignChooserOpen;
  contentEl.innerHTML = `
    ${questionBankTabsHtml("design")}
    ${questionBankSelectorHtml()}
    <section class="question-bank-design-section">
      <button type="button" class="question-bank-design-toggle ${questionBankDesignChooserOpen ? "open" : ""}" id="questionBankDesignToggle" aria-expanded="${questionBankDesignChooserOpen ? "true" : "false"}">
        <span><span class="question-bank-design-toggle-icon">🪄</span><span><strong>اختاري طريقة تصميم الأسئلة</strong><small>اضغطي هنا، ثم اختاري النوع والمهارات. سيظهر كل المحتوى أسفل الزر داخل الصفحة.</small></span></span>
        <b aria-hidden="true">⌄</b>
      </button>
      <div class="question-bank-design-content" id="questionBankDesignContent" ${chooserHidden ? "hidden" : ""}>
        <div class="question-bank-mode-grid">
          ${Object.entries(QUESTION_DESIGN_MODES).map(([key, mode]) => `<button type="button" class="question-bank-mode-card ${questionBankSelectedMode === key ? "active" : ""}" data-question-design-mode="${key}">
            <span class="question-bank-mode-icon">${mode.icon}</span><strong>${escapeHtml(mode.title)}</strong><small>${escapeHtml(mode.description)}</small>
          </button>`).join("")}
        </div>
        ${questionBankDesignWorkspaceHtml(questionBankSelectedMode)}
      </div>
    </section>`;
  bindQuestionBankTabs();
  bindQuestionBankSelector();
  document.getElementById("questionBankDesignToggle").onclick = () => {
    questionBankDesignChooserOpen = !questionBankDesignChooserOpen;
    sessionStorage.setItem("madarQuestionBankChooserOpen", questionBankDesignChooserOpen ? "1" : "0");
    renderQuestionBankDesign();
    if (questionBankDesignChooserOpen) document.getElementById("questionBankDesignContent")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  contentEl.querySelectorAll("[data-question-design-mode]").forEach((button) => {
    button.onclick = () => {
      questionBankSelectedMode = button.dataset.questionDesignMode;
      questionBankDesignChooserOpen = true;
      sessionStorage.setItem("madarQuestionBankMode", questionBankSelectedMode);
      sessionStorage.setItem("madarQuestionBankChooserOpen", "1");
      renderQuestionBankDesign();
      document.getElementById("questionDesignWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
  if (questionBankDesignChooserOpen) bindQuestionBankDesignWorkspace();
}

function setQuestionBankInlineMessage(message, type = "error") {
  const target = document.getElementById("questionDesignInlineMsg");
  if (!target) return;
  target.innerHTML = message ? `<div class="${type === "success" ? "form-success" : "form-error"}">${escapeHtml(message)}</div>` : "";
}

function bindQuestionBankDesignWorkspace() {
  const workspace = document.getElementById("questionDesignWorkspace");
  if (!workspace) return;
  if (workspace.dataset.mode === "diagnostic") {
    const skillBoxes = [...workspace.querySelectorAll("[data-question-bank-skill]")];
    const skillOptions = [...workspace.querySelectorAll(".question-bank-skill-option")];
    const unitButtons = [...workspace.querySelectorAll("[data-diagnostic-unit]")];
    const applyUnitFilter = (unit) => {
      skillOptions.forEach((option) => {
        const units = String(option.dataset.questionBankUnits || "").split("||").filter(Boolean);
        option.hidden = Boolean(unit) && !units.includes(unit);
      });
      unitButtons.forEach((button) => button.classList.toggle("active", button.dataset.diagnosticUnit === unit));
    };
    unitButtons.forEach((button) => { button.onclick = () => applyUnitFilter(button.dataset.diagnosticUnit || ""); });
    const selectAll = document.getElementById("selectAllQuestionSkills");
    const clearAll = document.getElementById("clearQuestionSkills");
    if (selectAll) selectAll.onclick = () => skillBoxes.forEach((box) => { if (!box.closest(".question-bank-skill-option")?.hidden) box.checked = true; });
    if (clearAll) clearAll.onclick = () => skillBoxes.forEach((box) => { box.checked = false; });
    const noTime = document.getElementById("diagnosticBankNoTime");
    const durationInput = document.getElementById("diagnosticBankDuration");
    if (noTime && durationInput) noTime.onchange = () => { durationInput.disabled = noTime.checked; };
    const testTypeInput = document.getElementById("diagnosticBankTestType");
    const titleInput = document.getElementById("diagnosticBankTitle");
    if (testTypeInput && titleInput) testTypeInput.onchange = () => {
      const oldAutoTitle = titleInput.dataset.autoTitle || "";
      const nextAutoTitle = `${TEST_TYPE_LABELS[testTypeInput.value] || "اختبار"} - ${questionBankSelection.gradeLabel}`;
      if (!titleInput.value.trim() || titleInput.value.trim() === oldAutoTitle) titleInput.value = nextAutoTitle;
      titleInput.dataset.autoTitle = nextAutoTitle;
    };
    const previewButton = document.getElementById("previewDiagnosticTest");
    if (previewButton) previewButton.onclick = previewDiagnosticTestFromSkills;
    const sendButton = document.getElementById("sendDiagnosticToTests");
    if (sendButton) sendButton.onclick = createDiagnosticTestFromSkills;
    return;
  }
  if (workspace.dataset.mode === "professional") {
    const typeSelect = document.getElementById("inlineProfessionalType");
    const optionsField = document.getElementById("inlineProfessionalOptionsField");
    const optionsInput = document.getElementById("inlineProfessionalOptions");
    const answerInput = document.getElementById("inlineProfessionalAnswer");
    typeSelect.onchange = () => {
      optionsField.hidden = typeSelect.value === "short_answer";
      if (typeSelect.value === "true_false") {
        optionsInput.value = "صح\nخطأ";
        answerInput.placeholder = "صح أو خطأ";
      } else if (typeSelect.value === "mcq") {
        if (optionsInput.value === "صح\nخطأ") optionsInput.value = "";
        answerInput.placeholder = "اكتبي الإجابة كما تظهر في الخيارات";
      } else {
        optionsInput.value = "";
        answerInput.placeholder = "اكتبي الإجابة النموذجية";
      }
    };
    document.getElementById("saveInlineProfessionalQuestion").onclick = saveInlineProfessionalQuestion;
    return;
  }
  const skillBoxes = [...workspace.querySelectorAll("[data-question-bank-skill]")];
  const selectAll = document.getElementById("selectAllQuestionSkills");
  const clearAll = document.getElementById("clearQuestionSkills");
  if (selectAll) selectAll.onclick = () => skillBoxes.forEach((box) => { box.checked = true; });
  if (clearAll) clearAll.onclick = () => skillBoxes.forEach((box) => { box.checked = false; });
  document.getElementById("runSkillQuestionDesign").onclick = runQuestionBankSkillGeneration;
}

function diagnosticSelectedSkillData() {
  const workspace = document.getElementById("questionDesignWorkspace");
  const selectedIds = [...workspace.querySelectorAll("[data-question-bank-skill]:checked")].map((box) => Number(box.value));
  const selectedSet = new Set(selectedIds);
  return {
    ids: selectedIds,
    skills: questionBankSkillsForSelection().filter((skill) => questionBankSkillHasTerm(skill) && selectedSet.has(Number(skill.id))),
  };
}

function diagnosticBankDurationValue() {
  if (document.getElementById("diagnosticBankNoTime")?.checked) return 0;
  return Math.max(1, Math.min(240, Number(document.getElementById("diagnosticBankDuration")?.value) || 20));
}

function diagnosticBankTestTypeValue() {
  const value = document.getElementById("diagnosticBankTestType")?.value || "pre_diagnostic";
  return ["pre_diagnostic", "post_diagnostic", "quiz"].includes(value) ? value : "pre_diagnostic";
}

function previewDiagnosticTestFromSkills() {
  const selected = diagnosticSelectedSkillData();
  const title = document.getElementById("diagnosticBankTitle")?.value.trim() || "";
  const testType = diagnosticBankTestTypeValue();
  const durationMinutes = diagnosticBankDurationValue();
  const targetClasses = questionBankDiagnosticTargetClasses();
  if (!selected.ids.length) return setQuestionBankInlineMessage("حددي مهارة واحدة على الأقل للاختبار التشخيصي.");
  if (!title) return setQuestionBankInlineMessage("اكتبي اسم الاختبار.");
  if (!targetClasses.length) return setQuestionBankInlineMessage("الفصل المختار من أعلى الصفحة غير مسجل لهذا الصف.");
  openModal(`
    <h3>معاينة ${escapeHtml(TEST_TYPE_LABELS[testType] || "الاختبار")}</h3>
    <div class="test-context-note">${escapeHtml(questionBankSelection.stage)} · ${escapeHtml(questionBankSelection.gradeLabel)} · ${escapeHtml(questionBankClassLabel())} · ${escapeHtml(questionBankSelection.termLabel)}</div>
    <div class="diagnostic-bank-notice"><strong>${escapeHtml(title)}</strong><p>النوع: ${escapeHtml(TEST_TYPE_LABELS[testType] || "اختبار")} · المدة: ${durationMinutes === 0 ? "بدون وقت" : `${durationMinutes} دقيقة`} · عدد المهارات والأسئلة: ${selected.ids.length} · الفصول المستهدفة: ${targetClasses.length}</p></div>
    <div class="question-bank-skills-box"><strong>المهارات المختارة</strong><div class="question-bank-skills-grid">${selected.skills.map((skill) => `<div class="question-bank-skill-check"><span>${escapeHtml(skill.name)}</span></div>`).join("")}</div></div>
    <p style="margin-top:14px;color:var(--muted);line-height:1.8">عند بدء الطالبة للاختبار، يسحب النظام سؤالًا عشوائيًا معتمدًا لكل مهارة، لذلك قد تختلف صيغة السؤال بين الطالبات مع بقاء المهارة نفسها.</p>
    <div class="modal-actions"><button class="btn btn-primary" id="closeDiagnosticPreview" type="button">إغلاق المعاينة</button></div>
  `);
  document.getElementById("closeDiagnosticPreview").onclick = closeModal;
}

async function createDiagnosticTestFromSkills() {
  const selected = diagnosticSelectedSkillData();
  const skillIds = selected.ids;
  const title = document.getElementById("diagnosticBankTitle")?.value.trim() || "";
  const testType = diagnosticBankTestTypeValue();
  const targetClasses = questionBankDiagnosticTargetClasses();
  const classIds = targetClasses.map((item) => Number(item.id)).filter(Boolean);
  const durationMinutes = diagnosticBankDurationValue();
  if (!skillIds.length) return setQuestionBankInlineMessage("حددي مهارة واحدة على الأقل للاختبار التشخيصي.");
  if (!title) return setQuestionBankInlineMessage("اكتبي اسم الاختبار.");
  if (!classIds.length) return setQuestionBankInlineMessage("الفصل المختار من أعلى الصفحة غير مسجل لهذا الصف.");
  const button = document.getElementById("sendDiagnosticToTests");
  button.disabled = true;
  button.textContent = "جارٍ إنشاء الاختبار...";
  try {
    const result = await api("/question-bank/create-diagnostic-test", { method: "POST", body: JSON.stringify({
      title,
      testType,
      classIds,
      skillIds,
      stage: questionBankSelection.stage,
      gradeLabel: questionBankSelection.gradeLabel,
      termLabel: questionBankSelection.termLabel,
      durationMinutes,
    }) });
    setQuestionBankInlineMessage(result.message || "تم إرسال الاختبار إلى خانة الاختبارات كمسودة.", "success");
    const classCount = Number(result.classCount || classIds.length);
    const createdType = result.type || testType;
    toast(`تم إنشاء ${TEST_TYPE_LABELS[createdType] || "الاختبار"} من ${result.skillCount || skillIds.length} مهارة${classCount > 1 ? ` في ${classCount} فصول` : ""}.`);
    const createdClassId = Number(result.classId || classIds[0]);
    recentCreatedTestId = Number(result.id || 0);
    recentCreatedTestType = createdType;
    if (recentCreatedTestId > 0) {
      sessionStorage.setItem("madarRecentCreatedTestId", String(recentCreatedTestId));
      sessionStorage.setItem("madarRecentCreatedTestType", createdType);
    }
    const createdClass = targetClasses.find((item) => Number(item.id) === createdClassId) || targetClasses[0] || null;
    const createdStage = result.classStage || createdClass?.level || questionBankSelection.stage;
    const createdGradeRaw = result.classGradeLabel || createdClass?.grade_label || questionBankSelection.gradeLabel;
    academicSelections.tests = {
      stage: createdStage,
      gradeLabel: normalizeGradeKey(createdStage, createdGradeRaw),
      classId: String(createdClassId || classIds[0]),
    };
    sessionStorage.setItem("madarAcademicTests", JSON.stringify(academicSelections.tests));
    openTestsPanel(createdType);
  } catch (error) {
    setQuestionBankInlineMessage(error.message);
    button.disabled = false;
    button.textContent = "إرسال الاختبار إلى خانة الاختبارات";
  }
}

async function runQuestionBankSkillGeneration() {
  const workspace = document.getElementById("questionDesignWorkspace");
  const modeKey = workspace?.dataset.mode || questionBankSelectedMode;
  const mode = QUESTION_DESIGN_MODES[modeKey] || QUESTION_DESIGN_MODES.quick;
  const selectedIds = [...workspace.querySelectorAll("[data-question-bank-skill]:checked")].map((box) => String(box.value));
  const selectedSkills = questionBankSkillsForSelection().filter((skill) => selectedIds.includes(String(skill.id)));
  const customSkills = document.getElementById("questionBankCustomSkills").value
    .split(/\r?\n|،|,|;/u).map((value) => value.trim()).filter(Boolean)
    .map((name) => ({ id: null, name, code: "" }));
  const targets = [...selectedSkills.map((skill) => ({ id: skill.id, name: skill.name, code: skill.code || "" })), ...customSkills]
    .filter((skill, index, list) => list.findIndex((item) => item.name === skill.name) === index);
  if (!targets.length) return setQuestionBankInlineMessage("اختاري مهارة واحدة على الأقل أو اكتبي مهارة إضافية.");
  const types = [...workspace.querySelectorAll("[data-question-bank-type]:checked")].map((box) => box.value);
  if (!types.length) return setQuestionBankInlineMessage("اختاري نوعًا واحدًا على الأقل من أنواع الأسئلة.");
  const perSkill = Math.max(1, Math.min(10, Number(document.getElementById("questionBankQuestionsPerSkill").value) || 1));
  const totalRequested = perSkill * targets.length;
  if (totalRequested > 60) return setQuestionBankInlineMessage(`العدد المطلوب ${totalRequested} سؤالًا. خفّضي عدد المهارات أو عدد الأسئلة لكل مهارة إلى ٦٠ سؤالًا كحد أقصى.`);
  const context = questionBankContext();
  const topicContext = document.getElementById("questionBankTopicContext").value.trim();
  const manualLessonCode = document.getElementById("questionBankLessonCode").value.trim();
  const difficulty = document.getElementById("questionBankGenerationDifficulty").value;
  const button = document.getElementById("runSkillQuestionDesign");
  button.disabled = true;
  let created = 0;
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const skill = targets[index];
      button.textContent = `جارٍ تصميم مهارة ${index + 1} من ${targets.length}...`;
      const result = await api("/ai/generate-questions", { method: "POST", body: JSON.stringify({
        stage: context.stage,
        gradeLabel: context.gradeLabel,
        classLabel: context.classLabel,
        termLabel: context.termLabel,
        topic: topicContext ? `${skill.name} — ${topicContext}` : skill.name,
        skillId: skill.id,
        skillName: skill.name,
        lessonCode: skill.code || manualLessonCode,
        difficulty,
        count: perSkill,
        types,
        designMode: modeKey,
      }) });
      created += Number(result.created) || 0;
    }
    try { allSkills = await api("/data/skills"); } catch {}
    setQuestionBankInlineMessage(`تم تصميم ${created} سؤالًا حسب المهارات وإرسالها إلى المستودع للمراجعة.`, "success");
    toast(`تم تصميم ${created} سؤالًا وإرسالها إلى المستودع.`);
    questionBankView = "repository";
    questionBankRepositoryFiltered = false;
    sessionStorage.setItem("madarQuestionBankView", "repository");
    sessionStorage.setItem("madarQuestionBankRepositoryFiltered", "0");
    await renderQuestionBankRepository();
  } catch (error) {
    setQuestionBankInlineMessage(created ? `تم حفظ ${created} سؤالًا، ثم توقف التوليد: ${error.message}` : error.message);
    button.disabled = false;
    button.textContent = `${mode.icon} تصميم الأسئلة من المهارات`;
  }
}

async function saveInlineProfessionalQuestion() {
  const button = document.getElementById("saveInlineProfessionalQuestion");
  const skillId = document.getElementById("inlineProfessionalSkill").value || null;
  const skill = allSkills.find((item) => String(item.id) === String(skillId));
  const type = document.getElementById("inlineProfessionalType").value;
  const options = document.getElementById("inlineProfessionalOptions").value.split("\n").map((value) => value.trim()).filter(Boolean);
  button.disabled = true;
  try {
    await api("/question-bank", { method: "POST", body: JSON.stringify({
      stage: questionBankSelection.stage,
      gradeLabel: questionBankSelection.gradeLabel,
      classLabel: questionBankClassLabel(),
      termLabel: questionBankSelection.termLabel,
      topic: document.getElementById("inlineProfessionalTopic").value.trim() || skill?.name || "عام",
      chapterName: document.getElementById("inlineProfessionalChapter").value.trim(),
      lessonCode: document.getElementById("inlineProfessionalLessonCode").value.trim() || skill?.code || "",
      questionLevel: document.getElementById("inlineProfessionalLevel").value,
      cognitiveType: document.getElementById("inlineProfessionalCognitive").value.trim(),
      bloomLevel: document.getElementById("inlineProfessionalBloom").value.trim(),
      difficulty: document.getElementById("inlineProfessionalDifficulty").value,
      type,
      questionText: document.getElementById("inlineProfessionalText").value.trim(),
      options: type === "short_answer" ? [] : (type === "true_false" && !options.length ? ["صح", "خطأ"] : options),
      correctAnswer: document.getElementById("inlineProfessionalAnswer").value.trim(),
      explanation: document.getElementById("inlineProfessionalExplanation").value.trim(),
      skillRepeatNumber: 1,
      referencePage: "",
      contentSource: "كتاب الطالب",
      points: Number(document.getElementById("inlineProfessionalPoints").value) || 1,
      skillId,
      reviewStatus: "approved",
    }) });
    setQuestionBankInlineMessage("تم حفظ السؤال في المستودع بنجاح.", "success");
    toast("تم حفظ السؤال في المستودع.");
    document.getElementById("inlineProfessionalText").value = "";
    document.getElementById("inlineProfessionalAnswer").value = "";
    document.getElementById("inlineProfessionalExplanation").value = "";
    if (type !== "true_false") document.getElementById("inlineProfessionalOptions").value = "";
  } catch (error) {
    setQuestionBankInlineMessage(error.message);
  } finally {
    button.disabled = false;
  }
}

function questionBankRepositoryQuery() {
  if (!questionBankRepositoryFiltered) return "";
  const context = questionBankContext();
  const params = new URLSearchParams({
    stage: context.stage,
    gradeLabel: context.gradeLabel,
    termLabel: context.termLabel,
  });
  if (questionBankSelection.classValue !== "all") params.set("classLabel", context.classLabel);
  return `?${params.toString()}`;
}

async function renderQuestionBankRepository() {
  const query = questionBankRepositoryQuery();
  const rows = await api(`/question-bank${query}`);
  const importedPending = rows.filter((q) => q.source === "imported" && q.review_status === "pending");
  const importedBatch = importedPending[0]?.import_batch || "";
  const importedPendingBatch = importedBatch ? importedPending.filter((q) => q.import_batch === importedBatch) : [];
  const exportQuery = query || "";
  contentEl.innerHTML = `
    ${questionBankTabsHtml("repository")}
    <section class="question-bank-repository-head">
      <div class="question-bank-repository-title"><span>🗂️</span><div><h3>مستودع الأسئلة</h3><p>${rows.length} سؤالًا محفوظًا وجاهزًا للمراجعة والتنظيم.</p></div></div>
      <div class="question-bank-excel-actions" aria-label="استيراد وتصدير بنك الأسئلة">
        <button class="btn btn-outline" type="button" id="exportQuestionBankBtn">📤 تصدير Excel</button>
        <button class="btn btn-secondary" type="button" id="importQuestionBankBtn">📥 استيراد من Excel</button>
      </div>
    </section>
    <div class="question-bank-repository-toolbar">
      <div class="question-bank-filter-toggle">
        <button type="button" class="tab-btn ${!questionBankRepositoryFiltered ? "active" : ""}" data-bank-repository-filter="all">كل الأسئلة</button>
        <button type="button" class="tab-btn ${questionBankRepositoryFiltered ? "active" : ""}" data-bank-repository-filter="selection">حسب اختيارات التصميم</button>
      </div>
      <div class="spacer"></div>
      <select class="question-bank-bulk-level" id="bulkCognitiveType" aria-label="التصنيف المعرفي للأسئلة المحددة">${BANK_COGNITIVE.map((value) => `<option value="${value}">${value}</option>`).join("")}</select>
      <button class="btn btn-outline btn-sm" id="applyBulkCognitiveType" type="button">تطبيق التصنيف على المحدد</button>
      <button class="btn btn-secondary btn-sm" id="manualQuestionBtn" type="button">+ إضافة سؤال يدوي</button>
      <button class="btn btn-outline btn-sm" id="testFromBankBtn" type="button">إرسال الاختبار إلى خانة الاختبارات</button>
      ${importedPendingBatch.length ? `<button class="btn btn-primary btn-sm" id="approveImportedBtn" type="button">اعتماد الدفعة المستوردة (${importedPendingBatch.length})</button>` : ""}
    </div>
    ${questionBankRepositoryFiltered ? `<div class="question-bank-filter-summary">يعرض الآن: ${escapeHtml(questionBankSelection.stage)} · ${escapeHtml(questionBankSelection.gradeLabel)} · ${escapeHtml(questionBankClassLabel())} · ${escapeHtml(questionBankSelection.termLabel)}</div>` : ""}
    <div class="card question-bank-table-card">
      <div class="table-wrap question-bank-scroll-area" id="questionBankMainScroll" tabindex="0" aria-label="جدول مستودع الأسئلة قابل للتمرير رأسيًا وأفقيًا">
        ${rows.length ? `<table class="question-bank-table" dir="rtl"><thead><tr><th>نص السؤال</th><th>المرحلة والصف</th><th>الترم</th><th>الموضوع ورمز الدرس</th><th>اسم المهارة</th><th>مستوى الصعوبة</th><th>التصنيف المعرفي</th><th>نوع السؤال</th><th>المرجع</th><th>المصدر</th><th>المراجعة</th><th>إجراءات</th></tr></thead><tbody>
          ${rows.map((q) => `<tr>
            <td class="question-bank-question-cell"><label class="question-bank-select-box"><input type="checkbox" data-bank-select="${q.id}" data-bank-approved="${q.review_status === "approved" ? "1" : "0"}" aria-label="تحديد السؤال"><span></span></label><strong>${arabicMathHtml(q.questionText, q.stage || q.grade_label)}</strong></td>
            <td>${q.subject_name ? `<strong>${escapeHtml(q.subject_name)}</strong><br>` : ""}${escapeHtml(q.stage || "—")}<br><small>${escapeHtml(q.grade_label || "—")}</small></td>
            <td>${escapeHtml(q.term_label || "غير محدد")}</td>
            <td><strong>${escapeHtml(q.topic || "—")}</strong>${q.lesson_code ? `<br><small>رمز الدرس: ${arabicMathHtml(q.lesson_code, q.stage || q.grade_label)}</small>` : ""}</td>
            <td><strong>${escapeHtml(q.skill_name || q.external_skill_id || "غير مرتبطة بمهارة")}</strong>${q.external_skill_id ? `<br><small>رمز المهارة: ${arabicMathHtml(q.external_skill_id, q.stage || q.grade_label)}</small>` : ""}${(q.skill_name || q.external_skill_id) ? `<br><small>سؤال واحد للطالبة مع تدوير البدائل</small>` : ""}</td>
            <td>${escapeHtml(BANK_STYLE[q.difficulty] || q.difficulty || "—")}</td>
            <td><span class="badge badge-gray">${escapeHtml(q.cognitive_type || BANK_LEVEL[q.question_level] || "غير مصنف")}</span></td>
            <td>${escapeHtml(BANK_TYPE[q.type] || q.type || "—")}</td>
            <td>${q.source_reference ? arabicMathHtml(q.source_reference, q.stage || q.grade_label) : q.reference_page ? `ص ${arabicMathHtml(q.reference_page, q.stage || q.grade_label)}` : "—"}</td>
            <td><span class="badge ${(q.question_source || q.content_source) === "كتاب الطالب" ? "badge-green" : (q.question_source || q.content_source) === "الإنترنت" ? "badge-purple" : "badge-gray"}">${escapeHtml(q.question_source || q.content_source || "غير محدد")}</span></td>
            <td><span class="badge ${q.review_status === "approved" ? "badge-green" : q.review_status === "rejected" ? "badge-red" : "badge-orange"}">${q.review_status === "approved" ? "معتمد" : q.review_status === "rejected" ? "مرفوض" : "بانتظار المراجعة"}</span></td>
            <td><div class="question-bank-row-actions"><button class="btn btn-outline btn-sm" data-bank-edit="${q.id}" type="button">مراجعة</button>${q.review_status !== "approved" ? `<button class="btn btn-secondary btn-sm" data-approve="${q.id}" type="button">اعتماد</button>` : ""}<button class="btn btn-danger btn-sm" data-bank-delete="${q.id}" type="button">حذف</button></div></td>
          </tr>`).join("")}
        </tbody></table>` : `<div class="empty-state"><div class="ic">📭</div><h3>المستودع فارغ</h3><p>تم تفريغ الأسئلة القديمة. استخدمي «إضافة سؤال يدوي» أو «استيراد من Excel» لبدء بنك جديد مرتب.</p></div>`}
      </div>
      ${rows.length ? `<div class="question-bank-horizontal-scroll" id="questionBankHorizontalScroll" tabindex="0" aria-label="شريط تمرير المستودع يمينًا ويسارًا"><div id="questionBankHorizontalSpacer"></div></div>` : ""}
    </div>
    <div class="question-bank-delete-all-row">
      <button class="btn btn-danger" id="deleteAllQuestionBankBtn" type="button" ${rows.length ? "" : "disabled"}>🗑️ حذف جميع ما في المستودع</button>
    </div>`;

  bindQuestionBankTabs();
  document.getElementById("exportQuestionBankBtn").onclick = () => {
    window.location.href = `/api/teacher/question-bank/export.xlsx${exportQuery}`;
  };
  document.getElementById("importQuestionBankBtn").onclick = openQuestionBankImport;
  document.getElementById("manualQuestionBtn").onclick = () => openBankQuestionForm(null, questionBankContext());
  const repositoryMainScroll = document.getElementById("questionBankMainScroll");
  const repositoryHorizontalScroll = document.getElementById("questionBankHorizontalScroll");
  const repositoryHorizontalSpacer = document.getElementById("questionBankHorizontalSpacer");
  if (repositoryMainScroll && repositoryHorizontalScroll && repositoryHorizontalSpacer) {
    repositoryHorizontalSpacer.style.width = `${repositoryMainScroll.scrollWidth}px`;
    let syncingRepositoryScroll = false;
    const syncRepositoryScroll = (source, target) => {
      if (syncingRepositoryScroll) return;
      syncingRepositoryScroll = true;
      target.scrollLeft = source.scrollLeft;
      requestAnimationFrame(() => { syncingRepositoryScroll = false; });
    };
    repositoryMainScroll.addEventListener("scroll", () => syncRepositoryScroll(repositoryMainScroll, repositoryHorizontalScroll), { passive: true });
    repositoryHorizontalScroll.addEventListener("scroll", () => syncRepositoryScroll(repositoryHorizontalScroll, repositoryMainScroll), { passive: true });
    repositoryHorizontalScroll.scrollLeft = repositoryMainScroll.scrollLeft;
  }
  document.getElementById("testFromBankBtn").onclick = createTestFromSelectedBank;
  document.getElementById("deleteAllQuestionBankBtn").onclick = () => confirmAction(
    `سيتم حذف جميع أسئلة المستودع وعددها ${rows.length} سؤالًا نهائيًا. لن يمكن التراجع عن الحذف. هل أنتِ متأكدة؟`,
    async () => {
      const result = await api("/question-bank/delete-all", { method: "POST", body: JSON.stringify({ confirm: true }) });
      toast(`تم حذف ${result.deleted || 0} سؤالًا من المستودع.`);
      await renderQuestionBankRepository();
    }
  );
  document.getElementById("applyBulkCognitiveType").onclick = async () => {
    const questionIds = [...contentEl.querySelectorAll("[data-bank-select]:checked")].map((box) => Number(box.dataset.bankSelect));
    if (!questionIds.length) return toast("حددي سؤالًا واحدًا على الأقل.");
    const cognitiveType = document.getElementById("bulkCognitiveType").value;
    const result = await api("/question-bank/bulk-cognitive", { method: "POST", body: JSON.stringify({ questionIds, cognitiveType }) });
    toast(`تم تحديث التصنيف المعرفي لـ ${result.updated} سؤالًا.`);
    renderQuestionBankRepository();
  };
  contentEl.querySelectorAll("[data-bank-repository-filter]").forEach((button) => {
    button.onclick = () => {
      questionBankRepositoryFiltered = button.dataset.bankRepositoryFilter === "selection";
      sessionStorage.setItem("madarQuestionBankRepositoryFiltered", questionBankRepositoryFiltered ? "1" : "0");
      renderQuestionBankRepository();
    };
  });
  if (document.getElementById("approveImportedBtn")) document.getElementById("approveImportedBtn").onclick = () => confirmAction(`هل راجعتِ هذه الدفعة وتريدين اعتماد ${importedPendingBatch.length} سؤالًا؟`, async () => {
    const result = await api("/question-bank/bulk-review", { method: "POST", body: JSON.stringify({ importBatch: importedBatch, status: "approved" }) });
    toast(`تم اعتماد ${result.updated} سؤالًا.`);
    renderQuestionBankRepository();
  });
  contentEl.querySelectorAll("[data-bank-edit]").forEach((button) => button.onclick = () => openBankQuestionForm(rows.find((item) => item.id == button.dataset.bankEdit)));
  contentEl.querySelectorAll("[data-approve]").forEach((button) => button.onclick = async () => {
    const question = rows.find((item) => item.id == button.dataset.approve);
    await api(`/question-bank/${question.id}`, { method: "PUT", body: JSON.stringify(bankQuestionPayload(question, "approved")) });
    toast("تم اعتماد السؤال.");
    renderQuestionBankRepository();
  });
  contentEl.querySelectorAll("[data-bank-delete]").forEach((button) => button.onclick = () => confirmAction("هل تريدين حذف هذا السؤال؟", async () => {
    await api(`/question-bank/${button.dataset.bankDelete}`, { method: "DELETE" });
    toast("تم حذف السؤال.");
    renderQuestionBankRepository();
  }));
}

async function renderQuestionBank() {
  try {
    if (questionBankView === "repository") await renderQuestionBankRepository();
    else renderQuestionBankDesign();
  } catch (error) {
    contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`;
  }
}

function bankQuestionPayload(question, reviewStatus = "approved") {
  return {
    stage: question.stage,
    gradeLabel: question.grade_label,
    classLabel: question.class_label || "كل الفصول",
    termLabel: question.term_label || "",
    topic: question.topic,
    chapterName: question.chapter_name || "",
    questionLevel: question.question_level || "unclassified",
    cognitiveType: question.cognitive_type || "",
    bloomLevel: question.bloom_level || "",
    skillRepeatNumber: Number(question.skill_repeat_number) || 0,
    referencePage: question.reference_page || "",
    contentSource: question.content_source || "",
    difficulty: question.difficulty,
    type: question.type,
    questionText: question.questionText,
    options: question.options,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation || "",
    points: Number(question.points) || 1,
    skillId: question.skill_id || null,
    lessonCode: question.lesson_code || "",
    reviewStatus,
  };
}

function bankGradeOptionsHtml(stage, selected) {
  return (QUESTION_BANK_GRADES[stage] || []).map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === selected ? "selected" : ""}>${escapeHtml(item.value)}</option>`).join("");
}

function bankClassOptionsHtml(selected) {
  return QUESTION_BANK_CLASSES.map((item) => {
    const value = item.value === "all" ? "كل الفصول" : questionBankClassLabel(item.value);
    return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(item.label === "كل الفصول" ? item.label : `الفصل ${item.label}`)}</option>`;
  }).join("");
}

function bankTermOptionsHtml(selected) {
  return QUESTION_BANK_TERMS.map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("");
}

function openBankQuestionForm(question = null, defaults = {}) {
  const initialStage = question?.stage || defaults.stage || "ابتدائي";
  const initialGrade = question?.grade_label || defaults.gradeLabel || QUESTION_BANK_GRADES[initialStage]?.[0]?.value || "";
  const initialClass = question?.class_label || defaults.classLabel || "كل الفصول";
  const initialTerm = question?.term_label || defaults.termLabel || "الترم الأول";
  openModal(`
    <h3>${question ? "مراجعة وتعديل السؤال" : "تصميم سؤال احترافي"}</h3>${question?.source === "ai" ? '<p class="modal-note">راجعي نص السؤال وخياراته وإجابته قبل الاعتماد.</p>' : '<p class="modal-note">سيُحفظ السؤال مباشرة داخل مستودع بنك الأسئلة.</p>'}<div id="bankFormMsg"></div>
    <div class="form-grid">
      <div class="field">المرحلة<select id="bStage">${Object.keys(QUESTION_BANK_GRADES).map((value) => `<option value="${value}" ${initialStage === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
      <div class="field">الصف<select id="bGrade">${bankGradeOptionsHtml(initialStage, initialGrade)}</select></div>
      <div class="field">الفصل<select id="bClass">${bankClassOptionsHtml(initialClass)}</select></div>
      <div class="field">الترم<select id="bTerm">${bankTermOptionsHtml(initialTerm)}</select></div>
      <div class="field">الموضوع أو الدرس<input id="bTopic" value="${escapeHtml(question?.topic || "")}" placeholder="مثال: المعادلات الخطية"></div>
      <div class="field">الفصل أو الوحدة في الكتاب<input id="bChapter" value="${escapeHtml(question?.chapter_name || "")}" placeholder="اختياري"></div>
      <div class="field">رمز الدرس<input id="bLessonCode" value="${escapeHtml(question?.lesson_code || "")}" placeholder="اختياري"></div>
      <div class="field">مستوى الصعوبة<select id="bDifficulty">${[["easy", "سهل"], ["medium", "متوسط"], ["hard", "صعب"]].map(([value, label]) => `<option value="${value}" ${question?.difficulty === value || (!question && value === "medium") ? "selected" : ""}>${label}</option>`).join("")}</select></div>
      <div class="field">التصنيف المعرفي<select id="bCognitive"><option value="">غير مصنف</option>${BANK_COGNITIVE.map((value) => `<option value="${value}" ${question?.cognitive_type === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
      <div class="field">نوع السؤال<select id="bType">${[["mcq", "اختيار متعدد"], ["true_false", "صح أو خطأ"], ["short_answer", "إجابة قصيرة"]].map(([value, label]) => `<option value="${value}" ${question?.type === value ? "selected" : ""}>${label}</option>`).join("")}</select></div>
      <div class="field">رقم تكرار المهارة<input id="bSkillRepeat" type="number" min="1" step="1" value="${Number(question?.skill_repeat_number) || 1}"></div>
      <div class="field">صفحة المرجع<input id="bReferencePage" value="${escapeHtml(question?.reference_page || "")}" placeholder="مثال: ٢٤"></div>
      <div class="field">المصدر<select id="bContentSource"><option value="">غير محدد</option>${BANK_CONTENT_SOURCE.map((value) => `<option value="${value}" ${(question?.content_source || (!question ? "كتاب الطالب" : "")) === value ? "selected" : ""}>${value}</option>`).join("")}</select></div>
      <div class="field">مستوى بلوم<input id="bBloom" value="${escapeHtml(question?.bloom_level || "")}" placeholder="اختياري"></div>
      <div class="field">النقاط<input id="bPoints" type="number" min="0.5" step="0.5" value="${Number(question?.points) || 1}"></div>
    </div>
    <div class="field" style="margin-top:10px">نص السؤال<textarea id="bText">${escapeHtml(question?.questionText || "")}</textarea></div>
    <div class="field" style="margin-top:10px">الخيارات — خيار في كل سطر<textarea id="bOptions">${escapeHtml((question?.options || []).join("\n"))}</textarea></div>
    <div class="field" style="margin-top:10px">الإجابة الصحيحة<input id="bAnswer" value="${escapeHtml(question?.correctAnswer || "")}"></div>
    <div class="field" style="margin-top:10px">شرح الإجابة<textarea id="bExplanation">${escapeHtml(question?.explanation || "")}</textarea></div>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelBankForm" type="button">إلغاء</button><button class="btn btn-primary" id="saveBankForm" type="button">${question?.review_status === "pending" ? "حفظ واعتماد" : "حفظ السؤال"}</button></div>`);
  document.getElementById("bStage").onchange = (event) => {
    document.getElementById("bGrade").innerHTML = bankGradeOptionsHtml(event.target.value, "");
  };
  document.getElementById("cancelBankForm").onclick = closeModal;
  document.getElementById("saveBankForm").onclick = async () => {
    const button = document.getElementById("saveBankForm");
    button.disabled = true;
    try {
      await api(question ? `/question-bank/${question.id}` : "/question-bank", { method: question ? "PUT" : "POST", body: JSON.stringify({
        stage: document.getElementById("bStage").value,
        gradeLabel: document.getElementById("bGrade").value,
        classLabel: document.getElementById("bClass").value,
        termLabel: document.getElementById("bTerm").value,
        topic: document.getElementById("bTopic").value.trim(),
        chapterName: document.getElementById("bChapter").value.trim(),
        lessonCode: document.getElementById("bLessonCode").value.trim(),
        questionLevel: "unclassified",
        cognitiveType: document.getElementById("bCognitive").value,
        bloomLevel: document.getElementById("bBloom").value.trim(),
        skillRepeatNumber: Number(document.getElementById("bSkillRepeat").value) || 1,
        referencePage: document.getElementById("bReferencePage").value.trim(),
        contentSource: document.getElementById("bContentSource").value,
        difficulty: document.getElementById("bDifficulty").value,
        type: document.getElementById("bType").value,
        questionText: document.getElementById("bText").value.trim(),
        options: document.getElementById("bOptions").value.split("\n").map((value) => value.trim()).filter(Boolean),
        correctAnswer: document.getElementById("bAnswer").value.trim(),
        explanation: document.getElementById("bExplanation").value.trim(),
        points: Number(document.getElementById("bPoints").value) || 1,
        skillId: question?.skill_id || null,
        reviewStatus: question?.review_status === "rejected" ? "rejected" : "approved",
      }) });
      closeModal();
      toast(question ? "تم حفظ ومراجعة السؤال." : "تم حفظ السؤال في المستودع.");
      if (questionBankView === "repository") renderQuestionBankRepository();
    } catch (error) {
      document.getElementById("bankFormMsg").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
      button.disabled = false;
    }
  };
}

function openQuestionBankImport() {
  const context = questionBankContext();
  openModal(`
    <h3>📥 استيراد أسئلة من Excel</h3>
    <p class="modal-note">يمكن استيراد XLSX أو ZIP يحتوي ملف Excel. يتعرف مدار تلقائيًا على أوراق «اختيار من متعدد» و«صح وخطأ» و«صِل»، ولا يقرأ ورقة دليل الاستخدام كأنها أسئلة.</p>
    <div class="question-bank-import-context"><strong>الاختيارات الافتراضية:</strong><span>${escapeHtml(context.stage)} · ${escapeHtml(context.gradeLabel)} · ${escapeHtml(context.classLabel)} · ${escapeHtml(context.termLabel)}</span></div>
    <div id="questionBankImportMsg"></div>
    <label class="field question-bank-file-field">ملف Excel<input type="file" id="questionBankImportFile" accept=".xlsx,.zip,.csv,.txt"></label>
    <div class="question-bank-template-note"><span>يدعم الاستيراد نموذج مدار العربي من A إلى S، وكذلك المخطط البرمجي: subject_id وgrade وunit_id وlesson_id وskill_id وquestions_to_display وquestion_id وبقية الأعمدة الإنجليزية. عند إنشاء الاختبار يعرض مدار سؤالًا واحدًا فقط لكل مهارة، ويدوّر بدائلها بين الطالبات والمحاولات.</span><div><button class="btn btn-outline btn-sm" id="downloadQuestionBankTemplate" type="button">⬇️ نموذج مدار العربي</button><button class="btn btn-outline btn-sm" id="downloadStructuredQuestionBankTemplate" type="button">⬇️ نموذج الأعمدة البرمجية</button></div></div>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelQuestionBankImport" type="button">إلغاء</button><button class="btn btn-primary" id="runQuestionBankImport" type="button">استيراد الملف</button></div>`);
  document.getElementById("downloadQuestionBankTemplate").onclick = () => { window.location.href = "/api/teacher/question-bank/export.xlsx?template=1"; };
  document.getElementById("downloadStructuredQuestionBankTemplate").onclick = () => { window.location.href = "/api/teacher/question-bank/export.xlsx?template=1&schema=structured"; };
  document.getElementById("cancelQuestionBankImport").onclick = closeModal;
  document.getElementById("runQuestionBankImport").onclick = async () => {
    const file = document.getElementById("questionBankImportFile").files[0];
    if (!file) {
      document.getElementById("questionBankImportMsg").innerHTML = '<div class="form-error">اختاري ملف Excel أولًا.</div>';
      return;
    }
    const button = document.getElementById("runQuestionBankImport");
    button.disabled = true;
    button.textContent = "جارٍ الاستيراد...";
    const form = new FormData();
    form.append("file", file);
    form.append("stage", context.stage);
    form.append("gradeLabel", context.gradeLabel);
    form.append("classLabel", context.classLabel);
    form.append("termLabel", context.termLabel);
    try {
      const result = await api("/question-bank/import", { method: "POST", body: form });
      try { allSkills = await api("/data/skills"); } catch {}
      closeModal();
      const details = result.skipped ? ` وتجاوز ${result.skipped} صفًا مكررًا أو غير مكتمل` : "";
      toast(`تم استيراد ${result.imported} سؤالًا${details}.`);
      questionBankView = "repository";
      questionBankRepositoryFiltered = false;
      sessionStorage.setItem("madarQuestionBankView", "repository");
      sessionStorage.setItem("madarQuestionBankRepositoryFiltered", "0");
      renderQuestionBankRepository();
    } catch (error) {
      document.getElementById("questionBankImportMsg").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
      button.disabled = false;
      button.textContent = "استيراد الملف";
    }
  };
}

function createTestFromSelectedBank() {
  const selected = [...contentEl.querySelectorAll("[data-bank-select]:checked")];
  const ids = selected.filter((box) => box.dataset.bankApproved === "1").map((box) => Number(box.dataset.bankSelect));
  if (!ids.length) return toast("اختاري سؤالًا معتمدًا واحدًا على الأقل. الأسئلة بانتظار المراجعة لا تُرسل للاختبار.");
  if (ids.length < selected.length) toast(`سيتم إرسال ${ids.length} سؤالًا معتمدًا فقط، وتجاوز الأسئلة غير المعتمدة.`);
  const context = questionBankContext();
  const matchingClasses = allClasses.filter((item) => item.level === context.stage && normalizeGradeKey(item.level, item.grade_label) === normalizeGradeKey(context.stage, context.gradeLabel));
  openModal(`<h3>إرسال الأسئلة إلى خانة الاختبارات</h3><p class="modal-note">سيُنشأ الاختبار كمسودة داخل خانة الاختبارات ويمكن نشره بعد المراجعة.</p><div class="form-grid full">
    <div class="field">عنوان الاختبار<input id="bankTestTitle" placeholder="مثال: اختبار الفصل الأول"></div>
    <div class="field">النوع<select id="bankTestType"><option value="quiz">اختبار فتري أو قصير</option><option value="pre_diagnostic">تشخيصي قبلي</option><option value="post_diagnostic">تشخيصي بعدي</option></select></div>
    <div class="field">الفصل<select id="bankTestClass"><option value="">اختاري الفصل</option>${(matchingClasses.length ? matchingClasses : allClasses).map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}</select></div>
  </div><div class="modal-actions"><button class="btn btn-outline" id="cancelBankTest" type="button">إلغاء</button><button class="btn btn-primary" id="saveBankTest" type="button">إنشاء وإرسال للاختبارات</button></div>`);
  document.getElementById("cancelBankTest").onclick = closeModal;
  document.getElementById("saveBankTest").onclick = async () => {
    const title = document.getElementById("bankTestTitle").value.trim();
    const classId = document.getElementById("bankTestClass").value;
    const testType = document.getElementById("bankTestType").value;
    if (!title || !classId) return toast("اكتبي عنوان الاختبار واختاري الفصل.");
    const button = document.getElementById("saveBankTest");
    button.disabled = true;
    try {
      const saved = await api("/tests", { method: "POST", body: JSON.stringify({ title, type: testType, classId, durationMinutes: 20, questions: [] }) });
      await api(`/tests/${saved.id}/add-bank-questions`, { method: "POST", body: JSON.stringify({ questionIds: ids }) });
      closeModal();
      toast("تم إنشاء الاختبار وإرساله إلى خانة الاختبارات كمسودة.");
      const selectedClass = allClasses.find((item) => String(item.id) === String(classId));
      if (selectedClass) {
        academicSelections.tests = { stage: selectedClass.level, gradeLabel: normalizeGradeKey(selectedClass.level, selectedClass.grade_label), classId: String(classId) };
        sessionStorage.setItem("madarAcademicTests", JSON.stringify(academicSelections.tests));
      }
      openTestsPanel(testType);
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  };
}


let learningStylePageTab = sessionStorage.getItem("madarLearningStyleTab") || "questions";
let learningStyleSelectedClassId = Number(sessionStorage.getItem("madarLearningStyleClassId") || 0);
let learningStyleFilterStage = sessionStorage.getItem("madarLearningStyleStage") || "";
let learningStyleFilterClassId = Number(sessionStorage.getItem("madarLearningStyleFilterClassId") || 0);
let learningStyleSearchText = "";

const LEARNING_STYLE_UI = {
  visual: { label: "بصري", css: "visual", color: "#7451cf", tip: "الخرائط الذهنية والألوان والرسوم والمخططات." },
  auditory: { label: "سمعي", css: "auditory", color: "#e39a51", tip: "الشرح الشفهي والحوار والتفكير بصوت مرتفع." },
  reading_writing: { label: "قرائي/كتابي", css: "reading", color: "#4d9188", tip: "الملخصات المكتوبة والقوائم وبطاقات المفاهيم." },
  kinesthetic: { label: "حركي/تطبيقي", css: "kinesthetic", color: "#ca6b8a", tip: "النماذج والمحسوسات والأنشطة العملية." },
  mixed: { label: "مختلط", css: "mixed", color: "#998dac", tip: "التنويع بين العرض والنقاش والكتابة والتطبيق." },
  unknown: { label: "غير محدد", css: "unknown", color: "#b8afc5", tip: "تحتاج الطالبة إلى إكمال الاستبانة." },
};

function learningStyleMeta(key) {
  return LEARNING_STYLE_UI[key] || LEARNING_STYLE_UI.unknown;
}

function learningStyleCampaign(config, classId) {
  return config.campaigns.find((item) => Number(item.class_id) === Number(classId)) || null;
}

function learningStyleClassLabel(item) {
  return `${item.stage} — ${item.grade_label || item.name} — ${item.name}`;
}

function learningStylePercent(value) {
  const number = Number(value || 0);
  return `${Math.round(number * 10) / 10}%`;
}

function openLearningStylePreview(questions) {
  let index = 0;
  const answers = {};
  let result = null;

  const render = () => {
    const question = questions[index];
    const answered = Object.keys(answers).length;
    const progress = Math.max(((index + 1) / questions.length) * 100, (answered / questions.length) * 100);
    if (result) {
      const meta = learningStyleMeta(result.style);
      openModal(`
        <div class="learning-preview-result">
          <button class="learning-preview-close" id="closeLearningPreview" aria-label="إغلاق">×</button>
          <div class="learning-result-sparkle">✦</div>
          <span class="learning-kicker">اكتمل التحليل التجريبي</span>
          <h2>النمط الأقرب هو <span class="learning-result-highlight ${meta.css}">${meta.label}</span></h2>
          <p>${escapeHtml(meta.tip)}</p>
          <div class="learning-score-bars">
            ${Object.entries(result.scores).map(([key, value]) => {
              const item = learningStyleMeta(key);
              return `<div><label><span>${item.label}</span><strong>${arabicMathNumber(value * 10, "متوسط")}%</strong></label><div><span style="width:${value * 10}%;background:${item.color}"></span></div></div>`;
            }).join("")}
          </div>
          <div class="learning-sent-note">هذه معاينة فقط، ولم تُحفظ نتيجة لطالبة.</div>
          <button class="btn btn-primary" id="restartLearningPreview">إعادة المعاينة</button>
        </div>`, "learning-preview-modal");
      document.getElementById("closeLearningPreview").onclick = closeModal;
      document.getElementById("restartLearningPreview").onclick = () => { index = 0; result = null; Object.keys(answers).forEach((key) => delete answers[key]); render(); };
      return;
    }

    openModal(`
      <div class="learning-preview-shell">
        <button class="learning-preview-close" id="closeLearningPreview" aria-label="إغلاق">×</button>
        <div class="learning-preview-brand"><span>✦</span><div><strong>مدار</strong><small>اكتشفي طريقتكِ المفضلة في التعلّم</small></div></div>
        <div class="learning-progress-meta"><span>السؤال ${arabicMathNumber(index + 1, "متوسط")} من ${arabicMathNumber(questions.length, "متوسط")}</span><span>${arabicMathNumber(Math.round(answered / questions.length * 100), "متوسط")}% مكتمل</span></div>
        <div class="learning-progress-track"><span style="width:${progress}%"></span></div>
        <section class="learning-preview-question"><span class="learning-kicker">موقف ${arabicMathNumber(String(question.id).padStart(2, "0"), "متوسط")}</span><h2>${escapeHtml(question.prompt)}</h2><p>${escapeHtml(question.context)}</p></section>
        <div class="learning-preview-options">
          ${question.options.map((option, optionIndex) => `<button type="button" data-learning-option="${escapeHtml(option.style)}" class="${answers[question.id] === option.style ? "selected" : ""}"><span>${MADAR_MATH_OPTION_LABELS[optionIndex]}</span><b>${escapeHtml(option.text)}</b><i>✓</i></button>`).join("")}
        </div>
        <div class="learning-preview-actions">
          <button class="btn btn-outline" id="learningPreviewPrevious" ${index === 0 ? "disabled" : ""}>السابق</button>
          ${index < questions.length - 1
            ? `<button class="btn btn-primary" id="learningPreviewNext" ${answers[question.id] ? "" : "disabled"}>التالي ←</button>`
            : `<button class="btn btn-primary" id="learningPreviewFinish" ${answered === questions.length ? "" : "disabled"}>إظهار النتيجة ✦</button>`}
        </div>
      </div>`, "learning-preview-modal");

    document.getElementById("closeLearningPreview").onclick = closeModal;
    document.querySelectorAll("[data-learning-option]").forEach((button) => {
      button.onclick = () => { answers[question.id] = button.dataset.learningOption; render(); };
    });
    document.getElementById("learningPreviewPrevious").onclick = () => { if (index > 0) { index -= 1; render(); } };
    const next = document.getElementById("learningPreviewNext");
    if (next) next.onclick = () => { if (answers[question.id]) { index += 1; render(); } };
    const finish = document.getElementById("learningPreviewFinish");
    if (finish) finish.onclick = () => {
      const scores = { visual: 0, auditory: 0, reading_writing: 0, kinesthetic: 0 };
      Object.values(answers).forEach((style) => { if (scores[style] !== undefined) scores[style] += 1; });
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      result = { style: sorted[0][1] === sorted[1][1] ? "mixed" : sorted[0][0], scores };
      render();
    };
  };
  render();
}

async function renderAnalysisLearning() {
  try {
    const config = await api("/learning-styles");
    if (!learningStyleSelectedClassId && config.classes.length) learningStyleSelectedClassId = Number(config.classes[0].id);
    if (learningStyleSelectedClassId && !config.classes.some((item) => Number(item.id) === learningStyleSelectedClassId)) {
      learningStyleSelectedClassId = Number(config.classes[0]?.id || 0);
    }

    const params = new URLSearchParams();
    if (learningStyleFilterStage) params.set("stage", learningStyleFilterStage);
    if (learningStyleFilterClassId) params.set("classId", String(learningStyleFilterClassId));
    if (learningStyleSearchText) params.set("search", learningStyleSearchText);
    const results = await api(`/learning-styles/results${params.toString() ? `?${params}` : ""}`);

    const selectedClass = config.classes.find((item) => Number(item.id) === learningStyleSelectedClassId) || null;
    const campaign = selectedClass ? learningStyleCampaign(config, selectedClass.id) : null;
    const publishDate = campaign?.publish_date || new Date().toISOString().slice(0, 10);
    const status = campaign?.status || "draft";

    contentEl.innerHTML = `
      <section class="learning-styles-hero">
        <span class="learning-hero-icon" aria-hidden="true">✦</span>
        <div><small>مساعدكِ لفهم كل طالبة</small><h2>اكتشفي كيف تتعلم <em>طالباتكِ</em></h2><p>استبانة إرشادية تساعدكِ على تنويع الشرح وبناء تجربة تعلم تصل إلى الجميع.</p></div>
      </section>
      <nav class="learning-main-tabs" aria-label="أقسام أنماط التعلم">
        <button type="button" data-learning-tab="questions" class="${learningStylePageTab === "questions" ? "active" : ""}"><span>✎</span><div><strong>أسئلة أنماط التعلم</strong><small>إعداد ونشر الاستبانة</small></div></button>
        <button type="button" data-learning-tab="analysis" class="${learningStylePageTab === "analysis" ? "active" : ""}"><span>◔</span><div><strong>تحليل نمط التعلم</strong><small>نتائج الطالبات والفصول</small></div></button>
      </nav>
      <div id="learningStyleBody"></div>`;

    document.querySelectorAll("[data-learning-tab]").forEach((button) => {
      button.onclick = () => {
        learningStylePageTab = button.dataset.learningTab;
        sessionStorage.setItem("madarLearningStyleTab", learningStylePageTab);
        renderAnalysisLearning();
      };
    });

    const body = document.getElementById("learningStyleBody");
    if (learningStylePageTab === "questions") {
      body.innerHTML = `
        <div class="learning-content-grid">
          <section class="card learning-question-panel">
            <header class="learning-section-heading"><div><span class="learning-kicker">الاستبانة المعتمدة</span><h3>أسئلة تحديد نمط التعلم</h3><p>${arabicMathNumber(config.questions.length, "متوسط")} مواقف قصيرة تقيس تفضيلات الطالبة بطريقة مرنة وغير تشخيصية.</p></div><div class="learning-question-count"><strong>${arabicMathNumber(config.questions.length, "متوسط")}</strong><span>أسئلة</span></div></header>
            <div class="learning-question-list">
              ${config.questions.map((question) => `<article><span class="learning-number">${arabicMathNumber(String(question.id).padStart(2, "0"), "متوسط")}</span><div><strong>${escapeHtml(question.prompt)}</strong><small>${question.options.map((item) => escapeHtml(item.text.split(" ").slice(0, 3).join(" "))).join(" · ")}</small></div><i title="جاهز للنشر"></i></article>`).join("")}
            </div>
          </section>
          <aside class="learning-side-stack">
            <section class="card learning-publish-panel">
              <header><span>⌁</span><div><h3>إعداد النشر</h3><p>حددي الفصل وموعد ظهور الاستبانة.</p></div></header>
              ${config.classes.length ? `
                <label class="field">المرحلة<select id="learningPublishStage">${[...new Set(config.classes.map((item) => item.stage))].map((stage) => `<option value="${escapeHtml(stage)}" ${selectedClass?.stage === stage ? "selected" : ""}>${escapeHtml(stage)}</option>`).join("")}</select></label>
                <label class="field">الفصل<select id="learningPublishClass">${config.classes.filter((item) => item.stage === selectedClass?.stage).map((item) => `<option value="${item.id}" ${Number(item.id) === learningStyleSelectedClassId ? "selected" : ""}>${escapeHtml(item.grade_label)} — ${escapeHtml(item.name)}</option>`).join("")}</select></label>
                <label class="field">تاريخ الإرسال<input id="learningPublishDate" type="date" value="${escapeHtml(publishDate)}"></label>
                <div class="learning-status-strip ${status === "published" ? "published" : ""}"><span></span><div><strong>${status === "published" ? "منشورة للطالبات" : "الاستبانة مسودة"}</strong><small>${status === "published" ? `متاحة بتاريخ ${escapeHtml(publishDate)}` : "لن تظهر في صفحة الطالبة بعد"}</small></div></div>
                <button class="btn btn-primary learning-wide-button" id="publishLearningStyle">نشر وإرسال للطالبات ←</button>
                <button class="btn btn-outline learning-wide-button" id="draftLearningStyle">حفظ كمسودة</button>
                <button class="learning-text-button" id="previewLearningStyle">معاينة صفحة الطالبة</button>`
                : `<div class="empty-state">أضيفي فصلًا وطالبات أولًا حتى تتمكني من نشر الاستبانة.</div>`}
            </section>
            <section class="card learning-info-panel"><span>💡</span><div><strong>كيف تُحسب النتيجة؟</strong><p>يُحتسب الاختيار الأكثر تكرارًا، وعند تساوي نمطين تظهر النتيجة «مختلط» مع النسب التفصيلية.</p></div></section>
          </aside>
        </div>`;

      if (config.classes.length) {
        const stageSelect = document.getElementById("learningPublishStage");
        const classSelect = document.getElementById("learningPublishClass");
        stageSelect.onchange = () => {
          const matching = config.classes.filter((item) => item.stage === stageSelect.value);
          classSelect.innerHTML = matching.map((item) => `<option value="${item.id}">${escapeHtml(item.grade_label)} — ${escapeHtml(item.name)}</option>`).join("");
          learningStyleSelectedClassId = Number(matching[0]?.id || 0);
          sessionStorage.setItem("madarLearningStyleClassId", String(learningStyleSelectedClassId));
          renderAnalysisLearning();
        };
        classSelect.onchange = () => {
          learningStyleSelectedClassId = Number(classSelect.value || 0);
          sessionStorage.setItem("madarLearningStyleClassId", String(learningStyleSelectedClassId));
          renderAnalysisLearning();
        };
        const saveCampaign = async (nextStatus) => {
          const button = nextStatus === "published" ? document.getElementById("publishLearningStyle") : document.getElementById("draftLearningStyle");
          button.disabled = true;
          try {
            const response = await api("/learning-styles/campaign", { method: "POST", body: JSON.stringify({ classId: learningStyleSelectedClassId, publishDate: document.getElementById("learningPublishDate").value, status: nextStatus }) });
            toast(response.message);
            await renderAnalysisLearning();
          } catch (error) { toast(error.message); button.disabled = false; }
        };
        document.getElementById("publishLearningStyle").onclick = () => saveCampaign("published");
        document.getElementById("draftLearningStyle").onclick = () => saveCampaign("draft");
        document.getElementById("previewLearningStyle").onclick = () => openLearningStylePreview(config.questions);
      }
    } else {
      const classOptions = config.classes.filter((item) => !learningStyleFilterStage || item.stage === learningStyleFilterStage);
      const completedTotal = Math.max(1, results.completedCount);
      const chartStyles = ["visual","auditory","reading_writing","kinesthetic","mixed"];
      let running = 0;
      const stops = chartStyles.map((key) => {
        const start = running;
        running += (Number(results.counts[key] || 0) / completedTotal) * 100;
        return `${learningStyleMeta(key).color} ${start}% ${running}%`;
      }).join(",");
      body.innerHTML = `
        <section class="card learning-filter-bar">
          <div><span class="learning-kicker">لوحة النتائج</span><h3>تحليل أنماط التعلم</h3><p>قارني النتائج لكل مرحلة وفصل على حدة.</p></div>
          <div class="learning-filters">
            <label class="field">المرحلة<select id="learningFilterStage"><option value="">الكل</option>${[...new Set(config.classes.map((item) => item.stage))].map((stage) => `<option value="${escapeHtml(stage)}" ${learningStyleFilterStage === stage ? "selected" : ""}>${escapeHtml(stage)}</option>`).join("")}</select></label>
            <label class="field">الفصل<select id="learningFilterClass"><option value="0">الكل</option>${classOptions.map((item) => `<option value="${item.id}" ${Number(item.id) === learningStyleFilterClassId ? "selected" : ""}>${escapeHtml(item.grade_label)} — ${escapeHtml(item.name)}</option>`).join("")}</select></label>
          </div>
        </section>
        <div class="learning-stats-row">
          <article><span>إجمالي المشاركات</span><strong>${arabicMathNumber(results.completedCount, "متوسط")}</strong><small>طالبة أكملت الاستبانة</small></article>
          <article><span>النمط الأكثر شيوعًا</span><strong>${escapeHtml(learningStyleMeta(results.mostCommonStyle).label)}</strong><small>ضمن التصفية الحالية</small></article>
          <article><span>نسبة الاكتمال</span><strong>${arabicMathNumber(Math.round(results.completionPercent), "متوسط")}%</strong><small>من ${arabicMathNumber(results.targetCount, "متوسط")} طالبة مستهدفة</small></article>
        </div>
        <div class="learning-analysis-grid">
          <section class="card learning-chart-card">
            <header><h3>توزيع الأنماط داخل الفصل</h3><p>${escapeHtml(results.notice)}</p></header>
            ${results.completedCount ? `<div class="learning-chart-wrap"><div class="learning-pie-chart" style="background:conic-gradient(${stops})"><div><strong>${arabicMathNumber(results.completedCount, "متوسط")}</strong><span>طالبة</span></div></div><div class="learning-legend">${chartStyles.map((key) => { const item = learningStyleMeta(key); const count = Number(results.counts[key] || 0); return `<div><i style="background:${item.color}"></i><span>${item.label}</span><strong>${arabicMathNumber(Math.round(count / completedTotal * 100), "متوسط")}%</strong><small>${arabicMathNumber(count, "متوسط")} طالبة</small></div>`; }).join("")}</div></div>` : `<div class="empty-state">لا توجد نتائج ضمن هذه التصفية.</div>`}
            <div class="learning-guidance"><strong>توصية تعليمية</strong><p>${escapeHtml(learningStyleMeta(results.mostCommonStyle).tip)}</p></div>
          </section>
          <section class="card learning-table-card">
            <header class="learning-table-heading"><div><h3>نتائج الطالبات</h3><p>تصل النتيجة للطالبة وتُضاف هنا تلقائيًا.</p></div><label class="learning-search-box"><span>⌕</span><input id="learningSearch" value="${escapeHtml(learningStyleSearchText)}" placeholder="ابحثي بالاسم أو الإيميل"></label></header>
            <div class="learning-table-scroll"><table><thead><tr><th>إيميل الطالبة</th><th>اسم الطالبة</th><th>تصنيف النمط</th><th>المرحلة والفصل</th><th>تاريخ الإكمال</th></tr></thead><tbody>${results.results.length ? results.results.map((item) => { const meta = learningStyleMeta(item.resultStyle); return `<tr><td dir="ltr">${escapeHtml(item.email)}</td><td><strong>${escapeHtml(item.studentName)}</strong></td><td><span class="learning-style-badge ${meta.css}">${meta.label}</span></td><td>${escapeHtml(item.stage)} · ${escapeHtml(item.gradeLabel)} · ${escapeHtml(item.className)}</td><td>${formatDate(item.completedAt)}</td></tr>`; }).join("") : `<tr><td colspan="5"><div class="empty-state">لم تُسجّل نتائج بعد.</div></td></tr>`}</tbody></table></div>
          </section>
        </div>`;

      document.getElementById("learningFilterStage").onchange = (event) => {
        learningStyleFilterStage = event.target.value;
        learningStyleFilterClassId = 0;
        sessionStorage.setItem("madarLearningStyleStage", learningStyleFilterStage);
        sessionStorage.setItem("madarLearningStyleFilterClassId", "0");
        renderAnalysisLearning();
      };
      document.getElementById("learningFilterClass").onchange = (event) => {
        learningStyleFilterClassId = Number(event.target.value || 0);
        sessionStorage.setItem("madarLearningStyleFilterClassId", String(learningStyleFilterClassId));
        renderAnalysisLearning();
      };
      let searchTimer = null;
      document.getElementById("learningSearch").oninput = (event) => {
        clearTimeout(searchTimer);
        learningStyleSearchText = event.target.value.trim();
        searchTimer = setTimeout(renderAnalysisLearning, 350);
      };
    }
  } catch (error) {
    contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`;
  }
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


let parentPanelMode = "accounts";

function parentRequestStatusLabel(status) {
  return ({ pending: "بانتظار المراجعة", approved: "تم الاعتماد", rejected: "مرفوض" })[status] || status;
}

function parentStudentChecks(students) {
  if (!students.length) return '<div class="parent-empty-mini">لا توجد طالبات في فصولك حاليًا.</div>';
  const groups = new Map();
  students.forEach((student) => {
    const key = `${student.className} · ${student.stage} · ${student.gradeLabel}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(student);
  });
  return [...groups.entries()].map(([label, items]) => `
    <fieldset class="parent-student-group"><legend>${escapeHtml(label)}</legend>
      ${items.map((student) => `<label><input type="checkbox" name="parentStudentIds" value="${student.id}"><span>${escapeHtml(student.name)}</span><small dir="ltr">${escapeHtml(student.email)}</small></label>`).join("")}
    </fieldset>`).join("");
}

async function renderParentPanel() {
  contentEl.innerHTML = `
    <section class="parent-tool-hero">
      <span class="parent-tool-icon">👨‍👩‍👧</span>
      <div><small>التواصل الأسري</small><h2>ولي الأمر</h2><p>إدارة حسابات أولياء أمور طالباتك وإرسال الإعلانات لهم من مجمع مدار.</p></div>
    </section>
    <div class="parent-tool-tabs">
      <button type="button" class="${parentPanelMode === "accounts" ? "active" : ""}" data-parent-mode="accounts"><span>👤</span><strong>إدارة حساب ولي الأمر</strong><small>الطلبات والحسابات والربط</small></button>
      <button type="button" class="${parentPanelMode === "community" ? "active" : ""}" data-parent-mode="community"><span>💬</span><strong>مجمع مدار</strong><small>رسائل وإعلانات أولياء الأمور</small></button>
    </div>
    <section id="parentToolBody"><div class="card loading-state">جارٍ تحميل بيانات أولياء الأمور...</div></section>`;
  document.querySelectorAll("[data-parent-mode]").forEach((button) => {
    button.onclick = async () => {
      parentPanelMode = button.dataset.parentMode;
      await renderParentPanel();
    };
  });
  if (parentPanelMode === "community") await renderParentCommunity();
  else await renderParentAccounts();
}

async function renderParentAccounts() {
  const data = await api("/parents");
  const pending = data.requests.filter((item) => item.status === "pending");
  const body = document.getElementById("parentToolBody");
  body.innerHTML = `
    <div class="parent-stats-grid">
      <article><span>⏳</span><div><strong>${pending.length}</strong><small>طلبات جديدة</small></div></article>
      <article><span>👪</span><div><strong>${data.parents.length}</strong><small>حسابات أولياء الأمور</small></div></article>
      <article><span>🔗</span><div><strong>${data.parents.reduce((sum, item) => sum + item.children.length, 0)}</strong><small>روابط الطالبات</small></div></article>
    </div>
    <div class="parent-admin-layout">
      <form class="card parent-create-card" id="parentCreateForm">
        <div class="parent-card-title"><span>➕</span><div><h3>إنشاء حساب ولي أمر</h3><p>أنشئي الحساب ثم اربطيه بطالبة أو أكثر من فصولك.</p></div></div>
        <div class="form-grid parent-name-grid">
          <label class="field">الاسم الأول<input id="parentCreateFirstName" maxlength="60" required placeholder="الاسم الأول" autocomplete="given-name"></label>
          <label class="field">الاسم الأخير<input id="parentCreateLastName" maxlength="60" required placeholder="الاسم الأخير" autocomplete="family-name"></label>
        </div>
        <label class="field">كلمة المرور المؤقتة<input id="parentCreatePassword" type="password" minlength="10" required placeholder="10 أحرف على الأقل وحرف ورقم"></label>
        <div class="parent-student-picker"><strong>ربط الحساب بالطالبات</strong><small>لا تظهر هنا إلا طالبات فصولك.</small>${parentStudentChecks(data.students)}</div>
        <div id="parentCreateMessage"></div>
        <button class="btn btn-primary parent-wide-btn" type="submit">إنشاء الحساب وربطه</button>
      </form>
      <section class="card parent-requests-card">
        <div class="parent-card-title"><span>📥</span><div><h3>طلبات إنشاء الحساب</h3><p>الطلبات المرسلة من أولياء أمور طالباتك.</p></div></div>
        <div class="parent-request-list">${pending.length ? pending.map((request) => `
          <article class="parent-request-item">
            <div><h4>${escapeHtml(request.name)}</h4><small>الطالبات: ${request.studentEmails.map(escapeHtml).join("، ")}</small><small>تاريخ الطلب: ${formatDate(request.createdAt)}</small></div>
            <div class="parent-request-actions"><button class="btn btn-primary btn-sm" type="button" data-approve-parent-request="${request.id}">اعتماد</button><button class="btn btn-outline btn-sm" type="button" data-reject-parent-request="${request.id}">رفض</button></div>
          </article>`).join("") : '<div class="parent-empty-mini">لا توجد طلبات جديدة حاليًا.</div>'}</div>
      </section>
    </div>
    <section class="card parent-accounts-card">
      <div class="parent-card-title"><span>👥</span><div><h3>حسابات أولياء الأمور</h3><p>كل حساب في هذه القائمة مرتبط بطالبة واحدة على الأقل من فصولك.</p></div></div>
      <div class="parent-account-list">${data.parents.length ? data.parents.map((parent) => {
        const available = data.students.filter((student) => !parent.children.some((child) => child.id === student.id));
        return `<article class="parent-account-item">
          <div class="parent-account-main"><span class="parent-account-avatar">${escapeHtml(parent.name.trim().charAt(0) || "و")}</span><div><h4>${escapeHtml(parent.name)}</h4><small>الدخول بالاسم الأول والأخير · ${parent.status === "active" ? "الحساب مفعّل" : "الحساب معطّل"}${parent.sharedWithOtherTeachers ? " · مرتبط أيضًا بمعلمة أخرى" : ""}</small></div></div>
          <div class="parent-linked-children">${parent.children.map((child) => `<span>${escapeHtml(child.name)} <button type="button" title="إلغاء الربط" data-unlink-parent="${parent.id}" data-unlink-student="${child.id}">×</button></span>`).join("")}</div>
          <div class="parent-link-row"><select data-parent-link-select="${parent.id}"><option value="">اختاري طالبة لإضافتها</option>${available.map((student) => `<option value="${student.id}">${escapeHtml(student.name)} · ${escapeHtml(student.className)}</option>`).join("")}</select><button class="btn btn-secondary btn-sm" type="button" data-link-parent="${parent.id}" ${available.length ? "" : "disabled"}>ربط طالبة</button></div>
          <div class="parent-account-actions"><button class="btn btn-outline btn-sm" type="button" data-reset-parent="${parent.id}" ${parent.sharedWithOtherTeachers ? "disabled" : ""}>إعادة كلمة المرور</button><button class="btn ${parent.status === "active" ? "btn-danger" : "btn-primary"} btn-sm" type="button" data-toggle-parent="${parent.id}" data-parent-status="${parent.status}" ${parent.sharedWithOtherTeachers ? "disabled" : ""}>${parent.status === "active" ? "تعطيل" : "تفعيل"}</button></div>
        </article>`;
      }).join("") : '<div class="parent-empty-mini">لم تُنشأ حسابات أولياء أمور بعد.</div>'}</div>
    </section>`;

  document.getElementById("parentCreateForm").onsubmit = async (event) => {
    event.preventDefault();
    const studentIds = [...document.querySelectorAll('[name="parentStudentIds"]:checked')].map((input) => Number(input.value));
    const message = document.getElementById("parentCreateMessage");
    if (!studentIds.length) { message.innerHTML = '<div class="form-error">اختاري طالبة واحدة على الأقل.</div>'; return; }
    try {
      await api("/parents", { method: "POST", body: JSON.stringify({ firstName: document.getElementById("parentCreateFirstName").value.trim(), lastName: document.getElementById("parentCreateLastName").value.trim(), password: document.getElementById("parentCreatePassword").value, studentIds }) });
      toast("تم إنشاء حساب ولي الأمر وربطه بالطالبة.");
      await renderParentAccounts();
    } catch (error) { message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
  };
  document.querySelectorAll("[data-approve-parent-request]").forEach((button) => button.onclick = async () => {
    try { await api(`/parents/requests/${button.dataset.approveParentRequest}/approve`, { method: "POST", body: "{}" }); toast("تم اعتماد حساب ولي الأمر وربطه بالطالبة."); await renderParentAccounts(); } catch (error) { toast(error.message); }
  });
  document.querySelectorAll("[data-reject-parent-request]").forEach((button) => button.onclick = () => confirmAction("هل تريدين رفض طلب إنشاء حساب ولي الأمر؟", async () => { await api(`/parents/requests/${button.dataset.rejectParentRequest}/reject`, { method: "POST", body: JSON.stringify({ note: "تم رفض الطلب من المعلمة." }) }); toast("تم رفض الطلب."); await renderParentAccounts(); }));
  document.querySelectorAll("[data-link-parent]").forEach((button) => button.onclick = async () => {
    const select = document.querySelector(`[data-parent-link-select="${button.dataset.linkParent}"]`);
    if (!select.value) return toast("اختاري طالبة أولًا.");
    try { await api(`/parents/${button.dataset.linkParent}/links`, { method: "POST", body: JSON.stringify({ studentId: Number(select.value) }) }); toast("تم ربط الطالبة بولي الأمر."); await renderParentAccounts(); } catch (error) { toast(error.message); }
  });
  document.querySelectorAll("[data-unlink-parent]").forEach((button) => button.onclick = () => confirmAction("إلغاء ربط هذه الطالبة بحساب ولي الأمر؟ لن يُحذف الحساب.", async () => { await api(`/parents/${button.dataset.unlinkParent}/links/${button.dataset.unlinkStudent}`, { method: "DELETE", body: "{}" }); toast("تم إلغاء الربط."); await renderParentAccounts(); }));
  document.querySelectorAll("[data-reset-parent]").forEach((button) => button.onclick = () => openParentPasswordModal(Number(button.dataset.resetParent)));
  document.querySelectorAll("[data-toggle-parent]").forEach((button) => button.onclick = () => {
    const next = button.dataset.parentStatus === "active" ? "disabled" : "active";
    confirmAction(`${next === "disabled" ? "تعطيل" : "تفعيل"} حساب ولي الأمر؟`, async () => { await api(`/parents/${button.dataset.toggleParent}`, { method: "PUT", body: JSON.stringify({ status: next }) }); toast(`تم ${next === "disabled" ? "تعطيل" : "تفعيل"} الحساب.`); await renderParentAccounts(); });
  });
}

function openParentPasswordModal(parentId) {
  openModal(`<h3>إعادة تعيين كلمة مرور ولي الأمر</h3><div id="parentPasswordMessage"></div><label class="field">كلمة المرور الجديدة<input id="parentNewPassword" type="password" minlength="10" placeholder="10 أحرف على الأقل وحرف ورقم"></label><div class="modal-actions"><button class="btn btn-outline" id="cancelParentPassword">إلغاء</button><button class="btn btn-primary" id="saveParentPassword">حفظ</button></div>`);
  document.getElementById("cancelParentPassword").onclick = closeModal;
  document.getElementById("saveParentPassword").onclick = async () => {
    try { await api(`/parents/${parentId}/reset-password`, { method: "PUT", body: JSON.stringify({ newPassword: document.getElementById("parentNewPassword").value }) }); closeModal(); toast("تم تعيين كلمة المرور الجديدة."); } catch (error) { document.getElementById("parentPasswordMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
  };
}

async function renderParentCommunity() {
  const data = await api("/parent-community");
  const body = document.getElementById("parentToolBody");
  body.innerHTML = `
    <div class="parent-community-layout">
      <form class="card parent-community-form" id="parentCommunityForm">
        <div class="parent-card-title"><span>✍️</span><div><h3>إعلان جديد</h3><p>يظهر الإعلان في لوحة أولياء أمور طالباتك.</p></div></div>
        <label class="field">العنوان<input id="parentPostTitle" maxlength="190" required placeholder="مثال: تذكير بموعد الاختبار"></label>
        <label class="field">الفئة المستهدفة<select id="parentPostClass"><option value="">جميع أولياء أمور طالباتي</option>${data.classes.map((item) => `<option value="${item.id}">${escapeHtml(item.name)} · ${escapeHtml(item.grade_label)}</option>`).join("")}</select></label>
        <label class="field">نص الإعلان<textarea id="parentPostBody" maxlength="5000" required placeholder="اكتبي الرسالة أو التوجيه لولي الأمر"></textarea></label>
        <div id="parentPostMessage"></div><button class="btn btn-primary parent-wide-btn" type="submit">نشر في مجمع مدار</button>
      </form>
      <section class="card parent-community-list-card">
        <div class="parent-card-title"><span>💬</span><div><h3>إعلاناتي المنشورة</h3><p>${data.posts.length} إعلان</p></div></div>
        <div class="parent-community-posts">${data.posts.length ? data.posts.map((post) => `<article><div><small>${escapeHtml(post.className || "جميع الفصول")} · ${formatDate(post.createdAt)}</small><h4>${escapeHtml(post.title)}</h4><p>${escapeHtml(post.body).replace(/\n/g,"<br>")}</p></div><button class="btn btn-outline btn-sm" type="button" data-delete-parent-post="${post.id}">حذف</button></article>`).join("") : '<div class="parent-empty-mini">لم تنشري إعلانات بعد.</div>'}</div>
      </section>
    </div>`;
  document.getElementById("parentCommunityForm").onsubmit = async (event) => {
    event.preventDefault();
    const message = document.getElementById("parentPostMessage");
    try { await api("/parent-community", { method: "POST", body: JSON.stringify({ title: document.getElementById("parentPostTitle").value.trim(), body: document.getElementById("parentPostBody").value.trim(), classId: Number(document.getElementById("parentPostClass").value || 0) }) }); toast("تم نشر الإعلان في مجمع مدار."); await renderParentCommunity(); } catch (error) { message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
  };
  document.querySelectorAll("[data-delete-parent-post]").forEach((button) => button.onclick = () => confirmAction("حذف هذا الإعلان من مجمع مدار؟", async () => { await api(`/parent-community/${button.dataset.deleteParentPost}`, { method: "DELETE", body: "{}" }); toast("تم حذف الإعلان."); await renderParentCommunity(); }));
}

function renderEducationalContent(key, target = contentEl) {
  const section = EDUCATIONAL_CONTENT[key];
  if (key === "interactive-games") {
    target.innerHTML = `
      <section class="games-library-grid" aria-label="الألعاب التفاعلية المتاحة">
        <article class="card teacher-game-card">
          <div class="teacher-game-visual" aria-hidden="true">
            <span class="teacher-game-percent">%</span>
            <small>١٠٠</small>
          </div>
          <div class="teacher-game-copy">
            <span class="teacher-game-tag">درس النسبة المئوية</span>
            <h3>تحدي النسبة المئوية</h3>
            <p>لعبة تفاعلية متدرجة تساعد الطالبات على التدريب على إيجاد النسبة المئوية، مع تصحيح فوري وحفظ المحاولات والنتائج في حساب الطالبة.</p>
            <div class="teacher-game-features" aria-label="مميزات اللعبة">
              <span>⚡ أسئلة متجددة</span>
              <span>🏆 نقاط ومستويات</span>
              <span>💡 شرح للحل</span>
            </div>
            <div class="teacher-game-actions">
              <a class="btn btn-primary" href="/games/percentage.html" target="_blank" rel="noopener">فتح اللعبة</a>
              <button class="btn btn-secondary" type="button" data-copy-game-link="/games/percentage.html">نسخ رابط اللعبة</button>
            </div>
          </div>
        </article>
      </section>`;
    const copyButton = target.querySelector("[data-copy-game-link]");
    if (copyButton) copyButton.onclick = async () => {
      const url = new URL(copyButton.dataset.copyGameLink, window.location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        toast("تم نسخ رابط لعبة النسبة المئوية.");
      } catch (_) {
        window.prompt("انسخي رابط اللعبة:", url);
      }
    };
    return;
  }
  target.innerHTML = `
    <div class="card educational-ready-card">
      <div class="empty-state"><div class="ic" aria-hidden="true">${section.icon}</div><h3>قسم ${escapeHtml(section.title)} جاهز</h3><p>${escapeHtml(section.hint)}</p></div>
    </div>`;
}


// ========================================================================== 
// تحسينات منصة مدار الشاملة v11
// ========================================================================== 
function initGlobalSearch() {
  const input = document.getElementById("globalSearchInput");
  const results = document.getElementById("globalSearchResults");
  if (!input || !results) return;
  let timer = null;
  const close = () => { results.hidden = true; results.innerHTML = ""; };
  const run = async () => {
    const q = input.value.trim();
    if (q.length < 2) { close(); return; }
    results.hidden = false;
    results.innerHTML = '<div class="empty-state" style="min-height:90px">جارٍ البحث...</div>';
    try {
      const data = await api(`/enhancements/search?q=${encodeURIComponent(q)}`);
      if (!data.groups?.length) {
        results.innerHTML = '<div class="empty-state" style="min-height:110px">لا توجد نتائج مطابقة.</div>';
        return;
      }
      results.innerHTML = data.groups.map((group) => `
        <section class="search-group">
          <h4>${escapeHtml(group.icon)} ${escapeHtml(group.label)}</h4>
          ${group.items.map((item) => `<button class="search-result-item" type="button" data-search-type="${escapeHtml(group.type)}" data-search-id="${item.id}" data-search-route="${escapeHtml(item.route || "home")}"><span>${escapeHtml(group.icon)}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle || "")}</small></span><span class="search-result-arrow">←</span></button>`).join("")}
        </section>`).join("");
      results.querySelectorAll("[data-search-type]").forEach((button) => {
        button.onclick = () => {
          const type = button.dataset.searchType;
          const id = Number(button.dataset.searchId || 0);
          close(); input.value = "";
          if (type === "students") openStudentProfile(id);
          else navigate(button.dataset.searchRoute || "home");
        };
      });
    } catch (error) {
      results.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    }
  };
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 260); });
  input.addEventListener("focus", () => { if (input.value.trim().length >= 2) run(); });
  document.addEventListener("click", (event) => { if (!document.getElementById("globalSearchBox")?.contains(event.target)) close(); });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); input.focus(); input.select(); }
    if (event.key === "Escape") close();
  });
}

function statusLabel(status) {
  return ({ planned: "مخططة", in_progress: "قيد التنفيذ", completed: "مكتملة", reassessed: "أعيد قياسها", cancelled: "ملغاة" })[status] || status;
}

async function renderRemedialPlans() {
  const [plansData, studentsData] = await Promise.all([api("/enhancements/remedial"), api("/students?pageSize=200")]);
  const plans = plansData.items || [];
  const students = studentsData.items || [];
  const active = plans.filter((p) => ["planned", "in_progress"].includes(p.status)).length;
  const reassessed = plans.filter((p) => p.status === "reassessed").length;
  const improved = plans.filter((p) => Number(p.after_percent || 0) > Number(p.before_percent || 0)).length;
  contentEl.innerHTML = `
    <div class="enhancement-grid">
      <article class="enhancement-card"><small>الخطط النشطة</small><strong>${active}</strong></article>
      <article class="enhancement-card"><small>أعيد قياسها</small><strong>${reassessed}</strong></article>
      <article class="enhancement-card"><small>تحسن بعد العلاج</small><strong>${improved}</strong></article>
      <article class="enhancement-card"><small>إجمالي الخطط</small><strong>${plans.length}</strong></article>
    </div>
    <section class="card smart-section">
      <div class="smart-section-head"><div><h3>الخطة العلاجية الذكية</h3><p style="color:var(--muted);margin:4px 0 0;font-size:.78rem">يحدد النظام مهارات الطالبة الأقل من ٧٠٪ ويقترح نشاطًا يناسب نمط تعلمها.</p></div><button class="btn btn-primary btn-sm" id="autoPlanButton">توليد خطة تلقائية</button></div>
      <div class="toolbar"><select id="remedialStudentFilter"><option value="">كل الطالبات</option>${students.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} · ${escapeHtml(s.class_name || "")}</option>`).join("")}</select><select id="remedialStatusFilter"><option value="">كل الحالات</option><option value="planned">مخططة</option><option value="in_progress">قيد التنفيذ</option><option value="completed">مكتملة</option><option value="reassessed">أعيد قياسها</option><option value="cancelled">ملغاة</option></select></div>
      <div id="remedialTable"></div>
    </section>`;
  const draw = () => {
    const sid = document.getElementById("remedialStudentFilter").value;
    const status = document.getElementById("remedialStatusFilter").value;
    const filtered = plans.filter((p) => (!sid || String(p.student_id) === sid) && (!status || p.status === status));
    document.getElementById("remedialTable").innerHTML = filtered.length ? `<div class="table-wrap"><table><thead><tr><th>الطالبة</th><th>المهارة</th><th>قبل</th><th>الهدف</th><th>بعد</th><th>النشاط المقترح</th><th>الموعد</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${filtered.map((p) => `<tr><td><button class="link-button student-link" data-remedial-student="${p.student_id}">${escapeHtml(p.student_name)}</button><small class="cell-sub">${escapeHtml(p.class_name || "")}</small></td><td>${escapeHtml(p.skill_name || p.title)}</td><td>${Number(p.before_percent || 0)}٪</td><td>${Number(p.target_percent || 70)}٪</td><td>${p.after_percent === null ? "—" : `${Number(p.after_percent)}٪`}</td><td style="min-width:260px">${escapeHtml(p.recommended_activity || "—")}${p.recommended_resource_url ? `<br><a href="${escapeHtml(p.recommended_resource_url)}" target="_blank">فتح المورد المقترح</a>` : ""}</td><td>${escapeHtml(p.due_date || "—")}</td><td><span class="remedial-status remedial-${escapeHtml(p.status)}">${escapeHtml(statusLabel(p.status))}</span></td><td><button class="btn btn-outline btn-sm" data-edit-plan="${p.id}">تحديث</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-state">لا توجد خطط مطابقة.</div>';
    document.querySelectorAll("[data-remedial-student]").forEach((b) => b.onclick = () => openStudentProfile(Number(b.dataset.remedialStudent)));
    document.querySelectorAll("[data-edit-plan]").forEach((b) => {
      const plan = plans.find((p) => String(p.id) === b.dataset.editPlan);
      b.onclick = () => openRemedialUpdateModal(plan);
    });
  };
  document.getElementById("remedialStudentFilter").onchange = draw;
  document.getElementById("remedialStatusFilter").onchange = draw;
  document.getElementById("autoPlanButton").onclick = () => {
    openModal(`<h3>توليد خطة علاجية تلقائية</h3><label class="field">الطالبة<select id="autoPlanStudent"><option value="">اختاري الطالبة</option>${students.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} · ${escapeHtml(s.class_name || "")}</option>`).join("")}</select></label><label class="field">حد الإتقان الذي يحتاج علاجًا<input type="number" id="autoPlanThreshold" value="70" min="40" max="90"></label><div class="modal-actions"><button class="btn btn-outline" id="cancelAutoPlan">إلغاء</button><button class="btn btn-primary" id="saveAutoPlan">توليد الخطة</button></div>`);
    document.getElementById("cancelAutoPlan").onclick = closeModal;
    document.getElementById("saveAutoPlan").onclick = async () => {
      const studentId = Number(document.getElementById("autoPlanStudent").value || 0);
      if (!studentId) return toast("اختاري الطالبة.");
      const result = await api("/enhancements/remedial/auto", { method: "POST", body: JSON.stringify({ studentId, threshold: Number(document.getElementById("autoPlanThreshold").value || 70) }) });
      closeModal(); toast(`تم إنشاء ${result.created} خطة علاجية جديدة.`); renderRemedialPlans();
    };
  };
  draw();
}

function openRemedialUpdateModal(plan) {
  openModal(`<h3>تحديث الخطة العلاجية</h3><p>${escapeHtml(plan.student_name)} · ${escapeHtml(plan.skill_name || plan.title)}</p><div class="form-grid"><label class="field">الحالة<select id="planStatus">${["planned","in_progress","completed","reassessed","cancelled"].map((v) => `<option value="${v}" ${plan.status === v ? "selected" : ""}>${statusLabel(v)}</option>`).join("")}</select></label><label class="field">نسبة الإتقان بعد العلاج<input id="planAfter" type="number" min="0" max="100" value="${plan.after_percent ?? ""}"></label><label class="field">موعد الإكمال<input id="planDue" type="date" value="${escapeHtml(plan.due_date || "")}"></label><label class="field full-span">النشاط<textarea id="planActivity">${escapeHtml(plan.recommended_activity || "")}</textarea></label></div><div class="modal-actions"><button class="btn btn-outline" id="cancelPlanEdit">إلغاء</button><button class="btn btn-primary" id="savePlanEdit">حفظ</button></div>`);
  document.getElementById("cancelPlanEdit").onclick = closeModal;
  document.getElementById("savePlanEdit").onclick = async () => {
    await api(`/enhancements/remedial/${plan.id}`, { method: "PUT", body: JSON.stringify({ status: document.getElementById("planStatus").value, afterPercent: document.getElementById("planAfter").value, dueDate: document.getElementById("planDue").value, activity: document.getElementById("planActivity").value }) });
    closeModal(); toast("تم تحديث الخطة العلاجية."); renderRemedialPlans();
  };
}

async function renderCalendar() {
  const from = new Date(); from.setDate(1);
  const to = new Date(); to.setMonth(to.getMonth() + 3); to.setDate(0);
  const [data, studentData] = await Promise.all([api(`/enhancements/calendar?from=${from.toISOString().slice(0,10)}&to=${to.toISOString().slice(0,10)}`),api("/students?pageSize=100")]);
  const calendarStudents = studentData.items || [];
  const events = (data.items || []).sort((a,b) => new Date(a.starts_at) - new Date(b.starts_at));
  contentEl.innerHTML = `<div class="calendar-layout"><form class="card" id="calendarForm"><h3 class="section-title">إضافة موعد</h3><label class="field">العنوان<input id="calTitle" required placeholder="مثال: اختبار الوحدة الثانية"></label><div class="form-grid"><label class="field">النوع<select id="calType"><option value="test">اختبار</option><option value="homework">واجب</option><option value="task">مهمة</option><option value="meeting">لقاء</option><option value="announcement">إعلان</option><option value="remedial">علاجي</option><option value="other">أخرى</option></select></label><label class="field">الجمهور<select id="calAudience"><option value="class">الفصل</option><option value="class_and_parents">الفصل وولي الأمر</option><option value="parents">أولياء الأمور</option><option value="student">طالبة محددة</option><option value="teacher">المعلمة فقط</option></select></label><label class="field">الفصل<select id="calClass"><option value="">بدون فصل محدد</option>${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select></label><label class="field" id="calStudentField" hidden>الطالبة<select id="calStudent"><option value="">اختاري الطالبة</option>${calendarStudents.map((student)=>`<option value="${student.id}">${escapeHtml(student.name)} · ${escapeHtml(student.class_name)}</option>`).join("")}</select></label><label class="field">البداية<input id="calStart" type="datetime-local" required></label><label class="field">النهاية<input id="calEnd" type="datetime-local"></label></div><label class="field">الوصف<textarea id="calDescription" placeholder="تفاصيل الموعد"></textarea></label><button class="btn btn-primary btn-block" type="submit">حفظ الموعد</button></form><section class="card"><div class="smart-section-head"><h3>المواعيد القادمة</h3><span class="badge badge-green">${events.filter((e) => e.status === "active").length} موعد</span></div><div class="calendar-list">${events.length ? events.map((event) => { const d = new Date(event.starts_at); return `<article class="calendar-event"><div class="calendar-date"><strong>${d.toLocaleDateString("ar-SA",{day:"numeric"})}</strong><small>${d.toLocaleDateString("ar-SA",{month:"short"})}</small></div><div><strong>${escapeHtml(event.title)}</strong><small class="cell-sub">${d.toLocaleString("ar-SA")} · ${escapeHtml(event.class_name || event.student_name || "عام")}</small><p style="margin:5px 0 0;color:var(--muted);font-size:.75rem">${escapeHtml(event.description || "")}</p></div>${event.source === "calendar" ? `<button class="btn btn-danger btn-sm" data-cancel-event="${event.id}">إلغاء</button>` : '<span class="badge badge-orange">من الاختبارات</span>'}</article>`; }).join("") : '<div class="empty-state">لا توجد مواعيد خلال الفترة الحالية.</div>'}</div></section></div>`;
  const calAudience = document.getElementById("calAudience");
  const updateCalendarAudience = () => { const individual = calAudience.value === "student"; document.getElementById("calStudentField").hidden = !individual; if(individual) document.getElementById("calClass").value = ""; };
  calAudience.onchange = updateCalendarAudience; updateCalendarAudience();
  document.getElementById("calendarForm").onsubmit = async (event) => {
    event.preventDefault();
    await api("/enhancements/calendar", { method: "POST", body: JSON.stringify({ title: document.getElementById("calTitle").value, description: document.getElementById("calDescription").value, eventType: document.getElementById("calType").value, audience: document.getElementById("calAudience").value, classId: Number(document.getElementById("calClass").value || 0), studentId: Number(document.getElementById("calStudent").value || 0), startsAt: document.getElementById("calStart").value, endsAt: document.getElementById("calEnd").value }) });
    toast("تم حفظ الموعد."); renderCalendar();
  };
  document.querySelectorAll("[data-cancel-event]").forEach((b) => b.onclick = () => confirmAction("إلغاء هذا الموعد؟", async () => { await api(`/enhancements/calendar/${b.dataset.cancelEvent}`, { method: "DELETE", body: "{}" }); toast("تم إلغاء الموعد."); renderCalendar(); }));
}

async function renderReports() {
  const data = await api("/enhancements/smart-reports");
  const table = (headers, rows) => rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` : '<div class="empty-state" style="min-height:120px">لا توجد بيانات كافية.</div>';
  contentEl.innerHTML = `
    <div class="enhancement-grid"><article class="enhancement-card"><small>طالبات يحتجن دعمًا</small><strong>${data.atRisk.length}</strong></article><article class="enhancement-card"><small>مهارات منخفضة</small><strong>${data.weakSkills.length}</strong></article><article class="enhancement-card"><small>اختبارات غير مكتملة</small><strong>${data.incomplete.length}</strong></article><article class="enhancement-card"><small>أسئلة تحتاج مراجعة</small><strong>${data.problemQuestions.length}</strong></article></div>
    <section class="card smart-section"><div class="smart-section-head"><h3>الطالبات اللاتي يحتجن تدخلًا</h3><button class="btn btn-primary btn-sm" id="openRemedialFromReport">فتح الخطط العلاجية</button></div>${table(["الطالبة","الفصل","التقدم","متوسط الاختبارات","تنبيهات الحضور"], data.atRisk.map((r) => `<tr><td><button class="link-button student-link" data-report-student="${r.id}">${escapeHtml(r.name)}</button></td><td>${escapeHtml(r.class_name)}</td><td>${r.progress_percent}٪</td><td>${r.test_average}٪</td><td>${r.attendance_flags}</td></tr>`))}</section>
    <section class="card smart-section"><h3 class="section-title">مقارنة الفصول</h3>${table(["الفصل","المرحلة والصف","عدد الطالبات","متوسط الاختبارات","متوسط التقدم"], data.classComparison.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.stage)} · ${escapeHtml(r.grade_label)}</td><td>${r.students}</td><td>${r.test_average}٪</td><td>${r.progress_average}٪</td></tr>`))}</section>
    <section class="card smart-section"><h3 class="section-title">أضعف المهارات</h3>${table(["المهارة","الإتقان","عدد الطالبات"], data.weakSkills.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td><span class="badge ${progressColorBadge(Number(r.mastery))}">${r.mastery}٪</span></td><td>${r.students}</td></tr>`))}</section>
    <section class="card smart-section"><h3 class="section-title">الاختبارات التي لم تكملها جميع الطالبات</h3>${table(["الاختبار","الفصل","عدد الفصل","المحاولات","لم تكمل"], data.incomplete.map((r) => `<tr><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.class_name || "—")}</td><td>${r.class_students}</td><td>${r.attempts}</td><td>${r.missing}</td></tr>`))}</section>
    <section class="card smart-section"><h3 class="section-title">الأسئلة التي أخطأت فيها أغلب الطالبات</h3>${table(["المهارة","السؤال","الاستجابات","الإتقان"], data.problemQuestions.map((r) => `<tr><td>${escapeHtml(r.skill_name || "—")}</td><td style="min-width:300px">${escapeHtml(r.question_text)}</td><td>${r.responses}</td><td><span class="badge badge-red">${r.mastery}٪</span></td></tr>`))}</section>
    <section class="card smart-section"><h3 class="section-title">التحسن بين التشخيص القبلي والبعدي</h3>${table(["الطالبة","الفصل","القبلي","البعدي","التحسن"], data.improvement.map((r) => `<tr><td><button class="link-button student-link" data-report-student="${r.id}">${escapeHtml(r.name)}</button></td><td>${escapeHtml(r.class_name)}</td><td>${r.pre_avg}٪</td><td>${r.post_avg}٪</td><td><strong>${Number(r.improvement) >= 0 ? "+" : ""}${r.improvement}٪</strong></td></tr>`))}</section>
    <section class="card smart-section"><h3 class="section-title">التصدير والطباعة</h3><div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn btn-secondary" href="/api/teacher/reports/students.xlsx">قائمة الطالبات Excel</a><select id="smartRepClass">${allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select><a class="btn btn-outline" id="smartRepClassLink" target="_blank">تقرير الفصل PDF</a></div></section>`;
  document.getElementById("openRemedialFromReport").onclick = () => navigate("remedial-plans");
  document.querySelectorAll("[data-report-student]").forEach((b) => b.onclick = () => openStudentProfile(Number(b.dataset.reportStudent)));
  const select = document.getElementById("smartRepClass"), link = document.getElementById("smartRepClassLink");
  const update = () => { link.href = `/api/teacher/reports/class.pdf?classId=${select.value}`; }; select.onchange = update; update();
}

async function renderNotifications() {
  const [data, resetData] = await Promise.all([api("/enhancements/alerts"), api("/enhancements/password-requests")]);
  const notifs = data.items || [];
  const resetRequests = resetData.items || [];
  contentEl.innerHTML = `<section class="card"><div class="smart-section-head"><div><h3>مركز التنبيهات</h3><p style="margin:4px 0 0;color:var(--muted);font-size:.78rem">تنبيهات تلقائية عن الاختبارات والواجبات والطالبات وطلبات أولياء الأمور.</p></div><span class="badge badge-orange">${data.unread} غير مقروء</span></div>${notifs.length ? notifs.map((n) => `<article class="alert-card ${escapeHtml(n.severity || "info")}"><span style="font-size:1.35rem">${n.severity === "danger" ? "⚠️" : n.severity === "warning" ? "🔔" : "ℹ️"}</span><div><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.message || "")} · ${formatDate(n.created_at)}</p></div><div style="display:flex;gap:6px;flex-wrap:wrap">${n.route ? `<button class="btn btn-secondary btn-sm" data-alert-route="${escapeHtml(n.route)}">فتح</button>` : ""}${n.is_read ? "" : `<button class="btn btn-outline btn-sm" data-read="${n.id}">مقروء</button>`}<button class="btn btn-danger btn-sm" data-delnotif="${n.id}">حذف</button></div></article>`).join("") : '<div class="empty-state">لا توجد تنبيهات حاليًا.</div>'}</section><section class="card smart-section"><div class="smart-section-head"><div><h3>طلبات إعادة كلمة المرور</h3><p style="margin:4px 0 0;color:var(--muted);font-size:.78rem">طلبات طالباتك وأولياء أمورهن فقط.</p></div><span class="badge badge-orange">${resetRequests.length} طلب</span></div>${resetRequests.length?resetRequests.map(r=>`<article class="alert-card info"><span style="font-size:1.35rem">🔐</span><div><strong>${escapeHtml([r.first_name,r.last_name].filter(Boolean).join(" ")||r.identifier_hint||"طلب حساب")}</strong><p>${escapeHtml(r.requested_role)} · ${formatDate(r.created_at)}</p></div><div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" data-resolve-password-request="${r.id}">إعادة التعيين</button><button class="btn btn-outline btn-sm" data-reject-password-request="${r.id}">رفض</button></div></article>`).join(""):'<div class="empty-state">لا توجد طلبات معلقة.</div>'}</section>`;
  document.querySelectorAll("[data-alert-route]").forEach((b) => b.onclick = () => { const route = b.dataset.alertRoute; if (route.startsWith("student:")) openStudentProfile(Number(route.split(":")[1])); else navigate(route); });
  document.querySelectorAll("[data-read]").forEach((b) => b.onclick = async () => { await api(`/data/notifications/${b.dataset.read}/read`, { method: "PUT" }); renderNotifications(); refreshNotifBell(); });
  document.querySelectorAll("[data-delnotif]").forEach((b) => b.onclick = async () => { await api(`/data/notifications/${b.dataset.delnotif}`, { method: "DELETE" }); renderNotifications(); refreshNotifBell(); });
  document.querySelectorAll("[data-resolve-password-request]").forEach((b)=>b.onclick=()=>openTeacherPasswordRequest(Number(b.dataset.resolvePasswordRequest)));
  document.querySelectorAll("[data-reject-password-request]").forEach((b)=>b.onclick=()=>confirmAction("رفض طلب إعادة تعيين كلمة المرور؟",async()=>{await api(`/enhancements/password-requests/${b.dataset.rejectPasswordRequest}`,{method:"PUT",body:JSON.stringify({status:"rejected",note:"رفض بواسطة المعلمة"})});toast("تم رفض الطلب");renderNotifications();}));
}


function openTeacherPasswordRequest(id){
  openModal(`<h3>إعادة تعيين كلمة المرور</h3><p class="safe-note">لن تظهر كلمة المرور القديمة. ضعي كلمة مؤقتة وأخبري صاحبة الحساب بتغييرها بعد الدخول.</p><label class="field">كلمة المرور الجديدة<input id="teacherResetNewPassword" type="password" minlength="10" placeholder="10 أحرف على الأقل وحرف ورقم"></label><div class="modal-actions"><button class="btn btn-outline" id="cancelTeacherReset">إلغاء</button><button class="btn btn-primary" id="saveTeacherReset">حفظ</button></div>`);
  document.getElementById("cancelTeacherReset").onclick=closeModal;
  document.getElementById("saveTeacherReset").onclick=async()=>{try{await api(`/enhancements/password-requests/${id}`,{method:"PUT",body:JSON.stringify({status:"resolved",newPassword:document.getElementById("teacherResetNewPassword").value})});toast("تمت إعادة تعيين كلمة المرور");closeModal();renderNotifications();}catch(error){toast(error.message)}};
}

async function renderHelpCenter() {
  const help = [
    ["🚀","ابدئي من هنا","أضيفي الفصول ثم الطالبات، أنشئي اختبارًا تشخيصيًا، وبعد النتائج افتحي التقارير والخطط العلاجية."],
    ["🎓","إدارة الطالبات","من قائمة الطالبات يمكنكِ البحث والتصفية وفتح الملف الموحد وإدارة الحضور والواجبات والنتائج."],
    ["📝","الاختبارات","أنشئي اختبارًا أو استوردي الأسئلة، حددي الفصل وموعد النشر، ثم تابعي المحاولات والتحليل."],
    ["🩺","الخطة العلاجية","اضغطي توليد خطة تلقائية لتحديد المهارات الأقل من ٧٠٪ واقتراح نشاط ثم إعادة القياس."],
    ["👪","ولي الأمر","اعتمدي طلبات الحساب، اربطي البنات، انشري في مجمع مدار وأرسلي ملاحظات خاصة عند الحاجة."],
    ["🔐","الأمان والخصوصية","لا تشاركي كلمات المرور، استخدمي التعطيل بدل الحذف، واحتفظي بنسخ احتياطية منتظمة."],
  ];
  contentEl.innerHTML = `<section class="card"><div class="smart-section-head"><div><h3>مركز مساعدة مدار</h3><p style="margin:4px 0 0;color:var(--muted);font-size:.78rem">إرشادات مختصرة داخل النظام دون التأثير على بياناتك.</p></div><button class="btn btn-primary btn-sm" id="startGuide">جولة تعريفية</button></div><div class="help-grid">${help.map(([icon,title,text]) => `<article class="help-card"><span style="font-size:2rem">${icon}</span><h3>${title}</h3><p>${text}</p></article>`).join("")}</div></section><section class="card smart-section"><h3 class="section-title">خطوات العمل المقترحة</h3><ol class="help-steps"><li>إعداد بيانات المدرسة والعام الدراسي.</li><li>إضافة الفصول والطالبات وربط أولياء الأمور.</li><li>نشر اختبار تشخيصي.</li><li>مراجعة تحليل المهارات.</li><li>إنشاء خطة علاجية ومورد مناسب.</li><li>إعادة القياس وإرسال التقرير لولي الأمر.</li></ol><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn btn-outline" href="/privacy.html" target="_blank">سياسة الخصوصية</a><a class="btn btn-outline" href="/terms.html" target="_blank">شروط الاستخدام</a></div></section>`;
  document.getElementById("startGuide").onclick = () => openModal(`<h3>جولة منصة مدار</h3><ol class="help-steps"><li><strong>البحث الشامل:</strong> استخدمي مربع البحث أعلى الصفحة أو ⌘ K.</li><li><strong>ملف الطالبة:</strong> اضغطي اسم الطالبة لمشاهدة كل بياناتها.</li><li><strong>التقارير الذكية:</strong> تعرض المتعثرات وأضعف المهارات تلقائيًا.</li><li><strong>التنبيهات:</strong> تابعي الاختبارات القريبة والواجبات المتأخرة.</li><li><strong>التقويم:</strong> انشري المواعيد للفصل وولي الأمر.</li></ol><div class="modal-actions"><button class="btn btn-primary" id="finishGuide">تم</button></div>`); document.getElementById("finishGuide").onclick = () => { localStorage.setItem("madar-guide-seen","1"); closeModal(); };
}

async function openStudentProfile(id) {
  const data = await api(`/enhancements/student/${id}/overview`);
  const { student, summary } = data;
  const tabs = [["summary","الملخص"],["tests","الاختبارات والمهارات"],["follow","الحضور والواجبات"],["points","النقاط والملفات"],["remedial","الخطة العلاجية"],["family","ولي الأمر والتواصل"],["notes","الملاحظات"]];
  const rows = (items, empty, render) => items?.length ? items.map(render).join("") : `<div class="empty-state" style="min-height:100px">${empty}</div>`;
  openModal(`<div class="user-detail-head"><div><span class="role-chip role-student">ملف موحد</span><h3>${escapeHtml(student.name)}</h3><p>${escapeHtml(student.email)} · ${escapeHtml(student.class_name)} · ${escapeHtml(student.stage)} · ${escapeHtml(student.grade_label)}</p></div><button class="btn btn-outline btn-sm" id="closeUnifiedProfile">إغلاق</button></div><div class="enhancement-grid" style="margin:16px 0"><article class="enhancement-card"><small>متوسط الاختبارات</small><strong>${summary.testAverage}٪</strong></article><article class="enhancement-card"><small>الحضور</small><strong>${summary.attendanceRate}٪</strong></article><article class="enhancement-card"><small>المهارات الضعيفة</small><strong>${summary.weakSkills}</strong></article><article class="enhancement-card"><small>نقاط التحفيز</small><strong>${summary.points}</strong></article></div><div class="profile-tabbar">${tabs.map(([key,label],i) => `<button class="btn ${i===0?"btn-primary":"btn-outline"} btn-sm" data-profile-tab="${key}">${label}</button>`).join("")}</div>
  <section class="profile-section" data-profile-section="summary"><div class="content-grid-two"><div class="card"><h3 class="section-title">بيانات الطالبة</h3><div class="info-list"><div class="info-row"><span>المرحلة والصف</span><strong>${escapeHtml(student.stage)} · ${escapeHtml(student.grade_label)}</strong></div><div class="info-row"><span>الفصل</span><strong>${escapeHtml(student.class_name)}</strong></div><div class="info-row"><span>نمط التعلم</span><strong>${escapeHtml(student.learning_style || "غير محدد")}</strong></div><div class="info-row"><span>آخر نشاط</span><strong>${formatDate(student.last_active)}</strong></div></div></div><div class="card"><h3 class="section-title">متابعة سريعة</h3><div class="info-list"><div class="info-row"><span>الواجبات المكتملة</span><strong>${summary.assignmentsCompleted}/${summary.assignmentsTotal}</strong></div><div class="info-row"><span>التقدم العام</span><strong>${student.progress_percent}٪</strong></div><div class="info-row"><span>الحالة</span><strong>${escapeHtml(student.status)}</strong></div></div></div></div></section>
  <section class="profile-section" data-profile-section="tests" hidden><h3 class="section-title">الاختبارات</h3>${rows(data.results,"لا توجد نتائج بعد.",(r)=>`<div class="skill-pill"><span>${escapeHtml(r.title)}<small class="cell-sub">${formatDate(r.submitted_at)}</small></span><span class="badge ${progressColorBadge(Number(r.percentage||0))}">${Number(r.percentage||0)}٪</span></div>`)}<h3 class="section-title" style="margin-top:16px">المهارات</h3>${rows(data.skills,"لا توجد بيانات مهارات.",(r)=>`<div class="skill-pill"><span>${escapeHtml(r.name)}</span><span class="badge ${progressColorBadge(Number(r.mastery_percent))}">${Number(r.mastery_percent)}٪</span></div>`)}</section>
  <section class="profile-section" data-profile-section="follow" hidden><div class="content-grid-two"><div><h3 class="section-title">الحضور</h3>${rows(data.attendance,"لا توجد سجلات حضور.",(r)=>`<div class="skill-pill"><span>${escapeHtml(r.date)}</span><strong>${escapeHtml(r.status)}</strong></div>`)}</div><div><h3 class="section-title">الواجبات</h3>${rows(data.assignments,"لا توجد واجبات.",(r)=>`<div class="skill-pill"><span>${escapeHtml(r.title)}</span><strong>${escapeHtml(r.status)}</strong></div>`)}</div></div></section>
  <section class="profile-section" data-profile-section="points" hidden><h3 class="section-title">سجل النقاط</h3>${rows(data.points,"لا توجد نقاط.",(r)=>`<div class="skill-pill"><span>${escapeHtml(r.reason)}</span><strong>${Number(r.points)>0?"+":""}${r.points}</strong></div>`)}<h3 class="section-title" style="margin-top:16px">ملفات الإنجاز</h3>${rows(data.files,"لا توجد ملفات.",(r)=>`<div class="skill-pill"><span>${escapeHtml(r.title)}<small class="cell-sub">${escapeHtml(r.original_name)}</small></span><strong>${escapeHtml(r.review_status)}</strong></div>`)}<h3 class="section-title" style="margin-top:16px">نتائج الألعاب التعليمية</h3>${rows(data.gameAttempts||[],"لا توجد محاولات ألعاب.",(r)=>`<div class="skill-pill"><span>${r.game_key==="percentage-challenge"?"تحدي النسبة المئوية":escapeHtml(r.game_key)}<small class="cell-sub">${escapeHtml(r.difficulty)} · ${formatDate(r.played_at)}</small></span><strong>${Number(r.accuracy||0)}٪</strong></div>`)}</section>
  <section class="profile-section" data-profile-section="remedial" hidden><div class="smart-section-head"><h3>الخطط العلاجية</h3><button class="btn btn-primary btn-sm" id="profileAutoPlan">توليد تلقائي</button></div>${rows(data.plans,"لا توجد خطة علاجية.",(r)=>`<div class="profile-plan-row"><strong>${escapeHtml(r.skill_name || r.title)}</strong><small class="cell-sub">قبل ${r.before_percent}٪ · الهدف ${r.target_percent}٪ · ${statusLabel(r.status)}</small><p>${escapeHtml(r.recommended_activity || "")}</p></div>`)}</section>
  <section class="profile-section" data-profile-section="family" hidden><h3 class="section-title">أولياء الأمور المرتبطون</h3>${rows(data.parents,"لا يوجد ولي أمر مرتبط.",(r)=>`<div class="profile-parent-row"><strong>${escapeHtml(r.name)}</strong><small class="cell-sub">${escapeHtml(r.relation_label)} · ${escapeHtml(r.status)}</small>${r.status==="active"?`<button class="btn btn-outline btn-sm" data-message-parent="${r.id}">إرسال ملاحظة</button>`:""}</div>`)}<h3 class="section-title" style="margin-top:16px">سجل التواصل</h3>${rows(data.messages,"لا توجد رسائل.",(r)=>`<div class="profile-message-row"><strong>${escapeHtml(r.subject)}</strong><small class="cell-sub">${escapeHtml(r.parent_name)} · ${formatDate(r.created_at)} · ${r.sender_role==="teacher"?"من المعلمة":"من ولي الأمر"}</small><p>${escapeHtml(r.body)}</p></div>`)}</section>
  <section class="profile-section" data-profile-section="notes" hidden><h3 class="section-title">الملاحظات</h3>${rows(data.notes,"لا توجد ملاحظات.",(r)=>`<div class="skill-pill" style="display:block"><p>${escapeHtml(r.content)}</p><small>${formatDate(r.created_at)}</small></div>`)}<label class="field">ملاحظة جديدة<textarea id="unifiedNote"></textarea></label><button class="btn btn-primary btn-sm" id="saveUnifiedNote">إضافة الملاحظة</button></section>
  <div class="modal-actions"><a class="btn btn-outline" href="/api/teacher/reports/student/${student.id}.pdf" target="_blank">طباعة ملف الطالبة</a></div>`, "student-profile-wide");
  document.getElementById("closeUnifiedProfile").onclick = closeModal;
  document.querySelectorAll("[data-profile-tab]").forEach((button) => button.onclick = () => { document.querySelectorAll("[data-profile-tab]").forEach((b)=>b.className="btn btn-outline btn-sm"); button.className="btn btn-primary btn-sm"; document.querySelectorAll("[data-profile-section]").forEach((section)=>section.hidden=section.dataset.profileSection!==button.dataset.profileTab); });
  document.getElementById("profileAutoPlan").onclick = async () => { const result = await api("/enhancements/remedial/auto", { method:"POST", body:JSON.stringify({studentId:id,threshold:70}) }); toast(`تم إنشاء ${result.created} خطة.`); openStudentProfile(id); };
  document.querySelectorAll("[data-message-parent]").forEach((button) => button.onclick = () => openParentPrivateMessageModal(Number(button.dataset.messageParent), id, student.name));
  document.getElementById("saveUnifiedNote").onclick = async () => { const content=document.getElementById("unifiedNote").value.trim(); if(!content)return toast("اكتبي الملاحظة."); await api(`/students/${id}/notes`,{method:"POST",body:JSON.stringify({content})});toast("تمت إضافة الملاحظة.");openStudentProfile(id); };
}

function openParentPrivateMessageModal(parentId, studentId, studentName) {
  openModal(`<h3>إرسال ملاحظة لولي الأمر</h3><p>بخصوص الطالبة: <strong>${escapeHtml(studentName)}</strong></p><label class="field">العنوان<input id="privateMessageSubject" placeholder="مثال: متابعة مستوى الطالبة"></label><label class="field">الرسالة<textarea id="privateMessageBody" placeholder="اكتبي ملاحظة مدرسية واضحة"></textarea></label><div class="modal-actions"><button class="btn btn-outline" id="cancelPrivateMessage">إلغاء</button><button class="btn btn-primary" id="sendPrivateMessage">إرسال</button></div>`);
  document.getElementById("cancelPrivateMessage").onclick = closeModal;
  document.getElementById("sendPrivateMessage").onclick = async () => { await api("/enhancements/messages", { method:"POST", body:JSON.stringify({parentId,studentId,subject:document.getElementById("privateMessageSubject").value,body:document.getElementById("privateMessageBody").value}) });closeModal();toast("تم إرسال الرسالة لولي الأمر."); };
}

// ==========================================================================
const ROUTES = {
  home: renderHome,
  profile: renderProfile,
  portfolio: renderPortfolio,
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
  "parent-panel": () => renderParentPanel().catch((error) => { contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`; }),
  "remedial-plans": renderRemedialPlans,
  calendar: renderCalendar,
  reports: renderReports,
  "help-center": renderHelpCenter,
  notifications: renderNotifications,
  classes: renderClasses,
  activity: renderActivity,
  settings: renderSettings,
};

boot();
