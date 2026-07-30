<?php
declare(strict_types=1);

final class Rbac
{
    public const OWNER = 'OWNER';
    public const ADMIN = 'ADMIN';
    public const TEACHER = 'TEACHER';
    public const STUDENT = 'STUDENT';
    public const PARENT = 'PARENT';

    private const ROLE_ALIASES = [
        'owner' => self::OWNER,
        'admin' => self::ADMIN,
        'staff' => self::ADMIN,
        'teacher' => self::TEACHER,
        'student' => self::STUDENT,
        'parent' => self::PARENT,
        'OWNER' => self::OWNER,
        'ADMIN' => self::ADMIN,
        'TEACHER' => self::TEACHER,
        'STUDENT' => self::STUDENT,
        'PARENT' => self::PARENT,
    ];

    private const ROLE_TO_LEGACY = [
        self::OWNER => 'owner',
        self::ADMIN => 'admin',
        self::TEACHER => 'teacher',
        self::STUDENT => 'student',
        self::PARENT => 'parent',
    ];

    private const PERMISSIONS = [
        'dashboard.view' => ['عرض لوحة التحكم', 'لوحة التحكم'],
        'users.view' => ['عرض المستخدمين', 'المستخدمون'],
        'users.create' => ['إنشاء المستخدمين', 'المستخدمون'],
        'users.update' => ['تعديل المستخدمين', 'المستخدمون'],
        'users.status' => ['تفعيل وتعطيل المستخدمين', 'المستخدمون'],
        'users.reset_password' => ['إعادة تعيين كلمات المرور', 'المستخدمون'],
        'users.soft_delete' => ['الحذف المؤقت للمستخدمين', 'المستخدمون'],
        'users.restore' => ['استعادة المستخدمين', 'المستخدمون'],
        'users.permanent_delete' => ['الحذف النهائي للمستخدمين', 'المستخدمون'],
        'users.change_role' => ['تغيير أدوار المستخدمين', 'الصلاحيات'],
        'permissions.manage' => ['إدارة الصلاحيات', 'الصلاحيات'],
        'preview_roles.use' => ['معاينة صفحات الأدوار', 'الصلاحيات'],
        'teachers.manage' => ['إدارة المعلمين', 'المستخدمون'],
        'students.manage' => ['إدارة الطلاب', 'المستخدمون'],
        'content.manage' => ['إدارة المواد والمراحل والصفوف والدروس والمهارات', 'المحتوى'],
        'question_bank.manage' => ['إدارة بنك الأسئلة', 'المحتوى'],
        'ai_question_bank.manage' => ['إدارة بنك الأسئلة الذكي', 'المحتوى'],
        'tests.view' => ['عرض الاختبارات والنتائج', 'الاختبارات'],
        'tests.manage' => ['إدارة الاختبارات ونماذجها', 'الاختبارات'],
        'attempts.manage' => ['إدارة المحاولات والإجابات', 'الاختبارات'],
        'grades.manage' => ['إدارة الدرجات والنتائج', 'النتائج'],
        'analytics.view' => ['عرض التحليلات والتقارير', 'التقارير'],
        'analytics.manage' => ['إدارة التحليلات والتقارير', 'التقارير'],
        'files.manage' => ['رفع وتنزيل وإدارة الملفات', 'الملفات'],
        'school_settings.manage' => ['إدارة إعدادات المدرسة', 'الإعدادات'],
        'academic_period.manage' => ['إدارة المدة الدراسية', 'الإعدادات'],
        'academic_year.reset' => ['بدء عام دراسي جديد', 'الإعدادات'],
        'backup.download' => ['تنزيل النسخ الاحتياطية', 'الإعدادات'],
        'activity_log.view' => ['عرض سجل العمليات', 'السجل'],
        'owner_security.manage' => ['إدارة حماية حساب المالك', 'الأمان'],
        'ownership.transfer' => ['نقل ملكية الموقع', 'الأمان'],
        'export.use' => ['التصدير', 'التقارير'],
        'print.use' => ['الطباعة وتحميل التقارير', 'التقارير'],
        'student.profile.use' => ['إدارة الملف الشخصي للطالب', 'صلاحيات الطالب'],
        'student.tests.use' => ['دخول الاختبارات وتسليمها', 'صلاحيات الطالب'],
        'student.results.view' => ['عرض نتائج الطالب', 'صلاحيات الطالب'],
        'student.points.view' => ['عرض نقاط التحفيز', 'صلاحيات الطالب'],
        'student.files.use' => ['استخدام ملفات الإنجاز والموارد', 'صلاحيات الطالب'],
        'student.games.use' => ['استخدام الألعاب التعليمية', 'صلاحيات الطالب'],
        'parents.manage' => ['إدارة حسابات أولياء أمور طالباتي', 'المستخدمون'],
        'parent_community.manage' => ['إدارة مجمع مدار لأولياء الأمور', 'المحتوى'],
        'parent.children.view' => ['عرض بيانات الأبناء المرتبطين', 'صلاحيات ولي الأمر'],
        'parent.results.view' => ['عرض اختبارات ودرجات الأبناء', 'صلاحيات ولي الأمر'],
        'parent.points.view' => ['عرض نقاط تحفيز الأبناء', 'صلاحيات ولي الأمر'],
        'parent.analytics.view' => ['عرض تحليل ومهارات الأبناء', 'صلاحيات ولي الأمر'],
        'parent.follow_up.view' => ['عرض الحضور والمتابعة والواجبات للأبناء', 'صلاحيات ولي الأمر'],
        'parent.files.view' => ['عرض ملفات وموارد الأبناء', 'صلاحيات ولي الأمر'],
        'parent.community.view' => ['عرض مجمع مدار لأولياء الأمور', 'صلاحيات ولي الأمر'],
    ];

