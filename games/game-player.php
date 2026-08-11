<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/config/bootstrap.php';
require_once dirname(__DIR__).'/api/shared.php';
require_once dirname(__DIR__).'/api/interactive_games.php';
require_once dirname(__DIR__).'/api/interactive_game_builder.php';

function game_player_error(string $message,int $status=400): never
{
    http_response_code($status);
    $safe=htmlspecialchars($message,ENT_QUOTES,'UTF-8');
    echo '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تعذّر فتح اللعبة</title><style>body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#f7f4fb;color:#321c55;display:grid;place-items:center;min-height:100vh}.box{width:min(560px,calc(100% - 32px));background:#fff;border:1px solid #e4dcf0;border-radius:22px;padding:32px;text-align:center;box-shadow:0 18px 50px #4b25831a}.box img{width:76px}.box a{display:inline-flex;margin-top:18px;background:#55249a;color:#fff;padding:11px 20px;border-radius:12px;text-decoration:none}</style><main class="box"><img src="/assets/print/madar-official-logo-transparent.png" alt="شعار مدار"><h1>تعذّر فتح اللعبة</h1><p>'.$safe.'</p><a href="/">العودة إلى مدار</a></main></html>';
    exit;
}

try {
    if(!interactive_game_builder_schema_ready()) game_player_error('يلزم تجهيز بنية الألعاب التفاعلية أولًا.',503);
    $user=Auth::user();if(!$user) game_player_error('يرجى تسجيل الدخول أولًا.',401);
    $gameId=filter_var($_GET['game']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if($gameId===false||$gameId===null)game_player_error('معرّف اللعبة غير صالح.');
    $preview=filter_var($_GET['preview']??false,FILTER_VALIDATE_BOOLEAN);
    $certificateId=filter_var($_GET['certificate']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);$certificateId=$certificateId===false?null:$certificateId;
    $certificateView=($user['role']??'')==='student'&&!$preview&&$certificateId!==null;
    $game=fetch_one('SELECT * FROM teacher_interactive_games WHERE id=? LIMIT 1',[(int)$gameId]);if(!$game)game_player_error('اللعبة المطلوبة غير موجودة.',404);
    $publication=null;$player=[];$backPath='/';
    if(($user['role']??'')==='teacher') {
        if(!$preview||!empty($game['deleted_at'])||(int)$game['teacher_id']!==(int)$user['id']||!Rbac::allows((string)$user['roleCode'],'school_settings.manage')) game_player_error('لا تملكين صلاحية معاينة هذه اللعبة.',403);
        $versionId=(int)($game['current_version_id']??0);$backPath='/teacher/';
        $settings=fetch_one('SELECT teacher_name,school_leader_name,current_semester,academic_year FROM teacher_school_settings WHERE teacher_id=? LIMIT 1',[(int)$user['id']])?:[];
        $player=['studentName'=>'معاينة المعلمة','teacherName'=>trim((string)($settings['teacher_name']??$user['name']??'')),'schoolLeaderName'=>trim((string)($settings['school_leader_name']??'')),'academicYear'=>trim((string)($settings['academic_year']??''))];
    } elseif(($user['role']??'')==='student'&&!$preview) {
        $student=fetch_one('SELECT s.id,s.name AS student_name,c.id AS class_id,c.teacher_id,c.stage,c.grade_label,c.name AS class_name,c.academic_year,t.name AS teacher_account_name FROM students s JOIN classes c ON c.id=s.class_id JOIN teachers t ON t.id=c.teacher_id WHERE s.id=? AND s.deleted_at IS NULL LIMIT 1',[(int)$user['id']]);
        if(!$student)game_player_error('تعذّر تحديد فصل الطالبة.',403);
        $settings=fetch_one('SELECT teacher_name,school_leader_name,current_semester,academic_year FROM teacher_school_settings WHERE teacher_id=? LIMIT 1',[(int)$student['teacher_id']])?:[];
        if($certificateView) {
            $saved=fetch_one('SELECT certificate_key,certificate_data_json FROM student_portfolio_files WHERE id=? AND student_id=? AND certificate_key IS NOT NULL LIMIT 1',[(int)$certificateId,(int)$user['id']]);
            $certificate=$saved?json_decode((string)$saved['certificate_data_json'],true):null;
            $attemptId=is_array($certificate)?filter_var($certificate['attemptId']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]):false;
            $attempt=$attemptId?fetch_one('SELECT game_id,game_version_id,game_key FROM game_attempts WHERE id=? AND student_id=? LIMIT 1',[(int)$attemptId,(int)$user['id']]):null;
            if(!$saved||!is_array($certificate)||!$attempt||(int)($attempt['game_id']??0)!==(int)$gameId||(string)$attempt['game_key']!==(string)$game['game_key'])game_player_error('هذه الشهادة غير موجودة ضمن ملف إنجازكِ.',403);
            $versionId=(int)($attempt['game_version_id']??0);
        } else {
            if(!empty($game['deleted_at']))game_player_error('هذه اللعبة غير متاحة حاليًا.',404);
            $publication=fetch_one("SELECT * FROM interactive_game_publications WHERE game_id=? AND class_id=? AND academic_year=? AND semester=? AND status='published' LIMIT 1",[(int)$gameId,(int)$student['class_id'],(string)$student['academic_year'],(string)($settings['current_semester']??'')]);
            if(!$publication||(string)($game['lifecycle_status']??'')!=='published')game_player_error('هذه اللعبة غير منشورة لفصلكِ في الفصل الدراسي الحالي.',403);
            $versionId=(int)$publication['version_id'];
        }
        $backPath='/student/';
        $teacherName=trim((string)($settings['teacher_name']??''));if($teacherName==='')$teacherName=trim((string)$student['teacher_account_name']);
        $player=['studentName'=>(string)$student['student_name'],'teacherName'=>$teacherName,'schoolLeaderName'=>trim((string)($settings['school_leader_name']??'')),'stageLabel'=>(string)$student['stage'],'gradeLabel'=>(string)$student['grade_label'],'className'=>(string)$student['class_name'],'academicYear'=>trim((string)($settings['academic_year']??$student['academic_year'])),'semesterLabel'=>(string)($settings['current_semester']??'')==='second'?'الفصل الدراسي الثاني':'الفصل الدراسي الأول'];
    } else game_player_error('هذه الصفحة مخصصة للطالبة أو لمعاينة المعلمة.',403);
    if($versionId<1)game_player_error('لا يوجد إصدار جاهز لهذه اللعبة.');
    $version=fetch_one('SELECT * FROM interactive_game_versions WHERE id=? AND game_id=? LIMIT 1',[$versionId,(int)$gameId]);
    if(!$version)game_player_error('إصدار اللعبة غير موجود.',404);
    if((string)$version['validation_status']!=='ready')game_player_error((string)($version['validation_message']?:'هذه اللعبة تحتاج تهيئة واجهة الربط قبل تشغيلها.'));
    $gameJson=interactive_game_builder_game_json(interactive_game_builder_with_version($game,$version));$gameJson['currentVersionId']=$versionId;
    $packageAccess=(string)$version['source_type']==='package'&&!$certificateView?interactive_game_package_issue_access($versionId):'';
    $frameUrl=$certificateView?'/games/template-frame.php':((string)$version['source_type']==='package'
        ? '/game-content/'.$versionId.'/'.$packageAccess.'/'.implode('/',array_map('rawurlencode',explode('/',(string)$version['entry_file'])))
        : '/games/template-frame.php');
    $previewQuestions=[];
    if($preview&&(string)$version['source_type']==='template') {
        foreach(fetch_all('SELECT * FROM interactive_game_questions WHERE version_id=? ORDER BY sort_order,id',[$versionId]) as $question) {
            $previewQuestions[]=['key'=>(string)$question['question_key'],'type'=>(string)$question['question_type'],'prompt'=>(string)$question['prompt'],'options'=>interactive_game_builder_json_decode($question['options_json'],[]),'correctAnswer'=>interactive_game_builder_json_decode($question['correct_answer_json'],null),'explanation'=>(string)($question['explanation']??''),'points'=>(int)$question['points'],'difficulty'=>(string)$question['difficulty']];
        }
    }
    $config=['game'=>$gameJson,'player'=>$player,'role'=>(string)$user['role'],'preview'=>$preview,'frameUrl'=>$frameUrl,'sourceType'=>(string)$version['source_type'],'channelNonce'=>bin2hex(random_bytes(24)),'previewQuestions'=>$previewQuestions,'backPath'=>$backPath,'certificateId'=>$certificateId];
} catch(Throwable $error) {
    error_log('[game-player] '.$error->getMessage());game_player_error('تعذّر تحميل اللعبة حاليًا. حاولي مرة أخرى بعد التحقق من قاعدة البيانات.',500);
}
$configJson=json_encode($config,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT);
?>
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#542395">
  <title><?=htmlspecialchars((string)$gameJson['name'],ENT_QUOTES,'UTF-8')?> | مدار</title>
  <link rel="stylesheet" href="/assets/css/game-player.css?v=20260810">
