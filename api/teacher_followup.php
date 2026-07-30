<?php
declare(strict_types=1);

function ensure_teacher_tools_schema(): void
{
    static $ready=false;
    if ($ready) return;
    try {
        Database::connection()->query('SELECT 1 FROM follow_up_settings LIMIT 1');
        Database::connection()->query('SELECT 1 FROM student_follow_up LIMIT 1');
        Database::connection()->query('SELECT 1 FROM motivational_points LIMIT 1');
        ensure_madar_points_columns();
        ensure_follow_up_context_columns();
        $ready=true;
        return;
    } catch (PDOException) {
        // تُنشأ الجداول تلقائيًا للنسخ القديمة إذا كان مستخدم قاعدة البيانات يملك الصلاحية.
    }
    execute_sql(
        "CREATE TABLE IF NOT EXISTS follow_up_settings (
          teacher_id BIGINT UNSIGNED NOT NULL,
          period_no TINYINT UNSIGNED NOT NULL,
          periodic_test_max DECIMAL(7,2) NOT NULL DEFAULT 20,
          participation_max DECIMAL(7,2) NOT NULL DEFAULT 10,
          homework_max DECIMAL(7,2) NOT NULL DEFAULT 10,
          tasks_max DECIMAL(7,2) NOT NULL DEFAULT 10,
          quiz_max DECIMAL(7,2) NOT NULL DEFAULT 20,
          final_exam_max DECIMAL(7,2) NOT NULL DEFAULT 50,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (teacher_id,period_no),
          CONSTRAINT fk_follow_settings_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    execute_sql(
        "CREATE TABLE IF NOT EXISTS student_follow_up (
          teacher_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          period_no TINYINT UNSIGNED NOT NULL,
          periodic_test_score DECIMAL(7,2) NULL,
          participation_score DECIMAL(7,2) NULL,
          homework_score DECIMAL(7,2) NULL,
          tasks_score DECIMAL(7,2) NULL,
          quiz_one_score DECIMAL(7,2) NULL,
          quiz_two_score DECIMAL(7,2) NULL,
          final_exam_score DECIMAL(7,2) NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (teacher_id,student_id,period_no),
          CONSTRAINT fk_follow_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_follow_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          INDEX idx_follow_student_period (student_id,period_no)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    execute_sql(
        "CREATE TABLE IF NOT EXISTS motivational_points (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          points SMALLINT NOT NULL,
          reason_type ENUM('homework','participation','attendance','task','other') NOT NULL DEFAULT 'other',
          reason VARCHAR(255) NOT NULL,
          details VARCHAR(500) NULL,
          batch_id CHAR(32) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_points_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_points_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          INDEX idx_points_student_date (student_id,created_at),
          INDEX idx_points_teacher_date (teacher_id,created_at),
          INDEX idx_points_teacher_batch (teacher_id,batch_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    ensure_madar_points_columns();
    ensure_follow_up_context_columns();
    $ready=true;
}

function ensure_madar_points_columns(): void
{
    $columns=array_fill_keys(array_map(static fn(array $column)=>(string)$column['Field'],fetch_all('SHOW COLUMNS FROM motivational_points')),true);
    if (!isset($columns['reason_type'])) {
        execute_sql("ALTER TABLE motivational_points ADD COLUMN reason_type ENUM('homework','participation','attendance','task','other') NOT NULL DEFAULT 'other' AFTER points");
    }
    if (!isset($columns['details'])) {
        execute_sql('ALTER TABLE motivational_points ADD COLUMN details VARCHAR(500) NULL AFTER reason');
    }
    if (!isset($columns['batch_id'])) {
        execute_sql('ALTER TABLE motivational_points ADD COLUMN batch_id CHAR(32) NULL AFTER details');
    }
    $indexes=array_fill_keys(array_map(static fn(array $index)=>(string)$index['Key_name'],fetch_all('SHOW INDEX FROM motivational_points')),true);
    if (!isset($indexes['idx_points_teacher_batch'])) {
        execute_sql('ALTER TABLE motivational_points ADD INDEX idx_points_teacher_batch (teacher_id,batch_id)');
    }
}

function ensure_follow_up_context_columns(): void
{
    foreach (['follow_up_settings','student_follow_up'] as $table) {
        $columns=array_fill_keys(array_map(static fn(array $column)=>(string)$column['Field'],fetch_all("SHOW COLUMNS FROM {$table}")),true);
        if (!isset($columns['academic_year'])) execute_sql("ALTER TABLE {$table} ADD COLUMN academic_year VARCHAR(30) NOT NULL DEFAULT '' AFTER period_no");
        if (!isset($columns['semester'])) execute_sql("ALTER TABLE {$table} ADD COLUMN semester ENUM('first','second') NOT NULL DEFAULT 'first' AFTER academic_year");
    }
    $settingsPrimary=array_values(array_map(static fn(array $index)=>(string)$index['Column_name'],array_filter(fetch_all('SHOW INDEX FROM follow_up_settings'),static fn(array $index)=>(string)$index['Key_name']==='PRIMARY')));
    if ($settingsPrimary!==['teacher_id','period_no','academic_year','semester']) {
        $indexes=array_fill_keys(array_map(static fn(array $index)=>(string)$index['Key_name'],fetch_all('SHOW INDEX FROM follow_up_settings')),true);
        if (!isset($indexes['idx_follow_settings_teacher_period'])) execute_sql('ALTER TABLE follow_up_settings ADD INDEX idx_follow_settings_teacher_period (teacher_id,period_no)');
        execute_sql('ALTER TABLE follow_up_settings DROP PRIMARY KEY, ADD PRIMARY KEY (teacher_id,period_no,academic_year,semester)');
    }
    $studentPrimary=array_values(array_map(static fn(array $index)=>(string)$index['Column_name'],array_filter(fetch_all('SHOW INDEX FROM student_follow_up'),static fn(array $index)=>(string)$index['Key_name']==='PRIMARY')));
    if ($studentPrimary!==['teacher_id','student_id','period_no','academic_year','semester']) {
        $indexes=array_fill_keys(array_map(static fn(array $index)=>(string)$index['Key_name'],fetch_all('SHOW INDEX FROM student_follow_up')),true);
        if (!isset($indexes['idx_follow_teacher_student_period'])) execute_sql('ALTER TABLE student_follow_up ADD INDEX idx_follow_teacher_student_period (teacher_id,student_id,period_no)');
        execute_sql('ALTER TABLE student_follow_up DROP PRIMARY KEY, ADD PRIMARY KEY (teacher_id,student_id,period_no,academic_year,semester)');
    }
}

function madar_point_categories(): array
{
    return [
        'homework'=>'واجب',
        'participation'=>'مشاركة',
        'attendance'=>'حضور',
        'task'=>'مهمة',
        'other'=>'سبب آخر',
    ];
}

function teacher_follow_up_routes(string $method,array $segments,int $teacherId): never
{
    ensure_teacher_tools_schema();
    if (!$segments && $method==='GET') teacher_follow_up_list($teacherId);
    if (!$segments && $method==='PUT') teacher_follow_up_save($teacherId);
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function teacher_follow_up_period(mixed $value): int
{
    $period=(int)$value;
    if (!in_array($period,[1,2,3],true)) Http::json(['error'=>'فترة المتابعة غير صالحة.'],422);
    return $period;
}

function teacher_follow_up_defaults(int $period,string $academicYear='',string $semester='first'): array
{
    return [
        'teacher_id'=>null,
        'period_no'=>$period,
        'academic_year'=>$academicYear,
        'semester'=>$semester,
        'periodic_test_max'=>20.0,
        'participation_max'=>10.0,
        'homework_max'=>10.0,
        'tasks_max'=>10.0,
        'quiz_max'=>20.0,
        'final_exam_max'=>50.0,
    ];
}

function teacher_follow_up_settings(int $teacherId,int $period,string $academicYear,string $semester): array
{
    return fetch_one('SELECT * FROM follow_up_settings WHERE teacher_id=? AND period_no=? AND academic_year=? AND semester=?',[$teacherId,$period,$academicYear,$semester])
        ?? teacher_follow_up_defaults($period,$academicYear,$semester);
}

function teacher_follow_up_settings_json(array $settings): array
{
    return [
        'periodicTestMax'=>(float)$settings['periodic_test_max'],
        'participationMax'=>(float)$settings['participation_max'],
        'homeworkMax'=>(float)$settings['homework_max'],
        'tasksMax'=>(float)$settings['tasks_max'],
        'quizMax'=>(float)$settings['quiz_max'],
        'finalExamMax'=>(float)$settings['final_exam_max'],
    ];
}

function teacher_score_ratio_average(array $scores,array $maximums): float
{
    $sum=0.0;$count=0;
    foreach($scores as $index=>$score) {
        $maximum=(float)($maximums[$index]??0);
        if ($score===null || $score==='' || $maximum<=0) continue;
        $sum+=max(0,min(1,(float)$score/$maximum));$count++;
    }
    return $count?round($sum/$count,6):0.0;
}

function teacher_average_available(array $values): ?float
{
    $numbers=array_values(array_map('floatval',array_filter($values,static fn($value)=>$value!==null && $value!=='')));
    return $numbers?round(array_sum($numbers)/count($numbers),2):null;
}

function teacher_follow_up_list(int $teacherId): never
{
    $period=teacher_follow_up_period($_GET['period']??1);
    $school=teacher_school_settings_row($teacherId);
    $academicYear=trim((string)($_GET['academicYear']??$school['academic_year']??''));
    $semester=(string)($_GET['semester']??$school['current_semester']??'first');
    if (!in_array($semester,['first','second'],true)) $semester='first';
    $settings=teacher_follow_up_settings($teacherId,$period,$academicYear,$semester);
    $firstSettings=teacher_follow_up_settings($teacherId,1,$academicYear,$semester);
    $secondSettings=teacher_follow_up_settings($teacherId,2,$academicYear,$semester);
    $stage=trim((string)($_GET['stage']??''));
    $gradeLabel=trim((string)($_GET['gradeLabel']??''));
    $classId=(int)($_GET['classId']??0);
    $where=['c.teacher_id=?'];$whereParams=[$teacherId];
    if ($stage!=='') {$where[]='c.stage=?';$whereParams[]=$stage;}
    if ($gradeLabel!=='') {$where[]='c.grade_label=?';$whereParams[]=$gradeLabel;}
    if ($classId>0) {$where[]='c.id=?';$whereParams[]=$classId;}
    $termStart=$semester==='second'?($school['term2_start_date']??null):($school['term1_start_date']??null);
    $termEnd=$semester==='first'?($school['term2_start_date']??null):null;
    $attendanceWhere='teacher_id=?';$attendanceParams=[$teacherId];
    if ($termStart) {$attendanceWhere.=' AND attendance_date>=?';$attendanceParams[]=$termStart;}
    if ($termEnd) {$attendanceWhere.=' AND attendance_date<?';$attendanceParams[]=$termEnd;}
    $rows=fetch_all(
        'SELECT s.id,s.name,s.email,s.stage,s.grade_label,c.id AS class_id,c.name AS class_name,
                f.periodic_test_score,f.participation_score,f.homework_score,f.tasks_score,f.quiz_one_score,f.quiz_two_score,f.final_exam_score,
                p1.participation_score AS p1_participation,p1.homework_score AS p1_homework,p1.tasks_score AS p1_tasks,
                p2.participation_score AS p2_participation,p2.homework_score AS p2_homework,p2.tasks_score AS p2_tasks,
                COALESCE(a.present_count,0) AS present_count,COALESCE(a.absent_count,0) AS absent_count,
                COALESCE(a.late_count,0) AS late_count,COALESCE(a.excused_count,0) AS excused_count
         FROM students s
         JOIN classes c ON c.id=s.class_id
         LEFT JOIN student_follow_up f ON f.student_id=s.id AND f.teacher_id=? AND f.period_no=? AND f.academic_year=? AND f.semester=?
         LEFT JOIN student_follow_up p1 ON p1.student_id=s.id AND p1.teacher_id=? AND p1.period_no=1 AND p1.academic_year=? AND p1.semester=?
         LEFT JOIN student_follow_up p2 ON p2.student_id=s.id AND p2.teacher_id=? AND p2.period_no=2 AND p2.academic_year=? AND p2.semester=?
         LEFT JOIN (
             SELECT student_id,SUM(status=\'present\') AS present_count,SUM(status=\'absent\') AS absent_count,
                    SUM(status=\'late\') AS late_count,SUM(status=\'excused\') AS excused_count
             FROM attendance WHERE '.$attendanceWhere.' GROUP BY student_id
         ) a ON a.student_id=s.id
         WHERE '.implode(' AND ',$where).' ORDER BY s.name',
        [$teacherId,$period,$academicYear,$semester,$teacherId,$academicYear,$semester,$teacherId,$academicYear,$semester,...$attendanceParams,...$whereParams]
    );
    $items=[];
    foreach($rows as $row) {
        $item=[
            'id'=>(int)$row['id'],'name'=>$row['name'],'email'=>$row['email'],'stage'=>$row['stage'],'gradeLabel'=>$row['grade_label'],'classId'=>(int)$row['class_id'],'className'=>$row['class_name'],
            'periodicTestScore'=>$row['periodic_test_score']===null?null:(float)$row['periodic_test_score'],
            'participationScore'=>$row['participation_score']===null?null:(float)$row['participation_score'],
            'homeworkScore'=>$row['homework_score']===null?null:(float)$row['homework_score'],
            'tasksScore'=>$row['tasks_score']===null?null:(float)$row['tasks_score'],
            'quizOneScore'=>$row['quiz_one_score']===null?null:(float)$row['quiz_one_score'],
            'quizTwoScore'=>$row['quiz_two_score']===null?null:(float)$row['quiz_two_score'],
            'finalExamScore'=>$row['final_exam_score']===null?null:(float)$row['final_exam_score'],
            'attendance'=>[
                'present'=>(int)$row['present_count'],'absent'=>(int)$row['absent_count'],
                'late'=>(int)$row['late_count'],'excused'=>(int)$row['excused_count'],
            ],
        ];
        if ($period<3) {
            $scores=[$item['periodicTestScore'],$item['participationScore'],$item['homeworkScore'],$item['tasksScore']];
            $item['total']=round(array_sum(array_map(static fn($value)=>(float)($value??0),$scores)),2);
        } else {
            $participationRatio=teacher_score_ratio_average([$row['p1_participation'],$row['p2_participation']],[$firstSettings['participation_max'],$secondSettings['participation_max']]);
            $homeworkRatio=teacher_score_ratio_average([$row['p1_homework'],$row['p2_homework']],[$firstSettings['homework_max'],$secondSettings['homework_max']]);
            $tasksRatio=teacher_score_ratio_average([$row['p1_tasks'],$row['p2_tasks']],[$firstSettings['tasks_max'],$secondSettings['tasks_max']]);
            $quizAverage=teacher_average_available([$item['quizOneScore'],$item['quizTwoScore']]);
            $item['quizAverage']=$quizAverage;
            $item['participationRatio']=$participationRatio;
            $item['homeworkRatio']=$homeworkRatio;
            $item['tasksRatio']=$tasksRatio;
            $item['participationAverage']=round($participationRatio*(float)$settings['participation_max'],2);
            $item['homeworkAverage']=round($homeworkRatio*(float)$settings['homework_max'],2);
            $item['tasksAverage']=round($tasksRatio*(float)$settings['tasks_max'],2);
            $item['total']=round((float)($quizAverage??0)+$item['participationAverage']+$item['homeworkAverage']+$item['tasksAverage']+(float)($item['finalExamScore']??0),2);
        }
        $items[]=$item;
    }
    Http::json(['period'=>$period,'academicYear'=>$academicYear,'semester'=>$semester,'settings'=>teacher_follow_up_settings_json($settings),'rows'=>$items]);
}

function teacher_follow_up_maximum(mixed $value,string $label): float
{
    if (!is_numeric($value)) Http::json(['error'=>"الدرجة الكاملة لـ {$label} غير صالحة."],422);
    $number=round((float)$value,2);
    if ($number<0.5 || $number>1000) Http::json(['error'=>"الدرجة الكاملة لـ {$label} يجب أن تكون بين 0.5 و1000."],422);
    return $number;
}

function teacher_follow_up_score(mixed $value,float $maximum,string $label): ?float
{
    if ($value===null || $value==='') return null;
    if (!is_numeric($value)) Http::json(['error'=>"درجة {$label} غير صالحة."],422);
    $number=round((float)$value,2);
    if ($number<0 || $number>$maximum) Http::json(['error'=>"درجة {$label} يجب أن تكون بين صفر و{$maximum}."],422);
    return $number;
}

function teacher_follow_up_save(int $teacherId): never
{
    $data=Http::input();
    $period=teacher_follow_up_period($data['period']??0);
    $school=teacher_school_settings_row($teacherId);
    $academicYear=trim((string)($data['academicYear']??$school['academic_year']??''));
    $semester=(string)($data['semester']??$school['current_semester']??'first');
    if (!in_array($semester,['first','second'],true)) Http::json(['error'=>'الفصل الدراسي غير صالح.'],422);
    $input=is_array($data['settings']??null)?$data['settings']:[];
    $settings=teacher_follow_up_defaults($period,$academicYear,$semester);
    $settings['periodic_test_max']=teacher_follow_up_maximum($input['periodicTestMax']??20,'الاختبار الفتري');
    $settings['participation_max']=teacher_follow_up_maximum($input['participationMax']??10,'المشاركة');
    $settings['homework_max']=teacher_follow_up_maximum($input['homeworkMax']??10,'الواجبات');
    $settings['tasks_max']=teacher_follow_up_maximum($input['tasksMax']??10,'المهام');
    $settings['quiz_max']=teacher_follow_up_maximum($input['quizMax']??20,'الاختبار الفوري');
    $settings['final_exam_max']=teacher_follow_up_maximum($input['finalExamMax']??50,'الاختبار النهائي');
    $rows=is_array($data['rows']??null)?$data['rows']:[];
    $stage=trim((string)($data['stage']??''));
    $gradeLabel=trim((string)($data['gradeLabel']??''));
    $classId=(int)($data['classId']??0);
    $where=['c.teacher_id=?'];$params=[$teacherId];
    if ($stage!=='') {$where[]='c.stage=?';$params[]=$stage;}
    if ($gradeLabel!=='') {$where[]='c.grade_label=?';$params[]=$gradeLabel;}
    if ($classId>0) {$where[]='c.id=?';$params[]=$classId;}
    $owned=array_fill_keys(array_map('intval',array_column(fetch_all('SELECT s.id FROM students s JOIN classes c ON c.id=s.class_id WHERE '.implode(' AND ',$where),$params),'id')),true);
    $normalizedRows=[];
    foreach($rows as $row) {
        $studentId=(int)($row['studentId']??0);
        if (!$studentId || !isset($owned[$studentId])) Http::json(['error'=>'توجد طالبة غير صالحة في سجل المتابعة.'],422);
        if ($period<3) {
            $normalizedRows[]=[
                $studentId,
                teacher_follow_up_score($row['periodicTestScore']??null,$settings['periodic_test_max'],'الاختبار الفتري'),
                teacher_follow_up_score($row['participationScore']??null,$settings['participation_max'],'المشاركة'),
                teacher_follow_up_score($row['homeworkScore']??null,$settings['homework_max'],'الواجبات'),
                teacher_follow_up_score($row['tasksScore']??null,$settings['tasks_max'],'المهام'),
            ];
        } else {
            $normalizedRows[]=[
                $studentId,
                teacher_follow_up_score($row['quizOneScore']??null,$settings['quiz_max'],'الاختبار الفوري الأول'),
                teacher_follow_up_score($row['quizTwoScore']??null,$settings['quiz_max'],'الاختبار الفوري الثاني'),
                teacher_follow_up_score($row['finalExamScore']??null,$settings['final_exam_max'],'الاختبار النهائي'),
            ];
        }
    }

    Database::transaction(function(PDO $pdo) use($teacherId,$period,$academicYear,$semester,$settings,$normalizedRows): void {
        $pdo->prepare('INSERT INTO follow_up_settings (teacher_id,period_no,academic_year,semester,periodic_test_max,participation_max,homework_max,tasks_max,quiz_max,final_exam_max) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE periodic_test_max=VALUES(periodic_test_max),participation_max=VALUES(participation_max),homework_max=VALUES(homework_max),tasks_max=VALUES(tasks_max),quiz_max=VALUES(quiz_max),final_exam_max=VALUES(final_exam_max)')
            ->execute([$teacherId,$period,$academicYear,$semester,$settings['periodic_test_max'],$settings['participation_max'],$settings['homework_max'],$settings['tasks_max'],$settings['quiz_max'],$settings['final_exam_max']]);
        if ($period<3) {
            $statement=$pdo->prepare('INSERT INTO student_follow_up (teacher_id,student_id,period_no,academic_year,semester,periodic_test_score,participation_score,homework_score,tasks_score) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE periodic_test_score=VALUES(periodic_test_score),participation_score=VALUES(participation_score),homework_score=VALUES(homework_score),tasks_score=VALUES(tasks_score)');
            foreach($normalizedRows as $row) $statement->execute([$teacherId,$row[0],$period,$academicYear,$semester,$row[1],$row[2],$row[3],$row[4]]);
        } else {
            $statement=$pdo->prepare('INSERT INTO student_follow_up (teacher_id,student_id,period_no,academic_year,semester,quiz_one_score,quiz_two_score,final_exam_score) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quiz_one_score=VALUES(quiz_one_score),quiz_two_score=VALUES(quiz_two_score),final_exam_score=VALUES(final_exam_score)');
            foreach($normalizedRows as $row) $statement->execute([$teacherId,$row[0],$period,$academicYear,$semester,$row[1],$row[2],$row[3]]);
        }
    });
    Activity::log('teacher',$teacherId,'حفظ سجل المتابعة',"الفترة {$period} · {$academicYear} · ".($semester==='second'?'الترم الثاني':'الترم الأول'));
    Http::json(['ok'=>true]);
}

function teacher_motivation_current_term(int $teacherId): int
{
    $settings=teacher_school_settings_row($teacherId);
    return (string)($settings['current_semester']??'first')==='second'?2:1;
}

function teacher_motivation_notification_body(int $points,string $reason,int $term): string
{
    $action=$points>0?'أضيفت لك':'تم خصم';
    $count=abs($points);
    $termLabel=$term===2?'الترم الثاني':'الترم الأول';
    return "{$action} {$count} من نقاط مدار في {$termLabel}. السبب: {$reason}.";
}

function teacher_motivation_notify_student(int $studentId,int $points,string $reason,int $term): void
{
    try {
        execute_sql('INSERT INTO notifications (student_id,title,body) VALUES (?,?,?)',[$studentId,'تحديث نقاط مدار',teacher_motivation_notification_body($points,$reason,$term)]);
    } catch (Throwable $error) {
        error_log('[motivation notification] '.$error->getMessage());
    }
}

function teacher_motivation_routes(string $method,array $segments,int $teacherId): never
{
    ensure_teacher_tools_schema();
    if (!$segments && $method==='GET') {
        $students=fetch_all(
            'SELECT s.id,s.name,s.email,s.stage,COALESCE(s.grade_label,c.grade_label) AS grade_label,c.id AS class_id,c.name AS class_name,COALESCE(SUM(p.points),0) AS points
             FROM students s JOIN classes c ON c.id=s.class_id
             LEFT JOIN motivational_points p ON p.student_id=s.id AND p.teacher_id=?
             WHERE c.teacher_id=? GROUP BY s.id,s.name,s.email,s.stage,s.grade_label,c.grade_label,c.id,c.name ORDER BY s.name',
            [$teacherId,$teacherId]
        );
        $history=fetch_all(
            "SELECT MAX(p.id) AS id,MAX(p.batch_id) AS batch_id,MAX(p.points) AS points,
                    MAX(p.reason_type) AS reason_type,MAX(p.reason) AS reason,MAX(p.details) AS details,
                    MAX(p.created_at) AS created_at,MAX(s.name) AS student_name,MAX(c.name) AS class_name,
                    COUNT(*) AS student_count
             FROM motivational_points p
             JOIN students s ON s.id=p.student_id
             LEFT JOIN classes c ON c.id=s.class_id
             WHERE p.teacher_id=?
             GROUP BY IF(p.batch_id IS NULL,CONCAT('single:',p.id),CONCAT('batch:',p.batch_id))
             ORDER BY MAX(p.created_at) DESC,MAX(p.id) DESC LIMIT 30",
            [$teacherId]
        );
        foreach($history as &$entry) {
            $entry['is_batch']=$entry['batch_id']!==null;
            $entry['student_count']=(int)$entry['student_count'];
        }
        unset($entry);
        Http::json(['students'=>$students,'history'=>$history,'settings'=>['currentTerm'=>teacher_motivation_current_term($teacherId)]]);
    }
    if (($segments[0]??'')==='batch' && count($segments)===1 && $method==='POST') {
        $data=Http::input();
        Http::requireFields($data,['classId','studentIds','points']);
        $classId=(int)$data['classId'];
        $class=fetch_one('SELECT id,name,stage,grade_label FROM classes WHERE id=? AND teacher_id=?',[$classId,$teacherId]);
        if (!$class) Http::json(['error'=>'الفصل المختار غير موجود ضمن فصولك.'],404);
        $inputIds=is_array($data['studentIds'])?$data['studentIds']:[];
        $studentIds=array_values(array_unique(array_filter(array_map('intval',$inputIds),static fn(int $id)=>$id>0)));
        if (!$studentIds) Http::json(['error'=>'حددي طالبة واحدة على الأقل.'],422);
        if (count($studentIds)>500) Http::json(['error'=>'لا يمكن إضافة النقاط لأكثر من 500 طالبة في عملية واحدة.'],422);
        $placeholders=implode(',',array_fill(0,count($studentIds),'?'));
        $owned=fetch_all(
            "SELECT s.id FROM students s JOIN classes c ON c.id=s.class_id WHERE c.id=? AND c.teacher_id=? AND s.id IN ({$placeholders})",
            [$classId,$teacherId,...$studentIds]
        );
        if (count($owned)!==count($studentIds)) Http::json(['error'=>'توجد طالبة لا تنتمي إلى الفصل المختار. أعيدي اختيار الفصل.'],422);
        [$points,$category,$reason,$details]=teacher_motivation_payload($data,false);
        $term=teacher_motivation_current_term($teacherId);
        $batchId=bin2hex(random_bytes(16));
        Database::transaction(function(PDO $pdo) use($teacherId,$studentIds,$points,$category,$reason,$details,$batchId): void {
            $statement=$pdo->prepare('INSERT INTO motivational_points (teacher_id,student_id,points,reason_type,reason,details,batch_id) VALUES (?,?,?,?,?,?,?)');
            foreach($studentIds as $studentId) {
                $statement->execute([$teacherId,$studentId,$points,$category,$reason,$details!==''?$details:null,$batchId]);
            }
        });
        $activityReason=$details!==''?$details:$reason;
        foreach($studentIds as $studentId) teacher_motivation_notify_student($studentId,$points,$activityReason,$term);
        Activity::log('teacher',$teacherId,'إضافة جماعية لنقاط مدار',count($studentIds)." طالبة من {$class['name']}: {$points} — {$activityReason}");
        Http::json(['ok'=>true,'batchId'=>$batchId,'studentCount'=>count($studentIds)],201);
    }
    if (($segments[0]??'')==='batch' && isset($segments[1]) && count($segments)===2 && $method==='DELETE') {
        $batchId=strtolower(trim((string)$segments[1]));
        if (!preg_match('/^[a-f0-9]{32}$/',$batchId)) Http::json(['error'=>'رقم العملية الجماعية غير صالح.'],422);
        $count=(int)(fetch_one('SELECT COUNT(*) AS n FROM motivational_points WHERE teacher_id=? AND batch_id=?',[$teacherId,$batchId])['n']??0);
        if ($count===0) Http::json(['error'=>'العملية الجماعية غير موجودة أو تم التراجع عنها سابقًا.'],404);
        execute_sql('DELETE FROM motivational_points WHERE teacher_id=? AND batch_id=?',[$teacherId,$batchId]);
        Activity::log('teacher',$teacherId,'التراجع عن إضافة جماعية لنقاط مدار',"تم حذف العملية {$batchId} عن {$count} طالبة");
        Http::json(['ok'=>true,'studentCount'=>$count]);
    }
    if (isset($segments[0]) && $method==='POST') {
        $studentId=route_id($segments,0);
        if (!teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'الطالبة غير موجودة ضمن فصولك.'],404);
        $data=Http::input();Http::requireFields($data,['points']);
        [$points,$category,$reason,$details]=teacher_motivation_payload($data,true);
        $term=teacher_motivation_current_term($teacherId);
        execute_sql('INSERT INTO motivational_points (teacher_id,student_id,points,reason_type,reason,details) VALUES (?,?,?,?,?,?)',[$teacherId,$studentId,$points,$category,$reason,$details!==''?$details:null]);
        $activityReason=$details!==''?$details:$reason;
        teacher_motivation_notify_student($studentId,$points,$activityReason,$term);
        Activity::log('teacher',$teacherId,'إضافة نقاط مدار',"الطالبة رقم {$studentId}: {$points} — {$activityReason}");
        $total=(int)(fetch_one('SELECT COALESCE(SUM(points),0) AS total FROM motivational_points WHERE teacher_id=? AND student_id=?',[$teacherId,$studentId])['total']??0);
        Http::json(['ok'=>true,'total'=>$total,'term'=>$term],201);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function teacher_motivation_payload(array $data,bool $allowNegative): array
{
    if (!is_numeric($data['points']??null) || (float)$data['points']!==(float)(int)$data['points']) Http::json(['error'=>'عدد النقاط يجب أن يكون رقمًا صحيحًا.'],422);
    $points=(int)$data['points'];
    $minimum=$allowNegative?-1000:1;
    if ($points===0 || $points<$minimum || $points>1000) Http::json(['error'=>$allowNegative?'اكتبي عدد نقاط بين -1000 و1000، ولا يمكن أن يكون صفرًا.':'اكتبي عدد نقاط بين 1 و1000.'],422);
    $categories=madar_point_categories();
    $category=trim((string)($data['category']??'other'));
    if (!isset($categories[$category])) Http::json(['error'=>'اختاري سببًا صالحًا للنقاط.'],422);
    $otherReason=trim((string)($data['otherReason']??$data['reason']??''));
    $reason=$category==='other'?$otherReason:$categories[$category];
    $details=trim((string)($data['details']??''));
    if ($category==='other' && $reason==='') Http::json(['error'=>'اكتبي السبب الآخر للنقاط.'],422);
    if (mb_strlen($reason)>255) Http::json(['error'=>'سبب النقاط طويل جدًا.'],422);
    if (mb_strlen($details)>500) Http::json(['error'=>'تفاصيل النقاط طويلة جدًا.'],422);
    return [$points,$category,$reason,$details];
}
