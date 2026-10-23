<?php
if (PHP_SAPI!=='cli') { http_response_code(404);exit; }
require dirname(__DIR__).'/app/bootstrap.php';
if ($embedded) exit("استخدمي صلاحية manage_surveys في موصل حسابات مدار.\n");
$email=strtolower($argv[1]??'');if (!filter_var($email,FILTER_VALIDATE_EMAIL)) exit("الاستخدام: php bin/admin.php admin@example.com\n");
$s=sql('UPDATE ms_users SET is_admin=1 WHERE email=? AND external_id IS NULL AND verified_at IS NOT NULL AND active=1',[$email]);
echo $s->rowCount()?"تم منح الحساب صلاحية إدارة الاستبيانات.\n":"تحققي من وجود الحساب وتأكيده وتفعيله أو تمت ترقيته سابقًا.\n";
