<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user=Auth::user();
if(!$user || ($user['roleCode']??'')!==Rbac::PARENT){header('Location: /login.html?role=parent');exit;}
PortalAccess::pageGuard($user);
$html=file_get_contents(__DIR__.'/index.html');
echo str_replace('</body>','<script src="/surveys/public/assets/portal-link.js?v=20261023"></script></body>',$html);
