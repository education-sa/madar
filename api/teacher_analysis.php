<?php
declare(strict_types=1);

function teacher_analysis_routes(string $method,array $segments,int $teacherId): never
{
    if ($method!=='GET') Http::json(['error'=>'الطريقة غير مسموحة.'],405);
    $resource=$segments[0]??'';
    if ($resource==='workspace') teacher_analysis_workspace($teacherId);
    ensure_diagnostic_bank_schema();
    ensure_test_context_columns();
    if ($resource==='student') {
        $id=route_id($segments,1);
        if (!teacher_owns_student($teacherId,$id)) Http::json(['error'=>'الطالبة غير موجودة.'],404);
        teacher_analysis_student($teacherId,$id);
    }
    if ($resource==='class') teacher_analysis_class($teacherId);
    if ($resource==='skills') teacher_analysis_skills($teacherId);
    if ($resource==='question-mastery') teacher_analysis_question_mastery($teacherId);
    if ($resource==='gradebook') teacher_analysis_gradebook($teacherId);
    if ($resource==='learning-styles') teacher_analysis_learning_styles($teacherId);
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

/**
 * ترجع آخر محاولة مكتملة لكل طالبة ولكل اختبار حتى لا تتكرر الطالبة
 * في التحليل عند السماح بأكثر من محاولة.
 */
function teacher_analysis_latest_attempts(int $teacherId,int $classId=0,int $testId=0,?int $studentId=null): array
{
    $where=["t.teacher_id=?","a.status IN ('submitted','graded')","s.status='active'","s.deleted_at IS NULL"];
    $params=[$teacherId];
    if ($classId>0) {$where[]='s.class_id=?';$params[]=$classId;}
    if ($testId>0) {$where[]='t.id=?';$params[]=$testId;}
    if ($studentId!==null&&$studentId>0) {$where[]='s.id=?';$params[]=$studentId;}

    $rows=fetch_all(
        "SELECT a.id,a.test_id,a.student_id,a.attempt_no,a.status,a.score,a.total_points,a.percentage,a.submitted_at,
                t.title,t.test_type,t.question_source,t.class_id,t.skill_id AS test_skill_id,
                t.bank_stage,t.bank_grade_label,t.bank_term_label,t.academic_year,t.semester,
                t.created_at AS test_created_at,
                s.name AS student_name,s.email AS student_email,c.name AS class_name,
                c.stage AS class_stage,c.grade_label AS class_grade_label
         FROM test_attempts a
         JOIN tests t ON t.id=a.test_id
         JOIN students s ON s.id=a.student_id
         JOIN classes c ON c.id=s.class_id AND c.teacher_id=t.teacher_id
         WHERE ".implode(' AND ',$where)."
         ORDER BY a.student_id,a.test_id,a.attempt_no DESC,a.id DESC",
        $params
    );

    $latest=[];
    foreach($rows as $row) {
        $key=(int)$row['student_id'].':'.(int)$row['test_id'];
        if (!isset($latest[$key])) $latest[$key]=$row;
    }
    return array_values($latest);
}

function teacher_analysis_answer_rows(array $attemptIds): array
{
    $attemptIds=array_values(array_unique(array_filter(array_map('intval',$attemptIds),static fn(int $id):bool=>$id>0)));
    if (!$attemptIds) return [];
    $placeholders=implode(',',array_fill(0,count($attemptIds),'?'));
    return fetch_all(
        "SELECT an.attempt_id,an.answer_text,an.is_correct,an.points_earned,
                COALESCE(aq.points,q.points,0) AS question_points,
                COALESCE(aq.order_index,q.order_index,0) AS order_index,
                COALESCE(aq.skill_id,q.skill_id) AS skill_id,
                COALESCE(NULLIF(aq.skill_name,''),sk.name,'غير مرتبطة بمهارة') AS skill_name,
                COALESCE(aq.question_text,q.question_text,'') AS question_text,
                aq.bank_question_id,aq.source_question_id,an.question_id,
                COALESCE(NULLIF(qb.subject_name,''),'') AS subject_name,
                COALESCE(NULLIF(qb.unit_name,''),NULLIF(qb.chapter_name,''),'') AS unit_name,
                COALESCE(NULLIF(qb.lesson_name,''),NULLIF(qb.topic,''),'') AS lesson_name,
                COALESCE(NULLIF(aq.lesson_code,''),NULLIF(qb.lesson_code,''),'') AS lesson_code
         FROM answers an
         LEFT JOIN test_attempt_questions aq ON aq.id=an.attempt_question_id
         LEFT JOIN test_questions q ON q.id=an.question_id
         LEFT JOIN question_bank qb ON qb.id=COALESCE(aq.bank_question_id,q.bank_question_id)
         LEFT JOIN skills sk ON sk.id=COALESCE(aq.skill_id,q.skill_id)
         WHERE an.attempt_id IN ({$placeholders})
         ORDER BY COALESCE(aq.order_index,q.order_index),an.id",
        $attemptIds
    );
}

function teacher_analysis_student(int $teacherId,int $studentId): never
{
    $student=fetch_one(
        'SELECT s.id,s.name,s.email,s.progress_percent,s.learning_style,s.class_id,c.name AS class_name
         FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?',
        [$studentId]
    );
    $attempts=teacher_analysis_latest_attempts($teacherId,0,0,$studentId);
    usort($attempts,static fn(array $a,array $b):int=>strcmp((string)($b['submitted_at']??''),(string)($a['submitted_at']??'')));
    $results=array_map(static fn(array $row):array=>[
        'attemptId'=>(int)$row['id'],
        'testId'=>(int)$row['test_id'],
        'title'=>(string)$row['title'],
        'type'=>(string)$row['test_type'],
        'score'=>(float)$row['score'],
        'total_points'=>(float)$row['total_points'],
        'percentage'=>(float)$row['percentage'],
        'submitted_at'=>$row['submitted_at'],
    ],$attempts);

    $skills=fetch_all('SELECT sk.id,sk.name,ss.mastery_percent FROM student_skills ss JOIN skills sk ON sk.id=ss.skill_id WHERE ss.student_id=? ORDER BY ss.mastery_percent DESC',[$studentId]);
    $mastered=array_values(array_filter($skills,static fn($s)=>(float)$s['mastery_percent']>=70));
    $needsSupport=array_values(array_filter($skills,static fn($s)=>(float)$s['mastery_percent']<50));
    $trend=array_map(static fn($r)=>['label'=>$r['title'],'value'=>(float)$r['percentage'],'date'=>$r['submitted_at']],$results);
    Http::json(compact('student','results','mastered','needsSupport','trend'));
}

function teacher_analysis_class(int $teacherId): never
{
    $classId=max(0,(int)($_GET['classId']??0));
    if ($classId&&!teacher_owns_class($teacherId,$classId)) Http::json(['error'=>'الفصل غير موجود.'],404);

    $studentParams=[$teacherId];
    $studentWhere='c.teacher_id=?';
    if ($classId>0) {$studentWhere.=' AND c.id=?';$studentParams[]=$classId;}
    $studentCount=(int)(fetch_one("SELECT COUNT(*) AS n FROM students s JOIN classes c ON c.id=s.class_id WHERE {$studentWhere}",$studentParams)['n']??0);

    $attempts=teacher_analysis_latest_attempts($teacherId,$classId);
    $percentages=array_map(static fn(array $row):float=>(float)$row['percentage'],$attempts);
    $attemptCount=count($attempts);
    $average=$attemptCount?round(array_sum($percentages)/$attemptCount,1):0.0;
    $highest=$attemptCount?round(max($percentages),1):0.0;
    $lowest=$attemptCount?round(min($percentages),1):0.0;
    $passed=count(array_filter($percentages,static fn(float $value):bool=>$value>=60));
    $passRate=$attemptCount?round(100*$passed/$attemptCount,1):0.0;

    $distribution=[
        ['label'=>'أقل من 50','count'=>count(array_filter($percentages,static fn(float $v):bool=>$v<50))],
        ['label'=>'50–69','count'=>count(array_filter($percentages,static fn(float $v):bool=>$v>=50&&$v<70))],
        ['label'=>'70–84','count'=>count(array_filter($percentages,static fn(float $v):bool=>$v>=70&&$v<85))],
        ['label'=>'85 فأعلى','count'=>count(array_filter($percentages,static fn(float $v):bool=>$v>=85))],
    ];

    $prePostTotals=[];
    foreach($attempts as $attempt) {
        $type=(string)$attempt['test_type'];
        if (!in_array($type,['pre_diagnostic','post_diagnostic'],true)) continue;
        $prePostTotals[$type]['sum']=($prePostTotals[$type]['sum']??0)+(float)$attempt['percentage'];
        $prePostTotals[$type]['count']=($prePostTotals[$type]['count']??0)+1;
    }
    $prePost=[];
    foreach($prePostTotals as $type=>$values) $prePost[$type]=round($values['sum']/$values['count'],1);

    $attemptMap=[];
    foreach($attempts as $attempt) $attemptMap[(int)$attempt['id']]=$attempt;
    $answers=teacher_analysis_answer_rows(array_keys($attemptMap));
    $earned=0.0;$possible=0.0;$questionResponses=0;$testTotals=[];
    foreach($answers as $answer) {
        $points=max(0,(float)$answer['question_points']);
        if ($points<=0) continue;
        $attemptId=(int)$answer['attempt_id'];
        if (!isset($attemptMap[$attemptId])) continue;
        $testId=(int)$attemptMap[$attemptId]['test_id'];
        $earned+=(float)$answer['points_earned'];
        $possible+=$points;
        $questionResponses++;
        $testTotals[$testId]['title']=$attemptMap[$attemptId]['title'];
        $testTotals[$testId]['type']=$attemptMap[$attemptId]['test_type'];
        $testTotals[$testId]['earned']=($testTotals[$testId]['earned']??0)+(float)$answer['points_earned'];
        $testTotals[$testId]['possible']=($testTotals[$testId]['possible']??0)+$points;
    }
    $overallQuestionMastery=$possible>0?round(100*$earned/$possible,1):0.0;
    $testMastery=[];
    foreach($testTotals as $testId=>$values) {
        $testMastery[]=[
            'testId'=>(int)$testId,
            'title'=>$values['title'],
            'type'=>$values['type'],
            'masteryPercent'=>$values['possible']>0?round(100*$values['earned']/$values['possible'],1):0,
        ];
    }
    usort($testMastery,static fn(array $a,array $b):int=>strcmp((string)$a['title'],(string)$b['title']));

    Http::json([
        'studentCount'=>$studentCount,
        'completedAttempts'=>$attemptCount,
        'average'=>$average,
        'highest'=>$highest,
        'lowest'=>$lowest,
        'passRate'=>$passRate,
        'overallQuestionMastery'=>$overallQuestionMastery,
        'questionResponseCount'=>$questionResponses,
        'distribution'=>$distribution,
        'prePost'=>$prePost,
        'testMastery'=>$testMastery,
    ]);
}

function teacher_analysis_question_mastery(int $teacherId): never
{
    $testId=max(0,(int)($_GET['testId']??0));
    if ($testId<1||!teacher_owns_test($teacherId,$testId)) Http::json(['error'=>'اختاري اختبارًا صالحًا.'],422);
    $test=fetch_one('SELECT id,title,test_type,question_source,class_id FROM tests WHERE id=? AND teacher_id=?',[$testId,$teacherId]);
    $attempts=teacher_analysis_latest_attempts($teacherId,0,$testId);
    $attemptMap=[];
    foreach($attempts as $attempt) $attemptMap[(int)$attempt['id']]=$attempt;
    $answers=teacher_analysis_answer_rows(array_keys($attemptMap));

    $groups=[];
    foreach($answers as $answer) {
        $sourceId=(int)($answer['source_question_id']??0);
        $bankId=(int)($answer['bank_question_id']??0);
        $skillId=(int)($answer['skill_id']??0);
        $orderIndex=max(1,(int)($answer['order_index']??1));
        if (($test['question_source']??'static')==='lesson_bank'&&$skillId>0) $key='skill:'.$skillId;
        elseif ($sourceId>0) $key='source:'.$sourceId;
        elseif ($bankId>0) $key='bank:'.$bankId;
        else $key='order:'.$orderIndex;

        if (!isset($groups[$key])) {
            $groups[$key]=[
                'orderIndex'=>$orderIndex,
                'skillId'=>$skillId?:null,
                'skillName'=>(string)($answer['skill_name']??'غير مرتبطة بمهارة'),
                'questionText'=>(string)($answer['question_text']??''),
                'responses'=>0,
                'correctResponses'=>0,
                'earnedPoints'=>0.0,
                'possiblePoints'=>0.0,
                'variants'=>[],
            ];
        }
        $groups[$key]['orderIndex']=min($groups[$key]['orderIndex'],$orderIndex);
        $groups[$key]['responses']++;
        if ((int)($answer['is_correct']??0)===1) $groups[$key]['correctResponses']++;
        $groups[$key]['earnedPoints']+=(float)$answer['points_earned'];
        $groups[$key]['possiblePoints']+=max(0,(float)$answer['question_points']);
        $text=trim((string)($answer['question_text']??''));
        if ($text!=='') $groups[$key]['variants'][$text]=true;
    }

    $items=[];
    foreach($groups as $group) {
        $possible=(float)$group['possiblePoints'];
        $responses=(int)$group['responses'];
        $items[]=[
            'orderIndex'=>(int)$group['orderIndex'],
            'skillId'=>$group['skillId'],
            'skillName'=>$group['skillName'],
            'questionText'=>$group['questionText'],
            'responses'=>$responses,
            'correctResponses'=>(int)$group['correctResponses'],
            'masteryPercent'=>$possible>0?round(100*(float)$group['earnedPoints']/$possible,1):0,
            'correctPercent'=>$responses>0?round(100*(int)$group['correctResponses']/$responses,1):0,
            'variantsCount'=>count($group['variants']),
        ];
    }
    usort($items,static function(array $a,array $b):int {
        $order=$a['orderIndex']<=>$b['orderIndex'];
        return $order!==0?$order:strcmp((string)$a['skillName'],(string)$b['skillName']);
    });
    foreach($items as $index=>&$item) $item['number']=$index+1;
    unset($item);

    $totalEarned=array_sum(array_column($groups,'earnedPoints'));
    $totalPossible=array_sum(array_column($groups,'possiblePoints'));
    Http::json([
        'test'=>[
            'id'=>(int)$test['id'],
            'title'=>$test['title'],
            'type'=>$test['test_type'],
            'questionSource'=>$test['question_source'],
        ],
        'studentCount'=>count($attempts),
        'overallMastery'=>$totalPossible>0?round(100*$totalEarned/$totalPossible,1):0,
        'items'=>$items,
    ]);
}

function teacher_analysis_gradebook(int $teacherId): never
{
    $classId=max(0,(int)($_GET['classId']??0));
    if ($classId&&!teacher_owns_class($teacherId,$classId)) Http::json(['error'=>'الفصل غير موجود.'],404);

    $testWhere='t.teacher_id=?';$testParams=[$teacherId];
    if ($classId>0) {$testWhere.=' AND t.class_id=?';$testParams[]=$classId;}
    $tests=fetch_all(
        "SELECT t.id,t.title,t.test_type AS type,t.status,t.class_id,t.total_points,t.created_at,c.name AS class_name
         FROM tests t LEFT JOIN classes c ON c.id=t.class_id
         WHERE {$testWhere} ORDER BY t.created_at,t.id",
        $testParams
    );
    $tests=array_map(static fn(array $row):array=>[
        'id'=>(int)$row['id'],
        'title'=>$row['title'],
        'type'=>$row['type'],
        'status'=>$row['status'],
        'classId'=>$row['class_id']!==null?(int)$row['class_id']:null,
        'className'=>$row['class_name']??'—',
        'totalPoints'=>(float)$row['total_points'],
        'createdAt'=>$row['created_at'],
    ],$tests);

    $studentWhere='c.teacher_id=?';$studentParams=[$teacherId];
    if ($classId>0) {$studentWhere.=' AND c.id=?';$studentParams[]=$classId;}
    $students=fetch_all(
        "SELECT s.id,s.email,s.name,s.class_id,c.name AS class_name
         FROM students s JOIN classes c ON c.id=s.class_id
         WHERE {$studentWhere} ORDER BY c.name,s.name",
        $studentParams
    );

    $attempts=teacher_analysis_latest_attempts($teacherId,$classId);
    $scores=[];
    foreach($attempts as $attempt) {
        $scores[(int)$attempt['student_id']][(int)$attempt['test_id']]=[
            'score'=>(float)$attempt['score'],
            'totalPoints'=>(float)$attempt['total_points'],
            'percentage'=>(float)$attempt['percentage'],
            'submittedAt'=>$attempt['submitted_at'],
        ];
    }
    $rows=[];
    foreach($students as $student) {
        $rows[]=[
            'studentId'=>(int)$student['id'],
            'email'=>$student['email'],
            'name'=>$student['name'],
            'classId'=>(int)$student['class_id'],
            'className'=>$student['class_name'],
            'scores'=>$scores[(int)$student['id']]??new stdClass(),
        ];
    }
    Http::json(['tests'=>$tests,'rows'=>$rows]);
}

function teacher_analysis_skills(int $teacherId): never
{
    $skills=fetch_all(
        'SELECT sk.id,sk.name,ROUND(COALESCE(AVG(ss.mastery_percent),0),1) AS averageMastery,
                SUM(ss.mastery_percent>=70) AS masteredCount,SUM(ss.mastery_percent<50) AS needsSupportCount
         FROM skills sk JOIN student_skills ss ON ss.skill_id=sk.id JOIN students s ON s.id=ss.student_id JOIN classes c ON c.id=s.class_id
         WHERE c.teacher_id=? GROUP BY sk.id,sk.name ORDER BY averageMastery DESC',[$teacherId]
    );
    foreach($skills as &$skill){$skill['needsSupportStudents']=fetch_all('SELECT s.id,s.name,ss.mastery_percent FROM student_skills ss JOIN students s ON s.id=ss.student_id JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND ss.skill_id=? AND ss.mastery_percent<50 ORDER BY ss.mastery_percent',[$teacherId,$skill['id']]);}
    unset($skill);
    Http::json($skills);
}

function teacher_analysis_learning_styles(int $teacherId): never
{
    $rows=fetch_all(
        "SELECT s.learning_style AS style,COUNT(*) AS count,ROUND(AVG(s.progress_percent),1) AS average_progress
         FROM students s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? GROUP BY s.learning_style",[$teacherId]
    );
    $recommendations=[
        'visual'=>'استخدمي الرسوم والمخططات وخطوات الحل الملونة.',
        'auditory'=>'استخدمي الشرح الشفهي والنقاش وتلخيص الفكرة بصوت الطالبة.',
        'reading_writing'=>'استخدمي الملخصات المكتوبة وبطاقات المفاهيم والأسئلة المقالية القصيرة.',
        'kinesthetic'=>'استخدمي النماذج والمحسوسات والأنشطة التطبيقية وحل المسائل الواقعية.',
        'mixed'=>'نوّعي بين العرض المرئي والنقاش والكتابة والتطبيق.',
        'unknown'=>'اطلبي من الطالبة إكمال الاستبانة الإرشادية.',
    ];
    Http::json(['items'=>$rows,'recommendations'=>$recommendations,'notice'=>'أنماط التعلم نتيجة إرشادية مرنة وليست تشخيصًا ثابتًا.']);
}

// ============================================================================
// مساحة تحليل النتائج الموحّدة
// ============================================================================

function teacher_analysis_query_text(string $key,int $maxLength=190): string
{
    return mb_substr(trim((string)($_GET[$key]??'')),0,$maxLength);
}

function teacher_analysis_grade_key(string $stage,string $gradeLabel): string
{
    $text=preg_replace('/\s+/u',' ',trim($gradeLabel))??trim($gradeLabel);
    $text=preg_replace('/^الصف\s+/u','',$text)??$text;
    $ordinal='';
    if (preg_match('/(?:الأول|الاول|أول|اول)/u',$text)) $ordinal='أول';
    elseif (preg_match('/(?:الثاني|ثاني)/u',$text)) $ordinal='ثاني';
    elseif (preg_match('/(?:الثالث|ثالث)/u',$text)) $ordinal='ثالث';
    elseif (preg_match('/(?:الرابع|رابع)/u',$text)) $ordinal='رابع';
    elseif (preg_match('/(?:الخامس|خامس)/u',$text)) $ordinal='خامس';
    elseif (preg_match('/(?:السادس|سادس)/u',$text)) $ordinal='سادس';
    return $ordinal!==''&&in_array($stage,['ابتدائي','متوسط','ثانوي'],true)
        ? $ordinal.' '.$stage
        : $text;
}

function teacher_analysis_option(mixed $value,string $label,array $extra=[]): array
{
    return array_merge(['value'=>(string)$value,'label'=>$label],$extra);
}

function teacher_analysis_unique_options(array $options): array
{
    $unique=[];
    foreach($options as $option) {
        $value=(string)($option['value']??'');
        if ($value===''||isset($unique[$value])) continue;
        $unique[$value]=$option;
    }
    return array_values($unique);
}

function teacher_analysis_percent(float $earned,float $possible): float
{
    return $possible>0?round(max(0,min(100,100*$earned/$possible)),1):0.0;
}

function teacher_analysis_number(float $value): int|float
{
    $rounded=round($value,1);
    return abs($rounded-round($rounded))<0.001?(int)round($rounded):$rounded;
}

function teacher_analysis_summary(array $percentages,int $students,int $responses): array
{
    $values=array_values(array_filter(array_map('floatval',$percentages),static fn(float $value):bool=>is_finite($value)));
    return [
        ['label'=>'عدد الطالبات','value'=>$students,'suffix'=>''],
        ['label'=>'عدد النتائج','value'=>$responses,'suffix'=>''],
        ['label'=>'المتوسط العام','value'=>$values?round(array_sum($values)/count($values),1):0,'suffix'=>'%'],
        ['label'=>'أعلى نسبة','value'=>$values?round(max($values),1):0,'suffix'=>'%'],
        ['label'=>'أدنى نسبة','value'=>$values?round(min($values),1):0,'suffix'=>'%'],
    ];
}

function teacher_analysis_empty_report(string $category,string $message,string $status='empty'): array
{
    return [
        'status'=>$status,
        'category'=>$category,
        'title'=>'تحليل النتائج',
        'message'=>$message,
        'summary'=>[],
        'charts'=>[],
        'tables'=>[],
    ];
}

function teacher_analysis_workspace_context(int $teacherId): array
{
    $category=teacher_analysis_query_text('category',30);
    if (!in_array($category,['diagnostic','short','games','periodic','final'],true)) $category='diagnostic';
    $subtype=teacher_analysis_query_text('subtype',30);
    $view=teacher_analysis_query_text('view',20)==='skill'?'skill':'student';
    $stage=teacher_analysis_query_text('stage',30);
    if (!in_array($stage,['','all','ابتدائي','متوسط','ثانوي'],true)) $stage='';
    $gradeLabel=teacher_analysis_query_text('gradeLabel',80);
    if ($gradeLabel==='all') $gradeLabel='';
    $classId=max(0,(int)($_GET['classId']??0));
    if ($classId>0&&!teacher_owns_class($teacherId,$classId)) Http::json(['error'=>'الفصل المحدد غير موجود.'],404);
    $semester=teacher_analysis_query_text('semester',20);
    if (!in_array($semester,['','all','first','second'],true)) $semester='';
    if ($semester==='all') $semester='';
    $testType=teacher_analysis_query_text('testType',30);
    if (!in_array($testType,['','pre_diagnostic','post_diagnostic','quiz'],true)) $testType='';
    $testId=max(0,(int)($_GET['testId']??0));
    if ($testId>0&&!teacher_owns_test($teacherId,$testId)) Http::json(['error'=>'الاختبار المحدد غير موجود.'],404);
    $studentId=max(0,(int)($_GET['studentId']??0));
    if ($studentId>0&&!teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'الطالبة المحددة غير موجودة.'],404);
    return [
        'category'=>$category,'subtype'=>$subtype,'view'=>$view,'stage'=>$stage,
        'gradeLabel'=>$gradeLabel,'classId'=>$classId,'semester'=>$semester,
        'academicYear'=>teacher_analysis_query_text('academicYear',30),
        'subject'=>teacher_analysis_query_text('subject'),'unit'=>teacher_analysis_query_text('unit'),
        'lesson'=>teacher_analysis_query_text('lesson'),'testType'=>$testType,'testId'=>$testId,
        'studentId'=>$studentId,'skillId'=>max(0,(int)($_GET['skillId']??0)),
    ];
}

