<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/config/bootstrap.php';
require_once dirname(__DIR__).'/api/shared.php';
require_once dirname(__DIR__).'/api/diagnostic_bank.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "هذا المستورد يعمل من سطر الأوامر فقط.\n");
    exit(1);
}

$jsonPath=$argv[1]??'';
$teacherId=(int)($argv[2]??0);
$classId=(int)($argv[3]??0);
if ($jsonPath===''||!is_file($jsonPath)) {
    fwrite(STDERR,"الاستخدام: php scripts/import_diagnostic_bank.php question-bank.json [teacher_id] [class_id]\n");
    exit(1);
}

$payload=json_decode((string)file_get_contents($jsonPath),true);
$rows=is_array($payload['rows']??null)?$payload['rows']:[];
if (!$rows) throw new RuntimeException('ملف بنك الأسئلة لا يحتوي صفوفًا قابلة للاستيراد.');

ensure_diagnostic_bank_schema();

if (!$teacherId) {
    $teacherId=(int)(fetch_one("SELECT id FROM teachers WHERE status='active' ORDER BY id LIMIT 1")['id']??0);
}
if (!$teacherId) throw new RuntimeException('لا يوجد حساب معلمة نشط لربط بنك الأسئلة به.');

$stage=trim((string)$rows[0]['المرحلة']);
$grade=trim((string)$rows[0]['الصف']);
$term=trim((string)$rows[0]['الفصل الدراسي']);
$firstQuestionId=(string)$rows[0]['question_id'];
$batch=preg_replace('/-\d+$/','',$firstQuestionId)?:'M1-T1-DIAG';
$lessonCodes=array_values(array_unique(array_map(static fn(array $row): string=>trim((string)$row['lesson_code']),$rows)));

if (!$classId) {
    $class=fetch_one('SELECT id FROM classes WHERE teacher_id=? AND stage=? AND grade_label=? ORDER BY id LIMIT 1',[$teacherId,$stage,$grade]);
    if (!$class) $class=fetch_one('SELECT id FROM classes WHERE teacher_id=? AND stage=? ORDER BY id LIMIT 1',[$teacherId,$stage]);
    if (!$class) $class=fetch_one('SELECT id FROM classes WHERE teacher_id=? ORDER BY id LIMIT 1',[$teacherId]);
    $classId=(int)($class['id']??0);
}
if (!$classId||!teacher_owns_class($teacherId,$classId)) throw new RuntimeException('لا يوجد فصل صالح لدى المعلمة لربط الاختبار به.');

$result=Database::transaction(function(PDO $pdo) use($rows,$teacherId,$classId,$stage,$grade,$term,$batch,$lessonCodes): array {
    $skillUpsert=$pdo->prepare(
        'INSERT INTO skills (stage,grade_label,code,name,description) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE stage=VALUES(stage),grade_label=VALUES(grade_label),name=VALUES(name),description=VALUES(description),id=LAST_INSERT_ID(id)'
    );
    $questionUpsert=$pdo->prepare(
        "INSERT INTO question_bank (teacher_id,external_question_id,skill_id,lesson_code,import_batch,stage,grade_label,term_label,topic,chapter_name,difficulty,question_type,question_text,options_json,correct_answer,explanation,points,source,review_status,is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'imported',?,?)
         ON DUPLICATE KEY UPDATE skill_id=VALUES(skill_id),lesson_code=VALUES(lesson_code),import_batch=VALUES(import_batch),stage=VALUES(stage),grade_label=VALUES(grade_label),term_label=VALUES(term_label),topic=VALUES(topic),chapter_name=VALUES(chapter_name),difficulty=VALUES(difficulty),question_type=VALUES(question_type),question_text=VALUES(question_text),options_json=VALUES(options_json),correct_answer=VALUES(correct_answer),explanation=VALUES(explanation),review_status=VALUES(review_status),is_active=VALUES(is_active),source='imported',id=LAST_INSERT_ID(id)"
    );
    $skillIds=[];$inserted=0;$updated=0;
    foreach($rows as $row) {
        $lessonCode=trim((string)$row['lesson_code']);
        $skillName=trim((string)$row['المهارة']);
        $skillCode='M1-T1-'.$lessonCode;
        if (!isset($skillIds[$lessonCode])) {
            $skillUpsert->execute([$stage,$grade,$skillCode,$skillName,'مهارة مستوردة من بنك الاختبار التشخيصي للترم '.$term]);
            $skillIds[$lessonCode]=(int)$pdo->lastInsertId();
        }
        $options=array_values(array_filter([
            trim((string)$row['الخيار A']),trim((string)$row['الخيار B']),trim((string)$row['الخيار C']),trim((string)$row['الخيار D'])
        ],static fn(string $value): bool=>$value!==''));
        $reviewStatus=match(trim((string)$row['حالة المراجعة'])){'معتمد'=>'approved','مرفوض'=>'rejected',default=>'pending'};
        $active=in_array(trim((string)$row['نشط']),['نعم','1','true'],true)?1:0;
        $difficulty=match(trim((string)$row['الصعوبة'])){'متوسط'=>'medium','صعب','متقدم'=>'hard',default=>'easy'};
        $questionType=match(trim((string)$row['نوع السؤال'])){'صح أو خطأ'=>'true_false','إجابة قصيرة'=>'short_answer',default=>'mcq'};
        $questionUpsert->execute([
            $teacherId,trim((string)$row['question_id']),$skillIds[$lessonCode],$lessonCode,$batch,$stage,$grade,$term,$skillName,
            trim((string)$row['اسم الفصل']),$difficulty,$questionType,trim((string)$row['نص السؤال']),
            $options?json_encode($options,JSON_UNESCAPED_UNICODE):null,trim((string)$row['الإجابة الصحيحة']),trim((string)$row['تفسير مختصر']),$reviewStatus,$active
        ]);
        $questionUpsert->rowCount()===1?$inserted++:$updated++;
    }

    $title='الاختبار التشخيصي القبلي — رياضيات '.$grade.' — الفصل الدراسي '.$term;
    $existing=fetch_one("SELECT id,status FROM tests WHERE teacher_id=? AND question_source='lesson_bank' AND bank_import_batch=? AND test_type='pre_diagnostic' ORDER BY id LIMIT 1",[$teacherId,$batch]);
    if ($existing) {
        $testId=(int)$existing['id'];
        $pdo->prepare("UPDATE tests SET class_id=?,title=?,bank_stage=?,bank_grade_label=?,expected_lesson_count=?,duration_minutes=60,max_attempts=1,shuffle_questions=1,show_result=1,total_points=?,status='draft' WHERE id=?")
            ->execute([$classId,$title,$stage,$grade,count($lessonCodes),count($lessonCodes),$testId]);
    } else {
        $pdo->prepare("INSERT INTO tests (teacher_id,class_id,title,test_type,question_source,bank_stage,bank_grade_label,bank_import_batch,expected_lesson_count,status,duration_minutes,max_attempts,shuffle_questions,show_result,total_points)
                       VALUES (?,?,?,'pre_diagnostic','lesson_bank',?,?,?,?,'draft',60,1,1,1,?)")
            ->execute([$teacherId,$classId,$title,$stage,$grade,$batch,count($lessonCodes),count($lessonCodes)]);
        $testId=(int)$pdo->lastInsertId();
    }
    return ['teacherId'=>$teacherId,'classId'=>$classId,'testId'=>$testId,'importBatch'=>$batch,'questions'=>count($rows),'lessonCodes'=>count($lessonCodes),'inserted'=>$inserted,'updated'=>$updated,'status'=>'draft'];
});

fwrite(STDOUT,json_encode($result,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL);
