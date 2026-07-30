<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user = Auth::realUser();
if (!$user || ($user['roleCode'] ?? '') !== Rbac::OWNER || ($user['role'] ?? '') !== 'owner' || ($user['subjectType'] ?? '') !== 'owner') {
    header('Location: /owner/login.html');
    exit;
}
readfile(__DIR__ . '/protected/dashboard.html');