function teacher_analysis_row_matches_context(array $row,array $context): bool
{
    if ($context['classId']>0&&(int)($row['class_id']??0)!==$context['classId']) return false;
    $stage=(string)($row['class_stage']??$row['stage']??'');
    if ($context['stage']!==''&&$context['stage']!=='all'&&$stage!==$context['stage']) return false;
    if ($context['gradeLabel']!=='') {
        $rowGrade=teacher_analysis_grade_key($stage,(string)($row['class_grade_label']??$row['grade_label']??''));
        if ($rowGrade!==teacher_analysis_grade_key($context['stage']!==''?$context['stage']:$stage,$context['gradeLabel'])) return false;
    }
    if ($context['semester']!==''&&(string)($row['semester']??'')!==$context['semester']) return false;
    return true;
}

function teacher_analysis_test_type_matches(array $row,array $context): bool
{
    $type=(string)($row['test_type']??'');
    if ($context['testType']!==''&&$type!==$context['testType']) return false;
    return match($context['category']) {
        'diagnostic' => match($context['subtype']) {
            'pre' => $type==='pre_diagnostic',
            'post' => $type==='post_diagnostic',
            default => in_array($type,['pre_diagnostic','post_diagnostic'],true),
        },
        'short' => $type==='quiz',
        default => false,
    };
}

