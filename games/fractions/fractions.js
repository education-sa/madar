// ============================================================
// fractions.js - لعبة الكسور التفاعلية (نسخة كاملة معدلة)
// ============================================================

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
  sound: true,
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
  certificatePortfolioEnabled: true,
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

// ===== دوال مساعدة للكسور (المضافة حديثاً) =====
function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function simplifyFraction(num, den) {
  if (den < 0) { num = -num; den = -den; }
  const g = gcd(Math.abs(num), Math.abs(den));
  return { num: num / g, den: den / g };
}

function fractionString(num, den) {
  if (den === 1) return String(num);
  if (num === 0) return "٠";
  return `${num}⁄${den}`;
}

function randomFrac(maxDen = 10) {
  const den = randomInt(2, maxDen);
  const num = randomInt(1, den - 1);
  return { num, den };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===== دوال أسئلة الكسور (المضافة حديثاً) =====
function easyQuestion() {
  const type = randomInt(0, 1);
  const den = randomInt(2, 6);
  let num1 = randomInt(1, den - 1);
  let num2 = randomInt(1, den - 1);
  if (type === 1 && num1 < num2) [num1, num2] = [num2, num1];
  const resultNum = type === 0 ? num1 + num2 : num1 - num2;
  const resultDen = den;
  const simplified = simplifyFraction(resultNum, resultDen);
  const answer = simplified.num / simplified.den;
  const text = type === 0
    ? `احسبي ناتج جمع الكسرين: ${fractionString(num1, den)} + ${fractionString(num2, den)}`
    : `احسبي ناتج طرح الكسرين: ${fractionString(num1, den)} - ${fractionString(num2, den)}`;
  return {
    text,
    answer,
    options: uniqueOptions(answer, [answer + 0.3, answer * 1.2, answer - 0.2]),
    skill: "جمع وطرح كسور بسيطة",
    hint: "اجمعي أو اطرحي البسطين مع بقاء المقام، ثم بسطي.",
    explanation: `الناتج = ${fractionString(resultNum, resultDen)} = ${fractionString(simplified.num, simplified.den)}`
  };
}

function mediumQuestion() {
  const type = randomInt(0, 1);
  if (type === 0) {
    const f1 = randomFrac(8);
    const f2 = randomFrac(8);
    const resultNum = f1.num * f2.num;
    const resultDen = f1.den * f2.den;
    const simplified = simplifyFraction(resultNum, resultDen);
    const answer = simplified.num / simplified.den;
    return {
      text: `احسبي ناتج ضرب الكسرين: ${fractionString(f1.num, f1.den)} × ${fractionString(f2.num, f2.den)}`,
      answer,
      options: uniqueOptions(answer, [answer * 1.5, answer / 1.2, answer + 0.4]),
      skill: "ضرب الكسور",
      hint: "اضربي البسط في البسط والمقام في المقام، ثم بسطي.",
      explanation: `الناتج = ${fractionString(resultNum, resultDen)} = ${fractionString(simplified.num, simplified.den)}`
    };
  } else {
    const den1 = randomInt(3, 7);
    const den2 = randomInt(3, 7);
    const num1 = randomInt(1, den1 - 1);
    const num2 = randomInt(1, den2 - 1);
    const resultDen = den1 * den2;
    const resultNum = num1 * den2 + num2 * den1;
    const simplified = simplifyFraction(resultNum, resultDen);
    const answer = simplified.num / simplified.den;
    return {
      text: `احسبي ناتج جمع الكسرين: ${fractionString(num1, den1)} + ${fractionString(num2, den2)}`,
      answer,
      options: uniqueOptions(answer, [answer + 0.5, answer * 0.8, answer - 0.3]),
      skill: "جمع كسور بمقامات مختلفة",
      hint: "وحّدي المقامات ثم اجمعي البسطين، وبسطي.",
      explanation: `الناتج = ${fractionString(resultNum, resultDen)} = ${fractionString(simplified.num, simplified.den)}`
    };
  }
}

function hardQuestion() {
  const type = randomInt(0, 2);
  if (type === 0) {
    const whole = randomInt(2, 6);
    const f = randomFrac(9);
    const resultNum = whole * f.num;
    const resultDen = f.den;
    const simplified = simplifyFraction(resultNum, resultDen);
    const answer = simplified.num / simplified.den;
    return {
      text: `احسبي ناتج: ${whole} × ${fractionString(f.num, f.den)}`,
      answer,
      options: uniqueOptions(answer, [answer + 1, answer * 0.7, answer - 0.8]),
      skill: "ضرب عدد صحيح في كسر",
      hint: "اضربي العدد الصحيح في البسط، واتركي المقام، ثم بسطي.",
      explanation: `الناتج = ${fractionString(resultNum, resultDen)} = ${fractionString(simplified.num, simplified.den)}`
    };
  } else if (type === 1) {
    const f1 = randomFrac(10);
    const f2 = randomFrac(10);
    const resultNum = f1.num * f2.den;
    const resultDen = f1.den * f2.num;
    const simplified = simplifyFraction(resultNum, resultDen);
    const answer = simplified.num / simplified.den;
    return {
      text: `احسبي ناتج قسمة الكسرين: ${fractionString(f1.num, f1.den)} ÷ ${fractionString(f2.num, f2.den)}`,
      answer,
      options: uniqueOptions(answer, [answer * 1.3, answer / 0.8, answer + 0.6]),
      skill: "قسمة الكسور",
      hint: "اقلب الكسر الثاني واضرب، ثم بسطي.",
      explanation: `الناتج = ${fractionString(resultNum, resultDen)} = ${fractionString(simplified.num, simplified.den)}`
    };
  } else {
    const whole = randomInt(1, 4);
    const f = randomFrac(10);
    const op = randomInt(0, 1);
    let resultNum, resultDen;
    if (op === 0) {
      resultNum = whole * f.den + f.num;
      resultDen = f.den;
    } else {
      resultNum = whole * f.den - f.num;
      resultDen = f.den;
      if (resultNum <= 0) return hardQuestion();
    }
    const simplified = simplifyFraction(resultNum, resultDen);
    const answer = simplified.num / simplified.den;
    const opSymbol = op === 0 ? '+' : '−';
    return {
      text: `احسبي ناتج: ${whole} ${opSymbol} ${fractionString(f.num, f.den)}`,
      answer,
      options: uniqueOptions(answer, [answer + 0.9, answer * 0.6, answer - 1.1]),
      skill: "عمليات مركبة مع الكسور",
      hint: "حوّل العدد الصحيح إلى كسر مقامه 1، ثم اجمع أو اطرح، وبسط.",
      explanation: `الناتج = ${fractionString(resultNum, resultDen)} = ${fractionString(simplified.num, simplified.den)}`
    };
  }
}

// ===== دوال اللعبة الأساسية (من percentage.js مع تعديلات طفيفة) =====
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
    lessonName: String(value.lessonName ?? value.lesson_name ?? "").trim(),
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
    const player = data.player || {};
    state.student = player.studentName ? { name: player.studentName } : null;
    if ($("playerChip")) $("playerChip").textContent = state.student ? `الطالبة: ${state.student.name}` : "معاينة المعلمة";
  } catch (error) {
    applyGameConfig(defaultGameConfig);
    const startButton = $("startButton");
    if (startButton) {
      startButton.disabled = true;
      startButton.textContent = "تعذّر ربط اللعبة بمدار";
    }
    toast(error.message || "تعذّر ربط اللعبة بمنصة مدار.");
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

function createQuestion() {
  const level = state.level;
  if (level === "easy") return easyQuestion();
  if (level === "medium") return mediumQuestion();
  return hardQuestion();
}

function renderQuestion() {
  clearInterval(state.timer);
  state.answered = false;
  state.question = state.serverQuestions.length ? state.serverQuestions[state.index] : createQuestion();
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
    button.addEventListener("click", () => handleAnswer(state.serverQuestions.length ? option.id : option.value, button));
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
  const beforeAnswer = { score: state.score, correct: state.correct, streak: state.streak, bestStreak: state.bestStreak };
  let earnedPoints = 0;
  if (state.serverQuestions.length) {
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
    if (!state.serverQuestions.length) {
      state.correct += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      const speedBonus = state.gameConfig?.timeMode === "timed"
        ? Math.round(Math.min(state.timeLeft, levelConfig[state.level].seconds) * 4)
        : 0;
      const streakBonus = Math.min(50, Math.max(0, state.streak - 1) * 10);
      earnedPoints = Math.round((100 + speedBonus + streakBonus) * levelConfig[state.level].multiplier);
      state.score += earnedPoints;
    }
    $("feedbackIcon").textContent = "✓";
    $("feedbackTitle").textContent = state.streak >= 3 ? `رائعة جداً! سلسلة ${state.streak} صحيحة 🔥` : "إجابة صحيحة!";
    $("questionCard").classList.add("pulse-correct");
    playTone("correct");
  } else {
    if (targetButton) targetButton.classList.add("wrong");
    if (!state.serverQuestions.length) state.streak = 0;
    const timeEnded = state.gameConfig?.timeMode === "timed" && state.timeLeft <= 0;
    $("feedbackIcon").textContent = timeEnded ? "⏱" : "×";
    $("feedbackTitle").textContent = timeEnded ? "انتهى الوقت" : "ليست الإجابة الصحيحة";
    $("feedback").classList.add("wrong");
    $("questionCard").classList.add("shake-wrong");
    playTone("wrong");
  }

  if (!state.serverQuestions.length) {
    try {
      await gameRuntime.reportAnswer({
        questionKey: `q${state.index + 1}`,
        answer: selectedValue,
        correct: Boolean(isCorrect),
        points: earnedPoints,
        durationMs: Math.max(0, Math.round((state.questionTime - state.timeLeft) * 1000)),
      });
    } catch (error) {
      Object.assign(state, beforeAnswer, { answered: false });
      buttons.forEach((button) => { button.disabled = false; button.classList.remove("correct", "wrong"); });
      toast(error.message || "تعذّر تسجيل الإجابة في مدار. حاولي مجددًا.");
      return;
    }
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
  try {
    const session = await gameRuntime.startSession(state.level, state.total, state.csrf);
    state.serverSessionId = session.sessionId;
    state.serverQuestions = Array.isArray(session.questions) ? session.questions : [];
    if (state.serverQuestions.length && state.serverQuestions.length !== state.total) state.total = state.serverQuestions.length;
  } catch (error) {
    if (startButton) startButton.disabled = false;
    toast(error.message || "تعذّر بدء جولة موثقة. حاولي مجددًا.");
    return;
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
  
  $("saveStatus").textContent = "يجري حفظ نتيجة الجولة والتحقق من اكتمال بيانات الشهادة…";
  
  createConfetti();
  showScreen("result");
  playTone("finish");
  
  saveAttempt().then((response) => {
    state.certificate = response?.certificate || null;
    updateCertificateButton();
    if (state.certificate) $("saveStatus").textContent = "حُفظت النتيجة، وشهادة الإتقان جاهزة للعرض.";
    else if (response?.preview) $("saveStatus").textContent = "اكتملت معاينة الجولة، ولن تُحفظ نتيجة أو شهادة في وضع المعاينة.";
    else $("saveStatus").textContent = response?.message || "حُفظت النتيجة، ولن تصدر الشهادة قبل اكتمال بيانات اللعبة.";
  }).catch((error) => {
    $("saveStatus").textContent = error.message || "تعذّر حفظ النتيجة. أعيدي الجولة بعد التحقق من الاتصال.";
    toast("لم تُحفظ النتيجة. تحققي من الاتصال وحاولي مجددًا.");
  });
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
  MadarInteractiveGame.certificate.open(state.certificate, state.gameConfig || defaultGameConfig).catch((error) => toast(error.message || "تعذّر عرض الشهادة."));
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
  return null;
}

function createConfetti() {
  const colors = ["#2563eb", "#0d9488", "#f97316", "#eab308"];
  $("confetti").innerHTML = Array.from({ length: 34 }, (_, index) => `<i style="right:${Math.random() * 100}%;background:${colors[index % colors.length]};--drift:${(Math.random() - 0.5) * 180}px;animation-delay:${Math.random() * .7}s"></i>`).join("");
}

async function detectStudent() {
  const playerChip = $("playerChip");
  if (state.student && state.student.name) {
    if (playerChip) playerChip.textContent = `الطالبة: ${state.student.name}`;
    updateCertificateButton();
    return state.student;
  }
  if (playerChip) playerChip.textContent = "جارٍ الاتصال بمدار…";
  return null;
}

async function saveAttempt() {
  if (!state.serverSessionId) throw new Error("لا توجد جلسة لعبة موثقة لحفظها.");
  return gameRuntime.saveAttempt(state.serverSessionId, state.csrf, {
    score: state.score,
    maxScore: Math.round(state.total * 250),
    correctCount: state.correct,
    questionCount: state.total,
    bestStreak: state.bestStreak,
    durationSeconds: state.lastDuration,
  });
}

// ===== ربط الأحداث =====
document.querySelectorAll("[data-level]").forEach((button) => {
  button.addEventListener("click", () => {
    state.level = button.dataset.level;
    document.querySelectorAll("[data-level]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-checked", String(selected));
    });
    $("bestScoreText").textContent = "تُحفظ نتيجة كل جولة في حسابكِ على مدار.";
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
  toast("استخدمي زر العودة إلى الألعاب أعلى صفحة مدار.");
});
$("quitButton").addEventListener("click", () => {
  if (!confirm("هل تريدين إنهاء هذه الجولة والعودة إلى البداية؟")) return;
  clearInterval(state.timer);
  showScreen("setup");
});
$("soundButton").addEventListener("click", () => {
  state.sound = !state.sound;
  $("soundButton").textContent = state.sound ? "🔊" : "🔇";
  $("soundButton").setAttribute("aria-pressed", String(state.sound));
  $("soundButton").setAttribute("aria-label", state.sound ? "إيقاف الصوت" : "تشغيل الصوت");
});

$("showCertButton").addEventListener("click", openCertificate);
$("closeCertButton")?.addEventListener("click", closeCertificate);
$("printCertButton")?.addEventListener("click", () => window.print());
$("saveCertificateButton")?.addEventListener("click", saveCurrentCertificateToPortfolio);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("certModal") && !$("certModal").hidden) {
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
$("setupBackLink").addEventListener("click", (event) => event.preventDefault());
$("gameHomeLink").addEventListener("click", (event) => event.preventDefault());
$("gameBackLink").addEventListener("click", (event) => event.preventDefault());
$("bestScoreText").textContent = "تُحفظ نتيجة كل جولة في حسابكِ على مدار.";
showScreen("setup");
Promise.all([detectStudent(), loadGameConfig()]);
