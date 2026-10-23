<?php
declare(strict_types=1);
$configFile = dirname(__DIR__) . '/config.php';
if (!is_file($configFile)) { http_response_code(503); exit('يرجى إعداد config.php وتشغيل الترحيل أولًا.'); }
$cfg = require $configFile;
if (!in_array($cfg['auth_mode']??'', ['standalone','madar'],true)) { http_response_code(503);exit('إعداد نظام الحسابات غير صالح.'); }
$embedded = $cfg['auth_mode'] === 'madar';
if($embedded){require_once dirname(__DIR__,2).'/config/bootstrap.php';}
if (session_status() !== PHP_SESSION_ACTIVE) {
 session_name($embedded ? $cfg['madar_session_name'] : $cfg['session_name']);
 if (!$embedded) session_set_cookie_params(['httponly'=>true,'secure'=>$cfg['cookie_secure'],'samesite'=>'Lax','path'=>'/']);
 ini_set('session.use_strict_mode','1'); session_start();
}
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
header('X-Frame-Options: SAMEORIGIN');
if (!isset($_SESSION['ms_csrf'])) $_SESSION['ms_csrf']=bin2hex(random_bytes(32));
function db(): PDO {
 global $cfg; static $pdo;
 if (!$pdo) { $pdo=new PDO($cfg['dsn'],$cfg['db_user'],$cfg['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]); $pdo->exec("SET time_zone = '+00:00'"); }
 return $pdo;
}
function sql(string $query,array $args=[]): PDOStatement { $s=db()->prepare($query);$s->execute($args);return $s; }
function fail(string $message,int $status=400): void { throw new DomainException($message,$status); }
function body(): array { static $data; if ($data!==null) return $data; if ((int)($_SERVER['CONTENT_LENGTH']??0)>500000) fail('حجم الطلب أكبر من المسموح.',413); $raw=file_get_contents('php://input',false,null,0,500001);if (strlen($raw)>500000) fail('حجم الطلب أكبر من المسموح.',413);$data=json_decode($raw,true); if (!is_array($data)) fail('بيانات غير صالحة.');return $data; }
function csrf(): void { if (!hash_equals($_SESSION['ms_csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) fail('انتهت صلاحية الطلب. حدّثي الصفحة.',403); }
function text($value,int $max=200): string { if (!is_string($value)||mb_strlen(trim($value))>$max) fail('نص غير صالح أو أطول من المسموح.');return trim($value); }
function required($v,int $max=200): string { $s=text($v,$max);if ($s==='') fail('يرجى إكمال الحقول المطلوبة.');return $s; }
function jsonout($data,int $status=200): void { http_response_code($status);header('Content-Type: application/json; charset=utf-8');echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE);exit; }
function rate(string $scope,int $max=10): void {
 $key=hash('sha256',$scope.'|'.($_SERVER['REMOTE_ADDR']??'cli'));
 sql('INSERT INTO ms_limits(bucket,hits,expires_at) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE hits=IF(expires_at<UTC_TIMESTAMP(),1,hits+1),expires_at=IF(expires_at<UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),expires_at)',[$key]);
 if ((int)sql('SELECT hits FROM ms_limits WHERE bucket=?',[$key])->fetchColumn()>$max) fail('محاولات كثيرة. حاولي بعد 15 دقيقة.',429);
}
function user(bool $needed=true): ?array {
 global $cfg,$embedded;
 if ($embedded) {
  if (!$cfg['identity_adapter']||!is_file($cfg['identity_adapter'])) fail('موصل حسابات مدار غير مهيأ.',503);
  $adapter=require $cfg['identity_adapter']; $identity=$adapter();
  if (!$identity) { if ($needed) fail('يلزم تسجيل الدخول.',401);return null; }
  if (empty($identity['can_use_surveys'])) fail('حسابك غير مخول باستخدام استبيانات المعلمات.',403);
  if (empty($identity['active'])) fail('الحساب غير مفعل.',403);
  $id=required((string)$identity['id'],191);$email=strtolower(required($identity['email'],191));$name=required($identity['name'],160);
  sql('INSERT INTO ms_users(external_id,name,email,verified_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE external_id=external_id',[$id,$name,$email,!empty($identity['verified'])?gmdate('Y-m-d H:i:s'):null]);
  $u=sql('SELECT * FROM ms_users WHERE external_id=?',[$id])->fetch();
  if (!$u) fail('تعارض بريد الحساب؛ يلزم معالجة ربطه من الإدارة.',409);
  if ($u['email']!==$email) $u['verified_at']=null;
  if (!$u['verified_at']&&!empty($identity['verified'])) $u['verified_at']=gmdate('Y-m-d H:i:s');
  sql('UPDATE ms_users SET name=?,email=?,is_admin=?,verified_at=? WHERE id=?',[$name,$email,!empty($identity['can_manage_surveys'])?1:0,$u['verified_at'],$u['id']]);
  $u['email_confirmation_exempt']=!empty($cfg['email_confirmation_exempt_identity']) && hash_equals((string)$cfg['email_confirmation_exempt_identity'],$id);
  $u['name']=$name;$u['email']=$email;$u['is_admin']=!empty($identity['can_manage_surveys'])?1:0;
 } else {
  $u=isset($_SESSION['ms_uid'])?sql('SELECT * FROM ms_users WHERE id=?',[$_SESSION['ms_uid']])->fetch():false;
  if (!$u || !hash_equals((string)($u['password_hash']??''),(string)($_SESSION['ms_auth_hash']??''))) { unset($_SESSION['ms_uid'],$_SESSION['ms_auth_hash']);if ($needed) fail('يلزم تسجيل الدخول.',401);return null; }
 }
 if (!(int)$u['active']) fail('الحساب غير مفعل.',403);
 return $u;
}
function admin(array $u): void { if (!(int)$u['is_admin']) fail('هذه العملية للإدارة المخولة فقط.',403); }
function allowedSchool(array $u): bool { global $cfg,$embedded; return $cfg['default_school_identity']!=='' && hash_equals((string)$cfg['default_school_identity'],(string)($embedded?$u['external_id']:$u['email'])); }
function publicUser(array $u): array { global $cfg;return ['id'=>(int)$u['id'],'name'=>$u['name'],'email'=>$u['email'],'school_name'=>$u['school_name'],'logo_key'=>$u['logo_key'],'is_admin'=>(bool)$u['is_admin'],'verified'=>(bool)($u['verified_at']||!empty($u['email_confirmation_exempt'])),'email_confirmed'=>(bool)$u['verified_at'],'default_school'=>allowedSchool($u),'default_school_name'=>allowedSchool($u)?$cfg['default_school_name']:'']; }
function survey(int $id,array $u,bool $owner=true,bool $lock=false): array {
 $r=sql('SELECT s.*,u.name AS teacher FROM ms_surveys s JOIN ms_users u ON u.id=s.owner_id WHERE s.id=?'.($lock?' FOR UPDATE':''),[$id])->fetch();
 if (!$r) fail('الاستبيان غير موجود.',404);
 if ($owner&&(int)$r['owner_id']!==(int)$u['id']&&!(int)$u['is_admin']) fail('لا تملكين صلاحية الاطلاع.',403);
 return $r;
}
function surveyData(array $r): array {
 $s=json_decode($r['definition'],true);return array_merge($s,['id'=>(int)$r['id'],'title'=>$r['title'],'lesson'=>$r['lesson'],'teacher'=>$r['teacher'],'school_name'=>$r['school_name'],'logo_key'=>$r['logo_key'],'use_default_logo'=>(bool)$r['use_default_logo'],'kind'=>$r['kind'],'performance'=>(bool)$r['performance'],'status'=>$r['status'],'revision'=>(int)$r['revision'],'share_token'=>$r['share_token']]);
}
require_once __DIR__ . '/question-types.php';
function definition(array $input): array {
 $mode=$input['display_mode']??'question';
 if (!in_array($mode,['question','axis'],true)) fail('طريقة عرض غير صالحة.');
 $result=msDefinition($input);$result['display_mode']=$mode;return $result;
}

function mailToken(array $u,string $purpose): void {
 global $cfg;if ($purpose==='verify') return; // Email confirmation is disabled for surveys.
 $token=bin2hex(random_bytes(32));
 sql('INSERT INTO ms_tokens(user_id,token_hash,purpose,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',[$u['id'],hash('sha256',$token),$purpose]);
 $link=$cfg['base_url'].'/?'.$purpose.'='.$token;
 $subject=$purpose==='verify'?'تأكيد بريد استبيانات مدار':'إعادة تعيين كلمة المرور';
 $message=$subject."\n\n".$link."\n\nالرابط صالح لساعة واحدة. تجاهلي الرسالة إن لم تطلبيها.";
 $ok=false;
 if ($cfg['mail_transport']) { $send=require $cfg['mail_transport'];$ok=$send($u['email'],$subject,$message); }
 else { $ok=mail($u['email'],'=?UTF-8?B?'.base64_encode($subject).'?=',$message,['From'=>$cfg['mail_from'],'Content-Type'=>'text/plain; charset=UTF-8']); }
 if (!$ok) { sql('DELETE FROM ms_tokens WHERE token_hash=?',[hash('sha256',$token)]);fail('تعذر إرسال البريد. تحققي من خدمة البريد ثم أعيدي الطلب.',503); }
}
function passwordValue($v): string { $p=required($v,200);if (strlen($p)>72) fail('كلمة المرور يجب ألا تتجاوز 72 بايت UTF-8.');if (mb_strlen($p)<12) fail('كلمة المرور 12 حرفًا على الأقل.');return $p; }
