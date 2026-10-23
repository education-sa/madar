import { createStudentLiveCompetitions } from "./live-competitions.js?v=3";

const content = document.getElementById("studentContent");
const modalRoot = document.getElementById("studentModal");
const toastRoot = document.getElementById("studentToast");
let csrf = sessionStorage.getItem("madar-csrf") || "";
let me = null;
let examTimer = null;
let studentKnowledgeCategory = "worksheet";
let portfolioSection = "add";

const styleLabels = {
  visual: "بصري",
  auditory: "سمعي",
  reading_writing: "قرائي/كتابي",
  kinesthetic: "حركي/تطبيقي",
  mixed: "مختلط",
  unknown: "غير محدد",
};

const studentLearningMeta = {
  visual: { label: "بصري", css: "visual", color: "#7451cf", tip: "الخرائط الذهنية والألوان والرسوم والمخططات تساعدكِ على الفهم والتذكّر." },
  auditory: { label: "سمعي", css: "auditory", color: "#e39a51", tip: "الشرح الشفهي والحوار والتفكير بصوت مرتفع يساعدكِ على تثبيت الفكرة." },
  reading_writing: { label: "قرائي/كتابي", css: "reading", color: "#4d9188", tip: "قراءة الخطوات وكتابة الملخصات والقوائم المرتبة تناسبكِ غالبًا." },
  kinesthetic: { label: "حركي/تطبيقي", css: "kinesthetic", color: "#ca6b8a", tip: "التجربة والنماذج والأنشطة العملية والتطبيق الواقعي تقرّب لكِ الفكرة." },
  mixed: { label: "مختلط", css: "mixed", color: "#998dac", tip: "لديكِ تفضيلات متوازنة تمنحكِ مرونة في التعلم بأكثر من طريقة." },
  unknown: { label: "غير محدد", css: "unknown", color: "#b8afc5", tip: "أكملي الاستبانة لتتعرفي على تفضيلاتكِ الأقرب." },
};

function studentLearningStyleMeta(style) {
  return studentLearningMeta[style] || studentLearningMeta.unknown;
}

const pointSectionMeta = {
  all: { label: "نقاطي", icon: "✨" },
  motivation: { label: "نقاط تحفيزية", icon: "🏆" },
  grade: { label: "سجل الدرجات", icon: "📝" },
  homework: { label: "واجباتي", icon: "📖" },
  participation: { label: "مشاركاتي", icon: "🙋‍♀️" },
  attendance: { label: "حضوري", icon: "🗓️" },
  task: { label: "مهامي", icon: "📚" },
  games: { label: "الألعاب", icon: "🎮" },
  weakness: { label: "نقاط الضعف", icon: "⚠️" },
};

const portfolioCategoryMeta = {
  homework: { label: "واجب", icon: "📖" },
  worksheet: { label: "ورقة عمل", icon: "📝" },
  task: { label: "مهمة", icon: "📌" },
  project: { label: "مشروع", icon: "🏗️" },
  achievement_image: { label: "صورة إنجاز", icon: "🖼️" },
  other: { label: "ملف آخر", icon: "📎" },
};

const portfolioReviewMeta = {
  pending: { label: "بانتظار المراجعة", icon: "⏳" },
  approved: { label: "تم الاعتماد", icon: "✅" },
  needs_revision: { label: "يحتاج تعديل", icon: "✏️" },
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const studentLiveCompetitions = createStudentLiveCompetitions({
  api,
  esc,
  toast,
  content,
  showGames: () => games().catch(errorView),
  isGamesActive: () => document.querySelector('.student-nav-button[data-view="games"]')?.classList.contains("active") === true,
});

function studentSafeResourceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, window.location.origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (raw.startsWith("/") && !raw.startsWith("//")) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.href;
  } catch (_) { return ""; }
}

const MADAR_ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const MADAR_OPTION_LABELS = ["أ", "ب", "جـ", "د"];

function studentUsesArabicMath(stage = me?.stage) {
  const value = String(stage || "").trim();
  return value.includes("ابتدائ") || value.includes("متوسط");
}

function studentArabicNumber(value, stage = me?.stage) {
  const text = String(value ?? "");
  if (!studentUsesArabicMath(stage)) return text;
  return text.replace(/\d/g, (digit) => MADAR_ARABIC_DIGITS[Number(digit)]);
}

function studentMathDisplay(value, stage = me?.stage) {
  let text = String(value ?? "");
  if (!studentUsesArabicMath(stage)) return text;

  // تعريب الرموز وفق أسلوب كتب الرياضيات للابتدائي والمتوسط، مع إبقاء
  // القيمة الأصلية المرسلة إلى الخادم دون تغيير.
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

  return studentArabicNumber(text, stage);
}

function studentMathHtml(value, stage = me?.stage) {
  const localized = studentMathDisplay(value, stage);
  const safe = esc(localized);
  if (!studentUsesArabicMath(stage)) return safe;
  return safe.replace(/([\p{L}\p{N})])\^([٠-٩0-9]+)/gu, "$1<sup>$2</sup>");
}

function stripStudentOptionLabel(option) {
  return String(option ?? "").replace(/^\s*(?:[A-Da-d]|أ|ا|ب|جـ?|د)\s*(?:[).:]\s*|-\s+)/u, "");
}

function studentQuestionMarkup(question, index, stage = me?.stage) {
  const questionNumber = studentArabicNumber(index + 1, stage);
  let answers = "";
  if (question.type === "mcq") {
    answers = (question.options || []).map((option, optionIndex) =>
      `<label class="exam-option"><input required type="radio" name="q${question.id}" value="${esc(option)}" aria-describedby="examQuestionError${index}"><span class="exam-option-letter" aria-hidden="true">${MADAR_OPTION_LABELS[optionIndex] || studentArabicNumber(optionIndex + 1, stage)}</span><span>${studentMathHtml(stripStudentOptionLabel(option), stage)}</span></label>`
    ).join("");
  } else if (question.type === "true_false") {
    answers = ["صح", "خطأ"].map((option, optionIndex) =>
      `<label class="exam-option"><input required type="radio" name="q${question.id}" value="${option}" aria-describedby="examQuestionError${index}"><span class="exam-option-letter" aria-hidden="true">${MADAR_OPTION_LABELS[optionIndex]}</span><span>${option}</span></label>`
    ).join("");
  } else {
    answers = `<label class="exam-short-answer"><span>إجابتكِ</span><input required type="text" name="q${question.id}" placeholder="اكتبي الإجابة بالأرقام والرموز العربية" autocomplete="off" aria-describedby="examQuestionError${index}"></label>`;
  }
  return `<section class="question exam-question${index === 0 ? " is-active" : ""}" data-exam-question="${index}"${index === 0 ? "" : " hidden"} aria-labelledby="examQuestionTitle${index}">
    <div class="exam-question-kicker"><span>السؤال ${questionNumber}</span><small>اختاري الإجابة ثم تابعي الجولة</small></div>
    <h3 id="examQuestionTitle${index}" tabindex="-1">${studentMathHtml(question.question_text, stage)}</h3>
    <div class="exam-answer-list">${answers}</div>
    <p class="exam-question-error" id="examQuestionError${index}" role="alert" hidden></p>
  </section>`;
}

