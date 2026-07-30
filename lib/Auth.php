<?php
declare(strict_types=1);

final class Auth
{
    private const ROLE_TABLES = [
        'owner' => ['table'=>'owners','subject'=>'owner','roleCode'=>Rbac::OWNER],
        'teacher' => ['table'=>'teachers','subject'=>'teacher','roleCode'=>Rbac::TEACHER],
        'student' => ['table'=>'students','subject'=>'student','roleCode'=>Rbac::STUDENT],
        'admin' => ['table'=>'platform_users','subject'=>'platform','roleCode'=>Rbac::ADMIN],
        'parent' => ['table'=>'platform_users','subject'=>'platform','roleCode'=>Rbac::PARENT],
    ];

    public static function user(): ?array
    {
        $real = self::realUser();
        if (!$real) return null;

        if (($real['roleCode'] ?? '') === Rbac::OWNER && self::isOwnerPreview()) {
            $preview = self::previewContext();
            $roleCode = (string)($preview['roleCode'] ?? '');
            $legacy = Rbac::legacyRole($roleCode);
            $subjectType = (string)($_SESSION['preview_subject_type'] ?? '');
            $subjectId = (int)($_SESSION['preview_subject_id'] ?? 0);
            $effective = self::loadUserRecord($legacy,$subjectId,$subjectType,$roleCode,true);
            if (!$effective) {
                self::stopPreview(false);
                return $real;
            }
            $effective['isPreview'] = true;
            $effective['preview'] = $preview;
            $effective['realOwner'] = [
                'id'=>(int)$real['id'],
                'name'=>(string)$real['name'],
                'email'=>(string)$real['email'],
                'roleCode'=>Rbac::OWNER,
            ];
            return $effective;
        }
        $real['isPreview'] = false;
        return $real;
    }

    public static function realUser(): ?array
    {
        $role = strtolower((string)($_SESSION['role'] ?? ''));
        $id = (int)($_SESSION['user_id'] ?? 0);
        if (!$role || !$id || !isset(self::ROLE_TABLES[$role])) return null;
        if (!self::sessionIsValid($role)) {
            self::logout();
            return null;
        }
        $user = self::loadUserRecord($role,$id,null,null,false);
        if (!$user) {
            self::logout();
            return null;
        }
        $_SESSION['last_activity_at'] = time();
        return $user;
    }

    private static function sessionIsValid(string $role): bool
    {
        $now=time();
        $created=(int)($_SESSION['session_created_at']??$now);
        $last=(int)($_SESSION['last_activity_at']??$now);
        $idleDefault=$role==='owner'?1800:3600;
        $idle=max(300,(int)(env_value($role==='owner'?'OWNER_SESSION_IDLE_SECONDS':'SESSION_IDLE_SECONDS',(string)$idleDefault)??$idleDefault));
        $absolute=max($idle,(int)(env_value('SESSION_ABSOLUTE_SECONDS','28800')??28800));
        return ($now-$last)<=$idle && ($now-$created)<=$absolute;
    }

    private static function loadUserRecord(string $role, int $id, ?string $forcedSubjectType = null, ?string $forcedRoleCode = null, bool $allowSynthetic = false): ?array
    {
        $role=strtolower($role);
        if (!isset(self::ROLE_TABLES[$role])) return null;
        Rbac::ensureSchema();
        $meta=self::ROLE_TABLES[$role];
        $table=$meta['table'];
        if ($allowSynthetic && $id===0 && in_array($role,['admin','parent'],true)) {
            $code=$forcedRoleCode ?: $meta['roleCode'];
            return [
                'id'=>0,
                'name'=>$code===Rbac::ADMIN?'معاينة الإداري':'معاينة ولي الأمر',
                'email'=>'preview@madar.local',
                'status'=>'active',
                'role'=>$role,
                'roleCode'=>$code,
                'permissions'=>Rbac::permissionsForRole($code),
                'subjectType'=>'platform',
            ];
        }
        $sql="SELECT id,name,email,status FROM {$table} WHERE id=?";
        $params=[$id];
        if ($table==='platform_users') {
            $sql.=' AND role_code=? AND deleted_at IS NULL';
            $params[]=$forcedRoleCode ?: $meta['roleCode'];
        } elseif (in_array($table,['teachers','students'],true)) {
            $sql.=' AND deleted_at IS NULL';
        }
        $sql.=' LIMIT 1';
        $stmt=Database::connection()->prepare($sql);
        $stmt->execute($params);
        $record=$stmt->fetch();
        if (!$record || ($record['status']??'active')!=='active') return null;
        $subjectType=$forcedSubjectType ?: $meta['subject'];
        $roleCode=$forcedRoleCode ?: Rbac::roleCodeFor($subjectType,$id,$meta['roleCode']);
        $record['id']=(int)$record['id'];
        $record['role']=$role;
        $record['roleCode']=$roleCode;
        $record['subjectType']=$subjectType;
        $record['permissions']=Rbac::permissionsForRole($roleCode);
        return $record;
    }

