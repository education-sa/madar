<?php
declare(strict_types=1);

/**
 * جلسات ألعاب موثوقة على الخادم. لا تُرسل الإجابة الصحيحة إلى المتصفح قبل
 * اختيار الطالبة، ولا يقبل الخادم مجموعًا أو عدد إجابات صحيحًا من JavaScript.
 */

function game_session_level(string $difficulty): array
{
    return match ($difficulty) {
        'easy' => ['seconds'=>25,'multiplier'=>1.0],
        'medium' => ['seconds'=>22,'multiplier'=>1.35],
        'hard' => ['seconds'=>28,'multiplier'=>1.75],
        default => Http::json(['error'=>'مستوى اللعبة غير صالح.'],422),
    };
}

function game_session_pick(array $items): mixed
{
    return $items[random_int(0,count($items)-1)];
}

function game_session_number(float|int $value): float|int
{
    return abs($value-round($value))<0.00001 ? (int)round($value) : round($value,1);
}

function game_session_label(float|int $value,string $unit=''): string
{
    $number=game_session_number($value);
    return (string)$number.$unit;
}

function game_session_options(float|int $answer,array $candidates,string $unit=''): array
{
    $values=[];
    foreach([$answer,...$candidates] as $candidate){
        $value=game_session_number((float)$candidate);
        $values[(string)$value]=$value;
    }
    $bump=max(1,(int)round(abs((float)$answer)*.1));
    while(count($values)<4){
        $direction=count($values)%2?1:-1;
        $candidate=game_session_number(max(0,(float)$answer+($direction*$bump)));
        $values[(string)$candidate]=$candidate;
        $bump+=max(1,(int)round($bump*.5));
    }
    $values=array_slice(array_values($values),0,4);
    shuffle($values);
    return array_map(static fn($value):array=>['value'=>$value,'label'=>game_session_label($value,$unit)],$values);
}

function game_session_percentage_question(string $difficulty): array
{
    if($difficulty==='easy'){
        $type=game_session_pick(['part','part','percent','whole']);
        if($type==='part'){
            $percent=game_session_pick([10,20,25,50,75]);$base=game_session_pick([20,40,60,80,100,120,160,200]);$answer=$base*$percent/100;
            return ['text'=>"كم تساوي {$percent}% من العدد {$base}؟",'answer'=>$answer,'options'=>game_session_options($answer,[$answer+$base/10,$answer*2,$base-$answer]),'skill'=>'حساب نسبة من عدد','hint'=>'حوّلي النسبة إلى كسر من 100 واضربي في العدد','explanation'=>"{$percent}% × {$base} = ({$percent} ÷ 100) × {$base} = ".game_session_label($answer).'.'];
        }
        if($type==='percent'){
            $whole=game_session_pick([20,40,50,80,100,200]);$percent=game_session_pick([10,20,25,50,75]);$part=$whole*$percent/100;
            return ['text'=>'العدد '.game_session_label($part)." يمثّل كم بالمئة من {$whole}؟",'answer'=>$percent,'options'=>game_session_options($percent,[$percent+10,$percent*2,max(5,$percent-10)],'%'),'skill'=>'إيجاد النسبة المئوية','hint'=>'اقسمي الجزء على الكل ثم اضربي في 100','explanation'=>'('.game_session_label($part)." ÷ {$whole}) × 100 = {$percent}%."];
        }
        $percent=game_session_pick([10,20,25,50]);$whole=game_session_pick([40,60,80,100,120,160,200]);$part=$whole*$percent/100;
        return ['text'=>game_session_label($part)." تساوي {$percent}% من أي عدد؟",'answer'=>$whole,'options'=>game_session_options($whole,[$whole+20,$whole/2,$whole*2]),'skill'=>'إيجاد العدد الكلي','hint'=>'اقسمي الجزء على النسبة المئوية','explanation'=>game_session_label($part)." ÷ ({$percent} ÷ 100) = {$whole}."];
    }
    if($difficulty==='medium'){
        $type=game_session_pick(['discount','increase']);
        if($type==='discount'){
            $price=game_session_pick([80,120,160,200,240,300,400]);$percent=game_session_pick([10,15,20,25,30]);$discount=$price*$percent/100;$answer=$price-$discount;
            return ['text'=>"سعر حقيبة {$price} ريالاً، عليها خصم {$percent}%. كم يصبح سعرها بعد الخصم؟",'answer'=>$answer,'options'=>game_session_options($answer,[$discount,$price+$discount,$price-$percent],' ر.س'),'skill'=>'الخصم المئوي','hint'=>'احسبي قيمة الخصم ثم اطرحيها من السعر الأصلي','explanation'=>"الخصم = {$price} × {$percent}% = ".game_session_label($discount).' ريالاً، السعر بعد الخصم = '.game_session_label($answer).' ريالاً.'];
        }
        $original=game_session_pick([50,80,100,120,160,200]);$percent=game_session_pick([10,15,20,25]);$answer=$original*(1+$percent/100);
        return ['text'=>"زادت قيمة {$original} بنسبة {$percent}%. ما القيمة الجديدة؟",'answer'=>$answer,'options'=>game_session_options($answer,[$original-$original*$percent/100,$original+$percent,$original*$percent/100]),'skill'=>'الزيادة المئوية','hint'=>'أضيفي مقدار الزيادة إلى القيمة الأصلية','explanation'=>'القيمة الجديدة = '.game_session_label($answer).'.'];
    }
    $discount=game_session_pick([15,20,25,30]);$original=game_session_pick([120,160,200,240,300,400]);$sale=$original*(1-$discount/100);
    return ['text'=>"بعد خصم {$discount}% أصبح سعر فستان ".game_session_label($sale).' ريالاً. ما سعره الأصلي قبل الخصم؟','answer'=>$original,'options'=>game_session_options($original,[$sale+$discount,$sale/($discount/100),$original-$sale],' ر.س'),'skill'=>'النسبة العكسية','hint'=>'السعر الجديد يمثّل '.(100-$discount).'% من الأصلي','explanation'=>'السعر الأصلي = '.game_session_label($sale).' ÷ '.game_session_label((100-$discount)/100)." = {$original} ريالاً."];
}

