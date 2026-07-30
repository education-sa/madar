<?php
declare(strict_types=1);

function fetch_one(string $sql, array $params = []): ?array
{
    $stmt = Database::connection()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row ?: null;
}

function fetch_all(string $sql, array $params = []): array
{
    $stmt = Database::connection()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function execute_sql(string $sql, array $params = []): PDOStatement
{
    $stmt = Database::connection()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function normalize_answer(string $value): string
{
    $value = trim(mb_strtolower($value, 'UTF-8'));
    // تقبل الطالبة الأرقام والرموز العربية الظاهرة في اختبارات الابتدائي
    // والمتوسط، حتى لو كان السؤال الأصلي مستوردًا بصيغة لاتينية.
    $value = strtr($value, [
        '٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4',
        '٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9',
        '٫'=>'.','٬'=>'','−'=>'-','–'=>'-','×'=>'*','÷'=>'/',
        '⁰'=>'^0','¹'=>'^1','²'=>'^2','³'=>'^3','⁴'=>'^4',
        '⁵'=>'^5','⁶'=>'^6','⁷'=>'^7','⁸'=>'^8','⁹'=>'^9',
    ]);
    $value = preg_replace('/(?<!\p{L})س(?!\p{L})/u', 'x', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ص(?!\p{L})/u', 'y', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ع(?!\p{L})/u', 'z', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})[أا](?!\p{L})/u', 'a', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ب(?!\p{L})/u', 'b', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ج(?:ـ)?(?!\p{L})/u', 'c', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})د(?!\p{L})/u', 'd', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ف(?!\p{L})/u', 'f', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ه(?:ـ)?(?!\p{L})/u', 'h', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ك(?!\p{L})/u', 'k', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ل(?!\p{L})/u', 'l', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})م(?!\p{L})/u', 'm', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ن(?!\p{L})/u', 'n', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ق(?!\p{L})/u', 'q', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})ر(?!\p{L})/u', 'r', $value) ?? $value;
    $value = preg_replace('/(?<!\p{L})و(?!\p{L})/u', 'w', $value) ?? $value;
    if (in_array($value, ['true','صحيح'], true)) {
        $value = 'صح';
    } elseif (in_array($value, ['false','غير صحيح'], true)) {
        $value = 'خطأ';
    }
    $value = str_replace(['أ', 'إ', 'آ', 'ى', 'ة', 'ـ'], ['ا', 'ا', 'ا', 'ي', 'ه', ''], $value);
    $value = preg_replace('/[ًٌٍَُِّْ]/u', '', $value) ?? $value;
    $value = preg_replace('/[^\p{L}\p{N}.\-\/]+/u', ' ', $value) ?? $value;
    return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
}

function teacher_owns_class(int $teacherId, ?int $classId): bool
{
    if (!$classId) {
        return true;
    }
    return (bool) fetch_one('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [$classId, $teacherId]);
}

function teacher_owns_student(int $teacherId, int $studentId): bool
{
    return (bool) fetch_one(
        'SELECT s.id FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = ? AND c.teacher_id = ? AND s.deleted_at IS NULL',
        [$studentId, $teacherId]
    );
}

function teacher_owns_test(int $teacherId, int $testId): bool
{
    return (bool) fetch_one('SELECT id FROM tests WHERE id = ? AND teacher_id = ?', [$testId, $teacherId]);
}

function route_id(array $segments, int $index): int
{
    return Http::id((string) ($segments[$index] ?? ''));
}

function json_options(mixed $value): ?array
{
    if ($value === null || $value === '') {
        return null;
    }
    if (is_array($value)) {
        return array_values(array_map('strval', $value));
    }
    $decoded = json_decode((string) $value, true);
    return is_array($decoded) ? array_values(array_map('strval', $decoded)) : null;
}

function map_question_row(array $row): array
{
    $row['options'] = json_options($row['options_json'] ?? null);
    unset($row['options_json']);
    return $row;
}
