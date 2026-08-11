<?php
declare(strict_types=1);

final class Http
{
    public static function json(array $payload, int $status = 200): never
    {
        // امسح أي تحذير أو فراغ طُبع قبل الاستجابة حتى يبقى الرد JSON صالحًا.
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        http_response_code($status);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
        }
        $json = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
        );
        echo $json === false ? '{"error":"تعذّر إنشاء استجابة الخادم."}' : $json;
        exit;
    }

    public static function input(): array
    {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (str_contains($contentType, 'application/json')) {
            $decoded = json_decode(file_get_contents('php://input') ?: '{}', true);
            return is_array($decoded) ? $decoded : [];
        }
        return $_POST;
    }

    public static function id(string $value): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if (!$id) {
            self::json(['error' => 'المعرّف غير صالح.'], 400);
        }
        return (int) $id;
    }

    public static function requireFields(array $data, array $fields): void
    {
        foreach ($fields as $field) {
            if (!isset($data[$field]) || trim((string) $data[$field]) === '') {
                self::json(['error' => 'يرجى إكمال جميع الحقول المطلوبة.'], 422);
            }
        }
    }

    public const SCHOOL_EMAIL_DOMAIN = 'mkhg.moe.gov.sa';

    public static function email(string $value): string
    {
        $email = mb_strtolower(trim($value));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) {
            self::json(['error' => 'البريد الإلكتروني غير صالح.'], 422);
        }
        return $email;
    }

    /**
     * يحوّل اسم المستخدم المدرسي إلى بريد كامل، ويمنع حفظ نطاق مختلف
     * لحسابات الطالبات والمعلمات. يقبل الاسم فقط أو البريد الكامل بالنطاق المعتمد.
     */
    public static function schoolEmail(string $value): string
    {
        $email = self::schoolEmailOrNull($value);
        if ($email === null) {
            self::json(['error' => 'اكتبي اسم المستخدم فقط؛ نطاق البريد الثابت هو @' . self::SCHOOL_EMAIL_DOMAIN . '.'], 422);
        }
        return $email;
    }

    public static function schoolEmailOrNull(string $value): ?string
    {
        $candidate = strtolower(trim($value));
        if ($candidate === '') return null;
        if (!str_contains($candidate, '@')) {
            $candidate .= '@' . self::SCHOOL_EMAIL_DOMAIN;
        }
        if (substr_count($candidate, '@') !== 1) return null;
        [$local, $domain] = explode('@', $candidate, 2);
        if ($local === '' || $domain !== self::SCHOOL_EMAIL_DOMAIN) return null;
        if (!filter_var($candidate, FILTER_VALIDATE_EMAIL) || strlen($candidate) > 190) return null;
        return $candidate;
    }

    public static function pagination(): array
    {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $pageSize = min(100, max(1, (int) ($_GET['pageSize'] ?? 10)));
        return [$page, $pageSize, ($page - 1) * $pageSize];
    }

    public static function rateLimit(string $scope,int $limit=5,int $windowSeconds=3600): void
    {
        $limit=max(1,min(500,$limit));$windowSeconds=max(10,min(86400,$windowSeconds));
        $ip=mb_substr((string)($_SERVER['REMOTE_ADDR']??'unknown'),0,45);
        $identityHash=hash('sha256','public-action|'.$scope);
        $cutoff=(new DateTimeImmutable('now'))->modify('-'.$windowSeconds.' seconds')->format('Y-m-d H:i:s');
        $pdo=Database::connection();
        $statement=$pdo->prepare('SELECT COUNT(*) FROM auth_login_attempts WHERE identity_hash=? AND ip_address=? AND attempted_at>=?');
        $statement->execute([$identityHash,$ip,$cutoff]);
        if((int)$statement->fetchColumn()>=$limit)self::json(['error'=>'طلبات كثيرة من هذا الاتصال. انتظري قليلًا ثم حاولي مجددًا.'],429);
        $pdo->prepare('INSERT INTO auth_login_attempts(identity_hash,ip_address) VALUES(?,?)')->execute([$identityHash,$ip]);
        if(random_int(1,100)===1)$pdo->exec('DELETE FROM auth_login_attempts WHERE attempted_at<DATE_SUB(NOW(),INTERVAL 1 DAY)');
    }
}
