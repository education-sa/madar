<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("شغّلي هذا الملف من Terminal فقط.\n");
}

try {
    $pdo = Database::connection();
    $pdo->query('SELECT 1');
    Rbac::ensureSchema();
    $config = Database::activeConfig();
    $tables = ['owners','teachers','students','rbac_roles','rbac_permissions','user_role_assignments','owner_security','auth_login_attempts'];
    echo "تم الاتصال بقاعدة البيانات بنجاح.\n";
    echo 'الخادم: ' . ($config['host'] ?? '') . ':' . ($config['port'] ?? '') . "\n";
    echo 'اسم القاعدة: ' . ($config['name'] ?? '') . "\n";
    echo "فحص الجداول:\n";
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?');
    foreach ($tables as $table) {
        $stmt->execute([$table]);
        echo ((int)$stmt->fetchColumn() === 1 ? '✓ ' : '✗ ') . $table . "\n";
    }
    echo "لم يتم تغيير بريد المالكة أو أي كلمة مرور.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "فشل الإصلاح: " . $error->getMessage() . "\n");
    exit(1);
}
