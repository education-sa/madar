const content = document.getElementById("studentContent");
const modalRoot = document.getElementById("studentModal");
const toastRoot = document.getElementById("studentToast");
let csrf = sessionStorage.getItem("madar-csrf") || "";
let me = null;
let examTimer = null;
let studentKnowledgeCategory = "worksheet";

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
  homework: { label: "واجباتي", icon: "📖" },
  participation: { label: "مشاركاتي", icon: "🙋‍♀️" },
  attendance: { label: "حضوري", icon: "🗓️" },
  task: { label: "مهامي", icon: "📚" },
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
      `<label><input required type="radio" name="q${question.id}" value="${esc(option)}"> ${MADAR_OPTION_LABELS[optionIndex] || studentArabicNumber(optionIndex + 1, stage)}) ${studentMathHtml(stripStudentOptionLabel(option), stage)}</label>`
    ).join("");
  } else if (question.type === "true_false") {
    answers = ["صح", "خطأ"].map((option, optionIndex) =>
      `<label><input required type="radio" name="q${question.id}" value="${option}"> ${MADAR_OPTION_LABELS[optionIndex]}) ${option}</label>`
    ).join("");
  } else {
    answers = `<label><input required type="text" name="q${question.id}" placeholder="اكتبي الإجابة بالأرقام والرموز العربية"></label>`;
  }
  return `<section class="question"><strong>${questionNumber}. ${studentMathHtml(question.question_text, stage)}</strong>${answers}</section>`;
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

