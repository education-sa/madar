<?php
declare(strict_types=1);

require_once __DIR__ . '/teacher_students.php';
require_once __DIR__ . '/teacher_followup.php';
require_once __DIR__ . '/teacher_weekly_followup.php';
require_once __DIR__ . '/teacher_tests.php';
require_once __DIR__ . '/teacher_analysis.php';
require_once __DIR__ . '/teacher_skill_attachments.php';
require_once __DIR__ . '/paper_assessments.php';
require_once __DIR__ . '/teacher_school_settings.php';
require_once __DIR__ . '/parent_portal.php';

function handle_teacher_routes(string $method, array $segments): never
{
    $resource = $segments[0] ?? '';

    if ($resource === 'login' && $method === 'POST') {
        public_login('teacher');
    }
    if ($resource === 'register' && $method === 'POST') {
        teacher_register();
    }
    if ($resource === 'password-reset-request' && $method === 'POST') {
        public_password_reset_request('TEACHER');
    }
    if ($resource === 'logout' && $method === 'POST') {
        logout_route('teacher');
    }
    if ($resource === 'me' && $method === 'GET') {
        me_route('teacher');
    }
    if ($resource === 'me' && $method === 'PUT') {
        update_teacher_profile();
    }

    $teacher = Auth::requireRole('teacher');
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        Auth::verifyCsrf();
    }
    $teacherPermission = match ($resource) {
        'dashboard' => 'dashboard.view',
        'students', 'follow-up', 'weekly-follow-up', 'motivation' => 'students.manage',
        'student-files', 'knowledge-exchange' => 'files.manage',
        'parents' => 'parents.manage',
        'parent-community' => 'parent_community.manage',
        'tests' => in_array($method, ['GET','HEAD'], true) ? 'tests.view' : 'tests.manage',
        'question-bank' => 'question_bank.manage',
        'ai' => 'ai_question_bank.manage',
        'analysis' => in_array($method, ['GET','HEAD'], true) ? 'analytics.view' : 'analytics.manage',
        'attachments' => match ($segments[1] ?? '') {
            'analysis' => in_array($method, ['GET','HEAD'], true) ? 'analytics.view' : 'analytics.manage',
            'manual', 'paper' => in_array($method, ['GET','HEAD'], true) ? 'analytics.view' : 'grades.manage',
            default => 'files.manage',
        },
        'learning-styles' => in_array($method, ['GET','HEAD'], true) ? 'analytics.view' : 'analytics.manage',
        'reports' => 'export.use',
        'school-settings', 'interactive-games' => 'school_settings.manage',
        'privacy' => 'dashboard.view',
        'enhancements' => match ($segments[1] ?? '') {
            'remedial','messages','password-requests' => 'students.manage',
            'smart-reports','alerts' => 'analytics.view',
            'calendar','search','student' => 'dashboard.view',
            default => 'dashboard.view',
        },
        'data' => match ($segments[1] ?? '') {
            'notifications','activity-log' => 'dashboard.view',
            'classes' => 'students.manage',
            default => 'content.manage',
        },
        default => 'dashboard.view',
    };
    Auth::requirePermission($teacherPermission, false);
    $teacherId = (int) $teacher['id'];

    if ($resource === 'dashboard' && ($segments[1] ?? '') === 'summary' && $method === 'GET') {
        teacher_dashboard_summary($teacherId);
    }
    if ($resource === 'students') {
        teacher_students_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'student-files') {
        teacher_student_files_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'follow-up') {
        teacher_follow_up_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'weekly-follow-up') {
        teacher_weekly_follow_up_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'motivation') {
        teacher_motivation_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'knowledge-exchange') {
        teacher_knowledge_exchange_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'parents') {
        teacher_parent_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'parent-community') {
        teacher_parent_community_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'tests') {
        teacher_tests_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'question-bank') {
        teacher_question_bank_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'ai' && ($segments[1] ?? '') === 'generate-questions' && $method === 'POST') {
        teacher_ai_generate($teacherId);
    }
    if ($resource === 'analysis') {
        teacher_analysis_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'attachments') {
        if (($segments[1] ?? '') === 'paper') teacher_paper_assessment_routes($method, array_slice($segments, 2), $teacherId);
        teacher_attachments_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'learning-styles') {
        teacher_learning_style_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'data') {
        teacher_data_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'reports') {
        teacher_reports_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'school-settings') {
        teacher_school_settings_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'interactive-games') {
        if (($segments[1] ?? '') === 'builder') {
            teacher_interactive_game_builder_routes($method, array_slice($segments, 2), $teacherId);
        }
        teacher_interactive_games_routes($method, array_slice($segments, 1), $teacherId);
    }
    if ($resource === 'privacy') { platform_privacy_routes('teacher',$teacherId,$method); }
    if ($resource === 'enhancements') {
        teacher_enhancement_routes($method, array_slice($segments, 1), $teacherId);
    }

    Http::json(['error' => 'المسار المطلوب غير موجود.'], 404);
}

