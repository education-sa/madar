<?php
if (PHP_SAPI!=='cli') { http_response_code(404);exit; }
$ok=true;
function result(bool $pass,string $label): void { global $ok;$ok=$ok&&$pass;echo ($pass?'PASS ':'FAIL ').$label."\n"; }
result(version_compare(PHP_VERSION,'8.1.0','>='),'PHP >= 8.1');
foreach (['pdo_mysql','mbstring','fileinfo','gd'] as $ext) result(extension_loaded($ext),$ext);
$file=dirname(__DIR__).'/config.php';result(is_file($file),'config.php');if (!is_file($file)||!$ok) exit(1);
require dirname(__DIR__).'/app/bootstrap.php';
result(str_starts_with($cfg['base_url'],'https://'),'HTTPS base_url');
result(strlen($cfg['base_url'])<=82,'base_url fits QR capacity (82 ASCII bytes)');
result((bool)$cfg['cookie_secure'],'secure session cookies');
result(filter_var($cfg['mail_from'],FILTER_VALIDATE_EMAIL)!==false,'mail_from');
$public=realpath(dirname(__DIR__).'/public');$logoParent=realpath(dirname($cfg['logo_dir']));
result($logoParent!==false&&!str_starts_with($logoParent,$public.'/')&&$logoParent!==$public,'logo directory parent exists outside public/');
if ($embedded) result(is_file($cfg['identity_adapter']??''),'Madar identity adapter configured');
try {
 db();result(true,'MySQL connection');
 foreach (['ms_users','ms_tokens','ms_surveys','ms_responses','ms_templates','ms_settings','ms_limits','ms_personal_templates','ms_school_template_listings','mb_classes','mb_teachers','mb_students','mb_class_students','mb_files','mb_school_roles','mb_teacher_profiles'] as $table) {
  sql('SELECT 1 FROM '.$table.' LIMIT 1');result(true,$table);
 }
} catch (Throwable $e) { result(false,'Database or migration unavailable. Check private server logs.');error_log($e->getMessage()); }
echo "NOTE: this preflight does not send mail or test browser printing.\n";
exit($ok?0:1);