function teacher_analysis_context_answer_matches(array $answer,array $context,string $defaultSubject): bool
{
    $subject=trim((string)($answer['subject_name']??''))?:$defaultSubject;
    if ($context['subject']!==''&&$subject!==$context['subject']) return false;
    if ($context['unit']!==''&&trim((string)($answer['unit_name']??''))!==$context['unit']) return false;
    if ($context['lesson']!==''&&trim((string)($answer['lesson_name']??''))!==$context['lesson']) return false;
    if ($context['skillId']>0&&(int)($answer['skill_id']??0)!==$context['skillId']) return false;
    return true;
}

function teacher_analysis_workspace_options(int $teacherId,array $context,string $defaultSubject): array
{
    $classes=fetch_all('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE teacher_id=? ORDER BY FIELD(stage,\'ابتدائي\',\'متوسط\',\'ثانوي\'),grade_label,name',[$teacherId]);
    $classOptions=[];
    foreach($classes as $class) {
        if (!teacher_analysis_row_matches_context([
            'class_id'=>$class['id'],'class_stage'=>$class['stage'],'class_grade_label'=>$class['grade_label'],'semester'=>$context['semester'],
        ],array_merge($context,['classId'=>0,'semester'=>'']))) continue;
        $classOptions[]=teacher_analysis_option($class['id'],(string)$class['name'],[
            'stage'=>$class['stage'],'gradeLabel'=>$class['grade_label'],'academicYear'=>$class['academic_year'],
        ]);
    }

    $studentRows=fetch_all(
        'SELECT s.id,s.name,s.class_id,c.name AS class_name,c.stage,c.grade_label FROM students s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=? AND s.deleted_at IS NULL AND s.status=\'active\' ORDER BY c.name,s.name',
        [$teacherId]
    );
    $studentOptions=[];
    foreach($studentRows as $student) {
        if (!teacher_analysis_row_matches_context([
            'class_id'=>$student['class_id'],'class_stage'=>$student['stage'],'class_grade_label'=>$student['grade_label'],'semester'=>$context['semester'],
        ],array_merge($context,['semester'=>'']))) continue;
        $studentOptions[]=teacher_analysis_option($student['id'],(string)$student['name'],['classId'=>(int)$student['class_id'],'className'=>$student['class_name']]);
    }

    $testRows=fetch_all(
        'SELECT t.id,t.title,t.test_type,t.status,t.class_id,t.semester,t.created_at,c.name AS class_name,c.stage AS class_stage,c.grade_label AS class_grade_label FROM tests t LEFT JOIN classes c ON c.id=t.class_id WHERE t.teacher_id=? ORDER BY t.created_at,t.id',
        [$teacherId]
    );
    $testOptions=[];
    foreach($testRows as $test) {
        if (!teacher_analysis_row_matches_context($test,$context)) continue;
        if (!teacher_analysis_test_type_matches($test,array_merge($context,['testType'=>'']))) continue;
        $testOptions[]=teacher_analysis_option($test['id'],(string)$test['title'],[
            'type'=>$test['test_type'],'status'=>$test['status'],'classId'=>$test['class_id']!==null?(int)$test['class_id']:null,
            'className'=>$test['class_name']??'—','semester'=>$test['semester'],'createdAt'=>$test['created_at'],
        ]);
    }

    $contexts=fetch_all(
        "SELECT DISTINCT t.id AS test_id,t.test_type,t.semester,t.class_id,c.stage AS class_stage,c.grade_label AS class_grade_label,
                COALESCE(NULLIF(qb.subject_name,''),'') AS subject_name,
                COALESCE(NULLIF(qb.unit_name,''),NULLIF(qb.chapter_name,''),'') AS unit_name,
                COALESCE(NULLIF(qb.lesson_name,''),NULLIF(qb.topic,''),'') AS lesson_name,
                COALESCE(aq.skill_id,tq.skill_id) AS skill_id,
                COALESCE(NULLIF(aq.skill_name,''),sk.name,'') AS skill_name
         FROM answers an
         JOIN test_attempts a ON a.id=an.attempt_id AND a.status IN ('submitted','graded')
         JOIN tests t ON t.id=a.test_id AND t.teacher_id=?
         JOIN students s ON s.id=a.student_id
         JOIN classes c ON c.id=s.class_id AND c.teacher_id=t.teacher_id
         LEFT JOIN test_attempt_questions aq ON aq.id=an.attempt_question_id
         LEFT JOIN test_questions tq ON tq.id=an.question_id
         LEFT JOIN question_bank qb ON qb.id=COALESCE(aq.bank_question_id,tq.bank_question_id)
         LEFT JOIN skills sk ON sk.id=COALESCE(aq.skill_id,tq.skill_id)",
        [$teacherId]
    );
    $subjects=$defaultSubject!==''?[teacher_analysis_option($defaultSubject,$defaultSubject)]:[];
    $units=[];$lessons=[];$skills=[];
    foreach($contexts as $row) {
        if (!teacher_analysis_row_matches_context($row,$context)) continue;
        if (!teacher_analysis_test_type_matches($row,array_merge($context,['testType'=>'']))) continue;
        if ($context['testId']>0&&(int)$row['test_id']!==$context['testId']) continue;
        $subject=trim((string)$row['subject_name'])?:$defaultSubject;
        if ($subject!=='') $subjects[]=teacher_analysis_option($subject,$subject);
        if ($context['subject']!==''&&$subject!==$context['subject']) continue;
        $unit=trim((string)$row['unit_name']);
        if ($unit!=='') $units[]=teacher_analysis_option($unit,$unit);
        if ($context['unit']!==''&&$unit!==$context['unit']) continue;
        $lesson=trim((string)$row['lesson_name']);
        if ($lesson!=='') $lessons[]=teacher_analysis_option($lesson,$lesson);
        $skillId=(int)($row['skill_id']??0);
        $skillName=trim((string)($row['skill_name']??''));
        if ($skillId>0&&$skillName!=='') $skills[]=teacher_analysis_option($skillId,$skillName);
    }

    $gameOptions=[];
    if ($context['category']==='games'&&interactive_games_schema_ready()) {
        $builderReady=function_exists('interactive_game_builder_schema_ready')&&interactive_game_builder_schema_ready();
        $gameRows=fetch_all($builderReady
            ? 'SELECT id,game_key,name,subject_name,lesson_name,unit_number,lesson_number,stage,grade_label,semester,class_id,is_active,current_version_id FROM teacher_interactive_games WHERE teacher_id=? AND deleted_at IS NULL ORDER BY lesson_name,game_key'
            : 'SELECT id,game_key,lesson_name,unit_number,lesson_number,stage,grade_label,semester,class_id,is_active FROM teacher_interactive_games WHERE teacher_id=? ORDER BY lesson_name,game_key',[$teacherId]);
        $subjects=$defaultSubject!==''?[teacher_analysis_option($defaultSubject,$defaultSubject)]:[];
        $units=[];$lessons=[];$skills=[];
        foreach($gameRows as $game) {
            if ($context['classId']>0&&$game['class_id']!==null&&(int)$game['class_id']!==$context['classId']) continue;
            if ($context['stage']!==''&&$context['stage']!=='all'&&$game['stage']!=='all'&&$game['stage']!==$context['stage']) continue;
            if ($context['gradeLabel']!==''&&$game['grade_label']!=='all') {
                $gameStage=$game['stage']==='all'?$context['stage']:(string)$game['stage'];
                if (teacher_analysis_grade_key($gameStage,(string)$game['grade_label'])!==teacher_analysis_grade_key($context['stage'],$context['gradeLabel'])) continue;
            }
            if ($context['semester']!==''&&(string)($game['semester']??'')!==$context['semester']) continue;
            $displayName=trim((string)($game['name']??''))?:trim((string)$game['lesson_name']);
            $gameOptions[]=teacher_analysis_option($game['game_key'],$displayName,['isActive'=>(bool)$game['is_active']]);
            $gameSubject=trim((string)($game['subject_name']??''));if($gameSubject!=='')$subjects[]=teacher_analysis_option($gameSubject,$gameSubject);
            $units[]=teacher_analysis_option($game['unit_number'],'الوحدة '.$game['unit_number']);
            $lessons[]=teacher_analysis_option($game['lesson_name'],(string)$game['lesson_name'],['lessonNumber'=>(int)$game['lesson_number']]);
        }
        if($builderReady) {
            $skillRows=fetch_all(
                'SELECT DISTINCT sk.id,sk.name FROM interactive_game_version_skills vs JOIN interactive_game_versions v ON v.id=vs.version_id JOIN teacher_interactive_games g ON g.id=v.game_id JOIN skills sk ON sk.id=vs.skill_id WHERE g.teacher_id=? AND g.deleted_at IS NULL ORDER BY sk.name',
                [$teacherId]
            );
            foreach($skillRows as $skill) $skills[]=teacher_analysis_option($skill['id'],(string)$skill['name']);
        }
    }

    $testTypeOptions=match($context['category']) {
        'diagnostic'=>[
            teacher_analysis_option('pre_diagnostic','تشخيصي قبلي'),
            teacher_analysis_option('post_diagnostic','تشخيصي بعدي'),
        ],
        'short'=>[teacher_analysis_option('quiz','اختبار قصير')],
        default=>[],
    };
    return [
        'classes'=>$classOptions,
        'students'=>$studentOptions,
        'subjects'=>teacher_analysis_unique_options($subjects),
        'units'=>teacher_analysis_unique_options($units),
        'lessons'=>teacher_analysis_unique_options($lessons),
        'tests'=>$testOptions,
        'testTypes'=>$testTypeOptions,
        'skills'=>teacher_analysis_unique_options($skills),
        'periods'=>[
            teacher_analysis_option('first','الفصل الدراسي الأول'),
            teacher_analysis_option('second','الفصل الدراسي الثاني'),
        ],
        'games'=>$gameOptions,
    ];
}