    private static bool $schemaEnsured = false;
    private static array $permissionCache = [];

    public static function normalizeRole(string $role): string
    {
        return self::ROLE_ALIASES[$role] ?? self::ROLE_ALIASES[strtolower($role)] ?? strtoupper($role);
    }

    public static function legacyRole(string $roleCode): string
    {
        return self::ROLE_TO_LEGACY[self::normalizeRole($roleCode)] ?? strtolower($roleCode);
    }

    public static function roles(): array
    {
        return [
            self::OWNER => 'مالك الموقع',
            self::ADMIN => 'إداري',
            self::TEACHER => 'معلم',
            self::STUDENT => 'طالب',
            self::PARENT => 'ولي أمر',
        ];
    }

    public static function ensureSchema(): void
    {
        if (self::$schemaEnsured) return;
        self::$schemaEnsured = true;
        $pdo = Database::connection();

        $statements = [
            "CREATE TABLE IF NOT EXISTS rbac_roles (code VARCHAR(20) PRIMARY KEY,name_ar VARCHAR(80) NOT NULL,hierarchy_rank SMALLINT UNSIGNED NOT NULL DEFAULT 0,is_system TINYINT(1) NOT NULL DEFAULT 1,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS rbac_permissions (code VARCHAR(100) PRIMARY KEY,name_ar VARCHAR(160) NOT NULL,category VARCHAR(80) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS rbac_role_permissions (role_code VARCHAR(20) NOT NULL,permission_code VARCHAR(100) NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(role_code,permission_code),CONSTRAINT fk_rbac_rp_role FOREIGN KEY(role_code) REFERENCES rbac_roles(code) ON DELETE CASCADE,CONSTRAINT fk_rbac_rp_permission FOREIGN KEY(permission_code) REFERENCES rbac_permissions(code) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS user_role_assignments (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,subject_type ENUM('owner','teacher','student','platform') NOT NULL,subject_id BIGINT UNSIGNED NOT NULL,role_code VARCHAR(20) NOT NULL,assigned_by_owner BIGINT UNSIGNED NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_user_role_subject(subject_type,subject_id),INDEX idx_user_role_code(role_code),CONSTRAINT fk_user_role_role FOREIGN KEY(role_code) REFERENCES rbac_roles(code) ON DELETE RESTRICT,CONSTRAINT fk_user_role_owner FOREIGN KEY(assigned_by_owner) REFERENCES owners(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS platform_users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(140) NOT NULL,email VARCHAR(190) NOT NULL UNIQUE,password_hash VARCHAR(255) NOT NULL,role_code ENUM('ADMIN','PARENT') NOT NULL,status ENUM('active','disabled') NOT NULL DEFAULT 'active',last_login_at DATETIME NULL,deleted_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX idx_platform_role_status(role_code,status),INDEX idx_platform_deleted(deleted_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS owner_security (owner_id BIGINT UNSIGNED PRIMARY KEY,two_factor_secret VARCHAR(128) NULL,two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,two_factor_confirmed_at DATETIME NULL,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,CONSTRAINT fk_owner_security_owner FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS auth_login_attempts (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,identity_hash CHAR(64) NOT NULL,ip_address VARCHAR(45) NOT NULL,attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_login_attempt_window(identity_hash,ip_address,attempted_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            "CREATE TABLE IF NOT EXISTS role_preview_sessions (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,owner_id BIGINT UNSIGNED NOT NULL,preview_role VARCHAR(20) NOT NULL,preview_subject_type VARCHAR(20) NULL,preview_subject_id BIGINT UNSIGNED NULL,started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,ended_at DATETIME NULL,ip_address VARCHAR(45) NULL,user_agent VARCHAR(500) NULL,CONSTRAINT fk_preview_owner FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE,INDEX idx_preview_owner_active(owner_id,ended_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        ];
        foreach ($statements as $sql) {
            try { $pdo->exec($sql); } catch (Throwable $error) { error_log('[rbac-schema] ' . $error->getMessage()); }
        }

        self::addColumnIfMissing('teachers', 'deleted_at', 'DATETIME NULL AFTER status');
        self::addColumnIfMissing('students', 'deleted_at', 'DATETIME NULL AFTER status');
        self::addColumnIfMissing('activity_log', 'user_agent', 'VARCHAR(500) NULL AFTER ip_address');
        self::addColumnIfMissing('activity_log', 'before_data', 'LONGTEXT NULL AFTER details');
        self::addColumnIfMissing('activity_log', 'after_data', 'LONGTEXT NULL AFTER before_data');
        self::addColumnIfMissing('activity_log', 'real_actor_role', 'VARCHAR(20) NULL AFTER actor_id');
        self::addColumnIfMissing('activity_log', 'real_actor_id', 'BIGINT UNSIGNED NULL AFTER real_actor_role');
        self::addColumnIfMissing('activity_log', 'preview_role', 'VARCHAR(20) NULL AFTER real_actor_id');
        try { $pdo->exec("ALTER TABLE activity_log MODIFY actor_role VARCHAR(20) NOT NULL"); } catch (Throwable $ignored) {}

        $roleStmt = $pdo->prepare('INSERT INTO rbac_roles(code,name_ar,hierarchy_rank,is_system) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar),hierarchy_rank=VALUES(hierarchy_rank)');
        $rank = [self::OWNER=>1000,self::ADMIN=>700,self::TEACHER=>500,self::PARENT=>300,self::STUDENT=>100];
        foreach (self::roles() as $code => $name) $roleStmt->execute([$code,$name,$rank[$code]]);

        $permissionStmt = $pdo->prepare('INSERT INTO rbac_permissions(code,name_ar,category) VALUES(?,?,?) ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar),category=VALUES(category)');
        foreach (self::PERMISSIONS as $code => [$name,$category]) $permissionStmt->execute([$code,$name,$category]);

        $allOwner = $pdo->prepare("INSERT IGNORE INTO rbac_role_permissions(role_code,permission_code) VALUES('OWNER',?)");
        foreach (array_keys(self::PERMISSIONS) as $permission) $allOwner->execute([$permission]);

        $defaults = [
            self::ADMIN => ['dashboard.view','users.view','teachers.manage','students.manage','tests.view','analytics.view','files.manage','print.use','export.use'],
            self::TEACHER => ['dashboard.view','students.manage','parents.manage','parent_community.manage','content.manage','question_bank.manage','ai_question_bank.manage','tests.view','tests.manage','attempts.manage','grades.manage','analytics.view','files.manage','school_settings.manage','academic_period.manage','print.use','export.use'],
            self::STUDENT => ['dashboard.view','student.profile.use','student.tests.use','student.results.view','student.points.view','student.files.use','student.games.use'],
            self::PARENT => ['dashboard.view','parent.children.view','parent.results.view','parent.points.view','parent.analytics.view','parent.follow_up.view','parent.files.view','parent.community.view'],
        ];
        $rp = $pdo->prepare('INSERT IGNORE INTO rbac_role_permissions(role_code,permission_code) VALUES(?,?)');
        foreach ($defaults as $role => $permissions) foreach ($permissions as $permission) $rp->execute([$role,$permission]);

        self::syncExistingAssignments();
    }

    private static function addColumnIfMissing(string $table, string $column, string $definition): void
    {
        try {
            $stmt = Database::connection()->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1');
            $stmt->execute([$table,$column]);
            if (!$stmt->fetchColumn()) Database::connection()->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        } catch (Throwable $error) {
            error_log('[rbac-column] ' . $table . '.' . $column . ': ' . $error->getMessage());
        }
    }

    private static function syncExistingAssignments(): void
    {
        $pdo = Database::connection();
        foreach ([['owner','owners',self::OWNER],['teacher','teachers',self::TEACHER],['student','students',self::STUDENT]] as [$type,$table,$role]) {
            try {
                $sql = sprintf('INSERT IGNORE INTO user_role_assignments(subject_type,subject_id,role_code) SELECT ?,id,? FROM `%s`',$table);
                $insert = $pdo->prepare($sql);
                $insert->execute([$type,$role]);
            } catch (Throwable $error) { error_log('[rbac-sync] ' . $error->getMessage()); }
        }
        try {
            $pdo->exec("INSERT IGNORE INTO user_role_assignments(subject_type,subject_id,role_code) SELECT 'platform',id,role_code FROM platform_users");
        } catch (Throwable $ignored) {}
    }

    public static function roleCodeFor(string $subjectType, int $subjectId, ?string $fallback = null): string
    {
        self::ensureSchema();
        try {
            $stmt = Database::connection()->prepare('SELECT role_code FROM user_role_assignments WHERE subject_type=? AND subject_id=? LIMIT 1');
            $stmt->execute([$subjectType,$subjectId]);
            $role = $stmt->fetchColumn();
            if ($role) {
                $normalized=self::normalizeRole((string)$role);
                if (self::roleMatchesSubject($subjectType,$normalized)) return $normalized;
                error_log('[rbac-security] Ignored mismatched role assignment for '.$subjectType.':'.$subjectId);
            }
        } catch (Throwable $ignored) {}
        $safeFallback=self::normalizeRole($fallback ?? $subjectType);
        return self::roleMatchesSubject($subjectType,$safeFallback) ? $safeFallback : self::safeRoleForSubject($subjectType);
    }

    public static function assignRole(string $subjectType, int $subjectId, string $roleCode, ?int $ownerId = null): void
    {
        self::ensureSchema();
        $subjectType=strtolower(trim($subjectType));
        $roleCode = self::normalizeRole($roleCode);
        if (!self::roleMatchesSubject($subjectType,$roleCode)) {
            throw new LogicException('محاولة غير مسموحة لربط دور لا يطابق نوع الحساب.');
        }
        $stmt = Database::connection()->prepare('INSERT INTO user_role_assignments(subject_type,subject_id,role_code,assigned_by_owner) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE role_code=VALUES(role_code),assigned_by_owner=VALUES(assigned_by_owner),updated_at=NOW()');
        $stmt->execute([$subjectType,$subjectId,$roleCode,$ownerId]);
        unset(self::$permissionCache[$roleCode]);
    }

    private static function roleMatchesSubject(string $subjectType, string $roleCode): bool
    {
        return match (strtolower($subjectType)) {
            'owner' => $roleCode===self::OWNER,
            'teacher' => $roleCode===self::TEACHER,
            'student' => $roleCode===self::STUDENT,
            'platform' => in_array($roleCode,[self::ADMIN,self::PARENT],true),
            default => false,
        };
    }

    private static function safeRoleForSubject(string $subjectType): string
    {
        return match (strtolower($subjectType)) {
            'owner' => self::OWNER,
            'teacher' => self::TEACHER,
            'student' => self::STUDENT,
            'platform' => self::ADMIN,
            default => self::STUDENT,
        };
    }

    public static function permissionsForRole(string $roleCode): array
    {
        self::ensureSchema();
        $roleCode = self::normalizeRole($roleCode);
        if (isset(self::$permissionCache[$roleCode])) return self::$permissionCache[$roleCode];
        $stmt = Database::connection()->prepare('SELECT permission_code FROM rbac_role_permissions WHERE role_code=? ORDER BY permission_code');
        $stmt->execute([$roleCode]);
        return self::$permissionCache[$roleCode] = array_map('strval',$stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    public static function allows(string $roleCode, string $permission): bool
    {
        $roleCode = self::normalizeRole($roleCode);
        if ($roleCode === self::OWNER) return true;
        return in_array($permission,self::permissionsForRole($roleCode),true);
    }

    public static function clearPermissionCache(?string $roleCode = null): void
    {
        if ($roleCode === null) { self::$permissionCache = []; return; }
        unset(self::$permissionCache[self::normalizeRole($roleCode)]);
    }

    public static function permissionCatalog(): array
    {
        $out=[];
        foreach (self::PERMISSIONS as $code => [$name,$category]) $out[]=['code'=>$code,'name'=>$name,'category'=>$category];
        return $out;
    }
}
