<?php
declare(strict_types=1);

require_once dirname(__DIR__,2).'/lib/PortalEnrollment.php';

// Shared helpers for the Zulaim school portal. Madar account identity remains
// the single login source; school roles are stored separately from Madar RBAC.
function mbActor(): array {
 $u=user();
 $native=Auth::realUser();if(!$native)fail('يلزم تسجيل الدخول.',401);PortalAccess::requirePortal($native);
 mbEnsureSchema();
 PortalEnrollment::ensureSchema();
 return $u;
}
function mbEnsureSchema(): void {
 $base=dirname(__DIR__).'/database/migrations/20261022_my_board.sql';
 try { sql('SELECT id FROM mb_classes LIMIT 0'); }
 catch(PDOException $e) {
  if (($e->errorInfo[1]??0)!==1146) throw $e;
  mbRunMigration($base);
 }
 try { sql('SELECT user_id FROM mb_school_roles LIMIT 0');sql('SELECT class_id FROM mb_teacher_profiles LIMIT 0'); }
 catch(PDOException $e){if(($e->errorInfo[1]??0)!==1146)throw $e;mbRunMigration(dirname(__DIR__).'/database/migrations/20261023_school_permissions.sql');}
}
function mbRunMigration(string $path): void {
 if (!is_file($path)) fail('تعذر العثور على تحديث جداول لوحتي.',503);
 $sqlText=file_get_contents($path);
 $sqlText=preg_replace('/^\s*--.*$/m','',$sqlText);
 foreach(explode(';',(string)$sqlText) as $statement) {
  $statement=trim($statement);
  if($statement!=='') db()->exec($statement);
 }
}
function mbIsPlatformOwner(array $u): bool { $native=Auth::realUser();return $native && PortalAccess::owner($native); }
function mbIsFirstTeacher(array $u): bool { $native=Auth::realUser();return $native && PortalAccess::canPortal($native) && PortalAccess::state($native)['first_teacher']; }
function mbBoardManager(array $u): bool { return mbIsPlatformOwner($u)||mbIsFirstTeacher($u); }
function mbAdmin(array $u): bool { return mbBoardManager($u); }
function mbSyncMadarTeachers(): int {
 try{$rows=sql("SELECT id,name,email FROM teachers WHERE status='active' AND deleted_at IS NULL ORDER BY name")->fetchAll();}
 catch(PDOException $e){if(($e->errorInfo[1]??0)===1146)fail('لا يمكن قراءة حسابات المعلمات من قاعدة مدار.',503);throw $e;}
 $conflicts=0;
 foreach($rows as $row){
  $external='teacher:'.(int)$row['id'];$email=strtolower(trim((string)$row['email']));
  if($email===''){ $conflicts++;continue; }
  try{sql('INSERT INTO ms_users(external_id,name,email,verified_at) VALUES (?,?,?,NULL) ON DUPLICATE KEY UPDATE external_id=external_id',[$external,(string)$row['name'],$email]);}
  catch(PDOException $e){if(($e->errorInfo[1]??0)===1062){$conflicts++;continue;}throw $e;}
 }
 return $conflicts;
}
function mbId($raw): int {
 if (!is_int($raw) && !(is_string($raw) && preg_match('/^[1-9][0-9]{0,15}$/D',$raw))) fail('المعرّف غير صالح.');
 $n=(int)$raw;if($n<1)fail('المعرّف غير صالح.');return $n;
}
function mbClass(int $id): array {
 $c=sql('SELECT * FROM mb_classes WHERE id=?',[$id])->fetch();if(!$c)fail('الفصل غير موجود.',404);return $c;
}
function mbTeacherProfile(array $u,int $classId): array {
 $m=sql('SELECT t.*,p.specialty,p.subject,p.grade_scope,p.approved FROM mb_teachers t LEFT JOIN mb_teacher_profiles p ON p.class_id=t.class_id AND p.teacher_id=t.teacher_id WHERE t.class_id=? AND t.teacher_id=?',[$classId,(int)$u['id']])->fetch();
 if(!$m || !(int)$m['can_view'] || !(int)($m['approved']??0) || trim((string)$m['subject'])==='') fail('لم تعتمد الإدارة تخصصك ومادتك لهذا الفصل بعد.',403);
 return $m;
}
function mbAccess(array $u,int $classId,string $privilege='can_view'): array {
 $c=mbClass($classId);
 if (mbBoardManager($u)) return $c;
 if (!(int)$c['is_active']) fail('الفصل مؤرشف.',403);
 if($privilege==='can_manage_students')fail('إضافة الطالبات وإدارتهن للمعلم الأول فقط.',403);
 $m=mbTeacherProfile($u,$classId);
 if (!isset($m[$privilege]) || !(int)$m[$privilege]) fail('ليس لديك إذن لهذا الفصل أو الإجراء.',403);
 return $c;
}
function mbOwner(array $u): void {if (!mbIsPlatformOwner($u)) fail('هذه الصلاحية لمالكة منصة مدار فقط.',403);}
function mbRequireBoardManager(array $u): void {if (!mbBoardManager($u)) fail('هذه الصلاحية لمعلم أول داخل بوابة المدرسة.',403);}
function mbAudit(array $u,string $event,string $entity,int $id,string $details=''): void {
 sql('INSERT INTO mb_audit(actor_id,event_type,entity_type,entity_id,details) VALUES (?,?,?,?,?)',[$u['id'],$event,$entity,$id,mb_sub($details,500)]);
}
function mb_sub(string $s,int $limit): string {return mb_substr($s,0,$limit);}
function mbStudentClass(int $classId,int $studentId): void {
 if(!sql('SELECT 1 FROM mb_class_students WHERE class_id=? AND student_id=?',[$classId,$studentId])->fetchColumn())fail('الطالبة ليست ضمن هذا الفصل.',403);
}
function mbSubject(array $u,int $classId): ?string {
 if(mbBoardManager($u)) return null;
 return (string)mbTeacherProfile($u,$classId)['subject'];
}
function mbRequireFileSubject(array $u,array $file): void {
 $subject=mbSubject($u,(int)$file['class_id']);
 if($subject!==null && !hash_equals(mb_sub(trim((string)$file['subject']),85),mb_sub(trim($subject),85))) fail('هذه الملفات مخصصة لمعلمة مادة أخرى.',403);
}
function mbFileDirectory(): string {return dirname(__DIR__).'/storage/board';}