function teacher_analysis_workspace(int $teacherId): never
{
    $context=teacher_analysis_workspace_context($teacherId);
    $settings=fetch_one('SELECT subject_name,current_semester,academic_year FROM teacher_school_settings WHERE teacher_id=? LIMIT 1',[$teacherId])?:[];
    $defaultSubject=trim((string)($settings['subject_name']??''));
    if ($context['academicYear']==='') $context['academicYear']=trim((string)($settings['academic_year']??''));
    $options=teacher_analysis_workspace_options($teacherId,$context,$defaultSubject);
    $report=match($context['category']) {
        'diagnostic','short' => teacher_analysis_test_workspace_report($teacherId,$context,$defaultSubject),
        'games' => teacher_analysis_game_workspace_report($teacherId,$context),
        'periodic','final' => teacher_analysis_follow_up_workspace_report($teacherId,$context),
    };
    Http::json([
        'selection'=>$context,
        'filters'=>$options,
        'report'=>$report,
        'availability'=>[
            'diagnostic'=>['available'=>true,'reason'=>''],
            'short'=>['available'=>true,'reason'=>''],
            'games'=>['available'=>interactive_games_schema_ready(),'reason'=>interactive_games_schema_ready()?'':'جدول إعدادات الألعاب غير متاح.'],
            'periodic'=>['available'=>true,'reason'=>'تتوفر الدرجة الإجمالية من سجل المتابعة؛ لا تتوفر أسئلة للاختبار الفتري.'],
            'final'=>['available'=>true,'reason'=>'تتوفر الدرجة الإجمالية من سجل المتابعة؛ لا تتوفر أسئلة للاختبار النهائي.'],
        ],
        'meta'=>[
            'subjectName'=>$defaultSubject,
            'academicYear'=>$settings['academic_year']??'',
            'currentSemester'=>$settings['current_semester']??'',
            'generatedAt'=>date(DATE_ATOM),
        ],
    ]);
}