function game_session_public_question(array $question,int $index): array
{
    return [
        'index'=>$index,
        'text'=>(string)$question['text'],
        'skill'=>(string)$question['skill'],
        'hint'=>(string)$question['hint'],
        'options'=>array_map(static fn(array $option,int $id):array=>['id'=>$id,'label'=>(string)$option['label']],$question['options'],array_keys($question['options'])),
    ];
}

function game_session_cleanup(): void
{
    $runs=is_array($_SESSION['interactive_game_runs']??null)?$_SESSION['interactive_game_runs']:[];
    $cutoff=time()-7200;
    foreach($runs as $id=>$run)if((int)($run['startedAt']??0)<$cutoff)unset($runs[$id]);
    if(count($runs)>8){
        uasort($runs,static fn(array $a,array $b):int=>(int)($a['startedAt']??0)<=>(int)($b['startedAt']??0));
        while(count($runs)>8)array_shift($runs);
    }
    $_SESSION['interactive_game_runs']=$runs;
}

function student_game_session_start(int $studentId): never
{
    $data=Http::input();
    Http::requireFields($data,['gameKey','difficulty','questionCount']);
    $gameKey=interactive_game_key($data['gameKey']);
    $difficulty=(string)$data['difficulty'];
    game_session_level($difficulty);
    $questionCount=filter_var($data['questionCount'],FILTER_VALIDATE_INT);
    if(!in_array($questionCount,[5,10,15],true))Http::json(['error'=>'عدد أسئلة الجولة غير صالح.'],422);

    [$student,$settings,$game]=student_game_context($studentId,$gameKey);
    if(!interactive_game_is_configured($game)||!(bool)($game['is_active']??false)||!interactive_game_targets_student($game,(string)$student['stage_label'],(string)$student['grade_label'],(int)$student['class_id'],(string)($settings['current_semester']??''))){
        Http::json(['error'=>'اللعبة غير مكتملة أو غير منشورة لفصلكِ حاليًا.'],422);
    }
    $questions=[];for($index=0;$index<$questionCount;$index++)$questions[]=game_session_percentage_question($difficulty);
    $id=bin2hex(random_bytes(24));
    game_session_cleanup();
    $_SESSION['interactive_game_runs'][$id]=[
        'studentId'=>$studentId,'gameKey'=>$gameKey,'difficulty'=>$difficulty,'questions'=>$questions,'index'=>0,
        'score'=>0,'correct'=>0,'streak'=>0,'bestStreak'=>0,'startedAt'=>time(),'questionStartedAt'=>microtime(true),'savedAttemptId'=>null,
        'timeMode'=>(string)($game['time_mode']??'open'),'timeSeconds'=>(int)($game['time_per_question_seconds']??0),
        'snapshot'=>['student'=>$student,'settings'=>$settings,'game'=>$game,'context'=>student_game_academic_context($student,$settings)],
    ];
    Http::json(['sessionId'=>$id,'questions'=>array_map('game_session_public_question',$questions,array_keys($questions))],201);
}

