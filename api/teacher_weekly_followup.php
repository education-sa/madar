<?php
declare(strict_types=1);

// ============================================================================
// سجل المتابعة الأسبوعي: الحضور والمشاركة والواجبات والمهام
// ============================================================================
function ensure_weekly_follow_up_schema(): void
{
    static $ready=false;
    if ($ready) return;
    execute_sql(
        "CREATE TABLE IF NOT EXISTS weekly_attendance (
          teacher_id BIGINT UNSIGNED NOT NULL,
          class_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          academic_year VARCHAR(30) NOT NULL,
          semester ENUM('first','second') NOT NULL,
          week_no TINYINT UNSIGNED NOT NULL,
          day_index TINYINT UNSIGNED NOT NULL,
          attendance_date DATE NOT NULL,
          status ENUM('present','absent','late','excused') NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (teacher_id,student_id,academic_year,semester,week_no,day_index),
          INDEX idx_weekly_attendance_class_context (class_id,academic_year,semester,week_no),
          CONSTRAINT fk_weekly_att_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_weekly_att_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          CONSTRAINT fk_weekly_att_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    execute_sql(
        "CREATE TABLE IF NOT EXISTS weekly_participation (
          teacher_id BIGINT UNSIGNED NOT NULL,
          class_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          academic_year VARCHAR(30) NOT NULL DEFAULT '',
          semester ENUM('first','second') NOT NULL DEFAULT 'first',
          week_no TINYINT UNSIGNED NOT NULL DEFAULT 0,
          day_index TINYINT UNSIGNED NOT NULL DEFAULT 0,
          participation_date DATE NOT NULL,
          score DECIMAL(7,2) NULL,
          max_score DECIMAL(7,2) NOT NULL DEFAULT 1,
          record_status ENUM('completed','needs_review') NOT NULL DEFAULT 'completed',
          note VARCHAR(255) NULL,
          PRIMARY KEY (teacher_id,student_id,participation_date),
          INDEX idx_weekly_participation_context (teacher_id,class_id,academic_year,semester,week_no,day_index),
          CONSTRAINT fk_weekly_part_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_weekly_part_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          CONSTRAINT fk_weekly_part_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    execute_sql(
        "CREATE TABLE IF NOT EXISTS weekly_follow_up_items (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          class_id BIGINT UNSIGNED NOT NULL,
          academic_year VARCHAR(30) NOT NULL DEFAULT '',
          semester ENUM('first','second') NOT NULL DEFAULT 'first',
          week_no TINYINT UNSIGNED NOT NULL,
          item_type ENUM('platform_homework','school_homework','task') NOT NULL,
          title VARCHAR(190) NOT NULL,
          item_date DATE NOT NULL,
          max_score DECIMAL(7,2) NOT NULL DEFAULT 1,
          sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_weekly_items_context (teacher_id,class_id,academic_year,semester,week_no,item_type),
          CONSTRAINT fk_weekly_item_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_weekly_item_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    execute_sql(
        "CREATE TABLE IF NOT EXISTS weekly_follow_up_item_scores (
          item_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          score DECIMAL(7,2) NULL,
          record_status ENUM('completed','needs_review','missing','excused') NOT NULL DEFAULT 'missing',
          note VARCHAR(255) NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (item_id,student_id),
          CONSTRAINT fk_weekly_score_item FOREIGN KEY (item_id) REFERENCES weekly_follow_up_items(id) ON DELETE CASCADE,
          CONSTRAINT fk_weekly_score_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    foreach (['weekly_participation','weekly_follow_up_items'] as $table) {
        $columns=array_fill_keys(array_map(static fn(array $column)=>(string)$column['Field'],fetch_all("SHOW COLUMNS FROM {$table}")),true);
        if (!isset($columns['academic_year'])) execute_sql("ALTER TABLE {$table} ADD COLUMN academic_year VARCHAR(30) NOT NULL DEFAULT '' AFTER class_id");
        if (!isset($columns['semester'])) execute_sql("ALTER TABLE {$table} ADD COLUMN semester ENUM('first','second') NOT NULL DEFAULT 'first' AFTER academic_year");
        if ($table==='weekly_participation' && !isset($columns['week_no'])) execute_sql("ALTER TABLE {$table} ADD COLUMN week_no TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER semester");
        if ($table==='weekly_participation' && !isset($columns['day_index'])) execute_sql("ALTER TABLE {$table} ADD COLUMN day_index TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER week_no");
    }
    $ready=true;
}

function teacher_weekly_context(int $teacherId): array
{
    $row=teacher_school_settings_row($teacherId);
    $semester=in_array((string)($row['current_semester']??'first'),['first','second'],true)?(string)$row['current_semester']:'first';
    $academicYear=trim((string)($row['academic_year']??''));
    $startDate=$semester==='second'?(string)($row['term2_start_date']??''):(string)($row['term1_start_date']??'');
    if ($academicYear==='') Http::json(['error'=>'يرجى تحديد العام الدراسي من إعدادات العام الدراسي والمدرسة أولًا.'],422);
    if ($startDate==='') Http::json(['error'=>'يرجى تحديد تاريخ بداية الترم من إعدادات العام الدراسي والمدرسة أولًا.'],422);
    return [
        'academic_year'=>$academicYear,
        'semester'=>$semester,
        'semester_label'=>$semester==='second'?'الترم الثاني':'الترم الأول',
        'start_date'=>$startDate,
    ];
}

function teacher_weekly_position(array $context,string $date): array
{
    $start=new DateTimeImmutable($context['start_date']);
    $target=new DateTimeImmutable($date);
    $days=(int)$start->diff($target)->format('%r%a');
    if ($days<0) Http::json(['error'=>'التاريخ يسبق بداية الترم الحالي.'],422);
    $week=(int)floor($days/7)+1;
    $day=$days%7;
    if ($day<0 || $day>4) Http::json(['error'=>'سجل المتابعة مخصص لأيام الأحد إلى الخميس.'],422);
    return [$week,$day];
}

function teacher_weekly_backfill_context(int $teacherId,array $context): void
{
    $year=$context['academic_year'];$semester=$context['semester'];$start=$context['start_date'];
    execute_sql("UPDATE weekly_follow_up_items SET academic_year=?,semester=? WHERE teacher_id=? AND academic_year=''",[$year,$semester,$teacherId]);
    execute_sql("UPDATE weekly_participation SET academic_year=?,semester=?,week_no=FLOOR(DATEDIFF(participation_date,?)/7)+1,day_index=MOD(DATEDIFF(participation_date,?),7) WHERE teacher_id=? AND academic_year='' AND participation_date>=? AND DATEDIFF(participation_date,?) BETWEEN 0 AND 419",[$year,$semester,$start,$start,$teacherId,$start,$start]);
    execute_sql("INSERT IGNORE INTO weekly_attendance (teacher_id,class_id,student_id,academic_year,semester,week_no,day_index,attendance_date,status) SELECT a.teacher_id,s.class_id,a.student_id,?,?,FLOOR(DATEDIFF(a.attendance_date,?)/7)+1,MOD(DATEDIFF(a.attendance_date,?),7),a.attendance_date,a.status FROM attendance a JOIN students s ON s.id=a.student_id WHERE a.teacher_id=? AND a.attendance_date>=? AND DATEDIFF(a.attendance_date,?) BETWEEN 0 AND 419 AND MOD(DATEDIFF(a.attendance_date,?),7) BETWEEN 0 AND 4",[$year,$semester,$start,$start,$teacherId,$start,$start,$start]);
}

function teacher_weekly_follow_up_routes(string $method,array $segments,int $teacherId): never
{
    ensure_weekly_follow_up_schema();
    $resource=$segments[0]??'';
    if (!$segments && $method==='GET') Http::json(teacher_weekly_follow_up_data($teacherId));
    if ($resource==='settings') Http::json(['error'=>'تُضبط بداية الترم من إعدادات العام الدراسي والمدرسة فقط.'],422);
    if ($resource==='attendance' && $method==='PUT') teacher_weekly_save_attendance($teacherId);
    if ($resource==='participation' && $method==='PUT') teacher_weekly_save_participation($teacherId);
    if ($resource==='items' && count($segments)===1 && $method==='POST') teacher_weekly_create_item($teacherId);
    if ($resource==='items' && isset($segments[1]) && $method==='PUT') teacher_weekly_update_item($teacherId,route_id($segments,1));
    if ($resource==='items' && isset($segments[1]) && $method==='DELETE') teacher_weekly_delete_item($teacherId,route_id($segments,1));
    if ($resource==='export.xlsx' && $method==='GET') teacher_weekly_export_xlsx($teacherId);
    if ($resource==='print' && $method==='GET') teacher_weekly_print($teacherId);
    if ($resource==='import' && $method==='POST') teacher_weekly_import($teacherId);
    Http::json(['error'=>'مسار المتابعة الأسبوعية غير موجود.'],404);
}

function teacher_weekly_week(mixed $value): int
{
    $week=(int)$value;
    if ($week<1 || $week>60) Http::json(['error'=>'رقم الأسبوع يجب أن يكون بين 1 و60.'],422);
    return $week;
}

function teacher_weekly_date(string $value,string $label='التاريخ'): string
{
    $date=DateTimeImmutable::createFromFormat('Y-m-d',$value);
    if (!$date || $date->format('Y-m-d')!==$value) Http::json(['error'=>"{$label} غير صالح."],422);
    return $value;
}

function teacher_weekly_class(int $teacherId,int $classId): array
{
    $class=fetch_one('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE id=? AND teacher_id=?',[$classId,$teacherId]);
    if (!$class) Http::json(['error'=>'الفصل المختار غير موجود ضمن فصولك.'],404);
    return $class;
}

function teacher_weekly_settings(int $teacherId): array
{
    $context=teacher_weekly_context($teacherId);
    return [
        'academic_start_date'=>$context['start_date'],
        'date_mode'=>'auto',
        'academic_year'=>$context['academic_year'],
        'current_semester'=>$context['semester'],
        'semester_label'=>$context['semester_label'],
    ];
}

function teacher_weekly_days(int $teacherId,int $week,array $settings): array
{
    $names=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'];
    $start=new DateTimeImmutable((string)$settings['academic_start_date']);
    $days=[];
    for($index=0;$index<5;$index++) {
        $offset=(($week-1)*7)+$index;
        $days[]=['index'=>$index,'name'=>$names[$index],'date'=>$start->modify("+{$offset} days")->format('Y-m-d'),'manual'=>false];
    }
    return $days;
}

function teacher_weekly_follow_up_data(int $teacherId,?int $forcedClassId=null,?int $forcedWeek=null): array
{
    $context=teacher_weekly_context($teacherId);
    teacher_weekly_backfill_context($teacherId,$context);
    $allClasses=fetch_all('SELECT id,name,stage AS level,grade_label,academic_year FROM classes WHERE teacher_id=? ORDER BY stage,grade_label,name',[$teacherId]);
    $classes=array_values(array_filter($allClasses,static fn(array $class): bool=>trim((string)($class['academic_year']??''))==='' || trim((string)$class['academic_year'])===$context['academic_year']));
    if (!$classes) $classes=$allClasses;
    $classId=$forcedClassId??(int)($_GET['classId']??($classes[0]['id']??0));
    $week=$forcedWeek??teacher_weekly_week($_GET['week']??1);
    $settings=teacher_weekly_settings($teacherId);
    if (!$classId) return ['classes'=>$classes,'class'=>null,'students'=>[],'week'=>$week,'days'=>teacher_weekly_days($teacherId,$week,$settings),'settings'=>$settings,'attendance'=>[],'participation'=>[],'items'=>[]];
    $class=teacher_weekly_class($teacherId,$classId);
    $students=fetch_all('SELECT id,name,email FROM students WHERE class_id=? ORDER BY name',[$classId]);
    $days=teacher_weekly_days($teacherId,$week,$settings);
    $attendance=[];$participation=[];
    foreach(fetch_all('SELECT student_id,day_index,attendance_date,status FROM weekly_attendance WHERE teacher_id=? AND class_id=? AND academic_year=? AND semester=? AND week_no=?',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week]) as $row) {
        $day=(int)$row['day_index'];$date=$days[$day]['date']??(string)$row['attendance_date'];
        $attendance[(string)$row['student_id']][$date]=$row['status'];
    }
    foreach(fetch_all('SELECT student_id,day_index,participation_date,score,max_score,record_status,note FROM weekly_participation WHERE teacher_id=? AND class_id=? AND academic_year=? AND semester=? AND week_no=?',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week]) as $row) {
        $day=(int)$row['day_index'];$date=$days[$day]['date']??(string)$row['participation_date'];
        $participation[(string)$row['student_id']][$date]=['score'=>$row['score']===null?null:(float)$row['score'],'maxScore'=>(float)$row['max_score'],'status'=>$row['record_status'],'note'=>$row['note']];
    }
    $items=fetch_all('SELECT id,item_type,title,item_date,max_score,sort_order FROM weekly_follow_up_items WHERE teacher_id=? AND class_id=? AND academic_year=? AND semester=? AND week_no=? ORDER BY item_date,sort_order,id',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week]);
    if ($items) {
        $ids=array_map('intval',array_column($items,'id'));$marks=implode(',',array_fill(0,count($ids),'?'));$scores=[];
        foreach(fetch_all("SELECT item_id,student_id,score,record_status,note FROM weekly_follow_up_item_scores WHERE item_id IN ({$marks})",$ids) as $row) $scores[(string)$row['item_id']][(string)$row['student_id']]=['score'=>$row['score']===null?null:(float)$row['score'],'status'=>$row['record_status'],'note'=>$row['note']];
        foreach($items as &$item) {$item['id']=(int)$item['id'];$item['maxScore']=(float)$item['max_score'];unset($item['max_score']);$item['scores']=$scores[(string)$item['id']]??[];}unset($item);
    }
    $studentCount=count($students);
    foreach($days as &$day) {
        $attendanceCount=0;$participationCount=0;$participationReview=0;
        foreach($students as $student) {
            if (isset($attendance[(string)$student['id']][$day['date']])) $attendanceCount++;
            $record=$participation[(string)$student['id']][$day['date']]??null;
            if ($record) {$participationCount++;if (($record['status']??'')!=='completed') $participationReview++;}
        }
        $homeworkItems=array_values(array_filter($items,static fn($item)=>$item['item_date']===$day['date'] && $item['item_type']!=='task'));
        $taskItems=array_values(array_filter($items,static fn($item)=>$item['item_date']===$day['date'] && $item['item_type']==='task'));
        [$homeworkRecorded,$homeworkReview]=teacher_weekly_item_completion_counts($homeworkItems,$students);
        [$tasksRecorded,$tasksReview]=teacher_weekly_item_completion_counts($taskItems,$students);
        $day['attendanceState']=teacher_weekly_completion_state($attendanceCount,$studentCount,true);
        $day['participationState']=teacher_weekly_completion_state($participationCount,$studentCount,true,$participationReview);
        $day['homeworkState']=teacher_weekly_completion_state($homeworkRecorded,$studentCount*count($homeworkItems),count($homeworkItems)>0,$homeworkReview);
        $day['tasksState']=teacher_weekly_completion_state($tasksRecorded,$studentCount*count($taskItems),count($taskItems)>0,$tasksReview);
    }unset($day);
    return compact('classes','class','students','week','days','settings','attendance','participation','items');
}

function teacher_weekly_item_completion_counts(array $items,array $students): array
{
    $recorded=0;$review=0;
    foreach($items as $item) foreach($students as $student) {
        $record=$item['scores'][(string)$student['id']]??null;
        if (!$record) continue;
        $recorded++;
        if (($record['status']??'')!=='completed') $review++;
    }
    return [$recorded,$review];
}

function teacher_weekly_completion_state(int $recorded,int $total,bool $hasDate,int $reviewCount=0): string
{
    if (!$hasDate || $total===0 || $recorded===0) return 'empty';
    return $recorded>=$total && $reviewCount===0?'complete':'review';
}

function teacher_weekly_save_settings(int $teacherId): never
{
    Http::json(['error'=>'تُضبط بداية الترم من إعدادات العام الدراسي والمدرسة فقط.'],422);
}

function teacher_weekly_owned_students(int $teacherId,int $classId): array
{
    teacher_weekly_class($teacherId,$classId);
    return array_fill_keys(array_map('intval',array_column(fetch_all('SELECT s.id FROM students s JOIN classes c ON c.id=s.class_id WHERE c.id=? AND c.teacher_id=?',[$classId,$teacherId]),'id')),true);
}

function teacher_weekly_save_attendance(int $teacherId): never
{
    $data=Http::input();$classId=(int)($data['classId']??0);$date=teacher_weekly_date((string)($data['date']??''));
    $context=teacher_weekly_context($teacherId);[$week,$day]=teacher_weekly_position($context,$date);
    $owned=teacher_weekly_owned_students($teacherId,$classId);$entries=is_array($data['entries']??null)?$data['entries']:[];$valid=['present','absent','late','excused'];
    Database::transaction(function(PDO $pdo) use($teacherId,$classId,$date,$week,$day,$entries,$owned,$valid,$context): void {
        $upsert=$pdo->prepare('INSERT INTO weekly_attendance (teacher_id,class_id,student_id,academic_year,semester,week_no,day_index,attendance_date,status) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE class_id=VALUES(class_id),attendance_date=VALUES(attendance_date),status=VALUES(status)');
        $delete=$pdo->prepare('DELETE FROM weekly_attendance WHERE teacher_id=? AND student_id=? AND academic_year=? AND semester=? AND week_no=? AND day_index=?');
        foreach($entries as $entry) {$studentId=(int)($entry['studentId']??0);if(!$studentId||!isset($owned[$studentId]))continue;$status=trim((string)($entry['status']??''));if($status===''){$delete->execute([$teacherId,$studentId,$context['academic_year'],$context['semester'],$week,$day]);continue;}if(!in_array($status,$valid,true))continue;$upsert->execute([$teacherId,$classId,$studentId,$context['academic_year'],$context['semester'],$week,$day,$date,$status]);}
    });
    Activity::log('teacher',$teacherId,'تحضير يومي',"الفصل {$classId} — {$context['semester_label']} — {$date}");Http::json(['ok'=>true]);
}

function teacher_weekly_save_participation(int $teacherId): never
{
    $data=Http::input();$classId=(int)($data['classId']??0);$date=teacher_weekly_date((string)($data['date']??''));
    $context=teacher_weekly_context($teacherId);[$week,$day]=teacher_weekly_position($context,$date);
    $owned=teacher_weekly_owned_students($teacherId,$classId);$entries=is_array($data['entries']??null)?$data['entries']:[];
    Database::transaction(function(PDO $pdo) use($teacherId,$classId,$date,$week,$day,$entries,$owned,$context): void {
        $upsert=$pdo->prepare('INSERT INTO weekly_participation (teacher_id,class_id,student_id,academic_year,semester,week_no,day_index,participation_date,score,max_score,record_status,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE class_id=VALUES(class_id),academic_year=VALUES(academic_year),semester=VALUES(semester),week_no=VALUES(week_no),day_index=VALUES(day_index),score=VALUES(score),max_score=VALUES(max_score),record_status=VALUES(record_status),note=VALUES(note)');
        $delete=$pdo->prepare('DELETE FROM weekly_participation WHERE teacher_id=? AND student_id=? AND academic_year=? AND semester=? AND week_no=? AND day_index=?');
        foreach($entries as $entry) {$studentId=(int)($entry['studentId']??0);if(!$studentId||!isset($owned[$studentId]))continue;$status=trim((string)($entry['status']??''));if($status===''){$delete->execute([$teacherId,$studentId,$context['academic_year'],$context['semester'],$week,$day]);continue;}if(!in_array($status,['completed','needs_review'],true))$status='completed';$max=max(.5,min(1000,(float)($entry['maxScore']??1)));$score=$entry['score']??null;$score=$score===''?null:round(max(0,min($max,(float)$score)),2);$note=mb_substr(trim((string)($entry['note']??'')),0,255);$delete->execute([$teacherId,$studentId,$context['academic_year'],$context['semester'],$week,$day]);$upsert->execute([$teacherId,$classId,$studentId,$context['academic_year'],$context['semester'],$week,$day,$date,$score,$max,$status,$note!==''?$note:null]);}
    });
    Activity::log('teacher',$teacherId,'تسجيل المشاركة اليومية',"الفصل {$classId} — {$context['semester_label']} — {$date}");Http::json(['ok'=>true]);
}

function teacher_weekly_item_type(string $value): string
{
    if (!in_array($value,['platform_homework','school_homework','task'],true)) Http::json(['error'=>'نوع البند غير صالح.'],422);
    return $value;
}

function teacher_weekly_create_item(int $teacherId): never
{
    $data=Http::input();$classId=(int)($data['classId']??0);teacher_weekly_class($teacherId,$classId);$context=teacher_weekly_context($teacherId);$week=teacher_weekly_week($data['week']??1);
    if (!empty($data['quickPlan'])) {
        $dates=is_array($data['dates']??null)?array_values($data['dates']):[];$plan=[['platform_homework','واجب منصة 1',0],['school_homework','واجب مدرسة 1',1],['platform_homework','واجب منصة 2',2],['school_homework','واجب مدرسة 2',3]];$created=0;
        foreach($plan as [$type,$title,$index]) {$date=trim((string)($dates[$index]??''));if($date==='')continue;teacher_weekly_date($date);if(fetch_one('SELECT id FROM weekly_follow_up_items WHERE teacher_id=? AND class_id=? AND academic_year=? AND semester=? AND week_no=? AND item_type=? AND item_date=?',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week,$type,$date]))continue;execute_sql('INSERT INTO weekly_follow_up_items (teacher_id,class_id,academic_year,semester,week_no,item_type,title,item_date,max_score,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week,$type,$title,$date,1,$index+1]);$created++;}
        Http::json(['ok'=>true,'created'=>$created],201);
    }
    $type=teacher_weekly_item_type((string)($data['itemType']??''));$title=trim((string)($data['title']??''));if($title==='')Http::json(['error'=>'اكتبي عنوان البند.'],422);$date=teacher_weekly_date((string)($data['date']??''));$max=max(.5,min(1000,(float)($data['maxScore']??1)));
    $sort=(int)(fetch_one('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM weekly_follow_up_items WHERE teacher_id=? AND class_id=? AND academic_year=? AND semester=? AND week_no=?',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week])['n']??1);
    execute_sql('INSERT INTO weekly_follow_up_items (teacher_id,class_id,academic_year,semester,week_no,item_type,title,item_date,max_score,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week,$type,mb_substr($title,0,190),$date,$max,$sort]);Http::json(['id'=>(int)Database::connection()->lastInsertId()],201);
}

function teacher_weekly_owned_item(int $teacherId,int $itemId): array
{
    $context=teacher_weekly_context($teacherId);
    $item=fetch_one('SELECT * FROM weekly_follow_up_items WHERE id=? AND teacher_id=? AND academic_year=? AND semester=?',[$itemId,$teacherId,$context['academic_year'],$context['semester']]);
    if (!$item) Http::json(['error'=>'بند المتابعة غير موجود في الترم الحالي.'],404);
    return $item;
}

function teacher_weekly_update_item(int $teacherId,int $itemId): never
{
    $item=teacher_weekly_owned_item($teacherId,$itemId);$data=Http::input();$title=array_key_exists('title',$data)?trim((string)$data['title']):$item['title'];$date=array_key_exists('date',$data)?teacher_weekly_date((string)$data['date']):$item['item_date'];$max=array_key_exists('maxScore',$data)?max(.5,min(1000,(float)$data['maxScore'])):(float)$item['max_score'];
    execute_sql('UPDATE weekly_follow_up_items SET title=?,item_date=?,max_score=? WHERE id=? AND teacher_id=?',[mb_substr($title,0,190),$date,$max,$itemId,$teacherId]);$owned=teacher_weekly_owned_students($teacherId,(int)$item['class_id']);$scores=is_array($data['scores']??null)?$data['scores']:[];
    Database::transaction(function(PDO $pdo) use($itemId,$scores,$owned,$max): void {$upsert=$pdo->prepare('INSERT INTO weekly_follow_up_item_scores (item_id,student_id,score,record_status,note) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score),record_status=VALUES(record_status),note=VALUES(note)');$delete=$pdo->prepare('DELETE FROM weekly_follow_up_item_scores WHERE item_id=? AND student_id=?');foreach($scores as $entry){$studentId=(int)($entry['studentId']??0);if(!$studentId||!isset($owned[$studentId]))continue;$status=trim((string)($entry['status']??''));if($status===''){$delete->execute([$itemId,$studentId]);continue;}if(!in_array($status,['completed','needs_review','missing','excused'],true))$status='missing';$score=$entry['score']??null;$score=$score===''?null:round(max(0,min($max,(float)$score)),2);$note=mb_substr(trim((string)($entry['note']??'')),0,255);$upsert->execute([$itemId,$studentId,$score,$status,$note!==''?$note:null]);}});Http::json(['ok'=>true]);
}

function teacher_weekly_delete_item(int $teacherId,int $itemId): never
{
    teacher_weekly_owned_item($teacherId,$itemId);execute_sql('DELETE FROM weekly_follow_up_items WHERE id=? AND teacher_id=?',[$itemId,$teacherId]);Http::json(['ok'=>true]);
}

function teacher_weekly_labels(): array
{
    return [
        'present'=>'حاضرة','absent'=>'غائبة','late'=>'متأخرة','excused'=>'بعذر',
        'completed'=>'مكتمل','needs_review'=>'يحتاج مراجعة','missing'=>'لم تسلم','excused_item'=>'معذورة',
        'platform_homework'=>'واجب منصة','school_homework'=>'واجب مدرسة','task'=>'مهمة'
    ];
}

function teacher_weekly_export_rows(array $data,array $sections): array
{
    $labels=teacher_weekly_labels();$rows=[];$week=$data['week'];$class=$data['class']['name']??'';
    foreach($data['students'] as $student) {
        $sid=(int)$student['id'];
        if (in_array('attendance',$sections,true)) foreach($data['days'] as $day) if ($day['date']!=='') {
            $status=$data['attendance'][(string)$sid][$day['date']]??'';
            $rows[]=['الحضور',$week,$class,$day['date'],$day['name'],'','',$sid,$student['name'],$labels[$status]??'', ''];
        }
        if (in_array('participation',$sections,true)) foreach($data['days'] as $day) if ($day['date']!=='') {
            $record=$data['participation'][(string)$sid][$day['date']]??null;
            $rows[]=['المشاركة',$week,$class,$day['date'],$day['name'],'مشاركة يومية',$record['maxScore']??1,$sid,$student['name'],$record?($labels[$record['status']]??$record['status']):'', $record['score']??''];
        }
        foreach($data['items'] as $item) {
            $section=$item['item_type']==='task'?'tasks':'homework';if (!in_array($section,$sections,true)) continue;
            $record=$item['scores'][(string)$sid]??null;
            $rows[]=[$section==='tasks'?'المهام':'الواجبات',$week,$class,$item['item_date'],$labels[$item['item_type']]??$item['item_type'],$item['title'],$item['maxScore'],$sid,$student['name'],$record?($labels[$record['status']]??$record['status']):'', $record['score']??''];
        }
    }
    return $rows;
}

function teacher_weekly_selected_sections(): array
{
    $raw=trim((string)($_GET['sections']??'attendance,participation,homework,tasks'));
    $allowed=['attendance','participation','homework','tasks'];
    $sections=array_values(array_intersect($allowed,array_filter(array_map('trim',explode(',',$raw)))));
    return $sections?:$allowed;
}

function teacher_weekly_export_xlsx(int $teacherId): never
{
    $classId=(int)($_GET['classId']??0);$week=teacher_weekly_week($_GET['week']??1);$sections=teacher_weekly_selected_sections();
    $data=teacher_weekly_follow_up_data($teacherId,$classId,$week);
    $headers=['القسم','الأسبوع','الفصل','التاريخ','اليوم أو النوع','البند','الدرجة الكاملة','معرف الطالبة','اسم الطالبة','الحالة','الدرجة'];
    $rows=teacher_weekly_export_rows($data,$sections);
    teacher_weekly_send_xlsx('متابعة الأسبوع '.$week,$headers,$rows,'madar-follow-up-week-'.$week.'.xlsx');
}

function teacher_weekly_column_letter(int $index): string
{
    $letters='';$number=$index+1;
    while($number>0){$number--; $letters=chr(65+($number%26)).$letters; $number=intdiv($number,26);}return $letters;
}

function teacher_weekly_send_xlsx(string $sheetName,array $headers,array $rows,string $filename): never
{
    if (!class_exists('ZipArchive')) {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="'.preg_replace('/\.xlsx$/i','.csv',$filename).'"');
        echo "\xEF\xBB\xBF";
        echo "sep=;\r\n";
        $out=fopen('php://output','wb');
        $safe=static fn($value)=>preg_match('/^[=+\-@]/u',(string)$value)?"'".(string)$value:(string)$value;
        fputcsv($out,array_map($safe,$headers),';');
        foreach($rows as $row) fputcsv($out,array_map($safe,array_values($row)),';');
        fclose($out);
        exit;
    }
    $path=tempnam(sys_get_temp_dir(),'madar-weekly-');if($path===false)Http::json(['error'=>'تعذّر تجهيز ملف Excel.'],500);
    $zip=new ZipArchive();if($zip->open($path,ZipArchive::CREATE|ZipArchive::OVERWRITE)!==true)Http::json(['error'=>'تعذّر إنشاء ملف Excel.'],500);
    $safeSheet=mb_substr(str_replace(['\\','/','?','*','[',']',':'],' ', $sheetName),0,31);
    $contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
    $rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    $workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'.teacher_xlsx_xml_text($safeSheet).'" sheetId="1" r:id="rId1"/></sheets></workbook>';
    $workbookRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    $styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5B3A8E"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" readingOrder="2"/></xf><xf borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2" wrapText="1"/></xf></cellXfs></styleSheet>';
    $sheetRows='<row r="1">';foreach($headers as $i=>$header)$sheetRows.=teacher_xlsx_text_cell(teacher_weekly_column_letter($i).'1',$header,1);$sheetRows.='</row>';
    foreach($rows as $r=>$row){$n=$r+2;$sheetRows.='<row r="'.$n.'">';foreach(array_values($row) as $c=>$value)$sheetRows.=teacher_xlsx_text_cell(teacher_weekly_column_letter($c).$n,$value,2);$sheetRows.='</row>';}
    $lastCol=teacher_weekly_column_letter(max(0,count($headers)-1));$lastRow=max(1,count($rows)+1);
    $worksheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'.$lastCol.$lastRow.'"/><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols><col min="1" max="'.count($headers).'" width="20" customWidth="1"/></cols><sheetData>'.$sheetRows.'</sheetData><autoFilter ref="A1:'.$lastCol.$lastRow.'"/></worksheet>';
    $zip->addFromString('[Content_Types].xml',$contentTypes);$zip->addFromString('_rels/.rels',$rels);$zip->addFromString('xl/workbook.xml',$workbook);$zip->addFromString('xl/_rels/workbook.xml.rels',$workbookRels);$zip->addFromString('xl/styles.xml',$styles);$zip->addFromString('xl/worksheets/sheet1.xml',$worksheet);$zip->close();
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');header('Content-Disposition: attachment; filename="'.$filename.'"');header('Content-Length: '.filesize($path));header('Cache-Control: no-store');readfile($path);@unlink($path);exit;
}

function teacher_weekly_status_ar(string $status): string
{
    return teacher_weekly_labels()[$status]??'—';
}

function teacher_weekly_print_h(mixed $value): string
{
    return htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
}

function teacher_weekly_print_number(mixed $value): string
{
    if ($value===null || $value==='') return '';
    $number=(float)$value;
    return abs($number-round($number))<0.00001?(string)(int)round($number):rtrim(rtrim(number_format($number,2,'.',''),'0'),'.');
}

function teacher_weekly_print_mark(string $status, mixed $score=null, string $mode='symbols'): string
{
    if ($mode==='grades' && $score!==null && $score!=='') {
        return '<span class="print-grade">'.teacher_weekly_print_h(teacher_weekly_print_number($score)).'</span>';
    }
    $marks=[
        'present'=>['ok','✓','حاضرة'],
        'completed'=>['ok','✓','مكتمل'],
        'absent'=>['no','✕','غائبة'],
        'missing'=>['no','✕','لم تسلم'],
        'late'=>['late','↑','متأخرة'],
        'needs_review'=>['late','↑','يحتاج مراجعة'],
        'excused'=>['excused','ع','بعذر'],
    ];
    [$class,$symbol,$label]=$marks[$status]??$marks['missing'];
    return '<span class="print-mark print-mark-'.$class.'" title="'.teacher_weekly_print_h($label).'">'.$symbol.'</span>';
}

function teacher_weekly_active_days(array $data,string $section): array
{
    $active=[];
    foreach($data['days'] as $day) {
        $date=(string)($day['date']??'');
        if ($date==='') continue;
        foreach($data['students'] as $student) {
            $sid=(string)$student['id'];
            if (isset($data[$section][$sid][$date])) {$active[]=$day;break;}
        }
    }
    return $active;
}

function teacher_weekly_active_items(array $data,string $section): array
{
    return array_values(array_filter($data['items'],static function(array $item) use($section): bool {
        $matches=$section==='tasks'?$item['item_type']==='task':$item['item_type']!=='task';
        return $matches && !empty($item['scores']);
    }));
}

function teacher_weekly_print_day_header(array $day): string
{
    return '<span class="print-col-title">'.teacher_weekly_print_h($day['name']??'').'</span><small>'.teacher_weekly_print_h($day['date']??'').'</small>';
}

function teacher_weekly_print_item_header(array $item,array $days): string
{
    $dayName='';
    foreach($days as $day) if (($day['date']??'')===($item['item_date']??'')) {$dayName=(string)($day['name']??'');break;}
    $small=trim($dayName.' · '.(string)($item['item_date']??''),' ·');
    return '<span class="print-col-title">'.teacher_weekly_print_h($item['title']??'').'</span><small>'.teacher_weekly_print_h($small).'</small>';
}

function teacher_weekly_general_print_table(array $data,array $sections,string $taskMode): string
{
    $attendance=in_array('attendance',$sections,true)?teacher_weekly_active_days($data,'attendance'):[];
    $participation=in_array('participation',$sections,true)?teacher_weekly_active_days($data,'participation'):[];
    $homework=in_array('homework',$sections,true)?teacher_weekly_active_items($data,'homework'):[];
    $tasks=in_array('tasks',$sections,true)?teacher_weekly_active_items($data,'tasks'):[];
    $total=count($attendance)+count($participation)+count($homework)+count($tasks);
    if ($total===0) return '<div class="weekly-print-empty">لا توجد بيانات مسجلة في الأسبوع المختار.</div>';

    $groupRow='';$columnRow='';
    foreach([['الحضور',$attendance,'day'],['المشاركة',$participation,'day'],['الواجبات',$homework,'item'],['المهام',$tasks,'item']] as [$label,$columns,$type]) {
        if (!$columns) continue;
        $groupRow.='<th class="weekly-section-group" colspan="'.count($columns).'">'.teacher_weekly_print_h($label).'</th>';
        foreach($columns as $column) $columnRow.='<th class="weekly-detail-head">'.($type==='day'?teacher_weekly_print_day_header($column):teacher_weekly_print_item_header($column,$data['days'])).'</th>';
    }

    $rows='';
    foreach($data['students'] as $student) {
        $sid=(string)$student['id'];
        $cells='<td class="print-email" dir="ltr">'.teacher_weekly_print_h($student['email']).'</td><td class="print-student-name">'.teacher_weekly_print_h($student['name']).'</td>';
        foreach($attendance as $day) $cells.='<td>'.teacher_weekly_print_mark((string)($data['attendance'][$sid][$day['date']]??'missing')).'</td>';
        foreach($participation as $day) {
            $record=$data['participation'][$sid][$day['date']]??null;
            $cells.='<td>'.teacher_weekly_print_mark((string)($record['status']??'missing')).'</td>';
        }
        foreach($homework as $item) {
            $record=$item['scores'][$sid]??null;
            $cells.='<td>'.teacher_weekly_print_mark((string)($record['status']??'missing')).'</td>';
        }
        foreach($tasks as $item) {
            $record=$item['scores'][$sid]??null;
            $cells.='<td>'.teacher_weekly_print_mark((string)($record['status']??'missing'),$record['score']??null,$taskMode).'</td>';
        }
        $rows.='<tr>'.$cells.'</tr>';
    }
    return '<div class="print-table-wrap"><table class="weekly-print-grid weekly-general-print"><thead>'
        .'<tr><th rowspan="3">البريد الإلكتروني</th><th rowspan="3">اسم الطالبة</th><th class="weekly-week-group" colspan="'.$total.'">الأسبوع '.(int)$data['week'].'</th></tr>'
        .'<tr>'.$groupRow.'</tr><tr>'.$columnRow.'</tr></thead><tbody>'.$rows.'</tbody></table></div>';
}

function teacher_weekly_separate_print_table(array $data,string $section,string $taskMode): string
{
    $sectionLabels=['attendance'=>'الحضور','participation'=>'المشاركة','homework'=>'الواجبات','tasks'=>'المهام'];
    $columns=in_array($section,['attendance','participation'],true)?teacher_weekly_active_days($data,$section):teacher_weekly_active_items($data,$section);
    if (!$columns) return '<div class="weekly-print-empty">لا توجد بيانات مسجلة في '.teacher_weekly_print_h($sectionLabels[$section]??'هذا السجل').' خلال الأسبوع المختار.</div>';
    $headers='';
    foreach($columns as $column) $headers.='<th class="weekly-detail-head">'.(in_array($section,['attendance','participation'],true)?teacher_weekly_print_day_header($column):teacher_weekly_print_item_header($column,$data['days'])).'</th>';
    $rows='';
    foreach($data['students'] as $student) {
        $sid=(string)$student['id'];
        $cells='<td class="print-email" dir="ltr">'.teacher_weekly_print_h($student['email']).'</td><td class="print-student-name">'.teacher_weekly_print_h($student['name']).'</td>';
        foreach($columns as $column) {
            if ($section==='attendance') $cells.='<td>'.teacher_weekly_print_mark((string)($data['attendance'][$sid][$column['date']]??'missing')).'</td>';
            elseif ($section==='participation') {$record=$data['participation'][$sid][$column['date']]??null;$cells.='<td>'.teacher_weekly_print_mark((string)($record['status']??'missing')).'</td>';}
            else {$record=$column['scores'][$sid]??null;$mode=$section==='tasks'?$taskMode:'symbols';$cells.='<td>'.teacher_weekly_print_mark((string)($record['status']??'missing'),$record['score']??null,$mode).'</td>';}
        }
        $rows.='<tr>'.$cells.'</tr>';
    }
    return '<div class="print-table-wrap"><table class="weekly-print-grid weekly-separate-print"><thead><tr><th rowspan="2">البريد الإلكتروني</th><th rowspan="2">اسم الطالبة</th><th class="weekly-week-group" colspan="'.count($columns).'">الأسبوع '.(int)$data['week'].' — '.teacher_weekly_print_h($sectionLabels[$section]??'').'</th></tr><tr>'.$headers.'</tr></thead><tbody>'.$rows.'</tbody></table></div>';
}

function teacher_weekly_print(int $teacherId): never
{
    $classId=(int)($_GET['classId']??0);
    $week=teacher_weekly_week($_GET['week']??1);
    $sections=teacher_weekly_selected_sections();
    $layout=(string)($_GET['layout']??'separate');
    $taskMode=(string)($_GET['taskMode']??'symbols')==='grades'?'grades':'symbols';
    $data=teacher_weekly_follow_up_data($teacherId,$classId,$week);
    $class=$data['class'];
    if (in_array($layout,['general','combined'],true)) {
        $title='سجل متابعة';
        $parts=teacher_weekly_general_print_table($data,$sections,$taskMode);
    } else {
        $titles=['attendance'=>'سجل الحضور','participation'=>'سجل المشاركة','homework'=>'سجل الواجبات','tasks'=>'سجل المهام'];
        $valid=array_values(array_filter($sections,static fn($section)=>isset($titles[$section])));
        $title=count($valid)===1?$titles[$valid[0]]:'سجل متابعة';
        $parts='';
        foreach($valid as $section) {
            if (count($valid)>1) $parts.='<section class="weekly-print-section"><h2>'.$titles[$section].'</h2>';
            $parts.=teacher_weekly_separate_print_table($data,$section,$taskMode);
            if (count($valid)>1) $parts.='</section>';
        }
        if ($parts==='') $parts='<div class="weekly-print-empty">اختاري سجلًا واحدًا على الأقل للطباعة.</div>';
    }
    printable_report($title,$parts,$teacherId,['stage'=>$class['stage']??'','gradeLabel'=>$class['grade_label']??'','className'=>$class['name']??'','academicYear'=>$data['settings']['academic_year']??'','semester'=>$data['settings']['current_semester']??'first','subject'=>'الرياضيات','orientation'=>'landscape']);
}

function teacher_weekly_import(int $teacherId): never
{
    if (!isset($_FILES['file']) || ($_FILES['file']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) Http::json(['error'=>'اختاري ملف XLSX أو CSV صادرًا من سجل المتابعة.'],422);
    $classId=(int)($_POST['classId']??0);$week=teacher_weekly_week($_POST['week']??1);teacher_weekly_class($teacherId,$classId);$context=teacher_weekly_context($teacherId);
    $extension=mb_strtolower(pathinfo((string)($_FILES['file']['name']??''),PATHINFO_EXTENSION));if(!in_array($extension,['xlsx','csv','txt'],true))Http::json(['error'=>'الصيغ المدعومة XLSX وCSV.'],422);
    $table=$extension==='xlsx'?teacher_read_xlsx_table((string)$_FILES['file']['tmp_name']):teacher_read_delimited_table((string)$_FILES['file']['tmp_name']);if(count($table)<2)Http::json(['error'=>'الملف لا يحتوي بيانات.'],422);
    $headers=array_map('teacher_normalize_import_text',$table[0]);$find=static function(array $names) use($headers): int {foreach($headers as $i=>$header)foreach($names as $name)if($header===teacher_normalize_import_text($name))return $i;return -1;};$cols=['section'=>$find(['القسم']),'date'=>$find(['التاريخ']),'type'=>$find(['اليوم أو النوع']),'title'=>$find(['البند']),'max'=>$find(['الدرجة الكاملة']),'studentId'=>$find(['معرف الطالبة']),'status'=>$find(['الحالة']),'score'=>$find(['الدرجة'])];if($cols['section']<0||$cols['date']<0||$cols['studentId']<0)Http::json(['error'=>'الملف ليس من نموذج سجل متابعة مدار.'],422);
    $owned=teacher_weekly_owned_students($teacherId,$classId);$imported=0;$errors=[];
    for($r=1;$r<count($table);$r++) {$row=$table[$r];$section=trim((string)($row[$cols['section']]??''));$date=trim((string)($row[$cols['date']]??''));$studentId=(int)($row[$cols['studentId']]??0);if($section===''||$date===''||!$studentId)continue;if(!isset($owned[$studentId])){$errors[]='السطر '.($r+1).': الطالبة لا تتبع الفصل.';continue;}try{[$rowWeek,$day]=teacher_weekly_position($context,$date);}catch(Throwable){$errors[]='السطر '.($r+1).': التاريخ خارج أيام الترم.';continue;}if($rowWeek!==$week){$errors[]='السطر '.($r+1).': التاريخ لا ينتمي للأسبوع المختار.';continue;}$statusText=trim((string)($row[$cols['status']]??''));$score=trim((string)($row[$cols['score']]??''));$max=max(.5,(float)($row[$cols['max']]??1));
        if($section==='الحضور'){$map=['حاضرة'=>'present','غائبة'=>'absent','متأخرة'=>'late','بعذر'=>'excused'];$status=$map[$statusText]??'';if($status!==''){execute_sql('INSERT INTO weekly_attendance (teacher_id,class_id,student_id,academic_year,semester,week_no,day_index,attendance_date,status) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE attendance_date=VALUES(attendance_date),status=VALUES(status)',[$teacherId,$classId,$studentId,$context['academic_year'],$context['semester'],$week,$day,$date,$status]);$imported++;}}
        elseif($section==='المشاركة'){if($statusText===''&&$score==='')continue;$status=$statusText==='يحتاج مراجعة'?'needs_review':'completed';execute_sql('DELETE FROM weekly_participation WHERE teacher_id=? AND student_id=? AND academic_year=? AND semester=? AND week_no=? AND day_index=?',[$teacherId,$studentId,$context['academic_year'],$context['semester'],$week,$day]);execute_sql('INSERT INTO weekly_participation (teacher_id,class_id,student_id,academic_year,semester,week_no,day_index,participation_date,score,max_score,record_status) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE academic_year=VALUES(academic_year),semester=VALUES(semester),week_no=VALUES(week_no),day_index=VALUES(day_index),score=VALUES(score),max_score=VALUES(max_score),record_status=VALUES(record_status)',[$teacherId,$classId,$studentId,$context['academic_year'],$context['semester'],$week,$day,$date,$score===''?null:(float)$score,$max,$status]);$imported++;}
        elseif(in_array($section,['الواجبات','المهام'],true)){if($statusText===''&&$score==='')continue;$typeText=trim((string)($row[$cols['type']]??''));$type=$section==='المهام'?'task':($typeText==='واجب منصة'?'platform_homework':'school_homework');$title=trim((string)($row[$cols['title']]??''))?:teacher_weekly_labels()[$type];$item=fetch_one('SELECT id FROM weekly_follow_up_items WHERE teacher_id=? AND class_id=? AND academic_year=? AND semester=? AND week_no=? AND item_type=? AND title=? AND item_date=?',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week,$type,$title,$date]);if(!$item){execute_sql('INSERT INTO weekly_follow_up_items (teacher_id,class_id,academic_year,semester,week_no,item_type,title,item_date,max_score) VALUES (?,?,?,?,?,?,?,?,?)',[$teacherId,$classId,$context['academic_year'],$context['semester'],$week,$type,$title,$date,$max]);$item=['id'=>(int)Database::connection()->lastInsertId()];}$statusMap=['مكتمل'=>'completed','يحتاج مراجعة'=>'needs_review','لم تسلم'=>'missing','معذورة'=>'excused','بعذر'=>'excused'];$recordStatus=$statusMap[$statusText]??'completed';execute_sql('INSERT INTO weekly_follow_up_item_scores (item_id,student_id,score,record_status) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score),record_status=VALUES(record_status)',[(int)$item['id'],$studentId,$score===''?null:(float)$score,$recordStatus]);$imported++;}
    }
    Activity::log('teacher',$teacherId,'استيراد سجل متابعة أسبوعي',"{$context['semester_label']} — الأسبوع {$week}: {$imported} سجل");Http::json(['imported'=>$imported,'errors'=>$errors]);
}

