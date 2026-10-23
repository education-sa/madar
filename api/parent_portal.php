<?php
declare(strict_types=1);

require_once __DIR__ . '/parent_community_media.php';

/**
 * بوابة ولي الأمر وإدارة حساباته من لوحة المعلمة.
 * جميع الاستعلامات مقيدة إما بهوية ولي الأمر أو بفصول المعلمة.
 */

function ensure_parent_portal_schema(): void
{
    static $ready = false;
    if ($ready) return;

    Rbac::ensureSchema();
    $pdo = Database::connection();
    $statements = [
        "CREATE TABLE IF NOT EXISTS parent_student_links (
          parent_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          linked_by_teacher BIGINT UNSIGNED NULL,
          relation_label VARCHAR(60) NOT NULL DEFAULT 'ولي أمر',
          status ENUM('active','disabled') NOT NULL DEFAULT 'active',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (parent_id,student_id),
          INDEX idx_parent_links_student (student_id,status),
          INDEX idx_parent_links_parent (parent_id,status),
          CONSTRAINT fk_parent_link_parent FOREIGN KEY (parent_id) REFERENCES platform_users(id) ON DELETE CASCADE,
          CONSTRAINT fk_parent_link_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_parent_link_teacher FOREIGN KEY (linked_by_teacher) REFERENCES teachers(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS parent_registration_requests (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          parent_user_id BIGINT UNSIGNED NULL,
          name VARCHAR(140) NOT NULL,
          email VARCHAR(190) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          student_emails_json LONGTEXT NOT NULL,
          status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          review_note VARCHAR(500) NULL,
          reviewed_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_parent_request_teacher_status (teacher_id,status,created_at),
          INDEX idx_parent_request_email_status (email,status),
          CONSTRAINT fk_parent_request_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_parent_request_user FOREIGN KEY (parent_user_id) REFERENCES platform_users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS parent_community_posts (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          class_id BIGINT UNSIGNED NULL,
          title VARCHAR(190) NOT NULL,
          body TEXT NOT NULL,
          status ENUM('published','archived') NOT NULL DEFAULT 'published',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_parent_community_teacher_date (teacher_id,status,created_at),
          INDEX idx_parent_community_class_date (class_id,status,created_at),
          CONSTRAINT fk_parent_community_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_parent_community_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];

    foreach ($statements as $sql) {
        try {
            $pdo->exec($sql);
        } catch (Throwable $error) {
            error_log('[parent-portal-schema] ' . $error->getMessage());
            throw $error;
        }
    }
    $ready = true;
}

function parent_portal_decode_list(mixed $value): array
{
    if (is_array($value)) return array_values($value);
    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? array_values($decoded) : [];
}


function parent_portal_name_from_input(array $data): array
{
    $firstName = trim((string)($data['firstName'] ?? ''));
    $lastName = trim((string)($data['lastName'] ?? ''));
    if (($firstName === '' || $lastName === '') && !empty($data['name'])) {
        $parts = preg_split('/\s+/u', trim((string)$data['name'])) ?: [];
        $firstName = $firstName !== '' ? $firstName : (string)($parts[0] ?? '');
        $lastName = $lastName !== '' ? $lastName : (string)($parts[count($parts)-1] ?? '');
    }
    if ($firstName === '' || $lastName === '') {
        Http::json(['error'=>'اكتبي الاسم الأول والاسم الأخير لولي الأمر.'],422);
    }
    if (mb_strlen($firstName) > 60 || mb_strlen($lastName) > 60) {
        Http::json(['error'=>'الاسم الأول أو الاسم الأخير طويل جدًا.'],422);
    }
    $name = trim($firstName . ' ' . $lastName);
    if (mb_strlen($name) < 3 || mb_strlen($name) > 140) {
        Http::json(['error'=>'اكتبي اسم ولي الأمر بصورة صحيحة.'],422);
    }
    return [$firstName,$lastName,$name];
}

function parent_portal_internal_email(string $prefix='parent'): string
{
    return $prefix . '-' . bin2hex(random_bytes(18)) . '@internal.madar';
}

function parent_portal_email_exists_anywhere(string $email): bool
{
    foreach (['owners','teachers','students','platform_users'] as $table) {
        if (fetch_one("SELECT id FROM {$table} WHERE email=? LIMIT 1", [$email])) return true;
    }
    return false;
}

function parent_public_register(): never
{
    Http::rateLimit('parent-register',5,3600);
    ensure_parent_portal_schema();
    $data = Http::input();
    Http::requireFields($data, ['password']);
    [,,$name] = parent_portal_name_from_input($data);

    $password = (string)$data['password'];
    Auth::validatePassword($password);
    if (($data['confirmPassword'] ?? $password) !== $password) {
        Http::json(['error'=>'كلمتا المرور غير متطابقتين.'],422);
    }

    $rawEmails = $data['daughterEmails'] ?? [];
    if (!is_array($rawEmails) || !$rawEmails) {
        Http::json(['error'=>'أضيفي إيميل طالبة واحدة على الأقل لربط الحساب بها.'],422);
    }
    $daughterEmails = [];
    foreach ($rawEmails as $rawEmail) {
        $daughterEmails[] = Http::schoolEmail((string)$rawEmail);
    }
    $daughterEmails = array_values(array_unique($daughterEmails));
    if (count($daughterEmails) > 20) {
        Http::json(['error'=>'يمكن إضافة 20 طالبة كحد أقصى في الطلب الواحد.'],422);
    }

    $grouped = [];
    foreach ($daughterEmails as $daughterEmail) {
        $student = fetch_one(
            "SELECT s.id,s.email,c.teacher_id
             FROM students s JOIN classes c ON c.id=s.class_id
             WHERE s.email=? AND s.status='active' AND s.deleted_at IS NULL LIMIT 1",
            [$daughterEmail]
        );
        if (!$student) continue;
        $teacherId = (int)$student['teacher_id'];
        $grouped[$teacherId][] = (string)$student['email'];
    }
    $genericMessage='تم استلام الطلب. إذا طابقت البيانات حسابات طالبات معتمدة فسيظهر الطلب للمعلمة للمراجعة.';
    if (!$grouped){usleep(150000);Http::json(['ok'=>true,'message'=>$genericMessage],201);}

    // معرّف داخلي مخفي يحافظ على بنية قاعدة البيانات، ولا يُطلب من ولي الأمر ولا يظهر له.
    $internalEmail = parent_portal_internal_email('parent-request');
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $created = 0;
    Database::transaction(function(PDO $pdo) use ($grouped,$name,$internalEmail,$hash,&$created): void {
        foreach ($grouped as $teacherId => $emails) {
            $json = json_encode(array_values(array_unique($emails)), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
            $pdo->prepare('INSERT INTO parent_registration_requests(teacher_id,name,email,password_hash,student_emails_json) VALUES(?,?,?,?,?)')
                ->execute([(int)$teacherId,$name,$internalEmail,$hash,$json]);
            $created++;
        }
    });

    Activity::log('system', null, 'طلب حساب ولي أمر', 'طلب جديد بالاسم: ' . $name);
    Http::json([
        'ok'=>true,
        'message'=>$genericMessage,
    ],201);
}

function teacher_parent_owned_students(int $teacherId): array
{
    return fetch_all(
        "SELECT s.id,s.name,s.email,s.stage,s.grade_label,c.id AS class_id,c.name AS class_name
         FROM students s JOIN classes c ON c.id=s.class_id
         WHERE c.teacher_id=? AND s.deleted_at IS NULL
         ORDER BY c.name,s.name",
        [$teacherId]
    );
}

function teacher_parent_access(int $teacherId, int $parentId): array
{
    ensure_parent_portal_schema();
    $own = (int)(fetch_one(
        "SELECT COUNT(*) AS n
         FROM parent_student_links l
         JOIN students s ON s.id=l.student_id
         LEFT JOIN classes c ON c.id=s.class_id
         WHERE l.parent_id=? AND l.status='active'
           AND (l.linked_by_teacher=? OR (l.linked_by_teacher IS NULL AND c.teacher_id=?))",
        [$parentId,$teacherId,$teacherId]
    )['n'] ?? 0);
    $total = (int)(fetch_one(
        "SELECT COUNT(*) AS n FROM parent_student_links WHERE parent_id=? AND status='active'",
        [$parentId]
    )['n'] ?? 0);
    return ['own'=>$own,'total'=>$total,'exclusive'=>$own>0 && $own===$total];
}

function teacher_parent_json(int $teacherId, array $row): array
{
    $parentId = (int)$row['id'];
    $children = fetch_all(
        "SELECT s.id,s.name,s.email,s.stage,s.grade_label,c.name AS class_name,s.deleted_at
         FROM parent_student_links l
         JOIN students s ON s.id=l.student_id
         LEFT JOIN classes c ON c.id=s.class_id
         WHERE l.parent_id=? AND l.status='active'
           AND (l.linked_by_teacher=? OR (l.linked_by_teacher IS NULL AND c.teacher_id=?))
         ORDER BY c.name,s.name",
        [$parentId,$teacherId,$teacherId]
    );
    $access = teacher_parent_access($teacherId,$parentId);
    return [
        'id'=>$parentId,
        'name'=>(string)$row['name'],
        'status'=>(string)$row['status'],
        'createdAt'=>$row['created_at'] ?? null,
        'children'=>array_map(static fn(array $child):array=>[
            'id'=>(int)$child['id'],
            'name'=>(string)$child['name'],
            'email'=>(string)$child['email'],
            'stage'=>(string)$child['stage'],
            'gradeLabel'=>(string)($child['grade_label']??''),
            'className'=>(string)($child['class_name']??''),
            'deleted'=>$child['deleted_at'] !== null,
        ],$children),
        'sharedWithOtherTeachers'=>!$access['exclusive'],
    ];
}

function teacher_parent_accounts_payload(int $teacherId): array
{
    ensure_parent_portal_schema();
    $parents = fetch_all(
        "SELECT DISTINCT p.id,p.name,p.email,p.status,p.created_at
         FROM platform_users p
         JOIN parent_student_links l ON l.parent_id=p.id AND l.status='active'
         JOIN students s ON s.id=l.student_id
         LEFT JOIN classes c ON c.id=s.class_id
         WHERE p.role_code='PARENT' AND p.deleted_at IS NULL
           AND (l.linked_by_teacher=? OR (l.linked_by_teacher IS NULL AND c.teacher_id=?))
         ORDER BY p.name",
        [$teacherId,$teacherId]
    );
    $requests = fetch_all(
        "SELECT id,name,email,student_emails_json,status,review_note,created_at,updated_at
         FROM parent_registration_requests
         WHERE teacher_id=? ORDER BY FIELD(status,'pending','approved','rejected'),created_at DESC LIMIT 300",
        [$teacherId]
    );
    $requestRows = array_map(static function(array $row):array {
        return [
            'id'=>(int)$row['id'],
            'name'=>(string)$row['name'],
                'studentEmails'=>parent_portal_decode_list($row['student_emails_json']),
            'status'=>(string)$row['status'],
            'reviewNote'=>$row['review_note'] ?? '',
            'createdAt'=>$row['created_at'],
        ];
    },$requests);
    return [
        'students'=>array_map(static fn(array $student):array=>[
            'id'=>(int)$student['id'],
            'name'=>(string)$student['name'],
            'email'=>(string)$student['email'],
            'stage'=>(string)$student['stage'],
            'gradeLabel'=>(string)($student['grade_label']??''),
            'classId'=>(int)$student['class_id'],
            'className'=>(string)$student['class_name'],
        ],teacher_parent_owned_students($teacherId)),
        'parents'=>array_map(static fn(array $row):array=>teacher_parent_json($teacherId,$row),$parents),
        'requests'=>$requestRows,
    ];
}

function teacher_parent_create(int $teacherId): never
{
    ensure_parent_portal_schema();
    $data = Http::input();
    Http::requireFields($data,['password']);
    [$firstName,$lastName,$name] = parent_portal_name_from_input($data);
    $password = (string)$data['password'];
    Auth::validatePassword($password);
    $studentIds = array_values(array_unique(array_filter(array_map('intval',(array)($data['studentIds']??[])),static fn(int $id):bool=>$id>0)));
    if (!$studentIds) Http::json(['error'=>'اختاري طالبة واحدة على الأقل لربطها بولي الأمر.'],422);
    foreach ($studentIds as $studentId) {
        if (!teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'إحدى الطالبات لا تتبع فصولك.'],403);
    }

    $internalEmail = parent_portal_internal_email('parent');
    $result = Database::transaction(function(PDO $pdo) use ($teacherId,$name,$internalEmail,$password,$studentIds):array {
        $pdo->prepare("INSERT INTO platform_users(name,email,password_hash,role_code,status) VALUES(?,?,?,'PARENT','active')")
            ->execute([$name,$internalEmail,password_hash($password,PASSWORD_DEFAULT)]);
        $parentId = (int)$pdo->lastInsertId();
        Rbac::assignRole('platform',$parentId,Rbac::PARENT,null);
        $link = $pdo->prepare("INSERT INTO parent_student_links(parent_id,student_id,linked_by_teacher,status) VALUES(?,?,?,'active') ON DUPLICATE KEY UPDATE status='active',linked_by_teacher=VALUES(linked_by_teacher),updated_at=NOW()");
        foreach ($studentIds as $studentId) $link->execute([$parentId,$studentId,$teacherId]);
        return ['parentId'=>$parentId,'created'=>true,'linked'=>count($studentIds)];
    });

    Activity::logDetailed('teacher',$teacherId,'إنشاء حساب ولي أمر','parent:'.$result['parentId'],null,['name'=>$name,'studentIds'=>$studentIds]);
    Http::json(['ok'=>true]+$result,201);
}

function teacher_parent_approve_request(int $teacherId, int $requestId): never
{
    ensure_parent_portal_schema();
    try {
        $result = Database::transaction(function(PDO $pdo) use ($teacherId,$requestId):array {
            $stmt = $pdo->prepare("SELECT * FROM parent_registration_requests WHERE id=? AND teacher_id=? LIMIT 1 FOR UPDATE");
            $stmt->execute([$requestId,$teacherId]);
            $request = $stmt->fetch();
            if (!$request) throw new DomainException('not_found');
            if ((string)$request['status'] !== 'pending') throw new DomainException('reviewed');

            $emails = parent_portal_decode_list($request['student_emails_json']);
            $students = [];
            foreach ($emails as $email) {
                $student = fetch_one(
                    'SELECT s.id FROM students s JOIN classes c ON c.id=s.class_id WHERE s.email=? AND c.teacher_id=? AND s.deleted_at IS NULL LIMIT 1',
                    [(string)$email,$teacherId]
                );
                if ($student) $students[] = (int)$student['id'];
            }
            $students = array_values(array_unique($students));
            if (!$students) throw new DomainException('no_students');

            $parent = fetch_one("SELECT id,role_code FROM platform_users WHERE email=? AND deleted_at IS NULL LIMIT 1",[(string)$request['email']]);
            if ($parent) {
                if ((string)$parent['role_code'] !== Rbac::PARENT) throw new DomainException('account_conflict');
                $parentId = (int)$parent['id'];
            } else {
                $pdo->prepare("INSERT INTO platform_users(name,email,password_hash,role_code,status) VALUES(?,?,?,'PARENT','active')")
                    ->execute([(string)$request['name'],(string)$request['email'],(string)$request['password_hash']]);
                $parentId = (int)$pdo->lastInsertId();
                Rbac::assignRole('platform',$parentId,Rbac::PARENT,null);
            }
            $link = $pdo->prepare("INSERT INTO parent_student_links(parent_id,student_id,linked_by_teacher,status) VALUES(?,?,?,'active') ON DUPLICATE KEY UPDATE status='active',linked_by_teacher=VALUES(linked_by_teacher),updated_at=NOW()");
            foreach ($students as $studentId) $link->execute([$parentId,$studentId,$teacherId]);
            $pdo->prepare("UPDATE parent_registration_requests SET parent_user_id=?,status='approved',password_hash='',review_note=NULL,reviewed_at=NOW() WHERE id=?")
                ->execute([$parentId,$requestId]);
            return ['parentId'=>$parentId,'linked'=>count($students)];
        });
    } catch (DomainException $error) {
        $messages = [
            'not_found'=>'طلب إنشاء الحساب غير موجود.',
            'reviewed'=>'تمت مراجعة هذا الطلب مسبقًا.',
            'no_students'=>'لم تعد الطالبات المطلوبات ضمن فصولك.',
            'account_conflict'=>'تعذّر اعتماد الحساب بسبب تعارض داخلي. تواصلي مع مالكة الموقع.',
        ];
        Http::json(['error'=>$messages[$error->getMessage()]??'تعذّر اعتماد الطلب.'],409);
    }
    Activity::log('teacher',$teacherId,'اعتماد طلب ولي أمر','parent:'.$result['parentId']);
    Http::json(['ok'=>true]+$result);
}

function teacher_parent_reject_request(int $teacherId, int $requestId): never
{
    ensure_parent_portal_schema();
    $data = Http::input();
    $note = trim((string)($data['note']??''));
    if (mb_strlen($note)>500) Http::json(['error'=>'سبب الرفض طويل جدًا.'],422);
    $changed = execute_sql(
        "UPDATE parent_registration_requests SET status='rejected',password_hash='',review_note=?,reviewed_at=NOW() WHERE id=? AND teacher_id=? AND status='pending'",
        [$note!==''?$note:null,$requestId,$teacherId]
    );
    if ($changed->rowCount()<1) Http::json(['error'=>'الطلب غير موجود أو تمت مراجعته مسبقًا.'],409);
    Activity::log('teacher',$teacherId,'رفض طلب ولي أمر','request:'.$requestId);
    Http::json(['ok'=>true]);
}

function teacher_parent_update(int $teacherId, int $parentId): never
{
    $access = teacher_parent_access($teacherId,$parentId);
    if ($access['own']<1) Http::json(['error'=>'حساب ولي الأمر غير مرتبط بطالباتك.'],404);
    if (!$access['exclusive']) Http::json(['error'=>'الحساب مرتبط بطالبات لدى معلمات أخريات؛ تعديله متاح لمالكة الموقع فقط.'],403);
    $data = Http::input();
    $row = fetch_one("SELECT name,status FROM platform_users WHERE id=? AND role_code='PARENT' AND deleted_at IS NULL",[$parentId]);
    if (!$row) Http::json(['error'=>'حساب ولي الأمر غير موجود.'],404);
    $name = trim((string)($data['name']??$row['name']));
    if ($name==='') Http::json(['error'=>'اسم ولي الأمر مطلوب.'],422);
    $status = (string)($data['status']??$row['status']);
    if (!in_array($status,['active','disabled'],true)) Http::json(['error'=>'حالة الحساب غير صالحة.'],422);
    execute_sql('UPDATE platform_users SET name=?,status=? WHERE id=? AND role_code=\'PARENT\'',[$name,$status,$parentId]);
    Activity::logDetailed('teacher',$teacherId,'تعديل حساب ولي أمر','parent:'.$parentId,$row,['name'=>$name,'status'=>$status]);
    Http::json(['ok'=>true]);
}

function teacher_parent_reset_password(int $teacherId, int $parentId): never
{
    $access = teacher_parent_access($teacherId,$parentId);
    if ($access['own']<1) Http::json(['error'=>'حساب ولي الأمر غير مرتبط بطالباتك.'],404);
    if (!$access['exclusive']) Http::json(['error'=>'الحساب مشترك مع معلمات أخريات؛ إعادة كلمة المرور متاحة لمالكة الموقع فقط.'],403);
    $data = Http::input();
    Http::requireFields($data,['newPassword']);
    Auth::validatePassword((string)$data['newPassword']);
    execute_sql("UPDATE platform_users SET password_hash=? WHERE id=? AND role_code='PARENT'",[password_hash((string)$data['newPassword'],PASSWORD_DEFAULT),$parentId]);
    Activity::log('teacher',$teacherId,'إعادة تعيين كلمة مرور ولي أمر','parent:'.$parentId);
    Http::json(['ok'=>true]);
}

function teacher_parent_add_link(int $teacherId, int $parentId): never
{
    $data = Http::input();
    $studentId = (int)($data['studentId']??0);
    if (!$studentId || !teacher_owns_student($teacherId,$studentId)) Http::json(['error'=>'الطالبة لا تتبع فصولك.'],403);
    $parent = fetch_one("SELECT id FROM platform_users WHERE id=? AND role_code='PARENT' AND deleted_at IS NULL",[$parentId]);
    if (!$parent) Http::json(['error'=>'حساب ولي الأمر غير موجود.'],404);
    execute_sql("INSERT INTO parent_student_links(parent_id,student_id,linked_by_teacher,status) VALUES(?,?,?,'active') ON DUPLICATE KEY UPDATE status='active',linked_by_teacher=VALUES(linked_by_teacher),updated_at=NOW()",[$parentId,$studentId,$teacherId]);
    Activity::log('teacher',$teacherId,'ربط طالبة بولي أمر',"parent:{$parentId};student:{$studentId}");
    Http::json(['ok'=>true]);
}

function teacher_parent_remove_link(int $teacherId, int $parentId, int $studentId): never
{
    $changed = execute_sql(
        "DELETE l FROM parent_student_links l
         JOIN students s ON s.id=l.student_id
         LEFT JOIN classes c ON c.id=s.class_id
         WHERE l.parent_id=? AND l.student_id=?
           AND (l.linked_by_teacher=? OR (l.linked_by_teacher IS NULL AND c.teacher_id=?))",
        [$parentId,$studentId,$teacherId,$teacherId]
    );
    if ($changed->rowCount()<1) Http::json(['error'=>'الربط غير موجود.'],404);
    Activity::log('teacher',$teacherId,'إلغاء ربط طالبة بولي أمر',"parent:{$parentId};student:{$studentId}");
    Http::json(['ok'=>true]);
}

function teacher_parent_delete(int $teacherId, int $parentId): never
{
    $access = teacher_parent_access($teacherId,$parentId);
    if ($access['own']<1) Http::json(['error'=>'حساب ولي الأمر غير مرتبط بروابط أنشأتها المعلمة.'],404);
    if (!$access['exclusive']) Http::json(['error'=>'الحساب مشترك مع معلمة أخرى؛ حذفه متاح لمالكة الموقع فقط.'],403);
    $parent = fetch_one(
        "SELECT id,name,status FROM platform_users WHERE id=? AND role_code='PARENT' AND deleted_at IS NULL",
        [$parentId]
    );
    if (!$parent) Http::json(['error'=>'حساب ولي الأمر غير موجود.'],404);
    execute_sql(
        "UPDATE platform_users SET status='disabled',deleted_at=NOW() WHERE id=? AND role_code='PARENT' AND deleted_at IS NULL",
        [$parentId]
    );
    Activity::logDetailed('teacher',$teacherId,'حذف حساب ولي أمر مؤقتًا','parent:'.$parentId,$parent,null);
    Http::json(['ok'=>true,'softDeleted'=>true]);
}

function teacher_parent_routes(string $method, array $segments, int $teacherId): never
{
    ensure_parent_portal_schema();
    if (!$segments && $method==='GET') Http::json(teacher_parent_accounts_payload($teacherId));
    if (!$segments && $method==='POST') teacher_parent_create($teacherId);
    if (($segments[0]??'')==='requests' && isset($segments[1])) {
        $requestId = route_id($segments,1);
        if (($segments[2]??'')==='approve' && $method==='POST') teacher_parent_approve_request($teacherId,$requestId);
        if (($segments[2]??'')==='reject' && $method==='POST') teacher_parent_reject_request($teacherId,$requestId);
    }
    if (isset($segments[0])) {
        $parentId = route_id($segments,0);
        if (count($segments)===1 && $method==='PUT') teacher_parent_update($teacherId,$parentId);
        if (count($segments)===1 && $method==='DELETE') teacher_parent_delete($teacherId,$parentId);
        if (($segments[1]??'')==='reset-password' && $method==='PUT') teacher_parent_reset_password($teacherId,$parentId);
        if (($segments[1]??'')==='links' && count($segments)===2 && $method==='POST') teacher_parent_add_link($teacherId,$parentId);
        if (($segments[1]??'')==='links' && isset($segments[2]) && $method==='DELETE') teacher_parent_remove_link($teacherId,$parentId,route_id($segments,2));
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function teacher_parent_community_routes(string $method, array $segments, int $teacherId): never
{
    ensure_parent_portal_schema();
    if (($segments[0] ?? '') === 'media') {
        teacher_parent_community_media_routes($method,array_slice($segments,1),$teacherId);
    }
    if (!$segments && $method==='GET') {
        $classes = fetch_all('SELECT id,name,stage,grade_label FROM classes WHERE teacher_id=? ORDER BY name',[$teacherId]);
        $posts = fetch_all(
            "SELECT p.id,p.class_id,p.title,p.body,p.status,p.created_at,c.name AS class_name
             FROM parent_community_posts p LEFT JOIN classes c ON c.id=p.class_id
             WHERE p.teacher_id=? AND p.status='published' ORDER BY p.created_at DESC LIMIT 300",
            [$teacherId]
        );
        Http::json(['classes'=>$classes,'posts'=>array_map(static fn(array $row):array=>[
            'id'=>(int)$row['id'],
            'classId'=>$row['class_id']===null?null:(int)$row['class_id'],
            'className'=>$row['class_name']??'جميع الفصول',
            'title'=>(string)$row['title'],
            'body'=>(string)$row['body'],
            'createdAt'=>$row['created_at'],
        ],$posts)]);
    }
    if (!$segments && $method==='POST') {
        $data = Http::input();
        Http::requireFields($data,['title','body']);
        $title = trim((string)$data['title']);
        $body = trim((string)$data['body']);
        $classId = (int)($data['classId']??0);
        if (mb_strlen($title)>190 || mb_strlen($body)>5000) Http::json(['error'=>'عنوان أو نص الإعلان أطول من المسموح.'],422);
        if ($classId>0 && !teacher_owns_class($teacherId,$classId)) Http::json(['error'=>'الفصل لا يتبع حسابك.'],403);
        execute_sql('INSERT INTO parent_community_posts(teacher_id,class_id,title,body) VALUES(?,?,?,?)',[$teacherId,$classId?:null,$title,$body]);
        $id = (int)Database::connection()->lastInsertId();
        Activity::log('teacher',$teacherId,'نشر إعلان في مجمع مدار','post:'.$id);
        Http::json(['ok'=>true,'id'=>$id],201);
    }
    if (isset($segments[0]) && $method==='DELETE') {
        $id = route_id($segments,0);
        $changed = execute_sql("UPDATE parent_community_posts SET status='archived' WHERE id=? AND teacher_id=?",[$id,$teacherId]);
        if ($changed->rowCount()<1) Http::json(['error'=>'الإعلان غير موجود.'],404);
        Activity::log('teacher',$teacherId,'حذف إعلان من مجمع مدار','post:'.$id);
        Http::json(['ok'=>true]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function parent_portal_linked_student(int $parentId, int $studentId): ?array
{
    ensure_parent_portal_schema();
    return fetch_one(
        "SELECT s.id,s.name,s.email,s.stage,s.grade_label,s.learning_style,s.progress_percent,s.class_id,
                c.name AS class_name,c.academic_year,c.teacher_id,t.name AS teacher_name,t.email AS teacher_email
         FROM parent_student_links l
         JOIN students s ON s.id=l.student_id
         LEFT JOIN classes c ON c.id=s.class_id
         LEFT JOIN teachers t ON t.id=c.teacher_id
         WHERE l.parent_id=? AND l.student_id=? AND l.status='active' AND s.deleted_at IS NULL LIMIT 1",
        [$parentId,$studentId]
    ) ?: null;
}

function parent_portal_children(int $parentId): array
{
    ensure_parent_portal_schema();
    ensure_teacher_tools_schema();
    $rows = fetch_all(
        "SELECT s.id,s.name,s.email,s.stage,s.grade_label,s.learning_style,s.progress_percent,
                c.name AS class_name,c.academic_year,c.teacher_id,t.name AS teacher_name,
                COALESCE((SELECT SUM(mp.points) FROM motivational_points mp WHERE mp.student_id=s.id),0) AS total_points,
                COALESCE((SELECT ROUND(AVG(ta.percentage),1) FROM test_attempts ta JOIN tests visible_test ON visible_test.id=ta.test_id WHERE ta.student_id=s.id AND ta.status IN ('submitted','graded') AND visible_test.show_result=1),0) AS test_average
         FROM parent_student_links l
         JOIN students s ON s.id=l.student_id
         LEFT JOIN classes c ON c.id=s.class_id
         LEFT JOIN teachers t ON t.id=c.teacher_id
         WHERE l.parent_id=? AND l.status='active' AND s.deleted_at IS NULL
         ORDER BY s.name",
        [$parentId]
    );
    return array_map(static fn(array $row):array=>[
        'id'=>(int)$row['id'],
        'name'=>(string)$row['name'],
        'stage'=>(string)$row['stage'],
        'gradeLabel'=>(string)($row['grade_label']??''),
        'className'=>(string)($row['class_name']??''),
        'academicYear'=>(string)($row['academic_year']??''),
        'teacherName'=>(string)($row['teacher_name']??''),
        'learningStyle'=>(string)($row['learning_style']??'unknown'),
        'progressPercent'=>(float)($row['progress_percent']??0),
        'totalPoints'=>(int)($row['total_points']??0),
        'testAverage'=>(float)($row['test_average']??0),
    ],$rows);
}

function parent_portal_summary(int $parentId): never
{
    Auth::requirePermission('parent.children.view',false);
    $children = parent_portal_children($parentId);
    Http::json([
        'linkedStudents'=>$children,
        'childCount'=>count($children),
        'totalPoints'=>array_sum(array_column($children,'totalPoints')),
        'averageProgress'=>$children ? round(array_sum(array_column($children,'progressPercent'))/count($children),1) : 0,
        'averageTests'=>$children ? round(array_sum(array_column($children,'testAverage'))/count($children),1) : 0,
        'roleCode'=>Rbac::PARENT,
        'preview'=>Auth::previewContext(),
    ]);
}

function parent_portal_overview(int $parentId, int $studentId): never
{
    Auth::requirePermission('parent.children.view',false);
    ensure_teacher_tools_schema();
    ensure_weekly_follow_up_schema();
    ensure_student_portfolio_schema();
    $student = parent_portal_linked_student($parentId,$studentId);
    if (!$student) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    $testStats = fetch_one(
        "SELECT COUNT(*) AS attempts,COALESCE(ROUND(AVG(a.percentage),1),0) AS average,COALESCE(MAX(a.percentage),0) AS best
         FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE a.student_id=? AND a.status IN ('submitted','graded') AND t.show_result=1",
        [$studentId]
    ) ?: [];
    $attendance = fetch_one(
        "SELECT COUNT(*) AS total,
                SUM(status='present') AS present_count,
                SUM(status='absent') AS absent_count,
                SUM(status='late') AS late_count,
                SUM(status='excused') AS excused_count
         FROM attendance WHERE student_id=?",
        [$studentId]
    ) ?: [];
    $weeklyAttendance = fetch_one(
        "SELECT COUNT(*) AS total,
                SUM(status='present') AS present_count,
                SUM(status='absent') AS absent_count,
                SUM(status='late') AS late_count,
                SUM(status='excused') AS excused_count
         FROM weekly_attendance WHERE student_id=?",
        [$studentId]
    ) ?: [];
    $points = (int)(fetch_one('SELECT COALESCE(SUM(points),0) AS total FROM motivational_points WHERE student_id=?',[$studentId])['total']??0);
    $portfolio = (int)(fetch_one('SELECT COUNT(*) AS n FROM student_portfolio_files WHERE student_id=?',[$studentId])['n']??0);
    $assignments = fetch_one("SELECT COUNT(*) AS total,SUM(status='completed') AS completed,SUM(status='pending') AS pending,SUM(status='late') AS late_count FROM assignments WHERE student_id=?",[$studentId]) ?: [];
    $latestStyle = fetch_one('SELECT visual_score,auditory_score,reading_writing_score,kinesthetic_score,result_style,completed_at FROM learning_style_assessments WHERE student_id=? ORDER BY completed_at DESC,id DESC LIMIT 1',[$studentId]);

    $attendanceTotal = (int)($attendance['total']??0)+(int)($weeklyAttendance['total']??0);
    $present = (int)($attendance['present_count']??0)+(int)($weeklyAttendance['present_count']??0);
    Http::json([
        'student'=>[
            'id'=>(int)$student['id'],'name'=>$student['name'],'email'=>$student['email'],'stage'=>$student['stage'],
            'gradeLabel'=>$student['grade_label']??'','className'=>$student['class_name']??'','academicYear'=>$student['academic_year']??'',
            'teacherName'=>$student['teacher_name']??'','teacherEmail'=>$student['teacher_email']??'',
            'learningStyle'=>$student['learning_style']??'unknown','progressPercent'=>(float)($testStats['average']??0),
        ],
        'cards'=>[
            'points'=>$points,
            'testAverage'=>(float)($testStats['average']??0),
            'bestTest'=>(float)($testStats['best']??0),
            'testAttempts'=>(int)($testStats['attempts']??0),
            'attendanceRate'=>$attendanceTotal>0?round($present*100/$attendanceTotal,1):0,
            'portfolioFiles'=>$portfolio,
            'assignmentsTotal'=>(int)($assignments['total']??0),
            'assignmentsCompleted'=>(int)($assignments['completed']??0),
        ],
        'learningAssessment'=>$latestStyle ?: null,
    ]);
}

function parent_portal_tests(int $parentId, int $studentId): never
{
    Auth::requirePermission('parent.results.view',false);
    $student = parent_portal_linked_student($parentId,$studentId);
    if (!$student) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    $attempts = fetch_all(
        "SELECT a.id,a.attempt_no,a.status,a.score,a.total_points,a.percentage,a.started_at,a.submitted_at,a.graded_at,
                t.id AS test_id,t.title,t.test_type,t.show_result,t.academic_year,t.semester,te.name AS teacher_name
         FROM test_attempts a
         JOIN tests t ON t.id=a.test_id
         LEFT JOIN teachers te ON te.id=t.teacher_id
         WHERE a.student_id=? AND t.show_result=1 ORDER BY COALESCE(a.submitted_at,a.started_at) DESC,a.id DESC",
        [$studentId]
    );
    $available = fetch_all(
        "SELECT t.id,t.title,t.test_type,t.status,t.total_points,t.start_at,t.end_at,t.academic_year,t.semester,
                CASE WHEN t.show_result=1 THEN (SELECT MAX(a.percentage) FROM test_attempts a WHERE a.test_id=t.id AND a.student_id=?) ELSE NULL END AS best_percentage
         FROM tests t
         WHERE (t.class_id=? OR (t.class_id IS NULL AND t.teacher_id=?))
           AND t.status IN ('published','closed') ORDER BY t.created_at DESC",
        [$studentId,(int)$student['class_id'],(int)$student['teacher_id']]
    );
    Http::json(['attempts'=>$attempts,'availableTests'=>$available]);
}

function parent_portal_gradebook_empty_periods(): array
{
    $settings = [
        1 => teacher_follow_up_defaults(1),
        2 => teacher_follow_up_defaults(2),
        3 => teacher_follow_up_defaults(3),
    ];
    return parent_portal_gradebook_periods([], $settings);
}

function parent_portal_gradebook_periods(array $records, array $settings): array
{
    $score = static function (?array $record, string $field): ?float {
        if (!$record || !array_key_exists($field, $record) || $record[$field] === null || $record[$field] === '') return null;
        return (float)$record[$field];
    };
    $maximum = static fn(array $row, string $field): float => (float)($row[$field] ?? 0);
    $periods = [];

    foreach ([1 => 'الفترة الأولى', 2 => 'الفترة الثانية'] as $periodNo => $label) {
        $record = $records[$periodNo] ?? null;
        $hasRecord = $record !== null;
        $periodSettings = $settings[$periodNo];
        $scores = [
            ['key'=>'periodicTest','label'=>'الاختبار الفتري','value'=>$hasRecord ? $score($record,'periodic_test_score') : null,'maximum'=>$maximum($periodSettings,'periodic_test_max')],
            ['key'=>'participation','label'=>'المشاركة','value'=>$hasRecord ? $score($record,'participation_score') : null,'maximum'=>$maximum($periodSettings,'participation_max')],
            ['key'=>'homework','label'=>'الواجبات','value'=>$hasRecord ? $score($record,'homework_score') : null,'maximum'=>$maximum($periodSettings,'homework_max')],
            ['key'=>'tasks','label'=>'المهام','value'=>$hasRecord ? $score($record,'tasks_score') : null,'maximum'=>$maximum($periodSettings,'tasks_max')],
        ];
        $periods[] = [
            'period'=>$periodNo,
            'label'=>$label,
            'hasRecord'=>$hasRecord,
            'scores'=>$scores,
            'total'=>[
                'value'=>$hasRecord ? round(array_sum(array_map(static fn(array $item): float => (float)($item['value'] ?? 0), $scores)), 2) : null,
                'maximum'=>round(array_sum(array_column($scores,'maximum')), 2),
            ],
        ];
    }

    $first = $records[1] ?? null;
    $second = $records[2] ?? null;
    $final = $records[3] ?? null;
    $hasFinalRecord = $final !== null;
    $firstSettings = $settings[1];
    $secondSettings = $settings[2];
    $finalSettings = $settings[3];
    $periodicTestAverage = null;
    $participationAverage = null;
    $homeworkAverage = null;
    $tasksAverage = null;
    $finalExamScore = null;

    if ($hasFinalRecord) {
        $firstTest = $score($first,'periodic_test_score');
        $secondTest = $score($second,'periodic_test_score');
        $periodicTestAverage = ($firstTest === null || $secondTest === null) ? null : round(($firstTest + $secondTest) / 2, 2);
        $participationRatio = teacher_score_ratio_average(
            [$score($first,'participation_score'),$score($second,'participation_score')],
            [$firstSettings['participation_max'],$secondSettings['participation_max']]
        );
        $homeworkRatio = teacher_score_ratio_average(
            [$score($first,'homework_score'),$score($second,'homework_score')],
            [$firstSettings['homework_max'],$secondSettings['homework_max']]
        );
        $tasksRatio = teacher_score_ratio_average(
            [$score($first,'tasks_score'),$score($second,'tasks_score')],
            [$firstSettings['tasks_max'],$secondSettings['tasks_max']]
        );
        $participationAverage = round($participationRatio * $maximum($finalSettings,'participation_max'), 2);
        $homeworkAverage = round($homeworkRatio * $maximum($finalSettings,'homework_max'), 2);
        $tasksAverage = round($tasksRatio * $maximum($finalSettings,'tasks_max'), 2);
        $finalExamScore = $score($final,'final_exam_score');
    }

    $periodicTestMaximum = round(($maximum($firstSettings,'periodic_test_max') + $maximum($secondSettings,'periodic_test_max')) / 2, 2);
    $finalScores = [
        ['key'=>'periodicTestAverage','label'=>'متوسط الاختبارين','value'=>$periodicTestAverage,'maximum'=>$periodicTestMaximum],
        ['key'=>'participationAverage','label'=>'متوسط المشاركة','value'=>$participationAverage,'maximum'=>$maximum($finalSettings,'participation_max')],
        ['key'=>'homeworkAverage','label'=>'متوسط الواجبات','value'=>$homeworkAverage,'maximum'=>$maximum($finalSettings,'homework_max')],
        ['key'=>'tasksAverage','label'=>'متوسط المهام','value'=>$tasksAverage,'maximum'=>$maximum($finalSettings,'tasks_max')],
        ['key'=>'finalExam','label'=>'الاختبار النهائي','value'=>$finalExamScore,'maximum'=>$maximum($finalSettings,'final_exam_max')],
    ];
    $periods[] = [
        'period'=>3,
        'label'=>'النهائي',
        'hasRecord'=>$hasFinalRecord,
        'scores'=>$finalScores,
        'total'=>[
            'value'=>$hasFinalRecord ? round(array_sum(array_map(static fn(array $item): float => (float)($item['value'] ?? 0), $finalScores)), 2) : null,
            'maximum'=>round(array_sum(array_column($finalScores,'maximum')), 2),
        ],
    ];
    return $periods;
}

function parent_portal_gradebook(int $parentId, int $studentId): never
{
    Auth::requirePermission('parent.results.view',false);
    ensure_teacher_tools_schema();
    $student = parent_portal_linked_student($parentId,$studentId);
    if (!$student) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);

    $teacherId = (int)($student['teacher_id'] ?? 0);
    $studentJson = [
        'id'=>(int)$student['id'],
        'name'=>(string)$student['name'],
        'stage'=>(string)($student['stage'] ?? ''),
        'gradeLabel'=>(string)($student['grade_label'] ?? ''),
        'className'=>(string)($student['class_name'] ?? ''),
        'teacherName'=>(string)($student['teacher_name'] ?? ''),
    ];
    if ($teacherId < 1) {
        Http::json(['student'=>$studentJson,'contexts'=>[],'context'=>null,'hasAnyRecord'=>false,'periods'=>parent_portal_gradebook_empty_periods()]);
    }

    $contexts = [];
    $contextKeys = [];
    $appendContext = static function (string $academicYear, string $semester, bool $current = false) use (&$contexts,&$contextKeys): void {
        $semester = $semester === 'second' ? 'second' : 'first';
        $key = $academicYear . "\0" . $semester;
        if (isset($contextKeys[$key])) {
            if ($current) {
                $index = $contextKeys[$key];
                $contexts[$index]['current'] = true;
            }
            return;
        }
        $contextKeys[$key] = count($contexts);
        $contexts[] = [
            'academicYear'=>$academicYear,
            'semester'=>$semester,
            'semesterLabel'=>$semester === 'second' ? 'الفصل الدراسي الثاني' : 'الفصل الدراسي الأول',
            'current'=>$current,
        ];
    };

    $school = teacher_school_settings_row($teacherId);
    $schoolAcademicYear = trim((string)($school['academic_year'] ?? ''));
    $schoolSemester = (string)($school['current_semester'] ?? 'first');
    if ($schoolAcademicYear !== '') $appendContext($schoolAcademicYear,$schoolSemester,true);

    $actualContexts = fetch_all(
        'SELECT academic_year,semester,MAX(updated_at) AS latest_update FROM student_follow_up WHERE teacher_id=? AND student_id=? GROUP BY academic_year,semester ORDER BY latest_update DESC',
        [$teacherId,$studentId]
    );
    foreach ($actualContexts as $row) $appendContext((string)$row['academic_year'],(string)$row['semester']);

    $hasAcademicYear = array_key_exists('academicYear',$_GET);
    $hasSemester = array_key_exists('semester',$_GET);
    if ($hasAcademicYear xor $hasSemester) Http::json(['error'=>'حددي العام الدراسي والفصل الدراسي معًا.'],422);

    $selectedContext = null;
    if ($hasAcademicYear && $hasSemester) {
        $requestedYear = trim((string)$_GET['academicYear']);
        $requestedSemester = (string)$_GET['semester'];
        if (mb_strlen($requestedYear) > 30 || !in_array($requestedSemester,['first','second'],true)) {
            Http::json(['error'=>'السياق الدراسي المطلوب غير صالح.'],422);
        }
        foreach ($contexts as $context) {
            if ($context['academicYear'] === $requestedYear && $context['semester'] === $requestedSemester) {
                $selectedContext = $context;
                break;
            }
        }
        if (!$selectedContext) Http::json(['error'=>'السياق الدراسي المطلوب غير متاح لهذه الطالبة.'],422);
    } elseif ($contexts) {
        $selectedContext = $contexts[0];
    }

    if (!$selectedContext) {
        Http::json(['student'=>$studentJson,'contexts'=>[],'context'=>null,'hasAnyRecord'=>false,'periods'=>parent_portal_gradebook_empty_periods()]);
    }

    $academicYear = (string)$selectedContext['academicYear'];
    $semester = (string)$selectedContext['semester'];
    $rows = fetch_all(
        'SELECT period_no,periodic_test_score,participation_score,homework_score,tasks_score,final_exam_score,updated_at FROM student_follow_up WHERE teacher_id=? AND student_id=? AND academic_year=? AND semester=? AND period_no IN (1,2,3)',
        [$teacherId,$studentId,$academicYear,$semester]
    );
    $records = [];
    foreach ($rows as $row) $records[(int)$row['period_no']] = $row;
    $settings = [
        1=>teacher_follow_up_settings($teacherId,1,$academicYear,$semester),
        2=>teacher_follow_up_settings($teacherId,2,$academicYear,$semester),
        3=>teacher_follow_up_settings($teacherId,3,$academicYear,$semester),
    ];

    Http::json([
        'student'=>$studentJson,
        'contexts'=>$contexts,
        'context'=>$selectedContext,
        'hasAnyRecord'=>!empty($records),
        'periods'=>parent_portal_gradebook_periods($records,$settings),
    ]);
}

function parent_portal_analysis(int $parentId, int $studentId): never
{
    Auth::requirePermission('parent.analytics.view',false);
    $student = parent_portal_linked_student($parentId,$studentId);
    if (!$student) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    $skills = fetch_all(
        'SELECT sk.id,sk.code,sk.name,ss.mastery_percent,ss.evidence_count,ss.updated_at FROM student_skills ss JOIN skills sk ON sk.id=ss.skill_id WHERE ss.student_id=? ORDER BY ss.mastery_percent DESC,sk.name',
        [$studentId]
    );
    $learning = fetch_one(
        'SELECT visual_score,auditory_score,reading_writing_score,kinesthetic_score,result_style,completed_at FROM learning_style_assessments WHERE student_id=? ORDER BY completed_at DESC,id DESC LIMIT 1',
        [$studentId]
    );
    $performance = fetch_all(
        "SELECT t.test_type,COUNT(*) AS attempts,ROUND(AVG(a.percentage),1) AS average,MAX(a.percentage) AS best
         FROM test_attempts a JOIN tests t ON t.id=a.test_id
         WHERE a.student_id=? AND a.status IN ('submitted','graded') AND t.show_result=1 GROUP BY t.test_type",
        [$studentId]
    );
    Http::json([
        'progressPercent'=>$performance?round(array_sum(array_column($performance,'average'))/count($performance),1):0,
        'learningStyle'=>$student['learning_style']??'unknown',
        'learningAssessment'=>$learning ?: null,
        'skills'=>$skills,
        'performance'=>$performance,
    ]);
}

function parent_portal_points(int $parentId, int $studentId): never
{
    Auth::requirePermission('parent.points.view',false);
    ensure_teacher_tools_schema();
    if (!parent_portal_linked_student($parentId,$studentId)) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    $rows = fetch_all(
        'SELECT p.id,p.points,p.reason_type,p.reason,p.details,p.created_at,t.name AS teacher_name FROM motivational_points p LEFT JOIN teachers t ON t.id=p.teacher_id WHERE p.student_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT 500',
        [$studentId]
    );
    $total = array_sum(array_map(static fn(array $row):int=>(int)$row['points'],$rows));
    Http::json(['total'=>$total,'entries'=>$rows]);
}

function parent_portal_follow_up(int $parentId, int $studentId): never
{
    Auth::requirePermission('parent.follow_up.view',false);
    ensure_teacher_tools_schema();
    ensure_weekly_follow_up_schema();
    if (!parent_portal_linked_student($parentId,$studentId)) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    $attendance = fetch_all(
        'SELECT attendance_date AS record_date,status,\'daily\' AS source FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 180',
        [$studentId]
    );
    $weeklyAttendance = fetch_all(
        "SELECT attendance_date AS record_date,status,'weekly' AS source,week_no,day_index FROM weekly_attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 180",
        [$studentId]
    );
    $assignments = fetch_all('SELECT id,title,status,due_date,created_at FROM assignments WHERE student_id=? ORDER BY created_at DESC LIMIT 200',[$studentId]);
    $periods = fetch_all(
        'SELECT f.period_no,f.academic_year,f.semester,f.periodic_test_score,f.participation_score,f.homework_score,f.tasks_score,f.quiz_one_score,f.quiz_two_score,f.final_exam_score,f.updated_at,t.name AS teacher_name FROM student_follow_up f LEFT JOIN teachers t ON t.id=f.teacher_id WHERE f.student_id=? ORDER BY f.academic_year DESC,f.semester,f.period_no',
        [$studentId]
    );
    $weeklyScores = fetch_all(
        'SELECT i.title,i.item_type,i.item_date,i.max_score,s.score,s.record_status,s.note FROM weekly_follow_up_item_scores s JOIN weekly_follow_up_items i ON i.id=s.item_id WHERE s.student_id=? ORDER BY i.item_date DESC,i.id DESC LIMIT 300',
        [$studentId]
    );
    Http::json(['attendance'=>array_merge($attendance,$weeklyAttendance),'assignments'=>$assignments,'periods'=>$periods,'weeklyScores'=>$weeklyScores]);
}

function parent_portal_semester_plans(int $parentId,int $studentId): never
{
    Auth::requirePermission('parent.files.view',false);
    $student=parent_portal_linked_student($parentId,$studentId);
    if(!$student) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    if(!planning_content_schema_ready()||!planning_content_parent_publication_schema_ready()) {
        Http::json([
            'migrationReady'=>false,
            'migration'=>PLANNING_CONTENT_PARENT_PUBLICATION_MIGRATION,
            'student'=>['id'=>(int)$student['id'],'name'=>(string)$student['name']],
            'items'=>[],
        ]);
    }
    $classId=(int)($student['class_id']??0);$teacherId=(int)($student['teacher_id']??0);$academicYear=trim((string)($student['academic_year']??''));
    if($classId<1||$teacherId<1||$academicYear==='') Http::json(['migrationReady'=>true,'items'=>[]]);
    $rows=fetch_all(
        "SELECT pc.*,p.published_at AS parent_published_at,p.academic_year AS publication_academic_year,p.semester AS publication_semester
         FROM teacher_planning_content_parent_publications p
         JOIN teacher_planning_content pc ON pc.id=p.content_id AND pc.teacher_id=? AND pc.destination='semester-plans' AND pc.deleted_at IS NULL
         JOIN teacher_school_settings ss ON ss.teacher_id=pc.teacher_id AND ss.current_semester=p.semester
         WHERE p.class_id=? AND p.academic_year=? AND p.status='published' AND (ss.academic_year='' OR ss.academic_year=p.academic_year)
         ORDER BY p.published_at DESC,pc.id DESC",
        [$teacherId,$classId,$academicYear]
    );
    $items=array_map(static fn(array $row):array=>[
        'id'=>(int)$row['id'],'name'=>(string)$row['name'],'unitNumber'=>(int)$row['unit_number'],'lessonNumber'=>(int)$row['lesson_number'],
        'lessonName'=>(string)$row['lesson_name'],'contentType'=>(string)$row['content_type'],'sourceType'=>(string)$row['source_type'],
        'hasCover'=>!empty($row['cover_entry_file']),'coverUrl'=>!empty($row['cover_entry_file'])?'/planning/content-cover.php?content='.(int)$row['id'].'&v='.rawurlencode((string)$row['updated_at']):'',
        'playerUrl'=>'/planning/content-player.php?content='.(int)$row['id'],'publishedAt'=>(string)$row['parent_published_at'],
        'academicYear'=>(string)$row['publication_academic_year'],'semester'=>(string)$row['publication_semester'],
    ],$rows);
    Http::json(['migrationReady'=>true,'student'=>['id'=>(int)$student['id'],'name'=>(string)$student['name'],'className'=>(string)($student['class_name']??'')],'items'=>$items]);
}

function parent_portal_files(int $parentId, int $studentId): never
{
    Auth::requirePermission('parent.files.view',false);
    $student = parent_portal_linked_student($parentId,$studentId);
    if (!$student) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    ensure_student_portfolio_schema();
    ensure_knowledge_exchange_schema();
    $files = fetch_all(
        'SELECT id,category,title,note,original_name,mime_type,size_bytes,review_status,teacher_comment,reviewed_at,awarded_points,created_at FROM student_portfolio_files WHERE student_id=? ORDER BY created_at DESC,id DESC',
        [$studentId]
    );
    $resources = fetch_all(
        'SELECT id,category,title,description,resource_type,original_name,mime_type,size_bytes,resource_url,created_at FROM knowledge_resources WHERE teacher_id=? ORDER BY created_at DESC,id DESC',
        [(int)$student['teacher_id']]
    );
    Http::json([
        'files'=>array_map('portfolio_json_row',$files),
        'resources'=>array_map('knowledge_json_row',$resources),
    ]);
}

function parent_portal_download_file(int $parentId, int $studentId, int $fileId): never
{
    Auth::requirePermission('parent.files.view',false);
    if (!parent_portal_linked_student($parentId,$studentId)) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    ensure_student_portfolio_schema();
    $row = fetch_one('SELECT id,original_name,stored_name,mime_type,size_bytes FROM student_portfolio_files WHERE id=? AND student_id=?',[$fileId,$studentId]);
    if (!$row) Http::json(['error'=>'الملف غير موجود.'],404);
    portfolio_send_file($row,true);
}

function parent_portal_download_resource(int $parentId, int $studentId, int $resourceId): never
{
    Auth::requirePermission('parent.files.view',false);
    $student = parent_portal_linked_student($parentId,$studentId);
    if (!$student) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],404);
    ensure_knowledge_exchange_schema();
    $row = fetch_one("SELECT id,original_name,stored_name,mime_type,size_bytes FROM knowledge_resources WHERE id=? AND teacher_id=? AND resource_type='file'",[$resourceId,(int)$student['teacher_id']]);
    if (!$row) Http::json(['error'=>'المورد غير موجود.'],404);
    knowledge_send_file($row);
}

function parent_portal_community(int $parentId): never
{
    Auth::requirePermission('parent.community.view',false);
    ensure_parent_portal_schema();
    $posts = fetch_all(
        "SELECT DISTINCT p.id,p.title,p.body,p.created_at,p.class_id,c2.name AS class_name,t.name AS teacher_name
         FROM parent_community_posts p
         JOIN teachers t ON t.id=p.teacher_id
         JOIN parent_student_links l ON l.parent_id=? AND l.status='active'
         JOIN students s ON s.id=l.student_id
         JOIN classes c ON c.id=s.class_id AND c.teacher_id=p.teacher_id
         LEFT JOIN classes c2 ON c2.id=p.class_id
         WHERE p.status='published' AND (p.class_id IS NULL OR p.class_id=s.class_id)
         ORDER BY p.created_at DESC LIMIT 300",
        [$parentId]
    );
    Http::json(['posts'=>$posts]);
}

function handle_parent_portal_routes(string $method, array $segments, int $parentId): never
{
    ensure_parent_portal_schema();
    $resource = $segments[0] ?? '';
    if ($resource==='summary' && $method==='GET') parent_portal_summary($parentId);
    if ($resource==='children' && count($segments)===1 && $method==='GET') {
        Auth::requirePermission('parent.children.view',false);
        Http::json(['children'=>parent_portal_children($parentId)]);
    }
    if ($resource==='children' && isset($segments[1])) {
        $studentId = route_id($segments,1);
        $action = $segments[2] ?? 'overview';
        if ($action==='overview' && $method==='GET') parent_portal_overview($parentId,$studentId);
        if ($action==='gradebook' && $method==='GET') parent_portal_gradebook($parentId,$studentId);
        if ($action==='tests' && $method==='GET') parent_portal_tests($parentId,$studentId);
        if ($action==='analysis' && $method==='GET') parent_portal_analysis($parentId,$studentId);
        if ($action==='points' && $method==='GET') parent_portal_points($parentId,$studentId);
        if ($action==='follow-up' && $method==='GET') parent_portal_follow_up($parentId,$studentId);
        if ($action==='semester-plans' && $method==='GET') parent_portal_semester_plans($parentId,$studentId);
        if ($action==='files' && count($segments)===3 && $method==='GET') parent_portal_files($parentId,$studentId);
        if ($action==='files' && isset($segments[3]) && ($segments[4]??'')==='download' && $method==='GET') parent_portal_download_file($parentId,$studentId,route_id($segments,3));
        if ($action==='resources' && isset($segments[3]) && ($segments[4]??'')==='file' && $method==='GET') parent_portal_download_resource($parentId,$studentId,route_id($segments,3));
    }
    if ($resource==='community') {
        if (($segments[1] ?? '') === 'media' && isset($segments[2]) && $method==='GET') {
            parent_community_media_stream(route_id($segments,2),'parent',$parentId);
        }
        if (($segments[1] ?? '') === 'posts' && count($segments)===2 && $method==='POST') {
            parent_community_media_parent_create($parentId);
        }
        if (($segments[1] ?? '') === 'posts' && isset($segments[2]) && $method==='DELETE') {
            parent_community_media_parent_archive($parentId,route_id($segments,2));
        }
        if (count($segments)===1 && $method==='GET') parent_community_media_parent_feed($parentId);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}
