<?php
declare(strict_types=1);
/** Administrative delegation keeps native teacher identity and credentials intact. */
final class OwnerDelegation {
    private static bool $ensured=false;
    public static function ensureSchema(): void {
        if(self::$ensured)return;
        Database::connection()->exec("CREATE TABLE IF NOT EXISTS owner_teacher_delegations (teacher_id BIGINT UNSIGNED PRIMARY KEY,owner_id BIGINT UNSIGNED NOT NULL,granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT fk_delegate_teacher FOREIGN KEY(teacher_id) REFERENCES teachers(id),CONSTRAINT fk_delegate_owner FOREIGN KEY(owner_id) REFERENCES owners(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        self::$ensured=true;
    }
    public static function grantor(array $u): ?array {
        if(($u['subjectType']??'')!=='teacher'||($u['role']??'')!=='teacher'||($u['status']??'')!=='active')return null;
        // No schema changes during authentication; install only when the owner edits a role.
        try {
            $q=Database::connection()->prepare("SELECT o.id,o.name,o.email,o.status FROM owner_teacher_delegations d JOIN owners o ON o.id=d.owner_id AND o.status='active' JOIN teachers t ON t.id=d.teacher_id AND t.status='active' AND t.deleted_at IS NULL WHERE d.teacher_id=?");
            $q->execute([(int)$u['id']]);$r=$q->fetch();return $r?:null;
        }catch(PDOException $e){if((int)($e->errorInfo[1]??0)===1146)return null;throw $e;}
    }
    public static function allowed(?array $u): bool {return $u!==null && self::grantor($u)!==null;}
    public static function context(): array {
        $u=Auth::realUser();
        if($u && PortalAccess::owner($u))return $u;
        $owner=$u?self::grantor($u):null;
        if(!$owner)Http::json(['error'=>'لا تملكين صلاحية لوحة المالكة.'],403);
        // Legacy owner_id foreign keys refer to the delegating owner; audit uses the native teacher.
        return ['id'=>(int)$owner['id'],'name'=>$u['name'],'email'=>$u['email'],'status'=>'active','role'=>'owner','subjectType'=>'owner','roleCode'=>Rbac::OWNER,'permissions'=>Rbac::permissionsForRole(Rbac::OWNER),'delegated'=>true,'teacher_id'=>(int)$u['id']];
    }
}
