<?php
declare(strict_types=1);

const LIVE_COMPETITIONS_MIGRATION = 'database/migration_20260912_live_competitions.sql';

final class LiveCompetitionHttpError extends RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

function live_competitions_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $tables = fetch_all(
            "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('live_competition_sessions','live_competition_questions','live_competition_participants','live_competition_answers')"
        );
        if (count($tables) !== 4) return $ready = false;
        $required = [
            'live_competition_sessions' => ['id','teacher_id','class_id','status','current_question_no','question_time_seconds','question_started_at','question_ends_at','state_version','leaderboard_version','active_slot'],
            'live_competition_questions' => ['id','session_id','sort_order','question_type','prompt','options_json','correct_option_no'],
            'live_competition_participants' => ['session_id','student_id','joined_at','last_seen_at','score','answered_count','correct_count','total_response_ms','final_rank'],
            'live_competition_answers' => ['session_id','question_id','student_id','selected_option_no','received_at','response_ms','is_correct','base_score','speed_bonus','points'],
        ];
        $columns = fetch_all("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('live_competition_sessions','live_competition_questions','live_competition_participants','live_competition_answers')");
        $seen = []; foreach ($columns as $column) $seen[(string)$column['table_name']][(string)$column['column_name']] = true;
        foreach ($required as $table => $names) foreach ($names as $name) if (empty($seen[$table][$name])) return $ready = false;
        $indexes = fetch_all("SELECT DISTINCT table_name,index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('live_competition_sessions','live_competition_questions','live_competition_answers')");
        $indexSet = []; foreach ($indexes as $index) $indexSet[(string)$index['table_name']][(string)$index['index_name']] = true;
        foreach ([['live_competition_sessions','uq_live_competition_class_active'],['live_competition_questions','uq_live_competition_question_order'],['live_competition_answers','PRIMARY']] as [$table,$index]) if (empty($indexSet[$table][$index])) return $ready = false;
        $ready = true;
    } catch (Throwable) {
        $ready = false;
    }
    return $ready;
}

function live_competitions_require_schema(): void
{
    if (!live_competitions_schema_ready()) {
        Http::json([
            'error' => 'ميزة المسابقات المباشرة تحتاج تشغيل ملف الترحيل أولًا.',
            'migration' => LIVE_COMPETITIONS_MIGRATION,
            'migrationReady' => false,
        ], 503);
    }
}

function live_competitions_cleanup_stale(): void
{
    execute_sql(
        "UPDATE live_competition_sessions
         SET status='cancelled',active_slot=NULL,completed_at=COALESCE(completed_at,NOW()),state_version=state_version+1
         WHERE active_slot=1 AND (
           (status='lobby' AND created_at<DATE_SUB(NOW(),INTERVAL 4 HOUR)) OR
           (status IN ('question_open','question_closed') AND started_at<DATE_SUB(NOW(),INTERVAL 2 HOUR))
         )"
    );
}

function live_competition_normalized(string $value): string
{
    $value = mb_strtolower(trim($value));
    $value = str_replace(['أ','إ','آ','ى','ة','ـ'], ['ا','ا','ا','ي','ه',''], $value);
    return trim(preg_replace('/[^\p{L}\p{N}]+/u', '', $value) ?? $value);
}

function live_competition_question_snapshot(array $row): ?array
{
    $type = (string)($row['question_type'] ?? '');
    if (!in_array($type, ['mcq','true_false'], true)) return null;
    $options = json_options($row['options_json'] ?? null) ?? [];
    if ($type === 'true_false') $options = ['صح','خطأ'];
    $options = array_values(array_filter(array_map(static fn($item): string => trim((string)$item), $options), static fn(string $item): bool => $item !== ''));
    if (count($options) < 2 || count($options) > 4) return null;
    $answer = trim((string)($row['correct_answer'] ?? ''));
    $normalized = live_competition_normalized($answer);
    $letterMap = ['ا'=>1,'a'=>1,'1'=>1,'ب'=>2,'b'=>2,'2'=>2,'ج'=>3,'c'=>3,'3'=>3,'د'=>4,'d'=>4,'4'=>4];
    $correct = $letterMap[$normalized] ?? 0;
    if ($correct < 1 || $correct > count($options)) {
        $correct = 0;
        foreach ($options as $index => $option) {
            if (live_competition_normalized($option) === $normalized) {
                $correct = $index + 1;
                break;
            }
        }
    }
    if ($type === 'true_false') {
        if (in_array($normalized, ['صح','صحيح','true'], true)) $correct = 1;
        if (in_array($normalized, ['خطا','غيرصحيح','false'], true)) $correct = 2;
    }
    if ($correct < 1 || $correct > count($options)) return null;
    return [
        'sourceQuestionId' => (int)$row['id'],
        'questionType' => $type,
        'prompt' => trim((string)$row['question_text']),
        'options' => $options,
        'correctOptionNo' => $correct,
        'explanation' => trim((string)($row['explanation'] ?? '')) ?: null,
        'difficulty' => (string)($row['difficulty'] ?? 'medium'),
        'skillId' => !empty($row['skill_id']) ? (int)$row['skill_id'] : null,
        'unitName' => trim((string)($row['unit_name'] ?? $row['chapter_name'] ?? '')) ?: null,
        'lessonName' => trim((string)($row['lesson_name'] ?? $row['topic'] ?? '')) ?: null,
        'skillName' => trim((string)($row['skill_name'] ?? '')) ?: null,
    ];
}

