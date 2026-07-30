<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user=Auth::user();
if(!$user || ($user['roleCode']??'')!==Rbac::PARENT){header('Location: /login.html?role=parent');exit;}
readfile(__DIR__.'/index.html');
