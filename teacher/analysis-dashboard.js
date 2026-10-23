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

const DIAGNOSTIC_PRINT_CHOICES = [
  { value: "all", label: "طباعة عامة", description: "تجمع القبلي والبعدي والمقارنة لكل طالبة ولكل مهارة." },
  { value: "pre", label: "تشخيصي قبلي", description: "صفحتان: نتائج الطالبات ثم تحليل المهارات." },
  { value: "post", label: "تشخيصي بعدي", description: "صفحتان: نتائج الطالبات ثم تحليل المهارات." },
  { value: "compare", label: "تشخيصي مقارنة", description: "مقارنة القبلي والبعدي للطالبات ثم للمهارات." },
];

const DIAGNOSTIC_PRINT_VIEWS = [
  { value: "student", label: "لكل طالبة" },
  { value: "skill", label: "لكل مهارة" },
];

const DIAGNOSTIC_PRINT_TYPES = {
  pre: "التشخيصي القبلي",
  post: "التشخيصي البعدي",
  compare: "التشخيصي المقارن",
};

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

function renderPrintTableHtml(table, tableIndex, { escapeHtml, formatDate, idPrefix = "report" }) {
  const columns = isOptionList(table?.columns);
  const rows = isOptionList(table?.rows);
  if (!columns.length) return "";
  return `<section class="analysis-print-table-section" aria-labelledby="analysis-print-table-${idPrefix}-${tableIndex}">
    <h3 id="analysis-print-table-${idPrefix}-${tableIndex}">${escapeHtml(table?.title || "جدول النتائج")}</h3>
    <div class="print-table-wrap"><table class="analysis-workspace-print-table">
      <thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column?.label || column?.key || "—")}</th>`).join("")}</tr></thead>
      <tbody>${rows.length
        ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatValue(row?.[column?.key], column?.format, { escapeHtml, formatDate }))}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${columns.length}">لا توجد صفوف لعرضها.</td></tr>`}</tbody>
    </table></div>
  </section>`;
}

function renderPrintChartHtml(chart, chartIndex, escapeHtml, idPrefix = "report") {
  const labels = isOptionList(chart?.labels);
  const series = isOptionList(chart?.series);
  if (!labels.length || !series.length) return "";
  const numericValues = series.flatMap((item) => isOptionList(item?.values)).filter(isFiniteNumber).map((value) => Math.abs(Number(value)));
  const scale = Math.max(100, ...numericValues);
  const title = chart?.title || "الرسم البياني";
  return `<figure class="analysis-print-chart" aria-labelledby="analysis-print-chart-${idPrefix}-${chartIndex}">
    <figcaption id="analysis-print-chart-${idPrefix}-${chartIndex}">${escapeHtml(title)}</figcaption>
    <div class="analysis-print-chart__legend" aria-label="مفتاح الرسم">
      ${series.map((item, seriesIndex) => `<span class="is-series-${seriesIndex % CHART_PALETTE.length}"><i style="--analysis-print-series:${chartColor(item?.color, seriesIndex)}"></i>${escapeHtml(item?.label || "النتيجة")}</span>`).join("")}
    </div>
    <div class="analysis-print-chart__rows" role="list" aria-label="${escapeHtml(title)}">
      ${labels.map((label, labelIndex) => `<article class="analysis-print-chart__row" role="listitem">
        <strong>${escapeHtml(label)}</strong>
        <div class="analysis-print-chart__values">${series.map((item, seriesIndex) => {
          const value = isOptionList(item?.values)[labelIndex];
          const numeric = isFiniteNumber(value) ? Number(value) : null;
          const width = numeric === null ? 0 : Math.min(100, (Math.abs(numeric) / scale) * 100);
          return `<div class="analysis-print-chart__value is-series-${seriesIndex % CHART_PALETTE.length}">
            <span>${escapeHtml(item?.label || "النتيجة")}</span>
            <i aria-hidden="true"><b style="--analysis-print-width:${width}%;--analysis-print-series:${chartColor(item?.color, seriesIndex)}"></b></i>
            <em>${numeric === null ? "—" : `${escapeHtml(arabicNumber(numeric))}٪`}</em>
          </div>`;
        }).join("")}</div>
      </article>`).join("")}
    </div>
  </figure>`;
}

function renderDiagnosticPrintBody(report, filterSummary, printedAt, helpers) {
  const { escapeHtml, formatDate } = helpers;
  if (!report) return `<div class="analysis-print-empty is-error" role="alert">تعذّر تحميل هذا القسم.</div>`;
  const printTables = isOptionList(report.tables).map((table, index) => renderPrintTableHtml(table, index, helpers)).filter(Boolean).join("");
  const printCharts = isOptionList(report.charts).map((chart, index) => renderPrintChartHtml(chart, index, escapeHtml, helpers.idPrefix)).filter(Boolean).join("");
  const summary = isOptionList(report.summary).map((item) => `<div><strong>${escapeHtml(`${arabicNumber(item?.value)}${item?.suffix || ""}`)}</strong><span>${escapeHtml(item?.label || "النتيجة")}</span></div>`).join("");
  const reportMessage = report.message ? `<p class="analysis-print-report-note">${escapeHtml(report.message)}</p>` : "";
  const tableBlock = printTables || `<div class="analysis-print-empty">${escapeHtml(report.message || "لا توجد نتائج مطابقة للفلاتر المحددة.")}</div>`;
  return `<div class="analysis-print-context"><span>تاريخ الطباعة: ${escapeHtml(formatDate(printedAt))}</span><span>${escapeHtml(filterSummary)}</span></div>
    <div class="analysis-print-tables">${tableBlock}</div>
    ${summary ? `<section class="print-summary" aria-label="ملخص النتائج">${summary}</section>` : ""}
    ${reportMessage}
    ${printCharts ? `<section class="analysis-print-charts" aria-label="الرسوم البيانية">${printCharts}</section>` : ""}`;
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

function renderFilters(state, filters, academicFiltersHtml, escapeHtml) {
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
  if (isFollowUp) {
    controls.push(renderFilterSelect({ key: "studentId", label: "الطالبة", options: filters.students, value: state.filters.studentId, escapeHtml }));
    if (state.view === "skill") controls.push(renderFilterSelect({ key: "skillId", label: "المهارة", options: filters.skills, value: state.filters.skillId, escapeHtml }));
  }
  controls.push(renderFilterSelect({ key: "semester", label: "الفترة الدراسية", options: filters.periods, value: state.filters.semester, escapeHtml }));

  return `<section class="analysis-workspace__filters card" aria-label="تصفية التحليل">
    <div class="analysis-workspace__section-heading"><div><span>الفلاتر</span><h2>تحديد نطاق التقرير</h2></div><p>تظهر الخيارات المرتبطة بالتحليل الحالي فقط.</p></div>
    <div class="analysis-workspace__filter-grid">${academicFiltersHtml}${controls.join("")}</div>
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
  let changed = false;
  const optionKeys = { subject: "subjects", unit: "units", lesson: "lessons", testId: "tests", testType: "testTypes", studentId: "students", skillId: "skills", semester: "periods" };
  Object.entries(optionKeys).forEach(([key, source]) => {
    if (!state.filters[key]) return;
    if (!isOptionList(filters[source]).some((option) => String(option.value) === String(state.filters[key]))) {
      state.filters[key] = "";
      changed = true;
    }
  });
  if (state.category === "short" && state.subtype !== "compare" && !isOptionList(filters.tests).some((option) => String(option.value) === String(state.subtype))) {
    state.subtype = "compare";
    state.filters.testId = "";
    changed = true;
  }
  return changed;
}

