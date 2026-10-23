<?php
// Load the canonical Madar session, autoloader, and authentication services.
$madarBootstrap=dirname(__DIR__,2).'/config/bootstrap.php';
if(!is_file($madarBootstrap)) throw new RuntimeException('لم يتم العثور على تهيئة مدار الأساسية.');
require_once $madarBootstrap;
return static function (): ?array {
    $u=Auth::realUser();
    if (!$u) return null;
    $owner=($u['role']??'')==='owner'&&($u['subjectType']??'')==='owner'&&($u['roleCode']??'')===Rbac::OWNER;
    $teacher=($u['role']??'')==='teacher'&&($u['subjectType']??'')==='teacher';
    return ['id'=>($u['subjectType']??$u['role']).':'.$u['id'],'name'=>$u['name'],'email'=>$u['email'],
      'verified'=>false,'active'=>($u['status']??'')==='active',
      'can_use_surveys'=>$owner||($teacher&&PortalAccess::canPortal($u)),'can_manage_surveys'=>$owner];
};
