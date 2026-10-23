<?php
declare(strict_types=1);
// Use native Madar authenticated identity. Never trust a student ID supplied by the browser.
$madarBootstrap=dirname(__DIR__,2).'/config/bootstrap.php';
if(!is_file($madarBootstrap)) fail('تهيئة الدخول الموحد في مدار غير متوفرة.',503);
require_once $madarBootstrap;
function mbCurrentStudent(): array {
 if (!class_exists('Auth') || !method_exists('Auth','realUser')) fail('تكامل حساب الطالبة مع مدار غير متوفر.',503);
 $person=Auth::realUser();
 if(!is_array($person)||($person['subjectType']??'')!=='student'||($person['role']??'')!=='student'||($person['status']??'')!=='active') fail('يرجى الدخول بحساب طالبة مفعل في مدار.',401);
 PortalAccess::requirePortal($person);
 $key=$person['id']??null;
 if(!(is_int($key)||(is_string($key)&&preg_match('/^[1-9][0-9]{0,15}$/D',$key))))fail('معرّف الطالبة في مدار غير صالح.',403);
 $student=sql('SELECT * FROM mb_students WHERE madar_student_id=? AND school_enabled=1',[(int)$key])->fetch();
 if(!$student)fail('حسابك لم يُفعّل بعد لبوابة مجمع ظليم.',403);
 return $student;
}
function mbStudentClassAccess(int $cid,array $student): array {
 $c=sql('SELECT c.* FROM mb_classes c JOIN mb_class_students x ON x.class_id=c.id WHERE c.id=? AND x.student_id=? AND c.is_active=1',[$cid,$student['id']])->fetch();
 if(!$c)fail('ليس لديك إذن بهذا الفصل.',403);return $c;
}