    public static function requireRole(string ...$roles): array
    {
        $user=self::user();
        if (!$user) Http::json(['error'=>'يرجى تسجيل الدخول أولًا.'],401);
        $allowed=array_map(static fn(string $role):string=>Rbac::normalizeRole($role),$roles);
        if (!in_array((string)$user['roleCode'],$allowed,true)) Http::json(['error'=>'لا تملكين صلاحية تنفيذ هذا الإجراء.'],403);
        return $user;
    }

    public static function requireRealOwner(): array
    {
        $user=self::realUser();
        $isOwner=$user
            && ($user['roleCode']??'')===Rbac::OWNER
            && ($user['role']??'')==='owner'
            && ($user['subjectType']??'')==='owner'
            && strtolower((string)($_SESSION['role']??''))==='owner';
        if (!$isOwner) Http::json(['error'=>'هذا المسار مخصص لمالك الموقع فقط.'],403);
        return $user;
    }

    public static function requirePermission(string $permission, bool $realActor = true): array
    {
        $user=$realActor?self::realUser():self::user();
        if (!$user) Http::json(['error'=>'يرجى تسجيل الدخول أولًا.'],401);
        if (!Rbac::allows((string)$user['roleCode'],$permission)) Http::json(['error'=>'لا تملكين الصلاحية المطلوبة لتنفيذ هذا الإجراء.'],403);
        return $user;
    }

    public static function attempt(string $role, string $email, string $password, ?string $otp = null): array
    {
        $role=strtolower($role);
        if (!isset(self::ROLE_TABLES[$role])) Http::json(['error'=>'نوع الحساب غير صالح.'],422);
        Rbac::ensureSchema();
        $ip=(string)($_SERVER['REMOTE_ADDR']??'unknown');
        $identityHash=hash('sha256',$role.'|'.$email);
        $pdo=Database::connection();
        $recentStmt=$pdo->prepare('SELECT COUNT(*) FROM auth_login_attempts WHERE identity_hash=? AND ip_address=? AND attempted_at>=DATE_SUB(NOW(),INTERVAL 15 MINUTE)');
        $recentStmt->execute([$identityHash,$ip]);
        if ((int)$recentStmt->fetchColumn()>=8) Http::json(['error'=>'محاولات دخول كثيرة. انتظري 15 دقيقة ثم حاولي مجددًا.'],429);

        $meta=self::ROLE_TABLES[$role];
        $sql="SELECT * FROM {$meta['table']} WHERE email=?";
        $params=[$email];
        if ($meta['table']==='platform_users') {
            $sql.=' AND role_code=? AND deleted_at IS NULL';
            $params[]=$meta['roleCode'];
        } elseif (in_array($meta['table'],['teachers','students'],true)) {
            $sql.=' AND deleted_at IS NULL';
        }
        $sql.=' LIMIT 1';
        $stmt=$pdo->prepare($sql);
        $stmt->execute($params);
        $record=$stmt->fetch();

        if (!$record || empty($record['password_hash']) || !password_verify($password,(string)$record['password_hash'])) {
            if ($role==='student' && function_exists('student_registration_login_message')) {
                $message=student_registration_login_message($email,$password);
                if ($message!==null) Http::json(['error'=>$message],403);
            }
            $pdo->prepare('INSERT INTO auth_login_attempts(identity_hash,ip_address) VALUES(?,?)')->execute([$identityHash,$ip]);
            usleep(350000);
            Http::json(['error'=>'بيانات الدخول أو كلمة المرور غير صحيحة.'],401);
        }
        if (($record['status']??'active')!=='active') {
            $message=($record['status']??'')==='pending'?'الحساب بانتظار موافقة مالكة الموقع.':'هذا الحساب معطّل. يرجى التواصل مع الإدارة.';
            Http::json(['error'=>$message],403);
        }

        if ($role==='owner') {
            $security=$pdo->prepare('SELECT two_factor_enabled,two_factor_secret FROM owner_security WHERE owner_id=? LIMIT 1');
            $security->execute([(int)$record['id']]);
            $twoFactor=$security->fetch() ?: [];
            if (!empty($twoFactor['two_factor_enabled'])) {
                if (!$otp) Http::json(['error'=>'أدخلي رمز المصادقة الثنائية المكوّن من ٦ أرقام.','twoFactorRequired'=>true],401);
                if (!Totp::verify((string)$twoFactor['two_factor_secret'],$otp)) {
                    $pdo->prepare('INSERT INTO auth_login_attempts(identity_hash,ip_address) VALUES(?,?)')->execute([$identityHash,$ip]);
                    Http::json(['error'=>'رمز المصادقة الثنائية غير صحيح.','twoFactorRequired'=>true],401);
                }
            }
        }

        session_regenerate_id(true);
        $_SESSION['role']=$role;
        $_SESSION['user_id']=(int)$record['id'];
        $_SESSION['csrf_token']=bin2hex(random_bytes(32));
        $_SESSION['session_created_at']=time();
        $_SESSION['last_activity_at']=time();
        self::stopPreview(false);
        $pdo->prepare('DELETE FROM auth_login_attempts WHERE identity_hash=? AND ip_address=?')->execute([$identityHash,$ip]);
        if (random_int(1,100)===1) $pdo->exec('DELETE FROM auth_login_attempts WHERE attempted_at<DATE_SUB(NOW(),INTERVAL 1 DAY)');

        $column=$role==='student'?'last_active':'last_login_at';
        $pdo->prepare("UPDATE {$meta['table']} SET {$column}=NOW() WHERE id=?")->execute([(int)$record['id']]);
        $roleCode=Rbac::roleCodeFor($meta['subject'],(int)$record['id'],$meta['roleCode']);
        Activity::log($role,(int)$record['id'],'تسجيل الدخول','تم تسجيل الدخول بنجاح');
        return [
            'id'=>(int)$record['id'],
            'name'=>(string)$record['name'],
            'email'=>(string)$record['email'],
            'role'=>$role,
            'roleCode'=>$roleCode,
            'csrfToken'=>$_SESSION['csrf_token'],
        ];
    }