function studentDate(value) {
  const date = new Date(String(value || "").replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? String(value || "—") : date.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const method = (options.method || "GET").toUpperCase();
  const response = await fetch(`/api/student${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(method !== "GET" && csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.href = "/login.html?role=student";
    throw new Error("unauthorized");
  }
  if (!response.ok) throw new Error(data.error || "حدث خطأ");
  if (data.csrfToken) {
    csrf = data.csrfToken;
    sessionStorage.setItem("madar-csrf", csrf);
  }
  return data;
}

function toast(message) {
  toastRoot.textContent = message;
  toastRoot.classList.add("show");
  setTimeout(() => toastRoot.classList.remove("show"), 2600);
}

function closeStudentAnnouncement(storageKey = "") {
  if (storageKey) sessionStorage.setItem(storageKey, "1");
  modalRoot.innerHTML = "";
  document.body.classList.remove("student-announcement-open");
}

async function showCurrentAnnouncement() {
  const data = await api("/announcements/current");
  const announcement = data?.announcement;
  if (!announcement || modalRoot.innerHTML.trim()) return;
  const sessionMarker = String(csrf || "session").slice(0, 24);
  const publicationMarker = String(announcement.publishedAt || announcement.id).replace(/\s+/g, "-");
  const storageKey = `madar-announcement-seen:${announcement.id}:${publicationMarker}:${sessionMarker}`;
  if (sessionStorage.getItem(storageKey) === "1") return;
  const displaySize = ["small","medium","large"].includes(announcement.displaySize) ? announcement.displaySize : "auto";
  modalRoot.innerHTML = `<div class="modal-overlay student-announcement-overlay" role="presentation">
    <article class="student-announcement-dialog size-${displaySize}" role="dialog" aria-modal="true" aria-labelledby="studentAnnouncementTitle">
      <button class="student-announcement-close" type="button" aria-label="إغلاق الإعلان">×</button>
      <div class="student-announcement-header"><span aria-hidden="true">✦</span><div><small>رسالة جديدة</small><h2 id="studentAnnouncementTitle">إعلان من معلمتكِ</h2></div></div>
      ${announcement.imageUrl ? `<img src="${esc(announcement.imageUrl)}" alt="صورة الإعلان" />` : ""}
      ${announcement.body ? `<p>${esc(announcement.body)}</p>` : ""}
    </article>
  </div>`;
  document.body.classList.add("student-announcement-open");
  const closeButton = modalRoot.querySelector(".student-announcement-close");
  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    closeStudentAnnouncement(storageKey);
  };
  const onKeydown = (event) => { if (event.key === "Escape") close(); };
  closeButton.onclick = close;
  document.addEventListener("keydown", onKeydown);
  closeButton.focus();
}

function setActive(view) {
  if (view !== "games") studentLiveCompetitions.stop();
  const buttons = [...document.querySelectorAll("[data-view]")];
  buttons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const activeButton = buttons.find((button) => button.dataset.view === view);
  const pageTitle = document.getElementById("studentPageTitle");
  if (pageTitle && activeButton) pageTitle.textContent = activeButton.dataset.title || "لوحة الطالبة";
}

function errorView(error) {
  if (error.message !== "unauthorized") content.innerHTML = `<div class="card form-error">${esc(error.message)}</div>`;
}

async function home() {
  setActive("home");
  const data = await api("/dashboard");
  const now = new Date();
  const studentDetails = [data.student.class_name, data.student.grade_label || data.student.stage].filter(Boolean).join(" · ");
  content.innerHTML = `
    <section class="student-home-intro">
      <div class="student-home-copy">
        <span class="student-home-kicker">ملفي الدراسي</span>
        <h1>أهلًا ${esc(data.student.name)} 👋</h1>
        <p>${esc(studentDetails || "مرحبًا بكِ في منصة مدار")}</p>
        <span class="student-learning-chip">🎨 نمط تعلّمي: ${styleLabels[data.student.learning_style] || "غير محدد"}</span>
      </div>
      <time class="student-dashboard-date" datetime="${now.toISOString()}">
        <strong>${now.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong>
        <span>${now.toLocaleTimeString("ar-SA", { hour: "numeric", minute: "2-digit" })}</span>
      </time>
    </section>

    <section class="student-stat-grid" aria-label="ملخص مستواي الدراسي">
      <button class="student-stat-card tests" type="button" data-home-view="tests">
        <span class="student-stat-icon" aria-hidden="true">📝</span><span class="student-stat-copy"><b>اختبارات متاحة</b><strong>${data.available}</strong><small>ابدئي الاختبار من هنا</small></span><span class="student-stat-arrow" aria-hidden="true">←</span>
      </button>
      <button class="student-stat-card completed" type="button" data-home-view="results">
        <span class="student-stat-icon" aria-hidden="true">📋</span><span class="student-stat-copy"><b>اختبارات منجزة</b><strong>${data.completed}</strong><small>راجعي نتائجكِ</small></span><span class="student-stat-arrow" aria-hidden="true">←</span>
      </button>
      <button class="student-stat-card points" type="button" data-home-view="points">
        <span class="student-stat-icon" aria-hidden="true">🪙</span><span class="student-stat-copy"><b>نقاط مدار</b><strong>${Number(data.totalPoints || 0)}</strong><small>من سجلاتي وإنجازاتي</small></span><span class="student-stat-arrow" aria-hidden="true">←</span>
      </button>
      <button class="student-stat-card progress-card" type="button" data-home-view="results">
        <span class="student-stat-icon" aria-hidden="true">🧭</span><span class="student-stat-copy"><b>تقارير التقدم</b><strong>${Number(data.student.progress_percent || 0).toFixed(0)}%</strong><small>تقدمي العام</small></span><span class="student-stat-arrow" aria-hidden="true">←</span>
      </button>
    </section>

    <section class="student-dashboard-grid">
      <article class="student-dashboard-panel results-panel">
        <header><span aria-hidden="true">🏆</span><div><h2>آخر النتائج والشهادات</h2><p>أحدث إنجازاتكِ الدراسية</p></div></header>
        <div class="student-panel-body">${data.recent.length ? data.recent.map((row) => `<div class="student-result-row"><div><h3>${esc(row.title)}</h3><p>${studentDate(row.submitted_at)}</p></div><strong>${Number(row.percentage || 0).toFixed(0)}%</strong></div>`).join("") : '<div class="student-empty-state"><span>🏅</span><strong>لا توجد نتائج بعد</strong><p>ابدئي اختباركِ الأول وستظهر نتيجتكِ هنا.</p></div>'}</div>
        <button class="student-panel-action" type="button" data-home-view="results">شاهدي جميع النتائج</button>
      </article>

      <article class="student-dashboard-panel skills-panel">
        <header><span aria-hidden="true">⚙️</span><div><h2>إتقان المهارات</h2><p>تقدمكِ في المهارات الرياضية</p></div></header>
        <div class="student-panel-body">${data.skills.length ? data.skills.map((skill) => {
          const mastery = Math.max(0, Math.min(100, Number(skill.mastery_percent || 0)));
          return `<div class="student-skill-row"><div><strong>${esc(skill.name)}</strong><span>${mastery.toFixed(0)}%</span></div><div class="student-skill-progress"><i style="width:${mastery}%"></i></div></div>`;
        }).join("") : '<div class="student-empty-state"><span>🗝️</span><strong>ابدئي رحلتكِ</strong><p>حلّي اختبارًا لتظهر مهاراتكِ ومستوى إتقانكِ.</p></div>'}</div>
        <button class="student-panel-action" type="button" data-home-view="tests">ابدئي اختبارًا جديدًا</button>
      </article>
    </section>`;

  content.querySelectorAll("[data-home-view]").forEach((button) => {
    button.onclick = () => {
      const view = button.dataset.homeView;
      sessionStorage.setItem("madar-student-view", view);
      views[view]().catch(errorView);
    };
  });
}

async function tests() {
  setActive("tests");
  const rows = await api("/tests");
  const stage = me?.stage || "";
  content.innerHTML = `<div class="card"><h2>اختباراتي المتاحة</h2><div class="test-list">${rows.length ? rows.map((test) => `
    <article class="test-row"><div><h3>${esc(test.title)}</h3><p>${studentArabicNumber(test.question_count, stage)} أسئلة · ${Number(test.duration_minutes) === 0 ? "بدون وقت" : `${studentArabicNumber(test.duration_minutes, stage)} دقيقة`} · المحاولات ${studentArabicNumber(test.attempts_used, stage)}/${studentArabicNumber(test.max_attempts, stage)}</p></div>
    <button class="primary-button" data-test="${test.id}" ${Number(test.attempts_used) >= Number(test.max_attempts) && Number(test.active_attempt) === 0 ? "disabled" : ""}>${Number(test.active_attempt) ? "استكمال المحاولة" : "بدء الاختبار"}</button></article>`).join("") : "<p>لا توجد اختبارات متاحة الآن.</p>"}</div></div>`;
  content.querySelectorAll("[data-test]").forEach((button) => { button.onclick = () => openTest(button.dataset.test); });
}

const paperSubmissionMeta = {
  not_registered: { label: "لم تسجلي", css: "not-registered" },
  draft: { label: "مسودة", css: "draft" },
  submitted: { label: "بانتظار اعتماد المعلمة", css: "submitted" },
  approved: { label: "معتمدة", css: "approved" },
  returned: { label: "معادة للتعديل", css: "returned" },
};

function paperFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} بايت`;
  if (size < 1048576) return `${(size / 1024).toFixed(1)} ك.ب`;
  return `${(size / 1048576).toFixed(1)} م.ب`;
}

function paperScoreSummary(questions, answers, threshold) {
  const possible = questions.reduce((sum, question) => sum + (Number(question.maxPoints) || 0), 0);
  let earned = 0; let complete = true; let invalid = false;
  questions.forEach((question) => {
    const value = Object.prototype.hasOwnProperty.call(answers, String(question.id)) && answers[String(question.id)] !== "" ? Number(answers[String(question.id)]) : null;
    const valid = value !== null && Number.isFinite(value) && value >= 0 && value <= Number(question.maxPoints);
    if (!valid) { complete = false; if (value !== null) invalid = true; }
    else earned += value;
  });
  const scorePercent = possible > 0 ? Math.max(0, Math.min(100, earned / possible * 100)) : 0;
  return { earned, possible, percent:scorePercent, complete, invalid, mastered:complete && scorePercent >= Number(threshold || 80) };
}

async function paperAssessments() {
  setActive("paper-assessments");
  const data = await api("/paper-assessments");
  if (!data.migrationReady) {
    content.innerHTML = `<section class="student-paper-empty"><span>📝</span><h2>الاختبارات الورقية غير مفعلة بعد</h2><p>تحتاج المعلمة تشغيل ملف ${esc(data.migrationFile || "migration_20260810_paper_assessments.sql")} مرة واحدة.</p></section>`;
    return;
  }
  const items = Array.isArray(data.assessments) ? data.assessments : [];
  content.innerHTML = `<section class="student-paper-hero"><div><small>نتائج أوراقكِ داخل مدار</small><h1>الاختبارات الورقية</h1><p>أدخلي درجات الورقة المصححة، احفظيها كمسودة، ثم سلّميها لاعتماد المعلمة.</p></div><span aria-hidden="true">📝</span></section>
    <section class="student-paper-list">${items.length ? items.map((item) => {
      const meta = paperSubmissionMeta[item.submissionStatus] || paperSubmissionMeta.not_registered;
      const action = item.canEdit ? (item.submissionStatus === "not_registered" ? "بدء التسجيل" : "متابعة التسجيل") : "عرض النتيجة";
      return `<article class="student-paper-card"><div class="student-paper-card-head"><span>${esc(item.testTypeLabel)}</span><b class="paper-student-status ${meta.css}">${esc(meta.label)}</b></div><h2>${esc(item.title)}</h2><p>${esc(item.subject || "مادة الرياضيات")} · ${studentArabicNumber(item.questionCount,me?.stage)} أسئلة · العتبة ${studentArabicNumber(item.threshold,me?.stage)}٪</p><dl><div><dt>تاريخ الاختبار</dt><dd>${esc(item.assessmentDate)}</dd></div><div><dt>التسجيل</dt><dd>${esc(item.windowMessage)}</dd></div></dl>${item.returnNote ? `<div class="student-paper-return-note"><strong>ملاحظة المعلمة:</strong> ${esc(item.returnNote)}</div>` : ""}<button class="primary-button" data-paper-assessment="${item.id}">${action}</button></article>`;
    }).join("") : '<div class="student-paper-empty"><span>📄</span><h2>لا توجد اختبارات ورقية الآن</h2><p>ستظهر هنا عندما تنشر المعلمة اختبارًا لفصلكِ.</p></div>'}</section>`;
  content.querySelectorAll("[data-paper-assessment]").forEach((button) => { button.onclick = () => openPaperAssessment(button.dataset.paperAssessment); });
}

async function openPaperAssessment(id) {
  try {
    const data = await api(`/paper-assessments/${id}`);
    const assessment = data.assessment;
    const submission = data.submission;
    const meta = paperSubmissionMeta[submission?.status || "not_registered"] || paperSubmissionMeta.not_registered;
    const answers = data.answers || {};
    const editable = Boolean(data.canEdit);
    content.innerHTML = `<section class="student-paper-hero compact"><div><small>${esc(assessment.testTypeLabel)}</small><h1>${esc(assessment.title)}</h1><p>${esc(assessment.subject || "مادة الرياضيات")} · ${esc(assessment.className)} · عتبة الإتقان ${studentArabicNumber(assessment.threshold,me?.stage)}٪</p></div><b class="paper-student-status ${meta.css}">${esc(meta.label)}</b></section>
      ${submission?.returnNote ? `<div class="student-paper-return-note"><strong>أعادتها المعلمة للتعديل:</strong> ${esc(submission.returnNote)}</div>` : ""}
      ${assessment.instructions ? `<section class="student-paper-instructions"><strong>تعليمات المعلمة</strong><p>${esc(assessment.instructions)}</p></section>` : ""}
      ${submission?.status === "submitted" ? '<section class="student-paper-review-note"><strong>النتيجة بانتظار اعتماد المعلمة</strong><p>حُفظت الدرجات وقُفل التعديل. سيظهر تحليل المهارات بعد مراجعة المعلمة واعتماد النتيجة.</p></section>' : ""}
      <form class="student-paper-form" id="paperAssessmentForm"><div class="student-paper-questions">${data.questions.map((question,index) => {
        const current = Object.prototype.hasOwnProperty.call(answers,String(question.id)) ? answers[String(question.id)] : "";
        return `<article><header><span>السؤال ${studentArabicNumber(question.number || index + 1,me?.stage)}</span><b>${esc(question.skillName)}</b></header>${question.text ? `<p>${esc(question.text)}</p>` : ""}<label><span>درجتي</span><div><input type="number" inputmode="decimal" min="0" max="${question.maxPoints}" step="0.01" data-paper-answer="${question.id}" value="${esc(current)}" aria-label="درجتي في السؤال ${esc(question.number || index+1)} من ${studentArabicNumber(question.maxPoints,me?.stage)}" ${editable ? "" : "disabled"}><strong>من ${studentArabicNumber(question.maxPoints,me?.stage)}</strong></div></label><small class="student-paper-field-error" data-paper-error="${question.id}" aria-live="polite"></small></article>`;
      }).join("")}</div>
      <section class="student-paper-score" data-paper-score aria-live="polite"></section>
      <section class="student-paper-files"><div><h2>صورة ورقة الاختبار <small>اختيارية</small></h2><p>يمكن رفع صور أو PDF، وبحد أقصى خمسة ملفات.</p></div>${editable ? '<label class="student-paper-file-picker"><input type="file" name="files[]" accept="application/pdf,image/jpeg,image/png,image/webp" multiple><span>＋</span><b>اختيار الملفات</b></label>' : ""}<div class="student-paper-file-list">${data.files.length ? data.files.map((file) => `<article><a href="${file.url}" target="_blank" rel="noopener">${esc(file.name)}</a><span>${paperFileSize(file.sizeBytes)}</span>${editable ? `<button type="button" data-paper-file-delete="${file.id}">حذف</button>` : ""}</article>`).join("") : '<p>لم تُرفق صورة.</p>'}</div></section>
      ${submission?.status === "approved" && data.skillResults?.length ? `<section class="student-paper-results"><h2>نتيجتكِ حسب المهارة</h2>${data.skillResults.map((skill) => `<article><div><strong>${esc(skill.skillName)}</strong><span>${studentArabicNumber(skill.earned,me?.stage)} من ${studentArabicNumber(skill.possible,me?.stage)}</span></div><div class="student-paper-progress"><i style="width:${skill.percent}%"></i><b>${studentArabicNumber(skill.percent,me?.stage)}٪</b></div><small class="${skill.mastered ? "mastered" : "developing"}">${skill.mastered ? "متقنة" : "تحتاج دعمًا"}</small></article>`).join("")}</section>` : ""}
      <div class="student-paper-actions"><button type="button" class="secondary-button" data-paper-back>العودة للقائمة</button>${editable ? '<button type="button" class="secondary-button" data-paper-save>حفظ مسودة</button><button type="submit" class="primary-button">تسليم للمعلمة</button>' : ""}</div></form>`;
    const form = document.getElementById("paperAssessmentForm");
    const answerInputs = [...form.querySelectorAll("[data-paper-answer]")];
    const readAnswerMap = () => Object.fromEntries(answerInputs.map((input) => [String(input.dataset.paperAnswer), input.value]));
    const renderSummary = () => {
      const summary = paperScoreSummary(data.questions, readAnswerMap(), assessment.threshold);
      const status = summary.complete ? (summary.mastered ? "متقنة" : "تحتاج دعمًا") : summary.invalid ? "درجة غير صالحة" : "أكملي الدرجات";
      const score = form.querySelector("[data-paper-score]");
      score.innerHTML = `<div><span>المجموع المبدئي</span><strong>${studentArabicNumber(summary.earned,me?.stage)} <small>من ${studentArabicNumber(summary.possible,me?.stage)}</small></strong></div><div><span>النسبة</span><strong>${summary.complete ? `${studentArabicNumber(summary.percent,me?.stage)}٪` : "—"}</strong></div><div><span>حالة الإتقان</span><strong class="${summary.mastered ? "mastered" : summary.complete ? "developing" : "incomplete"}">${status}</strong></div><div class="student-paper-score-progress"><i style="width:${summary.percent}%"></i><b>عتبة الإتقان ${studentArabicNumber(assessment.threshold,me?.stage)}٪</b></div>`;
    };
    const validateAnswers = (requireComplete = false) => {
      let valid = true;
      answerInputs.forEach((input) => {
        const value = input.value === "" ? null : Number(input.value); const max = Number(input.max);
        const invalid = (requireComplete && value === null) || (value !== null && (!Number.isFinite(value) || value < 0 || value > max));
        input.setCustomValidity(invalid ? (value === null ? "هذه الدرجة مطلوبة قبل التسليم" : `أدخلي درجة من صفر إلى ${max}`) : "");
        input.classList.toggle("is-invalid", invalid);
        const message = form.querySelector(`[data-paper-error="${input.dataset.paperAnswer}"]`); if (message) message.textContent = invalid ? (value === null ? "أدخلي الدرجة" : `الدرجة بين صفر و${studentArabicNumber(max,me?.stage)}`) : "";
        if (invalid && valid) { input.reportValidity(); input.focus(); }
        valid = valid && !invalid;
      });
      return valid;
    };
    answerInputs.forEach((input) => input.addEventListener("input", () => { validateAnswers(false); renderSummary(); }));
    renderSummary();
    content.querySelector("[data-paper-back]").onclick = () => paperAssessments().catch(errorView);
    content.querySelectorAll("[data-paper-file-delete]").forEach((button) => { button.onclick = async () => { if (!confirm("حذف هذا المرفق؟")) return; try { await api(`/paper-assessments/${id}/files/${button.dataset.paperFileDelete}/delete`, { method:"POST", body:"{}" }); toast("تم حذف المرفق"); await openPaperAssessment(id); } catch (error) { toast(error.message); } }; });
    if (!editable) return;
    const collectAnswers = () => answerInputs.map((input) => ({ questionId:Number(input.dataset.paperAnswer), earnedPoints:input.value }));
    async function saveDraft() {
      const payload = new FormData(); payload.append("answers", JSON.stringify(collectAnswers()));
      [...form.querySelector('[name="files[]"]')?.files || []].forEach((file) => payload.append("files[]",file));
      return api(`/paper-assessments/${id}/save`, { method:"POST", body:payload });
    }
    content.querySelector("[data-paper-save]").onclick = async () => { if(!validateAnswers(false))return; try { await saveDraft(); toast("تم حفظ المسودة"); await openPaperAssessment(id); } catch (error) { toast(error.message); } };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!validateAnswers(true)) { toast("أدخلي درجة صحيحة لكل سؤال، ويمكن أن تكون صفرًا"); return; }
      if (!confirm("بعد التسليم ستُقفل النتيجة حتى تعيد المعلمة فتحها. هل تريدين المتابعة؟")) return;
      const submit = form.querySelector('[type="submit"]'); submit.disabled=true; submit.textContent="جارٍ التسليم...";
      try { await saveDraft(); const result=await api(`/paper-assessments/${id}/submit`,{method:"POST",body:"{}"}); toast(result.message||"تم التسليم"); await openPaperAssessment(id); } catch (error) { submit.disabled=false;submit.textContent="تسليم للمعلمة";toast(error.message); }
    };
  } catch (error) { toast(error.message); }
}

function deadlineTimestamp(value) {
  const normalized = String(value || "").replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d\d:\d\d)$/.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}+03:00`).getTime();
}

function startExamTimer(deadline, form, stage = me?.stage) {
  clearInterval(examTimer);
  const timer = document.getElementById("examTimer");
  const tick = () => {
    const remaining = Math.max(0, Math.floor((deadlineTimestamp(deadline) - Date.now()) / 1000));
    timer.textContent = studentArabicNumber(`${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`, stage);
    if (remaining === 0) {
      clearInterval(examTimer);
      form.noValidate = true;
      form.dataset.timedOut = "1";
      form.requestSubmit();
    }
  };
  tick();
  examTimer = setInterval(tick, 1000);
}

function skillResultsMarkup(rows, className = "skill-results-grid", stage = me?.stage) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return `<div class="${className}">${rows.map((item) => `<article class="skill-result-card"><span><b>${esc(item.skillName)}</b>${item.lessonCode ? `<small>رمز الدرس ${esc(studentMathDisplay(item.lessonCode, stage))}</small>` : ""}</span><strong>${studentArabicNumber(Number(item.percentage || 0).toFixed(0), stage)}٪</strong></article>`).join("")}</div>`;
}

async function openTest(id) {
  try {
    const test = await api(`/tests/${id}`);
    const stage = test.stage || me?.stage || "";
    const timedTest = Number(test.durationMinutes) > 0 && Boolean(test.deadlineAt);
    const questionCount = test.questions.length;
    const questionPath = test.questions.map((question, index) => {
      const number = studentArabicNumber(index + 1, stage);
      return `<button type="button" class="exam-question-jump${index === 0 ? " is-current" : ""}" data-question-jump="${index}" aria-label="السؤال ${number}، ${index === 0 ? "الحالي، " : ""}غير مجاب"${index === 0 ? ' aria-current="step"' : ""}>${number}</button>`;
    }).join("");
    modalRoot.innerHTML = `<div class="modal-overlay student-exam-overlay"><form class="modal student-exam" id="examForm" novalidate>
      <div class="exam-heading">
        <div class="exam-heading-copy"><span class="exam-heading-kicker">جولة الاختبار</span><h2>${esc(test.title)}</h2><p>${timedTest ? "يُسلّم الاختبار تلقائيًا عند انتهاء الوقت." : "هذا الاختبار بدون وقت محدد."} <span class="exam-form-number">نموذج رقم ${studentArabicNumber(Number(test.formNumber || 1), stage)}</span></p></div>
        <div class="exam-heading-status"><span id="examQuestionCounter" class="exam-question-counter" aria-live="polite">السؤال ${studentArabicNumber(1, stage)} من ${studentArabicNumber(questionCount, stage)}</span>${timedTest ? '<strong id="examTimer" class="exam-timer" aria-label="الوقت المتبقي">--:--</strong>' : '<strong class="exam-timer is-untimed">بدون وقت</strong>'}</div>
      </div>
      <div class="exam-body">
        <div class="exam-progress-label"><span>تقدّمكِ في الجولة</span><strong id="examProgressText">${studentArabicNumber(1, stage)} / ${studentArabicNumber(questionCount, stage)}</strong></div>
        <div class="exam-progress" role="progressbar" aria-label="التقدم في أسئلة الاختبار" aria-valuemin="1" aria-valuemax="${questionCount}" aria-valuenow="1"><span id="examProgressBar" style="width:${questionCount ? 100 / questionCount : 0}%"></span></div>
        <div class="exam-path-header"><strong>مسار الأسئلة</strong><span><i class="is-answered"></i> مجاب <i class="is-current"></i> الحالي <i class="is-unanswered"></i> غير مجاب</span></div>
        <nav class="exam-question-path" aria-label="التنقل بين أسئلة الاختبار">${questionPath}</nav>
        <div class="exam-question-stage">${test.questions.map((question, index) => studentQuestionMarkup(question, index, stage)).join("")}</div>
      </div>
      <div class="modal-actions exam-actions">
        <button type="button" class="secondary-button exam-exit-button" id="closeExam">الخروج مؤقتًا</button>
        <div class="exam-actions-main"><button type="button" class="secondary-button exam-previous-button" id="previousExamQuestion" disabled>السابق</button><button type="button" class="primary-button" id="nextExamQuestion"${questionCount <= 1 ? " hidden" : ""}>التالي</button><button class="primary-button" id="submitExam" type="submit"${questionCount > 1 ? " hidden" : ""}>إرسال الاختبار</button></div>
      </div>
    </form></div>`;
    const form = document.getElementById("examForm");
    const questionSections = [...form.querySelectorAll("[data-exam-question]")];
    const questionButtons = [...form.querySelectorAll("[data-question-jump]")];
    const previousButton = document.getElementById("previousExamQuestion");
    const nextButton = document.getElementById("nextExamQuestion");
    const submitButton = document.getElementById("submitExam");
    const questionCounter = document.getElementById("examQuestionCounter");
    const progressBar = document.getElementById("examProgressBar");
    const progressText = document.getElementById("examProgressText");
    const progress = form.querySelector(".exam-progress");
    let currentQuestionIndex = 0;
    let examSubmissionPending = false;

    const isQuestionAnswered = (index) => {
      const section = questionSections[index];
      if (!section) return false;
      const checkedAnswer = section.querySelector('input[type="radio"]:checked');
      if (checkedAnswer) return true;
      const textAnswer = section.querySelector('input[type="text"]');
      return Boolean(textAnswer && textAnswer.value.trim());
    };

    const updateQuestionState = (index) => {
      const button = questionButtons[index];
      if (!button) return;
      const answered = isQuestionAnswered(index);
      const number = studentArabicNumber(index + 1, stage);
      button.classList.toggle("is-answered", answered);
      button.setAttribute("aria-label", `السؤال ${number}، ${index === currentQuestionIndex ? "الحالي، " : ""}${answered ? "مجاب" : "غير مجاب"}`);
    };

    const clearQuestionError = (index) => {
      const section = questionSections[index];
      const message = section?.querySelector(".exam-question-error");
      if (!section || !message) return;
      section.classList.remove("has-error");
      section.querySelectorAll("input").forEach((input) => input.removeAttribute("aria-invalid"));
      message.hidden = true;
      message.textContent = "";
    };

    const showQuestionError = (index, message) => {
      const section = questionSections[index];
      const error = section?.querySelector(".exam-question-error");
      if (!section || !error) return;
      section.classList.add("has-error");
      section.querySelectorAll("input").forEach((input) => input.setAttribute("aria-invalid", "true"));
      error.textContent = message;
      error.hidden = false;
      section.querySelector("input")?.focus();
    };

    const showQuestion = (index, focusQuestion = true) => {
      if (!questionCount) return;
      currentQuestionIndex = Math.max(0, Math.min(index, questionCount - 1));
      form.dataset.currentQuestion = String(currentQuestionIndex);
      questionSections.forEach((section, sectionIndex) => {
        const isCurrent = sectionIndex === currentQuestionIndex;
        section.hidden = !isCurrent;
        section.classList.toggle("is-active", isCurrent);
      });
      questionButtons.forEach((button, buttonIndex) => {
        const isCurrent = buttonIndex === currentQuestionIndex;
        button.classList.toggle("is-current", isCurrent);
        if (isCurrent) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
        updateQuestionState(buttonIndex);
      });
      const currentNumber = studentArabicNumber(currentQuestionIndex + 1, stage);
      const totalNumber = studentArabicNumber(questionCount, stage);
      questionCounter.textContent = `السؤال ${currentNumber} من ${totalNumber}`;
      progressText.textContent = `${currentNumber} / ${totalNumber}`;
      progressBar.style.width = `${((currentQuestionIndex + 1) / questionCount) * 100}%`;
      progress.setAttribute("aria-valuenow", String(currentQuestionIndex + 1));
      previousButton.disabled = currentQuestionIndex === 0;
      nextButton.hidden = currentQuestionIndex === questionCount - 1;
      submitButton.hidden = currentQuestionIndex !== questionCount - 1;
      questionButtons[currentQuestionIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      if (focusQuestion) questionSections[currentQuestionIndex]?.querySelector("h3")?.focus({ preventScroll: true });
    };

    const requireCurrentAnswer = () => {
      if (isQuestionAnswered(currentQuestionIndex)) return true;
      showQuestionError(currentQuestionIndex, "أجيبي عن هذا السؤال أولًا، ثم تابعي إلى السؤال التالي.");
      return false;
    };

    questionButtons.forEach((button) => {
      button.onclick = () => showQuestion(Number(button.dataset.questionJump));
    });
    questionSections.forEach((section, index) => {
      section.querySelectorAll("input").forEach((input) => {
        input.addEventListener(input.type === "text" ? "input" : "change", () => {
          updateQuestionState(index);
          if (isQuestionAnswered(index)) clearQuestionError(index);
        });
      });
      updateQuestionState(index);
    });
    previousButton.onclick = () => showQuestion(currentQuestionIndex - 1);
    nextButton.onclick = () => { if (requireCurrentAnswer()) showQuestion(currentQuestionIndex + 1); };
    document.getElementById("closeExam").onclick = () => { clearInterval(examTimer); modalRoot.innerHTML = ""; };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (form.dataset.timedOut !== "1") {
        if (currentQuestionIndex !== questionCount - 1) {
          if (requireCurrentAnswer()) showQuestion(currentQuestionIndex + 1);
          return;
        }
        const firstMissingQuestion = test.questions.findIndex((question, index) => !isQuestionAnswered(index));
        if (firstMissingQuestion !== -1) {
          showQuestion(firstMissingQuestion, false);
          showQuestionError(firstMissingQuestion, "انتقلنا إلى أول سؤال غير مجاب. أكملي الإجابة قبل إرسال الاختبار.");
          return;
        }
      }
      if (examSubmissionPending) return;
      examSubmissionPending = true;
      submitButton.disabled = true;
      submitButton.textContent = "جارٍ التصحيح...";
      const formData = new FormData(form);
      const answers = test.questions.map((question) => ({ questionId: question.id, answerText: formData.get(`q${question.id}`) || "" }));
      try {
        const result = await api(`/tests/${id}/submit`, { method: "POST", body: JSON.stringify({ attemptId: test.attemptId, answers }) });
        clearInterval(examTimer);
        modalRoot.innerHTML = `<div class="modal-overlay"><div class="modal"><h2>تم تصحيح الاختبار</h2>${result.showResult ? `<div class="result-score">${studentArabicNumber(result.percentage, stage)}٪</div><p style="text-align:center">${studentArabicNumber(result.score, stage)} من ${studentArabicNumber(result.totalPoints, stage)}</p>${result.reviewPending ? '<div class="warning-box">النتيجة أولية؛ توجد إجابة قصيرة تحتاج مراجعة المعلمة.</div>' : ""}${result.skillResults?.length ? `<h3 class="skill-results-title">نتيجتكِ في كل مهارة</h3>${skillResultsMarkup(result.skillResults)}` : ""}` : "<p>تم حفظ إجاباتكِ بنجاح.</p>"}<div class="modal-actions"><button class="primary-button" id="doneExam">إغلاق</button></div></div></div>`;
        document.getElementById("doneExam").onclick = () => { modalRoot.innerHTML = ""; results(); };
      } catch (error) {
        examSubmissionPending = false;
        submitButton.disabled = false;
        submitButton.textContent = "إرسال الاختبار";
        toast(error.message);
      }
    };
    if (timedTest) startExamTimer(test.deadlineAt, form, stage);
  } catch (error) { toast(error.message); }
}

async function results() {
  setActive("results");
  const rows = await api("/results");
  content.innerHTML = `<div class="card"><h2>نتائجي</h2>${rows.length ? rows.map((row) => `<div class="test-row"><div style="flex:1"><h3>${esc(row.title)}</h3><p>${new Date(row.submitted_at).toLocaleString("ar-SA")}</p>${skillResultsMarkup(row.skillResults, "student-result-skills")}</div><strong>${studentArabicNumber(row.percentage, me?.stage)}٪</strong></div>`).join("") : "<p>لا توجد نتائج بعد.</p>"}</div>`;
}

async function points() {
  setActive("points");
  const data = await api("/points");
  content.innerHTML = `
    <section class="madar-points-hero">
      <div class="points-hero-copy">
        <span class="points-kicker">✨ نظامي التحفيزي</span>
        <h1>نقاط مدار</h1>
        <p>كل إنجاز يصنع فرقًا. هنا تجدين نقاط التحفيز التي تضيفها المعلمة، ونقاط سجل الدرجات والواجبات والمشاركة والحضور والمهام والألعاب، مع تفاصيل نقاط الضعف والخصومات.</p>
      </div>
      <div class="points-total-orb" aria-label="مجموع نقاط مدار">
        <span>مجموع نقاطي</span>
        <strong>${Number(data.total || 0)}</strong>
        <small>نقطة</small>
      </div>
    </section>

    <section class="points-section-tabs" role="tablist" aria-label="أقسام نقاط مدار">
      ${Object.entries(pointSectionMeta).map(([key, item]) => `<button type="button" role="tab" class="${key === "all" ? "active" : ""}" data-points-section="${key}" aria-selected="${key === "all" ? "true" : "false"}"><span aria-hidden="true">${item.icon}</span>${item.label}</button>`).join("")}
    </section>

    <section class="points-overview-grid" aria-label="ملخص نقاط مدار">
      ${Object.entries(pointSectionMeta).filter(([key]) => key !== "weakness").map(([key, item]) => `<article class="points-overview-card ${key === "all" ? "main" : ""}"><span aria-hidden="true">${item.icon}</span><div><strong>${Number(data.summary?.[key] || 0)}</strong><small>${item.label}</small></div></article>`).join("")}
    </section>

    <section class="card points-log-card">
      <header><div><span id="pointsLogIcon" aria-hidden="true">✨</span><div><h2 id="pointsLogTitle">سجل النقاط</h2><p id="pointsLogSubtitle">جميع نقاط مدار التي حصلتِ عليها.</p></div></div><strong id="pointsLogTotal">${Number(data.total || 0)} نقطة</strong></header>
      <div id="studentPointsHistory"></div>
    </section>
  `;

  const tabs = [...content.querySelectorAll("[data-points-section]")];
  const historyRoot = document.getElementById("studentPointsHistory");
  const title = document.getElementById("pointsLogTitle");
  const subtitle = document.getElementById("pointsLogSubtitle");
  const icon = document.getElementById("pointsLogIcon");
  const total = document.getElementById("pointsLogTotal");

  function renderSection(section) {
    const meta = pointSectionMeta[section];
    tabs.forEach((tab) => {
      const active = tab.dataset.pointsSection === section;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    icon.textContent = meta.icon;
    title.textContent = section === "all" ? "سجل النقاط" : meta.label;
    if (section === "weakness") {
      const weakness = data.weaknesses || {};
      const groups = [
        ["absence", "عدد أيام الغياب", "🚫"],
        ["participation", "عدد أيام لم تشارك", "🙋‍♀️"],
        ["homework", "عدد أيام لم يُحل الواجب", "📖"],
        ["task", "عدد أيام لم تُحل المهمة", "📚"],
      ];
      const totalCases = groups.reduce((sum, [key]) => sum + Number(weakness[key]?.count || 0), 0);
      const totalDeduction = Number(weakness.homework?.deduction || 0) + Number(weakness.task?.deduction || 0);
      const dayLabel = (value) => {
        const date = new Date(`${String(value || "")}T12:00:00`);
        return Number.isNaN(date.getTime()) ? String(value || "—") : date.toLocaleDateString("ar-SA", { dateStyle: "medium" });
      };
      subtitle.textContent = "يوم الغياب لا يُحسب ضمن عدم المشاركة. الغياب وعدم المشاركة دون خصم، ويُخصم مقدار الدرجة الكاملة للواجب أو المهمة المسجلة «لم تُسلَّم».";
      total.textContent = totalDeduction ? `إجمالي الخصم: ${totalDeduction} نقطة` : `${totalCases} حالة`;
      const details = groups.flatMap(([key, label, groupIcon]) => (weakness[key]?.details || []).map((entry) => ({ ...entry, key, label, groupIcon })));
      historyRoot.innerHTML = `
        <div class="weakness-summary-grid">
          ${groups.map(([key, label, groupIcon]) => `<article class="weakness-count-card ${key}"><span aria-hidden="true">${groupIcon}</span><div><small>${label}</small><strong>${Number(weakness[key]?.count || 0)}</strong>${["absence", "participation"].includes(key) ? "<em>دون خصم نقاط</em>" : `<em>خصم ${Number(weakness[key]?.deduction || 0)} نقطة</em>`}</div></article>`).join("")}
        </div>
        ${details.length ? `<div class="weakness-details-list">${details.map((entry) => `<article class="weakness-detail-entry"><span aria-hidden="true">${entry.groupIcon}</span><div><small>${esc(entry.label)}</small><h3>${esc(entry.title)}</h3><p>التاريخ: ${esc(dayLabel(entry.date))} · الأسبوع ${Number(entry.week || 0)}${entry.note ? ` · ${esc(entry.note)}` : ""}</p></div><strong class="${Number(entry.deduction || 0) > 0 ? "deduction" : "no-deduction"}">${Number(entry.deduction || 0) > 0 ? `-${Number(entry.deduction)} نقطة` : "دون خصم"}</strong></article>`).join("")}</div>` : `<div class="points-empty"><span aria-hidden="true">🌟</span><strong>لا توجد نقاط ضعف مسجلة</strong><p>لا يوجد غياب أو عدم مشاركة أو واجبات أو مهام مسجلة «لم تُسلَّم» في الترم الحالي.</p></div>`}
      `;
      return;
    }
    const rows = section === "all" ? data.history : data.history.filter((entry) => entry.category === section);
    subtitle.textContent = section === "all" ? "جميع نقاط مدار التي حصلتِ عليها." : `النقاط المسجلة في قسم ${meta.label}.`;
    total.textContent = `${Number(data.summary?.[section] || 0)} نقطة`;
    const emptyMessage = section === "motivation"
      ? "ستظهر هنا نقاط التحفيز التي تضيفها المعلمة إلى حسابكِ."
      : "ستظهر هنا النقاط المسجلة من حساب المعلمة أو التي تحققينها في الألعاب.";
    historyRoot.innerHTML = rows.length ? `<div class="student-points-list">${rows.map((entry) => {
      const category = entry.category === "other" ? { label: entry.reason || "سبب آخر", icon: "💡" } : pointSectionMeta[entry.category] || { label: entry.categoryLabel, icon: "✨" };
      return `<article class="student-point-entry">
        <div class="student-point-icon" aria-hidden="true">${category.icon}</div>
        <div class="student-point-copy"><h3>${esc(entry.reason)}</h3><p><span>${esc(category.label)}</span>${entry.details ? ` · ${esc(entry.details)}` : ""}${entry.sourceLabel ? ` · ${esc(entry.sourceLabel)}` : ""} · ${studentDate(entry.createdAt)}</p></div>
        <strong class="student-point-value ${Number(entry.points) < 0 ? "negative" : ""}">${Number(entry.points) > 0 ? "+" : ""}${Number(entry.points)} <small>نقطة</small></strong>
      </article>`;
    }).join("")}</div>` : `<div class="points-empty"><span aria-hidden="true">${meta.icon}</span><strong>لا توجد نقاط في ${meta.label} بعد</strong><p>${emptyMessage}</p></div>`;
  }

  tabs.forEach((tab) => { tab.onclick = () => renderSection(tab.dataset.pointsSection); });
  renderSection("all");
}

function portfolioFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} بايت`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} كيلوبايت`;
  return `${(size / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

async function portfolio() {
  setActive("portfolio");
  const [data, gameCatalog] = await Promise.all([api("/portfolio"), api("/games/catalog").catch(() => ({ catalog: [] }))]);
  const gamePageByKey = new Map((gameCatalog.catalog || []).map((game) => [game.gameKey, game.playUrl || game.playPath]));
  const works = data.files.filter((file) => !String(file.certificateKey || file.certificate_key || "").trim());
  const certificates = data.files.filter((file) => String(file.certificateKey || file.certificate_key || "").trim());
  if (!["add", "works", "certificates"].includes(portfolioSection)) portfolioSection = "add";
  content.innerHTML = `
    <section class="portfolio-hero">
      <div><span>📁 مساحتي الخاصة</span><h1>ملف إنجازي</h1><p>اجمعي أعمالكِ المميزة في مكان واحد، واكتبي عنوانًا واضحًا وملاحظة تساعد معلمتكِ على معرفة تفاصيل الإنجاز.</p></div>
      <strong><b>${data.files.length}</b><small>عنصر محفوظ</small></strong>
    </section>

    <nav class="portfolio-tabs" role="tablist" aria-label="أقسام ملف الإنجاز">
      <button class="portfolio-tab" id="portfolioTabAdd" type="button" role="tab" aria-controls="portfolioPanel" data-portfolio-section="add"><span aria-hidden="true">＋</span><b>إضافة عمل جديد</b></button>
      <button class="portfolio-tab" id="portfolioTabWorks" type="button" role="tab" aria-controls="portfolioPanel" data-portfolio-section="works"><span aria-hidden="true">📂</span><b>أعمالي</b><small>${works.length}</small></button>
      <button class="portfolio-tab" id="portfolioTabCertificates" type="button" role="tab" aria-controls="portfolioPanel" data-portfolio-section="certificates"><span aria-hidden="true">🎓</span><b>شهاداتي</b><small>${certificates.length}</small></button>
    </nav>
    <section class="portfolio-workspace">
      <section class="portfolio-panel" id="portfolioPanel" role="tabpanel"></section>
    </section>`;

  const panel = document.getElementById("portfolioPanel");
  const tabs = [...content.querySelectorAll("[data-portfolio-section]")];

  const renderPortfolioFile = (file) => {
    const meta = portfolioCategoryMeta[file.category] || portfolioCategoryMeta.other;
    const review = portfolioReviewMeta[file.reviewStatus] || portfolioReviewMeta.pending;
    const certificateKey = String(file.certificateKey || file.certificate_key || "").trim();
    const isGameCertificate = Boolean(certificateKey);
    const duplicateCertificate = isGameCertificate && /\(مكرر\)/.test(String(file.title || ""));
    const certificateLabel = duplicateCertificate ? "شهادة إتقان (مكرر)" : "شهادة إتقان";
    const kind = isGameCertificate ? certificateLabel : (file.mimeType === "application/pdf" ? "PDF" : "صورة");
    const certificateGameKey = certificateKey.split(":u", 1)[0];
    const certificateGamePath = Number(file.certificateGameId) > 0 ? `/games/game-player.php?game=${Number(file.certificateGameId)}` : gamePageByKey.get(certificateGameKey);
    const certificateParams = certificateGamePath && certificateGamePath.includes("game-player.php")
      ? `&certificate=${encodeURIComponent(file.id)}`
      : `?game=${encodeURIComponent(certificateGameKey)}&certificate=${encodeURIComponent(file.id)}`;
    const action = isGameCertificate && certificateGamePath
      ? `<a class="secondary-button portfolio-certificate-link" href="${esc(certificateGamePath)}${certificateParams}">عرض الشهادة</a>`
      : isGameCertificate
        ? '<span class="portfolio-file-meta">تعذّر تحديد واجهة اللعبة لهذه الشهادة.</span>'
        : `<a class="secondary-button" href="/api/student/portfolio/${file.id}/file" target="_blank" rel="noopener">فتح ملفي</a>`;
    return `<article class="portfolio-file-card${isGameCertificate ? " portfolio-certificate-card" : ""}">
      <div class="portfolio-file-icon" aria-hidden="true">${isGameCertificate ? "🎓" : meta.icon}</div>
      <div class="portfolio-file-copy"><div class="portfolio-file-labels"><span>${isGameCertificate ? certificateLabel : meta.label}</span><span class="portfolio-student-status ${esc(file.reviewStatus || "pending")}">${review.icon} ${review.label}</span>${file.awardedPoints ? `<span class="portfolio-student-points">+${Number(file.awardedPoints)} نقطة مدار ✨</span>` : ""}</div><h3>${esc(file.title)}</h3>${file.note ? `<p>${esc(file.note)}</p>` : ""}${file.teacherComment ? `<aside class="portfolio-teacher-comment"><strong>تعليق المعلمة</strong><p>${esc(file.teacherComment)}</p></aside>` : ""}<small>${esc(file.originalName)} · ${kind} · ${portfolioFileSize(file.sizeBytes)} · ${studentDate(file.createdAt)}</small></div>
      ${action}
    </article>`;
  };

  const uploadFormHtml = () => `
      <form class="card portfolio-upload-card" id="portfolioUploadForm" enctype="multipart/form-data">
        <div class="portfolio-card-heading"><span aria-hidden="true">⬆️</span><div><h2>إضافة عمل جديد</h2><p>الصيغ المسموحة: PDF أو صورة، بحد أقصى 10 ميجابايت.</p></div></div>
        <div id="portfolioMessage"></div>
        <fieldset class="portfolio-category-fieldset">
          <legend>نوع العمل</legend>
          <div class="portfolio-category-grid">
            ${Object.entries(portfolioCategoryMeta).map(([key, item]) => `<button type="button" class="portfolio-category-choice" data-portfolio-category="${key}" aria-pressed="false"><span aria-hidden="true">${item.icon}</span><strong>${item.label}</strong></button>`).join("")}
          </div>
        </fieldset>
        <label class="portfolio-field">عنوان العمل
          <input id="portfolioTitle" maxlength="190" required placeholder="مثال: مشروع النسبة المئوية" />
        </label>
        <label class="portfolio-field">ملاحظة <small>اختيارية</small>
          <textarea id="portfolioNote" maxlength="1000" placeholder="اكتبي وصفًا قصيرًا للعمل أو ما تعلمته منه"></textarea>
        </label>
        <label class="portfolio-file-picker" id="portfolioFilePicker">
          <input id="portfolioFile" type="file" required accept=".pdf,image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif" />
          <span aria-hidden="true">📎</span><strong id="portfolioFileLabel">اختاري ملف PDF أو صورة</strong><small>اضغطي هنا لاختيار الملف</small>
        </label>
        <button class="primary-button portfolio-submit" id="portfolioSubmit" type="submit">ارفعي العمل إلى ملف إنجازي</button>
      </form>`;

  function bindUploadForm() {
  const form = document.getElementById("portfolioUploadForm");
  const categoryButtons = [...form.querySelectorAll("[data-portfolio-category]")];
  const fileInput = document.getElementById("portfolioFile");
  const fileLabel = document.getElementById("portfolioFileLabel");
  const message = document.getElementById("portfolioMessage");
  const submit = document.getElementById("portfolioSubmit");
  let selectedCategory = "";

  categoryButtons.forEach((button) => {
    button.onclick = () => {
      selectedCategory = button.dataset.portfolioCategory;
      categoryButtons.forEach((choice) => {
        const active = choice === button;
        choice.classList.toggle("selected", active);
        choice.setAttribute("aria-pressed", active ? "true" : "false");
      });
    };
  });

  fileInput.onchange = () => {
    const file = fileInput.files[0];
    fileLabel.textContent = file ? file.name : "اختاري ملف PDF أو صورة";
    document.getElementById("portfolioFilePicker").classList.toggle("has-file", Boolean(file));
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    message.innerHTML = "";
    const file = fileInput.files[0];
    if (!selectedCategory) {
      message.innerHTML = '<div class="form-error">اختاري نوع العمل أولًا.</div>';
      return;
    }
    if (!file) {
      message.innerHTML = '<div class="form-error">اختاري ملف PDF أو صورة.</div>';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      message.innerHTML = '<div class="form-error">يجب ألا يتجاوز حجم الملف 10 ميجابايت.</div>';
      return;
    }
    const formData = new FormData();
    formData.append("category", selectedCategory);
    formData.append("title", document.getElementById("portfolioTitle").value.trim());
    formData.append("note", document.getElementById("portfolioNote").value.trim());
    formData.append("file", file);
    submit.disabled = true;
    submit.textContent = "جارٍ رفع العمل...";
    try {
      await api("/portfolio", { method: "POST", body: formData });
      toast("تمت إضافة العمل إلى ملف إنجازكِ ✨");
      portfolioSection = "works";
      await portfolio();
    } catch (error) {
      message.innerHTML = `<div class="form-error">${esc(error.message)}</div>`;
      submit.disabled = false;
      submit.textContent = "ارفعي العمل إلى ملف إنجازي";
    }
  };
  }

  function renderPortfolioSection(section, focusTab = false) {
    portfolioSection = section;
    tabs.forEach((tab) => {
      const active = tab.dataset.portfolioSection === section;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      if (active) {
        panel.setAttribute("aria-labelledby", tab.id);
        if (focusTab) tab.focus();
      }
    });

    if (section === "add") {
      panel.innerHTML = uploadFormHtml();
      bindUploadForm();
      return;
    }

    const isWorks = section === "works";
    const files = isWorks ? works : certificates;
    const empty = isWorks
      ? '<div class="portfolio-empty"><span aria-hidden="true">📂</span><strong>لا توجد أعمال مرفوعة بعد</strong><p>ارفعي أول عمل ليظهر هنا.</p><button class="secondary-button" type="button" data-portfolio-go="add">إضافة عمل جديد</button></div>'
      : '<div class="portfolio-empty"><span aria-hidden="true">🎓</span><strong>لا توجد شهادات بعد</strong><p>ستظهر شهاداتكِ هنا بعد إكمال الألعاب المؤهلة.</p></div>';
    panel.innerHTML = `<section class="card portfolio-list-card">
      <div class="portfolio-card-heading"><span aria-hidden="true">${isWorks ? "🌟" : "🎓"}</span><div><h2>${isWorks ? "أعمالي" : "شهاداتي"}</h2><p>${isWorks ? "يمكنكِ فتح أي عمل ومراجعته في أي وقت." : "شهادات الألعاب التي أتممتِ متطلباتها."}</p></div></div>
      ${files.length ? `<div class="portfolio-files-list">${files.map(renderPortfolioFile).join("")}</div>` : empty}
    </section>`;
    panel.querySelector("[data-portfolio-go]")?.addEventListener("click", () => renderPortfolioSection("add", true));
  }

  tabs.forEach((tab, index) => {
    tab.onclick = () => renderPortfolioSection(tab.dataset.portfolioSection);
    tab.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (event.key === "ArrowLeft") nextIndex = (index + 1) % tabs.length;
      if (event.key === "ArrowRight") nextIndex = (index - 1 + tabs.length) % tabs.length;
      renderPortfolioSection(tabs[nextIndex].dataset.portfolioSection, true);
    };
  });
  renderPortfolioSection(portfolioSection);
}

async function games() {
  setActive("games");
  studentLiveCompetitions.stop();
  const [attempts, gameCatalog, liveInfo, liveHistory] = await Promise.all([
    api("/games/attempts"),
    api("/games/catalog"),
    api("/competitions/active", { cache: "no-store" }).catch(() => ({ migrationReady: false, activeSession: null })),
    api("/competitions/history", { cache: "no-store" }).catch(() => ({ items: [] })),
  ]);
  const availableGames = Array.isArray(gameCatalog?.games) ? gameCatalog.games : [];
  const gameByKey = new Map(availableGames.map((game) => [game.gameKey, game]));
  const formatGameNumber = (value) => new Intl.NumberFormat("ar-SA", { useGrouping: false }).format(value);
  const gameContextData = gameCatalog?.context || {};
  const gameContext = [
    ["المرحلة", gameContextData.stageLabel],
    ["الصف", gameContextData.gradeLabel],
    ["الفصل", gameContextData.className],
    ["الفصل الدراسي", gameContextData.semesterLabel],
  ].map(([label, value]) => ({ label, value: String(value || "").trim() || "—" }));
  const best = attempts.reduce((highest, attempt) => Math.max(highest, Number(attempt.score || 0)), 0);
  content.innerHTML = `
    <section class="hero-card game-hero">
      <div><h1>الألعاب</h1><p>العبي وتدرّبي؛ تتغير الأسئلة في كل جولة وتُحفظ نتيجتك تلقائيًا.</p><dl class="game-context-strip" aria-label="سياق الألعاب الحالي">${gameContext.map((item) => `<div><dt>${item.label}</dt><dd>${esc(item.value)}</dd></div>`).join("")}</dl></div>
      <span class="style-badge">أفضل نتيجة: ${best}</span>
    </section>
    ${liveInfo?.activeSession ? `<section class="student-live-entry"><div class="student-live-entry-star" aria-hidden="true">★</div><div><small>${liveInfo.activeSession.status === "completed" ? "نتائج آخر مسابقة" : "تجري الآن في فصلكِ"}</small><h2>${esc(liveInfo.activeSession.title)}</h2><p>${esc(liveInfo.activeSession.className)} · ${formatGameNumber(liveInfo.activeSession.questionCount)} أسئلة · ${formatGameNumber(liveInfo.activeSession.questionTimeSeconds)} ثانية لكل سؤال</p><span>${liveInfo.activeSession.status === "completed" ? "اكتملت المسابقة — شاهدي مركزكِ" : liveInfo.activeSession.status === "lobby" ? (liveInfo.activeSession.joined ? "انضممتِ — بانتظار المعلمة" : "الردهة مفتوحة للانضمام") : "المسابقة بدأت — ادخلي الآن"}</span></div><button class="primary-button" type="button" data-open-live-competition="${liveInfo.activeSession.id}" data-join-live="${liveInfo.activeSession.status === "completed" || liveInfo.activeSession.joined ? "0" : "1"}">${liveInfo.activeSession.status === "completed" ? "عرض النتائج" : liveInfo.activeSession.joined ? "فتح المسابقة" : "الانضمام الآن"}</button></section>` : ""}
    ${liveHistory?.items?.length ? `<section class="card student-live-history" aria-labelledby="student-live-history-title"><h2 id="student-live-history-title">سجل مسابقاتي المباشرة</h2><div class="student-game-history-list">${liveHistory.items.map((item) => `<article class="student-game-history-row"><div><h3>${esc(item.title)}</h3><p>${esc(item.class_name || "")} · ${item.status === "completed" ? "مكتملة" : "ملغاة"}</p></div>${item.status === "completed" ? `<button class="secondary-button" type="button" data-open-live-history="${item.id}">عرض النتيجة</button>` : "<span>ملغاة</span>"}</article>`).join("")}</div></section>` : ""}
    <aside class="game-certificate-reminder" aria-label="تذكير بإرسال شهادة اللعبة">
      <span class="game-certificate-reminder-icon" aria-hidden="true">🔔</span>
      <p><strong>تذكير:</strong> عزيزتي الطالبة، لا تنسي إرسال الشهادة إلى ملف الإنجاز.</p>
      <button class="game-certificate-reminder-close" type="button" aria-label="إغلاق التذكير">×</button>
    </aside>
    <section class="game-library">
      ${availableGames.length ? availableGames.map((game) => {
        const unitNumber = Number(game.unitNumber);
        const lessonNumber = Number(game.lessonNumber);
        const lessonCode = `${formatGameNumber(unitNumber)}-${formatGameNumber(lessonNumber)}`;
        const timeMode = game.timeMode === "timed" ? `${formatGameNumber(game.timePerQuestionSeconds)} ثانية لكل سؤال` : "وقت مفتوح";
        const playUrl = game.playUrl || `${game.playPath}?game=${encodeURIComponent(game.gameKey)}&play=1`;
        const description = String(game.description || "").trim() || (game.sourceType === "package"
          ? "لعبة مبرمجة مرتبطة بنتائج مدار وشهادة الإتقان."
          : "لعبة تفاعلية بأسئلة الدرس ومستويات الصعوبة التي أعدّتها المعلمة.");
        const sourceLabel = game.sourceType === "package" ? "لعبة مبرمجة" : "أسئلة من إعداد المعلمة";
        return `<article class="game-library-card">
          <div class="game-lesson-number">${esc(lessonCode)}</div>
          <div class="game-library-copy"><h2>${esc(game.name || game.lessonName)}</h2><p>${esc(description)}</p><div class="game-features"><span>✦ ${esc(sourceLabel)}</span>${game.pointsEnabled ? `<span>🏆 ${formatGameNumber(game.pointsValue)} نقطة</span>` : ""}<span>⏱ ${esc(timeMode)}</span></div><a class="primary-button game-play-link" href="${esc(playUrl)}">ابدئي اللعب الآن 🎮</a></div>
        </article>`;
      }).join("") : `<div class="card student-empty-state"><span>🎮</span><strong>لا توجد لعبة جاهزة حاليًا</strong><p>${gameCatalog?.migrationReady && gameCatalog?.builderReady ? "ستظهر اللعبة بعد أن تنشرها المعلمة لفصلكِ في الفصل الدراسي الحالي." : "يلزم تجهيز بنية الألعاب ثم نشر لعبة لفصلكِ من حساب المعلمة."}</p></div>`}
      <div class="card game-history">
        <h2>محاولاتي في الألعاب</h2>
        <p class="game-history-intro">تُحفظ كل محاولة تلقائيًا. إذا نسيتِ إرسال الشهادة بعد إكمال الجولة يمكنكِ إرسالها من هنا.</p>
        ${attempts.length ? `<div class="student-game-history-list">${attempts.map((attempt) => {
          const game=gameByKey.get(attempt.game_key);
          const completed=attempt.status==="completed";
          const gameName=attempt.game_name||(game?.name||game?.lessonName||attempt.game_key);
          const certificateAction=attempt.certificate_sent
            ? '<span class="student-game-certificate-state sent">تم إرسال شهادة اللعبة ✓</span>'
            : !completed
              ? '<span class="student-game-certificate-state waiting">أكملي الجولة أولًا</span>'
              : attempt.certificate_enabled
                ? `<button class="secondary-button student-send-game-certificate" type="button" data-send-game-certificate="${attempt.id}">إرسال الشهادة</button>`
                : '<span class="student-game-certificate-state unavailable">الشهادة غير متاحة</span>';
          return `<article class="student-game-history-row"><div><small>${esc(gameName)} · المحاولة ${formatGameNumber(attempt.attempt_number)}</small><h3>${attempt.difficulty === "easy" ? "المستوى البسيط" : attempt.difficulty === "medium" ? "المستوى المتوسط" : "المستوى المتقدم"}</h3><p>${attempt.started_at?`بدأت ${studentDate(attempt.started_at)}`:"وقت البدء غير متاح"}${attempt.played_at?` · اكتملت ${studentDate(attempt.played_at)}`:" · بدأت ولم تكتمل"}</p></div><div class="student-game-history-result"><strong>${Number(attempt.accuracy||0).toFixed(0)}%</strong><span>${Number(attempt.score||0)} نقطة${attempt.max_score!==null?` / ${Number(attempt.max_score)}`:""}</span>${certificateAction}</div></article>`;
        }).join("")}</div>` : "<p>لا توجد محاولات محفوظة بعد. ابدئي أول لعبة لكِ!</p>"}
      </div>
    </section>`;
  content.querySelector(".game-certificate-reminder-close")?.addEventListener("click", (event) => {
    event.currentTarget.closest(".game-certificate-reminder")?.remove();
  });
  content.querySelector("[data-open-live-competition]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    studentLiveCompetitions.open(Number(button.dataset.openLiveCompetition), button.dataset.joinLive === "1");
  });
  content.querySelectorAll("[data-open-live-history]").forEach((button) => button.addEventListener("click", () => studentLiveCompetitions.open(Number(button.dataset.openLiveHistory), false)));
  document.querySelectorAll("[data-send-game-certificate]").forEach((button)=>{button.onclick=async()=>{
    button.disabled=true;button.textContent="جارٍ الإرسال…";
    try {
      const result=await api("/games/certificates",{method:"POST",body:JSON.stringify({attemptId:Number(button.dataset.sendGameCertificate)})});
      toast(result.alreadySaved?"سبق إرسال شهادة هذه المحاولة.":"تم إرسال شهادة المحاولة إلى المعلمة وملف الإنجاز.");
      await games();
    } catch(error) {
      button.disabled=false;button.textContent="إرسال الشهادة";toast(error.message);
    }
  };});
}

