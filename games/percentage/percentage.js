const screens = {
  setup: document.getElementById("setupScreen"),
  play: document.getElementById("playScreen"),
  result: document.getElementById("resultScreen"),
};

const state = {
  level: "easy",
  total: 10,
  index: 0,
  score: 0,
  correct: 0,
  streak: 0,
  bestStreak: 0,
  question: null,
  answered: false,
  timeLeft: 25,
  questionTime: 25,
  timer: null,
  startedAt: 0,
  lastDuration: 0,
  lastAccuracy: 100,
  sound: localStorage.getItem("madar-game-sound") !== "off",
  student: null,
  csrf: "",
  gameConfig: null,
  certificate: null,
  certificateSaving: false,
  serverSessionId: "",
  serverQuestions: [],
};

const levelConfig = MadarInteractiveGame.levels;

const defaultGameConfig = {
  unitNumber: null,
  lessonNumber: null,
  lessonName: "",
  timeMode: "open",
  timePerQuestionSeconds: null,
  certificatePortfolioEnabled: false,
  teacherName: "",
  schoolLeaderName: "",
};

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (items) => items[Math.floor(Math.random() * items.length)];
const roundSmart = (value) => Number.isInteger(value) ? value : Number(value.toFixed(1));
const formatNumber = (value) => new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(value);
const isTeacherGameContext = new URLSearchParams(window.location.search).get("from") === "teacher";
const requestedGameKey = new URLSearchParams(window.location.search).get("game") || document.body.dataset.gameKey;
const gameRuntime = new MadarInteractiveGame.Runtime({ gameKey: requestedGameKey, teacherPreview: isTeacherGameContext });
const gameKey = gameRuntime.gameKey;
const siteHomePath = MadarInteractiveGame.siteHomePath;
const gamesHomePath = MadarInteractiveGame.gamesHomePath(isTeacherGameContext);
const formatDurationArabic = MadarInteractiveGame.formatDurationArabic;

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizedGameConfig(value = {}) {
  return {
    ...defaultGameConfig,
    ...value,
    unitNumber: numericOrNull(value.unitNumber ?? value.unit_number),
    lessonNumber: numericOrNull(value.lessonNumber ?? value.lesson_number),
    lessonName: String(value.lessonName ?? value.lesson_name ?? defaultGameConfig.lessonName).trim() || defaultGameConfig.lessonName,
    timeMode: (value.timeMode ?? value.time_mode) === "timed" ? "timed" : "open",
    timePerQuestionSeconds: (value.timeMode ?? value.time_mode) === "timed"
      ? clamp(Number(value.timePerQuestionSeconds ?? value.time_per_question_seconds), 15, 120)
      : null,
    certificatePortfolioEnabled: Boolean(value.certificatePortfolioEnabled ?? value.certificate_portfolio_enabled),
    teacherName: String(value.teacherName ?? value.teacher_name ?? "").trim(),
    schoolLeaderName: String(value.schoolLeaderName ?? value.school_leader_name ?? "").trim(),
  };
}

function lessonMeta(config = state.gameConfig || defaultGameConfig) {
  const unit = numericOrNull(config.unitNumber);
  const lesson = numericOrNull(config.lessonNumber);
  if (!unit && !lesson) return "الوحدة — · الدرس —";
  return `الوحدة ${unit || "—"} · الدرس ${lesson || "—"}`;
}

function setText(id, value, fallback = "—") {
  const element = $(id);
  if (element) element.textContent = String(value ?? "").trim() || fallback;
}

function applyGameConfig(config) {
  state.gameConfig = normalizedGameConfig(config);
  const meta = lessonMeta();
  setText("setupLessonMeta", meta);
  setText("playLessonMeta", meta);
  setText("setupLessonName", state.gameConfig.lessonName);
  document.body.dataset.timeMode = state.gameConfig.timeMode;
  const startButton = $("startButton");
  if (startButton && !isTeacherGameContext) {
    const ready = Boolean(state.gameConfig.configured && state.gameConfig.isActive);
    startButton.disabled = !ready;
    startButton.textContent = ready ? "ابدئي التحدي" : "إعداد اللعبة غير مكتمل";
  }
}