export async function renderAnalysisDashboard({ root, academicSelectorHtml, bindAcademicSelector, getAcademicQuery, api, escapeHtml, formatDate, openPrint, printTable, toast }) {
  activeController?.abort();
  const state = { category: "diagnostic", subtype: "pre", view: "student", filters: emptyFilters() };
  let workspaceData = null;
  let printDialog = null;
  let printReturnFocus = null;
  let printDialogKeydown = null;
  let printPreparing = false;
  let printController = null;
  let printPopup = null;
  let printBackgroundState = [];

  root.innerHTML = `<section class="analysis-workspace" aria-label="مساحة تحليل النتائج"><div class="analysis-workspace__loading" aria-live="polite">جارٍ تحميل مساحة تحليل النتائج…</div></section>`;
  const workspaceRoot = root.querySelector(".analysis-workspace");

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

  function optionLabel(options, value, emptyLabel) {
    if (value === null || value === undefined || value === "") return emptyLabel;
    return isOptionList(options).find((option) => String(option?.value) === String(value))?.label || String(value);
  }

  function printContextFromData(data, fallbackQuery) {
    const selection = data?.selection || Object.fromEntries(fallbackQuery.entries());
    const filters = data?.filters || workspaceData?.filters || {};
    const classId = selection.classId || fallbackQuery.get("classId") || "";
    const semesterValue = selection.semester ?? fallbackQuery.get("semester") ?? "";
    return {
      classId,
      className: optionLabel(filters.classes, classId, "جميع الفصول"),
      stage: selection.stage || "جميع المراحل",
      grade: selection.gradeLabel || "جميع الصفوف",
      subjectName: selection.subject || data?.meta?.subjectName || "جميع المواد",
      semesterLabel: optionLabel(filters.periods, semesterValue, "جميع الفصول الدراسية"),
      academicYear: selection.academicYear || data?.meta?.academicYear || "—",
    };
  }

  function printFilterSummary(data, fallbackQuery) {
    const selection = data?.selection || Object.fromEntries(fallbackQuery.entries());
    const filters = data?.filters || workspaceData?.filters || {};
    const selected = [
      ["المرحلة", selection.stage],
      ["الصف", selection.gradeLabel],
      ["الفصل", optionLabel(filters.classes, selection.classId, "")],
      ["المادة", selection.subject],
      ["الوحدة", selection.unit],
      ["الدرس", selection.lesson],
      ["الاختبار", optionLabel(filters.tests, selection.testId, "")],
      ["الطالبة", optionLabel(filters.students, selection.studentId, "")],
      ["المهارة", optionLabel(filters.skills, selection.skillId, "")],
      ["الفترة الدراسية", optionLabel(filters.periods, selection.semester, "")],
    ].filter(([, value]) => value && value !== "all" && value !== "الجميع");
    return selected.map(([label, value]) => `${label}: ${value}`).join(" — ") || "جميع الخيارات المتاحة";
  }

  function printQueryFor(subtype, view, mode) {
    const query = new URLSearchParams(getAcademicQuery("analysis"));
    query.set("category", "diagnostic");
    query.set("subtype", subtype);
    query.set("view", view);
    query.set("semester", state.filters.semester || "");
    ["subject", "unit", "lesson", "testId", "testType", "studentId", "skillId"].forEach((key) => query.set(key, state.filters[key] || ""));
    const expectedTestType = { pre: "pre_diagnostic", post: "post_diagnostic" }[subtype] || "";
    const selectedTest = isOptionList(workspaceData?.filters?.tests).find((option) => String(option?.value) === String(state.filters.testId));
    const selectedTestType = selectedTest?.type || state.filters.testType || "";
    const testConstraintConflicts = subtype === "compare" || (selectedTestType && selectedTestType !== expectedTestType);
    if (mode === "all" || subtype !== state.subtype || testConstraintConflicts) {
      query.delete("testId");
      query.delete("testType");
    }
    return query;
  }

  function setPrintPreparing(isPreparing) {
    printPreparing = isPreparing;
    const trigger = workspaceRoot.querySelector("[data-analysis-print-menu]");
    if (trigger) {
      trigger.disabled = isPreparing;
      trigger.textContent = isPreparing ? "جارٍ تجهيز الطباعة…" : "طباعة";
    }
    printDialog?.querySelectorAll("[data-analysis-print-choice]").forEach((button) => { button.disabled = isPreparing; });
    if (isPreparing && printDialog?.contains(document.activeElement)) printDialog.querySelector("[data-analysis-print-close]")?.focus();
  }

  function setPrintDialogStatus(message, stateName = "") {
    const status = printDialog?.querySelector("[data-analysis-print-status]");
    if (!status) return;
    status.textContent = message;
    status.className = `analysis-print-dialog__status${stateName ? ` is-${stateName}` : ""}`;
  }

  function closePrintDialog({ cancel = true, returnFocus = true } = {}) {
    if (!printDialog) return;
    if (cancel && printPreparing) {
      printController?.abort();
      try { printPopup?.close(); } catch (_) {}
      printPopup = null;
      setPrintPreparing(false);
    }
    document.removeEventListener("keydown", printDialogKeydown, true);
    printDialog.remove();
    printDialog = null;
    printDialogKeydown = null;
    printBackgroundState.forEach(({ element, inert, ariaHidden }) => {
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", ariaHidden);
    });
    printBackgroundState = [];
    if (returnFocus && printReturnFocus?.isConnected) printReturnFocus.focus();
    printReturnFocus = null;
  }

  function openPreparingPopup() {
    const popup = window.open("", "_blank");
    if (!popup) return null;
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>جارٍ تجهيز الطباعة…</title><style>body{margin:0;display:grid;min-height:100vh;place-items:center;background:#f4f1f6;color:#352742;font-family:Tajawal,"Segoe UI",Tahoma,sans-serif}.state{padding:28px;text-align:center}.state strong{display:block;color:#5a2b82;font-size:1.2rem;margin-bottom:8px}.state span{color:#665c70}</style></head><body><div class="state"><strong>جارٍ تجهيز الطباعة…</strong><span>يتم جمع الجداول والرسوم المطلوبة.</span></div></body></html>`);
    popup.document.close();
    return popup;
  }

  async function prepareDiagnosticPrint(mode) {
    if (printPreparing || !DIAGNOSTIC_PRINT_CHOICES.some((choice) => choice.value === mode)) return;
    const popup = openPreparingPopup();
    printPopup = popup;
    if (!popup) {
      setPrintDialogStatus("اسمحي بالنوافذ المنبثقة لفتح معاينة الطباعة.", "error");
      toast("اسمحي بالنوافذ المنبثقة حتى تفتح معاينة الطباعة.", "error");
      return;
    }
    const controller = new AbortController();
    printController = controller;
    setPrintPreparing(true);
    setPrintDialogStatus("جارٍ تجهيز الطباعة…", "loading");
    const types = mode === "all" ? ["pre", "post", "compare"] : [mode];
    const targets = types.flatMap((subtype) => DIAGNOSTIC_PRINT_VIEWS.map((view) => ({
      subtype,
      view: view.value,
      viewLabel: view.label,
      query: printQueryFor(subtype, view.value, mode),
    })));
    try {
      const results = await Promise.allSettled(targets.map((target) => api(`/analysis/workspace?${target.query.toString()}`, { signal: controller.signal })));
      if (controller.signal.aborted) return;
      const successCount = results.filter((result) => result.status === "fulfilled").length;
      if (!successCount) {
        try { popup.close(); } catch (_) {}
        if (printPopup === popup) printPopup = null;
        setPrintDialogStatus("تعذّر جمع تقارير الطباعة. أعيدي المحاولة.", "error");
        toast("تعذّر جمع تقارير الطباعة.", "error");
        return;
      }

      const printedAt = new Date();
      const sections = targets.map((target, index) => {
        const result = results[index];
        const data = result.status === "fulfilled" ? result.value : null;
        const sectionTitle = `${DIAGNOSTIC_PRINT_TYPES[target.subtype]} — ${target.viewLabel}`;
        const bodyHtml = data
          ? renderDiagnosticPrintBody(data.report, printFilterSummary(data, target.query), printedAt, { escapeHtml, formatDate, idPrefix: `${target.subtype}-${target.view}` })
          : `<div class="analysis-print-context"><span>تاريخ الطباعة: ${escapeHtml(formatDate(printedAt))}</span><span>${escapeHtml(printFilterSummary(null, target.query))}</span></div><div class="analysis-print-empty is-error" role="alert">${escapeHtml(result.reason?.message || "تعذّر تحميل هذا القسم.")}</div>`;
        return { title: sectionTitle, bodyHtml, context: printContextFromData(data, target.query) };
      });
      await openPrint({
        title: mode === "all" ? "التحليل التشخيصي العام" : DIAGNOSTIC_PRINT_TYPES[mode],
        classId: targets[0]?.query.get("classId") || "",
        orientation: "landscape",
        popupWindow: popup,
        sections,
      });
      if (printPopup === popup) printPopup = null;
      setPrintPreparing(false);
      closePrintDialog({ cancel: false });
    } catch (error) {
      if (controller.signal.aborted) return;
      try { popup.close(); } catch (_) {}
      if (printPopup === popup) printPopup = null;
      setPrintDialogStatus(error?.message || "تعذّر تجهيز الطباعة. أعيدي المحاولة.", "error");
      toast(error?.message || "تعذّر تجهيز الطباعة.", "error");
    } finally {
      if (printController === controller) {
        setPrintPreparing(false);
        printController = null;
      }
    }
  }

  function openDiagnosticPrintDialog(trigger) {
    if (printDialog || printPreparing) return;
    printReturnFocus = trigger || document.activeElement;
    printDialog = document.createElement("div");
    printDialog.className = "analysis-print-dialog-backdrop";
    printDialog.dataset.analysisPrintDialog = "";
    printDialog.innerHTML = `<section class="analysis-print-dialog" role="dialog" aria-modal="true" aria-labelledby="analysis-print-dialog-title" aria-describedby="analysis-print-dialog-description" tabindex="-1">
      <header class="analysis-print-dialog__header"><div><span>إعداد التقرير الرسمي</span><h2 id="analysis-print-dialog-title">اختاري نوع الطباعة</h2><p id="analysis-print-dialog-description">سيُفتح التقرير في معاينة مستقلة جاهزة للطباعة أو الحفظ بصيغة PDF.</p></div><button type="button" class="analysis-print-dialog__close" data-analysis-print-close aria-label="إغلاق نافذة الطباعة">×</button></header>
      <div class="analysis-print-dialog__choices">${DIAGNOSTIC_PRINT_CHOICES.map((choice) => `<button type="button" class="analysis-print-dialog__choice" data-analysis-print-choice="${choice.value}"><strong>${choice.label}</strong><span>${choice.description}</span></button>`).join("")}</div>
      <p class="analysis-print-dialog__status" data-analysis-print-status aria-live="polite">اختاري التقرير المطلوب.</p>
    </section>`;
    document.body.append(printDialog);
    printBackgroundState = [...document.body.children]
      .filter((element) => element !== printDialog && !["SCRIPT", "STYLE"].includes(element.tagName))
      .map((element) => ({ element, inert: Boolean(element.inert), ariaHidden: element.getAttribute("aria-hidden") }));
    printBackgroundState.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    printDialog.querySelector("[data-analysis-print-close]")?.addEventListener("click", () => closePrintDialog());
    printDialog.addEventListener("click", (event) => { if (event.target === printDialog) closePrintDialog(); });
    printDialog.querySelectorAll("[data-analysis-print-choice]").forEach((button) => button.addEventListener("click", () => prepareDiagnosticPrint(button.dataset.analysisPrintChoice)));
    printDialogKeydown = (event) => {
      if (!printDialog?.isConnected) {
        document.removeEventListener("keydown", printDialogKeydown, true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closePrintDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...printDialog.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) {
        event.preventDefault();
        printDialog.querySelector("[role='dialog']")?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", printDialogKeydown, true);
    printDialog.querySelector("[data-analysis-print-choice]")?.focus();
  }

  function bindInteractions() {
    workspaceRoot.querySelector("[data-analysis-print-menu]")?.addEventListener("click", (event) => openDiagnosticPrintDialog(event.currentTarget));
    workspaceRoot.querySelector("[data-analysis-print-current]")?.addEventListener("click", printCurrentReport);
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
    const supportsDetailedView = true;
    const availabilityReason = workspaceData?.availability?.[state.category]?.reason || "";
    const reportMessage = report.message || availabilityReason;
    const charts = ready ? isOptionList(report.charts).slice(0, 2) : [];
    const tables = ready ? isOptionList(report.tables) : [];
    workspaceRoot.innerHTML = `
      <header class="analysis-workspace__header card">
        <div><span>مساحة التقارير التعليمية</span><h1>تحليل النتائج</h1><p>${escapeHtml(report.title || "تحليل النتائج")}</p></div>
        ${state.category === "diagnostic"
          ? `<button class="btn btn-primary analysis-workspace__print" type="button" data-analysis-print-menu aria-haspopup="dialog">طباعة</button>`
          : `<button class="btn btn-primary analysis-workspace__print" type="button" data-analysis-print-current ${ready ? "" : "disabled"}>طباعة</button>`}
      </header>
      <nav class="analysis-workspace__tabs" aria-label="فئات التحليل" role="tablist">
        ${CATEGORY_TABS.map(([value, label]) => `<button type="button" role="tab" class="analysis-workspace__tab${state.category === value ? " is-active" : ""}" data-analysis-category="${value}" aria-selected="${state.category === value}">${label}</button>`).join("")}
      </nav>
      ${renderSubTabs(state, filters, escapeHtml)}
      <div class="analysis-workspace__view-toggle" role="group" aria-label="طريقة عرض التحليل">
        <button type="button" class="analysis-workspace__view${state.view === "student" ? " is-active" : ""}" data-analysis-view="student" aria-pressed="${state.view === "student"}">لكل طالبة</button>
        ${supportsDetailedView ? `<button type="button" class="analysis-workspace__view${state.view === "skill" ? " is-active" : ""}" data-analysis-view="skill" aria-pressed="${state.view === "skill"}">${secondViewLabel}</button>` : `<span class="analysis-workspace__view-note">الدرجات إجمالية ولا تتضمن أسئلة أو مهارات تفصيلية.</span>`}
      </div>
      ${renderFilters(state, filters, academicSelectorHtml("analysis", { embedded: true }), escapeHtml)}
      <div class="analysis-workspace__status is-${escapeHtml(report.status || "empty")}" role="status" aria-live="polite">${reportMessage ? escapeHtml(reportMessage) : "التقرير جاهز للعرض."}</div>
      ${ready ? `${renderSummary(report.summary, escapeHtml)}<section class="analysis-workspace__charts">${charts.map((chart, index) => renderChart(chart, index, escapeHtml)).join("")}</section><section class="analysis-workspace__tables">${tables.map((table, index) => renderTable(table, index, { escapeHtml, formatDate })).join("")}</section>` : `<section class="analysis-workspace__state card"><h2>${escapeHtml(report.title || "تحليل النتائج")}</h2><p>${escapeHtml(reportMessage || "لا توجد بيانات مطابقة للاختيار الحالي.")}</p></section>`}
    `;
    bindInteractions();
    bindAcademicSelector("analysis", loadWorkspace);
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
      if (data?.selection?.view === "student" || data?.selection?.view === "skill") state.view = data.selection.view;
      if (normalizeStateFilters(state, data?.filters || {})) {
        loadWorkspace();
        return;
      }
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
