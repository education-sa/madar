<?php
declare(strict_types=1);

const FLIPPED_CLASSROOM_BASE_MIGRATION = 'migration_20260814_flipped_classroom.sql';
const FLIPPED_CLASSROOM_MIGRATION = 'migration_20260913_flipped_classroom_attempts.sql';
const FLIPPED_CLASSROOM_MAX_VIDEO_BYTES = 209715200;

function flipped_classroom_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $names = ['teacher_flipped_lessons','teacher_flipped_questions','teacher_flipped_submissions','teacher_flipped_answers'];
        $marks = implode(',', array_fill(0, count($names), '?'));
        $row = fetch_one("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ({$marks})", $names);
        if ((int)($row['n'] ?? 0) !== count($names)) return $ready = false;
        $column = fetch_one("SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='teacher_flipped_submissions' AND column_name='attempt_no'");
        $unique = fetch_one("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS columns_list,MAX(non_unique) AS non_unique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='teacher_flipped_submissions' AND index_name='uq_flipped_submission_attempt'");
        $statusIndex = fetch_one("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS columns_list FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='teacher_flipped_submissions' AND index_name='idx_flipped_submission_student_status'");
        return $ready = (int)($column['n'] ?? 0) === 1
            && (string)($unique['columns_list'] ?? '') === 'lesson_id,student_id,attempt_no'
            && (int)($unique['non_unique'] ?? 1) === 0
            && (string)($statusIndex['columns_list'] ?? '') === 'lesson_id,student_id,status,attempt_no';
    } catch (Throwable) {
        return $ready = false;
    }
}

function flipped_require_schema(): void
{
    if (!flipped_classroom_schema_ready()) {
        Http::json([
            'error' => 'يلزم تجهيز سجل محاولات الصف المقلوب. شغّلي ترحيل الصف المقلوب الأساسي ثم ترحيل المحاولات التراكمي.',
            'migrationReady' => false,
            'migration' => FLIPPED_CLASSROOM_MIGRATION,
            'migrationOrder' => [FLIPPED_CLASSROOM_BASE_MIGRATION, FLIPPED_CLASSROOM_MIGRATION],
        ], 503);
    }
}

function flipped_json(mixed $value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) Http::json(['error' => 'تعذّر تجهيز بيانات الصف المقلوب.'], 422);
    return $json;
}