async function loadGameConfig() {
  try {
    const data = await gameRuntime.loadConfig();
    applyGameConfig(data.gameConfig || data.config || data);
  } catch (_) {
    applyGameConfig(defaultGameConfig);
  }
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, element]) => element.classList.toggle("active", key === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2200);
}

function playTone(kind) {
  if (!state.sound || !("AudioContext" in window || "webkitAudioContext" in window)) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    const context = new Context();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.type = "sine";
    oscillator.frequency.value = kind === "correct" ? 660 : kind === "finish" ? 520 : 190;
    gain.gain.setValueAtTime(.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.12, context.currentTime + .02);
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + (kind === "finish" ? .45 : .22));
    oscillator.start();
    oscillator.stop(context.currentTime + (kind === "finish" ? .46 : .23));
    oscillator.addEventListener("ended", () => context.close().catch(() => {}), { once: true });
  } catch (_) {}
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function uniqueOptions(answer, candidates, unit = "") {
  const normalized = [answer, ...candidates].map(roundSmart);
  const unique = [...new Set(normalized.map(String))].map(Number);
  let bump = Math.max(1, Math.round(Math.abs(answer) * .1));
  while (unique.length < 4) {
    const candidate = roundSmart(Math.max(0, answer + (unique.length % 2 ? bump : -bump)));
    if (!unique.includes(candidate)) unique.push(candidate);
    bump += Math.max(1, Math.round(bump * .5));
  }
  return shuffle(unique.slice(0, 4).map((value) => ({ value, label: `${formatNumber(value)}${unit}` })));
}

/* أسئلة النسبة المئوية */
function easyQuestion() {
  const type = random(["part", "part", "percent", "whole"]);
  if (type === "part") {
    const percent = random([10, 20, 25, 50, 75]);
    const base = random([20, 40, 60, 80, 100, 120, 160, 200]);
    const answer = base * percent / 100;
    return {
      text: `كم تساوي ${percent}% من العدد ${base}؟`, answer,
      options: uniqueOptions(answer, [answer + base / 10, answer * 2, base - answer]),
      skill: "حساب نسبة من عدد", hint: "حوّلي النسبة إلى كسر من 100 واضربي في العدد",
      explanation: `${percent}% × ${base} = (${percent} ÷ 100) × ${base} = ${formatNumber(answer)}.`
    };
  }
  if (type === "percent") {
    const whole = random([20, 40, 50, 80, 100, 200]);
    const percent = random([10, 20, 25, 50, 75]);
    const part = whole * percent / 100;
    return {
      text: `العدد ${formatNumber(part)} يمثّل كم بالمئة من ${whole}؟`, answer: percent,
      options: uniqueOptions(percent, [percent + 10, percent * 2, Math.max(5, percent - 10)], "%"),
      skill: "إيجاد النسبة المئوية", hint: "اقسمي الجزء على الكل ثم اضربي في 100",
      explanation: `(${formatNumber(part)} ÷ ${whole}) × 100 = ${percent}%.`
    };
  }
  const percent = random([10, 20, 25, 50]);
  const whole = random([40, 60, 80, 100, 120, 160, 200]);
  const part = whole * percent / 100;
  return {
    text: `${formatNumber(part)} تساوي ${percent}% من أي عدد؟`, answer: whole,
    options: uniqueOptions(whole, [whole + 20, whole / 2, whole * 2]),
    skill: "إيجاد العدد الكلي", hint: "اقسمي الجزء على النسبة المئوية",
    explanation: `${formatNumber(part)} ÷ (${percent} ÷ 100) = ${whole}.`
  };
}

