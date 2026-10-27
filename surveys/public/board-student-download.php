<?php
declare(strict_types=1);
try {
 require dirname(__DIR__).'/app/bootstrap.php';require dirname(__DIR__).'/app/board-common.php';require dirname(__DIR__).'/app/board-student-auth.php';
 $native=Auth::realUser();if(!$native)fail('يلزم تسجيل الدخول.',401);PortalAccess::requirePortal($native);mbEnsureSchema();
 $student=mbCurrentStudent();$id=mbId($_GET['id']??null);
 $file=sql('SELECT * FROM mb_files WHERE id=? AND deleted_at IS NULL',[$id])->fetch();
 if(!$file)fail('الملف غير موجود.',404);mbStudentClassAccess((int)$file['class_id'],$student);
 if($file['post_id']){
  $post=sql("SELECT p.id FROM mb_posts p LEFT JOIN mb_wall_posts w ON w.post_id=p.id WHERE p.id=? AND p.class_id=? AND p.status='published' AND w.deleted_at IS NULL AND (w.folder_id IS NULL OR EXISTS(SELECT 1 FROM mb_wall_folders f LEFT JOIN mb_wall_folder_state st ON st.folder_id=f.id WHERE f.id=w.folder_id AND f.deleted_at IS NULL AND COALESCE(st.is_open,1)=1))",[$file['post_id'],$file['class_id']])->fetchColumn();if(!$post)fail('المرفق غير منشور.',403);
 }elseif((int)$file['student_id']!==(int)$student['id'])fail('ليس لديك إذن بهذا الملف.',403);
 $path=mbFileDirectory().'/'.$file['storage_name'];if(!is_file($path))fail('الملف غير موجود.',404);
 header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');header("Content-Security-Policy: default-src 'none'; sandbox");
 header('Content-Type: '.$file['mime']);header('Content-Disposition: '.((($_GET['view']??'')==='1'&&in_array($file['mime'],['image/jpeg','image/png','image/webp','application/pdf'],true))?'inline':'attachment').'; filename="board-file"; filename*=UTF-8\'\''.rawurlencode($file['file_name']));header('Content-Length: '.filesize($path));readfile($path);exit;
} catch(DomainException $e){http_response_code(in_array($e->getCode(),[401,403,404])?$e->getCode():400);echo htmlspecialchars($e->getMessage(),ENT_QUOTES,'UTF-8');}
