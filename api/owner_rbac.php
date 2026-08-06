<?php
declare(strict_types=1);

function owner_rbac_record(string $subjectType, int $id, bool $includeDeleted = true): ?array
{
    $subjectType=strtolower($subjectType);
    if ($subjectType==='owner') {
        return fetch_one("SELECT id,name,email,status,'OWNER' AS role_code,NULL AS deleted_at,created_at,last_login_at FROM owners WHERE id=?",[$id]);
    }
    if ($subjectType==='teacher') {
        $sql="SELECT id,name,email,status,'TEACHER' AS role_code,deleted_at,created_at,last_login_at FROM teachers WHERE id=?".($includeDeleted?'':' AND deleted_at IS NULL');
        return fetch_one($sql,[$id]);
    }
    if ($subjectType==='student') {
        $sql="SELECT id,name,email,status,'STUDENT' AS role_code,deleted_at,created_at,last_active AS last_login_at,class_id,stage,grade_label FROM students WHERE id=?".($includeDeleted?'':' AND deleted_at IS NULL');
        return fetch_one($sql,[$id]);
    }
    if ($subjectType==='platform') {
        $sql="SELECT id,name,email,status,role_code,deleted_at,created_at,last_login_at FROM platform_users WHERE id=?".($includeDeleted?'':' AND deleted_at IS NULL');
        return fetch_one($sql,[$id]);
    }
    return null;
}

function owner_rbac_impact(string $subjectType, int $id): array
{
    if ($subjectType==='owner') return ['protected'=>true,'message'=>'حساب مالك الموقع محمي ولا يدخل في الحذف.','total'=>0,'items'=>[]];
    if ($subjectType==='platform') return ['linkedRecords'=>0,'files'=>0,'total'=>0,'items'=>[]];

    $items=[];
    $files=0;
    if ($subjectType==='teacher') {
        // تشمل المعاينة كل الجداول التي ترتبط مباشرة بالمعلمة أو بفصولها،
        // حتى يعرف المالك أثر الحذف النهائي قبل تنفيذه ولا تضيع علاقات بصمت.
        $queries=[
            'classes'=>['الفصول','SELECT COUNT(*) AS n FROM classes WHERE teacher_id=?'],
            'students'=>['الطالبات المرتبطات بفصول المعلمة','SELECT COUNT(*) AS n FROM students s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=?'],
            'registrationRequests'=>['طلبات تسجيل الطالبات','SELECT COUNT(*) AS n FROM student_registration_requests r JOIN classes c ON c.id=r.class_id WHERE c.teacher_id=?'],
            'tests'=>['الاختبارات والنماذج','SELECT COUNT(*) AS n FROM tests WHERE teacher_id=?'],
            'questionBank'=>['أسئلة بنك الأسئلة','SELECT COUNT(*) AS n FROM question_bank WHERE teacher_id=?'],
            'repositoryResets'=>['سجلات إعادة ضبط المستودع','SELECT COUNT(*) AS n FROM question_bank_repository_resets WHERE teacher_id=?'],
            'notes'=>['الملاحظات','SELECT COUNT(*) AS n FROM notes WHERE teacher_id=?'],
            'attendance'=>['سجلات الحضور','SELECT COUNT(*) AS n FROM attendance WHERE teacher_id=?'],
            'assignments'=>['الواجبات','SELECT COUNT(*) AS n FROM assignments WHERE teacher_id=?'],
            'followSettings'=>['إعدادات المتابعة','SELECT COUNT(*) AS n FROM follow_up_settings WHERE teacher_id=?'],
            'followup'=>['سجلات المتابعة','SELECT COUNT(*) AS n FROM student_follow_up WHERE teacher_id=?'],
            'points'=>['سجلات النقاط','SELECT COUNT(*) AS n FROM motivational_points WHERE teacher_id=?'],
            'knowledgeResources'=>['الموارد والملفات','SELECT COUNT(*) AS n FROM knowledge_resources WHERE teacher_id=?'],
            'portfolioReviews'=>['ملفات إنجاز راجعتها المعلمة','SELECT COUNT(*) AS n FROM student_portfolio_files WHERE reviewed_by=?'],
            'notifications'=>['الإشعارات','SELECT COUNT(*) AS n FROM notifications WHERE teacher_id=?'],
            'schoolSettings'=>['إعدادات المدرسة الخاصة بالمعلمة','SELECT COUNT(*) AS n FROM teacher_school_settings WHERE teacher_id=?'],
            'weeklyAttendance'=>['الحضور الأسبوعي','SELECT COUNT(*) AS n FROM weekly_attendance WHERE teacher_id=?'],
            'weeklyParticipation'=>['المشاركة الأسبوعية','SELECT COUNT(*) AS n FROM weekly_participation WHERE teacher_id=?'],
            'weeklyItems'=>['بنود المتابعة الأسبوعية','SELECT COUNT(*) AS n FROM weekly_follow_up_items WHERE teacher_id=?'],
            'weeklyScores'=>['درجات بنود المتابعة','SELECT COUNT(*) AS n FROM weekly_follow_up_item_scores s JOIN weekly_follow_up_items i ON i.id=s.item_id WHERE i.teacher_id=?'],
        ];
        foreach ($queries as $key=>[$label,$sql]) {
            $items[$key]=['label'=>$label,'count'=>(int)(fetch_one($sql,[$id])['n']??0)];
        }
        // لا نحذف ملفات إنجاز الطالبات عند حذف المعلمة؛ ملكيتها تبقى للطالبة.
        $files=(int)(fetch_one("SELECT COUNT(*) AS n FROM knowledge_resources WHERE teacher_id=? AND resource_type='file' AND stored_name IS NOT NULL",[$id])['n']??0);
    } elseif ($subjectType==='student') {
        $queries=[
            'registrationLinks'=>['طلبات التسجيل المرتبطة بالحساب','SELECT COUNT(*) AS n FROM student_registration_requests WHERE existing_student_id=?'],
            'distributionOrdinals'=>['سجلات توزيع بدائل الأسئلة','SELECT COUNT(*) AS n FROM student_distribution_ordinals WHERE student_id=?'],
            'attempts'=>['محاولات الاختبارات','SELECT COUNT(*) AS n FROM test_attempts WHERE student_id=?'],
            'answers'=>['إجابات الاختبارات','SELECT COUNT(*) AS n FROM answers a JOIN test_attempts t ON t.id=a.attempt_id WHERE t.student_id=?'],
            'skills'=>['تحليلات المهارات','SELECT COUNT(*) AS n FROM student_skills WHERE student_id=?'],
            'learningStyle'=>['تقييمات نمط التعلم','SELECT COUNT(*) AS n FROM learning_style_assessments WHERE student_id=?'],
            'portfolio'=>['ملفات الإنجاز','SELECT COUNT(*) AS n FROM student_portfolio_files WHERE student_id=?'],
            'notes'=>['الملاحظات','SELECT COUNT(*) AS n FROM notes WHERE student_id=?'],
            'attendance'=>['الحضور','SELECT COUNT(*) AS n FROM attendance WHERE student_id=?'],
            'assignments'=>['الواجبات','SELECT COUNT(*) AS n FROM assignments WHERE student_id=?'],
            'points'=>['سجلات النقاط','SELECT COUNT(*) AS n FROM motivational_points WHERE student_id=?'],
            'followup'=>['سجلات المتابعة','SELECT COUNT(*) AS n FROM student_follow_up WHERE student_id=?'],
            'notifications'=>['الإشعارات','SELECT COUNT(*) AS n FROM notifications WHERE student_id=?'],
            'weeklyAttendance'=>['الحضور الأسبوعي','SELECT COUNT(*) AS n FROM weekly_attendance WHERE student_id=?'],
            'weeklyParticipation'=>['المشاركة الأسبوعية','SELECT COUNT(*) AS n FROM weekly_participation WHERE student_id=?'],
            'weeklyScores'=>['درجات بنود المتابعة','SELECT COUNT(*) AS n FROM weekly_follow_up_item_scores WHERE student_id=?'],
        ];
        foreach ($queries as $key=>[$label,$sql]) {
            $items[$key]=['label'=>$label,'count'=>(int)(fetch_one($sql,[$id])['n']??0)];
        }
        $files=(int)(fetch_one('SELECT COUNT(*) AS n FROM student_portfolio_files WHERE student_id=? AND stored_name IS NOT NULL',[$id])['n']??0);
    }
    $linked=array_sum(array_map(static fn(array $item):int=>(int)$item['count'],$items));
    return ['linkedRecords'=>$linked,'files'=>$files,'total'=>$linked+$files,'items'=>$items];
}

