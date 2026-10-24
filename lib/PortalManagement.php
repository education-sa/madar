<?php
declare(strict_types=1);
final class PortalManagement {
 public const RIGHTS=['accept_students'=>'قبول الطالبات','reset_passwords'=>'تعديل كلمات مرور الطالبات','create_classes'=>'إنشاء الفصول','edit_classes'=>'تعديل الفصول','add_students'=>'إضافة الطالبات ونقلهن','edit_students'=>'تعديل بيانات الطالبات','manage_content'=>'إدارة الملفات والمنشورات'];
 public static function ensureSchema(): void {
  static $ready=false;if($ready)return;$pdo=Database::connection();
  try{$pdo->query('SELECT teacher_id FROM mb_assistant_grants LIMIT 0');$pdo->query('SELECT class_id FROM mb_class_madar_links LIMIT 0');$pdo->query('SELECT migration_key FROM mb_management_migrations LIMIT 0');}catch(PDOException $e){if((int)($e->errorInfo[1]??0)!==1146)throw $e;$pdo->exec(file_get_contents(dirname(__DIR__).'/surveys/database/migrations/20261024_board_management.sql'));}
  if($pdo->query("SELECT 1 FROM mb_management_migrations WHERE migration_key='assistant_scope_v1'")->fetchColumn()){$ready=true;return;}
  // Convert pre-existing broad assistant roles to explicit grants for current classes once.
  $pdo->beginTransaction();
  try{
   $q=$pdo->prepare("INSERT IGNORE INTO mb_management_migrations(migration_key) VALUES ('assistant_scope_v1')");$q->execute();
   if($q->rowCount()){
    foreach(array_keys(self::RIGHTS) as $right){
     if($right==='create_classes')$pdo->prepare("INSERT IGNORE INTO mb_assistant_grants(teacher_id,class_id,permission_code,granted_by) SELECT user_id,0,?,granted_by FROM mb_school_roles WHERE role='first_teacher'")->execute([$right]);
     else $pdo->prepare("INSERT IGNORE INTO mb_assistant_grants(teacher_id,class_id,permission_code,granted_by) SELECT r.user_id,c.id,?,r.granted_by FROM mb_school_roles r CROSS JOIN mb_classes c WHERE r.role='first_teacher'")->execute([$right]);
    }
   }
   $pdo->commit();$ready=true;
  }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
 }
 private static function actor(): ?array {static $loaded=false,$actor=null;if(!$loaded){$actor=Auth::realUser();$loaded=true;}return $actor;}
 private static function grants(array $u): array {static $map=[];$id=(int)$u['id'];if(!isset($map[$id])){$q=Database::connection()->prepare('SELECT class_id,permission_code FROM mb_assistant_grants WHERE teacher_id=?');$q->execute([$id]);$map[$id]=[];foreach($q->fetchAll() as $g)$map[$id][(int)$g['class_id']][$g['permission_code']]=true;}return $map[$id];}
 public static function full(?array $native): bool {return $native!==null&&(PortalAccess::owner($native)||OwnerDelegation::allowed($native));}
 public static function assistant(array $u): bool {
  $n=self::actor();return $n&&($n['subjectType']??'')==='teacher'&&PortalAccess::canPortal($n)&&PortalAccess::state($n)['first_teacher'];
 }
 public static function can(array $u,string $right,int $class=0): bool {
  if(self::full(self::actor()))return true;
  if(!isset(self::RIGHTS[$right])||!self::assistant($u))return false;
  return !empty(self::grants($u)[$right==='create_classes'?0:$class][$right]);
 }
 public static function classVisible(array $u,int $class): bool {
  if(!self::assistant($u))return false;
  if(!empty(self::grants($u)[$class]))return true;
  $q=Database::connection()->prepare('SELECT 1 FROM mb_classes WHERE id=? AND created_by=?');$q->execute([$class,$u['id']]);return self::can($u,'create_classes')&&(bool)$q->fetchColumn();
 }
 public static function nativeClassEnabled(int $nativeClass): bool {
  try{
   $q=Database::connection()->prepare('SELECT class_id,enabled FROM mb_class_madar_links WHERE native_class_id=?');$q->execute([$nativeClass]);$row=$q->fetch();if(!$row)return true;
   if(!(int)$row['enabled'])return false;
   $q=Database::connection()->prepare("SELECT 1 FROM classes c JOIN mb_classes bc ON bc.id=? AND bc.is_active=1 JOIN ms_users u ON u.external_id=CONCAT('teacher:',c.teacher_id) JOIN teachers nt ON nt.id=c.teacher_id AND nt.status='active' AND nt.deleted_at IS NULL JOIN mb_teachers t ON t.class_id=bc.id AND t.teacher_id=u.id AND t.can_view=1 JOIN mb_teacher_profiles p ON p.class_id=t.class_id AND p.teacher_id=t.teacher_id AND p.approved=1 AND p.subject<>'' JOIN mb_native_access a ON a.subject_type='teacher' AND a.subject_id=nt.id AND a.portal_enabled=1 AND a.access_mode='both' WHERE c.id=?");$q->execute([$row['class_id'],$nativeClass]);return (bool)$q->fetchColumn();
  }catch(PDOException $e){if((int)($e->errorInfo[1]??0)===1146)return true;throw $e;}
 }
 public static function nativeFilter(string $alias='c'): string {
  // Used only with a fixed, internal SQL alias. No DDL or permission changes on Madar reads.
  static $exists=null;if($exists===null){try{Database::connection()->query('SELECT class_id FROM mb_class_madar_links LIMIT 0');$exists=true;}catch(PDOException $e){if((int)($e->errorInfo[1]??0)!==1146)throw $e;$exists=false;}}if(!$exists)return '1=1';
  return "NOT EXISTS (SELECT 1 FROM mb_class_madar_links ml WHERE ml.native_class_id={$alias}.id AND (ml.enabled=0 OR NOT EXISTS (SELECT 1 FROM classes nc CROSS JOIN mb_classes bc JOIN ms_users mu ON mu.external_id=CONCAT('teacher:',nc.teacher_id) JOIN mb_teachers mt ON mt.class_id=bc.id AND mt.teacher_id=mu.id AND mt.can_view=1 JOIN mb_teacher_profiles mp ON mp.class_id=mt.class_id AND mp.teacher_id=mt.teacher_id AND mp.approved=1 AND mp.subject<>'' JOIN teachers nt ON nt.id=nc.teacher_id AND nt.status='active' AND nt.deleted_at IS NULL JOIN mb_native_access na ON na.subject_type='teacher' AND na.subject_id=nt.id AND na.portal_enabled=1 AND na.access_mode='both' WHERE bc.id=ml.class_id AND bc.is_active=1 AND nc.id=ml.native_class_id)))";
 }
}