function teacher_dashboard_summary(int $teacherId): never
{
    $studentCount = (int) (fetch_one(
        'SELECT COUNT(*) AS n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.teacher_id = ?',
        [$teacherId]
    )['n'] ?? 0);
    $publishedTests = (int) (fetch_one(
        "SELECT COUNT(*) AS n FROM tests WHERE teacher_id = ? AND status = 'published'",
        [$teacherId]
    )['n'] ?? 0);
    $completedResults = (int) (fetch_one(
        "SELECT COUNT(*) AS n FROM test_attempts a JOIN tests t ON t.id = a.test_id WHERE t.teacher_id = ? AND a.status IN ('submitted','graded')",
        [$teacherId]
    )['n'] ?? 0);
    $averageProgress = (float) (fetch_one(
        'SELECT COALESCE(AVG(s.progress_percent),0) AS n FROM students s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=?',
        [$teacherId]
    )['n'] ?? 0);
    $needSupportCount = (int) (fetch_one(
        'SELECT COUNT(*) AS n FROM students s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND s.progress_percent < 50',
        [$teacherId]
    )['n'] ?? 0);
    $classLevels = fetch_all(
        'SELECT c.id, c.name, COUNT(s.id) AS student_count, ROUND(COALESCE(AVG(s.progress_percent),0),1) AS avg_progress
         FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.deleted_at IS NULL WHERE c.teacher_id=? GROUP BY c.id,c.name ORDER BY c.name',
        [$teacherId]
    );
    $recentActivity = fetch_all(
        "SELECT action, details, created_at FROM activity_log WHERE actor_role='teacher' AND actor_id=? ORDER BY created_at DESC LIMIT 8",
        [$teacherId]
    );
    $notifications = fetch_all(
        'SELECT id,title,body AS message,is_read,created_at FROM notifications WHERE teacher_id=? ORDER BY created_at DESC LIMIT 5',
        [$teacherId]
    );

    Http::json([
        'studentCount' => $studentCount,
        'publishedTests' => $publishedTests,
        'completedResults' => $completedResults,
        'averageProgress' => round($averageProgress, 1),
        'needSupportCount' => $needSupportCount,
        'classLevels' => $classLevels,
        'recentActivity' => $recentActivity,
        'notifications' => $notifications,
    ]);
}