function owner_rbac_users_routes(string $method, array $segments, array $owner): never
{
    $ownerId=(int)$owner['id'];
    if (!$segments && $method==='GET') {
        Auth::requirePermission('users.view');
        $q=trim((string)($_GET['q']??''));$role=Rbac::normalizeRole((string)($_GET['role']??''));$status=trim((string)($_GET['status']??''));
        $sql="SELECT * FROM (
          SELECT 'owner' subject_type,id,name,email,'OWNER' role_code,status,NULL deleted_at,created_at,last_login_at FROM owners
          UNION ALL SELECT 'teacher',id,name,email,'TEACHER',status,deleted_at,created_at,last_login_at FROM teachers
          UNION ALL SELECT 'student',id,name,email,'STUDENT',status,deleted_at,created_at,last_active FROM students
          UNION ALL SELECT 'platform',id,name,email,role_code,status,deleted_at,created_at,last_login_at FROM platform_users
        ) u WHERE 1=1";
        $params=[];
        if ($q!=='') {$sql.=' AND (u.name LIKE ? OR u.email LIKE ?)';$like='%'.$q.'%';$params[]=$like;$params[]=$like;}
        if (in_array($role,array_keys(Rbac::roles()),true)) {$sql.=' AND u.role_code=?';$params[]=$role;}
        if ($status==='deleted') $sql.=' AND u.deleted_at IS NOT NULL';
        elseif (in_array($status,['active','disabled','pending'],true)) {$sql.=' AND u.status=? AND u.deleted_at IS NULL';$params[]=$status;}
        else $sql.=' AND u.deleted_at IS NULL';
        $sql.=' ORDER BY u.created_at DESC,u.id DESC LIMIT 500';
        $rows=fetch_all($sql,$params);
        foreach ($rows as &$row) {$row['id']=(int)$row['id'];$row['roleName']=Rbac::roles()[$row['role_code']]??$row['role_code'];$row['isProtected']=$row['role_code']==='OWNER';$row['emailDisplay']=$row['role_code']===Rbac::PARENT?'دخول بالاسم':$row['email'];}
        Http::json(['items'=>$rows,'roles'=>Rbac::roles()]);
    }
    if (($segments[0]??'')==='meta' && $method==='GET') {
        Auth::requirePermission('users.view');
        $classes=fetch_all('SELECT c.id,c.name,c.stage,c.grade_label,c.academic_year,t.name teacher_name FROM classes c JOIN teachers t ON t.id=c.teacher_id WHERE t.deleted_at IS NULL ORDER BY c.stage,c.grade_label,c.name');
        Http::json(['roles'=>Rbac::roles(),'creatableRoles'=>['ADMIN'=>'إداري','TEACHER'=>'معلم','STUDENT'=>'طالب','PARENT'=>'ولي أمر'],'classes'=>$classes,'permissionCatalog'=>Rbac::permissionCatalog()]);
    }
    if (!$segments && $method==='POST') {
        Auth::requirePermission('users.create');
        $d=Http::input();Http::requireFields($d,['name','password','roleCode']);
        $role=Rbac::normalizeRole((string)$d['roleCode']);
        if ($role===Rbac::OWNER || !in_array($role,[Rbac::ADMIN,Rbac::TEACHER,Rbac::STUDENT,Rbac::PARENT],true)) Http::json(['error'=>'لا يمكن إنشاء دور مالك الموقع من إدارة المستخدمين.'],403);
        $name=trim((string)$d['name']);
        if ($name==='') Http::json(['error'=>'الاسم مطلوب.'],422);
        $email=$role===Rbac::PARENT ? parent_portal_internal_email('parent-owner') : (isset($d['email']) ? Http::schoolEmail((string)$d['email']) : '');
        if ($role!==Rbac::PARENT && $email==='') Http::json(['error'=>'البريد الإلكتروني مطلوب لهذا الدور.'],422);
        $password=(string)$d['password'];Auth::validatePassword($password);
        if ($role!==Rbac::PARENT && owner_rbac_email_exists($email)) Http::json(['error'=>'البريد الإلكتروني مستخدم في حساب آخر.'],409);
        $studentClass=null;
        if ($role===Rbac::STUDENT) {
            $classId=(int)($d['classId']??0);
            $studentClass=fetch_one('SELECT id,stage,grade_label FROM classes WHERE id=?',[$classId]);
            if (!$studentClass) Http::json(['error'=>'اختاري فصلًا صحيحًا للطالبة.'],422);
        }
        $result=Database::transaction(function(PDO $pdo) use($role,$name,$email,$password,$d,$ownerId,$studentClass):array {
            $hash=password_hash($password,PASSWORD_DEFAULT);
            if ($role===Rbac::TEACHER) {
                $pdo->prepare("INSERT INTO teachers(name,email,password_hash,status,approved_by,approved_at) VALUES(?,?,?,'active',?,NOW())")->execute([$name,$email,$hash,$ownerId]);
                $id=(int)$pdo->lastInsertId();$type='teacher';
            } elseif ($role===Rbac::STUDENT) {
                $classId=(int)$studentClass['id'];
                $pdo->prepare("INSERT INTO students(class_id,name,email,password_hash,stage,grade_label,status,must_change_password) VALUES(?,?,?,?,?,?,'active',1)")->execute([$classId,$name,$email,$hash,$studentClass['stage'],$studentClass['grade_label']]);
                $id=(int)$pdo->lastInsertId();$type='student';
            } else {
                $pdo->prepare("INSERT INTO platform_users(name,email,password_hash,role_code,status) VALUES(?,?,?,?,'active')")->execute([$name,$email,$hash,$role]);
                $id=(int)$pdo->lastInsertId();$type='platform';
            }
            Rbac::assignRole($type,$id,$role,$ownerId);
            return ['subjectType'=>$type,'id'=>$id,'roleCode'=>$role];
        });
        Activity::logDetailed('owner',$ownerId,'إنشاء مستخدم','تم إنشاء حساب جديد',$role===Rbac::PARENT?['name'=>$name,'roleCode'=>$role]:['email'=>$email,'roleCode'=>$role],$result);
        Http::json($result,201);
    }

    $subjectType=strtolower((string)($segments[0]??''));$id=route_id($segments,1);$action=$segments[2]??'';
    $record=owner_rbac_record($subjectType,$id,true);
    if (!$record) Http::json(['error'=>'المستخدم غير موجود.'],404);
    if ($action==='' && $method==='GET') {
        Auth::requirePermission('users.view');
        unset($record['password_hash']);
        $children=[];
        if ((string)$record['role_code']===Rbac::PARENT) {
            $children=fetch_all(
                "SELECT s.id,s.name,s.email,c.name AS class_name FROM parent_student_links l JOIN students s ON s.id=l.student_id JOIN classes c ON c.id=s.class_id WHERE l.parent_id=? AND l.status='active' AND s.deleted_at IS NULL ORDER BY s.name",
                [$id]
            );
        }
        Http::json(['user'=>$record,'children'=>$children,'impact'=>owner_rbac_impact($subjectType,$id),'permissions'=>Rbac::permissionsForRole((string)$record['role_code'])]);
    }
    if ($action==='' && $method==='PUT') {
        Auth::requirePermission('users.update');
        if ($subjectType==='owner') Http::json(['error'=>'بيانات المالك تُعدّل من إعدادات حساب المالك فقط.'],403);
        $d=Http::input();$before=$record;
        $name=trim((string)($d['name']??$record['name']));
        $email=$record['role_code']===Rbac::PARENT ? (string)$record['email'] : (isset($d['email'])?Http::schoolEmail((string)$d['email']):(string)$record['email']);
        $status=(string)($d['status']??$record['status']);
        if ($name==='') Http::json(['error'=>'الاسم مطلوب.'],422);
        if (!in_array($status,['active','disabled'],true)) Http::json(['error'=>'الحالة غير صالحة.'],422);
        if ($email!==$record['email'] && owner_rbac_email_exists($email,$subjectType,$id)) Http::json(['error'=>'البريد الإلكتروني مستخدم في حساب آخر.'],409);
        $table=$subjectType==='teacher'?'teachers':($subjectType==='student'?'students':'platform_users');
        execute_sql("UPDATE {$table} SET name=?,email=?,status=? WHERE id=?",[$name,$email,$status,$id]);
        $after=owner_rbac_record($subjectType,$id,true);
        Activity::logDetailed('owner',$ownerId,'تعديل مستخدم',"{$subjectType}:{$id}",$before,$after);
        Http::json(['user'=>$after]);
    }
    if ($action==='reset-password' && $method==='PUT') {
        Auth::requirePermission('users.reset_password');
        if ($subjectType==='owner') Http::json(['error'=>'لا يمكن إعادة تعيين كلمة مرور مالك آخر من هذه الصفحة.'],403);
        $d=Http::input();Http::requireFields($d,['newPassword']);Auth::validatePassword((string)$d['newPassword']);
        $table=$subjectType==='teacher'?'teachers':($subjectType==='student'?'students':'platform_users');
        $extra=$subjectType==='student'?',must_change_password=1':'';
        execute_sql("UPDATE {$table} SET password_hash=? {$extra} WHERE id=?",[password_hash((string)$d['newPassword'],PASSWORD_DEFAULT),$id]);
        Activity::log('owner',$ownerId,'إعادة تعيين كلمة مرور مستخدم',"{$subjectType}:{$id}");
        Http::json(['ok'=>true]);
    }
    if ($action==='impact' && $method==='GET') {
        Auth::requirePermission('users.view');Http::json(owner_rbac_impact($subjectType,$id));
    }
    if ($action==='soft-delete' && $method==='DELETE') {
        Auth::requirePermission('users.soft_delete');
        if ($subjectType==='owner') Http::json(['error'=>'لا يمكن حذف أو تعطيل حساب مالك الموقع من إدارة المستخدمين.'],403);
        $table=$subjectType==='teacher'?'teachers':($subjectType==='student'?'students':'platform_users');
        execute_sql("UPDATE {$table} SET status='disabled',deleted_at=NOW() WHERE id=?",[$id]);
        Activity::logDetailed('owner',$ownerId,'حذف مستخدم مؤقتًا',"{$subjectType}:{$id}",$record,owner_rbac_record($subjectType,$id,true));
        Http::json(['ok'=>true]);
    }
    if ($action==='restore' && $method==='POST') {
        Auth::requirePermission('users.restore');
        if ($subjectType==='owner') Http::json(['error'=>'حساب المالك غير محذوف.'],409);
        $table=$subjectType==='teacher'?'teachers':($subjectType==='student'?'students':'platform_users');
        execute_sql("UPDATE {$table} SET status='active',deleted_at=NULL WHERE id=?",[$id]);
        Activity::log('owner',$ownerId,'استعادة مستخدم',"{$subjectType}:{$id}");Http::json(['ok'=>true]);
    }
    if ($action==='permanent-delete' && $method==='DELETE') {
        Auth::requirePermission('users.permanent_delete');
        if ($subjectType==='owner') Http::json(['error'=>'حساب مالك الموقع محمي من الحذف.'],403);
        $d=Http::input();Http::requireFields($d,['currentPassword','confirmation']);
        if ((string)$d['confirmation']!=='حذف نهائي') Http::json(['error'=>'اكتبي عبارة «حذف نهائي» بصورة مطابقة.'],422);
        owner_rbac_verify_owner_password($ownerId,(string)$d['currentPassword']);
        if (empty($record['deleted_at'])) Http::json(['error'=>'استخدمي الحذف المؤقت أولًا قبل الحذف النهائي.'],409);
        $files=owner_rbac_physical_files($subjectType,$id);
        $quarantined=owner_rbac_quarantine_files($files);
        try {
            Database::transaction(function(PDO $pdo) use($subjectType,$id):void {
                $table=$subjectType==='teacher'?'teachers':($subjectType==='student'?'students':'platform_users');
                $pdo->prepare('DELETE FROM user_role_assignments WHERE subject_type=? AND subject_id=?')->execute([$subjectType,$id]);
                $pdo->prepare("DELETE FROM {$table} WHERE id=?")->execute([$id]);
            });
        } catch (Throwable $error) {
            owner_rbac_restore_quarantine($quarantined);
            throw $error;
        }
        owner_rbac_purge_quarantine($quarantined);
        Activity::logDetailed('owner',$ownerId,'حذف مستخدم نهائيًا',"{$subjectType}:{$id}",$record,['deleted'=>true,'physicalFiles'=>count($quarantined)]);
        Http::json(['ok'=>true,'deletedFiles'=>count($quarantined)]);
    }
    if ($action==='role' && $method==='PUT') {
        Auth::requirePermission('users.change_role');
        if ($subjectType==='owner') Http::json(['error'=>'لا يمكن تغيير دور مالك الموقع.'],403);
        $d=Http::input();Http::requireFields($d,['roleCode','currentPassword']);owner_rbac_verify_owner_password($ownerId,(string)$d['currentPassword']);
        $target=Rbac::normalizeRole((string)$d['roleCode']);
        if ($target===Rbac::OWNER || !in_array($target,[Rbac::ADMIN,Rbac::TEACHER,Rbac::STUDENT,Rbac::PARENT],true)) Http::json(['error'=>'الدور المطلوب غير مسموح.'],403);
        $result=owner_rbac_change_role($subjectType,$id,$target,$d,$ownerId);
        Activity::logDetailed('owner',$ownerId,'تغيير دور مستخدم',"{$subjectType}:{$id}",$record,$result);
        Http::json($result);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function owner_rbac_email_exists(string $email, ?string $exceptType=null, ?int $exceptId=null): bool
{
    $checks=[['owner','owners'],['teacher','teachers'],['student','students'],['platform','platform_users']];
    foreach ($checks as [$type,$table]) {
        $sql="SELECT id FROM {$table} WHERE email=?";$params=[$email];
        if ($type===$exceptType && $exceptId) {$sql.=' AND id<>?';$params[]=$exceptId;}
        $sql.=' LIMIT 1';if (fetch_one($sql,$params)) return true;
    }
    return false;
}

function owner_rbac_verify_owner_password(int $ownerId, string $password): void
{
    $row=fetch_one('SELECT password_hash FROM owners WHERE id=?',[$ownerId]);
    if (!$row || !password_verify($password,(string)$row['password_hash'])) Http::json(['error'=>'كلمة مرور مالك الموقع غير صحيحة.'],422);
}

function owner_rbac_physical_files(string $subjectType, int $id): array
{
    $files=[];
    if ($subjectType==='student') {
        foreach (fetch_all('SELECT stored_name FROM student_portfolio_files WHERE student_id=? AND stored_name IS NOT NULL',[$id]) as $row) {
            $files[]=MADAR_ROOT.'/storage/private/student-portfolios/'.basename((string)$row['stored_name']);
        }
    } elseif ($subjectType==='teacher') {
        foreach (fetch_all("SELECT stored_name FROM knowledge_resources WHERE teacher_id=? AND resource_type='file' AND stored_name IS NOT NULL",[$id]) as $row) {
            $files[]=MADAR_ROOT.'/storage/private/knowledge-exchange/'.basename((string)$row['stored_name']);
        }
        // ملفات إنجاز الطالبات لا تتبع المعلمة ملكيًا، لذلك لا تدخل في حذف حسابها.
    }
    return array_values(array_unique($files));
}

/**
 * ينقل الملفات مؤقتًا قبل الحذف النهائي. إذا فشلت معاملة قاعدة البيانات
 * تعاد الملفات إلى أماكنها، وبذلك لا يحدث حذف جزئي بين القاعدة والقرص.
 *
 * @return array<int,array{source:string,temporary:string}>
 */
function owner_rbac_quarantine_files(array $files): array
{
    $existing=array_values(array_filter($files,static fn(string $path):bool=>is_file($path)));
    if (!$existing) return [];
    $directory=MADAR_ROOT.'/storage/private/user-delete-quarantine/'.date('Ymd-His').'-'.bin2hex(random_bytes(6));
    if (!is_dir($directory) && !mkdir($directory,0700,true) && !is_dir($directory)) {
        throw new RuntimeException('تعذّر إنشاء مساحة الحماية المؤقتة للملفات.');
    }
    $moved=[];
    try {
        foreach ($existing as $index=>$source) {
            $temporary=$directory.'/'.str_pad((string)$index,4,'0',STR_PAD_LEFT).'-'.basename($source);
            if (!rename($source,$temporary)) throw new RuntimeException('تعذّر تأمين أحد الملفات قبل الحذف النهائي.');
            $moved[]=['source'=>$source,'temporary'=>$temporary];
        }
    } catch (Throwable $error) {
        owner_rbac_restore_quarantine($moved);
        @rmdir($directory);
        throw $error;
    }
    return $moved;
}

function owner_rbac_restore_quarantine(array $moved): void
{
    foreach (array_reverse($moved) as $item) {
        if (!is_file((string)$item['temporary'])) continue;
        $source=(string)$item['source'];
        $parent=dirname($source);
        if (!is_dir($parent)) @mkdir($parent,0700,true);
        @rename((string)$item['temporary'],$source);
    }
}

function owner_rbac_purge_quarantine(array $moved): void
{
    $directories=[];
    foreach ($moved as $item) {
        $temporary=(string)$item['temporary'];
        $directories[dirname($temporary)]=true;
        if (is_file($temporary)) @unlink($temporary);
    }
    foreach (array_keys($directories) as $directory) @rmdir($directory);
}

function owner_rbac_change_role(string $subjectType, int $id, string $targetRole, array $data, int $ownerId): array
{
    $record=owner_rbac_record($subjectType,$id,true);if(!$record)Http::json(['error'=>'المستخدم غير موجود.'],404);
    $current=Rbac::normalizeRole((string)$record['role_code']);
    if ($current===$targetRole) return ['ok'=>true,'subjectType'=>$subjectType,'id'=>$id,'roleCode'=>$targetRole];
    if ($subjectType==='platform' && in_array($targetRole,[Rbac::ADMIN,Rbac::PARENT],true)) {
        execute_sql('UPDATE platform_users SET role_code=? WHERE id=?',[$targetRole,$id]);Rbac::assignRole('platform',$id,$targetRole,$ownerId);
        return ['ok'=>true,'subjectType'=>'platform','id'=>$id,'roleCode'=>$targetRole];
    }
    $impact=owner_rbac_impact($subjectType,$id);
    if ((int)($impact['linkedRecords']??0)>0) Http::json(['error'=>'لا يمكن نقل الدور قبل معالجة البيانات المرتبطة بالحساب. استخدمي صفحة تفاصيل المستخدم لمعرفة التأثير.'],409);
    $hashTable=$subjectType==='teacher'?'teachers':($subjectType==='student'?'students':'platform_users');
    $source=fetch_one("SELECT name,email,password_hash FROM {$hashTable} WHERE id=?",[$id]);if(!$source)Http::json(['error'=>'تعذّر قراءة الحساب.'],404);
    $studentClass=null;
    if ($targetRole===Rbac::STUDENT) {
        $classId=(int)($data['classId']??0);
        $studentClass=fetch_one('SELECT id,stage,grade_label FROM classes WHERE id=?',[$classId]);
        if (!$studentClass) Http::json(['error'=>'اختاري فصلًا صحيحًا قبل نقل المستخدم إلى دور طالبة.'],422);
    }
    return Database::transaction(function(PDO $pdo) use($subjectType,$id,$targetRole,$source,$data,$ownerId,$hashTable,$studentClass):array {
        if ($targetRole===Rbac::TEACHER) {
            $pdo->prepare("INSERT INTO teachers(name,email,password_hash,status,approved_by,approved_at) VALUES(?,?,?,'active',?,NOW())")->execute([$source['name'],$source['email'],$source['password_hash'],$ownerId]);$newId=(int)$pdo->lastInsertId();$newType='teacher';
        } elseif ($targetRole===Rbac::STUDENT) {
            $classId=(int)$studentClass['id'];
            $pdo->prepare("INSERT INTO students(class_id,name,email,password_hash,stage,grade_label,status,must_change_password) VALUES(?,?,?,?,?,?,'active',1)")->execute([$classId,$source['name'],$source['email'],$source['password_hash'],$studentClass['stage'],$studentClass['grade_label']]);$newId=(int)$pdo->lastInsertId();$newType='student';
        } else {
            $pdo->prepare("INSERT INTO platform_users(name,email,password_hash,role_code,status) VALUES(?,?,?,?,'active')")->execute([$source['name'],$source['email'],$source['password_hash'],$targetRole]);$newId=(int)$pdo->lastInsertId();$newType='platform';
        }
        $pdo->prepare('DELETE FROM user_role_assignments WHERE subject_type=? AND subject_id=?')->execute([$subjectType,$id]);
        $pdo->prepare("DELETE FROM {$hashTable} WHERE id=?")->execute([$id]);
        Rbac::assignRole($newType,$newId,$targetRole,$ownerId);
        return ['ok'=>true,'subjectType'=>$newType,'id'=>$newId,'roleCode'=>$targetRole];
    });
}

function owner_rbac_permissions_routes(string $method, array $segments, array $owner): never
{
    if (!$segments && $method==='GET') {
        Auth::requirePermission('permissions.manage');
        $matrix=[];foreach (Rbac::roles() as $code=>$name)$matrix[$code]=['name'=>$name,'permissions'=>Rbac::permissionsForRole($code),'immutable'=>$code===Rbac::OWNER];
        Http::json(['catalog'=>Rbac::permissionCatalog(),'roles'=>$matrix]);
    }
    $role=Rbac::normalizeRole((string)($segments[0]??''));
    if ($method==='PUT') {
        Auth::requirePermission('permissions.manage');Auth::verifyCsrf();
        if ($role===Rbac::OWNER) Http::json(['error'=>'صلاحيات OWNER ثابتة وكاملة ولا يمكن تخفيضها.'],403);
        if (!array_key_exists($role,Rbac::roles())) Http::json(['error'=>'الدور غير صالح.'],422);
        $d=Http::input();$permissions=is_array($d['permissions']??null)?array_values(array_unique(array_map('strval',$d['permissions']))):[];
        $valid=array_column(Rbac::permissionCatalog(),'code');foreach($permissions as $permission)if(!in_array($permission,$valid,true))Http::json(['error'=>'توجد صلاحية غير معروفة.'],422);
        $before=Rbac::permissionsForRole($role);
        Database::transaction(function(PDO $pdo) use($role,$permissions):void {$pdo->prepare('DELETE FROM rbac_role_permissions WHERE role_code=?')->execute([$role]);$stmt=$pdo->prepare('INSERT INTO rbac_role_permissions(role_code,permission_code) VALUES(?,?)');foreach($permissions as $permission)$stmt->execute([$role,$permission]);});
        Rbac::clearPermissionCache($role);
        Activity::logDetailed('owner',(int)$owner['id'],'تعديل صلاحيات دور',$role,$before,$permissions);
        Http::json(['ok'=>true,'roleCode'=>$role,'permissions'=>$permissions]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function owner_rbac_preview_routes(string $method, array $segments, array $owner): never
{
    Auth::requirePermission('preview_roles.use');$ownerId=(int)$owner['id'];$action=$segments[0]??'';
    if (($action===''||$action==='options') && $method==='GET') {
        Http::json([
            'roles'=>['ADMIN'=>'الإداري','TEACHER'=>'المعلم','STUDENT'=>'الطالب','PARENT'=>'ولي الأمر'],
            'teachers'=>fetch_all("SELECT id,name,email FROM teachers WHERE status='active' AND deleted_at IS NULL ORDER BY name LIMIT 200"),
            'students'=>fetch_all("SELECT id,name,email FROM students WHERE status='active' AND deleted_at IS NULL ORDER BY name LIMIT 200"),
            'admins'=>fetch_all("SELECT id,name,email FROM platform_users WHERE role_code='ADMIN' AND status='active' AND deleted_at IS NULL ORDER BY name LIMIT 200"),
            'parents'=>fetch_all("SELECT id,name,email FROM platform_users WHERE role_code='PARENT' AND status='active' AND deleted_at IS NULL ORDER BY name LIMIT 200"),
        ]);
    }
    if ($action==='start' && $method==='POST') {
        $d=Http::input();Http::requireFields($d,['roleCode']);$role=Rbac::normalizeRole((string)$d['roleCode']);
        if (!in_array($role,[Rbac::ADMIN,Rbac::TEACHER,Rbac::STUDENT,Rbac::PARENT],true)) Http::json(['error'=>'الدور غير متاح للمعاينة.'],422);
        $subjectType=in_array($role,[Rbac::ADMIN,Rbac::PARENT],true)?'platform':Rbac::legacyRole($role);$subjectId=(int)($d['userId']??0);
        if ($subjectId>0) {
            $record=owner_rbac_record($subjectType,$subjectId,false);if(!$record||Rbac::normalizeRole((string)$record['role_code'])!==$role)Http::json(['error'=>'الحساب المحدد غير صالح للمعاينة.'],422);
        } elseif (in_array($role,[Rbac::TEACHER,Rbac::STUDENT],true)) Http::json(['error'=>'اختاري حسابًا فعليًا لمعاينة هذا الدور.'],422);
        Auth::stopPreview(true);
        execute_sql('INSERT INTO role_preview_sessions(owner_id,preview_role,preview_subject_type,preview_subject_id,ip_address,user_agent) VALUES(?,?,?,?,?,?)',[$ownerId,$role,$subjectType,$subjectId,$_SERVER['REMOTE_ADDR']??null,mb_substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,500)]);
        $sessionId=(int)Database::connection()->lastInsertId();Auth::startPreview($ownerId,$role,$subjectType,$subjectId,$sessionId);
        Activity::log('owner',$ownerId,'بدء معاينة دور',$role.' / المستخدم رقم '.$subjectId);
        $urls=[Rbac::TEACHER=>'/teacher/',Rbac::STUDENT=>'/student/',Rbac::ADMIN=>'/admin/',Rbac::PARENT=>'/parent/'];
        Http::json(['ok'=>true,'redirect'=>$urls[$role],'preview'=>Auth::previewContext()]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function owner_rbac_security_routes(string $method, array $segments, array $owner): never
{
    Auth::requirePermission('owner_security.manage');$ownerId=(int)$owner['id'];$action=$segments[0]??'';
    if ($action==='' && $method==='GET') {
        $row=fetch_one('SELECT two_factor_enabled,two_factor_confirmed_at FROM owner_security WHERE owner_id=?',[$ownerId]);
        Http::json(['twoFactorEnabled'=>(bool)($row['two_factor_enabled']??false),'confirmedAt'=>$row['two_factor_confirmed_at']??null,'sessionIdleSeconds'=>(int)(env_value('OWNER_SESSION_IDLE_SECONDS','1800')??1800)]);
    }
    if ($action==='setup' && $method==='POST') {
        $d=Http::input();Http::requireFields($d,['currentPassword']);owner_rbac_verify_owner_password($ownerId,(string)$d['currentPassword']);
        $secret=Totp::generateSecret();execute_sql('INSERT INTO owner_security(owner_id,two_factor_secret,two_factor_enabled) VALUES(?,?,0) ON DUPLICATE KEY UPDATE two_factor_secret=VALUES(two_factor_secret),two_factor_enabled=0,two_factor_confirmed_at=NULL',[$ownerId,$secret]);
        Activity::log('owner',$ownerId,'بدء إعداد المصادقة الثنائية');
        Http::json(['secret'=>$secret,'uri'=>Totp::uri($secret,(string)$owner['email'],'Madar')]);
    }
    if ($action==='enable' && $method==='POST') {
        $d=Http::input();Http::requireFields($d,['currentPassword','otp']);owner_rbac_verify_owner_password($ownerId,(string)$d['currentPassword']);$row=fetch_one('SELECT two_factor_secret FROM owner_security WHERE owner_id=?',[$ownerId]);
        if(!$row||!Totp::verify((string)$row['two_factor_secret'],(string)$d['otp']))Http::json(['error'=>'رمز المصادقة غير صحيح.'],422);
        execute_sql('UPDATE owner_security SET two_factor_enabled=1,two_factor_confirmed_at=NOW() WHERE owner_id=?',[$ownerId]);Activity::log('owner',$ownerId,'تفعيل المصادقة الثنائية');Http::json(['ok'=>true]);
    }
    if ($action==='disable' && $method==='POST') {
        $d=Http::input();Http::requireFields($d,['currentPassword','otp']);owner_rbac_verify_owner_password($ownerId,(string)$d['currentPassword']);$row=fetch_one('SELECT two_factor_secret,two_factor_enabled FROM owner_security WHERE owner_id=?',[$ownerId]);
        if(!empty($row['two_factor_enabled'])&&!Totp::verify((string)$row['two_factor_secret'],(string)$d['otp']))Http::json(['error'=>'رمز المصادقة غير صحيح.'],422);
        execute_sql('UPDATE owner_security SET two_factor_enabled=0,two_factor_secret=NULL,two_factor_confirmed_at=NULL WHERE owner_id=?',[$ownerId]);Activity::log('owner',$ownerId,'تعطيل المصادقة الثنائية');Http::json(['ok'=>true]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function owner_rbac_ownership_routes(string $method, array $segments, array $owner): never
{
    Auth::requirePermission('ownership.transfer');
    if (($segments[0]??'')==='verified-owner' && $method==='POST') {
        $d=Http::input();Http::requireFields($d,['currentPassword','confirmation','name','email','password']);
        if ((string)$d['confirmation']!=='نقل الملكية') Http::json(['error'=>'اكتبي عبارة «نقل الملكية» بصورة مطابقة.'],422);
        owner_rbac_verify_owner_password((int)$owner['id'],(string)$d['currentPassword']);
        $security=fetch_one('SELECT two_factor_enabled,two_factor_secret FROM owner_security WHERE owner_id=?',[$owner['id']]);
        if (!empty($security['two_factor_enabled']) && (!isset($d['otp']) || !Totp::verify((string)$security['two_factor_secret'],(string)$d['otp']))) Http::json(['error'=>'رمز المصادقة الثنائية مطلوب وصحيح لنقل الملكية.'],422);
        $email=Http::email((string)$d['email']);Auth::validatePassword((string)$d['password']);if(owner_rbac_email_exists($email))Http::json(['error'=>'البريد مستخدم مسبقًا.'],409);
        $newId=Database::transaction(function(PDO $pdo) use($d,$email,$owner):int {$pdo->prepare("INSERT INTO owners(name,email,password_hash,status) VALUES(?,?,?,'active')")->execute([trim((string)$d['name']),$email,password_hash((string)$d['password'],PASSWORD_DEFAULT)]);$id=(int)$pdo->lastInsertId();Rbac::assignRole('owner',$id,Rbac::OWNER,(int)$owner['id']);return $id;});
        Activity::logDetailed('owner',(int)$owner['id'],'إنشاء مالك موثّق','تمت العملية بعد إعادة التحقق',['existingOwnerId'=>$owner['id']],['newOwnerId'=>$newId,'email'=>$email]);
        Http::json(['ok'=>true,'newOwnerId'=>$newId]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}
