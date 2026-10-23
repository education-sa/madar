<?php
// Standalone test for the pure validation module; no site secrets or DB needed.
if (!function_exists('mb_strlen')) {function mb_strlen($s){return preg_match_all('/./us',$s);}}
function fail(string $message,int $status=400):void {throw new DomainException($message,$status);}
function required($val,int $max):string {if(!is_string($val)||trim($val)===''||mb_strlen($val)>$max)fail('invalid');return trim($val);}
require __DIR__.'/../app/question-types.php';
function check(bool $yes,string $msg):void {if(!$yes)throw new RuntimeException($msg);}
function reject(callable $f,string $reason):void {try{$f();}catch(DomainException $e){return;}throw new RuntimeException('Expected failure: '.$reason);}
$schema=['axes'=>[['name'=>'المحور الأول','qs'=>[
 ['text'=>'المقياس الثلاثي','type'=>'rating3','options'=>['لا','نوعاً ما','نعم']],
 ['text'=>'خيارات','type'=>'multi','options'=>['أ','ب','ج']],
 ['text'=>'السؤال النصي','type'=>'short'],
 ['text'=>'الملاحظة','type'=>'long','required'=>false],
 ['text'=>'النجوم','type'=>'stars','options'=>['1','2','3','4','5']],
 ['text'=>'صح أو خطأ','type'=>'boolean','options'=>['صح','خطأ']],
 ['text'=>'الجدول','type'=>'grid','options'=>['ضعيف','جيد','ممتاز'],'rows'=>['وضوح','تفاعل']],
 ['text'=>'سؤال مشروط','type'=>'choice','options'=>['نعم','لا'],'showIf'=>['question'=>6,'option'=>0]],
]]]];
$def=msDefinition($schema);
$answers=['q1'=>2,'q2'=>[0,2],'q3'=>'نص مفيد','q5'=>4,'q6'=>0,'q7'=>['0'=>1,'1'=>2],'q8'=>1];
check(msValidateAnswers($def,$answers)===$answers,'valid mixed answers');
$a=$answers;$a['q6']=1;unset($a['q8']);check(count(msValidateAnswers($def,$a))===6,'conditional hidden q8');
reject(fn()=>msValidateAnswers($def,$answers+['q999'=>3]),'unknown question');
reject(fn()=>msValidateAnswers($def,array_merge($a,['q8'=>0])),'hidden answer injection');
reject(fn()=>msValidateAnswers($def,array_merge($answers,['q2'=>[0,0]])),'duplicate multi');
reject(fn()=>msValidateAnswers($def,array_merge($answers,['q7'=>['0'=>1,'1'=>99]])),'bad grid');
reject(fn()=>msValidateAnswers($def,array_merge($answers,['q3'=>str_repeat('x',301)])),'too-long text');
reject(fn()=>msValidateAnswers($def,array_diff_key($answers,['q1'=>1])),'missing required');
reject(fn()=>msDefinition(['axes'=>[['name'=>'x','qs'=>[['text'=>'A','type'=>'choice','options'=>['x','y'],'showIf'=>['question'=>2,'option'=>0]]]]]]),'forward conditional');
// Validate backward compatibility with old formats (no required/showIf fields).
$legacy=msDefinition(['axes'=>[['name'=>'قديمة','qs'=>[['text'=>'سؤال','type'=>'rating3','reverse'=>true,'options'=>['لا','نوعاً ما','نعم']]]]]]);
check(msValidateAnswers($legacy,['q1'=>0])['q1']===0,'old format');
echo "PASS extended PHP validation: mixed/conditional/multiple/text/grid/legacy and invalid cases.\n";
