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
};

const levelConfig = {
  easy: { label: "المستوى المبتدئ", seconds: 25, multiplier: 1 },
  medium: { label: "المستوى المتوسط", seconds: 22, multiplier: 1.35 },
  hard: { label: "المستوى المحترف", seconds: 28, multiplier: 1.75 },
};

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (items) => items[Math.floor(Math.random() * items.length)];
const roundSmart = (value) => Number.isInteger(value) ? value : Number(value.toFixed(1));
const formatNumber = (value) => new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(value);

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
  state.question = createQuestion();
  state.questionTime = levelConfig[state.level].seconds;
  state.timeLeft = state.questionTime;
  
  $("questionCounter").textContent = `السؤال ${state.index + 1} من ${state.total}`;
  $("levelLabel").textContent = levelConfig[state.level].label;
  $("progressBar").style.width = `${(state.index / state.total) * 100}%`;
  
  $("questionSkill").textContent = state.question.skill;
  $("questionPoints").textContent = `+${Math.round(100 * levelConfig[state.level].multiplier)} نقطة`;
  
  $("questionVisual").innerHTML = `<div class="percent-circle-ring">✦</div>`;
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
    button.addEventListener("click", () => handleAnswer(option.value, button));
    grid.appendChild(button);
  });

  updateTimerUI();
  state.timer = setInterval(() => {
    state.timeLeft -= 1;
    updateTimerUI();
    if (state.timeLeft <= 0) {
      clearInterval(state.timer);
      handleAnswer(null, null);
    }
  }, 1000);
}

function updateTimerUI() {
  $("timerValue").textContent = Math.max(0, state.timeLeft);
  const percent = Math.max(0, (state.timeLeft / state.questionTime) * 100);
  $("timerRing").style.setProperty("--timer-progress", `${percent}%`);
}

