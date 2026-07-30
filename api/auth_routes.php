<?php
declare(strict_types=1);

function login_name_key(string $value): string
{
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    $value = str_replace(['أ','إ','آ','ى','ة','ـ'], ['ا','ا','ا','ي','ه',''], $value);
    $value = preg_replace('/[ًٌٍَُِّْ]/u', '', $value) ?? $value;
    return mb_strtolower($value, 'UTF-8');
}

function platform_login_email_by_name(string $role, string $firstName, string $lastName, string $password): string
{
    $roleCode = $role === 'admin' ? Rbac::ADMIN : Rbac::PARENT;
    $firstKey = login_name_key($firstName);
    $lastKey = login_name_key($lastName);
    if ($firstKey === '' || $lastKey === '' || mb_strlen($firstKey) > 60 || mb_strlen($lastKey) > 60) {
        Http::json(['error'=>'اكتبي الاسم الأول والاسم الأخير بصورة صحيحة.'],422);
    }

    $rows = fetch_all(
        "SELECT id,name,email,password_hash,status FROM platform_users WHERE role_code=? AND deleted_at IS NULL",
        [$roleCode]
    );
    $passwordMatches = [];
    foreach ($rows as $row) {
        $storedName = login_name_key((string)$row['name']);
        $startsWithFirst = $storedName === $firstKey || str_starts_with($storedName, $firstKey . ' ');
        $endsWithLast = $storedName === $lastKey || str_ends_with($storedName, ' ' . $lastKey);
        if (!$startsWithFirst || !$endsWithLast) continue;
        if (!empty($row['password_hash']) && password_verify($password, (string)$row['password_hash'])) {
            $passwordMatches[] = $row;
        }
    }
    if (count($passwordMatches) === 1) return (string)$passwordMatches[0]['email'];
    if (count($passwordMatches) > 1) {
        Http::json(['error'=>'يوجد أكثر من حساب بالاسم نفسه. تواصلي مع إدارة منصة مدار لتمييز الحساب.'],409);
    }

    // بريد وهمي ثابت للاسم حتى تعمل حماية المحاولات المتكررة دون كشف وجود الحساب.
    return 'name-login-' . substr(hash('sha256', $role.'|'.$firstKey.'|'.$lastKey), 0, 32) . '@madar.invalid';
}

function public_login(string $role): never
{
    $data = Http::input();
    if (in_array($role, ['admin','parent'], true)) {
        Http::requireFields($data, ['firstName','lastName','password']);
        $email = platform_login_email_by_name(
            $role,
            (string)$data['firstName'],
            (string)$data['lastName'],
            (string)$data['password']
        );
    } else {
        Http::requireFields($data, ['email', 'password']);
        $email = in_array($role, ['student', 'teacher'], true)
            ? Http::schoolEmail((string) $data['email'])
            : Http::email((string) $data['email']);
    }
    $user = Auth::attempt($role, $email, (string) $data['password'], isset($data['otp']) ? (string)$data['otp'] : null);
    Http::json($user);
}

function teacher_register(): never
{
    $enabled=fetch_one("SELECT setting_value FROM app_settings WHERE setting_key='teacher_registration_enabled'");
    if (($enabled['setting_value']??'true')==='false') Http::json(['error'=>'إنشاء حسابات المعلمات متوقف حاليًا. تواصلي مع مالكة الموقع.'],403);
    $data = Http::input();
    Http::requireFields($data, ['name', 'email', 'password']);
    $name = trim((string) $data['name']);
    $email = Http::schoolEmail((string) $data['email']);
    $password = (string) $data['password'];
    Auth::validatePassword($password);

    if (($data['confirmPassword'] ?? $password) !== $password) {
        Http::json(['error' => 'كلمتا المرور غير متطابقتين.'], 422);
    }
    if (fetch_one('SELECT id FROM teachers WHERE email = ?', [$email])) {
        Http::json(['error' => 'البريد الإلكتروني مستخدم مسبقًا.'], 409);
    }

    $stmt = Database::connection()->prepare(
        "INSERT INTO teachers (name, email, password_hash, status) VALUES (?, ?, ?, 'pending')"
    );
    $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
    Activity::log('system', null, 'طلب حساب معلمة', "طلب جديد للبريد {$email}");
    Http::json(['ok' => true, 'message' => 'تم إرسال طلب الحساب إلى مالكة الموقع للموافقة.'], 201);
}

function logout_route(string $role): never
{
    $user = $role === 'owner' ? Auth::requireRealOwner() : Auth::requireRole($role);
    Auth::verifyCsrf();
    if ($role !== 'owner' && Auth::isOwnerPreview()) {
        $owner = Auth::realUser();
        Activity::log('owner', (int)($owner['id'] ?? 0), 'إنهاء معاينة دور', 'تم إنهاء المعاينة من زر تسجيل الخروج داخل الصفحة المعاينة.');
        Auth::stopPreview(true);
        Http::json(['ok'=>true,'previewEnded'=>true,'redirect'=>'/owner/dashboard']);
    }
    Activity::log($role, (int) $user['id'], 'تسجيل الخروج');
    Auth::logout();
    Http::json(['ok' => true]);
}

function me_route(string $role): never
{
    $user = Auth::requireRole($role);
    $user['csrfToken'] = $_SESSION['csrf_token'] ?? ($_SESSION['csrf_token'] = bin2hex(random_bytes(32)));
    $user['preview'] = Auth::previewContext();
    if ($role === 'student') {
        $details = fetch_one(
            'SELECT s.learning_style, s.progress_percent, s.grade_label, s.stage, s.must_change_password, c.name AS class_name
             FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?',
            [$user['id']]
        );
        $user = array_merge($user, $details ?? []);
    }
    Http::json($user);
}

function update_teacher_profile(): never
{
    $teacher = Auth::requireRole('teacher');
    Auth::verifyCsrf();
    $data = Http::input();

    if (isset($data['currentPassword']) || isset($data['newPassword'])) {
        Http::requireFields($data, ['currentPassword', 'newPassword', 'confirmPassword']);
        if ($data['newPassword'] !== $data['confirmPassword']) {
            Http::json(['error' => 'كلمتا المرور الجديدة غير متطابقتين.'], 422);
        }
        Auth::validatePassword((string) $data['newPassword']);
        $record = fetch_one('SELECT password_hash FROM teachers WHERE id = ?', [$teacher['id']]);
        if (!$record || !password_verify((string) $data['currentPassword'], $record['password_hash'])) {
            Http::json(['error' => 'كلمة المرور الحالية غير صحيحة.'], 422);
        }
        execute_sql('UPDATE teachers SET password_hash = ? WHERE id = ?', [password_hash((string) $data['newPassword'], PASSWORD_DEFAULT), $teacher['id']]);
        Activity::log('teacher', (int) $teacher['id'], 'تغيير كلمة المرور');
        Http::json(['ok' => true]);
    }

    $name = trim((string) ($data['name'] ?? $teacher['name']));
    $email = isset($data['email']) ? Http::schoolEmail((string) $data['email']) : $teacher['email'];
    execute_sql('UPDATE teachers SET name = ?, email = ? WHERE id = ?', [$name, $email, $teacher['id']]);
    Http::json(['id' => $teacher['id'], 'name' => $name, 'email' => $email]);
}
