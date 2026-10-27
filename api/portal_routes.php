<?php
declare(strict_types=1);
function owner_portal_routes(string $method,array $segments,array $owner): never {
    if(($segments[0]??'')==='install' && $method==='POST'){
        Auth::requireRealOwner();
        if(empty(Http::input()['confirmed']))Http::json(['error'=>'يلزم تأكيد تهيئة الربط.'],409);
        $pdo=Database::connection();
        foreach(['surveys/database/migrations/20261022_my_board.sql','surveys/database/migrations/20261023_school_permissions.sql','database/migration_20261023_zulaim_unified.sql'] as $file)$pdo->exec(file_get_contents(MADAR_ROOT.'/'.$file));
        Http::json(['ok'=>true]);
    }
    if(!PortalAccess::ready())Http::json(['error'=>'يلزم تثبيت ترحيل بوابة ظليم الإضافي.'],503);
    $type=(string)($segments[0]??'');
    if($type==='audit'&&$method==='GET'){Http::json(['items'=>fetch_all('SELECT a.*,o.name AS actor FROM mb_access_audit a JOIN owners o ON o.id=a.owner_id ORDER BY a.id DESC LIMIT 200')]);}
    if(!in_array($type,['teacher','student','platform'],true))Http::json(['error'=>'نوع الحساب غير صالح.'],422);
    if(count($segments)===1 && $method==='GET'){
        $table=['teacher'=>'teachers','student'=>'students','platform'=>'platform_users'][$type];
        $rows=fetch_all('SELECT id,status FROM '.$table.' WHERE deleted_at IS NULL'.($type==='platform'?" AND role_code='PARENT'":'').' ORDER BY id');
        foreach($rows as &$row)$row=array_merge($row,PortalAccess::state(['subjectType'=>$type,'id'=>(int)$row['id'],'role'=>$type==='platform'?'parent':$type,'status'=>$row['status']]));
        Http::json(['items'=>$rows]);
    }
    if($type==='teacher' && count($segments)===3 && $segments[2]==='settings' && $method==='GET'){
        $id=filter_var($segments[1],FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if(!$id)Http::json(['error'=>'معرّف غير صالح.'],422);
        Http::json(PortalAccess::teacherSettings((int)$id));
    }
    if(count($segments)===2 && $method==='PUT'){
        $id=filter_var($segments[1],FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if(!$id)Http::json(['error'=>'معرّف غير صالح.'],422);
        PortalAccess::update($owner,$type,$id,Http::input());Http::json(['ok'=>true]);
    }
    Http::json(['error'=>'مسار غير متاح.'],405);
}
function handle_portal_routes(string $method,array $segments): never {
    $u=Auth::user();if(!$u)Http::json(['error'=>'يلزم تسجيل الدخول.'],401);
    if($method==='GET'&&($segments[0]??'')==='access')Http::json(['access'=>PortalAccess::state($u),'allowed'=>PortalAccess::canPortal($u),'can_madar'=>PortalAccess::canMadar($u),'is_owner'=>PortalAccess::owner($u),'url'=>PortalAccess::destination($u)]);
    PortalAccess::requirePortal($u);
    if($method==='GET'&&($segments[0]??'')==='children'&&($u['role']??'')==='parent'){
        $rows=fetch_all("SELECT s.id,s.name,c.title AS class_name FROM parent_student_links l JOIN students s ON s.id=l.student_id AND s.status='active' AND s.deleted_at IS NULL LEFT JOIN mb_students bs ON bs.madar_student_id=s.id LEFT JOIN mb_class_students cs ON cs.student_id=bs.id LEFT JOIN mb_classes c ON c.id=cs.class_id AND c.is_active=1 WHERE l.parent_id=? AND l.status='active' ORDER BY s.name,c.title",[$u['id']]);
        Http::json(['items'=>$rows]);
    }
    Http::json(['error'=>'مسار غير متاح.'],404);
}
