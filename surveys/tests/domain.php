<?php
// Requires configured PHP, but does not connect to MySQL or modify data.
if (PHP_SAPI!=='cli') { http_response_code(404);exit; }
require dirname(__DIR__).'/app/bootstrap.php';
function check(bool $condition,string $message): void { if (!$condition) throw new RuntimeException($message); }
$good=['axes'=>[['name'=>'محور','qs'=>[['text'=>'سؤال','type'=>'rating3','options'=>['لا','نوعاً ما','نعم'],'reverse'=>true]]]]];
check(definition($good)['axes'][0]['qs'][0]['reverse']===true,'Reverse lost');
$choice=$good;$choice['axes'][0]['qs'][0]['type']='choice';check(definition($choice)['axes'][0]['qs'][0]['reverse']===false,'Choice should be excluded from performance');
$badCases=[['axes'=>[]],['axes'=>[['name'=>'','qs'=>[]]]]];
$bad=$good;$bad['axes'][0]['qs'][0]['options']=['نعم','نوعاً ما','لا'];$badCases[]=$bad;
$bad=$good;$bad['axes'][0]['qs'][0]['type']='html';$badCases[]=$bad;
foreach ($badCases as $bad) { $rejected=false;try { definition($bad); } catch (DomainException $e) { $rejected=true; }check($rejected,'Invalid definition accepted'); }
$rejected=false;try { passwordValue('short'); } catch (DomainException $e) { $rejected=true; }check($rejected,'Short password accepted');
echo "PASS: domain validation\n";
