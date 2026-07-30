<?php
declare(strict_types=1);

final class Activity
{
    private static ?bool $hasAcademicYear = null;

    private static function hasAcademicYearColumn(): bool
    {
        if (self::$hasAcademicYear !== null) return self::$hasAcademicYear;
        try {
            $stmt=Database::connection()->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='activity_log' AND column_name='academic_year' LIMIT 1");
            $stmt->execute();
            self::$hasAcademicYear=(bool)$stmt->fetchColumn();
        } catch (Throwable $ignored) { self::$hasAcademicYear=false; }
        return self::$hasAcademicYear;
    }

    private static function academicYearFor(string $role, ?int $actorId): ?string
    {
        if (!$actorId) return null;
        try {
            $pdo=Database::connection();
            if ($role==='teacher') {
                $stmt=$pdo->prepare("SELECT NULLIF(TRIM(academic_year),'') FROM teacher_school_settings WHERE teacher_id=?");
                $stmt->execute([$actorId]);
                return $stmt->fetchColumn()?:null;
            }
            if ($role==='student') {
                $stmt=$pdo->prepare("SELECT NULLIF(TRIM(ts.academic_year),'') FROM students s JOIN classes c ON c.id=s.class_id LEFT JOIN teacher_school_settings ts ON ts.teacher_id=c.teacher_id WHERE s.id=? LIMIT 1");
                $stmt->execute([$actorId]);
                return $stmt->fetchColumn()?:null;
            }
            if ($role==='owner') {
                $value=$pdo->query("SELECT NULLIF(TRIM(academic_year),'') FROM site_school_settings WHERE id=1")->fetchColumn();
                return $value?:null;
            }
        } catch (Throwable $ignored) {}
        return null;
    }

    public static function log(string $role, ?int $actorId, string $action, ?string $details = null): void
    {
        self::logDetailed($role,$actorId,$action,$details,null,null);
    }

    public static function logDetailed(string $role, ?int $actorId, string $action, ?string $details = null, mixed $before = null, mixed $after = null): void
    {
        try {
            Rbac::ensureSchema();
            $previewRole=null;
            $realRole=$role;
            $realActorId=$actorId;
            if (!empty($_SESSION['preview_role']) && (int)($_SESSION['preview_owner_id']??0)>0) {
                $previewRole=Rbac::normalizeRole((string)$_SESSION['preview_role']);
                $realRole='owner';
                $realActorId=(int)$_SESSION['preview_owner_id'];
                $details='[وضع المعاينة كدور '.($previewRole).']'.($details?' '.$details:'');
            }
            $beforeJson=self::encodeSafe($before);
            $afterJson=self::encodeSafe($after);
            $pdo=Database::connection();
            $ip=$_SERVER['REMOTE_ADDR']??null;
            $agent=mb_substr((string)($_SERVER['HTTP_USER_AGENT']??''),0,500);
            if (self::hasAcademicYearColumn()) {
                $academicYear=self::academicYearFor($realRole,$realActorId);
                $stmt=$pdo->prepare('INSERT INTO activity_log(actor_role,actor_id,real_actor_role,real_actor_id,preview_role,academic_year,action,details,before_data,after_data,ip_address,user_agent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
                $stmt->execute([$realRole,$realActorId,$role,$actorId,$previewRole,$academicYear,$action,$details,$beforeJson,$afterJson,$ip,$agent]);
            } else {
                $stmt=$pdo->prepare('INSERT INTO activity_log(actor_role,actor_id,real_actor_role,real_actor_id,preview_role,action,details,before_data,after_data,ip_address,user_agent) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
                $stmt->execute([$realRole,$realActorId,$role,$actorId,$previewRole,$action,$details,$beforeJson,$afterJson,$ip,$agent]);
            }
        } catch (Throwable $error) {
            try {
                $stmt=Database::connection()->prepare('INSERT INTO activity_log(actor_role,actor_id,action,details,ip_address) VALUES(?,?,?,?,?)');
                $stmt->execute([$role,$actorId,$action,$details,$_SERVER['REMOTE_ADDR']??null]);
            } catch (Throwable $ignored) {}
        }
    }

    private static function encodeSafe(mixed $value): ?string
    {
        if ($value===null) return null;
        $safe=self::sanitize($value);
        $json=json_encode($safe,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);
        return $json===false?null:$json;
    }

    private static function sanitize(mixed $value): mixed
    {
        if (!is_array($value)) return is_scalar($value)?$value:null;
        $result=[];
        foreach ($value as $key=>$item) {
            $normalized=strtolower((string)$key);
            if (preg_match('/password|pass_hash|password_hash|token|secret|otp|csrf|authorization/',$normalized)) {
                $result[$key]='[محجوب]';
                continue;
            }
            $result[$key]=is_array($item)?self::sanitize($item):(is_scalar($item)||$item===null?$item:'[قيمة غير قابلة للتسجيل]');
        }
        return $result;
    }
}