function handleAnswer(selectedValue, targetButton) {
  if (state.answered) return;
  state.answered = true;
  clearInterval(state.timer);

  const isCorrect = selectedValue !== null && Math.abs(selectedValue - state.question.answer) < 0.01;
  const buttons = $("answerGrid").querySelectorAll("button");

  buttons.forEach((button, idx) => {
    button.disabled = true;
    const option = state.question.options[idx];
    if (Math.abs(option.value - state.question.answer) < 0.01) button.classList.add("correct");
  });

  if (isCorrect) {
    if (targetButton) targetButton.classList.add("correct");
    state.correct += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    const speedBonus = Math.round(state.timeLeft * 4);
    const streakBonus = Math.min(50, Math.max(0, state.streak - 1) * 10);
    state.score += Math.round((100 + speedBonus + streakBonus) * levelConfig[state.level].multiplier);
    $("feedbackIcon").textContent = "✓";
    $("feedbackTitle").textContent = state.streak >= 3 ? `رائعة جداً! سلسلة ${state.streak} صحيحة 🔥` : "إجابة صحيحة!";
    $("questionCard").classList.add("pulse-correct");
    playTone("correct");
  } else {
    if (targetButton) targetButton.classList.add("wrong");
    state.streak = 0;
    $("feedbackIcon").textContent = state.timeLeft <= 0 ? "⏱" : "×";
    $("feedbackTitle").textContent = state.timeLeft <= 0 ? "انتهى الوقت" : "ليست الإجابة الصحيحة";
    $("feedback").classList.add("wrong");
    $("questionCard").classList.add("shake-wrong");
    playTone("wrong");
  }

  $("scoreValue").textContent = state.score;
  $("streakValue").textContent = state.streak;
  $("feedbackExplanation").textContent = state.question.explanation;
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

function startGame() {
  Object.assign(state, { index: 0, score: 0, correct: 0, streak: 0, bestStreak: 0, answered: false, startedAt: Date.now() });
  $("scoreValue").textContent = "0";
  $("streakValue").textContent = "0";
  showScreen("play");
  renderQuestion();
}

function formatDurationArabic(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} ثانية`;
  if (secs === 0) return `${mins} ${mins === 1 ? "دقيقة" : mins === 2 ? "دقيقتين" : "دقائق"}`;
  return `${mins} ${mins === 1 ? "دقيقة" : mins === 2 ? "دقيقتين" : "دقائق"} و ${secs} ثانية`;
}

function finishGame() {
  clearInterval(state.timer);
  const duration = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
  state.lastDuration = duration;
  const accuracy = Math.round((state.correct / state.total) * 100);
  state.lastAccuracy = accuracy;
  
  const bestKey = `madar-percentage-best-${state.level}`;
  const previousBest = Number(localStorage.getItem(bestKey) || 0);
  if (state.score > previousBest) localStorage.setItem(bestKey, String(state.score));

  $("finalScore").textContent = state.score;
  $("correctResult").textContent = `${state.correct} / ${state.total}`;
  $("accuracyResult").textContent = `${accuracy}%`;
  $("streakResult").textContent = `${state.bestStreak} 🔥`;
  $("durationResult").textContent = formatDurationArabic(duration);
  
  $("resultBadge").textContent = accuracy >= 90 ? "🏆" : accuracy >= 70 ? "⭐" : "🚀";
  $("resultTitle").textContent = accuracy >= 90 ? "مبارك الإنجاز والتفوق!" : accuracy >= 70 ? "أحسنتِ وصنعتِ نتيجة ممتازة!" : "بداية موفقة!";
  $("resultMessage").textContent = accuracy >= 90 ? "أصبحتِ نجمة النسبة المئوية واجتزتِ التحدي بتفوق." : accuracy >= 70 ? "نتيجة جميلة، استخرجي شهادتكِ وحاولي كسر رقمكِ." : "كل جولة تقربكِ أكثر من الإتقان.";
  
  $("saveStatus").textContent = "اكتملت اللعبة بنجاح! جاهزة لاستخراج شهادة الاجتياز المعتمدة باسمكِ.";
  
  createConfetti();
  showScreen("result");
  playTone("finish");
  if (state.student) saveAttempt({ duration, accuracy });
}

/* فتح الشهادة المطابقة للصورة المرفقة بالكامل مع جلب البيانات تلقائياً */
async function openCertificate() {
  await detectStudent();

  if (!state.student || !state.student.name) {
    toast("الشهادة متاحة للطالبات فقط.");
    return;
  }

  const studentName = String(state.student.name).trim();
  const teacherName = (state.student.teacher_name ? String(state.student.teacher_name).trim() : "") || "أ. نورة الشهري";
  const principalName = (state.student.school_leader_name || state.student.principal_name ? String(state.student.school_leader_name || state.student.principal_name).trim() : "") || "أ. سارة العتيبي";

  const formattedDuration = formatDurationArabic(state.lastDuration || 80);
  const scoreText = `${state.score} نقطة`;

  $("displayCertStudentName").textContent = studentName;
  $("displayCertLessonName").textContent = "النسبة المئوية";
  $("displayCertScore").textContent = scoreText;
  $("displayCertDuration").textContent = formattedDuration;
  $("displayCertTeacher").textContent = teacherName;
  $("displayCertPrincipal").textContent = principalName;

  $("certModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function goToPortfolio() {
  sessionStorage.setItem("madar-student-view", "portfolio");
  window.location.assign("/student/index.html");
}

function closeCertificate() {
  $("certModal").hidden = true;
  document.body.style.overflow = "";
}

function sendCertificateToPortfolio() {
  closeCertificate();
  if (state.student && state.student.name) {
    goToPortfolio();
  }
}

function createConfetti() {
  const colors = ["#6337c8", "#26b7b3", "#ff9418", "#ffc53d"];
  $("confetti").innerHTML = Array.from({ length: 34 }, (_, index) => `<i style="right:${Math.random() * 100}%;background:${colors[index % colors.length]};--drift:${(Math.random() - 0.5) * 180}px;animation-delay:${Math.random() * .7}s"></i>`).join("");
}

/* جلب بيانات الطالبة والمعلمة والمديرة تلقائياً من جلسة الموقع */
async function detectStudent() {
  const certButton = $("showCertButton");
  const playerChip = $("playerChip");

  if (state.student && state.student.name) {
    if (playerChip) playerChip.textContent = `الطالبة: ${state.student.name}`;
    if (certButton) certButton.hidden = false;
    return state.student;
  }

  try {
    const response = await fetch("/api/student/me", { headers: { Accept: "application/json" } });
    if (!response.ok) {
      state.student = null;
      state.csrf = "";
      if (playerChip) playerChip.textContent = "الجلوس الحالي ليس لطالب/طالبة";
      if (certButton) certButton.hidden = true;
      return null;
    }

    const data = await response.json();
    state.student = data;
    state.csrf = data.csrfToken || "";
    if (playerChip && data.name) playerChip.textContent = `الطالبة: ${data.name}`;
    if (certButton) certButton.hidden = false;
    return data;
  } catch (_) {
    state.student = null;
    state.csrf = "";
    if (playerChip) playerChip.textContent = "الجلوس الحالي ليس لطالب/طالبة";
    if (certButton) certButton.hidden = true;
    return null;
  }
}

async function saveAttempt({ duration, accuracy }) {
  try {
    const response = await fetch("/api/student/games/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": state.csrf },
      body: JSON.stringify({
        gameKey: "percentage-challenge", difficulty: state.level, score: state.score,
        questionCount: state.total, correctCount: state.correct, bestStreak: state.bestStreak,
        durationSeconds: duration,
      }),
    });
    if (!response.ok) throw new Error("save failed");
  } catch (_) {}
}

document.querySelectorAll("[data-level]").forEach((button) => {
  button.addEventListener("click", () => {
    state.level = button.dataset.level;
    document.querySelectorAll("[data-level]").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-checked", String(selected));
    });
    $("bestScoreText").textContent = `أفضل نتيجة محلياً: ${Number(localStorage.getItem(`madar-percentage-best-${state.level}`) || 0)} نقطة`;
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
  window.location.assign("/");
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
$("sendToPortfolioButton").addEventListener("click", sendCertificateToPortfolio);
$("printCertButton").addEventListener("click", () => window.print());

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("certModal").hidden) {
    closeCertificate();
  }
  if (!screens.play.classList.contains("active")) return;
  if (state.answered && (event.key === "Enter" || event.key === "ArrowLeft")) nextQuestion();
  if (!state.answered && /^[1-4]$/.test(event.key)) $("answerGrid").querySelectorAll("button")[Number(event.key) - 1]?.click();
});

$("soundButton").textContent = state.sound ? "🔊" : "🔇";
$("bestScoreText").textContent = `أفضل نتيجة محلياً: ${Number(localStorage.getItem("madar-percentage-best-easy") || 0)} نقطة`;
closeCertificate();
showScreen("setup");
detectStudent();
