<?php
try {
 require dirname(__DIR__).'/app/bootstrap.php';$u=user(false);$key=$_GET['key']??'';
 if (!preg_match('/^[a-f0-9]{32}\.png$/D',$key)) fail('الشعار غير موجود.',404);
 $allowed=$u&&((int)$u['is_admin']||$u['logo_key']===$key);
 if (!$allowed) {
  $s=sql('SELECT owner_id,status,share_token FROM ms_surveys WHERE logo_key=? AND id=?',[$key,(int)($_GET['survey']??0)])->fetch();
  $allowed=$s&&(($u&&(int)$s['owner_id']===(int)$u['id'])||($s['status']==='published'&&hash_equals($s['share_token'],(string)($_GET['token']??''))));
 }
 if (!$allowed) fail('غير مصرح.',403);
 $file=$cfg['logo_dir'].'/'.$key;if (!is_file($file)) fail('الشعار غير موجود.',404);
 header('Content-Type: image/png');header('Content-Length: '.filesize($file));readfile($file);
} catch (Throwable $e) { http_response_code($e instanceof DomainException?$e->getCode():500); }
