<?php
declare(strict_types=1);

$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$root = __DIR__;

$blockedPrefixes = ['/config/', '/lib/', '/database/', '/scripts/', '/owner/protected/', '/backend/', '/storage/'];
$blockedFiles = ['/.env', '/.env.example', '/server.js', '/package.json', '/package-lock.json', '/replit.md', '/.replit'];
$blocked = in_array($path, $blockedFiles, true);
foreach ($blockedPrefixes as $prefix) {
    if (str_starts_with($path, $prefix)) {
        $blocked = true;
        break;
    }
}
if ($blocked) {
    http_response_code(404);
    return true;
}

if (str_starts_with($path, '/api/')) {
    require $root . '/api/index.php';
    return true;
}

$ownerPublic = [
    '/owner/login.html' => '/owner/public/login.html',
    '/owner/dashboard.css' => '/owner/public/dashboard.css',
    '/owner/dashboard.js' => '/owner/public/dashboard.js',
    '/owner/login.js' => '/owner/public/login.js',
];
if (isset($ownerPublic[$path])) {
    $extension=pathinfo($ownerPublic[$path],PATHINFO_EXTENSION);
    if($extension==='css')header('Content-Type: text/css; charset=utf-8');
    elseif($extension==='js')header('Content-Type: application/javascript; charset=utf-8');
    else header('Content-Type: text/html; charset=utf-8');
    readfile($root.$ownerPublic[$path]);
    return true;
}

$protected = [
    '/teacher' => '/teacher/index.php',
    '/teacher/index.html' => '/teacher/index.php',
    '/teacher/' => '/teacher/index.php',
    '/owner/dashboard' => '/owner/dashboard.php',
    '/owner/dashboard/' => '/owner/dashboard.php',
    '/student' => '/student/index.php',
    '/student/' => '/student/index.php',
    '/student/index.html' => '/student/index.php',
    '/admin' => '/admin/index.php',
    '/admin/' => '/admin/index.php',
    '/admin/index.html' => '/admin/index.php',
    '/parent' => '/parent/index.php',
    '/parent/' => '/parent/index.php',
    '/parent/index.html' => '/parent/index.php',
];
if (isset($protected[$path])) {
    require $root . $protected[$path];
    return true;
}

$file = realpath($root . $path);
if ($file && str_starts_with($file, realpath($root)) && is_file($file)) {
    return false;
}

if ($path === '/') {
    readfile($root . '/index.html');
    return true;
}

http_response_code(404);
header('Content-Type: text/html; charset=utf-8');
echo '<h1 dir="rtl">الصفحة غير موجودة</h1>';
return true;
