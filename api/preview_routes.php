<?php
declare(strict_types=1);

function handle_preview_routes(string $method, array $segments): never
{
    $resource=$segments[0]??'context';
    if ($resource==='context'&&$method==='GET') {
        $real=Auth::realUser();
        if (!$real || ($real['roleCode']??'')!==Rbac::OWNER) Http::json(['active'=>false]);
        Http::json([
            'active'=>Auth::isOwnerPreview(),
            'preview'=>Auth::previewContext(),
            'owner'=>['id'=>$real['id'],'name'=>$real['name'],'roleCode'=>$real['roleCode']],
            'csrfToken'=>$_SESSION['csrf_token']??($_SESSION['csrf_token']=bin2hex(random_bytes(32))),
        ]);
    }
    if ($resource==='stop'&&$method==='POST') {
        $owner=Auth::requireRealOwner();Auth::verifyCsrf();
        $context=Auth::previewContext();
        if (!empty($context['active'])) Activity::log('owner',(int)$owner['id'],'إنهاء معاينة دور',(string)($context['roleCode']??''));
        Auth::stopPreview(true);
        Http::json(['ok'=>true,'redirect'=>'/owner/dashboard']);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}
