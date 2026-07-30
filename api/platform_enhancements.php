<?php
declare(strict_types=1);

/**
 * تحسينات منصة مدار v11:
 * البحث الشامل، الملف الموحد للطالبة، الخطط العلاجية، التقويم، رسائل ولي الأمر،
 * التقارير الذكية، طلبات استعادة كلمة المرور، حالة النظام والنسخ الاحتياطية.
 */

function ensure_platform_enhancement_schema(): void
{
    static $ready = false;
    if ($ready) return;
    Rbac::ensureSchema();
    ensure_parent_portal_schema();
    $pdo = Database::connection();
    $statements = [
        "CREATE TABLE IF NOT EXISTS remedial_plans (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          skill_id BIGINT UNSIGNED NULL,
          source_test_id BIGINT UNSIGNED NULL,
          reassessment_test_id BIGINT UNSIGNED NULL,
          title VARCHAR(190) NOT NULL,
          diagnosis TEXT NULL,
          recommended_activity VARCHAR(1000) NULL,
          recommended_resource_url VARCHAR(2048) NULL,
          before_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
          target_percent DECIMAL(5,2) NOT NULL DEFAULT 70,
          after_percent DECIMAL(5,2) NULL,
          due_date DATE NULL,
          status ENUM('planned','in_progress','completed','reassessed','cancelled') NOT NULL DEFAULT 'planned',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_remedial_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_remedial_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_remedial_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
          CONSTRAINT fk_remedial_source_test FOREIGN KEY (source_test_id) REFERENCES tests(id) ON DELETE SET NULL,
          CONSTRAINT fk_remedial_reassessment FOREIGN KEY (reassessment_test_id) REFERENCES tests(id) ON DELETE SET NULL,
          INDEX idx_remedial_teacher_status (teacher_id,status,due_date),
          INDEX idx_remedial_student (student_id,created_at),
          INDEX idx_remedial_skill (skill_id,status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS game_attempts (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          student_id BIGINT UNSIGNED NOT NULL,
          game_key VARCHAR(100) NOT NULL,
          difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'easy',
          score INT UNSIGNED NOT NULL DEFAULT 0,
          question_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          correct_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          best_streak SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          accuracy DECIMAL(5,2) NOT NULL DEFAULT 0,
          duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
          played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_game_attempt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          INDEX idx_game_attempt_student_date (student_id,played_at),
          INDEX idx_game_attempt_key_date (game_key,played_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS learning_resource_links (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NULL,
          skill_id BIGINT UNSIGNED NULL,
          title VARCHAR(190) NOT NULL,
          resource_type ENUM('game','training','worksheet','video','link') NOT NULL DEFAULT 'link',
          resource_url VARCHAR(2048) NOT NULL,
          description VARCHAR(1000) NULL,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_learning_resource_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_learning_resource_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
          INDEX idx_learning_resource_skill (skill_id,is_active),
          INDEX idx_learning_resource_teacher (teacher_id,is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS calendar_events (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          class_id BIGINT UNSIGNED NULL,
          student_id BIGINT UNSIGNED NULL,
          title VARCHAR(190) NOT NULL,
          description VARCHAR(1000) NULL,
          event_type ENUM('test','homework','task','meeting','announcement','remedial','other') NOT NULL DEFAULT 'other',
          audience ENUM('teacher','class','student','parents','class_and_parents') NOT NULL DEFAULT 'class',
          starts_at DATETIME NOT NULL,
          ends_at DATETIME NULL,
          status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_calendar_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_calendar_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          CONSTRAINT fk_calendar_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          INDEX idx_calendar_teacher_date (teacher_id,starts_at,status),
          INDEX idx_calendar_class_date (class_id,starts_at,status),
          INDEX idx_calendar_student_date (student_id,starts_at,status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS parent_private_messages (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          parent_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          sender_role ENUM('teacher','parent') NOT NULL,
          sender_id BIGINT UNSIGNED NOT NULL,
          subject VARCHAR(190) NOT NULL,
          body TEXT NOT NULL,
          teacher_seen_at DATETIME NULL,
          parent_seen_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_parent_message_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_parent_message_parent FOREIGN KEY (parent_id) REFERENCES platform_users(id) ON DELETE CASCADE,
          CONSTRAINT fk_parent_message_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          INDEX idx_parent_message_teacher (teacher_id,teacher_seen_at,created_at),
          INDEX idx_parent_message_parent (parent_id,parent_seen_at,created_at),
          INDEX idx_parent_message_thread (teacher_id,parent_id,student_id,created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS password_reset_requests (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          requested_role ENUM('STUDENT','PARENT','TEACHER','ADMIN') NOT NULL,
          subject_type ENUM('student','teacher','platform') NULL,
          subject_id BIGINT UNSIGNED NULL,
          first_name VARCHAR(60) NULL,
          last_name VARCHAR(60) NULL,
          identifier_hint VARCHAR(190) NULL,
          student_reference VARCHAR(190) NULL,
          request_note VARCHAR(500) NULL,
          status ENUM('pending','resolved','rejected') NOT NULL DEFAULT 'pending',
          handled_by_role VARCHAR(20) NULL,
          handled_by_id BIGINT UNSIGNED NULL,
          resolution_note VARCHAR(500) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          handled_at DATETIME NULL,
          INDEX idx_password_request_status_role (status,requested_role,created_at),
          INDEX idx_password_request_subject (subject_type,subject_id,status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS privacy_consents (
          subject_type ENUM('owner','teacher','student','platform') NOT NULL,
          subject_id BIGINT UNSIGNED NOT NULL,
          policy_version VARCHAR(30) NOT NULL,
          accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ip_address VARCHAR(45) NULL,
          user_agent VARCHAR(500) NULL,
          PRIMARY KEY (subject_type,subject_id,policy_version)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS system_backup_history (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          backup_type ENUM('manual','daily','academic_year') NOT NULL DEFAULT 'manual',
          file_name VARCHAR(255) NOT NULL,
          file_path VARCHAR(1000) NOT NULL,
          size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
          sha256 CHAR(64) NULL,
          status ENUM('created','verified','failed','deleted') NOT NULL DEFAULT 'created',
          created_by_role VARCHAR(20) NULL,
          created_by_id BIGINT UNSIGNED NULL,
          details VARCHAR(1000) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          verified_at DATETIME NULL,
          INDEX idx_backup_status_date (status,created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS system_error_log (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          severity ENUM('notice','warning','error','critical') NOT NULL DEFAULT 'error',
          source VARCHAR(120) NOT NULL,
          message VARCHAR(2000) NOT NULL,
          context_json LONGTEXT NULL,
          resolved_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_system_error_status (resolved_at,severity,created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];
    foreach ($statements as $sql) {
        try { $pdo->exec($sql); } catch (Throwable $error) { error_log('[enhancement-schema] '.$error->getMessage()); throw $error; }
    }
    platform_enhancement_add_column('notifications','severity',"ENUM('info','success','warning','danger') NOT NULL DEFAULT 'info' AFTER body");
    platform_enhancement_add_column('notifications','route','VARCHAR(190) NULL AFTER severity');
    platform_enhancement_add_column('notifications','dedupe_key','VARCHAR(190) NULL AFTER route');
    platform_enhancement_add_index('notifications','idx_notifications_teacher_read','teacher_id,is_read,created_at');
    platform_enhancement_add_unique_index('notifications','uq_notifications_dedupe','teacher_id,dedupe_key');
    platform_enhancement_seed_resources();
    $ready = true;
}

function platform_enhancement_add_column(string $table,string $column,string $definition): void
{
    $exists=fetch_one('SELECT 1 AS ok FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1',[$table,$column]);
    if (!$exists) Database::connection()->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
}

function platform_enhancement_add_index(string $table,string $index,string $columns): void
{
    $exists=fetch_one('SELECT 1 AS ok FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1',[$table,$index]);
    if (!$exists) Database::connection()->exec("ALTER TABLE `{$table}` ADD INDEX `{$index}` ({$columns})");
}

function platform_enhancement_add_unique_index(string $table,string $index,string $columns): void
{
    $exists=fetch_one('SELECT 1 AS ok FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? LIMIT 1',[$table,$index]);
    if (!$exists) {
        try { Database::connection()->exec("ALTER TABLE `{$table}` ADD UNIQUE INDEX `{$index}` ({$columns})"); }
        catch (Throwable $error) { error_log('[enhancement-index] '.$error->getMessage()); }
    }
}

function platform_enhancement_seed_resources(): void
{
    $exists=fetch_one("SELECT id FROM learning_resource_links WHERE teacher_id IS NULL AND resource_url='/games/percentage.html' LIMIT 1");
    if (!$exists) {
        execute_sql("INSERT INTO learning_resource_links(teacher_id,skill_id,title,resource_type,resource_url,description) VALUES(NULL,NULL,'لعبة النسبة المئوية','game','/games/percentage.html','تدريب تفاعلي مناسب لمهارات النسبة المئوية')");
    }
}

function platform_enhancement_date(string $value,bool $required=true): ?string
{
    $value=trim($value);
    if ($value==='') {
        if ($required) Http::json(['error'=>'التاريخ والوقت مطلوبان.'],422);
        return null;
    }
    try { return (new DateTimeImmutable($value))->format('Y-m-d H:i:s'); }
    catch (Throwable) { Http::json(['error'=>'صيغة التاريخ أو الوقت غير صالحة.'],422); }
}


function platform_privacy_routes(string $role,int $subjectId,string $method): never
{
    ensure_platform_enhancement_schema();
    $version=(string)(env_value('PRIVACY_POLICY_VERSION','2026-07')??'2026-07');
    $subjectType=match(strtolower($role)){
        'owner'=>'owner','teacher'=>'teacher','student'=>'student',default=>'platform'
    };
    if($method==='GET'){
        $row=fetch_one('SELECT accepted_at FROM privacy_consents WHERE subject_type=? AND subject_id=? AND policy_version=?',[$subjectType,$subjectId,$version]);
        Http::json(['accepted'=>(bool)$row,'acceptedAt'=>$row['accepted_at']??null,'version'=>$version,'privacyUrl'=>'/privacy.html','termsUrl'=>'/terms.html']);
    }
    if($method==='POST'){
        $ip=(string)($_SERVER['REMOTE_ADDR']??'');
        $ua=mb_substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,500);
        execute_sql('INSERT INTO privacy_consents(subject_type,subject_id,policy_version,accepted_at,ip_address,user_agent) VALUES(?,?,?,NOW(),?,?) ON DUPLICATE KEY UPDATE accepted_at=VALUES(accepted_at),ip_address=VALUES(ip_address),user_agent=VALUES(user_agent)',[$subjectType,$subjectId,$version,$ip?:null,$ua?:null]);
        Activity::log(strtolower($role),$subjectId,'الموافقة على سياسة الخصوصية','الإصدار '.$version);
        Http::json(['ok'=>true,'version'=>$version]);
    }
    Http::json(['error'=>'الطريقة غير مسموحة.'],405);
}

function teacher_enhancement_routes(string $method,array $segments,int $teacherId): never
{
    ensure_platform_enhancement_schema();
    $resource=$segments[0]??'';
    if ($resource==='search'&&$method==='GET') teacher_global_search($teacherId);
    if ($resource==='student'&&isset($segments[1])&&($segments[2]??'')==='overview'&&$method==='GET') teacher_enhanced_student_overview($teacherId,route_id($segments,1));
    if ($resource==='remedial') teacher_remedial_routes($method,array_slice($segments,1),$teacherId);
    if ($resource==='calendar') teacher_calendar_routes($method,array_slice($segments,1),$teacherId);
    if ($resource==='messages') teacher_parent_message_routes($method,array_slice($segments,1),$teacherId);
    if ($resource==='smart-reports'&&$method==='GET') teacher_smart_reports($teacherId);
    if ($resource==='alerts'&&$method==='GET') teacher_smart_alerts($teacherId);
    if ($resource==='password-requests') teacher_password_request_routes($method,array_slice($segments,1),$teacherId);
    Http::json(['error'=>'مسار التحسينات غير موجود.'],404);
}

function teacher_global_search(int $teacherId): never
{
    $q=trim((string)($_GET['q']??''));
    if (mb_strlen($q)<2) Http::json(['query'=>$q,'groups'=>[]]);
    $like='%'.$q.'%';
    $groups=[];
    $students=fetch_all("SELECT s.id,s.name,s.email,c.name AS class_name,s.stage,s.grade_label FROM students s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND s.deleted_at IS NULL AND (s.name LIKE ? OR s.email LIKE ? OR c.name LIKE ?) ORDER BY s.name LIMIT 12",[$teacherId,$like,$like,$like]);
    if ($students) $groups[]=['type'=>'students','label'=>'الطالبات','icon'=>'🎓','items'=>array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>$r['name'],'subtitle'=>$r['email'].' · '.$r['class_name'],'route'=>'student','meta'=>$r],$students)];
    $tests=fetch_all("SELECT id,title,test_type,status,created_at FROM tests WHERE teacher_id=? AND title LIKE ? ORDER BY created_at DESC LIMIT 10",[$teacherId,$like]);
    if ($tests) $groups[]=['type'=>'tests','label'=>'الاختبارات','icon'=>'📝','items'=>array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>$r['title'],'subtitle'=>$r['test_type'].' · '.$r['status'],'route'=>'tests-panel','meta'=>$r],$tests)];
    $questions=fetch_all("SELECT q.id,q.question_text,q.topic,q.stage,q.grade_label FROM question_bank q LEFT JOIN skills sk ON sk.id=q.skill_id WHERE q.teacher_id=? AND q.is_active=1 AND (q.question_text LIKE ? OR q.topic LIKE ? OR q.lesson_name LIKE ? OR sk.name LIKE ?) ORDER BY q.updated_at DESC LIMIT 10",[$teacherId,$like,$like,$like,$like]);
    if ($questions) $groups[]=['type'=>'questions','label'=>'بنك الأسئلة','icon'=>'🏦','items'=>array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>mb_strimwidth((string)$r['question_text'],0,120,'…','UTF-8'),'subtitle'=>$r['topic'].' · '.$r['stage'].' · '.$r['grade_label'],'route'=>'question-bank','meta'=>$r],$questions)];
    $classes=fetch_all("SELECT id,name,stage,grade_label FROM classes WHERE teacher_id=? AND (name LIKE ? OR stage LIKE ? OR grade_label LIKE ?) ORDER BY name LIMIT 10",[$teacherId,$like,$like,$like]);
    if ($classes) $groups[]=['type'=>'classes','label'=>'الفصول','icon'=>'🏫','items'=>array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>$r['name'],'subtitle'=>$r['stage'].' · '.$r['grade_label'],'route'=>'student-panel','meta'=>$r],$classes)];
    $parents=fetch_all("SELECT DISTINCT p.id,p.name,GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR '، ') AS children FROM platform_users p JOIN parent_student_links l ON l.parent_id=p.id AND l.status='active' JOIN students s ON s.id=l.student_id JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND p.role_code='PARENT' AND p.deleted_at IS NULL AND (p.name LIKE ? OR s.name LIKE ?) GROUP BY p.id,p.name ORDER BY p.name LIMIT 10",[$teacherId,$like,$like]);
    if ($parents) $groups[]=['type'=>'parents','label'=>'أولياء الأمور','icon'=>'👪','items'=>array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>$r['name'],'subtitle'=>'الأبناء: '.($r['children']?:'—'),'route'=>'parent-panel','meta'=>$r],$parents)];
    $files=fetch_all("SELECT f.id,f.title,f.original_name,s.name AS student_name FROM student_portfolio_files f JOIN students s ON s.id=f.student_id JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND (f.title LIKE ? OR f.original_name LIKE ? OR s.name LIKE ?) ORDER BY f.created_at DESC LIMIT 10",[$teacherId,$like,$like,$like]);
    if ($files) $groups[]=['type'=>'files','label'=>'الملفات','icon'=>'📁','items'=>array_map(static fn($r)=>['id'=>(int)$r['id'],'title'=>$r['title'],'subtitle'=>$r['student_name'].' · '.$r['original_name'],'route'=>'student-files','meta'=>$r],$files)];
    Http::json(['query'=>$q,'groups'=>$groups,'total'=>array_sum(array_map(static fn($g)=>count($g['items']),$groups))]);
}

function teacher_enhanced_student_overview(int $teacherId,int $studentId): never
{
    if (!teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'الطالبة غير موجودة ضمن فصولك.'],404);
    $student=fetch_one("SELECT s.id,s.name,s.email,s.stage,s.grade_label,s.learning_style,s.progress_percent,s.status,s.last_active,c.id AS class_id,c.name AS class_name FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=?",[$studentId]);
    $parents=fetch_all("SELECT p.id,p.name,p.status,l.relation_label FROM parent_student_links l JOIN platform_users p ON p.id=l.parent_id WHERE l.student_id=? AND l.status='active' AND p.deleted_at IS NULL",[$studentId]);
    $results=fetch_all("SELECT a.id,t.id AS test_id,t.title,t.test_type,a.status,a.score,a.total_points,a.percentage,a.submitted_at FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE a.student_id=? AND t.teacher_id=? ORDER BY COALESCE(a.submitted_at,a.started_at) DESC LIMIT 30",[$studentId,$teacherId]);
    $skills=fetch_all("SELECT sk.id,sk.name,sk.code,ss.mastery_percent,ss.evidence_count FROM student_skills ss JOIN skills sk ON sk.id=ss.skill_id WHERE ss.student_id=? ORDER BY ss.mastery_percent ASC,sk.name",[$studentId]);
    $attendance=fetch_all("SELECT attendance_date AS date,status FROM attendance WHERE student_id=? AND teacher_id=? ORDER BY attendance_date DESC LIMIT 60",[$studentId,$teacherId]);
    $assignments=fetch_all("SELECT id,title,status,due_date,created_at FROM assignments WHERE student_id=? AND teacher_id=? ORDER BY COALESCE(due_date,DATE(created_at)) DESC LIMIT 50",[$studentId,$teacherId]);
    $notes=fetch_all("SELECT n.id,n.content,n.created_at,t.name AS teacher_name FROM notes n JOIN teachers t ON t.id=n.teacher_id WHERE n.student_id=? AND n.teacher_id=? ORDER BY n.created_at DESC LIMIT 30",[$studentId,$teacherId]);
    $points=fetch_all("SELECT id,points,reason_type,reason,details,created_at FROM motivational_points WHERE student_id=? AND teacher_id=? ORDER BY created_at DESC LIMIT 50",[$studentId,$teacherId]);
    $pointsTotal=(int)(fetch_one('SELECT COALESCE(SUM(points),0) AS n FROM motivational_points WHERE student_id=? AND teacher_id=?',[$studentId,$teacherId])['n']??0);
    $files=fetch_all("SELECT id,title,category,review_status,teacher_comment,awarded_points,created_at,original_name FROM student_portfolio_files WHERE student_id=? ORDER BY created_at DESC LIMIT 30",[$studentId]);
    $plans=fetch_all("SELECT r.*,sk.name AS skill_name,t.title AS source_test_title,rt.title AS reassessment_title FROM remedial_plans r LEFT JOIN skills sk ON sk.id=r.skill_id LEFT JOIN tests t ON t.id=r.source_test_id LEFT JOIN tests rt ON rt.id=r.reassessment_test_id WHERE r.teacher_id=? AND r.student_id=? ORDER BY r.created_at DESC",[$teacherId,$studentId]);
    $messages=fetch_all("SELECT m.id,m.parent_id,p.name AS parent_name,m.sender_role,m.subject,m.body,m.teacher_seen_at,m.parent_seen_at,m.created_at FROM parent_private_messages m JOIN platform_users p ON p.id=m.parent_id WHERE m.teacher_id=? AND m.student_id=? ORDER BY m.created_at DESC LIMIT 30",[$teacherId,$studentId]);
    $assessments=fetch_all("SELECT result_style,visual_score,auditory_score,reading_writing_score,kinesthetic_score,completed_at FROM learning_style_assessments WHERE student_id=? ORDER BY completed_at DESC LIMIT 5",[$studentId]);
    $gameAttempts=fetch_all('SELECT game_key,difficulty,score,question_count,correct_count,best_streak,accuracy,duration_seconds,played_at FROM game_attempts WHERE student_id=? ORDER BY played_at DESC LIMIT 20',[$studentId]);
    $summary=teacher_student_summary_metrics($results,$attendance,$assignments,$skills,$pointsTotal);
    Http::json(compact('student','parents','results','skills','attendance','assignments','notes','points','pointsTotal','files','plans','messages','assessments','gameAttempts','summary'));
}

function teacher_student_summary_metrics(array $results,array $attendance,array $assignments,array $skills,int $pointsTotal): array
{
    $completed=array_values(array_filter($results,static fn($r)=>in_array($r['status'],['submitted','graded'],true)));
    $average=$completed?array_sum(array_map(static fn($r)=>(float)$r['percentage'],$completed))/count($completed):0;
    $present=count(array_filter($attendance,static fn($r)=>$r['status']==='present'));
    $attendanceRate=$attendance?($present/count($attendance))*100:0;
    $assignmentCompleted=count(array_filter($assignments,static fn($r)=>$r['status']==='completed'));
    $weak=count(array_filter($skills,static fn($r)=>(float)$r['mastery_percent']<70));
    return ['testAverage'=>round($average,1),'attendanceRate'=>round($attendanceRate,1),'assignmentsCompleted'=>$assignmentCompleted,'assignmentsTotal'=>count($assignments),'weakSkills'=>$weak,'points'=>$pointsTotal];
}

function teacher_remedial_routes(string $method,array $segments,int $teacherId): never
{
    $action=$segments[0]??'';
    if ($action==='auto'&&$method==='POST') {
        $data=Http::input();$studentId=(int)($data['studentId']??0);
        if (!$studentId||!teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'الطالبة غير موجودة ضمن فصولك.'],404);
        $threshold=max(40,min(90,(float)($data['threshold']??70)));
        $weak=fetch_all("SELECT sk.id,sk.name,ss.mastery_percent FROM student_skills ss JOIN skills sk ON sk.id=ss.skill_id WHERE ss.student_id=? AND ss.mastery_percent<? ORDER BY ss.mastery_percent ASC",[$studentId,$threshold]);
        $student=fetch_one('SELECT learning_style FROM students WHERE id=?',[$studentId]);
        $created=0;
        Database::transaction(function(PDO $pdo) use($teacherId,$studentId,$weak,$student,&$created):void {
            $insert=$pdo->prepare("INSERT INTO remedial_plans(teacher_id,student_id,skill_id,title,diagnosis,recommended_activity,recommended_resource_url,before_percent,target_percent,due_date,status) VALUES(?,?,?,?,?,?,?,?,?,DATE_ADD(CURDATE(),INTERVAL 14 DAY),'planned')");
            foreach($weak as $skill) {
                $exists=fetch_one("SELECT id FROM remedial_plans WHERE teacher_id=? AND student_id=? AND skill_id=? AND status IN('planned','in_progress') LIMIT 1",[$teacherId,$studentId,$skill['id']]);
                if ($exists) continue;
                [$activity,$url]=teacher_remedial_recommendation((string)$skill['name'],(string)($student['learning_style']??'unknown'));
                $insert->execute([$teacherId,$studentId,$skill['id'],'خطة علاجية: '.$skill['name'],'مستوى الإتقان الحالي '.$skill['mastery_percent'].'٪',$activity,$url,(float)$skill['mastery_percent'],70]);
                $created++;
            }
        });
        Activity::log('teacher',$teacherId,'توليد خطة علاجية تلقائية',"الطالبة رقم {$studentId}: {$created} مهارة");
        Http::json(['created'=>$created,'weakSkills'=>count($weak)]);
    }
    if (!$segments&&$method==='GET') {
        $studentId=(int)($_GET['studentId']??0);$status=trim((string)($_GET['status']??''));
        $where=['r.teacher_id=?'];$params=[$teacherId];
        if ($studentId){$where[]='r.student_id=?';$params[]=$studentId;}
        if ($status!==''){$where[]='r.status=?';$params[]=$status;}
        $rows=fetch_all("SELECT r.*,s.name AS student_name,c.name AS class_name,sk.name AS skill_name,t.title AS source_test_title,rt.title AS reassessment_title FROM remedial_plans r JOIN students s ON s.id=r.student_id JOIN classes c ON c.id=s.class_id LEFT JOIN skills sk ON sk.id=r.skill_id LEFT JOIN tests t ON t.id=r.source_test_id LEFT JOIN tests rt ON rt.id=r.reassessment_test_id WHERE ".implode(' AND ',$where).' ORDER BY FIELD(r.status,\'in_progress\',\'planned\',\'reassessed\',\'completed\',\'cancelled\'),r.due_date,r.created_at DESC',$params);
        Http::json(['items'=>$rows]);
    }
    if (!$segments&&$method==='POST') {
        $data=Http::input();Http::requireFields($data,['studentId','title']);$studentId=(int)$data['studentId'];
        if (!teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'الطالبة غير موجودة ضمن فصولك.'],404);
        $skillId=(int)($data['skillId']??0)?:null;$sourceTest=(int)($data['sourceTestId']??0)?:null;
        execute_sql("INSERT INTO remedial_plans(teacher_id,student_id,skill_id,source_test_id,title,diagnosis,recommended_activity,recommended_resource_url,before_percent,target_percent,due_date,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",[$teacherId,$studentId,$skillId,$sourceTest,trim((string)$data['title']),trim((string)($data['diagnosis']??'')),trim((string)($data['activity']??'')),trim((string)($data['resourceUrl']??''))?:null,max(0,min(100,(float)($data['beforePercent']??0))),max(0,min(100,(float)($data['targetPercent']??70))),trim((string)($data['dueDate']??''))?:null,'planned']);
        Http::json(['id'=>(int)Database::connection()->lastInsertId()],201);
    }
    $id=route_id($segments,0);
    $plan=fetch_one('SELECT * FROM remedial_plans WHERE id=? AND teacher_id=?',[$id,$teacherId]);
    if (!$plan) Http::json(['error'=>'الخطة العلاجية غير موجودة.'],404);
    if ($method==='PUT') {
        $data=Http::input();$status=(string)($data['status']??$plan['status']);
        if (!in_array($status,['planned','in_progress','completed','reassessed','cancelled'],true)) Http::json(['error'=>'حالة الخطة غير صالحة.'],422);
        $after=array_key_exists('afterPercent',$data)&&$data['afterPercent']!==''?max(0,min(100,(float)$data['afterPercent'])):$plan['after_percent'];
        $reassessment=(int)($data['reassessmentTestId']??$plan['reassessment_test_id']??0)?:null;
        if ($reassessment && !teacher_owns_test($teacherId,$reassessment)) Http::json(['error'=>'اختبار إعادة القياس غير صالح.'],422);
        execute_sql('UPDATE remedial_plans SET status=?,after_percent=?,reassessment_test_id=?,due_date=?,recommended_activity=? WHERE id=?',[$status,$after,$reassessment,trim((string)($data['dueDate']??$plan['due_date']))?:null,trim((string)($data['activity']??$plan['recommended_activity'])),$id]);
        Http::json(['ok'=>true]);
    }
    if ($method==='DELETE') {execute_sql("UPDATE remedial_plans SET status='cancelled' WHERE id=?",[$id]);Http::json(['ok'=>true]);}
    Http::json(['error'=>'الطريقة غير مسموحة.'],405);
}

function teacher_remedial_recommendation(string $skillName,string $learningStyle): array
{
    $styleMap=[
        'visual'=>'استخدمي تمثيلًا بصريًا وخريطة مفاهيم ثم أمثلة متدرجة.',
        'auditory'=>'اشرحي المهارة شفهيًا واطلبي من الطالبة تفسير خطوات الحل بصوتها.',
        'reading_writing'=>'قدمي ملخصًا قصيرًا وخطوات مكتوبة ثم ورقة تدريب.',
        'kinesthetic'=>'استخدمي نشاطًا تطبيقيًا وأدوات محسوسة وأسئلة موقفية.',
        'mixed'=>'نوّعي بين المثال المرئي والشرح والتطبيق القصير.',
        'unknown'=>'ابدئي بمثال مبسط ثم تدريب متدرج مع تغذية راجعة فورية.',
    ];
    $activity=($styleMap[$learningStyle]??$styleMap['unknown']).' ركزي على مهارة «'.$skillName.'» ثم أعيدي القياس باختبار قصير.';
    $url=str_contains($skillName,'نسبة')||str_contains($skillName,'مئوية')?'/games/percentage.html':'/teacher/?route=question-bank';
    return [$activity,$url];
}

function teacher_calendar_routes(string $method,array $segments,int $teacherId): never
{
    if (!$segments&&$method==='GET') {
        $from=trim((string)($_GET['from']??date('Y-m-01')));$to=trim((string)($_GET['to']??date('Y-m-t',strtotime('+2 months'))));
        $rows=fetch_all("SELECT e.*,c.name AS class_name,s.name AS student_name FROM calendar_events e LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN students s ON s.id=e.student_id WHERE e.teacher_id=? AND DATE(e.starts_at) BETWEEN ? AND ? ORDER BY e.starts_at",[$teacherId,$from,$to]);
        $tests=fetch_all("SELECT t.id,CONCAT('اختبار: ',t.title) AS title,t.start_at AS starts_at,t.end_at AS ends_at,'test' AS event_type,'class' AS audience,c.name AS class_name,NULL AS student_name,'active' AS status,'test' AS source FROM tests t LEFT JOIN classes c ON c.id=t.class_id WHERE t.teacher_id=? AND t.start_at IS NOT NULL AND DATE(t.start_at) BETWEEN ? AND ?",[$teacherId,$from,$to]);
        Http::json(['items'=>array_merge(array_map(static function($r){$r['source']='calendar';return $r;},$rows),$tests)]);
    }
    if (!$segments&&$method==='POST') {
        $d=Http::input();Http::requireFields($d,['title','startsAt']);
        $classId=(int)($d['classId']??0)?:null;$studentId=(int)($d['studentId']??0)?:null;
        if ($classId&&!teacher_owns_class($teacherId,$classId)) Http::json(['error'=>'الفصل غير صالح.'],422);
        if ($studentId&&!teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'الطالبة غير صالحة.'],422);
        $type=(string)($d['eventType']??'other');$audience=(string)($d['audience']??'class');
        if(!in_array($type,['test','homework','task','meeting','announcement','remedial','other'],true)||!in_array($audience,['teacher','class','student','parents','class_and_parents'],true))Http::json(['error'=>'نوع الموعد أو الجمهور غير صالح.'],422);
        if($audience==='student'&&!$studentId)Http::json(['error'=>'اختاري الطالبة للموعد الفردي.'],422);
        if(in_array($audience,['class','parents','class_and_parents'],true)&&!$classId)Http::json(['error'=>'اختاري الفصل المستهدف.'],422);
        execute_sql('INSERT INTO calendar_events(teacher_id,class_id,student_id,title,description,event_type,audience,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,?,?)',[$teacherId,$classId,$studentId,trim((string)$d['title']),trim((string)($d['description']??'')),$type,$audience,platform_enhancement_date((string)$d['startsAt']),platform_enhancement_date((string)($d['endsAt']??''),false)]);
        Http::json(['id'=>(int)Database::connection()->lastInsertId()],201);
    }
    $id=route_id($segments,0);$event=fetch_one('SELECT * FROM calendar_events WHERE id=? AND teacher_id=?',[$id,$teacherId]);
    if(!$event)Http::json(['error'=>'الموعد غير موجود.'],404);
    if($method==='PUT'){$d=Http::input();execute_sql('UPDATE calendar_events SET title=?,description=?,starts_at=?,ends_at=?,status=? WHERE id=?',[trim((string)($d['title']??$event['title'])),trim((string)($d['description']??$event['description'])),platform_enhancement_date((string)($d['startsAt']??$event['starts_at'])),platform_enhancement_date((string)($d['endsAt']??$event['ends_at']),false),(string)($d['status']??$event['status']),$id]);Http::json(['ok'=>true]);}
    if($method==='DELETE'){execute_sql("UPDATE calendar_events SET status='cancelled' WHERE id=?",[$id]);Http::json(['ok'=>true]);}
    Http::json(['error'=>'الطريقة غير مسموحة.'],405);
}

function teacher_parent_message_routes(string $method,array $segments,int $teacherId): never
{
    if (!$segments&&$method==='GET') {
        $studentId=(int)($_GET['studentId']??0);$parentId=(int)($_GET['parentId']??0);
        $where=['m.teacher_id=?'];$params=[$teacherId];
        if($studentId){if(!teacher_owns_student($teacherId,$studentId))Http::json(['error'=>'الطالبة غير صالحة.'],404);$where[]='m.student_id=?';$params[]=$studentId;}
        if($parentId){$where[]='m.parent_id=?';$params[]=$parentId;}
        $rows=fetch_all("SELECT m.*,p.name AS parent_name,s.name AS student_name FROM parent_private_messages m JOIN platform_users p ON p.id=m.parent_id JOIN students s ON s.id=m.student_id WHERE ".implode(' AND ',$where).' ORDER BY m.created_at DESC LIMIT 200',$params);
        execute_sql("UPDATE parent_private_messages SET teacher_seen_at=COALESCE(teacher_seen_at,NOW()) WHERE teacher_id=? AND sender_role='parent'",[$teacherId]);
        Http::json(['items'=>$rows]);
    }
    if (!$segments&&$method==='POST') {
        $d=Http::input();Http::requireFields($d,['parentId','studentId','subject','body']);$parentId=(int)$d['parentId'];$studentId=(int)$d['studentId'];
        if(!teacher_owns_student($teacherId,$studentId))Http::json(['error'=>'الطالبة غير موجودة ضمن فصولك.'],404);
        $link=fetch_one("SELECT 1 AS ok FROM parent_student_links l JOIN students s ON s.id=l.student_id JOIN classes c ON c.id=s.class_id WHERE l.parent_id=? AND l.student_id=? AND l.status='active' AND c.teacher_id=?",[$parentId,$studentId,$teacherId]);
        if(!$link)Http::json(['error'=>'ولي الأمر غير مرتبط بهذه الطالبة.'],422);
        execute_sql("INSERT INTO parent_private_messages(teacher_id,parent_id,student_id,sender_role,sender_id,subject,body,teacher_seen_at) VALUES(?,?,?,'teacher',?,?,?,NOW())",[$teacherId,$parentId,$studentId,$teacherId,trim((string)$d['subject']),trim((string)$d['body'])]);
        Http::json(['id'=>(int)Database::connection()->lastInsertId()],201);
    }
    Http::json(['error'=>'الطريقة غير مسموحة.'],405);
}

function teacher_smart_alerts(int $teacherId): never
{
    teacher_generate_smart_notifications($teacherId);
    $rows=fetch_all("SELECT id,title,body AS message,severity,route,is_read,created_at FROM notifications WHERE teacher_id=? ORDER BY is_read,created_at DESC LIMIT 100",[$teacherId]);
    Http::json(['items'=>$rows,'unread'=>count(array_filter($rows,static fn($r)=>!(bool)$r['is_read']))]);
}

function teacher_generate_smart_notifications(int $teacherId): void
{
    ensure_platform_enhancement_schema();
    $today=date('Y-m-d');
    $rules=[];
    $rules[]=fetch_all("SELECT s.id,s.name,c.name AS class_name,s.progress_percent FROM students s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND s.deleted_at IS NULL AND s.progress_percent<50 ORDER BY s.progress_percent ASC LIMIT 20",[$teacherId]);
    foreach($rules[0] as $row) teacher_upsert_notification($teacherId,'student-risk-'.$row['id'],'طالبة تحتاج دعمًا',$row['name'].' في '.$row['class_name'].'، مستوى التقدم '.$row['progress_percent'].'٪.','warning','student:'.$row['id']);
    $lateAssignments=fetch_all("SELECT s.id,s.name,COUNT(*) AS n FROM assignments a JOIN students s ON s.id=a.student_id JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND a.status<>'completed' AND a.due_date<CURDATE() GROUP BY s.id,s.name LIMIT 20",[$teacherId]);
    foreach($lateAssignments as $row) teacher_upsert_notification($teacherId,'late-assignments-'.$row['id'].'-'.$today,'واجبات متأخرة',$row['name'].' لديها '.$row['n'].' واجبات متأخرة.','danger','student:'.$row['id']);
    $upcoming=fetch_all("SELECT id,title,start_at FROM tests WHERE teacher_id=? AND status='published' AND start_at BETWEEN NOW() AND DATE_ADD(NOW(),INTERVAL 3 DAY)",[$teacherId]);
    foreach($upcoming as $row) teacher_upsert_notification($teacherId,'upcoming-test-'.$row['id'],'اختبار قريب',$row['title'].' يبدأ في '.$row['start_at'].'.','info','tests-panel');
    $missingTests=fetch_all("SELECT t.id,t.title,s.id AS student_id,s.name FROM tests t JOIN students s ON s.class_id=t.class_id LEFT JOIN test_attempts a ON a.test_id=t.id AND a.student_id=s.id WHERE t.teacher_id=? AND t.status='published' AND t.start_at<=NOW() AND (t.end_at IS NULL OR t.end_at>=DATE_SUB(NOW(),INTERVAL 2 DAY)) AND a.id IS NULL AND s.deleted_at IS NULL ORDER BY t.start_at DESC LIMIT 30",[$teacherId]);
    foreach($missingTests as $row) teacher_upsert_notification($teacherId,'missing-test-'.$row['id'].'-'.$row['student_id'],'اختبار لم تبدأه الطالبة',$row['name'].' لم تبدأ اختبار «'.$row['title'].'».','warning','student:'.$row['student_id']);
    $attendanceRisks=fetch_all("SELECT s.id,s.name,COUNT(*) AS n FROM attendance a JOIN students s ON s.id=a.student_id JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND a.status IN('absent','late') AND a.attendance_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY) GROUP BY s.id,s.name HAVING n>=3 ORDER BY n DESC LIMIT 20",[$teacherId]);
    foreach($attendanceRisks as $row) teacher_upsert_notification($teacherId,'attendance-risk-'.$row['id'].'-'.$today,'تنبيه حضور',$row['name'].' لديها '.$row['n'].' حالات غياب أو تأخر خلال ٣٠ يومًا.','warning','student:'.$row['id']);
    $weakSkillStudents=fetch_all("SELECT s.id,s.name,COUNT(*) AS n FROM student_skills ss JOIN students s ON s.id=ss.student_id JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND ss.mastery_percent<60 GROUP BY s.id,s.name HAVING n>=1 ORDER BY n DESC LIMIT 20",[$teacherId]);
    foreach($weakSkillStudents as $row) teacher_upsert_notification($teacherId,'weak-skills-'.$row['id'].'-'.$today,'مهارات تحتاج علاجًا',$row['name'].' لديها '.$row['n'].' مهارات أقل من ٦٠٪.','danger','student:'.$row['id']);
    $pendingParents=(int)(fetch_one("SELECT COUNT(*) AS n FROM parent_registration_requests WHERE teacher_id=? AND status='pending'",[$teacherId])['n']??0);
    if($pendingParents)teacher_upsert_notification($teacherId,'pending-parents-'.$today,'طلبات أولياء أمور','لديك '.$pendingParents.' طلبات حساب ولي أمر بانتظار المراجعة.','info','parent-panel');
    $unreadMessages=(int)(fetch_one("SELECT COUNT(*) AS n FROM parent_private_messages WHERE teacher_id=? AND sender_role='parent' AND teacher_seen_at IS NULL",[$teacherId])['n']??0);
    if($unreadMessages)teacher_upsert_notification($teacherId,'parent-messages-'.$today,'رسائل جديدة من أولياء الأمور','لديك '.$unreadMessages.' رسائل غير مقروءة.','info','parent-panel');
}

function teacher_upsert_notification(int $teacherId,string $key,string $title,string $body,string $severity,string $route): void
{
    try {execute_sql("INSERT INTO notifications(teacher_id,title,body,severity,route,dedupe_key) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),body=VALUES(body),severity=VALUES(severity),route=VALUES(route),created_at=NOW()",[$teacherId,$title,$body,$severity,$route,$key]);}
    catch(Throwable $error){error_log('[smart-notification] '.$error->getMessage());}
}

function teacher_smart_reports(int $teacherId): never
{
    $classComparison=fetch_all("SELECT c.id,c.name,c.stage,c.grade_label,COUNT(DISTINCT s.id) AS students,ROUND(COALESCE(AVG(a.percentage),0),1) AS test_average,ROUND(COALESCE(AVG(s.progress_percent),0),1) AS progress_average FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.deleted_at IS NULL LEFT JOIN test_attempts a ON a.student_id=s.id AND a.status IN('submitted','graded') WHERE c.teacher_id=? GROUP BY c.id,c.name,c.stage,c.grade_label ORDER BY test_average DESC",[$teacherId]);
    $weakSkills=fetch_all("SELECT sk.id,sk.name,ROUND(AVG(ss.mastery_percent),1) AS mastery,COUNT(*) AS students FROM student_skills ss JOIN skills sk ON sk.id=ss.skill_id JOIN students s ON s.id=ss.student_id JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? GROUP BY sk.id,sk.name HAVING AVG(ss.mastery_percent)<70 ORDER BY mastery ASC LIMIT 20",[$teacherId]);
    $atRisk=fetch_all("SELECT s.id,s.name,c.name AS class_name,s.progress_percent,ROUND(COALESCE(AVG(a.percentage),0),1) AS test_average,(SELECT COUNT(*) FROM attendance at WHERE at.student_id=s.id AND at.status IN('absent','late') AND at.attendance_date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY)) AS attendance_flags FROM students s JOIN classes c ON c.id=s.class_id LEFT JOIN test_attempts a ON a.student_id=s.id AND a.status IN('submitted','graded') WHERE c.teacher_id=? AND s.deleted_at IS NULL GROUP BY s.id,s.name,c.name,s.progress_percent HAVING s.progress_percent<60 OR test_average<60 OR attendance_flags>=3 ORDER BY LEAST(s.progress_percent,test_average) ASC LIMIT 30",[$teacherId]);
    $incomplete=fetch_all("SELECT t.id,t.title,c.name AS class_name,COUNT(s.id) AS class_students,COUNT(a.id) AS attempts,GREATEST(COUNT(s.id)-COUNT(a.id),0) AS missing FROM tests t LEFT JOIN classes c ON c.id=t.class_id LEFT JOIN students s ON s.class_id=c.id AND s.deleted_at IS NULL LEFT JOIN test_attempts a ON a.test_id=t.id AND a.student_id=s.id AND a.status IN('submitted','graded') WHERE t.teacher_id=? AND t.status='published' GROUP BY t.id,t.title,c.name HAVING missing>0 ORDER BY missing DESC LIMIT 20",[$teacherId]);
    $problemQuestions=fetch_all("SELECT aq.skill_name,LEFT(aq.question_text,180) AS question_text,COUNT(ans.id) AS responses,SUM(CASE WHEN ans.is_correct=1 THEN 1 ELSE 0 END) AS correct,ROUND(100*SUM(CASE WHEN ans.is_correct=1 THEN 1 ELSE 0 END)/NULLIF(COUNT(ans.id),0),1) AS mastery FROM answers ans JOIN test_attempt_questions aq ON aq.id=ans.attempt_question_id JOIN test_attempts ta ON ta.id=ans.attempt_id JOIN tests t ON t.id=ta.test_id WHERE t.teacher_id=? AND ans.is_correct IS NOT NULL GROUP BY aq.skill_name,aq.question_text HAVING responses>=2 AND mastery<60 ORDER BY mastery ASC,responses DESC LIMIT 20",[$teacherId]);
    $improvement=fetch_all("SELECT s.id,s.name,c.name AS class_name,ROUND(AVG(CASE WHEN t.test_type='pre_diagnostic' THEN a.percentage END),1) AS pre_avg,ROUND(AVG(CASE WHEN t.test_type='post_diagnostic' THEN a.percentage END),1) AS post_avg,ROUND(AVG(CASE WHEN t.test_type='post_diagnostic' THEN a.percentage END)-AVG(CASE WHEN t.test_type='pre_diagnostic' THEN a.percentage END),1) AS improvement FROM students s JOIN classes c ON c.id=s.class_id JOIN test_attempts a ON a.student_id=s.id AND a.status IN('submitted','graded') JOIN tests t ON t.id=a.test_id WHERE c.teacher_id=? GROUP BY s.id,s.name,c.name HAVING pre_avg IS NOT NULL AND post_avg IS NOT NULL ORDER BY improvement DESC LIMIT 30",[$teacherId]);
    Http::json(compact('classComparison','weakSkills','atRisk','incomplete','problemQuestions','improvement'));
}

function teacher_password_request_routes(string $method,array $segments,int $teacherId): never
{
    if(!$segments&&$method==='GET'){
        $rows=fetch_all("SELECT r.* FROM password_reset_requests r WHERE r.status='pending' AND ((r.requested_role='STUDENT' AND EXISTS(SELECT 1 FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=r.subject_id AND c.teacher_id=?)) OR (r.requested_role='PARENT' AND EXISTS(SELECT 1 FROM parent_student_links l JOIN students s ON s.id=l.student_id JOIN classes c ON c.id=s.class_id WHERE l.parent_id=r.subject_id AND c.teacher_id=?))) ORDER BY r.created_at",[$teacherId,$teacherId]);
        Http::json(['items'=>$rows]);
    }
    $id=route_id($segments,0);$request=fetch_one('SELECT * FROM password_reset_requests WHERE id=? AND status=\'pending\'',[$id]);
    if(!$request)Http::json(['error'=>'الطلب غير موجود أو تمت معالجته.'],404);
    $allowed=false;
    if($request['requested_role']==='STUDENT'&&$request['subject_id'])$allowed=teacher_owns_student($teacherId,(int)$request['subject_id']);
    if($request['requested_role']==='PARENT'&&$request['subject_id'])$allowed=(bool)fetch_one("SELECT 1 AS ok FROM parent_student_links l JOIN students s ON s.id=l.student_id JOIN classes c ON c.id=s.class_id WHERE l.parent_id=? AND c.teacher_id=? LIMIT 1",[$request['subject_id'],$teacherId]);
    if(!$allowed)Http::json(['error'=>'ليس لديك صلاحية معالجة هذا الطلب.'],403);
    if($method==='PUT'){
        $d=Http::input();$status=(string)($d['status']??'resolved');if(!in_array($status,['resolved','rejected'],true))Http::json(['error'=>'الحالة غير صالحة.'],422);
        if($status==='resolved'){
            Http::requireFields($d,['newPassword']);Auth::validatePassword((string)$d['newPassword']);$hash=password_hash((string)$d['newPassword'],PASSWORD_DEFAULT);
            if($request['requested_role']==='STUDENT')execute_sql('UPDATE students SET password_hash=?,must_change_password=1 WHERE id=?',[$hash,$request['subject_id']]);
            elseif($request['requested_role']==='PARENT')execute_sql('UPDATE platform_users SET password_hash=? WHERE id=? AND role_code=\'PARENT\'',[$hash,$request['subject_id']]);
        }
        execute_sql('UPDATE password_reset_requests SET status=?,handled_by_role=\'TEACHER\',handled_by_id=?,resolution_note=?,handled_at=NOW() WHERE id=?',[$status,$teacherId,trim((string)($d['note']??'')),$id]);
        Http::json(['ok'=>true]);
    }
    Http::json(['error'=>'الطريقة غير مسموحة.'],405);
}

function public_password_reset_request(string $role): never
{
    ensure_platform_enhancement_schema();
    $role=strtoupper($role);
    if(!in_array($role,['STUDENT','PARENT','TEACHER','ADMIN'],true))Http::json(['error'=>'نوع الحساب غير صالح.'],422);
    $d=Http::input();$first=trim((string)($d['firstName']??''));$last=trim((string)($d['lastName']??''));$identifier=trim((string)($d['identifier']??''));$studentRef=trim((string)($d['studentReference']??''));
    $subjectType=null;$subjectId=null;
    if(in_array($role,['STUDENT','TEACHER'],true)&&$identifier!==''){
        $email=$role==='STUDENT'||$role==='TEACHER'?Http::schoolEmailOrNull($identifier):null;
        if($email){$table=$role==='STUDENT'?'students':'teachers';$row=fetch_one("SELECT id FROM {$table} WHERE email=? AND deleted_at IS NULL LIMIT 1",[$email]);if($row){$subjectType=$role==='STUDENT'?'student':'teacher';$subjectId=(int)$row['id'];}}
    }
    if(in_array($role,['PARENT','ADMIN'],true)&&$first!==''&&$last!==''){
        $code=$role==='PARENT'?'PARENT':'ADMIN';$rows=fetch_all("SELECT id,name FROM platform_users WHERE role_code=? AND deleted_at IS NULL",[$code]);$matches=[];foreach($rows as $row){$name=login_name_key((string)$row['name']);if(str_starts_with($name,login_name_key($first).' ')&&str_ends_with($name,' '.login_name_key($last)))$matches[]=$row;}if(count($matches)===1){$subjectType='platform';$subjectId=(int)$matches[0]['id'];}
    }
    if($subjectId){$existing=fetch_one("SELECT id FROM password_reset_requests WHERE requested_role=? AND subject_type=? AND subject_id=? AND status='pending' LIMIT 1",[$role,$subjectType,$subjectId]);if($existing)Http::json(['ok'=>true,'message'=>'طلبك مسجل مسبقًا وبانتظار المراجعة.']);}
    execute_sql('INSERT INTO password_reset_requests(requested_role,subject_type,subject_id,first_name,last_name,identifier_hint,student_reference,request_note) VALUES(?,?,?,?,?,?,?,?)',[$role,$subjectType,$subjectId,$first?:null,$last?:null,$identifier?:null,$studentRef?:null,trim((string)($d['note']??''))?:null]);
    Http::json(['ok'=>true,'message'=>'تم إرسال طلب إعادة تعيين كلمة المرور إلى الجهة المسؤولة دون كشف وجود الحساب.'],201);
}


function student_enhancement_routes(string $method,array $segments,int $studentId): never
{
    ensure_platform_enhancement_schema();
    $resource=$segments[0]??'';
    $student=fetch_one('SELECT s.id,s.class_id,c.teacher_id FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?',[$studentId]);
    if(!$student) Http::json(['error'=>'حساب الطالبة غير موجود.'],404);
    $classId=(int)($student['class_id']??0);$teacherId=(int)($student['teacher_id']??0);
    if($resource==='calendar'&&$method==='GET'){
        $events=fetch_all("SELECT e.id,e.title,e.description,e.event_type,e.starts_at,e.ends_at,e.audience,c.name AS class_name FROM calendar_events e LEFT JOIN classes c ON c.id=e.class_id WHERE e.status='active' AND e.teacher_id=? AND (e.student_id=? OR (e.class_id=? AND e.audience IN('class','class_and_parents'))) AND e.starts_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) ORDER BY e.starts_at LIMIT 150",[$teacherId,$studentId,$classId]);
        $tests=fetch_all("SELECT t.id,t.title,'test' AS event_type,t.start_at AS starts_at,t.end_at AS ends_at,'اختبار منشور' AS description,c.name AS class_name FROM tests t LEFT JOIN classes c ON c.id=t.class_id WHERE t.teacher_id=? AND t.class_id=? AND t.status='published' AND COALESCE(t.end_at,DATE_ADD(NOW(),INTERVAL 180 DAY))>=NOW() ORDER BY COALESCE(t.start_at,t.created_at) LIMIT 80",[$teacherId,$classId]);
        Http::json(['items'=>array_merge($events,$tests)]);
    }
    if($resource==='remedial'&&$method==='GET'){
        $plans=fetch_all("SELECT r.*,sk.name AS skill_name,t.title AS source_test_title,rt.title AS reassessment_title FROM remedial_plans r LEFT JOIN skills sk ON sk.id=r.skill_id LEFT JOIN tests t ON t.id=r.source_test_id LEFT JOIN tests rt ON rt.id=r.reassessment_test_id WHERE r.student_id=? AND r.teacher_id=? AND r.status<>'cancelled' ORDER BY FIELD(r.status,'in_progress','planned','reassessed','completed'),r.due_date,r.created_at DESC",[$studentId,$teacherId]);
        $resources=fetch_all("SELECT lr.id,lr.title,lr.resource_type,lr.resource_url,lr.description,sk.name AS skill_name FROM learning_resource_links lr LEFT JOIN skills sk ON sk.id=lr.skill_id WHERE lr.is_active=1 AND (lr.teacher_id IS NULL OR lr.teacher_id=?) AND (lr.skill_id IS NULL OR EXISTS(SELECT 1 FROM remedial_plans rp WHERE rp.student_id=? AND rp.skill_id=lr.skill_id AND rp.status IN('planned','in_progress','reassessed'))) ORDER BY lr.teacher_id IS NULL DESC,lr.created_at DESC",[$teacherId,$studentId]);
        $games=fetch_all('SELECT id,game_key,difficulty,score,question_count,correct_count,best_streak,accuracy,duration_seconds,played_at FROM game_attempts WHERE student_id=? ORDER BY played_at DESC LIMIT 20',[$studentId]);
        Http::json(compact('plans','resources','games'));
    }
    if($resource==='alerts'&&$method==='GET'){
        $alerts=[];
        $tests=fetch_all("SELECT id,title,start_at,end_at FROM tests WHERE class_id=? AND status='published' AND (end_at IS NULL OR end_at>=NOW()) ORDER BY COALESCE(start_at,created_at) LIMIT 8",[$classId]);
        foreach($tests as $row)$alerts[]=['type'=>'test','title'=>'اختبار متاح','body'=>$row['title'],'date'=>$row['start_at']?:$row['end_at'],'route'=>'tests'];
        $plans=fetch_all("SELECT r.id,r.title,r.due_date,sk.name AS skill_name FROM remedial_plans r LEFT JOIN skills sk ON sk.id=r.skill_id WHERE r.student_id=? AND r.status IN('planned','in_progress') ORDER BY r.due_date LIMIT 8",[$studentId]);
        foreach($plans as $row)$alerts[]=['type'=>'remedial','title'=>'خطة علاجية','body'=>$row['skill_name']?:$row['title'],'date'=>$row['due_date'],'route'=>'remedial'];
        Http::json(['items'=>$alerts]);
    }
    Http::json(['error'=>'المسار غير موجود.'],404);
}

function parent_enhancement_routes(string $method,array $segments,int $parentId): never
{
    ensure_platform_enhancement_schema();$resource=$segments[0]??'';
    if($resource==='calendar'&&$method==='GET'){
        $rows=fetch_all("SELECT DISTINCT e.id,e.title,e.description,e.event_type,e.starts_at,e.ends_at,c.name AS class_name,s.name AS student_name FROM calendar_events e JOIN parent_student_links l ON l.parent_id=? AND l.status='active' JOIN students child ON child.id=l.student_id LEFT JOIN classes c ON c.id=e.class_id LEFT JOIN students s ON s.id=e.student_id WHERE e.status='active' AND ((e.student_id=child.id) OR (e.class_id=child.class_id AND e.audience IN('class','parents','class_and_parents'))) AND e.starts_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) ORDER BY e.starts_at LIMIT 200",[$parentId]);Http::json(['items'=>$rows]);
    }
    if($resource==='remedial'&&$method==='GET'){
        $studentId=(int)($_GET['studentId']??0);
        $link=fetch_one("SELECT c.teacher_id FROM parent_student_links l JOIN students s ON s.id=l.student_id JOIN classes c ON c.id=s.class_id WHERE l.parent_id=? AND l.student_id=? AND l.status='active'",[$parentId,$studentId]);if(!$link)Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],403);
        $plans=fetch_all("SELECT r.*,sk.name AS skill_name,t.title AS source_test_title,rt.title AS reassessment_title FROM remedial_plans r LEFT JOIN skills sk ON sk.id=r.skill_id LEFT JOIN tests t ON t.id=r.source_test_id LEFT JOIN tests rt ON rt.id=r.reassessment_test_id WHERE r.student_id=? AND r.teacher_id=? AND r.status<>'cancelled' ORDER BY r.created_at DESC",[$studentId,$link['teacher_id']]);
        $games=fetch_all('SELECT game_key,difficulty,score,accuracy,played_at FROM game_attempts WHERE student_id=? ORDER BY played_at DESC LIMIT 15',[$studentId]);
        Http::json(compact('plans','games'));
    }
    if($resource==='messages'&&$method==='GET'){
        $rows=fetch_all("SELECT m.*,t.name AS teacher_name,s.name AS student_name FROM parent_private_messages m JOIN teachers t ON t.id=m.teacher_id JOIN students s ON s.id=m.student_id WHERE m.parent_id=? ORDER BY m.created_at DESC LIMIT 200",[$parentId]);execute_sql("UPDATE parent_private_messages SET parent_seen_at=COALESCE(parent_seen_at,NOW()) WHERE parent_id=? AND sender_role='teacher'",[$parentId]);Http::json(['items'=>$rows]);
    }
    if($resource==='messages'&&$method==='POST'){
        $d=Http::input();Http::requireFields($d,['studentId','subject','body']);$studentId=(int)$d['studentId'];
        $link=fetch_one("SELECT c.teacher_id FROM parent_student_links l JOIN students s ON s.id=l.student_id JOIN classes c ON c.id=s.class_id WHERE l.parent_id=? AND l.student_id=? AND l.status='active'",[$parentId,$studentId]);if(!$link)Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],403);
        $teacherId=(int)$link['teacher_id'];execute_sql("INSERT INTO parent_private_messages(teacher_id,parent_id,student_id,sender_role,sender_id,subject,body,parent_seen_at) VALUES(?,?,?,'parent',?,?,?,NOW())",[$teacherId,$parentId,$studentId,$parentId,trim((string)$d['subject']),trim((string)$d['body'])]);Http::json(['id'=>(int)Database::connection()->lastInsertId()],201);
    }
    Http::json(['error'=>'المسار غير موجود.'],404);
}

