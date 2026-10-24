<?php
declare(strict_types=1);
try {
 require dirname(__DIR__).'/app/bootstrap.php';require dirname(__DIR__).'/app/board-common.php';
 $u=mbActor();$id=mbId($_GET['id']??null);
 $f=sql('SELECT * FROM mb_files WHERE id=? AND deleted_at IS NULL',[$id])->fetch();if(!$f)fail('الملف غير موجود.',404);
 if($f['post_id'])mbWallPost($u,(int)$f['post_id']);
 mbAccess($u,(int)$f['class_id']);mbRequireFileSubject($u,$f);if($f['student_id'])mbStudentClass((int)$f['class_id'],(int)$f['student_id']);
 $path=mbFileDirectory().'/'.$f['storage_name'];if(!is_file($path))fail('تعذر العثور على الملف.',404);
 header('Cache-Control: private, no-store');header('Content-Type: '.$f['mime']);header('X-Content-Type-Options: nosniff');header('Content-Disposition: '.((($_GET['view']??'')==='1'&&in_array($f['mime'],['image/jpeg','image/png','image/webp','application/pdf'],true))?'inline':'attachment').'; filename="board-file"; filename*=UTF-8\'\''.rawurlencode($f['file_name']));header('Content-Length: '.filesize($path));readfile($path);exit;
} catch(DomainException $e){http_response_code(in_array($e->getCode(),[401,403,404])?$e->getCode():400);echo htmlspecialchars($e->getMessage(),ENT_QUOTES,'UTF-8');}
