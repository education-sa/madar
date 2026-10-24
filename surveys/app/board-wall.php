<?php
declare(strict_types=1);
function mbWallSchema(): void {
 try {sql('SELECT id FROM mb_wall_folders LIMIT 0');sql('SELECT post_id FROM mb_wall_posts LIMIT 0');}
 catch(PDOException $e){if((int)($e->errorInfo[1]??0)!==1146)throw $e;mbRunMigration(dirname(__DIR__).'/database/migrations/20261024_class_wall.sql');}
}
function mbWallFolder(array $u,int $id,?int $cid=null,bool $edit=false): array {
 $f=sql('SELECT * FROM mb_wall_folders WHERE id=? AND deleted_at IS NULL',[$id])->fetch();
 if(!$f || ($cid!==null&&(int)$f['class_id']!==$cid))fail('المجلد غير موجود في هذا الفصل.',404);
 mbAccess($u,(int)$f['class_id'],$edit?'can_post':'can_view');
 if($edit&&!mbAdmin($u)&&(int)$f['created_by']!==(int)$u['id']) {
  $p=mbEffectiveRights($u,(int)$f['class_id']);if(!(int)$p['can_manage_posts'])fail('لا يمكنك إدارة مجلد معلمة أخرى.',403);
 }
 return $f;
}
function mbWallPost(array $u,int $id,bool $edit=false): array {
 $p=sql('SELECT p.*,w.folder_id,w.deleted_at FROM mb_posts p LEFT JOIN mb_wall_posts w ON w.post_id=p.id WHERE p.id=?',[$id])->fetch();
 if(!$p||$p['deleted_at'])fail('المنشور غير موجود.',404);
 mbAccess($u,(int)$p['class_id'],$edit?'can_post':'can_view');
 if($edit&&!mbAdmin($u)&&(int)$p['author_id']!==(int)$u['id']) {
  $m=mbEffectiveRights($u,(int)$p['class_id']);if(!(int)$m['can_manage_posts'])fail('لا يمكنك إدارة منشور معلمة أخرى.',403);
 }
 if(!$edit&&$p['status']!=='published'&&!mbAdmin($u)) {
  $m=mbEffectiveRights($u,(int)$p['class_id']);if(!(int)$m['can_manage_posts'])fail('المنشور غير منشور.',403);
 }
 return $p;
}
function mbWallFolderId(array $u,$raw,int $cid): ?int {
 if($raw===null||$raw==='')return null;
 $id=mbId($raw);mbWallFolder($u,$id,$cid);return $id;
}
function mbWallRoute(string $op,array $u,array $b): void {
 if(in_array($op,['create_folder','edit_folder','delete_folder'],true)){
  $id=$op==='create_folder'?null:mbId($b['folder_id']??null);
  $cid=$id?(int)mbWallFolder($u,$id,null,true)['class_id']:mbId($b['class_id']??null);
  mbAccess($u,$cid,'can_post');
  if($op==='delete_folder'){
   if(empty($b['confirmed']))fail('أكدي حذف المجلد ونقل منشوراته للجدار العام.',409);
   db()->beginTransaction();sql('SELECT id FROM mb_wall_folders WHERE id=? FOR UPDATE',[$id]);
   sql('UPDATE mb_wall_posts SET folder_id=NULL WHERE folder_id=?',[$id]);
   sql('UPDATE mb_wall_folders SET deleted_at=UTC_TIMESTAMP() WHERE id=?',[$id]);
   mbAudit($u,'delete_folder','folder',$id,'Posts moved to general wall');db()->commit();jsonout(['ok'=>true]);
  }
  $name=required($b['name']??'',140);$description=trim((string)($b['description']??''));if(mb_strlen($description)>1500)fail('الوصف أطول من المسموح.');
  $color=$b['color']??'#9b87c4';if(!is_string($color)||!preg_match('/^#[0-9a-fA-F]{6}$/D',$color))fail('اختاري لونًا صحيحًا.');
  if($id)sql('UPDATE mb_wall_folders SET name=?,description=?,color=? WHERE id=?',[$name,$description,$color,$id]);
  else {sql('INSERT INTO mb_wall_folders(class_id,created_by,name,description,color) VALUES (?,?,?,?,?)',[$cid,$u['id'],$name,$description,$color]);$id=(int)db()->lastInsertId();}
  mbAudit($u,$op,'folder',$id);jsonout(['id'=>$id]);
 }
 if(in_array($op,['new_post','edit_post','move_post','delete_post'],true)){
  $pid=$op==='new_post'?null:mbId($b['post_id']??null);
  $p=$pid?mbWallPost($u,$pid,true):null;$cid=$p?(int)$p['class_id']:mbId($b['class_id']??null);mbAccess($u,$cid,'can_post');
  if($op==='delete_post'){
   if(empty($b['confirmed']))fail('أكدي نقل المنشور إلى المحذوفات.',409);
   db()->beginTransaction();sql('SELECT id FROM mb_posts WHERE id=? FOR UPDATE',[$pid]);
   sql('INSERT INTO mb_wall_posts(post_id,deleted_at) VALUES (?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE deleted_at=UTC_TIMESTAMP()',[$pid]);
   sql("UPDATE mb_posts SET status='hidden' WHERE id=?",[$pid]);mbAudit($u,$op,'post',$pid);db()->commit();jsonout(['ok'=>true]);
  }
  $folder=mbWallFolderId($u,array_key_exists('folder_id',$b)?$b['folder_id']:($p['folder_id']??null),$cid);
  // Lock the destination against concurrent folder deletion before writing its link.
  $title=$op==='move_post'?null:required($b['title']??'',170);$content=$op==='move_post'?null:required($b['content']??'',7000);
  db()->beginTransaction();
  if($folder){$f=sql('SELECT deleted_at FROM mb_wall_folders WHERE id=? FOR UPDATE',[$folder])->fetch();if(!$f||$f['deleted_at'])fail('المجلد حُذف؛ اختاري الجدار العام.',409);}
  if($pid)sql('SELECT id FROM mb_posts WHERE id=? FOR UPDATE',[$pid]);
  if($op==='new_post'){sql("INSERT INTO mb_posts(class_id,author_id,title,content,status) VALUES (?,?,?,?,'published')",[$cid,$u['id'],$title,$content]);$pid=(int)db()->lastInsertId();}
  elseif($op==='edit_post')sql('UPDATE mb_posts SET title=?,content=? WHERE id=?',[$title,$content,$pid]);
  sql('INSERT INTO mb_wall_posts(post_id,folder_id) VALUES (?,?) ON DUPLICATE KEY UPDATE folder_id=VALUES(folder_id)',[$pid,$folder]);
  mbAudit($u,$op,'post',$pid);db()->commit();jsonout(['id'=>$pid]);
 }
}