function student_game_session_answer(int $studentId,string $sessionId): never
{
    if(!preg_match('/^[a-f0-9]{48}$/',$sessionId))Http::json(['error'=>'جلسة اللعبة غير صالحة.'],422);
    game_session_cleanup();
    if(!isset($_SESSION['interactive_game_runs'][$sessionId]))Http::json(['error'=>'انتهت جلسة اللعبة. ابدئي جولة جديدة.'],410);
    $run=&$_SESSION['interactive_game_runs'][$sessionId];
    if((int)$run['studentId']!==$studentId)Http::json(['error'=>'جلسة اللعبة لا تخص هذا الحساب.'],403);
    if($run['savedAttemptId']!==null)Http::json(['error'=>'تم حفظ هذه الجولة مسبقًا.'],409);
    $index=(int)$run['index'];$questions=$run['questions'];
    if(!isset($questions[$index]))Http::json(['error'=>'اكتملت أسئلة الجولة. احفظي النتيجة الآن.'],409);
    $data=Http::input();
    $submittedIndex=filter_var($data['questionIndex']??null,FILTER_VALIDATE_INT);
    if($submittedIndex===false||$submittedIndex!==$index)Http::json(['error'=>'ترتيب الإجابة لا يطابق جلسة اللعبة.'],409);
    $question=$questions[$index];$selected=$data['optionId']??null;$selectedId=null;
    if($selected!==null){$selectedId=filter_var($selected,FILTER_VALIDATE_INT);if($selectedId===false||!isset($question['options'][$selectedId]))Http::json(['error'=>'الاختيار المرسل غير صالح.'],422);}
    $elapsed=max(0,microtime(true)-(float)$run['questionStartedAt']);
    $timed=$run['timeMode']==='timed'&&(int)$run['timeSeconds']>0;
    if($timed&&$elapsed>((int)$run['timeSeconds']+2))$selectedId=null;
    $correctOptionId=0;
    foreach($question['options'] as $optionId=>$option)if(abs((float)$option['value']-(float)$question['answer'])<.01){$correctOptionId=(int)$optionId;break;}
    $correct=$selectedId!==null&&$selectedId===$correctOptionId;
    if($correct){
        $run['correct']++;$run['streak']++;$run['bestStreak']=max((int)$run['bestStreak'],(int)$run['streak']);
        $level=game_session_level((string)$run['difficulty']);
        $remaining=$timed?max(0,(int)$run['timeSeconds']-(int)floor($elapsed)):0;
        $speedBonus=$timed?min($remaining,(int)$level['seconds'])*4:0;
        $streakBonus=min(50,max(0,(int)$run['streak']-1)*10);
        $run['score']+=(int)round((100+$speedBonus+$streakBonus)*(float)$level['multiplier']);
    }else{$run['streak']=0;}
    $run['index']=$index+1;$run['questionStartedAt']=microtime(true);
    Http::json([
        'correct'=>$correct,'correctOptionId'=>$correctOptionId,'explanation'=>(string)$question['explanation'],
        'score'=>(int)$run['score'],'correctCount'=>(int)$run['correct'],'streak'=>(int)$run['streak'],'bestStreak'=>(int)$run['bestStreak'],
        'completed'=>$run['index']>=count($questions),
    ]);
}

function student_game_session_completed(int $studentId,string $sessionId): array
{
    if(!preg_match('/^[a-f0-9]{48}$/',$sessionId))Http::json(['error'=>'جلسة اللعبة غير صالحة.'],422);
    game_session_cleanup();$run=$_SESSION['interactive_game_runs'][$sessionId]??null;
    if(!$run)Http::json(['error'=>'انتهت جلسة اللعبة. لا يمكن حفظ نتيجة غير موثقة.'],410);
    if((int)$run['studentId']!==$studentId)Http::json(['error'=>'جلسة اللعبة لا تخص هذا الحساب.'],403);
    if($run['savedAttemptId']!==null)Http::json(['error'=>'تم حفظ هذه الجولة مسبقًا.'],409);
    if((int)$run['index']!==count($run['questions']))Http::json(['error'=>'لم تكتمل جميع أسئلة الجولة بعد.'],409);
    return $run;
}

function student_game_session_mark_saved(string $sessionId,int $attemptId): void
{
    if(isset($_SESSION['interactive_game_runs'][$sessionId]))$_SESSION['interactive_game_runs'][$sessionId]['savedAttemptId']=$attemptId;
}
