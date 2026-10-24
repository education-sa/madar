<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user = Auth::realUser();
if (!$user || ($user['roleCode'] ?? '') !== Rbac::OWNER || ($user['role'] ?? '') !== 'owner' || ($user['subjectType'] ?? '') !== 'owner') {
    if (OwnerDelegation::allowed($user)) {
        unset($_SESSION['ms_return_after_login']);
    } else {
    header('Location: /owner/login.html');
    exit;
    }
}
// Owners stay in their original dashboard; ignore stale survey return targets.
unset($_SESSION['ms_return_after_login']);
$html=file_get_contents(__DIR__.'/protected/dashboard.html');
$html=str_replace('/owner/dashboard.js?v=9','/owner/dashboard.js?v=20261024-assistant-senior',$html);
echo str_replace('</body>','<script src="/surveys/public/assets/portal-link.js?v=20261023-owner"></script></body>',$html);