function mediumQuestion() {
  const type = random(["discount", "part", "increase"]);
  if (type === "discount") {
    const price = random([80, 120, 160, 200, 240, 300, 400]);
    const percent = random([10, 15, 20, 25, 30]);
    const discount = price * percent / 100;
    const answer = price - discount;
    return {
      text: `سعر حقيبة ${price} ريالاً، عليها خصم ${percent}%. كم يصبح سعرها بعد الخصم؟`, answer,
      options: uniqueOptions(answer, [discount, price + discount, price - percent], " ر.س"),
      skill: "الخصم المئوي", hint: "احسبي قيمة الخصم ثم اطرحيها من السعر الأصلي",
      explanation: `الخصم = ${price} × ${percent}% = ${formatNumber(discount)} ريالاً، السعر بعد الخصم = ${formatNumber(answer)} ريالاً.`
    };
  }
  const original = random([50, 80, 100, 120, 160, 200]);
  const percent = random([10, 15, 20, 25]);
  const answer = original * (1 + percent / 100);
  return {
    text: `زادت قيمة ${original} بنسبة ${percent}%. ما القيمة الجديدة؟`, answer,
    options: uniqueOptions(answer, [original - original * percent / 100, original + percent, original * percent / 100]),
    skill: "الزيادة المئوية", hint: "أضيفي مقدار الزيادة إلى القيمة الأصلية",
    explanation: `القيمة الجديدة = ${formatNumber(answer)}.`
  };
}

function hardQuestion() {
  const discount = random([15, 20, 25, 30]);
  const original = random([120, 160, 200, 240, 300, 400]);
  const sale = original * (1 - discount / 100);
  return {
    text: `بعد خصم ${discount}% أصبح سعر فستان ${formatNumber(sale)} ريالاً. ما سعره الأصلي قبل الخصم؟`, answer: original,
    options: uniqueOptions(original, [sale + discount, sale / (discount / 100), original - sale], " ر.س"),
    skill: "النسبة العكسية", hint: `السعر الجديد يمثّل ${100 - discount}% من الأصلي`,
    explanation: `السعر الأصلي = ${formatNumber(sale)} ÷ ${(100 - discount) / 100} = ${original} ريالاً.`
  };
}

function createQuestion() {
  return state.level === "easy" ? easyQuestion() : state.level === "medium" ? mediumQuestion() : hardQuestion();
}

function renderQuestion() {
  clearInterval(state.timer);
  state.answered = false;
  state.question = state.serverSessionId ? state.serverQuestions[state.index] : createQuestion();
  if (!state.question) {
    toast("تعذّر العثور على السؤال التالي. ابدئي جولة جديدة.");
    showScreen("setup");
    return;
  }
  const timed = state.gameConfig?.timeMode === "timed";
  state.questionTime = timed ? state.gameConfig.timePerQuestionSeconds : levelConfig[state.level].seconds;
  state.timeLeft = state.questionTime;
  
  $("questionCounter").textContent = `السؤال ${state.index + 1} من ${state.total}`;
  $("levelLabel").textContent = levelConfig[state.level].label;
  $("progressBar").style.width = `${(state.index / state.total) * 100}%`;
  
  $("questionSkill").textContent = state.question.skill;
  $("questionPoints").textContent = `+${Math.round(100 * levelConfig[state.level].multiplier)} نقطة`;
  
  $("questionText").textContent = state.question.text;
  $("questionHint").textContent = state.question.hint || "اختاري الإجابة الصحيحة:";
  
  $("feedback").hidden = true;
  $("feedback").classList.remove("wrong");
  $("questionCard").classList.remove("pulse-correct", "shake-wrong");

  const grid = $("answerGrid");
  grid.innerHTML = "";
  state.question.options.forEach((option, idx) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button";
    button.innerHTML = `<span class="answer-key">${idx + 1}</span> <span>${option.label}</span>`;
    button.addEventListener("click", () => handleAnswer(state.serverSessionId ? option.id : option.value, button));
    grid.appendChild(button);
  });

  updateTimerUI();
  if (timed) {
    state.timer = setInterval(() => {
      state.timeLeft -= 1;
      updateTimerUI();
      if (state.timeLeft <= 0) {
        clearInterval(state.timer);
        handleAnswer(null, null);
      }
    }, 1000);
  }
}