function teacher_analysis_attempts_for_context(int $teacherId,array $context,string $defaultSubject): array
{
    $attempts=teacher_analysis_latest_attempts(
        $teacherId,
        $context['classId'],
        $context['testId'],
        $context['studentId']>0?$context['studentId']:null
    );
    $attempts=array_values(array_filter($attempts,static function(array $row) use($context): bool {
        return teacher_analysis_row_matches_context($row,$context)
            && teacher_analysis_test_type_matches($row,$context);
    }));
    if (!$attempts) return [];

    $attemptMap=[];
    foreach($attempts as $attempt) $attemptMap[(int)$attempt['id']]=$attempt;
    $answersByAttempt=[];
    foreach(teacher_analysis_answer_rows(array_keys($attemptMap)) as $answer) {
        $attemptId=(int)$answer['attempt_id'];
        if (isset($attemptMap[$attemptId])) $answersByAttempt[$attemptId][]=$answer;
    }
    $contentFiltered=$context['subject']!==''||$context['unit']!==''||$context['lesson']!==''||$context['skillId']>0;
    $results=[];
    foreach($attempts as $attempt) {
        $attemptId=(int)$attempt['id'];
        $answers=array_values(array_filter(
            $answersByAttempt[$attemptId]??[],
            static fn(array $answer):bool=>teacher_analysis_context_answer_matches($answer,$context,$defaultSubject)
        ));
        if ($contentFiltered&&!$answers) continue;
        if ($answers) {
            $earned=array_sum(array_map(static fn(array $answer):float=>(float)$answer['points_earned'],$answers));
            $possible=array_sum(array_map(static fn(array $answer):float=>max(0,(float)$answer['question_points']),$answers));
        } else {
            $earned=(float)$attempt['score'];
            $possible=(float)$attempt['total_points'];
        }
        $attempt['analysis_score']=$earned;
        $attempt['analysis_total']=$possible;
        $attempt['analysis_percentage']=teacher_analysis_percent($earned,$possible);
        $attempt['analysis_answers']=$answers;
        $results[]=$attempt;
    }
    return $results;
}

function teacher_analysis_test_workspace_report(int $teacherId,array $context,string $defaultSubject): array
{
    $attempts=teacher_analysis_attempts_for_context($teacherId,$context,$defaultSubject);
    if ($context['category']==='diagnostic'&&$context['subtype']==='compare') {
        return teacher_analysis_diagnostic_comparison_report($attempts,$context);
    }
    if ($context['category']==='short'&&$context['subtype']==='compare') {
        return teacher_analysis_short_comparison_report($attempts,$context);
    }
    if (!$attempts) return teacher_analysis_empty_report(
        $context['category'],
        $context['category']==='short'
            ? 'لا توجد نتائج اختبارات قصيرة مطابقة للفلاتر المحددة.'
            : 'لا توجد نتائج تشخيصية مطابقة للفلاتر المحددة.'
    );
    return $context['view']==='skill'
        ? teacher_analysis_test_skill_report($attempts,$context)
        : teacher_analysis_test_student_report($attempts,$context);
}

function teacher_analysis_test_title(array $context): string
{
    if ($context['category']==='short') return 'تحليل الاختبارات القصيرة';
    return match($context['subtype']) {
        'post'=>'تحليل الاختبار التشخيصي البعدي',
        'compare'=>'مقارنة الاختبار التشخيصي القبلي والبعدي',
        default=>'تحليل الاختبار التشخيصي القبلي',
    };
}

function teacher_analysis_test_student_report(array $attempts,array $context): array
{
    $students=[];
    foreach($attempts as $attempt) {
        $studentId=(int)$attempt['student_id'];
        if (!isset($students[$studentId])) {
            $students[$studentId]=[
                'studentId'=>$studentId,'student'=>(string)$attempt['student_name'],'class'=>(string)($attempt['class_name']??'—'),
                'score'=>0.0,'total'=>0.0,'attempts'=>0,'details'=>[],
            ];
        }
        $students[$studentId]['score']+=(float)$attempt['analysis_score'];
        $students[$studentId]['total']+=(float)$attempt['analysis_total'];
        $students[$studentId]['attempts']++;
        $students[$studentId]['details'][]=$attempt;
    }
    foreach($students as &$student) $student['percentage']=teacher_analysis_percent($student['score'],$student['total']);
    unset($student);
    uasort($students,static fn(array $a,array $b):int=>strcmp($a['student'],$b['student']));
    $items=array_values($students);
    $percentages=array_column($items,'percentage');
    $charts=[[
        'title'=>$context['studentId']>0?'نتائج الاختبارات للطالبة المحددة':'مقارنة نسب الطالبات',
        'type'=>'bar','labels'=>array_column($items,'student'),
        'series'=>[['label'=>'نسبة الإتقان','values'=>$percentages,'color'=>'#6b3fa0']],
    ]];
    if (count($items)===1) {
        $detail=$items[0]['details'];
        $charts[0]=[
            'title'=>'نتائج '.$items[0]['student'].' حسب الاختبار','type'=>'bar',
            'labels'=>array_map(static fn(array $row):string=>(string)$row['title'],$detail),
            'series'=>[['label'=>'النسبة','values'=>array_map(static fn(array $row):float=>(float)$row['analysis_percentage'],$detail),'color'=>'#6b3fa0']],
        ];
        $questionLabels=[];$questionValues=[];
        foreach($detail as $attempt) {
            foreach($attempt['analysis_answers'] as $answer) {
                $questionLabels[]='س'.max(1,(int)$answer['order_index']);
                $questionValues[]=teacher_analysis_percent((float)$answer['points_earned'],(float)$answer['question_points']);
            }
        }
        if ($questionLabels) $charts[]=[
            'title'=>'إتقان الأسئلة للطالبة','type'=>'bar','labels'=>$questionLabels,
            'series'=>[['label'=>'نسبة السؤال','values'=>$questionValues,'color'=>'#1f9d91']],
        ];
    }
    $rows=array_map(static fn(array $student):array=>[
        'student'=>$student['student'],'class'=>$student['class'],
        'score'=>teacher_analysis_number($student['score']),'maximum'=>teacher_analysis_number($student['total']),
        'percentage'=>$student['percentage'],'attempts'=>$student['attempts'],
    ],$items);
    $tables=[[
        'title'=>'درجات الطالبات والتحليل الإحصائي',
        'columns'=>[
            ['key'=>'student','label'=>'الطالبة'],['key'=>'class','label'=>'الفصل'],
            ['key'=>'score','label'=>'الدرجة'],['key'=>'maximum','label'=>'الدرجة العظمى'],
            ['key'=>'percentage','label'=>'النسبة','format'=>'percent'],['key'=>'attempts','label'=>'عدد الاختبارات'],
        ],
        'rows'=>$rows,
    ]];
    if (count($items)===1) {
        $details=[];
        foreach($items[0]['details'] as $attempt) $details[]=[
            'test'=>$attempt['title'],'type'=>$attempt['test_type'],'score'=>teacher_analysis_number((float)$attempt['analysis_score']),
            'maximum'=>teacher_analysis_number((float)$attempt['analysis_total']),'percentage'=>$attempt['analysis_percentage'],
            'date'=>$attempt['submitted_at'],
        ];
        $tables[]=[
            'title'=>'تفاصيل اختبارات '.$items[0]['student'],
            'columns'=>[
                ['key'=>'test','label'=>'الاختبار'],['key'=>'type','label'=>'النوع','format'=>'testType'],
                ['key'=>'score','label'=>'الدرجة'],['key'=>'maximum','label'=>'الدرجة العظمى'],
                ['key'=>'percentage','label'=>'النسبة','format'=>'percent'],['key'=>'date','label'=>'التاريخ','format'=>'date'],
            ],'rows'=>$details,
        ];
    }
    return [
        'status'=>'ready','category'=>$context['category'],'title'=>teacher_analysis_test_title($context),'message'=>'',
        'summary'=>teacher_analysis_summary($percentages,count($items),count($attempts)),
        'charts'=>$charts,'tables'=>$tables,
    ];
}

function teacher_analysis_test_skill_report(array $attempts,array $context): array
{
    $groups=[];
    foreach($attempts as $attempt) {
        foreach($attempt['analysis_answers'] as $answer) {
            $skillId=(int)($answer['skill_id']??0);
            $skillName=trim((string)($answer['skill_name']??''))?:'غير مرتبطة بمهارة';
            $key=$skillId>0?'skill:'.$skillId:'name:'.$skillName;
            if (!isset($groups[$key])) $groups[$key]=['skill'=>$skillName,'score'=>0.0,'maximum'=>0.0,'responses'=>0];
            $groups[$key]['score']+=(float)$answer['points_earned'];
            $groups[$key]['maximum']+=max(0,(float)$answer['question_points']);
            $groups[$key]['responses']++;
        }
    }
    if (!$groups) return teacher_analysis_empty_report($context['category'],'لا توجد إجابات مرتبطة بمهارات ضمن النتائج المحددة.');
    foreach($groups as &$group) $group['percentage']=teacher_analysis_percent($group['score'],$group['maximum']);
    unset($group);
    uasort($groups,static fn(array $a,array $b):int=>$b['percentage']<=>$a['percentage']);
    $rows=array_values(array_map(static fn(array $group):array=>[
        'skill'=>$group['skill'],'score'=>teacher_analysis_number($group['score']),'maximum'=>teacher_analysis_number($group['maximum']),
        'percentage'=>$group['percentage'],'responses'=>$group['responses'],
    ],$groups));
    $percentages=array_column($rows,'percentage');
    return [
        'status'=>'ready','category'=>$context['category'],'title'=>teacher_analysis_test_title($context),'message'=>'',
        'summary'=>teacher_analysis_summary($percentages,count(array_unique(array_column($attempts,'student_id'))),count($attempts)),
        'charts'=>[ ['title'=>'نسبة الإتقان حسب المهارة','type'=>'bar','labels'=>array_column($rows,'skill'),'series'=>[['label'=>'الإتقان','values'=>$percentages,'color'=>'#1f9d91']]] ],
        'tables'=>[ ['title'=>'تحليل المهارات من إجابات الطالبات','columns'=>[
            ['key'=>'skill','label'=>'المهارة'],['key'=>'score','label'=>'مجموع الدرجات'],['key'=>'maximum','label'=>'المجموع الممكن'],
            ['key'=>'percentage','label'=>'نسبة الإتقان','format'=>'percent'],['key'=>'responses','label'=>'عدد الإجابات'],
        ],'rows'=>$rows] ],
    ];
}

