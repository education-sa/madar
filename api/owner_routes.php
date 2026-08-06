<?php
declare(strict_types=1);

function handle_owner_routes(string $method,array $segments): never
{
    Rbac::ensureSchema();
    $resource=$segments[0]??'';
    if ($resource==='login'&&$method==='POST') public_login('owner');
    if ($resource==='logout'&&$method==='POST') logout_route('owner');
    if ($resource==='me'&&$method==='GET') owner_me_route();

    $owner=Auth::requireRealOwner();
    if (!in_array($method,['GET','HEAD'],true)) Auth::verifyCsrf();
    $ownerId=(int)$owner['id'];

    if ($resource==='me'&&$method==='PUT') owner_update_profile($owner);
    if ($resource==='privacy') platform_privacy_routes('owner',$ownerId,$method);
    if ($resource==='summary'&&$method==='GET') { Auth::requirePermission('dashboard.view'); owner_summary(); }
    if ($resource==='users') owner_rbac_users_routes($method,array_slice($segments,1),$owner);
    if ($resource==='permissions') owner_rbac_permissions_routes($method,array_slice($segments,1),$owner);
    if ($resource==='preview') owner_rbac_preview_routes($method,array_slice($segments,1),$owner);
    if ($resource==='security') owner_rbac_security_routes($method,array_slice($segments,1),$owner);
    if ($resource==='ownership') owner_rbac_ownership_routes($method,array_slice($segments,1),$owner);
    if ($resource==='teachers') { Auth::requirePermission('teachers.manage'); owner_teachers_routes($method,array_slice($segments,1),$ownerId); }
    if ($resource==='students') { Auth::requirePermission('students.manage'); owner_students_routes($method,array_slice($segments,1),$ownerId); }
    if ($resource==='tests') { Auth::requirePermission($method==='GET'?'tests.view':'tests.manage'); owner_tests_routes($method,array_slice($segments,1),$ownerId); }
    if ($resource==='settings') { Auth::requirePermission('school_settings.manage'); owner_settings_routes($method,$owner); }
    if ($resource==='academic-year') {
        $action=$segments[1]??'';
        $permission=in_array($action,['backup'],true)?'backup.download':(in_array($action,['preview','reset'],true)?'academic_year.reset':'academic_period.manage');
        Auth::requirePermission($permission);
        owner_academic_year_routes($method,array_slice($segments,1),$owner);
    }
    if ($resource==='activity-log'&&$method==='GET') { Auth::requirePermission('activity_log.view'); owner_activity(); }
    if ($resource==='system') { Auth::requirePermission('backup.download'); owner_system_routes($method,array_slice($segments,1),$owner); }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function owner_me_route(): never
{
    $owner=Auth::requireRealOwner();
    $owner['csrfToken']=$_SESSION['csrf_token']??($_SESSION['csrf_token']=bin2hex(random_bytes(32)));
    $owner['roleCode']=Rbac::OWNER;
    $owner['permissions']=Rbac::permissionsForRole(Rbac::OWNER);
    $owner['preview']=Auth::previewContext();
    $security=fetch_one('SELECT two_factor_enabled,two_factor_confirmed_at FROM owner_security WHERE owner_id=?',[$owner['id']]);
    $owner['twoFactorEnabled']=(bool)($security['two_factor_enabled']??false);
    Http::json($owner);
}

function owner_update_profile(array $owner): never
{
    $data=Http::input();
    if (isset($data['currentPassword']) || isset($data['newPassword'])) {
        Http::requireFields($data,['currentPassword','newPassword','confirmPassword']);
        if ((string)$data['newPassword']!==(string)$data['confirmPassword']) Http::json(['error'=>'كلمتا المرور الجديدة غير متطابقتين.'],422);
        Auth::validatePassword((string)$data['newPassword']);
        $record=fetch_one('SELECT password_hash FROM owners WHERE id=?',[$owner['id']]);
        if (!$record || !password_verify((string)$data['currentPassword'],(string)$record['password_hash'])) Http::json(['error'=>'كلمة المرور الحالية غير صحيحة.'],422);
        execute_sql('UPDATE owners SET password_hash=? WHERE id=?',[password_hash((string)$data['newPassword'],PASSWORD_DEFAULT),$owner['id']]);
        Activity::log('owner',(int)$owner['id'],'تغيير كلمة مرور المالك');
        Http::json(['ok'=>true]);
    }
    $before=['name'=>$owner['name'],'email'=>$owner['email']];
    $name=trim((string)($data['name']??$owner['name']));
    // لا يتم تغيير بريد المالكة إلا إذا أرسلته المالكة صراحة من نموذج حسابها.
    $email=isset($data['email'])?Http::email((string)$data['email']):(string)$owner['email'];
    if ($name==='') Http::json(['error'=>'الاسم مطلوب.'],422);
    if ($email!==$owner['email'] && owner_rbac_email_exists($email,'owner',(int)$owner['id'])) Http::json(['error'=>'البريد مستخدم في حساب آخر.'],409);
    execute_sql('UPDATE owners SET name=?,email=? WHERE id=?',[$name,$email,$owner['id']]);
    Activity::logDetailed('owner',(int)$owner['id'],'تعديل بيانات حساب المالك',null,$before,['name'=>$name,'email'=>$email]);
    Http::json(['id'=>$owner['id'],'name'=>$name,'email'=>$email,'roleCode'=>Rbac::OWNER]);
}

function owner_summary(): never
{
    $teachers=(int)(fetch_one("SELECT COUNT(*) AS n FROM teachers WHERE deleted_at IS NULL")['n']??0);
    $students=(int)(fetch_one("SELECT COUNT(*) AS n FROM students WHERE deleted_at IS NULL")['n']??0);
    $tests=(int)(fetch_one('SELECT COUNT(*) AS n FROM tests')['n']??0);
    $results=(int)(fetch_one('SELECT COUNT(*) AS n FROM test_attempts')['n']??0);
    $admins=(int)(fetch_one("SELECT COUNT(*) AS n FROM platform_users WHERE role_code='ADMIN' AND deleted_at IS NULL")['n']??0);
    $parents=(int)(fetch_one("SELECT COUNT(*) AS n FROM platform_users WHERE role_code='PARENT' AND deleted_at IS NULL")['n']??0);
    $pending=(int)(fetch_one("SELECT COUNT(*) AS n FROM teachers WHERE status='pending' AND deleted_at IS NULL")['n']??0);
    $recent=fetch_all('SELECT actor_role,action,details,created_at,preview_role FROM activity_log ORDER BY created_at DESC LIMIT 10');
    $teachersDisabled=(int)(fetch_one("SELECT COUNT(*) AS n FROM teachers WHERE status='disabled' AND deleted_at IS NULL")['n']??0);
    $studentsDisabled=(int)(fetch_one("SELECT COUNT(*) AS n FROM students WHERE status='disabled' AND deleted_at IS NULL")['n']??0);
    Http::json([
        'teacherCount'=>$teachers,'studentCount'=>$students,'testCount'=>$tests,'resultCount'=>$results,
        'teachers'=>$teachers,'students'=>$students,'tests'=>$tests,'results'=>$results,
        'admins'=>$admins,'parents'=>$parents,
        'teachersDisabled'=>$teachersDisabled,'studentsDisabled'=>$studentsDisabled,'pendingTeachers'=>$pending,'recentActivity'=>$recent,
        'roleCode'=>Rbac::OWNER,
    ]);
}

function owner_teachers_routes(string $method,array $segments,int $ownerId): never
{
    if (!$segments&&$method==='GET') {
        Http::json(fetch_all("SELECT id,name,email,status,(status='disabled') AS disabled,created_at,last_login_at FROM teachers WHERE deleted_at IS NULL ORDER BY created_at DESC"));
    }
    if (!$segments&&$method==='POST') {
        $d=Http::input();Http::requireFields($d,['name','email','password']);$email=Http::schoolEmail((string)$d['email']);Auth::validatePassword((string)$d['password']);
        if (owner_rbac_email_exists($email)) Http::json(['error'=>'البريد مستخدم مسبقًا.'],409);
        execute_sql("INSERT INTO teachers(name,email,password_hash,status,approved_by,approved_at) VALUES(?,?,?,'active',?,NOW())",[trim((string)$d['name']),$email,password_hash((string)$d['password'],PASSWORD_DEFAULT),$ownerId]);
        $id=(int)Database::connection()->lastInsertId();Rbac::assignRole('teacher',$id,Rbac::TEACHER,$ownerId);
        Activity::logDetailed('owner',$ownerId,'إنشاء حساب معلمة',null,null,['id'=>$id,'email'=>$email,'roleCode'=>'TEACHER']);Http::json(['id'=>$id],201);
    }
    $id=route_id($segments,0);$before=owner_rbac_record('teacher',$id,true);if(!$before)Http::json(['error'=>'المعلمة غير موجودة.'],404);
    $action=$segments[1]??'';
    if ($action==='status'&&$method==='PUT') {
        $d=Http::input();$status=$d['status']??(!empty($d['disabled'])?'disabled':'active');
        if(!in_array($status,['pending','active','disabled'],true))Http::json(['error'=>'الحالة غير صالحة.'],422);
        execute_sql("UPDATE teachers SET status=?,approved_by=IF(?='active',?,approved_by),approved_at=IF(?='active',NOW(),approved_at) WHERE id=?",[$status,$status,$ownerId,$status,$id]);
        Activity::logDetailed('owner',$ownerId,'تحديث حالة معلمة',"المعلمة رقم {$id}",$before,owner_rbac_record('teacher',$id,true));Http::json(['ok'=>true]);
    }
    if ($action==='reset-password'&&$method==='PUT') {
        $d=Http::input();Http::requireFields($d,['newPassword']);Auth::validatePassword((string)$d['newPassword']);execute_sql('UPDATE teachers SET password_hash=? WHERE id=?',[password_hash((string)$d['newPassword'],PASSWORD_DEFAULT),$id]);Activity::log('owner',$ownerId,'إعادة تعيين كلمة مرور معلمة',"المعلمة رقم {$id}");Http::json(['ok'=>true]);
    }
    if ($action===''&&$method==='DELETE') {
        execute_sql("UPDATE teachers SET status='disabled',deleted_at=NOW() WHERE id=?",[$id]);Activity::logDetailed('owner',$ownerId,'حذف معلمة مؤقتًا',"المعلمة رقم {$id}",$before,owner_rbac_record('teacher',$id,true));Http::json(['ok'=>true,'softDeleted'=>true]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function owner_students_routes(string $method,array $segments,int $ownerId): never
{
    if (!$segments&&$method==='GET') {
        Http::json(fetch_all("SELECT s.id,s.name,s.email,s.status,(s.status='disabled') AS disabled,s.learning_style,c.name AS class_name,t.name AS teacher_name FROM students s LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN teachers t ON t.id=c.teacher_id WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC"));
    }
    $id=route_id($segments,0);$before=owner_rbac_record('student',$id,true);if(!$before)Http::json(['error'=>'الطالبة غير موجودة.'],404);
    if (($segments[1]??'')==='status'&&$method==='PUT') {$d=Http::input();$status=!empty($d['disabled'])?'disabled':'active';execute_sql('UPDATE students SET status=? WHERE id=?',[$status,$id]);Activity::logDetailed('owner',$ownerId,'تحديث حالة طالبة',"الطالبة رقم {$id}",$before,owner_rbac_record('student',$id,true));Http::json(['ok'=>true]);}
    if (($segments[1]??'')==='reset-password'&&$method==='PUT') {$d=Http::input();Http::requireFields($d,['newPassword']);Auth::validatePassword((string)$d['newPassword']);execute_sql('UPDATE students SET password_hash=?,must_change_password=1 WHERE id=?',[password_hash((string)$d['newPassword'],PASSWORD_DEFAULT),$id]);Activity::log('owner',$ownerId,'إعادة تعيين كلمة مرور طالبة',"الطالبة رقم {$id}");Http::json(['ok'=>true]);}
    if (($segments[1]??'')===''&&$method==='DELETE') {execute_sql("UPDATE students SET status='disabled',deleted_at=NOW() WHERE id=?",[$id]);Activity::logDetailed('owner',$ownerId,'حذف طالبة مؤقتًا',"الطالبة رقم {$id}",$before,owner_rbac_record('student',$id,true));Http::json(['ok'=>true,'softDeleted'=>true]);}
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function owner_tests_routes(string $method,array $segments,int $ownerId): never
{
    if (!$segments&&$method==='GET') {
        Http::json(fetch_all("SELECT t.id,t.title,t.test_type AS category,t.status,te.name AS teacher_name,(SELECT COUNT(*) FROM test_attempts a WHERE a.test_id=t.id) AS results_count FROM tests t JOIN teachers te ON te.id=t.teacher_id ORDER BY t.created_at DESC"));
    }
    $id=route_id($segments,0);$before=fetch_one('SELECT id,title,teacher_id,status,academic_year FROM tests WHERE id=?',[$id]);if(!$before)Http::json(['error'=>'الاختبار غير موجود.'],404);
    if ($method==='DELETE') {
        Database::transaction(function (PDO $pdo) use ($id): void {
            $pdo->prepare('DELETE FROM answers WHERE attempt_id IN (SELECT a.id FROM test_attempts a WHERE a.test_id=?)')->execute([$id]);
            $pdo->prepare('DELETE FROM test_attempt_questions WHERE attempt_id IN (SELECT a.id FROM test_attempts a WHERE a.test_id=?)')->execute([$id]);
            $pdo->prepare('DELETE FROM test_attempts WHERE test_id=?')->execute([$id]);
            $pdo->prepare('DELETE FROM test_questions WHERE test_id=?')->execute([$id]);
            $pdo->prepare('DELETE FROM tests WHERE id=?')->execute([$id]);
        });
        Activity::logDetailed('owner',$ownerId,'حذف اختبار',"الاختبار رقم {$id}",$before,['deleted'=>true]);
        Http::json(['ok'=>true]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function owner_settings_routes(string $method,array $owner): never
{
    if ($method==='GET') {
        $rows=fetch_all('SELECT setting_key,setting_value FROM app_settings');$settings=[];foreach($rows as $row)$settings[$row['setting_key']]=$row['setting_value'];Http::json($settings);
    }
    if ($method==='PUT') {
        $d=Http::input();$before=[];$stmt=Database::connection()->prepare('INSERT INTO app_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)');
        $entries=isset($d['key'])?[(string)$d['key']=>$d['value']??'']:$d;
        foreach($entries as $key=>$value){if(!preg_match('/^[a-z0-9_]{2,100}$/',(string)$key))continue;$old=fetch_one('SELECT setting_value FROM app_settings WHERE setting_key=?',[$key]);$before[$key]=$old['setting_value']??null;$stmt->execute([$key,is_bool($value)?($value?'true':'false'):(is_scalar($value)?(string)$value:json_encode($value,JSON_UNESCAPED_UNICODE))]);}
        Activity::logDetailed('owner',(int)$owner['id'],'تعديل إعدادات النظام',null,$before,$entries);Http::json(['ok'=>true]);
    }
    Http::json(['error'=>'الطريقة غير مسموحة.'],405);
}

function owner_activity(): never
{
    $q=trim((string)($_GET['q']??''));$role=trim((string)($_GET['role']??''));$params=[];
    $sql="SELECT l.id,l.actor_role,l.actor_id,l.real_actor_role,l.real_actor_id,l.preview_role,l.action,l.details,l.before_data,l.after_data,l.ip_address,l.user_agent,l.created_at,o.name AS owner_name,t.name AS teacher_name,s.name AS student_name,p.name AS platform_name,p.role_code AS platform_role FROM activity_log l LEFT JOIN owners o ON l.actor_role='owner' AND o.id=l.actor_id LEFT JOIN teachers t ON l.actor_role='teacher' AND t.id=l.actor_id LEFT JOIN students s ON l.actor_role='student' AND s.id=l.actor_id LEFT JOIN platform_users p ON l.actor_role IN ('admin','parent') AND p.id=l.actor_id WHERE 1=1";
    if($q!==''){$sql.=' AND (l.action LIKE ? OR l.details LIKE ? OR l.ip_address LIKE ?)';$like='%'.$q.'%';$params=[$like,$like,$like];}
    if($role!==''){$sql.=' AND l.actor_role=?';$params[]=$role;}
    $sql.=' ORDER BY l.created_at DESC LIMIT 1000';
    Http::json(fetch_all($sql,$params));
}