function updateTimerUI() {
  const timed = state.gameConfig?.timeMode === "timed";
  $("timerStat").classList.toggle("is-open", !timed);
  $("timerLabel").textContent = timed ? "الوقت المتبقي" : "وقت مرن";
  $("timerValue").textContent = timed ? Math.max(0, state.timeLeft) : "مرن";
  $("timerRing").hidden = !timed;
  if (!timed) return;
  const percent = Math.max(0, (state.timeLeft / state.questionTime) * 100);
  $("timerRing").style.setProperty("--timer-progress", `${percent}%`);
}

async function handleAnswer(selectedValue, targetButton) {
  if (state.answered) return;
  state.answered = true;
  clearInterval(state.timer);
  const buttons = $("answerGrid").querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });

  let isCorrect;
  let explanation = state.question.explanation || "";
  let correctOptionId = null;
  if (state.serverSessionId) {
    try {
      const result = await gameRuntime.submitAnswer(state.serverSessionId, state.index, selectedValue, state.csrf);
      isCorrect = Boolean(result.correct);
      correctOptionId = Number(result.correctOptionId);
      explanation = result.explanation || "";
      state.score = Number(result.score || 0);
      state.correct = Number(result.correctCount || 0);
      state.streak = Number(result.streak || 0);
      state.bestStreak = Number(result.bestStreak || 0);
    } catch (error) {
      state.answered = false;
      buttons.forEach((button) => { button.disabled = false; });
      toast(error.message || "تعذّر التحقق من الإجابة. حاولي مجددًا.");
      return;
    }
  } else {
    isCorrect = selectedValue !== null && Math.abs(selectedValue - state.question.answer) < 0.01;
    correctOptionId = state.question.options.findIndex((option) => Math.abs(option.value - state.question.answer) < 0.01);
  }
  if (Number.isInteger(correctOptionId) && buttons[correctOptionId]) buttons[correctOptionId].classList.add("correct");

  if (isCorrect) {
    if (targetButton) targetButton.classList.add("correct");
    if (!state.serverSessionId) {
      state.correct += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      const speedBonus = state.gameConfig?.timeMode === "timed"
        ? Math.round(Math.min(state.timeLeft, levelConfig[state.level].seconds) * 4)
        : 0;
      const streakBonus = Math.min(50, Math.max(0, state.streak - 1) * 10);
      state.score += Math.round((100 + speedBonus + streakBonus) * levelConfig[state.level].multiplier);
    }
    $("feedbackIcon").textContent = "✓";
    $("feedbackTitle").textContent = state.streak >= 3 ? `رائعة جداً! سلسلة ${state.streak} صحيحة 🔥` : "إجابة صحيحة!";
    $("questionCard").classList.add("pulse-correct");
    playTone("correct");
  } else {
    if (targetButton) targetButton.classList.add("wrong");
    if (!state.serverSessionId) state.streak = 0;
    const timeEnded = state.gameConfig?.timeMode === "timed" && state.timeLeft <= 0;
    $("feedbackIcon").textContent = timeEnded ? "⏱" : "×";
    $("feedbackTitle").textContent = timeEnded ? "انتهى الوقت" : "ليست الإجابة الصحيحة";
    $("feedback").classList.add("wrong");
    $("questionCard").classList.add("shake-wrong");
    playTone("wrong");
  }

  $("scoreValue").textContent = state.score;
  $("streakValue").textContent = state.streak;
  $("feedbackExplanation").textContent = explanation;
  $("feedback").hidden = false;
  $("nextButton").innerHTML = state.index + 1 >= state.total ? "شاهدي النتيجة <span>←</span>" : "السؤال التالي <span>←</span>";
  $("nextButton").focus();
}

function nextQuestion() {
  if (!state.answered) return;
  state.index += 1;
  if (state.index >= state.total) finishGame();
  else renderQuestion();
}