function teacher_data_routes(string $method, array $segments, int $teacherId): never
{
    $resource = $segments[0] ?? '';
    if ($resource === 'skills' && $method === 'GET') {
        ensure_diagnostic_bank_schema();
        $rows=fetch_all(
            "SELECT s.id,s.stage,s.grade_label,s.name,s.code,
                    GROUP_CONCAT(DISTINCT CASE
                        WHEN q.chapter_name IS NOT NULL AND TRIM(q.chapter_name)<>''
                        THEN CONCAT(COALESCE(q.term_label,''),'::',TRIM(q.chapter_name))
                    END SEPARATOR '||') AS unit_contexts,
                    GROUP_CONCAT(DISTINCT NULLIF(TRIM(q.term_label),'') SEPARATOR '||') AS question_terms
             FROM skills s
             LEFT JOIN question_bank q ON q.skill_id=s.id AND q.teacher_id=? AND q.is_active=1
             GROUP BY s.id,s.stage,s.grade_label,s.name,s.code
             ORDER BY s.stage,s.grade_label,s.name",
            [$teacherId]
        );
        Http::json($rows);
    }
    if ($resource === 'classes' && $method === 'GET') {
        Http::json(fetch_all("SELECT c.id,c.name,c.stage AS level,c.grade_label,c.academic_year,COUNT(s.id) AS student_count FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.deleted_at IS NULL WHERE c.teacher_id=? GROUP BY c.id,c.name,c.stage,c.grade_label,c.academic_year ORDER BY FIELD(c.stage,'ابتدائي','متوسط','ثانوي'),c.grade_label,c.name", [$teacherId]));
    }
    if ($resource === 'classes' && count($segments) === 1 && $method === 'POST') {
        $data = Http::input();
        Http::requireFields($data, ['level','gradeLabel','classNumber']);
        [$stage,$grade,$classNumber] = teacher_student_validate_class_selection(trim((string)$data['level']),trim((string)$data['gradeLabel']),(int)$data['classNumber']);
        $year = trim((string)($data['academicYear'] ?? ''));
        if ($year === '') {
            $settings = teacher_school_settings_row($teacherId);
            $year = trim((string)($settings['academic_year'] ?? '')) ?: date('Y');
        }
        $existing = fetch_all('SELECT id,name FROM classes WHERE teacher_id=? AND stage=? AND grade_label=? AND academic_year=?',[$teacherId,$stage,$grade,$year]);
        foreach ($existing as $row) {
            if (teacher_student_class_number_from_name((string)$row['name']) === $classNumber) Http::json(['error'=>'هذا الفصل موجود مسبقًا للمرحلة والصف المختارين.'],409);
        }
        $name = teacher_student_class_display_name($grade,$classNumber);
        execute_sql('INSERT INTO classes (teacher_id,name,stage,grade_label,academic_year) VALUES (?,?,?,?,?)',[$teacherId,$name,$stage,$grade,$year]);
        Http::json(['id'=>(int)Database::connection()->lastInsertId()],201);
    }
    if ($resource === 'classes' && isset($segments[1]) && in_array($method, ['PUT','DELETE'], true)) {
        $id = route_id($segments, 1);
        if (!teacher_owns_class($teacherId, $id)) {
            Http::json(['error' => 'الفصل غير موجود.'], 404);
        }
        if ($method === 'DELETE') {
            $studentCount=(int)(fetch_one('SELECT COUNT(*) AS n FROM students WHERE class_id=?',[$id])['n']??0);
            if ($studentCount>0) Http::json(['error'=>'لا يمكن حذف فصل يحتوي طالبات. انقلي الطالبات إلى فصل آخر أولًا.'],409);
            if (function_exists('teacher_attachments_schema_ready') && teacher_attachments_schema_ready()) {
                $attachmentCount=(int)(fetch_one('SELECT COUNT(*) AS n FROM teacher_analysis_attachments WHERE class_id=? AND teacher_id=? AND deleted_at IS NULL',[$id,$teacherId])['n']??0);
                if ($attachmentCount>0) Http::json(['error'=>'لا يمكن حذف فصل يحتوي مرفقات تحليل. احذفي مرفقاته أولًا.'],409);
                execute_sql('DELETE FROM teacher_analysis_attachments WHERE class_id=? AND teacher_id=? AND deleted_at IS NOT NULL',[$id,$teacherId]);
            }
            if (function_exists('teacher_skill_assessments_schema_ready') && teacher_skill_assessments_schema_ready()) {
                $assessmentCount=(int)(fetch_one('SELECT COUNT(*) AS n FROM teacher_skill_assessments WHERE class_id=? AND teacher_id=? AND deleted_at IS NULL',[$id,$teacherId])['n']??0);
                if ($assessmentCount>0) Http::json(['error'=>'لا يمكن حذف فصل يحتوي تقويمات مهارات محفوظة. احذفي التقويمات أولًا.'],409);
                execute_sql('DELETE FROM teacher_skill_assessments WHERE class_id=? AND teacher_id=? AND deleted_at IS NOT NULL',[$id,$teacherId]);
            }
            execute_sql('DELETE FROM classes WHERE id=? AND teacher_id=?', [$id,$teacherId]);
            Http::json(['ok' => true]);
        }
        $data = Http::input();
        Http::requireFields($data,['level','gradeLabel','classNumber']);
        [$stage,$grade,$classNumber] = teacher_student_validate_class_selection(trim((string)$data['level']),trim((string)$data['gradeLabel']),(int)$data['classNumber']);
        $current = fetch_one('SELECT academic_year FROM classes WHERE id=? AND teacher_id=?',[$id,$teacherId]);
        $year = trim((string)($data['academicYear'] ?? $current['academic_year'] ?? '')) ?: date('Y');
        $siblings = fetch_all('SELECT id,name FROM classes WHERE teacher_id=? AND stage=? AND grade_label=? AND academic_year=? AND id<>?',[$teacherId,$stage,$grade,$year,$id]);
        foreach ($siblings as $row) {
            if (teacher_student_class_number_from_name((string)$row['name']) === $classNumber) Http::json(['error'=>'هذا الفصل موجود مسبقًا للمرحلة والصف المختارين.'],409);
        }
        $name = teacher_student_class_display_name($grade,$classNumber);
        execute_sql(
            'UPDATE classes SET name=?,stage=?,grade_label=?,academic_year=? WHERE id=? AND teacher_id=?',
            [$name,$stage,$grade,$year,$id,$teacherId]
        );
        execute_sql('UPDATE students s JOIN classes c ON c.id=s.class_id SET s.stage=c.stage,s.grade_label=c.grade_label WHERE c.id=? AND c.teacher_id=?',[$id,$teacherId]);
        Http::json(['ok' => true]);
    }
    if ($resource === 'notifications' && $method === 'GET') {
        Http::json(fetch_all('SELECT id,title,body AS message,is_read,created_at FROM notifications WHERE teacher_id=? ORDER BY created_at DESC', [$teacherId]));
    }
    if ($resource === 'notifications' && isset($segments[1]) && ($segments[2] ?? '') === 'read' && $method === 'PUT') {
        execute_sql('UPDATE notifications SET is_read=1 WHERE id=? AND teacher_id=?', [route_id($segments,1),$teacherId]);
        Http::json(['ok' => true]);
    }
    if ($resource === 'notifications' && isset($segments[1]) && $method === 'DELETE') {
        execute_sql('DELETE FROM notifications WHERE id=? AND teacher_id=?', [route_id($segments,1),$teacherId]);
        Http::json(['ok' => true]);
    }
    if ($resource === 'activity-log' && $method === 'GET') {
        Http::json(fetch_all("SELECT action,details,created_at FROM activity_log WHERE actor_role='teacher' AND actor_id=? ORDER BY created_at DESC LIMIT 200", [$teacherId]));
    }
    Http::json(['error' => 'المسار المطلوب غير موجود.'], 404);
}