function setActive(view) {
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
        <span class="student-stat-icon" aria-hidden="true">🪙</span><span class="student-stat-copy"><b>نقاط مدار</b><strong>${Number(data.totalPoints || 0)}</strong><small>نقطة تحفيزية</small></span><span class="student-stat-arrow" aria-hidden="true">←</span>
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
    modalRoot.innerHTML = `<div class="modal-overlay"><form class="modal" id="examForm">
      <div class="exam-heading"><div><h2>${esc(test.title)}</h2><p>${timedTest ? "يُسلّم الاختبار تلقائيًا عند انتهاء الوقت." : "هذا الاختبار بدون وقت محدد."} <span class="exam-form-number">نموذج رقم ${studentArabicNumber(Number(test.formNumber || 1), stage)}</span></p></div>${timedTest ? '<strong id="examTimer" class="exam-timer">--:--</strong>' : '<strong class="exam-timer">بدون وقت</strong>'}</div>
      ${test.questions.map((question, index) => studentQuestionMarkup(question, index, stage)).join("")}
      <div class="modal-actions"><button type="button" class="secondary-button" id="closeExam">الخروج مؤقتًا</button><button class="primary-button" id="submitExam" type="submit">تسليم وتصحيح</button></div>
    </form></div>`;
    const form = document.getElementById("examForm");
    document.getElementById("closeExam").onclick = () => { clearInterval(examTimer); modalRoot.innerHTML = ""; };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const submitButton = document.getElementById("submitExam");
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
        submitButton.disabled = false;
        submitButton.textContent = "تسليم وتصحيح";
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
        <p>كل إنجاز يصنع فرقًا. هنا تجدين مجموع نقاطكِ وسجل ما حققته في الواجبات والمشاركة والحضور والمهام.</p>
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
      ${Object.entries(pointSectionMeta).map(([key, item]) => `<article class="points-overview-card ${key === "all" ? "main" : ""}"><span aria-hidden="true">${item.icon}</span><div><strong>${Number(data.summary?.[key] || 0)}</strong><small>${item.label}</small></div></article>`).join("")}
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
    const rows = section === "all" ? data.history : data.history.filter((entry) => entry.category === section);
    tabs.forEach((tab) => {
      const active = tab.dataset.pointsSection === section;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    icon.textContent = meta.icon;
    title.textContent = section === "all" ? "سجل النقاط" : meta.label;
    subtitle.textContent = section === "all" ? "جميع نقاط مدار التي حصلتِ عليها." : `النقاط المسجلة في قسم ${meta.label}.`;
    total.textContent = `${Number(data.summary?.[section] || 0)} نقطة`;
    historyRoot.innerHTML = rows.length ? `<div class="student-points-list">${rows.map((entry) => {
      const reasonText = entry.details || entry.reason;
      const category = entry.category === "other" ? { label: entry.reason || "سبب آخر", icon: "💡" } : pointSectionMeta[entry.category] || { label: entry.categoryLabel, icon: "✨" };
      return `<article class="student-point-entry">
        <div class="student-point-icon" aria-hidden="true">${category.icon}</div>
        <div class="student-point-copy"><h3>${esc(reasonText)}</h3><p><span>${esc(category.label)}</span> · ${studentDate(entry.createdAt)}</p></div>
        <strong class="student-point-value ${Number(entry.points) < 0 ? "negative" : ""}">${Number(entry.points) > 0 ? "+" : ""}${Number(entry.points)} <small>نقطة</small></strong>
      </article>`;
    }).join("")}</div>` : `<div class="points-empty"><span aria-hidden="true">${meta.icon}</span><strong>لا توجد نقاط في ${meta.label} بعد</strong><p>ستظهر هنا النقاط التي تضيفها المعلمة لهذا القسم.</p></div>`;
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
  const gamePageByKey = new Map((gameCatalog.catalog || []).map((game) => [game.gameKey, game.playPath]));
  content.innerHTML = `
    <section class="portfolio-hero">
      <div><span>📁 مساحتي الخاصة</span><h1>ملف إنجازي</h1><p>اجمعي أعمالكِ المميزة في مكان واحد، واكتبي عنوانًا واضحًا وملاحظة تساعد معلمتكِ على معرفة تفاصيل الإنجاز.</p></div>
      <strong><b>${data.files.length}</b><small>عمل مرفوع</small></strong>
    </section>

    <section class="portfolio-workspace">
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
      </form>

      <section class="card portfolio-list-card">
        <div class="portfolio-card-heading"><span aria-hidden="true">🌟</span><div><h2>أعمالي المرفوعة</h2><p>يمكنكِ فتح أي عمل ومراجعته في أي وقت.</p></div></div>
        ${data.files.length ? `<div class="portfolio-files-list">${data.files.map((file) => {
          const meta = portfolioCategoryMeta[file.category] || portfolioCategoryMeta.other;
          const review = portfolioReviewMeta[file.reviewStatus] || portfolioReviewMeta.pending;
          const certificateKey = String(file.certificateKey || file.certificate_key || "").trim();
          const isGameCertificate = Boolean(certificateKey);
          const duplicateCertificate = isGameCertificate && /\(مكرر\)/.test(String(file.title || ""));
          const certificateLabel = duplicateCertificate ? "شهادة إتقان (مكرر)" : "شهادة إتقان";
          const kind = isGameCertificate ? certificateLabel : (file.mimeType === "application/pdf" ? "PDF" : "صورة");
          const certificateGameKey = certificateKey.split(":u", 1)[0];
          const certificateGamePath = gamePageByKey.get(certificateGameKey);
          const action = isGameCertificate && certificateGamePath
            ? `<a class="secondary-button portfolio-certificate-link" href="${esc(certificateGamePath)}?game=${encodeURIComponent(certificateGameKey)}&certificate=${encodeURIComponent(file.id)}">عرض الشهادة</a>`
            : isGameCertificate
              ? '<span class="portfolio-file-meta">تعذّر تحديد واجهة اللعبة لهذه الشهادة.</span>'
            : `<a class="secondary-button" href="/api/student/portfolio/${file.id}/file" target="_blank" rel="noopener">فتح ملفي</a>`;
          return `<article class="portfolio-file-card${isGameCertificate ? " portfolio-certificate-card" : ""}">
            <div class="portfolio-file-icon" aria-hidden="true">${meta.icon}</div>
            <div class="portfolio-file-copy"><div class="portfolio-file-labels"><span>${isGameCertificate ? certificateLabel : meta.label}</span><span class="portfolio-student-status ${esc(file.reviewStatus || "pending")}">${review.icon} ${review.label}</span>${file.awardedPoints ? `<span class="portfolio-student-points">+${Number(file.awardedPoints)} نقطة مدار ✨</span>` : ""}</div><h3>${esc(file.title)}</h3>${file.note ? `<p>${esc(file.note)}</p>` : ""}${file.teacherComment ? `<aside class="portfolio-teacher-comment"><strong>تعليق المعلمة</strong><p>${esc(file.teacherComment)}</p></aside>` : ""}<small>${esc(file.originalName)} · ${kind} · ${portfolioFileSize(file.sizeBytes)} · ${studentDate(file.createdAt)}</small></div>
            ${action}
          </article>`;
        }).join("")}</div>` : '<div class="portfolio-empty"><span aria-hidden="true">📂</span><strong>ملف إنجازكِ ينتظر أول عمل</strong><p>ارفعي واجبًا أو ورقة عمل أو مشروعًا مميزًا ليظهر هنا.</p></div>'}
      </section>
    </section>`;

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
      await portfolio();
    } catch (error) {
      message.innerHTML = `<div class="form-error">${esc(error.message)}</div>`;
      submit.disabled = false;
      submit.textContent = "ارفعي العمل إلى ملف إنجازي";
    }
  };
}

