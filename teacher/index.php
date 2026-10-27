<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user = Auth::user();
if (!$user || $user['role'] !== 'teacher') {
    header('Location: /teacher/login.html');
    exit;
}
if (!empty($_SESSION['ms_return_after_login'])) {
    $next=(string)$_SESSION['ms_return_after_login'];unset($_SESSION['ms_return_after_login']);
    $next=PortalAccess::returnTarget($next);
    if(PortalAccess::canPortal($user)){header('Location: '.$next);exit;}
}
PortalAccess::pageGuard($user);
$html=file_get_contents(__DIR__.'/index.html');
echo str_replace('</body>','<script src="/surveys/public/assets/portal-link.js?v=20261027-redirect"></script></body>',$html);