function admin_enhancement_routes(string $method,array $segments,int $adminId): never
{
    ensure_platform_enhancement_schema();$resource=$segments[0]??'';
    if(($resource==='overview'||$resource==='reports')&&$method==='GET'){
        $summary=[
            'teachers'=>(int)(fetch_one("SELECT COUNT(*) AS n FROM teachers WHERE deleted_at IS NULL")['n']??0),
            'students'=>(int)(fetch_one("SELECT COUNT(*) AS n FROM students WHERE deleted_at IS NULL")['n']??0),
            'parents'=>(int)(fetch_one("SELECT COUNT(*) AS n FROM platform_users WHERE role_code='PARENT' AND deleted_at IS NULL")['n']??0),
            'publishedTests'=>(int)(fetch_one("SELECT COUNT(*) AS n FROM tests WHERE status='published'")['n']??0),
            'pendingTeachers'=>(int)(fetch_one("SELECT COUNT(*) AS n FROM teachers WHERE status='pending' AND deleted_at IS NULL")['n']??0),
            'pendingParents'=>(int)(fetch_one("SELECT COUNT(*) AS n FROM parent_registration_requests WHERE status='pending'")['n']??0),
        ];
        $atRisk=fetch_all("SELECT s.id,s.name,c.name AS class_name,t.name AS teacher_name,s.progress_percent FROM students s JOIN classes c ON c.id=s.class_id JOIN teachers t ON t.id=c.teacher_id WHERE s.deleted_at IS NULL AND s.progress_percent<50 ORDER BY s.progress_percent LIMIT 30");
        $classes=fetch_all("SELECT c.id,c.name,t.name AS teacher_name,COUNT(s.id) AS students,ROUND(COALESCE(AVG(s.progress_percent),0),1) AS progress FROM classes c JOIN teachers t ON t.id=c.teacher_id LEFT JOIN students s ON s.class_id=c.id AND s.deleted_at IS NULL GROUP BY c.id,c.name,t.name ORDER BY progress DESC");
        $recentTests=fetch_all("SELECT tests.id,tests.title,tests.status,tests.created_at,teachers.name AS teacher_name,classes.name AS class_name FROM tests JOIN teachers ON teachers.id=tests.teacher_id LEFT JOIN classes ON classes.id=tests.class_id ORDER BY tests.created_at DESC LIMIT 20");
        $activity=fetch_all("SELECT actor_role,action,details,created_at FROM activity_log ORDER BY created_at DESC LIMIT 30");
        Http::json(compact('summary','atRisk','classes','recentTests','activity'));
    }
    Http::json(['error'=>'المسار غير موجود.'],404);
}