async function startGame() {
  const startButton = $("startButton");
  if (startButton) startButton.disabled = true;
  Object.assign(state, { index: 0, score: 0, correct: 0, streak: 0, bestStreak: 0, answered: false, startedAt: Date.now(), serverSessionId: "", serverQuestions: [] });
  if (state.student) {
    try {
      const session = await gameRuntime.startSession(state.level, state.total, state.csrf);
      state.serverSessionId = session.sessionId;
      state.serverQuestions = Array.isArray(session.questions) ? session.questions : [];
      if (state.serverQuestions.length !== state.total) throw new Error("تعذّر تجهيز أسئلة الجولة.");
    } catch (error) {
      if (startButton) startButton.disabled = false;
      toast(error.message || "تعذّر بدء جولة موثقة. حاولي مجددًا.");
      return;
    }
  }
  if (startButton) startButton.disabled = false;
  $("scoreValue").textContent = "0";
  $("streakValue").textContent = "0";
  showScreen("play");
  renderQuestion();
}

function finishGame() {
  clearInterval(state.timer);
  const duration = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
  state.lastDuration = duration;
  const accuracy = Math.round((state.correct / state.total) * 100);
  state.lastAccuracy = accuracy;
  
  const bestKey = `madar-game-best-${gameKey}-${state.level}`;
  const previousBest = Number(localStorage.getItem(bestKey) || 0);
  if (state.score > previousBest) localStorage.setItem(bestKey, String(state.score));

  $("finalScore").textContent = state.score;
  $("correctResult").textContent = `${state.correct} / ${state.total}`;
  $("accuracyResult").textContent = `${accuracy}%`;
  $("streakResult").textContent = `${state.bestStreak} 🔥`;
  $("durationResult").textContent = formatDurationArabic(duration);
  
  $("resultBadge").textContent = accuracy >= 90 ? "🏆" : accuracy >= 70 ? "⭐" : "🚀";
  $("resultTitle").textContent = accuracy >= 90 ? "مبارك الإنجاز والتفوق!" : accuracy >= 70 ? "أحسنتِ وصنعتِ نتيجة ممتازة!" : "بداية موفقة!";
  $("resultMessage").textContent = accuracy >= 90 ? "أصبحتِ نجمة الدرس واجتزتِ التحدي بتفوق." : accuracy >= 70 ? "نتيجة جميلة، استخرجي شهادتكِ وحاولي كسر رقمكِ." : "كل جولة تقربكِ أكثر من الإتقان.";
  
  state.certificate = null;
  state.certificateSaving = false;
  updateCertificateButton();
  $("saveStatus").textContent = state.student
    ? "يجري حفظ نتيجة الجولة والتحقق من اكتمال بيانات الشهادة…"
    : "اكتملت الجولة. سجّلي الدخول كطالبة ليُحفظ الإنجاز.";
  
  createConfetti();
  showScreen("result");
  playTone("finish");
  if (state.student) {
    saveAttempt().then((response) => {
      state.certificate = response?.certificate || null;
      updateCertificateButton();
      if (state.certificate) {
        $("saveStatus").textContent = certificateCanBeSaved(state.certificate)
          ? "حُفظت النتيجة، وشهادة الإتقان جاهزة للعرض والإرسال إلى ملف إنجازكِ."
          : "حُفظت النتيجة، وشهادة الإتقان جاهزة للعرض.";
      } else $("saveStatus").textContent = response?.message || "حُفظت النتيجة، ولن تصدر الشهادة قبل اكتمال بيانات اللعبة.";
    }).catch((error) => {
      $("saveStatus").textContent = error.message || "تعذّر حفظ النتيجة. أعيدي الجولة بعد التحقق من الاتصال.";
      toast("لم تُحفظ النتيجة. تحققي من الاتصال وحاولي مجددًا.");
    });
  }
}

function certificateCanBeSaved(certificate = state.certificate) {
  const attemptId = Number(certificate?.attemptId);
  return certificate?.enabled !== false
    && state.gameConfig?.certificatePortfolioEnabled !== false
    && Number.isInteger(attemptId) && attemptId > 0
    && numericOrNull(certificate?.unitNumber) !== null
    && numericOrNull(certificate?.lessonNumber) !== null
    && String(certificate?.lessonName || "").trim() !== "";
}

