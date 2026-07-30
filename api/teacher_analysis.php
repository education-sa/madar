<?php
declare(strict_types=1);

function teacher_analysis_routes(string $method,array $segments,int $teacherId): never
{
    if ($method!=='GET') Http::json(['error'=>'الطريقة غير مسموحة.'],405);
    ensure_diagnostic_bank_schema();
    ensure_test_context_columns();
    $resource=$segments[0]??'';
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
    $where=["t.teacher_id=?","a.status IN ('submitted','graded')"];
    $params=[$teacherId];
    if ($classId>0) {$where[]='s.class_id=?';$params[]=$classId;}
    if ($testId>0) {$where[]='t.id=?';$params[]=$testId;}
    if ($studentId!==null&&$studentId>0) {$where[]='s.id=?';$params[]=$studentId;}

    $rows=fetch_all(
        "SELECT a.id,a.test_id,a.student_id,a.attempt_no,a.status,a.score,a.total_points,a.percentage,a.submitted_at,
                t.title,t.test_type,t.question_source,t.class_id,t.created_at AS test_created_at,
                s.name AS student_name,s.email AS student_email,c.name AS class_name
         FROM test_attempts a
         JOIN tests t ON t.id=a.test_id
         JOIN students s ON s.id=a.student_id
         LEFT JOIN classes c ON c.id=s.class_id
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
                aq.bank_question_id,aq.source_question_id,an.question_id
         FROM answers an
         LEFT JOIN test_attempt_questions aq ON aq.id=an.attempt_question_id
         LEFT JOIN test_questions q ON q.id=an.question_id
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
