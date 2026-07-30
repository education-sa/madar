<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$teacherPassword=(string)env_value('DEMO_TEACHER_PASSWORD','');
$studentPassword=(string)env_value('DEMO_STUDENT_PASSWORD','');
if (strlen($teacherPassword)<10 || strlen($studentPassword)<10 ||
    !preg_match('/[A-Za-z]/',$teacherPassword) || !preg_match('/\d/',$teacherPassword) ||
    !preg_match('/[A-Za-z]/',$studentPassword) || !preg_match('/\d/',$studentPassword)) {
    fwrite(STDERR,"أضيفي DEMO_TEACHER_PASSWORD وDEMO_STUDENT_PASSWORD، كل منهما 10 أحرف على الأقل وتحتوي حرفًا ورقمًا.\n");
    exit(1);
}

$pdo=Database::connection();
$ownerId=(int)($pdo->query('SELECT id FROM owners ORDER BY id LIMIT 1')->fetchColumn()?:0);
if (!$ownerId) {
    fwrite(STDERR,"أنشئي حساب المالكة أولًا عبر scripts/create_owner.php.\n");
    exit(1);
}

Database::transaction(function(PDO $pdo) use($ownerId,$teacherPassword,$studentPassword): void {
    $teacherEmail='demo.teacher@mkhg.moe.gov.sa';
    $stmt=$pdo->prepare('SELECT id FROM teachers WHERE email=?');
    $stmt->execute([$teacherEmail]);
    $teacherId=(int)($stmt->fetchColumn()?:0);
    if (!$teacherId) {
        $stmt=$pdo->prepare("INSERT INTO teachers (name,email,password_hash,status,approved_by,approved_at) VALUES ('المعلمة التجريبية',?,?, 'active',?,NOW())");
        $stmt->execute([$teacherEmail,password_hash($teacherPassword,PASSWORD_DEFAULT),$ownerId]);
        $teacherId=(int)$pdo->lastInsertId();
    }

    $stmt=$pdo->prepare("SELECT id FROM classes WHERE teacher_id=? AND name='الفصل التجريبي' AND academic_year='1448'");
    $stmt->execute([$teacherId]);
    $classId=(int)($stmt->fetchColumn()?:0);
    if (!$classId) {
        $stmt=$pdo->prepare("INSERT INTO classes (teacher_id,name,stage,grade_label,academic_year) VALUES (?,'الفصل التجريبي','متوسط','الصف الثاني المتوسط','1448')");
        $stmt->execute([$teacherId]);
        $classId=(int)$pdo->lastInsertId();
    }

    $studentInsert=$pdo->prepare("INSERT INTO students (class_id,name,email,password_hash,stage,grade_label,status,must_change_password) VALUES (?,?,?,?,'متوسط','الصف الثاني المتوسط','active',1)");
    $studentLookup=$pdo->prepare('SELECT id FROM students WHERE email=?');
    for ($number=1;$number<=12;$number++) {
        $email=sprintf('demo.student%02d@mkhg.moe.gov.sa',$number);
        $studentLookup->execute([$email]);
        if (!$studentLookup->fetchColumn()) {
            $studentInsert->execute([$classId,'طالبة تجريبية '.$number,$email,password_hash($studentPassword,PASSWORD_DEFAULT)]);
        }
    }

    $skillId=(int)($pdo->query("SELECT id FROM skills WHERE code='M2-LIN-01'")->fetchColumn()?:0);
    $bankQuestions=[
        ['mcq','ما حل المعادلة 2س + 3 = 11؟',['2','3','4','7'],'4','نطرح 3 ثم نقسم على 2.'],
        ['true_false','حل المعادلة س - 5 = 2 هو س = 7.',null,'صح','بإضافة 5 للطرفين نحصل على 7.'],
        ['mcq','أي معادلة حلها س = 3؟',['س + 4 = 7','2س = 8','س - 1 = 1','3س = 6'],'س + 4 = 7','بالتعويض عن س بـ3 تتحقق المساواة.'],
        ['short_answer','أوجدي قيمة س في المعادلة 3س = 15.',null,'5','نقسم الطرفين على 3.'],
    ];
    $lookup=$pdo->prepare('SELECT id FROM question_bank WHERE teacher_id=? AND question_text=?');
    $insert=$pdo->prepare("INSERT INTO question_bank (teacher_id,skill_id,stage,grade_label,topic,difficulty,question_type,question_text,options_json,correct_answer,explanation,points,source,review_status) VALUES (?,?,'متوسط','الصف الثاني المتوسط','المعادلات الخطية','medium',?,?,?,?,?,1,'manual','approved')");
    $bankIds=[];
    foreach($bankQuestions as [$type,$text,$options,$answer,$explanation]) {
        $lookup->execute([$teacherId,$text]);
        $id=(int)($lookup->fetchColumn()?:0);
        if (!$id) {
            $insert->execute([$teacherId,$skillId,$type,$text,$options?json_encode($options,JSON_UNESCAPED_UNICODE):null,$answer,$explanation]);
            $id=(int)$pdo->lastInsertId();
        }
        $bankIds[]=$id;
    }

    $stmt=$pdo->prepare("SELECT id FROM tests WHERE teacher_id=? AND title='اختبار تجريبي في المعادلات'");
    $stmt->execute([$teacherId]);
    $testId=(int)($stmt->fetchColumn()?:0);
    if (!$testId) {
        $stmt=$pdo->prepare("INSERT INTO tests (teacher_id,class_id,skill_id,title,test_type,status,duration_minutes,total_points) VALUES (?,?,?,'اختبار تجريبي في المعادلات','quiz','published',15,4)");
        $stmt->execute([$teacherId,$classId,$skillId]);
        $testId=(int)$pdo->lastInsertId();
        $copy=$pdo->prepare('INSERT INTO test_questions (test_id,bank_question_id,skill_id,question_type,question_text,options_json,correct_answer,explanation,points,order_index) SELECT ?,id,skill_id,question_type,question_text,options_json,correct_answer,explanation,points,? FROM question_bank WHERE id=?');
        foreach($bankIds as $index=>$bankId) $copy->execute([$testId,$index+1,$bankId]);
    }
});

fwrite(STDOUT,"تم تجهيز البيانات التجريبية: معلمة، فصل، 12 طالبة، بنك أسئلة، واختبار منشور.\n");
