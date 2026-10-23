<?php
declare(strict_types=1);
try {
 require dirname(__DIR__).'/app/bootstrap.php';
 require dirname(__DIR__).'/app/board-common.php';
 $op=(string)($_GET['op']??'overview');$method=$_SERVER['REQUEST_METHOD']??'GET';
 $reads=['overview','class','students','portfolio','teachers','audit','files','comments'];
 if (!in_array($method,['GET','POST'],true) || ($method==='GET'&&!in_array($op,$reads,true)) || ($method==='POST'&&in_array($op,$reads,true))) fail('طريقة الطلب غير مسموحة.',405);
 if($method==='POST') csrf();
 $u=mbActor();$admin=mbAdmin($u);if($method==='POST')rate('mb_board_'.$op.'_'.$u['id'],150);$b=$method==='POST'?($op==='upload'?[]:body()):[];
 if($op==='overview') {
  $q=$admin?'SELECT c.*,(SELECT COUNT(*) FROM mb_class_students m WHERE m.class_id=c.id) AS students_count FROM mb_classes c ORDER BY c.is_active DESC,c.academic_year DESC,c.title':
   'SELECT c.*,(SELECT COUNT(*) FROM mb_class_students m WHERE m.class_id=c.id) AS students_count FROM mb_classes c JOIN mb_teachers t ON t.class_id=c.id AND t.teacher_id=? AND t.can_view=1 JOIN mb_teacher_profiles p ON p.class_id=t.class_id AND p.teacher_id=t.teacher_id AND p.approved=1 AND p.subject<>\'\' WHERE c.is_active=1 ORDER BY c.title';
  jsonout(['is_admin'=>$admin,'is_platform_owner'=>mbIsPlatformOwner($u),'is_first_teacher'=>mbIsFirstTeacher($u),'classes'=>sql($q,$admin?[]:[$u['id']])->fetchAll()]);
 }
 if($op==='teachers') {
  mbOwner($u);
  $syncConflicts=mbSyncMadarTeachers();
  $people=sql("SELECT id,name,email FROM ms_users WHERE active=1 AND id<>? AND external_id LIKE 'teacher:%' ORDER BY name LIMIT 1000",[$u['id']])->fetchAll();
  $members=sql('SELECT t.*,u.name,p.specialty,p.subject,p.grade_scope,p.approved FROM mb_teachers t JOIN ms_users u ON u.id=t.teacher_id LEFT JOIN mb_teacher_profiles p ON p.class_id=t.class_id AND p.teacher_id=t.teacher_id WHERE t.class_id=?', [mbId($_GET['class_id']??'')])->fetchAll();
  jsonout(['teachers'=>$people,'members'=>$members,'identity_conflicts'=>$syncConflicts]);
 }
 if($op==='create_class') {
  mbRequireBoardManager($u);$year=required($b['academic_year']??'',25);$grade=required($b['grade']??'',80);$section=required($b['section_name']??'',40);$title=required($b['title']??'',140);
  $key=hash('sha256',$year.'|'.$grade.'|'.$section);db()->beginTransaction();
  sql('INSERT IGNORE INTO mb_class_identity(identity_key) VALUES (?)',[$key]);
  $existing=sql('SELECT class_id FROM mb_class_identity WHERE identity_key=? FOR UPDATE',[$key])->fetchColumn();
  if($existing)fail('الفصل موجود مسبقًا ضمن فصول المدرسة المشتركة.',409);
  sql('INSERT INTO mb_classes(title,academic_year,grade,section_name,created_by) VALUES (?,?,?,?,?)',[$title,$year,$grade,$section,$u['id']]);$id=(int)db()->lastInsertId();
  sql('UPDATE mb_class_identity SET class_id=? WHERE identity_key=?',[$id,$key]);mbAudit($u,'create_class','class',$id,$title);db()->commit();jsonout(['id'=>$id]);
 }
 if($op==='archive_class') {
  mbRequireBoardManager($u);if(empty($b['confirmed']))fail('يلزم تأكيد هذا الإجراء.',409);$id=mbId($b['class_id']??null);mbClass($id);sql('UPDATE mb_classes SET is_active=? WHERE id=?',[!empty($b['is_active'])?1:0,$id]);mbAudit($u,'archive_class','class',$id);jsonout(['ok'=>true]);
 }
 if($op==='assign_teacher') {
  mbOwner($u);$id=mbId($b['class_id']??null);$class=mbClass($id);$tid=mbId($b['teacher_id']??null);
  $t=sql("SELECT u.id,u.external_id FROM ms_users u JOIN teachers nt ON u.external_id=CONCAT('teacher:',nt.id) WHERE u.id=? AND u.active=1 AND nt.status='active' AND nt.deleted_at IS NULL",[$tid])->fetch();if(!$t)fail('اختاري حساب معلمة نشطًا من القائمة.',404);
  $nativeId=(int)substr($t['external_id'],8);if(!PortalAccess::canPortal(['id'=>$nativeId,'subjectType'=>'teacher','role'=>'teacher','status'=>'active']))fail('مالكة الموقع لم تسمح لهذه المعلمة بدخول البوابة.',403);
  $specialty=required($b['specialty']??'',100);$subject=required($b['subject']??'',85);$gradeScope=required($b['grade_scope']??$class['grade'],100);
  $rights=['can_view'=>1,'can_post'=>!empty($b['can_post'])?1:0,'can_upload'=>!empty($b['can_upload'])?1:0,'can_manage_students'=>0,'can_manage_posts'=>!empty($b['can_manage_posts'])?1:0];
  sql('INSERT INTO mb_teachers(class_id,teacher_id,can_view,can_post,can_upload,can_manage_students,can_manage_posts) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE can_view=VALUES(can_view),can_post=VALUES(can_post),can_upload=VALUES(can_upload),can_manage_students=VALUES(can_manage_students),can_manage_posts=VALUES(can_manage_posts)',[$id,$tid,...array_values($rights)]);
  sql('INSERT INTO mb_teacher_profiles(class_id,teacher_id,specialty,subject,grade_scope,approved,approved_by) VALUES (?,?,?,?,?,1,?) ON DUPLICATE KEY UPDATE specialty=VALUES(specialty),subject=VALUES(subject),grade_scope=VALUES(grade_scope),approved=1,approved_by=VALUES(approved_by)',[$id,$tid,$specialty,$subject,$gradeScope,$u['id']]);
  mbAudit($u,'assign_teacher','class',$id,'teacher_id='.$tid.'; subject='.$subject);jsonout(['ok'=>true]);
 }
 if($op==='revoke_teacher') {
  mbOwner($u);if(empty($b['confirmed']))fail('يلزم تأكيد سحب الصلاحية.',409);$id=mbId($b['class_id']??null);$tid=mbId($b['teacher_id']??null);sql('DELETE FROM mb_teachers WHERE class_id=? AND teacher_id=?',[$id,$tid]);mbAudit($u,'revoke_teacher','class',$id,'teacher_id='.$tid);jsonout(['ok'=>true]);
 }
 if($op==='class') {
  $id=mbId($_GET['id']??null);$c=mbAccess($u,$id);
  $membership=$admin?['can_post'=>1,'can_upload'=>1,'can_manage_students'=>1,'can_manage_posts'=>1]:sql('SELECT * FROM mb_teachers WHERE class_id=? AND teacher_id=?',[$id,$u['id']])->fetch();
  if(!$admin)$membership['can_manage_students']=0;
  $posts=sql("SELECT p.*,COALESCE(u.name,st.display_name,'المدرسة') AS author_name,(SELECT COUNT(*) FROM mb_comments co WHERE co.post_id=p.id) AS comments_count FROM mb_posts p LEFT JOIN ms_users u ON u.id=p.author_id LEFT JOIN mb_students st ON st.id=p.student_id WHERE p.class_id=? AND (p.status='published' OR ?=1) ORDER BY p.created_at DESC,p.id DESC LIMIT 100",[$id,($admin||!empty($membership['can_manage_posts']))?1:0])->fetchAll();
  jsonout(['class'=>$c,'permissions'=>$membership,'is_admin'=>$admin,'is_platform_owner'=>mbIsPlatformOwner($u),'posts'=>$posts]);
 }
 if($op==='students') {
  $id=mbId($_GET['class_id']??null);mbAccess($u,$id);
  $rows=sql('SELECT s.* FROM mb_students s JOIN mb_class_students x ON x.student_id=s.id WHERE x.class_id=? ORDER BY s.display_name',[$id])->fetchAll();
  if(!$admin)foreach($rows as &$row){unset($row['madar_student_id'],$row['entry_mode'],$row['school_enabled']);} // Admin-only account controls
  jsonout(['items'=>$rows]);
 }
 if($op==='add_student') {
  $id=mbId($b['class_id']??null);mbRequireBoardManager($u);mbAccess($u,$id,'can_manage_students');
  $sid=mbId($b['madar_student_id']??null);
  try{$madarStudent=sql('SELECT id,name,status FROM students WHERE id=? AND deleted_at IS NULL LIMIT 1',[$sid])->fetch();}
  catch(PDOException $e){if(($e->errorInfo[1]??0)===1146)fail('تعذر التحقق من حساب الطالبة في مدار. تأكدي من استخدام قاعدة بيانات مدار نفسها.',503);throw $e;}
  if(!$madarStudent || ($madarStudent['status']??'active')!=='active')fail('لم يُعثر على حساب طالبة نشط بهذا الرقم في مدار.',404);
  $name=required((string)$madarStudent['name'],160);
  db()->beginTransaction();
  sql('INSERT INTO mb_students(madar_student_id,display_name) VALUES (?,?) ON DUPLICATE KEY UPDATE madar_student_id=VALUES(madar_student_id)',[$sid,$name]);
  $row=sql('SELECT id,display_name FROM mb_students WHERE madar_student_id=?',[$sid])->fetch();
  if($row['display_name']!==$name)fail('المعرّف مسجل باسم مختلف. راجعي حساب الطالبة قبل ربطه.',409);
  sql('INSERT IGNORE INTO mb_class_students(class_id,student_id) VALUES (?,?)',[$id,$row['id']]);mbAudit($u,'add_student','class',$id,'student_id='.$row['id']);db()->commit();jsonout(['ok'=>true]);
 }
 if($op==='remove_student') {
  $id=mbId($b['class_id']??null);mbRequireBoardManager($u);mbAccess($u,$id,'can_manage_students');$sid=mbId($b['student_id']??null);
  sql('DELETE FROM mb_class_students WHERE class_id=? AND student_id=?',[$id,$sid]);mbAudit($u,'remove_student','class',$id,'student_id='.$sid);jsonout(['ok'=>true]);
 }
 if($op==='create_student') {
  mbRequireBoardManager($u);$cid=mbId($b['class_id']??null);$class=mbAccess($u,$cid);
  $name=required($b['name']??'',140);$email=Http::schoolEmail(required($b['email']??'',190));
  $password=required($b['password']??'',200);Auth::validatePassword($password);
  if(strlen($password)>72)fail('كلمة المرور أطول من المسموح.');
  $stage=$b['stage']??'';if(!in_array($stage,['ابتدائي','متوسط','ثانوي'],true))fail('اختاري المرحلة الدراسية.');
  if(sql('SELECT id FROM students WHERE email=?',[$email])->fetchColumn())fail('الطالبة مسجلة في مدار؛ استخدمي ربط طالبة موجودة دون إنشاء حساب مكرر.',409);
  foreach(['teachers','owners','platform_users'] as $accountTable)if(sql('SELECT id FROM '.$accountTable.' WHERE email=? LIMIT 1',[$email])->fetchColumn())fail('البريد مستخدم في حساب مدار آخر؛ لا يمكن إنشاء حساب مكرر.',409);
  db()->beginTransaction();
  sql("INSERT INTO students(class_id,name,email,password_hash,stage,grade_label,status,must_change_password) VALUES (NULL,?,?,?,?,?,'active',1)",[$name,$email,password_hash($password,PASSWORD_DEFAULT),$stage,$class['grade']]);$native=(int)db()->lastInsertId();
  sql("INSERT INTO mb_students(madar_student_id,display_name,entry_mode,school_enabled) VALUES (?,?, 'school_only',1)",[$native,$name]);$sid=(int)db()->lastInsertId();
  sql('INSERT INTO mb_class_students(class_id,student_id) VALUES (?,?)',[$cid,$sid]);
  sql("INSERT INTO mb_native_access(subject_type,subject_id,access_mode,portal_enabled) VALUES ('student',?,'portal_only',1)",[$native]);
  mbAudit($u,'create_student','student',$sid,'native_id='.$native.'; class_id='.$cid);db()->commit();jsonout(['id'=>$sid,'madar_student_id'=>$native]);
 }
 if($op==='reset_student_password') {
  mbRequireBoardManager($u);$cid=mbId($b['class_id']??null);mbAccess($u,$cid);$sid=mbId($b['student_id']??null);mbStudentClass($cid,$sid);
  if(empty($b['confirmed']))fail('أكدي إعادة تعيين كلمة المرور أولًا.',409);
  $password=required($b['new_password']??'',200);Auth::validatePassword($password);if(strlen($password)>72)fail('كلمة المرور أطول من المسموح.');
  $native=sql('SELECT madar_student_id FROM mb_students WHERE id=?',[$sid])->fetchColumn();
  if(!$native || !sql("SELECT id FROM students WHERE id=? AND deleted_at IS NULL AND status='active'",[$native])->fetchColumn())fail('حساب الطالبة غير متاح.',404);
  db()->beginTransaction();sql('UPDATE students SET password_hash=?,must_change_password=1 WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$native]);
  mbAudit($u,'reset_student_password','student',$sid,'native_id='.$native.'; class_id='.$cid);db()->commit();jsonout(['ok'=>true]);
 }
 if($op==='new_post') {
  $id=mbId($b['class_id']??null);mbAccess($u,$id,'can_post');$title=required($b['title']??'',170);$content=required($b['content']??'',7000);
  sql("INSERT INTO mb_posts(class_id,author_id,title,content,status) VALUES (?,?,?,?,'published')",[$id,$u['id'],$title,$content]);$pid=(int)db()->lastInsertId();mbAudit($u,'new_post','post',$pid);jsonout(['id'=>$pid]);
 }
 if($op==='edit_post') {
  $pid=mbId($b['post_id']??null);$p=sql('SELECT * FROM mb_posts WHERE id=?',[$pid])->fetch();if(!$p)fail('المنشور غير موجود.',404);
  mbAccess($u,(int)$p['class_id'],'can_post');$rights=$admin?true:sql('SELECT can_manage_posts FROM mb_teachers WHERE class_id=? AND teacher_id=?',[$p['class_id'],$u['id']])->fetchColumn();
  if(!$admin&&(int)$p['author_id']!==(int)$u['id']&&!(int)$rights)fail('لا يمكنك تعديل منشور معلمة أخرى.',403);
  sql('UPDATE mb_posts SET title=?,content=? WHERE id=?',[required($b['title']??'',170),required($b['content']??'',7000),$pid]);mbAudit($u,'edit_post','post',$pid);jsonout(['ok'=>true]);
 }
 if($op==='set_post_status') {
  $pid=mbId($b['post_id']??null);$p=sql('SELECT class_id FROM mb_posts WHERE id=?',[$pid])->fetch();if(!$p)fail('المنشور غير موجود.',404);
  mbAccess($u,(int)$p['class_id'],'can_manage_posts');$status=$b['status']??'';if(!in_array($status,['published','hidden'],true))fail('حالة غير صالحة.');
  sql('UPDATE mb_posts SET status=? WHERE id=?',[$status,$pid]);mbAudit($u,'post_status','post',$pid,$status);jsonout(['ok'=>true]);
 }
 if($op==='comment') {
  $pid=mbId($b['post_id']??null);$p=sql("SELECT * FROM mb_posts WHERE id=? AND status='published'",[$pid])->fetch();if(!$p)fail('المنشور غير موجود.',404);mbAccess($u,(int)$p['class_id']);
  sql('INSERT INTO mb_comments(post_id,author_id,body) VALUES (?,?,?)',[$pid,$u['id'],required($b['body']??'',1500)]);jsonout(['ok'=>true]);
 }
 if($op==='portfolio') {
  $cid=mbId($_GET['class_id']??null);mbAccess($u,$cid);$sid=mbId($_GET['student_id']??null);mbStudentClass($cid,$sid);
  $student=sql('SELECT id,display_name FROM mb_students WHERE id=?',[$sid])->fetch();
  $subject=mbSubject($u,$cid);
  $files=sql("SELECT f.id,f.uploaded_by,f.file_name,f.file_size,f.subject,f.created_at,COALESCE(u.name,'الطالبة') AS author FROM mb_files f LEFT JOIN ms_users u ON u.id=f.uploaded_by WHERE f.class_id=? AND f.student_id=? AND f.deleted_at IS NULL AND (? IS NULL OR f.subject=?) ORDER BY f.created_at DESC",[$cid,$sid,$subject,$subject])->fetchAll();
  jsonout(['student'=>$student,'files'=>$files]);
 }
 if($op==='files') {
  $cid=mbId($_GET['class_id']??null);mbAccess($u,$cid);
  $subject=mbSubject($u,$cid);
  $rows=sql('SELECT f.id,f.uploaded_by,f.file_name,f.subject,f.file_size,f.created_at,u.name AS author FROM mb_files f LEFT JOIN ms_users u ON u.id=f.uploaded_by WHERE f.class_id=? AND f.student_id IS NULL AND f.deleted_at IS NULL AND (? IS NULL OR f.subject=?) ORDER BY f.id DESC',[$cid,$subject,$subject])->fetchAll();
  jsonout(['items'=>$rows]);
 }
 if($op==='comments') {
  $pid=mbId($_GET['post_id']??null);$post=sql('SELECT * FROM mb_posts WHERE id=?',[$pid])->fetch();if(!$post)fail('المنشور غير موجود.',404);
  mbAccess($u,(int)$post['class_id']);if($post['status']!=='published'&&!$admin)fail('المنشور غير منشور.',403);
  $items=sql('SELECT c.id,c.body,c.created_at,u.name AS author FROM mb_comments c JOIN ms_users u ON u.id=c.author_id WHERE c.post_id=? ORDER BY c.id LIMIT 100',[$pid])->fetchAll();jsonout(['items'=>$items]);
 }
 if($op==='upload') {
  $cid=mbId($_POST['class_id']??null);mbAccess($u,$cid,'can_upload');$studentId=!empty($_POST['student_id'])?mbId($_POST['student_id']):null;
  if($studentId)mbStudentClass($cid,$studentId);
  $f=$_FILES['file']??null;if(!$f||!is_array($f)||$f['error']!==UPLOAD_ERR_OK||$f['size']<1||$f['size']>10485760)fail('اختاري ملفًا لا يتجاوز 10 ميغابايت.');
  $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
  $types=['application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];
  if(!isset($types[$mime]))fail('يسمح حاليًا بملفات PDF وصور JPG وPNG وWebP فقط.');
  $display=required($_POST['file_name']??$f['name'],200);$assignedSubject=mbSubject($u,$cid);$subject=$assignedSubject??required($_POST['subject']??'عام',85);
  $dir=mbFileDirectory();if(!is_dir($dir)&&!mkdir($dir,0700,true))fail('فشل تجهيز التخزين.',503);
  $key=bin2hex(random_bytes(24));$path=$dir.'/'.$key;
  if(!move_uploaded_file($f['tmp_name'],$path))fail('تعذر حفظ الملف.',503);chmod($path,0600);
  try {sql('INSERT INTO mb_files(class_id,student_id,subject,file_name,storage_name,mime,file_size,uploaded_by) VALUES (?,?,?,?,?,?,?,?)',[$cid,$studentId,$subject,$display,$key,$mime,$f['size'],$u['id']]);}
  catch(Throwable $e){unlink($path);throw $e;}
  mbAudit($u,'upload','file',(int)db()->lastInsertId(),$display);jsonout(['ok'=>true]);
 }
 if($op==='delete_file') {
  $fid=mbId($b['file_id']??null);$file=sql('SELECT * FROM mb_files WHERE id=? AND deleted_at IS NULL',[$fid])->fetch();if(!$file)fail('الملف غير موجود.',404);
  mbAccess($u,(int)$file['class_id'],'can_upload');mbRequireFileSubject($u,$file);if(!$admin && !empty($file['uploaded_by']) && (int)$file['uploaded_by']!==(int)$u['id'])fail('لا يمكنك إدارة ملف معلمة أخرى.',403);
  sql('UPDATE mb_files SET deleted_at=UTC_TIMESTAMP() WHERE id=?',[$fid]);mbAudit($u,'delete_file','file',$fid);jsonout(['ok'=>true]);
 }
 if($op==='audit') {mbRequireBoardManager($u);jsonout(['items'=>sql('SELECT a.*,u.name AS actor FROM mb_audit a JOIN ms_users u ON a.actor_id=u.id ORDER BY a.id DESC LIMIT 100')->fetchAll()]);}
 fail('الإجراء غير موجود.',404);
} catch(DomainException $e) {
 if(isset($cfg))try{if(db()->inTransaction())db()->rollBack();}catch(Throwable $ignored){}
 jsonout(['error'=>$e->getMessage()],in_array($e->getCode(),[400,401,403,404,405,409,413,429,503],true)?$e->getCode():400);
} catch(Throwable $e) {
 if(isset($cfg))try{if(db()->inTransaction())db()->rollBack();}catch(Throwable $ignored){}
 error_log('Madar board: '.get_class($e).' '.$e->getMessage());http_response_code(500);jsonout(['error'=>'تعذر إكمال العملية. تأكدي من تثبيت جداول لوحتي ومراجعة سجل الخادم.']);
}