function live_competition_question_rows(int $teacherId, array $class, array $filters = []): array
{
    $rows = fetch_all(
        "SELECT q.*,sk.name AS skill_name
         FROM question_bank q LEFT JOIN skills sk ON sk.id=q.skill_id
         WHERE q.teacher_id=? AND q.is_active=1 AND q.review_status='approved'
           AND q.question_type IN ('mcq','true_false') AND q.stage=? AND q.grade_label=?
         ORDER BY q.id",
        [$teacherId, (string)$class['stage'], (string)$class['grade_label']]
    );
    $result = [];
    foreach ($rows as $row) {
        $snapshot = live_competition_question_snapshot($row);
        if (!$snapshot) continue;
        if (($filters['unit'] ?? '') !== '' && ($snapshot['unitName'] ?? '') !== $filters['unit']) continue;
        if (($filters['lesson'] ?? '') !== '' && ($snapshot['lessonName'] ?? '') !== $filters['lesson']) continue;
        if (($filters['skillId'] ?? 0) > 0 && (int)($snapshot['skillId'] ?? 0) !== (int)$filters['skillId']) continue;
        if (($filters['difficulty'] ?? '') !== '' && $snapshot['difficulty'] !== $filters['difficulty']) continue;
        $result[] = $snapshot;
    }
    return $result;
}

function live_competition_unique_options(array $rows, string $key): array
{
    $values = [];
    foreach ($rows as $row) {
        $value = trim((string)($row[$key] ?? ''));
        if ($value !== '') $values[$value] = $value;
    }
    natcasesort($values);
    return array_values($values);
}

function live_competition_teacher_class(int $teacherId, int $classId): array
{
    $class = fetch_one('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE id=? AND teacher_id=?', [$classId,$teacherId]);
    if (!$class) Http::json(['error'=>'الفصل غير موجود أو غير تابع لحسابك.'],404);
    return $class;
}

function live_competition_session_teacher(int $teacherId, int $sessionId, bool $forUpdate = false, ?PDO $pdo = null): array
{
    $connection = $pdo ?? Database::connection();
    $sql = 'SELECT s.*,c.name AS class_name,c.stage,c.grade_label FROM live_competition_sessions s JOIN classes c ON c.id=s.class_id WHERE s.id=? AND s.teacher_id=?';
    if ($forUpdate) $sql .= ' FOR UPDATE';
    $statement = $connection->prepare($sql);
    $statement->execute([$sessionId,$teacherId]);
    $row = $statement->fetch();
    if (!$row) throw new LiveCompetitionHttpError(404,'المسابقة غير موجودة.');
    return $row;
}

function live_competition_student_context(int $studentId): array
{
    $row = fetch_one(
        "SELECT s.id,s.name,s.class_id,s.status,s.deleted_at,c.teacher_id,c.name AS class_name,c.stage,c.grade_label
         FROM students s JOIN classes c ON c.id=s.class_id
         WHERE s.id=? AND s.status='active' AND s.deleted_at IS NULL",
        [$studentId]
    );
    if (!$row || (int)($row['class_id'] ?? 0) < 1) Http::json(['error'=>'لا يوجد فصل نشط مرتبط بحسابكِ.'],403);
    return $row;
}

function live_competition_session_student(int $studentId, int $sessionId, bool $forUpdate = false, ?PDO $pdo = null): array
{
    $connection = $pdo ?? Database::connection();
    $sql = "SELECT cs.*,c.name AS class_name,c.stage,c.grade_label
            FROM live_competition_sessions cs
            JOIN classes c ON c.id=cs.class_id
            JOIN live_competition_participants p ON p.session_id=cs.id AND p.student_id=?
            JOIN students s ON s.id=p.student_id AND s.status='active' AND s.deleted_at IS NULL
            WHERE cs.id=?";
    if ($forUpdate) $sql .= ' FOR UPDATE';
    $statement = $connection->prepare($sql);
    $statement->execute([$studentId,$sessionId]);
    $row = $statement->fetch();
    if (!$row) throw new LiveCompetitionHttpError(404,'المسابقة غير متاحة لهذا الحساب.');
    $student = fetch_one('SELECT class_id FROM students WHERE id=? AND status=\'active\' AND deleted_at IS NULL',[$studentId]);
    if (!$student || in_array((string)$row['status'],['lobby','question_open','question_closed'],true) && (int)$student['class_id'] !== (int)$row['class_id']) {
        throw new LiveCompetitionHttpError(404,'المسابقة غير متاحة لهذا الحساب.');
    }
    return $row;
}

function live_competition_auto_close(int $sessionId): void
{
    execute_sql(
        "UPDATE live_competition_sessions SET status='question_closed',state_version=state_version+1
         WHERE id=? AND status='question_open' AND question_ends_at IS NOT NULL AND question_ends_at<=NOW(6)",
        [$sessionId]
    );
}

function live_competition_server_now(PDO $pdo): string
{
    return (string)$pdo->query("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f')")->fetchColumn();
}

function live_competition_question_count(int $sessionId): int
{
    return (int)(fetch_one('SELECT COUNT(*) AS n FROM live_competition_questions WHERE session_id=?',[$sessionId])['n'] ?? 0);
}

function live_competition_score(bool $correct,int $remainingMs,int $durationMs): array
{
    if (!$correct) return ['base'=>0,'bonus'=>0,'points'=>0];
    $durationMs=max(1,$durationMs);
    $bonus=max(0,min(100,(int)round(100*max(0,$remainingMs)/$durationMs)));
    return ['base'=>100,'bonus'=>$bonus,'points'=>100+$bonus];
}

