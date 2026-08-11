<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/config/bootstrap.php';
$user=Auth::user();
if(!$user||!in_array((string)($user['role']??''),['teacher','student'],true)){http_response_code(401);exit;}
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; object-src 'none'");
?>
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>لعبة تفاعلية | مدار</title>
  <link rel="stylesheet" href="/assets/css/madar-template-player.css?v=20260810">
</head>
<body>
  <main class="template-game-shell">
    <section class="template-screen is-active" id="templateSetup">
      <div class="template-mark">✦</div><small id="templateLessonMeta">—</small><h1 id="templateGameName">جارٍ تحميل اللعبة…</h1><p id="templateDescription"></p>
      <div class="template-setup-card">
        <h2>اختاري مستوى التحدي</h2><div class="template-levels" id="templateLevels"></div>
        <p class="template-question-count" id="templateQuestionCount"></p>
        <button class="template-primary" id="templateStart" type="button" disabled>ابدئي التحدي</button>
      </div>
    </section>
    <section class="template-screen" id="templatePlay">
      <header class="template-play-head"><div><span id="templateCounter">—</span><strong id="templateLevelLabel">—</strong></div><div class="template-progress"><i id="templateProgress"></i></div><div class="template-score"><small>الدرجة</small><strong id="templateScore">٠</strong></div></header>
      <article class="template-question-card"><span class="template-type" id="templateQuestionType">—</span><h2 id="templatePrompt">—</h2><div id="templateAnswerArea"></div><div class="template-feedback" id="templateFeedback" hidden><strong id="templateFeedbackTitle"></strong><p id="templateExplanation"></p><button class="template-primary" id="templateNext" type="button">التالي</button></div></article>
    </section>
    <section class="template-screen" id="templateResult">
      <div class="template-result-icon">🏆</div><h1>اكتملت الجولة</h1><p id="templateResultMessage"></p><div class="template-result-grid"><article><small>الدرجة</small><strong id="templateFinalScore">—</strong></article><article><small>الإجابات الصحيحة</small><strong id="templateFinalCorrect">—</strong></article><article><small>الدقة</small><strong id="templateFinalAccuracy">—</strong></article><article><small>الوقت</small><strong id="templateFinalDuration">—</strong></article></div><div class="template-result-actions"><button class="template-primary" id="templateCertificate" type="button" hidden>عرض شهادة الإتقان</button><button class="template-secondary" id="templateReplay" type="button">جولة جديدة</button></div><p id="templateSaveStatus"></p>
    </section>
    <div class="template-toast" id="templateToast" role="status"></div>
  </main>
  <script src="/assets/js/madar-game-bridge-v1.js?v=20260810"></script>
  <script src="/assets/js/madar-template-player.js?v=20260810"></script>
</body>
</html>
