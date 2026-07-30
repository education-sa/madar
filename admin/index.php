<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user=Auth::user();
if(!$user || ($user['roleCode']??'')!==Rbac::ADMIN){header('Location: /login.html?role=staff');exit;}
readfile(__DIR__.'/index.html');
