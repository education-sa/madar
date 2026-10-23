<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user = Auth::realUser();
if (!$user || ($user['roleCode'] ?? '') !== Rbac::OWNER || ($user['role'] ?? '') !== 'owner' || ($user['subjectType'] ?? '') !== 'owner') {
    header('Location: /owner/login.html');
    exit;
}
if (!empty($_SESSION['ms_return_after_login'])) {
    $next=(string)$_SESSION['ms_return_after_login'];unset($_SESSION['ms_return_after_login']);
    if (str_starts_with($next,'/surveys/public/')&&!str_contains($next,"\r")&&!str_contains($next,"\n")) {header('Location: '.$next);exit;}
}
$html=file_get_contents(__DIR__.'/protected/dashboard.html');
$html=str_replace('/owner/dashboard.js?v=9','/owner/dashboard.js?v=20261023-unified-settings',$html);
echo str_replace('</body>','<script src="/surveys/public/assets/portal-link.js?v=20261023-owner"></script></body>',$html);
