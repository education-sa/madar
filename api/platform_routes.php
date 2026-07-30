<?php
declare(strict_types=1);

function handle_platform_routes(string $role, string $method, array $segments): never
{
    $resource=$segments[0]??'';
    if ($resource==='login'&&$method==='POST') public_login($role);
    if ($role==='parent' && $resource==='register' && $method==='POST') parent_public_register();
    if ($resource==='password-reset-request' && $method==='POST') public_password_reset_request($role==='admin'?'ADMIN':'PARENT');
    if ($resource==='logout'&&$method==='POST') logout_route($role);
    if ($resource==='me'&&$method==='GET') me_route($role);
    $user=Auth::requireRole($role);
    if (!in_array($method,['GET','HEAD'],true)) Auth::verifyCsrf();
    Auth::requirePermission('dashboard.view',false);
    if ($resource==='privacy') platform_privacy_routes($role,(int)$user['id'],$method);
    if ($role==='parent') {
        if ($resource==='enhancements') parent_enhancement_routes($method,array_slice($segments,1),(int)$user['id']);
        handle_parent_portal_routes($method,$segments,(int)$user['id']);
    }
    if ($role==='admin' && $resource==='enhancements') {
        admin_enhancement_routes($method,array_slice($segments,1),(int)$user['id']);
    }
    if ($resource==='summary'&&$method==='GET'&&$role==='admin') {
        Http::json([
            'teachers'=>(int)(fetch_one("SELECT COUNT(*) AS n FROM teachers WHERE deleted_at IS NULL")['n']??0),
            'students'=>(int)(fetch_one("SELECT COUNT(*) AS n FROM students WHERE deleted_at IS NULL")['n']??0),
            'tests'=>(int)(fetch_one('SELECT COUNT(*) AS n FROM tests')['n']??0),
            'roleCode'=>$user['roleCode'],
            'preview'=>Auth::previewContext(),
        ]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}
