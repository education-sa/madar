<?php
declare(strict_types=1);
function mbManageFull(array $u): void {if(!PortalManagement::full(Auth::realUser()))fail('إدارة المعلمات والصلاحيات للمعلم الأول أو المالكة فقط.',403);}
function mbManageIds($raw): array {if(!is_array($raw)||count($raw)>200)fail('قائمة الفصول غير صالحة.');$ids=[];foreach($raw as $id)$ids[]=mbId($id);if(count(array_unique($ids))!==count($ids))fail('لا تكرري الفصل.');return $ids;}
function mbManageMode($raw): string {if(!in_array($raw,['portal_only','both'],true))fail('اختاري بوابة ظليم فقط أو مدار وبوابة ظليم.');return $raw;}
function mbManageText($raw,int $max): string {if(!is_string($raw))fail('قيمة نصية غير صالحة.');return required($raw,$max);}
function mbManageEmail(string $email,string $type,int $id=0): void {
 foreach(['teachers'=>'teacher','students'=>'student','owners'=>'owner','platform_users'=>'platform'] as $table=>$kind){$q='SELECT id FROM '.$table.' WHERE email=?'.($kind===$type?' AND id<>?':'').' LIMIT 1';$args=$kind===$type?[$email,$id]:[$email];if(sql($q,$args)->fetchColumn())fail('البريد مستخدم بالفعل. اختاري الحساب الموجود دون تكراره.',409);}
 $external=$type.':'.$id;$q=sql('SELECT external_id FROM ms_users WHERE email=?',[$email])->fetch();if($q&&$q['external_id']!==$external)fail('البريد مرتبط بحساب آخر في الاستبيانات.',409);
}
function mbManageStudent(array $u,int $native,string $right): array {
 $s=sql('SELECT s.id,s.name,s.email,s.status,s.stage,s.grade_label,s.class_id,b.id AS board_id FROM students s LEFT JOIN mb_students b ON b.madar_student_id=s.id WHERE s.id=? AND s.deleted_at IS NULL',[$native])->fetch();if(!$s)fail('الطالبة غير موجودة.',404);
 if(!mbAdmin($u)){
  $ok=false;if($s['board_id'])foreach(sql('SELECT class_id FROM mb_class_students WHERE student_id=?',[$s['board_id']])->fetchAll(PDO::FETCH_COLUMN) as $cid)if(PortalManagement::can($u,$right,(int)$cid)){$ok=true;break;}
  if(!$ok)fail('الطالبة خارج الفصول المخولة لك.',403);
 }
 return $s;
}
function mbManageRights(array $u,int $cid): array {return array_map(fn($k)=>PortalManagement::can($u,$k,$cid),array_combine(array_keys(PortalManagement::RIGHTS),array_keys(PortalManagement::RIGHTS)));}
function mbManageRoute(string $op,array $u,array $b): void {
 if(!str_starts_with($op,'manage_'))return;
 if($op==='manage_context'){
  $full=mbAdmin($u);$classes=sql('SELECT c.*,COALESCE(l.enabled,0) AS madar_enabled,l.native_class_id,n.teacher_id AS native_teacher_id FROM mb_classes c LEFT JOIN mb_class_madar_links l ON l.class_id=c.id LEFT JOIN classes n ON n.id=l.native_class_id ORDER BY c.is_active DESC,c.title')->fetchAll();
  if(!$full)$classes=array_values(array_filter($classes,fn($c)=>PortalManagement::classVisible($u,(int)$c['id'])));
  foreach($classes as &$c){$c['abilities']=mbManageRights($u,(int)$c['id']);$c['madar_active']=(bool)$c['madar_enabled']&&$c['native_class_id']&&PortalManagement::nativeClassEnabled((int)$c['native_class_id']);}unset($c);
  jsonout(['full'=>$full,'is_assistant'=>PortalManagement::assistant($u),'can_create_classes'=>PortalManagement::can($u,'create_classes'),'classes'=>$classes,'rights'=>PortalManagement::RIGHTS,'native_grades'=>PortalManagement::GRADES]);
 }
 if($op==='manage_teachers'){
  mbManageFull($u);$rows=sql('SELECT id,name,email,status,(SELECT id FROM ms_users WHERE external_id=CONCAT(\'teacher:\',teachers.id)) AS board_id,COALESCE((SELECT setting_value FROM ms_settings WHERE setting_key=CONCAT(\'teacher_specialty_\',teachers.id)),\'\') AS specialty FROM teachers WHERE deleted_at IS NULL ORDER BY name')->fetchAll();
  foreach($rows as &$row){$row['access']=PortalAccess::state(['id'=>(int)$row['id'],'role'=>'teacher','subjectType'=>'teacher','status'=>$row['status']]);}unset($row);jsonout(['items'=>$rows]);
 }
 if($op==='manage_teacher') {mbManageFull($u);$id=mbId($_GET['id']??null);$r=PortalAccess::target('teacher',$id);jsonout(['teacher'=>array_intersect_key($r,array_flip(['id','name','email','status'])),'settings'=>PortalAccess::teacherSettings($id)]);}
 if($op==='manage_save_teacher'){
  mbManageFull($u);$id=empty($b['id'])?null:mbId($b['id']);$before=$id?PortalAccess::target('teacher',$id):null;
  $name=mbManageText($b['name']??null,140);$email=Http::schoolEmail(mbManageText($b['email']??null,190));$status=$b['status']??'active';if(!in_array($status,['active','disabled','pending'],true))fail('حالة حساب غير صالحة.');
  mbManageEmail($email,'teacher',$id??0);$password=null;if(!$id){$password=mbManageText($b['password']??null,72);Auth::validatePassword($password);if(strlen($password)>72)fail('كلمة المرور أطول من المسموح.');}
  $settings=array_key_exists('settings',$b)?PortalAccess::validateTeacherSettings($b['settings']):null;
  $access=$id?PortalAccess::state(['id'=>$id,'role'=>'teacher','subjectType'=>'teacher','status'=>$before['status']]):null;
  $mode=$settings!==null?mbManageMode($b['access_mode']??null):null;
  if($settings!==null&&empty($b['confirmed']))fail('أكدي حفظ التخصص والفصول والربط.',409);
  if($access&&($access['senior_teacher']??false)&&$mode!==null&&$mode!=='both')fail('المالكة وحدها تسحب دور معلم أول قبل تقييد الوصول.',409);
  $teachingBefore=$settings!==null&&$id?PortalAccess::teacherSettings($id):null;
  $owner=OwnerDelegation::context();db()->beginTransaction();
  if($id){sql('UPDATE teachers SET name=?,email=?,status=? WHERE id=?',[$name,$email,$status,$id]);if($before['status']==='pending'&&$status==='active')sql('UPDATE teachers SET approved_by=?,approved_at=NOW() WHERE id=?',[$owner['id'],$id]);sql('UPDATE ms_users SET name=?,email=? WHERE external_id=?',[$name,$email,'teacher:'.$id]);}
  else{
   sql('INSERT INTO teachers(name,email,password_hash,status,approved_by,approved_at) VALUES (?,?,?,?,?,NOW())',[$name,$email,password_hash($password,PASSWORD_DEFAULT),$status,$owner['id']]);$id=(int)db()->lastInsertId();
   sql("INSERT INTO user_role_assignments(subject_type,subject_id,role_code,assigned_by_owner) VALUES('teacher',?,'TEACHER',?)",[$id,$owner['id']]);
   sql("INSERT INTO mb_native_access(subject_type,subject_id,access_mode,portal_enabled,updated_by) VALUES('teacher',?,'portal_only',1,?)",[$id,$owner['id']]);
   sql('INSERT INTO ms_users(external_id,name,email) VALUES (?,?,?)',['teacher:'.$id,$name,$email]);
  }
  if($settings!==null){
   $ms=PortalAccess::msTeacher(db(),['id'=>$id,'name'=>$name,'email'=>$email]);
   sql("INSERT INTO mb_native_access(subject_type,subject_id,access_mode,portal_enabled,updated_by) VALUES ('teacher',?,?,1,?) ON DUPLICATE KEY UPDATE access_mode=VALUES(access_mode),portal_enabled=1,updated_by=VALUES(updated_by)",[$id,$mode,$owner['id']]);
   PortalAccess::saveTeacherSettings(db(),$id,$ms,(int)$u['id'],$settings);
   PortalAccess::audit(db(),(int)$owner['id'],'teacher',$id,'teacher_settings',['access'=>$access,'teaching'=>$teachingBefore],['access_mode'=>$mode,'teaching'=>$settings,'actor_id'=>$u['id']]);
  }
  mbAudit($u,$before?'update_teacher':'create_teacher','native_teacher',$id,json_encode(['before'=>$before?array_intersect_key($before,array_flip(['name','email','status'])):null,'after'=>['name'=>$name,'email'=>$email,'status'=>$status]],JSON_UNESCAPED_UNICODE));db()->commit();jsonout(['id'=>$id]);
 }
 if($op==='manage_teacher_settings'){
  mbManageFull($u);$id=mbId($b['id']??null);$t=PortalAccess::target('teacher',$id);$access=PortalAccess::state(['id'=>$id,'role'=>'teacher','subjectType'=>'teacher','status'=>$t['status']]);
  PortalAccess::update(OwnerDelegation::context(),'teacher',$id,['access_mode'=>mbManageMode($b['access_mode']??null),'portal_enabled'=>true,'first_teacher'=>$access['first_teacher'],'confirmed'=>!empty($b['confirmed']),'settings'=>$b['settings']??null]);
  mbAudit($u,'teacher_subjects','native_teacher',$id);jsonout(['ok'=>true]);
 }
 if($op==='manage_set_access'){
  mbManageFull($u);if(empty($b['confirmed']))fail('أكدي تغيير الربط بمدار.',409);$type=$b['type']??'';if(!in_array($type,['teacher','student'],true))fail('نوع حساب غير صالح.');$id=mbId($b['id']??null);$target=PortalAccess::target($type,$id);$native=['id'=>$id,'role'=>$type,'subjectType'=>$type,'status'=>$target['status']];$before=PortalAccess::state($native);
  if($type==='student'&&sql("SELECT 1 FROM mb_student_enrollments WHERE student_id=? AND status='pending'",[$id])->fetchColumn())fail('وافقي على الطلب أولًا؛ لا تتجاوزي موافقة الطالبة بتغيير الربط.',409);
  $mode=mbManageMode($b['access_mode']??null);$owner=OwnerDelegation::context();OwnerDelegation::ensureSchema();
  db()->beginTransaction();sql('SELECT id FROM '.($type==='teacher'?'teachers':'students').' WHERE id=? FOR UPDATE',[$id]);
  if($type==='teacher'&&$mode!=='both'&&sql('SELECT 1 FROM owner_teacher_delegations WHERE teacher_id=?',[$id])->fetchColumn())fail('المالكة وحدها تسحب دور معلم أول قبل تقييد الوصول.',409);
  sql('INSERT INTO mb_native_access(subject_type,subject_id,access_mode,portal_enabled,updated_by) VALUES (?,?,?,1,?) ON DUPLICATE KEY UPDATE access_mode=VALUES(access_mode),portal_enabled=1,updated_by=VALUES(updated_by)',[$type,$id,$mode,$owner['id']]);
  if($type==='student'){sql('INSERT IGNORE INTO mb_students(madar_student_id,display_name,school_enabled) VALUES (?,?,0)',[$id,$target['name']]);sql('UPDATE mb_students SET school_enabled=1,entry_mode=? WHERE madar_student_id=?',[$mode==='both'?'madar':'school_only',$id]);}
  PortalAccess::audit(db(),(int)$owner['id'],$type,$id,'portal_access',$before,['access_mode'=>$mode,'portal_enabled'=>true,'actor_id'=>$u['id']]);
  mbAudit($u,'account_madar_link','native_'.$type,$id,json_encode(['before'=>$before['access_mode'],'after'=>$mode]));db()->commit();jsonout(['ok'=>true]);
 }
 if($op==='manage_students'){
  if(!mbAdmin($u)&&!PortalManagement::assistant($u))fail('غير مخولة بإدارة الطالبات.',403);
  $rows=sql('SELECT s.id,s.name,s.email,s.status,s.stage,s.class_id AS native_class_id,b.id AS board_id FROM students s LEFT JOIN mb_students b ON b.madar_student_id=s.id WHERE s.deleted_at IS NULL ORDER BY s.name')->fetchAll();$items=[];
  foreach($rows as $row){$members=$row['board_id']?sql('SELECT c.id,c.title FROM mb_classes c JOIN mb_class_students cs ON cs.class_id=c.id WHERE cs.student_id=?',[$row['board_id']])->fetchAll():[];
   if(!mbAdmin($u)&&!array_filter($members,fn($c)=>PortalManagement::can($u,'add_students',(int)$c['id'])||PortalManagement::can($u,'edit_students',(int)$c['id'])||PortalManagement::can($u,'reset_passwords',(int)$c['id'])))continue;
   $row['classes']=mbAdmin($u)?$members:array_values(array_filter($members,fn($c)=>PortalManagement::classVisible($u,(int)$c['id'])));$row['abilities']=[];foreach(['add_students','edit_students','reset_passwords'] as $right){$row['abilities'][$right]=mbAdmin($u)||(bool)array_filter($members,fn($c)=>PortalManagement::can($u,$right,(int)$c['id']));}$row['access']=PortalAccess::state(['id'=>(int)$row['id'],'role'=>'student','subjectType'=>'student','status'=>$row['status']]);$items[]=$row;
  }jsonout(['items'=>$items]);
 }
 if($op==='manage_save_student'){
  $id=mbId($b['id']??null);$s=mbManageStudent($u,$id,'edit_students');$name=mbManageText($b['name']??null,140);$email=Http::schoolEmail(mbManageText($b['email']??null,190));mbManageEmail($email,'student',$id);
  $stage=$b['stage']??$s['stage'];if(!in_array($stage,['ابتدائي','متوسط','ثانوي'],true))fail('اختاري مرحلة صحيحة.');$status=$b['status']??$s['status'];if(!in_array($status,['active','disabled'],true))fail('حالة غير صالحة.');
  db()->beginTransaction();sql('UPDATE students SET name=?,email=?,stage=?,status=? WHERE id=?',[$name,$email,$stage,$status,$id]);sql('UPDATE mb_students SET display_name=? WHERE madar_student_id=?',[$name,$id]);sql('UPDATE ms_users SET name=?,email=? WHERE external_id=?',[$name,$email,'student:'.$id]);mbAudit($u,'update_student','native_student',$id,json_encode(['before'=>['name'=>$s['name'],'email'=>$s['email'],'status'=>$s['status']],'after'=>['name'=>$name,'email'=>$email,'status'=>$status]],JSON_UNESCAPED_UNICODE));db()->commit();jsonout(['ok'=>true]);
 }
 if($op==='manage_distribute_student'){
  $id=mbId($b['id']??null);$s=mbManageStudent($u,$id,'add_students');$ids=mbManageIds($b['class_ids']??null);if(empty($b['confirmed']))fail('أكدي توزيع الطالبة.',409);
  foreach($ids as $cid){mbRequireAbility($u,'add_students',$cid);if(!(int)mbClass($cid)['is_active'])fail('اختاري فصولًا نشطة.');}
  db()->beginTransaction();sql('SELECT id FROM students WHERE id=? FOR UPDATE',[$id]);$s['board_id']=sql('SELECT id FROM mb_students WHERE madar_student_id=? FOR UPDATE',[$id])->fetchColumn()?:null;
  if(!$s['board_id']){sql('INSERT INTO mb_students(madar_student_id,display_name,school_enabled) VALUES (?,?,0)',[$id,$s['name']]);$s['board_id']=(int)db()->lastInsertId();}
  $current=sql('SELECT class_id FROM mb_class_students WHERE student_id=? FOR UPDATE',[$s['board_id']])->fetchAll(PDO::FETCH_COLUMN);
  foreach($current as $cid)if(!in_array((int)$cid,$ids,true)&&(mbAdmin($u)||PortalManagement::can($u,'add_students',(int)$cid)))sql('DELETE FROM mb_class_students WHERE student_id=? AND class_id=?',[$s['board_id'],$cid]);
  foreach($ids as $cid)sql('INSERT IGNORE INTO mb_class_students(class_id,student_id) VALUES (?,?)',[$cid,$s['board_id']]);
  if(array_key_exists('native_class_id',$b)&&$b['native_class_id']!==null){
   mbManageFull($u);$nc=mbId($b['native_class_id']);$link=sql('SELECT class_id FROM mb_class_madar_links WHERE native_class_id=? AND enabled=1',[$nc])->fetchColumn();
   $access=PortalAccess::state(['id'=>$id,'role'=>'student','subjectType'=>'student','status'=>$s['status']]);
   if(!$link||!in_array((int)$link,$ids,true)||$access['access_mode']!=='both'||!$access['portal_enabled']||!PortalManagement::nativeClassEnabled($nc))fail('يلزم ربط معتمد للفصل والطالبة بمدار قبل توزيعها فيه.',403);
   $nativeClass=sql('SELECT stage,grade_label FROM classes WHERE id=?',[$nc])->fetch();sql('UPDATE students SET class_id=?,stage=?,grade_label=? WHERE id=?',[$nc,$nativeClass['stage'],$nativeClass['grade_label'],$id]);
  }
  mbAudit($u,'distribute_student','native_student',$id,json_encode(['before'=>$current,'after'=>$ids,'native_class_id'=>$b['native_class_id']??'unchanged']));db()->commit();jsonout(['ok'=>true]);
 }
 if($op==='manage_edit_class'){
  $id=mbId($b['id']??null);mbRequireAbility($u,'edit_classes',$id);$before=mbClass($id);$title=mbManageText($b['title']??null,140);$grade=mbManageText($b['grade']??null,80);$section=mbManageText($b['section_name']??null,40);$year=mbManageText($b['academic_year']??null,25);$key=hash('sha256',$year.'|'.$grade.'|'.$section);
  db()->beginTransaction();sql('SELECT id FROM mb_classes WHERE id=? FOR UPDATE',[$id]);$other=sql('SELECT class_id FROM mb_class_identity WHERE identity_key=? FOR UPDATE',[$key])->fetchColumn();if($other&&(int)$other!==$id)fail('الفصل موجود مسبقًا.',409);
  sql('INSERT INTO mb_class_identity(identity_key,class_id) VALUES (?,?) ON DUPLICATE KEY UPDATE class_id=VALUES(class_id)',[$key,$id]);
  $linked=sql('SELECT c.* FROM mb_class_madar_links l JOIN classes c ON c.id=l.native_class_id WHERE l.class_id=? FOR UPDATE',[$id])->fetch();
  if($linked&&($grade!==$before['grade']||$section!==$before['section_name']||$year!==$before['academic_year'])){
   mbManageFull($u);if(empty($b['confirmed']))fail('أكدي مزامنة تعديل الفصل مع مدار.',409);if(mb_strlen($year)>20)fail('العام أطول مما يسمح به مدار.');
   $canonical=$grade===$before['grade']?$linked['grade_label']:str_replace(['الأول','الاول','الثاني','الثالث','الرابع','الخامس','السادس'],['أول','أول','ثاني','ثالث','رابع','خامس','سادس'],$grade);
   $stage=null;foreach(PortalManagement::GRADES as $level=>$grades)if(in_array($canonical,$grades,true))$stage=$level;if(!$stage)fail('الصف غير معتمد في مدار. اختاري اسم الصف المعتمد.',422);
   $numMap=['أ'=>1,'ا'=>1,'ب'=>2,'ج'=>3,'د'=>4,'1'=>1,'2'=>2,'3'=>3,'4'=>4,'١'=>1,'٢'=>2,'٣'=>3,'٤'=>4];$n=$numMap[$section]??0;
   if(!$n&&$section===$before['section_name']&&preg_match('/الفصل\s+([١٢٣٤1-4])/u',$linked['name'],$m))$n=$numMap[$m[1]]??0;
   if(!$n)fail('شعبة الفصل المرتبط بمدار يجب أن تكون أ، ب، ج، د أو ١ إلى ٤.',422);
   $nativeName=$canonical.' - الفصل '.([1=>'١',2=>'٢',3=>'٣',4=>'٤'][$n]);
   sql('UPDATE classes SET name=?,stage=?,grade_label=?,academic_year=? WHERE id=?',[$nativeName,$stage,$canonical,$year,$linked['id']]);
   sql('UPDATE students SET stage=?,grade_label=? WHERE class_id=?',[$stage,$canonical,$linked['id']]);
  }
  sql('UPDATE mb_classes SET title=?,grade=?,section_name=?,academic_year=? WHERE id=?',[$title,$grade,$section,$year,$id]);mbAudit($u,'edit_class','class',$id,json_encode(['before'=>[$before['title'],$before['grade'],$before['academic_year']],'after'=>[$title,$grade,$year]],JSON_UNESCAPED_UNICODE));db()->commit();jsonout(['ok'=>true]);
 }
 if($op==='manage_link_class'){
  mbManageFull($u);$id=mbId($b['id']??null);$c=mbClass($id);$enabled=$b['enabled']??null;if(!is_bool($enabled)||empty($b['confirmed']))fail('أكدي تغيير ربط الفصل.',409);
  db()->beginTransaction();sql('SELECT id FROM mb_classes WHERE id=? FOR UPDATE',[$id]);$old=sql('SELECT * FROM mb_class_madar_links WHERE class_id=? FOR UPDATE',[$id])->fetch();$nc=$old['native_class_id']??null;
  if($enabled){
   if(!(int)$c['is_active'])fail('الفصل مؤرشف.',409);
   $tid=mbId($b['teacher_id']??null);$teacher=sql("SELECT nt.* FROM teachers nt JOIN ms_users mu ON mu.external_id=CONCAT('teacher:',nt.id) JOIN mb_teachers t ON t.teacher_id=mu.id AND t.class_id=? AND t.can_view=1 JOIN mb_teacher_profiles p ON p.class_id=t.class_id AND p.teacher_id=t.teacher_id AND p.approved=1 AND p.subject<>'' JOIN mb_native_access a ON a.subject_type='teacher' AND a.subject_id=nt.id AND a.access_mode='both' AND a.portal_enabled=1 WHERE nt.id=? AND nt.status='active' AND nt.deleted_at IS NULL",[$id,$tid])->fetch();if(!$teacher)fail('اختاري معلمة معتمدة لهذا الفصل ووصولها مدار وبوابة ظليم.',403);
   $stage=$b['stage']??'';if(!in_array($stage,['ابتدائي','متوسط','ثانوي'],true))fail('حددي المرحلة.');
   $nativeGrade=$b['native_grade']??str_replace(['الأول','الاول','الثاني','الثالث','الرابع','الخامس','السادس'],['أول','أول','ثاني','ثالث','رابع','خامس','سادس'],$c['grade']);
   if(!is_string($nativeGrade)||!in_array($nativeGrade,PortalManagement::GRADES[$stage],true))fail('حددي الصف المعتمد في مدار.',422);
   $number=$b['class_number']??(['أ'=>1,'ا'=>1,'ب'=>2,'ج'=>3,'د'=>4,'1'=>1,'2'=>2,'3'=>3,'4'=>4,'١'=>1,'٢'=>2,'٣'=>3,'٤'=>4][$c['section_name']]??0);
   $number=filter_var($number,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>4]]);if(!$number)fail('حددي رقم الفصل في مدار من ١ إلى ٤.',422);
   $nativeName=$nativeGrade.' - الفصل '.([1=>'١',2=>'٢',3=>'٣',4=>'٤'][$number]);
   if(mb_strlen($c['academic_year'])>20)fail('العام الدراسي أطول مما يسمح به مدار.');
   if($nc){$native=sql('SELECT * FROM classes WHERE id=? FOR UPDATE',[$nc])->fetch();if(!$native||(int)$native['teacher_id']!==$tid)fail('لا يمكن تغيير المعلمة المسؤولة لفصل مرتبط دون مراجعة توزيع مدار الحالي.',409);}
   else{
    $native=sql('SELECT * FROM classes WHERE teacher_id=? AND name=? AND academic_year=? FOR UPDATE',[$tid,$nativeName,$c['academic_year']])->fetch();
    if($native){if($native['stage']!==$stage||$native['grade_label']!==$nativeGrade)fail('يوجد فصل في مدار ببيانات مختلفة. راجعيه قبل الربط.',409);$nc=(int)$native['id'];}
    else{sql('INSERT INTO classes(teacher_id,name,stage,grade_label,academic_year) VALUES (?,?,?,?,?)',[$tid,$nativeName,$stage,$nativeGrade,$c['academic_year']]);$nc=(int)db()->lastInsertId();}
   }
  }
  if($nc&&sql('SELECT 1 FROM mb_class_madar_links WHERE native_class_id=? AND class_id<>?',[$nc,$id])->fetchColumn())fail('فصل مدار مرتبط بفصل آخر في البوابة.',409);
  sql('INSERT INTO mb_class_madar_links(class_id,native_class_id,enabled,updated_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE native_class_id=VALUES(native_class_id),enabled=VALUES(enabled),updated_by=VALUES(updated_by)',[$id,$nc,$enabled?1:0,$u['id']]);
  mbAudit($u,'class_madar_link','class',$id,json_encode(['before'=>$old,'after'=>['native_class_id'=>$nc,'enabled'=>$enabled]]));db()->commit();jsonout(['ok'=>true,'native_class_id'=>$nc]);
 }
 if($op==='manage_assistants'){
  mbManageFull($u);$teachers=sql("SELECT u.id AS board_id,t.id,t.name FROM teachers t JOIN ms_users u ON u.external_id=CONCAT('teacher:',t.id) WHERE t.status='active' AND t.deleted_at IS NULL ORDER BY t.name")->fetchAll();
  foreach($teachers as &$t){$t['is_assistant']=(bool)sql("SELECT 1 FROM mb_school_roles WHERE user_id=? AND role='first_teacher'",[$t['board_id']])->fetchColumn();$t['grants']=sql('SELECT class_id,permission_code FROM mb_assistant_grants WHERE teacher_id=?',[$t['board_id']])->fetchAll();}unset($t);jsonout(['items'=>$teachers,'rights'=>PortalManagement::RIGHTS]);
 }
 if($op==='manage_save_assistant'){
  mbManageFull($u);if(empty($b['confirmed']))fail('أكدي تعديل صلاحيات المساعدة.',409);$id=mbId($b['id']??null);$teacher=PortalAccess::target('teacher',$id);$state=PortalAccess::state(['id'=>$id,'subjectType'=>'teacher','role'=>'teacher','status'=>$teacher['status']]);
  if($state['senior_teacher'])fail('دور معلم أول لا يُغيَّر هنا. وحدها المالكة الحقيقية تمنحه أو تسحبه.',403);
  $enabled=$b['enabled']??null;$grants=$b['grants']??null;if(!is_bool($enabled)||!is_array($grants)||count($grants)>1400)fail('صلاحيات غير صالحة.');
  if($enabled&&($teacher['status']!=='active'||!$state['portal_enabled']||$state['access_mode']==='madar_only'))fail('فعّلي حساب المعلمة ووصول البوابة أولًا.');
  $validated=[];foreach($grants as $g){if(!is_array($g)||!is_string($g['permission_code']??null)||!isset(PortalManagement::RIGHTS[$g['permission_code']]))fail('صلاحية غير صالحة.');$right=$g['permission_code'];$cid=$right==='create_classes'?0:mbId($g['class_id']??null);if($cid)mbClass($cid);$validated[$cid.':'.$right]=[$cid,$right];}
  $ms=PortalAccess::msTeacher(db(),$teacher);db()->beginTransaction();sql('SELECT id FROM teachers WHERE id=? FOR UPDATE',[$id]);if(OwnerDelegation::allowed(['id'=>$id,'role'=>'teacher','subjectType'=>'teacher','status'=>$teacher['status']]))fail('لا يُعدَّل دور معلم أول هنا.',403);$before=sql('SELECT class_id,permission_code FROM mb_assistant_grants WHERE teacher_id=?',[$ms])->fetchAll();
  if($enabled)sql("INSERT INTO mb_school_roles(user_id,role,granted_by) VALUES (?,'first_teacher',?) ON DUPLICATE KEY UPDATE granted_by=VALUES(granted_by),granted_at=UTC_TIMESTAMP()",[$ms,$u['id']]);
  else sql("DELETE FROM mb_school_roles WHERE user_id=? AND role='first_teacher'",[$ms]);
  sql('DELETE FROM mb_assistant_grants WHERE teacher_id=?',[$ms]);if($enabled)foreach($validated as [$cid,$right])sql('INSERT INTO mb_assistant_grants(teacher_id,class_id,permission_code,granted_by) VALUES (?,?,?,?)',[$ms,$cid,$right,$u['id']]);
  mbAudit($u,'assistant_grants','native_teacher',$id,json_encode(['enabled'=>$enabled,'before'=>$before,'after'=>$enabled?array_values($validated):[]]));db()->commit();jsonout(['ok'=>true]);
 }
 fail('الإجراء الإداري غير موجود.',404);
}
