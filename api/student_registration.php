<?php
declare(strict_types=1);

function ensure_student_registration_schema(): void
{
    static $ready = false;
    if ($ready) return;

    Database::connection()->exec(
        "CREATE TABLE IF NOT EXISTS student_registration_requests (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          class_id BIGINT UNSIGNED NOT NULL,
          existing_student_id BIGINT UNSIGNED NULL,
          name VARCHAR(140) NOT NULL,
          email VARCHAR(190) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
          reviewed_by BIGINT UNSIGNED NULL,
          reviewed_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_student_request_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          CONSTRAINT fk_student_request_existing FOREIGN KEY (existing_student_id) REFERENCES students(id) ON DELETE SET NULL,
          CONSTRAINT fk_student_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES teachers(id) ON DELETE SET NULL,
          INDEX idx_student_request_email (email),
          INDEX idx_student_request_status (status),
          INDEX idx_student_request_class_status (class_id,status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

function student_registration_options(): never
{
    ensure_student_registration_schema();
    $rows = fetch_all(
        "SELECT t.id AS teacher_id,t.name AS teacher_name,c.id AS class_id,c.name AS class_name,c.stage,c.grade_label
         FROM teachers t JOIN classes c ON c.teacher_id=t.id
         WHERE t.status='active' ORDER BY t.name,c.stage,c.grade_label,c.name"
    );
    $teachers = [];
    foreach ($rows as $row) {
        $teacherId = (int)$row['teacher_id'];
        if (!isset($teachers[$teacherId])) {
            $teachers[$teacherId] = [
                'id' => $teacherId,
                'name' => (string)$row['teacher_name'],
                'classes' => [],
            ];
        }
        $teachers[$teacherId]['classes'][] = [
            'id' => (int)$row['class_id'],
            'name' => (string)$row['class_name'],
            'stage' => (string)$row['stage'],
            'gradeLabel' => (string)$row['grade_label'],
        ];
    }
    Http::json(['teachers' => array_values($teachers)]);
}

function student_register_request(): never
{
    ensure_student_registration_schema();
    $data = Http::input();
    Http::requireFields($data, ['name','email','password','classId']);

    $name = trim((string)$data['name']);
    if (mb_strlen($name) < 2 || mb_strlen($name) > 140) {
        Http::json(['error' => 'اسم الطالبة غير صالح.'], 422);
    }
    $email = Http::schoolEmail((string)$data['email']);
    $password = (string)$data['password'];
    Auth::validatePassword($password);
    if (($data['confirmPassword'] ?? $password) !== $password) {
        Http::json(['error' => 'كلمتا المرور غير متطابقتين.'], 422);
    }

    $classId = (int)$data['classId'];
    $class = fetch_one(
        "SELECT c.id,c.teacher_id,c.stage,c.grade_label FROM classes c
         JOIN teachers t ON t.id=c.teacher_id WHERE c.id=? AND t.status='active'",
        [$classId]
    );
    if (!$class) Http::json(['error' => 'اختاري المعلمة والفصل بشكل صحيح.'], 422);

    if (fetch_one("SELECT id FROM student_registration_requests WHERE email=? AND status='pending'", [$email])) {
        Http::json(['error' => 'يوجد طلب سابق لهذا البريد بانتظار موافقة المعلمة.'], 409);
    }

    $existing = fetch_one(
        'SELECT s.id,s.class_id,s.password_hash,s.status,c.teacher_id FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.email=?',
        [$email]
    );
    if ($existing) {
        if (!empty($existing['password_hash'])) {
            Http::json(['error' => 'يوجد حساب مسجل بهذا البريد. يمكنكِ العودة إلى تسجيل الدخول.'], 409);
        }
        if (($existing['status'] ?? 'active') === 'disabled') {
            Http::json(['error' => 'هذا الحساب معطّل. تواصلي مع المعلمة.'], 403);
        }
        if (!empty($existing['teacher_id']) && (int)$existing['teacher_id'] !== (int)$class['teacher_id']) {
            Http::json(['error' => 'هذا البريد مرتبط بفصل لدى معلمة أخرى. تواصلي مع معلمتك.'], 409);
        }
    }

    execute_sql(
        "INSERT INTO student_registration_requests (class_id,existing_student_id,name,email,password_hash,status)
         VALUES (?,?,?,?,?,'pending')",
        [$classId,$existing ? (int)$existing['id'] : null,$name,$email,password_hash($password,PASSWORD_DEFAULT)]
    );
    $id = (int)Database::connection()->lastInsertId();
    Activity::log('system', null, 'طلب حساب طالبة', "طلب رقم {$id} للبريد {$email}");
    Http::json([
        'ok' => true,
        'message' => 'رائع! تم إنشاء الحساب، انتظري موافقة المعلمة.',
    ], 201);
}

function student_registration_login_message(string $email, string $password): ?string
{
    ensure_student_registration_schema();
    $request = fetch_one(
        "SELECT status,password_hash FROM student_registration_requests WHERE email=? ORDER BY id DESC LIMIT 1",
        [$email]
    );
    if (!$request || !password_verify($password, (string)$request['password_hash'])) return null;
    if ($request['status'] === 'pending') return 'حسابكِ بانتظار موافقة المعلمة.';
    if ($request['status'] === 'rejected') return 'لم تتم الموافقة على طلب الحساب. تواصلي مع المعلمة.';
    return null;
}

function teacher_student_registration_requests(int $teacherId): never
{
    ensure_student_registration_schema();
    $rows = fetch_all(
        "SELECT r.id,r.name,r.email,r.created_at,c.id AS class_id,c.name AS class_name,c.stage,c.grade_label
         FROM student_registration_requests r JOIN classes c ON c.id=r.class_id
         WHERE c.teacher_id=? AND r.status='pending' ORDER BY r.created_at ASC,r.id ASC",
        [$teacherId]
    );
    Http::json(['items' => array_map(static fn(array $row): array => [
        'id' => (int)$row['id'],
        'name' => (string)$row['name'],
        'email' => (string)$row['email'],
        'classId' => (int)$row['class_id'],
        'className' => (string)$row['class_name'],
        'stage' => (string)$row['stage'],
        'gradeLabel' => (string)$row['grade_label'],
        'createdAt' => $row['created_at'],
    ], $rows)]);
}

function teacher_review_student_registration_request(int $teacherId, int $requestId): never
{
    ensure_student_registration_schema();
    $data = Http::input();
    $action = trim((string)($data['action'] ?? ''));
    if (!in_array($action, ['approve','reject'], true)) {
        Http::json(['error' => 'الإجراء المطلوب غير صالح.'], 422);
    }

    $request = fetch_one(
        "SELECT r.*,c.teacher_id,c.stage,c.grade_label FROM student_registration_requests r
         JOIN classes c ON c.id=r.class_id WHERE r.id=? AND c.teacher_id=?",
        [$requestId,$teacherId]
    );
    if (!$request) Http::json(['error' => 'طلب الحساب غير موجود.'], 404);
    if ($request['status'] !== 'pending') Http::json(['error' => 'تمت مراجعة هذا الطلب مسبقًا.'], 409);

    if ($action === 'reject') {
        execute_sql(
            "UPDATE student_registration_requests SET status='rejected',reviewed_by=?,reviewed_at=NOW() WHERE id=? AND status='pending'",
            [$teacherId,$requestId]
        );
        Activity::log('teacher',$teacherId,'رفض حساب طالبة',(string)$request['email']);
        Http::json(['ok' => true, 'message' => 'تم رفض طلب الحساب.']);
    }

    $existing = !empty($request['existing_student_id'])
        ? fetch_one('SELECT s.id,s.class_id,c.teacher_id FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?', [(int)$request['existing_student_id']])
        : fetch_one('SELECT s.id,s.class_id,c.teacher_id FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.email=?', [(string)$request['email']]);
    if ($existing && !empty($existing['teacher_id']) && (int)$existing['teacher_id'] !== $teacherId) {
        Http::json(['error' => 'هذا البريد مرتبط بطالبة لدى معلمة أخرى.'], 409);
    }

    $studentId = Database::transaction(function(PDO $pdo) use ($request,$requestId,$teacherId,$existing): int {
        if ($existing) {
            $studentId = (int)$existing['id'];
            $statement = $pdo->prepare(
                "UPDATE students SET class_id=?,name=?,email=?,password_hash=?,stage=?,grade_label=?,status='active',must_change_password=0 WHERE id=?"
            );
            $statement->execute([(int)$request['class_id'],$request['name'],$request['email'],$request['password_hash'],$request['stage'],$request['grade_label'],$studentId]);
        } else {
            $statement = $pdo->prepare(
                "INSERT INTO students (class_id,name,email,password_hash,stage,grade_label,status,must_change_password) VALUES (?,?,?,?,?,?,'active',0)"
            );
            $statement->execute([(int)$request['class_id'],$request['name'],$request['email'],$request['password_hash'],$request['stage'],$request['grade_label']]);
            $studentId = (int)$pdo->lastInsertId();
        }
        $pdo->prepare(
            "UPDATE student_registration_requests SET existing_student_id=?,status='approved',reviewed_by=?,reviewed_at=NOW() WHERE id=? AND status='pending'"
        )->execute([$studentId,$teacherId,$requestId]);
        return $studentId;
    });

    Activity::log('teacher',$teacherId,'اعتماد حساب طالبة',(string)$request['email']);
    Http::json(['ok' => true, 'studentId' => $studentId, 'message' => 'تمت الموافقة على حساب الطالبة.']);
}
