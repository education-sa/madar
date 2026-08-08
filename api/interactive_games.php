<?php
declare(strict_types=1);

/**
 * سجل واجهات الألعاب الموجودة فعليًا في المشروع.
 * بيانات الدرس لا توضع هنا؛ مصدرها الوحيد teacher_interactive_games.
 */
function interactive_game_catalog(): array
{
    return [
        'percentage-challenge' => [
            'gameKey' => 'percentage-challenge',
            'playPath' => '/games/percentage.html',
        ],
    ];
}

function interactive_game_key(mixed $value): string
{
    $gameKey = strtolower(trim((string) $value));
    if (!preg_match('/^[a-z0-9][a-z0-9-]{1,99}$/', $gameKey)) {
        Http::json(['error' => 'معرّف اللعبة غير صالح.'], 422);
    }
    if (!isset(interactive_game_catalog()[$gameKey])) {
        Http::json(['error' => 'اللعبة المطلوبة غير موجودة في النظام.'], 404);
    }
    return $gameKey;
}

function interactive_games_table_exists(): bool
{
    static $exists = null;
    if ($exists !== null) return $exists;
    $exists = (bool) fetch_one(
        "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='teacher_interactive_games' LIMIT 1"
    );
    return $exists;
}

function interactive_games_require_table(): void
{
    if (!interactive_games_table_exists()) {
        Http::json([
            'error' => 'جدول الألعاب التفاعلية غير موجود بعد. شغّلي Migration الألعاب بعد مراجعته ثم أكملي إعداد اللعبة.',
            'code' => 'INTERACTIVE_GAMES_MIGRATION_REQUIRED',
        ], 503);
    }
}

function interactive_game_positive_int(mixed $value): ?int
{
    $number = filter_var($value, FILTER_VALIDATE_INT);
    return $number !== false && $number !== null && $number > 0 ? (int) $number : null;
}

function interactive_game_row(int $teacherId, string $gameKey, bool $activeOnly = false): ?array
{
    if (!interactive_games_table_exists()) return null;
    $sql = 'SELECT id,teacher_id,game_key,lesson_name,unit_number,lesson_number,time_mode,time_per_question_seconds,certificate_portfolio_enabled,is_active,created_at,updated_at
            FROM teacher_interactive_games WHERE teacher_id=? AND game_key=?';
    if ($activeOnly) $sql .= ' AND is_active=1';
    $sql .= ' LIMIT 1';
    return fetch_one($sql, [$teacherId, $gameKey]) ?: null;
}

function interactive_game_is_configured(?array $row): bool
{
    return $row !== null
        && interactive_game_positive_int($row['unit_number'] ?? null) !== null
        && interactive_game_positive_int($row['lesson_number'] ?? null) !== null
        && trim((string) ($row['lesson_name'] ?? '')) !== '';
}

function interactive_game_json(string $gameKey, ?array $row): array
{
    $catalog = interactive_game_catalog()[$gameKey];
    $configured = interactive_game_is_configured($row);
    return [
        'gameKey' => $gameKey,
        'playPath' => $catalog['playPath'],
        'exists' => $row !== null,
        'configured' => $configured,
        'lessonName' => $configured ? trim((string) $row['lesson_name']) : '',
        'unitNumber' => $configured ? (int) $row['unit_number'] : null,
        'lessonNumber' => $configured ? (int) $row['lesson_number'] : null,
        'timeMode' => $row && ($row['time_mode'] ?? '') === 'timed' ? 'timed' : 'open',
        'timePerQuestionSeconds' => $row && ($row['time_mode'] ?? '') === 'timed'
            ? interactive_game_positive_int($row['time_per_question_seconds'] ?? null)
            : null,
        'certificatePortfolioEnabled' => $row ? (bool) $row['certificate_portfolio_enabled'] : false,
        'isActive' => $row ? (bool) $row['is_active'] : false,
        'updatedAt' => $row['updated_at'] ?? null,
    ];
}

function interactive_games_for_teacher(int $teacherId, bool $activeOnly = false): array
{
    $rows = [];
    if (interactive_games_table_exists()) {
        $sql = 'SELECT id,teacher_id,game_key,lesson_name,unit_number,lesson_number,time_mode,time_per_question_seconds,certificate_portfolio_enabled,is_active,created_at,updated_at
                FROM teacher_interactive_games WHERE teacher_id=?';
        if ($activeOnly) $sql .= ' AND is_active=1';
        foreach (fetch_all($sql, [$teacherId]) as $row) {
            $rows[(string) $row['game_key']] = $row;
        }
    }

    $games = [];
    foreach (interactive_game_catalog() as $gameKey => $_catalog) {
        $row = $rows[$gameKey] ?? null;
        if ($activeOnly && (!$row || !(bool) $row['is_active'])) continue;
        $games[] = interactive_game_json($gameKey, $row);
    }
    return $games;
}

