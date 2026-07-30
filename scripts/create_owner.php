<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$email = env_value('OWNER_EMAIL');
$password = env_value('OWNER_INITIAL_PASSWORD');
if (!$email || !$password) {
    fwrite(STDERR, "أضيفي OWNER_EMAIL و OWNER_INITIAL_PASSWORD في ملف .env أولًا.\n");
    exit(1);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 10 || !preg_match('/[A-Za-z]/',$password) || !preg_match('/\d/',$password)) {
    fwrite(STDERR, "البريد غير صالح أو كلمة المرور لا تحقق شرط 10 أحرف على الأقل مع حرف ورقم.\n");
    exit(1);
}

$pdo = Database::connection();
$exists = $pdo->query('SELECT COUNT(*) FROM owners')->fetchColumn();
if ((int) $exists > 0) {
    fwrite(STDOUT, "يوجد حساب مالكة بالفعل؛ لم يتم إنشاء حساب إضافي.\n");
    exit(0);
}

$stmt = $pdo->prepare("INSERT INTO owners (name,email,password_hash,status) VALUES ('مالكة الموقع',?,?, 'active')");
$stmt->execute([mb_strtolower(trim($email)), password_hash($password, PASSWORD_DEFAULT)]);
fwrite(STDOUT, "تم إنشاء حساب المالكة الأول بنجاح. احذفي OWNER_INITIAL_PASSWORD من .env بعد أول دخول.\n");
