<?php
declare(strict_types=1);

function portfolio_categories(): array
{
    return [
        'homework'=>'واجب',
        'worksheet'=>'ورقة عمل',
        'task'=>'مهمة',
        'project'=>'مشروع',
        'achievement_image'=>'صورة إنجاز',
        'other'=>'ملف آخر',
    ];
}

function portfolio_allowed_mime_types(): array
{
    return [
        'application/pdf'=>'pdf',
        'image/jpeg'=>'jpg',
        'image/png'=>'png',
        'image/webp'=>'webp',
        'image/gif'=>'gif',
        'image/avif'=>'avif',
        'image/heic'=>'heic',
        'image/heif'=>'heif',
    ];
}

function ensure_student_portfolio_schema(): void
{
    static $ready=false;
    if ($ready) return;
    try {
        Database::connection()->query('SELECT 1 FROM student_portfolio_files LIMIT 1');
        ensure_student_portfolio_review_columns();
        ensure_student_portfolio_certificate_columns();
        $ready=true;
        return;
    } catch (PDOException) {
        // تُجهّز الطاولة تلقائيًا عند تحديث نسخة قديمة من الموقع.
    }
    execute_sql(
        "CREATE TABLE IF NOT EXISTS student_portfolio_files (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          student_id BIGINT UNSIGNED NOT NULL,
          category ENUM('homework','worksheet','task','project','achievement_image','other') NOT NULL,
          title VARCHAR(190) NOT NULL,
          note VARCHAR(1000) NULL,
          original_name VARCHAR(255) NOT NULL,
          stored_name VARCHAR(80) NOT NULL UNIQUE,
          mime_type VARCHAR(100) NOT NULL,
          size_bytes BIGINT UNSIGNED NOT NULL,
          review_status ENUM('pending','approved','needs_revision') NOT NULL DEFAULT 'pending',
          teacher_comment VARCHAR(1000) NULL,
          reviewed_by BIGINT UNSIGNED NULL,
          reviewed_at DATETIME NULL,
          awarded_points SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          motivation_point_id BIGINT UNSIGNED NULL,
          certificate_key VARCHAR(190) NULL,
          certificate_data_json LONGTEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_portfolio_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_portfolio_reviewer FOREIGN KEY (reviewed_by) REFERENCES teachers(id) ON DELETE SET NULL,
          CONSTRAINT fk_portfolio_point FOREIGN KEY (motivation_point_id) REFERENCES motivational_points(id) ON DELETE SET NULL,
          INDEX idx_portfolio_student_date (student_id,created_at),
          INDEX idx_portfolio_status (review_status),
          INDEX idx_portfolio_category (category),
          UNIQUE INDEX uq_portfolio_student_certificate (student_id,certificate_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    ensure_student_portfolio_review_columns();
    ensure_student_portfolio_certificate_columns();
    $ready=true;
}

function ensure_student_portfolio_review_columns(): void
{
    $columns=array_fill_keys(array_map(static fn(array $column)=>(string)$column['Field'],fetch_all('SHOW COLUMNS FROM student_portfolio_files')),true);
    $definitions=[
        'review_status'=>"ENUM('pending','approved','needs_revision') NOT NULL DEFAULT 'pending' AFTER size_bytes",
        'teacher_comment'=>'VARCHAR(1000) NULL AFTER review_status',
        'reviewed_by'=>'BIGINT UNSIGNED NULL AFTER teacher_comment',
        'reviewed_at'=>'DATETIME NULL AFTER reviewed_by',
        'awarded_points'=>'SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER reviewed_at',
        'motivation_point_id'=>'BIGINT UNSIGNED NULL AFTER awarded_points',
    ];
    foreach ($definitions as $name=>$definition) {
        if (!isset($columns[$name])) execute_sql("ALTER TABLE student_portfolio_files ADD COLUMN {$name} {$definition}");
    }
}

function ensure_student_portfolio_certificate_columns(): void
{
    $columns=array_fill_keys(array_map(static fn(array $column)=>(string)$column['Field'],fetch_all('SHOW COLUMNS FROM student_portfolio_files')),true);
    $definitions=[
        'certificate_key'=>'VARCHAR(190) NULL AFTER motivation_point_id',
        'certificate_data_json'=>'LONGTEXT NULL AFTER certificate_key',
    ];
    foreach ($definitions as $name=>$definition) {
        if (!isset($columns[$name])) execute_sql("ALTER TABLE student_portfolio_files ADD COLUMN {$name} {$definition}");
    }
    $index=fetch_one("SELECT 1 AS ok FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='student_portfolio_files' AND index_name='uq_portfolio_student_certificate' LIMIT 1");
    if (!$index) {
        execute_sql('ALTER TABLE student_portfolio_files ADD UNIQUE INDEX uq_portfolio_student_certificate (student_id,certificate_key)');
    }
}

function portfolio_storage_directory(): string
{
    $directory=MADAR_ROOT.'/storage/private/student-portfolios';
    if (!is_dir($directory) && !mkdir($directory,0750,true) && !is_dir($directory)) {
        Http::json(['error'=>'تعذّر تجهيز مجلد ملفات الإنجاز.'],500);
    }
    if (!is_writable($directory)) Http::json(['error'=>'مجلد ملفات الإنجاز غير قابل للكتابة.'],500);
    return $directory;
}

function portfolio_json_row(array $row): array
{
    $item=[
        'id'=>(int)$row['id'],
        'category'=>(string)$row['category'],
        'title'=>(string)$row['title'],
        'note'=>$row['note']===null?'':(string)$row['note'],
        'originalName'=>(string)$row['original_name'],
        'mimeType'=>(string)$row['mime_type'],
        'sizeBytes'=>(int)$row['size_bytes'],
        'reviewStatus'=>(string)($row['review_status']??'pending'),
        'teacherComment'=>$row['teacher_comment']??null,
        'reviewedAt'=>$row['reviewed_at']??null,
        'awardedPoints'=>(int)($row['awarded_points']??0),
        'createdAt'=>$row['created_at'],
    ];
    if (!empty($row['certificate_key'])) {
        $item['certificateKey']=(string)$row['certificate_key'];
        $certificate=json_decode((string)($row['certificate_data_json']??''),true);
        if(is_array($certificate)&&isset($certificate['gameId'])&&(int)$certificate['gameId']>0)$item['certificateGameId']=(int)$certificate['gameId'];
    }
    if (isset($row['student_id'])) $item['studentId']=(int)$row['student_id'];
    if (isset($row['student_name'])) $item['studentName']=(string)$row['student_name'];
    if (isset($row['student_email'])) $item['studentEmail']=(string)$row['student_email'];
    if (isset($row['stage'])) $item['stage']=(string)$row['stage'];
    if (isset($row['grade_label'])) $item['gradeLabel']=(string)$row['grade_label'];
    if (isset($row['class_id'])) $item['classId']=(int)$row['class_id'];
    if (isset($row['class_name'])) $item['className']=(string)$row['class_name'];
    return $item;
}

function portfolio_certificate_group_key(array $row): string
{
    $certificate=json_decode((string)($row['certificate_data_json']??''),true);
    $attemptId=is_array($certificate)?(int)($certificate['attemptId']??0):0;
    if ($attemptId>0) return 'attempt:'.$attemptId;
    $key=(string)($row['certificate_key']??'');
    return 'key:'.$key;
}

function portfolio_deduplicate_certificate_rows(array $rows): array
{
    $seen=[];$result=[];
    foreach ($rows as $row) {
        if (empty($row['certificate_key'])) {
            $result[]=$row;
            continue;
        }
        $key=portfolio_certificate_group_key($row);
        if (isset($seen[$key])) continue;
        $seen[$key]=true;
        $result[]=$row;
    }
    return $result;
}

function student_portfolio_routes(string $method,array $segments,int $studentId): never
{
    ensure_student_portfolio_schema();
    if (!$segments && $method==='GET') {
        $rows=fetch_all('SELECT id,category,title,note,original_name,mime_type,size_bytes,review_status,teacher_comment,reviewed_at,awarded_points,certificate_key,certificate_data_json,created_at FROM student_portfolio_files WHERE student_id=? ORDER BY created_at DESC,id DESC',[$studentId]);
        Http::json(['categories'=>portfolio_categories(),'files'=>array_map('portfolio_json_row',portfolio_deduplicate_certificate_rows($rows))]);
    }
    if (!$segments && $method==='POST') student_portfolio_upload($studentId);
    if (isset($segments[0]) && ($segments[1]??'')==='file' && $method==='GET') {
        $fileId=route_id($segments,0);
        $row=fetch_one('SELECT id,original_name,stored_name,mime_type,size_bytes,certificate_key FROM student_portfolio_files WHERE id=? AND student_id=?',[$fileId,$studentId]);
        if (!$row) Http::json(['error'=>'الملف غير موجود.'],404);
        if (!empty($row['certificate_key'])) Http::json(['error'=>'استخدمي زر عرض الشهادة لفتح شهادة الإتقان.'],422);
        portfolio_send_file($row,false);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function teacher_student_files_routes(string $method,array $segments,int $teacherId): never
{
    ensure_student_portfolio_schema();
    if (!$segments && $method==='GET') {
        $students=fetch_all(
            'SELECT s.id,s.name,s.email,c.stage,c.grade_label,c.id AS class_id,c.name AS class_name,
                    (SELECT COUNT(*) FROM student_portfolio_files f WHERE f.student_id=s.id AND f.certificate_key IS NULL) AS work_count,
                    (SELECT COUNT(*) FROM student_portfolio_files f WHERE f.student_id=s.id AND f.certificate_key IS NOT NULL) AS certificate_count,
                    (SELECT COUNT(*) FROM game_attempts a WHERE a.student_id=s.id) AS game_attempt_count
             FROM students s
             JOIN classes c ON c.id=s.class_id
             WHERE c.teacher_id=? AND s.deleted_at IS NULL
             ORDER BY c.name,s.name,s.id',
            [$teacherId]
        );
        $certificateGroups=[];
        foreach (fetch_all(
            'SELECT f.student_id,f.certificate_key,f.certificate_data_json
             FROM student_portfolio_files f
             JOIN students s ON s.id=f.student_id JOIN classes c ON c.id=s.class_id
             WHERE c.teacher_id=? AND s.deleted_at IS NULL AND f.certificate_key IS NOT NULL',
            [$teacherId]
        ) as $certificateRow) {
            $certificateGroups[(int)$certificateRow['student_id']][portfolio_certificate_group_key($certificateRow)]=true;
        }
        foreach ($students as &$studentRow) {
            $studentRow['certificate_count']=count($certificateGroups[(int)$studentRow['id']]??[]);
        }
        unset($studentRow);
        $rows=fetch_all(
            'SELECT f.id,f.student_id,f.category,f.title,f.note,f.original_name,f.mime_type,f.size_bytes,
                    f.review_status,f.teacher_comment,f.reviewed_at,f.awarded_points,f.certificate_key,f.certificate_data_json,f.created_at,
                    s.name AS student_name,s.email AS student_email,c.stage,c.grade_label,c.id AS class_id,c.name AS class_name
             FROM student_portfolio_files f
             JOIN students s ON s.id=f.student_id
             JOIN classes c ON c.id=s.class_id
             WHERE c.teacher_id=? AND s.deleted_at IS NULL AND f.certificate_key IS NULL
             ORDER BY f.created_at DESC,f.id DESC LIMIT 500',
            [$teacherId]
        );
        Http::json([
            'categories'=>portfolio_categories(),
            'students'=>array_map('teacher_student_file_directory_json',$students),
            'files'=>array_map('portfolio_json_row',$rows),
        ]);
    }
    if (($segments[0]??'')==='students' && $method==='GET') {
        teacher_student_file_detail(route_id($segments,1),$teacherId);
    }
    if (($segments[0]??'')==='certificates' && isset($segments[1])) {
        $certificateId=route_id($segments,1);
        if ($method==='GET') teacher_student_certificate_view($certificateId,$teacherId);
        if ($method==='DELETE') teacher_student_certificate_delete($certificateId,$teacherId);
        Http::json(['error'=>'الطريقة غير مسموحة.'],405);
    }
    if (isset($segments[0]) && in_array(($segments[1]??''),['file','download'],true) && $method==='GET') {
        $fileId=route_id($segments,0);
        $row=fetch_one(
            'SELECT f.id,f.original_name,f.stored_name,f.mime_type,f.size_bytes,f.certificate_key
             FROM student_portfolio_files f
             JOIN students s ON s.id=f.student_id
             JOIN classes c ON c.id=s.class_id
             WHERE f.id=? AND c.teacher_id=?',
            [$fileId,$teacherId]
        );
        if (!$row) Http::json(['error'=>'الملف غير موجود ضمن طالباتك.'],404);
        if (!empty($row['certificate_key'])) Http::json(['error'=>'يمكن للطالبة إعادة عرض الشهادة من ملف إنجازها.'],422);
        portfolio_send_file($row,($segments[1]??'')==='download');
    }
    if (isset($segments[0]) && ($segments[1]??'')==='review' && $method==='PUT') teacher_review_portfolio_file(route_id($segments,0),$teacherId);
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function teacher_student_file_directory_json(array $row): array
{
    return [
        'id'=>(int)$row['id'],
        'name'=>(string)$row['name'],
        'email'=>(string)$row['email'],
        'stage'=>(string)$row['stage'],
        'gradeLabel'=>(string)($row['grade_label']??''),
        'classId'=>(int)$row['class_id'],
        'className'=>(string)$row['class_name'],
        'workCount'=>(int)$row['work_count'],
        'gameAttemptCount'=>(int)$row['game_attempt_count'],
        'certificateCount'=>(int)$row['certificate_count'],
    ];
}

function teacher_student_file_detail(int $studentId,int $teacherId): never
{
    $student=fetch_one(
        'SELECT s.id,s.name,s.email,c.stage,c.grade_label,c.id AS class_id,c.name AS class_name
         FROM students s JOIN classes c ON c.id=s.class_id
         WHERE s.id=? AND c.teacher_id=? AND s.deleted_at IS NULL LIMIT 1',
        [$studentId,$teacherId]
    );
    if (!$student) Http::json(['error'=>'الطالبة غير موجودة ضمن طالباتكِ الحاليات.'],404);

    $files=fetch_all(
        'SELECT f.id,f.student_id,f.category,f.title,f.note,f.original_name,f.mime_type,f.size_bytes,
                f.review_status,f.teacher_comment,f.reviewed_at,f.awarded_points,f.certificate_key,f.certificate_data_json,f.created_at,
                s.name AS student_name,s.email AS student_email,c.stage,c.grade_label,c.id AS class_id,c.name AS class_name
         FROM student_portfolio_files f
         JOIN students s ON s.id=f.student_id JOIN classes c ON c.id=s.class_id
         WHERE f.student_id=? AND c.teacher_id=? AND f.certificate_key IS NULL
         ORDER BY f.created_at DESC,f.id DESC',
        [$studentId,$teacherId]
    );
    $attempts=teacher_student_game_attempts($studentId);
    $certificates=teacher_student_game_certificates($studentId,$attempts);
    Http::json([
        'student'=>teacher_student_file_directory_json($student+[
            'work_count'=>count($files),
            'game_attempt_count'=>count($attempts),
            'certificate_count'=>count($certificates),
        ]),
        'files'=>array_map('portfolio_json_row',$files),
        'gameAttempts'=>$attempts,
        'certificates'=>$certificates,
    ]);
}

function portfolio_game_snapshot(array $row): array
{
    $snapshot=json_decode((string)($row['game_snapshot_json']??''),true);
    return is_array($snapshot)?$snapshot:[];
}

function portfolio_game_attempt_started_at(array $row): ?string
{
    $started=trim((string)($row['started_at']??''));
    if ($started!=='') return $started;
    $played=trim((string)($row['played_at']??''));
    $duration=(int)($row['duration_seconds']??0);
    if ($played==='' || $duration<1) return null;
    try {
        return (new DateTimeImmutable($played))->modify('-'.$duration.' seconds')->format('Y-m-d H:i:s');
    } catch (Throwable) {
        return null;
    }
}

function portfolio_game_attempt_name(array $row,array $snapshot): string
{
    $game=(array)($snapshot['game']??[]);
    foreach ([$row['game_name']??null,$game['name']??null,$game['lesson_name']??null,$game['lessonName']??null,$row['lesson_name']??null] as $candidate) {
        $name=trim((string)$candidate);
        if ($name!=='') return $name;
    }
    $key=(string)($row['game_key']??'');
    return (string)(interactive_game_catalog()[$key]['name']??$key?:'لعبة تفاعلية');
}

function portfolio_game_attempt_prefix(array $row,array $snapshot): string
{
    $game=(array)($snapshot['game']??[]);
    $unit=(int)($game['unit_number']??$game['unitNumber']??0);
    $lesson=(int)($game['lesson_number']??$game['lessonNumber']??0);
    $gameKey=trim((string)($row['game_key']??''));
    return $gameKey!=='' && $unit>0 && $lesson>0 ? sprintf('%s:u%d:l%d',$gameKey,$unit,$lesson) : '';
}

function teacher_student_game_attempts(int $studentId): array
{
    if (interactive_game_builder_schema_ready()) {
        $rows=fetch_all(
            'SELECT a.id,a.student_id,a.game_key,a.game_id,a.game_version_id,a.difficulty,a.score,a.max_score,
                    a.question_count,a.correct_count,a.accuracy,a.duration_seconds,a.run_status,a.started_at,a.played_at,
                    a.game_snapshot_json,g.name AS game_name,g.lesson_name,p.academic_year,p.semester
             FROM game_attempts a
             LEFT JOIN teacher_interactive_games g ON g.id=a.game_id
             LEFT JOIN interactive_game_publications p ON p.id=a.publication_id
             WHERE a.student_id=?
             ORDER BY COALESCE(a.started_at,a.played_at),a.id',
            [$studentId]
        );
    } else {
        $rows=fetch_all(
            'SELECT a.id,a.student_id,a.game_key,NULL AS game_id,NULL AS game_version_id,a.difficulty,a.score,NULL AS max_score,
                    a.question_count,a.correct_count,a.accuracy,a.duration_seconds,NULL AS run_status,NULL AS started_at,a.played_at,
                    a.game_snapshot_json,NULL AS game_name,NULL AS lesson_name,NULL AS academic_year,NULL AS semester
             FROM game_attempts a WHERE a.student_id=? ORDER BY a.played_at,a.id',
            [$studentId]
        );
    }

    $numbers=[];$attempts=[];
    foreach ($rows as $row) {
        $snapshot=portfolio_game_snapshot($row);
        $identity=(int)($row['game_id']??0)>0?'game:'.(int)$row['game_id']:'key:'.(string)$row['game_key'];
        $numbers[$identity]=($numbers[$identity]??0)+1;
        $status=(string)($row['run_status']??'');
        $completed=$status==='' || $status==='completed';
        $questionCount=(int)$row['question_count'];
        $accuracy=(float)$row['accuracy'];
        if ($accuracy<=0 && (int)$row['correct_count']>0 && $questionCount>0) {
            $accuracy=round(((int)$row['correct_count']/$questionCount)*100,2);
        }
        $context=(array)($snapshot['context']??[]);
        $settings=(array)($snapshot['settings']??[]);
        $attempts[]=[
            'id'=>(int)$row['id'],
            'gameId'=>(int)($row['game_id']??0)?:null,
            'gameVersionId'=>(int)($row['game_version_id']??0)?:null,
            'gameKey'=>(string)$row['game_key'],
            'gameName'=>portfolio_game_attempt_name($row,$snapshot),
            'attemptNumber'=>$numbers[$identity],
            'difficulty'=>(string)$row['difficulty'],
            'score'=>(float)$row['score'],
            'maxScore'=>$row['max_score']===null?null:(float)$row['max_score'],
            'questionCount'=>$questionCount,
            'correctCount'=>(int)$row['correct_count'],
            'percentage'=>$accuracy,
            'status'=>$completed?'completed':'started',
            'statusCode'=>$status!==''?$status:($completed?'completed':'in_progress'),
            'startedAt'=>portfolio_game_attempt_started_at($row),
            'completedAt'=>$completed?(string)$row['played_at']:null,
            'academicYear'=>(string)($row['academic_year']??$context['academicYear']??$settings['academic_year']??''),
            'semester'=>(string)($row['semester']??$settings['current_semester']??''),
            '_certificatePrefix'=>portfolio_game_attempt_prefix($row,$snapshot),
        ];
    }
    foreach ($attempts as &$attempt) unset($attempt['_certificatePrefix']);
    unset($attempt);
    return array_reverse($attempts);
}

function teacher_student_game_certificates(int $studentId,array $attempts=[]): array
{
    $rows=fetch_all(
        'SELECT id,certificate_key,certificate_data_json,created_at
         FROM student_portfolio_files
         WHERE student_id=? AND certificate_key IS NOT NULL
         ORDER BY created_at DESC,id DESC',
        [$studentId]
    );
    $attemptsById=[];
    foreach ($attempts as $attempt) $attemptsById[(int)$attempt['id']]=$attempt;
    $certificates=[];
    $seen=[];
    foreach ($rows as $row) {
        $payload=json_decode((string)($row['certificate_data_json']??''),true);
        if (!is_array($payload)) continue;
        $groupKey=portfolio_certificate_group_key($row);
        if (isset($seen[$groupKey])) continue;
        $seen[$groupKey]=true;
        $attemptId=(int)($payload['attemptId']??0);
        $attempt=$attemptsById[$attemptId]??[];
        $certificates[]=[
            'id'=>(int)$row['id'],
            'attemptId'=>$attemptId?:null,
            'attemptNumber'=>(int)($attempt['attemptNumber']??0)?:null,
            'gameId'=>(int)($payload['gameId']??$attempt['gameId']??0)?:null,
            'gameName'=>(string)($attempt['gameName']??$payload['gameName']??$payload['lessonName']??'لعبة تفاعلية'),
            'lessonName'=>(string)($payload['lessonName']??''),
            'score'=>(float)($payload['score']??$attempt['score']??0),
            'maxScore'=>isset($attempt['maxScore'])&&$attempt['maxScore']!==null?(float)$attempt['maxScore']:null,
            'percentage'=>(float)($payload['accuracy']??$attempt['percentage']??0),
            'sentAt'=>(string)$row['created_at'],
        ];
    }
    return $certificates;
}

function teacher_student_certificate_view(int $certificateId,int $teacherId): never
{
    $row=fetch_one(
        'SELECT f.id,f.student_id,f.certificate_key,f.certificate_data_json,f.created_at
         FROM student_portfolio_files f
         JOIN students s ON s.id=f.student_id JOIN classes c ON c.id=s.class_id
         WHERE f.id=? AND f.certificate_key IS NOT NULL AND c.teacher_id=? AND s.deleted_at IS NULL LIMIT 1',
        [$certificateId,$teacherId]
    );
    if (!$row) Http::json(['error'=>'الشهادة غير موجودة ضمن ملفات طالباتكِ.'],404);
    $certificate=json_decode((string)$row['certificate_data_json'],true);
    if (!is_array($certificate)) Http::json(['error'=>'تعذّر قراءة بيانات الشهادة.'],500);
    $attemptId=(int)($certificate['attemptId']??0);
    if ($attemptId>0) {
        $attempt=fetch_one('SELECT score,max_score,correct_count,question_count,accuracy FROM game_attempts WHERE id=? AND student_id=? LIMIT 1',[$attemptId,(int)$row['student_id']]);
        if ($attempt) {
            $certificate['score']=(float)$attempt['score'];
            $certificate['maxScore']=$attempt['max_score']===null?null:(float)$attempt['max_score'];
            $certificate['correctCount']=(int)$attempt['correct_count'];
            $certificate['questionCount']=(int)$attempt['question_count'];
            $certificate['accuracy']=(float)$attempt['accuracy'];
        }
    }
    $certificate['portfolioId']=(int)$row['id'];
    $certificate['sentAt']=(string)$row['created_at'];
    Http::json(['certificate'=>$certificate]);
}

function teacher_student_certificate_delete(int $certificateId,int $teacherId): never
{
    $storedNames=[];$studentId=0;$certificateKey='';
    try {
        $deleted=Database::transaction(function(PDO $pdo) use($certificateId,$teacherId,&$storedNames,&$studentId,&$certificateKey): int {
            $statement=$pdo->prepare(
                'SELECT f.id,f.student_id,f.stored_name,f.certificate_key,f.certificate_data_json
                 FROM student_portfolio_files f
                 JOIN students s ON s.id=f.student_id JOIN classes c ON c.id=s.class_id
                 WHERE f.id=? AND f.certificate_key IS NOT NULL AND c.teacher_id=? AND s.deleted_at IS NULL LIMIT 1 FOR UPDATE'
            );
            $statement->execute([$certificateId,$teacherId]);
            $certificate=$statement->fetch();
            if (!$certificate) throw new DomainException('not_found');
            $studentId=(int)$certificate['student_id'];
            $certificateKey=(string)$certificate['certificate_key'];
            $storedNames=[(string)$certificate['stored_name']];
            $delete=$pdo->prepare('DELETE FROM student_portfolio_files WHERE id=?');
            $delete->execute([(int)$certificate['id']]);
            return $delete->rowCount();
        });
    } catch (DomainException $error) {
        Http::json(['error'=>'الشهادة غير موجودة ضمن ملفات طالباتكِ.'],404);
    }
    portfolio_remove_stored_files($storedNames);
    Activity::log('teacher',$teacherId,'مسح شهادة لعبة لطالبة','الطالبة رقم '.$studentId.' · '.$certificateKey.' · عدد السجلات '.$deleted);
    Http::json(['ok'=>true,'deleted'=>$deleted,'studentId'=>$studentId]);
}

function teacher_review_portfolio_file(int $fileId,int $teacherId): never
{
    ensure_teacher_tools_schema();
    $data=Http::input();
    $status=trim((string)($data['status']??'pending'));
    $comment=trim((string)($data['comment']??''));
    $pointsRaw=$data['points']??0;
    $points=filter_var($pointsRaw,FILTER_VALIDATE_INT);

    if (!in_array($status,['pending','approved','needs_revision'],true)) Http::json(['error'=>'حالة المراجعة غير صالحة.'],422);
    if (mb_strlen($comment)>1000) Http::json(['error'=>'تعليق المعلمة يجب ألا يتجاوز 1000 حرف.'],422);
    if ($status==='needs_revision' && $comment==='') Http::json(['error'=>'اكتبي للطالبة التعديل المطلوب أولًا.'],422);
    if ($points===false || (int)$points<0 || (int)$points>1000) Http::json(['error'=>'عدد النقاط يجب أن يكون بين 1 و1000.'],422);

    $reasonTypes=[
        'homework'=>'homework',
        'worksheet'=>'task',
        'task'=>'task',
        'project'=>'task',
        'achievement_image'=>'other',
        'other'=>'other',
    ];

    try {
        $result=Database::transaction(function(PDO $pdo) use($fileId,$teacherId,$status,$comment,$points,$reasonTypes): array {
            $statement=$pdo->prepare(
                'SELECT f.*,s.name AS student_name
                 FROM student_portfolio_files f
                 JOIN students s ON s.id=f.student_id
                 JOIN classes c ON c.id=s.class_id
                 WHERE f.id=? AND c.teacher_id=? LIMIT 1 FOR UPDATE'
            );
            $statement->execute([$fileId,$teacherId]);
            $file=$statement->fetch();
            if (!$file) throw new DomainException('not_found');

            $pointId=(int)($file['motivation_point_id']??0);
            $awardedPoints=(int)($file['awarded_points']??0);
            $pointsAdded=0;
            if ($status==='needs_revision' && $pointId>0) throw new DomainException('already_approved');

            if ($status==='approved' && $pointId===0) {
                if ((int)$points<1) throw new DomainException('points_required');
                $category=(string)$file['category'];
                $categoryLabel=portfolio_categories()[$category]??'ملف إنجاز';
                $details='اعتماد '.$categoryLabel.': '.(string)$file['title'];
                $insert=$pdo->prepare('INSERT INTO motivational_points (teacher_id,student_id,points,reason_type,reason,details) VALUES (?,?,?,?,?,?)');
                $insert->execute([$teacherId,(int)$file['student_id'],(int)$points,$reasonTypes[$category]??'other',$categoryLabel,$details]);
                $pointId=(int)$pdo->lastInsertId();
                $awardedPoints=(int)$points;
                $pointsAdded=(int)$points;
            }

            $update=$pdo->prepare(
                "UPDATE student_portfolio_files
                 SET review_status=?,teacher_comment=NULLIF(?,''),reviewed_by=?,reviewed_at=NOW(),awarded_points=?,motivation_point_id=NULLIF(?,0)
                 WHERE id=?"
            );
            $update->execute([$status,$comment,$teacherId,$awardedPoints,$pointId,$fileId]);

            $file['review_status']=$status;
            $file['teacher_comment']=$comment!==''?$comment:null;
            $file['reviewed_at']=date('Y-m-d H:i:s');
            $file['awarded_points']=$awardedPoints;
            return [
                'file'=>portfolio_json_row($file),
                'studentName'=>(string)$file['student_name'],
                'pointsAdded'=>$pointsAdded,
            ];
        });
    } catch (DomainException $error) {
        $responses=[
            'not_found'=>['الملف غير موجود أو لا يتبع إحدى طالباتك.',404],
            'already_approved'=>['سبق اعتماد العمل وإضافة نقاطه، لذلك لا يمكن إعادته للتعديل.',422],
            'points_required'=>['حددي نقاط مدار قبل اعتماد العمل.',422],
        ];
        [$message,$code]=$responses[$error->getMessage()]??['تعذّر حفظ المراجعة.',422];
        Http::json(['error'=>$message],$code);
    }

    Activity::log('teacher',$teacherId,'مراجعة ملف طالبة','الملف رقم '.$fileId.' — الحالة '.$status.' — النقاط '.$result['pointsAdded']);
    Http::json($result);
}

function student_portfolio_upload(int $studentId): never
{
    ensure_academic_year_management_schema();
    $studentContext=fetch_one('SELECT c.teacher_id FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=?',[$studentId]);
    $academicYear=$studentContext ? (string)(teacher_school_settings_row((int)$studentContext['teacher_id'])['academic_year']??'') : '';
    $categories=portfolio_categories();
    $category=trim((string)($_POST['category']??''));
    $title=trim((string)($_POST['title']??''));
    $note=trim((string)($_POST['note']??''));
    if (!isset($categories[$category])) Http::json(['error'=>'اختاري نوع العمل.'],422);
    if ($title==='' || mb_strlen($title)>190) Http::json(['error'=>'اكتبي عنوانًا للعمل لا يتجاوز 190 حرفًا.'],422);
    if (mb_strlen($note)>1000) Http::json(['error'=>'الملاحظة طويلة جدًا.'],422);
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) Http::json(['error'=>'اختاري ملف PDF أو صورة.'],422);

    $upload=$_FILES['file'];
    $error=(int)($upload['error']??UPLOAD_ERR_NO_FILE);
    if ($error!==UPLOAD_ERR_OK) {
        $message=match($error) {
            UPLOAD_ERR_INI_SIZE,UPLOAD_ERR_FORM_SIZE=>'حجم الملف أكبر من المسموح في الخادم.',
            UPLOAD_ERR_PARTIAL=>'لم يكتمل رفع الملف. حاولي مرة أخرى.',
            UPLOAD_ERR_NO_FILE=>'اختاري ملف PDF أو صورة.',
            default=>'تعذّر رفع الملف. حاولي مرة أخرى.',
        };
        Http::json(['error'=>$message],422);
    }

    $temporary=(string)($upload['tmp_name']??'');
    if ($temporary==='' || !is_uploaded_file($temporary)) Http::json(['error'=>'ملف الرفع غير صالح.'],422);
    $size=(int)(filesize($temporary)?:0);
    $maximum=10*1024*1024;
    if ($size<1 || $size>$maximum) Http::json(['error'=>'يجب ألا يتجاوز حجم الملف 10 ميجابايت.'],422);
    if (!class_exists('finfo')) Http::json(['error'=>'الخادم يحتاج إضافة Fileinfo للتحقق من الملفات.'],500);
    $mime=(new finfo(FILEINFO_MIME_TYPE))->file($temporary)?:'';
    $allowed=portfolio_allowed_mime_types();
    if (!isset($allowed[$mime])) Http::json(['error'=>'الصيغ المسموحة هي PDF أو صورة فقط.'],422);

    $original=portfolio_safe_original_name((string)($upload['name']??''),$allowed[$mime]);
    $stored=bin2hex(random_bytes(20)).'.'.$allowed[$mime];
    $path=portfolio_storage_directory().'/'.$stored;
    if (!move_uploaded_file($temporary,$path)) Http::json(['error'=>'تعذّر حفظ الملف المرفوع.'],500);
    @chmod($path,0640);
    try {
        execute_sql(
            'INSERT INTO student_portfolio_files (student_id,academic_year,category,title,note,original_name,stored_name,mime_type,size_bytes) VALUES (?,?,?,?,?,?,?,?,?)',
            [$studentId,$academicYear!==''?$academicYear:null,$category,$title,$note!==''?$note:null,$original,$stored,$mime,$size]
        );
    } catch (Throwable $error) {
        @unlink($path);
        throw $error;
    }
    $id=(int)Database::connection()->lastInsertId();
    Activity::log('student',$studentId,'إضافة ملف إنجاز',$categories[$category].' — '.$title);
    $row=fetch_one('SELECT id,category,title,note,original_name,mime_type,size_bytes,review_status,teacher_comment,reviewed_at,awarded_points,certificate_key,created_at FROM student_portfolio_files WHERE id=? AND student_id=?',[$id,$studentId]);
    if (!$row) {
        @unlink($path);
        Http::json(['error'=>'تم حفظ الملف لكن تعذّر قراءة بياناته.'],500);
    }
    Http::json(['ok'=>true,'file'=>portfolio_json_row($row)],201);
}

function portfolio_safe_original_name(string $name,string $extension): string
{
    $name=basename(str_replace('\\','/',$name));
    $name=preg_replace('/[\x00-\x1F\x7F]/u','',$name)??'';
    $name=trim($name);
    if ($name==='') $name='ملف-إنجاز.'.$extension;
    return mb_substr($name,0,255);
}

function portfolio_send_file(array $row,bool $download=false): never
{
    $stored=(string)($row['stored_name']??'');
    if (!preg_match('/^[a-f0-9]{40}\.(?:pdf|jpg|png|webp|gif|avif|heic|heif|json)$/',$stored)) Http::json(['error'=>'مسار الملف غير صالح.'],404);
    $path=portfolio_storage_directory().'/'.$stored;
    if (!is_file($path)) Http::json(['error'=>'الملف غير موجود في التخزين.'],404);
    $original=portfolio_safe_original_name((string)($row['original_name']??''),pathinfo($stored,PATHINFO_EXTENSION));
    $fallback='madar-portfolio.'.pathinfo($stored,PATHINFO_EXTENSION);
    header('Content-Type: '.(string)$row['mime_type']);
    header('Content-Length: '.filesize($path));
    $disposition=$download?'attachment':'inline';
    header("Content-Disposition: {$disposition}; filename=\"{$fallback}\"; filename*=UTF-8''".rawurlencode($original));
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

function portfolio_student_stored_files(int $studentId): array
{
    ensure_student_portfolio_schema();
    return array_values(array_map('strval',array_column(fetch_all('SELECT stored_name FROM student_portfolio_files WHERE student_id=?',[$studentId]),'stored_name')));
}

function portfolio_remove_stored_files(array $storedNames): void
{
    if (!$storedNames) return;
    $directory=MADAR_ROOT.'/storage/private/student-portfolios';
    if (!is_dir($directory)) return;
    foreach($storedNames as $stored) {
        if (preg_match('/^[a-f0-9]{40}\.(?:pdf|jpg|png|webp|gif|avif|heic|heif|json)$/',(string)$stored)) @unlink($directory.'/'.(string)$stored);
    }
}
