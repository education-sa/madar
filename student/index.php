<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user = Auth::user();
if (!$user || $user['role'] !== 'student') {
    header('Location: /login.html?role=student');
    exit;
}
readfile(__DIR__ . '/index.html');
