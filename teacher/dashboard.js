import { renderAnalysisDashboard } from "./analysis-dashboard.js?v=6";
import { renderSkillAttachments } from "./skill-attachments.js?v=16";
import { createTeacherLiveCompetitions } from "./live-competitions.js?v=20261005-print2";

// لوحة تحكم المعلمة - منطق العرض والتنقل بين الأقسام (SPA بسيطة بدون مكتبات خارجية)

const contentEl = document.getElementById("content");
const pageTitleEl = document.getElementById("pageTitle");
const modalRoot = document.getElementById("modalRoot");
const toastRoot = document.getElementById("toastRoot");

const ROUTE_TITLES = {
  home: "الرئيسية",
  profile: "الأداء الوظيفي",
  portfolio: "ملف الإنجاز",
  "teacher-planning": "تخطيط المعلم",
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
  attachments: "المهارات والمرفقات",
  "analysis-student": "تحليل لكل طالبة",
  "analysis-class": "تحليل الفصل العام",
  "analysis-skill": "تحليل كل مهارة",
  "analysis-learning": "أنماط التعلم",
  "games-panel": "الألعاب",
  "interactive-games": "الألعاب التفاعلية",
  "game-creator": "إنشاء الألعاب",
  competitions: "المسابقات",
  "strategies-panel": "التعلم النشط",
  "flipped-classroom": "الصف المقلوب",
  "library-panel": "الموارد المكتبية",
  videos: "الفيديوهات",
  training: "التدريبات",
  "knowledge-exchange": "تبادل المعرفة",
  "parent-panel": "ولي الأمر",
  "my-group": "مجموعتي",
  reports: "التقارير الذكية",
  "remedial-plans": "الخطط العلاجية",
  calendar: "التقويم والمواعيد",
  "help-center": "مركز المساعدة",
  notifications: "الإشعارات",
  announcements: "الإعلانات",
  classes: "إدارة الفصول",
  activity: "سجل الأنشطة",
  settings: "الإعدادات",
};

let currentTeacher = null;
let allClasses = [];
let allSkills = [];
let csrfToken = "";

let schoolSettings = null;
let interactiveGamesState = { publicationReady: true, games: [], builderReady: false, builderGames: [] };
const teacherLiveCompetitions = createTeacherLiveCompetitions({
  api,
  escapeHtml,
  toast,
  confirmAction,
  getClasses: () => allClasses,
});
const ACADEMIC_GRADES = {
  "ابتدائي": ["رابع ابتدائي", "خامس ابتدائي", "سادس ابتدائي"],
  "متوسط": ["أول متوسط", "ثاني متوسط", "ثالث متوسط"],
  "ثانوي": ["أول ثانوي", "ثاني ثانوي", "ثالث ثانوي"],
};
const GAME_TARGET_STAGES = ["all", "ابتدائي", "متوسط", "ثانوي"];
const ACADEMIC_ALL_FILTER_KINDS = new Set(["games", "competitions", "strategies", "library", "knowledgeExchange", "analysis", "studentFiles", "remedialPlans"]);

function gameTargetGradeOptions(stage, selected = "all") {
  const grades = stage === "all" ? [] : (ACADEMIC_GRADES[stage] || []);
  return ["all", ...grades].map((grade) => `<option value="${escapeHtml(grade)}" ${grade === selected ? "selected" : ""}>${grade === "all" ? "الجميع" : escapeHtml(grade)}</option>`).join("");
}
const academicSelections = {
  followUp: JSON.parse(sessionStorage.getItem("madarAcademicFollowUp") || "null") || {},
  tests: JSON.parse(sessionStorage.getItem("madarAcademicTests") || "null") || {},
  games: JSON.parse(sessionStorage.getItem("madarAcademicGames") || "null") || {},
  competitions: JSON.parse(sessionStorage.getItem("madarAcademicCompetitions") || "null") || {},
  strategies: JSON.parse(sessionStorage.getItem("madarAcademicStrategies") || "null") || {},
  library: JSON.parse(sessionStorage.getItem("madarAcademicLibrary") || "null") || {},
  knowledgeExchange: JSON.parse(sessionStorage.getItem("madarAcademicKnowledgeExchange") || "null") || {},
  analysis: JSON.parse(sessionStorage.getItem("madarAcademicAnalysis") || "null") || {},
  studentFiles: JSON.parse(sessionStorage.getItem("madarAcademicStudentFiles") || "null") || {},
  remedialPlans: JSON.parse(sessionStorage.getItem("madarAcademicRemedialPlans") || "null") || {},
  attachments: JSON.parse(sessionStorage.getItem("madarAcademicAttachments") || "null") || {},
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

function academicItemMatches(kind, item = {}) {
  const selection = normalizeAcademicSelection(kind);
  const selectedClass = selectedAcademicClass(kind);
  const itemClassId = Number(item.classId ?? item.class_id ?? 0);
  const itemStage = String(item.stage || item.level || "").trim();
  const itemGrade = String(item.gradeLabel || item.grade_label || "").trim();
  if (selectedClass && itemClassId !== Number(selectedClass.id)) return false;
  if (selection.stage !== "all" && itemStage && itemStage !== selection.stage) return false;
  if (selection.gradeLabel !== "all" && itemGrade
      && normalizeGradeKey(itemStage || selection.stage, itemGrade) !== normalizeGradeKey(selection.stage, selection.gradeLabel)) return false;
  return true;
}

async function loadSchoolSettings(force = false) {
  if (!schoolSettings || force) schoolSettings = await api("/school-settings");
  return schoolSettings;
}

async function loadInteractiveGames() {
  const [legacy, builder] = await Promise.all([
    api("/interactive-games", { cache: "no-store" }),
    api("/interactive-games/builder/library", { cache: "no-store" }).catch((error) => ({ migrationReady: false, games: [], error: error.message })),
  ]);
  interactiveGamesState = {
    ...legacy,
    builderReady: builder.migrationReady === true,
    builderMigration: builder.migration || "migration_20260810_interactive_game_builder.sql",
    builderGames: Array.isArray(builder.games) ? builder.games : [],
    builderError: builder.error || "",
  };
  if (!Array.isArray(interactiveGamesState.games)) interactiveGamesState.games = [];
  return interactiveGamesState;
}

function normalizedAcademicYear(value) {
  return String(value || "").replace(/[^0-9-]/g, "");
}

function academicClasses(selection) {
  const matching = allClasses.filter((item) => {
    const stageMatches = !selection.stage || selection.stage === "all" || item.level === selection.stage;
    const gradeMatches = !selection.gradeLabel || selection.gradeLabel === "all"
      || normalizeGradeKey(item.level, item.grade_label) === selection.gradeLabel;
    return stageMatches && gradeMatches;
  });
  const selectedYear = normalizedAcademicYear(schoolSettings?.academicYear);
  if (!selectedYear) return matching;
  const sameYear = matching.filter((item) => normalizedAcademicYear(item.academic_year) === selectedYear);
  return sameYear.length ? sameYear : matching;
}

function normalizeAcademicSelection(kind) {
  const selection = academicSelections[kind];
  const allowAll = ACADEMIC_ALL_FILTER_KINDS.has(kind);
  const firstClass = allClasses[0];
  if (!selection.stage) selection.stage = firstClass?.level || "ابتدائي";
  if (allowAll && selection.stage === "all") {
    selection.gradeLabel = "all";
    selection.classId = "";
  }
  const grades = ACADEMIC_GRADES[selection.stage] || [];
  const allowedGrades = allowAll ? ["all", ...grades] : grades;
  if (!allowedGrades.includes(selection.gradeLabel)) {
    const classGrade = normalizeGradeKey(selection.stage, allClasses.find((item) => item.level === selection.stage)?.grade_label);
    selection.gradeLabel = grades.includes(classGrade) ? classGrade : (grades[0] || "");
  }
  const classes = academicClasses(selection);
  if (!classes.some((item) => String(item.id) === String(selection.classId))) {
    selection.classId = allowAll ? "" : (classes[0]?.id ? String(classes[0].id) : "");
  }
  const storageKey = {
    followUp: "madarAcademicFollowUp",
    tests: "madarAcademicTests",
    games: "madarAcademicGames",
    competitions: "madarAcademicCompetitions",
    strategies: "madarAcademicStrategies",
    library: "madarAcademicLibrary",
    knowledgeExchange: "madarAcademicKnowledgeExchange",
    analysis: "madarAcademicAnalysis",
    studentFiles: "madarAcademicStudentFiles",
    remedialPlans: "madarAcademicRemedialPlans",
    attachments: "madarAcademicAttachments",
  }[kind];
  if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(selection));
  return selection;
}

async function prepareAcademicSelection(kind) {
  await loadSchoolSettings();
  return normalizeAcademicSelection(kind);
}

async function prepareAnalysisAcademicSelection() {
  await prepareAcademicSelection("analysis");
  const selection = academicSelections.analysis;
  if (selection.stage === "all") return selection;
  const scopedClasses = academicClasses(selection);
  const selectedClass = scopedClasses.find((item) => String(item.id) === String(selection.classId));
  const scopeHasStudents = selectedClass
    ? Number(selectedClass.student_count || 0) > 0
    : scopedClasses.some((item) => Number(item.student_count || 0) > 0);
  if (scopeHasStudents) return selection;

  const populated = allClasses.filter((item) => Number(item.student_count || 0) > 0);
  const currentYear = String(schoolSettings?.academicYear || "").trim();
  const currentYearPopulated = currentYear
    ? populated.filter((item) => String(item.academic_year || "").trim() === currentYear)
    : [];
  const fallback = currentYearPopulated[0] || populated[0];
  if (!fallback) return selection;

  selection.stage = fallback.level;
  selection.gradeLabel = normalizeGradeKey(fallback.level, fallback.grade_label);
  selection.classId = String(fallback.id);
  sessionStorage.setItem("madarAcademicAnalysis", JSON.stringify(selection));
  return selection;
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

function academicSelectorHtml(kind, { embedded = false } = {}) {
  const selection = normalizeAcademicSelection(kind);
  const allowAll = ACADEMIC_ALL_FILTER_KINDS.has(kind);
  const grades = ACADEMIC_GRADES[selection.stage] || [];
  const classes = academicClasses(selection);
  const semesterLabel = schoolSettings?.semesterLabel || "—";
  const stageValues = allowAll ? ["all", ...Object.keys(ACADEMIC_GRADES)] : Object.keys(ACADEMIC_GRADES);
  const gradeValues = allowAll ? ["all", ...grades] : grades;
  const filterClass = embedded ? ' class="analysis-workspace__filter"' : "";
  const fields = `
      <label${filterClass}>المرحلة<select data-academic-stage>${stageValues.map((value) => `<option value="${value}" ${selection.stage === value ? "selected" : ""}>${value === "all" ? "الجميع" : value}</option>`).join("")}</select></label>
      <label${filterClass}>الصف<select data-academic-grade>${gradeValues.map((value) => `<option value="${value}" ${selection.gradeLabel === value ? "selected" : ""}>${value === "all" ? "الجميع" : value}</option>`).join("")}</select></label>
      <label${filterClass}>الفصل<select data-academic-class>${allowAll ? `<option value="" ${selection.classId ? "" : "selected"}>الجميع</option>` : ""}${classes.length ? classes.map((item, index) => `<option value="${item.id}" ${String(selection.classId) === String(item.id) ? "selected" : ""}>${academicClassLabel(item, index)}</option>`).join("") : (allowAll ? "" : '<option value="">لا يوجد فصل مسجل لهذا الصف</option>')}</select></label>`;
  if (embedded) return `<div class="analysis-workspace__academic-filters" data-academic-kind="${kind}">${fields}</div>`;
  return `<section class="academic-filter" data-academic-kind="${kind}">
    <div class="academic-filter-fields">${fields}</div>
    <div class="semester-indicator"><strong>${escapeHtml(semesterLabel)}</strong></div>
  </section>`;
}

function bindAcademicSelector(kind, onChange) {
  const root = document.querySelector(`[data-academic-kind="${kind}"]`);
  if (!root) return;
  const selection = academicSelections[kind];
  root.querySelector("[data-academic-stage]").onchange = (event) => {
    selection.stage = event.target.value;
    selection.gradeLabel = ACADEMIC_ALL_FILTER_KINDS.has(kind) ? "all" : ((ACADEMIC_GRADES[selection.stage] || [])[0] || "");
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
  const selectedClass = selectedAcademicClass(kind);
  return new URLSearchParams({
    stage: selection.stage || "",
    gradeLabel: actualAcademicGradeLabel(kind),
    classId: selection.classId || "",
    academicYear: kind === "analysis" ? (selectedClass?.academic_year || "") : (schoolSettings?.academicYear || ""),
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

  if (!res.ok) {
    const error = new Error(data?.error || `حدث خطأ في الخادم (${res.status}).`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  if (data?.csrfToken) csrfToken = data.csrfToken;
  return data;
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function safeResourceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw, window.location.origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (raw.startsWith("/") && !raw.startsWith("//")) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.href;
  } catch (_) { return ""; }
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

  const parentMenuItem = document.querySelector('.nav-item[data-route="parent-panel"]');
  if (parentMenuItem && !document.querySelector('.nav-item[data-route="my-group"]')) {
    const groupButton = document.createElement('button');
    groupButton.type = 'button';
    groupButton.className = parentMenuItem.className;
    groupButton.classList.remove('active');
    groupButton.dataset.route = 'my-group';
    groupButton.innerHTML = '<span aria-hidden="true">👥</span> مجموعتي';
    parentMenuItem.insertAdjacentElement('afterend', groupButton);
  }

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
  if (route !== "games-panel" || gamesPanelMode !== "competitions") teacherLiveCompetitions.stop();
  const activeSidebarRoute = ["help-center", "notifications", "announcements"].includes(route) ? "activity" : route;
  document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === activeSidebarRoute);
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
      <button class="tab-btn ${teacherPortfolioTab === "nafes" ? "active" : ""}" id="tabNafes" type="button"><span aria-hidden="true">🎯</span> نافس</button>
      <button class="tab-btn ${teacherPortfolioTab === "tahsili_abilities" ? "active" : ""}" id="tabTahsili" type="button"><span aria-hidden="true">🏆</span> التحصيلي والقدرات</button>
    </div>

    <div id="portfolioTabContent"></div>
  `;

  document.getElementById("printPortfolioBtn").onclick = () => window.print();
  document.getElementById("addEvidenceBtn").onclick = () => openAddEvidenceModal();

  const tabEvidences = document.getElementById("tabEvidences");
  const tabBio = document.getElementById("tabBio");
  const tabNafes = document.getElementById("tabNafes");
  const tabTahsili = document.getElementById("tabTahsili");

  tabEvidences.onclick = () => { teacherPortfolioTab = "evidences"; renderPortfolio(); };
  tabBio.onclick = () => { teacherPortfolioTab = "bio"; renderPortfolio(); };
  tabNafes.onclick = () => { teacherPortfolioTab = "nafes"; renderPortfolio(); };
  tabTahsili.onclick = () => { teacherPortfolioTab = "tahsili_abilities"; renderPortfolio(); };

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
  } else if (teacherPortfolioTab === "nafes" || teacherPortfolioTab === "tahsili_abilities") {
    await renderPortfolioTargetedKnowledge(contentWrap, teacherPortfolioTab);
  }
}

async function renderPortfolioTargetedKnowledge(container, mode) {
  const meta = KNOWLEDGE_META[mode];
  try {
    const data = await api("/knowledge-exchange");
    const resources = data.resources.filter((item) => item.category === mode);
    container.innerHTML = `
      <div class="knowledge-layout">
        <form class="card knowledge-form" id="portfolioKnowledgeForm" enctype="multipart/form-data">
          <div class="knowledge-card-heading"><span aria-hidden="true">${meta.icon}</span><div><h3>إضافة ${meta.label}</h3><p>${meta.hint}</p></div></div>
          <label class="field">العنوان<input id="portfolioKnowledgeTitle" maxlength="190" required placeholder="اكتبي عنوان المورد"></label>
          <label class="field">وصف مختصر <small>اختياري</small><textarea id="portfolioKnowledgeDescription" maxlength="1000" placeholder="اكتبي وصفًا يساعد الطالبة على معرفة محتوى المورد"></textarea></label>
          <div class="form-grid two">
            <label class="field">نوع المادة<select id="portfolioKnowledgeResourceKind"><option value="file">ملف PDF أو صورة</option><option value="link">رابط إلكتروني</option></select></label>
            <div class="field"><span>الفئة المستهدفة</span><strong style="display:block;margin-top:9px;color:var(--purple-950)">${escapeHtml(meta.audience)}</strong></div>
          </div>
          <label class="field knowledge-file-field" id="portfolioKnowledgeFileField">اختيار ملف PDF أو صورة<input id="portfolioKnowledgeFile" type="file" accept="application/pdf,image/*"><small>الحد الأقصى 15 ميجابايت.</small></label>
          <label class="field" id="portfolioKnowledgeUrlField" hidden>الرابط الإلكتروني<input id="portfolioKnowledgeUrl" type="url" inputmode="url" dir="ltr" placeholder="https://example.com"></label>
          <div id="portfolioKnowledgeMessage"></div>
          <button class="btn btn-primary knowledge-submit" type="submit">إرسال إلى طالبات ${escapeHtml(meta.audience)}</button>
        </form>
        <section class="card knowledge-list-card">
          <div class="knowledge-card-heading"><span aria-hidden="true">📚</span><div><h3>${meta.label} المضافة</h3><p>${resources.length} مورد</p></div></div>
          <div class="knowledge-resource-list">${resources.length ? resources.map((item) => {
            const action = item.resourceType === "link"
              ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">فتح الرابط</a>`
              : `<a class="btn btn-secondary btn-sm" href="/api/teacher/knowledge-exchange/${item.id}/file" target="_blank" rel="noopener">معاينة الملف</a>`;
            return `<article class="knowledge-resource-item"><span class="knowledge-resource-icon" aria-hidden="true">${meta.icon}</span><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || "بدون وصف")}</p><small>${formatDate(item.createdAt)}${item.originalName ? ` · ${escapeHtml(item.originalName)}` : ""}</small></div><div class="knowledge-resource-actions">${action}<button class="btn btn-outline btn-sm" type="button" data-delete-portfolio-knowledge="${item.id}">حذف</button></div></article>`;
          }).join("") : `<div class="empty-state"><div class="ic">${meta.icon}</div>لم تُضف ${meta.label} بعد.</div>`}</div>
        </section>
      </div>`;

    const resourceKind = document.getElementById("portfolioKnowledgeResourceKind");
    const syncResourceKind = () => {
      document.getElementById("portfolioKnowledgeFileField").hidden = resourceKind.value !== "file";
      document.getElementById("portfolioKnowledgeUrlField").hidden = resourceKind.value !== "link";
    };
    resourceKind.onchange = syncResourceKind;
    syncResourceKind();

    document.querySelectorAll("[data-delete-portfolio-knowledge]").forEach((button) => {
      button.onclick = () => confirmAction("هل تريدين حذف هذا المورد من حسابات الطالبات؟", async () => {
        await api(`/knowledge-exchange/${button.dataset.deletePortfolioKnowledge}`, { method: "DELETE" });
        toast("تم حذف المورد.");
        await renderPortfolio();
      });
    });

    document.getElementById("portfolioKnowledgeForm").onsubmit = async (event) => {
      event.preventDefault();
      const submit = event.submitter || event.currentTarget.querySelector('[type="submit"]');
      const message = document.getElementById("portfolioKnowledgeMessage");
      submit.disabled = true;
      const formData = new FormData();
      formData.set("category", mode);
      formData.set("title", document.getElementById("portfolioKnowledgeTitle").value.trim());
      formData.set("description", document.getElementById("portfolioKnowledgeDescription").value.trim());
      if (resourceKind.value === "link") {
        const url = document.getElementById("portfolioKnowledgeUrl").value.trim();
        if (!url) { message.innerHTML = '<div class="form-error">أضيفي الرابط الإلكتروني.</div>'; submit.disabled = false; return; }
        formData.set("url", url);
      } else {
        const file = document.getElementById("portfolioKnowledgeFile").files[0];
        if (!file) { message.innerHTML = '<div class="form-error">اختاري ملف PDF أو صورة.</div>'; submit.disabled = false; return; }
        formData.set("file", file);
      }
      try {
        await api("/knowledge-exchange", { method: "POST", body: formData });
        toast(`تم إرسال ${meta.label} إلى طالبات ${meta.audience}.`);
        await renderPortfolio();
      } catch (error) {
        message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
        submit.disabled = false;
      }
    };
  } catch (error) {
    container.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`;
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
      confirmAction(`هل تأكيد حذف الطالبة "${btn.dataset.name}"؟ سيُعطّل حسابها وتختفي من قائمة الطالبات، مع بقاء نتائجها القديمة محفوظة.`, async () => {
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

function studentGameNumber(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${Number.isInteger(number) ? number : number.toFixed(2)}${suffix}`;
}

function studentGameDateTime(value) {
  if (!value) return "—";
  const date=new Date(String(value).replace(" ","T"));
  return Number.isNaN(date.getTime())?escapeHtml(value):date.toLocaleString("ar-SA",{dateStyle:"medium",timeStyle:"short"});
}

function studentFileWorksTable(files) {
  if (!files.length) return '<div class="empty-state"><div class="ic">📂</div><p>لا توجد أعمال مرفوعة لهذه الطالبة.</p></div>';
  return `<div class="table-wrap"><table><thead><tr><th>العمل</th><th>تاريخ الرفع</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${files.map((file) => {
    const meta=PORTFOLIO_CATEGORY_META[file.category]||PORTFOLIO_CATEGORY_META.other;
    return `<tr><td><strong>${escapeHtml(file.title)}</strong><small class="portfolio-file-meta">${meta.icon} ${meta.label} · ${escapeHtml(file.originalName)}</small></td><td>${formatDate(file.createdAt)}</td><td>${portfolioReviewBadge(file.reviewStatus)}</td><td><div class="portfolio-table-actions"><button class="btn btn-secondary btn-sm" type="button" data-profile-preview-file="${file.id}">معاينة</button><button class="btn btn-primary btn-sm" type="button" data-profile-review-file="${file.id}">مراجعة</button></div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function studentGameAttemptsTable(attempts) {
  if (!attempts.length) return '<div class="empty-state"><div class="ic">🎮</div><p>لم تُسجل للطالبة أي محاولة لعبة بعد.</p></div>';
  return `<div class="student-game-table-note">يُعرض كل سجل كما حُفظ من اللعبة تلقائيًا، بما في ذلك تكرار اللعب لنفس اللعبة.</div><div class="table-wrap"><table class="student-game-attempts-table"><thead><tr><th>اسم اللعبة</th><th>المحاولة</th><th>الدرجة</th><th>الدرجة الكاملة</th><th>النسبة</th><th>الحالة</th><th>بدء المحاولة</th><th>إكمالها</th></tr></thead><tbody>${attempts.map((attempt) => `<tr>
    <td><strong>${escapeHtml(attempt.gameName)}</strong><small class="portfolio-file-meta">${attempt.difficulty === "easy" ? "بسيط" : attempt.difficulty === "medium" ? "متوسط" : attempt.difficulty === "hard" ? "متقدم" : "—"}</small></td>
    <td>المحاولة ${studentGameNumber(attempt.attemptNumber)}</td>
    <td>${studentGameNumber(attempt.score)}</td>
    <td>${studentGameNumber(attempt.maxScore)}</td>
    <td><strong>${studentGameNumber(attempt.percentage, "%")}</strong></td>
    <td><span class="student-game-status ${attempt.status === "completed" ? "completed" : "started"}">${attempt.status === "completed" ? "مكتملة" : "بدأت"}</span></td>
    <td>${studentGameDateTime(attempt.startedAt)}</td>
    <td>${studentGameDateTime(attempt.completedAt)}</td>
  </tr>`).join("")}</tbody></table></div>`;
}

function studentGameCertificatesTable(certificates) {
  if (!certificates.length) return '<div class="empty-state"><div class="ic">🎓</div><p>لم ترسل الطالبة شهادة إنجاز بعد.</p></div>';
  return `<div class="student-game-table-note">لا تظهر هنا إلا الشهادة التي أرسلتها الطالبة إلى ملف الإنجاز.</div><div class="table-wrap"><table><thead><tr><th>اسم اللعبة</th><th>الدرجة وقت الإرسال</th><th>النسبة</th><th>تاريخ ووقت الإرسال</th><th>الإجراءات</th></tr></thead><tbody>${certificates.map((certificate) => `<tr>
    <td><strong>${escapeHtml(certificate.gameName)}</strong>${certificate.attemptNumber ? `<small class="portfolio-file-meta">المحاولة ${studentGameNumber(certificate.attemptNumber)}</small>` : ""}${certificate.lessonName && certificate.lessonName !== certificate.gameName ? `<small class="portfolio-file-meta">${escapeHtml(certificate.lessonName)}</small>` : ""}</td>
    <td>${studentGameNumber(certificate.score)}${certificate.maxScore !== null ? ` / ${studentGameNumber(certificate.maxScore)}` : ""}</td>
    <td><strong>${studentGameNumber(certificate.percentage, "%")}</strong></td>
    <td>${studentGameDateTime(certificate.sentAt)}</td>
    <td><div class="portfolio-table-actions"><button class="btn btn-secondary btn-sm" type="button" data-view-game-certificate="${certificate.id}">عرض الشهادة</button><button class="btn btn-warning btn-sm" type="button" data-delete-game-certificate="${certificate.id}">مسح الشهادة وإتاحة الإرسال</button></div></td>
  </tr>`).join("")}</tbody></table></div>`;
}

async function openTeacherGameCertificate(certificateId, studentId) {
  const result=await api(`/student-files/certificates/${certificateId}`,{cache:"no-store"});
  const certificate=result.certificate||{};
  const grade=Number(certificate.questionCount)>0?`${studentGameNumber(certificate.correctCount)} / ${studentGameNumber(certificate.questionCount)}`:"—";
  const score=certificate.maxScore!==null&&certificate.maxScore!==undefined
    ? `${studentGameNumber(certificate.score)} / ${studentGameNumber(certificate.maxScore)}`
    : studentGameNumber(certificate.score);
  openModal(`
    <header class="portfolio-dialog-header"><div><span>شهادات الإنجاز</span><h3>شهادة إتقان</h3></div><button class="dialog-close" id="closeTeacherCertificate" type="button" aria-label="إغلاق">×</button></header>
    <section class="teacher-game-certificate">
      <div class="teacher-game-certificate-brand"><img src="/assets/print/madar-official-logo-transparent.png" alt="شعار مدار"><span><strong>مدار</strong><small>منصة الرياضيات التفاعلية</small></span></div>
      <h2>شهادة إتقان</h2><p>تمنح منصة مدار هذه الشهادة للطالبة</p><h3>${escapeHtml(certificate.studentName||"—")}</h3>
      <p>بعد إتمام لعبة <strong>${escapeHtml(certificate.lessonName||certificate.gameName||"—")}</strong></p>
      <div class="teacher-game-certificate-facts"><span>النسبة<strong>${studentGameNumber(certificate.accuracy,"%")}</strong></span><span>الإجابات الصحيحة<strong>${grade}</strong></span><span>الدرجة<strong>${score}</strong></span><span>المستوى<strong>${escapeHtml(certificate.levelLabel||"—")}</strong></span></div>
      <div class="teacher-game-certificate-context"><span>${escapeHtml(certificate.stageLabel||"—")}</span><span>${escapeHtml(certificate.gradeLabel||"—")}</span><span>${escapeHtml(certificate.semesterLabel||"—")}</span><span>${escapeHtml(certificate.academicYear||"—")}</span></div>
      <small>أُرسلت في ${studentGameDateTime(certificate.sentAt||certificate.issuedAt)}</small>
    </section>
    <div class="modal-actions"><button class="btn btn-outline" id="backToStudentFile" type="button">العودة إلى ملف الطالبة</button></div>
  `,"teacher-game-certificate-dialog");
  document.getElementById("closeTeacherCertificate").onclick=closeModal;
  document.getElementById("backToStudentFile").onclick=()=>openStudentLearningFile(studentId,"certificates");
}

async function openStudentLearningFile(studentId, initialTab = "attempts") {
  const data=await api(`/student-files/students/${studentId}`,{cache:"no-store"});
  const student=data.student||{};
  const files=data.files||[];
  const attempts=data.gameAttempts||[];
  const certificates=data.certificates||[];
  const tabs=[
    ["works","الأعمال المرفوعة",files.length],
    ["attempts","محاولات الألعاب",attempts.length],
    ["certificates","شهادات الإنجاز",certificates.length],
  ];
  const selected=tabs.some(([key])=>key===initialTab)?initialTab:"attempts";
  openModal(`
    <header class="portfolio-dialog-header"><div><span>${escapeHtml(student.className||"—")} · ${escapeHtml(student.email||"")}</span><h3>ملف الطالبة: ${escapeHtml(student.name||"—")}</h3></div><button class="dialog-close" id="closeStudentLearningFile" type="button" aria-label="إغلاق">×</button></header>
    <div class="student-file-profile-tabs" role="tablist">${tabs.map(([key,label,count])=>`<button type="button" role="tab" data-student-file-tab="${key}" class="${key===selected?"active":""}">${label}<small>${count}</small></button>`).join("")}</div>
    <div class="student-file-profile-panel" id="studentFileProfilePanel"></div>
  `,"student-file-profile-dialog");
  document.getElementById("closeStudentLearningFile").onclick=closeModal;

  function renderProfileTab(tab) {
    document.querySelectorAll("[data-student-file-tab]").forEach(button=>{
      const active=button.dataset.studentFileTab===tab;
      button.classList.toggle("active",active);
      button.setAttribute("aria-selected",String(active));
    });
    const panel=document.getElementById("studentFileProfilePanel");
    panel.innerHTML=tab==="works"?studentFileWorksTable(files):tab==="certificates"?studentGameCertificatesTable(certificates):studentGameAttemptsTable(attempts);
    panel.querySelectorAll("[data-profile-preview-file]").forEach(button=>button.onclick=()=>openStudentFilePreview(files.find(file=>file.id===Number(button.dataset.profilePreviewFile))));
    panel.querySelectorAll("[data-profile-review-file]").forEach(button=>button.onclick=()=>openStudentFileReview(files.find(file=>file.id===Number(button.dataset.profileReviewFile))));
    panel.querySelectorAll("[data-view-game-certificate]").forEach(button=>button.onclick=()=>openTeacherGameCertificate(Number(button.dataset.viewGameCertificate),studentId).catch(error=>toast(error.message)));
    panel.querySelectorAll("[data-delete-game-certificate]").forEach(button=>button.onclick=async()=>{
      const certificate=certificates.find(item=>item.id===Number(button.dataset.deleteGameCertificate));
      if(!confirm(`هل تريدين مسح شهادة «${certificate?.gameName||"اللعبة"}» لهذه المحاولة؟ بعد المسح ستتمكن الطالبة من إعادة إرسال شهادة المحاولة نفسها.`)) return;
      button.disabled=true;
      try {
        await api(`/student-files/certificates/${button.dataset.deleteGameCertificate}`,{method:"DELETE"});
        toast("تم مسح شهادة المحاولة، ويمكن للطالبة إرسالها من جديد.");
        await openStudentLearningFile(studentId,"certificates");
      } catch(error) {
        button.disabled=false;
        toast(error.message);
      }
    });
  }
  document.querySelectorAll("[data-student-file-tab]").forEach(button=>button.onclick=()=>renderProfileTab(button.dataset.studentFileTab));
  renderProfileTab(selected);
}

async function renderStudentFiles() {
  const [data] = await Promise.all([api("/student-files"), loadSchoolSettings()]);
  const files = (data.files || []).filter((file) => academicItemMatches("studentFiles", file));
  const students=(data.students||[]).filter((student)=>academicItemMatches("studentFiles",student));
  contentEl.innerHTML = `
    ${academicSelectorHtml("studentFiles")}
    <section class="student-files-hero">
      <div class="student-files-hero-icon" aria-hidden="true">📁</div>
      <div><span>إدارة الطالبات</span><h3>ملفات الطالبات</h3><p>هنا تظهر الواجبات وأوراق العمل والمهام والمشاريع وصور الإنجاز التي ترفعها الطالبات من حساباتهن.</p></div>
      <strong>${students.length} طالبة</strong>
    </section>
    <div class="card student-files-directory-card">
      <div class="student-files-directory-head"><div><h3>ملفات الطالبات</h3><p>افتحي ملف الطالبة للاطلاع على أعمالها ومحاولات الألعاب وشهادات الإنجاز.</p></div><input id="studentFileDirectorySearch" placeholder="بحث باسم الطالبة أو الفصل..." /></div>
      <div class="student-files-directory" id="studentFilesDirectory">${students.length?students.map((student)=>`<article data-student-directory-card data-search="${escapeHtml(`${student.name} ${student.email} ${student.className}`.toLocaleLowerCase("ar"))}"><div class="student-file-avatar" aria-hidden="true">${escapeHtml(String(student.name||"ط").trim().charAt(0)||"ط")}</div><div><h4>${escapeHtml(student.name)}</h4><p>${escapeHtml(student.className||"—")} · ${escapeHtml(student.email)}</p><div class="student-file-counts"><span>📂 ${student.workCount} عمل</span><span>🎮 ${student.gameAttemptCount} محاولة</span><span>🎓 ${student.certificateCount} شهادة</span></div></div><button class="btn btn-primary btn-sm" type="button" data-open-student-file="${student.id}">فتح الملف</button></article>`).join(""):'<div class="empty-state"><div class="ic">👩‍🎓</div><p>لا توجد طالبات في الاختيار الحالي.</p></div>'}</div>
      <div class="empty-state" id="studentDirectoryNoResults" hidden>لا توجد طالبة مطابقة للبحث.</div>
    </div>
    <div class="card">
      <h3 class="section-title">كل الأعمال المرفوعة</h3>
      <div class="toolbar">
        <input id="studentFilesSearch" placeholder="بحث باسم الطالبة أو عنوان العمل..." />
        <select id="studentFilesCategory"><option value="">كل أنواع الأعمال</option>${Object.entries(PORTFOLIO_CATEGORY_META).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join("")}</select>
      </div>
      <div id="studentFilesWrap">
        ${files.length ? `<div class="table-wrap"><table id="studentFilesTable"><thead><tr><th>الطالبة والفصل</th><th>عنوان الملف ونوعه</th><th>تاريخ الرفع</th><th>الحالة</th><th>المعاينة والتنزيل</th><th>المراجعة</th></tr></thead><tbody>${files.map((file) => {
          const meta = PORTFOLIO_CATEGORY_META[file.category] || PORTFOLIO_CATEGORY_META.other;
          const search = `${file.studentName} ${file.studentEmail} ${file.title} ${file.note} ${file.className}`.toLocaleLowerCase("ar");
          const certificateKey = String(file.certificateKey || file.certificate_key || "").trim();
          const isGameCertificate = Boolean(certificateKey);
          const duplicateCertificate = isGameCertificate && /\(مكرر\)/.test(String(file.title || ""));
          const certificateLabel = duplicateCertificate ? "شهادة إتقان (مكرر)" : "شهادة إتقان";
          const fileKind = isGameCertificate ? certificateLabel : (file.mimeType === "application/pdf" ? "PDF" : "صورة");
          return `<tr data-student-file data-category="${escapeHtml(file.category)}" data-search="${escapeHtml(search)}">
            <td><strong>${escapeHtml(file.studentName)}</strong><br><small>${escapeHtml(file.className || "—")} · ${escapeHtml(file.studentEmail)}</small></td>
            <td><strong>${escapeHtml(file.title)}</strong><br><span class="portfolio-type-badge"><i aria-hidden="true">${meta.icon}</i>${isGameCertificate ? certificateLabel : meta.label}</span><small class="portfolio-file-meta">${fileKind} · ${escapeHtml(file.originalName)} · ${formatFileSize(file.sizeBytes)}</small></td>
            <td>${formatDate(file.createdAt)}</td>
            <td>${portfolioReviewBadge(file.reviewStatus)}${file.awardedPoints?`<small class="portfolio-points-added">+${Number(file.awardedPoints)} نقطة</small>`:""}</td>
            <td><div class="portfolio-table-actions"><button class="btn btn-secondary btn-sm" type="button" data-preview-file="${file.id}">معاينة</button><a class="btn btn-outline btn-sm" href="/api/teacher/student-files/${file.id}/download">تنزيل</a></div></td>
            <td><button class="btn btn-primary btn-sm" type="button" data-review-file="${file.id}">${file.reviewStatus==="pending"?"مراجعة":"فتح المراجعة"}</button></td>
          </tr>`;
        }).join("")}</tbody></table></div><div class="empty-state" id="studentFilesNoResults" hidden>لا توجد ملفات مطابقة للبحث.</div>` : '<div class="empty-state"><div class="ic">📁</div><p>لم ترفع الطالبات أعمالًا بعد.</p></div>'}
      </div>
    </div>`;

  bindAcademicSelector("studentFiles", renderStudentFiles);
  document.querySelectorAll("[data-open-student-file]").forEach(button=>button.onclick=()=>openStudentLearningFile(Number(button.dataset.openStudentFile)).catch(error=>toast(error.message)));
  const directorySearch=document.getElementById("studentFileDirectorySearch");
  const directoryCards=[...document.querySelectorAll("[data-student-directory-card]")];
  const directoryNoResults=document.getElementById("studentDirectoryNoResults");
  if(directorySearch) directorySearch.oninput=()=>{
    const search=directorySearch.value.trim().toLocaleLowerCase("ar");let visible=0;
    directoryCards.forEach(card=>{const matches=!search||card.dataset.search.includes(search);card.hidden=!matches;if(matches)visible++;});
    directoryNoResults.hidden=visible!==0;
  };
  if (!files.length) return;
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
  document.querySelectorAll("[data-preview-file]").forEach(button=>button.onclick=()=>openStudentFilePreview(files.find(file=>file.id===Number(button.dataset.previewFile))));
  document.querySelectorAll("[data-review-file]").forEach(button=>button.onclick=()=>openStudentFileReview(files.find(file=>file.id===Number(button.dataset.reviewFile))));
}

// ========================================================================== 
// سجل المتابعة
// ==========================================================================
let followUpPeriod = 1;
let followUpMode = sessionStorage.getItem("madarFollowUpMode") === "tests" ? "tests" : "tracking";
let followUpSection = sessionStorage.getItem("madarFollowUpSection") || "attendance";
let followUpRowsById = new Map();
let followUpLoadedSettings = {};
let followUpAutosaveTimer = null;
let followUpAutosavePayload = null;
let followUpAutosavePromise = null;

function setFollowUpAutosaveStatus(state, message) {
  const host = document.getElementById("followUpTopAction");
  if (!host) return;
  if (!message) { host.innerHTML = ""; return; }
  host.innerHTML = `<span class="follow-up-autosave" data-state="${escapeHtml(state)}"><i aria-hidden="true"></i>${escapeHtml(message)}</span>`;
}

function collectFollowUpPayload() {
  if (!document.getElementById("followUpTable")) return null;
  const settings = { ...followUpLoadedSettings };
  document.querySelectorAll(".max-input").forEach((input) => { settings[input.dataset.maxSetting] = Number(input.value); });
  const fields = followUpPeriod < 3
    ? ["periodicTestScore", "participationScore", "homeworkScore", "tasksScore"]
    : ["finalExamScore"];
  const rows = [...document.querySelectorAll("#followUpTable tbody tr")].map((row) => {
    const original = followUpRowsById.get(Number(row.dataset.studentId)) || {};
    const record = { studentId: Number(row.dataset.studentId) };
    fields.forEach((field) => {
      const input = row.querySelector(`[data-score="${field}"]`);
      record[field] = input ? numericInput(row, field) : (original[field] ?? null);
    });
    return record;
  });
  const selection = normalizeAcademicSelection("followUp");
  return {
    settings,
    rows,
    body: { period: followUpPeriod, settings, rows, stage: selection.stage, gradeLabel: actualAcademicGradeLabel("followUp"), classId: selection.classId, academicYear: schoolSettings?.academicYear || "", semester: schoolSettings?.currentSemester || "first" },
  };
}

function scheduleFollowUpAutosave(delay = 650) {
  const payload = collectFollowUpPayload();
  if (!payload) return;
  followUpAutosavePayload = payload;
  setFollowUpAutosaveStatus("pending", "بانتظار الحفظ…");
  clearTimeout(followUpAutosaveTimer);
  followUpAutosaveTimer = setTimeout(() => { flushFollowUpAutosave(); }, Math.max(0, delay));
}

async function flushFollowUpAutosave() {
  clearTimeout(followUpAutosaveTimer);
  followUpAutosaveTimer = null;
  if (followUpAutosavePromise) {
    await followUpAutosavePromise;
    return followUpAutosavePayload ? flushFollowUpAutosave() : true;
  }
  const payload = followUpAutosavePayload;
  if (!payload) return true;
  followUpAutosavePayload = null;
  setFollowUpAutosaveStatus("saving", "جارٍ الحفظ…");
  followUpAutosavePromise = (async () => {
    try {
      await api("/follow-up", { method: "PUT", body: JSON.stringify(payload.body) });
      followUpLoadedSettings = { ...payload.settings };
      payload.rows.forEach((row) => followUpRowsById.set(Number(row.studentId), { ...(followUpRowsById.get(Number(row.studentId)) || {}), ...row }));
      setFollowUpAutosaveStatus("saved", "تم الحفظ تلقائيًا ✓");
      return true;
    } catch (error) {
      if (!followUpAutosavePayload) followUpAutosavePayload = payload;
      setFollowUpAutosaveStatus("error", "تعذّر الحفظ — أعيدي المحاولة");
      toast(error.message || "تعذّر الحفظ التلقائي.", "error");
      return false;
    } finally {
      followUpAutosavePromise = null;
    }
  })();
  const saved = await followUpAutosavePromise;
  if (saved && followUpAutosavePayload) return flushFollowUpAutosave();
  return saved;
}

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

function followUpPrintPeriodLabel(period) {
  return Number(period) === 1 ? "الفترة الأولى" : Number(period) === 2 ? "الفترة الثانية" : "النهائي";
}

function followUpPrintPeriodHtml(data, period) {
  const finalPeriod = Number(period) === 3;
  const headers = finalPeriod
    ? ["البريد الإلكتروني", "اسم الطالبة", "متوسط الاختبارين", "متوسط المشاركة", "متوسط الواجبات", "متوسط المهام", "الاختبار النهائي", "المجموع"]
    : ["البريد الإلكتروني", "اسم الطالبة", "الاختبار الفتري", "المشاركة", "الواجبات", "المهام", "المجموع"];
  const rows = (data.rows || []).map((row) => finalPeriod
    ? [row.email, row.name, row.periodicTestAverage, row.participationAverage, row.homeworkAverage, row.tasksAverage, row.finalExamScore, row.total]
    : [row.email, row.name, row.periodicTestScore, row.participationScore, row.homeworkScore, row.tasksScore, row.total]
  ).map((row) => row.map((value, index) => index < 2 ? escapeHtml(value || "—") : escapeHtml(cleanScore(value))));
  return `<section class="follow-up-print-section">
    <h2>${escapeHtml(followUpPrintPeriodLabel(period))}</h2>
    ${rows.length ? analysisPrintTable(headers, rows, "follow-up-grades-print-table") : '<div class="print-note">لا توجد طالبات مسجلات ضمن الاختيار الحالي.</div>'}
  </section>`;
}

async function printFollowUpPeriods(periods) {
  const popup = window.open("", "_blank");
  if (!popup) return toast("اسمحي بالنوافذ المنبثقة حتى تفتح معاينة الطباعة.", "error");
  popup.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>جارٍ تجهيز الطباعة...</title></head><body style="font-family:Tahoma;padding:30px;text-align:center">جارٍ تجهيز سجل الدرجات...</body></html>');
  popup.document.close();
  closeModal();
  try {
    const query = academicQuery("followUp");
    const reports = await Promise.all(periods.map((period) => api(`/follow-up?period=${period}&${query}`)));
    const title = periods.length === 3 ? "سجل الدرجات — جميع الفترات" : `سجل درجات ${followUpPrintPeriodLabel(periods[0])}`;
    const bodyHtml = reports.map((data, index) => followUpPrintPeriodHtml(data, periods[index])).join("");
    const selection = normalizeAcademicSelection("followUp");
    await openAnalysisPrint({ title, classId: selection.classId, bodyHtml, orientation: "landscape", popupWindow: popup });
  } catch (error) {
    popup.close();
    toast(error.message || "تعذّر تجهيز سجل الدرجات للطباعة.", "error");
  }
}

function openFollowUpPrintMenu() {
  openModal(`
    <h3>طباعة سجل الدرجات</h3>
    <p class="tracking-note">اختاري الفترة المطلوب طباعتها وفق المرحلة والصف والفصل والترم المحددة حاليًا.</p>
    <div class="form-grid">
      <button class="btn btn-outline" type="button" data-follow-up-print-period="1">طباعة الفترة الأولى</button>
      <button class="btn btn-outline" type="button" data-follow-up-print-period="2">طباعة الفترة الثانية</button>
      <button class="btn btn-outline" type="button" data-follow-up-print-period="3">طباعة النهائي</button>
      <button class="btn btn-primary" type="button" data-follow-up-print-period="all">طباعة الجميع</button>
    </div>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelFollowUpPrint" type="button">إلغاء</button></div>
  `);
  document.querySelectorAll("[data-follow-up-print-period]").forEach((button) => {
    button.onclick = () => printFollowUpPeriods(button.dataset.followUpPrintPeriod === "all" ? [1, 2, 3] : [Number(button.dataset.followUpPrintPeriod)]);
  });
  document.getElementById("cancelFollowUpPrint").onclick = closeModal;
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
            ${[1, 2, 3].map((period) => `<button class="tab-btn ${followUpPeriod === period ? "active" : ""}" data-follow-period="${period}">${period === 1 ? "الفترة الأولى" : period === 2 ? "الفترة الثانية" : "النهائي"}</button>`).join("")}
          </div>
          <div class="spacer"></div>
          <span class="follow-up-grade-note">جدول الدرجات محفوظ لكل ترم على حدة</span>
          <button class="btn btn-outline btn-sm" id="printFollowUpGrades" type="button">🖨️ طباعة</button>
        </div>
        <div id="followUpContent"><div class="empty-state">جارٍ تحميل جدول الدرجات...</div></div>
      `}
    </div>
  `;
  document.querySelectorAll("[data-follow-mode]").forEach((button) => {
    button.onclick = async () => {
      if (followUpMode === "tests" && !await flushFollowUpAutosave()) return;
      if (followUpMode === "tracking" && window.flushWeeklyFollowUpAutosaves && !await window.flushWeeklyFollowUpAutosaves()) return;
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
  bindAcademicSelector("followUp", async () => { if (await flushFollowUpAutosave()) renderFollowUp(); });
  document.querySelectorAll("[data-follow-period]").forEach((button) => {
    button.onclick = async () => {
      if (!await flushFollowUpAutosave()) return;
      followUpPeriod = Number(button.dataset.followPeriod);
      renderFollowUp();
    };
  });
  document.getElementById("printFollowUpGrades").onclick = async () => { if (await flushFollowUpAutosave()) openFollowUpPrintMenu(); };
  await loadFollowUpPeriod();
  document.getElementById("followUpSearch").oninput = (event) => {
    const query = event.target.value.trim().toLocaleLowerCase("ar");
    document.querySelectorAll("#followUpTable tbody tr").forEach((row) => {
      row.hidden = query !== "" && !row.dataset.search.includes(query);
    });
  };
}

async function renderAttachments() {
  await prepareAcademicSelection("attachments");
  try { await loadSchoolSettings(); } catch (_) {}
  await renderSkillAttachments({
    root: contentEl,
    academicSelectorHtml,
    bindAcademicSelector,
    getAcademicQuery: academicQuery,
    rerender: renderAttachments,
    api,
    escapeHtml,
    formatDate,
    openPrint: openAnalysisPrint,
    printTable: analysisPrintTable,
    toast,
  });
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
      <td><span class="tracking-derived" data-derived="periodic-tests" data-value="${row.periodicTestAverage === null || row.periodicTestAverage === undefined ? "" : Number(row.periodicTestAverage)}">${cleanScore(row.periodicTestAverage)}</span></td>
      <td><span class="tracking-derived" data-derived="participation" data-ratio="${Number(row.participationRatio || 0)}">${cleanScore(row.participationAverage)}</span></td>
      <td><span class="tracking-derived" data-derived="homework" data-ratio="${Number(row.homeworkRatio || 0)}">${cleanScore(row.homeworkAverage)}</span></td>
      <td><span class="tracking-derived" data-derived="tasks" data-ratio="${Number(row.tasksRatio || 0)}">${cleanScore(row.tasksAverage)}</span></td>
      <td>${scoreInput(row.id, "finalExamScore", row.finalExamScore, settings.finalExamMax)}</td>
      <td class="tracking-total">${cleanScore(row.total)}</td>
    </tr>`;
  }).join("");

  target.innerHTML = `
    <p class="tracking-note">حددي الدرجة الكاملة لكل بند، ثم أدخلي درجات الطالبات؛ تُحفظ التغييرات تلقائيًا.</p>
    ${followUpPeriod === 3 ? '<p class="tracking-note">متوسط الاختبارين يُحسب تلقائيًا من درجة الاختبار الفتري في الفترة الأولى ودرجة الاختبار الفتري في الفترة الثانية. ومتوسطات المشاركة والواجبات والمهام تُحسب من الفترتين نفسيهما.</p>' : ""}
    <div class="score-settings">${settingsHtml}</div>
    ${data.rows.length ? `<div class="table-wrap"><table id="followUpTable"><thead><tr>${followUpPeriod < 3
      ? "<th>البريد الإلكتروني</th><th>اسم الطالبة</th><th>الاختبار الفتري</th><th>المشاركة</th><th>الواجبات</th><th>المهام</th><th>المجموع</th>"
      : "<th>البريد الإلكتروني</th><th>اسم الطالبة</th><th>متوسط الاختبارين</th><th>متوسط المشاركة</th><th>متوسط الواجبات</th><th>متوسط المهام</th><th>الاختبار النهائي</th><th>المجموع</th>"
    }</tr></thead><tbody>${rowsHtml}</tbody></table></div>` : '<div class="empty-state">لا توجد طالبات في فصولك بعد.</div>'}
    ${data.rows.length ? '<p class="follow-up-inline-save-note">يُحفظ كل تعديل تلقائيًا دون الحاجة إلى زر حفظ.</p>' : ""}
  `;

  document.querySelectorAll(".score-input").forEach((input) => {
    input.oninput = () => { recalculateFollowUpRow(input.closest("tr")); scheduleFollowUpAutosave(); };
    input.onchange = () => scheduleFollowUpAutosave(0);
  });
  document.querySelectorAll(".max-input").forEach((input) => {
    input.oninput = () => {
      updateFollowUpMaximums();
      document.querySelectorAll("#followUpTable tbody tr").forEach(recalculateFollowUpRow);
      scheduleFollowUpAutosave();
    };
    input.onchange = () => scheduleFollowUpAutosave(0);
  });
  setFollowUpAutosaveStatus("idle", data.rows.length ? "الحفظ التلقائي مفعّل" : "");
}

function currentMax(name) {
  return Number(document.querySelector(`[data-max-setting="${name}"]`)?.value || 0);
}

function updateFollowUpMaximums() {
  const mapping = followUpPeriod < 3
    ? { periodicTestScore: "periodicTestMax", participationScore: "participationMax", homeworkScore: "homeworkMax", tasksScore: "tasksMax" }
    : { finalExamScore: "finalExamMax" };
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
    const periodicTestsElement = row.querySelector('[data-derived="periodic-tests"]');
    const periodicTestAverage = periodicTestsElement?.dataset.value === "" ? 0 : Number(periodicTestsElement?.dataset.value || 0);
    const derivedMaxes = { participation: "participationMax", homework: "homeworkMax", tasks: "tasksMax" };
    let derivedTotal = 0;
    Object.entries(derivedMaxes).forEach(([key, maxName]) => {
      const element = row.querySelector(`[data-derived="${key}"]`);
      const value = Number(element.dataset.ratio || 0) * currentMax(maxName);
      element.textContent = cleanScore(value);
      derivedTotal += value;
    });
    total = periodicTestAverage + derivedTotal + (numericInput(row, "finalExamScore") || 0);
  }
  row.querySelector(".tracking-total").textContent = cleanScore(total);
}

// ==========================================================================
// النقاط التحفيزية
// ==========================================================================
let motivationFrameResizeObserver = null;

function syncMotivationFrameHeight(frame) {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) return;
  const contentHeight = Math.ceil(Math.max(
    frameDocument.documentElement?.scrollHeight || 0,
    frameDocument.body?.scrollHeight || 0,
  ));
  if (contentHeight > 0) frame.style.height = `${contentHeight}px`;
}

async function renderMotivation() {
  motivationFrameResizeObserver?.disconnect();
  motivationFrameResizeObserver = null;
  contentEl.innerHTML = `
    <section class="motivation-frame-shell">
      <iframe class="motivation-app-frame" src="motivation.html?v=7-points" title="مشروع نقاط التحفيز" loading="eager" scrolling="no"></iframe>
    </section>
  `;
  const frame = contentEl.querySelector(".motivation-app-frame");
  frame.addEventListener("load", () => {
    let frameResizeObserver = null;
    const updateHeight = () => {
      if (!frame.isConnected) {
        frameResizeObserver?.disconnect();
        if (motivationFrameResizeObserver === frameResizeObserver) motivationFrameResizeObserver = null;
        return;
      }
      syncMotivationFrameHeight(frame);
    };
    updateHeight();
    const frameDocument = frame.contentDocument;
    if (!frameDocument || typeof ResizeObserver === "undefined") return;
    frameResizeObserver = new ResizeObserver(updateHeight);
    frameResizeObserver.observe(frameDocument.documentElement);
    if (frameDocument.body) frameResizeObserver.observe(frameDocument.body);
    motivationFrameResizeObserver = frameResizeObserver;
    frame.contentWindow?.addEventListener("unload", () => {
      frameResizeObserver?.disconnect();
      if (motivationFrameResizeObserver === frameResizeObserver) motivationFrameResizeObserver = null;
    }, { once: true });
  }, { once: true });
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
                  <button class="btn btn-secondary btn-sm" data-dup="${t.id}" data-test-type="${t.type}" data-test-title="${escapeHtml(t.title)}">تكرار الاختبار</button>
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
    wrap.querySelectorAll("[data-dup]").forEach((b) => b.addEventListener("click", () => openTestDuplicateForm({
      id: Number(b.dataset.dup),
      title: b.dataset.testTitle || "اختبار",
      type: b.dataset.testType || (type === "all" ? "pre_diagnostic" : type),
    })));
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

function openTestDuplicateForm(source) {
  openModal(`<form id="testDuplicateForm">
    <h3>تكرار الاختبار</h3>
    <p class="modal-note">ستُنشأ نسخة مستقلة كمسودة مع جميع الأسئلة، ولن يتغير الاختبار الأصلي أو نتائجه.</p>
    <div id="testDuplicateMsg"></div>
    <div class="form-grid">
      <label class="field">عنوان الاختبار الجديد<input id="testDuplicateTitle" value="${escapeHtml(`${source.title} (نسخة)`)}" required></label>
      <label class="field">نوع الاختبار<select id="testDuplicateType">
        ${Object.entries(TEST_TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${source.type === value ? "selected" : ""}>${label}</option>`).join("")}
      </select></label>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" type="button" id="cancelTestDuplicate">إلغاء</button>
      <button class="btn btn-primary" type="submit" id="submitTestDuplicate">تكرار وفتح للتعديل</button>
    </div>
  </form>`);
  document.getElementById("cancelTestDuplicate").onclick = closeModal;
  document.getElementById("testDuplicateForm").onsubmit = async (event) => {
    event.preventDefault();
    const title = document.getElementById("testDuplicateTitle").value.trim();
    const selectedType = document.getElementById("testDuplicateType").value;
    if (!title) {
      document.getElementById("testDuplicateMsg").innerHTML = '<div class="form-error">أدخلي عنوان النسخة الجديدة.</div>';
      return;
    }
    const submitButton = document.getElementById("submitTestDuplicate");
    submitButton.disabled = true;
    try {
      const copied = await api(`/tests/${source.id}/duplicate`, { method: "POST", body: JSON.stringify({ title, type: selectedType }) });
      recentCreatedTestId = Number(copied.id || 0);
      recentCreatedTestType = copied.type || selectedType;
      const copiedTest = await api(`/tests/${recentCreatedTestId}`);
      toast("تم تكرار الاختبار. يمكنكِ الآن تعديل النسخة الجديدة.");
      openTestForm(recentCreatedTestType, copiedTest);
    } catch (error) {
      submitButton.disabled = false;
      document.getElementById("testDuplicateMsg").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
    }
  };
}

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
      <div class="field">نوع الاختبار<select id="tfType">
        ${Object.entries(TEST_TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${(test?.type || type) === value ? "selected" : ""}>${label}</option>`).join("")}
      </select></div>
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
    type: document.getElementById("tfType").value,
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
    if (testsPanelMode !== "all" && testsPanelMode !== payload.type) {
      testsPanelMode = payload.type;
      renderTestsPanel().catch(showTestsLoadError);
    } else {
      loadTestsList(testsPanelMode);
    }
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

async function openAnalysisPrint({ title, classId = "", bodyHtml = "", orientation = "portrait", popupWindow = null, sections = null }) {
  const popup = popupWindow || window.open("", "_blank");
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
  const absoluteMadarLogo = new URL(settings.madarLogoUrl || "/assets/print/madar-official-logo-transparent.png", window.location.origin).href;
  const absoluteVisionLogo = new URL(settings.visionLogoUrl || "/vision-2030-logo.png", window.location.origin).href;
  const absoluteAdditionalLogo = settings.additionalLogoUrl ? new URL(settings.additionalLogoUrl, window.location.origin).href : "";
  const governmentLines = [
    "<strong>المملكة العربية السعودية</strong>",
    "<span>وزارة التعليم</span>",
    settings.educationDepartment ? `<span>إدارة التعليم: ${escapeHtml(settings.educationDepartment)}</span>` : "",
    settings.educationOffice ? `<span>مكتب التعليم: ${escapeHtml(settings.educationOffice)}</span>` : "",
    settings.schoolName ? `<span>المدرسة: ${escapeHtml(settings.schoolName)}</span>` : "",
  ].filter(Boolean).join("");
  const leader = settings.schoolLeaderName || "____________________";
  const teacher = settings.teacherName || currentTeacher?.name || "____________________";
  const pageOrientation = orientation === "landscape" ? "landscape" : "portrait";
  const hasStructuredSections = Array.isArray(sections) && sections.length > 0;
  const reportSections = hasStructuredSections ? sections : [{ title: "", bodyHtml, context: { classId } }];

  function officialSection(section, index) {
    const supplied = section?.context || {};
    const classContext = analysisClassContext(supplied.classId ?? classId);
    const subjectName = supplied.subjectName || settings.subjectName || "الرياضيات";
    const printStage = supplied.stage || (classContext.stage !== "جميع المراحل" ? classContext.stage : settings.stageLabel) || "جميع المراحل";
    const printGrade = supplied.grade || (classContext.grade !== "جميع الصفوف" ? classContext.grade : settings.gradeLabel) || "جميع الصفوف";
    const className = supplied.className || classContext.name || "جميع الفصول";
    const semester = supplied.semesterLabel || settings.semesterLabel || "—";
    const academicYear = supplied.academicYear || settings.academicYear || "—";
    const sectionTitle = section?.title || title;
    return `<article class="official-print-section${index ? " has-page-break" : ""}">
      <header class="official-header">
        <section class="government-copy">${governmentLines}</section>
        <section class="center-logo"><div class="print-logo-row"><img src="${absoluteMadarLogo}" alt="شعار مدار"><img src="${absoluteVisionLogo}" alt="شعار رؤية السعودية 2030">${absoluteAdditionalLogo ? `<img src="${absoluteAdditionalLogo}" alt="الشعار الإضافي">` : ""}</div><h1>${escapeHtml(title)}</h1></section>
        <section class="report-meta">
          <div><b>المادة:</b> ${escapeHtml(subjectName)}</div>
          <div><b>المرحلة والصف:</b> ${escapeHtml(`${printStage} — ${printGrade}`)}</div>
          <div><b>الفصل:</b> ${escapeHtml(className)}</div>
          <div><b>الفصل الدراسي:</b> ${escapeHtml(semester)}</div>
          <div><b>العام الدراسي:</b> ${escapeHtml(academicYear)}</div>
        </section>
      </header>
      ${hasStructuredSections ? `<header class="report-section-title"><span>تحليل النتائج التشخيصية</span><h2>${escapeHtml(sectionTitle)}</h2></header>` : ""}
      <section class="report-content">${section?.bodyHtml || ""}</section>
      <footer class="official-footer"><span>مديرة المدرسة: ${escapeHtml(leader)}</span><span>المعلمة: ${escapeHtml(teacher)}</span></footer>
    </article>`;
  }
  const officialDocument = reportSections.map(officialSection).join("");
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
    html, body { margin: 0; padding: 0; direction: rtl; color: #241b3c; font-family: Tajawal, "Segoe UI", Tahoma, sans-serif; background: #eef0f3; }
    .print-actions { position: sticky; top: 0; z-index: 20; display: flex; justify-content: center; gap: 10px; padding: 12px; background: #fff; border-bottom: 1px solid #ddd; }
    .print-actions button { border: 1px solid #5a2b82; border-radius: 9px; padding: 9px 18px; background: #5a2b82; color: #fff; font: inherit; cursor: pointer; }
    .print-actions button + button { background: #fff; color: #5a2b82; }
    .print-actions button:disabled { cursor: wait; opacity: .55; }
    .official-document { width: ${pageOrientation === "landscape" ? "297mm" : "210mm"}; margin: 16px auto; }
    .official-print-section { min-height: ${pageOrientation === "landscape" ? "210mm" : "297mm"}; margin: 0 0 16px; padding: 7mm 8mm 8mm; background: #fff; box-shadow: 0 6px 24px rgba(25,20,35,.12); position: relative; }
    .official-print-section.has-page-break { break-before: page; page-break-before: always; }
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
    .report-section-title { display: block; margin: 0 0 4mm; border-right: 4px solid #6b3fa0; padding: 1.5mm 3mm 1.5mm 0; break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
    .report-section-title span { display: block; color: #1f7f76; font-size: 8pt; font-weight: 800; }
    .report-section-title h2 { margin: .8mm 0 0; color: #3f2257; font-size: 13pt; }
    .report-content { display: block; width: 100%; max-width: 100%; overflow: visible; }
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
    .report-content table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${pageOrientation === "landscape" ? "7.4pt" : "8.2pt"}; direction: rtl; }
    .report-content table thead { display: table-header-group; }
    .report-content table th, .report-content table td { border: 1px solid #b9b3bf; padding: 1.8mm; text-align: center; vertical-align: middle; direction: rtl; unicode-bidi: plaintext; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
    .report-content table th { background: #f1edf5; color: #3f2555; font-weight: 700; }
    .report-content table tr { break-inside: avoid; page-break-inside: avoid; }
    .question-print-table th:nth-child(1), .question-print-table td:nth-child(1) { width: 11%; }
    .question-print-table th:nth-child(2), .question-print-table td:nth-child(2) { width: 18%; }
    .question-print-table th:nth-child(3), .question-print-table td:nth-child(3) { width: 32%; text-align: right; }
    .question-print-table th:nth-child(4), .question-print-table td:nth-child(4) { width: 12%; }
    .question-print-table th:nth-child(5), .question-print-table td:nth-child(5) { width: 13%; }
    .question-print-table th:nth-child(6), .question-print-table td:nth-child(6) { width: 14%; }
    .mastery-good { color: #0b7a4b; font-weight: 700; }
    .mastery-mid { color: #8a5a00; font-weight: 700; }
    .mastery-low { color: #b3261e; font-weight: 700; }
    .follow-up-print-section + .follow-up-print-section { break-before: page; page-break-before: always; }
    .analysis-print-context { display: flex; justify-content: space-between; gap: 4mm; margin: 0 0 4mm; border: 1px solid #d8d0df; background: #f8f6fa; padding: 2.5mm 3mm; color: #51465e; font-size: 8.3pt; line-height: 1.55; }
    .analysis-print-context span:last-child { text-align: left; }
    .analysis-print-table-section, .analysis-print-chart { break-inside: auto; page-break-inside: auto; }
    .analysis-print-table-section h3, .analysis-print-chart figcaption { border-right: 3px solid #6b3fa0; padding-right: 2.5mm; }
    .analysis-print-tables { margin-bottom: 5mm; }
    .analysis-print-charts { border-top: 1px solid #d8d0df; padding-top: 4mm; }
    .analysis-print-chart { margin: 0 0 5mm; }
    .analysis-print-chart figcaption { color: #4f266f; font-size: 11pt; font-weight: 800; break-after: avoid; }
    .analysis-print-chart__legend { display: flex; flex-wrap: wrap; gap: 2.5mm 5mm; margin: 2.5mm 0; font-size: 8pt; font-weight: 700; }
    .analysis-print-chart__legend span { display: inline-flex; align-items: center; gap: 1.5mm; }
    .analysis-print-chart__legend i { width: 8mm; height: 3mm; border: 1px solid #4f4657; background: var(--analysis-print-series); }
    .analysis-print-chart__legend .is-series-1 i { background: repeating-linear-gradient(135deg,var(--analysis-print-series) 0 1.2mm,#fff 1.2mm 2.4mm); }
    .analysis-print-chart__legend .is-series-2 i { background: #fff; border: 1.5px dashed #3f3549; }
    .analysis-print-chart__rows { display: grid; gap: 1.7mm; }
    .analysis-print-chart__row { display: grid; grid-template-columns: minmax(33mm,.75fr) minmax(0,2.25fr); align-items: center; gap: 3mm; border-bottom: 1px solid #ebe7ed; padding: 1.5mm 0; break-inside: avoid; page-break-inside: avoid; }
    .analysis-print-chart__row > strong { font-size: 8pt; line-height: 1.4; overflow-wrap: anywhere; }
    .analysis-print-chart__values { display: grid; gap: 1mm; }
    .analysis-print-chart__value { display: grid; grid-template-columns: 20mm minmax(0,1fr) 12mm; align-items: center; gap: 2mm; font-size: 7.5pt; }
    .analysis-print-chart__value > span { color: #51465e; }
    .analysis-print-chart__value > i { display: block; height: 3.2mm; border: 1px solid #9d96a3; background: #f5f3f6; overflow: hidden; }
    .analysis-print-chart__value > i b { display: block; width: var(--analysis-print-width); height: 100%; background: var(--analysis-print-series); }
    .analysis-print-chart__value.is-series-1 > i b { background: repeating-linear-gradient(135deg,var(--analysis-print-series) 0 1.2mm,#fff 1.2mm 2.4mm); border-left: 1px solid #4f4657; }
    .analysis-print-chart__value.is-series-2 > i b { background: #fff; border: 1.5px dashed #3f3549; }
    .analysis-print-chart__value em { color: #241b3c; font-style: normal; font-weight: 800; direction: ltr; text-align: left; }
    .analysis-print-empty, .analysis-print-report-note { border: 1px solid #d8d0df; background: #faf9fb; padding: 4mm; color: #51465e; font-size: 9pt; line-height: 1.7; }
    .analysis-print-empty.is-error { border-color: #c98686; color: #842f2f; background: #fff7f7; }
    .analysis-print-report-note { margin: 4mm 0; border-right: 3px solid #1f9d91; }
    .official-footer { position: static; display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 8mm; border-top: 1px solid #cfc7d5; padding-top: 2.5mm; font-size: 9pt; direction: rtl; break-inside: avoid; page-break-inside: avoid; }
    .official-footer span:first-child { text-align: right; }
    .official-footer span:last-child { text-align: left; }
    @media print {
      *, *::before, *::after { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { width: 100%; margin: 0; padding: 0; background: #fff; direction: rtl; overflow: visible; }
      .print-actions { display: none !important; }
      .official-document { display: block !important; width: 100%; margin: 0; padding: 0; }
      .official-print-section { display: block !important; width: 100%; min-height: 0; margin: 0; padding: 0; background: #fff; box-shadow: none; break-inside: auto; page-break-inside: auto; }
      .official-print-section.has-page-break { break-before: page !important; page-break-before: always !important; }
      .official-print-section:last-child { break-after: auto; page-break-after: auto; }
      .official-header { display: grid !important; grid-template-columns: minmax(0,1fr) minmax(48mm,.72fr) minmax(0,1fr) !important; grid-template-areas: "meta logo government" !important; gap: 6mm !important; align-items: center !important; width: 100%; margin: 0 0 5mm; padding: 0 0 4mm; break-inside: avoid !important; page-break-inside: avoid !important; }
      .government-copy { grid-area: government !important; direction: rtl; text-align: right; }
      .center-logo { grid-area: logo !important; direction: rtl; text-align: center; }
      .report-meta { grid-area: meta !important; direction: rtl; text-align: right; }
      .report-section-title { display: block !important; margin: 0 0 4mm; break-inside: avoid !important; page-break-inside: avoid !important; break-after: avoid !important; page-break-after: avoid !important; }
      .report-content, .analysis-print-tables, .analysis-print-charts { display: block !important; width: 100%; max-width: 100%; overflow: visible !important; }
      .analysis-print-context { display: grid !important; grid-template-columns: minmax(32mm,.65fr) minmax(0,2fr); gap: 4mm; width: 100%; break-inside: avoid; page-break-inside: avoid; }
      .analysis-print-table-section { display: block !important; width: 100%; break-inside: auto; page-break-inside: auto; }
      .analysis-print-table-section h3, .analysis-print-chart figcaption, .analysis-print-chart__legend { break-inside: avoid !important; page-break-inside: avoid !important; break-after: avoid !important; page-break-after: avoid !important; }
      .print-table-wrap { display: block; width: 100%; max-width: 100%; overflow: visible !important; }
      .report-content table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; direction: rtl; }
      .report-content table thead { display: table-header-group !important; }
      .report-content table tbody { display: table-row-group; }
      .report-content table tr { break-inside: avoid !important; page-break-inside: avoid !important; }
      .report-content table th, .report-content table td { overflow: visible; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
      .analysis-print-charts { clear: both; border-top: 1px solid #d8d0df; padding-top: 4mm; }
      .analysis-print-chart { display: block !important; width: 100%; max-width: 100%; overflow: visible; break-inside: auto; page-break-inside: auto; }
      .analysis-print-chart__rows { display: block !important; width: 100%; }
      .analysis-print-chart__row { display: grid !important; grid-template-columns: 42mm minmax(0,1fr) !important; gap: 3mm !important; width: 100%; max-width: 100%; margin: 0; break-inside: avoid !important; page-break-inside: avoid !important; }
      .analysis-print-chart__values { display: grid !important; width: 100%; }
      .analysis-print-chart__value { display: grid !important; grid-template-columns: 20mm minmax(0,1fr) 12mm !important; gap: 2mm !important; width: 100%; direction: rtl; }
      .official-footer { position: static !important; display: grid !important; grid-template-columns: 1fr 1fr; width: 100%; margin-top: 8mm; break-inside: avoid !important; page-break-inside: avoid !important; }
    }
    @media screen and (max-width: 850px) {
      .official-document { width: 100%; margin: 0; }
      .official-print-section { width: 100%; min-height: 0; margin: 0 0 14px; padding: 14px; }
      .official-header { grid-template-columns: 1fr; grid-template-areas: "government" "logo" "meta"; }
      .official-footer { position: static; margin-top: 20px; }
      .analysis-print-context { flex-direction: column; }
      .analysis-print-context span:last-child { text-align: right; }
      .analysis-print-chart__row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="print-actions"><button id="analysisPrintNow" type="button" onclick="window.print()" disabled>جارٍ تحميل الشعارات…</button><button type="button" onclick="window.close()">إغلاق</button></div>
  <main class="official-document">${officialDocument}</main>
</body>
</html>`);
  popup.document.close();
  const images = [...popup.document.images];
  const fontReadiness = popup.document.fonts?.ready || Promise.resolve();
  const imageReadiness = images.map(async (image) => {
    if (!image.complete) {
      await new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }
    if (typeof image.decode === "function") {
      try { await image.decode(); } catch (_) {}
    }
  });
  await Promise.race([
    Promise.allSettled([fontReadiness, ...imageReadiness]),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  const printButton = popup.document.getElementById("analysisPrintNow");
  if (printButton) {
    printButton.disabled = false;
    printButton.textContent = "طباعة / حفظ PDF";
  }
  popup.focus();
  return true;
}

async function renderAnalysisPanel() {
  try { await prepareAnalysisAcademicSelection(); } catch (_) {}
  await renderAnalysisDashboard({
    root: contentEl,
    academicSelectorHtml,
    bindAcademicSelector,
    getAcademicQuery: academicQuery,
    api,
    escapeHtml,
    formatDate,
    openPrint: openAnalysisPrint,
    printTable: analysisPrintTable,
    toast,
  });
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
async function renderActivityPanel(mode = "activity") {
  const activeMode = ["activity", "announcements", "notifications", "help-center"].includes(mode) ? mode : "activity";
  contentEl.innerHTML = `
    <div class="student-panel-tabs" role="tablist" aria-label="سجل الأنشطة والإعلانات والمساعدة والإشعارات">
      <button class="tab-btn ${activeMode === "activity" ? "active" : ""}" type="button" data-activity-panel="activity">سجل الأنشطة</button>
      <button class="tab-btn ${activeMode === "announcements" ? "active" : ""}" type="button" data-activity-panel="announcements">الإعلانات</button>
      <button class="tab-btn ${activeMode === "notifications" ? "active" : ""}" type="button" data-activity-panel="notifications">الإشعارات</button>
      <button class="tab-btn ${activeMode === "help-center" ? "active" : ""}" type="button" data-activity-panel="help-center">مركز المساعدة</button>
    </div>
    <div id="activityPanelContent"></div>
  `;
  contentEl.querySelectorAll("[data-activity-panel]").forEach((button) => {
    button.onclick = () => navigate(button.dataset.activityPanel);
  });
  const panel = document.getElementById("activityPanelContent");
  if (activeMode === "announcements") await renderAnnouncements(panel);
  else if (activeMode === "notifications") await renderNotifications(panel);
  else if (activeMode === "help-center") await renderHelpCenter(panel);
  else await renderActivity(panel);
}

const ANNOUNCEMENT_SIZE_LABELS = {
  auto: "تلقائي",
  small: "صغير",
  medium: "متوسط",
  large: "كبير",
};

async function renderAnnouncements(target = contentEl) {
  let data;
  try {
    data = await api("/announcements");
  } catch (error) {
    target.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`;
    return;
  }
  const announcements = Array.isArray(data.announcements) ? data.announcements : [];
  target.innerHTML = `
    <section class="announcement-manager-grid">
      <form class="card announcement-compose-card" id="announcementForm" enctype="multipart/form-data">
        <header class="announcement-section-head">
          <span aria-hidden="true">📣</span>
          <div><small>رسالة تظهر عند دخول الطالبة</small><h3>إنشاء إعلان جديد</h3></div>
        </header>
        <p class="announcement-form-note">يمكن كتابة نص أو إرفاق صورة أو استخدامهما معًا. اختيار المقاس غير إلزامي وسيُضبط تلقائيًا إذا تُرك على الوضع التلقائي.</p>
        <label class="field announcement-text-field">نص الإعلان <small>اختياري عند إرفاق صورة</small>
          <textarea name="body" maxlength="4000" rows="6" placeholder="اكتبي الإعلان الذي سيظهر للطالبات…"></textarea>
        </label>
        <div class="announcement-form-row">
          <label class="field">صورة الإعلان <small>اختيارية · PNG أو JPG أو WebP · حتى 5MB</small>
            <input id="announcementImageInput" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <label class="field">مقاس الإعلان <small>اختياري</small>
            <select name="displaySize">
              <option value="auto">تلقائي — حسب المحتوى</option>
              <option value="small">صغير</option>
              <option value="medium">متوسط</option>
              <option value="large">كبير</option>
            </select>
          </label>
        </div>
        <div class="announcement-image-preview" id="announcementImagePreview" hidden></div>
        <label class="announcement-publish-switch">
          <input name="isActive" type="checkbox" value="1" checked />
          <span aria-hidden="true"></span>
          <b>نشر الإعلان مباشرة للطالبات</b>
        </label>
        <div id="announcementFormMessage" aria-live="polite"></div>
        <button class="btn btn-primary announcement-submit" type="submit">حفظ الإعلان</button>
      </form>

      <section class="announcement-list-panel">
        <div class="announcement-list-heading">
          <div><small>الإعلانات السابقة</small><h3>إدارة الإعلانات</h3></div>
          <span>${announcements.length}</span>
        </div>
        <div class="announcement-list">
          ${announcements.length ? announcements.map((announcement) => `
            <article class="announcement-admin-card ${announcement.isActive ? "is-active" : ""}">
              <div class="announcement-card-status">
                <span class="announcement-status ${announcement.isActive ? "active" : "draft"}">${announcement.isActive ? "منشور الآن" : "غير منشور"}</span>
                <small>المقاس: ${escapeHtml(ANNOUNCEMENT_SIZE_LABELS[announcement.displaySize] || "تلقائي")}</small>
              </div>
              ${announcement.imageUrl ? `<img src="${escapeHtml(announcement.imageUrl)}" alt="معاينة صورة الإعلان" loading="lazy" />` : ""}
              ${announcement.body ? `<p>${escapeHtml(announcement.body)}</p>` : '<p class="announcement-image-only">إعلان بصورة فقط</p>'}
              <footer>
                <time>${formatDate(announcement.publishedAt || announcement.createdAt)}</time>
                <div>
                  <button class="btn btn-outline btn-sm" type="button" data-announcement-status="${announcement.id}" data-active="${announcement.isActive ? "0" : "1"}">${announcement.isActive ? "إيقاف" : "نشر"}</button>
                  <button class="btn btn-danger btn-sm" type="button" data-announcement-delete="${announcement.id}">حذف</button>
                </div>
              </footer>
            </article>`).join("") : '<div class="empty-state announcement-empty"><span aria-hidden="true">📭</span><strong>لا توجد إعلانات بعد</strong><p>أنشئي أول إعلان ليظهر للطالبات عند دخولهن.</p></div>'}
        </div>
      </section>
    </section>`;

  const form = document.getElementById("announcementForm");
  const imageInput = document.getElementById("announcementImageInput");
  const preview = document.getElementById("announcementImagePreview");
  let previewUrl = "";
  imageInput.onchange = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = imageInput.files?.[0];
    if (!file) {
      preview.hidden = true;
      preview.innerHTML = "";
      previewUrl = "";
      return;
    }
    previewUrl = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${previewUrl}" alt="معاينة الصورة قبل الحفظ" /><span>${escapeHtml(file.name)}</span>`;
    preview.hidden = false;
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const message = document.getElementById("announcementFormMessage");
    const submit = form.querySelector('[type="submit"]');
    const payload = new FormData(form);
    payload.set("isActive", form.elements.isActive.checked ? "1" : "0");
    submit.disabled = true;
    submit.textContent = "جارٍ الحفظ…";
    message.innerHTML = "";
    try {
      await api("/announcements", { method: "POST", body: payload });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      toast(form.elements.isActive.checked ? "تم نشر الإعلان للطالبات." : "تم حفظ الإعلان دون نشره.");
      await renderActivityPanel("announcements");
    } catch (error) {
      message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
      submit.disabled = false;
      submit.textContent = "حفظ الإعلان";
    }
  };
  target.querySelectorAll("[data-announcement-status]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        const isActive = button.dataset.active === "1";
        await api(`/announcements/${button.dataset.announcementStatus}/status`, { method: "PUT", body: JSON.stringify({ isActive }) });
        toast(isActive ? "تم نشر الإعلان، وإيقاف أي إعلان سابق." : "تم إيقاف الإعلان.");
        await renderActivityPanel("announcements");
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    };
  });
  target.querySelectorAll("[data-announcement-delete]").forEach((button) => {
    button.onclick = () => confirmAction("حذف هذا الإعلان نهائيًا مع صورته؟", async () => {
      await api(`/announcements/${button.dataset.announcementDelete}`, { method: "DELETE" });
      toast("تم حذف الإعلان.");
      await renderActivityPanel("announcements");
    });
  });
}

async function renderActivity(target = contentEl) {
  const logs = await api("/data/activity-log");
  target.innerHTML = `
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
// تخطيط المعلم
// ==========================================================================
const TEACHER_PLANNING_SECTIONS = {
  "semester-plans": {
    icon: "🗓️",
    title: "الخطط الفصلية",
    hint: "مساحة تنظيم الخطط الفصلية وربطها بالعام الدراسي والترم.",
  },
  "curriculum-distribution": {
    icon: "📚",
    title: "توزيع المنهج",
    hint: "مساحة تنظيم توزيع وحدات ودروس المنهج على أسابيع الفصل الدراسي.",
  },
  strategies: {
    icon: "💡",
    title: "الاستراتيجيات",
    hint: "مساحة تنظيم استراتيجيات التدريس المرتبطة بالتخطيط والدروس.",
  },
  "interactive-presentations": {
    icon: "🖥️",
    title: "العروض التفاعلية",
    hint: "مساحة إعداد وتنظيم العروض التفاعلية المستخدمة داخل الحصص.",
  },
  "professional-community": {
    icon: "🤝",
    title: "المجتمع المهني",
    hint: "مساحة خاصة داخل حسابكِ لتنظيم مواد التطوير المهني ومراجعكِ؛ لا تُشارك تلقائيًا مع أي معلمة أخرى.",
  },
  "planning-settings": {
    icon: "⚙️",
    title: "إعداد التخطيط",
    hint: "مساحة تهيئة بيانات التخطيط وخياراته بما يناسب احتياجكِ.",
  },
};

let teacherPlanningMode = "semester-plans";
let teacherPlanningState = { migrationReady: true, items: [], classes: [], loaded: false };
let strategyReportState = { migrationReady: true, items: [], loaded: false };
const teacherPlanningSearchState = {
  "semester-plans": "",
  "curriculum-distribution": "",
  strategies: "",
  "interactive-presentations": "",
};

const PLANNING_DESTINATION_LABELS = {
  "library-worksheets": "أوراق العمل", "library-training": "التدريبات", "library-videos": "الفيديوهات",
  "semester-plans": "الخطط الفصلية",
  "curriculum-distribution": "توزيع المنهج",
  strategies: "الاستراتيجيات",
  "interactive-presentations": "العروض التفاعلية",
  "professional-community": "المجتمع المهني · تنظيم خاص",
};
const PLANNING_CONTENT_LABELS = { presentation: "عرض تقديمي", activity: "نشاط", explanation: "شرح", game: "لعبة" };
const PLANNING_SOURCE_LABELS = { video: "فيديو", html: "HTML", zip: "حزمة ZIP", pdf: "PDF", image: "صورة" };

function teacherPlanningTabs() {
  return `<div class="student-panel-tabs teacher-planning-tabs" role="tablist" aria-label="أقسام تخطيط المعلم">
    ${Object.entries(TEACHER_PLANNING_SECTIONS).map(([key, value]) => `<button class="tab-btn ${teacherPlanningMode === key ? "active" : ""}" type="button" role="tab" aria-selected="${teacherPlanningMode === key}" data-teacher-planning="${key}">${value.title}</button>`).join("")}
  </div>`;
}

function planningContentFallback(item) {
  const visual = {
    html: { extension: "HTML", symbol: "</>", detail: "صفحة ويب" },
    zip: { extension: "ZIP", symbol: "⋮", detail: "حزمة ويب" },
    pdf: { extension: "PDF", symbol: "≡", detail: "مستند" },
    image: { extension: "IMG", symbol: "▧", detail: "صورة" },
  }[item.sourceType] || { extension: "FILE", symbol: "◇", detail: "ملف" };
  return `<div class="planning-cover-fallback source-${escapeHtml(item.sourceType)}">
    <div class="planning-file-visual" aria-hidden="true"><i></i><b>${visual.symbol}</b><strong>${visual.extension}</strong><span></span><span></span></div>
    <div class="planning-fallback-copy"><strong>${escapeHtml(visual.detail)}</strong><small>${escapeHtml(PLANNING_CONTENT_LABELS[item.contentType] || item.contentType)}</small></div>
  </div>`;
}

function formatPlanningNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("ar-SA", { useGrouping: false }).format(number) : "—";
}

function planningPresentationCard(item) {
  const published = item.status === "published" && Number(item.publishedClassCount || 0) > 0;
  const unitNumber = formatPlanningNumber(item.unitNumber);
  const lessonNumber = formatPlanningNumber(item.lessonNumber);
  return `<article class="card teacher-game-card planning-presentation-game-card" data-planning-presentation="${item.id}">
    <div class="teacher-game-lesson-number" aria-label="الوحدة ${escapeHtml(unitNumber)}، الدرس ${escapeHtml(lessonNumber)}">${escapeHtml(unitNumber)}-${escapeHtml(lessonNumber)}</div>
    <div class="teacher-game-copy">
      <div class="planning-presentation-kicker"><span>${escapeHtml(PLANNING_CONTENT_LABELS[item.contentType] || item.contentType)}</span><span>${escapeHtml(PLANNING_SOURCE_LABELS[item.sourceType] || item.sourceType)}</span></div>
      <h3>${escapeHtml(item.name)}</h3>
      <p class="planning-presentation-lesson">${escapeHtml(item.lessonName)}</p>
      <div class="teacher-game-publication-row"><span class="teacher-game-publication-status${published ? " is-published" : " is-unpublished"}" role="status">${published ? `منشور · ${formatPlanningNumber(item.publishedClassCount || 0)} فصل` : "غير منشور"}</span></div>
      <div class="teacher-game-features" aria-label="بيانات العرض"><span>🎓 ${escapeHtml(item.stage)} · ${escapeHtml(item.gradeLabel)}</span><span>▣ ${escapeHtml(PLANNING_CONTENT_LABELS[item.contentType] || item.contentType)}</span><span>⌁ ${escapeHtml(PLANNING_SOURCE_LABELS[item.sourceType] || item.sourceType)}</span></div>
      <div class="teacher-game-actions planning-presentation-primary-actions">
        <a class="btn btn-primary" href="${escapeHtml(item.previewUrl)}" target="_blank" rel="noopener">فتح العرض</a>
        <button class="btn btn-secondary" type="button" data-planning-copy-link="${escapeHtml(item.playerUrl)}">نسخ الرابط</button>
        <button class="btn btn-outline" type="button" data-planning-settings="${item.id}">إعداد العرض</button>
      </div>
      <div class="planning-presentation-management">
        <span>إدارة العرض</span>
        <div>
          <button class="btn btn-outline btn-sm" type="button" data-planning-publish="${item.id}">${published ? "تعديل النشر" : "نشر للطالبات"}</button>
          <button class="btn btn-danger btn-sm" type="button" data-planning-delete="${item.id}">حذف</button>
        </div>
      </div>
    </div>
  </article>`;
}

function planningContentCard(item, options = {}) {
  if (options.presentationGameLayout) return planningPresentationCard(item);
  const published = item.status === "published" && Number(item.publishedClassCount || 0) > 0;
  const parentPublished = Number(item.publishedParentClassCount || 0) > 0;
  const cover = item.hasCover ? `<img src="${escapeHtml(item.coverUrl)}" alt="غلاف ${escapeHtml(item.name)}" loading="lazy">` : planningContentFallback(item);
  return `<article class="planning-content-card">
    <div class="planning-content-cover">${cover}<span class="planning-state ${published ? "published" : "draft"}">${published ? "منشور" : "مسودة"}</span><span class="planning-cover-format">${escapeHtml(PLANNING_SOURCE_LABELS[item.sourceType] || item.sourceType)}</span></div>
    <div class="planning-content-body">
      <div class="planning-card-kicker"><span class="content-kind">${escapeHtml(PLANNING_CONTENT_LABELS[item.contentType] || item.contentType)}</span><span>${escapeHtml(PLANNING_DESTINATION_LABELS[item.destination] || item.destination)}</span></div>
      <h3>${escapeHtml(item.name)}</h3>
      <p class="planning-school-scope"><span aria-hidden="true">◎</span>${escapeHtml(item.stage)} · ${escapeHtml(item.gradeLabel)}</p>
      <div class="planning-lesson-summary"><div><span>الوحدة ${Number(item.unitNumber)}</span><span>الدرس ${Number(item.lessonNumber)}</span></div><strong>${escapeHtml(item.lessonName)}</strong></div>
      <div class="planning-publication-summary"><span><small>الإتاحة للطالبات</small><strong>${published ? `${Number(item.publishedClassCount || 0)} فصل` : "غير منشور"}</strong></span>${item.destination === "semester-plans" ? `<span><small>الإتاحة لأولياء الأمور</small><strong>${parentPublished ? `${Number(item.publishedParentClassCount || 0)} فصل` : "غير منشور"}</strong></span>` : `<span><small>آخر تحديث</small><strong>${formatDate(item.updatedAt || item.createdAt)}</strong></span>`}</div>
      <div class="planning-card-actions">
        <a class="btn btn-outline btn-sm" href="${escapeHtml(item.previewUrl)}" target="_blank" rel="noopener">معاينة</a>
        <div class="planning-card-publish-actions">
          <button class="btn btn-primary btn-sm" type="button" data-planning-publish="${item.id}">${published ? "تعديل النشر" : "نشر للطالبات"}</button>
          ${item.destination === "semester-plans" ? `<button class="btn btn-outline btn-sm planning-parent-publish-button" type="button" data-planning-publish-parents="${item.id}" ${teacherPlanningState.parentPublicationReady ? "" : `disabled title="يلزم تشغيل ${escapeHtml(teacherPlanningState.parentPublicationMigration || "ترحيل نشر أولياء الأمور")}"`}>${parentPublished ? "تعديل نشر أولياء الأمور" : "نشر لأولياء الأمور"}</button>` : ""}
          <button class="btn btn-outline btn-sm" type="button" data-planning-settings="${item.id}">إعدادات</button>
        </div>
        <button class="btn btn-danger btn-sm" type="button" data-planning-delete="${item.id}">حذف</button>
      </div>
    </div>
  </article>`;
}

function planningContentLibrary(items, emptyTitle = "لا يوجد محتوى هنا بعد", options = {}) {
  const isSearchEmpty = Boolean(String(options.searchQuery || "").trim());
  return items.length
    ? `<div class="planning-content-grid${options.list ? " planning-content-list" : ""}">${items.map((item) => planningContentCard(item, options)).join("")}</div>`
    : isSearchEmpty
      ? `<div class="planning-library-empty planning-search-empty"><span aria-hidden="true">⌕</span><h3>لا توجد نتائج مطابقة لبحثك</h3><p>جرّبي اسمًا آخر أو امسحي عبارة البحث لعرض كل المحتوى.</p><button class="btn btn-outline" type="button" data-planning-search-clear>مسح البحث</button></div>`
      : `<div class="planning-library-empty"><span aria-hidden="true">▧</span><h3>${escapeHtml(emptyTitle)}</h3><p>ارفعي محتوى من «إعداد التخطيط» وحددي هذه الوجهة ليظهر هنا.</p><button class="btn btn-primary" type="button" data-open-planning-studio>فتح استديو المحتوى</button></div>`;
}

function normalizePlanningSearch(value) {
  const digits = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
  return String(value ?? "")
    .replace(/[٠-٩۰-۹]/g, (digit) => digits[digit])
    .replace(/[\u0640\u064B-\u065F\u0670]/g, "")
    .toLocaleLowerCase("ar")
    .replace(/\s+/g, " ")
    .trim();
}

function filterPlanningContent(items, query) {
  const terms = normalizePlanningSearch(query).split(" ").filter(Boolean);
  if (!terms.length) return items;
  return items.filter((item) => {
    const haystack = normalizePlanningSearch([
      item.name,
      item.stage,
      item.gradeLabel,
      item.lessonName,
      item.unitNumber,
      item.lessonNumber,
      `الوحدة ${item.unitNumber}`,
      `الدرس ${item.lessonNumber}`,
      item.contentType,
      PLANNING_CONTENT_LABELS[item.contentType] || "",
      item.sourceType,
      PLANNING_SOURCE_LABELS[item.sourceType] || "",
    ].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}

function planningSearchLibrary(items, section, mode) {
  const query = teacherPlanningSearchState[mode] || "";
  const filteredItems = filterPlanningContent(items, query);
  const libraryOptions = { list: true, searchQuery: query, presentationGameLayout: mode === "interactive-presentations" };
  return `<section class="planning-library-toolbar" aria-labelledby="planningLibraryTitle">
    <div class="planning-library-title"><small>مكتبتكِ</small><h2 id="planningLibraryTitle">محتوى ${escapeHtml(section.title)}</h2><span id="planningLibraryCount">${filteredItems.length} من ${items.length} محتوى</span></div>
    <form class="planning-library-search" id="planningLibrarySearchForm" role="search">
      <label for="planningLibrarySearch"><span aria-hidden="true">⌕</span><input id="planningLibrarySearch" type="search" autocomplete="off" value="${escapeHtml(query)}" placeholder="ابحثي بالاسم، المرحلة، الصف، الوحدة أو الدرس" aria-label="البحث في ${escapeHtml(section.title)}"></label>
      <button class="btn btn-primary" type="submit">بحث</button>
      <button class="btn btn-outline planning-search-clear" type="button" data-planning-search-clear ${query ? "" : "hidden"}>مسح</button>
    </form>
  </section>
  <div id="planningLibraryResults" aria-live="polite">${planningContentLibrary(filteredItems, `لا يوجد محتوى في ${section.title}`, libraryOptions)}</div>`;
}

function bindPlanningLibrarySearch(mode, items, section) {
  const form = document.getElementById("planningLibrarySearchForm");
  const input = document.getElementById("planningLibrarySearch");
  const results = document.getElementById("planningLibraryResults");
  if (!form || !input || !results) return;

  const renderResults = () => {
    const query = input.value;
    teacherPlanningSearchState[mode] = query;
    const filteredItems = filterPlanningContent(items, query);
    results.innerHTML = planningContentLibrary(filteredItems, `لا يوجد محتوى في ${section.title}`, { list: true, searchQuery: query, presentationGameLayout: mode === "interactive-presentations" });
    const count = document.getElementById("planningLibraryCount");
    if (count) count.textContent = `${filteredItems.length} من ${items.length} محتوى`;
    form.querySelector("[data-planning-search-clear]")?.toggleAttribute("hidden", !query.trim());
    bindPlanningCards();
    bindPlanningTabs();
    results.querySelector("[data-planning-search-clear]")?.addEventListener("click", clearSearch);
  };
  const clearSearch = () => {
    input.value = "";
    renderResults();
    input.focus();
  };

  input.addEventListener("input", renderResults);
  form.addEventListener("submit", (event) => { event.preventDefault();renderResults(); });
  form.querySelector("[data-planning-search-clear]")?.addEventListener("click", clearSearch);
  results.querySelector("[data-planning-search-clear]")?.addEventListener("click", clearSearch);
}

const PROFESSIONAL_COMMUNITY_REPORT_STORAGE_VERSION = 1;
const PROFESSIONAL_COMMUNITY_REPORT_STORAGE_LIMIT = 100;
const PROFESSIONAL_COMMUNITY_REPORT_TYPES = Object.freeze({
  "professional-community": Object.freeze({
    badge: "مجتمع مهني",
    title: "تقرير مجتمع تعلم مهني",
    kicker: "توثيق جلسة مهنية",
    detailsHeading: "بيانات الجلسة",
    numberLabel: "رقم الجلسة",
    numberNoun: "الجلسة",
    topicLabel: "موضوع الجلسة",
    topicPlaceholder: "اكتبي موضوع الجلسة",
    objectivesLabel: "أهداف الجلسة",
    outcomesLabel: "نتائج الجلسة",
    facilitatorLabel: "منفذة الجلسة",
  }),
  workshop: Object.freeze({
    badge: "ورشة عمل",
    title: "تقرير ورشة عمل",
    kicker: "توثيق ورشة عمل",
    detailsHeading: "بيانات الورشة",
    numberLabel: "رقم الورشة",
    numberNoun: "الورشة",
    topicLabel: "عنوان الورشة",
    topicPlaceholder: "اكتبي عنوان الورشة",
    objectivesLabel: "أهداف الورشة",
    outcomesLabel: "نتائج الورشة",
    facilitatorLabel: "منفذة الورشة",
  }),
});

function normalizeProfessionalCommunityReportType(value) {
  return value === "workshop" ? "workshop" : "professional-community";
}

function professionalCommunityReportTypeMeta(value) {
  return PROFESSIONAL_COMMUNITY_REPORT_TYPES[normalizeProfessionalCommunityReportType(value)];
}

function professionalCommunityReportStorageKey() {
  const accountKey = currentTeacher?.id || currentTeacher?.email || "guest";
  return `madarProfessionalCommunityReports:v${PROFESSIONAL_COMMUNITY_REPORT_STORAGE_VERSION}:${String(accountKey)}`;
}

function professionalCommunityHijriDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localNoon = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (localNoon.getFullYear() !== year || localNoon.getMonth() !== month - 1 || localNoon.getDate() !== day) return "";
  try {
    const formatted = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(localNoon);
    return formatted.includes("هـ") ? formatted : `${formatted} هـ`;
  } catch (_) { return ""; }
}

function normalizeProfessionalCommunityReport(item = {}) {
  const text = (value, maxLength = 1000) => String(value ?? "").slice(0, maxLength);
  const textList = (value, maxItems = 100) => Array.isArray(value)
    ? value.slice(0, maxItems).map((entry) => text(entry, 1000))
    : [];
  const attendees = Array.isArray(item.attendees)
    ? item.attendees.slice(0, 100).map((entry) => ({
      name: text(entry?.name, 500),
      signature: text(entry?.signature, 500),
    }))
    : [];
  return {
    id: text(item.id, 120),
    reportType: normalizeProfessionalCommunityReportType(item.reportType),
    createdAt: text(item.createdAt, 40),
    updatedAt: text(item.updatedAt, 40),
    sessionNumber: text(item.sessionNumber, 40),
    topic: text(item.topic, 500),
    targetAudience: text(item.targetAudience, 300),
    day: text(item.day, 60),
    date: text(item.date, 40),
    hijriDate: text(item.hijriDate, 120),
    location: text(item.location, 300),
    objectives: textList(item.objectives),
    outcomes: textList(item.outcomes),
    attendees,
    facilitatorName: text(item.facilitatorName, 300),
    facilitatorSignature: text(item.facilitatorSignature, 300),
    leaderName: text(item.leaderName, 300),
    leaderSignature: text(item.leaderSignature, 300),
  };
}

function readProfessionalCommunityReports() {
  try {
    const raw = localStorage.getItem(professionalCommunityReportStorageKey());
    if (!raw) return { items: [], error: "" };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Invalid report collection");
    return {
      items: parsed
        .filter((item) => item && typeof item === "object" && item.id)
        .slice(0, PROFESSIONAL_COMMUNITY_REPORT_STORAGE_LIMIT)
        .map(normalizeProfessionalCommunityReport),
      error: "",
    };
  } catch (_) {
    return { items: [], error: "تعذر قراءة التقارير المحفوظة على هذا الجهاز." };
  }
}

function writeProfessionalCommunityReports(items) {
  try {
    const normalized = items
      .slice(0, PROFESSIONAL_COMMUNITY_REPORT_STORAGE_LIMIT)
      .map(normalizeProfessionalCommunityReport);
    localStorage.setItem(professionalCommunityReportStorageKey(), JSON.stringify(normalized));
    return normalized;
  } catch (_) {
    throw new Error("تعذر حفظ التقرير على هذا الجهاز. تحققي من مساحة التخزين المتاحة ثم أعيدي المحاولة.");
  }
}

function upsertProfessionalCommunityReport(data) {
  const state = readProfessionalCommunityReports();
  const items = state.error ? [] : [...state.items];
  const now = new Date().toISOString();
  const existingIndex = data.id ? items.findIndex((item) => item.id === data.id) : -1;
  const existing = existingIndex >= 0 ? items[existingIndex] : null;
  const id = existing?.id || data.id || (globalThis.crypto?.randomUUID?.() ?? `report-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const report = normalizeProfessionalCommunityReport({
    ...data,
    id,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  if (existingIndex >= 0) items.splice(existingIndex, 1);
  items.unshift(report);
  writeProfessionalCommunityReports(items);
  return report;
}

function professionalCommunityReportCard(item) {
  const reportType = normalizeProfessionalCommunityReportType(item.reportType);
  const reportMeta = professionalCommunityReportTypeMeta(reportType);
  const hijriDate = professionalCommunityHijriDate(item.date);
  const primaryDetail = item.targetAudience
    ? `<span aria-hidden="true">◎</span> الفئة المنفذة: <strong>${escapeHtml(item.targetAudience)}</strong>`
    : `<span aria-hidden="true">⌖</span> مقر التنفيذ: <strong>${escapeHtml(item.location || "—")}</strong>`;
  return `<article class="professional-report-card">
    <div class="professional-report-card-date">
      <small>التاريخ الميلادي</small>
      <strong>${escapeHtml(formatDate(item.date))}</strong>
      <span class="professional-report-card-hijri"><small>هجري</small><b>${escapeHtml(hijriDate || "—")}</b></span>
    </div>
    <div class="professional-report-card-copy">
      <div class="professional-report-card-kicker"><span class="professional-report-type-badge${reportType === "workshop" ? " is-workshop" : ""}">${escapeHtml(reportMeta.badge)}</span><span>${escapeHtml(reportMeta.numberNoun)} ${escapeHtml(item.sessionNumber || "—")}</span><span>${escapeHtml(item.location || "مقر غير محدد")}</span></div>
      <h3>${escapeHtml(item.topic || reportMeta.title)}</h3>
      <p>${primaryDetail}</p>
    </div>
    <div class="professional-report-card-actions">
      <button class="btn btn-primary" type="button" data-open-professional-saved-report="${escapeHtml(item.id)}">فتح التقرير</button>
      <button class="btn btn-danger btn-sm" type="button" data-delete-professional-report="${escapeHtml(item.id)}">حذف</button>
    </div>
  </article>`;
}

function professionalCommunityReportLibrary() {
  const state = readProfessionalCommunityReports();
  const body = state.error
    ? `<div class="professional-report-library-state is-error" role="alert"><span aria-hidden="true">!</span><div><h3>تعذر عرض السجل</h3><p>${escapeHtml(state.error)}</p></div></div>`
    : state.items.length
      ? `<div class="professional-report-list">${state.items.map(professionalCommunityReportCard).join("")}</div>`
      : `<div class="professional-report-library-state"><span aria-hidden="true">▤</span><div><h3>لا توجد تقارير محفوظة بعد</h3><p>أنشئي تقريرًا واحفظيه ليظهر هنا ويمكنكِ فتحه وطباعته لاحقًا.</p></div><button class="btn btn-outline" type="button" data-open-professional-report>إنشاء أول تقرير</button></div>`;
  return `<section class="professional-report-library" id="professionalReportLibrary" aria-labelledby="professionalReportLibraryTitle">
    <header><div><small>سجل التنفيذ</small><h2 id="professionalReportLibraryTitle">تقارير المجتمع المهني</h2></div><span>${formatPlanningNumber(state.items.length)} تقرير</span></header>
    ${body}
  </section>`;
}

function refreshProfessionalCommunityReportLibrary() {
  const current = document.getElementById("professionalReportLibrary");
  if (!current) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = professionalCommunityReportLibrary();
  current.replaceWith(wrapper.firstElementChild);
  bindProfessionalCommunityReportLibrary();
}

function bindProfessionalCommunityReportLibrary() {
  contentEl.querySelectorAll("[data-open-professional-saved-report]").forEach((button) => {
    button.onclick = () => openProfessionalCommunityReportBuilder(button.dataset.openProfessionalSavedReport).catch((error) => toast(error.message));
  });
  contentEl.querySelectorAll("[data-delete-professional-report]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.deleteProfessionalReport;
      const state = readProfessionalCommunityReports();
      const report = state.items.find((item) => item.id === id);
      if (!report) { toast("لم يعد التقرير موجودًا.");refreshProfessionalCommunityReportLibrary();return; }
      const reportMeta = professionalCommunityReportTypeMeta(report.reportType);
      if (!window.confirm(`هل تريدين حذف تقرير «${report.topic || reportMeta.title}»؟`)) return;
      try {
        writeProfessionalCommunityReports(state.items.filter((item) => item.id !== id));
        refreshProfessionalCommunityReportLibrary();
        toast("تم حذف التقرير.");
      } catch (error) { toast(error.message); }
    };
  });
}

function bindPlanningTabs() {
  contentEl.querySelectorAll("[data-teacher-planning]").forEach((button) => {
    button.onclick = () => renderTeacherPlanning(button.dataset.teacherPlanning).catch((error) => {
      contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`;
    });
  });
  contentEl.querySelectorAll("[data-open-planning-studio]").forEach((button) => { button.onclick = () => renderTeacherPlanning("planning-settings"); });
  contentEl.querySelectorAll("[data-open-strategy-report]").forEach((button) => { button.onclick = openStrategyReportModal; });
  contentEl.querySelectorAll("[data-open-professional-report]").forEach((button) => {
    button.onclick = () => openProfessionalCommunityReportBuilder("", button.dataset.openProfessionalReport).catch((error) => toast(error.message));
  });
  bindProfessionalCommunityReportLibrary();
}

function professionalCommunityPointHtml(kind, index, value = "", reportType = "professional-community") {
  const reportMeta = professionalCommunityReportTypeMeta(reportType);
  const sectionLabel = kind === "objectives" ? reportMeta.objectivesLabel : reportMeta.outcomesLabel;
  return `<li class="pl-report-point-item">
    <span aria-hidden="true"></span>
    <label><span class="sr-only">${sectionLabel}، النقطة ${index + 1}</span><textarea rows="1" maxlength="1000" placeholder="اكتبي النقطة هنا...">${escapeHtml(value)}</textarea></label>
    <button class="report-remove-control" type="button" data-remove-report-point aria-label="حذف النقطة">×</button>
  </li>`;
}

function professionalCommunityAttendeeHtml(index, attendee = {}) {
  return `<tr>
    <td class="report-row-number">${formatPlanningNumber(index + 1)}</td>
    <td><label><span class="sr-only">اسم المعلمة ${index + 1}</span><textarea rows="1" maxlength="500" placeholder="اسم المعلمة">${escapeHtml(attendee.name || "")}</textarea></label></td>
    <td><label><span class="sr-only">توقيع المعلمة ${index + 1}</span><textarea rows="1" maxlength="500" aria-label="توقيع المعلمة ${index + 1}">${escapeHtml(attendee.signature || "")}</textarea></label></td>
    <td class="report-row-action"><button class="report-remove-control" type="button" data-remove-report-attendee aria-label="حذف صف المعلمة ${index + 1}">×</button></td>
  </tr>`;
}

async function openProfessionalCommunityReportBuilder(reportId = "", requestedReportType = "professional-community") {
  const savedState = readProfessionalCommunityReports();
  const savedReport = reportId ? savedState.items.find((item) => item.id === reportId) : null;
  if (reportId && !savedReport) { toast("لم يعد التقرير المحفوظ موجودًا.");refreshProfessionalCommunityReportLibrary();return; }
  const reportType = normalizeProfessionalCommunityReportType(savedReport?.reportType || requestedReportType);
  const reportMeta = professionalCommunityReportTypeMeta(reportType);
  let settings = {};
  try { settings = await loadSchoolSettings(); } catch (_) { settings = {}; }
  const today = savedReport?.date || strategyReportToday();
  const hijriDate = professionalCommunityHijriDate(today);
  const dayName = savedReport?.day || new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date());
  const teacherName = settings.teacherName || currentTeacher?.name || "";
  const visionLogo = settings.visionLogoUrl || "/vision-2030-logo.png";
  const madarLogo = settings.madarLogoUrl || "/assets/print/madar-official-logo-transparent.png";
  const educationDepartment = settings.educationDepartment || "—";
  const educationOffice = settings.educationOffice || "—";
  const schoolName = settings.schoolName || "—";
  const objectiveValues = savedReport?.objectives?.length ? savedReport.objectives : Array.from({ length: 3 }, () => "");
  const outcomeValues = savedReport?.outcomes?.length ? savedReport.outcomes : Array.from({ length: 3 }, () => "");
  const attendeeValues = savedReport?.attendees?.length ? savedReport.attendees : Array.from({ length: 5 }, () => ({ name: "", signature: "" }));
  const objectives = objectiveValues.map((value, index) => professionalCommunityPointHtml("objectives", index, value, reportType)).join("");
  const outcomes = outcomeValues.map((value, index) => professionalCommunityPointHtml("outcomes", index, value, reportType)).join("");
  const attendees = attendeeValues.map((attendee, index) => professionalCommunityAttendeeHtml(index, attendee)).join("");

  openModal(`<section class="professional-report-builder" aria-labelledby="professionalReportBuilderTitle">
    <header class="report-builder-toolbar">
      <div class="report-builder-title">
        <span class="report-builder-mark" aria-hidden="true">✦</span>
        <div><small>منشئ مستند رسمي</small><h2 id="professionalReportBuilderTitle">${escapeHtml(reportMeta.title)}</h2><p>عبّئي الحقول ثم اطبعي التقرير أو احفظيه بصيغة PDF.</p></div>
      </div>
      <div class="report-builder-actions">
        <button class="btn btn-outline" id="clearProfessionalReport" type="button">تفريغ الحقول</button>
        <button class="btn btn-secondary report-save-button" id="saveProfessionalReport" type="button"><span aria-hidden="true">✓</span> حفظ</button>
        <button class="btn btn-primary report-print-button" id="printProfessionalReport" type="button"><span aria-hidden="true">▣</span> طباعة التقرير</button>
        <button class="report-builder-close" id="closeProfessionalReport" type="button" aria-label="إغلاق منشئ التقرير">×</button>
      </div>
    </header>
    <div class="report-builder-panel-top" role="note"><span aria-hidden="true">A4</span><p><strong>معاينة مباشرة</strong> جميع الحقول داخل الورقة قابلة للكتابة، ولن تظهر أدوات الإضافة والحذف عند الطباعة.</p></div>
    <div class="professional-report-canvas">
      <div class="professional-report-viewport">
      <form class="pl-report-paper" id="professionalCommunityReport" data-report-type="${escapeHtml(reportType)}" autocomplete="off">
        <div class="pl-report-inner">
          <header class="pl-report-official-header">
            <section class="pl-report-authority" aria-label="بيانات الجهة التعليمية">
              <strong>المملكة العربية السعودية</strong>
              <dl>
                <div><dt>إدارة التعليم</dt><dd>${escapeHtml(educationDepartment)}</dd></div>
                <div><dt>مكتب التعليم</dt><dd>${escapeHtml(educationOffice)}</dd></div>
                <div><dt>اسم المدرسة</dt><dd>${escapeHtml(schoolName)}</dd></div>
              </dl>
            </section>
            <section class="pl-report-title-badge">
              <small>${escapeHtml(reportMeta.kicker)}</small>
              <h1>${escapeHtml(reportMeta.title)}</h1>
              <i aria-hidden="true"></i>
            </section>
            <section class="pl-report-header-logos" aria-label="هوية منصة مدار ورؤية السعودية 2030">
              <img class="pl-report-madar-logo" src="${escapeHtml(madarLogo)}" alt="شعار منصة مدار">
              <span aria-hidden="true"></span>
              <img class="pl-report-vision-logo" src="${escapeHtml(visionLogo)}" alt="شعار رؤية السعودية 2030">
            </section>
          </header>

          <section class="pl-report-session" aria-labelledby="plReportSessionTitle">
            <div class="pl-report-section-heading"><span aria-hidden="true">01</span><h2 id="plReportSessionTitle">${escapeHtml(reportMeta.detailsHeading)}</h2><i></i></div>
            <div class="pl-report-data-grid">
              <label><span>${escapeHtml(reportMeta.numberLabel)}</span><input name="sessionNumber" type="text" inputmode="numeric" maxlength="20" value="${escapeHtml(savedReport?.sessionNumber || "")}" placeholder="مثال: ٠١"></label>
              <label class="report-topic-field"><span>${escapeHtml(reportMeta.topicLabel)}</span><input name="topic" type="text" maxlength="220" value="${escapeHtml(savedReport?.topic || "")}" placeholder="${escapeHtml(reportMeta.topicPlaceholder)}"></label>
              <label><span>الفئة المنفذة</span><input name="targetAudience" type="text" maxlength="160" value="${escapeHtml(savedReport?.targetAudience || "")}" placeholder="مثال: معلمات الرياضيات"></label>
              <label><span>اليوم</span><input name="day" type="text" maxlength="30" value="${escapeHtml(dayName)}" placeholder="اليوم"></label>
              <label><span>مقر التنفيذ</span><input name="location" type="text" maxlength="160" value="${escapeHtml(savedReport?.location || "")}" placeholder="مثال: مركز مصادر التعلم"></label>
              <label class="report-gregorian-date-field"><span>التاريخ الميلادي</span><input name="date" type="date" value="${escapeHtml(today)}"></label>
              <label class="report-hijri-date-field"><span>التاريخ الهجري <small>أم القرى</small></span><input name="hijriDate" type="text" value="${escapeHtml(hijriDate)}" placeholder="يُحتسب تلقائيًا" readonly aria-readonly="true"></label>
            </div>
          </section>

          <div class="pl-report-summary-grid">
            <section class="pl-report-points" aria-labelledby="plReportObjectivesTitle">
              <div class="pl-report-section-heading"><span aria-hidden="true">02</span><h2 id="plReportObjectivesTitle">${escapeHtml(reportMeta.objectivesLabel)}</h2><i></i></div>
              <ol id="professionalReportObjectives">${objectives}</ol>
              <button class="report-editor-control" type="button" data-add-report-point="objectives"><span aria-hidden="true">+</span> إضافة نقطة</button>
            </section>
            <section class="pl-report-points" aria-labelledby="plReportOutcomesTitle">
              <div class="pl-report-section-heading"><span aria-hidden="true">03</span><h2 id="plReportOutcomesTitle">${escapeHtml(reportMeta.outcomesLabel)}</h2><i></i></div>
              <ol id="professionalReportOutcomes">${outcomes}</ol>
              <button class="report-editor-control" type="button" data-add-report-point="outcomes"><span aria-hidden="true">+</span> إضافة نقطة</button>
            </section>
          </div>

          <section class="pl-report-attendance" aria-labelledby="plReportAttendanceTitle">
            <div class="pl-report-section-heading"><span aria-hidden="true">04</span><h2 id="plReportAttendanceTitle">توقيع الحاضرات</h2><i></i></div>
            <table>
              <thead><tr><th aria-label="الرقم">م</th><th class="report-attendance-heading">اسم المعلمة</th><th class="report-attendance-heading">التوقيع</th><th class="report-row-action" aria-label="إجراءات"></th></tr></thead>
              <tbody id="professionalReportAttendees">${attendees}</tbody>
            </table>
            <button class="report-editor-control" type="button" data-add-report-attendee><span aria-hidden="true">+</span> إضافة صف</button>
          </section>

          <section class="pl-report-approval" aria-labelledby="plReportApprovalTitle">
            <div class="pl-report-section-heading"><span aria-hidden="true">05</span><h2 id="plReportApprovalTitle">الاعتماد</h2><i></i></div>
            <div class="pl-report-approval-grid">
              <label><span>${escapeHtml(reportMeta.facilitatorLabel)}</span><input name="facilitatorName" type="text" maxlength="160" value="${escapeHtml(savedReport?.facilitatorName || teacherName)}" placeholder="اسم المنفذة"><small>التوقيع</small><input name="facilitatorSignature" type="text" maxlength="120" value="${escapeHtml(savedReport?.facilitatorSignature || "")}" aria-label="توقيع ${escapeHtml(reportMeta.facilitatorLabel)}"></label>
              <label><span>مديرة المدرسة</span><input name="leaderName" type="text" maxlength="160" value="${escapeHtml(savedReport?.leaderName || settings.schoolLeaderName || "")}" placeholder="اسم المديرة"><small>التوقيع</small><input name="leaderSignature" type="text" maxlength="120" value="${escapeHtml(savedReport?.leaderSignature || "")}" aria-label="توقيع مديرة المدرسة"></label>
              <div class="pl-report-stamp"><span>الختم الرسمي</span><div aria-label="مساحة الختم"></div></div>
            </div>
          </section>

          <footer class="pl-report-footer">
            <strong>مَدار</strong>
            <span>منصة الرياضيات التفاعلية · توثيق مهني منظم</span>
          </footer>
        </div>
      </form>
      </div>
    </div>
  </section>`, "professional-report-modal");

  const report = document.getElementById("professionalCommunityReport");
  const reportCanvas = report.closest(".professional-report-canvas");
  const reportViewport = report.closest(".professional-report-viewport");
  const attendeeBody = document.getElementById("professionalReportAttendees");
  const pointLists = {
    objectives: document.getElementById("professionalReportObjectives"),
    outcomes: document.getElementById("professionalReportOutcomes"),
  };
  const gregorianDateField = report.elements.namedItem("date");
  const hijriDateField = report.elements.namedItem("hijriDate");
  let currentReportId = savedReport?.id || "";
  const renumberAttendees = () => {
    [...attendeeBody.rows].forEach((row, index) => {
      row.querySelector(".report-row-number").textContent = formatPlanningNumber(index + 1);
      row.querySelectorAll(".sr-only").forEach((label, labelIndex) => { label.textContent = `${labelIndex ? "توقيع" : "اسم"} المعلمة ${index + 1}`; });
      row.querySelector("[data-remove-report-attendee]")?.setAttribute("aria-label", `حذف صف المعلمة ${index + 1}`);
    });
  };
  const renumberPoints = (list, kind) => {
    [...list.children].forEach((item, index) => {
      const label = kind === "objectives" ? reportMeta.objectivesLabel : reportMeta.outcomesLabel;
      item.querySelector(".sr-only").textContent = `${label}، النقطة ${index + 1}`;
    });
  };

  let previewFrame = 0;
  const fitReportPreview = () => {
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      if (!report.isConnected) return;
      const canvasStyle = getComputedStyle(reportCanvas);
      const availableWidth = reportCanvas.clientWidth
        - parseFloat(canvasStyle.paddingLeft || 0)
        - parseFloat(canvasStyle.paddingRight || 0);
      const scale = Math.min(1, Math.max(.35, availableWidth / report.offsetWidth));
      report.style.setProperty("--report-preview-scale", String(scale));
      reportViewport.style.width = `${Math.ceil(report.offsetWidth * scale)}px`;
      reportViewport.style.height = `${Math.ceil(report.offsetHeight * scale)}px`;
    });
  };
  const resizeReportTextarea = (field) => {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  };
  const resizeAllReportTextareas = () => {
    report.querySelectorAll("textarea").forEach(resizeReportTextarea);
    fitReportPreview();
  };
  const syncProfessionalCommunityHijriDate = () => {
    hijriDateField.value = professionalCommunityHijriDate(gregorianDateField.value);
  };
  const previewObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitReportPreview);
  previewObserver?.observe(reportCanvas);
  previewObserver?.observe(report);
  window.addEventListener("resize", fitReportPreview);
  const closeReportBuilder = () => {
    previewObserver?.disconnect();
    window.removeEventListener("resize", fitReportPreview);
    cancelAnimationFrame(previewFrame);
    modalRoot.onkeydown = null;
    closeModal();
  };
  const reportOverlay = document.getElementById("modalOverlay");
  reportOverlay.addEventListener("click", (event) => {
    if (event.target === reportOverlay) event.stopImmediatePropagation();
  }, true);
  document.getElementById("closeProfessionalReport").onclick = closeReportBuilder;
  document.getElementById("printProfessionalReport").onclick = () => window.print();
  document.getElementById("saveProfessionalReport").onclick = () => {
    syncProfessionalCommunityHijriDate();
    const fieldValue = (name) => String(report.elements.namedItem(name)?.value || "").trim();
    const data = {
      id: currentReportId,
      reportType,
      sessionNumber: fieldValue("sessionNumber"),
      topic: fieldValue("topic"),
      targetAudience: fieldValue("targetAudience"),
      day: fieldValue("day"),
      date: fieldValue("date"),
      hijriDate: fieldValue("hijriDate"),
      location: fieldValue("location"),
      objectives: [...pointLists.objectives.querySelectorAll("textarea")].map((field) => field.value.trim()),
      outcomes: [...pointLists.outcomes.querySelectorAll("textarea")].map((field) => field.value.trim()),
      attendees: [...attendeeBody.rows].map((row) => {
        const fields = row.querySelectorAll("textarea");
        return { name: fields[0]?.value.trim() || "", signature: fields[1]?.value.trim() || "" };
      }),
      facilitatorName: fieldValue("facilitatorName"),
      facilitatorSignature: fieldValue("facilitatorSignature"),
      leaderName: fieldValue("leaderName"),
      leaderSignature: fieldValue("leaderSignature"),
    };
    const button = document.getElementById("saveProfessionalReport");
    try {
      const stored = upsertProfessionalCommunityReport(data);
      currentReportId = stored.id;
      button.innerHTML = '<span aria-hidden="true">✓</span> تم الحفظ';
      refreshProfessionalCommunityReportLibrary();
      toast(data.id ? "تم تحديث التقرير المحفوظ." : "تم حفظ التقرير في سجل التنفيذ.");
      setTimeout(() => {
        if (button.isConnected) button.innerHTML = '<span aria-hidden="true">✓</span> حفظ';
      }, 1800);
    } catch (error) { toast(error.message); }
  };
  document.getElementById("clearProfessionalReport").onclick = () => {
    if (!window.confirm("هل تريدين تفريغ جميع حقول التقرير؟")) return;
    report.querySelectorAll("input, textarea").forEach((field) => { field.value = ""; });
    syncProfessionalCommunityHijriDate();
    resizeAllReportTextareas();
    toast("تم تفريغ حقول التقرير.");
  };
  report.addEventListener("input", (event) => {
    if (event.target === gregorianDateField) syncProfessionalCommunityHijriDate();
    if (!(event.target instanceof HTMLTextAreaElement)) return;
    resizeReportTextarea(event.target);
    fitReportPreview();
  });
  report.addEventListener("click", (event) => {
    const addPointButton = event.target.closest("[data-add-report-point]");
    if (addPointButton) {
      const kind = addPointButton.dataset.addReportPoint;
      const list = pointLists[kind];
      if (!list) return;
      list.insertAdjacentHTML("beforeend", professionalCommunityPointHtml(kind, list.children.length, "", reportType));
      const field = list.lastElementChild.querySelector("textarea");
      if (field) resizeReportTextarea(field);
      fitReportPreview();
      field?.focus();
      return;
    }
    const removePointButton = event.target.closest("[data-remove-report-point]");
    if (removePointButton) {
      const list = removePointButton.closest("ol");
      if (list.children.length <= 1) {
        const field = removePointButton.closest("li").querySelector("textarea");
        field.value = "";
        resizeReportTextarea(field);
        fitReportPreview();
        return;
      }
      removePointButton.closest("li").remove();
      const kind = list.id === "professionalReportObjectives" ? "objectives" : "outcomes";
      renumberPoints(list, kind);
      fitReportPreview();
      return;
    }
    if (event.target.closest("[data-add-report-attendee]")) {
      attendeeBody.insertAdjacentHTML("beforeend", professionalCommunityAttendeeHtml(attendeeBody.rows.length));
      attendeeBody.lastElementChild.querySelectorAll("textarea").forEach(resizeReportTextarea);
      fitReportPreview();
      attendeeBody.lastElementChild.querySelector("textarea")?.focus();
      return;
    }
    const removeAttendeeButton = event.target.closest("[data-remove-report-attendee]");
    if (removeAttendeeButton) {
      if (attendeeBody.rows.length <= 1) {
        removeAttendeeButton.closest("tr").querySelectorAll("textarea").forEach((field) => { field.value = "";resizeReportTextarea(field); });
        fitReportPreview();
        return;
      }
      removeAttendeeButton.closest("tr").remove();
      renumberAttendees();
      fitReportPreview();
    }
  });
  modalRoot.onkeydown = (event) => { if (event.key === "Escape") closeReportBuilder(); };
  requestAnimationFrame(resizeAllReportTextareas);
  document.getElementById("closeProfessionalReport").focus();
}

function strategyReportCard(item) {
  return `<article class="strategy-report-card">
    <div class="strategy-report-date"><small>تاريخ التنفيذ</small><strong>${escapeHtml(formatDate(item.implementationDate))}</strong></div>
    <div class="strategy-report-copy">
      <div class="strategy-report-kicker"><span>${escapeHtml(item.strategyName)}</span><span>${formatPlanningNumber(item.evidenceCount)} شاهد</span></div>
      <h3>${escapeHtml(item.lessonName)}</h3>
      <p><span aria-hidden="true">◎</span> الفئة المستهدفة: <strong>${escapeHtml(item.targetAudience)}</strong></p>
    </div>
    <div class="strategy-report-actions">
      <a class="btn btn-primary" href="${escapeHtml(item.reportUrl)}" target="_blank" rel="noopener">فتح التقرير</a>
      <button class="btn btn-danger btn-sm" type="button" data-strategy-report-delete="${item.id}">حذف</button>
    </div>
  </article>`;
}

function strategyReportLibrary(state) {
  if(!state.migrationReady) return `<div class="card planning-migration-notice strategy-migration-notice"><span aria-hidden="true">⚙️</span><div><h3>يلزم تفعيل تقارير الاستراتيجيات</h3><p>شغّلي ملف <code>${escapeHtml(state.migration || "migration_20260813_teacher_strategy_reports.sql")}</code> مرة واحدة بعد مراجعته. لم تُنفّذ أي تغييرات على قاعدة البيانات تلقائيًا.</p></div></div>`;
  if(!state.items.length) return "";
  return `<section class="strategy-report-library" aria-labelledby="strategyReportLibraryTitle"><header><div><small>سجل التنفيذ</small><h2 id="strategyReportLibraryTitle">تقارير الاستراتيجيات</h2></div><span>${formatPlanningNumber(state.items.length)} تقرير</span></header><div class="strategy-report-list">${state.items.map(strategyReportCard).join("")}</div></section>`;
}

function strategyContentMatchesAcademicSelection(item) {
  const selection = normalizeAcademicSelection("strategies");
  const itemStage = String(item.stage || "").trim();
  const itemGrade = String(item.gradeLabel || "").trim();
  if (selection.stage !== "all" && itemStage !== selection.stage) return false;
  if (selection.gradeLabel !== "all"
      && normalizeGradeKey(itemStage || selection.stage, itemGrade) !== normalizeGradeKey(selection.stage, selection.gradeLabel)) return false;
  const selectedClass = selectedAcademicClass("strategies");
  if (!selectedClass) return true;
  const targets = [...(item.publicationTargets || []), ...(item.parentPublicationTargets || [])];
  return targets.some((target) => Number(target.classId) === Number(selectedClass.id));
}

function strategyUploadedContentLibrary(items) {
  return `<section class="strategy-uploaded-library" aria-labelledby="strategyUploadedContentTitle">
    <header class="planning-library-head strategy-uploaded-library-head"><div><small>محتوى التخطيط</small><h2 id="strategyUploadedContentTitle">المحتوى المرفوع</h2></div><span>${formatPlanningNumber(items.length)} محتوى</span></header>
    ${planningContentLibrary(items, "لا يوجد محتوى مرفوع للاستراتيجيات")}
  </section>`;
}

function bindStrategyReports() {
  bindPlanningTabs();
  contentEl.querySelectorAll("[data-strategy-report-delete]").forEach((button) => {
    button.onclick = () => {
      const item=strategyReportState.items.find((row)=>Number(row.id)===Number(button.dataset.strategyReportDelete));
      confirmAction(`هل تريدين حذف تقرير «${item?.strategyName || "الاستراتيجية"}» لدرس «${item?.lessonName || "الدرس"}»؟`,async()=>{
        await api(`/planning-content/strategies/${button.dataset.strategyReportDelete}`,{method:"DELETE"});
        strategyReportState.loaded=false;toast("تم حذف تقرير الاستراتيجية.");await renderTeacherPlanning("strategies");
      });
    };
  });
}

async function loadStrategyReports(force=false) {
  if(!strategyReportState.loaded||force) {
    const data=await api("/planning-content/strategies",{cache:"no-store"});
    strategyReportState={...data,items:Array.isArray(data.items)?data.items:[],loaded:true};
  }
  return strategyReportState;
}

function strategyReportToday() {
  const now=new Date();const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);return local.toISOString().slice(0,10);
}

function openStrategyReportModal() {
  openModal(`<form id="strategyReportForm" class="strategy-report-form" enctype="multipart/form-data">
    <header class="planning-publish-head strategy-report-modal-head"><span aria-hidden="true">✦</span><div><small>توثيق التعلم النشط</small><h3>تقرير استراتيجية تعليمية</h3><p>أدخلي بيانات التنفيذ وأضيفي الشواهد المصورة، ثم سيُنشئ مدار التقرير المنسق.</p></div></header>
    <div id="strategyReportMessage" aria-live="polite"></div>
    <div class="form-grid two strategy-report-fields">
      <label class="field">اسم الدرس<input name="lessonName" maxlength="190" required autocomplete="off" placeholder="مثال: النسبة المئوية"></label>
      <label class="field">الفئة المستهدفة<input name="targetAudience" maxlength="190" required autocomplete="off" placeholder="مثال: الصف السادس الابتدائي"></label>
      <label class="field">تاريخ التنفيذ<input name="implementationDate" type="date" required value="${strategyReportToday()}"></label>
      <label class="field">الاستراتيجية<input name="strategyName" list="strategyReportSuggestions" maxlength="190" required autocomplete="off" placeholder="اكتبي أو اختاري استراتيجية"><datalist id="strategyReportSuggestions"><option value="التعلم التعاوني"><option value="فكر–زاوج–شارك"><option value="العصف الذهني"><option value="حل المشكلات"><option value="الصف المقلوب"><option value="لعب الأدوار"><option value="خرائط المفاهيم"></datalist></label>
      <label class="field full-span">الهدف الأساسي<textarea name="primaryGoal" maxlength="2000" required rows="3" placeholder="ما الهدف التعليمي الذي تسعى الاستراتيجية إلى تحقيقه؟"></textarea></label>
      <label class="field full-span">الفكرة<textarea name="idea" maxlength="5000" required rows="4" placeholder="صفي خطوات تطبيق الاستراتيجية باختصار واضح."></textarea></label>
    </div>
    <section class="strategy-evidence-picker" aria-labelledby="strategyEvidenceTitle">
      <label><input id="strategyEvidenceInput" name="evidence[]" type="file" accept=".png,.jpg,.jpeg,.webp" multiple><span aria-hidden="true">▧</span><strong id="strategyEvidenceTitle">الشواهد المصورة</strong><small>اختاري حتى 10 صور PNG أو JPG أو WebP · 5MB للصورة</small></label>
      <div class="strategy-evidence-preview" id="strategyEvidencePreview"><p>لم تختاري صورًا بعد.</p></div>
    </section>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelStrategyReport" type="button">إلغاء</button><button class="btn btn-primary" id="saveStrategyReport" type="submit">تم</button></div>
  </form>`,"strategy-report-modal");
  document.getElementById("cancelStrategyReport").onclick=closeModal;
  const input=document.getElementById("strategyEvidenceInput");const preview=document.getElementById("strategyEvidencePreview");let selected=[];let previewUrls=[];
  const syncInput=()=>{const transfer=new DataTransfer();selected.forEach((file)=>transfer.items.add(file));input.files=transfer.files;};
  const renderPreview=()=>{
    previewUrls.forEach((url)=>URL.revokeObjectURL(url));previewUrls=[];
    if(!selected.length){preview.innerHTML="<p>لم تختاري صورًا بعد.</p>";return;}
    preview.innerHTML=selected.map((file,index)=>{const url=URL.createObjectURL(file);previewUrls.push(url);return `<figure><img src="${escapeHtml(url)}" alt="معاينة الشاهد ${index+1}"><figcaption><span>${index+1}</span><button type="button" aria-label="إزالة ${escapeHtml(file.name)}" data-remove-evidence="${index}">×</button></figcaption></figure>`;}).join("");
    preview.querySelectorAll("[data-remove-evidence]").forEach((button)=>{button.onclick=()=>{selected.splice(Number(button.dataset.removeEvidence),1);syncInput();renderPreview();};});
  };
  input.onchange=()=>{
    const incoming=[...(input.files||[])];const allowed=new Set(["image/png","image/jpeg","image/webp"]);const message=document.getElementById("strategyReportMessage");
    if(incoming.some((file)=>!allowed.has(file.type)||file.size>5242880)){input.value="";message.innerHTML='<div class="form-error">اختاري صور PNG أو JPG أو WebP، ولا يتجاوز حجم الصورة 5 ميجابايت.</div>';return;}
    const merged=[...selected,...incoming];const total=merged.reduce((sum,file)=>sum+file.size,0);
    if(merged.length>10||total>31457280){input.value="";message.innerHTML='<div class="form-error">الحد الأقصى 10 صور، وبحجم إجمالي لا يتجاوز 30 ميجابايت.</div>';return;}
    selected=merged;message.innerHTML="";syncInput();renderPreview();
  };
  document.getElementById("strategyReportForm").onsubmit=async(event)=>{
    event.preventDefault();const button=document.getElementById("saveStrategyReport");const message=document.getElementById("strategyReportMessage");
    button.disabled=true;button.textContent="جارٍ إنشاء التقرير…";message.innerHTML='<div class="planning-inline-status">يتم حفظ التقرير والشواهد في التخزين الخاص.</div>';
    try {
      const result=await api("/planning-content/strategies",{method:"POST",body:new FormData(event.currentTarget)});
      previewUrls.forEach((url)=>URL.revokeObjectURL(url));strategyReportState.loaded=false;closeModal();toast(result.message||"تم إنشاء تقرير الاستراتيجية.");await renderTeacherPlanning("strategies");
    } catch(error){message.innerHTML=`<div class="form-error">${escapeHtml(error.message)}</div>`;button.disabled=false;button.textContent="تم";}
  };
}

function bindPlanningCards() {
  contentEl.querySelectorAll("[data-planning-copy-link]").forEach((button) => {
    button.onclick = async () => {
      const url = new URL(button.dataset.planningCopyLink, window.location.origin).href;
      try { await navigator.clipboard.writeText(url); toast("تم نسخ رابط العرض."); }
      catch (_) { window.prompt("انسخي رابط العرض:", url); }
    };
  });
  contentEl.querySelectorAll("[data-planning-publish]").forEach((button) => {
    button.onclick = () => openPlanningPublish(Number(button.dataset.planningPublish));
  });
  contentEl.querySelectorAll("[data-planning-publish-parents]").forEach((button) => {
    button.onclick = () => openPlanningParentPublish(Number(button.dataset.planningPublishParents));
  });
  contentEl.querySelectorAll("[data-planning-settings]").forEach((button) => {
    button.onclick = () => openPlanningContentSettings(Number(button.dataset.planningSettings));
  });
  contentEl.querySelectorAll("[data-planning-delete]").forEach((button) => {
    button.onclick = () => {
      const item = teacherPlanningState.items.find((row) => Number(row.id) === Number(button.dataset.planningDelete));
      confirmAction(`هل تريدين حذف «${item?.name || "المحتوى"}»؟ سيختفي فورًا من حسابات الطالبات.`, async () => {
        await api(`/planning-content/${button.dataset.planningDelete}`, { method: "DELETE" });
        teacherPlanningState.loaded = false; toast("تم حذف المحتوى وإيقاف نشره."); await renderTeacherPlanning(teacherPlanningMode);
      });
    };
  });
}

function openPlanningContentSettings(contentId) {
  const item = teacherPlanningState.items.find((row) => Number(row.id) === Number(contentId));if (!item) return;
  const selectedOption = (value, selected, label) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
  const stageOptions = Object.keys(ACADEMIC_GRADES).map((stage) => selectedOption(stage, item.stage, stage)).join("");
  const gradeOptions = (ACADEMIC_GRADES[item.stage] || []).map((grade) => selectedOption(grade, item.gradeLabel, grade)).join("");
  const contentTypeOptions = Object.entries(PLANNING_CONTENT_LABELS).map(([value, label]) => selectedOption(value, item.contentType, label)).join("");
  const destinationOptions = Object.entries(PLANNING_DESTINATION_LABELS).map(([value, label]) => selectedOption(value, item.destination, label)).join("");
  const coverPreview = item.hasCover
    ? `<img id="planningSettingsCoverPreview" src="${escapeHtml(item.coverUrl)}" alt="صورة الغلاف الحالية لـ ${escapeHtml(item.name)}">`
    : '<div id="planningSettingsCoverPreview" class="planning-settings-cover-empty"><span aria-hidden="true">▧</span><strong>لا توجد صورة غلاف</strong></div>';
  openModal(`<form id="planningContentSettingsForm" class="planning-settings-form" enctype="multipart/form-data">
    <header class="planning-publish-head planning-settings-head"><span aria-hidden="true">⚙</span><div><small>المحتوى المرفوع</small><h3>إعدادات المحتوى</h3><p>عدّلي بيانات العرض وغلافه؛ ملف المحتوى نفسه وحالة النشر لن يتغيرا.</p></div></header>
    <div id="planningSettingsMessage" aria-live="polite"></div>
    <div class="form-grid two planning-form-grid">
      <label class="field full-span">اسم المحتوى<input name="name" maxlength="190" required value="${escapeHtml(item.name)}"></label>
      <label class="field">المرحلة<select name="stage" id="planningSettingsStage">${stageOptions}</select></label>
      <label class="field">الصف<select name="gradeLabel" id="planningSettingsGrade">${gradeOptions}</select></label>
      <label class="field">رقم الوحدة<input name="unitNumber" type="number" min="1" max="999" required value="${Number(item.unitNumber)}"></label>
      <label class="field">رقم الدرس<input name="lessonNumber" type="number" min="1" max="999" required value="${Number(item.lessonNumber)}"></label>
      <label class="field full-span">اسم الدرس<input name="lessonName" maxlength="190" required value="${escapeHtml(item.lessonName)}"></label>
      <label class="field">نوع المحتوى<select name="contentType">${contentTypeOptions}</select></label>
      <label class="field">التوجيه إلى<select name="destination">${destinationOptions}</select></label>
    </div>
    <section class="planning-settings-cover" aria-labelledby="planningSettingsCoverTitle">
      <div class="planning-settings-cover-preview">${coverPreview}</div>
      <div class="planning-settings-cover-controls">
        <strong id="planningSettingsCoverTitle">صورة الغلاف</strong>
        <p>${item.hasCover ? "ستبقى الصورة الحالية ما لم تختاري بديلًا أو تزيليها." : "يمكنكِ إضافة غلاف اختياري للمحتوى."}</p>
        <label class="planning-settings-cover-picker"><input name="cover" id="planningSettingsCover" type="file" accept=".png,.jpg,.jpeg,.webp"><span>اختيار صورة جديدة</span><small id="planningSettingsCoverName">PNG أو JPG أو WebP · حتى 5MB</small></label>
        ${item.hasCover ? '<label class="planning-settings-remove-cover"><input name="removeCover" id="planningSettingsRemoveCover" type="checkbox" value="1"><span>إزالة صورة الغلاف</span></label>' : ""}
      </div>
    </section>
    <div class="planning-settings-note"><span aria-hidden="true">i</span><p>عند تغيير المرحلة أو الصف، سيتوقف النشر فقط عن الفصول التي لم تعد مطابقة.</p></div>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelPlanningSettings" type="button">إلغاء</button><button class="btn btn-primary" id="savePlanningSettings" type="submit">حفظ الإعدادات</button></div>
  </form>`, "planning-settings-modal");
  document.getElementById("cancelPlanningSettings").onclick = closeModal;
  const stage = document.getElementById("planningSettingsStage");const grade = document.getElementById("planningSettingsGrade");
  stage.onchange = () => { grade.innerHTML = (ACADEMIC_GRADES[stage.value] || []).map((value) => selectedOption(value, "", value)).join(""); };
  const coverInput = document.getElementById("planningSettingsCover");const removeCover = document.getElementById("planningSettingsRemoveCover");let objectUrl = "";
  coverInput.onchange = () => {
    const file = coverInput.files?.[0];if (!file) return;
    const message = document.getElementById("planningSettingsMessage");
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5242880) {
      coverInput.value = "";message.innerHTML = '<div class="form-error">اختاري صورة PNG أو JPG أو WebP لا يتجاوز حجمها 5 ميجابايت.</div>';return;
    }
    message.innerHTML = "";if (removeCover) removeCover.checked = false;
    document.getElementById("planningSettingsCoverName").textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)}MB`;
    if (objectUrl) URL.revokeObjectURL(objectUrl);objectUrl = URL.createObjectURL(file);
    const previewContainer = document.querySelector(".planning-settings-cover-preview");previewContainer.classList.remove("is-removed");previewContainer.innerHTML = `<img id="planningSettingsCoverPreview" src="${escapeHtml(objectUrl)}" alt="معاينة صورة الغلاف الجديدة">`;
  };
  if (removeCover) removeCover.onchange = () => {
    const previewContainer = document.querySelector(".planning-settings-cover-preview");previewContainer.classList.toggle("is-removed", removeCover.checked);
    if (removeCover.checked) {coverInput.value = "";document.getElementById("planningSettingsCoverName").textContent = "سيُستخدم الغلاف الافتراضي بعد الحفظ";if (objectUrl) {URL.revokeObjectURL(objectUrl);objectUrl = "";}}
  };
  document.getElementById("planningContentSettingsForm").onsubmit = async (event) => {
    event.preventDefault();const button = document.getElementById("savePlanningSettings");const message = document.getElementById("planningSettingsMessage");
    button.disabled = true;button.textContent = "جارٍ الحفظ…";message.innerHTML = "";
    try {
      const result = await api(`/planning-content/${contentId}/settings`, { method: "POST", body: new FormData(event.currentTarget) });
      if (result.item) teacherPlanningState.items = teacherPlanningState.items.map((row) => Number(row.id) === Number(contentId) ? result.item : row);
      if (objectUrl) URL.revokeObjectURL(objectUrl);closeModal();toast(result.message || "تم حفظ إعدادات المحتوى.");await (item.destination.startsWith("library-") ? renderLibraryPanel() : renderTeacherPlanning(teacherPlanningMode));
    } catch (error) {message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;button.disabled = false;button.textContent = "حفظ الإعدادات";}
  };
}

async function loadTeacherPlanningContent(force = false) {
  if (!teacherPlanningState.loaded || force) {
    const data = await api("/planning-content", { cache: "no-store" });
    teacherPlanningState = { ...data, items: Array.isArray(data.items) ? data.items : [], classes: Array.isArray(data.classes) ? data.classes : [], loaded: true };
  }
  return teacherPlanningState;
}

function planningUploadStudio() {
  const defaultStage = "ابتدائي";
  return `<div class="planning-studio-layout">
    <section class="card planning-upload-panel">
      <header class="planning-panel-head"><span aria-hidden="true">↥</span><div><small>استديو مدار</small><h2>رفع محتوى جديد</h2><p>احفظيه كمسودة، عاينيه بأمان، ثم اختاري الفصول المناسبة للنشر.</p></div></header>
      <form id="planningContentUploadForm" enctype="multipart/form-data">
        <div id="planningUploadMessage" aria-live="polite"></div>
        <div class="form-grid two planning-form-grid">
          <label class="field full-span">اسم المحتوى<input name="name" maxlength="190" required placeholder="مثال: استكشاف النسب المتكافئة"></label>
          <label class="field">المرحلة<select name="stage" id="planningStage">${Object.keys(ACADEMIC_GRADES).map((stage) => `<option value="${stage}">${stage}</option>`).join("")}</select></label>
          <label class="field">الصف<select name="gradeLabel" id="planningGrade">${(ACADEMIC_GRADES[defaultStage] || []).map((grade) => `<option value="${grade}">${grade}</option>`).join("")}</select></label>
          <label class="field">رقم الوحدة<input name="unitNumber" type="number" min="1" max="999" required></label>
          <label class="field">رقم الدرس<input name="lessonNumber" type="number" min="1" max="999" required></label>
          <label class="field full-span">اسم الدرس<input name="lessonName" maxlength="190" required></label>
          <label class="field">نوع المحتوى<select name="contentType"><option value="presentation">عرض تقديمي</option><option value="activity">نشاط</option><option value="explanation">شرح</option><option value="game">لعبة</option></select></label>
          <label class="field">التوجيه إلى<select name="destination"><option value="semester-plans">الخطط الفصلية</option><option value="curriculum-distribution">توزيع المنهج</option><option value="strategies">الاستراتيجيات</option><option value="interactive-presentations">العروض التفاعلية</option><option value="professional-community">المجتمع المهني — تنظيم خاص في حسابي</option></select></label>
        </div>
        <div class="planning-file-pickers">
          <label class="planning-file-picker"><input name="file" id="planningMainFile" type="file" accept=".html,.htm,.zip,.pdf,.png,.jpg,.jpeg,.webp,.gif" required><span aria-hidden="true">▣</span><strong>ملف المحتوى</strong><small id="planningMainFileName">HTML أو ZIP أو PDF أو صورة · حتى 20MB</small></label>
          <label class="planning-file-picker optional"><input name="cover" id="planningCoverFile" type="file" accept=".png,.jpg,.jpeg,.webp"><span aria-hidden="true">▧</span><strong>صورة الغلاف <em>اختيارية</em></strong><small id="planningCoverFileName">PNG أو JPG أو WebP · حتى 5MB</small></label>
        </div>
        <aside class="planning-upload-guide"><strong>أي صيغة أختار؟</strong><p><b>HTML</b> لملف ويب واحد ذاتي الاكتفاء، <b>ZIP</b> لصفحة معها صور وCSS وJavaScript، و<b>PDF أو صورة</b> للمحتوى الثابت. تُفتح صفحات الويب داخل إطار آمن معزول عن صفحات مدار.</p></aside>
        <button class="btn btn-primary planning-save-button" id="planningUploadButton" type="submit">رفع وحفظ كمسودة</button>
      </form>
    </section>
    <section class="planning-library-panel">
      <header class="planning-library-head"><div><small>مكتبتكِ</small><h2>المحتوى المرفوع</h2></div><span>${teacherPlanningState.items.length} محتوى</span></header>
      ${planningContentLibrary(teacherPlanningState.items, "لم ترفعي محتوى بعد")}
    </section>
  </div>`;
}

function bindPlanningUpload() {
  const stage = document.getElementById("planningStage");const grade = document.getElementById("planningGrade");
  stage.onchange = () => { grade.innerHTML = (ACADEMIC_GRADES[stage.value] || []).map((value) => `<option value="${value}">${value}</option>`).join(""); };
  [["planningMainFile", "planningMainFileName"], ["planningCoverFile", "planningCoverFileName"]].forEach(([inputId, labelId]) => {
    document.getElementById(inputId).onchange = (event) => { const file = event.target.files?.[0]; if (file) document.getElementById(labelId).textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)}MB`; };
  });
  document.getElementById("planningContentUploadForm").onsubmit = async (event) => {
    event.preventDefault();const button = document.getElementById("planningUploadButton");const message = document.getElementById("planningUploadMessage");
    button.disabled = true;button.textContent = "جارٍ فحص الملف ورفعه…";message.innerHTML = '<div class="planning-inline-status">يتم الآن التحقق من الملف وحفظه في التخزين الخاص.</div>';
    try {
      const result = await api("/planning-content", { method: "POST", body: new FormData(event.currentTarget) });
      teacherPlanningState.loaded = false;toast(result.message || "تم حفظ المحتوى كمسودة.");await renderTeacherPlanning("planning-settings");
    } catch (error) {
      message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;button.disabled = false;button.textContent = "رفع وحفظ كمسودة";
    }
  };
}

function openPlanningPublish(contentId) {
  const item = teacherPlanningState.items.find((row) => Number(row.id) === Number(contentId));if (!item) return;
  const eligible = teacherPlanningState.classes.filter((row) => row.level === item.stage && normalizeGradeKey(row.level, row.grade_label) === normalizeGradeKey(item.stage, item.gradeLabel));
  const selected = new Set((item.publicationTargets || []).map((row) => String(row.classId)));const initialSemester = item.publicationTargets?.[0]?.semester || schoolSettings?.currentSemester || "first";
  openModal(`<form id="planningPublishForm" class="planning-publish-form">
    <div class="planning-publish-head"><span aria-hidden="true">◉</span><div><small>نشر المحتوى</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.stage)} · ${escapeHtml(item.gradeLabel)}</p></div></div>
    <div id="planningPublishMessage"></div>
    <label class="field">الفصل الدراسي<select id="planningPublishSemester"><option value="first" ${initialSemester !== "second" ? "selected" : ""}>الترم الأول</option><option value="second" ${initialSemester === "second" ? "selected" : ""}>الترم الثاني</option></select></label>
    <fieldset class="planning-class-picker"><legend>اختاري الفصول</legend>${eligible.length ? eligible.map((row) => `<label><input type="checkbox" name="planningClass" value="${row.id}" ${selected.has(String(row.id)) ? "checked" : ""}><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.academic_year || "العام الحالي")}</small></span></label>`).join("") : '<p>لا توجد فصول مطابقة للمرحلة والصف. أضيفي الفصل أولًا من قائمة الطالبات.</p>'}</fieldset>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelPlanningPublish" type="button">إلغاء</button>${item.publishedClassCount ? '<button class="btn btn-danger" id="unpublishPlanningContent" type="button">إيقاف النشر</button>' : ''}<button class="btn btn-primary" type="submit" ${eligible.length ? "" : "disabled"}>حفظ النشر</button></div>
  </form>`, "planning-publish-modal");
  document.getElementById("cancelPlanningPublish").onclick = closeModal;
  document.getElementById("unpublishPlanningContent")?.addEventListener("click", async () => {
    await api(`/planning-content/${contentId}/unpublish`, { method: "POST", body: JSON.stringify({}) });closeModal();teacherPlanningState.loaded = false;toast("تم إيقاف النشر.");await (item.destination.startsWith("library-") ? renderLibraryPanel() : renderTeacherPlanning(teacherPlanningMode));
  });
  document.getElementById("planningPublishForm").onsubmit = async (event) => {
    event.preventDefault();const classIds = [...event.currentTarget.querySelectorAll('[name="planningClass"]:checked')].map((input) => Number(input.value));
    try {
      await api(`/planning-content/${contentId}/publish`, { method: "POST", body: JSON.stringify({ semester: document.getElementById("planningPublishSemester").value, classIds }) });
      closeModal();teacherPlanningState.loaded = false;toast("تم نشر المحتوى للفصول المختارة.");await (item.destination.startsWith("library-") ? renderLibraryPanel() : renderTeacherPlanning(teacherPlanningMode));
    } catch (error) { document.getElementById("planningPublishMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
  };
}

function openPlanningParentPublish(contentId) {
  const item = teacherPlanningState.items.find((row) => Number(row.id) === Number(contentId));if (!item || item.destination !== "semester-plans") return;
  if (!teacherPlanningState.parentPublicationReady) { toast(`يلزم تشغيل ${teacherPlanningState.parentPublicationMigration || "ملف ترحيل نشر أولياء الأمور"} أولًا.`);return; }
  const eligible = teacherPlanningState.classes.filter((row) => row.level === item.stage && normalizeGradeKey(row.level, row.grade_label) === normalizeGradeKey(item.stage, item.gradeLabel));
  const selected = new Set((item.parentPublicationTargets || []).map((row) => String(row.classId)));const initialSemester = item.parentPublicationTargets?.[0]?.semester || schoolSettings?.currentSemester || "first";
  openModal(`<form id="planningParentPublishForm" class="planning-publish-form">
    <div class="planning-publish-head planning-parent-publish-head"><span aria-hidden="true">⌂</span><div><small>مشاركة مع الأسرة</small><h3>نشر الخطة لأولياء الأمور</h3><p>${escapeHtml(item.name)} · ${escapeHtml(item.stage)} · ${escapeHtml(item.gradeLabel)}</p></div></div>
    <div id="planningParentPublishMessage" aria-live="polite"></div>
    <label class="field">الفصل الدراسي<select id="planningParentPublishSemester"><option value="first" ${initialSemester !== "second" ? "selected" : ""}>الترم الأول</option><option value="second" ${initialSemester === "second" ? "selected" : ""}>الترم الثاني</option></select></label>
    <fieldset class="planning-class-picker"><legend>اختاري فصول أولياء الأمور</legend>${eligible.length ? eligible.map((row) => `<label><input type="checkbox" name="planningParentClass" value="${row.id}" ${selected.has(String(row.id)) ? "checked" : ""}><span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.academic_year || "العام الحالي")}</small></span></label>`).join("") : '<p>لا توجد فصول مطابقة للمرحلة والصف. أضيفي الفصل أولًا من قائمة الطالبات.</p>'}</fieldset>
    <div class="modal-actions"><button class="btn btn-outline" id="cancelPlanningParentPublish" type="button">إلغاء</button>${item.publishedParentClassCount ? '<button class="btn btn-danger" id="unpublishPlanningParents" type="button">إيقاف نشر أولياء الأمور</button>' : ''}<button class="btn btn-primary" id="savePlanningParentPublish" type="submit" ${eligible.length ? "" : "disabled"}>حفظ النشر</button></div>
  </form>`, "planning-publish-modal");
  document.getElementById("cancelPlanningParentPublish").onclick = closeModal;
  document.getElementById("unpublishPlanningParents")?.addEventListener("click", async () => {
    try {await api(`/planning-content/${contentId}/unpublish-parents`, { method: "POST", body: JSON.stringify({}) });closeModal();teacherPlanningState.loaded = false;toast("تم إيقاف نشر الخطة لأولياء الأمور.");await renderTeacherPlanning(teacherPlanningMode);}
    catch(error){document.getElementById("planningParentPublishMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;}
  });
  document.getElementById("planningParentPublishForm").onsubmit = async (event) => {
    event.preventDefault();const classIds = [...event.currentTarget.querySelectorAll('[name="planningParentClass"]:checked')].map((input) => Number(input.value));const button=document.getElementById("savePlanningParentPublish");
    button.disabled=true;button.textContent="جارٍ الحفظ…";
    try {
      await api(`/planning-content/${contentId}/publish-parents`, { method: "POST", body: JSON.stringify({ semester: document.getElementById("planningParentPublishSemester").value, classIds }) });
      closeModal();teacherPlanningState.loaded = false;toast("تم نشر الخطة لأولياء أمور الفصول المختارة.");await renderTeacherPlanning(teacherPlanningMode);
    } catch (error) { document.getElementById("planningParentPublishMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;button.disabled=false;button.textContent="حفظ النشر"; }
  };
}

async function renderTeacherPlanning(mode = teacherPlanningMode) {
  teacherPlanningMode = TEACHER_PLANNING_SECTIONS[mode] ? mode : "semester-plans";
  const section = TEACHER_PLANNING_SECTIONS[teacherPlanningMode];
  contentEl.innerHTML = `${teacherPlanningTabs()}<div class="card"><div class="loading">جارٍ تحميل محتوى التخطيط…</div></div>`;bindPlanningTabs();
  const state = await loadTeacherPlanningContent();
  if (!state.migrationReady) {
    contentEl.innerHTML = `${teacherPlanningTabs()}<div class="card planning-migration-notice"><span>⚙️</span><div><h3>يلزم تفعيل استديو المحتوى</h3><p>شغّلي ملف <code>${escapeHtml(state.migration || "migration_20260812_teacher_planning_content.sql")}</code> مرة واحدة بعد مراجعته. لم تُنفّذ أي تغييرات على قاعدة البيانات تلقائيًا.</p></div></div>`;bindPlanningTabs();return;
  }
  if (teacherPlanningMode === "planning-settings") {
    contentEl.innerHTML = `${teacherPlanningTabs()}${planningUploadStudio()}`;bindPlanningTabs();bindPlanningUpload();bindPlanningCards();return;
  }
  if (teacherPlanningMode === "strategies") {
    const [reports]=await Promise.all([loadStrategyReports(),prepareAcademicSelection("strategies")]);
    const strategyItems=state.items.filter((item)=>item.destination==="strategies"&&strategyContentMatchesAcademicSelection(item));
    contentEl.innerHTML=`${teacherPlanningTabs()}<section class="planning-destination-hero strategy-report-hero"><span>${section.icon}</span><div><small>تخطيط المعلم</small><h1>${section.title}</h1><p>وثّقي تطبيق الاستراتيجية وارفقي شواهد التنفيذ، وسيجهز مدار تقرير HTML منسقًا للطباعة.</p></div><button class="btn btn-primary" type="button" data-open-strategy-report ${reports.migrationReady?"":"disabled"}>رفع محتوى</button></section>${academicSelectorHtml("strategies")}<div class="strategy-planning-libraries">${strategyReportLibrary(reports)}${strategyUploadedContentLibrary(strategyItems)}</div>`;
    bindStrategyReports();bindAcademicSelector("strategies",()=>renderTeacherPlanning("strategies"));bindPlanningCards();return;
  }
  const items = state.items.filter((item) => item.destination === teacherPlanningMode);
  const searchableMode = Object.hasOwn(teacherPlanningSearchState, teacherPlanningMode);
  const library = searchableMode
    ? planningSearchLibrary(items, section, teacherPlanningMode)
    : planningContentLibrary(items, `لا يوجد محتوى في ${section.title}`);
  const destinationActions = teacherPlanningMode === "professional-community"
    ? `<div class="planning-destination-actions"><button class="btn btn-primary planning-create-content" type="button" data-open-professional-report="professional-community"><span aria-hidden="true">✦</span> إنشاء تقرير مجتمع مهني</button><button class="btn btn-secondary planning-create-workshop" type="button" data-open-professional-report="workshop"><span aria-hidden="true">＋</span> إنشاء تقرير ورشة عمل</button><button class="btn btn-outline" type="button" data-open-planning-studio><span aria-hidden="true">↥</span> رفع محتوى</button></div>`
    : `<button class="btn btn-primary" type="button" data-open-planning-studio>رفع محتوى</button>`;
  const professionalReports = teacherPlanningMode === "professional-community" ? professionalCommunityReportLibrary() : "";
  contentEl.innerHTML = `${teacherPlanningTabs()}<section class="planning-destination-hero"><span>${section.icon}</span><div><small>تخطيط المعلم</small><h1>${section.title}</h1><p>${section.hint} يظهر هنا المحتوى الذي توجهينه إلى هذا القسم.</p></div>${destinationActions}</section>${professionalReports}${library}`;
  bindPlanningTabs();bindPlanningCards();
  if (searchableMode) bindPlanningLibrarySearch(teacherPlanningMode, items, section);
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
              <div class="logo-preview-card"><img src="${escapeHtml(settings.madarLogoUrl || "/assets/print/madar-official-logo-transparent.png")}" alt="شعار مدار الرسمي"><span>شعار مدار الرسمي</span></div>
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
  quick: { icon: "⚡", title: "توليد سريع", description: "إنشاء اختبار سريع من المهارات المعتمدة", count: 5, difficulty: "medium", types: ["mcq", "true_false"] },
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

function questionBankDiagnosticWorkspaceHtml(mode, modeKey = "diagnostic") {
  const skills = questionBankSkillsForSelection().filter((skill) => questionBankSkillHasTerm(skill));
  const units = questionBankUnitsForSkills(skills);
  const targetClasses = questionBankDiagnosticTargetClasses();
  const targetLabel = questionBankSelection.classValue === "all"
    ? "كل الفصول المسجلة لهذا الصف"
    : questionBankClassLabel();
  const initialTestType = modeKey === "quick" ? "quiz" : "pre_diagnostic";
  const initialTitle = `${TEST_TYPE_LABELS[initialTestType]} - ${questionBankSelection.gradeLabel}`;
  const workspaceTitle = modeKey === "quick" ? "توليد سريع حسب المهارات" : "اختبار تشخيصي حسب المهارات";
  return `<div class="question-bank-inline-workspace" id="questionDesignWorkspace" data-mode="${modeKey}">
    <div class="question-bank-workspace-head">
      <div><span class="question-bank-mode-icon">${mode.icon}</span><div><h3>${workspaceTitle}</h3><p>يأخذ سؤالًا عشوائيًا واحدًا من الأسئلة المعتمدة لكل مهارة، دون استخدام الذكاء الاصطناعي. وقد يظهر لكل طالبة بديل مختلف من المهارة نفسها.</p></div></div>
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
      <label class="field diagnostic-test-title-field">اسم الاختبار<input id="diagnosticBankTitle" value="${escapeHtml(initialTitle)}" data-auto-title="${escapeHtml(initialTitle)}" placeholder="مثال: اختبار المهارات الأساسية"></label>
      <label class="field">نوع الاختبار
        <select id="diagnosticBankTestType">
          <option value="pre_diagnostic" ${initialTestType === "pre_diagnostic" ? "selected" : ""}>تشخيصي قبلي</option>
          <option value="post_diagnostic">تشخيصي بعدي</option>
          <option value="quiz" ${initialTestType === "quiz" ? "selected" : ""}>اختبار قصير</option>
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
  if (["quick", "diagnostic"].includes(modeKey)) return questionBankDiagnosticWorkspaceHtml(mode, modeKey);
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
  if (["quick", "diagnostic"].includes(workspace.dataset.mode)) {
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
    if (sendButton) sendButton.onclick = () => createDiagnosticTestFromSkills();
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
  if (!selected.ids.length) return setQuestionBankInlineMessage("حددي مهارة واحدة على الأقل للاختبار.");
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

async function createDiagnosticTestFromSkills(approvePending = false) {
  approvePending = approvePending === true;
  const selected = diagnosticSelectedSkillData();
  const skillIds = selected.ids;
  const title = document.getElementById("diagnosticBankTitle")?.value.trim() || "";
  const testType = diagnosticBankTestTypeValue();
  const targetClasses = questionBankDiagnosticTargetClasses();
  const classIds = targetClasses.map((item) => Number(item.id)).filter(Boolean);
  const durationMinutes = diagnosticBankDurationValue();
  if (!skillIds.length) return setQuestionBankInlineMessage("حددي مهارة واحدة على الأقل للاختبار.");
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
      approvePending,
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
    if (!approvePending && error.data?.requiresApproval && error.data?.pendingSkills?.length) {
      const pendingNames = error.data.pendingSkills.join("، ");
      confirmAction(`الأسئلة المرتبطة بالمهارات التالية موجودة لكنها بانتظار الاعتماد: ${pendingNames}. هل تريدين اعتمادها وإنشاء الاختبار الآن؟`, () => createDiagnosticTestFromSkills(true));
    }
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
  "game-creator": {
    icon: "🎮",
    group: "الألعاب",
    title: "إنشاء الألعاب",
    description: "استديو إنشاء الألعاب واستيراد الحزم المبرمجة وإدارة نسخها.",
    hint: "أنشئي لعبة من قالب أو استوردي حزمة مبرمجة.",
  },
  "flipped-classroom": {
    icon: "🔄",
    group: "التعلم النشط",
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
    hint: "ستظهر هنا التدريبات والتمارين التعليمية عند إضافتها.",
  },
  worksheets: {
    icon: "📝",
    group: "الموارد المكتبية",
    title: "أوراق العمل",
    description: "مكتبة لتنظيم أوراق العمل والأنشطة الصفية التي تدعم الدروس والمهارات.",
    hint: "ستظهر هنا أوراق العمل التعليمية عند إضافتها.",
  },
};

let gamesPanelMode = "interactive-games";

function openGamesPanel(mode = "interactive-games") {
  gamesPanelMode = mode;
  navigate("games-panel");
}

let locksMessageHandler=null;
async function renderLocksCompetition(panel){
 panel.innerHTML='<p role="status">جارٍ تحميل طلابك…</p>';
 try{
 const data=await api('/motivation',{cache:'no-store'});
 if(!document.body.contains(panel))return;
 const students=data.students||[];const used=new Set();
 const frame=document.createElement('iframe');frame.title='مسابقة الأقفال';frame.style.cssText='width:100%;height:1100px;border:0;border-radius:18px';
 frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-modals');
 if(locksMessageHandler)window.removeEventListener('message',locksMessageHandler);
 locksMessageHandler=async event=>{
 if(event.source!==frame.contentWindow||event.origin!==location.origin||!document.body.contains(frame)||event.data?.type!=='madar-locks-award')return;
 const {key,studentId}=event.data;if(typeof key!=='string'||key.length>100||used.has(key)||!students.some(s=>Number(s.id)===Number(studentId)))return;used.add(key);
 let ok=false;try{await api('/motivation/'+Number(studentId),{method:'POST',body:JSON.stringify({points:10,category:'other',reason:'مسابقة الأقفال — إجابة صحيحة',details:'النظير الجمعي · '+key})});ok=true;}catch(error){toast(error.message);}
 frame.contentWindow?.postMessage({type:'madar-locks-award-result',key,ok},location.origin);
 };
 window.addEventListener('message',locksMessageHandler);
 frame.onload=()=>frame.contentWindow.postMessage({type:'madar-locks-roster',students:students.map(({id,name,class_id,class_name,grade_label,stage})=>({id,name,class_id,class_name,grade_label,stage}))},location.origin);
 frame.srcdoc="<!DOCTYPE html>\n<html lang=\"ar\" dir=\"rtl\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>مسابقة الأقفال 🔐 | النظير الجمعي</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link href=\"https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap\" rel=\"stylesheet\">\n<style>\n*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\n\n:root{\n  --blue:#3b82f6;\n  --blue-light:#60a5fa;\n  --blue-dark:#1e40af;\n  --blue-glow:rgba(59,130,246,.5);\n  --red:#ef4444;\n  --red-light:#f87171;\n  --red-dark:#991b1b;\n  --red-glow:rgba(239,68,68,.5);\n  --gold:#fbbf24;\n  --gold-light:#fde68a;\n  --gold-dark:#b45309;\n  --green:#22c55e;\n  --green-dark:#15803d;\n  --bg-1:#070b1c;\n  --bg-2:#111634;\n  --bg-3:#0a0f26;\n  --card:rgba(255,255,255,.045);\n  --card-hover:rgba(255,255,255,.08);\n  --border:rgba(255,255,255,.12);\n  --border-strong:rgba(255,255,255,.2);\n  --text:#e2e8f0;\n  --text-bright:#f8fafc;\n  --muted:#94a3b8;\n  --shadow-lg:0 25px 70px rgba(0,0,0,.55);\n  --shadow-md:0 12px 30px rgba(0,0,0,.4);\n}\n\nhtml,body{min-height:100%}\nbody{\n  font-family:\"Tajawal\",system-ui,-apple-system,sans-serif;\n  color:var(--text);\n  background:\n    radial-gradient(ellipse 60% 50% at 12% 8%, rgba(59,130,246,.22), transparent 60%),\n    radial-gradient(ellipse 60% 50% at 88% 92%, rgba(239,68,68,.22), transparent 60%),\n    radial-gradient(ellipse 80% 60% at 50% 50%, rgba(99,102,241,.1), transparent 70%),\n    linear-gradient(160deg,var(--bg-1) 0%,var(--bg-3) 50%,var(--bg-2) 100%);\n  min-height:100vh;\n  padding:14px;\n  overflow-x:hidden;\n  position:relative;\n}\n\n/* خطوط شبكة خفيفة */\nbody::before{\n  content:\"\";\n  position:fixed;inset:0;\n  background-image:\n    linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),\n    linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px);\n  background-size:60px 60px;\n  pointer-events:none;\n  z-index:0;\n  mask-image:radial-gradient(ellipse at center, black 30%, transparent 80%);\n}\n\n/* كرات ضوئية */\n.orb{position:fixed;border-radius:50%;filter:blur(90px);pointer-events:none;z-index:0;opacity:.5}\n.orb-blue{width:400px;height:400px;background:var(--blue);top:-150px;right:-120px;animation:float1 18s ease-in-out infinite}\n.orb-red{width:400px;height:400px;background:var(--red);bottom:-150px;left:-120px;animation:float2 18s ease-in-out infinite}\n@keyframes float1{0%,100%{transform:translate(0,0)}50%{transform:translate(-30px,30px)}}\n@keyframes float2{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-30px)}}\n\n.game{\n  position:relative;\n  z-index:1;\n  max-width:1280px;\n  margin:0 auto;\n  width:100%;\n}\n\n/* ============================================================\n   الهيدر\n   ============================================================ */\n.game-header{\n  text-align:center;\n  margin-bottom:20px;\n  padding:16px 20px;\n  border-radius:22px;\n  background:rgba(255,255,255,.03);\n  border:1px solid var(--border);\n  backdrop-filter:blur(20px);\n  box-shadow:var(--shadow-md);\n}\n.game-title{\n  font-size:clamp(1.4rem,3.4vw,2.1rem);\n  font-weight:900;\n  color:var(--text-bright);\n  margin:0 0 6px;\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  gap:10px;\n  flex-wrap:wrap;\n}\n.game-title .emoji{\n  display:inline-block;\n  animation:sparkle 2.4s ease-in-out infinite;\n  filter:drop-shadow(0 0 12px rgba(251,191,36,.6));\n}\n@keyframes sparkle{\n  0%,100%{transform:scale(1) rotate(0)}\n  50%{transform:scale(1.15) rotate(-8deg)}\n}\n.game-subtitle{\n  font-size:clamp(.85rem,1.6vw,1rem);\n  color:var(--muted);\n  font-weight:700;\n  margin:0;\n}\n\n/* ============================================================\n   صف المجموعتين\n   ============================================================ */\n.teams-row{\n  display:grid;\n  grid-template-columns:1fr 1fr;\n  gap:16px;\n  margin-bottom:18px;\n}\n\n.team{\n  position:relative;\n  padding:20px 18px;\n  border-radius:24px;\n  background:var(--card);\n  border:1.5px solid var(--border);\n  backdrop-filter:blur(20px);\n  transition:.4s cubic-bezier(.22,1,.36,1);\n  overflow:hidden;\n}\n.team::before{\n  content:\"\";\n  position:absolute;top:0;right:0;left:0;height:4px;\n  background:linear-gradient(90deg, transparent, var(--team-color), transparent);\n  opacity:.7;\n  transition:opacity .4s;\n}\n.team.blue{--team-color:var(--blue);--team-glow:var(--blue-glow)}\n.team.red{--team-color:var(--red);--team-glow:var(--red-glow)}\n\n.team.active{\n  border-color:var(--team-color);\n  background:linear-gradient(180deg, var(--card), rgba(255,255,255,.06));\n  box-shadow:\n    0 0 0 1px var(--team-color),\n    0 0 40px var(--team-glow),\n    var(--shadow-lg);\n  transform:translateY(-4px);\n}\n.team.active::before{opacity:1}\n\n.team-head{\n  display:flex;\n  align-items:center;\n  justify-content:space-between;\n  gap:10px;\n  margin-bottom:14px;\n}\n.team-name{\n  font-size:clamp(1rem,2vw,1.25rem);\n  font-weight:900;\n  color:var(--text-bright);\n  display:flex;\n  align-items:center;\n  gap:8px;\n}\n.team-icon{\n  font-size:1.3em;\n  filter:drop-shadow(0 0 8px var(--team-glow));\n}\n.team-turn-badge{\n  padding:6px 12px;\n  border-radius:999px;\n  font-size:.72rem;\n  font-weight:900;\n  background:var(--team-color);\n  color:#fff;\n  box-shadow:0 4px 14px var(--team-glow);\n  opacity:0;\n  transform:scale(.6);\n  transition:.3s cubic-bezier(.34,1.56,.64,1);\n  white-space:nowrap;\n}\n.team.active .team-turn-badge{\n  opacity:1;\n  transform:scale(1);\n  animation:badgePulse 1.4s ease-in-out infinite;\n}\n@keyframes badgePulse{\n  0%,100%{box-shadow:0 4px 14px var(--team-glow)}\n  50%{box-shadow:0 4px 22px var(--team-glow), 0 0 30px var(--team-glow)}\n}\n\n.team-score-row{\n  display:flex;\n  align-items:baseline;\n  justify-content:center;\n  gap:8px;\n  margin-bottom:14px;\n}\n.team-score{\n  font-size:clamp(2.2rem,5vw,3.2rem);\n  font-weight:900;\n  color:var(--team-color);\n  line-height:1;\n  font-variant-numeric:tabular-nums;\n  text-shadow:0 0 20px var(--team-glow);\n  transition:transform .3s cubic-bezier(.34,1.56,.64,1);\n}\n.team-score.bump{animation:scoreBump .6s cubic-bezier(.34,1.56,.64,1)}\n@keyframes scoreBump{\n  0%{transform:scale(1)}\n  40%{transform:scale(1.35)}\n  100%{transform:scale(1)}\n}\n.team-score-label{\n  font-size:.85rem;\n  font-weight:700;\n  color:var(--muted);\n}\n\n/* القلوب/الأقفال */\n.team-locks{\n  display:flex;\n  justify-content:center;\n  gap:8px;\n  margin-bottom:12px;\n}\n.lock-mini{\n  width:36px;\n  height:44px;\n  flex-shrink:0;\n  transition:.4s;\n}\n.lock-mini .shackle{\n  fill:none;\n  stroke:var(--team-color);\n  stroke-width:11;\n  stroke-linecap:round;\n  transition:transform .7s cubic-bezier(.34,1.56,.64,1), stroke .4s;\n}\n.lock-mini .body{\n  fill:var(--team-color);\n  opacity:.55;\n  transition:fill .4s, opacity .4s, filter .4s;\n}\n.lock-mini .keyhole{fill:rgba(0,0,0,.4);transition:fill .4s}\n.lock-mini .keyhole-stem{fill:rgba(0,0,0,.4);transition:fill .4s}\n\n.lock-mini.unlocked .shackle{\n  transform:translate(-10px,-24px) rotate(-25deg);\n  transform-origin:78% 100%;\n  stroke:var(--gold);\n  filter:drop-shadow(0 0 8px rgba(251,191,36,.7));\n}\n.lock-mini.unlocked .body{\n  fill:var(--green);\n  opacity:1;\n  filter:drop-shadow(0 0 12px rgba(34,197,94,.6));\n}\n.lock-mini.unlocked .keyhole,\n.lock-mini.unlocked .keyhole-stem{fill:rgba(0,0,0,.55)}\n\n/* شريط التقدم */\n.team-progress{\n  height:8px;\n  border-radius:99px;\n  background:rgba(255,255,255,.06);\n  overflow:hidden;\n  margin-bottom:8px;\n}\n.team-progress-bar{\n  height:100%;\n  width:0%;\n  border-radius:inherit;\n  background:linear-gradient(90deg, var(--team-color), var(--team-light, var(--team-color)));\n  box-shadow:0 0 12px var(--team-glow);\n  transition:width .7s cubic-bezier(.22,1,.36,1);\n}\n.team.blue .team-progress-bar{--team-light:var(--blue-light)}\n.team.red .team-progress-bar{--team-light:var(--red-light)}\n\n.team-locks-count{\n  text-align:center;\n  font-size:.82rem;\n  font-weight:700;\n  color:var(--muted);\n}\n.team-locks-count strong{\n  color:var(--team-color);\n  font-size:1rem;\n  font-weight:900;\n}\n\n/* ============================================================\n   منطقة اللعب\n   ============================================================ */\n.play-area{\n  padding:22px;\n  border-radius:26px;\n  background:var(--card);\n  border:1.5px solid var(--border);\n  backdrop-filter:blur(20px);\n  box-shadow:var(--shadow-lg);\n  transition:.4s;\n}\n.play-area.blue-active{border-color:rgba(59,130,246,.4);box-shadow:0 0 0 1px rgba(59,130,246,.3), var(--shadow-lg)}\n.play-area.red-active{border-color:rgba(239,68,68,.4);box-shadow:0 0 0 1px rgba(239,68,68,.3), var(--shadow-lg)}\n\n/* شارة الدور */\n.turn-banner{\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  gap:10px;\n  padding:12px 20px;\n  border-radius:16px;\n  background:rgba(255,255,255,.04);\n  border:1px solid var(--border);\n  margin-bottom:18px;\n  font-size:clamp(.95rem,1.9vw,1.15rem);\n  font-weight:800;\n  color:var(--muted);\n  transition:.4s;\n}\n.turn-banner.blue{\n  color:var(--blue-light);\n  border-color:rgba(59,130,246,.35);\n  background:linear-gradient(90deg, rgba(59,130,246,.12), rgba(59,130,246,.03));\n}\n.turn-banner.red{\n  color:var(--red-light);\n  border-color:rgba(239,68,68,.35);\n  background:linear-gradient(90deg, rgba(239,68,68,.12), rgba(239,68,68,.03));\n}\n.turn-dot{\n  width:12px;height:12px;border-radius:50%;\n  background:currentColor;\n  box-shadow:0 0 12px currentColor;\n  animation:pulseDot 1.3s ease-in-out infinite;\n}\n@keyframes pulseDot{\n  0%,100%{transform:scale(1);opacity:1}\n  50%{transform:scale(1.5);opacity:.6}\n}\n.turn-banner strong{\n  color:inherit;\n  font-weight:900;\n  font-size:1.1em;\n}\n\n/* بطاقة السؤال */\n.question-card{\n  padding:26px 18px 22px;\n  border-radius:20px;\n  background:linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.1));\n  border:1px solid var(--border);\n  margin-bottom:18px;\n}\n\n.question-hint{\n  text-align:center;\n  font-size:.92rem;\n  font-weight:700;\n  color:var(--muted);\n  margin-bottom:16px;\n  letter-spacing:.3px;\n}\n\n.question-equation{\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  gap:clamp(8px,1.6vw,18px);\n  flex-wrap:wrap;\n  margin-bottom:6px;\n}\n\n.eq-tile{\n  display:inline-flex;\n  align-items:center;\n  justify-content:center;\n  min-width:clamp(80px,13vw,116px);\n  height:clamp(80px,13vw,116px);\n  padding:0 clamp(12px,2vw,20px);\n  border-radius:22px;\n  background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02));\n  border:2px solid var(--border-strong);\n  color:var(--text-bright);\n  font-size:clamp(2rem,5vw,3rem);\n  font-weight:900;\n  font-variant-numeric:tabular-nums;\n  transition:.3s;\n  box-shadow:inset 0 -8px 20px rgba(0,0,0,.3);\n}\n.eq-tile.known{\n  border-color:rgba(255,255,255,.25);\n  text-shadow:0 0 20px rgba(255,255,255,.3);\n}\n.eq-tile.unknown{\n  background:linear-gradient(180deg, rgba(251,191,36,.18), rgba(251,191,36,.05));\n  border-color:var(--gold);\n  border-style:dashed;\n  color:var(--gold-light);\n  text-shadow:0 0 24px rgba(251,191,36,.7);\n  animation:pulseUnknown 1.8s ease-in-out infinite;\n}\n@keyframes pulseUnknown{\n  0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(251,191,36,.5), inset 0 -8px 20px rgba(0,0,0,.3)}\n  50%{transform:scale(1.04);box-shadow:0 0 0 14px rgba(251,191,36,0), inset 0 -8px 20px rgba(0,0,0,.3)}\n}\n.eq-tile.result{\n  border-color:var(--gold);\n  color:var(--gold);\n  text-shadow:0 0 20px rgba(251,191,36,.6);\n}\n\n.eq-op,.eq-eq{\n  font-size:clamp(1.6rem,3.5vw,2.4rem);\n  font-weight:900;\n  color:var(--muted);\n  padding:0 4px;\n}\n\n/* خيارات الإجابة */\n.answers-grid{\n  display:grid;\n  grid-template-columns:repeat(4,1fr);\n  gap:12px;\n  margin-top:22px;\n}\n\n.answer-btn{\n  position:relative;\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  min-height:clamp(72px,11vw,96px);\n  padding:12px 8px;\n  border-radius:18px;\n  border:2px solid var(--border-strong);\n  background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));\n  color:var(--text-bright);\n  font-family:inherit;\n  font-size:clamp(1.4rem,3.4vw,2rem);\n  font-weight:900;\n  font-variant-numeric:tabular-nums;\n  cursor:pointer;\n  transition:.22s cubic-bezier(.22,1,.36,1);\n  overflow:hidden;\n  box-shadow:0 6px 18px rgba(0,0,0,.3);\n}\n.answer-btn::before{\n  content:\"\";\n  position:absolute;\n  inset:0;\n  border-radius:inherit;\n  background:radial-gradient(circle at center, rgba(255,255,255,.15), transparent 70%);\n  opacity:0;\n  transition:opacity .3s;\n  pointer-events:none;\n}\n.answer-btn:hover:not(:disabled){\n  transform:translateY(-4px);\n  border-color:var(--team-color, var(--blue));\n  box-shadow:0 12px 30px rgba(0,0,0,.4), 0 0 20px var(--team-glow, var(--blue-glow));\n}\n.answer-btn:hover:not(:disabled)::before{opacity:1}\n.answer-btn:active:not(:disabled){transform:translateY(-1px)}\n\n.answer-btn.correct{\n  background:linear-gradient(180deg, rgba(34,197,94,.25), rgba(34,197,94,.1));\n  border-color:var(--green);\n  color:#d1fae5;\n  box-shadow:0 0 0 2px var(--green), 0 0 30px rgba(34,197,94,.5);\n  animation:popCorrect .6s cubic-bezier(.34,1.56,.64,1);\n}\n.answer-btn.wrong{\n  background:linear-gradient(180deg, rgba(220,38,38,.25), rgba(220,38,38,.1));\n  border-color:#dc2626;\n  color:#fee2e2;\n  box-shadow:0 0 0 2px #dc2626, 0 0 20px rgba(220,38,38,.4);\n  animation:shake .55s ease;\n}\n.answer-btn:disabled{cursor:default;opacity:.85}\n.answer-btn.dim{opacity:.35;filter:grayscale(.6)}\n\n@keyframes popCorrect{\n  0%{transform:scale(1)}\n  45%{transform:scale(1.14)}\n  100%{transform:scale(1)}\n}\n@keyframes shake{\n  0%,100%{transform:translateX(0)}\n  15%{transform:translateX(-9px)}\n  30%{transform:translateX(9px)}\n  45%{transform:translateX(-7px)}\n  60%{transform:translateX(7px)}\n  75%{transform:translateX(-4px)}\n}\n\n/* التغذية الراجعة */\n.feedback{\n  margin-top:18px;\n  padding:16px 20px;\n  border-radius:18px;\n  font-weight:800;\n  font-size:clamp(.95rem,1.9vw,1.1rem);\n  line-height:1.7;\n  text-align:center;\n  opacity:0;\n  transform:translateY(10px);\n  transition:.4s cubic-bezier(.22,1,.36,1);\n  pointer-events:none;\n}\n.feedback.show{opacity:1;transform:none;pointer-events:auto}\n.feedback.correct{\n  background:linear-gradient(135deg, rgba(34,197,94,.15), rgba(34,197,94,.06));\n  border:2px solid rgba(34,197,94,.5);\n  color:#bbf7d0;\n}\n.feedback.wrong{\n  background:linear-gradient(135deg, rgba(220,38,38,.15), rgba(220,38,38,.06));\n  border:2px solid rgba(220,38,38,.5);\n  color:#fecaca;\n}\n.feedback .big{\n  display:block;\n  font-size:1.35em;\n  font-weight:900;\n  margin-bottom:6px;\n}\n.feedback .equation-reveal{\n  display:inline-block;\n  margin-top:8px;\n  padding:8px 18px;\n  border-radius:12px;\n  background:rgba(0,0,0,.4);\n  border:1px solid rgba(255,255,255,.15);\n  font-family:\"Tajawal\",monospace;\n  font-size:1.15em;\n  color:var(--gold-light);\n  letter-spacing:.5px;\n}\n\n/* الأزرار السفلية */\n.actions{\n  display:flex;\n  gap:12px;\n  margin-top:18px;\n  justify-content:center;\n  flex-wrap:wrap;\n}\n\n.btn{\n  display:inline-flex;\n  align-items:center;\n  justify-content:center;\n  gap:8px;\n  padding:14px 28px;\n  border:0;\n  border-radius:16px;\n  font-family:inherit;\n  font-size:clamp(.95rem,1.8vw,1.05rem);\n  font-weight:900;\n  cursor:pointer;\n  transition:.25s cubic-bezier(.22,1,.36,1);\n  color:#fff;\n  min-height:52px;\n}\n.btn.next{\n  background:linear-gradient(135deg, var(--green), var(--green-dark));\n  box-shadow:0 10px 24px rgba(34,197,94,.35);\n  flex:1;\n  max-width:340px;\n}\n.btn.next:hover:not(:disabled){\n  transform:translateY(-3px);\n  box-shadow:0 16px 34px rgba(34,197,94,.5);\n}\n.btn.next:disabled{\n  opacity:.35;\n  cursor:not-allowed;\n  transform:none;\n  box-shadow:none;\n  background:linear-gradient(135deg, #475569, #334155);\n}\n.btn.restart{\n  background:transparent;\n  border:2px solid var(--border-strong);\n  color:var(--muted);\n}\n.btn.restart:hover{\n  border-color:var(--purple-500, #8b5cf6);\n  color:var(--text-bright);\n  transform:translateY(-2px);\n}\n\n/* ============================================================\n   شاشة الفائز\n   ============================================================ */\n.winner-overlay{\n  position:fixed;\n  inset:0;\n  z-index:100;\n  display:none;\n  align-items:center;\n  justify-content:center;\n  padding:20px;\n  background:rgba(5,8,20,.85);\n  backdrop-filter:blur(14px);\n  overflow-y:auto;\n}\n.winner-overlay.show{\n  display:flex;\n  animation:fadeIn .4s ease both;\n}\n@keyframes fadeIn{from{opacity:0}to{opacity:1}}\n\n.winner-card{\n  position:relative;\n  max-width:640px;\n  width:100%;\n  padding:clamp(28px,4vw,48px) clamp(22px,3.5vw,42px);\n  border-radius:32px;\n  background:\n    radial-gradient(ellipse at top, rgba(251,191,36,.18), transparent 60%),\n    linear-gradient(180deg, #1a1f3e, #0f142e);\n  border:2px solid rgba(251,191,36,.4);\n  box-shadow:\n    0 0 0 1px rgba(251,191,36,.3),\n    0 0 80px rgba(251,191,36,.25),\n    0 40px 100px rgba(0,0,0,.7);\n  text-align:center;\n  animation:winnerIn .8s cubic-bezier(.34,1.56,.64,1) both;\n}\n@keyframes winnerIn{\n  from{opacity:0;transform:scale(.85) translateY(40px)}\n  to{opacity:1;transform:none}\n}\n.winner-card::before{\n  content:\"\";\n  position:absolute;\n  top:-2px;left:20%;right:20%;\n  height:3px;\n  background:linear-gradient(90deg, transparent, var(--gold), transparent);\n  border-radius:3px;\n}\n\n.trophy-icon{\n  font-size:clamp(4rem,10vw,6rem);\n  display:inline-block;\n  margin-bottom:10px;\n  animation:trophyBounce 2s ease-in-out infinite;\n  filter:drop-shadow(0 0 30px rgba(251,191,36,.7));\n}\n@keyframes trophyBounce{\n  0%,100%{transform:translateY(0) rotate(-3deg)}\n  50%{transform:translateY(-12px) rotate(3deg)}\n}\n\n.winner-card h2{\n  font-size:clamp(1.4rem,3.2vw,2rem);\n  font-weight:900;\n  color:var(--gold);\n  margin:0 0 12px;\n  text-shadow:0 0 24px rgba(251,191,36,.5);\n  letter-spacing:.5px;\n}\n\n.winner-name{\n  font-size:clamp(1.6rem,4vw,2.4rem);\n  font-weight:900;\n  color:var(--text-bright);\n  margin:0 0 6px;\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  gap:12px;\n}\n.winner-name .icon{\n  font-size:1.2em;\n  filter:drop-shadow(0 0 16px currentColor);\n}\n.winner-name.blue{color:var(--blue-light)}\n.winner-name.red{color:var(--red-light)}\n\n.winner-score{\n  display:inline-block;\n  margin:8px auto 24px;\n  padding:10px 28px;\n  border-radius:999px;\n  background:rgba(251,191,36,.12);\n  border:1.5px solid rgba(251,191,36,.4);\n  color:var(--gold-light);\n  font-size:clamp(1.1rem,2.2vw,1.35rem);\n  font-weight:900;\n  font-variant-numeric:tabular-nums;\n}\n\n.secret-box{\n  margin:16px auto 24px;\n  padding:22px 20px;\n  border-radius:22px;\n  background:linear-gradient(135deg, rgba(59,130,246,.14), rgba(239,68,68,.14));\n  border:1.5px solid rgba(255,255,255,.15);\n  position:relative;\n  overflow:hidden;\n}\n.secret-box::before{\n  content:\"\";\n  position:absolute;top:0;right:0;left:0;height:3px;\n  background:linear-gradient(90deg, var(--blue), var(--gold), var(--red));\n}\n.secret-title{\n  font-size:clamp(1.05rem,2.2vw,1.2rem);\n  font-weight:900;\n  color:var(--gold);\n  margin-bottom:10px;\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  gap:8px;\n}\n.secret-text{\n  font-size:clamp(.95rem,1.9vw,1.1rem);\n  font-weight:800;\n  color:var(--text);\n  margin-bottom:12px;\n  line-height:1.7;\n}\n.secret-example{\n  display:inline-block;\n  padding:10px 22px;\n  border-radius:14px;\n  background:rgba(0,0,0,.35);\n  border:1px solid rgba(255,255,255,.15);\n  font-family:\"Tajawal\",monospace;\n  font-size:clamp(1.1rem,2.4vw,1.4rem);\n  font-weight:900;\n  color:var(--gold-light);\n  letter-spacing:1px;\n  text-shadow:0 0 16px rgba(251,191,36,.5);\n}\n\n.btn.replay{\n  background:linear-gradient(135deg, var(--gold), var(--gold-dark));\n  color:#1a0e00;\n  font-size:clamp(1rem,2vw,1.15rem);\n  padding:16px 36px;\n  box-shadow:0 12px 30px rgba(251,191,36,.4);\n  width:100%;\n  max-width:360px;\n  margin:0 auto;\n}\n.btn.replay:hover{\n  transform:translateY(-3px);\n  box-shadow:0 18px 40px rgba(251,191,36,.55);\n}\n\n/* ============================================================\n   الكونفيتي\n   ============================================================ */\n.confetti-layer{\n  position:fixed;\n  inset:0;\n  pointer-events:none;\n  z-index:99;\n  overflow:hidden;\n}\n.confetti-piece{\n  position:absolute;\n  top:-30px;\n  width:10px;\n  height:16px;\n  border-radius:3px;\n  animation:confettiFall 3.2s ease-in forwards;\n}\n@keyframes confettiFall{\n  to{\n    transform:translate(var(--drift, 0), 105vh) rotate(720deg);\n    opacity:.15;\n  }\n}\n\n/* ============================================================\n   الاستجابة للجوال\n   ============================================================ */\n@media (max-width:760px){\n  body{padding:10px}\n  .teams-row{grid-template-columns:1fr 1fr;gap:10px}\n  .team{padding:14px 12px;border-radius:20px}\n  .team-name{font-size:.92rem}\n  .team-icon{font-size:1.1em}\n  .team-turn-badge{font-size:.62rem;padding:4px 8px}\n  .lock-mini{width:26px;height:32px}\n  .team-locks{gap:5px}\n  .team-score{font-size:2rem}\n  .play-area{padding:16px 14px;border-radius:22px}\n  .question-card{padding:20px 12px 16px}\n  .answers-grid{grid-template-columns:1fr 1fr;gap:10px}\n  .answer-btn{min-height:70px;font-size:1.5rem}\n  .btn{padding:12px 18px;font-size:.92rem}\n  .winner-card{padding:26px 20px}\n}\n\n@media (max-width:420px){\n  .team-name{font-size:.82rem}\n  .team-locks-count{font-size:.72rem}\n  .lock-mini{width:22px;height:28px}\n  .eq-tile{min-width:64px;height:64px;font-size:1.7rem}\n  .eq-op,.eq-eq{font-size:1.4rem}\n  .answers-grid{gap:8px}\n  .answer-btn{min-height:60px;font-size:1.3rem}\n}\n\n.teacher-pick{margin:16px 0;padding:16px;border:1px solid #64748b;border-radius:16px;background:#172033;color:white}.teacher-pick select{width:100%;padding:12px;margin:6px 0;border-radius:9px;background:#fff;color:#172033;font:inherit}.teacher-pick p{line-height:1.8}.player-label{font-size:16px;color:#fde68a;margin-top:10px}button:focus-visible,select:focus-visible{outline:3px solid #fbbf24;outline-offset:4px}\n</style>\n</head>\n<body>\n\n<div class=\"orb orb-blue\" aria-hidden=\"true\"></div>\n<div class=\"orb orb-red\" aria-hidden=\"true\"></div>\n\n<div class=\"game\">\n\n  <header class=\"game-header\">\n    <h1 class=\"game-title\">\n      <span class=\"emoji\">🔐</span>\n      مسابقة الأقفال\n      <span class=\"emoji\">🔓</span>\n    </h1>\n    <p class=\"game-subtitle\">خمس جولات متكافئة لكل مجموعة؛ الأكثر فتحًا للأقفال يفوز!</p>\n  </header>\n\n<section class=\"teacher-pick\"><label for=\"classPick\">اختيار الفصل</label><select id=\"classPick\"><option value=\"\">جارٍ تحميل الطلاب…</option></select><p>اختاري طالبًا لكل مجموعة قبل الإجابة. يمكنك تغيير المجيب بين الأسئلة. كل إجابة صحيحة تمنح المجيب ١٠ نقاط تحفيز.</p><p id=\"pointsStatus\" role=\"status\" aria-live=\"polite\"></p><button class=\"btn\" id=\"soundToggle\" type=\"button\" aria-pressed=\"false\">🔊 الصوت</button></section>\n  <!-- المجموعتان -->\n  <div class=\"teams-row\">\n    <div class=\"team blue\" id=\"teamBlue\">\n      <div class=\"team-head\">\n        <div class=\"team-name\"><span class=\"team-icon\">🔵</span> المجموعة الأولى</div>\n        <span class=\"team-turn-badge\">دورك الآن</span>\n      </div>\n      <div class=\"team-score-row\">\n        <span class=\"team-score\" id=\"blueScore\">٠</span>\n        <span class=\"team-score-label\">نقطة</span>\n      </div>\n      <label class=\"player-label\" for=\"bluePlayer\">الطالب المجيب</label><select id=\"bluePlayer\" style=\"width:100%;padding:10px;border-radius:10px;font:inherit\"><option value=\"\">اختاري الطالب</option></select><div class=\"team-locks\" id=\"blueLocks\"></div>\n      <div class=\"team-progress\"><div class=\"team-progress-bar\" id=\"blueBar\"></div></div>\n      <div class=\"team-locks-count\">أقفال مفتوحة: <strong><span id=\"blueOpened\">٠</span> / ٥</strong></div>\n    </div>\n\n    <div class=\"team red\" id=\"teamRed\">\n      <div class=\"team-head\">\n        <div class=\"team-name\"><span class=\"team-icon\">🔴</span> المجموعة الثانية</div>\n        <span class=\"team-turn-badge\">دورك الآن</span>\n      </div>\n      <div class=\"team-score-row\">\n        <span class=\"team-score\" id=\"redScore\">٠</span>\n        <span class=\"team-score-label\">نقطة</span>\n      </div>\n      <label class=\"player-label\" for=\"redPlayer\">الطالب المجيب</label><select id=\"redPlayer\" style=\"width:100%;padding:10px;border-radius:10px;font:inherit\"><option value=\"\">اختاري الطالب</option></select><div class=\"team-locks\" id=\"redLocks\"></div>\n      <div class=\"team-progress\"><div class=\"team-progress-bar\" id=\"redBar\"></div></div>\n      <div class=\"team-locks-count\">أقفال مفتوحة: <strong><span id=\"redOpened\">٠</span> / ٥</strong></div>\n    </div>\n  </div>\n\n  <!-- منطقة اللعب -->\n  <div class=\"play-area\" id=\"playArea\">\n    <div class=\"turn-banner blue\" id=\"turnBanner\">\n      <span class=\"turn-dot\"></span>\n      دور: <strong id=\"turnTeamName\">المجموعة الأولى</strong>\n    </div>\n\n    <div class=\"question-card\">\n      <p class=\"question-hint\">اختاري العدد الذي يجعل المجموع = ٠</p>\n      <div class=\"question-equation\" id=\"questionEquation\"></div>\n      <div class=\"answers-grid\" id=\"answersGrid\"></div>\n      <div class=\"feedback\" id=\"feedback\"></div>\n    </div>\n\n    <div class=\"actions\">\n      <button class=\"btn next\" id=\"nextBtn\" disabled>السؤال التالي ←</button>\n      <button class=\"btn restart\" id=\"restartBtn\">إعادة اللعبة ↻</button>\n    </div>\n  </div>\n\n</div>\n\n<!-- شاشة الفائز -->\n<div class=\"winner-overlay\" id=\"winnerOverlay\">\n  <div class=\"winner-card\">\n    <div class=\"trophy-icon\">🏆</div>\n    <h2>المجموعة الفائزة</h2>\n    <div class=\"winner-name\" id=\"winnerName\">—</div>\n    <div class=\"winner-score\" id=\"winnerScore\">٠ نقطة</div>\n\n    <div class=\"secret-box\">\n      <div class=\"secret-title\">🔐 سر شفرة الصفر</div>\n      <div class=\"secret-text\">العدد ونظيره الجمعي مجموعهما يساوي صفرًا.</div>\n      <div class=\"secret-example\">٥ + (−٥) = ٠</div>\n    </div>\n\n    <button class=\"btn replay\" id=\"playAgainBtn\">إعادة اللعبة 🔁</button>\n  </div>\n</div>\n\n<div class=\"confetti-layer\" id=\"confetti\"></div>\n\n<script>\n/* ============================================================\n   أدوات مساعدة\n   ============================================================ */\nconst AR = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];\nfunction ar(n){\n  return String(n).replace('-','−').replace(/\\d/g, d => AR[+d]);\n}\nfunction shuffle(arr){\n  const a = arr.slice();\n  for(let i=a.length-1;i>0;i--){\n    const j = Math.floor(Math.random()*(i+1));\n    [a[i],a[j]]=[a[j],a[i]];\n  }\n  return a;\n}\n\n/* ============================================================\n   الأصوات\n   ============================================================ */\nlet audioCtx = null;\nlet muted=false;\nfunction ensureAudio(){\n  if(!audioCtx){\n    try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){}\n  }\n  if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();\n  return audioCtx;\n}\nfunction playTones(notes){\n  if(muted)return;\n  const ctx = ensureAudio();\n  if(!ctx) return;\n  const now = ctx.currentTime;\n  notes.forEach(([freq, start, dur, vol = 0.12]) => {\n    const osc = ctx.createOscillator();\n    const gain = ctx.createGain();\n    osc.type = 'sine';\n    osc.frequency.value = freq;\n    osc.connect(gain); gain.connect(ctx.destination);\n    gain.gain.setValueAtTime(0.0001, now + start);\n    gain.gain.exponentialRampToValueAtTime(vol, now + start + 0.02);\n    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);\n    osc.start(now + start);\n    osc.stop(now + start + dur + 0.05);\n  });\n}\nfunction sndSuccess(){\n  playTones([[523,0,.1,.13],[659,.08,.1,.13],[784,.16,.22,.14]]);\n}\nfunction sndWrong(){\n  playTones([[220,0,.14,.11],[165,.11,.22,.1]]);\n}\nfunction sndUnlock(){\n  playTones([[600,0,.05,.1],[700,.06,.05,.1],[850,.12,.08,.1],[1100,.2,.3,.13]]);\n}\nfunction sndVictory(){\n  playTones([\n    [523,0,.15,.14],[659,.14,.15,.14],[784,.28,.15,.14],[1047,.42,.4,.15],\n    [784,.55,.15,.12],[1047,.68,.6,.14]\n  ]);\n}\n\n/* ============================================================\n   بيانات الأسئلة\n   ============================================================ */\nconst QUESTIONS = {\n  blue: [\n    { a: 3,   answer: -3,  distractors: [3, -2, 2] },\n    { a: -5,  answer: 5,   distractors: [-5, 4, -4] },\n    { a: 8,   answer: -8,  distractors: [8, -7, 7] },\n    { a: -12, answer: 12,  distractors: [-12, 11, -11] },\n    { a: 6,   answer: -6,  distractors: [6, -5, 5] },\n  ],\n  red: [\n    { a: -9,  answer: 9,   distractors: [-9, 8, -8] },\n    { a: 11,  answer: -11, distractors: [11, -10, 10] },\n    { a: -4,  answer: 4,   distractors: [-4, 3, -3] },\n    { a: 7,   answer: -7,  distractors: [7, -6, 6] },\n    { a: -10, answer: 10,  distractors: [-10, 9, -9] },\n  ],\n};\n\nconst TOTAL_LOCKS = 5;\nconst POINTS_PER_CORRECT = 10;\n\n/* ============================================================\n   حالة اللعبة\n   ============================================================ */\nlet state = createInitialState();\n\nfunction createInitialState(){\n  return {\n    currentTeam: 'blue',\n    blueIndex: 0,\n    redIndex: 0,\n    blueScore: 0,\n    redScore: 0,\n    blueLocks: 0,\n    redLocks: 0,\n    awaitingNext: false,\n    answered: false,\n    gameOver: false,\n  };\n}\n\n/* ============================================================\n   عناصر DOM\n   ============================================================ */\nconst el = {\n  teamBlue: document.getElementById('teamBlue'),\n  teamRed: document.getElementById('teamRed'),\n  blueScore: document.getElementById('blueScore'),\n  redScore: document.getElementById('redScore'),\n  blueLocks: document.getElementById('blueLocks'),\n  redLocks: document.getElementById('redLocks'),\n  blueBar: document.getElementById('blueBar'),\n  redBar: document.getElementById('redBar'),\n  blueOpened: document.getElementById('blueOpened'),\n  redOpened: document.getElementById('redOpened'),\n  turnBanner: document.getElementById('turnBanner'),\n  turnTeamName: document.getElementById('turnTeamName'),\n  playArea: document.getElementById('playArea'),\n  questionEquation: document.getElementById('questionEquation'),\n  answersGrid: document.getElementById('answersGrid'),\n  feedback: document.getElementById('feedback'),\n  nextBtn: document.getElementById('nextBtn'),\n  restartBtn: document.getElementById('restartBtn'),\n  winnerOverlay: document.getElementById('winnerOverlay'),\n  winnerName: document.getElementById('winnerName'),\n  winnerScore: document.getElementById('winnerScore'),\n  playAgainBtn: document.getElementById('playAgainBtn'),\n  confetti: document.getElementById('confetti'),\n};\n\n/* ============================================================\n   بناء الأقفال الخمسة لكل مجموعة\n   ============================================================ */\nfunction lockSVG(){\n  return `\n    <svg class=\"lock-mini\" viewBox=\"0 0 100 130\" xmlns=\"http://www.w3.org/2000/svg\">\n      <path class=\"shackle\" d=\"M25 62 V42 A25 25 0 0 1 75 42 V62\"/>\n      <rect class=\"body\" x=\"10\" y=\"62\" width=\"80\" height=\"58\" rx=\"12\"/>\n      <circle class=\"keyhole\" cx=\"50\" cy=\"88\" r=\"7\"/>\n      <rect class=\"keyhole-stem\" x=\"47\" y=\"88\" width=\"6\" height=\"16\" rx=\"3\"/>\n    </svg>\n  `;\n}\nfunction buildLocks(container){\n  container.innerHTML = Array.from({length: TOTAL_LOCKS}, () => lockSVG()).join('');\n}\nbuildLocks(el.blueLocks);\nbuildLocks(el.redLocks);\n\n/* ============================================================\n   رسم واجهة المجموعة\n   ============================================================ */\nfunction updateTeamUI(){\n  // الألوان\n  const teamColor = state.currentTeam === 'blue' ? 'var(--blue)' : 'var(--red)';\n  const teamGlow = state.currentTeam === 'blue' ? 'var(--blue-glow)' : 'var(--red-glow)';\n  document.documentElement.style.setProperty('--team-color', teamColor);\n  document.documentElement.style.setProperty('--team-glow', teamGlow);\n\n  // النقاط\n  el.blueScore.textContent = ar(state.blueScore);\n  el.redScore.textContent = ar(state.redScore);\n\n  // الأقفال المفتوحة\n  el.blueOpened.textContent = ar(state.blueLocks);\n  el.redOpened.textContent = ar(state.redLocks);\n\n  // شريط التقدم\n  el.blueBar.style.width = (state.blueLocks / TOTAL_LOCKS * 100) + '%';\n  el.redBar.style.width = (state.redLocks / TOTAL_LOCKS * 100) + '%';\n\n  // تفعيل بطاقة المجموعة الحالية\n  el.teamBlue.classList.toggle('active', state.currentTeam === 'blue' && !state.gameOver);\n  el.teamRed.classList.toggle('active', state.currentTeam === 'red' && !state.gameOver);\n\n  // شارة الدور\n  el.turnBanner.classList.remove('blue', 'red');\n  el.turnBanner.classList.add(state.currentTeam);\n  el.turnTeamName.textContent = state.currentTeam === 'blue' ? 'المجموعة الأولى 🔵' : 'المجموعة الثانية 🔴';\n\n  // حدود منطقة اللعب\n  el.playArea.classList.remove('blue-active', 'red-active');\n  el.playArea.classList.add(state.currentTeam + '-active');\n\n  // فتح الأقفال بصرياً\n  openLocksVisually(el.blueLocks, state.blueLocks);\n  openLocksVisually(el.redLocks, state.redLocks);\n}\n\nfunction openLocksVisually(container, count){\n  const locks = container.querySelectorAll('.lock-mini');\n  locks.forEach((lock, i) => {\n    if(i < count) lock.classList.add('unlocked');\n    else lock.classList.remove('unlocked');\n  });\n}\n\n/* ============================================================\n   رسم السؤال\n   ============================================================ */\nfunction currentQuestionList(){\n  return QUESTIONS[state.currentTeam];\n}\nfunction currentQuestionIndex(){\n  return state.currentTeam === 'blue' ? state.blueIndex : state.redIndex;\n}\n\nfunction renderQuestion(){\n  const list = currentQuestionList();\n  const idx = currentQuestionIndex();\n  const q = list[idx];\n  if(!q) return;\n\n  // معادلة السؤال\n  el.questionEquation.innerHTML = `\n    <span class=\"eq-tile known\">${ar(q.a)}</span>\n    <span class=\"eq-op\">+</span>\n    <span class=\"eq-tile unknown\">؟</span>\n    <span class=\"eq-eq\">=</span>\n    <span class=\"eq-tile result\">٠</span>\n  `;\n\n  // الخيارات (مخلوطة)\n  const options = shuffle([q.answer, ...q.distractors]);\n  el.answersGrid.innerHTML = options.map((v, i) => `\n    <button class=\"answer-btn\" data-value=\"${v}\" data-index=\"${i}\">${ar(v)}</button>\n  `).join('');\n\n  el.answersGrid.querySelectorAll('.answer-btn').forEach(btn => {\n    btn.addEventListener('click', () => handleAnswer(btn));\n  });\n\n  // تنظيف\n  el.feedback.classList.remove('show', 'correct', 'wrong');\n  el.feedback.innerHTML = '';\n  el.nextBtn.disabled = true;\n  el.nextBtn.textContent = 'السؤال التالي ←';\n\n  state.awaitingNext = false;\n  state.answered = false;\n  document.getElementById(\"bluePlayer\").disabled=false;document.getElementById(\"redPlayer\").disabled=false;\n  updateAnswerAvailability();\n}\n\n/* ============================================================\n   معالجة الإجابة\n   ============================================================ */\nfunction handleAnswer(btn){\n  if(!selectedPlayer())return;\n  if(state.answered || state.gameOver) return;\n  state.answered = true;\n  const answeringStudent=selectedPlayer();\n  document.getElementById(\"bluePlayer\").disabled=true;document.getElementById(\"redPlayer\").disabled=true;document.getElementById(\"classPick\").disabled=true;\n\n  const list = currentQuestionList();\n  const idx = currentQuestionIndex();\n  const q = list[idx];\n  const value = Number(btn.dataset.value);\n  const isCorrect = value === q.answer;\n\n  const allBtns = el.answersGrid.querySelectorAll('.answer-btn');\n  allBtns.forEach(b => b.disabled = true);\n\n  // تسليط الضوء على الإجابة الصحيحة\n  allBtns.forEach(b => {\n    if(Number(b.dataset.value) === q.answer){\n      b.classList.add('correct');\n    } else if(b === btn){\n      b.classList.add('wrong');\n    } else {\n      b.classList.add('dim');\n    }\n  });\n\n  if(isCorrect){\n    // ✅ صحيح\n    sndSuccess();\n    awardAnswer(answeringStudent);\n    setTimeout(sndUnlock, 350);\n\n    // زيادة النقاط والقفل\n    if(state.currentTeam === 'blue'){\n      state.blueScore += POINTS_PER_CORRECT;\n      state.blueLocks += 1;\n    } else {\n      state.redScore += POINTS_PER_CORRECT;\n      state.redLocks += 1;\n    }\n    // تأثير على الرقم\n    const scoreEl = state.currentTeam === 'blue' ? el.blueScore : el.redScore;\n    scoreEl.classList.remove('bump');\n    void scoreEl.offsetWidth;\n    scoreEl.classList.add('bump');\n\n    // فتح القفل بصرياً\n    setTimeout(() => {\n      const locksContainer = state.currentTeam === 'blue' ? el.blueLocks : el.redLocks;\n      openLocksVisually(locksContainer, state.currentTeam === 'blue' ? state.blueLocks : state.redLocks);\n      updateTeamUI();\n    }, 200);\n\n    // عرض رسالة النجاح مع المعادلة كاملة\n    const equationHTML = `${ar(q.a)} <span style=\"color:#fbbf24\">+</span> (${ar(q.answer)}) <span style=\"color:#22c55e\">=</span> ٠`;\n    el.feedback.classList.add('show', 'correct');\n    el.feedback.innerHTML = `\n      <span class=\"big\">✅ أحسنتنّ! تم فتح القفل</span>\n      <span class=\"equation-reveal\">${equationHTML}</span>\n    `;\n\n    state.awaitingNext = true;\n    el.nextBtn.disabled = false;\n  } else {\n    // ❌ خطأ\n    sndWrong();\n    el.feedback.classList.add('show', 'wrong');\n    el.feedback.innerHTML = `\n      <span class=\"big\">❌ إجابة غير صحيحة</span>\n      حاولنّ التفكير في العدد الذي يجعل المجموع صفرًا.\n      <br>\n      <span class=\"equation-reveal\">${ar(q.a)} + (${ar(q.answer)}) = ٠</span>\n    `;\n\n    state.awaitingNext = true;\n    el.nextBtn.disabled = false;\n  }\n}\n\n/* ============================================================\n   زر السؤال التالي\n   ============================================================ */\nel.nextBtn.addEventListener('click', () => {\n  if(!state.awaitingNext || state.gameOver) return;\n\n  // تقدم المؤشر للمجموعة الحالية\n  if(state.currentTeam === 'blue') state.blueIndex += 1;\n  else state.redIndex += 1;\n\n  // هل انتهت اللعبة؟\n\n  // هل انتهت أسئلة المجموعتين؟\n  if(state.blueIndex >= QUESTIONS.blue.length && state.redIndex >= QUESTIONS.red.length){\n    endGame();\n    return;\n  }\n\n  // تبديل الدور\n  state.currentTeam = state.currentTeam === 'blue' ? 'red' : 'blue';\n\n  // لو الفريق اللي جا دوره خلص أسئلته، نعطيه الدور للثاني\n  const nextIdx = state.currentTeam === 'blue' ? state.blueIndex : state.redIndex;\n  const nextList = QUESTIONS[state.currentTeam];\n  if(nextIdx >= nextList.length){\n    state.currentTeam = state.currentTeam === 'blue' ? 'red' : 'blue';\n  }\n\n  updateTeamUI();\n  renderQuestion();\n});\n\n/* ============================================================\n   نهاية اللعبة\n   ============================================================ */\nfunction endGame(){\n  state.gameOver = true;\n  el.nextBtn.disabled = true;\n  el.teamBlue.classList.remove('active');\n  el.teamRed.classList.remove('active');\n\n  // تحديد الفائز: الأقفال أولاً، ثم النقاط\n  let winner, winnerScore;\n  if(state.blueLocks > state.redLocks){\n    winner = 'blue'; winnerScore = state.blueScore;\n  } else if(state.redLocks > state.blueLocks){\n    winner = 'red'; winnerScore = state.redScore;\n  } else if(state.blueScore > state.redScore){\n    winner = 'blue'; winnerScore = state.blueScore;\n  } else if(state.redScore > state.blueScore){\n    winner = 'red'; winnerScore = state.redScore;\n  } else {\n    winner = 'tie';\n  }\n\n  if(winner === 'tie'){\n    el.winnerName.className = 'winner-name';\n    el.winnerName.textContent = '🤝 تعادل بين المجموعتين!';\n    el.winnerScore.textContent = `${ar(state.blueScore)} نقطة لكل مجموعة`;\n  } else {\n    el.winnerName.className = 'winner-name ' + winner;\n    el.winnerName.innerHTML = winner === 'blue'\n      ? '<span class=\"icon\">🔵</span> المجموعة الأولى'\n      : '<span class=\"icon\">🔴</span> المجموعة الثانية';\n    el.winnerScore.textContent = `${ar(winnerScore)} نقطة`;\n  }\n\n  // عرض الشاشة\n  setTimeout(() => {\n    el.winnerOverlay.classList.add('show');\n    sndVictory();\n    launchConfetti(120);\n  }, 500);\n}\n\n/* ============================================================\n   الكونفيتي\n   ============================================================ */\nfunction launchConfetti(count = 80){\n  const colors = ['#3b82f6','#ef4444','#fbbf24','#22c55e','#8b5cf6','#f472b6','#22d3ee'];\n  for(let i=0;i<count;i++){\n    const p = document.createElement('span');\n    p.className = 'confetti-piece';\n    p.style.left = Math.random()*100 + '%';\n    p.style.background = colors[Math.floor(Math.random()*colors.length)];\n    p.style.animationDelay = (Math.random()*0.8) + 's';\n    p.style.animationDuration = (2.6 + Math.random()*1.6) + 's';\n    p.style.setProperty('--drift', ((Math.random()-0.5)*260) + 'px');\n    p.style.transform = `rotate(${Math.random()*360}deg)`;\n    el.confetti.appendChild(p);\n    setTimeout(()=>p.remove(), 4600);\n  }\n}\n\n/* ============================================================\n   إعادة اللعبة\n   ============================================================ */\nfunction restartGame(){\n  if(!state.gameOver && (state.blueIndex||state.redIndex||state.answered) && !confirm(\"بدء جولة جديدة؟ النقاط المسجلة سابقًا تبقى محفوظة.\"))return;\n  state = createInitialState();\n  document.getElementById(\"classPick\").disabled=false;\n  el.winnerOverlay.classList.remove('show');\n  el.confetti.innerHTML = '';\n  updateTeamUI();\n  renderQuestion();\n}\nel.restartBtn.addEventListener('click', restartGame);\nel.playAgainBtn.addEventListener('click', restartGame);\n\n/* ============================================================\n   التشغيل الأولي\n   ============================================================ */\n\nlet roster=[];let awardPending=0;const pendingAwards=new Set();\nconst sessionId=crypto.randomUUID();let answerSequence=0;\nfunction selectedPlayer(){\n const a=document.getElementById('bluePlayer').value,b=document.getElementById('redPlayer').value;\n if(!a||!b||a===b)return null;\n return roster.find(s=>String(s.id)===document.getElementById(state.currentTeam+'Player').value)||null;\n}\nfunction updateAnswerAvailability(){el.answersGrid.querySelectorAll('button').forEach(b=>b.disabled=state.answered||state.gameOver||!selectedPlayer());}\nfunction populatePlayers(){\n const classId=document.getElementById('classPick').value;\n for(const team of ['blue','red']){const select=document.getElementById(team+'Player');select.replaceChildren(new Option('اختاري الطالب',''));for(const s of roster.filter(s=>String(s.class_id)===classId))select.add(new Option(s.name,String(s.id)));}\n updateAnswerAvailability();\n}\nwindow.addEventListener('message',event=>{\n if(event.source!==parent)return;\n if(event.data?.type==='madar-locks-roster'){\n roster=event.data.students||[];const select=document.getElementById('classPick');select.replaceChildren(new Option('اختاري الفصل',''));\n const classes=new Map(roster.map(s=>[String(s.class_id),[s.stage,s.grade_label,s.class_name].filter(Boolean).join(' — ')]));\n for(const [id,name]of classes)select.add(new Option(name,id));\n if(!roster.length)document.getElementById('pointsStatus').textContent='لا يوجد طلاب مسجلون في فصولك.';\n }\n if(event.data?.type==='madar-locks-award-result'&&pendingAwards.delete(event.data.key)){\n awardPending--;document.getElementById('pointsStatus').textContent=event.data.ok?'تم تسجيل ١٠ نقاط تحفيز للمجيب.':'تعذر تأكيد حفظ النقاط؛ راجعي سجل التحفيز قبل إضافتها يدويًا.';\n }\n});\nfunction awardAnswer(student){const key=sessionId+'-'+(++answerSequence);pendingAwards.add(key);awardPending++;document.getElementById('pointsStatus').textContent='جارٍ تسجيل نقاط التحفيز…';parent.postMessage({type:'madar-locks-award',key,studentId:student.id},new URL(document.baseURI).origin);}\ndocument.getElementById('classPick').addEventListener('change',populatePlayers);\nfor(const team of ['blue','red'])document.getElementById(team+'Player').addEventListener('change',()=>{const same=document.getElementById('bluePlayer').value&&document.getElementById('bluePlayer').value===document.getElementById('redPlayer').value;document.getElementById('pointsStatus').textContent=same?'اختاري طالبين مختلفين للمجموعتين.':'';updateAnswerAvailability();});\ndocument.getElementById('soundToggle').onclick=()=>{muted=!muted;document.getElementById('soundToggle').textContent=muted?'🔇 الصوت مكتوم':'🔊 الصوت';document.getElementById('soundToggle').setAttribute('aria-pressed',String(muted));};\nwindow.addEventListener('beforeunload',event=>{if(awardPending){event.preventDefault();event.returnValue='';}});\n\nupdateTeamUI();\nrenderQuestion();\n\n// تفعيل الأصوات عند أول تفاعل\n['click','touchstart','keydown'].forEach(evt => {\n  document.addEventListener(evt, () => ensureAudio(), { once: true });\n});\n</script>\n</body>\n</html>";
 panel.replaceChildren(frame);
 }catch(error){panel.textContent='تعذر تحميل الطلاب: '+error.message;}
}

async function renderGamesPanel() {
  contentEl.innerHTML = `
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام الألعاب">
      <button class="tab-btn ${gamesPanelMode === "interactive-games" ? "active" : ""}" data-games-panel="interactive-games">الألعاب التفاعلية</button>
      <button class="tab-btn ${gamesPanelMode === "locks" ? "active" : ""}" data-games-panel="locks">🔐 مسابقة الأقفال</button>
      <button class="tab-btn ${gamesPanelMode === "competitions" ? "active" : ""}" data-games-panel="competitions">المسابقات</button>
      <button class="tab-btn ${gamesPanelMode === "game-creator" ? "active" : ""}" data-games-panel="game-creator">إنشاء الألعاب</button>
    </div>
    <div id="gamesPanelContent"></div>
  `;
  document.querySelectorAll("[data-games-panel]").forEach((button) => {
    button.onclick = () => {
      if (button.dataset.gamesPanel !== "competitions") teacherLiveCompetitions.stop();
      gamesPanelMode = button.dataset.gamesPanel;
      renderGamesPanel();
    };
  });
  const panel = document.getElementById("gamesPanelContent");
  if(gamesPanelMode === "locks"){await renderLocksCompetition(panel);return;}
  panel.innerHTML = '<div class="empty-state">جارٍ تحميل إعدادات اللعبة…</div>';
  try { await Promise.all([loadSchoolSettings(), loadInteractiveGames()]); } catch (_) {}
  if (!document.body.contains(panel)) return;
  if (gamesPanelMode === "competitions") {
    teacherLiveCompetitions.render(panel);
    return;
  }
  renderEducationalContent(gamesPanelMode, panel);
}

function openStrategiesPanel() {
  navigate("strategies-panel");
}

let flippedClassroomHeightListener = null;

async function renderStrategiesPanel() {
  try { await loadSchoolSettings(); } catch (_) {}
  const selection = normalizeAcademicSelection("strategies");
  const availableClasses = academicClasses(selection);
  if (!selection.classId && availableClasses.length === 1) {
    selection.classId = String(availableClasses[0].id);
    sessionStorage.setItem("madarAcademicStrategies", JSON.stringify(selection));
  }
  const selectedClass = selectedAcademicClass("strategies");
  const context = {
    classId: String(selectedClass?.id || selection.classId || ""),
    className: selectedClass?.name || (selection.classId ? "الفصل المختار" : "لا يوجد فصل مسجل"),
    stage: selectedClass?.level || selectedClass?.stage || selection.stage || "",
    grade: selectedClass?.grade_label || actualAcademicGradeLabel("strategies") || "",
    semester: schoolSettings?.currentSemester || "first",
  };
  const frameQuery = new URLSearchParams({ ...context, v: "16" }).toString();
  const frameSrc = `flipped-classroom.html?${frameQuery}`;
  const expectedFrameUrl = new URL(frameSrc, window.location.href).href;
  contentEl.innerHTML = `
    ${academicSelectorHtml("strategies")}
    <div class="student-panel-tabs" role="tablist" aria-label="أقسام التعلم النشط">
      <button class="tab-btn active" type="button" aria-selected="true">الصف المقلوب</button>
    </div>
    <section class="flipped-frame-shell" aria-label="استديو الصف المقلوب">
      <div class="flipped-frame-loading" id="flippedFrameLoading"><span aria-hidden="true">◌</span><strong>جارٍ تجهيز استديو الصف المقلوب…</strong><small>يمكن إعداد الدرس وحفظه ونشره للفصل من داخل حساب المعلمة.</small></div>
      <iframe class="flipped-classroom-frame" id="flippedClassroomFrame" title="استديو الصف المقلوب" loading="eager"></iframe>
      <div class="flipped-frame-error" id="flippedFrameError" hidden><strong>تعذر فتح الاستديو</strong><span>حدّثي الصفحة ثم حاولي مرة أخرى.</span></div>
    </section>
  `;
  bindAcademicSelector("strategies", renderStrategiesPanel);
  const frame = document.getElementById("flippedClassroomFrame");
  const loading = document.getElementById("flippedFrameLoading");
  const error = document.getElementById("flippedFrameError");
  let frameSettled = false;
  const markFrameReady = () => {
    if (frameSettled) return;
    frameSettled = true;
    loading.hidden = true;
    error.hidden = true;
    frame.classList.add("is-ready");
    frame.contentWindow?.postMessage({ source: "madar-teacher", type: "context", context }, window.location.origin);
  };
  const markFrameFailed = () => {
    if (frameSettled) return;
    frameSettled = true;
    loading.hidden = true;
    error.hidden = false;
  };
  frame.addEventListener("load", markFrameReady, { once: true });
  frame.addEventListener("error", markFrameFailed, { once: true });
  if (flippedClassroomHeightListener) window.removeEventListener("message", flippedClassroomHeightListener);
  flippedClassroomHeightListener = (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow || event.data?.source !== "madar-flipped-classroom") return;
    if (event.data.type === "api") {
      const requestId = String(event.data.requestId || "");
      const path = String(event.data.path || "");
      const method = String(event.data.method || "GET").toUpperCase();
      if (!requestId || !/^\/flipped-classroom(?:\/\d+(?:\/(?:video|publish|close|reopen|results|active-learning))?|\/submissions\/\d+\/review)?(?:\?.*)?$/.test(path) || !["GET","POST","DELETE"].includes(method)) {
        frame.contentWindow?.postMessage({ source: "madar-teacher", type: "api-result", requestId, error: "طلب غير مسموح." }, window.location.origin);
        return;
      }
      const options = { method };
      const uploadFile = event.data.file;
      const hasUploadFile = uploadFile
        && typeof uploadFile === "object"
        && typeof uploadFile.name === "string"
        && Number.isFinite(Number(uploadFile.size))
        && Number(uploadFile.size) > 0
        && typeof uploadFile.slice === "function";
      if (hasUploadFile) {
        const formData = new FormData();
        formData.set("video", uploadFile, uploadFile.name || "video.mp4");
        formData.set("duration", String(event.data.duration || 0));
        formData.set("trimStart", String(event.data.trimStart || 0));
        formData.set("trimEnd", String(event.data.trimEnd || event.data.duration || 0));
        options.body = formData;
      } else if (event.data.body !== undefined && method !== "GET") {
        options.body = JSON.stringify(event.data.body);
      }
      api(path, options).then((data) => {
        frame.contentWindow?.postMessage({ source: "madar-teacher", type: "api-result", requestId, data }, window.location.origin);
      }).catch((requestError) => {
        frame.contentWindow?.postMessage({ source: "madar-teacher", type: "api-result", requestId, error: requestError.message || "تعذّر تنفيذ الطلب." }, window.location.origin);
      });
      return;
    }
    if (event.data.type !== "height") return;
    const requestedHeight = Number(event.data.height || 0);
    if (Number.isFinite(requestedHeight) && requestedHeight > 0) frame.style.height = `${Math.max(760, Math.min(2400, requestedHeight + 8))}px`;
  };
  window.addEventListener("message", flippedClassroomHeightListener);
  frame.src = frameSrc;
  requestAnimationFrame(() => {
    try {
      if (frame.contentWindow?.location.href === expectedFrameUrl && frame.contentDocument?.readyState === "complete") markFrameReady();
    } catch (_) {}
  });
}

let libraryPanelMode = "videos";

function openLibraryPanel(mode = "videos") {
  libraryPanelMode = mode;
  navigate("library-panel");
}

async function renderLibraryPanel() {
  await loadSchoolSettings().catch(() => {});
  contentEl.innerHTML = `<div class="student-panel-tabs" aria-label="أقسام الموارد المكتبية">${[['videos','الفيديوهات'],['training','التدريبات'],['worksheets','أوراق عمل']].map(([key,label]) => `<button class="tab-btn ${libraryPanelMode===key?'active':''}" data-library-panel="${key}">${label}</button>`).join('')}<button class="btn btn-primary" id="libraryCreate">+ إنشاء</button></div><div id="libraryPanelContent" aria-live="polite">جارٍ تحميل المحتوى…</div>`;
  document.querySelectorAll('[data-library-panel]').forEach(button => button.onclick=()=>{libraryPanelMode=button.dataset.libraryPanel;renderLibraryPanel();});
  document.getElementById('libraryCreate').onclick=openLibraryCreate;
  const target=document.getElementById('libraryPanelContent');
  try {
    await loadTeacherPlanningContent(true);
    if(!target.isConnected)return;
    const items=teacherPlanningState.items.filter(item=>item.destination===`library-${libraryPanelMode}`);
    target.innerHTML=items.length?planningContentLibrary(items,'لا يوجد محتوى في هذا القسم'):'<div class="card empty-state"><h3>لا يوجد محتوى بعد</h3><p>اضغطي «إنشاء» لرفع ملف وإرساله إلى طالبات الفصل.</p></div>';
    target.querySelectorAll('[data-planning-publish]').forEach(button=>button.onclick=()=>openPlanningPublish(Number(button.dataset.planningPublish)));
    target.querySelectorAll('[data-planning-settings]').forEach(button=>button.onclick=()=>openPlanningContentSettings(Number(button.dataset.planningSettings)));
    target.querySelectorAll('[data-planning-delete]').forEach(button=>button.onclick=()=>confirmAction('هل تريدين حذف المحتوى وإيقاف عرضه للطالبات؟',async()=>{await api(`/planning-content/${button.dataset.planningDelete}`,{method:'DELETE'});await renderLibraryPanel();}));
  }catch(error){if(target.isConnected)target.textContent=error.message;}
}

async function openLibraryCreate() {
  try {await loadTeacherPlanningContent(true);}catch(error){toast(error.message);return;}
  const classes=teacherPlanningState.classes;
  openModal(`<form id="libraryCreateForm"><h3>إنشاء محتوى</h3><div id="libraryCreateMessage" role="status"></div><div class="form-grid two"><label class="field full-span">اسم المحتوى<input name="name" maxlength="190" required></label><label class="field">القسم<select name="destination">${[['worksheets','أوراق العمل'],['training','التدريبات'],['videos','الفيديوهات']].map(([key,label])=>`<option value="library-${key}" ${key===libraryPanelMode?'selected':''}>${label}</option>`).join('')}</select></label><label class="field">إرسال إلى الفصل<select name="classId" required><option value="">اختاري الفصل</option>${classes.map(row=>`<option value="${Number(row.id)}">${escapeHtml(row.name)} — ${escapeHtml(row.level)} — ${escapeHtml(row.grade_label)}</option>`).join('')}</select></label><label class="field">الفصل الدراسي<select name="semester"><option value="first" ${schoolSettings?.currentSemester!=='second'?'selected':''}>الأول</option><option value="second" ${schoolSettings?.currentSemester==='second'?'selected':''}>الثاني</option></select></label><label class="field">رقم الوحدة<input name="unitNumber" type="number" min="1" max="999" value="1" required></label><label class="field">رقم الدرس<input name="lessonNumber" type="number" min="1" max="999" value="1" required></label><label class="field">اسم الدرس (اختياري)<input name="lessonName" maxlength="190"></label><label class="field full-span">الملف<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.html,.htm,.zip,.mp4,.webm" required><small>PDF أو صورة أو HTML أو ZIP أو فيديو MP4 / WebM — حتى 20 ميجابايت</small></label></div>${classes.length?'':'<p>أضيفي فصلًا من قائمة الطالبات أولًا.</p>'}<div class="modal-actions"><button type="button" class="btn btn-outline" id="libraryCreateCancel">إلغاء</button><button type="submit" class="btn btn-primary" ${classes.length?'':'disabled'}>رفع وإرسال</button></div></form>`);
  document.getElementById('libraryCreateCancel').onclick=closeModal;
  let uploadedId=null;
  document.getElementById('libraryCreateForm').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget;const button=form.querySelector('[type="submit"]');const message=document.getElementById('libraryCreateMessage');const data=new FormData(form);
    const row=classes.find(item=>String(item.id)===data.get('classId'));
    if(!row){message.textContent='اختاري الفصل أولًا.';return;}
    if(!uploadedId&&data.get('file').size>20971520){message.textContent='حجم الملف أكبر من 20 ميجابايت.';return;}
    button.disabled=true;message.textContent=uploadedId?'جارٍ إعادة محاولة الإرسال…':'جارٍ رفع المحتوى…';
    try {
      if(!uploadedId){
        data.set('stage',row.level);data.set('gradeLabel',row.grade_label);data.set('lessonName',data.get('lessonName')||data.get('name'));data.set('contentType',data.get('destination')==='library-videos'?'explanation':'activity');
        const result=await api('/planning-content',{method:'POST',body:data});uploadedId=result.item.id;
        form.querySelectorAll('input,select').forEach(input=>input.disabled=true);
      }
      await api(`/planning-content/${uploadedId}/publish`,{method:'POST',body:JSON.stringify({classIds:[Number(row.id)],semester:data.get('semester')})});
      libraryPanelMode=String(data.get('destination')).replace('library-','');closeModal();toast('تم رفع المحتوى وإرساله إلى محتوى معلمتي.');await renderLibraryPanel();
    }catch(error){message.textContent=(uploadedId?'تم حفظ الملف كمسودة، لكن تعذّر الإرسال. أغلقي النافذة ثم استخدمي «نشر» لإعادة المحاولة. ':'')+error.message;button.disabled=Boolean(uploadedId);}
  };
}


let knowledgeExchangeMode = "summary";

const KNOWLEDGE_META = {
  summary: { label: "ملخصات", icon: "📄", hint: "ارفعي ملخصًا بصيغة PDF أو صورة." },
  video: { label: "فيديوهات", icon: "🎬", hint: "أضيفي رابطًا من يوتيوب أو أي موقع فيديو آخر." },
  nafes: { label: "نافس", icon: "🎯", hint: "أرسلي ملفًا أو رابطًا؛ سيظهر تلقائيًا لطالبات الابتدائي والمتوسط فقط.", audience: "الابتدائي والمتوسط" },
  tahsili_abilities: { label: "التحصيلي والقدرات", icon: "🏆", hint: "أرسلي ملفًا أو رابطًا؛ سيظهر تلقائيًا لطالبات المرحلة الثانوية فقط.", audience: "الثانوي" },
};

async function renderKnowledgeExchange() {
  const [data] = await Promise.all([api("/knowledge-exchange"), loadSchoolSettings()]);
  const meta = KNOWLEDGE_META[knowledgeExchangeMode];
  const resources = data.resources.filter((item) => item.category === knowledgeExchangeMode);
  const targetedMode = Boolean(meta.audience);
  const resourceInput = targetedMode
    ? `<div class="form-grid two"><label class="field">نوع المادة<select id="knowledgeResourceKind"><option value="file">ملف PDF أو صورة</option><option value="link">رابط إلكتروني</option></select></label><div class="field"><span>الفئة المستهدفة</span><strong style="display:block;margin-top:9px;color:var(--purple-950)">${escapeHtml(meta.audience)}</strong></div></div><label class="field knowledge-file-field" id="knowledgeTargetFileField">اختيار ملف PDF أو صورة<input id="knowledgeFile" type="file" accept="application/pdf,image/*"><small>الحد الأقصى 15 ميجابايت.</small></label><label class="field" id="knowledgeTargetUrlField" hidden>الرابط الإلكتروني<input id="knowledgeUrl" type="url" inputmode="url" dir="ltr" placeholder="https://example.com"></label>`
    : knowledgeExchangeMode === "video"
      ? '<label class="field">رابط الفيديو<input id="knowledgeUrl" type="url" inputmode="url" required dir="ltr" placeholder="https://www.youtube.com/watch?v=..."></label>'
      : '<label class="field knowledge-file-field">اختيار ملف PDF أو صورة<input id="knowledgeFile" type="file" accept="application/pdf,image/*" required><small>الحد الأقصى 15 ميجابايت.</small></label>';
  contentEl.innerHTML = `
    <section class="knowledge-hero">
      <span aria-hidden="true">🤝</span>
      <div><small>مشاركة المحتوى مع الطالبات</small><h2>تبادل المعرفة</h2><p>${targetedMode ? `النشر مضبوط تلقائيًا لفئة ${escapeHtml(meta.audience)} حسب الزر المختار.` : "أضيفي الملخصات وروابط الفيديو لتظهر مباشرة في حسابات طالباتكِ."}</p></div>
    </section>
    ${academicSelectorHtml("knowledgeExchange")}
    <div class="student-panel-tabs knowledge-tabs" role="tablist" aria-label="أقسام تبادل المعرفة">
      ${Object.entries(KNOWLEDGE_META).map(([key, item]) => `<button class="tab-btn ${knowledgeExchangeMode === key ? "active" : ""}" type="button" data-knowledge-mode="${key}"><span aria-hidden="true">${item.icon}</span> ${item.label}</button>`).join("")}
    </div>
    <div class="knowledge-layout">
      <form class="card knowledge-form" id="knowledgeResourceForm" enctype="multipart/form-data">
        <div class="knowledge-card-heading"><span aria-hidden="true">${meta.icon}</span><div><h3>إضافة ${meta.label}</h3><p>${meta.hint}</p></div></div>
        <label class="field">العنوان<input id="knowledgeTitle" maxlength="190" required placeholder="اكتبي عنوان المورد"></label>
        <label class="field">وصف مختصر <small>اختياري</small><textarea id="knowledgeDescription" maxlength="1000" placeholder="اكتبي وصفًا يساعد الطالبة على معرفة محتوى المورد"></textarea></label>
        ${resourceInput}
        <div id="knowledgeFormMessage"></div>
        <button class="btn btn-primary knowledge-submit" type="submit">${targetedMode ? `إرسال إلى طالبات ${escapeHtml(meta.audience)}` : knowledgeExchangeMode === "video" ? "إضافة رابط الفيديو" : "رفع المورد"}</button>
      </form>
      <section class="card knowledge-list-card">
        <div class="knowledge-card-heading"><span aria-hidden="true">📚</span><div><h3>${meta.label} المضافة</h3><p>${resources.length} مورد</p></div></div>
        <div class="knowledge-resource-list">${resources.length ? resources.map((item) => {
          const action = item.resourceType === "link"
            ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${item.category === "video" ? "مشاهدة الفيديو" : "فتح الرابط"}</a>`
            : `<a class="btn btn-secondary btn-sm" href="/api/teacher/knowledge-exchange/${item.id}/file" target="_blank" rel="noopener">معاينة الملف</a>`;
          return `<article class="knowledge-resource-item"><span class="knowledge-resource-icon" aria-hidden="true">${meta.icon}</span><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.description || "بدون وصف")}</p><small>${formatDate(item.createdAt)}${item.originalName ? ` · ${escapeHtml(item.originalName)}` : ""}</small></div><div class="knowledge-resource-actions">${action}<button class="btn btn-outline btn-sm" type="button" data-delete-knowledge="${item.id}">حذف</button></div></article>`;
        }).join("") : `<div class="empty-state"><div class="ic">${meta.icon}</div>لم تُضف ${meta.label} بعد.</div>`}</div>
      </section>
    </div>`;

  bindAcademicSelector("knowledgeExchange", () => {
    renderKnowledgeExchange().catch((error) => { contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`; });
  });

  document.querySelectorAll("[data-knowledge-mode]").forEach((button) => {
    button.onclick = () => {
      knowledgeExchangeMode = button.dataset.knowledgeMode;
      renderKnowledgeExchange().catch((error) => { contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`; });
    };
  });
  const resourceKind = document.getElementById("knowledgeResourceKind");
  if (resourceKind) {
    const syncTargetResourceKind = () => {
      document.getElementById("knowledgeTargetFileField").hidden = resourceKind.value !== "file";
      document.getElementById("knowledgeTargetUrlField").hidden = resourceKind.value !== "link";
    };
    resourceKind.onchange = syncTargetResourceKind;
    syncTargetResourceKind();
  }
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
    const selectedResourceKind = targetedMode ? document.getElementById("knowledgeResourceKind").value : (knowledgeExchangeMode === "video" ? "link" : "file");
    if (selectedResourceKind === "link") {
      const url = document.getElementById("knowledgeUrl").value.trim();
      if (!url) { document.getElementById("knowledgeFormMessage").innerHTML = '<div class="form-error">أضيفي الرابط الإلكتروني.</div>'; submit.disabled = false; return; }
      formData.set("url", url);
    } else {
      const file = document.getElementById("knowledgeFile").files[0];
      if (!file) { document.getElementById("knowledgeFormMessage").innerHTML = '<div class="form-error">اختاري ملف PDF أو صورة.</div>'; submit.disabled = false; return; }
      formData.set("file", file);
    }
    try {
      await api("/knowledge-exchange", { method: "POST", body: formData });
      toast(targetedMode ? `تم إرسال ${meta.label} إلى طالبات ${meta.audience}.` : `تمت إضافة ${meta.label} إلى تبادل المعرفة.`);
      await renderKnowledgeExchange();
    } catch (error) {
      document.getElementById("knowledgeFormMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
      submit.disabled = false;
    }
  };
}


let parentPanelMode = "accounts";
let parentCommunityFilter = "all";

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
      <div><small>التواصل الأسري</small><h2>ولي الأمر</h2><p>إدارة الحسابات، إعداد الإعلانات، ومراجعة إنجازات أولياء الأمور في مجتمع الفصل.</p></div>
    </section>
    <div class="parent-tool-tabs">
      <button type="button" class="${parentPanelMode === "accounts" ? "active" : ""}" data-parent-mode="accounts"><span>👤</span><strong>إدارة حساب ولي الأمر</strong><small>الطلبات والحسابات والربط</small></button>
      <button type="button" class="${parentPanelMode === "announcement" ? "active" : ""}" data-parent-mode="announcement"><span>📣</span><strong>إعداد إعلان</strong><small>كتابة إعلان ونشره لأولياء الأمور</small></button>
      <button type="button" class="${parentPanelMode === "community" ? "active" : ""}" data-parent-mode="community"><span>🖼️</span><strong>مجمع مدار</strong><small>مراجعة الصور والفيديوهات قبل نشرها</small></button>
    </div>
    <section id="parentToolBody"><div class="card loading-state">جارٍ تحميل بيانات أولياء الأمور...</div></section>`;
  document.querySelectorAll("[data-parent-mode]").forEach((button) => {
    button.onclick = async () => {
      parentPanelMode = button.dataset.parentMode;
      try { await renderParentPanel(); }
      catch (error) { document.getElementById("parentToolBody").innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`; }
    };
  });
  if (parentPanelMode === "community") await renderParentCommunity();
  else if (parentPanelMode === "announcement") await renderParentAnnouncement();
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
      <div class="parent-card-title"><span>👥</span><div><h3>حسابات أولياء الأمور</h3><p>تظهر الحسابات والروابط التي أنشأتها، حتى بعد انتقال الطالبة أو حذفها من الفصل.</p></div></div>
      <div class="parent-account-list">${data.parents.length ? data.parents.map((parent) => {
        const available = data.students.filter((student) => !parent.children.some((child) => child.id === student.id));
        return `<article class="parent-account-item">
          <div class="parent-account-main"><span class="parent-account-avatar">${escapeHtml(parent.name.trim().charAt(0) || "و")}</span><div><h4>${escapeHtml(parent.name)}</h4><small>الدخول بالاسم الأول والأخير · ${parent.status === "active" ? "الحساب مفعّل" : "الحساب معطّل"}${parent.sharedWithOtherTeachers ? " · مرتبط أيضًا بمعلمة أخرى" : ""}</small></div></div>
          <div class="parent-linked-children">${parent.children.map((child) => `<span>${escapeHtml(child.name)}${child.deleted ? " · محذوفة" : ""} <button type="button" title="إلغاء الربط" data-unlink-parent="${parent.id}" data-unlink-student="${child.id}">×</button></span>`).join("")}</div>
          <div class="parent-link-row"><select data-parent-link-select="${parent.id}"><option value="">اختاري طالبة لإضافتها</option>${available.map((student) => `<option value="${student.id}">${escapeHtml(student.name)} · ${escapeHtml(student.className)}</option>`).join("")}</select><button class="btn btn-secondary btn-sm" type="button" data-link-parent="${parent.id}" ${available.length ? "" : "disabled"}>ربط طالبة</button></div>
          <div class="parent-account-actions"><button class="btn btn-outline btn-sm" type="button" data-reset-parent="${parent.id}" ${parent.sharedWithOtherTeachers ? "disabled" : ""}>إعادة كلمة المرور</button><button class="btn ${parent.status === "active" ? "btn-danger" : "btn-primary"} btn-sm" type="button" data-toggle-parent="${parent.id}" data-parent-status="${parent.status}" ${parent.sharedWithOtherTeachers ? "disabled" : ""}>${parent.status === "active" ? "تعطيل" : "تفعيل"}</button><button class="btn btn-danger btn-sm" type="button" data-delete-parent="${parent.id}" ${parent.sharedWithOtherTeachers ? "disabled" : ""}>حذف</button></div>
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
  document.querySelectorAll("[data-delete-parent]").forEach((button) => button.onclick = () =>
    confirmAction("حذف حساب ولي الأمر؟ سيُعطّل الحساب ويختفي من قائمة المعلمة، ويمكن لمالكة الموقع استعادته.", async () => {
      await api(`/parents/${button.dataset.deleteParent}`, { method: "DELETE", body: "{}" });
      toast("تم حذف حساب ولي الأمر.");
      await renderParentAccounts();
    })
  );
}

function openParentPasswordModal(parentId) {
  openModal(`<h3>إعادة تعيين كلمة مرور ولي الأمر</h3><div id="parentPasswordMessage"></div><label class="field">كلمة المرور الجديدة<input id="parentNewPassword" type="password" minlength="10" placeholder="10 أحرف على الأقل وحرف ورقم"></label><div class="modal-actions"><button class="btn btn-outline" id="cancelParentPassword">إلغاء</button><button class="btn btn-primary" id="saveParentPassword">حفظ</button></div>`);
  document.getElementById("cancelParentPassword").onclick = closeModal;
  document.getElementById("saveParentPassword").onclick = async () => {
    try { await api(`/parents/${parentId}/reset-password`, { method: "PUT", body: JSON.stringify({ newPassword: document.getElementById("parentNewPassword").value }) }); closeModal(); toast("تم تعيين كلمة المرور الجديدة."); } catch (error) { document.getElementById("parentPasswordMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
  };
}

async function renderParentAnnouncement() {
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
    try { await api("/parent-community", { method: "POST", body: JSON.stringify({ title: document.getElementById("parentPostTitle").value.trim(), body: document.getElementById("parentPostBody").value.trim(), classId: Number(document.getElementById("parentPostClass").value || 0) }) }); toast("تم نشر الإعلان في مجمع مدار."); await renderParentAnnouncement(); } catch (error) { message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; }
  };
  document.querySelectorAll("[data-delete-parent-post]").forEach((button) => button.onclick = () => confirmAction("حذف هذا الإعلان من مجمع مدار؟", async () => { await api(`/parent-community/${button.dataset.deleteParentPost}`, { method: "DELETE", body: "{}" }); toast("تم حذف الإعلان."); await renderParentAnnouncement(); }));
}

function parentMediaStatusLabel(status) {
  return ({ pending: "بانتظار الاعتماد", published: "منشور", rejected: "مرفوض", archived: "مؤرشف" })[status] || status;
}

function teacherParentMediaCard(post) {
  const media = post.mediaKind === "video"
    ? `<video controls preload="metadata" src="${escapeHtml(post.mediaUrl)}" aria-label="فيديو ${escapeHtml(post.title)}"></video>`
    : `<img src="${escapeHtml(post.mediaUrl)}" alt="${escapeHtml(post.title)}" loading="lazy">`;
  const initial = escapeHtml((post.senderName || "و").trim().charAt(0) || "و");
  const actions = post.status === "pending"
    ? `<button class="btn btn-primary btn-sm" type="button" data-community-review="approve" data-community-id="${post.id}">اعتماد</button><button class="btn btn-outline btn-sm is-danger" type="button" data-community-review="reject" data-community-id="${post.id}">رفض</button>`
    : post.status === "published"
      ? `<button class="btn btn-outline btn-sm" type="button" data-community-review="archive" data-community-id="${post.id}">أرشفة</button>`
      : post.status === "rejected"
        ? `<button class="btn btn-primary btn-sm" type="button" data-community-review="approve" data-community-id="${post.id}">اعتماد الآن</button><button class="btn btn-outline btn-sm" type="button" data-community-review="archive" data-community-id="${post.id}">أرشفة</button>`
        : "";
  return `<article class="parent-media-card">
    <div class="parent-media-visual">${media}<span class="parent-media-status is-${escapeHtml(post.status)}">${parentMediaStatusLabel(post.status)}</span></div>
    <div class="parent-media-copy"><div class="parent-media-sender"><span>${initial}</span><div><strong>${escapeHtml(post.senderName)}</strong><small>${escapeHtml(post.className)} · ${formatDate(post.createdAt)}</small></div></div>
    <h3>${escapeHtml(post.title)}</h3>${post.description ? `<p>${escapeHtml(post.description).replace(/\n/g,"<br>")}</p>` : ""}
    <div class="parent-media-detail"><span>عن الطالبة: ${escapeHtml(post.studentName || "—")}</span><span>${post.mediaKind === "video" ? "فيديو" : "صورة"}</span></div>
    ${actions ? `<div class="parent-media-actions">${actions}</div>` : ""}</div>
  </article>`;
}

function teacherAnnouncementWallCard(post) {
  return `<article class="parent-media-card is-announcement"><div class="parent-media-announcement-mark">📣</div><div class="parent-media-copy"><span class="parent-media-status is-published">إعلان المعلمة</span><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.body).replace(/\n/g,"<br>")}</p><div class="parent-media-detail"><span>${escapeHtml(post.className || "جميع الفصول")}</span><span>${formatDate(post.createdAt)}</span></div></div></article>`;
}

async function renderParentCommunity() {
  const query = parentCommunityFilter === "all" ? "" : `?status=${encodeURIComponent(parentCommunityFilter)}`;
  const [mediaData, announcementData] = await Promise.all([api(`/parent-community/media${query}`), api("/parent-community")]);
  const counts = mediaData.counts || {};
  const showAnnouncements = parentCommunityFilter === "all" || parentCommunityFilter === "published";
  const cards = [
    ...(showAnnouncements ? (announcementData.posts || []).map(teacherAnnouncementWallCard) : []),
    ...(mediaData.posts || []).map(teacherParentMediaCard),
  ];
  const body = document.getElementById("parentToolBody");
  body.innerHTML = `<section class="parent-community-dashboard">
    <header class="parent-community-heading"><div><span>لوحة إنجاز الفصل</span><h3>مجمع مدار</h3><p>راجعي مشاركات أولياء الأمور قبل أن تظهر لبقية أسر الفصل.</p></div><label>عرض الحالة<select id="parentCommunityFilter"><option value="all">جميع الحالات</option><option value="pending">بانتظار الاعتماد</option><option value="published">المنشور</option><option value="rejected">المرفوض</option><option value="archived">المؤرشف</option></select></label></header>
    <div class="parent-community-metrics">
      <article class="is-pending"><span>⏳</span><div><strong>${counts.pending || 0}</strong><small>بانتظار الاعتماد</small></div></article>
      <article class="is-published"><span>✓</span><div><strong>${counts.published || 0}</strong><small>مشاركة منشورة</small></div></article>
      <article><span>▦</span><div><strong>${counts.total || 0}</strong><small>إجمالي المشاركات</small></div></article>
    </div>
    ${cards.length ? `<div class="parent-community-wall">${cards.join("")}</div>` : `<div class="card parent-community-empty"><span>🖼️</span><h3>لا توجد مشاركات في هذه الحالة</h3><p>ستظهر هنا الصور والفيديوهات التي يرسلها أولياء الأمور.</p></div>`}
  </section>`;
  document.getElementById("parentCommunityFilter").value = parentCommunityFilter;
  document.getElementById("parentCommunityFilter").onchange = async (event) => { parentCommunityFilter = event.target.value; await renderParentCommunity(); };
  document.querySelectorAll("[data-community-review]").forEach((button) => {
    button.onclick = async () => {
      const action = button.dataset.communityReview;
      const run = async () => {
        button.disabled = true;
        try {
          await api(`/parent-community/media/${button.dataset.communityId}/${action}`, { method: "POST", body: "{}" });
          toast(action === "approve" ? "تم اعتماد المشاركة ونشرها." : action === "reject" ? "تم رفض المشاركة." : "تمت أرشفة المشاركة.");
          await renderParentCommunity();
        } catch (error) { button.disabled = false; toast(error.message); }
      };
      if (action === "approve") await run();
      else confirmAction(action === "reject" ? "رفض هذه المشاركة؟" : "أرشفة هذه المشاركة؟",run);
    };
  });
}

function renderEducationalContent(key, target = contentEl) {
  const section = EDUCATIONAL_CONTENT[key];
  if (key === "interactive-games" || key === "game-creator") {
    const gameAcademicContext = academicSelectorHtml("games");
    const formatGameNumber = (value) => new Intl.NumberFormat("ar-SA", { useGrouping: false }).format(value);
    const allInteractiveGames = Array.isArray(interactiveGamesState.games) ? interactiveGamesState.games : [];
    const gamesSelection = normalizeAcademicSelection("games");
    const selectedGamesClass = selectedAcademicClass("games");
    const selectedGameStage = String(selectedGamesClass?.level || gamesSelection.stage || "").trim();
    const selectedGameGrade = gamesSelection.gradeLabel === "all" && !selectedGamesClass
      ? "all"
      : normalizeGradeKey(selectedGameStage, actualAcademicGradeLabel("games"));
    const allBuilderGames = Array.isArray(interactiveGamesState.builderGames) ? interactiveGamesState.builderGames : [];
    const builderGameKeys = new Set(allBuilderGames.map((game) => game.gameKey));
    const gameMatchesSelection = (game) => {
      const gameStage = String(game.stage || "all").trim();
      const gameGrade = String(game.gradeLabel || "all").trim();
      const stageMatches = selectedGameStage === "all" || gameStage === "all" || gameStage === selectedGameStage;
      const gradeMatches = selectedGameGrade === "all" || gameGrade === "all"
        || normalizeGradeKey(gameStage === "all" ? selectedGameStage : gameStage, gameGrade) === selectedGameGrade;
      return stageMatches && gradeMatches;
    };
    const games = allInteractiveGames.filter((game) => !builderGameKeys.has(game.gameKey)).filter(gameMatchesSelection);
    const builderGames = key === "game-creator" ? allBuilderGames : allBuilderGames.filter(gameMatchesSelection);
    const publicationTargetMatches = (target) => {
      const targetStage = String(target?.stage || "").trim();
      const targetGrade = String(target?.gradeLabel || "").trim();
      const targetSemester = String(target?.semester || "").trim();
      const currentSemester = String(schoolSettings?.currentSemester || "").trim();
      const classMatches = !selectedGamesClass || Number(target?.classId) === Number(selectedGamesClass.id);
      const semesterMatches = !currentSemester || !targetSemester || targetSemester === currentSemester;
      const stageMatches = selectedGameStage === "all" || targetStage === selectedGameStage;
      const gradeMatches = selectedGameGrade === "all"
        || normalizeGradeKey(targetStage || selectedGameStage, targetGrade) === selectedGameGrade;
      return classMatches && semesterMatches && stageMatches && gradeMatches;
    };
    const builderLibraryGames = allBuilderGames.filter((game) => {
      if (game.validationStatus !== "ready") return false;
      const targets = Array.isArray(game.publicationTargets) ? game.publicationTargets : [];
      return game.status === "published" && targets.length ? targets.some(publicationTargetMatches) : gameMatchesSelection(game);
    }).map((game) => ({ ...game, isBuilderGame: true }));
    const availableGames = [...games, ...builderLibraryGames];
    const publicationReady = interactiveGamesState.publicationReady !== false;
    const publicationMissingColumns = Array.isArray(interactiveGamesState.publicationMissingColumns) ? interactiveGamesState.publicationMissingColumns : [];
    const gameIsPublished = (game) => game?.isActive === true || Number(game?.isActive) === 1;
    const gameSemester = (game) => {
      const semester = String(game?.semester || schoolSettings?.currentSemester || "").trim();
      return ["first", "second"].includes(semester) ? semester : "";
    };
    const publicationDisabled = publicationReady ? "" : "disabled";
    const publicationNotice = publicationReady ? "" : `<div class="form-error game-publication-notice">يلزم تشغيل ملف <b dir="ltr">migration_20260808_interactive_game_publication.sql</b> مرة واحدة لتفعيل نشر الألعاب.${publicationMissingColumns.length ? ` الأعمدة الناقصة: ${escapeHtml(publicationMissingColumns.join("، "))}.` : ""}</div>`;
    const builderReady = interactiveGamesState.builderReady === true;
    const builderNotice = builderReady ? "" : `<div class="form-error game-builder-migration-notice">يلزم تشغيل ملف <b dir="ltr">${escapeHtml(interactiveGamesState.builderMigration || "migration_20260810_interactive_game_builder.sql")}</b> مرة واحدة لتفعيل إنشاء واستيراد الألعاب. تم إنشاء الملف فقط ولم يتم تشغيله.</div>`;
    const gameBuilderStudio = `
      <section class="game-builder-shell">
        <div class="game-builder-heading"><div><span>استديو ألعاب مدار</span><h2>أنشئي لعبة أو استوردي حزمة مبرمجة</h2><p>القوالب والشهادة والنقاط والنتائج تعمل من نظام مشترك، وتبقى كل نسخة محفوظة مع نتائجها.</p></div><div class="game-builder-create-actions"><button class="btn btn-primary" id="createTemplateGame" type="button" ${builderReady ? "" : "disabled"}>إنشاء لعبة من قالب</button><button class="btn btn-secondary" id="importProgrammedGame" type="button" ${builderReady ? "" : "disabled"}>استيراد لعبة مبرمجة ZIP</button></div></div>
        ${builderNotice}
        <div class="game-builder-grid">
          ${builderGames.map((game) => {
            const statusLabel = game.status === "published" ? "منشورة" : game.status === "disabled" ? "موقوفة" : "مسودة";
            const sourceLabel = game.sourceType === "package" ? "حزمة مبرمجة" : game.templateType === "multiple_choice" ? "اختيار من متعدد" : game.templateType === "true_false" ? "صح أو خطأ" : game.templateType === "matching" ? "مطابقة" : "ترتيب";
            const ready = game.validationStatus === "ready";
            const unitLesson = game.unitNumber && game.lessonNumber ? `${formatGameNumber(game.unitNumber)}-${formatGameNumber(game.lessonNumber)}` : "—";
            return `<article class="game-builder-card" data-builder-game="${game.id}">
              <div class="game-builder-cover">${game.coverUrl ? `<img src="${escapeHtml(game.coverUrl)}" alt="غلاف ${escapeHtml(game.name)}">` : `<strong>${escapeHtml(unitLesson)}</strong>`}</div>
              <div class="game-builder-card-body"><div class="game-builder-card-top"><span class="game-builder-status is-${escapeHtml(game.status)}">${statusLabel}</span><small>الإصدار ${formatGameNumber(game.versionNumber || 1)}</small></div><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.description || game.lessonName)}</p><div class="game-builder-meta"><span>${escapeHtml(sourceLabel)}</span><span>${escapeHtml(game.lessonName || "—")}</span><span>${escapeHtml(game.subjectName || "—")}</span><span>${escapeHtml(game.stage === "all" ? "كل المراحل" : game.stage)}</span><span>${game.timeMode === "timed" ? `${formatGameNumber(game.timePerQuestionSeconds)} ثانية` : "وقت مفتوح"}</span><span>${(game.difficulties || []).map((level) => level === "easy" ? "بسيط" : level === "hard" ? "متقدم" : "متوسط").join("، ") || "—"}</span><span>${formatGameNumber(game.publicationCount || 0)} فصل</span></div>${ready ? "" : `<div class="game-builder-warning">تحتاج تهيئة: ${escapeHtml(game.validationMessage || "لم يتم العثور على اتصال MadarGameBridge داخل الحزمة.")}</div>`}<div class="game-builder-card-actions"><a class="btn btn-primary btn-sm" href="${escapeHtml(game.previewUrl)}" target="_blank" rel="noopener">معاينة</a><button class="btn btn-secondary btn-sm" type="button" data-builder-publish="${game.id}" ${ready ? "" : "disabled"}>${game.status === "published" ? "تعديل النشر" : "نشر"}</button><button class="btn btn-outline btn-sm" type="button" data-builder-edit="${game.id}">${game.sourceType === "package" ? "رفع إصدار" : "تعديل"}</button><button class="btn btn-outline btn-sm" type="button" data-builder-copy="${game.id}">نسخ</button><button class="btn btn-outline btn-sm" type="button" data-builder-status="${game.id}" data-status="${game.status === "disabled" ? "draft" : "disabled"}">${game.status === "disabled" ? "إعادة التفعيل" : "إيقاف"}</button><button class="btn btn-danger btn-sm" type="button" data-builder-delete="${game.id}" aria-label="حذف سجل لعبة ${escapeHtml(game.name)}">حذف السجل</button></div></div>
            </article>`;
          }).join("") || (builderReady ? '<div class="game-builder-empty"><strong>لا توجد ألعاب منشأة بعد</strong><p>ابدئي بقالب جاهز أو استوردي حزمة ZIP مبرمجة.</p></div>' : "")}
        </div>
      </section>`;
    const interactiveGamesLibrary = `
      <section class="games-library-grid" aria-label="الألعاب التفاعلية المتاحة">
        ${gameAcademicContext}
        ${publicationNotice}
        ${availableGames.map((game) => {
          const isBuilderGame = game.isBuilderGame === true;
          const unitNumber = Number(game.unitNumber);
          const lessonNumber = Number(game.lessonNumber);
          const configured = (isBuilderGame || Boolean(game.configured)) && Number.isInteger(unitNumber) && unitNumber > 0 && Number.isInteger(lessonNumber) && lessonNumber > 0 && String(game.lessonName || "").trim() !== "";
          const lessonMeta = configured ? `${formatGameNumber(unitNumber)}-${formatGameNumber(lessonNumber)}` : "—";
          const timeMode = game.timeMode === "timed" ? "timed" : "open";
          const isPublished = isBuilderGame ? game.status === "published" : gameIsPublished(game);
          const baseStudentUrl = isBuilderGame ? game.playUrl : `${game.playPath}?game=${encodeURIComponent(game.gameKey)}`;
          const studentQueryJoiner = baseStudentUrl.includes("?") ? "&" : "?";
          const playUrl = isBuilderGame ? game.previewUrl : `${baseStudentUrl}${studentQueryJoiner}play=1&from=teacher`;
          const studentUrl = `${baseStudentUrl}${studentQueryJoiner}play=1`;
          const gameTitle = isBuilderGame ? String(game.name || game.lessonName || "لعبة تفاعلية") : (configured ? String(game.name || `تحدي ${game.lessonName}`) : "إعداد درس اللعبة غير مكتمل");
          const publicationTargets = isBuilderGame && Array.isArray(game.publicationTargets) ? game.publicationTargets : [];
          const targetLabels = [...new Set(publicationTargets.map((target) => `${target.stage || "—"} · ${target.gradeLabel || "—"}`))];
          const audienceLabel = targetLabels.length ? targetLabels.join("، ") : `${game.stage === "all" ? "جميع المراحل" : game.stage} · ${game.gradeLabel === "all" ? "جميع الصفوف" : game.gradeLabel}`;
          return `<article class="card teacher-game-card" data-game-card="${escapeHtml(game.gameKey)}">
            <div class="teacher-game-lesson-number">${escapeHtml(lessonMeta)}</div>
            <div class="teacher-game-copy">
              <h3>${escapeHtml(gameTitle)}</h3>
              <p>${configured ? escapeHtml(isBuilderGame && game.description ? game.description : "لعبة تفاعلية متدرجة مع تصحيح فوري وحفظ المحاولات والنتائج في حساب الطالبة.") : "أكملي رقم الوحدة ورقم الدرس واسم الدرس قبل إتاحة الشهادة للطالبات."}</p>
              <div class="teacher-game-publication-row"><span class="teacher-game-publication-status${isPublished ? " is-published" : " is-unpublished"}" role="status">${isPublished ? "منشورة" : "غير منشورة"}</span></div>
              <div class="teacher-game-features" aria-label="مميزات اللعبة"><span>✦ أسئلة متجددة</span><span>🏆 نقاط ومستويات</span><span>🎓 ${escapeHtml(audienceLabel)}</span><span>${timeMode === "timed" ? `⏱ ${formatGameNumber(game.timePerQuestionSeconds)} ثانية` : "⌁ وقت مفتوح"}</span></div>
              <div class="teacher-game-actions">
                <a class="btn btn-primary" href="${escapeHtml(playUrl)}" target="_blank" rel="noopener">فتح اللعبة</a>
                <button class="btn btn-secondary" type="button" data-copy-game-link="${escapeHtml(studentUrl)}">نسخ رابط اللعبة</button>
                ${isBuilderGame ? `<button class="btn btn-outline" type="button" data-builder-configure="${game.id}">إعداد اللعبة</button><button class="btn teacher-game-timer-toggle${timeMode === "timed" ? " is-active" : ""}" type="button" data-builder-timer="${game.id}" aria-pressed="${timeMode === "timed"}">مؤقت</button>` : `<button class="btn btn-outline" type="button" data-configure-game="${escapeHtml(game.gameKey)}">إعداد اللعبة</button><button class="btn teacher-game-timer-toggle${timeMode === "timed" ? " is-active" : ""}" type="button" data-game-timer="${escapeHtml(game.gameKey)}" aria-pressed="${timeMode === "timed"}">مؤقت</button>`}
              </div>
            </div>
          </article>`;
        }).join("") || '<div class="empty-state">لا توجد ألعاب مناسبة للمرحلة والصف المحددين.</div>'}
      </section>`;
    target.innerHTML = key === "game-creator" ? gameBuilderStudio : interactiveGamesLibrary;
    bindAcademicSelector("games", () => renderGamesPanel());
    document.getElementById("createTemplateGame")?.addEventListener("click", () => openInteractiveTemplateEditor());
    document.getElementById("importProgrammedGame")?.addEventListener("click", () => openInteractivePackageImporter());
    target.querySelectorAll("[data-builder-edit]").forEach((button) => { button.onclick = async () => {
      const game = allBuilderGames.find((item) => Number(item.id) === Number(button.dataset.builderEdit));
      if (game?.sourceType === "package") openInteractivePackageImporter(Number(game.id));
      else openInteractiveTemplateEditor(Number(button.dataset.builderEdit));
    }; });
    target.querySelectorAll("[data-builder-configure]").forEach((button) => { button.onclick = () => openInteractiveBuilderSettings(Number(button.dataset.builderConfigure)); });
    target.querySelectorAll("[data-builder-timer]").forEach((button) => { button.onclick = () => openInteractiveBuilderTimer(Number(button.dataset.builderTimer)); });
    target.querySelectorAll("[data-builder-publish]").forEach((button) => { button.onclick = () => openInteractiveGamePublication(Number(button.dataset.builderPublish)); });
    target.querySelectorAll("[data-builder-copy]").forEach((button) => { button.onclick = () => openInteractiveGameCopy(Number(button.dataset.builderCopy)); });
    target.querySelectorAll("[data-builder-status]").forEach((button) => { button.onclick = async () => {
      try { await api(`/interactive-games/builder/library/${button.dataset.builderStatus}/status`, { method: "POST", body: JSON.stringify({ status: button.dataset.status }) }); toast(button.dataset.status === "disabled" ? "تم إيقاف اللعبة مع بقاء النتائج." : "أعيدت اللعبة إلى المسودة."); await refreshGames(); } catch (error) { toast(error.message); }
    }; });
    target.querySelectorAll("[data-builder-delete]").forEach((button) => { button.onclick = () => {
      const game = allBuilderGames.find((item) => Number(item.id) === Number(button.dataset.builderDelete));
      if (!game) return;
      const gameName = String(game.name || "هذه اللعبة");
      confirmAction(`حذف سجل لعبة «${gameName}»؟ ستتوقف عن الظهور، مع الاحتفاظ بجميع النتائج والإصدارات.`, async () => {
        await api(`/interactive-games/builder/library/${game.id}`, { method: "DELETE", body: "{}" });
        interactiveGamesState.builderGames = interactiveGamesState.builderGames.filter((item) => Number(item.id) !== Number(game.id));
        renderEducationalContent(key, target);
        toast(`تم حذف سجل لعبة «${gameName}» بأمان مع الاحتفاظ بالنتائج.`);
      });
    }; });
    target.querySelectorAll("[data-copy-game-link]").forEach((copyButton) => { copyButton.onclick = async () => {
      const url = new URL(copyButton.dataset.copyGameLink, window.location.origin).href;
      try { await navigator.clipboard.writeText(url); toast("تم نسخ رابط اللعبة."); }
      catch (_) { window.prompt("انسخي رابط اللعبة:", url); }
    }; });

    const refreshGames = async () => {
      await loadInteractiveGames();
      renderEducationalContent(key, target);
    };
    const saveTimerSettings = async (gameKey, mode, seconds, button) => {
      if (button) button.disabled = true;
      try {
        await api(`/interactive-games/${encodeURIComponent(gameKey)}`, { method: "PUT", body: JSON.stringify({
          timerOnly: true,
          timeMode: mode,
          timePerQuestionSeconds: seconds,
        }) });
        closeModal();
        toast(mode === "timed" ? "تم تفعيل المؤقت." : "تم إيقاف المؤقت.");
        await refreshGames();
      } catch (error) {
        const message = document.getElementById("gameTimerMessage");
        if (message) message.innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
        else toast(error.message || "تعذّر تحديث المؤقت.");
        if (button) button.disabled = false;
      }
    };

    target.querySelectorAll("[data-game-timer]").forEach((timerToggle) => { timerToggle.onclick = () => {
      const game = games.find((item) => item.gameKey === timerToggle.dataset.gameTimer);
      if (!game?.configured) {
        toast("أكملي إعداد بيانات اللعبة أولًا.");
        target.querySelector(`[data-configure-game="${CSS.escape(timerToggle.dataset.gameTimer)}"]`)?.click();
        return;
      }
      const timerIsActive = game.timeMode === "timed";
      const currentSeconds = Number(game.timePerQuestionSeconds);
      openModal(`
        <form class="game-timer-dialog" id="gameTimerForm">
          <h3>${timerIsActive ? "تعديل المؤقت" : "تفعيل المؤقت"}</h3>
          <p>حددي وقت السؤال بالثواني.</p>
          <div id="gameTimerMessage"></div>
          <label class="field">وقت السؤال بالثواني<input id="gameTimerSeconds" type="number" min="15" max="120" inputmode="numeric" value="${Number.isInteger(currentSeconds) ? currentSeconds : ""}" required /></label>
          <div class="modal-actions">${timerIsActive ? '<button class="btn btn-outline" type="button" id="disableGameTimer">إيقاف المؤقت</button>' : ''}<button class="btn btn-outline" type="button" id="cancelGameTimer">إلغاء</button><button class="btn btn-primary" type="submit" id="saveGameTimer">${timerIsActive ? "حفظ" : "تفعيل"}</button></div>
        </form>
      `, "game-timer-modal");
      document.getElementById("cancelGameTimer").onclick = closeModal;
      const disableTimerButton = document.getElementById("disableGameTimer");
      if (disableTimerButton) disableTimerButton.onclick = () => saveTimerSettings(game.gameKey, "open", null, disableTimerButton);
      document.getElementById("gameTimerForm").onsubmit = (event) => {
        event.preventDefault();
        saveTimerSettings(game.gameKey, "timed", Number(document.getElementById("gameTimerSeconds").value), document.getElementById("saveGameTimer"));
      };
    }; });

    target.querySelectorAll("[data-configure-game]").forEach((button) => { button.onclick = () => {
      const game = games.find((item) => item.gameKey === button.dataset.configureGame);
      const initialStage = GAME_TARGET_STAGES.includes(game.stage) ? game.stage : "all";
      const allowedInitialGrades = initialStage === "all" ? [] : (ACADEMIC_GRADES[initialStage] || []);
      const initialGrade = game.gradeLabel === "all" || allowedInitialGrades.includes(game.gradeLabel) ? game.gradeLabel : "all";
      const initialSemester = gameSemester(game);
      const existingClassId = Number(game.classId);
      const gameClassId = Number.isInteger(existingClassId) && existingClassId > 0 ? existingClassId : null;
      const initialAudience = gameClassId ? String(gameClassId) : initialStage === "all" ? "all" : "scope";
      const gameAudienceOptions = `<option value="" disabled>اختاري نطاق النشر</option><option value="scope" ${initialAudience === "scope" ? "selected" : ""}>كل فصول المرحلة والصف المحددين</option><option value="all" ${initialAudience === "all" ? "selected" : ""}>جميع الطالبات — نشر عام</option>${allClasses.map((item) => `<option value="${item.id}" ${String(item.id) === initialAudience ? "selected" : ""}>${escapeHtml(item.stage || item.level || "")} · ${escapeHtml(item.grade_label || item.gradeLabel || "")} · ${escapeHtml(item.name || "")}</option>`).join("")}`;
      openModal(`
        <form class="game-config-dialog" id="gameConfigForm">
          <h3>إعداد بيانات اللعبة</h3>
          <p>أدخلي بيانات الدرس الفعلية وحددي الترم المرتبط بهذه اللعبة.</p>
          <div id="gameConfigMessage"></div>
          ${game.nameEditable === false ? "" : `<label class="field">اسم اللعبة<input id="gameName" maxlength="190" value="${escapeHtml(game.name || "")}" required /></label>`}
          <label class="field">اسم الدرس<input id="gameLessonName" maxlength="190" value="${escapeHtml(game.lessonName || "")}" required /></label>
          <div class="form-grid two"><label class="field">رقم الوحدة<input id="gameUnitNumber" type="number" min="1" max="999" value="${game.unitNumber || ""}" required /></label><label class="field">رقم الدرس<input id="gameLessonNumber" type="number" min="1" max="999" value="${game.lessonNumber || ""}" required /></label></div>
          <div class="form-grid two"><label class="field">المرحلة<select id="gameTargetStage" required>${GAME_TARGET_STAGES.map((stage) => `<option value="${stage}" ${stage === initialStage ? "selected" : ""}>${stage === "all" ? "الجميع" : stage}</option>`).join("")}</select></label><label class="field">الصف<select id="gameTargetGrade" required>${gameTargetGradeOptions(initialStage, initialGrade)}</select></label></div>
          <label class="field">نطاق النشر<select id="gameTargetClass" required>${gameAudienceOptions}</select></label>
          <label class="field">الترم<select id="gameSemester" required ${publicationDisabled}><option value="" ${initialSemester ? "" : "selected"} disabled>اختاري الترم</option><option value="first" ${initialSemester === "first" ? "selected" : ""}>الترم الأول</option><option value="second" ${initialSemester === "second" ? "selected" : ""}>الترم الثاني</option></select></label>
          <label class="check-row"><input id="gameCertificatePortfolio" type="checkbox" ${!game.exists || game.certificatePortfolioEnabled ? "checked" : ""}> السماح بإرسال الشهادة إلى ملف الإنجاز</label>
          <div class="modal-actions"><button class="btn btn-outline" type="button" id="cancelGameConfig">إلغاء</button><button class="btn ${gameIsPublished(game) ? "btn-outline" : "btn-secondary"}" type="button" id="publishGameConfig" ${publicationDisabled}>${gameIsPublished(game) ? "إيقاف النشر" : "نشر اللعبة"}</button><button class="btn btn-primary" type="submit" id="saveGameConfig">حفظ الإعداد</button></div>
        </form>
      `, "game-config-modal");
      document.getElementById("cancelGameConfig").onclick = closeModal;
      document.getElementById("gameTargetStage").onchange = (event) => {
        document.getElementById("gameTargetGrade").innerHTML = gameTargetGradeOptions(event.target.value, "all");
        document.getElementById("gameTargetClass").value = event.target.value === "all" ? "all" : "scope";
      };
      document.getElementById("gameTargetGrade").onchange = () => { document.getElementById("gameTargetClass").value = "scope"; };
      document.getElementById("gameTargetClass").onchange = (event) => {
        if (event.target.value === "all") {
          document.getElementById("gameTargetStage").value = "all";
          document.getElementById("gameTargetGrade").innerHTML = gameTargetGradeOptions("all", "all");
          return;
        }
        const selectedClass = allClasses.find((item) => String(item.id) === event.target.value);
        if (!selectedClass) return;
        const stage = selectedClass.stage || selectedClass.level || "";
        const grade = selectedClass.grade_label || selectedClass.gradeLabel || "all";
        document.getElementById("gameTargetStage").value = stage;
        document.getElementById("gameTargetGrade").innerHTML = gameTargetGradeOptions(stage, grade);
      };
      const configForm = document.getElementById("gameConfigForm");
      const saveGameConfig = async (publish = false) => {
        if (!configForm.reportValidity()) return;
        const saveButton = document.getElementById("saveGameConfig");
        const publishButton = document.getElementById("publishGameConfig");
        saveButton.disabled = true;
        if (publishButton) publishButton.disabled = true;
        try {
          const audience = document.getElementById("gameTargetClass").value;
          const selectedClassId = /^\d+$/.test(audience) ? Number(audience) : null;
          const publishThroughAudienceRoute = publish && (audience === "all" || selectedClassId !== null);
          await api(`/interactive-games/${encodeURIComponent(game.gameKey)}`, { method: "PUT", body: JSON.stringify({
            ...(game.nameEditable === false ? {} : { name: document.getElementById("gameName").value.trim() }),
            lessonName: document.getElementById("gameLessonName").value.trim(),
            unitNumber: Number(document.getElementById("gameUnitNumber").value),
            lessonNumber: Number(document.getElementById("gameLessonNumber").value),
            stage: document.getElementById("gameTargetStage").value,
            gradeLabel: document.getElementById("gameTargetGrade").value,
            semester: document.getElementById("gameSemester").value,
            classId: selectedClassId,
            timeMode: game.timeMode === "timed" ? "timed" : "open",
            timePerQuestionSeconds: game.timePerQuestionSeconds,
            certificatePortfolioEnabled: document.getElementById("gameCertificatePortfolio").checked,
            isActive: publishThroughAudienceRoute ? false : (publish ? true : gameIsPublished(game)),
          }) });
          if (publishThroughAudienceRoute) {
            await api(`/interactive-games/${encodeURIComponent(game.gameKey)}/publication`, { method: "PUT", body: JSON.stringify({
              isActive: true,
              semester: document.getElementById("gameSemester").value,
              publishAll: audience === "all",
              classId: selectedClassId,
            }) });
          }
          closeModal();
          toast(publish ? "تم حفظ الإعداد ونشر اللعبة." : "تم حفظ بيانات اللعبة الفعلية.");
          await refreshGames();
        } catch (error) {
          document.getElementById("gameConfigMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
          saveButton.disabled = false;
          if (publishButton && publicationReady) publishButton.disabled = false;
        }
      };
      configForm.onsubmit = (event) => {
        event.preventDefault();
        saveGameConfig(false);
      };
      const publishButton = document.getElementById("publishGameConfig");
      if (publishButton) publishButton.onclick = async () => {
        if (!gameIsPublished(game)) {
          saveGameConfig(true);
          return;
        }
        publishButton.disabled = true;
        try {
          await api(`/interactive-games/${encodeURIComponent(game.gameKey)}/publication`, { method: "PUT", body: JSON.stringify({ isActive: false }) });
          closeModal();
          toast("تم إيقاف نشر اللعبة.");
          await refreshGames();
        } catch (error) {
          document.getElementById("gameConfigMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
          publishButton.disabled = false;
        }
      };
    }; });
    return;
  }
  const academicKind = {
    competitions: "competitions",
    "flipped-classroom": "strategies",
    videos: "library",
    training: "library",
    worksheets: "library",
  }[key];
  const selector = academicKind ? academicSelectorHtml(academicKind) : "";
  target.innerHTML = `
    ${selector}
    <div class="card educational-ready-card">
      <div class="empty-state"><div class="ic" aria-hidden="true">${section.icon}</div><h3>قسم ${escapeHtml(section.title)} جاهز</h3><p>${escapeHtml(section.hint)}</p></div>
    </div>`;
  if (academicKind) {
    const rerender = academicKind === "competitions" ? renderGamesPanel
      : academicKind === "strategies" ? renderStrategiesPanel
      : renderLibraryPanel;
    bindAcademicSelector(academicKind, rerender);
  }
}

function interactiveGameSkillChecks(selected = [], stage = "all", grade = "all") {
  const chosen = new Set((selected || []).map(Number));
  const skills = allSkills.filter((skill) => (stage === "all" || skill.stage === stage)
    && (grade === "all" || normalizeGradeKey(stage, skill.grade_label) === normalizeGradeKey(stage, grade)));
  return skills.length ? skills.map((skill) => `<label class="game-builder-skill"><input type="checkbox" name="builderSkill" value="${skill.id}" ${chosen.has(Number(skill.id)) ? "checked" : ""}><span>${escapeHtml(skill.name)}</span></label>`).join("") : '<p class="game-builder-no-skills">لا توجد مهارات مطابقة للمرحلة والصف المحددين.</p>';
}

function interactiveGameQuestionSeed(type) {
  if (type === "matching") return { type, prompt: "", options: [{ left: "", right: "" }, { left: "", right: "" }], correctAnswer: [], explanation: "", points: 1, difficulty: "medium" };
  if (type === "ordering") return { type, prompt: "", options: ["", ""], correctAnswer: [], explanation: "", points: 1, difficulty: "medium" };
  return { type, prompt: "", options: type === "true_false" ? ["صح", "خطأ"] : ["", ""], correctAnswer: type === "true_false" ? true : 0, explanation: "", points: 1, difficulty: "medium" };
}

async function openInteractiveTemplateEditor(gameId = null) {
  let game = null;
  if (gameId) {
    try { game = (await api(`/interactive-games/builder/library/${gameId}`)).game; }
    catch (error) { toast(error.message); return; }
  }
  let templateType = game?.templateType || "multiple_choice";
  let questions = Array.isArray(game?.questions) && game.questions.length ? game.questions.map((item) => ({ ...item, options: structuredClone(item.options || []) })) : [interactiveGameQuestionSeed(templateType)];
  const selectedSkills = game?.skillIds || [];
  const initialStage = game?.stage || "all";
  const initialGrade = game?.gradeLabel || "all";
  openModal(`
    <form class="game-builder-form" id="interactiveTemplateForm">
      <div class="game-builder-modal-head"><div><span>${game ? "إصدار جديد" : "لعبة جديدة"}</span><h3>${game ? `تعديل ${escapeHtml(game.name)}` : "إنشاء لعبة من قالب"}</h3><p>كل حفظ بعد الإنشاء ينتج إصدارًا جديدًا، وتبقى النتائج القديمة مرتبطة بإصدارها.</p></div><button class="btn btn-outline btn-sm" type="button" id="cancelInteractiveTemplate">إغلاق</button></div>
      <div id="interactiveTemplateMessage"></div>
      <section class="game-builder-form-section"><h4>نوع القالب وبيانات اللعبة</h4><div class="game-template-types">${[
        ["multiple_choice", "اختيار من متعدد"], ["true_false", "صح أو خطأ"], ["matching", "المطابقة والتوصيل"], ["ordering", "ترتيب الخطوات"],
      ].map(([value, label]) => `<label><input type="radio" name="interactiveTemplateType" value="${value}" ${templateType === value ? "checked" : ""} ${game ? "disabled" : ""}><span>${label}</span></label>`).join("")}</div>
      <div class="form-grid two"><label class="field">اسم اللعبة<input id="builderGameName" maxlength="190" value="${escapeHtml(game?.name || "")}" required></label><label class="field">معرّف اللعبة بالإنجليزية<input id="builderGameKey" dir="ltr" pattern="[a-z0-9][a-z0-9-]{1,99}" value="${escapeHtml(game?.gameKey || "")}" ${game ? "readonly" : ""} required placeholder="fractions-challenge"></label></div><label class="field">الوصف<textarea id="builderGameDescription" maxlength="2000">${escapeHtml(game?.description || "")}</textarea></label></section>
      <section class="game-builder-form-section"><h4>الربط الدراسي</h4><div class="form-grid three"><label class="field">المرحلة<select id="builderGameStage">${GAME_TARGET_STAGES.map((stage) => `<option value="${stage}" ${stage === initialStage ? "selected" : ""}>${stage === "all" ? "الجميع" : stage}</option>`).join("")}</select></label><label class="field">الصف<select id="builderGameGrade">${gameTargetGradeOptions(initialStage, initialGrade)}</select></label><label class="field">الفصل الدراسي<select id="builderGameSemester"><option value="first" ${(game?.semester || schoolSettings?.currentSemester) !== "second" ? "selected" : ""}>الترم الأول</option><option value="second" ${(game?.semester || schoolSettings?.currentSemester) === "second" ? "selected" : ""}>الترم الثاني</option></select></label><label class="field">المادة<input id="builderGameSubject" maxlength="190" value="${escapeHtml(game?.subjectName || schoolSettings?.subjectName || "")}" required></label><label class="field">رقم الوحدة<input id="builderGameUnit" type="number" min="1" max="999" value="${game?.unitNumber || ""}" required></label><label class="field">رقم الدرس<input id="builderGameLesson" type="number" min="1" max="999" value="${game?.lessonNumber || ""}" required></label><label class="field full-span">اسم الدرس<input id="builderGameLessonName" maxlength="190" value="${escapeHtml(game?.lessonName || "")}" required></label></div><div><strong class="game-builder-field-title">المهارات</strong><div class="game-builder-skills" id="builderGameSkills">${interactiveGameSkillChecks(selectedSkills, initialStage, initialGrade)}</div></div></section>
      <section class="game-builder-form-section"><h4>إعداد الجولة</h4><div class="form-grid three"><label class="field">عدد الأسئلة في الجولة<input id="builderGameQuestionCount" type="number" min="1" max="200" value="${game?.questionCount || 10}" required></label><label class="field">الوقت<select id="builderGameTimeMode"><option value="open" ${game?.timeMode !== "timed" ? "selected" : ""}>وقت مفتوح</option><option value="timed" ${game?.timeMode === "timed" ? "selected" : ""}>مؤقت لكل سؤال</option></select></label><label class="field" id="builderTimeSecondsField" ${game?.timeMode === "timed" ? "" : "hidden"}>ثواني السؤال<input id="builderGameTimeSeconds" type="number" min="1" max="600" value="${game?.timePerQuestionSeconds || 30}"></label></div><div class="game-builder-check-row"><span>المستويات:</span>${[["easy", "بسيط"], ["medium", "متوسط"], ["hard", "متقدم"]].map(([value, label]) => `<label><input name="builderDifficulty" type="checkbox" value="${value}" ${(game?.difficulties || ["easy", "medium", "hard"]).includes(value) ? "checked" : ""}> ${label}</label>`).join("")}</div><div class="game-builder-check-row"><label><input id="builderGameCertificate" type="checkbox" ${game?.certificateEnabled === false ? "" : "checked"}> السماح بشهادة الإتقان</label><label><input id="builderGamePoints" type="checkbox" ${game?.pointsEnabled ? "checked" : ""}> إضافة نقاط عند الإكمال</label><label id="builderPointsValueField" ${game?.pointsEnabled ? "" : "hidden"}>عدد النقاط <input id="builderGamePointsValue" type="number" min="1" max="1000" value="${game?.pointsValue || 1}"></label></div><label class="field">صورة الغلاف — اختيارية<input id="builderGameCover" type="file" accept="image/png,image/jpeg,image/webp"></label></section>
      <section class="game-builder-form-section"><div class="game-builder-questions-head"><div><h4>أسئلة اللعبة</h4><p>يمكن تعديل الأسئلة وحذفها وترتيبها. لا تُحفظ أي إجابة وهمية.</p></div><button class="btn btn-secondary btn-sm" id="addBuilderQuestion" type="button">إضافة سؤال</button></div><div id="builderQuestions"></div></section>
      <section class="game-builder-inline-preview" id="interactiveTemplatePreview" hidden></section>
      <div class="modal-actions"><button class="btn btn-outline" type="button" id="cancelInteractiveTemplateBottom">إلغاء</button><button class="btn btn-secondary" type="button" id="previewInteractiveTemplate">معاينة قبل الحفظ</button><button class="btn btn-primary" type="submit" id="saveInteractiveTemplate">${game ? "حفظ إصدار جديد" : "حفظ كمسودة"}</button></div>
    </form>`, "game-builder-modal");
  const renderQuestions = () => {
    const root = document.getElementById("builderQuestions");
    root.innerHTML = questions.map((question, index) => {
      let answers = "";
      if (templateType === "multiple_choice") answers = `<div class="game-builder-options">${question.options.map((option, optionIndex) => `<label><input type="radio" name="builderCorrect${index}" value="${optionIndex}" ${Number(question.correctAnswer) === optionIndex ? "checked" : ""}><input data-q-option="${index}" data-option-index="${optionIndex}" value="${escapeHtml(option)}" required placeholder="الخيار ${optionIndex + 1}"><button type="button" data-remove-option="${index}" data-option-index="${optionIndex}" ${question.options.length <= 2 ? "disabled" : ""}>×</button></label>`).join("")}</div><button class="btn btn-outline btn-sm" type="button" data-add-option="${index}" ${question.options.length >= 8 ? "disabled" : ""}>إضافة خيار</button>`;
      else if (templateType === "true_false") answers = `<label class="field">الإجابة الصحيحة<select data-q-correct-bool="${index}"><option value="true" ${question.correctAnswer !== false ? "selected" : ""}>صح</option><option value="false" ${question.correctAnswer === false ? "selected" : ""}>خطأ</option></select></label>`;
      else if (templateType === "matching") answers = `<div class="game-builder-pairs">${question.options.map((pair, pairIndex) => `<div><input data-pair-left="${index}" data-option-index="${pairIndex}" value="${escapeHtml(pair.left || "")}" required placeholder="الطرف الأول"><span>↔</span><input data-pair-right="${index}" data-option-index="${pairIndex}" value="${escapeHtml(pair.right || "")}" required placeholder="المطابقة الصحيحة"><button type="button" data-remove-option="${index}" data-option-index="${pairIndex}" ${question.options.length <= 2 ? "disabled" : ""}>×</button></div>`).join("")}</div><button class="btn btn-outline btn-sm" type="button" data-add-option="${index}" ${question.options.length >= 12 ? "disabled" : ""}>إضافة زوج</button>`;
      else answers = `<div class="game-builder-steps">${question.options.map((step, stepIndex) => `<label><strong>${stepIndex + 1}</strong><input data-q-option="${index}" data-option-index="${stepIndex}" value="${escapeHtml(step)}" required placeholder="الخطوة الصحيحة"><button type="button" data-remove-option="${index}" data-option-index="${stepIndex}" ${question.options.length <= 2 ? "disabled" : ""}>×</button></label>`).join("")}</div><button class="btn btn-outline btn-sm" type="button" data-add-option="${index}" ${question.options.length >= 12 ? "disabled" : ""}>إضافة خطوة</button>`;
      return `<article class="game-builder-question"><header><strong>السؤال ${index + 1}</strong><div><button type="button" data-move-question="${index}" data-direction="up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move-question="${index}" data-direction="down" ${index === questions.length - 1 ? "disabled" : ""}>↓</button><button type="button" data-delete-question="${index}" ${questions.length === 1 ? "disabled" : ""}>حذف</button></div></header><label class="field">نص السؤال<textarea data-q-field="prompt" data-q-index="${index}" required>${escapeHtml(question.prompt || "")}</textarea></label>${answers}<div class="form-grid three"><label class="field">شرح الإجابة<input data-q-field="explanation" data-q-index="${index}" value="${escapeHtml(question.explanation || "")}"></label><label class="field">درجة السؤال<input data-q-field="points" data-q-index="${index}" type="number" min="1" max="1000" value="${question.points || 1}" required></label><label class="field">المستوى<select data-q-field="difficulty" data-q-index="${index}">${[["easy", "بسيط"], ["medium", "متوسط"], ["hard", "متقدم"]].map(([value, label]) => `<option value="${value}" ${question.difficulty === value ? "selected" : ""}>${label}</option>`).join("")}</select></label></div></article>`;
    }).join("");
    root.querySelectorAll("[data-q-field]").forEach((input) => input.oninput = () => { const value = input.dataset.qField === "points" ? Number(input.value) : input.value; questions[Number(input.dataset.qIndex)][input.dataset.qField] = value; });
    root.querySelectorAll("[data-q-option]").forEach((input) => input.oninput = () => { questions[Number(input.dataset.qOption)].options[Number(input.dataset.optionIndex)] = input.value; });
    root.querySelectorAll("[data-pair-left]").forEach((input) => input.oninput = () => { questions[Number(input.dataset.pairLeft)].options[Number(input.dataset.optionIndex)].left = input.value; });
    root.querySelectorAll("[data-pair-right]").forEach((input) => input.oninput = () => { questions[Number(input.dataset.pairRight)].options[Number(input.dataset.optionIndex)].right = input.value; });
    root.querySelectorAll("[name^=builderCorrect]").forEach((input) => input.onchange = () => { questions[Number(input.name.replace("builderCorrect", ""))].correctAnswer = Number(input.value); });
    root.querySelectorAll("[data-q-correct-bool]").forEach((input) => input.onchange = () => { questions[Number(input.dataset.qCorrectBool)].correctAnswer = input.value === "true"; });
    root.querySelectorAll("[data-add-option]").forEach((button) => button.onclick = () => { const item = questions[Number(button.dataset.addOption)]; item.options.push(templateType === "matching" ? { left: "", right: "" } : ""); renderQuestions(); });
    root.querySelectorAll("[data-remove-option]").forEach((button) => button.onclick = () => { const item = questions[Number(button.dataset.removeOption)]; const removed = Number(button.dataset.optionIndex); item.options.splice(removed, 1); if (templateType === "multiple_choice") item.correctAnswer = Math.min(Number(item.correctAnswer) || 0, item.options.length - 1); renderQuestions(); });
    root.querySelectorAll("[data-delete-question]").forEach((button) => button.onclick = () => { questions.splice(Number(button.dataset.deleteQuestion), 1); renderQuestions(); });
    root.querySelectorAll("[data-move-question]").forEach((button) => button.onclick = () => { const index = Number(button.dataset.moveQuestion); const target = button.dataset.direction === "up" ? index - 1 : index + 1; [questions[index], questions[target]] = [questions[target], questions[index]]; renderQuestions(); });
  };
  renderQuestions();
  document.getElementById("addBuilderQuestion").onclick = () => { questions.push(interactiveGameQuestionSeed(templateType)); renderQuestions(); };
  document.querySelectorAll("[name=interactiveTemplateType]").forEach((input) => input.onchange = () => { templateType = input.value; questions = [interactiveGameQuestionSeed(templateType)]; renderQuestions(); });
  const updateSkills = () => { document.getElementById("builderGameSkills").innerHTML = interactiveGameSkillChecks([], document.getElementById("builderGameStage").value, document.getElementById("builderGameGrade").value); };
  document.getElementById("builderGameStage").onchange = (event) => { document.getElementById("builderGameGrade").innerHTML = gameTargetGradeOptions(event.target.value, "all"); updateSkills(); };
  document.getElementById("builderGameGrade").onchange = updateSkills;
  document.getElementById("builderGameTimeMode").onchange = (event) => { document.getElementById("builderTimeSecondsField").hidden = event.target.value !== "timed"; };
  document.getElementById("builderGamePoints").onchange = (event) => { document.getElementById("builderPointsValueField").hidden = !event.target.checked; };
  document.getElementById("cancelInteractiveTemplate").onclick = closeModal;
  document.getElementById("cancelInteractiveTemplateBottom").onclick = closeModal;
  document.getElementById("previewInteractiveTemplate").onclick = () => {
    const preview = document.getElementById("interactiveTemplatePreview");
    const optionLines = (question) => templateType === "matching"
      ? question.options.map((pair) => `${pair.left || "—"} ↔ ${pair.right || "—"}`)
      : templateType === "true_false" ? ["صح", "خطأ"] : question.options;
    preview.innerHTML = `<div class="game-builder-preview-head"><span>معاينة غير محفوظة</span><h4>${escapeHtml(document.getElementById("builderGameName").value.trim() || "اسم اللعبة")}</h4><p>${escapeHtml(document.getElementById("builderGameLessonName").value.trim() || "اسم الدرس غير مكتمل")}</p></div><div class="game-builder-preview-list">${questions.map((question, index) => `<article><small>السؤال ${index + 1} · ${question.difficulty === "easy" ? "بسيط" : question.difficulty === "hard" ? "متقدم" : "متوسط"}</small><strong>${escapeHtml(question.prompt || "نص السؤال غير مكتمل")}</strong><div>${optionLines(question).map((option, optionIndex) => `<span>${optionIndex + 1}. ${escapeHtml(String(option || "—"))}</span>`).join("")}</div></article>`).join("")}</div>`;
    preview.hidden = false;
    preview.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  document.getElementById("interactiveTemplateForm").onsubmit = async (event) => {
    event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
    const saveButton = document.getElementById("saveInteractiveTemplate"); saveButton.disabled = true;
    const payload = {
      gameKey: document.getElementById("builderGameKey").value.trim(), name: document.getElementById("builderGameName").value.trim(), description: document.getElementById("builderGameDescription").value.trim(), templateType,
      stage: document.getElementById("builderGameStage").value, gradeLabel: document.getElementById("builderGameGrade").value, semester: document.getElementById("builderGameSemester").value,
      subjectName: document.getElementById("builderGameSubject").value.trim(), unitNumber: Number(document.getElementById("builderGameUnit").value), lessonNumber: Number(document.getElementById("builderGameLesson").value), lessonName: document.getElementById("builderGameLessonName").value.trim(),
      skillIds: [...document.querySelectorAll("[name=builderSkill]:checked")].map((input) => Number(input.value)), questionCount: Number(document.getElementById("builderGameQuestionCount").value), difficulties: [...document.querySelectorAll("[name=builderDifficulty]:checked")].map((input) => input.value),
      timeMode: document.getElementById("builderGameTimeMode").value, timePerQuestionSeconds: Number(document.getElementById("builderGameTimeSeconds").value), certificateEnabled: document.getElementById("builderGameCertificate").checked, pointsEnabled: document.getElementById("builderGamePoints").checked, pointsValue: Number(document.getElementById("builderGamePointsValue").value), questions,
    };
    try {
      const response = await api(game ? `/interactive-games/builder/library/${game.id}` : "/interactive-games/builder/create", { method: game ? "PUT" : "POST", body: JSON.stringify(payload) });
      const cover = document.getElementById("builderGameCover").files[0];
      let coverWarning = "";
      if (cover) { const data = new FormData(); data.append("cover", cover); try { await api(`/interactive-games/builder/library/${response.game.id}/cover`, { method: "POST", body: data }); } catch (error) { coverWarning = ` تم حفظ اللعبة، لكن تعذّر حفظ الغلاف: ${error.message}`; } }
      closeModal(); toast((game ? "تم حفظ إصدار جديد مع بقاء النتائج السابقة." : "تم حفظ اللعبة كمسودة.") + coverWarning); await loadInteractiveGames(); renderGamesPanel();
    } catch (error) { document.getElementById("interactiveTemplateMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; saveButton.disabled = false; }
  };
}

async function openInteractivePackageImporter(updateGameId = null) {
  let game = null;
  if (updateGameId) { try { game = (await api(`/interactive-games/builder/library/${updateGameId}`)).game; } catch (error) { toast(error.message); return; } }
  const stage = game?.stage || "all", grade = game?.gradeLabel || "all";
  openModal(`<form class="game-builder-form" id="interactivePackageForm"><div class="game-builder-modal-head"><div><span>حزمة مبرمجة</span><h3>${game ? `رفع إصدار جديد لـ ${escapeHtml(game.name)}` : "استيراد لعبة مبرمجة ZIP"}</h3><p>يُكتشف ملف التشغيل وتُضاف واجهة مدار ووضع التوافق المعزول تلقائيًا. ملف game.json اختياري.</p></div><button class="btn btn-outline btn-sm" type="button" id="cancelPackageImport">إغلاق</button></div><div id="interactivePackageMessage"></div><section class="game-builder-form-section"><label class="game-package-drop">ملف ZIP<input id="packageZip" type="file" accept=".zip,application/zip" required><span>اختاري حزمة اللعبة — الحد الأقصى 20 MB</span></label><p class="safe-note">تعمل JavaScript والتخزين المؤقت والتنقل المحلي داخل صندوق أمان. تُرفض PHP والملفات التنفيذية والاتصالات الخارجية والمسارات الضارة.</p></section><section class="game-builder-form-section"><h4>بيانات اللعبة الدراسية</h4><div class="form-grid two"><label class="field">اسم اللعبة<input id="packageGameName" maxlength="190" value="${escapeHtml(game?.name || "")}" placeholder="يُكتشف من game.json أو عنوان صفحة اللعبة إذا تُرك فارغًا"></label><label class="field">المادة<input id="packageSubject" maxlength="190" value="${escapeHtml(game?.subjectName || schoolSettings?.subjectName || "")}" required></label></div><label class="field">الوصف<textarea id="packageDescription" maxlength="2000">${escapeHtml(game?.description || "")}</textarea></label><div class="form-grid three"><label class="field">المرحلة<select id="packageStage">${GAME_TARGET_STAGES.map((item) => `<option value="${item}" ${item === stage ? "selected" : ""}>${item === "all" ? "الجميع" : item}</option>`).join("")}</select></label><label class="field">الصف<select id="packageGrade">${gameTargetGradeOptions(stage, grade)}</select></label><label class="field">الفصل الدراسي<select id="packageSemester"><option value="first" ${(game?.semester || schoolSettings?.currentSemester) !== "second" ? "selected" : ""}>الترم الأول</option><option value="second" ${(game?.semester || schoolSettings?.currentSemester) === "second" ? "selected" : ""}>الترم الثاني</option></select></label><label class="field">رقم الوحدة<input id="packageUnit" type="number" min="1" max="999" value="${game?.unitNumber || ""}" required></label><label class="field">رقم الدرس<input id="packageLesson" type="number" min="1" max="999" value="${game?.lessonNumber || ""}" required></label><label class="field">اسم الدرس<input id="packageLessonName" maxlength="190" value="${escapeHtml(game?.lessonName || "")}" required></label></div><div class="game-builder-skills" id="packageSkills">${interactiveGameSkillChecks(game?.skillIds || [], stage, grade)}</div></section><section class="game-builder-form-section"><h4>إعداد الجولة</h4><div class="form-grid three"><label class="field">عدد الأسئلة<input id="packageQuestionCount" type="number" min="1" max="200" value="${game?.questionCount || 10}" required></label><label class="field">الوقت<select id="packageTimeMode"><option value="open" ${game?.timeMode !== "timed" ? "selected" : ""}>وقت مفتوح</option><option value="timed" ${game?.timeMode === "timed" ? "selected" : ""}>مؤقت</option></select></label><label class="field" id="packageSecondsField" ${game?.timeMode === "timed" ? "" : "hidden"}>ثواني السؤال<input id="packageSeconds" type="number" min="1" max="600" value="${game?.timePerQuestionSeconds || 30}"></label></div><div class="game-builder-check-row"><span>المستويات:</span>${[["easy", "بسيط"], ["medium", "متوسط"], ["hard", "متقدم"]].map(([value, label]) => `<label><input name="packageDifficulty" type="checkbox" value="${value}" ${(game?.difficulties || ["easy", "medium", "hard"]).includes(value) ? "checked" : ""}> ${label}</label>`).join("")}</div><div class="game-builder-check-row"><label><input id="packageCertificate" type="checkbox" ${game?.certificateEnabled === false ? "" : "checked"}> السماح بالشهادة</label><label><input id="packagePoints" type="checkbox" ${game?.pointsEnabled ? "checked" : ""}> إضافة نقاط</label><label id="packagePointsField" ${game?.pointsEnabled ? "" : "hidden"}>النقاط <input id="packagePointsValue" type="number" min="1" max="1000" value="${game?.pointsValue || 1}"></label></div><label class="field">صورة الغلاف — اختيارية<input id="packageCover" type="file" accept="image/png,image/jpeg,image/webp"></label></section><div class="modal-actions"><button class="btn btn-outline" type="button" id="cancelPackageImportBottom">إلغاء</button><button class="btn btn-primary" type="submit" id="runPackageImport">فحص واستيراد ZIP</button></div></form>`, "game-builder-modal");
  const refreshSkills = () => { document.getElementById("packageSkills").innerHTML = interactiveGameSkillChecks([], document.getElementById("packageStage").value, document.getElementById("packageGrade").value); };
  document.getElementById("packageStage").onchange = (event) => { document.getElementById("packageGrade").innerHTML = gameTargetGradeOptions(event.target.value, "all"); refreshSkills(); };
  document.getElementById("packageGrade").onchange = refreshSkills;
  document.getElementById("packageTimeMode").onchange = (event) => { document.getElementById("packageSecondsField").hidden = event.target.value !== "timed"; };
  document.getElementById("packagePoints").onchange = (event) => { document.getElementById("packagePointsField").hidden = !event.target.checked; };
  document.getElementById("cancelPackageImport").onclick = closeModal; document.getElementById("cancelPackageImportBottom").onclick = closeModal;
  document.getElementById("interactivePackageForm").onsubmit = async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const button = document.getElementById("runPackageImport"); button.disabled = true; button.textContent = "جارٍ الفحص الأمني…";
    const data = new FormData(); data.append("package", document.getElementById("packageZip").files[0]); if (updateGameId) data.append("updateGameId", String(updateGameId));
    const fields = { name: "packageGameName", description: "packageDescription", subjectName: "packageSubject", stage: "packageStage", gradeLabel: "packageGrade", semester: "packageSemester", unitNumber: "packageUnit", lessonNumber: "packageLesson", lessonName: "packageLessonName", questionCount: "packageQuestionCount", timeMode: "packageTimeMode", timePerQuestionSeconds: "packageSeconds", pointsValue: "packagePointsValue" };
    Object.entries(fields).forEach(([key, id]) => data.append(key, document.getElementById(id).value)); data.append("certificateEnabled", String(document.getElementById("packageCertificate").checked)); data.append("pointsEnabled", String(document.getElementById("packagePoints").checked));
    document.querySelectorAll("[name=packageDifficulty]:checked").forEach((input) => data.append("difficulties[]", input.value)); document.querySelectorAll("#packageSkills [name=builderSkill]:checked").forEach((input) => data.append("skillIds[]", input.value));
    try { const response = await api("/interactive-games/builder/import", { method: "POST", body: data }); const cover = document.getElementById("packageCover").files[0]; let coverWarning = ""; if (cover) { const coverData = new FormData(); coverData.append("cover", cover); try { await api(`/interactive-games/builder/library/${response.game.id}/cover`, { method: "POST", body: coverData }); } catch (error) { coverWarning = ` تم حفظ الحزمة، لكن تعذّر حفظ الغلاف: ${error.message}`; } } closeModal(); const detectedMessage = response.autoDetected ? " تم اكتشاف ملف التشغيل وبيانات الحزمة تلقائيًا." : ""; const repairedMessage = Number(response.repairedAssets || 0) > 0 ? ` تم تصحيح ${Number(response.repairedAssets)} مسار ملف داخل اللعبة.` : ""; const setupMessage = response.needsSetup ? `تم الاستيراد، لكن يلزم تصحيح الحزمة قبل النشر: ${response.message || "ملفات التشغيل غير مكتملة."}` : "تم فحص الحزمة واستيرادها كمسودة."; toast(setupMessage + detectedMessage + repairedMessage + coverWarning); await loadInteractiveGames(); renderGamesPanel(); }
    catch (error) { document.getElementById("interactivePackageMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; button.disabled = false; button.textContent = "فحص واستيراد ZIP"; }
  };
}

async function openInteractiveBuilderSettings(gameId) {
  let game;
  try { game = (await api(`/interactive-games/builder/library/${gameId}`)).game; }
  catch (error) { toast(error.message); return; }
  const publicationTargets = Array.isArray(game.publicationTargets) ? game.publicationTargets : [];
  const isPublished = game.status === "published" && publicationTargets.length > 0;
  const sameTargetScope = publicationTargets.length > 0 && publicationTargets.every((target) => target.stage === publicationTargets[0].stage && target.gradeLabel === publicationTargets[0].gradeLabel);
  let initialStage = GAME_TARGET_STAGES.includes(game.stage) ? game.stage : "all";
  let initialGrade = game.gradeLabel || "all";
  if (sameTargetScope) {
    initialStage = publicationTargets[0].stage;
    initialGrade = publicationTargets[0].gradeLabel;
  }
  const allowedGrades = initialStage === "all" ? [] : (ACADEMIC_GRADES[initialStage] || []);
  if (initialGrade !== "all" && !allowedGrades.includes(initialGrade)) initialGrade = "all";
  const publishedClassIds = new Set(publicationTargets.map((target) => Number(target.classId)));
  const scopeClasses = allClasses.filter((item) => {
    const stage = item.stage || item.level || "";
    const grade = item.grade_label || item.gradeLabel || "";
    return stage === initialStage && (initialGrade === "all" || normalizeGradeKey(stage, grade) === normalizeGradeKey(stage, initialGrade));
  });
  const publishesToAll = allClasses.length > 0 && allClasses.every((item) => publishedClassIds.has(Number(item.id)));
  const publishesToScope = sameTargetScope && scopeClasses.length > 0 && scopeClasses.every((item) => publishedClassIds.has(Number(item.id)));
  const initialAudience = publishesToAll ? "all"
    : publicationTargets.length === 1 ? String(publicationTargets[0].classId)
    : publishesToScope ? "scope"
    : publicationTargets.length ? "current"
    : initialStage === "all" ? "all" : "scope";
  const currentAudienceOption = initialAudience === "current" ? '<option value="current" selected>الفصول المنشورة حاليًا</option>' : "";
  const audienceOptions = `<option value="" disabled>اختاري نطاق النشر</option><option value="scope" ${initialAudience === "scope" ? "selected" : ""}>كل فصول المرحلة والصف المحددين</option><option value="all" ${initialAudience === "all" ? "selected" : ""}>جميع الطالبات — نشر عام</option>${currentAudienceOption}${allClasses.map((item) => `<option value="${item.id}" ${String(item.id) === initialAudience ? "selected" : ""}>${escapeHtml(item.stage || item.level || "")} · ${escapeHtml(item.grade_label || item.gradeLabel || "")} · ${escapeHtml(item.name || "")}</option>`).join("")}`;
  const initialSemester = publicationTargets[0]?.semester || game.semester || schoolSettings?.currentSemester || "first";
  openModal(`
    <form class="game-config-dialog" id="interactiveBuilderSettingsForm">
      <h3>إعداد بيانات اللعبة</h3>
      <p>أدخلي بيانات الدرس الفعلية وحددي نطاق النشر والترم المرتبط بهذه اللعبة.</p>
      <div id="interactiveBuilderSettingsMessage"></div>
      <label class="field">اسم اللعبة<input id="builderSettingsGameName" maxlength="190" value="${escapeHtml(game.name || "")}" required /></label>
      <label class="field">اسم الدرس<input id="builderSettingsLessonName" maxlength="190" value="${escapeHtml(game.lessonName || "")}" required /></label>
      <div class="form-grid two"><label class="field">رقم الوحدة<input id="builderSettingsUnitNumber" type="number" min="1" max="999" value="${game.unitNumber || ""}" required /></label><label class="field">رقم الدرس<input id="builderSettingsLessonNumber" type="number" min="1" max="999" value="${game.lessonNumber || ""}" required /></label></div>
      <div class="form-grid two"><label class="field">المرحلة<select id="builderSettingsStage" required>${GAME_TARGET_STAGES.map((stage) => `<option value="${stage}" ${stage === initialStage ? "selected" : ""}>${stage === "all" ? "الجميع" : stage}</option>`).join("")}</select></label><label class="field">الصف<select id="builderSettingsGrade" required>${gameTargetGradeOptions(initialStage, initialGrade)}</select></label></div>
      <label class="field">نطاق النشر<select id="builderSettingsAudience" required>${audienceOptions}</select></label>
      <div class="form-grid two"><label class="field">الترم<select id="builderSettingsSemester" required><option value="first" ${initialSemester !== "second" ? "selected" : ""}>الترم الأول</option><option value="second" ${initialSemester === "second" ? "selected" : ""}>الترم الثاني</option></select></label><label class="field">عدد النقاط لكل سؤال<input id="builderSettingsPointsPerQuestion" type="number" min="1" max="1000" step="1" inputmode="numeric" value="${Number(game.pointsPerQuestion) || 100}" required /></label></div>
      <label class="check-row"><input id="builderSettingsCertificate" type="checkbox" ${game.certificateEnabled ? "checked" : ""}> السماح بإرسال الشهادة إلى ملف الإنجاز</label>
      <div class="modal-actions"><button class="btn btn-outline" type="button" id="cancelInteractiveBuilderSettings">إلغاء</button><button class="btn ${isPublished ? "btn-outline" : "btn-secondary"}" type="button" id="publishInteractiveBuilderSettings">${isPublished ? "إيقاف النشر" : "نشر اللعبة"}</button><button class="btn btn-primary" type="submit" id="saveInteractiveBuilderSettings">حفظ الإعداد</button></div>
    </form>
  `, "game-config-modal");
  document.getElementById("cancelInteractiveBuilderSettings").onclick = closeModal;
  document.getElementById("builderSettingsStage").onchange = (event) => {
    document.getElementById("builderSettingsGrade").innerHTML = gameTargetGradeOptions(event.target.value, "all");
    document.getElementById("builderSettingsAudience").value = event.target.value === "all" ? "all" : "scope";
  };
  document.getElementById("builderSettingsGrade").onchange = () => { document.getElementById("builderSettingsAudience").value = "scope"; };
  document.getElementById("builderSettingsAudience").onchange = (event) => {
    if (event.target.value === "all") {
      document.getElementById("builderSettingsStage").value = "all";
      document.getElementById("builderSettingsGrade").innerHTML = gameTargetGradeOptions("all", "all");
      return;
    }
    const selectedClass = allClasses.find((item) => String(item.id) === event.target.value);
    if (!selectedClass) return;
    const stage = selectedClass.stage || selectedClass.level || "";
    const grade = selectedClass.grade_label || selectedClass.gradeLabel || "all";
    document.getElementById("builderSettingsStage").value = stage;
    document.getElementById("builderSettingsGrade").innerHTML = gameTargetGradeOptions(stage, grade);
  };
  const form = document.getElementById("interactiveBuilderSettingsForm");
  const selectedPublicationClasses = () => {
    const audience = document.getElementById("builderSettingsAudience").value;
    if (audience === "all") return allClasses.map((item) => Number(item.id));
    if (audience === "current") return publicationTargets.map((target) => Number(target.classId));
    if (/^\d+$/.test(audience)) return [Number(audience)];
    const stage = document.getElementById("builderSettingsStage").value;
    const grade = document.getElementById("builderSettingsGrade").value;
    return allClasses.filter((item) => {
      const itemStage = item.stage || item.level || "";
      const itemGrade = item.grade_label || item.gradeLabel || "";
      return itemStage === stage && (grade === "all" || normalizeGradeKey(itemStage, itemGrade) === normalizeGradeKey(stage, grade));
    }).map((item) => Number(item.id));
  };
  const saveSettings = async (publish = false) => {
    if (!form.reportValidity()) return;
    const saveButton = document.getElementById("saveInteractiveBuilderSettings");
    const publishButton = document.getElementById("publishInteractiveBuilderSettings");
    const syncPublication = publish || isPublished;
    const classIds = syncPublication ? selectedPublicationClasses() : [];
    if (syncPublication && !classIds.length) {
      document.getElementById("interactiveBuilderSettingsMessage").innerHTML = '<div class="form-error">لا توجد فصول مطابقة لنطاق النشر المختار.</div>';
      return;
    }
    saveButton.disabled = true;
    publishButton.disabled = true;
    try {
      await api(`/interactive-games/builder/library/${gameId}/settings`, { method: "POST", body: JSON.stringify({
        name: document.getElementById("builderSettingsGameName").value.trim(),
        lessonName: document.getElementById("builderSettingsLessonName").value.trim(),
        unitNumber: Number(document.getElementById("builderSettingsUnitNumber").value),
        lessonNumber: Number(document.getElementById("builderSettingsLessonNumber").value),
        stage: document.getElementById("builderSettingsStage").value,
        gradeLabel: document.getElementById("builderSettingsGrade").value,
        semester: document.getElementById("builderSettingsSemester").value,
        pointsPerQuestion: Number(document.getElementById("builderSettingsPointsPerQuestion").value),
        certificateEnabled: document.getElementById("builderSettingsCertificate").checked,
        syncPublication,
        classIds,
      }) });
      closeModal();
      toast(publish ? "تم حفظ الإعداد ونشر اللعبة." : "تم حفظ إعداد اللعبة في إصدار جديد.");
      await loadInteractiveGames();
      renderGamesPanel();
    } catch (error) {
      document.getElementById("interactiveBuilderSettingsMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
      saveButton.disabled = false;
      publishButton.disabled = false;
    }
  };
  form.onsubmit = (event) => { event.preventDefault(); saveSettings(false); };
  document.getElementById("publishInteractiveBuilderSettings").onclick = async () => {
    if (!isPublished) { saveSettings(true); return; }
    const button = document.getElementById("publishInteractiveBuilderSettings");
    button.disabled = true;
    try {
      await api(`/interactive-games/builder/library/${gameId}/status`, { method: "POST", body: JSON.stringify({ status: "disabled" }) });
      closeModal();
      toast("تم إيقاف نشر اللعبة.");
      await loadInteractiveGames();
      renderGamesPanel();
    } catch (error) {
      document.getElementById("interactiveBuilderSettingsMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
      button.disabled = false;
    }
  };
}

async function openInteractiveBuilderTimer(gameId) {
  let game;
  try { game = (await api(`/interactive-games/builder/library/${gameId}`)).game; }
  catch (error) { toast(error.message); return; }
  if (!game.lessonName || !game.unitNumber || !game.lessonNumber) {
    toast("أكملي إعداد بيانات اللعبة أولًا.");
    openInteractiveBuilderSettings(gameId);
    return;
  }
  const timerIsActive = game.timeMode === "timed";
  const currentSeconds = Number(game.timePerQuestionSeconds);
  openModal(`
    <form class="game-timer-dialog" id="interactiveBuilderTimerForm">
      <h3>${timerIsActive ? "تعديل المؤقت" : "تفعيل المؤقت"}</h3>
      <p>حددي وقت السؤال بالثواني. يُحفظ الإعداد في إصدار جديد مع إبقاء المحاولات السابقة.</p>
      <div id="interactiveBuilderTimerMessage"></div>
      <label class="field">وقت السؤال بالثواني<input id="interactiveBuilderTimerSeconds" type="number" min="15" max="120" inputmode="numeric" value="${Number.isInteger(currentSeconds) ? currentSeconds : ""}" required /></label>
      <div class="modal-actions">${timerIsActive ? '<button class="btn btn-outline" type="button" id="disableInteractiveBuilderTimer">إيقاف المؤقت</button>' : ""}<button class="btn btn-outline" type="button" id="cancelInteractiveBuilderTimer">إلغاء</button><button class="btn btn-primary" type="submit" id="saveInteractiveBuilderTimer">${timerIsActive ? "حفظ" : "تفعيل"}</button></div>
    </form>
  `, "game-timer-modal");
  document.getElementById("cancelInteractiveBuilderTimer").onclick = closeModal;
  const saveTimer = async (mode, seconds, button) => {
    button.disabled = true;
    try {
      await api(`/interactive-games/builder/library/${gameId}/settings`, { method: "POST", body: JSON.stringify({ timerOnly: true, timeMode: mode, timePerQuestionSeconds: seconds }) });
      closeModal();
      toast(mode === "timed" ? "تم تفعيل مؤقت اللعبة." : "تم إيقاف مؤقت اللعبة.");
      await loadInteractiveGames();
      renderGamesPanel();
    } catch (error) {
      document.getElementById("interactiveBuilderTimerMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
      button.disabled = false;
    }
  };
  const disableButton = document.getElementById("disableInteractiveBuilderTimer");
  if (disableButton) disableButton.onclick = () => saveTimer("open", null, disableButton);
  document.getElementById("interactiveBuilderTimerForm").onsubmit = (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    saveTimer("timed", Number(document.getElementById("interactiveBuilderTimerSeconds").value), document.getElementById("saveInteractiveBuilderTimer"));
  };
}

async function openInteractiveGamePublication(gameId) {
  let game; try { game = (await api(`/interactive-games/builder/library/${gameId}`)).game; } catch (error) { toast(error.message); return; }
  const selected = new Set((game.classIds || []).map(Number)); const matchingClasses = allClasses.filter((item) => game.stage === "all" || item.level === game.stage).filter((item) => game.gradeLabel === "all" || normalizeGradeKey(item.level, item.grade_label) === normalizeGradeKey(item.level, game.gradeLabel));
  openModal(`<form id="interactivePublicationForm"><h3>نشر ${escapeHtml(game.name)}</h3><p class="modal-note">اختاري فصلًا واحدًا أو أكثر. يتم التحقق من ملكية الفصول في الخادم.</p><div id="interactivePublicationMessage"></div><label class="field">الفصل الدراسي<select id="interactivePublicationSemester"><option value="first" ${game.semester !== "second" ? "selected" : ""}>الترم الأول</option><option value="second" ${game.semester === "second" ? "selected" : ""}>الترم الثاني</option></select></label><div class="game-publication-classes">${matchingClasses.map((item) => `<label><input type="checkbox" name="interactivePublicationClass" value="${item.id}" ${selected.has(Number(item.id)) ? "checked" : ""}><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.level)} · ${escapeHtml(item.grade_label)}</small></span></label>`).join("") || '<p>لا توجد فصول مطابقة لمرحلة وصف اللعبة.</p>'}</div><div class="modal-actions"><button class="btn btn-outline" type="button" id="cancelInteractivePublication">إلغاء</button><button class="btn btn-primary" type="submit" id="saveInteractivePublication">نشر اللعبة</button></div></form>`, "game-publication-modal");
  document.getElementById("cancelInteractivePublication").onclick = closeModal;
  document.getElementById("interactivePublicationForm").onsubmit = async (event) => { event.preventDefault(); const classIds = [...document.querySelectorAll("[name=interactivePublicationClass]:checked")].map((input) => Number(input.value)); if (!classIds.length) { document.getElementById("interactivePublicationMessage").innerHTML = '<div class="form-error">اختاري فصلًا واحدًا على الأقل.</div>'; return; } const button = document.getElementById("saveInteractivePublication"); button.disabled = true; try { await api(`/interactive-games/builder/library/${gameId}/publish`, { method: "POST", body: JSON.stringify({ semester: document.getElementById("interactivePublicationSemester").value, classIds }) }); closeModal(); toast("تم نشر اللعبة للفصول المحددة."); await loadInteractiveGames(); renderGamesPanel(); } catch (error) { document.getElementById("interactivePublicationMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; button.disabled = false; } };
}

async function openInteractiveGameCopy(gameId) {
  const source = interactiveGamesState.builderGames.find((item) => Number(item.id) === gameId); if (!source) return;
  openModal(`<form id="interactiveGameCopyForm"><h3>نسخ اللعبة</h3><p class="modal-note">تُنشأ لعبة جديدة كمسودة، وتبقى اللعبة الأصلية ونتائجها دون تغيير.</p><div id="interactiveGameCopyMessage"></div><label class="field">اسم النسخة<input id="interactiveCopyName" value="نسخة من ${escapeHtml(source.name)}" required></label><label class="field">معرّف جديد بالإنجليزية<input id="interactiveCopyKey" dir="ltr" pattern="[a-z0-9][a-z0-9-]{1,99}" value="${escapeHtml(source.gameKey)}-copy" required></label><div class="modal-actions"><button class="btn btn-outline" type="button" id="cancelInteractiveCopy">إلغاء</button><button class="btn btn-primary" type="submit">إنشاء النسخة</button></div></form>`);
  document.getElementById("cancelInteractiveCopy").onclick = closeModal; document.getElementById("interactiveGameCopyForm").onsubmit = async (event) => { event.preventDefault(); try { await api(`/interactive-games/builder/library/${gameId}/copy`, { method: "POST", body: JSON.stringify({ name: document.getElementById("interactiveCopyName").value.trim(), gameKey: document.getElementById("interactiveCopyKey").value.trim() }) }); closeModal(); toast("تم إنشاء نسخة جديدة كمسودة."); await loadInteractiveGames(); renderGamesPanel(); } catch (error) { document.getElementById("interactiveGameCopyMessage").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`; } };
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

async function openRemedialContentCreate(students) {
  const labels={worksheet:'أوراق العمل',training:'التدريبات',video:'الفيديوهات',game:'ألعاب تفاعلية',test:'اختبار'};
  openModal('<h3>توليد خطة علاجية</h3><p role="status">جارٍ تحميل المحتوى…</p>');
  let catalog;
  try { catalog=(await api('/enhancements/remedial/catalog')).items||[]; }
  catch(error){openModal(`<h3>تعذّر تحميل المحتوى</h3><p>${escapeHtml(error.message)}</p>`);return;}
  const selected=new Map();let category='worksheet';
  const requestKey=crypto.randomUUID();
  openModal(`<form id="remedialContentForm"><h3>توليد خطة علاجية</h3><p style="color:var(--muted)">اختاري طالبة ثم أضيفي المحتوى المناسب. تُرسل نسخ مستقلة إلى «خطتي العلاجية» في حسابها.</p><div class="form-grid"><label class="field">الطالبة<select name="studentId" required><option value="">اختاري الطالبة</option>${students.map(s=>`<option value="${Number(s.id)}">${escapeHtml(s.name)} — ${escapeHtml(s.class_name||'')}</option>`).join('')}</select></label><label class="field">عنوان الخطة<input name="title" required maxlength="190" value="خطة علاجية"></label><label class="field">موعد الإكمال (اختياري)<input name="dueDate" type="date"></label><label class="field full-span">تعليمات للطالبة<textarea name="activity" maxlength="1000" placeholder="مثال: شاهدي الفيديو ثم حلي ورقة العمل والاختبار."></textarea></label></div><div class="student-panel-tabs" style="flex-wrap:wrap">${Object.entries(labels).map(([key,label])=>`<button type="button" class="tab-btn ${key===category?'active':''}" data-remedial-category="${key}">${label}</button>`).join('')}</div><label class="field">بحث في المحتوى<input id="remedialContentSearch" type="search" placeholder="اسم المحتوى أو الصف"></label><div id="remedialContentChoices" style="max-height:280px;overflow:auto;border:1px solid #e6def1;border-radius:14px;padding:12px"></div><p id="remedialContentCount" aria-live="polite"></p><div id="remedialContentSelected" style="display:flex;gap:6px;flex-wrap:wrap"></div><p id="remedialContentError" role="alert" style="color:#a12447"></p><div class="modal-actions"><button type="button" class="btn btn-outline" id="cancelRemedialContent">إلغاء</button><button type="submit" class="btn btn-primary">نسخ المحتوى وإرسال الخطة</button></div></form>`);
  const form=document.getElementById('remedialContentForm');
  const count=()=>{
    document.getElementById('remedialContentCount').textContent=`المحتوى المختار: ${selected.size} من ٢٠`;
    const target=document.getElementById('remedialContentSelected');
    target.innerHTML=[...selected.entries()].map(([key,item])=>`<button type="button" class="btn btn-outline btn-sm" data-remove-remedial="${key}" aria-label="إزالة ${escapeHtml(item.title)}">${escapeHtml(item.title)} ×</button>`).join('');
    target.querySelectorAll('[data-remove-remedial]').forEach(button=>button.onclick=()=>{selected.delete(button.dataset.removeRemedial);draw();});
  };
  const draw=()=>{
    const search=document.getElementById('remedialContentSearch').value.trim().toLocaleLowerCase();
    const items=catalog.filter(item=>item.category===category&&`${item.title} ${item.grade||''}`.toLocaleLowerCase().includes(search));
    const target=document.getElementById('remedialContentChoices');
    target.innerHTML=items.length?items.map(item=>{const key=`${item.kind}:${item.id}`;return `<label style="display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid #eee"><input type="checkbox" data-remedial-source="${key}" ${selected.has(key)?'checked':''}><span>${escapeHtml(item.title)}<small style="display:block;color:var(--muted)">${escapeHtml(item.grade||'')}</small></span></label>`;}).join(''):'<p>لا يوجد محتوى مطابق في هذا القسم. أضيفي المحتوى في قسمه أولًا.</p>';
    target.querySelectorAll('[data-remedial-source]').forEach(input=>input.onchange=()=>{
      const key=input.dataset.remedialSource;
      if(input.checked){if(selected.size>=20){input.checked=false;toast('الحد الأقصى ٢٠ محتوى لكل خطة.');return;}selected.set(key,catalog.find(item=>`${item.kind}:${item.id}`===key));}else selected.delete(key);
      count();
    });count();
  };
  form.querySelectorAll('[data-remedial-category]').forEach(button=>button.onclick=()=>{category=button.dataset.remedialCategory;form.querySelectorAll('[data-remedial-category]').forEach(b=>b.classList.toggle('active',b===button));draw();});
  document.getElementById('remedialContentSearch').oninput=draw;
  document.getElementById('cancelRemedialContent').onclick=closeModal;
  let sending=false;
  form.onsubmit=async event=>{
    event.preventDefault();if(sending)return;
    const message=document.getElementById('remedialContentError');
    if(!selected.size){message.textContent='اختاري محتوى واحدًا على الأقل.';return;}
    const data=new FormData(form);const body={studentId:Number(data.get('studentId')),title:data.get('title'),activity:data.get('activity'),dueDate:data.get('dueDate'),items:[...selected.values()].map(({kind,id})=>({kind,id})),requestKey};
    sending=true;const controls=[...form.querySelectorAll('input,textarea,select,button')];controls.forEach(input=>input.disabled=true);message.textContent='جارٍ نسخ المحتوى وإرسال الخطة…';
    try {await api('/enhancements/remedial/create-content',{method:'POST',body:JSON.stringify(body)});closeModal();toast('تم إرسال الخطة إلى الطالبة المحددة.');await renderRemedialPlans();}
    catch(error){message.textContent=error.message;controls.forEach(input=>input.disabled=false);}
    finally{sending=false;}
  };draw();
}

function remedialTeacherAttachments(plan) {
  const items=plan.attachments||[];
  if(!items.length)return '';
  return `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">${items.map(item=>{
    const id=Number(item.copy_id);const url=item.kind==='content'?`/planning/content-player.php?content=${id}&preview=1`:item.kind==='game'?`/games/game-player.php?game=${id}&preview=1`:null;
    return url?`<a class="btn btn-outline btn-sm" href="${url}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>`:`<span class="badge">اختبار: ${escapeHtml(item.title)}</span>`;
  }).join('')}</div>`;
}

function remedialFollowupRows(data) {
  const states={submitted:'مُسلّم',graded:'مصحّح',in_progress:'قيد الحل',completed:'مكتملة',abandoned:'لم تكتمل',pending:'بانتظار مراجعة المعلمة',approved:'مُعتمد',needs_revision:'يحتاج تعديلًا'};
  return (data.items||[]).map(item=>`<article style="border:1px solid #e4daf2;border-radius:14px;padding:14px;margin:12px 0"><h4>${escapeHtml(item.title)}</h4>${item.records.length?item.records.map(r=>{const finished=['submitted','graded','completed'].includes(r.status);return `<div style="padding:10px 0;border-top:1px solid #eee"><strong>${escapeHtml(states[r.status]||r.status)}</strong>${item.type==='html_game'?`<p>${escapeHtml(r.phase||'')} · نتيجة أبلغت بها اللعبة</p>`:''}${finished&&item.type!=='worksheet'?`<p>الدرجة: ${Number(r.score)}${r.total_points!=null?' / '+Number(r.total_points):''} · ${item.type==='game'?'الدقة':'النسبة'}: ${Number(r.percentage)}٪</p>`:''}${item.type==='worksheet'?`<p><a href="/api/teacher/student-files/${Number(r.id)}/file" target="_blank" rel="noopener">مشاهدة حل الطالبة</a></p><p>${escapeHtml(r.teacher_comment||'')}</p>`:''}<small>${escapeHtml(r.date||'')}</small></div>`}).join(''):`<p>${escapeHtml(item.message)}</p>`}</article>`).join('')||'<p>لا توجد مرفقات مرتبطة بهذه الخطة.</p>';
}
function openRemedialFollowup(plans) {
  openModal(`<h3>متابعة الخطط العلاجية</h3><p>تظهر النتائج المسجلة عند فتح المتابعة أو الضغط على تحديث النتائج. أوراق العمل تظهر كحلول مُرسلة للمراجعة.</p><label class="field">الطالبة والخطة<select id="followupPlan"><option value="">اختاري الخطة</option>${plans.filter(p=>p.status!=='cancelled').map(p=>`<option value="${Number(p.id)}">${escapeHtml(p.student_name)} — ${escapeHtml(p.title)}</option>`).join('')}</select></label><button class="btn btn-outline btn-sm" id="refreshFollowup">تحديث النتائج</button><div id="followupResults" role="status"></div>`);
  const select=document.getElementById('followupPlan'),target=document.getElementById('followupResults');let revision=0;
  const load=async()=>{const token=++revision;if(!select.value){target.textContent='اختاري خطة لعرض نتائجها.';return}target.textContent='جارٍ تحميل النتائج…';try{const data=await api('/enhancements/remedial/results?planId='+Number(select.value));if(token!==revision||!target.isConnected)return;target.innerHTML=remedialFollowupRows(data);}catch(error){if(token===revision)target.textContent=error.message||'تعذّر تحميل النتائج.'}};
  select.onchange=load;document.getElementById('refreshFollowup').onclick=load;
  if(select.options.length>1){select.selectedIndex=1;load()}else target.textContent='لا توجد خطط للمتابعة.';
}

async function renderRemedialPlans() {
  const [plansData, studentsData] = await Promise.all([api("/enhancements/remedial"), api("/students?pageSize=200"), loadSchoolSettings()]);
  const plans = (plansData.items || []).filter((plan) => academicItemMatches("remedialPlans", plan)).map((plan) => ({ ...plan, recommended_resource_url: safeResourceUrl(plan.recommended_resource_url) }));
  const students = (studentsData.items || []).filter((student) => academicItemMatches("remedialPlans", student));
  const active = plans.filter((p) => ["planned", "in_progress"].includes(p.status)).length;
  const reassessed = plans.filter((p) => p.status === "reassessed").length;
  const improved = plans.filter((p) => Number(p.after_percent || 0) > Number(p.before_percent || 0)).length;
  contentEl.innerHTML = `
    ${academicSelectorHtml("remedialPlans")}
    <div class="enhancement-grid">
      <article class="enhancement-card"><small>الخطط النشطة</small><strong>${active}</strong></article>
      <article class="enhancement-card"><small>أعيد قياسها</small><strong>${reassessed}</strong></article>
      <article class="enhancement-card"><small>تحسن بعد العلاج</small><strong>${improved}</strong></article>
      <article class="enhancement-card"><small>إجمالي الخطط</small><strong>${plans.length}</strong></article>
    </div>
    <section class="card smart-section">
      <div class="smart-section-head"><div><h3>الخطة العلاجية الذكية</h3><p style="color:var(--muted);margin:4px 0 0;font-size:.78rem">اختاري طالبة وأرسلي لها نسخًا من أوراق العمل والتدريبات والفيديوهات والألعاب والاختبارات.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="autoPlanButton">توليد خطة علاجية</button><button class="btn btn-outline btn-sm" id="remedialFollowupButton">متابعة الخطط العلاجية</button></div></div>
    </section>`;
  bindAcademicSelector("remedialPlans", renderRemedialPlans);
  document.getElementById("autoPlanButton").onclick = () => openRemedialContentCreate(students);
  document.getElementById("remedialFollowupButton").onclick = () => openRemedialFollowup(plans);
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

async function renderNotifications(target = contentEl) {
  const [data, resetData] = await Promise.all([api("/enhancements/alerts"), api("/enhancements/password-requests")]);
  const notifs = data.items || [];
  const resetRequests = resetData.items || [];
  target.innerHTML = `<section class="card"><div class="smart-section-head"><div><h3>مركز التنبيهات</h3><p style="margin:4px 0 0;color:var(--muted);font-size:.78rem">تنبيهات تلقائية عن الاختبارات والواجبات والطالبات وطلبات أولياء الأمور.</p></div><span class="badge badge-orange">${data.unread} غير مقروء</span></div>${notifs.length ? notifs.map((n) => `<article class="alert-card ${escapeHtml(n.severity || "info")}"><span style="font-size:1.35rem">${n.severity === "danger" ? "⚠️" : n.severity === "warning" ? "🔔" : "ℹ️"}</span><div><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.message || "")} · ${formatDate(n.created_at)}</p></div><div style="display:flex;gap:6px;flex-wrap:wrap">${n.route ? `<button class="btn btn-secondary btn-sm" data-alert-route="${escapeHtml(n.route)}">فتح</button>` : ""}${n.is_read ? "" : `<button class="btn btn-outline btn-sm" data-read="${n.id}">مقروء</button>`}<button class="btn btn-danger btn-sm" data-delnotif="${n.id}">حذف</button></div></article>`).join("") : '<div class="empty-state">لا توجد تنبيهات حاليًا.</div>'}</section><section class="card smart-section"><div class="smart-section-head"><div><h3>طلبات إعادة كلمة المرور</h3><p style="margin:4px 0 0;color:var(--muted);font-size:.78rem">طلبات طالباتك وأولياء أمورهن فقط.</p></div><span class="badge badge-orange">${resetRequests.length} طلب</span></div>${resetRequests.length?resetRequests.map(r=>`<article class="alert-card info"><span style="font-size:1.35rem">🔐</span><div><strong>${escapeHtml([r.first_name,r.last_name].filter(Boolean).join(" ")||r.identifier_hint||"طلب حساب")}</strong><p>${escapeHtml(r.requested_role)} · ${formatDate(r.created_at)}</p></div><div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" data-resolve-password-request="${r.id}">إعادة التعيين</button><button class="btn btn-outline btn-sm" data-reject-password-request="${r.id}">رفض</button></div></article>`).join(""):'<div class="empty-state">لا توجد طلبات معلقة.</div>'}</section>`;
  target.querySelectorAll("[data-alert-route]").forEach((b) => b.onclick = () => { const route = b.dataset.alertRoute; if (route.startsWith("student:")) openStudentProfile(Number(route.split(":")[1])); else navigate(route); });
  target.querySelectorAll("[data-read]").forEach((b) => b.onclick = async () => { await api(`/data/notifications/${b.dataset.read}/read`, { method: "PUT" }); renderActivityPanel("notifications"); refreshNotifBell(); });
  target.querySelectorAll("[data-delnotif]").forEach((b) => b.onclick = async () => { await api(`/data/notifications/${b.dataset.delnotif}`, { method: "DELETE" }); renderActivityPanel("notifications"); refreshNotifBell(); });
  target.querySelectorAll("[data-resolve-password-request]").forEach((b)=>b.onclick=()=>openTeacherPasswordRequest(Number(b.dataset.resolvePasswordRequest)));
  target.querySelectorAll("[data-reject-password-request]").forEach((b)=>b.onclick=()=>confirmAction("رفض طلب إعادة تعيين كلمة المرور؟",async()=>{await api(`/enhancements/password-requests/${b.dataset.rejectPasswordRequest}`,{method:"PUT",body:JSON.stringify({status:"rejected",note:"رفض بواسطة المعلمة"})});toast("تم رفض الطلب");renderActivityPanel("notifications");}));
}


function openTeacherPasswordRequest(id){
  openModal(`<h3>إعادة تعيين كلمة المرور</h3><p class="safe-note">لن تظهر كلمة المرور القديمة. ضعي كلمة مؤقتة وأخبري صاحبة الحساب بتغييرها بعد الدخول.</p><label class="field">كلمة المرور الجديدة<input id="teacherResetNewPassword" type="password" minlength="10" placeholder="10 أحرف على الأقل وحرف ورقم"></label><div class="modal-actions"><button class="btn btn-outline" id="cancelTeacherReset">إلغاء</button><button class="btn btn-primary" id="saveTeacherReset">حفظ</button></div>`);
  document.getElementById("cancelTeacherReset").onclick=closeModal;
  document.getElementById("saveTeacherReset").onclick=async()=>{try{await api(`/enhancements/password-requests/${id}`,{method:"PUT",body:JSON.stringify({status:"resolved",newPassword:document.getElementById("teacherResetNewPassword").value})});toast("تمت إعادة تعيين كلمة المرور");closeModal();renderActivityPanel("notifications");}catch(error){toast(error.message)}};
}

async function renderHelpCenter(target = contentEl) {
  const help = [
    ["🚀","ابدئي من هنا","أضيفي الفصول ثم الطالبات، أنشئي اختبارًا تشخيصيًا، وبعد النتائج افتحي التقارير والخطط العلاجية."],
    ["🎓","إدارة الطالبات","من قائمة الطالبات يمكنكِ البحث والتصفية وفتح الملف الموحد وإدارة الحضور والواجبات والنتائج."],
    ["📝","الاختبارات","أنشئي اختبارًا أو استوردي الأسئلة، حددي الفصل وموعد النشر، ثم تابعي المحاولات والتحليل."],
    ["🩺","الخطة العلاجية","اضغطي توليد خطة تلقائية لتحديد المهارات الأقل من ٧٠٪ واقتراح نشاط ثم إعادة القياس."],
    ["👪","ولي الأمر","اعتمدي طلبات الحساب، اربطي البنات، انشري في مجمع مدار وأرسلي ملاحظات خاصة عند الحاجة."],
    ["🔐","الأمان والخصوصية","لا تشاركي كلمات المرور، استخدمي التعطيل بدل الحذف، واحتفظي بنسخ احتياطية منتظمة."],
  ];
  target.innerHTML = `<section class="card"><div class="smart-section-head"><div><h3>مركز مساعدة مدار</h3><p style="margin:4px 0 0;color:var(--muted);font-size:.78rem">إرشادات مختصرة داخل النظام دون التأثير على بياناتك.</p></div><button class="btn btn-primary btn-sm" id="startGuide">جولة تعريفية</button></div><div class="help-grid">${help.map(([icon,title,text]) => `<article class="help-card"><span style="font-size:2rem">${icon}</span><h3>${title}</h3><p>${text}</p></article>`).join("")}</div></section><section class="card smart-section"><h3 class="section-title">خطوات العمل المقترحة</h3><ol class="help-steps"><li>إعداد بيانات المدرسة والعام الدراسي.</li><li>إضافة الفصول والطالبات وربط أولياء الأمور.</li><li>نشر اختبار تشخيصي.</li><li>مراجعة تحليل المهارات.</li><li>إنشاء خطة علاجية ومورد مناسب.</li><li>إعادة القياس وإرسال التقرير لولي الأمر.</li></ol><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><a class="btn btn-outline" href="/privacy.html" target="_blank">سياسة الخصوصية</a><a class="btn btn-outline" href="/terms.html" target="_blank">شروط الاستخدام</a></div></section>`;
  target.querySelector("#startGuide").onclick = () => {
    openModal(`<h3>جولة منصة مدار</h3><ol class="help-steps"><li><strong>البحث الشامل:</strong> استخدمي مربع البحث أعلى الصفحة أو ⌘ K.</li><li><strong>ملف الطالبة:</strong> اضغطي اسم الطالبة لمشاهدة كل بياناتها.</li><li><strong>التقارير الذكية:</strong> تعرض المتعثرات وأضعف المهارات تلقائيًا.</li><li><strong>التنبيهات:</strong> تابعي الاختبارات القريبة والواجبات المتأخرة.</li><li><strong>التقويم:</strong> انشري المواعيد للفصل وولي الأمر.</li></ol><div class="modal-actions"><button class="btn btn-primary" id="finishGuide">تم</button></div>`);
    document.getElementById("finishGuide").onclick = () => { localStorage.setItem("madar-guide-seen", "1"); closeModal(); };
  };
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
  "teacher-planning": renderTeacherPlanning,
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
  attachments: renderAttachments,
  "analysis-student": () => openAnalysisPanel("student"),
  "analysis-class": () => openAnalysisPanel("class"),
  "analysis-skill": () => openAnalysisPanel("skill"),
  "analysis-learning": renderAnalysisLearning,
  "games-panel": renderGamesPanel,
  "interactive-games": () => openGamesPanel("interactive-games"),
  "game-creator": () => openGamesPanel("game-creator"),
  competitions: () => openGamesPanel("competitions"),
  "strategies-panel": renderStrategiesPanel,
  "flipped-classroom": openStrategiesPanel,
  "library-panel": renderLibraryPanel,
  videos: () => openLibraryPanel("videos"),
  training: () => openLibraryPanel("training"),
  "knowledge-exchange": () => renderKnowledgeExchange().catch((error) => { contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`; }),
  "parent-panel": () => renderParentPanel().catch((error) => { contentEl.innerHTML = `<div class="card form-error">${escapeHtml(error.message)}</div>`; }),
  "my-group": () => { contentEl.innerHTML = '<section class="card"><h3>مجموعتي</h3><div class="empty-state">لا يوجد محتوى في مجموعتي بعد.</div></section>'; },
  "remedial-plans": renderRemedialPlans,
  calendar: renderCalendar,
  reports: renderReports,
  "help-center": () => renderActivityPanel("help-center"),
  notifications: () => renderActivityPanel("notifications"),
  announcements: () => renderActivityPanel("announcements"),
  classes: renderClasses,
  activity: () => renderActivityPanel("activity"),
  settings: renderSettings,
};

boot();