let flippedStudentState = null;

function studentFlippedAttemptLabel(submission = {}) {
  if (!submission.allowRetry) return "";
  const maximum = Math.max(2, Math.min(5, Number(submission.maxAttempts) || 2));
  const attempt = Number(submission.attemptNo) || 0;
  const remaining = Math.max(0, Number(submission.attemptsRemaining) || 0);
  if (!attempt) return `متاح حتى ${maximum} محاولات`;
  if (!remaining) return `المحاولة ${attempt} من ${maximum} · اكتمل الحد`;
  return `المحاولة ${attempt} من ${maximum} · ${remaining===1?"متبقية محاولة واحدة":`متبقي ${remaining}`}`;
}

function studentFlippedAttemptTone(submission = {}) {
  return submission.allowRetry && Number(submission.attemptNo)>0 && Number(submission.attemptsRemaining)===0 ? " is-exhausted" : "";
}

async function strategies() {
  setActive("strategies");
  content.innerHTML = '<div class="card loading">جارٍ تحميل دروس الصف المقلوب…</div>';
  const data = await api("/flipped-classroom", { cache: "no-store" });
  const lessons = Array.isArray(data.lessons) ? data.lessons : [];
  content.innerHTML = `
    <section class="student-learning-section-hero">
      <span aria-hidden="true">💡</span>
      <div><small>طرائق تساعدني على التعلّم</small><h1>التعلم النشط</h1><p>استخدمي الاستراتيجيات التعليمية لفهم الدروس والاستعداد للحصة بطريقة أسهل.</p></div>
    </section>
    ${!data.migrationReady ? `<div class="student-flipped-notice">ميزة الصف المقلوب قيد التجهيز من إدارة المنصة.</div>` : ""}
    <section class="student-flipped-library">
      ${lessons.length ? lessons.map((lesson) => { const submission=lesson.submission||{};const status={not_started:"جاهز للبدء",in_progress:"قيد المشاهدة",submitted:"بانتظار مراجعة المعلمة",reviewed:"تمت المراجعة"}[submission.status]||submission.status;const attemptLabel=studentFlippedAttemptLabel(submission);const attemptTone=studentFlippedAttemptTone(submission);return `<article class="student-flipped-card"><div class="student-flipped-icon" aria-hidden="true">▶</div><div><small>${esc(lesson.subjectName||"الصف المقلوب")} · ${esc(status)}</small><h2>${esc(lesson.title)}</h2><p>${esc(lesson.description||"شاهدي الفيديو وأجيبي عند لحظات التوقف.")}</p><div class="student-flipped-meta"><span>${Number(lesson.questionCount||0)} سؤال</span>${attemptLabel?`<span class="student-flipped-attempt${attemptTone}">${esc(attemptLabel)}</span>`:""}${submission.percent!=null?`<strong>${Number(submission.percent).toFixed(0)}%</strong>`:""}</div></div><button class="primary-button" type="button" data-open-flipped="${lesson.id}">${submission.status==="reviewed"?"عرض النتيجة":"فتح الدرس"}</button></article>`; }).join("") : `<div class="student-flipped-empty"><span>🔄</span><h2>لا يوجد درس منشور الآن</h2><p>سيظهر الدرس هنا بعد أن تنشره معلمتكِ لفصلكِ.</p></div>`}
    </section>`;
  document.querySelectorAll("[data-open-flipped]").forEach((button)=>{button.onclick=()=>openStudentFlippedLesson(Number(button.dataset.openFlipped)).catch(errorView);});
}

