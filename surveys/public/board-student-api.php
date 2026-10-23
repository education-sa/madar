<?php
declare(strict_types=1);
try {
 require dirname(__DIR__).'/app/bootstrap.php';
 require dirname(__DIR__).'/app/board-common.php';
 require dirname(__DIR__).'/app/board-student-auth.php';
 $native=Auth::realUser();if(!$native)fail('يلزم تسجيل الدخول.',401);PortalAccess::requirePortal($native);mbEnsureSchema();
 $op=(string)($_GET['op']??'home');$method=$_SERVER['REQUEST_METHOD']??'GET';
 if(!in_array($op,['home','class','portfolio','submit_post','upload'],true))fail('الإجراء غير معروف.',404);
 if(($method==='GET'&&!in_array($op,['home','class','portfolio'],true))||($method==='POST'&&!in_array($op,['submit_post','upload'],true)))fail('طريقة الطلب غير مسموحة.',405);
 if($method==='POST') csrf();
 $s=mbCurrentStudent();if($method==='POST')rate('mb_board_student_'.$op.'_'.$s['id'],100);
 if($op==='home') {
  $classes=sql('SELECT c.id,c.title,c.grade,c.section_name,c.academic_year FROM mb_classes c JOIN mb_class_students x ON x.class_id=c.id WHERE x.student_id=? AND c.is_active=1 ORDER BY c.title',[$s['id']])->fetchAll();
  jsonout(['student'=>['name'=>$s['display_name'],'mode'=>$s['entry_mode']],'classes'=>$classes,'csrf'=>$_SESSION['ms_csrf']]);
 }
 if($op==='class') {
  $id=mbId($_GET['id']??null);$c=mbStudentClassAccess($id,$s);
  $subjects=sql("SELECT DISTINCT p.subject FROM mb_teacher_profiles p JOIN mb_teachers t ON t.class_id=p.class_id AND t.teacher_id=p.teacher_id JOIN ms_users mu ON mu.id=p.teacher_id JOIN teachers nt ON mu.external_id=CONCAT('teacher:',nt.id) AND nt.status='active' AND nt.deleted_at IS NULL JOIN mb_native_access na ON na.subject_type='teacher' AND na.subject_id=nt.id AND na.portal_enabled=1 AND na.access_mode<>'madar_only' WHERE p.class_id=? AND t.can_view=1 AND p.approved=1 AND p.subject<>'' ORDER BY p.subject",[$id])->fetchAll(PDO::FETCH_COLUMN);
  $posts=sql("SELECT p.id,p.title,p.content,p.created_at,u.name AS author FROM mb_posts p JOIN ms_users u ON u.id=p.author_id WHERE p.class_id=? AND p.status='published' ORDER BY p.id DESC LIMIT 100",[$id])->fetchAll();
  $mine=sql('SELECT id,title,status,created_at FROM mb_posts WHERE class_id=? AND student_id=? ORDER BY id DESC LIMIT 40',[$id,$s['id']])->fetchAll();
  jsonout(['class'=>['id'=>$id,'title'=>$c['title']],'subjects'=>$subjects,'posts'=>$posts,'my_posts'=>$mine]);
 }
 if($op==='portfolio') {
  $id=mbId($_GET['class_id']??null);mbStudentClassAccess($id,$s);
  $files=sql('SELECT id,file_name,subject,file_size,created_at FROM mb_files WHERE class_id=? AND student_id=? AND deleted_at IS NULL ORDER BY id DESC',[$id,$s['id']])->fetchAll();
  jsonout(['items'=>$files]);
 }
 if($op==='submit_post') {
  $b=body();$id=mbId($b['class_id']??null);mbStudentClassAccess($id,$s);
  $title=required($b['title']??'',170);$content=required($b['content']??'',4000);
  sql("INSERT INTO mb_posts(class_id,student_id,title,content,status) VALUES (?,?,?,?,'pending')",[$id,$s['id'],$title,$content]);
  jsonout(['message'=>'أُرسلت مشاركتك للمراجعة قبل النشر.']);
 }
 if($op==='upload') {
  $id=mbId($_POST['class_id']??null);mbStudentClassAccess($id,$s);
  $subject=required($_POST['subject']??'',85);
  if(!sql("SELECT 1 FROM mb_teacher_profiles p JOIN mb_teachers t ON t.class_id=p.class_id AND t.teacher_id=p.teacher_id JOIN ms_users mu ON mu.id=p.teacher_id JOIN teachers nt ON mu.external_id=CONCAT('teacher:',nt.id) AND nt.status='active' AND nt.deleted_at IS NULL JOIN mb_native_access na ON na.subject_type='teacher' AND na.subject_id=nt.id AND na.portal_enabled=1 AND na.access_mode<>'madar_only' WHERE p.class_id=? AND p.approved=1 AND t.can_view=1 AND p.subject=? LIMIT 1",[$id,$subject])->fetchColumn())fail('اختاري مادة معتمدة لهذا الفصل.',403);
  $f=$_FILES['file']??null;
  if(!$f||!is_array($f)||$f['error']!==UPLOAD_ERR_OK||$f['size']<1||$f['size']>10485760)fail('اختاري ملفًا لا يتجاوز 10 ميغابايت.');
  $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
  if(!in_array($mime,['application/pdf','image/jpeg','image/png','image/webp'],true))fail('يسمح بصور JPG/PNG/WebP وPDF فقط.');
  $dir=mbFileDirectory();if(!is_dir($dir)&&!mkdir($dir,0700,true))fail('تعذر تجهيز التخزين.',503);
  $key=bin2hex(random_bytes(24));$path=$dir.'/'.$key;
  if(!move_uploaded_file($f['tmp_name'],$path))fail('تعذر حفظ الملف.',503);chmod($path,0600);
  try{sql('INSERT INTO mb_files(class_id,student_id,subject,file_name,storage_name,mime,file_size,uploaded_by_student) VALUES (?,?,?,?,?,?,?,?)',[$id,$s['id'],$subject,required($f['name'],200),$key,$mime,$f['size'],$s['id']]);}
  catch(Throwable $err){unlink($path);throw $err;}
  jsonout(['message'=>'تم حفظ الملف في ملف إنجازك المدرسي.']);
 }
 fail('غير متاح.',404);
} catch(DomainException $e){
 if(isset($cfg))try{if(db()->inTransaction())db()->rollBack();}catch(Throwable $ignored){}
 jsonout(['error'=>$e->getMessage()],in_array($e->getCode(),[400,401,403,404,405,409,413,429,503],true)?$e->getCode():400);
} catch(Throwable $e){
 error_log('Madar board student: '.get_class($e).' '.$e->getMessage());http_response_code(500);jsonout(['error'=>'تعذر إكمال العملية. تحققي من تثبيت لوحتي.']);
}