function teacher_analysis_diagnostic_comparison_report(array $attempts,array $context): array
{
    $students=[];$skills=[];
    foreach($attempts as $attempt) {
        $type=(string)$attempt['test_type'];
        if (!in_array($type,['pre_diagnostic','post_diagnostic'],true)) continue;
        $studentId=(int)$attempt['student_id'];
        if (!isset($students[$studentId])) $students[$studentId]=['student'=>$attempt['student_name'],'class'=>$attempt['class_name']??'—'];
        $students[$studentId][$type]['score']=($students[$studentId][$type]['score']??0)+(float)$attempt['analysis_score'];
        $students[$studentId][$type]['maximum']=($students[$studentId][$type]['maximum']??0)+(float)$attempt['analysis_total'];
        foreach($attempt['analysis_answers'] as $answer) {
            $skillName=trim((string)($answer['skill_name']??''))?:'غير مرتبطة بمهارة';
            $skillId=(int)($answer['skill_id']??0);
            $key=$skillId>0?'skill:'.$skillId:'name:'.$skillName;
            if (!isset($skills[$key])) $skills[$key]=['skill'=>$skillName];
            $skills[$key][$type]['score']=($skills[$key][$type]['score']??0)+(float)$answer['points_earned'];
            $skills[$key][$type]['maximum']=($skills[$key][$type]['maximum']??0)+max(0,(float)$answer['question_points']);
        }
    }
    if (!$students) return teacher_analysis_empty_report('diagnostic','لا توجد نتائج تشخيصية قبلية أو بعدية مطابقة للفلاتر.');
    if ($context['view']==='skill') {
        $rows=[];
        foreach($skills as $skill) {
            $pre=isset($skill['pre_diagnostic'])?teacher_analysis_percent((float)$skill['pre_diagnostic']['score'],(float)$skill['pre_diagnostic']['maximum']):null;
            $post=isset($skill['post_diagnostic'])?teacher_analysis_percent((float)$skill['post_diagnostic']['score'],(float)$skill['post_diagnostic']['maximum']):null;
            $rows[]=['skill'=>$skill['skill'],'pre'=>$pre,'post'=>$post,'improvement'=>$pre!==null&&$post!==null?round($post-$pre,1):null];
        }
        return [
            'status'=>'ready','category'=>'diagnostic','title'=>'مقارنة التشخيص القبلي والبعدي حسب المهارة','message'=>'تتم المقارنة على المهارة المشتركة، وليس على رقم سؤال مفترض بين اختبارين مختلفين.',
            'summary'=>teacher_analysis_summary(array_values(array_filter(array_column($rows,'post'),static fn($v)=>$v!==null)),count(array_unique(array_column($attempts,'student_id'))),count($attempts)),
            'charts'=>[ ['title'=>'الإتقان القبلي والبعدي حسب المهارة','type'=>'bar','labels'=>array_column($rows,'skill'),'series'=>[
                ['label'=>'قبلي','values'=>array_column($rows,'pre'),'color'=>'#8d78aa'],['label'=>'بعدي','values'=>array_column($rows,'post'),'color'=>'#1f9d91'],
            ]] ],
            'tables'=>[ ['title'=>'تحسن المهارات','columns'=>[
                ['key'=>'skill','label'=>'المهارة'],['key'=>'pre','label'=>'القبلي','format'=>'percent'],['key'=>'post','label'=>'البعدي','format'=>'percent'],['key'=>'improvement','label'=>'التحسن','format'=>'signedPercent'],
            ],'rows'=>$rows] ],
        ];
    }
    $rows=[];
    foreach($students as $student) {
        $pre=isset($student['pre_diagnostic'])?teacher_analysis_percent((float)$student['pre_diagnostic']['score'],(float)$student['pre_diagnostic']['maximum']):null;
        $post=isset($student['post_diagnostic'])?teacher_analysis_percent((float)$student['post_diagnostic']['score'],(float)$student['post_diagnostic']['maximum']):null;
        $rows[]=['student'=>$student['student'],'class'=>$student['class'],'pre'=>$pre,'post'=>$post,'improvement'=>$pre!==null&&$post!==null?round($post-$pre,1):null];
    }
    usort($rows,static fn(array $a,array $b):int=>strcmp((string)$a['student'],(string)$b['student']));
    $postValues=array_values(array_filter(array_column($rows,'post'),static fn($value):bool=>$value!==null));
    return [
        'status'=>'ready','category'=>'diagnostic','title'=>'مقارنة الاختبار التشخيصي القبلي والبعدي','message'=>'تُحتسب آخر محاولة مكتملة لكل اختبار، ثم تجمع نتائج كل نوع للطالبة نفسها.',
        'summary'=>teacher_analysis_summary($postValues,count($rows),count($attempts)),
        'charts'=>[
            ['title'=>'المقارنة القبلية والبعدية','type'=>'bar','labels'=>array_column($rows,'student'),'series'=>[
                ['label'=>'قبلي','values'=>array_column($rows,'pre'),'color'=>'#8d78aa'],['label'=>'بعدي','values'=>array_column($rows,'post'),'color'=>'#1f9d91'],
            ]],
            ['title'=>'مقدار التحسن','type'=>'bar','labels'=>array_column($rows,'student'),'series'=>[['label'=>'التحسن','values'=>array_column($rows,'improvement'),'color'=>'#ef8d32']]],
        ],
        'tables'=>[ ['title'=>'مقارنة الطالبات','columns'=>[
            ['key'=>'student','label'=>'الطالبة'],['key'=>'class','label'=>'الفصل'],['key'=>'pre','label'=>'القبلي','format'=>'percent'],
            ['key'=>'post','label'=>'البعدي','format'=>'percent'],['key'=>'improvement','label'=>'التحسن','format'=>'signedPercent'],
        ],'rows'=>$rows] ],
    ];
}

function teacher_analysis_short_comparison_report(array $attempts,array $context): array
{
    if (!$attempts) return teacher_analysis_empty_report('short','لا توجد نتائج اختبارات قصيرة متاحة للمقارنة.');
    $tests=[];$students=[];$scores=[];
    foreach($attempts as $attempt) {
        $testId=(int)$attempt['test_id'];$studentId=(int)$attempt['student_id'];
        $tests[$testId]=(string)$attempt['title'];
        $students[$studentId]=(string)$attempt['student_name'];
        $scores[$studentId][$testId]=(float)$attempt['analysis_percentage'];
    }
    asort($tests,SORT_NATURAL);asort($students,SORT_NATURAL);
    $allValues=[];
    if ($context['studentId']>0&&isset($students[$context['studentId']])) {
        $studentId=$context['studentId'];$rows=[];
        foreach($tests as $testId=>$title) {
            $value=$scores[$studentId][$testId]??null;
            if ($value!==null) $allValues[]=$value;
            $rows[]=['test'=>$title,'percentage'=>$value];
        }
        return [
            'status'=>'ready','category'=>'short','title'=>'مقارنة الاختبارات القصيرة للطالبة','message'=>'',
            'summary'=>teacher_analysis_summary($allValues,1,count($allValues)),
            'charts'=>[ ['title'=>'تطور الطالبة في الاختبارات القصيرة','type'=>'bar','labels'=>array_column($rows,'test'),'series'=>[['label'=>'النسبة','values'=>array_column($rows,'percentage'),'color'=>'#6b3fa0']]] ],
            'tables'=>[ ['title'=>'نتائج '.$students[$studentId],'columns'=>[['key'=>'test','label'=>'الاختبار'],['key'=>'percentage','label'=>'النسبة','format'=>'percent']],'rows'=>$rows] ],
        ];
    }
    $rows=[];$columns=[['key'=>'student','label'=>'الطالبة']];$series=[];
    foreach($tests as $testId=>$title) {
        $key='test_'.$testId;$columns[]=['key'=>$key,'label'=>$title,'format'=>'percent'];
        $series[]=['label'=>$title,'values'=>[],'color'=>count($series)%2===0?'#6b3fa0':'#1f9d91','testKey'=>$key];
    }
    foreach($students as $studentId=>$name) {
        $row=['student'=>$name];
        foreach($tests as $testId=>$title) {
            $value=$scores[$studentId][$testId]??null;$row['test_'.$testId]=$value;
            if ($value!==null) $allValues[]=$value;
        }
        $rows[]=$row;
    }
    foreach($series as &$item) $item['values']=array_map(static fn(array $row)=>$row[$item['testKey']]??null,$rows);
    unset($item);
    foreach($series as &$item) unset($item['testKey']);
    unset($item);
    return [
        'status'=>'ready','category'=>'short','title'=>'مقارنة الاختبارات القصيرة','message'=>'تُعرض الاختبارات القصيرة المسجلة بأسمائها الحقيقية دون افتراض ترتيب ثابت.',
        'summary'=>teacher_analysis_summary($allValues,count($rows),count($attempts)),
        'charts'=>[ ['title'=>'مقارنة نتائج الاختبارات القصيرة','type'=>'bar','labels'=>array_column($rows,'student'),'series'=>$series] ],
        'tables'=>[ ['title'=>'درجات الطالبات في الاختبارات القصيرة','columns'=>$columns,'rows'=>$rows] ],
    ];
}

