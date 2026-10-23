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

// Teacher access scopes are managed only by the real site owner through surveys/api.php.
function madar_enforce_teacher_survey_scope(): void
{
    if (PHP_SAPI === 'cli' || ($_SESSION['role'] ?? '') !== 'teacher') return;
    // Once installed, the three native access modes are the only authority.
    if(PortalAccess::ready())return;
    $actor = Auth::realUser();
    if (!$actor || ($actor['subjectType'] ?? '') !== 'teacher') return;
    $stmt = Database::connection()->prepare('SELECT setting_value FROM ms_settings WHERE setting_key=?');
    $stmt->execute(['teacher_scope_'.(int)$actor['id']]);
    if ($stmt->fetchColumn() !== 'surveys_only') return;
    $path = rawurldecode((string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'));
    if ($path === '/ظليم' || $path === '/ظليم/' || $path === '/surveys/public' || str_starts_with($path, '/surveys/public/')) return;
    if (in_array($path, ['/api/owner/login','/api/student/login','/api/parent/login','/api/admin/login','/api/teacher/login','/api/teacher/logout','/api/teacher/me','/api/teacher/password-reset-request','/api/portal/access'], true)) return;
    header('Cache-Control: no-store');
    if (str_starts_with($path, '/api/')) {
        http_response_code(403);header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error'=>'هذا الحساب مخصص للاستبيانات فقط.','code'=>'SURVEYS_ONLY','redirect'=>'/ظليم'],JSON_UNESCAPED_UNICODE);exit;
    }
    header('Location: /'.rawurlencode('ظليم'), true, 302);exit;
}
madar_enforce_teacher_survey_scope();

PortalAccess::guardServicePage();