async function openStudentFlippedLesson(lessonId, startedAttempt = null) {
  const data=await api(`/flipped-classroom/${lessonId}`,{cache:"no-store"});const lesson=data.lesson;const submission=lesson.submission||{};
  if(!startedAttempt&&["submitted","reviewed"].includes(submission.status)){renderStudentFlippedResult(lesson);return;}
  const started=startedAttempt||await api(`/flipped-classroom/${lessonId}/start`,{method:"POST",body:"{}"});Object.assign(submission,started,{status:"in_progress"});
  flippedStudentState={lesson,submissionId:Number(started.submissionId),answers:new Map(),waiting:null,lastTime:0};
  const attemptLabel=studentFlippedAttemptLabel(submission);const attemptTone=studentFlippedAttemptTone(submission);
  content.innerHTML=`<section class="student-flipped-player"><header><button class="student-learning-secondary" id="flippedBack" type="button">العودة للدروس</button><div><small>${esc(lesson.subjectName||"الصف المقلوب")}</small><h1>${esc(lesson.title)}</h1><p>${esc(lesson.description||"")}</p></div>${attemptLabel?`<span class="student-flipped-player-attempt${attemptTone}">${esc(attemptLabel)}</span>`:""}</header><div class="student-flipped-stage"><video id="studentFlippedVideo" src="/api/student/flipped-classroom/${lesson.id}/video" preload="metadata" playsinline></video><div class="student-flipped-controls"><button id="studentFlippedPlay" type="button" aria-label="تشغيل الفيديو">▶</button><input id="studentFlippedSeek" type="range" min="0" max="1000" value="0" aria-label="موضع الفيديو"><span id="studentFlippedTime">00:00 / 00:00</span></div><div class="student-flipped-markers" id="studentFlippedMarkers"></div></div><aside class="student-flipped-question" id="studentFlippedQuestion"><span>مسار الدرس</span><h2>شاهدي الفيديو</h2><p>سيتوقف الفيديو تلقائيًا عند كل سؤال، ولا يمكن تجاوز سؤال غير مجاب.</p></aside><section class="student-flipped-summary" id="studentFlippedSummary" hidden></section></section>`;
  const video=document.getElementById("studentFlippedVideo");const play=document.getElementById("studentFlippedPlay");const seek=document.getElementById("studentFlippedSeek");const time=document.getElementById("studentFlippedTime");
  const format=(seconds)=>`${String(Math.floor((seconds||0)/60)).padStart(2,"0")}:${String(Math.floor((seconds||0)%60)).padStart(2,"0")}`;
  function clipBounds(){const duration=Number(video.duration)||Number(lesson.videoDuration)||0;let start=Math.max(0,Math.min(duration,Number(lesson.trimStart)||0));let end=Number(lesson.trimEnd)||duration;if(duration>0)end=Math.min(duration,end);if(end<=start){start=0;end=duration;}return{start,end,duration:Math.max(0,end-start)};}
  function relativeTime(value){const {start,duration}=clipBounds();return Math.max(0,Math.min(duration,(Number(value)||0)-start));}
  function update(){const bounds=clipBounds();const current=relativeTime(video.currentTime);seek.value=bounds.duration?String(Math.round(current/bounds.duration*1000)):"0";time.textContent=`${format(current)} / ${format(bounds.duration)}`;play.textContent=video.paused?"▶":"Ⅱ";}
  function nextBlocking(target){const {start,end}=clipBounds();return lesson.questions.find((question)=>{const at=Number(question.time);return at>=start-.001&&at<=end+.001&&!flippedStudentState.answers.has(question.id)&&at<=target+.2;});}
  function showQuestion(question){flippedStudentState.waiting=question.id;video.pause();video.currentTime=Number(question.time);update();const box=document.getElementById("studentFlippedQuestion");box.innerHTML=`<span>توقّف عند ${format(relativeTime(question.time))}</span><h2>${esc(question.text)}</h2><form id="studentFlippedAnswer">${question.type==="multiple_choice"?`<div class="student-flipped-options">${(question.options||[]).map((option,index)=>`<label><input type="radio" name="answer" value="${index}" required><b>${esc(MADAR_OPTION_LABELS[index]||String(index+1))}</b><span>${esc(option)}</span></label>`).join("")}</div>`:`<textarea name="answer" required maxlength="10000" placeholder="اكتبي إجابتكِ هنا…"></textarea>`}<button class="primary-button" type="submit">تثبيت الإجابة والمتابعة</button></form>`;document.getElementById("studentFlippedAnswer").onsubmit=(event)=>{event.preventDefault();const form=new FormData(event.currentTarget);const raw=form.get("answer");if(raw===null||String(raw).trim()==="")return toast("أجيبي عن السؤال أولًا");flippedStudentState.answers.set(question.id,question.type==="multiple_choice"?Number(raw):String(raw).trim());flippedStudentState.waiting=null;renderStudentFlippedMarkers();if(flippedStudentState.answers.size===lesson.questions.length){renderStudentFlippedSummary();return;}box.innerHTML="<span>تم تثبيت الإجابة</span><h2>واصلي مشاهدة الفيديو</h2><p>سيظهر السؤال التالي عند موضعه.</p>";video.play().catch(()=>{});};}
  function renderStudentFlippedMarkers(){const layer=document.getElementById("studentFlippedMarkers");layer.replaceChildren();const {start,end,duration}=clipBounds();if(!duration)return;lesson.questions.forEach((question,index)=>{const at=Number(question.time);if(at<start-.001||at>end+.001)return;const marker=document.createElement("button");marker.type="button";marker.style.insetInlineStart=`${Math.min(100,Math.max(0,(at-start)/duration*100))}%`;marker.className=flippedStudentState.answers.has(question.id)?"answered":"";marker.title=`السؤال ${index+1} عند ${format(at-start)}`;marker.onclick=()=>{if(flippedStudentState.waiting)return toast("أجيبي عن السؤال الحالي أولًا");const blocked=nextBlocking(at);if(blocked&&!flippedStudentState.answers.has(blocked.id)){showQuestion(blocked);return;}video.currentTime=at;flippedStudentState.lastTime=at;update();};layer.append(marker);});}
  function renderStudentFlippedSummary(){video.pause();const section=document.getElementById("studentFlippedSummary");section.hidden=false;section.innerHTML=`<h2>راجعي إجاباتكِ قبل التسليم</h2><p>أجبتِ عن ${flippedStudentState.answers.size} من ${lesson.questions.length}. بعد التسليم ستُقفل الإجابات.</p><button class="primary-button" id="submitFlippedLesson" type="button">تسليم الإجابات</button>`;document.getElementById("submitFlippedLesson").onclick=async(event)=>{if(!confirm("هل تريدين تسليم الإجابات؟ لن تتمكني من تعديلها بعد ذلك."))return;event.currentTarget.disabled=true;const answers=Object.fromEntries([...flippedStudentState.answers.entries()].map(([key,value])=>[String(key),value]));try{await api(`/flipped-classroom/${lesson.id}/submit`,{method:"POST",body:JSON.stringify({submissionId:flippedStudentState.submissionId,answers})});toast("تم تسليم الإجابات وقفلها.");const refreshed=await api(`/flipped-classroom/${lesson.id}`,{cache:"no-store"});renderStudentFlippedResult(refreshed.lesson);}catch(error){toast(error.message);event.currentTarget.disabled=false;}};section.scrollIntoView({behavior:"smooth",block:"center"});}
  function finishClip(){const {end}=clipBounds();video.pause();video.currentTime=end;update();const unanswered=lesson.questions.find((question)=>!flippedStudentState.answers.has(question.id));unanswered?showQuestion(unanswered):renderStudentFlippedSummary();}
  video.addEventListener("loadedmetadata",()=>{const {start}=clipBounds();video.currentTime=start;flippedStudentState.lastTime=start;update();renderStudentFlippedMarkers();const firstQuestion=lesson.questions.find((item)=>Math.abs(Number(item.time)-start)<=.2&&!flippedStudentState.answers.has(item.id));if(firstQuestion)showQuestion(firstQuestion);});
  video.addEventListener("timeupdate",()=>{const {start,end}=clipBounds();let current=Number(video.currentTime)||0;if(current<start-.05){video.currentTime=start;current=start;}update();if(flippedStudentState.waiting)return;const question=lesson.questions.find((item)=>!flippedStudentState.answers.has(item.id)&&Number(item.time)<=Math.min(current,end)+.2&&Number(item.time)>=flippedStudentState.lastTime-.35);if(question){showQuestion(question);return;}flippedStudentState.lastTime=current;if(current>=end-.05&&end>start)finishClip();});
  video.addEventListener("play",()=>{const {start,end}=clipBounds();if(Number(video.currentTime)<start-.05||Number(video.currentTime)>=end-.05){video.currentTime=start;flippedStudentState.lastTime=start;}const blocking=nextBlocking(video.currentTime);if(flippedStudentState.waiting||blocking){video.pause();blocking&&showQuestion(blocking);toast("أجيبي عن السؤال أولًا");}update();});video.addEventListener("pause",update);video.addEventListener("ended",finishClip);
  play.onclick=()=>{if(flippedStudentState.waiting)return toast("أجيبي عن السؤال أولًا");const {start,end}=clipBounds();if(Number(video.currentTime)>=end-.05){video.currentTime=start;flippedStudentState.lastTime=start;}const blocking=nextBlocking(video.currentTime);if(blocking){showQuestion(blocking);return;}video.paused?video.play().catch(()=>{}):video.pause();};seek.oninput=()=>{if(!video.duration||flippedStudentState.waiting)return;const {start,duration}=clipBounds();const target=start+Number(seek.value)/1000*duration;const blocked=nextBlocking(target);if(blocked){showQuestion(blocked);seek.value=String(Math.round(relativeTime(blocked.time)/duration*1000));return;}video.currentTime=target;flippedStudentState.lastTime=target;update();};document.getElementById("flippedBack").onclick=()=>strategies().catch(errorView);
}