function owner_system_routes(string $method,array $segments,array $owner): never
{
    ensure_platform_enhancement_schema();$resource=$segments[0]??'';
    if(($resource===''||$resource==='status')&&$method==='GET'){
        $pdo=Database::connection();$config=Database::activeConfig();
        $tables=(int)($pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")?->fetchColumn()?:0);
        $dbSize=(int)($pdo->query("SELECT COALESCE(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema=DATABASE()")?->fetchColumn()?:0);
        $missing=[];foreach(['owners','teachers','students','classes','tests','test_attempts','rbac_roles','parent_student_links','remedial_plans','calendar_events','game_attempts','parent_private_messages','password_reset_requests','privacy_consents','system_backup_history'] as $table){if(!fetch_one('SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?',[$table]))$missing[]=$table;}
        $uploadDirs=['attached_assets','backups'];$dirs=[];foreach($uploadDirs as $dir){$path=MADAR_ROOT.'/'.$dir;$dirs[]=['name'=>$dir,'exists'=>is_dir($path),'writable'=>is_dir($path)&&is_writable($path),'size'=>platform_directory_size($path)];}
        $lastBackup=fetch_one("SELECT id,file_name,size_bytes,sha256,status,created_at,verified_at FROM system_backup_history WHERE status<>'deleted' ORDER BY created_at DESC LIMIT 1");
        $errors=fetch_all("SELECT id,severity,source,message,created_at FROM system_error_log WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 20");
        Http::json(['database'=>['connected'=>true,'host'=>$config['host']??'','port'=>$config['port']??'','name'=>$config['name']??'','serverVersion'=>$pdo->getAttribute(PDO::ATTR_SERVER_VERSION),'tables'=>$tables,'sizeBytes'=>$dbSize,'missingTables'=>$missing],'runtime'=>['phpVersion'=>PHP_VERSION,'sapi'=>PHP_SAPI,'timezone'=>date_default_timezone_get(),'memoryLimit'=>ini_get('memory_limit'),'uploadMax'=>ini_get('upload_max_filesize'),'postMax'=>ini_get('post_max_size'),'diskFree'=>@disk_free_space(MADAR_ROOT),'diskTotal'=>@disk_total_space(MADAR_ROOT)],'directories'=>$dirs,'lastBackup'=>$lastBackup,'errors'=>$errors,'app'=>['version'=>'11.0','environment'=>env_value('APP_ENV','production')]]);
    }
    if($resource==='backups'&&$method==='GET'){Http::json(['items'=>fetch_all("SELECT * FROM system_backup_history ORDER BY created_at DESC LIMIT 100")]);}
    if($resource==='backups'&&($segments[1]??'')==='create'&&$method==='POST'){
        try{$result=platform_create_database_backup('manual','owner',(int)$owner['id']);Http::json($result,201);}catch(Throwable $error){Http::json(['error'=>$error->getMessage()],500);}
    }
    if($resource==='backups'&&isset($segments[1])&&ctype_digit((string)$segments[1])&&($segments[2]??'')==='download'&&$method==='GET'){
        $row=fetch_one("SELECT * FROM system_backup_history WHERE id=? AND status<>'deleted'",[(int)$segments[1]]);if(!$row)Http::json(['error'=>'النسخة غير موجودة.'],404);platform_stream_backup($row);
    }
    if($resource==='backups'&&isset($segments[1])&&ctype_digit((string)$segments[1])&&$method==='DELETE'){
        $row=fetch_one('SELECT * FROM system_backup_history WHERE id=?',[(int)$segments[1]]);if(!$row)Http::json(['error'=>'النسخة غير موجودة.'],404);$path=(string)$row['file_path'];if(is_file($path))@unlink($path);execute_sql("UPDATE system_backup_history SET status='deleted',details='حُذفت النسخة بواسطة المالكة' WHERE id=?",[(int)$segments[1]]);Activity::log('owner',(int)$owner['id'],'حذف نسخة احتياطية',(string)$row['file_name']);Http::json(['ok'=>true]);
    }
    if($resource==='password-requests'&&$method==='GET'){
        Http::json(['items'=>fetch_all("SELECT * FROM password_reset_requests WHERE status='pending' AND requested_role IN('TEACHER','ADMIN') ORDER BY created_at")]);
    }
    if($resource==='password-requests'&&isset($segments[1])&&ctype_digit((string)$segments[1])&&$method==='PUT'){
        $id=(int)$segments[1];$request=fetch_one("SELECT * FROM password_reset_requests WHERE id=? AND status='pending'",[$id]);if(!$request)Http::json(['error'=>'الطلب غير موجود أو تمت معالجته.'],404);$d=Http::input();$status=(string)($d['status']??'resolved');if(!in_array($status,['resolved','rejected'],true))Http::json(['error'=>'الحالة غير صالحة.'],422);
        if($status==='resolved'){Http::requireFields($d,['newPassword']);Auth::validatePassword((string)$d['newPassword']);$hash=password_hash((string)$d['newPassword'],PASSWORD_DEFAULT);if($request['requested_role']==='TEACHER')execute_sql('UPDATE teachers SET password_hash=? WHERE id=?',[$hash,$request['subject_id']]);elseif($request['requested_role']==='ADMIN')execute_sql("UPDATE platform_users SET password_hash=? WHERE id=? AND role_code='ADMIN'",[$hash,$request['subject_id']]);}
        execute_sql("UPDATE password_reset_requests SET status=?,handled_by_role='OWNER',handled_by_id=?,resolution_note=?,handled_at=NOW() WHERE id=?",[$status,(int)$owner['id'],trim((string)($d['note']??'')),$id]);Activity::log('owner',(int)$owner['id'],'معالجة طلب كلمة مرور','الطلب رقم '.$id);Http::json(['ok'=>true]);
    }
    if($resource==='backups'&&($segments[1]??'')==='verify'&&$method==='POST'){
        $d=Http::input();$id=(int)($d['id']??0);$row=fetch_one('SELECT * FROM system_backup_history WHERE id=?',[$id]);if(!$row)Http::json(['error'=>'النسخة غير موجودة.'],404);$path=(string)$row['file_path'];$ok=is_file($path)&&filesize($path)===(int)$row['size_bytes']&&(!$row['sha256']||hash_file('sha256',$path)===$row['sha256']);execute_sql("UPDATE system_backup_history SET status=?,verified_at=IF(?,NOW(),verified_at),details=? WHERE id=?",[$ok?'verified':'failed',$ok?1:0,$ok?'تم التحقق من الحجم والبصمة.':'فشل التحقق من الملف.',$id]);Http::json(['ok'=>$ok]);
    }
    Http::json(['error'=>'المسار غير موجود.'],404);
}


function platform_backup_directory(): string
{
    $dir=MADAR_ROOT.'/backups';
    if(!is_dir($dir) && !@mkdir($dir,0700,true) && !is_dir($dir)) throw new RuntimeException('تعذر إنشاء مجلد النسخ الاحتياطية.');
    if(!is_writable($dir)) throw new RuntimeException('مجلد النسخ الاحتياطية غير قابل للكتابة.');
    return $dir;
}

function platform_sql_literal(PDO $pdo,mixed $value): string
{
    if($value===null) return 'NULL';
    if(is_bool($value)) return $value?'1':'0';
    return $pdo->quote((string)$value);
}

function platform_create_database_backup(string $backupType,string $actorRole,?int $actorId): array
{
    ensure_platform_enhancement_schema();
    if(!in_array($backupType,['manual','daily','academic_year'],true))$backupType='manual';
    $pdo=Database::connection();$dir=platform_backup_directory();
    $stamp=date('Ymd_His');$fileName="madar_database_{$backupType}_{$stamp}.sql";$path=$dir.'/'.$fileName;
    $handle=@fopen($path,'wb');if(!$handle)throw new RuntimeException('تعذر إنشاء ملف النسخة الاحتياطية.');
    $write=static function(string $text)use($handle):void{if(fwrite($handle,$text)===false)throw new RuntimeException('تعذر كتابة النسخة الاحتياطية.');};
    try{
        $write("-- منصة مدار | نسخة قاعدة البيانات\n-- التاريخ: ".date('c')."\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n");
        $tables=$pdo->query('SHOW FULL TABLES WHERE Table_type = \'BASE TABLE\'')->fetchAll(PDO::FETCH_NUM);
        foreach($tables as $tableRow){
            $table=(string)$tableRow[0];$quoted='`'.str_replace('`','``',$table).'`';
            $create=$pdo->query("SHOW CREATE TABLE {$quoted}")->fetch(PDO::FETCH_NUM);
            $write("DROP TABLE IF EXISTS {$quoted};\n".(string)($create[1]??'').";\n");
            $offset=0;$batch=300;
            while(true){
                $rows=$pdo->query("SELECT * FROM {$quoted} LIMIT {$batch} OFFSET {$offset}")->fetchAll(PDO::FETCH_ASSOC);
                if(!$rows)break;
                $columns=array_keys($rows[0]);$colSql=implode(',',array_map(static fn($c)=>'`'.str_replace('`','``',$c).'`',$columns));
                foreach(array_chunk($rows,80) as $chunk){
                    $values=[];foreach($chunk as $row)$values[]='('.implode(',',array_map(static fn($c)=>platform_sql_literal($pdo,$row[$c]??null),$columns)).')';
                    $write("INSERT INTO {$quoted} ({$colSql}) VALUES\n".implode(",\n",$values).";\n");
                }
                $offset+=count($rows);if(count($rows)<$batch)break;
            }
            $write("\n");
        }
        $write("SET FOREIGN_KEY_CHECKS=1;\n");
        fclose($handle);$handle=null;
        $size=(int)filesize($path);$sha=hash_file('sha256',$path);
        execute_sql('INSERT INTO system_backup_history(backup_type,file_name,file_path,size_bytes,sha256,status,created_by_role,created_by_id,details) VALUES(?,?,?,?,?,\'created\',?,?,?)',[$backupType,$fileName,$path,$size,$sha,$actorRole,$actorId,'نسخة SQL كاملة لقاعدة البيانات']);
        $id=(int)$pdo->lastInsertId();
        Activity::log($actorRole,$actorId,'إنشاء نسخة احتياطية',$fileName);
        return ['id'=>$id,'fileName'=>$fileName,'path'=>$path,'sizeBytes'=>$size,'sha256'=>$sha,'status'=>'created'];
    }catch(Throwable $error){
        if(is_resource($handle))fclose($handle);@unlink($path);
        try{execute_sql('INSERT INTO system_error_log(severity,source,message,context_json) VALUES(\'error\',\'backup\',?,?)',[mb_substr($error->getMessage(),0,2000),json_encode(['type'=>$backupType],JSON_UNESCAPED_UNICODE)]);}catch(Throwable){}
        throw $error;
    }
}

function platform_stream_backup(array $row): never
{
    $path=(string)($row['file_path']??'');$real=$path!==''?realpath($path):false;$base=realpath(platform_backup_directory());
    if(!$real||!$base||!str_starts_with($real,$base.DIRECTORY_SEPARATOR)||!is_file($real))Http::json(['error'=>'ملف النسخة غير موجود.'],404);
    header('Content-Type: application/sql; charset=utf-8');
    header('Content-Disposition: attachment; filename="'.rawurlencode((string)$row['file_name']).'"');
    header('Content-Length: '.filesize($real));
    header('X-Content-Type-Options: nosniff');
    readfile($real);exit;
}

function platform_directory_size(string $path): int
{
    if(!is_dir($path))return 0;$size=0;$iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path,FilesystemIterator::SKIP_DOTS));foreach($iterator as $file){if($file->isFile())$size+=$file->getSize();}return $size;
}
