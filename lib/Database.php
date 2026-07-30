<?php
declare(strict_types=1);

final class Database
{
    private static ?PDO $connection = null;
    private static array $activeConfig = [];

    public static function connection(): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $name = trim((string) (env_value('DB_NAME', 'madar') ?? 'madar')) ?: 'madar';
        $explicitConfig = getenv('DB_HOST') !== false
            || getenv('DB_PORT') !== false
            || getenv('DB_USER') !== false
            || getenv('DB_PASS') !== false;

        $configured = [
            'host' => (string) (env_value('DB_HOST', '127.0.0.1') ?? '127.0.0.1'),
            'port' => (string) (env_value('DB_PORT', '3306') ?? '3306'),
            'name' => $name,
            'user' => (string) (env_value('DB_USER', 'root') ?? 'root'),
            'pass' => (string) (env_value('DB_PASS', '') ?? ''),
            'source' => $explicitConfig ? 'env' : 'default',
        ];

        $candidates = [$configured];

        // عند فقد ملف .env محليًا، جرّبي إعدادات MAMP الشائعة تلقائيًا.
        // لا يتم هذا السلوك على الاستضافة أو عند وجود إعدادات DB صريحة.
        if (!$explicitConfig && self::isLocalEnvironment()) {
            $candidates = array_merge($candidates, [
                ['host' => '127.0.0.1', 'port' => '8889', 'name' => $name, 'user' => 'root', 'pass' => 'root', 'source' => 'mamp'],
                ['host' => 'localhost', 'port' => '8889', 'name' => $name, 'user' => 'root', 'pass' => 'root', 'source' => 'mamp'],
                ['host' => '127.0.0.1', 'port' => '3306', 'name' => $name, 'user' => 'root', 'pass' => 'root', 'source' => 'local'],
                ['host' => '127.0.0.1', 'port' => '3306', 'name' => $name, 'user' => 'root', 'pass' => '', 'source' => 'local'],
            ]);
        }

        $seen = [];
        $errors = [];
        foreach ($candidates as $config) {
            $signature = implode('|', [$config['host'], $config['port'], $config['name'], $config['user'], $config['pass']]);
            if (isset($seen[$signature])) {
                continue;
            }
            $seen[$signature] = true;

            try {
                $dsn = sprintf(
                    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                    $config['host'],
                    $config['port'],
                    $config['name']
                );
                $pdo = new PDO($dsn, $config['user'], $config['pass'], [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_TIMEOUT => 4,
                    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
                ]);
                try {
                    $pdo->exec("SET time_zone = '+03:00'");
                } catch (Throwable $ignored) {
                    // لا نجعل إعداد المنطقة الزمنية سببًا في تعطيل الاتصال بالكامل.
                }
                self::$connection = $pdo;
                self::$activeConfig = [
                    'host' => $config['host'],
                    'port' => $config['port'],
                    'name' => $config['name'],
                    'user' => $config['user'],
                    'source' => $config['source'],
                ];
                return self::$connection;
            } catch (PDOException $error) {
                $errors[] = sprintf('%s:%s (%s)', $config['host'], $config['port'], $error->getCode());
            }
        }

        $message = 'تعذر الاتصال بقاعدة البيانات.';
        if (self::isLocalEnvironment()) {
            $message .= ' تأكدي من تشغيل MySQL في MAMP ومن وجود قاعدة باسم ' . $name
                . '. المحاولات: ' . implode('، ', $errors);
        }
        throw new PDOException($message);
    }

    public static function activeConfig(): array
    {
        return self::$activeConfig;
    }

    private static function isLocalEnvironment(): bool
    {
        if (PHP_SAPI === 'cli') {
            return true;
        }
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        $server = (string) ($_SERVER['SERVER_ADDR'] ?? '');
        return str_starts_with($host, 'localhost')
            || str_starts_with($host, '127.0.0.1')
            || in_array($server, ['127.0.0.1', '::1'], true);
    }

    public static function transaction(callable $callback): mixed
    {
        $pdo = self::connection();
        $pdo->beginTransaction();
        try {
            $result = $callback($pdo);
            $pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }
}