function teacher_reports_routes(string $method, array $segments, int $teacherId): never
{
    if ($method !== 'GET') {
        Http::json(['error' => 'الطريقة غير مسموحة.'], 405);
    }
    if (($segments[0] ?? '') === 'students.csv' || ($segments[0] ?? '') === 'students.xlsx') {
        $rows = fetch_all(
            'SELECT s.name,s.email,s.stage,c.name AS class_name
             FROM students s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? ORDER BY c.name,s.name',
            [$teacherId]
        );
        if (($segments[0] ?? '') === 'students.xlsx') {
            teacher_export_students_xlsx($rows);
        }
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="madar-students-excel.csv"');
        echo "\xEF\xBB\xBF";
        echo "sep=;\r\n";
        $out = fopen('php://output', 'wb');
        fputcsv($out, ['الاسم','البريد الإلكتروني','المرحلة','الفصل'], ';');
        foreach ($rows as $row) {
            fputcsv($out, array_map('csv_safe',array_values($row)), ';');
        }
        fclose($out);
        exit;
    }
    if (($segments[0] ?? '') === 'student' && isset($segments[1])) {
        $studentId=Http::id(str_replace('.pdf','',(string)$segments[1]));
        if(!teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'الطالبة غير موجودة.'],404);
        $student=fetch_one('SELECT s.*,c.name AS class_name,c.stage AS class_stage,c.grade_label AS class_grade_label,c.academic_year AS class_academic_year FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?',[$studentId]);
        $schoolContext=teacher_school_settings_row($teacherId);
        $results=fetch_all('SELECT t.title,a.score,a.total_points,a.percentage,a.submitted_at FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE a.student_id=? AND t.teacher_id=? AND t.academic_year=? AND t.semester=? ORDER BY a.submitted_at DESC',[$studentId,$teacherId,(string)($schoolContext['academic_year']??''),(string)($schoolContext['current_semester']??'first')]);
        $skills=fetch_all('SELECT sk.name,ss.mastery_percent FROM student_skills ss JOIN skills sk ON sk.id=ss.skill_id WHERE ss.student_id=? ORDER BY ss.mastery_percent DESC',[$studentId]);
        printable_report('تقرير الطالبة '.$student['name'],"<h1>تقرير متابعة الطالبة: ".htmlspecialchars($student['name'])."</h1><p>الفصل: ".htmlspecialchars($student['class_name']??'—')." | التقدم: {$student['progress_percent']}%</p><h2>نتائج الاختبارات</h2>".report_table(['الاختبار','الدرجة','النسبة','التاريخ'],array_map(static fn($r)=>[$r['title'],$r['score'].'/'.$r['total_points'],$r['percentage'].'%',$r['submitted_at']],$results))."<h2>المهارات</h2>".report_table(['المهارة','الإتقان'],array_map(static fn($s)=>[$s['name'],$s['mastery_percent'].'%'],$skills)),$teacherId,['stage'=>$student['class_stage']??$student['stage']??'','gradeLabel'=>$student['class_grade_label']??$student['grade_label']??'','className'=>$student['class_name']??'']);
    }
    if (($segments[0] ?? '') === 'class.pdf') {
        $classId=(int)($_GET['classId']??0);if(!teacher_owns_class($teacherId,$classId))Http::json(['error'=>'الفصل غير موجود.'],404);
        $class=fetch_one('SELECT name,stage,grade_label,academic_year FROM classes WHERE id=?',[$classId]);
        $rows=fetch_all('SELECT name,email,learning_style,progress_percent FROM students WHERE class_id=? ORDER BY name',[$classId]);
        printable_report('تقرير الفصل '.$class['name'],"<h1>تقرير الفصل: ".htmlspecialchars($class['name'])."</h1><p>".htmlspecialchars($class['grade_label'])."</p>".report_table(['الطالبة','البريد','نمط التعلم','التقدم'],array_map(static fn($r)=>[$r['name'],$r['email'],$r['learning_style'],$r['progress_percent'].'%'],$rows)),$teacherId,['stage'=>$class['stage']??'','gradeLabel'=>$class['grade_label']??'','className'=>$class['name']??'']);
    }
    if (($segments[0]??'')==='test'&&isset($segments[1])) {
        $testId=Http::id(str_replace('.pdf','',(string)$segments[1]));
        if(!teacher_owns_test($teacherId,$testId)) Http::json(['error'=>'الاختبار غير موجود.'],404);
        $test=fetch_one('SELECT t.title,t.duration_minutes,t.total_points,t.academic_year,t.semester,c.name AS class_name,c.stage,c.grade_label FROM tests t LEFT JOIN classes c ON c.id=t.class_id WHERE t.id=?',[$testId]);
        $reportMode=trim((string)($_GET['report']??'test'));
        if ($reportMode==='results') {
            $rows=fetch_all("SELECT s.name AS student_name,s.email,IF(a.status IN ('submitted','graded'),'مكتمل',IF(a.status='in_progress','قيد التنفيذ','لم يبدأ')) AS result_status,a.score,a.total_points,a.percentage,a.submitted_at FROM test_attempts a JOIN students s ON s.id=a.student_id WHERE a.test_id=? ORDER BY a.submitted_at DESC",[$testId]);
            $body='<h2>نتائج الاختبار</h2>'.report_table(['الطالبة','البريد','الحالة','الدرجة','النسبة','التاريخ'],array_map(static fn($row)=>[$row['student_name'],$row['email'],$row['result_status'],$row['score'].' / '.$row['total_points'],$row['percentage'].'%',$row['submitted_at']],$rows));
            printable_report('نتائج الاختبار: '.$test['title'],$body,$teacherId,['stage'=>$test['stage']??'','gradeLabel'=>$test['grade_label']??'','className'=>$test['class_name']??'','academicYear'=>$test['academic_year']??'','semester'=>$test['semester']??'','orientation'=>'landscape']);
        }
        if ($reportMode==='analysis') {
            $summary=fetch_one("SELECT COUNT(*) AS attempts,ROUND(AVG(percentage),2) AS average_percent,MAX(percentage) AS highest_percent,MIN(percentage) AS lowest_percent FROM test_attempts WHERE test_id=? AND status IN ('submitted','graded')",[$testId])??[];
            $questionsAnalysis=fetch_all("SELECT COALESCE(aq.order_index,q.order_index) AS question_no,COALESCE(aq.question_text,q.question_text) AS question_text,COUNT(an.id) AS responses,SUM(CASE WHEN an.is_correct=1 THEN 1 ELSE 0 END) AS correct_count,ROUND(100*SUM(CASE WHEN an.is_correct=1 THEN 1 ELSE 0 END)/NULLIF(COUNT(an.id),0),2) AS correct_percent FROM answers an JOIN test_attempts ta ON ta.id=an.attempt_id LEFT JOIN test_attempt_questions aq ON aq.id=an.attempt_question_id LEFT JOIN test_questions q ON q.id=an.question_id WHERE ta.test_id=? GROUP BY COALESCE(aq.order_index,q.order_index),COALESCE(aq.question_text,q.question_text) ORDER BY question_no",[$testId]);
            $body='<div class="analysis-summary"><p><b>عدد المحاولات:</b> '.(int)($summary['attempts']??0).'</p><p><b>متوسط النتائج:</b> '.htmlspecialchars((string)($summary['average_percent']??0)).'%</p><p><b>أعلى نتيجة:</b> '.htmlspecialchars((string)($summary['highest_percent']??0)).'%</p><p><b>أقل نتيجة:</b> '.htmlspecialchars((string)($summary['lowest_percent']??0)).'%</p></div><h2>تحليل أسئلة الاختبار</h2>'.report_table(['السؤال','نص السؤال','عدد الإجابات','الإجابات الصحيحة','نسبة الإجابة الصحيحة'],array_map(static fn($row)=>[$row['question_no'],$row['question_text'],$row['responses'],$row['correct_count'],($row['correct_percent']??0).'%'],$questionsAnalysis));
            printable_report('تحليل الاختبار: '.$test['title'],$body,$teacherId,['stage'=>$test['stage']??'','gradeLabel'=>$test['grade_label']??'','className'=>$test['class_name']??'','academicYear'=>$test['academic_year']??'','semester'=>$test['semester']??'','orientation'=>'landscape']);
        }
        $questions=array_map('map_question_row',fetch_all('SELECT question_type,question_text,options_json,correct_answer,explanation,points FROM test_questions WHERE test_id=? ORDER BY order_index',[$testId]));
        $answerKey=($_GET['answerKey']??'0')==='1';
        $body='<h1>'.htmlspecialchars($test['title']).'</h1><p>الفصل: '.htmlspecialchars($test['class_name']??'—').' | الزمن: '.(int)$test['duration_minutes'].' دقيقة | الدرجة: '.htmlspecialchars((string)$test['total_points']).'</p>';
        foreach($questions as $index=>$question) {
            $body.='<section class="question-print"><h3>'.($index+1).'. '.htmlspecialchars($question['question_text']).' <small>('.htmlspecialchars((string)$question['points']).' درجة)</small></h3>';
            if ($question['question_type']==='mcq') $body.='<ol>'.implode('',array_map(static fn($option)=>'<li>'.htmlspecialchars((string)$option).'</li>',$question['options']??[])).'</ol>';
            elseif ($question['question_type']==='true_false') $body.='<p>□ صح &nbsp;&nbsp;&nbsp; □ خطأ</p>';
            else $body.='<div style="height:45px;border-bottom:1px solid #aaa"></div>';
            if ($answerKey) $body.='<p class="answer"><b>الإجابة:</b> '.htmlspecialchars($question['correct_answer']).($question['explanation']?' — '.htmlspecialchars($question['explanation']):'').'</p>';
            $body.='</section>';
        }
        printable_report(($answerKey?'نموذج إجابة ':'').$test['title'],$body,$teacherId,['stage'=>$test['stage']??'','gradeLabel'=>$test['grade_label']??'','className'=>$test['class_name']??'','academicYear'=>$test['academic_year']??'','semester'=>$test['semester']??'']);
    }
    Http::json(['error' => 'التقرير غير موجود.'], 404);
}

