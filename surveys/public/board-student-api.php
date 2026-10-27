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
  $subjects=sql("SELECT DISTINCT c.id AS class_id,c.title AS class_title,p.subject,mu.name AS teacher_name FROM mb_classes c JOIN mb_class_students cs ON cs.class_id=c.id JOIN mb_teacher_profiles p ON p.class_id=c.id JOIN mb_teachers t ON t.class_id=c.id AND t.teacher_id=p.teacher_id JOIN ms_users mu ON mu.id=p.teacher_id JOIN teachers nt ON mu.external_id=CONCAT('teacher:',nt.id) AND nt.status='active' AND nt.deleted_at IS NULL JOIN mb_native_access na ON na.subject_type='teacher' AND na.subject_id=nt.id AND na.portal_enabled=1 AND na.access_mode<>'madar_only' WHERE cs.student_id=? AND c.is_active=1 AND p.approved=1 AND t.can_view=1 AND p.subject<>'' ORDER BY c.title,p.subject,mu.name",[$s['id']])->fetchAll();
  jsonout(['student'=>['name'=>$s['display_name'],'mode'=>$s['entry_mode']],'classes'=>$classes,'subjects'=>$subjects,'csrf'=>$_SESSION['ms_csrf']]);
 }
 if($op==='class') {
  $id=mbId($_GET['id']??null);$c=mbStudentClassAccess($id,$s);
  $subjects=sql("SELECT DISTINCT p.subject FROM mb_teacher_profiles p JOIN mb_teachers t ON t.class_id=p.class_id AND t.teacher_id=p.teacher_id JOIN ms_users mu ON mu.id=p.teacher_id JOIN teachers nt ON mu.external_id=CONCAT('teacher:',nt.id) AND nt.status='active' AND nt.deleted_at IS NULL JOIN mb_native_access na ON na.subject_type='teacher' AND na.subject_id=nt.id AND na.portal_enabled=1 AND na.access_mode<>'madar_only' WHERE p.class_id=? AND t.can_view=1 AND p.approved=1 AND p.subject<>'' ORDER BY p.subject",[$id])->fetchAll(PDO::FETCH_COLUMN);
  $posts=sql("SELECT p.id,p.title,p.content,p.created_at,COALESCE(u.name,st.display_name,'المدرسة') AS author,w.folder_id FROM mb_posts p LEFT JOIN ms_users u ON u.id=p.author_id LEFT JOIN mb_students st ON st.id=p.student_id LEFT JOIN mb_wall_posts w ON w.post_id=p.id WHERE p.class_id=? AND p.status='published' AND w.deleted_at IS NULL AND (w.folder_id IS NULL OR EXISTS(SELECT 1 FROM mb_wall_folders wf LEFT JOIN mb_wall_folder_state ws ON ws.folder_id=wf.id WHERE wf.id=w.folder_id AND wf.deleted_at IS NULL AND COALESCE(ws.is_open,1)=1)) ORDER BY p.id DESC LIMIT 100",[$id])->fetchAll();
  $attachments=sql("SELECT f.id,f.post_id,f.file_name FROM mb_files f JOIN mb_posts p ON p.id=f.post_id LEFT JOIN mb_wall_posts w ON w.post_id=p.id WHERE f.class_id=? AND f.deleted_at IS NULL AND p.status='published' AND w.deleted_at IS NULL AND (w.folder_id IS NULL OR EXISTS(SELECT 1 FROM mb_wall_folders wf LEFT JOIN mb_wall_folder_state ws ON ws.folder_id=wf.id WHERE wf.id=w.folder_id AND wf.deleted_at IS NULL AND COALESCE(ws.is_open,1)=1))",[$id])->fetchAll();
  foreach($posts as &$post)$post['attachments']=array_values(array_filter($attachments,fn($f)=>(int)$f['post_id']===(int)$post['id']));unset($post);
  $mine=sql('SELECT id,title,status,created_at FROM mb_posts WHERE class_id=? AND student_id=? ORDER BY id DESC LIMIT 40',[$id,$s['id']])->fetchAll();
  $folders=sql('SELECT f.id,f.name,f.description,f.color,COALESCE(st.is_open,1) AS is_open FROM mb_wall_folders f LEFT JOIN mb_wall_folder_state st ON st.folder_id=f.id WHERE f.class_id=? AND f.deleted_at IS NULL ORDER BY id',[$id])->fetchAll();
  jsonout(['class'=>['id'=>$id,'title'=>$c['title']],'subjects'=>$subjects,'folders'=>$folders,'posts'=>$posts,'my_posts'=>$mine]);
 }
 if($op==='portfolio') {
  $id=mbId($_GET['class_id']??null);mbStudentClassAccess($id,$s);
  $files=sql('SELECT f.id,f.file_name,f.subject,f.file_size,f.created_at,ft.title FROM mb_files f LEFT JOIN mb_file_titles ft ON ft.file_id=f.id WHERE f.class_id=? AND f.student_id=? AND f.post_id IS NULL AND f.deleted_at IS NULL ORDER BY f.id DESC',[$id,$s['id']])->fetchAll();
  jsonout(['items'=>$files]);
 }
 if($op==='submit_post') {
  $b=str_starts_with($_SERVER['CONTENT_TYPE']??'','multipart/form-data')?$_POST:body();$id=mbId($b['class_id']??null);mbStudentClassAccess($id,$s);
  $title=required($b['title']??'',170);$content=trim((string)($b['content']??''));if(mb_strlen($content)>4000)fail('المشاركة أطول من المسموح.');
  $folder=empty($b['folder_id'])?null:mbId($b['folder_id']);
  $file=isset($_FILES['file'])&&($_FILES['file']['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE?mbStudentUploadFile($_FILES['file']):null;
  if($content===''&&!$file)fail('اكتبي المشاركة أو أرفقي ملفًا.');
  try{db()->beginTransaction();
   if($folder){$f=sql('SELECT f.id,COALESCE(st.is_open,1) AS is_open FROM mb_wall_folders f LEFT JOIN mb_wall_folder_state st ON st.folder_id=f.id WHERE f.id=? AND f.class_id=? AND f.deleted_at IS NULL FOR UPDATE',[$folder,$id])->fetch();if(!$f||(int)$f['is_open']!==1)fail('الجدارية مغلقة أو غير متاحة.',403);}
   sql("INSERT INTO mb_posts(class_id,student_id,title,content,status) VALUES (?,?,?,?,'pending')",[$id,$s['id'],$title,$content]);$pid=(int)db()->lastInsertId();
   sql('INSERT INTO mb_wall_posts(post_id,folder_id) VALUES (?,?)',[$pid,$folder]);
   if($file)sql('INSERT INTO mb_files(class_id,student_id,post_id,file_name,storage_name,mime,file_size,uploaded_by_student) VALUES (?,?,?,?,?,?,?,?)',[$id,$s['id'],$pid,$file['name'],$file['key'],$file['mime'],$file['size'],$s['id']]);
   db()->commit();
  }catch(Throwable $err){if(db()->inTransaction())db()->rollBack();if($file)unlink($file['path']);throw $err;}
  jsonout(['message'=>'أُرسلت مشاركتك للمراجعة قبل النشر.']);
 }
 if($op==='upload') {
  $id=mbId($_POST['class_id']??null);mbStudentClassAccess($id,$s);
  $subject=required($_POST['subject']??'',85);
  if(!sql("SELECT 1 FROM mb_teacher_profiles p JOIN mb_teachers t ON t.class_id=p.class_id AND t.teacher_id=p.teacher_id JOIN ms_users mu ON mu.id=p.teacher_id JOIN teachers nt ON mu.external_id=CONCAT('teacher:',nt.id) AND nt.status='active' AND nt.deleted_at IS NULL JOIN mb_native_access na ON na.subject_type='teacher' AND na.subject_id=nt.id AND na.portal_enabled=1 AND na.access_mode<>'madar_only' WHERE p.class_id=? AND p.approved=1 AND t.can_view=1 AND p.subject=? LIMIT 1",[$id,$subject])->fetchColumn())fail('اختاري مادة معتمدة لهذا الفصل.',403);
  $title=trim((string)($_POST['title']??''));if(mb_strlen($title)>170)fail('عنوان الإنجاز أطول من المسموح.');
  $file=mbStudentUploadFile($_FILES['file']??null);
  try{db()->beginTransaction();sql('INSERT INTO mb_files(class_id,student_id,subject,file_name,storage_name,mime,file_size,uploaded_by_student) VALUES (?,?,?,?,?,?,?,?)',[$id,$s['id'],$subject,$file['name'],$file['key'],$file['mime'],$file['size'],$s['id']]);$fid=(int)db()->lastInsertId();if($title!=='')sql('INSERT INTO mb_file_titles(file_id,title) VALUES (?,?)',[$fid,$title]);db()->commit();}
  catch(Throwable $err){if(db()->inTransaction())db()->rollBack();unlink($file['path']);throw $err;}
  jsonout(['message'=>'تم حفظ الملف في ملف إنجازك المدرسي.']);
 }
 fail('غير متاح.',404);
} catch(DomainException $e){
 if(isset($cfg))try{if(db()->inTransaction())db()->rollBack();}catch(Throwable $ignored){}
 jsonout(['error'=>$e->getMessage()],in_array($e->getCode(),[400,401,403,404,405,409,413,429,503],true)?$e->getCode():400);
} catch(Throwable $e){
 error_log('Madar board student: '.get_class($e).' '.$e->getMessage());http_response_code(500);jsonout(['error'=>'تعذر إكمال العملية. تحققي من تثبيت لوحتي.']);
}

function mbStudentUploadFile(?array $f): array {
 if(!$f||!is_int($f['error']??null)||$f['error']!==UPLOAD_ERR_OK||!isset($f['size'],$f['tmp_name'],$f['name'])||!is_string($f['tmp_name'])||!is_string($f['name'])||$f['size']<1||$f['size']>10485760)fail('اختاري ملفًا لا يتجاوز 10 ميغابايت.');
 $name=required($f['name'],200);$mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);if(!in_array($mime,['application/pdf','image/jpeg','image/png','image/webp'],true))fail('يسمح بصور JPG/PNG/WebP وPDF فقط.');
 $dir=mbFileDirectory();if(!is_dir($dir)&&!mkdir($dir,0700,true))fail('تعذر تجهيز التخزين.',503);$key=bin2hex(random_bytes(24));$path=$dir.'/'.$key;
 if(!move_uploaded_file($f['tmp_name'],$path))fail('تعذر حفظ الملف.',503);chmod($path,0600);return ['name'=>$name,'mime'=>$mime,'key'=>$key,'path'=>$path,'size'=>$f['size']];
}