function teacher_analysis_game_workspace_report(int $teacherId,array $context): array
{
    if (!interactive_games_schema_ready()) {
        return teacher_analysis_empty_report('games','لا يمكن تحميل نتائج الألعاب لأن جدول إعدادات الألعاب غير متاح.','unsupported');
    }
    $builderReady=function_exists('interactive_game_builder_schema_ready')&&interactive_game_builder_schema_ready();
    if($builderReady) {
        $rows=fetch_all(
            "SELECT a.id,a.student_id,a.game_key,a.game_id,a.game_version_id,a.result_source,a.difficulty,a.score,a.max_score,a.question_count,a.correct_count,a.best_streak,a.accuracy,a.duration_seconds,a.played_at,
                    s.name AS student_name,s.class_id,c.name AS class_name,c.stage AS class_stage,c.grade_label AS class_grade_label,c.academic_year AS class_academic_year,
                    COALESCE(NULLIF(g.name,''),g.lesson_name,a.game_key) AS game_name,g.lesson_name,g.unit_number,g.lesson_number,g.stage AS game_stage,g.grade_label AS game_grade_label,
                    COALESCE(p.semester,g.semester) AS semester,g.class_id AS game_class_id
             FROM game_attempts a
             JOIN students s ON s.id=a.student_id AND s.deleted_at IS NULL
             JOIN classes c ON c.id=s.class_id AND c.teacher_id=?
             LEFT JOIN teacher_interactive_games g ON g.teacher_id=c.teacher_id AND ((a.game_id IS NOT NULL AND g.id=a.game_id) OR (a.game_id IS NULL AND g.game_key=a.game_key))
             LEFT JOIN interactive_game_publications p ON p.id=a.publication_id
             WHERE (a.run_status='completed' OR a.run_status IS NULL) AND NOT EXISTS (
                 SELECT 1 FROM game_attempts newer
                 WHERE newer.student_id=a.student_id AND (newer.run_status='completed' OR newer.run_status IS NULL)
                   AND ((a.game_id IS NOT NULL AND newer.game_id=a.game_id) OR (a.game_id IS NULL AND newer.game_id IS NULL AND newer.game_key=a.game_key))
                   AND (newer.played_at>a.played_at OR (newer.played_at=a.played_at AND newer.id>a.id))
             )
             ORDER BY s.name,game_name",
            [$teacherId]
        );
    } else {
        $rows=fetch_all(
            "SELECT a.id,a.student_id,a.game_key,a.difficulty,a.score,a.question_count,a.correct_count,a.best_streak,a.accuracy,a.duration_seconds,a.played_at,
                    s.name AS student_name,s.class_id,c.name AS class_name,c.stage AS class_stage,c.grade_label AS class_grade_label,c.academic_year AS class_academic_year,
                    g.lesson_name AS game_name,g.lesson_name,g.unit_number,g.lesson_number,g.stage AS game_stage,g.grade_label AS game_grade_label,g.semester,g.class_id AS game_class_id
             FROM game_attempts a
             JOIN students s ON s.id=a.student_id
             JOIN classes c ON c.id=s.class_id AND c.teacher_id=?
             JOIN teacher_interactive_games g ON g.teacher_id=c.teacher_id AND g.game_key=a.game_key
             WHERE NOT EXISTS (
                 SELECT 1 FROM game_attempts newer
                 WHERE newer.student_id=a.student_id AND newer.game_key=a.game_key
                   AND (newer.played_at>a.played_at OR (newer.played_at=a.played_at AND newer.id>a.id))
             )
             ORDER BY s.name,g.lesson_name",
            [$teacherId]
        );
    }
    $rows=array_values(array_filter($rows,static function(array $row) use($context): bool {
        if (!teacher_analysis_row_matches_context($row,$context)) return false;
        if ($context['studentId']>0&&(int)$row['student_id']!==$context['studentId']) return false;
        if ($context['academicYear']!==''&&(string)($row['class_academic_year']??'')!==$context['academicYear']) return false;
        if ($context['semester']!==''&&(string)($row['semester']??'')!==$context['semester']) return false;
        if ($context['unit']!==''&&(string)$row['unit_number']!==$context['unit']) return false;
        if ($context['lesson']!==''&&(string)$row['lesson_name']!==$context['lesson']) return false;
        return true;
    }));
    if (!$rows) return teacher_analysis_empty_report('games','لا توجد نتائج ألعاب تفاعلية مطابقة للفلاتر المحددة.');

    if ($context['view']==='skill') {
        if(!$builderReady) return teacher_analysis_empty_report('games','لا تتوفر روابط مهارات لنتائج الألعاب القديمة. اربطي المهارات بإصدارات الألعاب الجديدة أولًا.','limited');
        $attemptIds=array_map('intval',array_column($rows,'id'));$placeholders=implode(',',array_fill(0,count($attemptIds),'?'));
        $skillEvidence=fetch_all(
            "SELECT e.attempt_id,e.skill_id,e.question_count,e.correct_count,e.points_earned,e.max_points,e.verification_source,sk.name AS skill_name,a.student_id
             FROM interactive_game_attempt_skills e JOIN skills sk ON sk.id=e.skill_id JOIN game_attempts a ON a.id=e.attempt_id
             WHERE e.attempt_id IN ($placeholders) ORDER BY sk.name,e.attempt_id",
            $attemptIds
        );
        if($context['skillId']>0)$skillEvidence=array_values(array_filter($skillEvidence,static fn(array $item):bool=>(int)$item['skill_id']===$context['skillId']));
        if(!$skillEvidence)return teacher_analysis_empty_report('games','لا توجد نتائج مرتبطة بمهارات ضمن أحدث محاولات الألعاب المحددة.','limited');
        $groups=[];
        foreach($skillEvidence as $item) {
            $skillId=(int)$item['skill_id'];
            if(!isset($groups[$skillId]))$groups[$skillId]=['skill'=>(string)$item['skill_name'],'questions'=>0,'correct'=>0,'points'=>0.0,'maximum'=>0.0,'students'=>[],'attempts'=>0,'verified'=>0,'reported'=>0];
            $groups[$skillId]['questions']+=(int)$item['question_count'];$groups[$skillId]['correct']+=(int)$item['correct_count'];
            $groups[$skillId]['points']+=(float)$item['points_earned'];$groups[$skillId]['maximum']+=(float)$item['max_points'];
            $groups[$skillId]['students'][(int)$item['student_id']]=true;$groups[$skillId]['attempts']+=1;
            $item['verification_source']==='server_verified'?$groups[$skillId]['verified']++:$groups[$skillId]['reported']++;
        }
        $skillRows=[];
        foreach($groups as $group)$skillRows[]=[
            'skill'=>$group['skill'],'students'=>count($group['students']),'attempts'=>$group['attempts'],'questions'=>$group['questions'],'correct'=>$group['correct'],
            'score'=>teacher_analysis_number($group['points']),'maximum'=>teacher_analysis_number($group['maximum']),
            'percentage'=>$group['maximum']>0?teacher_analysis_percent($group['points'],$group['maximum']):teacher_analysis_percent((float)$group['correct'],(float)$group['questions']),
            'verification'=>$group['reported']>0?'مبلّغة من الحزمة':'متحقق منها في الخادم',
        ];
        $percentages=array_column($skillRows,'percentage');
        return [
            'status'=>'ready','category'=>'games','title'=>'تحليل الألعاب حسب المهارة','message'=>'تعرض النتيجة المهارات المرتبطة بأحدث محاولة لكل طالبة، مع توضيح مصدر التحقق.',
            'summary'=>teacher_analysis_summary($percentages,count(array_unique(array_column($rows,'student_id'))),count($rows)),
            'charts'=>[ ['title'=>'نسبة الإتقان حسب المهارة','type'=>'bar','labels'=>array_column($skillRows,'skill'),'series'=>[['label'=>'الإتقان','values'=>$percentages,'color'=>'#ef8d32']]] ],
            'tables'=>[ ['title'=>'إحصاءات المهارات من الألعاب','columns'=>[
                ['key'=>'skill','label'=>'المهارة'],['key'=>'students','label'=>'عدد الطالبات'],['key'=>'attempts','label'=>'النتائج'],
                ['key'=>'correct','label'=>'الإجابات الصحيحة'],['key'=>'questions','label'=>'عدد الأسئلة'],['key'=>'percentage','label'=>'الإتقان','format'=>'percent'],['key'=>'verification','label'=>'مصدر النتيجة'],
            ],'rows'=>$skillRows] ],
        ];
    }

    $students=[];
    foreach($rows as $row) {
        $studentId=(int)$row['student_id'];
        if (!isset($students[$studentId])) $students[$studentId]=[
            'student'=>$row['student_name'],'class'=>$row['class_name'],'score'=>0,'correct'=>0,'questions'=>0,'duration'=>0,'games'=>[],
        ];
        $students[$studentId]['score']+=(int)$row['score'];
        $students[$studentId]['correct']+=(int)$row['correct_count'];
        $students[$studentId]['questions']+=(int)$row['question_count'];
        $students[$studentId]['duration']+=(int)$row['duration_seconds'];
        $students[$studentId]['games'][]=$row;
    }
    $studentRows=[];
    foreach($students as $student) $studentRows[]=[
        'student'=>$student['student'],'class'=>$student['class'],'score'=>$student['score'],
        'percentage'=>teacher_analysis_percent((float)$student['correct'],(float)$student['questions']),
        'correct'=>$student['correct'],'questions'=>$student['questions'],'games'=>count($student['games']),'duration'=>$student['duration'],
    ];
    $percentages=array_column($studentRows,'percentage');
    $charts=[ ['title'=>'دقة الطالبات في الألعاب','type'=>'bar','labels'=>array_column($studentRows,'student'),'series'=>[['label'=>'الدقة','values'=>$percentages,'color'=>'#ef8d32']]] ];
    $tables=[ ['title'=>'نتائج الطالبات في الألعاب','columns'=>[
        ['key'=>'student','label'=>'الطالبة'],['key'=>'class','label'=>'الفصل'],['key'=>'score','label'=>'النقاط'],
        ['key'=>'correct','label'=>'الإجابات الصحيحة'],['key'=>'questions','label'=>'عدد الأسئلة'],['key'=>'percentage','label'=>'الدقة','format'=>'percent'],
        ['key'=>'duration','label'=>'الوقت','format'=>'duration'],
    ],'rows'=>$studentRows] ];
    if (count($students)===1) {
        $student=reset($students);$details=[];
        foreach($student['games'] as $game) $details[]=[
            'game'=>$game['game_name'],'unitLesson'=>$game['unit_number'].'-'.$game['lesson_number'],'difficulty'=>$game['difficulty'],
            'score'=>(int)$game['score'],'correct'=>(int)$game['correct_count'],'questions'=>(int)$game['question_count'],
            'percentage'=>(float)$game['accuracy'],'bestStreak'=>(int)$game['best_streak'],'duration'=>(int)$game['duration_seconds'],'date'=>$game['played_at'],
        ];
        $charts[]=[
            'title'=>'نتائج '.$student['student'].' حسب اللعبة','type'=>'bar','labels'=>array_column($details,'game'),
            'series'=>[['label'=>'الدقة','values'=>array_column($details,'percentage'),'color'=>'#1f9d91']],
        ];
        $tables[]=[ 'title'=>'تفاصيل أحدث محاولات '.$student['student'],'columns'=>[
            ['key'=>'game','label'=>'اللعبة'],['key'=>'unitLesson','label'=>'الوحدة-الدرس'],['key'=>'difficulty','label'=>'المستوى','format'=>'difficulty'],
            ['key'=>'score','label'=>'النقاط'],['key'=>'correct','label'=>'صحيحة'],['key'=>'questions','label'=>'الأسئلة'],
            ['key'=>'percentage','label'=>'الدقة','format'=>'percent'],['key'=>'bestStreak','label'=>'أفضل سلسلة'],
            ['key'=>'duration','label'=>'الوقت','format'=>'duration'],['key'=>'date','label'=>'التاريخ','format'=>'date'],
        ],'rows'=>$details ];
    }
    return [
        'status'=>'ready','category'=>'games','title'=>'تحليل الألعاب التفاعلية','message'=>'تعرض النتيجة أحدث محاولة لكل طالبة في كل لعبة.',
        'summary'=>teacher_analysis_summary($percentages,count($studentRows),count($rows)),
        'charts'=>$charts,'tables'=>$tables,
    ];
}

