let activeController = null;
let requestSequence = 0;

const CATEGORY_TABS = [
  ["diagnostic", "اختبار تشخيصي"],
  ["short", "اختبار قصير"],
  ["games", "الألعاب التفاعلية"],
  ["periodic", "اختبار فتري"],
  ["final", "الاختبار النهائي"],
];

const CHART_PALETTE = ["#6b3fa0", "#1f9d91", "#ef8d32", "#8d78aa"];

function isOptionList(value) {
  return Array.isArray(value) ? value : [];
}

function isFiniteNumber(value) {
  return value !== null && value !== "" && Number.isFinite(Number(value));
}

function arabicNumber(value) {
  if (!isFiniteNumber(value)) return "—";
  return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(Number(value));
}

function formatValue(value, format, { escapeHtml, formatDate }) {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "percent") return `${arabicNumber(value)}٪`;
  if (format === "signedPercent") {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${number > 0 ? "+" : ""}${arabicNumber(number)}٪`;
  }
  if (format === "date") return formatDate(value);
  if (format === "duration") {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return "—";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return minutes ? `${arabicNumber(minutes)} د ${arabicNumber(remainingSeconds)} ث` : `${arabicNumber(remainingSeconds)} ث`;
  }
  if (format === "testType") {
    return ({ pre_diagnostic: "تشخيصي قبلي", post_diagnostic: "تشخيصي بعدي", quiz: "اختبار قصير" })[value] || String(value);
  }
  if (format === "difficulty") {
    return ({ easy: "سهل", medium: "متوسط", hard: "متقدم" })[value] || String(value);
  }
  if (format === "semester") {
    return ({ first: "الفصل الدراسي الأول", second: "الفصل الدراسي الثاني" })[value] || String(value);
  }
  return String(value);
}

function chartColor(value, index) {
  return CHART_PALETTE.includes(value) ? value : CHART_PALETTE[index % CHART_PALETTE.length];
}

function categoryDefaults(category) {
  if (category === "diagnostic") return "pre";
  if (category === "short") return "compare";
  if (category === "periodic") return "first";
  return "";
}

function emptyFilters() {
  return {
    subject: "",
    unit: "",
    lesson: "",
    testId: "",
    testType: "",
    studentId: "",
    skillId: "",
    semester: "",
  };
}

function filterOptionLabel(options, value) {
  if (!value) return "الجميع";
  return isOptionList(options).find((option) => String(option.value) === String(value))?.label || String(value);
}

function renderFilterSelect({ key, label, options, value, escapeHtml, disabled = false }) {
  const list = isOptionList(options);
  const available = list.length > 0;
  return `<label class="analysis-workspace__filter">
    <span>${escapeHtml(label)}</span>
    <select data-analysis-filter="${escapeHtml(key)}" ${disabled || !available ? "disabled" : ""}>
      <option value="">الجميع</option>
      ${list.map((option) => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
    </select>
  </label>`;
}

function renderSubTabs(state, filters, escapeHtml) {
  if (state.category === "diagnostic") {
    const tabs = [["pre", "قبلي"], ["post", "بعدي"], ["compare", "مقارنة"]];
    return `<div class="analysis-workspace__subtabs" role="tablist" aria-label="نوع التحليل التشخيصي">
      ${tabs.map(([value, label]) => `<button type="button" role="tab" class="analysis-workspace__subtab${state.subtype === value ? " is-active" : ""}" data-analysis-subtype="${value}" aria-selected="${state.subtype === value}">${label}</button>`).join("")}
    </div>`;
  }
  if (state.category === "short") {
    const tests = isOptionList(filters.tests);
    return `<div class="analysis-workspace__subtabs" role="tablist" aria-label="الاختبارات القصيرة">
      ${tests.map((test) => `<button type="button" role="tab" class="analysis-workspace__subtab${String(state.subtype) === String(test.value) ? " is-active" : ""}" data-analysis-short-test="${escapeHtml(test.value)}" aria-selected="${String(state.subtype) === String(test.value)}">${escapeHtml(test.label)}</button>`).join("")}
      <button type="button" role="tab" class="analysis-workspace__subtab analysis-workspace__subtab--compare${state.subtype === "compare" ? " is-active" : ""}" data-analysis-short-test="compare" aria-selected="${state.subtype === "compare"}">مقارنة</button>
    </div>`;
  }
  if (state.category === "periodic") {
    const tabs = [["first", "الفترة الأولى"], ["second", "الفترة الثانية"]];
    return `<div class="analysis-workspace__subtabs" role="tablist" aria-label="فترة الاختبار الفتري">
      ${tabs.map(([value, label]) => `<button type="button" role="tab" class="analysis-workspace__subtab${state.subtype === value ? " is-active" : ""}" data-analysis-subtype="${value}" aria-selected="${state.subtype === value}">${label}</button>`).join("")}
    </div>`;
  }
  return "";
}

function renderFilters(state, filters, escapeHtml) {
  const isTestCategory = state.category === "diagnostic" || state.category === "short";
  const isGames = state.category === "games";
  const isFollowUp = state.category === "periodic" || state.category === "final";
  const controls = [];

  if (isTestCategory) {
    controls.push(renderFilterSelect({ key: "subject", label: "المادة", options: filters.subjects, value: state.filters.subject, escapeHtml }));
    controls.push(renderFilterSelect({ key: "unit", label: "الوحدة", options: filters.units, value: state.filters.unit, escapeHtml }));
    controls.push(renderFilterSelect({ key: "lesson", label: "الدرس", options: filters.lessons, value: state.filters.lesson, escapeHtml }));
    controls.push(renderFilterSelect({ key: "testId", label: "الاختبار", options: filters.tests, value: state.filters.testId, escapeHtml }));
    controls.push(renderFilterSelect({ key: "testType", label: "نوع الاختبار", options: filters.testTypes, value: state.filters.testType, escapeHtml }));
    controls.push(renderFilterSelect({ key: "studentId", label: "الطالبة", options: filters.students, value: state.filters.studentId, escapeHtml }));
    controls.push(renderFilterSelect({ key: "skillId", label: "المهارة", options: filters.skills, value: state.filters.skillId, escapeHtml }));
  }
  if (isGames) {
    controls.push(renderFilterSelect({ key: "unit", label: "الوحدة", options: filters.units, value: state.filters.unit, escapeHtml }));
    controls.push(renderFilterSelect({ key: "lesson", label: "الدرس", options: filters.lessons, value: state.filters.lesson, escapeHtml }));
    controls.push(renderFilterSelect({ key: "studentId", label: "الطالبة", options: filters.students, value: state.filters.studentId, escapeHtml }));
  }
  if (isFollowUp) controls.push(renderFilterSelect({ key: "studentId", label: "الطالبة", options: filters.students, value: state.filters.studentId, escapeHtml }));
  controls.push(renderFilterSelect({ key: "semester", label: "الفترة الدراسية", options: filters.periods, value: state.filters.semester, escapeHtml }));

  return `<section class="analysis-workspace__filters card" aria-label="تصفية التحليل">
    <div class="analysis-workspace__section-heading"><div><span>الفلاتر</span><h2>تحديد نطاق التقرير</h2></div><p>تظهر الخيارات المرتبطة بالتحليل الحالي فقط.</p></div>
    <div class="analysis-workspace__filter-grid">${controls.join("")}</div>
  </section>`;
}

function renderSummary(summary, escapeHtml) {
  const items = isOptionList(summary);
  if (!items.length) return "";
  return `<section class="analysis-workspace__summary" aria-label="ملخص النتائج">
    ${items.map((item) => `<article class="analysis-workspace__metric"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(`${arabicNumber(item.value)}${item.suffix || ""}`)}</strong></article>`).join("")}
  </section>`;
}

function renderChart(chart, chartIndex, escapeHtml) {
  const labels = isOptionList(chart.labels);
  const series = isOptionList(chart.series);
  const values = series.flatMap((item) => isOptionList(item.values)).filter(isFiniteNumber).map(Number);
  const scale = Math.max(100, ...values.map((value) => Math.abs(value)));
  const safeTitle = escapeHtml(chart.title || "مخطط النتائج");
  if (!labels.length || !series.length) return "";
  return `<figure class="analysis-workspace__chart card" aria-labelledby="analysis-chart-title-${chartIndex}">
    <figcaption id="analysis-chart-title-${chartIndex}">${safeTitle}</figcaption>
    <div class="analysis-workspace__legend" aria-label="مفتاح المخطط">${series.map((item, index) => `<span><i style="--analysis-legend-color:${chartColor(item.color, index)}"></i>${escapeHtml(item.label || "النتيجة")}</span>`).join("")}</div>
    <div class="analysis-workspace__chart-scroll">
      <div class="analysis-workspace__chart-plot" role="list" aria-label="${safeTitle}">
        ${labels.map((label, labelIndex) => `<article class="analysis-workspace__bar-group" role="listitem"><div class="analysis-workspace__bars">${series.map((item, seriesIndex) => {
          const value = isOptionList(item.values)[labelIndex];
          const numeric = isFiniteNumber(value) ? Number(value) : null;
          const height = numeric === null ? 0 : Math.min(100, (Math.abs(numeric) / scale) * 100);
          return `<span class="analysis-workspace__bar${numeric === null ? " is-missing" : numeric < 0 ? " is-negative" : ""}" style="--analysis-bar-height:${height}%;--analysis-bar-color:${chartColor(item.color, seriesIndex)}" title="${escapeHtml(`${item.label || "النتيجة"}: ${numeric === null ? "—" : arabicNumber(numeric)}`)}"><b>${numeric === null ? "—" : escapeHtml(arabicNumber(numeric))}</b></span>`;
        }).join("")}</div><span class="analysis-workspace__bar-label">${escapeHtml(label)}</span></article>`).join("")}
      </div>
    </div>
  </figure>`;
}

function renderTable(table, index, helpers) {
  const { escapeHtml, formatDate } = helpers;
  const columns = isOptionList(table.columns);
  const rows = isOptionList(table.rows);
  if (!columns.length) return "";
  return `<section class="analysis-workspace__table-card card" aria-labelledby="analysis-table-title-${index}">
    <h2 id="analysis-table-title-${index}">${escapeHtml(table.title || "جدول النتائج")}</h2>
    <div class="analysis-workspace__table-scroll"><table>
      <thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column.label || column.key || "—")}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatValue(row?.[column.key], column.format, { escapeHtml, formatDate }))}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length}">لا توجد صفوف لعرضها.</td></tr>`}</tbody>
    </table></div>
  </section>`;
}

function normalizeStateFilters(state, filters) {
  const optionKeys = { subject: "subjects", unit: "units", lesson: "lessons", testId: "tests", testType: "testTypes", studentId: "students", skillId: "skills", semester: "periods" };
  Object.entries(optionKeys).forEach(([key, source]) => {
    if (!state.filters[key]) return;
    if (!isOptionList(filters[source]).some((option) => String(option.value) === String(state.filters[key]))) state.filters[key] = "";
  });
  if (state.category === "short" && state.subtype !== "compare" && !isOptionList(filters.tests).some((option) => String(option.value) === String(state.subtype))) {
    state.subtype = "compare";
    state.filters.testId = "";
  }
}

export async function renderAnalysisDashboard({ root, academicSelectorHtml, bindAcademicSelector, getAcademicQuery, api, escapeHtml, formatDate, openPrint, printTable, toast }) {
  activeController?.abort();
  const state = { category: "diagnostic", subtype: "pre", view: "student", filters: emptyFilters() };
  let workspaceData = null;

  root.innerHTML = `${academicSelectorHtml("analysis")}<section class="analysis-workspace" aria-label="مساحة تحليل النتائج"><div class="analysis-workspace__loading" aria-live="polite">جارٍ تحميل مساحة تحليل النتائج…</div></section>`;
  const workspaceRoot = root.querySelector(".analysis-workspace");
  bindAcademicSelector("analysis", () => renderAnalysisDashboard({ root, academicSelectorHtml, bindAcademicSelector, getAcademicQuery, api, escapeHtml, formatDate, openPrint, printTable, toast }));

  function filterNamesForPrint(filters) {
    const query = new URLSearchParams(getAcademicQuery("analysis"));
    const selected = [
      ["المرحلة", query.get("stage")],
      ["الصف", query.get("gradeLabel")],
      ["المادة", filterOptionLabel(filters.subjects, state.filters.subject)],
      ["الوحدة", filterOptionLabel(filters.units, state.filters.unit)],
      ["الدرس", filterOptionLabel(filters.lessons, state.filters.lesson)],
      ["الاختبار", filterOptionLabel(filters.tests, state.filters.testId)],
      ["الطالبة", filterOptionLabel(filters.students, state.filters.studentId)],
      ["المهارة", filterOptionLabel(filters.skills, state.filters.skillId)],
      ["الفترة الدراسية", filterOptionLabel(filters.periods, state.filters.semester)],
    ].filter(([, value]) => value && value !== "الجميع");
    return selected.map(([label, value]) => `${label}: ${value}`).join(" — ") || "جميع الخيارات المتاحة";
  }

  function printCurrentReport() {
    const report = workspaceData?.report;
    if (!report || report.status !== "ready") return;
    const filters = workspaceData.filters || {};
    const summary = isOptionList(report.summary).map((item) => `<div><strong>${escapeHtml(`${arabicNumber(item.value)}${item.suffix || ""}`)}</strong><span>${escapeHtml(item.label)}</span></div>`).join("");
    const tables = isOptionList(report.tables).map((table) => {
      const columns = isOptionList(table.columns);
      const rows = isOptionList(table.rows).map((row) => columns.map((column) => escapeHtml(formatValue(row?.[column.key], column.format, { escapeHtml, formatDate }))));
      return `<h3>${escapeHtml(table.title || "جدول النتائج")}</h3>${printTable(columns.map((column) => column.label || column.key || "—"), rows, "analysis-workspace-print-table")}`;
    }).join("");
    const query = new URLSearchParams(getAcademicQuery("analysis"));
    openPrint({
      title: report.title || "تحليل النتائج",
      classId: query.get("classId") || "",
      orientation: isOptionList(report.tables).some((table) => isOptionList(table.columns).length > 6) ? "landscape" : "portrait",
      bodyHtml: `<h2 class="report-title">${escapeHtml(report.title || "تحليل النتائج")}</h2><div class="print-note">تاريخ التقرير: ${escapeHtml(formatDate(new Date()))}<br>${escapeHtml(filterNamesForPrint(filters))}</div>${summary ? `<section class="print-summary">${summary}</section>` : ""}${tables}`,
    });
  }

  function bindInteractions() {
    workspaceRoot.querySelector("[data-analysis-print]")?.addEventListener("click", printCurrentReport);
    workspaceRoot.querySelectorAll("[data-analysis-category]").forEach((button) => {
      button.addEventListener("click", () => {
        const category = button.dataset.analysisCategory;
        if (category === state.category) return;
        state.category = category;
        state.subtype = categoryDefaults(category);
        state.view = "student";
        state.filters = emptyFilters();
        loadWorkspace();
      });
    });
    workspaceRoot.querySelectorAll("[data-analysis-subtype]").forEach((button) => {
      button.addEventListener("click", () => {
        state.subtype = button.dataset.analysisSubtype;
        state.filters.testId = "";
        state.filters.testType = "";
        state.filters.skillId = "";
        loadWorkspace();
      });
    });
    workspaceRoot.querySelectorAll("[data-analysis-short-test]").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.analysisShortTest;
        state.subtype = value;
        state.filters.testId = value === "compare" ? "" : value;
        state.filters.unit = "";
        state.filters.lesson = "";
        state.filters.skillId = "";
        loadWorkspace();
      });
    });
    workspaceRoot.querySelectorAll("[data-analysis-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = button.dataset.analysisView;
        if (view === state.view) return;
        state.view = view;
        loadWorkspace();
      });
    });
    workspaceRoot.querySelectorAll("[data-analysis-filter]").forEach((select) => {
      select.addEventListener("change", () => {
        const key = select.dataset.analysisFilter;
        state.filters[key] = select.value;
        if (key === "subject") {
          state.filters.unit = "";
          state.filters.lesson = "";
          state.filters.skillId = "";
        }
        if (key === "unit") {
          state.filters.lesson = "";
          state.filters.skillId = "";
        }
        if (key === "testId" && state.category === "short") state.subtype = select.value || "compare";
        if (key === "testType" && state.category === "diagnostic" && ["pre_diagnostic", "post_diagnostic"].includes(select.value)) state.subtype = select.value === "pre_diagnostic" ? "pre" : "post";
        loadWorkspace();
      });
    });
  }

  function renderWorkspace() {
    const filters = workspaceData?.filters || {};
    const report = workspaceData?.report || { status: "empty", title: "تحليل النتائج", message: "لا تتوفر بيانات للتحليل." };
    const ready = report.status === "ready";
    const secondViewLabel = state.category === "games" ? "لكل لعبة" : "لكل مهارة";
    const availabilityReason = workspaceData?.availability?.[state.category]?.reason || "";
    const reportMessage = report.message || availabilityReason;
    const charts = ready ? isOptionList(report.charts).slice(0, 2) : [];
    const tables = ready ? isOptionList(report.tables) : [];
    workspaceRoot.innerHTML = `
      <header class="analysis-workspace__header card">
        <div><span>مساحة التقارير التعليمية</span><h1>تحليل النتائج</h1><p>${escapeHtml(report.title || "تحليل النتائج")}</p></div>
        <button class="btn btn-primary analysis-workspace__print" type="button" data-analysis-print ${ready ? "" : "disabled"}>تصدير التقرير PDF</button>
      </header>
      <nav class="analysis-workspace__tabs" aria-label="فئات التحليل" role="tablist">
        ${CATEGORY_TABS.map(([value, label]) => `<button type="button" role="tab" class="analysis-workspace__tab${state.category === value ? " is-active" : ""}" data-analysis-category="${value}" aria-selected="${state.category === value}">${label}</button>`).join("")}
      </nav>
      ${renderSubTabs(state, filters, escapeHtml)}
      <div class="analysis-workspace__view-toggle" role="group" aria-label="طريقة عرض التحليل">
        <button type="button" class="analysis-workspace__view${state.view === "student" ? " is-active" : ""}" data-analysis-view="student" aria-pressed="${state.view === "student"}">لكل طالبة</button>
        <button type="button" class="analysis-workspace__view${state.view === "skill" ? " is-active" : ""}" data-analysis-view="skill" aria-pressed="${state.view === "skill"}">${secondViewLabel}</button>
      </div>
      ${renderFilters(state, filters, escapeHtml)}
      <div class="analysis-workspace__status is-${escapeHtml(report.status || "empty")}" role="status" aria-live="polite">${reportMessage ? escapeHtml(reportMessage) : "التقرير جاهز للعرض."}</div>
      ${ready ? `${renderSummary(report.summary, escapeHtml)}<section class="analysis-workspace__charts">${charts.map((chart, index) => renderChart(chart, index, escapeHtml)).join("")}</section><section class="analysis-workspace__tables">${tables.map((table, index) => renderTable(table, index, { escapeHtml, formatDate })).join("")}</section>` : `<section class="analysis-workspace__state card"><h2>${escapeHtml(report.title || "تحليل النتائج")}</h2><p>${escapeHtml(reportMessage || "لا توجد بيانات مطابقة للاختيار الحالي.")}</p></section>`}
    `;
    bindInteractions();
  }

  function renderLoading() {
    workspaceRoot.innerHTML = `<div class="analysis-workspace__loading" aria-live="polite">جارٍ تحديث تحليل النتائج…</div>`;
  }

  async function loadWorkspace() {
    const requestId = ++requestSequence;
    activeController?.abort();
    activeController = new AbortController();
    renderLoading();
    const query = new URLSearchParams(getAcademicQuery("analysis"));
    query.set("category", state.category);
    query.set("subtype", state.subtype);
    query.set("view", state.view);
    query.set("semester", state.filters.semester || "");
    ["subject", "unit", "lesson", "testId", "testType", "studentId", "skillId"].forEach((key) => query.set(key, state.filters[key] || ""));
    try {
      const data = await api(`/analysis/workspace?${query.toString()}`, { signal: activeController.signal });
      if (requestId !== requestSequence || !root.contains(workspaceRoot)) return;
      workspaceData = data;
      normalizeStateFilters(state, data?.filters || {});
      renderWorkspace();
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== requestSequence) return;
      if (!root.contains(workspaceRoot)) return;
      toast(error.message || "تعذّر تحميل تحليل النتائج.");
      workspaceRoot.innerHTML = `<section class="analysis-workspace__state card" role="alert"><h2>تعذّر تحميل التحليل</h2><p>${escapeHtml(error.message || "تعذّر الاتصال بالخادم. أعيدي المحاولة.")}</p><button class="btn btn-outline" type="button" data-analysis-retry>إعادة المحاولة</button></section>`;
      workspaceRoot.querySelector("[data-analysis-retry]")?.addEventListener("click", loadWorkspace);
    }
  }

  await loadWorkspace();
}