function live_competition_question_json(array $row, bool $showSolution): array
{
    $payload = [
        'id'=>(int)$row['id'],'number'=>(int)$row['sort_order'],'type'=>(string)$row['question_type'],
        'prompt'=>(string)$row['prompt'],'options'=>json_options($row['options_json']) ?? [],
        'difficulty'=>(string)$row['difficulty'],'unitName'=>(string)($row['unit_name'] ?? ''),
        'lessonName'=>(string)($row['lesson_name'] ?? ''),'skillName'=>(string)($row['skill_name'] ?? ''),
    ];
    if ($showSolution) {
        $payload['correctOptionNo'] = (int)$row['correct_option_no'];
        $payload['explanation'] = (string)($row['explanation'] ?? '');
    }
    return $payload;
}

function live_competition_rank_rows(array $rows): array
{
    usort($rows, static function(array $a,array $b): int {
        return ((int)$b['score'] <=> (int)$a['score']) ?: ((int)$b['correct_count'] <=> (int)$a['correct_count'])
            ?: ((int)$a['total_response_ms'] <=> (int)$b['total_response_ms']) ?: strnatcasecmp((string)$a['student_name'],(string)$b['student_name']);
    });
    $previous = null; $rank = 0;
    foreach ($rows as $index => &$row) {
        $signature = implode('|',[(int)$row['score'],(int)$row['correct_count'],(int)$row['total_response_ms']]);
        if ($previous !== $signature) $rank = $index + 1;
        $row['calculated_rank'] = $rank; $previous = $signature;
    }
    unset($row);
    return $rows;
}

function live_competition_participants(int $sessionId): array
{
    return live_competition_rank_rows(fetch_all(
        "SELECT p.*,s.name AS student_name FROM live_competition_participants p JOIN students s ON s.id=p.student_id WHERE p.session_id=? ORDER BY s.name,s.id",
        [$sessionId]
    ));
}

function live_competition_results_payload(array $session): array
{
    $participants = live_competition_participants((int)$session['id']);
    $hasWinner = false;
    foreach ($participants as $participant) {
        if ($participant['joined_at'] !== null && (int)$participant['answered_count'] > 0 && (int)$participant['correct_count'] > 0) { $hasWinner = true; break; }
    }
    $rows = []; $podium = [];
    foreach ($participants as $row) {
        $participated = $row['joined_at'] !== null && (int)$row['answered_count'] > 0;
        $rank = $hasWinner && $participated ? (int)($row['final_rank'] ?? $row['calculated_rank']) : null;
        $item = [
            'studentId'=>(int)$row['student_id'],'studentName'=>(string)$row['student_name'],'score'=>(int)$row['score'],
            'answeredCount'=>(int)$row['answered_count'],'correctCount'=>(int)$row['correct_count'],
            'totalResponseMs'=>(int)$row['total_response_ms'],
            'averageResponseMs'=>(int)$row['correct_count']>0 ? (int)round((int)$row['total_response_ms']/(int)$row['correct_count']) : null,
            'rank'=>$rank,'participated'=>$participated,
        ];
        $rows[] = $item;
        if ($hasWinner && $participated && $rank !== null && $rank <= 3) $podium[] = $item;
    }
    return ['hasWinner'=>$hasWinner,'podium'=>$podium,'rows'=>$rows];
}