function teacher_analysis_follow_up_workspace_report(int $teacherId,array $context): array
{
    if ($context['view']==='skill') return teacher_analysis_empty_report(
        $context['category'],
        $context['category']==='periodic'
            ? 'يتوفر للاختبار الفتري مجموع الدرجة فقط في سجل المتابعة، ولا توجد أسئلة أو مهارات مرتبطة به لتحليلها.'
            : 'يتوفر للاختبار النهائي مجموع الدرجة فقط في سجل المتابعة، ولا توجد أسئلة أو مهارات مرتبطة به لتحليلها.',
        'limited'
    );
    $period=$context['category']==='final'?3:($context['subtype']==='second'?2:1);
    $scoreColumn=$context['category']==='final'?'final_exam_score':'periodic_test_score';
    $maxColumn=$context['category']==='final'?'final_exam_max':'periodic_test_max';
    $where=['f.teacher_id=?','f.period_no=?','f.'.$scoreColumn.' IS NOT NULL'];
    $params=[$teacherId,$period];
    if ($context['academicYear']!=='') {$where[]='f.academic_year=?';$params[]=$context['academicYear'];}
    if ($context['semester']!=='') {$where[]='f.semester=?';$params[]=$context['semester'];}
    if ($context['classId']>0) {$where[]='c.id=?';$params[]=$context['classId'];}
    if ($context['studentId']>0) {$where[]='s.id=?';$params[]=$context['studentId'];}
    if ($context['stage']!==''&&$context['stage']!=='all') {$where[]='c.stage=?';$params[]=$context['stage'];}
    $rows=fetch_all(
        "SELECT s.id AS student_id,s.name AS student_name,c.id AS class_id,c.name AS class_name,c.stage,c.grade_label,
                f.{$scoreColumn} AS score,f.academic_year,f.semester,fs.{$maxColumn} AS maximum,f.updated_at
         FROM student_follow_up f
         JOIN students s ON s.id=f.student_id
         JOIN classes c ON c.id=s.class_id AND c.teacher_id=f.teacher_id
         LEFT JOIN follow_up_settings fs ON fs.teacher_id=f.teacher_id AND fs.period_no=f.period_no AND fs.academic_year=f.academic_year AND fs.semester=f.semester
         WHERE ".implode(' AND ',$where)." ORDER BY s.name",
        $params
    );
    $rows=array_values(array_filter($rows,static function(array $row) use($context):bool {
        if ($context['gradeLabel']==='') return true;
        return teacher_analysis_grade_key((string)$row['stage'],(string)$row['grade_label'])
            ===teacher_analysis_grade_key($context['stage']!==''?$context['stage']:(string)$row['stage'],$context['gradeLabel']);
    }));
    if (!$rows) return teacher_analysis_empty_report(
        $context['category'],
        $context['category']==='periodic'
            ? 'لا توجد درجات اختبار فتري مسجلة للفترة والفلاتر المحددة.'
            : 'لا توجد درجات اختبار نهائي مسجلة للفلاتر المحددة.'
    );
    $missingMaximum=false;$resultRows=[];
    foreach($rows as $row) {
        $maximum=$row['maximum']===null?0.0:(float)$row['maximum'];
        if ($maximum<=0) {$missingMaximum=true;continue;}
        $score=(float)$row['score'];
        $resultRows[]=[
            'student'=>$row['student_name'],'class'=>$row['class_name'],'score'=>teacher_analysis_number($score),
            'maximum'=>teacher_analysis_number($maximum),'percentage'=>teacher_analysis_percent($score,$maximum),
            'academicYear'=>$row['academic_year'],'semester'=>$row['semester'],'date'=>$row['updated_at'],
        ];
    }
    if (!$resultRows) return teacher_analysis_empty_report(
        $context['category'],
        $missingMaximum?'توجد درجات مسجلة، لكن الدرجة العظمى غير مضبوطة في إعدادات سجل المتابعة.':'لا توجد نتائج متاحة.'
    );
    $percentages=array_column($resultRows,'percentage');
    $title=$context['category']==='final'?'تحليل الاختبار النهائي':'تحليل الاختبار الفتري — '.($period===2?'الفترة الثانية':'الفترة الأولى');
    return [
        'status'=>'ready','category'=>$context['category'],'title'=>$title,
        'message'=>'هذه النتائج درجات إجمالية من سجل المتابعة؛ لا تتوفر لها إجابات أسئلة أو مهارات تفصيلية.'.($missingMaximum?' استُبعدت سجلات لا تحتوي درجة عظمى مضبوطة.':''),
        'summary'=>teacher_analysis_summary($percentages,count($resultRows),count($resultRows)),
        'charts'=>[ ['title'=>'نسب الطالبات','type'=>'bar','labels'=>array_column($resultRows,'student'),'series'=>[['label'=>'النسبة','values'=>$percentages,'color'=>'#6b3fa0']]] ],
        'tables'=>[ ['title'=>'الدرجات المسجلة في سجل المتابعة','columns'=>[
            ['key'=>'student','label'=>'الطالبة'],['key'=>'class','label'=>'الفصل'],['key'=>'score','label'=>'الدرجة'],
            ['key'=>'maximum','label'=>'الدرجة العظمى'],['key'=>'percentage','label'=>'النسبة','format'=>'percent'],
            ['key'=>'academicYear','label'=>'العام الدراسي'],['key'=>'semester','label'=>'الفصل الدراسي','format'=>'semester'],['key'=>'date','label'=>'آخر تحديث','format'=>'date'],
        ],'rows'=>$resultRows] ],
    ];
}
