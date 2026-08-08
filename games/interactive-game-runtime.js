(function attachMadarInteractiveGameRuntime(global) {
  "use strict";

  const LEVELS = Object.freeze({
    easy: Object.freeze({ label: "المستوى البسيط", certificateLabel: "بسيط", seconds: 25, multiplier: 1 }),
    medium: Object.freeze({ label: "المستوى المتوسط", certificateLabel: "متوسط", seconds: 22, multiplier: 1.35 }),
    hard: Object.freeze({ label: "المستوى المتقدم", certificateLabel: "متقدم", seconds: 28, multiplier: 1.75 }),
  });

  function validGameKey(value) {
    const key = String(value || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(key)) throw new Error("معرّف اللعبة غير صالح.");
    return key;
  }

  async function jsonRequest(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "تعذّر الاتصال بنظام الألعاب.");
    return data;
  }

  function formatDurationArabic(value) {
    const seconds = Math.max(0, Math.round(Number(value) || 0));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs} ثانية`;
    if (secs === 0) return `${mins} ${mins === 1 ? "دقيقة" : mins === 2 ? "دقيقتين" : "دقائق"}`;
    return `${mins} ${mins === 1 ? "دقيقة" : mins === 2 ? "دقيقتين" : "دقائق"} و ${secs} ثانية`;
  }

  function mountCertificate(root = document.querySelector("[data-madar-certificate]")) {
    if (!root || root.dataset.madarCertificateReady === "true") return root;
    root.innerHTML = `
      <div class="cert-modal-overlay" id="certModal" hidden>
        <div class="cert-modal-container">
          <div class="cert-modal-header no-print"><h3>شهادة إتقان</h3><div class="cert-modal-actions">
            <button type="button" class="btn-save-certificate" id="saveCertificateButton">إرسال إلى ملف الإنجاز</button>
            <button type="button" class="btn-print" id="printCertButton">🖨️ طباعة الشهادة / حفظ PDF</button>
            <button type="button" class="btn-close" id="closeCertButton">✕ إغلاق</button>
          </div></div>
          <div class="certificate-paper-exact" id="certificatePaper"><div class="exact-cert-border"><div class="exact-cert-inner">
            <div class="exact-cert-content">
              <div class="exact-cert-topbar"><div class="cert-brand-lockup"><img class="cert-madar-logo" src="/assets/print/madar-official-logo-transparent.png" alt="شعار مدار الرسمي"><div class="cert-brand-copy"><strong>مدار</strong><small>منصة الرياضيات التفاعلية</small></div></div><div class="cert-badge">شهادة إتقان</div></div>
              <h1 class="exact-cert-title">شهادة إتقان</h1><p class="exact-cert-sub">تمنح منصة مدار هذه الشهادة للطالبة</p>
              <h2 class="exact-cert-student"><span class="cert-student-name" id="displayCertStudentName">—</span></h2>
              <p class="exact-cert-lesson">بعد إتمام درس <span class="cert-lesson-name" id="displayCertLessonName">—</span></p>
              <p class="certificate-lesson-code" id="displayCertUnitLesson">الوحدة — · الدرس —</p>
              <div class="certificate-academic-context" aria-label="السياق الدراسي"><span>المرحلة <strong id="displayCertStage">—</strong></span><span>الصف <strong id="displayCertGradeLabel">—</strong></span><span>الفصل الدراسي <strong id="displayCertSemester">—</strong></span><span>العام الدراسي <strong id="displayCertAcademicYear">—</strong></span></div>
              <div class="certificate-facts" aria-label="تفاصيل الإنجاز"><span>المستوى <strong id="displayCertLevel">—</strong></span><span>الدرجة: <strong id="displayCertGrade">—</strong></span><span>النقاط <strong id="displayCertScore">—</strong></span><span>الوقت <strong id="displayCertDuration">—</strong></span></div>
              <p class="certificate-issued" id="displayCertIssuedAt"></p>
            </div>
            <div class="exact-cert-footer"><div class="exact-sig-col right-sig"><span class="exact-sig-label">اسم معلمة المادة</span><strong class="exact-sig-value" id="displayCertTeacher">—</strong><div class="exact-sig-line"></div></div><div class="exact-sig-col left-sig"><span class="exact-sig-label">اسم المديرة</span><strong class="exact-sig-value" id="displayCertPrincipal">—</strong><div class="exact-sig-line"></div></div></div>
          </div></div></div>
        </div>
      </div>`;
    root.dataset.madarCertificateReady = "true";
    return root;
  }

  function certificateText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? "").trim() || "—";
  }

  function renderCertificate(certificate = {}, config = {}) {
    mountCertificate();
    const item = certificate || {};
    const unit = Number(item.unitNumber ?? config.unitNumber);
    const lesson = Number(item.lessonNumber ?? config.lessonNumber);
    const formatter = new Intl.NumberFormat("ar-SA", { useGrouping: false });
    const lessonMeta = Number.isInteger(unit) && unit > 0 && Number.isInteger(lesson) && lesson > 0
      ? `الوحدة ${formatter.format(unit)} · الدرس ${formatter.format(lesson)}` : "الوحدة — · الدرس —";
    const correct = Number(item.correctCount);
    const total = Number(item.questionCount);
    const grade = Number.isInteger(correct) && Number.isInteger(total) && correct >= 0 && total > 0 && correct <= total
      ? `${formatter.format(correct)} / ${formatter.format(total)}` : "";
    const issued = item.issuedAt ? new Date(item.issuedAt) : null;

    certificateText("displayCertStudentName", item.studentName || config.studentName);
    certificateText("displayCertLessonName", item.lessonName || config.lessonName);
    certificateText("displayCertUnitLesson", lessonMeta);
    certificateText("displayCertLevel", item.levelLabel || LEVELS[item.level]?.certificateLabel);
    certificateText("displayCertGrade", grade);
    certificateText("displayCertScore", item.score === 0 || item.score ? `${item.score} نقطة` : "");
    certificateText("displayCertDuration", item.durationSeconds === 0 || item.durationSeconds ? formatDurationArabic(item.durationSeconds) : "");
    certificateText("displayCertTeacher", item.teacherName || config.teacherName);
    certificateText("displayCertPrincipal", item.schoolLeaderName || config.schoolLeaderName);
    certificateText("displayCertStage", item.stageLabel || config.stageLabel);
    certificateText("displayCertGradeLabel", item.gradeLabel || config.gradeLabel);
    certificateText("displayCertSemester", item.semesterLabel || config.semesterLabel);
    certificateText("displayCertAcademicYear", item.academicYear || config.academicYear);
    const issuedElement = document.getElementById("displayCertIssuedAt");
    if (issuedElement) issuedElement.textContent = issued && !Number.isNaN(issued.getTime())
      ? `أُصدرت في ${issued.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}` : "";
  }

  function openCertificate(certificate, config) {
    renderCertificate(certificate, config);
    const modal = document.getElementById("certModal");
    if (modal) modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeCertificate() {
    const modal = document.getElementById("certModal");
    if (modal) modal.hidden = true;
    document.body.style.overflow = "";
  }

  class InteractiveGameRuntime {
    constructor(options = {}) {
      this.gameKey = validGameKey(options.gameKey);
      this.teacherPreview = Boolean(options.teacherPreview);
    }

    configUrl() {
      return this.teacherPreview
        ? `/api/teacher/interactive-games/${encodeURIComponent(this.gameKey)}`
        : `/api/student/games/config?gameKey=${encodeURIComponent(this.gameKey)}`;
    }

    loadConfig() {
      return jsonRequest(this.configUrl(), { headers: { Accept: "application/json" } });
    }

    saveAttempt(result, csrfToken) {
      return jsonRequest("/api/student/games/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ ...result, gameKey: this.gameKey }),
      });
    }

    saveCertificate(attemptId, csrfToken) {
      return jsonRequest("/api/student/games/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ attemptId }),
      });
    }

    loadCertificate(portfolioId) {
      return jsonRequest(`/api/student/games/certificates/${encodeURIComponent(portfolioId)}`, {
        headers: { Accept: "application/json" },
      });
    }
  }

  global.MadarInteractiveGame = Object.freeze({
    Runtime: InteractiveGameRuntime,
    levels: LEVELS,
    formatDurationArabic,
    certificate: Object.freeze({ mount: mountCertificate, render: renderCertificate, open: openCertificate, close: closeCertificate }),
    siteHomePath: "/",
    gamesHomePath: (teacherPreview) => teacherPreview ? "/teacher/#games-panel" : "/student/",
  });
  mountCertificate();
})(window);