function flipped_decode(mixed $value, mixed $fallback = null): mixed
{
    if (is_array($value)) return $value;
    if ($value === null || $value === '') return $fallback;
    $decoded = json_decode((string)$value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
}

function flipped_teacher_class(int $teacherId, int $classId): array
{
    $row = fetch_one('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE id=? AND teacher_id=?', [$classId,$teacherId]);
    if (!$row) Http::json(['error'=>'الفصل المختار غير تابع لحسابك.'],403);
    return $row;
}

function flipped_teacher_lesson(int $teacherId, int $lessonId): array
{
    $row = fetch_one('SELECT l.*,c.name AS class_name FROM teacher_flipped_lessons l JOIN classes c ON c.id=l.class_id WHERE l.id=? AND l.teacher_id=? AND l.deleted_at IS NULL', [$lessonId,$teacherId]);
    if (!$row) Http::json(['error'=>'درس الصف المقلوب غير موجود.'],404);
    return $row;
}

function flipped_question_rows(int $lessonId, bool $includeCorrect = true): array
{
    $rows = fetch_all('SELECT id,question_key,time_seconds,question_type,prompt,options_json,correct_answer_json,max_points,sort_order FROM teacher_flipped_questions WHERE lesson_id=? ORDER BY sort_order,time_seconds,id', [$lessonId]);
    return array_map(static function(array $row) use ($includeCorrect): array {
        $mapped = [
            'id'=>(int)$row['id'], 'key'=>(string)$row['question_key'], 'time'=>round((float)$row['time_seconds'],3),
            'type'=>(string)$row['question_type'], 'text'=>(string)$row['prompt'],
            'options'=>flipped_decode($row['options_json'], []), 'maxPoints'=>(float)$row['max_points'],
        ];
        if ($includeCorrect) $mapped['correctAnswer'] = flipped_decode($row['correct_answer_json']);
        return $mapped;
    }, $rows);
}

function flipped_map_lesson(array $row, bool $detail = false): array
{
    $duration=max(0,(float)($row['video_duration_seconds']??0));
    [$trimStart,$trimEnd]=flipped_read_video_trim((string)($row['video_stored_name']??''),$duration);
    $mapped = [
        'id'=>(int)$row['id'], 'classId'=>(int)$row['class_id'], 'className'=>(string)($row['class_name']??''),
        'title'=>(string)$row['title'], 'description'=>(string)($row['description']??''), 'subjectName'=>(string)($row['subject_name']??''),
        'unitNumber'=>(string)($row['unit_number']??''), 'lessonNumber'=>(string)($row['lesson_number']??''),
        'stage'=>(string)$row['stage'], 'gradeLabel'=>(string)$row['grade_label'], 'semester'=>(string)$row['semester'],
        'status'=>(string)$row['lifecycle_status'], 'hasVideo'=>!empty($row['video_stored_name']),
        'videoOriginalName'=>(string)($row['video_original_name']??''), 'videoDuration'=>$duration,
        'trimStart'=>round($trimStart,3), 'trimEnd'=>round($trimEnd,3),
        'createdAt'=>(string)$row['created_at'], 'updatedAt'=>(string)$row['updated_at'],
        'questionCount'=>(int)($row['question_count']??0), 'submissionCount'=>(int)($row['submission_count']??0),
    ];
    if ($detail) $mapped['questions'] = flipped_question_rows((int)$row['id'], true);
    return $mapped;
}

function flipped_validate_lesson_input(array $data, int $teacherId, ?array $existing = null): array
{
    $classId = (int)($data['classId'] ?? $existing['class_id'] ?? 0);
    $class = flipped_teacher_class($teacherId,$classId);
    $title = trim((string)($data['title'] ?? $existing['title'] ?? ''));
    if ($title === '' || mb_strlen($title)>190) Http::json(['error'=>'اكتبي عنوانًا صحيحًا للدرس.'],422);
    $semester = (string)($data['semester'] ?? $existing['semester'] ?? 'first');
    if (!in_array($semester,['first','second'],true)) $semester='first';
    return [
        'classId'=>$classId,'class'=>$class,'title'=>$title,
        'description'=>mb_substr(trim((string)($data['description']??$existing['description']??'')),0,5000),
        'subjectName'=>mb_substr(trim((string)($data['subjectName']??$existing['subject_name']??'')),0,180),
        'unitNumber'=>mb_substr(trim((string)($data['unitNumber']??$existing['unit_number']??'')),0,40),
        'lessonNumber'=>mb_substr(trim((string)($data['lessonNumber']??$existing['lesson_number']??'')),0,40),
        'semester'=>$semester,
    ];
}

function flipped_validate_questions(mixed $raw): array
{
    $questions = is_array($raw) ? array_values($raw) : [];
    if (count($questions)>100) Http::json(['error'=>'الحد الأقصى 100 سؤال في الدرس.'],422);
    $valid=[];$keys=[];
    foreach($questions as $index=>$question) {
        if(!is_array($question)) Http::json(['error'=>'بيانات أحد الأسئلة غير صحيحة.'],422);
        $key=preg_replace('/[^a-zA-Z0-9_-]/','',substr((string)($question['key']??''),0,80))?:'q-'.($index+1).'-'.bin2hex(random_bytes(4));
        if(isset($keys[$key])) Http::json(['error'=>'معرّف السؤال مكرر.'],422);$keys[$key]=true;
        $time=round((float)($question['time']??0),3);if($time<0||$time>86400) Http::json(['error'=>'توقيت السؤال غير صحيح.'],422);
        $type=(string)($question['type']??'multiple_choice');if($type==='multiple')$type='multiple_choice';
        if(!in_array($type,['multiple_choice','essay'],true)) Http::json(['error'=>'نوع السؤال غير مدعوم.'],422);
        $text=trim((string)($question['text']??''));if($text===''||mb_strlen($text)>2000) Http::json(['error'=>'اكتبي نص كل سؤال.'],422);
        $max=round((float)($question['maxPoints']??1),2);if($max<=0||$max>1000) Http::json(['error'=>'درجة السؤال يجب أن تكون أكبر من صفر وحتى 1000.'],422);
        $options=[];$correct=null;
        if($type==='multiple_choice') {
            $options=array_map(static fn($v)=>mb_substr(trim((string)$v),0,500),array_values((array)($question['options']??[])));
            if(count($options)!==4||in_array('', $options, true)) Http::json(['error'=>'أكملي البدائل الأربعة لكل سؤال اختيار من متعدد.'],422);
            $correct=(int)($question['correctIndex']??$question['correctAnswer']??-1);if($correct<0||$correct>3) Http::json(['error'=>'حددي الإجابة الصحيحة لكل سؤال اختيار من متعدد.'],422);
        }
        $valid[]=['key'=>$key,'time'=>$time,'type'=>$type,'text'=>$text,'options'=>$options,'correct'=>$correct,'max'=>$max,'sort'=>$index];
    }
    return $valid;
}

function flipped_replace_questions(PDO $pdo,int $lessonId,array $questions): void
{
    $pdo->prepare('DELETE FROM teacher_flipped_questions WHERE lesson_id=?')->execute([$lessonId]);
    $stmt=$pdo->prepare('INSERT INTO teacher_flipped_questions(lesson_id,question_key,time_seconds,question_type,prompt,options_json,correct_answer_json,max_points,sort_order) VALUES(?,?,?,?,?,?,?,?,?)');
    foreach($questions as $q) $stmt->execute([$lessonId,$q['key'],$q['time'],$q['type'],$q['text'],$q['type']==='multiple_choice'?flipped_json($q['options']):null,$q['type']==='multiple_choice'?flipped_json($q['correct']):null,$q['max'],$q['sort']]);
}

function teacher_flipped_context(int $teacherId): never
{
    $classes=fetch_all('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE teacher_id=? ORDER BY stage,grade_label,name',[$teacherId]);
    if(!flipped_classroom_schema_ready()) Http::json(['migrationReady'=>false,'migration'=>FLIPPED_CLASSROOM_MIGRATION,'migrationOrder'=>[FLIPPED_CLASSROOM_BASE_MIGRATION,FLIPPED_CLASSROOM_MIGRATION],'classes'=>$classes,'lessons'=>[],'maxVideoBytes'=>FLIPPED_CLASSROOM_MAX_VIDEO_BYTES]);
    $classId=(int)($_GET['classId']??0);$params=[$teacherId];$where='l.teacher_id=? AND l.deleted_at IS NULL';
    if($classId){flipped_teacher_class($teacherId,$classId);$where.=' AND l.class_id=?';$params[]=$classId;}
    $rows=fetch_all("SELECT l.*,c.name AS class_name,(SELECT COUNT(*) FROM teacher_flipped_questions q WHERE q.lesson_id=l.id) question_count,(SELECT COUNT(DISTINCT s.student_id) FROM teacher_flipped_submissions s WHERE s.lesson_id=l.id) submission_count FROM teacher_flipped_lessons l JOIN classes c ON c.id=l.class_id WHERE {$where} ORDER BY l.updated_at DESC,l.id DESC",$params);
    $lessons=array_map(static function(array $row): array {
        $mapped=flipped_map_lesson($row);
        $mapped['activeLearning']=flipped_active_learning_summary($row);
        return $mapped;
    },$rows);
    Http::json(['migrationReady'=>true,'migration'=>FLIPPED_CLASSROOM_MIGRATION,'classes'=>$classes,'lessons'=>$lessons,'maxVideoBytes'=>FLIPPED_CLASSROOM_MAX_VIDEO_BYTES]);
}

function teacher_flipped_create(int $teacherId): never
{
    flipped_require_schema();$data=Http::input();$fields=flipped_validate_lesson_input($data,$teacherId);$questions=flipped_validate_questions($data['questions']??[]);
    $id=Database::transaction(function(PDO $pdo)use($teacherId,$fields,$questions):int{
        $stmt=$pdo->prepare('INSERT INTO teacher_flipped_lessons(teacher_id,class_id,title,description,subject_name,unit_number,lesson_number,stage,grade_label,semester) VALUES(?,?,?,?,?,?,?,?,?,?)');
        $c=$fields['class'];$stmt->execute([$teacherId,$fields['classId'],$fields['title'],$fields['description'],$fields['subjectName'],$fields['unitNumber'],$fields['lessonNumber'],$c['stage'],$c['grade_label'],$fields['semester']]);
        $id=(int)$pdo->lastInsertId();flipped_replace_questions($pdo,$id,$questions);return $id;
    });
    Activity::log('teacher',$teacherId,'إنشاء درس صف مقلوب',"الدرس {$id} · {$fields['title']}");Http::json(['id'=>$id,'message'=>'تم حفظ مسودة الدرس.'],201);
}

function teacher_flipped_detail(int $teacherId,int $lessonId): never
{
    flipped_require_schema();$row=flipped_teacher_lesson($teacherId,$lessonId);$row['question_count']=count(flipped_question_rows($lessonId));$row['submission_count']=(int)(fetch_one('SELECT COUNT(DISTINCT student_id) n FROM teacher_flipped_submissions WHERE lesson_id=?',[$lessonId])['n']??0);Http::json(['lesson'=>flipped_map_lesson($row,true)]);
}

function teacher_flipped_update(int $teacherId,int $lessonId): never
{
    flipped_require_schema();$existing=flipped_teacher_lesson($teacherId,$lessonId);if($existing['lifecycle_status']!=='draft')Http::json(['error'=>'أعيدي الدرس إلى المسودة قبل تعديل بنيته.'],409);
    $data=Http::input();$fields=flipped_validate_lesson_input($data,$teacherId,$existing);$hasQuestions=array_key_exists('questions',$data);$questions=$hasQuestions?flipped_validate_questions($data['questions']):[];
    $submissions=(int)(fetch_one('SELECT COUNT(*) n FROM teacher_flipped_submissions WHERE lesson_id=?',[$lessonId])['n']??0);if($hasQuestions&&$submissions>0)Http::json(['error'=>'لا يمكن تغيير أسئلة درس له تسليمات. يمكنك تعديل بياناته النصية فقط.'],409);
    if($submissions>0&&$fields['classId']!==(int)$existing['class_id'])Http::json(['error'=>'لا يمكن نقل درس له تسليمات إلى فصل آخر.'],409);
    Database::transaction(function(PDO $pdo)use($teacherId,$lessonId,$fields,$hasQuestions,$questions):void{$c=$fields['class'];$pdo->prepare('UPDATE teacher_flipped_lessons SET class_id=?,title=?,description=?,subject_name=?,unit_number=?,lesson_number=?,stage=?,grade_label=?,semester=? WHERE id=? AND teacher_id=?')->execute([$fields['classId'],$fields['title'],$fields['description'],$fields['subjectName'],$fields['unitNumber'],$fields['lessonNumber'],$c['stage'],$c['grade_label'],$fields['semester'],$lessonId,$teacherId]);if($hasQuestions)flipped_replace_questions($pdo,$lessonId,$questions);});
    Activity::log('teacher',$teacherId,'تعديل درس صف مقلوب',"الدرس {$lessonId}");Http::json(['ok'=>true,'message'=>'تم تحديث المسودة.']);
}

function flipped_video_directory(): string
{
    $directory=MADAR_ROOT.'/storage/private/flipped-classroom';if(is_link($directory))Http::json(['error'=>'مسار تخزين الفيديو غير آمن.'],500);if(!is_dir($directory)&&!mkdir($directory,0750,true)&&!is_dir($directory))Http::json(['error'=>'تعذّر تجهيز تخزين الفيديو الخاص.'],500);return $directory;
}

function flipped_safe_video_path(?string $stored): ?string
{
    if(!$stored||!preg_match('/^[a-f0-9]{40}\.(mp4|webm|mov)$/',$stored))return null;$directory=MADAR_ROOT.'/storage/private/flipped-classroom';if(!is_dir($directory)||is_link($directory))return null;$path=$directory.'/'.$stored;return is_file($path)&&!is_link($path)?$path:null;
}

function flipped_video_trim_path(?string $stored): ?string
{
    if(!$stored||!preg_match('/^[a-f0-9]{40}\.(mp4|webm|mov)$/',$stored))return null;
    $directory=MADAR_ROOT.'/storage/private/flipped-classroom';
    if(!is_dir($directory)||is_link($directory))return null;
    return $directory.'/'.$stored.'.trim.json';
}

function flipped_read_video_trim(?string $stored,float $duration): array
{
    $fallback=[0.0,max(0,$duration)];$path=flipped_video_trim_path($stored);
    if(!$path||!is_file($path)||is_link($path))return $fallback;
    $size=@filesize($path);if($size===false||$size<2||$size>4096)return $fallback;
    $raw=@file_get_contents($path);if($raw===false)return $fallback;
    $data=json_decode($raw,true);if(!is_array($data)||!is_numeric($data['trimStart']??null)||!is_numeric($data['trimEnd']??null))return $fallback;
    $start=round((float)$data['trimStart'],3);$end=round((float)$data['trimEnd'],3);
    if(!is_finite($start)||!is_finite($end)||$start<0||$end<=$start)return $fallback;
    if($duration>0){if($start>=$duration||$end>$duration+.25)return $fallback;$end=min($duration,$end);}
    return [$start,$end];
}

function flipped_write_video_trim(string $stored,float $start,float $end): void
{
    $path=flipped_video_trim_path($stored);if(!$path)throw new RuntimeException('تعذّر تجهيز إعدادات قص الفيديو بأمان.');
    $payload=flipped_json(['version'=>1,'trimStart'=>round($start,3),'trimEnd'=>round($end,3)]);
    $temporary=$path.'.'.bin2hex(random_bytes(8)).'.tmp';
    if(@file_put_contents($temporary,$payload,LOCK_EX)===false){@unlink($temporary);throw new RuntimeException('تعذّر حفظ إعدادات قص الفيديو.');}
    @chmod($temporary,0640);
    if(!@rename($temporary,$path)){@unlink($temporary);throw new RuntimeException('تعذّر اعتماد إعدادات قص الفيديو.');}
}

function flipped_delete_video_trim(?string $stored): void
{
    $path=flipped_video_trim_path($stored);if($path&&(is_file($path)||is_link($path)))@unlink($path);
}

function flipped_active_learning_path(int $lessonId, bool $ensureDirectory = false): string
{
    if ($lessonId < 1) throw new InvalidArgumentException('معرّف درس الصف المقلوب غير صالح.');
    $directory = MADAR_ROOT . '/storage/private/flipped-classroom';
    if (is_link($directory)) throw new RuntimeException('مسار إعداد التعلم النشط غير آمن.');
    if ($ensureDirectory && !is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('تعذّر تجهيز تخزين إعداد التعلم النشط.');
    }
    return $directory . '/lesson-' . $lessonId . '.active-learning.json';
}

function flipped_active_learning_defaults(array $lesson): array
{
    return [
        'version' => 1,
        'taskName' => (string)($lesson['title'] ?? 'درس الصف المقلوب'),
        'maxScore' => 10.0,
        'allowRetry' => false,
        'maxAttempts' => 1,
        'sendToFollowUp' => false,
        'target' => 'homework',
        'weekNo' => 1,
        'academicYear' => '',
        'semester' => '',
        'weeklyItemId' => null,
        'participationDate' => null,
        'updatedAt' => null,
        'syncStatus' => 'disabled',
        'syncWarning' => null,
        'syncedAt' => null,
        'configured' => false,
    ];
}

function flipped_active_learning_read(array $lesson): array
{
    $defaults = flipped_active_learning_defaults($lesson);
    $path = flipped_active_learning_path((int)$lesson['id']);
    if (!is_file($path) || is_link($path)) return $defaults;
    $size = @filesize($path);
    if ($size === false || $size < 2 || $size > 65536) return $defaults;
    $raw = @file_get_contents($path);
    if ($raw === false) return $defaults;
    $stored = json_decode($raw, true);
    if (!is_array($stored) || (int)($stored['version'] ?? 0) !== 1) return $defaults;
    $config = array_replace($defaults, $stored);
    $config['configured'] = true;
    $config['taskName'] = mb_substr(trim((string)$config['taskName']), 0, 190);
    $config['maxScore'] = round((float)$config['maxScore'], 2);
    $config['allowRetry'] = (bool)($config['allowRetry'] ?? false);
    $storedMaxAttempts = (int)($config['maxAttempts'] ?? 1);
    $config['maxAttempts'] = $config['allowRetry'] ? max(2, min(5, $storedMaxAttempts)) : 1;
    $config['sendToFollowUp'] = (bool)$config['sendToFollowUp'];
    $config['target'] = in_array((string)$config['target'], ['homework','task','participation'], true) ? (string)$config['target'] : 'homework';
    $config['weekNo'] = max(1, min(60, (int)$config['weekNo']));
    $config['weeklyItemId'] = !empty($config['weeklyItemId']) ? (int)$config['weeklyItemId'] : null;
    $config['participationDate'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($config['participationDate'] ?? '')) ? (string)$config['participationDate'] : null;
    return $config;
}

function flipped_active_learning_write(int $lessonId, array $config): void
{
    $path = flipped_active_learning_path($lessonId, true);
    $payload = $config;
    unset($payload['configured'], $payload['participationDay']);
    $temporary = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    if (@file_put_contents($temporary, flipped_json($payload), LOCK_EX) === false) {
        @unlink($temporary);
        throw new RuntimeException('تعذّر حفظ إعداد التعلم النشط.');
    }
    @chmod($temporary, 0640);
    if (!@rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('تعذّر اعتماد إعداد التعلم النشط.');
    }
}

function flipped_active_learning_delete(int $lessonId): void
{
    $path = flipped_active_learning_path($lessonId);
    if ((is_file($path) || is_link($path)) && !@unlink($path)) {
        error_log('[flipped-active-learning] Failed to delete sidecar for lesson ' . $lessonId);
    }
}

function flipped_active_learning_with_lock(callable $callback): mixed
{
    $directory = dirname(flipped_active_learning_path(1, true));
    $lockPath = $directory . '/.active-learning.lock';
    $handle = @fopen($lockPath, 'c');
    if (!$handle) throw new RuntimeException('تعذّر قفل إعدادات التعلم النشط مؤقتًا.');
    @chmod($lockPath, 0640);
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        throw new RuntimeException('تعذّر قفل إعدادات التعلم النشط مؤقتًا.');
    }
    try {
        return $callback();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function flipped_active_learning_context(int $teacherId): array
{
    $row = teacher_school_settings_row($teacherId);
    $academicYear = trim((string)($row['academic_year'] ?? ''));
    $semester = in_array((string)($row['current_semester'] ?? 'first'), ['first','second'], true) ? (string)$row['current_semester'] : 'first';
    $startDate = trim((string)($semester === 'second' ? ($row['term2_start_date'] ?? '') : ($row['term1_start_date'] ?? '')));
    if ($academicYear === '') throw new DomainException('حددي العام الدراسي من إعدادات المدرسة أولًا.');
    $parsedStart = DateTimeImmutable::createFromFormat('Y-m-d', $startDate);
    if ($startDate === '' || !$parsedStart || $parsedStart->format('Y-m-d') !== $startDate) throw new DomainException('حددي تاريخ بداية الترم من إعدادات المدرسة أولًا.');
    return ['academicYear'=>$academicYear, 'semester'=>$semester, 'startDate'=>$startDate];
}

function flipped_active_learning_week_date(array $context, int $weekNo, int $dayIndex = 0): string
{
    $offset = (($weekNo - 1) * 7) + $dayIndex;
    return (new DateTimeImmutable((string)$context['startDate']))->modify('+' . $offset . ' days')->format('Y-m-d');
}

function flipped_active_learning_day_label(?string $date): ?string
{
    if (!$date) return null;
    $parsed = DateTimeImmutable::createFromFormat('Y-m-d', $date);
    if (!$parsed) return null;
    return ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][(int)$parsed->format('w')] ?? null;
}

function flipped_active_learning_public(array $config): array
{
    return [
        'configured'=>(bool)($config['configured'] ?? false),
        'version'=>(int)($config['version'] ?? 1),
        'taskName'=>(string)($config['taskName'] ?? ''),
        'maxScore'=>(float)($config['maxScore'] ?? 10),
        'allowRetry'=>(bool)($config['allowRetry'] ?? false),
        'maxAttempts'=>(bool)($config['allowRetry'] ?? false) ? max(2, min(5, (int)($config['maxAttempts'] ?? 2))) : 1,
        'sendToFollowUp'=>(bool)($config['sendToFollowUp'] ?? false),
        'target'=>(string)($config['target'] ?? 'homework'),
        'weekNo'=>(int)($config['weekNo'] ?? 1),
        'academicYear'=>(string)($config['academicYear'] ?? ''),
        'semester'=>(string)($config['semester'] ?? ''),
        'weeklyItemId'=>!empty($config['weeklyItemId']) ? (int)$config['weeklyItemId'] : null,
        'participationDate'=>$config['participationDate'] ?? null,
        'participationDay'=>flipped_active_learning_day_label($config['participationDate'] ?? null),
        'updatedAt'=>$config['updatedAt'] ?? null,
        'syncStatus'=>(string)($config['syncStatus'] ?? 'disabled'),
        'syncWarning'=>$config['syncWarning'] ?? null,
        'syncedAt'=>$config['syncedAt'] ?? null,
    ];
}

function flipped_active_learning_summary(array $lesson): array
{
    $config = flipped_active_learning_read($lesson);
    return [
        'configured'=>(bool)$config['configured'],
        'allowRetry'=>(bool)$config['allowRetry'],
        'maxAttempts'=>(int)$config['maxAttempts'],
        'sendToFollowUp'=>(bool)$config['sendToFollowUp'],
        'target'=>(string)$config['target'],
        'weekNo'=>(int)$config['weekNo'],
    ];
}

function flipped_active_learning_marker(int $lessonId): string
{
    return '[flipped-classroom:lesson-' . $lessonId . ']';
}

function flipped_active_learning_score(float $percent, float $maxScore): float
{
    return round(max(0, min($maxScore, $percent * $maxScore / 100)), 2);
}

function flipped_active_learning_validate_max_score(mixed $raw): float
{
    if ((!is_int($raw) && !is_float($raw) && !is_string($raw)) || (is_string($raw) && trim($raw) === '') || !is_numeric($raw)) {
        throw new DomainException('الدرجة الكاملة يجب أن تكون رقمًا صحيحًا بخطوة 0.5.');
    }
    $value = (float)$raw;
    if (!is_finite($value) || $value < .5 || $value > 1000) {
        throw new DomainException('الدرجة الكاملة يجب أن تكون من 0.5 إلى 1000.');
    }
    $doubled = $value * 2;
    if (abs($doubled - round($doubled)) > 1.0E-9 * max(1, abs($doubled))) {
        throw new DomainException('الدرجة الكاملة يجب أن تكون بمضاعفات 0.5 مثل 5 أو 5.5.');
    }
    return round($value, 2);
}

function flipped_active_learning_validate_week_no(mixed $raw): int
{
    $validInteger = is_int($raw)
        || (is_float($raw) && is_finite($raw) && floor($raw) === $raw)
        || (is_string($raw) && preg_match('/^\d+$/D', trim($raw)) === 1);
    if (!$validInteger) throw new DomainException('رقم الأسبوع يجب أن يكون عددًا صحيحًا بين 1 و60.');
    $weekNo = (int)$raw;
    if ($weekNo < 1 || $weekNo > 60) throw new DomainException('رقم الأسبوع يجب أن يكون بين 1 و60.');
    return $weekNo;
}

function flipped_active_learning_validate_attempt_policy(mixed $allowRetry, mixed $maxAttempts): array
{
    $allow = filter_var($allowRetry, FILTER_VALIDATE_BOOLEAN);
    if (!$allow) return ['allowRetry'=>false, 'maxAttempts'=>1];
    $validInteger = is_int($maxAttempts)
        || (is_float($maxAttempts) && is_finite($maxAttempts) && floor($maxAttempts) === $maxAttempts)
        || (is_string($maxAttempts) && preg_match('/^\d+$/D', trim($maxAttempts)) === 1);
    if (!$validInteger) throw new DomainException('الحد الأقصى للمحاولات يجب أن يكون عددًا صحيحًا من 2 إلى 5.');
    $maximum = (int)$maxAttempts;
    if ($maximum < 2 || $maximum > 5) throw new DomainException('الحد الأقصى للمحاولات يجب أن يكون من 2 إلى 5 ويشمل المحاولة الأولى.');
    return ['allowRetry'=>true, 'maxAttempts'=>$maximum];
}

function flipped_active_learning_reserved_dates(array $lesson, array $context, int $weekNo): array
{
    $reserved = [];
    $pattern = dirname(flipped_active_learning_path((int)$lesson['id'])) . '/lesson-*.active-learning.json';
    foreach (glob($pattern) ?: [] as $path) {
        if (is_link($path) || !preg_match('/lesson-(\d+)\.active-learning\.json$/', basename($path), $match)) continue;
        if ((int)$match[1] === (int)$lesson['id']) continue;
        $size = @filesize($path);
        if ($size === false || $size < 2 || $size > 65536) continue;
        $data = json_decode((string)@file_get_contents($path), true);
        if (!is_array($data) || empty($data['sendToFollowUp']) || ($data['target'] ?? '') !== 'participation') continue;
        if ((int)($data['teacherId'] ?? 0) !== (int)$lesson['teacher_id'] || (int)($data['classId'] ?? 0) !== (int)$lesson['class_id']) continue;
        if ((string)($data['academicYear'] ?? '') !== (string)$context['academicYear'] || (string)($data['semester'] ?? '') !== (string)$context['semester'] || (int)($data['weekNo'] ?? 0) !== $weekNo) continue;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($data['participationDate'] ?? ''))) $reserved[(string)$data['participationDate']] = true;
    }
    return $reserved;
}