function renderStudentFlippedResult(lesson) {
  const submission=lesson.submission||{};const answers=submission.answers||{};const reviewed=submission.status==="reviewed";const attemptLabel=studentFlippedAttemptLabel(submission);const attemptTone=studentFlippedAttemptTone(submission);
  content.innerHTML=`<section class="student-flipped-result"><span>✓</span><small>${reviewed?"تمت مراجعة المعلمة":"بانتظار مراجعة المعلمة"}</small><h1>${esc(lesson.title)}</h1>${attemptLabel?`<div class="student-flipped-result-attempt${attemptTone}">${esc(attemptLabel)}</div>`:""}<strong>${submission.total==null?"—":Number(submission.total).toFixed(2)} / ${submission.max==null?"—":Number(submission.max).toFixed(2)}</strong><p>${reviewed?`النتيجة النهائية ${Number(submission.percent||0).toFixed(0)}٪.`:"تم تصحيح أسئلة الاختيار آليًا، وتبقى النتيجة نهائية بعد مراجعة الإجابات المقالية."}</p><div class="student-flipped-feedback">${lesson.questions.map((question,index)=>{const answer=answers[String(question.id)]||{};return `<article><b>السؤال ${index+1}</b><span>${question.type==="essay"&&!reviewed?"بانتظار المراجعة":answer.points==null?"—":`${answer.points} / ${question.maxPoints}`}</span>${answer.feedback?`<p>${esc(answer.feedback)}</p>`:""}</article>`;}).join("")}</div><div class="student-flipped-result-actions">${submission.canRetry?'<button class="primary-button" id="retryFlippedLesson" type="button">إعادة المحاولة</button>':""}<button class="student-learning-secondary" id="flippedResultBack" type="button">العودة للدروس</button></div></section>`;
  document.getElementById("flippedResultBack").onclick=()=>strategies().catch(errorView);
  const retryButton=document.getElementById("retryFlippedLesson");if(retryButton)retryButton.onclick=async()=>{retryButton.disabled=true;retryButton.textContent="جارٍ بدء المحاولة…";try{const started=await api(`/flipped-classroom/${lesson.id}/start`,{method:"POST",body:"{}"});await openStudentFlippedLesson(lesson.id,started);}catch(error){toast(error.message);retryButton.disabled=false;retryButton.textContent="إعادة المحاولة";}};
}

