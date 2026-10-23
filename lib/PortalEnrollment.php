<?php
declare(strict_types=1);
/** Pending Dhalim students use native accounts; approval never changes Madar access. */
final class PortalEnrollment
{
    public static function ensureSchema(): void
    {
        static $ready=false;if($ready)return;
        $pdo=Database::connection();
        // This DDL must run before any account/approval transaction.
        $pdo->exec("CREATE TABLE IF NOT EXISTS mb_student_enrollments (student_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,status ENUM('pending','approved') NOT NULL DEFAULT 'pending',class_id BIGINT UNSIGNED NULL,reviewed_by BIGINT UNSIGNED NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        // Recover only self-registrations positively identified by the existing audit event.
        // Disabled/revoked accounts with class membership are never made pending again.
        $pdo->exec("INSERT IGNORE INTO mb_student_enrollments(student_id) SELECT s.id FROM students s JOIN mb_students b ON b.madar_student_id=s.id AND b.school_enabled=0 JOIN mb_native_access a ON a.subject_type='student' AND a.subject_id=s.id AND a.access_mode='portal_only' AND a.portal_enabled=0 WHERE s.deleted_at IS NULL AND s.status='active' AND NOT EXISTS(SELECT 1 FROM mb_class_students c WHERE c.student_id=b.id) AND EXISTS(SELECT 1 FROM activity_log l WHERE l.action='طلب حساب طالب لبوابة ظليم' AND l.details LIKE CONCAT('student_id=',s.id,';%'))");
        $ready=true;
    }
    public static function record(PDO $pdo,int $student): void
    {
        $pdo->prepare('INSERT INTO mb_student_enrollments(student_id) VALUES (?)')->execute([$student]);
    }
    public static function pending(): array
    {
        return Database::connection()->query("SELECT e.student_id,s.name,s.email,s.stage,e.created_at FROM mb_student_enrollments e JOIN students s ON s.id=e.student_id AND s.status='active' AND s.deleted_at IS NULL JOIN mb_native_access a ON a.subject_type='student' AND a.subject_id=s.id AND a.access_mode='portal_only' AND a.portal_enabled=0 JOIN mb_students b ON b.madar_student_id=s.id AND b.school_enabled=0 WHERE e.status='pending' ORDER BY e.created_at,e.student_id LIMIT 500")->fetchAll(PDO::FETCH_ASSOC);
    }
    public static function approve(array $actor,int $student,int $class): void
    {
        $pdo=Database::connection();$pdo->beginTransaction();
        try{
            $q=$pdo->prepare("SELECT e.status,s.status AS native_status,s.deleted_at,b.id AS board_id,b.school_enabled,a.access_mode,a.portal_enabled FROM mb_student_enrollments e JOIN students s ON s.id=e.student_id JOIN mb_students b ON b.madar_student_id=s.id JOIN mb_native_access a ON a.subject_type='student' AND a.subject_id=s.id WHERE e.student_id=? FOR UPDATE");$q->execute([$student]);$r=$q->fetch(PDO::FETCH_ASSOC);
            if(!$r || $r['status']!=='pending')throw new DomainException('الطلب غير موجود أو تمت معالجته مسبقًا.',409);
            if($r['native_status']!=='active'||$r['deleted_at']!==null||$r['access_mode']!=='portal_only'||(int)$r['portal_enabled']||(int)$r['school_enabled'])throw new DomainException('تغيرت حالة الحساب؛ راجعي مالكة الموقع قبل الموافقة.',409);
            $q=$pdo->prepare('SELECT id FROM mb_classes WHERE id=? AND is_active=1 FOR UPDATE');$q->execute([$class]);if(!$q->fetchColumn())throw new DomainException('اختاري فصلًا نشطًا.',422);
            $pdo->prepare('INSERT IGNORE INTO mb_class_students(class_id,student_id) VALUES (?,?)')->execute([$class,$r['board_id']]);
            $pdo->prepare("UPDATE mb_student_enrollments SET status='approved',class_id=?,reviewed_by=?,reviewed_at=NOW() WHERE student_id=? AND status='pending'")->execute([$class,$actor['id'],$student]);
            $pdo->prepare('UPDATE mb_students SET school_enabled=1 WHERE id=?')->execute([$r['board_id']]);
            $pdo->prepare("UPDATE mb_native_access SET portal_enabled=1 WHERE subject_type='student' AND subject_id=? AND access_mode='portal_only'")->execute([$student]);
            $pdo->prepare("INSERT INTO mb_audit(actor_id,event_type,entity_type,entity_id,details) VALUES (?,'approve_student','student',?,?)")->execute([$actor['id'],$r['board_id'],'native_id='.$student.'; class_id='.$class]);
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
}