function live_competition_state_payload(array $session, string $audience, ?int $studentId = null): array
{
    $sessionId = (int)$session['id'];
    $questionCount = live_competition_question_count($sessionId);
    $question = null; $currentNo = (int)$session['current_question_no'];
    if ($currentNo > 0) $question = fetch_one('SELECT * FROM live_competition_questions WHERE session_id=? AND sort_order=?',[$sessionId,$currentNo]);
    $serverNow = (string)(fetch_one("SELECT DATE_FORMAT(NOW(6),'%Y-%m-%d %H:%i:%s.%f') AS now")['now'] ?? '');
    $showSolution = in_array((string)$session['status'],['question_closed','completed'],true);
    $base = [
        'migrationReady'=>true,'serverNow'=>$serverNow,
        'session'=>[
            'id'=>$sessionId,'title'=>(string)$session['title'],'classId'=>(int)$session['class_id'],'className'=>(string)($session['class_name'] ?? ''),
            'stage'=>(string)($session['stage'] ?? ''),'gradeLabel'=>(string)($session['grade_label'] ?? ''),'academicYear'=>(string)$session['academic_year'],
            'semester'=>(string)$session['semester'],'status'=>(string)$session['status'],'currentQuestionNo'=>$currentNo,'questionCount'=>$questionCount,
            'questionTimeSeconds'=>(int)$session['question_time_seconds'],'questionStartedAt'=>$session['question_started_at'],'questionEndsAt'=>$session['question_ends_at'],
            'stateVersion'=>(int)$session['state_version'],'leaderboardVersion'=>(int)$session['leaderboard_version'],
        ],
        'question'=>$question ? live_competition_question_json($question,$showSolution) : null,
    ];
    if ($audience === 'teacher') {
        $participants = live_competition_participants($sessionId);
        $answerCount = $question ? (int)(fetch_one('SELECT COUNT(*) AS n FROM live_competition_answers WHERE session_id=? AND question_id=?',[$sessionId,(int)$question['id']])['n'] ?? 0) : 0;
        $correctCount = $showSolution && $question ? (int)(fetch_one('SELECT COUNT(*) AS n FROM live_competition_answers WHERE session_id=? AND question_id=? AND is_correct=1',[$sessionId,(int)$question['id']])['n'] ?? 0) : null;
        $fastest = null;
        if ($showSolution && $question) $fastest = fetch_one('SELECT s.name AS student_name,a.response_ms,a.points FROM live_competition_answers a JOIN students s ON s.id=a.student_id WHERE a.session_id=? AND a.question_id=? AND a.is_correct=1 ORDER BY a.response_ms,a.received_at,a.student_id LIMIT 1',[$sessionId,(int)$question['id']]);
        $base['answerCount']=$answerCount; $base['correctCount']=$correctCount;
        $base['fastestCorrect']=$fastest?['studentName'=>(string)$fastest['student_name'],'responseMs'=>(int)$fastest['response_ms'],'points'=>(int)$fastest['points']]:null;
        $base['participants']=array_map(static fn(array $row): array => [
            'studentId'=>(int)$row['student_id'],'studentName'=>(string)$row['student_name'],'joined'=>$row['joined_at']!==null,
            'connected'=>$row['last_seen_at']!==null && strtotime((string)$row['last_seen_at'])>=time()-12,
            'score'=>(int)$row['score'],'answeredCount'=>(int)$row['answered_count'],'correctCount'=>(int)$row['correct_count'],
            'totalResponseMs'=>(int)$row['total_response_ms'],'rank'=>(int)$row['calculated_rank'],
        ],$participants);
        if (in_array((string)$session['status'],['completed','cancelled'],true)) $base['results']=live_competition_results_payload($session);
    } else {
        $participant = fetch_one('SELECT * FROM live_competition_participants WHERE session_id=? AND student_id=?',[$sessionId,$studentId]);
        if (!$participant) throw new LiveCompetitionHttpError(403,'لستِ ضمن طالبات هذه المسابقة.');
        $answer = $question ? fetch_one('SELECT * FROM live_competition_answers WHERE session_id=? AND question_id=? AND student_id=?',[$sessionId,(int)$question['id'],$studentId]) : null;
        $base['participant']=['joined'=>$participant['joined_at']!==null,'score'=>$showSolution?(int)$participant['score']:null,'answeredCount'=>(int)$participant['answered_count'],'correctCount'=>$showSolution?(int)$participant['correct_count']:null,'rank'=>$participant['final_rank']===null?null:(int)$participant['final_rank']];
        $base['answer']=$answer?['selectedOptionNo'=>(int)$answer['selected_option_no'],'alreadyAnswered'=>true,'isCorrect'=>$showSolution?(bool)$answer['is_correct']:null,'points'=>$showSolution?(int)$answer['points']:null,'responseMs'=>$showSolution?(int)$answer['response_ms']:null]:null;
        if ($session['status']==='completed') {
            $results=live_competition_results_payload($session);
            $mine=array_values(array_filter($results['rows'],static fn(array $row): bool=>$row['studentId']===$studentId));
            $base['results']=['hasWinner'=>$results['hasWinner'],'podium'=>$results['podium'],'me'=>$mine[0]??null];
        }
    }
    return $base;
}

function teacher_live_competition_routes(string $method,array $segments,int $teacherId): never
{
    live_competitions_require_schema(); live_competitions_cleanup_stale();
    $resource=$segments[0]??'';
    try {
        if ($resource==='meta'&&$method==='GET') teacher_live_competition_meta($teacherId);
        if ($resource==='history'&&$method==='GET') teacher_live_competition_history($teacherId);
        if ($resource==='sessions'&&count($segments)===1&&$method==='POST') teacher_live_competition_create($teacherId);
        if ($resource!=='sessions') Http::json(['error'=>'مسار المسابقة غير موجود.'],404);
        $sessionId=route_id($segments,1); $action=$segments[2]??'';
        if ($action==='state'&&$method==='GET') teacher_live_competition_state($teacherId,$sessionId);
        if ($action==='results'&&$method==='GET') teacher_live_competition_results($teacherId,$sessionId);
        if (in_array($action,['start','close-question','next','finish','cancel'],true)&&$method==='POST') teacher_live_competition_transition($teacherId,$sessionId,$action);
        Http::json(['error'=>'مسار المسابقة غير موجود.'],404);
    } catch (LiveCompetitionHttpError $error) { Http::json(['error'=>$error->getMessage()],$error->status); }
}