</head>
<body>
  <header class="madar-player-header">
    <a href="<?=htmlspecialchars($backPath,ENT_QUOTES,'UTF-8')?>" class="madar-player-brand"><img src="/assets/print/madar-official-logo-transparent.png" alt="شعار مدار"><span><strong>مدار</strong><small><?= $preview ? 'معاينة اللعبة' : 'الألعاب التفاعلية' ?></small></span></a>
    <div class="madar-player-heading"><strong><?=htmlspecialchars((string)$gameJson['name'],ENT_QUOTES,'UTF-8')?></strong><small><?=htmlspecialchars((string)$gameJson['unitNumber'].'-'.(string)$gameJson['lessonNumber'].' · '.(string)$gameJson['lessonName'],ENT_QUOTES,'UTF-8')?></small></div>
    <a href="<?=htmlspecialchars($backPath,ENT_QUOTES,'UTF-8')?>" class="madar-player-back">العودة إلى الألعاب</a>
  </header>
  <main class="madar-player-shell">
    <div class="madar-player-status" id="madarPlayerStatus" role="status">جارٍ تهيئة اللعبة…</div>
    <iframe id="madarGameFrame" class="madar-game-frame" title="<?=htmlspecialchars((string)$gameJson['name'],ENT_QUOTES,'UTF-8')?>" sandbox="allow-scripts" referrerpolicy="no-referrer" src="<?=htmlspecialchars($frameUrl,ENT_QUOTES,'UTF-8')?>"></iframe>
  </main>
  <div id="madarCertificateMount"></div>
  <script id="madarPlayerConfig" type="application/json"><?=$configJson?></script>
  <script src="/assets/js/madar-game-host.js?v=20260810"></script>
</body>
</html>
