<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user = Auth::user();
if (!$user || $user['role'] !== 'student') {
    header('Location: /login.html?role=student');
    exit;
}
PortalAccess::pageGuard($user);
$html=file_get_contents(__DIR__.'/index.html');
echo str_replace('</body>','<script src="/surveys/public/assets/portal-link.js?v=20261027-redirect"></script></body>',$html);