function teacher_live_competition_meta(int $teacherId): never
{
    $classId=filter_var($_GET['classId']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if(!$classId) Http::json(['error'=>'اختاري فصلًا محددًا أولًا.'],422);
    $class=live_competition_teacher_class($teacherId,(int)$classId); $all=live_competition_question_rows($teacherId,$class);
    $filters=['unit'=>trim((string)($_GET['unit']??'')),'lesson'=>trim((string)($_GET['lesson']??'')),'skillId'=>(int)($_GET['skillId']??0),'difficulty'=>in_array((string)($_GET['difficulty']??''),['easy','medium','hard'],true)?(string)$_GET['difficulty']:''];
    $filtered=array_values(array_filter($all,static fn(array $row): bool=>($filters['unit']===''||($row['unitName']??'')===$filters['unit'])&&($filters['lesson']===''||($row['lessonName']??'')===$filters['lesson'])&&($filters['skillId']<1||(int)($row['skillId']??0)===$filters['skillId'])&&($filters['difficulty']===''||$row['difficulty']===$filters['difficulty'])));
    $units=live_competition_unique_options($all,'unitName');
    $unitRows=$filters['unit']===''?$all:array_values(array_filter($all,static fn(array $row): bool=>($row['unitName']??'')===$filters['unit']));
    $lessons=live_competition_unique_options($unitRows,'lessonName');
    $lessonRows=$filters['lesson']===''?$unitRows:array_values(array_filter($unitRows,static fn(array $row): bool=>($row['lessonName']??'')===$filters['lesson']));
    $skills=[]; foreach($lessonRows as $row) if(!empty($row['skillId'])) $skills[(int)$row['skillId']]=['id'=>(int)$row['skillId'],'name'=>(string)($row['skillName']?:'مهارة غير مسماة')];
    $active=fetch_one("SELECT id,title,status FROM live_competition_sessions WHERE class_id=? AND active_slot=1 AND status IN ('lobby','question_open','question_closed') LIMIT 1",[(int)$classId]);
    $history=fetch_all("SELECT id,title,status,created_at,completed_at FROM live_competition_sessions WHERE teacher_id=? AND class_id=? AND status IN ('completed','cancelled') ORDER BY created_at DESC,id DESC LIMIT 20",[$teacherId,(int)$classId]);
    $students=(int)(fetch_one("SELECT COUNT(*) AS n FROM students WHERE class_id=? AND status='active' AND deleted_at IS NULL",[(int)$classId])['n']??0);
    Http::json(['migrationReady'=>true,'class'=>['id'=>(int)$class['id'],'name'=>(string)$class['name'],'stage'=>(string)$class['stage'],'gradeLabel'=>(string)$class['grade_label'],'studentCount'=>$students],'filters'=>['units'=>$units,'lessons'=>$lessons,'skills'=>array_values($skills),'difficulties'=>['easy','medium','hard']],'availableCount'=>count($filtered),'activeSession'=>$active?['id'=>(int)$active['id'],'title'=>(string)$active['title'],'status'=>(string)$active['status']]:null,'history'=>$history]);
}

function teacher_live_competition_create(int $teacherId): never
{
    $data=Http::input(); $title=trim((string)($data['title']??'مسابقة النجوم'));
    if($title===''||mb_strlen($title)>190) Http::json(['error'=>'اكتبي اسمًا للمسابقة لا يتجاوز 190 حرفًا.'],422);
    $classId=filter_var($data['classId']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if(!$classId) Http::json(['error'=>'اختاري فصلًا محددًا.'],422);
    $class=live_competition_teacher_class($teacherId,(int)$classId); $time=(int)($data['questionTimeSeconds']??30); $wanted=(int)($data['questionCount']??10);
    if($time<5||$time>120) Http::json(['error'=>'زمن السؤال يجب أن يكون من 5 إلى 120 ثانية.'],422);
    if($wanted<1||$wanted>30) Http::json(['error'=>'عدد الأسئلة يجب أن يكون من 1 إلى 30.'],422);
    $filters=['unit'=>trim((string)($data['unit']??'')),'lesson'=>trim((string)($data['lesson']??'')),'skillId'=>(int)($data['skillId']??0),'difficulty'=>in_array((string)($data['difficulty']??''),['easy','medium','hard'],true)?(string)$data['difficulty']:''];
    $questions=live_competition_question_rows($teacherId,$class,$filters);
    if(!$questions) Http::json(['error'=>'لا توجد أسئلة معتمدة قابلة للتصحيح ضمن الاختيارات الحالية.'],422);
    if($wanted>count($questions)) Http::json(['error'=>'عدد الأسئلة المطلوب أكبر من الأسئلة المتاحة.'],422);
    $students=fetch_all("SELECT id FROM students WHERE class_id=? AND status='active' AND deleted_at IS NULL ORDER BY id",[(int)$classId]);
    if(!$students) Http::json(['error'=>'لا توجد طالبات نشطات في هذا الفصل.'],422);
    shuffle($questions); $questions=array_slice($questions,0,$wanted); $settings=teacher_school_settings_row($teacherId);
    $year=trim((string)($settings['academic_year']??''))?:trim((string)$class['academic_year']);
    $semester=in_array((string)($settings['current_semester']??''),['first','second'],true)?(string)$settings['current_semester']:'first';
    try {
        $sessionId=Database::transaction(function(PDO $pdo) use($teacherId,$classId,$title,$year,$semester,$time,$questions,$students): int {
            $insert=$pdo->prepare("INSERT INTO live_competition_sessions(teacher_id,class_id,title,academic_year,semester,status,current_question_no,question_time_seconds,active_slot) VALUES(?,?,?,?,?,'lobby',0,?,1)");
            $insert->execute([$teacherId,$classId,$title,$year,$semester,$time]); $sessionId=(int)$pdo->lastInsertId();
            $questionInsert=$pdo->prepare('INSERT INTO live_competition_questions(session_id,source_question_id,sort_order,question_type,prompt,options_json,correct_option_no,explanation,difficulty,skill_id,unit_name,lesson_name,skill_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
            foreach($questions as $index=>$question) $questionInsert->execute([$sessionId,$question['sourceQuestionId'],$index+1,$question['questionType'],$question['prompt'],json_encode($question['options'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$question['correctOptionNo'],$question['explanation'],$question['difficulty'],$question['skillId'],$question['unitName'],$question['lessonName'],$question['skillName']]);
            $participantInsert=$pdo->prepare('INSERT INTO live_competition_participants(session_id,student_id) VALUES(?,?)'); foreach($students as $student) $participantInsert->execute([$sessionId,(int)$student['id']]);
            return $sessionId;
        });
    } catch(PDOException $error) {
        if((string)$error->getCode()==='23000') Http::json(['error'=>'يوجد بالفعل مسابقة نشطة لهذا الفصل. افتحيها أو ألغِيها أولًا.'],409);
        throw $error;
    }
    Activity::log('teacher',$teacherId,'إنشاء مسابقة مباشرة',$title);
    Http::json(live_competition_state_payload(live_competition_session_teacher($teacherId,$sessionId),'teacher'),201);
}

function teacher_live_competition_state(int $teacherId,int $sessionId): never
{
    live_competition_session_teacher($teacherId,$sessionId); live_competition_auto_close($sessionId);
    Http::json(live_competition_state_payload(live_competition_session_teacher($teacherId,$sessionId),'teacher'));
}

function live_competition_expected_version(array $data): int
{
    $version=filter_var($data['expectedStateVersion']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if(!$version) throw new LiveCompetitionHttpError(422,'تعذّر التحقق من نسخة حالة المسابقة. حدّثي الصفحة وحاولي مجددًا.');
    return (int)$version;
}

function teacher_live_competition_transition(int $teacherId,int $sessionId,string $action): never
{
    $expected=live_competition_expected_version(Http::input()); $logAction=null;
    $result=Database::transaction(function(PDO $pdo) use($teacherId,$sessionId,$action,$expected,&$logAction): array {
        $session=live_competition_session_teacher($teacherId,$sessionId,true,$pdo);
        $serverNow=live_competition_server_now($pdo);
        if($session['status']==='question_open'&&$session['question_ends_at']!==null&&strcmp($serverNow,(string)$session['question_ends_at'])>0){$pdo->prepare("UPDATE live_competition_sessions SET status='question_closed',state_version=state_version+1 WHERE id=?")->execute([$sessionId]);$session=live_competition_session_teacher($teacherId,$sessionId,true,$pdo);}
        if((int)$session['state_version']!==$expected) throw new LiveCompetitionHttpError(409,'تغيّرت حالة المسابقة. تم تحديثها؛ أعيدي المحاولة إن لزم.');
        $stmt=$pdo->prepare('SELECT COUNT(*) FROM live_competition_questions WHERE session_id=?');$stmt->execute([$sessionId]);$questionCount=(int)$stmt->fetchColumn();
        if($action==='start'){
            if($session['status']!=='lobby') throw new LiveCompetitionHttpError(409,'بدأت المسابقة بالفعل أو لم تعد قابلة للبدء.');
            $pdo->prepare("UPDATE live_competition_sessions SET status='question_open',current_question_no=1,question_started_at=NOW(6),question_ends_at=DATE_ADD(NOW(6),INTERVAL question_time_seconds SECOND),started_at=NOW(),state_version=state_version+1 WHERE id=?")->execute([$sessionId]);$logAction='بدء مسابقة مباشرة';
        }elseif($action==='close-question'){
            if($session['status']!=='question_open') throw new LiveCompetitionHttpError(409,'الإجابات مغلقة بالفعل.');
            $pdo->prepare("UPDATE live_competition_sessions SET status='question_closed',state_version=state_version+1 WHERE id=?")->execute([$sessionId]);
        }elseif($action==='next'){
            if($session['status']!=='question_closed') throw new LiveCompetitionHttpError(409,'أغلقي إجابات السؤال الحالي أولًا.');
            if((int)$session['current_question_no']>=$questionCount) throw new LiveCompetitionHttpError(409,'هذا هو السؤال الأخير؛ أنهي المسابقة لإظهار النتائج.');
            $pdo->prepare("UPDATE live_competition_sessions SET status='question_open',current_question_no=current_question_no+1,question_started_at=NOW(6),question_ends_at=DATE_ADD(NOW(6),INTERVAL question_time_seconds SECOND),state_version=state_version+1 WHERE id=?")->execute([$sessionId]);
        }elseif($action==='finish'){
            if($session['status']!=='question_closed'||(int)$session['current_question_no']!==$questionCount) throw new LiveCompetitionHttpError(409,'لا يمكن إنهاء المسابقة قبل إغلاق السؤال الأخير.');
            $statement=$pdo->prepare("SELECT p.*,s.name AS student_name FROM live_competition_participants p JOIN students s ON s.id=p.student_id WHERE p.session_id=? FOR UPDATE");$statement->execute([$sessionId]);$participants=live_competition_rank_rows($statement->fetchAll());
            $hasCorrect=(bool)array_filter($participants,static fn(array $row): bool=>$row['joined_at']!==null&&(int)$row['answered_count']>0&&(int)$row['correct_count']>0);
            $rankUpdate=$pdo->prepare('UPDATE live_competition_participants SET final_rank=? WHERE session_id=? AND student_id=?');
            foreach($participants as $row){$participated=$row['joined_at']!==null&&(int)$row['answered_count']>0;$rankUpdate->execute([$hasCorrect&&$participated?(int)$row['calculated_rank']:null,$sessionId,(int)$row['student_id']]);}
            $pdo->prepare("UPDATE live_competition_sessions SET status='completed',active_slot=NULL,completed_at=NOW(),state_version=state_version+1 WHERE id=?")->execute([$sessionId]);$logAction='إكمال مسابقة مباشرة';
        }elseif($action==='cancel'){
            if(!in_array((string)$session['status'],['lobby','question_open','question_closed'],true)) throw new LiveCompetitionHttpError(409,'المسابقة منتهية بالفعل.');
            $pdo->prepare("UPDATE live_competition_sessions SET status='cancelled',active_slot=NULL,completed_at=NOW(),state_version=state_version+1 WHERE id=?")->execute([$sessionId]);$logAction='إلغاء مسابقة مباشرة';
        }
        return live_competition_session_teacher($teacherId,$sessionId,false,$pdo);
    });
    if($logAction) Activity::log('teacher',$teacherId,$logAction,(string)$result['title']);
    Http::json(live_competition_state_payload($result,'teacher'));
}

function teacher_live_competition_results(int $teacherId,int $sessionId): never
{
    $session=live_competition_session_teacher($teacherId,$sessionId);
    if(!in_array((string)$session['status'],['completed','cancelled'],true)) Http::json(['error'=>'النتائج النهائية غير جاهزة بعد.'],409);
    Http::json(['session'=>live_competition_state_payload($session,'teacher')['session'],'results'=>live_competition_results_payload($session)]);
}

function teacher_live_competition_history(int $teacherId): never
{
    $classId=(int)($_GET['classId']??0);$params=[$teacherId];$where='teacher_id=?';
    if($classId>0){live_competition_teacher_class($teacherId,$classId);$where.=' AND class_id=?';$params[]=$classId;}
    Http::json(['items'=>fetch_all("SELECT id,class_id,title,status,current_question_no,created_at,completed_at FROM live_competition_sessions WHERE {$where} AND status IN ('completed','cancelled') ORDER BY created_at DESC,id DESC LIMIT 20",$params)]);
}

function student_live_competition_routes(string $method,array $segments,int $studentId): never
{
    live_competitions_require_schema();live_competitions_cleanup_stale();$resource=$segments[0]??'';
    try{
        if($resource==='active'&&$method==='GET') student_live_competition_active($studentId);
        if($resource==='history'&&$method==='GET') student_live_competition_history($studentId);
        if($resource!=='sessions') Http::json(['error'=>'مسار المسابقة غير موجود.'],404);
        $sessionId=route_id($segments,1);$action=$segments[2]??'';
        if($action==='join'&&$method==='POST') student_live_competition_join($studentId,$sessionId);
        if($action==='state'&&$method==='GET') student_live_competition_state($studentId,$sessionId);
        if($action==='answers'&&$method==='POST') student_live_competition_answer($studentId,$sessionId);
        if($action==='results'&&$method==='GET') student_live_competition_results($studentId,$sessionId);
        Http::json(['error'=>'مسار المسابقة غير موجود.'],404);
    }catch(LiveCompetitionHttpError $error){Http::json(['error'=>$error->getMessage()],$error->status);}
}

function student_live_competition_history(int $studentId): never
{
    $student=live_competition_student_context($studentId);
    $items=fetch_all("SELECT cs.id,cs.title,cs.status,cs.completed_at,cs.created_at,c.name AS class_name
        FROM live_competition_sessions cs JOIN classes c ON c.id=cs.class_id
        JOIN live_competition_participants p ON p.session_id=cs.id AND p.student_id=? AND p.joined_at IS NOT NULL
        WHERE cs.status IN ('completed','cancelled')
        ORDER BY COALESCE(cs.completed_at,cs.created_at) DESC,cs.id DESC LIMIT 20",[$studentId]);
    Http::json(['items'=>$items]);
}

function student_live_competition_active(int $studentId): never
{
    $student=live_competition_student_context($studentId);
    $session=fetch_one("SELECT cs.*,c.name AS class_name,c.stage,c.grade_label FROM live_competition_sessions cs JOIN classes c ON c.id=cs.class_id WHERE cs.class_id=? AND cs.active_slot=1 AND cs.status IN ('lobby','question_open','question_closed') ORDER BY cs.id DESC LIMIT 1",[(int)$student['class_id']]);
    if(!$session) $session=fetch_one("SELECT cs.*,c.name AS class_name,c.stage,c.grade_label FROM live_competition_sessions cs JOIN classes c ON c.id=cs.class_id JOIN live_competition_participants p ON p.session_id=cs.id AND p.student_id=? WHERE cs.class_id=? AND cs.status='completed' AND cs.completed_at>=DATE_SUB(NOW(),INTERVAL 4 HOUR) AND p.joined_at IS NOT NULL ORDER BY cs.completed_at DESC,cs.id DESC LIMIT 1",[$studentId,(int)$student['class_id']]);
    if(!$session) Http::json(['migrationReady'=>true,'activeSession'=>null]);
    $participant=fetch_one('SELECT joined_at FROM live_competition_participants WHERE session_id=? AND student_id=?',[(int)$session['id'],$studentId]);
    Http::json(['migrationReady'=>true,'activeSession'=>['id'=>(int)$session['id'],'title'=>(string)$session['title'],'status'=>(string)$session['status'],'className'=>(string)$session['class_name'],'questionCount'=>live_competition_question_count((int)$session['id']),'questionTimeSeconds'=>(int)$session['question_time_seconds'],'joined'=>$participant&&$participant['joined_at']!==null]]);
}

function student_live_competition_join(int $studentId,int $sessionId): never
{
    $session=live_competition_session_student($studentId,$sessionId);
    if(in_array((string)$session['status'],['completed','cancelled'],true)) Http::json(['error'=>'انتهت هذه المسابقة.'],409);
    $statement=execute_sql('UPDATE live_competition_participants SET joined_at=COALESCE(joined_at,NOW(6)),last_seen_at=NOW(6) WHERE session_id=? AND student_id=?',[$sessionId,$studentId]);
    if($statement->rowCount()<1&&!fetch_one('SELECT 1 FROM live_competition_participants WHERE session_id=? AND student_id=?',[$sessionId,$studentId])) Http::json(['error'=>'لستِ ضمن طالبات هذه المسابقة.'],403);
    Http::json(live_competition_state_payload(live_competition_session_student($studentId,$sessionId),'student',$studentId));
}

function student_live_competition_state(int $studentId,int $sessionId): never
{
    live_competition_session_student($studentId,$sessionId);live_competition_auto_close($sessionId);
    execute_sql('UPDATE live_competition_participants SET last_seen_at=NOW(6) WHERE session_id=? AND student_id=? AND joined_at IS NOT NULL',[$sessionId,$studentId]);
    Http::json(live_competition_state_payload(live_competition_session_student($studentId,$sessionId),'student',$studentId));
}

function student_live_competition_answer(int $studentId,int $sessionId): never
{
    $selected=filter_var(Http::input()['selectedOptionNo']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>4]]);
    if(!$selected) Http::json(['error'=>'اختاري إجابة أولًا.'],422);
    $response=Database::transaction(function(PDO $pdo) use($studentId,$sessionId,$selected): array {
        $session=live_competition_session_student($studentId,$sessionId,true,$pdo);
        $participantStatement=$pdo->prepare('SELECT * FROM live_competition_participants WHERE session_id=? AND student_id=? FOR UPDATE');$participantStatement->execute([$sessionId,$studentId]);$participant=$participantStatement->fetch();
        if(!$participant||$participant['joined_at']===null) throw new LiveCompetitionHttpError(403,'انضمي إلى المسابقة أولًا.');
        if((int)$session['current_question_no']<1) throw new LiveCompetitionHttpError(409,'لم يبدأ السؤال الأول بعد.');
        $questionStatement=$pdo->prepare('SELECT * FROM live_competition_questions WHERE session_id=? AND sort_order=? FOR UPDATE');$questionStatement->execute([$sessionId,(int)$session['current_question_no']]);$question=$questionStatement->fetch();
        if(!$question) throw new LiveCompetitionHttpError(409,'تعذّر العثور على السؤال الحالي.');
        $existingStatement=$pdo->prepare('SELECT * FROM live_competition_answers WHERE session_id=? AND question_id=? AND student_id=?');$existingStatement->execute([$sessionId,(int)$question['id'],$studentId]);$existing=$existingStatement->fetch();
        if($existing) return ['answer'=>$existing,'alreadyAnswered'=>true];
        if($session['status']!=='question_open') throw new LiveCompetitionHttpError(409,'الإجابات مغلقة الآن.');
        $now=live_competition_server_now($pdo);
        if($session['question_ends_at']===null||strcmp($now,(string)$session['question_ends_at'])>0){$pdo->prepare("UPDATE live_competition_sessions SET status='question_closed',state_version=state_version+1 WHERE id=? AND status='question_open'")->execute([$sessionId]);throw new LiveCompetitionHttpError(409,'انتهى وقت السؤال وأُغلقت الإجابات.');}
        $options=json_options($question['options_json'])??[];if((int)$selected>count($options)) throw new LiveCompetitionHttpError(422,'الإجابة المختارة غير صالحة.');
        $timing=$pdo->prepare('SELECT GREATEST(0,TIMESTAMPDIFF(MICROSECOND,?,NOW(6)) DIV 1000) AS response_ms,GREATEST(0,TIMESTAMPDIFF(MICROSECOND,NOW(6),?) DIV 1000) AS remaining_ms');$timing->execute([(string)$session['question_started_at'],(string)$session['question_ends_at']]);$clock=$timing->fetch();
        $responseMs=max(0,(int)$clock['response_ms']);$remainingMs=max(0,(int)$clock['remaining_ms']);$durationMs=max(1,(int)$session['question_time_seconds']*1000);$correct=(int)$selected===(int)$question['correct_option_no'];$scoring=live_competition_score($correct,$remainingMs,$durationMs);$base=$scoring['base'];$bonus=$scoring['bonus'];$points=$scoring['points'];
        $insert=$pdo->prepare('INSERT INTO live_competition_answers(session_id,question_id,student_id,selected_option_no,received_at,response_ms,is_correct,base_score,speed_bonus,points) VALUES(?,?,?,?,NOW(6),?,?,?,?,?)');
        try{$insert->execute([$sessionId,(int)$question['id'],$studentId,(int)$selected,$responseMs,$correct?1:0,$base,$bonus,$points]);}catch(PDOException $error){if((string)$error->getCode()!=='23000')throw $error;$existingStatement->execute([$sessionId,(int)$question['id'],$studentId]);return ['answer'=>$existingStatement->fetch(),'alreadyAnswered'=>true];}
        $pdo->prepare('UPDATE live_competition_participants SET last_seen_at=NOW(6),score=score+?,answered_count=answered_count+1,correct_count=correct_count+?,total_response_ms=total_response_ms+? WHERE session_id=? AND student_id=?')->execute([$points,$correct?1:0,$correct?$responseMs:0,$sessionId,$studentId]);
        $pdo->prepare('UPDATE live_competition_sessions SET leaderboard_version=leaderboard_version+1 WHERE id=?')->execute([$sessionId]);
        return ['answer'=>['selected_option_no'=>(int)$selected],'alreadyAnswered'=>false];
    });
    Http::json(['accepted'=>true,'alreadyAnswered'=>(bool)$response['alreadyAnswered'],'selectedOptionNo'=>(int)$response['answer']['selected_option_no'],'message'=>$response['alreadyAnswered']?'سبق استلام إجابتكِ لهذا السؤال.':'تم استلام إجابتكِ.'],$response['alreadyAnswered']?200:201);
}

function student_live_competition_results(int $studentId,int $sessionId): never
{
    $session=live_competition_session_student($studentId,$sessionId);
    if($session['status']!=='completed') Http::json(['error'=>'النتائج النهائية غير جاهزة بعد.'],409);
    $state=live_competition_state_payload($session,'student',$studentId);Http::json(['session'=>$state['session'],'results'=>$state['results']]);
}
