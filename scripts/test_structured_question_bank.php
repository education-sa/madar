<?php
declare(strict_types=1);

if (!function_exists('mb_strtolower')) {
    function mb_strtolower(string $value): string { return strtolower($value); }
}
if (!function_exists('mb_substr')) {
    function mb_substr(string $value,int $start,?int $length=null): string { return $length===null?substr($value,$start):substr($value,$start,$length); }
}

require_once __DIR__.'/../api/diagnostic_bank.php';
require_once __DIR__.'/../api/teacher_tests.php';

function assert_same(mixed $expected,mixed $actual,string $message): void
{
    if ($expected!==$actual) {
        fwrite(STDERR,"FAIL: {$message}\nExpected: ".var_export($expected,true)."\nActual: ".var_export($actual,true)."\n");
        exit(1);
    }
}

$headers=['subject_id','subject_name','grade','unit_id','unit_name','lesson_id','lesson_name','skill_id','skill_name','questions_to_display','question_id','question_order','question_text','option_a','option_b','option_c','option_d','correct_answer','question_category','difficulty','question_type','explanation','status','question_source','source_reference'];
$table=[$headers,['MATH','الرياضيات','أول متوسط','U1','الأعداد','L1','القيمة المنزلية','SK1','تمييز القيمة المنزلية','2','Q1','1','ما القيمة المنزلية للرقم 5؟','5','50','500','5000','B','applied','easy','multiple_choice','لأن الرقم في منزلة العشرات','approved','كتاب الطالب','ص 12']];

assert_same('generic',teacher_question_bank_sheet_kind('Questions',$headers),'structured header sheet should be generic');
$headerInfo=teacher_question_bank_header_row($table,'generic');
assert_same(0,$headerInfo['index']??null,'structured header row should be found');
$map=$headerInfo['map'];
assert_same('Q1',teacher_question_bank_cell($table[1],$map,['question_id']),'question_id should map');
assert_same('أول متوسط',teacher_question_bank_cell($table[1],$map,['grade']),'grade should map');
assert_same('U1',teacher_question_bank_cell($table[1],$map,['unit_id']),'unit_id should map');
assert_same('L1',teacher_question_bank_cell($table[1],$map,['lesson_id']),'lesson_id should map');
assert_same('SK1',teacher_question_bank_cell($table[1],$map,['skill_id']),'skill_id should map');
assert_same('2',teacher_question_bank_cell($table[1],$map,['questions_to_display']),'questions_to_display should map');
assert_same('ما القيمة المنزلية للرقم 5؟',teacher_question_bank_cell($table[1],$map,['question_text']),'question_text should map');
assert_same('5',teacher_question_bank_cell($table[1],$map,['option_a']),'option_a should map');
assert_same('B',teacher_question_bank_cell($table[1],$map,['correct_answer']),'correct_answer should map');
assert_same('applied',teacher_question_bank_cell($table[1],$map,['question_category']),'question_category should map');
assert_same('كتاب الطالب',teacher_question_bank_cell($table[1],$map,['question_source']),'question_source should map');
assert_same('ص 12',teacher_question_bank_cell($table[1],$map,['source_reference']),'source_reference should map');
assert_same('متوسط',teacher_question_bank_stage_from_grade('أول متوسط'),'stage should be inferred from Arabic grade');
assert_same('متوسط',teacher_question_bank_stage_from_grade('First Intermediate'),'stage should be inferred from English grade');
assert_same('أول متوسط',teacher_diagnostic_normalized_grade('متوسط','First Intermediate'),'English grade should normalize');
assert_same('mcq',teacher_question_bank_type('multiple_choice'),'multiple_choice should map to mcq');
assert_same('true_false',teacher_question_bank_type('boolean'),'boolean should map to true_false');
assert_same('short_answer',teacher_question_bank_type('essay'),'essay should map to short answer');
assert_same(['status'=>'approved','reviewStatus'=>'approved','isActive'=>1],teacher_question_bank_import_status('approved'),'approved status should map');
assert_same(0,teacher_question_bank_import_status('inactive')['isActive'],'inactive status should hide question');

$id1=teacher_question_bank_external_id('Q1',['MATH','U1','L1','SK1']);
$id2=teacher_question_bank_external_id('Q1',['MATH','U1','L1','SK1']);
$id3=teacher_question_bank_external_id('Q1',['MATH','U2','L1','SK1']);
assert_same($id1,$id2,'external hash should be stable');
if ($id1===$id3) {
    fwrite(STDERR,"FAIL: different curriculum context must produce a different external ID\n");
    exit(1);
}

$variants=[];
for($i=1;$i<=4;$i++) $variants[]=['bank_question_id'=>$i,'question_order'=>$i,'questions_to_display'=>2];
$selected=diagnostic_choose_variants($variants,2,0,1,['B:1'=>true]);
assert_same(2,count($selected),'questions_to_display should select two variants');
if ((int)$selected[0]['question']['bank_question_id']===1) {
    fwrite(STDERR,"FAIL: previous question should be avoided when alternatives exist\n");
    exit(1);
}

echo "OK: structured question repository helpers\n";
