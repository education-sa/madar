<?php
declare(strict_types=1);
try {
 require dirname(__DIR__).'/app/bootstrap.php';
 $op=$_GET['op']??'session';$method=$_SERVER['REQUEST_METHOD'];
 $read=['session','mine','participated','templates','get','open','results','admin_users','admin_surveys','settings','teacher_scopes','survey_teachers','survey_inbox','guest_info','survey_trash','personal_templates','personal_template_get','personal_template_shared','school_template_list','template_recipients'];
 if (!in_array($method,['GET','POST'],true)) fail('طريقة الطلب غير مسموحة.',405);
 if (!in_array($op,$read,true)&&$method!=='POST') fail('استخدمي POST لهذه العملية.',405);
 if ($method==='POST') csrf();
 if ($op==='session') {
  $u=user(false);if ($u) $u['school_name']=$cfg['default_school_name'];jsonout(['user'=>$u?publicUser($u):null,'csrf'=>$_SESSION['ms_csrf'],'auth_mode'=>$cfg['auth_mode'],'login_url'=>'/dhalim/login/','base_url'=>$cfg['base_url'],'native_role'=>$embedded?(Auth::realUser()['role']??null):null,'can_madar'=>$embedded?PortalAccess::canMadar(Auth::realUser()??[]):false]);
 }
 if (in_array($op,['request_confirmation','resend','verify'],true)) jsonout(['message'=>'لا يتطلب نظام الاستبيانات تأكيد البريد. يمكنك استخدام حسابك بعد موافقة الإدارة إن كانت مطلوبة.']);
 if (in_array($op,['register','login','verify','resend','forgot','reset'],true)) {
  if ($embedded&&$op!=='verify') fail('استخدمي نظام حسابات مدار الحالي.',403);
  rate($op,($op==='login'?20:6));$b=body();
  if ($op==='register') {
   if (sql("SELECT setting_value FROM ms_settings WHERE setting_key='registration_open'")->fetchColumn()!=='1') fail('التسجيل مغلق حاليًا.',403);
   $email=strtolower(required($b['email']??'',191));if (!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('البريد غير صالح.');
   $name=required($b['name']??'',160);$p=passwordValue($b['password']??'');$school=required($b['school_name']??'',200);
   try { sql('INSERT INTO ms_users(name,email,password_hash,school_name) VALUES (?,?,?,?)',[$name,$email,password_hash($p,PASSWORD_DEFAULT),$school]); }
   catch (PDOException $e) { if ($e->getCode()==='23000') fail('البريد مسجل سابقًا. استخدمي الدخول أو استعادة كلمة المرور.',409);throw $e; }
   jsonout(['message'=>'تم إنشاء الحساب. يمكنك تسجيل الدخول مباشرة.']);
  }
  if ($op==='login') {
   $u=sql('SELECT * FROM ms_users WHERE email=? AND external_id IS NULL',[strtolower(text($b['email']??'',191))])->fetch();
   if (!$u||!password_verify(text($b['password']??'',200),$u['password_hash']??'')) fail('البريد أو كلمة المرور غير صحيحة.',401);
   if (!$u['active']) fail('الحساب غير مفعل أو بانتظار موافقة الإدارة.',403);
   session_regenerate_id(true);$_SESSION['ms_uid']=$u['id'];$_SESSION['ms_auth_hash']=$u['password_hash'];$_SESSION['ms_csrf']=bin2hex(random_bytes(32));jsonout(['user'=>publicUser($u),'csrf'=>$_SESSION['ms_csrf']]);
  }
  if ($op==='resend'||$op==='forgot') {
   $u=sql('SELECT * FROM ms_users WHERE email=? AND external_id IS NULL',[strtolower(text($b['email']??'',191))])->fetch();
   if ($u&&$u['active']&&($op==='forgot'||!$u['verified_at'])) mailToken($u,$op==='forgot'?'reset':'verify');
   jsonout(['message'=>'إذا كان البريد مؤهلًا، فسيصلك رابط صالح لساعة واحدة.']);
  }
  if ($op==='verify'||$op==='reset') {
   $token=required($b['token']??'',64);$newPassword=$op==='reset'?passwordValue($b['password']??''):null;
   db()->beginTransaction();
   $t=sql('SELECT * FROM ms_tokens WHERE token_hash=? AND purpose=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[hash('sha256',$token),$op])->fetch();
   if (!$t) fail('الرابط منتهي الصلاحية أو مستخدم سابقًا.');
   if ($op==='verify') sql('UPDATE ms_users SET verified_at=UTC_TIMESTAMP() WHERE id=?',[$t['user_id']]);
   else sql('UPDATE ms_users SET password_hash=? WHERE id=?',[password_hash($newPassword,PASSWORD_DEFAULT),$t['user_id']]);
   sql('DELETE FROM ms_tokens WHERE user_id=? AND purpose=?',[$t['user_id'],$op]);db()->commit();
   jsonout(['message'=>$op==='verify'?'تم تأكيد بريدك. يمكنك تسجيل الدخول.':'تم تغيير كلمة المرور.']);
  }
 }

 // Guest survey participation is isolated from authenticated account operations.
 if (in_array($op,['guest_info','guest_start','guest_submit'],true)) {
  rate('guest_'.$op,$op==='guest_info'?60:20);
  $b=$method==='POST'?body():[];$token=required($b['token']??$_GET['token']??'',48);
  if (!preg_match('/^[a-f0-9]{48}$/D',$token)) fail('رابط غير صالح.');
  $s=sql("SELECT s.*,u.name AS teacher FROM ms_surveys s JOIN ms_users u ON u.id=s.owner_id AND u.active=1 WHERE s.share_token=? AND s.status='published'",[$token])->fetch();
  if (!$s) fail('الاستبيان غير متاح أو أُغلق.',404);
  $signed=user(false);
  if ($signed&&(int)$s['owner_id']===(int)$signed['id']) fail('لا يمكنك تقييم نفسك.',403);
  if ($signed&&sql('SELECT id FROM ms_responses WHERE survey_id=? AND reviewer_id=?',[$s['id'],$signed['id']])->fetch()) fail('سبق إرسال تقييمك لهذا الاستبيان.',409);
  if ($op==='guest_info') jsonout(['title'=>$s['title'],'school_name'=>$s['school_name']]);
  $key=(string)$s['id'];
  if ($op==='guest_start') {
   $name=required($b['name']??'',160);
   if (mb_strlen($name)<2) fail('اكتبي الاسم من حرفين على الأقل.');
   $guest=$_SESSION['ms_guests'][$key]??null;
   if ($guest&&!empty($guest['submitted'])) fail('سبق إرسال تقييم الزائر من هذه الجلسة.',409);
   $_SESSION['ms_guests'][$key]=['name'=>$name,'key'=>$guest['key']??bin2hex(random_bytes(24)),'submitted'=>false];
   $data=surveyData($s);unset($data['share_token']);jsonout(['survey'=>$data,'name'=>$name]);
  }
  $guest=$_SESSION['ms_guests'][$key]??null;if (!$guest) fail('اكتبي اسم الزائر أولًا.',401);
  if (!empty($guest['submitted'])) fail('سبق إرسال هذا التقييم.',409);
  if (($b['identity_consent']??false)!==true) fail('يلزم الموافقة على إرسال التقييم باسمك.');
  $valid=msValidateAnswers(json_decode($s['definition'],true),$b['answers']??null);
  $notes=text($b['notes']??'',10000);db()->beginTransaction();
  $live=sql('SELECT status FROM ms_surveys WHERE id=? FOR UPDATE',[$s['id']])->fetchColumn();if($live!=='published')fail('أُغلق الاستبيان.',409);
  // A signed-in participant keeps the account identity and one-response constraint.
  if ($signed) $reviewer=(int)$signed['id'];
  else {
   $external='guest:'.$guest['key'];$email=$guest['key'].'@guest.invalid';
   sql('INSERT INTO ms_users(external_id,name,email,school_name) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE external_id=external_id',[$external,$guest['name'].' (زائر)',$email,$s['school_name']]);
   $reviewer=(int)sql('SELECT id FROM ms_users WHERE external_id=?',[$external])->fetchColumn();
  }
  try {sql('INSERT INTO ms_responses(survey_id,reviewer_id,answers,notes) VALUES (?,?,?,?)',[$s['id'],$reviewer,json_encode($valid),$notes]);}
  catch(PDOException $err){if($err->getCode()==='23000')fail('سبق إرسال هذا التقييم.',409);throw $err;}
  db()->commit();$_SESSION['ms_guests'][$key]['submitted']=true;jsonout(['ok'=>true]);
 }

 $u=user();
 if ($op==='logout') { if (!$embedded) { unset($_SESSION['ms_uid'],$_SESSION['ms_auth_hash']); session_regenerate_id(true); }jsonout(['ok'=>true,'auth_mode'=>$cfg['auth_mode']]); }
 if ($op==='profile') {
  admin($u);
  $b=body();sql('UPDATE ms_users SET school_name=? WHERE id=?',[required($b['school_name']??'',200),$u['id']]);jsonout(['ok'=>true]);
 }
 if ($op==='upload_logo') {
  admin($u);
  $f=$_FILES['logo']??null;
  if (!$f||$f['error']!==UPLOAD_ERR_OK||$f['size']>2097152) fail('ارفعي صورة PNG أو JPEG لا تتجاوز 2 ميغابايت.');
  $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
  if (!in_array($mime,['image/png','image/jpeg'],true)) fail('نوع الصورة غير مسموح.');
  $size=getimagesize($f['tmp_name']);if (!$size||$size[0]>3000||$size[1]>3000||$size[0]<16||$size[1]<16) fail('أبعاد الصورة يجب أن تكون بين 16 و3000 بكسل.');
  if (!extension_loaded('gd')) fail('يلزم تفعيل GD لمعالجة الشعارات بأمان.',503);
  $image=$mime==='image/png'?imagecreatefrompng($f['tmp_name']):imagecreatefromjpeg($f['tmp_name']);if (!$image) fail('الصورة غير سليمة.');
  imagealphablending($image,false);imagesavealpha($image,true);
  if (!is_dir($cfg['logo_dir'])&&!mkdir($cfg['logo_dir'],0700,true)) fail('تعذر تجهيز مجلد الشعارات.',503);
  $key=bin2hex(random_bytes(16)).'.png';if (!imagepng($image,$cfg['logo_dir'].'/'.$key)) fail('تعذر حفظ الشعار.',503);imagedestroy($image);
  sql('UPDATE ms_users SET logo_key=? WHERE id=?',[$key,$u['id']]);jsonout(['logo_key'=>$key]);
 }

 if ($op==='survey_teachers') {
  if (!$embedded) fail('هذه الخاصية لحسابات مدار المرتبطة.',403);
  jsonout(['items'=>sql("SELECT id,name FROM teachers WHERE deleted_at IS NULL AND status='active' AND CONCAT('teacher:',id)<>? ORDER BY name",[$u['external_id']])->fetchAll()]);
 }
 if ($op==='send_survey') {
  if (!$embedded) fail('هذه الخاصية لحسابات مدار المرتبطة.',403);
  $b=body();$s=survey((int)($b['id']??0),$u,true);
  if ($s['status']!=='published') fail('انشري الاستبيان قبل إرساله.',409);
  $ids=$b['teacher_ids']??[];
  if (!is_array($ids)||!$ids||count($ids)>200) fail('اختاري من معلمة إلى 200 معلمة.');
  foreach ($ids as $id) if (!is_int($id)||$id<1) fail('اختيار معلمة غير صالح.');
  $ids=array_values(array_unique($ids));$marks=implode(',',array_fill(0,count($ids),'?'));
  $targets=sql("SELECT id FROM teachers WHERE deleted_at IS NULL AND status='active' AND CONCAT('teacher:',id)<>? AND id IN ($marks)",array_merge([$u['external_id']],$ids))->fetchAll();
  if (count($targets)!==count($ids)) fail('بعض الحسابات غير مفعلة أو غير متاحة. حدّثي القائمة.');
  db()->beginTransaction();
  foreach ($targets as $t) sql('INSERT INTO ms_settings(setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',['survey_invite_'.$s['id'].'_'.$t['id'],gmdate('c')]);
  db()->commit();jsonout(['count'=>count($targets),'message'=>'تم إرسال الاستبيان إلى قسم استبياناتي لدى المعلمات المختارات.']);
 }
 if ($op==='survey_inbox') {
  if (!$embedded||!preg_match('/^teacher:([0-9]+)$/D',(string)$u['external_id'],$match)) jsonout(['items'=>[]]);
  jsonout(['items'=>sql("SELECT s.id,s.title,s.share_token,u.name AS teacher FROM ms_surveys s JOIN ms_settings n ON n.setting_key=CONCAT('survey_invite_',s.id,'_',?) JOIN ms_users u ON u.id=s.owner_id AND u.active=1 WHERE s.status='published' AND NOT EXISTS (SELECT 1 FROM ms_responses r WHERE r.survey_id=s.id AND r.reviewer_id=?) ORDER BY s.id DESC",[(int)$match[1],$u['id']])->fetchAll()]);
 }

 if ($op==='templates') jsonout(['items'=>sql('SELECT id,name,kind,definition,active FROM ms_templates'.((int)$u['is_admin']?'':' WHERE active=1').' ORDER BY id')->fetchAll()]);
 if ($op==='mine') jsonout(['items'=>sql('SELECT s.id,s.title,s.lesson,s.status,s.kind,s.share_token,s.revision,s.updated_at,(SELECT COUNT(*) FROM ms_responses r WHERE r.survey_id=s.id) AS responses FROM ms_surveys s WHERE owner_id=? AND s.status<>\'trash\' ORDER BY id DESC',[$u['id']])->fetchAll()]);
 if ($op==='participated') jsonout(['items'=>sql('SELECT s.id,s.title,u.name AS teacher,r.submitted_at,r.answers,r.notes,s.definition FROM ms_responses r JOIN ms_surveys s ON s.id=r.survey_id JOIN ms_users u ON u.id=s.owner_id WHERE r.reviewer_id=? ORDER BY r.id DESC',[$u['id']])->fetchAll()]);
 if ($op==='get') jsonout(['survey'=>surveyData(survey((int)($_GET['id']??0),$u))]);
 if ($op==='save') {
  $b=body();$d=definition($b);$title=required($b['title']??'',200);$lesson=text($b['lesson']??'',250);$school=required($cfg['default_school_name'],200);
  $kind=$b['kind']??'custom';if (!in_array($kind,['applied','workshop','custom'],true)) fail('قالب غير صالح.');
  $id=(int)($b['id']??0);db()->beginTransaction();$old=$id?survey($id,$u,true,true):null;
  if ($old&&$old['status']!=='draft') fail('الاستبيان المنشور ثابت؛ أنشئي نسخة جديدة لتغيير الأسئلة.',409);
  if ($old&&(int)($b['revision']??0)!==(int)$old['revision']) fail('تغيرت المسودة في نافذة أخرى. أعيدي فتحها.',409);
  // Administrators keep the owner's school identity; they cannot assign another user's logo.
  $owner=$old?sql('SELECT * FROM ms_users WHERE id=?',[$old['owner_id']])->fetch():$u;
  $logo=$owner['logo_key'];$default=allowedSchool($owner)&&!$logo?1:0;
  if ($id) sql('UPDATE ms_surveys SET title=?,lesson=?,school_name=?,logo_key=?,use_default_logo=?,kind=?,performance=?,definition=?,revision=revision+1 WHERE id=?',[$title,$lesson,$school,$logo,$default,$kind,!empty($b['performance'])?1:0,json_encode($d,JSON_UNESCAPED_UNICODE),$id]);
  else { sql('INSERT INTO ms_surveys(owner_id,title,lesson,school_name,logo_key,use_default_logo,kind,performance,share_token,definition) VALUES (?,?,?,?,?,?,?,?,?,?)',[$u['id'],$title,$lesson,$school,$logo,$default,$kind,!empty($b['performance'])?1:0,bin2hex(random_bytes(24)),json_encode($d,JSON_UNESCAPED_UNICODE)]);$id=(int)db()->lastInsertId(); }
  db()->commit();jsonout(['survey'=>surveyData(survey($id,$u))]);
 }

 if ($op==='survey_trash') jsonout(['items'=>sql("SELECT id,title FROM ms_surveys WHERE owner_id=? AND status='trash' ORDER BY id DESC",[$u['id']])->fetchAll()]);
 if ($op==='trash_survey'||$op==='restore_survey') {
  $b=body();db()->beginTransaction();$s=survey((int)($b['id']??0),$u,true,true);$key='survey_trash_'.$s['id'];
  if ($op==='trash_survey') {
   if ($s['status']==='trash') fail('الاستبيان محذوف بالفعل.',409);
   sql('INSERT INTO ms_settings(setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',[$key,json_encode(['status'=>$s['status'],'at'=>gmdate('c')])]);
   sql("UPDATE ms_surveys SET status='trash' WHERE id=?",[$s['id']]);
  } else {
   if ($s['status']!=='trash') fail('الاستبيان غير محذوف.',409);
   $stored=json_decode((string)sql('SELECT setting_value FROM ms_settings WHERE setting_key=?',[$key])->fetchColumn(),true);
   $status=$stored['status']??'draft';if(!in_array($status,['draft','published','closed'],true))$status='draft';
   sql('UPDATE ms_surveys SET status=? WHERE id=?',[$status,$s['id']]);sql('DELETE FROM ms_settings WHERE setting_key=?',[$key]);
  }
  db()->commit();jsonout(['ok'=>true]);
 }

 if ($op==='publish'||$op==='close') {
  $b=body();db()->beginTransaction();$s=survey((int)($b['id']??0),$u,true,true);
  if ($op==='publish'&&$s['status']!=='draft') fail('يمكن نشر المسودات فقط.',409);
  if ($op==='close'&&$s['status']!=='published') fail('الاستبيان غير منشور.',409);
  sql('UPDATE ms_surveys SET status=? WHERE id=?',[$op==='publish'?'published':'closed',$s['id']]);db()->commit();jsonout(['survey'=>surveyData(survey((int)$s['id'],$u))]);
 }
 if ($op==='open') {
  $token=text($_GET['token']??'',48);$s=sql('SELECT s.*,u.name AS teacher FROM ms_surveys s JOIN ms_users u ON u.id=s.owner_id AND u.active=1 WHERE share_token=? AND status=\'published\' ',[$token])->fetch();
  if (!$s) fail('الرابط غير متاح أو أُغلق الاستبيان.',404);
  if ((int)$s['owner_id']===(int)$u['id']) fail('لا يمكنك تقييم نفسك في استبيان الأداء.',403);
  if (sql('SELECT id FROM ms_responses WHERE survey_id=? AND reviewer_id=?',[$s['id'],$u['id']])->fetch()) fail('سبق إرسال مشاركتك في هذا الاستبيان.',409);
  $d=surveyData($s);unset($d['share_token']);jsonout(['survey'=>$d]);
 }
 if ($op==='submit') {
  $b=body();$id=(int)($b['id']??0);db()->beginTransaction();$s=survey($id,$u,false,true);
  if ($s['status']!=='published'||!hash_equals($s['share_token'],text($b['token']??'',48))) fail('الاستبيان غير متاح.',403);
  $owner=sql('SELECT active FROM ms_users WHERE id=?',[$s['owner_id']])->fetchColumn();if (!$owner) fail('حساب صاحبة الاستبيان معطل.',403);
  if ((int)$s['owner_id']===(int)$u['id']) fail('لا يمكنك تقييم نفسك.',403);
  if (($b['identity_consent']??false)!==true) fail('يلزم الإقرار بأن التقييم مرتبط باسمك.');
  $valid=msValidateAnswers(json_decode($s['definition'],true),$b['answers']??null);
  try { sql('INSERT INTO ms_responses(survey_id,reviewer_id,answers,notes) VALUES (?,?,?,?)',[$id,$u['id'],json_encode($valid),text($b['notes']??'',10000)]); }
  catch (PDOException $e) { if ($e->getCode()==='23000') fail('سبق حفظ تقييمك لهذا الاستبيان.',409);throw $e; }
  db()->commit();jsonout(['ok'=>true,'message'=>'تم حفظ تقييمك بنجاح.']);
 }
 if ($op==='results') {
  $s=survey((int)($_GET['id']??0),$u);
  $rows=sql('SELECT r.id,r.answers,r.notes,r.submitted_at,u.name AS reviewerName FROM ms_responses r JOIN ms_users u ON u.id=r.reviewer_id WHERE r.survey_id=? ORDER BY r.id',[$s['id']])->fetchAll();
  $rows=array_map(static function($r){$r['answers']=json_decode($r['answers'],true);$r['submittedAt']=str_replace(' ','T',$r['submitted_at']).'Z';unset($r['submitted_at']);return $r;},$rows);
  jsonout(['survey'=>surveyData($s),'responses'=>$rows]);
 }
 if ($op==='teacher_scopes') {
  admin($u);$items=sql("SELECT t.id,COALESCE(s.setting_value,'full') AS access_scope FROM teachers t LEFT JOIN ms_settings s ON s.setting_key=CONCAT('teacher_scope_',t.id) WHERE t.deleted_at IS NULL ORDER BY t.id")->fetchAll();jsonout(['items'=>$items]);
 }
 if ($op==='set_teacher_scope') {
  admin($u);$b=body();$id=filter_var($b['teacher_id']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);$scope=$b['access_scope']??'';
  if (!$id||!in_array($scope,['full','surveys_only'],true)) fail('اختيار صلاحية غير صالح.');
  $target=sql('SELECT id FROM teachers WHERE id=? AND deleted_at IS NULL',[$id])->fetch();if (!$target) fail('حساب المعلمة غير موجود.',404);
  db()->beginTransaction();
  sql('INSERT INTO ms_settings(setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',['teacher_scope_'.$id,$scope]);
  sql('INSERT INTO ms_settings(setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',['teacher_scope_audit_'.$id,json_encode(['owner'=>$u['external_id'],'scope'=>$scope,'at'=>gmdate('c')])]);
  db()->commit();jsonout(['ok'=>true,'access_scope'=>$scope]);
 }
 if ($op==='admin_users') { admin($u);jsonout(['items'=>sql('SELECT id,name,email,active,is_admin,verified_at,external_id,school_name FROM ms_users WHERE external_id IS NULL OR external_id NOT LIKE \'guest:%\' ORDER BY id DESC LIMIT 1000')->fetchAll()]); }
 if ($op==='admin_surveys') { admin($u);jsonout(['items'=>sql('SELECT s.id,s.title,s.status,s.kind,s.share_token,u.name AS teacher,(SELECT COUNT(*) FROM ms_responses r WHERE r.survey_id=s.id) AS responses FROM ms_surveys s JOIN ms_users u ON u.id=s.owner_id ORDER BY s.id DESC LIMIT 1000')->fetchAll()]); }
 if ($op==='set_user') {
  admin($u);$b=body();$id=(int)($b['id']??0);if ($id===(int)$u['id']) fail('لا يمكنك تعطيل حسابك من هنا.');
  $target=sql('SELECT is_admin FROM ms_users WHERE id=?',[$id])->fetch();if (!$target) fail('الحساب غير موجود.',404);
  if ($target['is_admin']) fail('تعديل حسابات الإدارة يتم عبر نظام الصلاحيات الأساسي.',403);
  sql('UPDATE ms_users SET active=? WHERE id=?',[!empty($b['active'])?1:0,$id]);jsonout(['ok'=>true]);
 }
 // Personal templates belong to individual teachers. A shared link shares questions,
 // never survey responses, usernames, report data, or permission to edit the original.
 if ($op==='personal_templates') {
  $items=sql('SELECT id,name,kind,performance,source_name,sharing_enabled,share_token,updated_at FROM ms_personal_templates WHERE owner_id=? ORDER BY updated_at DESC,id DESC',[$u['id']])->fetchAll();
  jsonout(['items'=>$items]);
 }
 if ($op==='personal_template_get') {
  $id=(int)($_GET['id']??0);
  $t=sql('SELECT id,name,kind,performance,source_name,sharing_enabled,share_token,definition FROM ms_personal_templates WHERE id=? AND owner_id=?',[$id,$u['id']])->fetch();
  if (!$t) fail('القالب غير موجود في مكتبتك.',404);
  $t['definition']=json_decode($t['definition'],true);
  jsonout(['template'=>$t]);
 }
 if ($op==='personal_template_shared') {
  rate('personal_template_shared',50);
  $token=text($_GET['token']??'',48);
  if (!preg_match('/^[a-f0-9]{48}$/D',$token)) fail('رابط القالب غير صالح.',404);
  $t=sql('SELECT t.name,t.kind,t.performance,t.definition,u.name AS author FROM ms_personal_templates t JOIN ms_users u ON u.id=t.owner_id AND u.active=1 WHERE t.share_token=? AND t.sharing_enabled=1',[$token])->fetch();
  if (!$t) fail('انتهت مشاركة القالب أو لم يعد متاحًا.',404);
  $t['definition']=json_decode($t['definition'],true);
  jsonout(['template'=>$t]);
 }
 if ($op==='personal_template_create') {
  $b=body();$surveyId=(int)($b['survey_id']??0);
  $s=sql("SELECT title,kind,performance,definition FROM ms_surveys WHERE id=? AND owner_id=? AND status<>'trash'",[$surveyId,$u['id']])->fetch();
  if (!$s) fail('احفظي الاستبيان في حسابك أولًا، ثم حوّليه إلى قالب.',404);
  $name=required($b['name']??$s['title'],200);
  sql('INSERT INTO ms_personal_templates(owner_id,name,kind,performance,definition,share_token) VALUES (?,?,?,?,?,?)',[$u['id'],$name,$s['kind'],$s['performance'],$s['definition'],bin2hex(random_bytes(24))]);
  jsonout(['id'=>(int)db()->lastInsertId(),'message'=>'حُفظ القالب في مكتبتك الخاصة.']);
 }
 if ($op==='personal_template_update') {
  $b=body();$id=(int)($b['id']??0);$name=required($b['name']??'',200);$d=definition($b);
  // Templates can be edited independently of surveys and published responses.
  $count=sql('UPDATE ms_personal_templates SET name=?,kind=?,performance=?,definition=? WHERE id=? AND owner_id=?',[
   $name,'custom',!empty($b['performance'])?1:0,json_encode($d,JSON_UNESCAPED_UNICODE),$id,$u['id']])->rowCount();
  if (!$count&&!sql('SELECT id FROM ms_personal_templates WHERE id=? AND owner_id=?',[$id,$u['id']])->fetch()) fail('القالب غير موجود في مكتبتك.',404);
  jsonout(['ok'=>true,'message'=>'تم تحديث قالبك الخاص.']);
 }
 if ($op==='personal_template_share') {
  $b=body();$id=(int)($b['id']??0);
  if (!is_bool($b['enabled']??null)) fail('حالة المشاركة غير صالحة.');
  db()->beginTransaction();
  $t=sql('SELECT id,sharing_enabled,share_token FROM ms_personal_templates WHERE id=? AND owner_id=? FOR UPDATE',[$id,$u['id']])->fetch();
  if (!$t) fail('القالب غير موجود في مكتبتك.',404);
  $enabled=$b['enabled'];
  // Rotate token every time sharing is reenabled: revoked links stay revoked.
  $token=$enabled && !(int)$t['sharing_enabled']?bin2hex(random_bytes(24)):$t['share_token'];
  sql('UPDATE ms_personal_templates SET sharing_enabled=?,share_token=? WHERE id=? AND owner_id=?',[$enabled?1:0,$token,$id,$u['id']]);
  db()->commit();jsonout(['ok'=>true,'sharing_enabled'=>$enabled,'share_token'=>$enabled?$token:null]);
 }
 if ($op==='personal_template_import') {
  $b=body();$token=required($b['token']??'',48);
  if (!preg_match('/^[a-f0-9]{48}$/D',$token)) fail('رابط غير صالح.',404);
  $t=sql('SELECT t.*,u.name AS author FROM ms_personal_templates t JOIN ms_users u ON u.id=t.owner_id AND u.active=1 WHERE t.share_token=? AND t.sharing_enabled=1',[$token])->fetch();
  if (!$t) fail('لم يعد القالب متاحًا للمشاركة.',404);
  if ((int)$t['owner_id']===(int)$u['id']) fail('القالب موجود في مكتبتك بالفعل.',409);
  sql('INSERT INTO ms_personal_templates(owner_id,name,kind,performance,definition,source_name,share_token) VALUES (?,?,?,?,?,?,?)',[
   $u['id'],$t['name'],$t['kind'],$t['performance'],$t['definition'],$t['author'],bin2hex(random_bytes(24))]);
  jsonout(['id'=>(int)db()->lastInsertId(),'message'=>'تم حفظ نسخة مستقلة في مكتبتك دون نتائج أو مشاركات.']);
 }
 if ($op==='personal_template_delete') {
  $b=body();$id=(int)($b['id']??0);
  if (!sql('SELECT id FROM ms_personal_templates WHERE id=? AND owner_id=?',[$id,$u['id']])->fetch()) fail('القالب غير موجود في مكتبتك.',404);
  sql('DELETE FROM ms_personal_templates WHERE id=? AND owner_id=?',[$id,$u['id']]);
  jsonout(['ok'=>true]);
 }

 // Account-scoped shared library: only template definitions, never survey responses.
 if ($op==='school_template_list') {
  $school=trim((string)$u['school_name']);
  if ($school==='') jsonout(['items'=>[],'notice'=>'حددي اسم المدرسة في بيانات الحساب قبل استخدام مكتبة المدرسة.']);
  $items=sql("SELECT t.id,t.name,t.kind,t.performance,u.name AS author FROM ms_school_template_listings l JOIN ms_personal_templates t ON t.id=l.template_id JOIN ms_users u ON u.id=t.owner_id AND u.active=1 WHERE l.school_key=? AND u.school_name=? ORDER BY l.created_at DESC LIMIT 150",[$school,$school])->fetchAll();
  jsonout(['items'=>$items]);
 }
 if ($op==='school_template_publish') {
  $b=body();$id=(int)($b['id']??0);$enabled=$b['enabled']??null;
  if(!is_bool($enabled)) fail('اختيار المشاركة غير صالح.');
  $school=trim((string)$u['school_name']);if($school==='')fail('يجب ربط حسابك بمدرسة قبل النشر في مكتبتها.');
  $t=sql('SELECT id FROM ms_personal_templates WHERE id=? AND owner_id=?',[$id,$u['id']])->fetch();if(!$t)fail('القالب غير موجود.',404);
  if($enabled)sql('INSERT INTO ms_school_template_listings(template_id,school_key) VALUES (?,?) ON DUPLICATE KEY UPDATE school_key=VALUES(school_key)',[$id,$school]);
  else sql('DELETE FROM ms_school_template_listings WHERE template_id=?',[$id]);
  jsonout(['ok'=>true,'message'=>$enabled?'أُضيف القالب إلى مكتبة مدرستك.':'أُلغي نشر القالب في مكتبة المدرسة.']);
 }
 if ($op==='school_template_import') {
  $b=body();$id=(int)($b['id']??0);$school=trim((string)$u['school_name']);
  if($school==='')fail('اسم المدرسة غير محدد.',403);
  $t=sql('SELECT t.*,u.name AS author FROM ms_personal_templates t JOIN ms_school_template_listings l ON l.template_id=t.id AND l.school_key=? JOIN ms_users u ON u.id=t.owner_id AND u.active=1 AND u.school_name=? WHERE t.id=?',[$school,$school,$id])->fetch();
  if(!$t)fail('القالب غير متاح لمدرستك.',404);
  sql('INSERT INTO ms_personal_templates(owner_id,name,kind,performance,definition,source_name,share_token) VALUES (?,?,?,?,?,?,?)',[$u['id'],$t['name'],$t['kind'],$t['performance'],$t['definition'],$t['author'],bin2hex(random_bytes(24))]);
  jsonout(['id'=>(int)db()->lastInsertId(),'message'=>'أُضيفت نسخة مستقلة من قالب المدرسة إلى مكتبتك.']);
 }
 if ($op==='template_recipients') {
  $targets=sql("SELECT id,name FROM ms_users WHERE active=1 AND id<>? AND ((external_id IS NULL AND is_admin=0) OR external_id LIKE 'teacher:%') ORDER BY name LIMIT 300",[$u['id']])->fetchAll();
  jsonout(['items'=>$targets]);
 }
 if ($op==='template_send') {
  $b=body();$id=(int)($b['id']??0);$targets=$b['recipients']??null;
  if(!is_array($targets)||count($targets)<1||count($targets)>20)fail('اختاري من معلمة إلى 20 معلمة.');
  foreach($targets as $target)if(!is_int($target)||$target<1||$target===(int)$u['id'])fail('حساب مستلم غير صالح.');
  $targets=array_values(array_unique($targets));
  $t=sql('SELECT * FROM ms_personal_templates WHERE id=? AND owner_id=?',[$id,$u['id']])->fetch();if(!$t)fail('القالب غير موجود.',404);
  $marks=implode(',',array_fill(0,count($targets),'?'));
  $valid=sql("SELECT id FROM ms_users WHERE active=1 AND id IN ($marks) AND ((external_id IS NULL AND is_admin=0) OR external_id LIKE 'teacher:%')",$targets)->fetchAll();
  if(count($valid)!==count($targets))fail('بعض الحسابات المختارة غير صالحة أو غير نشطة.');
  db()->beginTransaction();
  foreach($valid as $recipient)sql('INSERT INTO ms_personal_templates(owner_id,name,kind,performance,definition,source_name,share_token) VALUES (?,?,?,?,?,?,?)',[$recipient['id'],$t['name'],$t['kind'],$t['performance'],$t['definition'],$u['name'],bin2hex(random_bytes(24))]);
  db()->commit();jsonout(['ok'=>true,'count'=>count($valid),'message'=>'تم إرسال نسخ مستقلة من القالب إلى مكتبات المعلمات المحددات.']);
 }
 if ($op==='save_template') {
  admin($u);$b=body();$id=(int)($b['id']??0);$d=definition($b);$name=required($b['name']??'',200);$kind=$b['kind']??'custom';if (!in_array($kind,['applied','workshop','custom'],true)) fail('نوع قالب غير صالح.');
  if ($id) sql('UPDATE ms_templates SET name=?,kind=?,definition=?,active=? WHERE id=?',[$name,$kind,json_encode($d,JSON_UNESCAPED_UNICODE),!empty($b['active'])?1:0,$id]);
  else sql('INSERT INTO ms_templates(name,kind,definition) VALUES (?,?,?)',[$name,$kind,json_encode($d,JSON_UNESCAPED_UNICODE)]);jsonout(['ok'=>true]);
 }
 if ($op==='settings') { admin($u);jsonout(['items'=>sql('SELECT * FROM ms_settings')->fetchAll(),'auth_mode'=>$cfg['auth_mode']]); }
 if ($op==='save_settings') { admin($u);$b=body();sql("UPDATE ms_settings SET setting_value=? WHERE setting_key='registration_open'",[!empty($b['registration_open'])?'1':'0']);jsonout(['ok'=>true]); }
 fail('العملية غير موجودة.',404);
} catch (DomainException $e) {
 if (isset($cfg)) { try { if (db()->inTransaction()) db()->rollBack(); } catch (Throwable $ignored) {} }
 jsonout(['error'=>$e->getMessage()],in_array($e->getCode(),[400,401,403,404,405,409,413,429,503],true)?$e->getCode():400);
} catch (Throwable $e) {
 if (isset($cfg)) { try { if (db()->inTransaction()) db()->rollBack(); } catch (Throwable $ignored) {} }
 error_log('Madar surveys: '.get_class($e).' '.$e->getMessage());
 http_response_code(500);header('Content-Type: application/json; charset=utf-8');echo json_encode(['error'=>'تعذر إكمال الطلب. راجعي سجل الخادم.'],JSON_UNESCAPED_UNICODE);
}