function updateCertificateButton() {
  const button = $("showCertButton");
  if (button) button.hidden = !state.certificate;
  updateCertificatePortfolioButton();
}

function certificateIsSaved(certificate = state.certificate) {
  return Boolean(certificate?.saved) || Number(certificate?.portfolioId) > 0;
}

function updateCertificatePortfolioButton() {
  const button = $("saveCertificateButton");
  if (!button) return;
  const hasCertificate = Boolean(state.certificate);
  const canSave = certificateCanBeSaved();
  const saved = certificateIsSaved();
  button.hidden = !hasCertificate || !canSave;
  button.disabled = !hasCertificate || !canSave || !state.student || state.certificateSaving || saved;
  button.textContent = saved
    ? "تم الإرسال إلى ملف الإنجاز ✓"
    : state.certificateSaving
      ? "جارٍ الإرسال إلى ملف الإنجاز…"
      : state.student
        ? "إرسال إلى ملف الإنجاز"
        : "سجّلي الدخول لإرسال الشهادة";
}

function renderCertificate(certificate) {
  MadarInteractiveGame.certificate.render(certificate, state.gameConfig || defaultGameConfig);
  updateCertificatePortfolioButton();
}

function openCertificate() {
  if (!state.certificate) {
    toast("لا توجد شهادة إتقان متاحة لهذه الجولة حتى الآن.");
    return;
  }
  MadarInteractiveGame.certificate.open(state.certificate, state.gameConfig || defaultGameConfig);
  updateCertificatePortfolioButton();
}

function closeCertificate() {
  MadarInteractiveGame.certificate.close();
}

async function saveCurrentCertificateToPortfolio() {
  if (!state.certificate || certificateIsSaved()) {
    updateCertificatePortfolioButton();
    return;
  }
  if (!certificateCanBeSaved()) {
    toast("يمكنكِ عرض الشهادة الآن، وسيظهر إرسالها إلى ملف الإنجاز بعد ضبط بيانات الدرس.");
    return;
  }
  const attemptId = Number(state.certificate.attemptId);
  if (!state.student || !Number.isInteger(attemptId) || attemptId < 1) {
    toast("تعذّر تحديد محاولة اللعبة الخاصة بهذه الشهادة.");
    return;
  }

  state.certificateSaving = true;
  updateCertificatePortfolioButton();
  try {
    const data = await gameRuntime.saveCertificate(attemptId, state.csrf);
    state.certificate = data.certificate || data;
    state.certificate.saved = true;
    renderCertificate(state.certificate);
    toast(data.alreadySaved ? "هذه الشهادة موجودة بالفعل في ملف إنجازكِ." : "تم إرسال الشهادة إلى ملف إنجازكِ.");
  } catch (error) {
    toast(error.message || "تعذّر إرسال الشهادة إلى ملف الإنجاز.");
  } finally {
    state.certificateSaving = false;
    updateCertificatePortfolioButton();
  }
}

async function loadCertificateFromUrl() {
  const portfolioId = new URLSearchParams(window.location.search).get("certificate");
  if (!portfolioId) return;
  try {
    const data = await gameRuntime.loadCertificate(portfolioId);
    state.certificate = data.certificate || data;
    updateCertificateButton();
    openCertificate();
  } catch (_) {
    toast("تعذر تحميل الشهادة. تأكدي من تسجيل الدخول وحاولي من ملف الإنجاز.");
  }
}

function createConfetti() {
  const colors = ["#6337c8", "#26b7b3", "#ff9418", "#ffc53d"];
  $("confetti").innerHTML = Array.from({ length: 34 }, (_, index) => `<i style="right:${Math.random() * 100}%;background:${colors[index % colors.length]};--drift:${(Math.random() - 0.5) * 180}px;animation-delay:${Math.random() * .7}s"></i>`).join("");
}

