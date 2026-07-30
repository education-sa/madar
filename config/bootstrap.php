<?php
declare(strict_types=1);

define('MADAR_ROOT', dirname(__DIR__));

function load_dotenv(string $file): void
{
    if (!is_file($file)) {
        return;
    }

    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        if ($key === '' || getenv($key) !== false) {
            continue;
        }
        if ((str_starts_with($value, '"') && str_ends_with($value, '"')) ||
            (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
            $value = substr($value, 1, -1);
        }
        putenv("{$key}={$value}");
        $_ENV[$key] = $value;
    }
}

load_dotenv(MADAR_ROOT . '/.env');

function env_value(string $key, ?string $default = null): ?string
{
    $value = getenv($key);
    return $value === false ? $default : $value;
}

date_default_timezone_set('Asia/Riyadh');

$secureCookie = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
    (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

if (PHP_SAPI !== 'cli') {
    ini_set('session.use_strict_mode','1');
    ini_set('session.use_only_cookies','1');
    session_name(env_value('SESSION_NAME', 'madar_session') ?? 'madar_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secureCookie,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
}

spl_autoload_register(static function (string $class): void {
    $file = MADAR_ROOT . '/lib/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($file)) {
        require_once $file;
    }
});
