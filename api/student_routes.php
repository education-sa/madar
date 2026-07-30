<?php
declare(strict_types=1);

function handle_student_routes(string $method,array $segments): never
{
    $resource=$segments[0]??'';
    if ($resource==='login'&&$method==='POST') public_login('student');
    if ($resource==='registration-options'&&$method==='GET') student_registration_options();
    if ($resource==='register'&&$method==='POST') student_register_request();
    if ($resource==='password-reset-request'&&$method==='POST') public_password_reset_request('STUDENT');
    if ($resource==='logout'&&$method==='POST') logout_route('student');
    if ($resource==='me'&&$method==='GET') me_route('student');

    $student=Auth::requireRole('student');
    if (!in_array($method,['GET','HEAD'],true)) Auth::verifyCsrf();
    $studentPermission=match($resource) {
        'dashboard' => 'dashboard.view',
        'tests' => 'student.tests.use',
        'games' => 'student.games.use',
        'learning-style', 'password' => 'student.profile.use',
        'results' => 'student.results.view',
        'points' => 'student.points.view',
        'portfolio', 'knowledge-exchange' => 'student.files.use',
        'privacy','enhancements' => 'dashboard.view',
        default => 'dashboard.view',
    };
    Auth::requirePermission($studentPermission,false);
    $studentId=(int)$student['id'];
    if ($resource==='dashboard'&&$method==='GET') student_dashboard($studentId);
    if ($resource==='tests') student_tests_routes($method,array_slice($segments,1),$studentId);
    if ($resource==='games') student_games_routes($method,array_slice($segments,1),$studentId);
    if ($resource==='learning-style') student_learning_style_routes($method,array_slice($segments,1),$studentId);
    if ($resource==='password'&&$method==='PUT') student_change_password($studentId);
    if ($resource==='results'&&$method==='GET') student_results($studentId);
    if ($resource==='points'&&$method==='GET') student_madar_points($studentId);
    if ($resource==='portfolio') student_portfolio_routes($method,array_slice($segments,1),$studentId);
    if ($resource==='privacy') platform_privacy_routes('student',$studentId,$method);
    if ($resource==='enhancements') student_enhancement_routes($method,array_slice($segments,1),$studentId);
    if ($resource==='knowledge-exchange') student_knowledge_exchange_routes($method,array_slice($segments,1),$studentId);
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function student_games_routes(string $method,array $segments,int $studentId): never
{
    ensure_platform_enhancement_schema();
    if (($segments[0]??'')!=='attempts') Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
    if ($method==='GET') {
        Http::json(fetch_all('SELECT id,game_key,difficulty,score,question_count,correct_count,best_streak,accuracy,duration_seconds,played_at FROM game_attempts WHERE student_id=? ORDER BY played_at DESC LIMIT 30',[$studentId]));
    }
    if ($method!=='POST') Http::json(['error'=>'الطريقة غير مسموحة.'],405);

    $data=Http::input();
    Http::requireFields($data,['gameKey','difficulty','score','questionCount','correctCount','bestStreak','durationSeconds']);
    $gameKey=(string)$data['gameKey'];
    $difficulty=(string)$data['difficulty'];
    $score=(int)$data['score'];
    $questionCount=(int)$data['questionCount'];
    $correctCount=(int)$data['correctCount'];
    $bestStreak=(int)$data['bestStreak'];
    $durationSeconds=(int)$data['durationSeconds'];

    if ($gameKey!=='percentage-challenge' || !in_array($difficulty,['easy','medium','hard'],true)) {
        Http::json(['error'=>'بيانات اللعبة غير صالحة.'],422);
    }
    if (!in_array($questionCount,[5,10,15],true) || $correctCount<0 || $correctCount>$questionCount || $bestStreak<0 || $bestStreak>$correctCount) {
        Http::json(['error'=>'نتيجة المحاولة غير صالحة.'],422);
    }
    if ($score<0 || $score>100000 || $durationSeconds<1 || $durationSeconds>7200) {
        Http::json(['error'=>'قيمة النقاط أو الوقت غير صالحة.'],422);
    }

    $accuracy=round(($correctCount/$questionCount)*100,2);
    execute_sql('INSERT INTO game_attempts (student_id,game_key,difficulty,score,question_count,correct_count,best_streak,accuracy,duration_seconds) VALUES (?,?,?,?,?,?,?,?,?)',[$studentId,$gameKey,$difficulty,$score,$questionCount,$correctCount,$bestStreak,$accuracy,$durationSeconds]);
    $attemptId=(int)Database::connection()->lastInsertId();
    execute_sql('UPDATE students SET last_active=NOW() WHERE id=?',[$studentId]);
    Activity::log('student',$studentId,'إكمال لعبة','تحدي النسبة المئوية - '.$accuracy.'%');
    Http::json(['id'=>$attemptId,'accuracy'=>$accuracy,'saved'=>true],201);
}

function student_change_password(int $studentId): never
{
    $data=Http::input();
    Http::requireFields($data,['currentPassword','newPassword','confirmPassword']);
    if ((string)$data['newPassword'] !== (string)$data['confirmPassword']) {
        Http::json(['error'=>'كلمتا المرور الجديدة غير متطابقتين.'],422);
    }
    Auth::validatePassword((string)$data['newPassword']);
    $record=fetch_one('SELECT password_hash FROM students WHERE id=?',[$studentId]);
    if (!$record || empty($record['password_hash']) || !password_verify((string)$data['currentPassword'],(string)$record['password_hash'])) {
        Http::json(['error'=>'كلمة المرور الحالية غير صحيحة.'],422);
    }
    execute_sql('UPDATE students SET password_hash=?,must_change_password=0 WHERE id=?',[password_hash((string)$data['newPassword'],PASSWORD_DEFAULT),$studentId]);
    Activity::log('student',$studentId,'تغيير كلمة المرور');
    Http::json(['ok'=>true]);
}

function student_dashboard(int $studentId): never
{
    ensure_teacher_tools_schema();
    $student=fetch_one('SELECT s.id,s.name,s.stage,s.grade_label,s.learning_style,s.progress_percent,c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?',[$studentId]);
    $available=(int)(fetch_one("SELECT COUNT(*) AS n FROM tests t JOIN students s ON s.class_id=t.class_id WHERE s.id=? AND t.status='published' AND (t.start_at IS NULL OR t.start_at<=NOW()) AND (t.end_at IS NULL OR t.end_at>=NOW()) AND ((SELECT COUNT(*) FROM test_attempts a WHERE a.test_id=t.id AND a.student_id=s.id)<t.max_attempts OR EXISTS(SELECT 1 FROM test_attempts a2 WHERE a2.test_id=t.id AND a2.student_id=s.id AND a2.status='in_progress'))",[$studentId])['n']??0);
    $completed=(int)(fetch_one("SELECT COUNT(*) AS n FROM test_attempts WHERE student_id=? AND status IN ('submitted','graded')",[$studentId])['n']??0);
    $recent=fetch_all("SELECT t.id,t.title,t.test_type,a.percentage,a.submitted_at FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE a.student_id=? AND a.status='graded' ORDER BY a.submitted_at DESC LIMIT 5",[$studentId]);
    $skills=fetch_all('SELECT sk.name,ss.mastery_percent FROM student_skills ss JOIN skills sk ON sk.id=ss.skill_id WHERE ss.student_id=? ORDER BY ss.mastery_percent DESC LIMIT 8',[$studentId]);
    $totalPoints=(int)(fetch_one('SELECT COALESCE(SUM(points),0) AS total FROM motivational_points WHERE student_id=?',[$studentId])['total']??0);
    Http::json(compact('student','available','completed','recent','skills','totalPoints'));
}

function student_madar_points(int $studentId): never
{
    ensure_teacher_tools_schema();
    $categories=madar_point_categories();
    $summary=['all'=>0,'homework'=>0,'participation'=>0,'attendance'=>0,'task'=>0];
    $rows=fetch_all('SELECT id,points,reason_type,reason,details,created_at FROM motivational_points WHERE student_id=? ORDER BY created_at DESC,id DESC LIMIT 200',[$studentId]);
    $history=[];
    foreach($rows as $row) {
        $category=(string)($row['reason_type']??'other');
        if (!isset($categories[$category])) $category='other';
        $points=(int)$row['points'];
        $summary['all']+=$points;
        if (isset($summary[$category])) $summary[$category]+=$points;
        $history[]=[
            'id'=>(int)$row['id'],
            'points'=>$points,
            'category'=>$category,
            'categoryLabel'=>$categories[$category],
            'reason'=>(string)$row['reason'],
            'details'=>$row['details']===null?'':(string)$row['details'],
            'createdAt'=>$row['created_at'],
        ];
    }
    Http::json(['total'=>$summary['all'],'summary'=>$summary,'history'=>$history]);
}

function student_tests_routes(string $method,array $segments,int $studentId): never
{
    ensure_diagnostic_bank_schema();
    if (!$segments&&$method==='GET') {
        $rows=fetch_all(
            "SELECT t.id,t.title,t.test_type AS type,t.duration_minutes,t.total_points,t.start_at,t.end_at,t.max_attempts,t.question_source,
                    CASE WHEN t.question_source='lesson_bank' THEN t.expected_lesson_count
                         ELSE (SELECT COUNT(*) FROM test_questions q WHERE q.test_id=t.id) END AS question_count,
                    (SELECT COUNT(*) FROM test_attempts a WHERE a.test_id=t.id AND a.student_id=?) AS attempts_used,
                    (SELECT COUNT(*) FROM test_attempts a WHERE a.test_id=t.id AND a.student_id=? AND a.status='in_progress') AS active_attempt
             FROM tests t JOIN students s ON s.class_id=t.class_id WHERE s.id=? AND t.status='published'
             AND (t.start_at IS NULL OR t.start_at<=NOW()) AND (t.end_at IS NULL OR t.end_at>=NOW()) ORDER BY t.created_at DESC",[$studentId,$studentId,$studentId]
        );
        Http::json($rows);
    }
    $testId=route_id($segments,0);
    $test=fetch_one(
        "SELECT t.* FROM tests t JOIN students s ON s.class_id=t.class_id WHERE t.id=? AND s.id=? AND t.status='published' AND (t.start_at IS NULL OR t.start_at<=NOW()) AND (t.end_at IS NULL OR t.end_at>=NOW())",[$testId,$studentId]
    );
    if (!$test) Http::json(['error'=>'الاختبار غير متاح.'],404);
    if (($segments[1]??'')==='submit'&&$method==='POST') student_submit_test($studentId,$test);
    if (($segments[1]??'')===''&&$method==='GET') {
        $duration=(int)$test['duration_minutes'];
        $active=fetch_one("SELECT id,attempt_no,distribution_version,distribution_ordinal,started_at,total_points FROM test_attempts WHERE test_id=? AND student_id=? AND status='in_progress' ORDER BY id DESC LIMIT 1",[$testId,$studentId]);
        if ($active) {
            $active['deadline_at']=$duration>0?(fetch_one('SELECT DATE_ADD(?,INTERVAL ? MINUTE) AS deadline_at',[$active['started_at'],$duration])['deadline_at']??null):null;
            $expired=$duration>0?(int)(fetch_one('SELECT NOW()>DATE_ADD(?,INTERVAL ? MINUTE) AS expired',[$active['deadline_at'],5])['expired']??0):0;
            if ($expired) {
                execute_sql("UPDATE test_attempts SET status='graded',submitted_at=NOW(),graded_at=NOW(),score=0,percentage=0 WHERE id=?",[$active['id']]);
                $active=null;
            }
        }
        $attempts=(int)(fetch_one('SELECT COUNT(*) AS n FROM test_attempts WHERE test_id=? AND student_id=?',[$testId,$studentId])['n']??0);
        if (!$active&&$attempts>=(int)$test['max_attempts']) Http::json(['error'=>'تم استخدام جميع المحاولات المسموحة.'],403);
        if (!$active) {
            $attemptNo = $attempts + 1;
            $studentOrdinal = diagnostic_student_ordinal($test, $studentId);
            $snapshotRows = build_attempt_question_rows($test, $studentId, $attemptNo, $studentOrdinal);
            $attemptId = Database::transaction(function(PDO $pdo) use($testId, $studentId, $attemptNo, $studentOrdinal, $snapshotRows): int {
                $statement = $pdo->prepare(
                    "INSERT INTO test_attempts (test_id,student_id,attempt_no,distribution_version,distribution_ordinal,status,total_points,started_at)
                     VALUES (?,?,?,?,?,'in_progress',0,NOW())"
                );
                $statement->execute([
                    $testId,
                    $studentId,
                    $attemptNo,
                    DIAGNOSTIC_DISTRIBUTION_VERSION,
                    $studentOrdinal,
                ]);
                $id = (int)$pdo->lastInsertId();
                persist_attempt_question_rows($pdo, $id, $snapshotRows);
                return $id;
            });
            $active = fetch_one(
                'SELECT id,attempt_no,distribution_version,distribution_ordinal,started_at,total_points FROM test_attempts WHERE id=?',
                [$attemptId]
            );
            $active['deadline_at'] = $duration > 0
                ? (fetch_one('SELECT DATE_ADD(?,INTERVAL ? MINUTE) AS deadline_at', [$active['started_at'], $duration])['deadline_at'] ?? null)
                : null;
        } else {
            $currentSnapshot = fetch_all(
                'SELECT bank_question_id,source_question_id FROM test_attempt_questions WHERE attempt_id=? ORDER BY order_index',
                [$active['id']]
            );
            // بمجرد بدء المحاولة يصبح نموذج الأسئلة لقطة ثابتة لا تتغير عند
            // إغلاق الصفحة أو إعادة فتحها، حتى بعد تحديث خوارزمية التوزيع.
            // لا ننشئ الأسئلة من جديد إلا إذا كانت اللقطة مفقودة فعليًا.
            if (!$currentSnapshot) {
                $studentOrdinal = $active['distribution_ordinal'] === null
                    ? diagnostic_student_ordinal($test, $studentId)
                    : (int)$active['distribution_ordinal'];
                $snapshotRows = build_attempt_question_rows(
                    $test,
                    $studentId,
                    (int)$active['attempt_no'],
                    $studentOrdinal
                );
                Database::transaction(function(PDO $pdo) use($active, $studentOrdinal, $snapshotRows): void {
                    $pdo->prepare('DELETE FROM test_attempt_questions WHERE attempt_id=?')
                        ->execute([(int)$active['id']]);
                    persist_attempt_question_rows($pdo, (int)$active['id'], $snapshotRows);
                    $pdo->prepare(
                        'UPDATE test_attempts SET distribution_version=?,distribution_ordinal=? WHERE id=?'
                    )->execute([
                        DIAGNOSTIC_DISTRIBUTION_VERSION,
                        $studentOrdinal,
                        (int)$active['id'],
                    ]);
                });
                $active['distribution_version'] = DIAGNOSTIC_DISTRIBUTION_VERSION;
                $active['distribution_ordinal'] = $studentOrdinal;
            }
        }
        $questions=array_map(static function(array $q):array{$mapped=map_question_row($q);return $mapped;},fetch_all('SELECT id,lesson_code,skill_name,question_type AS type,question_text,options_json,points,order_index FROM test_attempt_questions WHERE attempt_id=? ORDER BY order_index',[$active['id']]));
        $attemptTotal=(float)(fetch_one('SELECT total_points FROM test_attempts WHERE id=?',[$active['id']])['total_points']??$test['total_points']);
        Http::json([
            'id'=>(int)$test['id'],
            'attemptId'=>(int)$active['id'],
            'title'=>$test['title'],
            'stage'=>(string)($test['bank_stage']??''),
            'durationMinutes'=>(int)$test['duration_minutes'],
            'deadlineAt'=>$active['deadline_at'],
            'totalPoints'=>$attemptTotal,
            'distributionVersion'=>(int)($active['distribution_version']??0),
            'formNumber'=>((int)($active['distribution_ordinal']??0))+1,
            'questions'=>$questions,
        ]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function student_submit_test(int $studentId,array $test): never
{
    $data=Http::input();$submitted=is_array($data['answers']??null)?$data['answers']:[];
    $attemptId=(int)($data['attemptId']??0);
    $attempt=fetch_one("SELECT id,attempt_no,started_at,TIMESTAMPDIFF(SECOND,started_at,NOW()) AS elapsed_seconds FROM test_attempts WHERE id=? AND test_id=? AND student_id=? AND status='in_progress'",[$attemptId,$test['id'],$studentId]);
    if (!$attempt) Http::json(['error'=>'هذه المحاولة غير صالحة أو سبق تسليمها.'],409);
    if ((int)$test['duration_minutes']>0&&(int)$attempt['elapsed_seconds']>((int)$test['duration_minutes']*60)+300) Http::json(['error'=>'انتهى وقت الاختبار.'],409);
    $questions=fetch_all('SELECT * FROM test_attempt_questions WHERE attempt_id=? ORDER BY order_index',[$attemptId]);
    if (!$questions) Http::json(['error'=>'تعذّر العثور على أسئلة هذه المحاولة.'],409);
    $byId=[];foreach($questions as $q)$byId[(int)$q['id']]=$q;
    $answersById=[];foreach($submitted as $ans)$answersById[(int)($ans['questionId']??0)]=(string)($ans['answerText']??'');

    $result=Database::transaction(function(PDO $pdo) use($studentId,$test,$attemptId,$byId,$answersById): array {
        $total=0.0;$score=0.0;$skillScores=[];$reviewPending=0;
        foreach($byId as $q)$total+=(float)$q['points'];
        $insert=$pdo->prepare('INSERT INTO answers (attempt_id,question_id,attempt_question_id,answer_text,is_correct,review_required,points_earned) VALUES (?,?,?,?,?,?,?)');
        foreach($byId as $id=>$q){
            $raw=$answersById[$id]??'';$normalized=normalize_answer($raw);$validAnswers=array_filter(array_map('normalize_answer',explode('|',(string)$q['correct_answer'])));
            $correct=in_array($normalized,$validAnswers,true);$earned=$correct?(float)$q['points']:0.0;$review=($q['question_type']==='short_answer'&&!$correct)?1:0;$reviewPending+=$review;$score+=$earned;
            $insert->execute([$attemptId,$q['source_question_id']??null,$id,$raw,$correct?1:0,$review,$earned]);
            if (!empty($q['skill_id'])) {$sid=(int)$q['skill_id'];$skillScores[$sid]['earned']=($skillScores[$sid]['earned']??0)+$earned;$skillScores[$sid]['total']=($skillScores[$sid]['total']??0)+(float)$q['points'];}
        }
        $percent=$total>0?round(100*$score/$total,2):0;
        $pdo->prepare("UPDATE test_attempts SET score=?,total_points=?,percentage=?,status='graded',submitted_at=NOW(),graded_at=NOW() WHERE id=? AND status='in_progress'")->execute([$score,$total,$percent,$attemptId]);
        $upsert=$pdo->prepare('INSERT INTO student_skills (student_id,skill_id,mastery_percent,evidence_count) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE mastery_percent=((mastery_percent*evidence_count)+VALUES(mastery_percent))/(evidence_count+1),evidence_count=evidence_count+1');
        foreach($skillScores as $sid=>$values){$mastery=$values['total']>0?round(100*$values['earned']/$values['total'],2):0;$upsert->execute([$studentId,$sid,$mastery]);}
        $pdo->prepare("UPDATE students SET progress_percent=(SELECT COALESCE(AVG(percentage),0) FROM test_attempts WHERE student_id=? AND status='graded'),last_active=NOW() WHERE id=?")->execute([$studentId,$studentId]);
        return ['attemptId'=>$attemptId,'score'=>$score,'totalPoints'=>$total,'percentage'=>$percent,'showResult'=>(bool)$test['show_result'],'reviewPending'=>$reviewPending];
    });
    $result['skillResults']=attempt_skill_results($attemptId);
    Activity::log('student',$studentId,'تسليم اختبار',"الاختبار رقم {$test['id']}");
    $notification=fetch_one('SELECT t.teacher_id,t.title,s.name AS student_name FROM tests t JOIN students s ON s.id=? WHERE t.id=?',[$studentId,$test['id']]);
    if($notification) execute_sql('INSERT INTO notifications (teacher_id,title,body) VALUES (?,?,?)',[$notification['teacher_id'],'نتيجة اختبار جديدة',$notification['student_name'].' سلّمت اختبار '.$notification['title'].' بنسبة '.$result['percentage'].'%']);
    Http::json($result,201);
}

function student_results(int $studentId): never
{
    ensure_diagnostic_bank_schema();
    $rows=fetch_all('SELECT a.id,t.title,t.test_type AS type,a.score,a.total_points,a.percentage,a.submitted_at FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE a.student_id=? AND a.status=\'graded\' ORDER BY a.submitted_at DESC',[$studentId]);
    foreach($rows as &$row)$row['skillResults']=attempt_skill_results((int)$row['id']);
    unset($row);
    Http::json($rows);
}