function csv_safe(mixed $value): string
{
    $text=(string)$value;
    return preg_match('/^[=+\-@]/u',$text)?"'".$text:$text;
}

function teacher_xlsx_xml_text(mixed $value): string
{
    $text=(string)$value;
    $text=preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u','',$text)??$text;
    return htmlspecialchars($text,ENT_XML1|ENT_QUOTES,'UTF-8');
}

function teacher_xlsx_text_cell(string $reference,mixed $value,int $style): string
{
    return '<c r="'.$reference.'" s="'.$style.'" t="inlineStr"><is><t xml:space="preserve">'.teacher_xlsx_xml_text($value).'</t></is></c>';
}

function teacher_students_xlsx_file(array $rows): string
{
    if (!class_exists('ZipArchive')) Http::json(['error'=>'الخادم يحتاج إضافة PHP Zip لتصدير ملف Excel.'],500);
    $path=tempnam(sys_get_temp_dir(),'madar-students-');
    if ($path===false) Http::json(['error'=>'تعذّر تجهيز ملف Excel.'],500);
    $zip=new ZipArchive();
    if ($zip->open($path,ZipArchive::CREATE|ZipArchive::OVERWRITE)!==true) {
        @unlink($path);
        Http::json(['error'=>'تعذّر إنشاء ملف Excel.'],500);
    }

    $contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        .'<Default Extension="xml" ContentType="application/xml"/>'
        .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        .'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        .'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        .'<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        .'</Types>';
    $rootRelationships='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        .'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        .'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        .'</Relationships>';
    $workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        .'<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>'
        .'<sheets><sheet name="الطالبات" sheetId="1" r:id="rId1"/></sheets>'
        .'<calcPr calcId="191029"/></workbook>';
    $workbookRelationships='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        .'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        .'</Relationships>';
    $styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        .'<fonts count="2"><font><sz val="11"/><name val="Arial"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/><family val="2"/></font></fonts>'
        .'<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF32136F"/><bgColor indexed="64"/></patternFill></fill></fills>'
        .'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE7E1F7"/></left><right style="thin"><color rgb="FFE7E1F7"/></right><top style="thin"><color rgb="FFE7E1F7"/></top><bottom style="thin"><color rgb="FFE7E1F7"/></bottom><diagonal/></border></borders>'
        .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        .'<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/></xf></cellXfs>'
        .'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        .'</styleSheet>';

    $headers=['الاسم','البريد الإلكتروني','المرحلة','الفصل'];
    $sheetRows='<row r="1" ht="28" customHeight="1">';
    foreach($headers as $index=>$header) $sheetRows.=teacher_xlsx_text_cell(chr(65+$index).'1',$header,1);
    $sheetRows.='</row>';
    foreach($rows as $rowIndex=>$row) {
        $number=$rowIndex+2;
        $sheetRows.='<row r="'.$number.'" ht="23" customHeight="1">';
        foreach(array_values($row) as $columnIndex=>$value) $sheetRows.=teacher_xlsx_text_cell(chr(65+$columnIndex).$number,$value,2);
        $sheetRows.='</row>';
    }
    $lastRow=max(1,count($rows)+1);
    $worksheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        .'<dimension ref="A1:D'.$lastRow.'"/>'
        .'<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>'
        .'<sheetFormatPr defaultRowHeight="23"/>'
        .'<cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="32" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="4" width="20" customWidth="1"/></cols>'
        .'<sheetData>'.$sheetRows.'</sheetData>'
        .'<autoFilter ref="A1:D'.$lastRow.'"/>'
        .'<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
        .'</worksheet>';
    $timestamp=gmdate('Y-m-d\TH:i:s\Z');
    $core='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        .'<dc:title>قائمة طالبات مدار</dc:title><dc:creator>منصة مدار</dc:creator><cp:lastModifiedBy>منصة مدار</cp:lastModifiedBy>'
        .'<dcterms:created xsi:type="dcterms:W3CDTF">'.$timestamp.'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'.$timestamp.'</dcterms:modified>'
        .'</cp:coreProperties>';
    $app='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        .'<Application>منصة مدار</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>'
        .'<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>'
        .'<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>الطالبات</vt:lpstr></vt:vector></TitlesOfParts>'
        .'</Properties>';

    $zip->addFromString('[Content_Types].xml',$contentTypes);
    $zip->addFromString('_rels/.rels',$rootRelationships);
    $zip->addFromString('docProps/core.xml',$core);
    $zip->addFromString('docProps/app.xml',$app);
    $zip->addFromString('xl/workbook.xml',$workbook);
    $zip->addFromString('xl/_rels/workbook.xml.rels',$workbookRelationships);
    $zip->addFromString('xl/styles.xml',$styles);
    $zip->addFromString('xl/worksheets/sheet1.xml',$worksheet);
    if (!$zip->close()) {
        @unlink($path);
        Http::json(['error'=>'تعذّر إكمال ملف Excel.'],500);
    }
    return $path;
}