function library() {
  setActive("library");
  content.innerHTML = `
    <section class="student-learning-section-hero library">
      <span aria-hidden="true">📚</span>
      <div><small>مصادري التعليمية</small><h1>الموارد المكتبية</h1><p>فيديوهات وتدريبات مرتبة تساعدكِ على المراجعة والتدرب في أي وقت.</p></div>
    </section>
    <section class="student-resource-grid">
      <article class="student-resource-card videos">
        <span class="student-resource-icon" aria-hidden="true">🎬</span>
        <div><small>مشاهدة وتعلّم</small><h2>الفيديوهات</h2><p>شروحات مرئية مبسطة للدروس والمهارات الرياضية.</p></div>
        <strong>ستظهر هنا الفيديوهات التي تضيفها المعلمة</strong>
      </article>
      <article class="student-resource-card training">
        <span class="student-resource-icon" aria-hidden="true">📝</span>
        <div><small>تطبيق وممارسة</small><h2>التدريبات</h2><p>تدريبات متنوعة تساعدكِ على تثبيت المفاهيم ورفع مستوى الإتقان.</p></div>
        <strong>ستظهر هنا التدريبات التي تضيفها المعلمة</strong>
      </article>
    </section>`;
}

const studentPlanningContentLabels = { presentation: "عرض تقديمي", activity: "نشاط", explanation: "شرح", game: "لعبة" };
const studentPlanningDestinationLabels = { "library-worksheets":"أوراق العمل", "library-training":"التدريبات", "library-videos":"الفيديوهات", "semester-plans": "الخطط الفصلية", "interactive-presentations": "العروض التفاعلية", "professional-community": "المجتمع المهني" };
const studentPlanningSourceLabels = { video:"فيديو", html: "HTML", zip: "ويب تفاعلي", pdf: "PDF", image: "صورة" };