async function games() {
  setActive("games");
  const [attempts, gameCatalog] = await Promise.all([
    api("/games/attempts"),
    api("/games/catalog"),
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
    <section class="game-library">
      ${availableGames.length ? availableGames.map((game) => {
        const unitNumber = Number(game.unitNumber);
        const lessonNumber = Number(game.lessonNumber);
        const lessonCode = `${formatGameNumber(unitNumber)}-${formatGameNumber(lessonNumber)}`;
        const timeMode = game.timeMode === "timed" ? `${formatGameNumber(game.timePerQuestionSeconds)} ثانية لكل سؤال` : "وقت مفتوح";
        const playUrl = `${game.playPath}?game=${encodeURIComponent(game.gameKey)}&play=1`;
        return `<article class="game-library-card">
          <div class="game-lesson-number">${esc(lessonCode)}</div>
          <div class="game-library-copy"><h2>تحدي ${esc(game.lessonName)}</h2><p>ثلاثة مستويات، ${esc(timeMode)}، وتصحيح فوري مع شرح الحل في كل جولة.</p><div class="game-features"><span>✦ أسئلة متجددة</span><span>🏆 نقاط</span><span>⏱ ${esc(timeMode)}</span></div><a class="primary-button game-play-link" href="${esc(playUrl)}">ابدئي اللعب الآن 🎮</a></div>
        </article>`;
      }).join("") : `<div class="card student-empty-state"><span>🎮</span><strong>لا توجد لعبة جاهزة حاليًا</strong><p>${gameCatalog?.migrationReady ? "ستظهر اللعبة بعد أن تكمل المعلمة بيانات الدرس وتفعّلها." : "يلزم تجهيز بنية الألعاب ثم إضافة بيانات الدرس الفعلية من حساب المعلمة."}</p></div>`}
      <div class="card game-history">
        <h2>آخر محاولاتي</h2>
        ${attempts.length ? attempts.slice(0, 8).map((attempt) => { const game = gameByKey.get(attempt.game_key); return `<div class="test-row"><div><h3>${game ? `تحدي ${esc(game.lessonName)}` : esc(attempt.game_key)} · ${attempt.difficulty === "easy" ? "بسيط" : attempt.difficulty === "medium" ? "متوسط" : "متقدم"}</h3><p>${new Date(attempt.played_at).toLocaleString("ar-SA")} · ${attempt.correct_count}/${attempt.question_count} صحيحة</p></div><strong>${attempt.score} نقطة</strong></div>`; }).join("") : "<p>لا توجد محاولات محفوظة بعد. ابدئي أول لعبة لكِ!</p>"}
      </div>
    </section>`;
}

function strategies() {
  setActive("strategies");
  content.innerHTML = `
    <section class="student-learning-section-hero">
      <span aria-hidden="true">💡</span>
      <div><small>طرائق تساعدني على التعلّم</small><h1>الاستراتيجيات</h1><p>استخدمي الاستراتيجيات التعليمية لفهم الدروس والاستعداد للحصة بطريقة أسهل.</p></div>
    </section>
    <section class="student-resource-grid single">
      <article class="student-resource-card flipped">
        <span class="student-resource-icon" aria-hidden="true">🔄</span>
        <div><small>استراتيجية تعليمية</small><h2>الصف المقلوب</h2><p>اطّلعي على محتوى الدرس قبل الحصة، ثم شاركي في التطبيق والمناقشة مع معلمتكِ داخل الفصل.</p></div>
        <strong>سيظهر هنا المحتوى الذي تضيفه المعلمة</strong>
      </article>
    </section>`;
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

const studentKnowledgeMeta = {
  worksheet: { label: "أوراق عمل", icon: "📝", description: "أوراق تعليمية وتدريبات أضافتها معلمتكِ." },
  summary: { label: "ملخصات", icon: "📄", description: "ملخصات مرتبة تساعدكِ على مراجعة الدروس." },
  video: { label: "فيديوهات", icon: "🎬", description: "روابط شروحات فيديو من يوتيوب أو مصادر أخرى." },
};

async function knowledgeExchange() {
  setActive("knowledge-exchange");
  const data = await api("/knowledge-exchange");
  const meta = studentKnowledgeMeta[studentKnowledgeCategory];
  const resources = data.resources.filter((item) => item.category === studentKnowledgeCategory);
  content.innerHTML = `
    <section class="student-learning-section-hero knowledge">
      <span aria-hidden="true">🤝</span>
      <div><small>محتوى تشاركه معلمتي</small><h1>تبادل المعرفة</h1><p>أوراق عمل وملخصات وفيديوهات تساعدكِ على الفهم والمراجعة.</p></div>
    </section>
    <div class="student-knowledge-tabs" role="tablist" aria-label="أقسام تبادل المعرفة">
      ${Object.entries(studentKnowledgeMeta).map(([key, item]) => `<button type="button" class="${studentKnowledgeCategory === key ? "active" : ""}" data-student-knowledge="${key}"><span aria-hidden="true">${item.icon}</span><b>${item.label}</b></button>`).join("")}
    </div>
    <section class="student-knowledge-panel">
      <header><span aria-hidden="true">${meta.icon}</span><div><h2>${meta.label}</h2><p>${meta.description}</p></div></header>
      <div class="student-knowledge-list">${resources.length ? resources.map((item) => {
        const action = item.resourceType === "link"
          ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">شاهدي الفيديو</a>`
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

async function remedial() {
  setActive("remedial");
  const data=await api("/enhancements/remedial");
  const plans=data.plans||[],resources=data.resources||[],games=data.games||[];
  const status=(v)=>({planned:"مخططة",in_progress:"قيد التنفيذ",completed:"مكتملة",reassessed:"تمت إعادة القياس",cancelled:"ملغاة"})[v]||v;
  content.innerHTML=`<section class="student-learning-section-hero remedial"><span>🩺</span><div><small>تعلم مخصص</small><h1>خطتي العلاجية</h1><p>أنشطة مقترحة بناءً على المهارات التي تحتاج مزيدًا من التدريب.</p></div></section>
  <div class="student-remedial-grid">${plans.length?plans.map(plan=>`<article class="student-remedial-card"><div><span>${status(plan.status)}</span><small>${plan.due_date?`الموعد: ${studentDate(plan.due_date)}`:"بدون موعد"}</small></div><h2>${esc(plan.skill_name||plan.title)}</h2><p>${esc(plan.recommended_activity||plan.diagnosis||"تدريب متدرج مع تغذية راجعة")}</p><div class="student-remedial-progress"><label><span>قبل العلاج ${Number(plan.before_percent||0)}٪</span><strong>الهدف ${Number(plan.target_percent||70)}٪</strong></label><div><i style="width:${Math.max(0,Math.min(100,Number(plan.after_percent??plan.before_percent??0)))}%"></i></div></div>${plan.recommended_resource_url?`<a href="${esc(plan.recommended_resource_url)}">ابدئي النشاط</a>`:""}</article>`).join(""):`<div class="student-empty-state"><span>🌟</span><strong>لا توجد خطة علاجية الآن</strong><p>هذا يعني أنه لا توجد خطة نشطة مسجلة لكِ حاليًا.</p></div>`}</div>
  <section class="student-section-card"><header><div><small>موارد مساندة</small><h2>أنشطة وألعاب مقترحة</h2></div></header><div class="student-resource-grid">${resources.length?resources.map(r=>`<article><span>${r.resource_type==="game"?"🎮":"📚"}</span><div><h3>${esc(r.title)}</h3><p>${esc(r.description||"")}</p><small>${esc(r.skill_name||"مهارة عامة")}</small></div><a href="${esc(r.resource_url)}">فتح</a></article>`).join(""):`<p>لا توجد موارد إضافية.</p>`}</div></section>
  <section class="student-section-card"><header><div><small>تقدمي في الألعاب</small><h2>آخر محاولات الألعاب</h2></div></header>${games.length?`<div class="table-wrap"><table><thead><tr><th>اللعبة</th><th>المستوى</th><th>الدقة</th><th>النقاط</th><th>التاريخ</th></tr></thead><tbody>${games.map(g=>`<tr><td>${g.game_key==="percentage-challenge"?"تحدي النسبة المئوية":esc(g.game_key)}</td><td>${esc(g.difficulty)}</td><td>${Number(g.accuracy||0)}٪</td><td>${Number(g.score||0)}</td><td>${studentDate(g.played_at)}</td></tr>`).join("")}</tbody></table></div>`:`<p>لم تسجلي محاولات ألعاب بعد.</p>`}</section>`;
}

async function help() {
  setActive("help");
  content.innerHTML=`<section class="student-learning-section-hero help"><span>❓</span><div><small>دليل مدار</small><h1>مركز المساعدة</h1><p>شرح سريع لأهم أقسام حساب الطالبة.</p></div></section><div class="student-help-grid">${[["📝","اختباراتي","ادخلي الاختبار المنشور وأرسلي الإجابات قبل انتهاء الوقت."],["📊","نتائجي","شاهدي درجاتكِ والمهارات التي أتقنتِها والمهارات التي تحتاج تدريبًا."],["🩺","خطتي العلاجية","اتبعي النشاط المقترح ثم أعيدي القياس عندما تحدد المعلمة اختبارًا قصيرًا."],["🎮","الألعاب","نتائج ألعابكِ تُحفظ في حسابكِ وتساعد على متابعة التدريب."],["📁","ملف إنجازي","ارفعي الواجبات والمشروعات لتراجعها المعلمة."],["🔐","حسابي","غيّري كلمة المرور المؤقتة ولا تشاركيها مع أي شخص."]].map(([i,t,d])=>`<article><span>${i}</span><h2>${t}</h2><p>${d}</p></article>`).join("")}</div><section class="student-section-card"><h2>الخصوصية</h2><p>لا يستطيع أي مستخدم رؤية كلمة مروركِ. تُعرض بياناتكِ للمعلمة المسؤولة وولي الأمر المرتبط وفق الصلاحيات.</p><p><a href="/privacy.html" target="_blank">سياسة الخصوصية</a> · <a href="/terms.html" target="_blank">شروط الاستخدام</a></p></section>`;
}

const views = { home, tests, games, strategies, library, "knowledge-exchange": knowledgeExchange, portfolio, points, results, learning, calendar, remedial, help, account };
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
  } catch (error) { errorView(error); }
})();