function teacher_interactive_games_routes(string $method, array $segments, int $teacherId): never
{
    if ($method === 'GET' && count($segments) === 0) {
        Http::json([
            'migrationReady' => interactive_games_table_exists(),
            'games' => interactive_games_for_teacher($teacherId),
        ]);
    }

    $gameKey = interactive_game_key($segments[0] ?? '');
    if ($method === 'GET') {
        Http::json(interactive_game_json($gameKey, interactive_game_row($teacherId, $gameKey)));
    }
    if ($method !== 'PUT') Http::json(['error' => 'الطريقة غير مسموحة.'], 405);

    interactive_games_require_table();
    $data = Http::input();
    $timerOnly = filter_var($data['timerOnly'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $current = interactive_game_row($teacherId, $gameKey);

    if ($timerOnly && !interactive_game_is_configured($current)) {
        Http::json(['error' => 'أكملي اسم الدرس ورقم الوحدة ورقم الدرس قبل ضبط مؤقت اللعبة.'], 422);
    }

    if ($timerOnly) {
        $lessonName = trim((string) $current['lesson_name']);
        $unitNumber = (int) $current['unit_number'];
        $lessonNumber = (int) $current['lesson_number'];
        $certificateEnabled = (bool) $current['certificate_portfolio_enabled'];
        $isActive = (bool) $current['is_active'];
    } else {
        $lessonName = academic_clean_text($data['lessonName'] ?? '', 190, 'اسم درس اللعبة', true);
        $unitNumber = interactive_game_positive_int($data['unitNumber'] ?? null);
        $lessonNumber = interactive_game_positive_int($data['lessonNumber'] ?? null);
        if ($unitNumber === null || $unitNumber > 999) Http::json(['error' => 'رقم الوحدة يجب أن يكون بين 1 و999.'], 422);
        if ($lessonNumber === null || $lessonNumber > 999) Http::json(['error' => 'رقم الدرس يجب أن يكون بين 1 و999.'], 422);
        $certificateEnabled = filter_var($data['certificatePortfolioEnabled'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        $isActive = filter_var($data['isActive'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($certificateEnabled === null || $isActive === null) Http::json(['error' => 'خيارات اللعبة غير صالحة.'], 422);
    }

    $timeMode = (string) ($data['timeMode'] ?? ($current['time_mode'] ?? 'open'));
    if (!in_array($timeMode, ['open', 'timed'], true)) Http::json(['error' => 'وضع وقت اللعبة غير صالح.'], 422);
    $timeSeconds = null;
    if ($timeMode === 'timed') {
        $timeSeconds = interactive_game_positive_int($data['timePerQuestionSeconds'] ?? ($current['time_per_question_seconds'] ?? null));
        if ($timeSeconds === null || $timeSeconds < 15 || $timeSeconds > 120) {
            Http::json(['error' => 'وقت السؤال المحدد يجب أن يكون بين 15 و120 ثانية.'], 422);
        }
    }

    execute_sql(
        'INSERT INTO teacher_interactive_games
         (teacher_id,game_key,lesson_name,unit_number,lesson_number,time_mode,time_per_question_seconds,certificate_portfolio_enabled,is_active)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE lesson_name=VALUES(lesson_name),unit_number=VALUES(unit_number),lesson_number=VALUES(lesson_number),time_mode=VALUES(time_mode),time_per_question_seconds=VALUES(time_per_question_seconds),certificate_portfolio_enabled=VALUES(certificate_portfolio_enabled),is_active=VALUES(is_active)',
        [$teacherId, $gameKey, $lessonName, $unitNumber, $lessonNumber, $timeMode, $timeSeconds, $certificateEnabled ? 1 : 0, $isActive ? 1 : 0]
    );
    Activity::log('teacher', $teacherId, 'تحديث لعبة تفاعلية', $gameKey . ' · ' . $lessonName);
    Http::json(interactive_game_json($gameKey, interactive_game_row($teacherId, $gameKey)), $current ? 200 : 201);
}
