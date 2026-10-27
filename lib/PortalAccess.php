<?php
declare(strict_types=1);
/** Portal policy uses native subject IDs; never changes Madar RBAC or credentials. */
final class PortalAccess
{
    public const MODES=['madar_only','portal_only','both'];
    public static function owner(array $u): bool {
        return ($u['role']??'')==='owner' && ($u['subjectType']??'')==='owner' && ($u['roleCode']??'')===Rbac::OWNER;
    }
    public static function ready(): bool {
        static $ready=null;if($ready!==null)return $ready;
        try {foreach(['mb_native_access'=>'subject_id','mb_class_identity'=>'class_id','mb_school_roles'=>'user_id'] as $table=>$column)Database::connection()->query('SELECT '.$column.' FROM '.$table.' LIMIT 0');return $ready=true;}
        catch(PDOException $e){if((int)($e->errorInfo[1]??0)===1146)return $ready=false;throw $e;}
    }
    public static function state(array $u): array {
        if(self::owner($u))return ['access_mode'=>'both','portal_enabled'=>true,'first_teacher'=>false,'ready'=>self::ready()];
        $type=(string)($u['subjectType']??'');$id=(int)($u['id']??0);
        $ready=self::ready();$row=null;
        if($ready){$q=Database::connection()->prepare('SELECT access_mode,portal_enabled FROM mb_native_access WHERE subject_type=? AND subject_id=?');$q->execute([$type,$id]);$row=$q->fetch();}
        // Missing migration must not lock users out of their existing Madar accounts.
        $mode=$row['access_mode']??'madar_only';$enabled=(bool)($row['portal_enabled']??false);
        $senior=OwnerDelegation::allowed($u);
        $first=false;
        if($ready && $enabled && $mode!=='madar_only' && $type==='teacher'){
            $q=Database::connection()->prepare("SELECT 1 FROM mb_school_roles r JOIN ms_users u ON u.id=r.user_id WHERE u.external_id=? AND r.role='first_teacher'");$q->execute(['teacher:'.$id]);$first=(bool)$q->fetchColumn();
        }
        return ['access_mode'=>$mode,'portal_enabled'=>$enabled,'first_teacher'=>$first,'senior_teacher'=>$senior,'ready'=>$ready];
    }
    public static function canPortal(array $u): bool {
        if(($u['status']??'')!=='active')return false;
        if(OwnerDelegation::allowed($u))return true;
        if(self::owner($u))return true;
        if(!in_array($u['role']??'',['teacher','student','parent'],true))return false;
        $s=self::state($u);return $s['portal_enabled'] && in_array($s['access_mode'],['both','portal_only'],true);
    }
    public static function canMadar(array $u): bool {return ($u['status']??'')==='active' && (self::owner($u)||OwnerDelegation::allowed($u)||in_array(self::state($u)['access_mode'],['madar_only','both'],true));}
    public static function destination(array $u): string {if(self::owner($u))return '/owner/dashboard?section=teachers';if(OwnerDelegation::allowed($u))return '/dhalim/?board=1';return match($u['role']??''){'student'=>'/dhalim/student/','parent'=>'/dhalim/parent/',default=>'/dhalim/'};}
    public static function guardServicePage(): void {
        $path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH);
        if(!preg_match('#^/(games|planning|meetings|teacher|student|parent|admin)(?:/|$)#',(string)$path))return;
        // Login/registration pages remain public; account service pages enforce native access.
        if(preg_match('#/(?:login|register)(?:\.html|\.php)?/?$#',(string)$path))return;
        $u=Auth::user();if($u)self::pageGuard($u);
    }
    public static function requirePortal(array $u): void {
        if(!self::canPortal($u))Http::json(['error'=>'لم تسمح مالكة الموقع لهذا الحساب بالدخول إلى بوابة ظليم.'],403);
    }
    public static function pageGuard(array $u): void {
        if(!self::canMadar($u)){header('Location: '.self::destination($u));exit;}
    }
    public static function apiGuard(string $scope,array $segments): void {
        if(!in_array($scope,['teacher','student','parent'],true))return;
        // Login, logout, current identity, and password changes remain available.
        if(in_array($segments[0]??'',['login','logout','me','profile','change-password','password-reset-request'],true))return;
        $u=Auth::user();if($u&&$scope==='student'&&($u['role']??'')==='student'){$q=Database::connection()->prepare('SELECT class_id FROM students WHERE id=?');$q->execute([$u['id']]);$cid=(int)$q->fetchColumn();if($cid&&!PortalManagement::nativeClassEnabled($cid))Http::json(['error'=>'هذا الفصل متاح في بوابة ظليم فقط.','redirect'=>'/dhalim/?role=student'],403);}
        if($u && !self::canMadar($u))Http::json(['error'=>'هذا الحساب مخصص لبوابة ظليم فقط.','redirect'=>self::destination($u)],403);
    }
    public static function returnTarget(string $target): string {
        $decoded=rawurldecode($target);
        if(preg_match('/[\x00-\x20\x7f\\\\]/',$decoded)||str_contains($decoded,'%'))return '/dhalim/';
        $path=parse_url($decoded,PHP_URL_PATH);
        $map=['/dhalim/'=>'/dhalim/','/dhalim/student/'=>'/dhalim/student/','/dhalim/parent/'=>'/dhalim/parent/','/dhalim/entry/'=>'/dhalim/entry/','/surveys/public/'=>'/dhalim/','/surveys/public/index.php'=>'/dhalim/','/surveys/public/board-student.php'=>'/dhalim/student/'];
        if(!is_string($path)||!isset($map[$path]))return '/dhalim/';
        $query=parse_url($target,PHP_URL_QUERY);
        return $map[$path].($query!==null?'?'.$query:'');
    }
    public static function target(string $type,int $id): array {
        $tables=['teacher'=>'teachers','student'=>'students','platform'=>'platform_users'];
        if(!isset($tables[$type])||$id<1)Http::json(['error'=>'نوع الحساب غير مسموح.'],422);
        $q=Database::connection()->prepare('SELECT * FROM '.$tables[$type].' WHERE id=? AND deleted_at IS NULL');$q->execute([$id]);$r=$q->fetch();
        if(!$r || ($type==='platform'&&($r['role_code']??'')!==Rbac::PARENT))Http::json(['error'=>'الحساب غير موجود.'],404);
        return $r;
    }
    public static function audit(PDO $pdo,int $owner,string $type,int $id,string $event,array $before,array $after): void {
        $pdo->prepare('INSERT INTO mb_access_audit(owner_id,subject_type,subject_id,event_type,before_json,after_json) VALUES (?,?,?,?,?,?)')->execute([$owner,$type,$id,$event,json_encode($before,JSON_UNESCAPED_UNICODE),json_encode($after,JSON_UNESCAPED_UNICODE)]);
    }
    public static function msTeacher(PDO $pdo,array $r): int {
        $key='teacher:'.(int)$r['id'];$q=$pdo->prepare('SELECT id FROM ms_users WHERE external_id=?');$q->execute([$key]);$id=$q->fetchColumn();if($id)return (int)$id;
        // Never merge by email: collision is an error, not permission to relink another account.
        $pdo->prepare('INSERT INTO ms_users(external_id,name,email) VALUES (?,?,?)')->execute([$key,$r['name'],strtolower($r['email'])]);return (int)$pdo->lastInsertId();
    }
    public static function teacherSettings(int $id): array {
        $r=self::target('teacher',$id);$pdo=Database::connection();
        $q=$pdo->prepare('SELECT id FROM ms_users WHERE external_id=?');$q->execute(['teacher:'.$id]);$ms=(int)$q->fetchColumn();
        $q=$pdo->prepare('SELECT setting_value FROM ms_settings WHERE setting_key=?');$q->execute(['teacher_specialty_'.$id]);$specialty=$q->fetchColumn();
        $q=$pdo->prepare('SELECT c.id,c.title,c.grade,c.academic_year,c.is_active,t.can_view,t.can_post,t.can_upload,p.subject,p.specialty,p.approved FROM mb_classes c LEFT JOIN mb_teachers t ON t.class_id=c.id AND t.teacher_id=? LEFT JOIN mb_teacher_profiles p ON p.class_id=c.id AND p.teacher_id=t.teacher_id WHERE c.is_active=1 OR t.teacher_id IS NOT NULL ORDER BY c.is_active DESC,c.academic_year DESC,c.title');$q->execute([$ms]);$classes=$q->fetchAll();
        if($specialty===false){$specialty='';foreach($classes as $c)if(trim((string)($c['specialty']??''))!==''){$specialty=$c['specialty'];break;}}
        return ['name'=>$r['name'],'specialty'=>(string)$specialty,'classes'=>$classes,'access'=>self::state(['id'=>$id,'subjectType'=>'teacher','role'=>'teacher','status'=>$r['status']])];
    }
    public static function validateTeacherSettings($raw): array {
        if(!is_array($raw)||!is_string($raw['specialty']??null)||!is_array($raw['classes']??null))Http::json(['error'=>'بيانات التخصص والفصول غير صالحة.'],422);
        $specialty=trim($raw['specialty']);if(mb_strlen($specialty)>100||count($raw['classes'])>100)Http::json(['error'=>'تحققي من التخصص وعدد الفصول.'],422);
        $classes=[];$pdo=Database::connection();
        foreach($raw['classes'] as $c){
            if(!is_array($c))Http::json(['error'=>'بيانات فصل غير صالحة.'],422);
            $id=filter_var($c['id']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);$subject=is_string($c['subject']??null)?trim($c['subject']):'';
            if(!$id||isset($classes[$id])||$subject===''||mb_strlen($subject)>85||$specialty==='')Http::json(['error'=>'حددي التخصص والمادة لكل فصل، دون تكرار الفصل.'],422);
            $q=$pdo->prepare('SELECT grade FROM mb_classes WHERE id=?');$q->execute([$id]);$grade=$q->fetchColumn();if($grade===false)Http::json(['error'=>'أحد الفصول لم يعد موجودًا.'],422);
            foreach(['can_upload','can_post'] as $right)if(!is_bool($c[$right]??null))Http::json(['error'=>'صلاحيات الفصل غير صالحة.'],422);
            $classes[$id]=['id'=>(int)$id,'subject'=>$subject,'grade'=>$grade,'can_upload'=>$c['can_upload'],'can_post'=>$c['can_post']];
        }
        return ['specialty'=>$specialty,'classes'=>array_values($classes)];
    }
    public static function saveTeacherSettings(PDO $pdo,int $id,int $ms,int $ownerMs,array $settings): void {
        $pdo->prepare('INSERT INTO ms_settings(setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)')->execute(['teacher_specialty_'.$id,$settings['specialty']]);
        // Withdraw access without deleting memberships, student work, posts or historic profiles.
        $pdo->prepare('UPDATE mb_teachers SET can_view=0 WHERE teacher_id=?')->execute([$ms]);
        $pdo->prepare('UPDATE mb_teacher_profiles SET approved=0 WHERE teacher_id=?')->execute([$ms]);
        foreach($settings['classes'] as $c){
            $pdo->prepare('INSERT INTO mb_teachers(class_id,teacher_id,can_view,can_post,can_upload,can_manage_students,can_manage_posts) VALUES (?,?,1,?,?,0,0) ON DUPLICATE KEY UPDATE can_view=1,can_post=VALUES(can_post),can_upload=VALUES(can_upload),can_manage_students=0,can_manage_posts=0')->execute([$c['id'],$ms,$c['can_post']?1:0,$c['can_upload']?1:0]);
            $pdo->prepare('INSERT INTO mb_teacher_profiles(class_id,teacher_id,specialty,subject,grade_scope,approved,approved_by) VALUES (?,?,?,?,?,1,?) ON DUPLICATE KEY UPDATE specialty=VALUES(specialty),subject=VALUES(subject),grade_scope=VALUES(grade_scope),approved=1,approved_by=VALUES(approved_by)')->execute([$c['id'],$ms,$settings['specialty'],$c['subject'],$c['grade'],$ownerMs]);
        }
    }
    public static function update(array $owner,string $type,int $id,array $d): void {
        $r=self::target($type,$id);$pdo=Database::connection();
        OwnerDelegation::ensureSchema();
        if(!self::ready())Http::json(['error'=>'يلزم تشغيل ترحيل بوابة ظليم أولًا.'],503);
        $mode=$d['access_mode']??'';$enabled=$d['portal_enabled']??null;
        if(!in_array($mode,self::MODES,true)||!is_bool($enabled))Http::json(['error'=>'إعداد وصول غير صالح.'],422);
        if($mode==='madar_only')$enabled=false;
        $first=$d['first_teacher']??false;if(!is_bool($first)||($type!=='teacher'&&$first))Http::json(['error'=>'دور معلم مساعد للمعلمات فقط.'],422);
        if($first&&($r['status']!=='active'||!$enabled||$mode==='madar_only'))Http::json(['error'=>'يلزم حساب معلمة نشط ووصول مفعّل للبوابة لمنح الدور.'],422);
        $senior=$d['senior_teacher']??null;
        if($senior!==null && (!is_bool($senior)||$type!=='teacher'))Http::json(['error'=>'دور معلم أول للمعلمات فقط.'],422);
        if($senior===true && ($r['status']!=='active'||!$enabled||$mode!=='both'||$first))Http::json(['error'=>'المعلم الأول يحتاج حسابًا نشطًا ووصول مدار وبوابة ظليم.'],422);
        $settings=$type==='teacher'&&array_key_exists('settings',$d)?self::validateTeacherSettings($d['settings']):null;
        if($settings!==null&&empty($d['confirmed']))Http::json(['error'=>'أكدي حفظ إعدادات المعلمة واعتماد الفصول أولًا.'],409);
        $pdo->beginTransaction();
        try{
            // Serialize changes, including first-time rows, to keep the audit and role atomic.
            $pdo->prepare('SELECT id FROM '.['teacher'=>'teachers','student'=>'students','platform'=>'platform_users'][$type].' WHERE id=? FOR UPDATE')->execute([$id]);
            $native=['subjectType'=>$type,'id'=>$id,'role'=>$type==='platform'?'parent':$type,'status'=>$r['status']];$before=self::state($native);if($settings!==null)$before['teaching']=self::teacherSettings($id);
            $effectiveSenior=$senior??($before['senior_teacher']??false);
            if($effectiveSenior && ($first||!$enabled||$mode!=='both')){if($senior===null){$pdo->rollBack();Http::json(['error'=>'اسحبي دور معلم أول صراحة قبل تقييد الوصول.'],409);}$effectiveSenior=false;}
            if($effectiveSenior!==($before['senior_teacher']??false)){Auth::requireRealOwner();if(empty($d['confirmed'])){$pdo->rollBack();Http::json(['error'=>'أكدي منح أو سحب صلاحيات مالكة مدار.'],409);}}
            if($first!==$before['first_teacher'])Auth::requireRealOwner();
            $revoking=$before['first_teacher']&&(!$first||!$enabled||$mode==='madar_only');
            if(($revoking||$before['access_mode']!==$mode||$before['portal_enabled']!==$enabled)&&empty($d['confirmed'])){ $pdo->rollBack();Http::json(['error'=>'أكدي تغيير الوصول أو سحب الدور أولًا.'],409);}
            $pdo->prepare('INSERT INTO mb_native_access(subject_type,subject_id,access_mode,portal_enabled,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE access_mode=VALUES(access_mode),portal_enabled=VALUES(portal_enabled),updated_by=VALUES(updated_by)')->execute([$type,$id,$mode,$enabled?1:0,$owner['id']]);
            if($type==='teacher'){
                $ms=self::msTeacher($pdo,$r);
                if($effectiveSenior && !($before['senior_teacher']??false))$pdo->prepare('INSERT INTO owner_teacher_delegations(teacher_id,owner_id) VALUES (?,?) ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id),granted_at=CURRENT_TIMESTAMP')->execute([$id,$owner['id']]);
                elseif(!$effectiveSenior) $pdo->prepare('DELETE FROM owner_teacher_delegations WHERE teacher_id=?')->execute([$id]);
                if($first)$pdo->prepare("INSERT INTO mb_school_roles(user_id,role,granted_by) VALUES (?,'first_teacher',?) ON DUPLICATE KEY UPDATE granted_by=VALUES(granted_by),granted_at=UTC_TIMESTAMP()")->execute([$ms,self::msOwner($pdo,$owner)]);
                else $pdo->prepare("DELETE FROM mb_school_roles WHERE user_id=? AND role='first_teacher'")->execute([$ms]);
                if($settings!==null)self::saveTeacherSettings($pdo,$id,$ms,self::msOwner($pdo,$owner),$settings);
            }
            if($type==='student')$pdo->prepare('INSERT IGNORE INTO mb_students(madar_student_id,display_name,school_enabled) VALUES (?,?,0)')->execute([$id,$r['name']]);
            if($type==='student')$pdo->prepare('UPDATE mb_students SET school_enabled=?,entry_mode=? WHERE madar_student_id=?')->execute([$enabled&&$mode!=='madar_only'?1:0,$mode==='portal_only'?'school_only':'madar',$id]);
            $after=self::state($native);$after['actor']=['subjectType'=>Auth::realUser()['subjectType']??'owner','id'=>Auth::realUser()['id']??$owner['id']];if($settings!==null)$after['teaching']=self::teacherSettings($id);self::audit($pdo,(int)$owner['id'],$type,$id,($effectiveSenior!==($before['senior_teacher']??false)?($effectiveSenior?'grant_senior_teacher':'revoke_senior_teacher'):($revoking?'revoke_first_teacher':(!$before['first_teacher']&&$first?'grant_first_teacher':'portal_access'))),$before,$after);$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function msOwner(PDO $pdo,array $r): int {
        if(!empty($r['delegated'])){$q=$pdo->prepare('SELECT id,name,email FROM owners WHERE id=?');$q->execute([$r['id']]);$r=$q->fetch();if(!$r)throw new RuntimeException('تعذر تحديد المالكة المفوضة.');}
        $key='owner:'.(int)$r['id'];$q=$pdo->prepare('SELECT id FROM ms_users WHERE external_id=?');$q->execute([$key]);$id=$q->fetchColumn();if($id)return (int)$id;
        $pdo->prepare('INSERT INTO ms_users(external_id,name,email,is_admin) VALUES (?,?,?,1)')->execute([$key,$r['name'],strtolower($r['email'])]);return (int)$pdo->lastInsertId();
    }
}
