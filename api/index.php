<?php
declare(strict_types=1);

// جميع مسارات API يجب أن تعيد JSON نقيًا. بعض إعدادات MAMP تعرض تحذيرات PHP
// كـ HTML، وهذا يسبب خطأ Unexpected token '<' في المتصفح.
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('html_errors', '0');
ini_set('log_errors', '1');
ob_start();

function madar_api_emit_json(array $payload, int $status = 500): never
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($status);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
    }
    $json = json_encode(
        $payload,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
    echo $json === false ? '{"error":"تعذّر إنشاء استجابة الخادم."}' : $json;
    exit;
}

register_shutdown_function(static function (): void {
    $error = error_get_last();
    if (!$error || !in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
        return;
    }
    error_log('[fatal] ' . ($error['message'] ?? 'Unknown fatal error') . ' in ' . ($error['file'] ?? '') . ':' . ($error['line'] ?? 0));
    $development = function_exists('env_value') && env_value('APP_ENV', 'production') === 'development';
    madar_api_emit_json([
        'error' => $development
            ? 'خطأ PHP: ' . (string)($error['message'] ?? 'خطأ غير معروف')
            : 'حدث خطأ غير متوقع في الخادم.',
    ], 500);
});

try {
    require_once dirname(__DIR__) . '/config/bootstrap.php';
    require_once __DIR__ . '/shared.php';
    require_once __DIR__ . '/diagnostic_bank.php';
    require_once __DIR__ . '/auth_routes.php';
    require_once __DIR__ . '/student_registration.php';
    require_once __DIR__ . '/student_portfolio.php';
    require_once __DIR__ . '/knowledge_exchange.php';
    require_once __DIR__ . '/academic_year_management.php';
    require_once __DIR__ . '/interactive_games.php';
    require_once __DIR__ . '/interactive_game_builder.php';
    require_once __DIR__ . '/game_sessions.php';
    require_once __DIR__ . '/learning_styles.php';
    require_once __DIR__ . '/parent_portal.php';
    require_once __DIR__ . '/platform_enhancements.php';
    require_once __DIR__ . '/teacher_routes.php';
    require_once __DIR__ . '/student_routes.php';
    require_once __DIR__ . '/owner_rbac.php';
    require_once __DIR__ . '/platform_routes.php';
    require_once __DIR__ . '/preview_routes.php';
    require_once __DIR__ . '/owner_routes.php';

    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header("Permissions-Policy: camera=(), microphone=(), geolocation=()");
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'");

    $uriPath = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $path = preg_replace('#^/api(?:/index\.php)?#', '', $uriPath) ?: '/';
    $segments = array_values(array_filter(explode('/', trim($path, '/')), static fn ($part) => $part !== ''));
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    if (($segments[0] ?? '') === 'health' && $method === 'GET') {
        Database::connection()->query('SELECT 1');
        Http::json(['ok' => true, 'app' => 'Madar PHP API', 'time' => date(DATE_ATOM)]);
    }

    $scope = array_shift($segments);
    match ($scope) {
        'teacher' => handle_teacher_routes($method, $segments),
        'student' => handle_student_routes($method, $segments),
        'owner' => handle_owner_routes($method, $segments),
        'admin' => handle_platform_routes('admin', $method, $segments),
        'parent' => handle_platform_routes('parent', $method, $segments),
        'preview' => handle_preview_routes($method, $segments),
        default => Http::json(['error' => 'المسار المطلوب غير موجود.'], 404),
    };
} catch (PDOException $error) {
    error_log('[database] ' . $error->getMessage());
    try {
        execute_sql("INSERT INTO system_error_log(severity,source,message,context_json) VALUES('error','database',?,?)", [
            mb_substr($error->getMessage(), 0, 2000),
            json_encode(['method'=>$_SERVER['REQUEST_METHOD']??'', 'uri'=>parse_url($_SERVER['REQUEST_URI']??'', PHP_URL_PATH)], JSON_UNESCAPED_UNICODE),
        ]);
    } catch (Throwable) {
        // قد يكون سبب الخطأ هو انقطاع قاعدة البيانات نفسها، لذلك لا نعطل استجابة JSON.
    }
    $development = function_exists('env_value') && env_value('APP_ENV', 'production') === 'development';
    $requestHost = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $localRequest = str_starts_with($requestHost, 'localhost') || str_starts_with($requestHost, '127.0.0.1');
    madar_api_emit_json([
        'error' => ($development || $localRequest)
            ? 'خطأ قاعدة البيانات: ' . $error->getMessage()
            : 'تعذّر الاتصال بقاعدة البيانات أو تنفيذ العملية.',
    ], 500);
} catch (Throwable $error) {
    error_log('[application] ' . $error->getMessage() . "\n" . $error->getTraceAsString());
    try {
        execute_sql("INSERT INTO system_error_log(severity,source,message,context_json) VALUES('error','application',?,?)", [
            mb_substr($error->getMessage(), 0, 2000),
            json_encode(['method'=>$_SERVER['REQUEST_METHOD']??'', 'uri'=>parse_url($_SERVER['REQUEST_URI']??'', PHP_URL_PATH)], JSON_UNESCAPED_UNICODE),
        ]);
    } catch (Throwable) {
        // لا نجعل تسجيل الخطأ سببًا في خطأ إضافي.
    }
    $development = function_exists('env_value') && env_value('APP_ENV', 'production') === 'development';
    madar_api_emit_json([
        'error' => $development
            ? 'خطأ الخادم: ' . $error->getMessage()
            : 'حدث خطأ غير متوقع في الخادم.',
    ], 500);
}