let studentLibraryMode = "worksheets";
async function planningContent() {
  setActive("planning-content");
  content.innerHTML = '<div class="card loading">جارٍ تحميل محتوى معلمتكِ…</div>';
  const data = await api("/planning-content", { cache: "no-store" });
  const allItems = Array.isArray(data.items) ? data.items : [];
  const category = item => item.destination.startsWith('library-') ? item.destination.slice(8) : item.sourceType === 'video' ? 'videos' : item.contentType === 'activity' || item.contentType === 'game' ? 'training' : 'worksheets';
  const items = allItems.filter(item => category(item) === studentLibraryMode);
  content.innerHTML = `
    <section class="student-planning-hero">
      <div><small>محتوى اختارته معلمتي</small><h1>محتوى معلمتي</h1><p>عروض وأنشطة وشروحات مرتبطة بدروس فصلكِ، وتُفتح داخل عارض مدار الآمن.</p></div>
      <span aria-hidden="true">▧</span>
    </section>
    ${!data.migrationReady ? `<div class="student-planning-notice"><span>⚙️</span><p>هذا القسم قيد التجهيز وسيظهر المحتوى بعد تفعيله من المدرسة.</p></div>` : ""}
    <nav aria-label="أقسام محتوى معلمتي" style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0">${[['worksheets','أوراق العمل'],['training','التدريبات'],['videos','الفيديوهات']].map(([key,label])=>`<button type="button" data-student-library="${key}" aria-pressed="${studentLibraryMode===key}" style="padding:12px 22px;border:1px solid #d7c7ed;border-radius:14px;cursor:pointer;font:inherit;background:${studentLibraryMode===key?'#55249a':'#fff'};color:${studentLibraryMode===key?'#fff':'#321c55'}">${label}</button>`).join('')}</nav>
    <section class="student-planning-grid">${items.length ? items.map((item) => {
      const cover = item.hasCover
        ? `<img src="${esc(item.coverUrl)}" alt="غلاف ${esc(item.name)}" loading="lazy">`
        : `<div class="student-planning-fallback source-${esc(item.sourceType)}"><strong>${item.sourceType === "pdf" ? "PDF" : item.sourceType === "image" ? "▧" : "⌘"}</strong><small>${esc(studentPlanningSourceLabels[item.sourceType] || item.sourceType)}</small></div>`;
      return `<article class="student-planning-card">
        <div class="student-planning-cover">${cover}<span>${esc(studentPlanningContentLabels[item.contentType] || item.contentType)}</span></div>
        <div class="student-planning-copy"><div class="student-planning-tags"><b>${esc(studentPlanningDestinationLabels[item.destination] || item.destination)}</b><b>${esc(studentPlanningSourceLabels[item.sourceType] || item.sourceType)}</b></div><h2>${esc(item.name)}</h2><p>${esc(item.stage)} · ${esc(item.gradeLabel)}</p><dl><div><dt>الوحدة</dt><dd>${studentArabicNumber(item.unitNumber)}</dd></div><div><dt>الدرس</dt><dd>${studentArabicNumber(item.lessonNumber)} · ${esc(item.lessonName)}</dd></div></dl><a style="display:inline-flex" href="${esc(item.playerUrl)}">${item.destination==='library-worksheets'?'مشاهدة المحتوى':'فتح المحتوى'} <span aria-hidden="true">←</span></a></div>
      </article>`;
    }).join("") : `<div class="student-planning-empty"><span aria-hidden="true">▧</span><h2>لا يوجد محتوى منشور حاليًا</h2><p>سيظهر هنا ما تنشره معلمتكِ لفصلكِ في الفصل الدراسي الحالي.</p></div>`}</section>`;
  content.querySelectorAll('[data-student-library]').forEach(button=>button.onclick=()=>{studentLibraryMode=button.dataset.studentLibrary;planningContent();});
}

const studentKnowledgeMeta = {
  worksheet: { label: "أوراق عمل", icon: "📝", description: "أوراق تعليمية وتدريبات أضافتها معلمتكِ." },
  summary: { label: "ملخصات", icon: "📄", description: "ملخصات مرتبة تساعدكِ على مراجعة الدروس." },
  video: { label: "فيديوهات", icon: "🎬", description: "روابط شروحات فيديو من يوتيوب أو مصادر أخرى." },
  nafes: { label: "نافس", icon: "🎯", description: "مواد وتدريبات نافس المرسلة لطالبات الابتدائي والمتوسط." },
  tahsili_abilities: { label: "التحصيلي والقدرات", icon: "🏆", description: "مواد التحصيلي والقدرات المرسلة لطالبات المرحلة الثانوية." },
};

