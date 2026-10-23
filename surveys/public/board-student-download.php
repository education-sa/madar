<?php
declare(strict_types=1);
try {
 require dirname(__DIR__).'/app/bootstrap.php';require dirname(__DIR__).'/app/board-common.php';require dirname(__DIR__).'/app/board-student-auth.php';
 $native=Auth::realUser();if(!$native)fail('يلزم تسجيل الدخول.',401);PortalAccess::requirePortal($native);mbEnsureSchema();
 $student=mbCurrentStudent();$id=mbId($_GET['id']??null);
 $file=sql('SELECT * FROM mb_files WHERE id=? AND student_id=? AND deleted_at IS NULL',[$id,$student['id']])->fetch();
 if(!$file)fail('الملف غير موجود.',404);mbStudentClassAccess((int)$file['class_id'],$student);
 $path=mbFileDirectory().'/'.$file['storage_name'];if(!is_file($path))fail('الملف غير موجود.',404);
 header('Content-Type: '.$file['mime']);header('Content-Disposition: attachment; filename="board-file"; filename*=UTF-8\'\''.rawurlencode($file['file_name']));header('Content-Length: '.filesize($path));readfile($path);exit;
} catch(DomainException $e){http_response_code(in_array($e->getCode(),[401,403,404])?$e->getCode():400);echo htmlspecialchars($e->getMessage(),ENT_QUOTES,'UTF-8');}