function teacher_export_students_xlsx(array $rows): never
{
    $path=teacher_students_xlsx_file($rows);
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="madar-students.xlsx"');
    header('Content-Length: '.filesize($path));
    header('Cache-Control: no-store');
    readfile($path);
    @unlink($path);
    exit;
}

function report_table(array $headers,array $rows): string
{
    $head='<tr>'.implode('',array_map(static fn($h)=>'<th>'.htmlspecialchars((string)$h).'</th>',$headers)).'</tr>';
    $body=implode('',array_map(static fn($row)=>'<tr>'.implode('',array_map(static fn($v)=>'<td>'.htmlspecialchars((string)$v).'</td>',$row)).'</tr>',$rows));
    return '<table>'.$head.$body.'</table>';
}

function printable_report(string $title,string $body,int $teacherId,array $context=[]): never
{
    $settings=teacher_school_settings_row($teacherId);
    $school=teacher_school_settings_json($settings);
    $semester=(string)($context['semester']??$school['currentSemester']??'first');
    $semesterLabel=$semester==='second'?'الفصل الدراسي الثاني':'الفصل الدراسي الأول';
    $academicYear=trim((string)($context['academicYear']??$school['academicYear']??''));
    $stageLabel=trim((string)($context['stage']??$school['stageLabel']??''));
    $gradeLabel=trim((string)($context['gradeLabel']??$school['gradeLabel']??''));
    $className=trim((string)($context['className']??''));
    $subject=trim((string)($context['subject']??$school['subjectName']??'الرياضيات'))?:'الرياضيات';
    $orientation=(string)($context['orientation']??'portrait')==='landscape'?'landscape':'portrait';
    $h=static fn(mixed $value): string=>htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
    $governmentLines='<strong>المملكة العربية السعودية</strong>'
        .($school['educationDepartment']!==''?'<div>إدارة التعليم: '.$h($school['educationDepartment']).'</div>':'')
        .($school['educationOffice']!==''?'<div>مكتب التعليم: '.$h($school['educationOffice']).'</div>':'')
        .($school['schoolName']!==''?'<div>المدرسة: '.$h($school['schoolName']).'</div>':'');
    $logos='<img class="madar-logo" src="'.$h($school['madarLogoUrl']??'/assets/print/madar-official-logo-transparent.png').'" alt="شعار مدار">'
        .'<img class="vision-logo" src="'.$h($school['visionLogoUrl']??'/vision-2030-logo.png').'" alt="شعار رؤية السعودية 2030">';
    if (!empty($school['additionalLogoUrl'])) $logos.='<img class="additional-logo" src="'.$h($school['additionalLogoUrl']).'" alt="الشعار الإضافي">';
    $leader=trim((string)($school['schoolLeaderName']??''));
    $teacher=trim((string)($school['teacherName']??''));
    $stageGrade=trim(implode(' — ',array_values(array_filter([$stageLabel,$gradeLabel],static fn($v)=>trim((string)$v)!==''))));
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$h($title).'</title><link rel="stylesheet" href="/teacher/print-official.css?v=4"><style>@page{size:A4 '.$orientation.';margin:7mm}</style></head><body class="print-'.$orientation.'">'
        .'<div class="print-actions"><button onclick="window.print()">طباعة / حفظ PDF</button><button onclick="history.back()">رجوع</button></div>'
        .'<main class="official-sheet"><table class="official-document-frame"><thead><tr><td>'
        .'<header class="official-print-header">'
        .'<section class="government-block"><div class="government-copy">'.$governmentLines.'</div></section>'
        .'<section class="center-identity"><div class="identity-logos">'.$logos.'</div><div class="document-heading"><h1>'.$h($title).'</h1></div></section>'
        .'<section class="report-meta"><div><b>المادة:</b> '.$h($subject).'</div><div><b>المرحلة والصف:</b> '.$h($stageGrade!==''?$stageGrade:'—').'</div>'
        .($className!==''?'<div><b>الفصل:</b> '.$h($className).'</div>':'')
        .'<div><b>الفصل الدراسي:</b> '.$h($semesterLabel).'</div><div><b>العام الدراسي:</b> '.$h($academicYear!==''?$academicYear:'—').'</div></section>'
        .'</header></td></tr></thead><tbody><tr><td><section class="report-content">'.$body.'</section></td></tr></tbody></table>'
        .'<footer class="official-footer"><span>مديرة المدرسة: '.$h($leader!==''?$leader:'____________________').'</span><span>المعلمة: '.$h($teacher!==''?$teacher:'____________________').'</span></footer>'
        .'</main></body></html>';
    exit;
}