async function knowledgeExchange() {
  setActive("knowledge-exchange");
  const data = await api("/knowledge-exchange");
  const visibleMeta = Object.fromEntries(Object.entries(studentKnowledgeMeta).filter(([key]) => Object.prototype.hasOwnProperty.call(data.categories || {}, key)));
  if (!visibleMeta[studentKnowledgeCategory]) studentKnowledgeCategory = Object.keys(visibleMeta)[0] || "summary";
  const meta = visibleMeta[studentKnowledgeCategory] || studentKnowledgeMeta.summary;
  const resources = data.resources.filter((item) => item.category === studentKnowledgeCategory);
  content.innerHTML = `
    <section class="student-learning-section-hero knowledge">
      <span aria-hidden="true">🤝</span>
      <div><small>محتوى تشاركه معلمتي</small><h1>تبادل المعرفة</h1><p>أوراق عمل وملخصات وفيديوهات تساعدكِ على الفهم والمراجعة.</p></div>
    </section>
    <div class="student-knowledge-tabs" role="tablist" aria-label="أقسام تبادل المعرفة">
      ${Object.entries(visibleMeta).map(([key, item]) => `<button type="button" class="${studentKnowledgeCategory === key ? "active" : ""}" data-student-knowledge="${key}"><span aria-hidden="true">${item.icon}</span><b>${item.label}</b></button>`).join("")}
    </div>
    <section class="student-knowledge-panel">
      <header><span aria-hidden="true">${meta.icon}</span><div><h2>${meta.label}</h2><p>${meta.description}</p></div></header>
      <div class="student-knowledge-list">${resources.length ? resources.map((item) => {
        const action = item.resourceType === "link"
          ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${item.category === "video" ? "شاهدي الفيديو" : "افتحي الرابط"}</a>`
          : `<a href="/api/student/knowledge-exchange/${item.id}/file" target="_blank" rel="noopener">افتحي الملف</a>`;
        return `<article class="student-knowledge-item"><span aria-hidden="true">${meta.icon}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.description || "مورد تعليمي من معلمتكِ")}</p><small>${studentDate(item.createdAt)}${item.originalName ? ` · ${esc(item.originalName)}` : ""}</small></div>${action}</article>`;
      }).join("") : `<div class="student-empty-state"><span>${meta.icon}</span><strong>لا توجد ${meta.label} بعد</strong><p>ستظهر هنا المواد التي تضيفها معلمتكِ.</p></div>`}</div>
    </section>`;
  document.querySelectorAll("[data-student-knowledge]").forEach((button) => {
    button.onclick = () => {
      studentKnowledgeCategory = button.dataset.studentKnowledge;
      knowledgeExchange().catch(errorView);
    };
  });
}

async function learning() {
  setActive("learning");
  const data = await api("/learning-style/questions");
  const questions = Array.isArray(data.questions) ? data.questions : [];
  const answers = {};
  let questionIndex = 0;

  const scoreBars = (result) => {
    if (!result) return "";
    const percentages = result.percentages || {};
    return `<div class="student-learning-score-bars">${["visual","auditory","reading_writing","kinesthetic"].map((key) => {
      const meta = studentLearningStyleMeta(key);
      const percent = Number(percentages[key] || 0);
      return `<div><label><span>${meta.label}</span><strong>${studentArabicNumber(Math.round(percent))}%</strong></label><div><span style="width:${Math.max(0,Math.min(100,percent))}%;background:${meta.color}"></span></div></div>`;
    }).join("")}</div>`;
  };

  const renderResult = (result, saved = true) => {
    const meta = studentLearningStyleMeta(result.resultStyle);
    content.innerHTML = `
      <section class="student-learning-hero-card result-mode">
        <span aria-hidden="true">✦</span>
        <div><small>اكتمل التحليل الإرشادي</small><h1>نمطكِ الأقرب هو <em class="${meta.css}">${meta.label}</em></h1><p>${esc(meta.tip)}</p></div>
      </section>
      <section class="student-learning-result-card">
        <div class="student-learning-result-icon">✦</div>
        <h2>نتيجتكِ بالتفصيل</h2>
        <p>هذه النتيجة تساعدكِ ومعلمتكِ على تنويع طرق التعلم، وليست تشخيصًا ثابتًا لشخصيتكِ أو قدراتكِ.</p>
        ${scoreBars(result)}
        <div class="student-learning-saved-note">${saved ? "✓ تم حفظ النتيجة وإرسالها إلى لوحة معلمتكِ" : "هذه آخر نتيجة محفوظة في حسابكِ"}</div>
        <div class="student-learning-result-actions">
          ${data.available ? '<button class="student-learning-primary" id="restartLearningSurvey">إعادة الاستبانة</button>' : ""}
          <button class="student-learning-secondary" id="backLearningHome">العودة للرئيسية</button>
        </div>
      </section>`;
    document.getElementById("restartLearningSurvey")?.addEventListener("click", () => { Object.keys(answers).forEach((key) => delete answers[key]); questionIndex = 0; renderQuiz(); });
    document.getElementById("backLearningHome").onclick = home;
  };

  const renderQuiz = () => {
    const question = questions[questionIndex];
    if (!question) return;
    const answered = Object.keys(answers).length;
    const progress = Math.max(((questionIndex + 1) / questions.length) * 100, (answered / questions.length) * 100);
    content.innerHTML = `
      <section class="student-learning-quiz-shell">
        <header class="student-learning-quiz-brand"><span>✦</span><div><strong>استبانة نمط تعلّمي</strong><small>لا توجد إجابة صحيحة أو خاطئة</small></div></header>
        <div class="student-learning-progress-meta"><span>السؤال ${studentArabicNumber(questionIndex + 1)} من ${studentArabicNumber(questions.length)}</span><span>${studentArabicNumber(Math.round(answered / questions.length * 100))}% مكتمل</span></div>
        <div class="student-learning-progress"><span style="width:${progress}%"></span></div>
        <article class="student-learning-question"><small>موقف ${studentArabicNumber(String(question.id).padStart(2,"0"))}</small><h1>${esc(question.prompt)}</h1><p>${esc(question.context)}</p></article>
        <div class="student-learning-options">${question.options.map((option,index) => `<button type="button" data-student-learning-option="${esc(option.style)}" class="${answers[question.id] === option.style ? "selected" : ""}"><span>${MADAR_OPTION_LABELS[index]}</span><b>${esc(option.text)}</b><i>✓</i></button>`).join("")}</div>
        <div class="student-learning-quiz-actions">
          <button type="button" class="student-learning-secondary" id="learningPrevious" ${questionIndex === 0 ? "disabled" : ""}>السابق</button>
          ${questionIndex < questions.length - 1
            ? `<button type="button" class="student-learning-primary" id="learningNext" ${answers[question.id] ? "" : "disabled"}>التالي ←</button>`
            : `<button type="button" class="student-learning-primary" id="learningFinish" ${answered === questions.length ? "" : "disabled"}>إظهار نتيجتي ✦</button>`}
        </div>
      </section>`;
    document.querySelectorAll("[data-student-learning-option]").forEach((button) => {
      button.onclick = () => { answers[question.id] = button.dataset.studentLearningOption; renderQuiz(); };
    });
    document.getElementById("learningPrevious").onclick = () => { if (questionIndex > 0) { questionIndex -= 1; renderQuiz(); } };
    document.getElementById("learningNext")?.addEventListener("click", () => { if (answers[question.id]) { questionIndex += 1; renderQuiz(); } });
    document.getElementById("learningFinish")?.addEventListener("click", async () => {
      const finishButton = document.getElementById("learningFinish");
      finishButton.disabled = true;
      finishButton.textContent = "جارٍ حفظ النتيجة…";
      try {
        const payload = Object.entries(answers).map(([id,style]) => ({ id: Number(id), style }));
        const result = await api("/learning-style/submit", { method: "POST", body: JSON.stringify({ answers: payload }) });
        me.learning_style = result.resultStyle;
        toast(`نمط تعلمكِ الإرشادي: ${studentLearningStyleMeta(result.resultStyle).label}`);
        renderResult(result, true);
      } catch (error) {
        toast(error.message);
        finishButton.disabled = false;
        finishButton.textContent = "إظهار نتيجتي ✦";
      }
    });
  };

  content.innerHTML = `
    <section class="student-learning-hero-card">
      <span aria-hidden="true">🎨</span>
      <div><small>اكتشفي طريقتكِ المفضلة</small><h1>كيف أحب أن <em>أتعلّم؟</em></h1><p>${esc(data.notice)}</p></div>
    </section>
    ${data.available ? `
      <section class="student-learning-intro-grid">
        <article class="student-learning-intro-card"><span>١٠</span><div><h2>مواقف قصيرة</h2><p>اختاري في كل موقف الطريقة الأقرب لما تفعلينه غالبًا.</p></div></article>
        <article class="student-learning-intro-card"><span>٤</span><div><h2>أنماط إرشادية</h2><p>بصري، سمعي، قرائي/كتابي، وحركي/تطبيقي.</p></div></article>
        <article class="student-learning-intro-card"><span>✓</span><div><h2>بدون درجات</h2><p>لا توجد إجابة صحيحة أو خاطئة، والمهم أن تختاري بصدق.</p></div></article>
      </section>
      <section class="student-learning-start-card">
        <div><span>✦</span><div><h2>${data.latestResult ? "يمكنكِ تحديث نتيجتكِ" : "الاستبانة جاهزة لكِ"}</h2><p>تحتاج نحو دقيقتين، ويمكن أن تتغير النتيجة مع الوقت والخبرة.</p></div></div>
        <button class="student-learning-primary" id="startLearningSurvey">${data.latestResult ? "إعادة الاستبانة" : "ابدئي الاستبانة"} ←</button>
      </section>` : `
      <section class="student-learning-unavailable"><span>🗓️</span><h2>الاستبانة غير منشورة حاليًا</h2><p>ستظهر هنا عندما تنشرها معلمتكِ لفصلكِ.</p></section>`}
    ${data.latestResult ? `<section class="student-learning-last-result"><div><span>آخر نتيجة</span><h2>${studentLearningStyleMeta(data.latestResult.resultStyle).label}</h2><p>${esc(studentLearningStyleMeta(data.latestResult.resultStyle).tip)}</p></div><button class="student-learning-secondary" id="showLastLearningResult">عرض التفاصيل</button></section>` : ""}`;

  document.getElementById("startLearningSurvey")?.addEventListener("click", renderQuiz);
  document.getElementById("showLastLearningResult")?.addEventListener("click", () => renderResult(data.latestResult, false));
}

async function account(force = false) {
  setActive("account");
  content.innerHTML = `<div class="card account-card"><h2>حسابي</h2>${force ? '<div class="warning-box">لحماية حسابك، غيّري كلمة المرور المؤقتة قبل المتابعة.</div>' : ""}
    <p><strong>الاسم:</strong> ${esc(me.name)}</p><p><strong>البريد:</strong> ${esc(me.email)}</p>
    <form id="passwordForm"><label>كلمة المرور الحالية<input type="password" id="currentPassword" required></label><label>كلمة المرور الجديدة<input type="password" id="newPassword" required minlength="10" placeholder="10 أحرف على الأقل، منها حرف ورقم"></label><label>تأكيد كلمة المرور<input type="password" id="confirmPassword" required minlength="10"></label><div id="passwordMessage"></div><button class="primary-button">تغيير كلمة المرور</button></form>
  </div>`;
  document.getElementById("passwordForm").onsubmit = async (event) => {
    event.preventDefault();
    const message = document.getElementById("passwordMessage");
    try {
      await api("/password", { method: "PUT", body: JSON.stringify({ currentPassword: document.getElementById("currentPassword").value, newPassword: document.getElementById("newPassword").value, confirmPassword: document.getElementById("confirmPassword").value }) });
      me.must_change_password = 0;
      message.innerHTML = '<div class="success-box">تم تغيير كلمة المرور بنجاح.</div>';
      toast("تم تأمين حسابك بنجاح");
      setTimeout(home, 700);
    } catch (error) { message.innerHTML = `<div class="form-error">${esc(error.message)}</div>`; }
  };
}


async function calendar() {
  setActive("calendar");
  const data=await api("/enhancements/calendar");
  const items=data.items||[];
  const label=(v)=>({test:"اختبار",homework:"واجب",task:"مهمة",meeting:"لقاء",announcement:"إعلان",remedial:"خطة علاجية",other:"موعد"})[v]||"موعد";
  content.innerHTML=`<section class="student-learning-section-hero calendar"><span>📅</span><div><small>مواعيدي الدراسية</small><h1>التقويم والمواعيد</h1><p>الاختبارات والواجبات والمهام التي حددتها معلمتكِ.</p></div></section>${items.length?`<div class="student-calendar-grid">${items.map(item=>`<article class="student-calendar-item"><time>${studentDate(item.starts_at)}</time><span>${label(item.event_type)}</span><h2>${esc(item.title)}</h2><p>${esc(item.description||"موعد دراسي")}</p><small>${esc(item.class_name||"")}</small></article>`).join("")}</div>`:`<div class="student-empty-state"><span>📅</span><strong>لا توجد مواعيد قادمة</strong><p>ستظهر المواعيد الجديدة هنا تلقائيًا.</p></div>`}`;
}

function remedialStudentAttachments(plan) {
  return (plan.attachments||[]).map(item=>{
    const id=Number(item.copy_id);
    if(item.kind==='test')return `<button class="primary-button" data-remedial-test="${id}" style="margin:5px">اختبار: ${esc(item.title)}</button>`;
    const url=item.kind==='game'?`/games/game-player.php?game=${id}`:`/planning/content-player.php?content=${id}`;
    return `<a href="${url}" style="display:inline-block;margin:5px">${esc(item.title)}</a>`;
  }).join('');
}

async function remedial() {
  setActive("remedial");
  const data=await api("/enhancements/remedial");
  const plans=(data.plans||[]).map((plan)=>({...plan,recommended_resource_url:studentSafeResourceUrl(plan.recommended_resource_url)}));
  const resources=(data.resources||[]).map((resource)=>({...resource,resource_url:studentSafeResourceUrl(resource.resource_url)}));
  const games=data.games||[];
  const status=(v)=>({planned:"مخططة",in_progress:"قيد التنفيذ",completed:"مكتملة",reassessed:"تمت إعادة القياس",cancelled:"ملغاة"})[v]||v;
  content.innerHTML=`<section class="student-learning-section-hero remedial"><span>🩺</span><div><small>تعلم مخصص</small><h1>خطتي العلاجية</h1><p>أنشطة مقترحة بناءً على المهارات التي تحتاج مزيدًا من التدريب.</p></div></section>
  <div class="student-remedial-grid">${plans.length?plans.map(plan=>`<article class="student-remedial-card"><div><span>${status(plan.status)}</span><small>${plan.due_date?`الموعد: ${studentDate(plan.due_date)}`:"بدون موعد"}</small></div><h2>${esc(plan.skill_name||plan.title)}</h2><p>${esc(plan.recommended_activity||plan.diagnosis||"تدريب متدرج مع تغذية راجعة")}</p><div class="student-remedial-progress"><label><span>قبل العلاج ${Number(plan.before_percent||0)}٪</span><strong>الهدف ${Number(plan.target_percent||70)}٪</strong></label><div><i style="width:${Math.max(0,Math.min(100,Number(plan.after_percent??plan.before_percent??0)))}%"></i></div></div>${remedialStudentAttachments(plan)}${plan.recommended_resource_url?`<a href="${esc(plan.recommended_resource_url)}" rel="noopener noreferrer">ابدئي النشاط</a>`:""}</article>`).join(""):`<div class="student-empty-state"><span>🌟</span><strong>لا توجد خطة علاجية الآن</strong><p>هذا يعني أنه لا توجد خطة نشطة مسجلة لكِ حاليًا.</p></div>`}</div>
  <section class="student-section-card"><header><div><small>موارد مساندة</small><h2>أنشطة وألعاب مقترحة</h2></div></header><div class="student-resource-grid">${resources.length?resources.map(r=>`<article><span>${r.resource_type==="game"?"🎮":"📚"}</span><div><h3>${esc(r.title)}</h3><p>${esc(r.description||"")}</p><small>${esc(r.skill_name||"مهارة عامة")}</small></div>${r.resource_url?`<a href="${esc(r.resource_url)}" rel="noopener noreferrer">فتح</a>`:""}</article>`).join(""):`<p>لا توجد موارد إضافية.</p>`}</div></section>
  <section class="student-section-card"><header><div><small>تقدمي في الألعاب</small><h2>آخر محاولات الألعاب</h2></div></header>${games.length?`<div class="table-wrap"><table><thead><tr><th>اللعبة</th><th>المستوى</th><th>الدقة</th><th>النقاط</th><th>التاريخ</th></tr></thead><tbody>${games.map(g=>`<tr><td>${g.game_key==="percentage-challenge"?"تحدي النسبة المئوية":esc(g.game_key)}</td><td>${esc(g.difficulty)}</td><td>${Number(g.accuracy||0)}٪</td><td>${Number(g.score||0)}</td><td>${studentDate(g.played_at)}</td></tr>`).join("")}</tbody></table></div>`:`<p>لم تسجلي محاولات ألعاب بعد.</p>`}</section>`;
  content.querySelectorAll('[data-remedial-test]').forEach(button=>button.onclick=()=>openTest(button.dataset.remedialTest));
}

async function help() {
  setActive("help");
  content.innerHTML=`<section class="student-learning-section-hero help"><span>❓</span><div><small>دليل مدار</small><h1>مركز المساعدة</h1><p>شرح سريع لأهم أقسام حساب الطالبة.</p></div></section><div class="student-help-grid">${[["📝","اختباراتي","ادخلي الاختبار المنشور وأرسلي الإجابات قبل انتهاء الوقت."],["📊","نتائجي","شاهدي درجاتكِ والمهارات التي أتقنتِها والمهارات التي تحتاج تدريبًا."],["🩺","خطتي العلاجية","اتبعي النشاط المقترح ثم أعيدي القياس عندما تحدد المعلمة اختبارًا قصيرًا."],["🎮","الألعاب","نتائج ألعابكِ تُحفظ في حسابكِ وتساعد على متابعة التدريب."],["📁","ملف إنجازي","ارفعي الواجبات والمشروعات لتراجعها المعلمة."],["🔐","حسابي","غيّري كلمة المرور المؤقتة ولا تشاركيها مع أي شخص."]].map(([i,t,d])=>`<article><span>${i}</span><h2>${t}</h2><p>${d}</p></article>`).join("")}</div><section class="student-section-card"><h2>الخصوصية</h2><p>لا يستطيع أي مستخدم رؤية كلمة مروركِ. تُعرض بياناتكِ للمعلمة المسؤولة وولي الأمر المرتبط وفق الصلاحيات.</p><p><a href="/privacy.html" target="_blank">سياسة الخصوصية</a> · <a href="/terms.html" target="_blank">شروط الاستخدام</a></p></section>`;
}

const views = { home, tests, "paper-assessments": paperAssessments, games, strategies, library, "planning-content": planningContent, "knowledge-exchange": knowledgeExchange, portfolio, points, results, learning, calendar, remedial, help, account };
document.querySelectorAll("[data-view]").forEach((button) => {
  button.onclick = () => {
    if (Number(me?.must_change_password) === 1 && button.dataset.view !== "account") {
      toast("غيّري كلمة المرور المؤقتة أولًا");
      account(true);
      return;
    }
    sessionStorage.setItem("madar-student-view",button.dataset.view);
    views[button.dataset.view]().catch(errorView);
  };
});

document.getElementById("studentLogout").onclick = async () => {
  clearInterval(examTimer);
  const result = await api("/logout", { method: "POST" });
  sessionStorage.removeItem("madar-csrf");
  location.href = result?.previewEnded ? (result.redirect || "/owner/dashboard") : "/login.html?role=student";
};

(async () => {
  try {
    me = await api("/me");
    csrf = me.csrfToken;
    document.getElementById("studentName").textContent = me.name;
    if (Number(me.must_change_password) === 1) account(true);
    else {
      const initialView=sessionStorage.getItem("madar-student-view")||"home";
      (views[initialView]||home)().catch(errorView);
    }
    showCurrentAnnouncement().catch(() => {});
  } catch (error) { errorView(error); }
})();