    public static function verifyCsrf(): void
    {
        if (in_array($_SERVER['REQUEST_METHOD']??'GET',['GET','HEAD','OPTIONS'],true)) return;
        $token=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'');
        $sessionToken=(string)($_SESSION['csrf_token']??'');
        if (!$sessionToken || !$token || !hash_equals($sessionToken,$token)) Http::json(['error'=>'انتهت صلاحية الجلسة. حدّثي الصفحة وحاولي مرة أخرى.'],419);
    }

    public static function isOwnerPreview(): bool
    {
        return !empty($_SESSION['preview_role']) && (int)($_SESSION['preview_owner_id']??0)>0;
    }

    public static function previewContext(): array
    {
        if (!self::isOwnerPreview()) return ['active'=>false];
        $roleCode=Rbac::normalizeRole((string)$_SESSION['preview_role']);
        return [
            'active'=>true,
            'roleCode'=>$roleCode,
            'roleName'=>Rbac::roles()[$roleCode]??$roleCode,
            'subjectType'=>(string)($_SESSION['preview_subject_type']??''),
            'subjectId'=>(int)($_SESSION['preview_subject_id']??0),
            'sessionId'=>(int)($_SESSION['preview_session_id']??0),
        ];
    }

    public static function startPreview(int $ownerId, string $roleCode, string $subjectType, int $subjectId, int $previewSessionId): void
    {
        $_SESSION['preview_owner_id']=$ownerId;
        $_SESSION['preview_role']=Rbac::normalizeRole($roleCode);
        $_SESSION['preview_subject_type']=$subjectType;
        $_SESSION['preview_subject_id']=$subjectId;
        $_SESSION['preview_session_id']=$previewSessionId;
    }

    public static function stopPreview(bool $closeDatabaseSession = true): void
    {
        $sessionId=(int)($_SESSION['preview_session_id']??0);
        if ($closeDatabaseSession && $sessionId>0) {
            try { Database::connection()->prepare('UPDATE role_preview_sessions SET ended_at=COALESCE(ended_at,NOW()) WHERE id=?')->execute([$sessionId]); } catch (Throwable $ignored) {}
        }
        unset($_SESSION['preview_owner_id'],$_SESSION['preview_role'],$_SESSION['preview_subject_type'],$_SESSION['preview_subject_id'],$_SESSION['preview_session_id']);
    }

    public static function logout(): void
    {
        self::stopPreview(true);
        $_SESSION=[];
        if (session_status()===PHP_SESSION_ACTIVE) {
            if (ini_get('session.use_cookies')) {
                $params=session_get_cookie_params();
                setcookie(session_name(),'',time()-42000,$params['path'],$params['domain'],$params['secure'],$params['httponly']);
            }
            session_destroy();
        }
    }

    public static function validatePassword(string $password): void
    {
        if (strlen($password)<10 || !preg_match('/[A-Za-z]/',$password) || !preg_match('/\d/',$password)) Http::json(['error'=>'كلمة المرور يجب أن تكون 10 أحرف على الأقل وتحتوي حرفًا ورقمًا.'],422);
    }
}