function flipped_active_learning_reserve_participation(array $lesson, array $existing, array $context, int $weekNo): string
{
    $reserved = flipped_active_learning_reserved_dates($lesson, $context, $weekNo);
    $marker = flipped_active_learning_marker((int)$lesson['id']);
    $existingDate = (string)($existing['participationDate'] ?? '');
    $sameReservation = (bool)($existing['configured'] ?? false)
        && (int)($existing['teacherId'] ?? 0) === (int)$lesson['teacher_id']
        && (int)($existing['classId'] ?? 0) === (int)$lesson['class_id']
        && (string)($existing['academicYear'] ?? '') === (string)$context['academicYear']
        && (string)($existing['semester'] ?? '') === (string)$context['semester']
        && (int)($existing['weekNo'] ?? 0) === $weekNo
        && preg_match('/^\d{4}-\d{2}-\d{2}$/', $existingDate);
    if ($sameReservation && !isset($reserved[$existingDate])) {
        $rows = fetch_all('SELECT note FROM weekly_participation WHERE teacher_id=? AND class_id=? AND participation_date=?', [(int)$lesson['teacher_id'],(int)$lesson['class_id'],$existingDate]);
        $onlyOwned = true;
        foreach ($rows as $row) if (!str_contains((string)($row['note'] ?? ''), $marker)) {$onlyOwned=false;break;}
        if ($onlyOwned) return $existingDate;
    }
    for ($day = 0; $day < 5; $day++) {
        $date = flipped_active_learning_week_date($context, $weekNo, $day);
        if (isset($reserved[$date])) continue;
        $used = (int)(fetch_one('SELECT COUNT(*) n FROM weekly_participation WHERE teacher_id=? AND class_id=? AND participation_date=?', [(int)$lesson['teacher_id'],(int)$lesson['class_id'],$date])['n'] ?? 0);
        if ($used === 0) return $date;
    }
    throw new DomainException('لا يوجد يوم مشاركة خالٍ بالكامل في هذا الأسبوع. اختاري أسبوعًا آخر أو أرسلي الدرجة إلى الواجبات أو المهام.');
}