/* جلب بيانات الطالبة والمعلمة والمديرة تلقائياً من جلسة الموقع */
async function detectStudent() {
  const playerChip = $("playerChip");

  if (state.student && state.student.name) {
    if (playerChip) playerChip.textContent = `الطالبة: ${state.student.name}`;
    updateCertificateButton();
    return state.student;
  }

  try {
    const response = await fetch("/api/student/me", { headers: { Accept: "application/json" } });
    if (!response.ok) {
      state.student = null;
      state.csrf = "";
      if (playerChip) playerChip.textContent = "الجلوس الحالي ليس لطالب/طالبة";
      updateCertificateButton();
      return null;
    }

    const data = await response.json();
    state.student = data;
    state.csrf = data.csrfToken || "";
    if (playerChip && data.name) playerChip.textContent = `الطالبة: ${data.name}`;
    updateCertificateButton();
    return data;
  } catch (_) {
    state.student = null;
    state.csrf = "";
    if (playerChip) playerChip.textContent = "الجلوس الحالي ليس لطالب/طالبة";
    updateCertificateButton();
    return null;
  }
}

async function saveAttempt() {
  if (!state.serverSessionId) throw new Error("لا توجد جلسة لعبة موثقة لحفظها.");
  return gameRuntime.saveAttempt(state.serverSessionId, state.csrf);
}

document.querySelectorAll("[data-level]").forEach((button) => {
  button.addEventListener("click", () => {
    state.level = button.dataset.level;
    document.querySelectorAll("[data-level]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-checked", String(selected));
    });
    $("bestScoreText").textContent = `أفضل نتيجة محلياً: ${Number(localStorage.getItem(`madar-game-best-${gameKey}-${state.level}`) || 0)} نقطة`;
  });
});

document.querySelectorAll("[data-rounds]").forEach((button) => {
  button.addEventListener("click", () => {
    state.total = Number(button.dataset.rounds);
    document.querySelectorAll("[data-rounds]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-checked", String(selected));
    });
  });
});

$("startButton").addEventListener("click", startGame);
$("nextButton").addEventListener("click", nextQuestion);
$("replayButton").addEventListener("click", () => showScreen("setup"));
$("backToHomeButton").addEventListener("click", () => {
  window.location.assign(siteHomePath);
});
$("quitButton").addEventListener("click", () => {
  if (!confirm("هل تريدين إنهاء هذه الجولة والعودة إلى البداية؟")) return;
  clearInterval(state.timer);
  showScreen("setup");
});
$("soundButton").addEventListener("click", () => {
  state.sound = !state.sound;
  localStorage.setItem("madar-game-sound", state.sound ? "on" : "off");
  $("soundButton").textContent = state.sound ? "🔊" : "🔇";
  $("soundButton").setAttribute("aria-pressed", String(state.sound));
  $("soundButton").setAttribute("aria-label", state.sound ? "إيقاف الصوت" : "تشغيل الصوت");
});

$("showCertButton").addEventListener("click", openCertificate);
$("closeCertButton").addEventListener("click", closeCertificate);
$("printCertButton").addEventListener("click", () => window.print());
$("saveCertificateButton").addEventListener("click", saveCurrentCertificateToPortfolio);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("certModal").hidden) {
    closeCertificate();
  }
  if (!screens.play.classList.contains("active")) return;
  if (state.answered && (event.key === "Enter" || event.key === "ArrowLeft")) nextQuestion();
  if (!state.answered && /^[1-4]$/.test(event.key)) $("answerGrid").querySelectorAll("button")[Number(event.key) - 1]?.click();
});

$("soundButton").textContent = state.sound ? "🔊" : "🔇";
$("gameHomeLink").href = siteHomePath;
$("gameBackLink").href = siteHomePath;
$("setupBackLink").href = gamesHomePath;
$("setupBackLink").addEventListener("click", () => {
  if (!isTeacherGameContext) sessionStorage.setItem("madar-student-view", "games");
});
$("bestScoreText").textContent = `أفضل نتيجة محلياً: ${Number(localStorage.getItem(`madar-game-best-${gameKey}-easy`) || 0)} نقطة`;
closeCertificate();
showScreen("setup");
Promise.all([detectStudent(), loadGameConfig()]).then(async () => {
  await loadCertificateFromUrl();
});
