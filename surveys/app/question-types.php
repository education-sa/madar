<?php
declare(strict_types=1);
/** Shared question schema and answer validation. Existing rating/choice payloads stay unchanged. */
function msDefinition(array $input): array {
 $axes=$input['axes']??null;
 if (!is_array($axes)||count($axes)<1||count($axes)>30) fail('أضيفي بين محور واحد و30 محورًا.');
 $clean=[];$total=0;$seen=[];
 foreach($axes as $a){
  if(!is_array($a)) fail('محور غير صالح.');
  $qs=$a['qs']??null;
  if(!is_array($qs)||count($qs)<1||count($qs)>100) fail('كل محور يحتاج سؤالًا واحدًا على الأقل.');
  $questions=[];
  foreach($qs as $q){
   if(!is_array($q)||++$total>300) fail('سؤال غير صالح أو تجاوز الحد الأقصى 300 سؤال.');
   $type=$q['type']??'rating3';
   if(!in_array($type,['rating3','rating5','choice','multi','short','long','stars','boolean','grid'],true)) fail('نوع السؤال غير مدعوم.');
   $opts=$q['options']??[];
   if(!is_array($opts)||count($opts)>10) fail('الحد الأعلى 10 خيارات.');
   $opts=array_map(static fn($v)=>required($v,120),$opts);
   if(count(array_unique($opts))!==count($opts)) fail('خيارات الإجابة متكررة.');
   if(in_array($type,['rating3','rating5','choice','multi','grid','stars','boolean'],true)&&count($opts)<2) fail('أضيفي خيارين على الأقل.');
   if(in_array($type,['short','long'],true)) $opts=[];
   if($type==='rating3'&&$opts!==['لا','نوعاً ما','نعم']) fail('ترتيب المقياس الثلاثي: لا، نوعاً ما، نعم.');
   if($type==='rating5'&&$opts!==['1','2','3','4','5']) fail('المقياس الخماسي من 1 إلى 5.');
   if($type==='stars'&&$opts!==['1','2','3','4','5']) fail('مقياس النجوم من 1 إلى 5.');
   if($type==='boolean'&&$opts!==['صح','خطأ']) fail('خيارات صح أو خطأ يجب أن تكون: صح، خطأ.');
   $rows=[];
   if($type==='grid') {
    $rows=$q['rows']??null;
    if(!is_array($rows)||count($rows)<1||count($rows)>12) fail('الجدول يحتاج 1 إلى 12 عبارة.');
    $rows=array_map(static fn($r)=>required($r,200),$rows);
    if(count(array_unique($rows))!==count($rows)) fail('عبارات الجدول متكررة.');
   }
   $condition=$q['showIf']??null;
   if($condition!==null) {
    if(!is_array($condition)||!isset($condition['question'],$condition['option'])||!is_int($condition['question'])||!is_int($condition['option'])) fail('شرط ظهور السؤال غير صالح.');
    $ref=$condition['question'];$option=$condition['option'];
    if($ref<1||$ref>=$total||!isset($seen[$ref])||!in_array($seen[$ref]['type'],['rating3','rating5','choice','stars','boolean'],true)||$option<0||$option>=count($seen[$ref]['options'])) fail('السؤال المشروط يجب أن يعتمد على سؤال اختيار سابق.');
    $condition=['question'=>$ref,'option'=>$option];
   }
   $normalized=['text'=>required($q['text']??'',1000),'options'=>$opts,'type'=>$type,'reverse'=>in_array($type,['rating3','rating5','stars'],true)&&!empty($q['reverse']), 'required'=>!array_key_exists('required',$q)||$q['required']===true];
   if($type==='grid') $normalized['rows']=$rows;
   if($condition!==null)$normalized['showIf']=$condition;
   $seen[$total]=$normalized;
   $questions[]=$normalized;
  }
  $clean[]=['name'=>required($a['name']??'',200),'qs'=>$questions];
 }
 return ['axes'=>$clean];
}
function msVisibleQuestion(array $q,array $answers): bool {
 if(!isset($q['showIf'])) return true;
 $c=$q['showIf'];return isset($answers['q'.$c['question']])&&$answers['q'.$c['question']]===$c['option'];
}
function msValidateAnswers(array $definition,$answers): array {
 if(!is_array($answers)) fail('إجابات غير صالحة.');
 $valid=[];$all=[];$number=0;$seen=[];
 foreach($definition['axes'] as $axis)foreach($axis['qs'] as $q){
  $key='q'.(++$number);$all[$key]=true;
  $visible=msVisibleQuestion($q,$valid);
  if(!$visible)continue;
  $value=$answers[$key]??null;$required=$q['required']??true;
  if($value===null||$value===''||$value===[]){if($required)fail('أجيبي عن السؤال رقم '.$number.'.');continue;}
  $type=$q['type']??'rating3';
  if($type==='multi') {
   if(!is_array($value)||count($value)<1||count($value)>count($q['options']))fail('اختيارات متعددة غير صالحة للسؤال '.$number.'.');
   foreach($value as $v)if(!is_int($v)||$v<0||$v>=count($q['options']))fail('اختيار متعدد غير صالح.');
   if(count(array_unique($value))!==count($value))fail('لا يمكن تكرار الاختيار.');
   sort($value,SORT_NUMERIC);
  } elseif(in_array($type,['short','long'],true)) {
   if(!is_string($value)||mb_strlen(trim($value))>($type==='short'?300:4000))fail('نص الإجابة أطول من المسموح.');
   $value=trim($value);if($required&&$value==='')fail('أجيبي عن السؤال رقم '.$number.'.');
  } elseif($type==='grid') {
   if(!is_array($value)||count($value)!==count($q['rows']))fail('أكملي جدول التقييم.');
   $clean=[];
   foreach($q['rows'] as $i=>$_){$idx=$value[(string)$i]??null;if(!is_int($idx)||$idx<0||$idx>=count($q['options']))fail('إجابة جدول غير صالحة.');$clean[(string)$i]=$idx;}
   if(count($value)!==count($clean))fail('صفوف الجدول غير مطابقة.');$value=$clean;
  } else {
   if(!is_int($value)||$value<0||$value>=count($q['options']))fail('اختيار غير صالح للسؤال '.$number.'.');
  }
  $valid[$key]=$value;
 }
 foreach($answers as $key=>$_) if(!isset($all[$key]))fail('تحتوي الإجابات على سؤال غير موجود.');
 // Reject submitted values for hidden questions rather than recording hidden data.
 foreach($answers as $key=>$_) if(!array_key_exists($key,$valid))fail('إجابة لسؤال غير ظاهر أو غير مطلوب.');
 return $valid;
}