function flipped_active_learning_validate_context(array $lesson, array $config): array
{
    $context = flipped_active_learning_context((int)$lesson['teacher_id']);
    if ((string)$config['academicYear'] !== (string)$context['academicYear'] || (string)$config['semester'] !== (string)$context['semester']) {
        throw new DomainException('تغيّر العام الدراسي أو الترم منذ حفظ الإعداد. افتحي «إعداد التعلم النشط» واحفظيه من جديد قبل إرسال الدرجات.');
    }
    $class = fetch_one('SELECT id FROM classes WHERE id=? AND teacher_id=?', [(int)$lesson['class_id'],(int)$lesson['teacher_id']]);
    if (!$class) throw new DomainException('الفصل المرتبط بالدرس غير متاح؛ لم تُرسل الدرجة إلى سجل المتابعة.');
    return $context;
}

function flipped_active_learning_ensure_item(PDO $pdo, array $lesson, array &$config, array $context): int
{
    $type = $config['target'] === 'task' ? 'task' : 'platform_homework';
    $itemId = (int)($config['weeklyItemId'] ?? 0);
    $item = null;
    if ($itemId > 0) {
        $stmt = $pdo->prepare('SELECT * FROM weekly_follow_up_items WHERE id=? AND teacher_id=? AND class_id=? AND academic_year=? AND semester=?');
        $stmt->execute([$itemId,(int)$lesson['teacher_id'],(int)$lesson['class_id'],(string)$config['academicYear'],(string)$config['semester']]);
        $item = $stmt->fetch();
    }
    $date = flipped_active_learning_week_date($context, (int)$config['weekNo']);
    if ($item) {
        $pdo->prepare('UPDATE weekly_follow_up_items SET week_no=?,item_type=?,title=?,item_date=?,max_score=? WHERE id=? AND teacher_id=?')
            ->execute([(int)$config['weekNo'],$type,(string)$config['taskName'],$date,(float)$config['maxScore'],$itemId,(int)$lesson['teacher_id']]);
        return $itemId;
    }
    $sortStmt = $pdo->prepare('SELECT COALESCE(MAX(sort_order),0)+1 FROM weekly_follow_up_items WHERE teacher_id=? AND class_id=? AND academic_year=? AND semester=? AND week_no=?');
    $sortStmt->execute([(int)$lesson['teacher_id'],(int)$lesson['class_id'],(string)$config['academicYear'],(string)$config['semester'],(int)$config['weekNo']]);
    $sort = max(1, (int)$sortStmt->fetchColumn());
    $pdo->prepare('INSERT INTO weekly_follow_up_items (teacher_id,class_id,academic_year,semester,week_no,item_type,title,item_date,max_score,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([(int)$lesson['teacher_id'],(int)$lesson['class_id'],(string)$config['academicYear'],(string)$config['semester'],(int)$config['weekNo'],$type,(string)$config['taskName'],$date,(float)$config['maxScore'],$sort]);
    $config['weeklyItemId'] = (int)$pdo->lastInsertId();
    return (int)$config['weeklyItemId'];
}

function flipped_active_learning_apply_submission(array $lesson, array &$config, int $submissionId): ?string
{
    $context = flipped_active_learning_validate_context($lesson, $config);
    return Database::transaction(function(PDO $pdo) use($lesson,&$config,$context,$submissionId): ?string {
        $submissionStmt = $pdo->prepare("SELECT submission.student_id,submission.percent,submission.attempt_no,student.class_id FROM teacher_flipped_submissions submission JOIN students student ON student.id=submission.student_id AND student.deleted_at IS NULL WHERE submission.id=? AND submission.lesson_id=? AND submission.status='reviewed' FOR UPDATE");
        $submissionStmt->execute([$submissionId,(int)$lesson['id']]);
        $submission = $submissionStmt->fetch();
        if (!$submission) return null;
        if ((int)$submission['class_id'] !== (int)$lesson['class_id']) throw new DomainException('لم تُرسل درجة طالبة نُقلت إلى فصل آخر.');
        $latestStmt = $pdo->prepare("SELECT id FROM teacher_flipped_submissions WHERE lesson_id=? AND student_id=? AND status='reviewed' ORDER BY attempt_no DESC,id DESC LIMIT 1 FOR UPDATE");
        $latestStmt->execute([(int)$lesson['id'],(int)$submission['student_id']]);
        if ((int)$latestStmt->fetchColumn() !== $submissionId) return null;
        $score = flipped_active_learning_score((float)$submission['percent'], (float)$config['maxScore']);
        $studentId = (int)$submission['student_id'];
        $marker = flipped_active_learning_marker((int)$lesson['id']);
        if ($config['target'] !== 'participation') {
            $itemId = flipped_active_learning_ensure_item($pdo, $lesson, $config, $context);
            $note = mb_substr($marker . ' نتيجة الصف المقلوب', 0, 255);
            $pdo->prepare("INSERT INTO weekly_follow_up_item_scores (item_id,student_id,score,record_status,note) VALUES (?,?,?,'completed',?) ON DUPLICATE KEY UPDATE score=VALUES(score),record_status='completed',note=VALUES(note)")
                ->execute([$itemId,$studentId,$score,$note]);
            return null;
        }
        $date = (string)($config['participationDate'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new DomainException('لم يُحجز يوم للمشاركة؛ احفظي إعداد التعلم النشط من جديد.');
        $startDate = new DateTimeImmutable((string)$context['startDate']);
        $targetDate = new DateTimeImmutable($date);
        $dayIndex = (int)$startDate->diff($targetDate)->format('%r%a') % 7;
        if ($dayIndex < 0 || $dayIndex > 4) throw new DomainException('يوم المشاركة المحجوز ليس يومًا دراسيًا.');
        $select = $pdo->prepare('SELECT note FROM weekly_participation WHERE teacher_id=? AND student_id=? AND participation_date=? FOR UPDATE');
        $select->execute([(int)$lesson['teacher_id'],$studentId,$date]);
        $record = $select->fetch();
        if ($record && !str_contains((string)($record['note'] ?? ''), $marker)) {
            return 'لم تُكتب درجة إحدى الطالبات فوق مشاركة يدوية موجودة في اليوم المحجوز.';
        }
        $note = mb_substr($marker . ' ' . (string)$config['taskName'], 0, 255);
        if ($record) {
            $pdo->prepare("UPDATE weekly_participation SET class_id=?,academic_year=?,semester=?,week_no=?,day_index=?,score=?,max_score=?,record_status='completed',note=? WHERE teacher_id=? AND student_id=? AND participation_date=?")
                ->execute([(int)$lesson['class_id'],(string)$config['academicYear'],(string)$config['semester'],(int)$config['weekNo'],$dayIndex,$score,(float)$config['maxScore'],$note,(int)$lesson['teacher_id'],$studentId,$date]);
        } else {
            $pdo->prepare("INSERT INTO weekly_participation (teacher_id,class_id,student_id,academic_year,semester,week_no,day_index,participation_date,score,max_score,record_status,note) VALUES (?,?,?,?,?,?,?,?,?,?,'completed',?)")
                ->execute([(int)$lesson['teacher_id'],(int)$lesson['class_id'],$studentId,(string)$config['academicYear'],(string)$config['semester'],(int)$config['weekNo'],$dayIndex,$date,$score,(float)$config['maxScore'],$note]);
        }
        return null;
    });
}

function flipped_active_learning_sync_completed(array $lesson, array &$config, ?int $onlySubmissionId = null): array
{
    $params = [(int)$lesson['id']];
    $where = "submission.lesson_id=? AND submission.status='reviewed' AND NOT EXISTS (SELECT 1 FROM teacher_flipped_submissions newer WHERE newer.lesson_id=submission.lesson_id AND newer.student_id=submission.student_id AND newer.status='reviewed' AND (newer.attempt_no>submission.attempt_no OR (newer.attempt_no=submission.attempt_no AND newer.id>submission.id)))";
    if ($onlySubmissionId !== null) {$where .= ' AND submission.id=?';$params[]=$onlySubmissionId;}
    $rows = fetch_all("SELECT submission.id FROM teacher_flipped_submissions submission WHERE {$where} ORDER BY submission.student_id,submission.attempt_no", $params);
    $warnings = [];$synced = 0;
    foreach ($rows as $row) {
        try {
            $warning = flipped_active_learning_apply_submission($lesson, $config, (int)$row['id']);
            if ($warning) $warnings[] = $warning; else $synced++;
        } catch (Throwable $error) {
            $warnings[] = mb_substr($error->getMessage() ?: 'تعذّر إرسال إحدى الدرجات إلى سجل المتابعة.', 0, 500);
        }
    }
    return ['synced'=>$synced,'warning'=>$warnings ? implode(' ', array_values(array_unique($warnings))) : null];
}

function flipped_active_learning_try_sync(int $lessonId, int $submissionId): ?string
{
    try {
        return flipped_active_learning_with_lock(function() use($lessonId,$submissionId): ?string {
            $lesson = fetch_one('SELECT l.*,c.name class_name FROM teacher_flipped_lessons l JOIN classes c ON c.id=l.class_id WHERE l.id=? AND l.deleted_at IS NULL', [$lessonId]);
            if (!$lesson) return null;
            $config = flipped_active_learning_read($lesson);
            if (!$config['configured'] || !$config['sendToFollowUp']) return null;
            ensure_weekly_follow_up_schema();
            $result = flipped_active_learning_sync_completed($lesson, $config, $submissionId);
            $config['syncStatus'] = $result['warning'] ? 'warning' : 'synced';
            $config['syncWarning'] = $result['warning'];
            $config['syncedAt'] = date(DATE_ATOM);
            $config['updatedAt'] = $config['updatedAt'] ?: date(DATE_ATOM);
            flipped_active_learning_write($lessonId, $config);
            if ($result['warning']) Activity::log('teacher',(int)$lesson['teacher_id'],'تعذر إرسال درجة صف مقلوب إلى المتابعة',"الدرس {$lessonId} · {$result['warning']}");
            return $result['warning'];
        });
    } catch (Throwable $error) {
        $warning = mb_substr($error->getMessage() ?: 'تعذّر إرسال الدرجة إلى سجل المتابعة.', 0, 500);
        try {
            $lesson = fetch_one('SELECT * FROM teacher_flipped_lessons WHERE id=?', [$lessonId]);
            if ($lesson) {
                $config = flipped_active_learning_read($lesson);
                if ($config['configured']) {$config['syncStatus']='warning';$config['syncWarning']=$warning;flipped_active_learning_write($lessonId,$config);}
                Activity::log('teacher',(int)$lesson['teacher_id'],'فشل مزامنة درجة صف مقلوب',"الدرس {$lessonId} · {$warning}");
            }
        } catch (Throwable $ignored) {}
        return $warning;
    }
}

function teacher_flipped_active_learning_get(int $teacherId, int $lessonId): never
{
    flipped_require_schema();
    $lesson = flipped_teacher_lesson($teacherId, $lessonId);
    Http::json(['lesson'=>['id'=>(int)$lesson['id'],'title'=>(string)$lesson['title'],'className'=>(string)$lesson['class_name'],'status'=>(string)$lesson['lifecycle_status']], 'activeLearning'=>flipped_active_learning_public(flipped_active_learning_read($lesson))]);
}

function teacher_flipped_active_learning_save(int $teacherId, int $lessonId): never
{
    flipped_require_schema();
    $lesson = flipped_teacher_lesson($teacherId, $lessonId);
    $data = Http::input();
    $taskName = trim((string)($data['taskName'] ?? ''));
    if ($taskName === '' || mb_strlen($taskName) > 190) Http::json(['error'=>'اكتبي اسم مهمة صحيحًا لا يتجاوز 190 حرفًا.'],422);
    try {$maxScore=flipped_active_learning_validate_max_score($data['maxScore'] ?? null);} catch (DomainException $error) {Http::json(['error'=>$error->getMessage()],422);}
    try {$attemptPolicy=flipped_active_learning_validate_attempt_policy($data['allowRetry'] ?? false, $data['maxAttempts'] ?? 1);} catch (DomainException $error) {Http::json(['error'=>$error->getMessage()],422);}
    $target = (string)($data['target'] ?? 'homework');
    if (!in_array($target, ['homework','task','participation'], true)) Http::json(['error'=>'اختاري وجهة صحيحة للدرجة.'],422);
    try {$weekNo=flipped_active_learning_validate_week_no($data['weekNo'] ?? null);} catch (DomainException $error) {Http::json(['error'=>$error->getMessage()],422);}
    $send = filter_var($data['sendToFollowUp'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $context = null;
    if ($send) {
        Auth::requirePermission('students.manage', false);
        try {$context=flipped_active_learning_context($teacherId);} catch (DomainException $error) {Http::json(['error'=>$error->getMessage()],422);}
        flipped_teacher_class($teacherId, (int)$lesson['class_id']);
        ensure_weekly_follow_up_schema();
    }
    try {
        $saved = flipped_active_learning_with_lock(function() use($lesson,$teacherId,$taskName,$maxScore,$attemptPolicy,$target,$weekNo,$send,$context): array {
            $existing = flipped_active_learning_read($lesson);
            $config = $existing;
            $config['version']=1;$config['lessonId']=(int)$lesson['id'];$config['teacherId']=$teacherId;$config['classId']=(int)$lesson['class_id'];
            $config['taskName']=$taskName;$config['maxScore']=$maxScore;$config['allowRetry']=$attemptPolicy['allowRetry'];$config['maxAttempts']=$attemptPolicy['maxAttempts'];$config['sendToFollowUp']=$send;$config['target']=$target;$config['weekNo']=$weekNo;
            $config['updatedAt']=date(DATE_ATOM);$config['configured']=true;
            if (!$send) {
                $config['syncStatus']='disabled';$config['syncWarning']='إيقاف الإرسال لا يحذف الدرجات التي أُرسلت سابقًا.';
                flipped_active_learning_write((int)$lesson['id'],$config);
                return $config;
            }
            $config['academicYear']=$context['academicYear'];$config['semester']=$context['semester'];$config['syncStatus']='pending';$config['syncWarning']=null;
            if ($target === 'participation') {
                $config['participationDate']=flipped_active_learning_reserve_participation($lesson,$existing,$context,$weekNo);
                $config['weeklyItemId']=null;
            } else {
                $config['participationDate']=null;
                if (($existing['target'] ?? '') === 'participation') $config['weeklyItemId']=null;
            }
            flipped_active_learning_write((int)$lesson['id'],$config);
            if ($target !== 'participation') {
                Database::transaction(function(PDO $pdo) use($lesson,&$config,$context): void {
                    flipped_active_learning_ensure_item($pdo,$lesson,$config,$context);
                });
                flipped_active_learning_write((int)$lesson['id'],$config);
            }
            $result = flipped_active_learning_sync_completed($lesson,$config);
            $config['syncStatus']=$result['warning']?'warning':'synced';$config['syncWarning']=$result['warning'];$config['syncedAt']=date(DATE_ATOM);
            flipped_active_learning_write((int)$lesson['id'],$config);
            return $config;
        });
    } catch (DomainException $error) {
        Http::json(['error'=>$error->getMessage()],422);
    } catch (Throwable $error) {
        error_log('[flipped-active-learning-save] ' . $error->getMessage());
        Http::json(['error'=>'تعذّر حفظ إعداد التعلم النشط. حاولي مرة أخرى.'],500);
    }
    Activity::log('teacher',$teacherId,'حفظ إعداد التعلم النشط',"الدرس {$lessonId} · الأسبوع {$weekNo} · " . ($send?$target:'بدون إرسال'));
    if ($send && !empty($saved['syncWarning'])) Activity::log('teacher',$teacherId,'تعذر إرسال بعض درجات الصف المقلوب إلى المتابعة',"الدرس {$lessonId} · {$saved['syncWarning']}");
    Http::json(['ok'=>true,'message'=>'تم حفظ إعداد التعلم النشط.','activeLearning'=>flipped_active_learning_public($saved)]);
}

function teacher_flipped_upload_video(int $teacherId,int $lessonId): never
{
    flipped_require_schema();$lesson=flipped_teacher_lesson($teacherId,$lessonId);if($lesson['lifecycle_status']!=='draft')Http::json(['error'=>'يمكن استبدال الفيديو في المسودة فقط.'],409);
    $upload=$_FILES['video']??null;$uploadError=(int)($upload['error']??UPLOAD_ERR_NO_FILE);if(!is_array($upload)||$uploadError!==UPLOAD_ERR_OK){$message=match($uploadError){UPLOAD_ERR_INI_SIZE,UPLOAD_ERR_FORM_SIZE=>'حجم الفيديو أكبر من الحد المسموح.',UPLOAD_ERR_PARTIAL=>'لم يكتمل رفع الفيديو. حاولي مرة أخرى.',UPLOAD_ERR_NO_FILE=>'اختاري ملف فيديو أولًا.',default=>'تعذّر استقبال الفيديو.'};Http::json(['error'=>$message],422);}
    $size=(int)($upload['size']??0);if($size<=0||$size>FLIPPED_CLASSROOM_MAX_VIDEO_BYTES)Http::json(['error'=>'حجم الفيديو يجب ألا يتجاوز 200 ميجابايت.'],422);
    $tmp=(string)$upload['tmp_name'];if(!is_uploaded_file($tmp))Http::json(['error'=>'ملف الرفع غير صالح.'],422);if(!class_exists('finfo'))Http::json(['error'=>'إضافة Fileinfo غير متاحة على الخادم.'],500);
    $mime=(string)((new finfo(FILEINFO_MIME_TYPE))->file($tmp)?:'');$types=['video/mp4'=>'mp4','video/x-m4v'=>'mp4','video/webm'=>'webm','video/quicktime'=>'mov'];if(!isset($types[$mime]))Http::json(['error'=>'الصيغ المسموحة: MP4 أو WebM أو MOV.'],422);
    $original=mb_substr(basename((string)($upload['name']??'video')),0,255);$stored=bin2hex(random_bytes(20)).'.'.$types[$mime];$path=flipped_video_directory().'/'.$stored;$sha=hash_file('sha256',$tmp)?:'';$duration=max(0,min(86400,(float)($_POST['duration']??0)));
    $trimStart=round((float)($_POST['trimStart']??0),3);$trimEnd=round((float)($_POST['trimEnd']??$duration),3);
    if($duration>0){if($trimStart<0||$trimStart>$duration||$trimEnd<=0||$trimEnd>$duration+.25)Http::json(['error'=>'حدود قص الفيديو خارج مدته. أعيدي تحديد البداية والنهاية.'],422);$trimEnd=min($duration,$trimEnd);if($trimEnd<=$trimStart)Http::json(['error'=>'يجب أن تكون نهاية المقطع بعد بدايته.'],422);if($trimEnd-$trimStart<1)Http::json(['error'=>'يجب ألا تقل مدة المقطع عن ثانية واحدة.'],422);$outside=(int)(fetch_one('SELECT COUNT(*) n FROM teacher_flipped_questions WHERE lesson_id=? AND (time_seconds<? OR time_seconds>?)',[$lessonId,$trimStart,$trimEnd])['n']??0);if($outside>0)Http::json(['error'=>'يوجد سؤال خارج الجزء المحدد. عدّلي توقيته أو حدود القص أولًا.'],422);}else{$trimStart=0;$trimEnd=0;}
    if(!move_uploaded_file($tmp,$path))Http::json(['error'=>'تعذّر حفظ الفيديو في التخزين الخاص.'],500);@chmod($path,0640);
    try{flipped_write_video_trim($stored,$trimStart,$trimEnd?:$duration);execute_sql('UPDATE teacher_flipped_lessons SET video_original_name=?,video_stored_name=?,video_mime_type=?,video_size_bytes=?,video_sha256=?,video_duration_seconds=? WHERE id=? AND teacher_id=?',[$original,$stored,$mime,$size,$sha,$duration?:null,$lessonId,$teacherId]);}catch(Throwable $e){@unlink($path);flipped_delete_video_trim($stored);throw $e;}
    $oldStored=(string)($lesson['video_stored_name']??'');$old=flipped_safe_video_path($oldStored);if($old&&$old!==$path)@unlink($old);if($oldStored!==$stored)flipped_delete_video_trim($oldStored);
    Activity::log('teacher',$teacherId,'رفع فيديو صف مقلوب',"الدرس {$lessonId} · {$original}");Http::json(['ok'=>true,'message'=>'تم رفع الفيديو وحفظه بأمان.','videoOriginalName'=>$original,'videoDuration'=>$duration,'trimStart'=>$trimStart,'trimEnd'=>$trimEnd?:$duration]);
}

function flipped_stream(array $lesson): never
{
    $path=flipped_safe_video_path((string)($lesson['video_stored_name']??''));if(!$path)Http::json(['error'=>'ملف الفيديو غير موجود.'],404);$size=filesize($path);if($size===false)Http::json(['error'=>'تعذّر قراءة الفيديو.'],500);
    while(ob_get_level()>0)ob_end_clean();$start=0;$end=$size-1;$status=200;$range=(string)($_SERVER['HTTP_RANGE']??'');
    if($range!==''&&preg_match('/^bytes=(\d*)-(\d*)$/',$range,$m)){if($m[1]===''&&$m[2]!==''){$suffix=min($size,max(1,(int)$m[2]));$start=$size-$suffix;$end=$size-1;}else{$start=$m[1]===''?0:(int)$m[1];$end=$m[2]===''?$end:min($end,(int)$m[2]);}if($start>$end||$start>=$size){header("Content-Range: bytes */{$size}");http_response_code(416);exit;}$status=206;}
    http_response_code($status);header('Content-Type: '.(string)$lesson['video_mime_type']);header('Content-Disposition: inline; filename="video.'.pathinfo($path,PATHINFO_EXTENSION).'"');header('Accept-Ranges: bytes');header('X-Content-Type-Options: nosniff');header('Cache-Control: private, max-age=300');header('Content-Length: '.($end-$start+1));if($status===206)header("Content-Range: bytes {$start}-{$end}/{$size}");
    $handle=fopen($path,'rb');if(!$handle)exit;fseek($handle,$start);$remaining=$end-$start+1;while($remaining>0&&!feof($handle)){echo fread($handle,min(1048576,$remaining));$remaining-=min(1048576,$remaining);if(connection_aborted())break;}fclose($handle);exit;
}

function teacher_flipped_status(int $teacherId,int $lessonId,string $action): never
{
    flipped_require_schema();$lesson=flipped_teacher_lesson($teacherId,$lessonId);$next='';
    if($action==='publish'){$summary=fetch_one('SELECT COUNT(*) n,COALESCE(MIN(time_seconds),0) min_time,COALESCE(MAX(time_seconds),0) max_time FROM teacher_flipped_questions WHERE lesson_id=?',[$lessonId])?:[];$count=(int)($summary['n']??0);if(!$lesson['video_stored_name']||$count<1)Http::json(['error'=>'أضيفي فيديو وسؤالًا واحدًا على الأقل قبل النشر.'],422);$duration=(float)($lesson['video_duration_seconds']??0);[$trimStart,$trimEnd]=flipped_read_video_trim((string)$lesson['video_stored_name'],$duration);if($duration>0&&((float)($summary['min_time']??0)<$trimStart||(float)($summary['max_time']??0)>$trimEnd))Http::json(['error'=>'يوجد سؤال خارج الجزء المحدد من الفيديو. عدّلي توقيته قبل النشر.'],422);$next='published';}
    elseif($action==='close'&&$lesson['lifecycle_status']==='published')$next='closed';elseif($action==='reopen'&&$lesson['lifecycle_status']==='closed')$next='published';else Http::json(['error'=>'لا يمكن تنفيذ هذا الإجراء في حالة الدرس الحالية.'],409);
    execute_sql("UPDATE teacher_flipped_lessons SET lifecycle_status=?,published_at=IF(?='published',COALESCE(published_at,NOW()),published_at),closed_at=IF(?='closed',NOW(),NULL) WHERE id=? AND teacher_id=?",[$next,$next,$next,$lessonId,$teacherId]);Activity::log('teacher',$teacherId,$next==='closed'?'إغلاق درس صف مقلوب':'نشر درس صف مقلوب',"الدرس {$lessonId}");Http::json(['ok'=>true,'status'=>$next]);
}

function teacher_flipped_delete(int $teacherId,int $lessonId): never
{
    flipped_require_schema();$lesson=flipped_teacher_lesson($teacherId,$lessonId);if($lesson['lifecycle_status']==='published')Http::json(['error'=>'ألغِي نشر الدرس قبل حذفه نهائيًا.'],409);if(!in_array($lesson['lifecycle_status'],['draft','closed'],true))Http::json(['error'=>'لا يمكن حذف الدرس في حالته الحالية.'],409);execute_sql('UPDATE teacher_flipped_lessons SET deleted_at=NOW() WHERE id=? AND teacher_id=?',[$lessonId,$teacherId]);$stored=(string)$lesson['video_stored_name'];$path=flipped_safe_video_path($stored);if($path)@unlink($path);flipped_delete_video_trim($stored);flipped_active_learning_delete($lessonId);Activity::log('teacher',$teacherId,'حذف درس صف مقلوب نهائيًا',"الدرس {$lessonId}");Http::json(['ok'=>true]);
}

function teacher_flipped_results(int $teacherId,int $lessonId): never
{
    flipped_require_schema();$lesson=flipped_teacher_lesson($teacherId,$lessonId);$questions=flipped_question_rows($lessonId,true);
    $students=fetch_all('SELECT s.id,s.name,s.email,fs.id submission_id,fs.attempt_no,fs.status,fs.total_points,fs.max_points,fs.percent,fs.submitted_at,fs.reviewed_at FROM students s LEFT JOIN teacher_flipped_submissions fs ON fs.id=(SELECT latest.id FROM teacher_flipped_submissions latest WHERE latest.student_id=s.id AND latest.lesson_id=? ORDER BY latest.attempt_no DESC,latest.id DESC LIMIT 1) WHERE s.class_id=? AND s.deleted_at IS NULL ORDER BY s.name',[$lessonId,$lesson['class_id']]);
    foreach($students as &$student){$student['id']=(int)$student['id'];$student['submissionId']=$student['submission_id']?(int)$student['submission_id']:null;$student['attemptNo']=$student['attempt_no']?(int)$student['attempt_no']:null;$student['status']=$student['status']?:'not_started';$student['answers']=[];if($student['submissionId']){$answers=fetch_all('SELECT a.id,a.question_id,a.answer_json,a.is_correct,a.points_earned,a.teacher_feedback,a.reviewed_at,q.question_type,q.prompt,q.max_points FROM teacher_flipped_answers a JOIN teacher_flipped_questions q ON q.id=a.question_id WHERE a.submission_id=? ORDER BY q.sort_order,q.id',[$student['submissionId']]);$student['answers']=array_map(fn($a)=>['id'=>(int)$a['id'],'questionId'=>(int)$a['question_id'],'type'=>$a['question_type'],'text'=>$a['prompt'],'answer'=>flipped_decode($a['answer_json']),'isCorrect'=>$a['is_correct']===null?null:(bool)$a['is_correct'],'points'=>$a['points_earned']===null?null:(float)$a['points_earned'],'maxPoints'=>(float)$a['max_points'],'feedback'=>(string)($a['teacher_feedback']??'')],$answers);}unset($student['submission_id'],$student['attempt_no']);}unset($student);
    Http::json(['lesson'=>flipped_map_lesson($lesson),'questions'=>$questions,'students'=>$students]);
}

function teacher_flipped_review(int $teacherId,int $submissionId): never
{
    flipped_require_schema();$submission=fetch_one('SELECT s.*,l.teacher_id,l.id lesson_id FROM teacher_flipped_submissions s JOIN teacher_flipped_lessons l ON l.id=s.lesson_id WHERE s.id=? AND l.teacher_id=? AND l.deleted_at IS NULL',[$submissionId,$teacherId]);if(!$submission)Http::json(['error'=>'التسليم غير موجود.'],404);if(!in_array($submission['status'],['submitted','reviewed'],true))Http::json(['error'=>'لا يمكن مراجعة تسليم غير مكتمل.'],409);
    $data=Http::input();$reviews=(array)($data['answers']??[]);
    Database::transaction(function(PDO $pdo)use($submissionId,$teacherId,$reviews):void{$essays=$pdo->prepare("SELECT a.id,a.question_id,q.max_points FROM teacher_flipped_answers a JOIN teacher_flipped_questions q ON q.id=a.question_id WHERE a.submission_id=? AND q.question_type='essay'");$essays->execute([$submissionId]);foreach($essays->fetchAll()as$row){$review=$reviews[(string)$row['question_id']]??$reviews[(int)$row['question_id']]??null;if(!is_array($review))Http::json(['error'=>'أدخلي درجة كل إجابة مقالية.'],422);$points=round((float)($review['points']??-1),2);if($points<0||$points>(float)$row['max_points'])Http::json(['error'=>'درجة الإجابة المقالية خارج النطاق.'],422);$feedback=mb_substr(trim((string)($review['feedback']??'')),0,2000);$pdo->prepare('UPDATE teacher_flipped_answers SET points_earned=?,teacher_feedback=?,is_correct=NULL,reviewed_at=NOW() WHERE id=?')->execute([$points,$feedback,$row['id']]);}$totals=$pdo->prepare('SELECT COALESCE(SUM(a.points_earned),0) earned,COALESCE(SUM(q.max_points),0) possible FROM teacher_flipped_answers a JOIN teacher_flipped_questions q ON q.id=a.question_id WHERE a.submission_id=?');$totals->execute([$submissionId]);$t=$totals->fetch();$earned=(float)$t['earned'];$possible=(float)$t['possible'];$percent=$possible>0?round($earned/$possible*100,2):0;$pdo->prepare("UPDATE teacher_flipped_submissions SET status='reviewed',total_points=?,max_points=?,percent=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?")->execute([$earned,$possible,$percent,$teacherId,$submissionId]);});
    $syncWarning=flipped_active_learning_try_sync((int)$submission['lesson_id'],$submissionId);
    Activity::log('teacher',$teacherId,'مراجعة تسليم صف مقلوب',"التسليم {$submissionId}");Http::json(['ok'=>true,'message'=>'تم اعتماد المراجعة.','followUpWarning'=>$syncWarning]);
}

function teacher_flipped_routes(string $method,array $segments,int $teacherId): never
{
    if(!$segments&&$method==='GET')teacher_flipped_context($teacherId);if(!$segments&&$method==='POST')teacher_flipped_create($teacherId);
    if(($segments[0]??'')==='submissions'&&isset($segments[1])&&($segments[2]??'')==='review'&&$method==='POST')teacher_flipped_review($teacherId,route_id($segments,1));
    $id=route_id($segments,0);$action=$segments[1]??'';
    if($action==='active-learning'&&$method==='GET')teacher_flipped_active_learning_get($teacherId,$id);if($action==='active-learning'&&$method==='POST')teacher_flipped_active_learning_save($teacherId,$id);
    if(count($segments)===1&&$method==='GET')teacher_flipped_detail($teacherId,$id);if(count($segments)===1&&$method==='POST')teacher_flipped_update($teacherId,$id);if(count($segments)===1&&$method==='DELETE')teacher_flipped_delete($teacherId,$id);
    if($action==='video'&&$method==='POST')teacher_flipped_upload_video($teacherId,$id);if($action==='video'&&$method==='GET'){flipped_require_schema();flipped_stream(flipped_teacher_lesson($teacherId,$id));}
    if(in_array($action,['publish','close','reopen'],true)&&$method==='POST')teacher_flipped_status($teacherId,$id,$action);if($action==='results'&&$method==='GET')teacher_flipped_results($teacherId,$id);
    Http::json(['error'=>'مسار الصف المقلوب غير موجود.'],404);
}

function flipped_student_lesson(int $studentId,int $lessonId,bool $requirePublished=false): array
{
    $row=fetch_one('SELECT l.*,c.name class_name,su.id submission_id,su.attempt_no,su.status submission_status,su.total_points,su.max_points,su.percent,su.submitted_at,su.reviewed_at,(SELECT COUNT(*) FROM teacher_flipped_submissions used WHERE used.lesson_id=l.id AND used.student_id=s.id) attempts_used FROM students s JOIN teacher_flipped_lessons l ON l.class_id=s.class_id JOIN classes c ON c.id=l.class_id LEFT JOIN teacher_flipped_submissions su ON su.id=(SELECT latest.id FROM teacher_flipped_submissions latest WHERE latest.lesson_id=l.id AND latest.student_id=s.id ORDER BY latest.attempt_no DESC,latest.id DESC LIMIT 1) WHERE s.id=? AND l.id=? AND l.deleted_at IS NULL',[$studentId,$lessonId]);if(!$row)Http::json(['error'=>'الدرس غير متاح لهذه الطالبة.'],403);if($requirePublished&&$row['lifecycle_status']!=='published')Http::json(['error'=>'الدرس غير مفتوح حاليًا.'],409);if($row['lifecycle_status']!=='published'&&!in_array((string)($row['submission_status']??''),['submitted','reviewed'],true))Http::json(['error'=>'الدرس مغلق ولا يوجد تسليم مكتمل لعرضه.'],403);return $row;
}

function flipped_student_attempt_state(array $lesson, ?array $submission = null, ?int $attemptsUsed = null): array
{
    $config = flipped_active_learning_read($lesson);
    $allowRetry = (bool)($config['allowRetry'] ?? false);
    $maxAttempts = $allowRetry ? max(2, min(5, (int)($config['maxAttempts'] ?? 2))) : 1;
    $submissionId = (int)($submission['submission_id'] ?? $submission['id'] ?? 0);
    $attemptNo = (int)($submission['attempt_no'] ?? 0);
    $status = (string)($submission['submission_status'] ?? $submission['status'] ?? 'not_started');
    $used = max(0, $attemptsUsed ?? (int)($lesson['attempts_used'] ?? $attemptNo));
    $remaining = max(0, $maxAttempts - $used);
    return [
        'submissionId'=>$submissionId ?: null,
        'attemptNo'=>$attemptNo ?: null,
        'attemptsUsed'=>$used,
        'maxAttempts'=>$maxAttempts,
        'allowRetry'=>$allowRetry,
        'canRetry'=>$allowRetry && (string)($lesson['lifecycle_status'] ?? '') === 'published' && $status === 'reviewed' && $remaining > 0,
        'attemptsRemaining'=>$remaining,
    ];
}

function student_flipped_list(int $studentId): never
{
    if(!flipped_classroom_schema_ready())Http::json(['migrationReady'=>false,'migration'=>FLIPPED_CLASSROOM_MIGRATION,'migrationOrder'=>[FLIPPED_CLASSROOM_BASE_MIGRATION,FLIPPED_CLASSROOM_MIGRATION],'lessons'=>[]]);
    $rows=fetch_all("SELECT l.*,c.name class_name,su.id submission_id,su.attempt_no,su.status submission_status,su.total_points,su.max_points,su.percent,su.submitted_at,su.reviewed_at,(SELECT COUNT(*) FROM teacher_flipped_submissions used WHERE used.lesson_id=l.id AND used.student_id=s.id) attempts_used,(SELECT COUNT(*) FROM teacher_flipped_questions q WHERE q.lesson_id=l.id) question_count FROM students s JOIN teacher_flipped_lessons l ON l.class_id=s.class_id JOIN classes c ON c.id=l.class_id LEFT JOIN teacher_flipped_submissions su ON su.id=(SELECT latest.id FROM teacher_flipped_submissions latest WHERE latest.lesson_id=l.id AND latest.student_id=s.id ORDER BY latest.attempt_no DESC,latest.id DESC LIMIT 1) WHERE s.id=? AND l.deleted_at IS NULL AND (l.lifecycle_status='published' OR su.status IN ('submitted','reviewed')) ORDER BY l.published_at DESC,l.id DESC",[$studentId]);
    Http::json(['migrationReady'=>true,'lessons'=>array_map(function($r){$m=flipped_map_lesson($r);$attemptState=flipped_student_attempt_state($r,$r,(int)$r['attempts_used']);$m['submission']=['id'=>$r['submission_id']?(int)$r['submission_id']:null,'status'=>$r['submission_status']?:'not_started','total'=>$r['total_points']===null?null:(float)$r['total_points'],'max'=>$r['max_points']===null?null:(float)$r['max_points'],'percent'=>$r['percent']===null?null:(float)$r['percent'],'submittedAt'=>$r['submitted_at'],'reviewedAt'=>$r['reviewed_at']]+$attemptState;return $m;},$rows)]);
}

function student_flipped_detail(int $studentId,int $lessonId): never
{
    flipped_require_schema();$lesson=flipped_student_lesson($studentId,$lessonId);$answers=[];if($lesson['submission_id']){$rows=fetch_all('SELECT a.question_id,a.answer_json,a.is_correct,a.points_earned,a.teacher_feedback,q.question_type FROM teacher_flipped_answers a JOIN teacher_flipped_questions q ON q.id=a.question_id WHERE a.submission_id=?',[$lesson['submission_id']]);foreach($rows as$r)$answers[(string)$r['question_id']]=['answer'=>flipped_decode($r['answer_json']),'isCorrect'=>$r['is_correct']===null?null:(bool)$r['is_correct'],'points'=>$r['points_earned']===null?null:(float)$r['points_earned'],'feedback'=>(string)($r['teacher_feedback']??'')];}
    $attemptState=flipped_student_attempt_state($lesson,$lesson,(int)$lesson['attempts_used']);$mapped=flipped_map_lesson($lesson);$mapped['questions']=flipped_question_rows($lessonId,false);$mapped['submission']=['id'=>$lesson['submission_id']?(int)$lesson['submission_id']:null,'status'=>$lesson['submission_status']?:'not_started','total'=>$lesson['total_points']===null?null:(float)$lesson['total_points'],'max'=>$lesson['max_points']===null?null:(float)$lesson['max_points'],'percent'=>$lesson['percent']===null?null:(float)$lesson['percent'],'answers'=>$answers]+$attemptState;Http::json(['lesson'=>$mapped]);
}

function student_flipped_start(int $studentId,int $lessonId): never
{
    flipped_require_schema();$lesson=flipped_student_lesson($studentId,$lessonId,true);$config=flipped_active_learning_read($lesson);$allowRetry=(bool)$config['allowRetry'];$maxAttempts=$allowRetry?(int)$config['maxAttempts']:1;
    try {
        $started=Database::transaction(function(PDO $pdo)use($studentId,$lessonId,$allowRetry,$maxAttempts):array{
            $stmt=$pdo->prepare('SELECT id,status,attempt_no FROM teacher_flipped_submissions WHERE lesson_id=? AND student_id=? ORDER BY attempt_no DESC,id DESC FOR UPDATE');$stmt->execute([$lessonId,$studentId]);$attempts=$stmt->fetchAll();$attemptsUsed=count($attempts);
            foreach($attempts as $attempt)if($attempt['status']==='in_progress')return['id'=>(int)$attempt['id'],'status'=>'in_progress','attempt_no'=>(int)$attempt['attempt_no'],'attemptsUsed'=>$attemptsUsed];
            $latest=$attempts[0]??null;
            if($latest&&$latest['status']==='submitted')Http::json(['error'=>'لا يمكن بدء محاولة جديدة قبل أن تراجع المعلمة المحاولة الحالية.'],409);
            if($latest&&$latest['status']==='reviewed'&&!$allowRetry)Http::json(['error'=>'إعادة المحاولة غير مفعلة لهذا النشاط.'],409);
            if($attemptsUsed>=$maxAttempts)Http::json(['error'=>'استنفدتِ الحد الأقصى للمحاولات في هذا النشاط.'],409);
            $attemptNo=$latest?max(array_map(static fn($item)=>(int)$item['attempt_no'],$attempts))+1:1;
            $pdo->prepare("INSERT INTO teacher_flipped_submissions(lesson_id,student_id,attempt_no,status) VALUES(?,?,?,'in_progress')")->execute([$lessonId,$studentId,$attemptNo]);
            return['id'=>(int)$pdo->lastInsertId(),'status'=>'in_progress','attempt_no'=>$attemptNo,'attemptsUsed'=>$attemptsUsed+1];
        });
    } catch (PDOException $error) {
        if ((string)$error->getCode() !== '23000') throw $error;
        $started=fetch_one("SELECT id,status,attempt_no,(SELECT COUNT(*) FROM teacher_flipped_submissions counted WHERE counted.lesson_id=? AND counted.student_id=?) attemptsUsed FROM teacher_flipped_submissions WHERE lesson_id=? AND student_id=? AND status='in_progress' ORDER BY attempt_no DESC,id DESC LIMIT 1",[$lessonId,$studentId,$lessonId,$studentId]);
        if(!$started)throw $error;
        $started=['id'=>(int)$started['id'],'status'=>'in_progress','attempt_no'=>(int)$started['attempt_no'],'attemptsUsed'=>(int)$started['attemptsUsed']];
    }
    $state=flipped_student_attempt_state($lesson,$started,(int)$started['attemptsUsed']);Http::json(['submissionId'=>(int)$started['id'],'status'=>'in_progress']+$state);
}

function student_flipped_submit(int $studentId,int $lessonId): never
{
    flipped_require_schema();$lesson=flipped_student_lesson($studentId,$lessonId,true);$data=Http::input();$submissionId=(int)($data['submissionId']??0);if($submissionId<1)Http::json(['error'=>'ابدئي المحاولة أولًا ثم أعيدي تسليم الإجابات.'],422);$provided=(array)($data['answers']??[]);$questions=fetch_all('SELECT id,question_type,options_json,correct_answer_json,max_points FROM teacher_flipped_questions WHERE lesson_id=? ORDER BY sort_order,id',[$lessonId]);if(!$questions)Http::json(['error'=>'لا توجد أسئلة في الدرس.'],409);
    $result=Database::transaction(function(PDO $pdo)use($studentId,$lessonId,$submissionId,$provided,$questions):array{$stmt=$pdo->prepare('SELECT id,status,attempt_no FROM teacher_flipped_submissions WHERE id=? AND lesson_id=? AND student_id=? FOR UPDATE');$stmt->execute([$submissionId,$lessonId,$studentId]);$submission=$stmt->fetch();if(!$submission)Http::json(['error'=>'المحاولة المطلوبة لا تخص هذا الدرس أو هذه الطالبة.'],403);if($submission['status']!=='in_progress')Http::json(['error'=>'تم تسليم هذه المحاولة مسبقًا ولا يمكن تعديلها.'],409);$expected=array_map(fn($q)=>(string)$q['id'],$questions);$received=array_map('strval',array_keys($provided));sort($expected);sort($received);if($expected!==$received)Http::json(['error'=>'أجيبي عن جميع أسئلة الدرس قبل التسليم.'],422);$insert=$pdo->prepare('INSERT INTO teacher_flipped_answers(submission_id,question_id,answer_json,is_correct,points_earned) VALUES(?,?,?,?,?)');$earned=0.0;$possible=0.0;$pending=false;foreach($questions as$q){$value=$provided[(string)$q['id']]??$provided[(int)$q['id']]??null;$max=(float)$q['max_points'];$possible+=$max;if($q['question_type']==='multiple_choice'){$options=(array)flipped_decode($q['options_json'],[]);if(!is_int($value)&&!(is_string($value)&&ctype_digit($value)))Http::json(['error'=>'إجابة اختيار من متعدد غير صالحة.'],422);$choice=(int)$value;if(!array_key_exists($choice,$options))Http::json(['error'=>'البديل المختار غير صالح.'],422);$correct=$choice===(int)flipped_decode($q['correct_answer_json'],-1);$points=$correct?$max:0;$earned+=$points;$insert->execute([$submission['id'],$q['id'],flipped_json($choice),$correct?1:0,$points]);}else{$text=trim((string)$value);if($text===''||mb_strlen($text)>10000)Http::json(['error'=>'اكتبي إجابة مقالية صحيحة.'],422);$pending=true;$insert->execute([$submission['id'],$q['id'],flipped_json($text),null,null]);}}$percent=$possible>0?round($earned/$possible*100,2):0;$finalStatus=$pending?'submitted':'reviewed';$pdo->prepare("UPDATE teacher_flipped_submissions SET status=?,total_points=?,max_points=?,percent=?,submitted_at=NOW(),reviewed_at=IF(?='reviewed',NOW(),NULL),reviewed_by=NULL WHERE id=?")->execute([$finalStatus,$earned,$possible,$percent,$finalStatus,$submission['id']]);$count=$pdo->prepare('SELECT COUNT(*) FROM teacher_flipped_submissions WHERE lesson_id=? AND student_id=?');$count->execute([$lessonId,$studentId]);return['submissionId'=>(int)$submission['id'],'attempt_no'=>(int)$submission['attempt_no'],'attemptsUsed'=>(int)$count->fetchColumn(),'total'=>$earned,'max'=>$possible,'percent'=>$percent,'pendingReview'=>$pending,'status'=>$finalStatus];});
    $attemptState=flipped_student_attempt_state($lesson,['id'=>$result['submissionId'],'attempt_no'=>$result['attempt_no'],'status'=>$result['status']],(int)$result['attemptsUsed']);$result=$result+$attemptState;unset($result['attempt_no']);
    $syncWarning=$result['status']==='reviewed'?flipped_active_learning_try_sync($lessonId,(int)$result['submissionId']):null;
    Activity::log('student',$studentId,'تسليم درس صف مقلوب',"الدرس {$lessonId}");Http::json($result+['message'=>$result['pendingReview']?'تم تسليم إجاباتك وقفلها بانتظار المراجعة.':'تم تسليم إجاباتك واعتماد النتيجة النهائية.','followUpWarning'=>$syncWarning]);
}

function student_flipped_routes(string $method,array $segments,int $studentId): never
{
    if(!$segments&&$method==='GET')student_flipped_list($studentId);$id=route_id($segments,0);$action=$segments[1]??'';if(count($segments)===1&&$method==='GET')student_flipped_detail($studentId,$id);if($action==='video'&&$method==='GET'){flipped_require_schema();flipped_stream(flipped_student_lesson($studentId,$id));}if($action==='start'&&$method==='POST')student_flipped_start($studentId,$id);if($action==='submit'&&$method==='POST')student_flipped_submit($studentId,$id);Http::json(['error'=>'مسار الصف المقلوب غير موجود.'],404);
}
