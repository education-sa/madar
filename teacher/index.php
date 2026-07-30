<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user = Auth::user();
if (!$user || $user['role'] !== 'teacher') {
    header('Location: /teacher/login.html');
    exit;
}
readfile(__DIR__ . '/index.html');

