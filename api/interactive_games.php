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
            'playPath' => '/games/percentage/percentage.html',
        ],
    ];
}

function interactive_game_key(mixed $value): string
{
    $gameKey = strtolower(trim((string) $value));
    if (!preg_match('/^[a-z0-9][a-z0-9-]{1,99}$/', $gameKey)) {
        Http::json(['error' => 'معرّف اللعبة غير صالح.'], 422);
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

function interactive_games_missing_columns(): array
{
    static $missing = null;
    if ($missing !== null) return $missing;
    if (!interactive_games_table_exists()) return $missing = ['teacher_interactive_games'];
    $required = [
        'id','teacher_id','game_key','lesson_name','unit_number','lesson_number','stage','grade_label',
        'time_mode','time_per_question_seconds','certificate_portfolio_enabled','is_active','created_at','updated_at',
    ];
    $rows = fetch_all(
        "SELECT COLUMN_NAME AS schema_column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='teacher_interactive_games'"
    );
    $available = array_fill_keys(array_map(static fn(array $row): string => strtolower((string)$row['schema_column_name']), $rows), true);
    return $missing = array_values(array_filter($required, static fn(string $column): bool => !isset($available[$column])));
}

function interactive_games_schema_ready(): bool
{
    return interactive_games_table_exists() && interactive_games_missing_columns() === [];
}

function interactive_games_publication_missing_columns(): array
{
    static $missing = null;
    if ($missing !== null) return $missing;
    if (!interactive_games_table_exists()) return $missing = ['teacher_interactive_games'];
    $required = ['semester','class_id'];
    $rows = fetch_all(
        "SELECT COLUMN_NAME AS schema_column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='teacher_interactive_games'"
    );
    $available = array_fill_keys(array_map(static fn(array $row): string => strtolower((string)$row['schema_column_name']), $rows), true);
    return $missing = array_values(array_filter($required, static fn(string $column): bool => !isset($available[$column])));
}

function interactive_games_publication_schema_ready(): bool
{
    return interactive_games_schema_ready() && interactive_games_publication_missing_columns() === [];
}

function interactive_games_require_table(): void
{
    if (!interactive_games_schema_ready()) {
        Http::json([
            'error' => interactive_games_table_exists()
                ? 'بنية الألعاب تحتاج إلى التحديث. شغّلي ملف migration_20260808_interactive_game_audience.sql مرة واحدة.'
                : 'جدول الألعاب التفاعلية غير موجود بعد. شغّلي Migration الألعاب بعد مراجعته ثم أكملي إعداد اللعبة.',
            'code' => 'INTERACTIVE_GAMES_MIGRATION_REQUIRED',
            'missingColumns' => interactive_games_missing_columns(),
        ], 503);
    }
}

function interactive_games_require_publication_schema(): void
{
    interactive_games_require_table();
    if (!interactive_games_publication_schema_ready()) {
        Http::json([
            'error' => 'يلزم تشغيل ملف migration_20260808_interactive_game_publication.sql مرة واحدة لإضافة الترم ونطاق النشر.',
            'code' => 'INTERACTIVE_GAME_PUBLICATION_MIGRATION_REQUIRED',
            'missingColumns' => interactive_games_publication_missing_columns(),
        ], 503);
    }
}

function interactive_game_positive_int(mixed $value): ?int
{
    $number = filter_var($value, FILTER_VALIDATE_INT);
    return $number !== false && $number !== null && $number > 0 ? (int) $number : null;
}

function interactive_game_grade_catalog(): array
{
    return [
        'ابتدائي' => ['رابع ابتدائي','خامس ابتدائي','سادس ابتدائي'],
        'متوسط' => ['أول متوسط','ثاني متوسط','ثالث متوسط'],
        'ثانوي' => ['أول ثانوي','ثاني ثانوي','ثالث ثانوي'],
    ];
}

function interactive_game_target(string $stage, string $gradeLabel): array
{
    $stage = trim($stage);
    $gradeLabel = trim($gradeLabel);
    if ($stage === 'all') return ['all','all'];
    $catalog = interactive_game_grade_catalog();
    if (!isset($catalog[$stage])) Http::json(['error' => 'المرحلة المستهدفة غير صالحة.'], 422);
    if ($gradeLabel !== 'all' && !in_array($gradeLabel, $catalog[$stage], true)) {
        Http::json(['error' => 'الصف لا يتبع المرحلة المختارة.'], 422);
    }
    return [$stage,$gradeLabel];
}

function interactive_game_semester(mixed $value): string
{
    $semester = trim((string) $value);
    if (!in_array($semester, ['first','second'], true)) {
        Http::json(['error' => 'اختاري الترم الأول أو الترم الثاني قبل حفظ اللعبة أو نشرها.'], 422);
    }
    return $semester;
}

function interactive_game_target_class(int $teacherId, mixed $classId): array
{
    $classId = interactive_game_positive_int($classId);
    if ($classId === null) Http::json(['error' => 'اختاري الفصل المطلوب نشر اللعبة له.'], 422);
    $class = fetch_one('SELECT id,stage,grade_label,name FROM classes WHERE id=? AND teacher_id=? LIMIT 1', [$classId,$teacherId]);
    if (!$class) Http::json(['error' => 'الفصل المحدد غير موجود ضمن فصول المعلمة.'], 422);
    $stage = trim((string) $class['stage']);
    $gradeLabel = interactive_game_normalize_grade_label($stage, (string) $class['grade_label']);
    [$stage,$gradeLabel] = interactive_game_target($stage, $gradeLabel);
    return [$stage,$gradeLabel,(int)$class['id']];
}

function interactive_game_normalize_grade_label(string $stage, string $gradeLabel): string
{
    $text = preg_replace('/\s+/u', ' ', trim($gradeLabel)) ?? trim($gradeLabel);
    $text = preg_replace('/^الصف\s+/u', '', $text) ?? $text;
    $ordinal = '';
    if (preg_match('/(?:الأول|الاول|أول|اول)/u', $text)) $ordinal = 'أول';
    elseif (preg_match('/(?:الثاني|ثاني)/u', $text)) $ordinal = 'ثاني';
    elseif (preg_match('/(?:الثالث|ثالث)/u', $text)) $ordinal = 'ثالث';
    elseif (preg_match('/(?:الرابع|رابع)/u', $text)) $ordinal = 'رابع';
    elseif (preg_match('/(?:الخامس|خامس)/u', $text)) $ordinal = 'خامس';
    elseif (preg_match('/(?:السادس|سادس)/u', $text)) $ordinal = 'سادس';
    if ($ordinal !== '' && in_array($stage, ['ابتدائي','متوسط','ثانوي'], true)) return $ordinal . ' ' . $stage;
    return $text;
}

function interactive_game_targets_student(
    ?array $row,
    string $studentStage,
    string $studentGradeLabel,
    int $studentClassId = 0,
    string $studentSemester = ''
): bool
{
    if (!$row) return false;
    $targetStage = trim((string) ($row['stage'] ?? ''));
    $targetGrade = trim((string) ($row['grade_label'] ?? ''));
    $targetClassId = (int) ($row['class_id'] ?? 0);
    $targetSemester = trim((string) ($row['semester'] ?? ''));
    $studentStage = trim($studentStage);
    return ($targetSemester === '' || $targetSemester === $studentSemester)
        && ($targetClassId === 0 || $targetClassId === $studentClassId)
        && ($targetStage === 'all' || $targetStage === $studentStage)
        && ($targetGrade === 'all'
            || interactive_game_normalize_grade_label($targetStage,$targetGrade)
                === interactive_game_normalize_grade_label($studentStage,$studentGradeLabel));
}

function interactive_game_select_columns(): string
{
    $publicationColumns = interactive_games_publication_schema_ready()
        ? ',semester,class_id'
        : ',NULL AS semester,NULL AS class_id';
    return 'id,teacher_id,game_key,lesson_name,unit_number,lesson_number,stage,grade_label'
        . $publicationColumns
        . ',time_mode,time_per_question_seconds,certificate_portfolio_enabled,is_active,created_at,updated_at';
}

function interactive_game_row(int $teacherId, string $gameKey, bool $activeOnly = false): ?array
{
    if (!interactive_games_schema_ready()) return null;
    $sql = 'SELECT ' . interactive_game_select_columns()
        . ' FROM teacher_interactive_games WHERE teacher_id=? AND game_key=?';
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
    $catalog = interactive_game_catalog()[$gameKey] ?? [
        'playPath' => $row && !empty($row['id']) ? '/games/game-player.php?game=' . (int)$row['id'] : '',
    ];
    $configured = interactive_game_is_configured($row);
    return [
        'gameKey' => $gameKey,
        'playPath' => $catalog['playPath'],
        'exists' => $row !== null,
        'configured' => $configured,
        'lessonName' => $configured ? trim((string) $row['lesson_name']) : '',
        'unitNumber' => $configured ? (int) $row['unit_number'] : null,
        'lessonNumber' => $configured ? (int) $row['lesson_number'] : null,
        'stage' => $row ? (string) $row['stage'] : 'all',
        'gradeLabel' => $row ? (string) $row['grade_label'] : 'all',
        'semester' => $row && in_array((string)($row['semester'] ?? ''), ['first','second'], true)
            ? (string)$row['semester']
            : null,
        'classId' => $row && (int)($row['class_id'] ?? 0) > 0 ? (int)$row['class_id'] : null,
        'timeMode' => $row && ($row['time_mode'] ?? '') === 'timed' ? 'timed' : 'open',
        'timePerQuestionSeconds' => $row && ($row['time_mode'] ?? '') === 'timed'
            ? interactive_game_positive_int($row['time_per_question_seconds'] ?? null)
            : null,
        'certificatePortfolioEnabled' => $row ? (bool) $row['certificate_portfolio_enabled'] : false,
        'isActive' => $row ? (bool) $row['is_active'] : false,
        'updatedAt' => $row['updated_at'] ?? null,
    ];
}

function interactive_games_for_teacher(
    int $teacherId,
    bool $activeOnly = false,
    ?string $studentStage = null,
    ?string $studentGradeLabel = null,
    int $studentClassId = 0,
    string $studentSemester = ''
): array
{
    $rows = [];
    if (interactive_games_schema_ready()) {
        $sql = 'SELECT ' . interactive_game_select_columns() . ' FROM teacher_interactive_games WHERE teacher_id=?';
        if ($activeOnly) $sql .= ' AND is_active=1';
        foreach (fetch_all($sql, [$teacherId]) as $row) {
            $rows[(string) $row['game_key']] = $row;
        }
    }

    $games = [];
    foreach (interactive_game_catalog() as $gameKey => $_catalog) {
        $row = $rows[$gameKey] ?? null;
        if ($activeOnly && (!$row || !(bool) $row['is_active'])) continue;
        if ($studentStage !== null && $studentGradeLabel !== null
            && !interactive_game_targets_student($row,$studentStage,$studentGradeLabel,$studentClassId,$studentSemester)) continue;
        $games[] = interactive_game_json($gameKey, $row);
    }
    return $games;
}

function teacher_interactive_games_routes(string $method, array $segments, int $teacherId): never
{
    if ($method === 'GET' && count($segments) === 0) {
        Http::json([
            'migrationReady' => interactive_games_schema_ready(),
            'missingColumns' => interactive_games_missing_columns(),
            'publicationReady' => interactive_games_publication_schema_ready(),
            'publicationMissingColumns' => interactive_games_publication_missing_columns(),
            'games' => interactive_games_for_teacher($teacherId),
        ]);
    }

    $gameKey = interactive_game_key($segments[0] ?? '');
    if ($method === 'GET' && count($segments) === 1) {
        Http::json(interactive_game_json($gameKey, interactive_game_row($teacherId, $gameKey)));
    }
    if ($method !== 'PUT') Http::json(['error' => 'الطريقة غير مسموحة.'], 405);

    interactive_games_require_table();
    $data = Http::input();
    $publicationOnly = ($segments[1] ?? '') === 'publication';
    $timerOnly = filter_var($data['timerOnly'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $current = interactive_game_row($teacherId, $gameKey);

    if ($publicationOnly) {
        interactive_games_require_publication_schema();
        if (!interactive_game_is_configured($current)) {
            Http::json(['error' => 'أكملي اسم الدرس ورقم الوحدة ورقم الدرس قبل نشر اللعبة.'], 422);
        }
        $isActive = filter_var($data['isActive'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($isActive === null) Http::json(['error' => 'حالة نشر اللعبة غير صالحة.'], 422);
        if (!$isActive) {
            execute_sql('UPDATE teacher_interactive_games SET is_active=0 WHERE teacher_id=? AND game_key=?', [$teacherId,$gameKey]);
            Activity::log('teacher', $teacherId, 'إيقاف نشر لعبة تفاعلية', $gameKey);
            Http::json(interactive_game_json($gameKey, interactive_game_row($teacherId, $gameKey)));
        }

        $semester = interactive_game_semester($data['semester'] ?? '');
        $publishAll = filter_var($data['publishAll'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($publishAll) {
            [$stage,$gradeLabel] = ['all','all'];
            $classId = null;
        } else {
            [$stage,$gradeLabel,$classId] = interactive_game_target_class($teacherId, $data['classId'] ?? null);
        }
        execute_sql(
            'UPDATE teacher_interactive_games SET semester=?,stage=?,grade_label=?,class_id=?,is_active=1 WHERE teacher_id=? AND game_key=?',
            [$semester,$stage,$gradeLabel,$classId,$teacherId,$gameKey]
        );
        Activity::log('teacher', $teacherId, 'نشر لعبة تفاعلية', $gameKey . ($publishAll ? ' · الجميع' : ' · الفصل ' . $classId));
        Http::json(interactive_game_json($gameKey, interactive_game_row($teacherId, $gameKey)));
    }

    if (count($segments) !== 1) Http::json(['error' => 'المسار المطلوب غير موجود.'], 404);

    if ($timerOnly && !interactive_game_is_configured($current)) {
        Http::json(['error' => 'أكملي اسم الدرس ورقم الوحدة ورقم الدرس قبل ضبط مؤقت اللعبة.'], 422);
    }

    if ($timerOnly) {
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
            'UPDATE teacher_interactive_games SET time_mode=?,time_per_question_seconds=? WHERE teacher_id=? AND game_key=?',
            [$timeMode,$timeSeconds,$teacherId,$gameKey]
        );
        Activity::log('teacher', $teacherId, 'تحديث مؤقت لعبة تفاعلية', $gameKey);
        Http::json(interactive_game_json($gameKey, interactive_game_row($teacherId, $gameKey)));
    } else {
        interactive_games_require_publication_schema();
        $lessonName = academic_clean_text($data['lessonName'] ?? '', 190, 'اسم درس اللعبة', true);
        $unitNumber = interactive_game_positive_int($data['unitNumber'] ?? null);
        $lessonNumber = interactive_game_positive_int($data['lessonNumber'] ?? null);
        if ($unitNumber === null || $unitNumber > 999) Http::json(['error' => 'رقم الوحدة يجب أن يكون بين 1 و999.'], 422);
        if ($lessonNumber === null || $lessonNumber > 999) Http::json(['error' => 'رقم الدرس يجب أن يكون بين 1 و999.'], 422);
        [$stage,$gradeLabel] = interactive_game_target(
            (string) ($data['stage'] ?? ''),
            (string) ($data['gradeLabel'] ?? '')
        );
        $semester = interactive_game_semester($data['semester'] ?? '');
        $classId = null;
        $requestedClassId = interactive_game_positive_int($data['classId'] ?? null);
        if ($requestedClassId !== null) {
            [$classStage,$classGradeLabel,$validatedClassId] = interactive_game_target_class($teacherId, $requestedClassId);
            if ($stage !== $classStage || $gradeLabel !== $classGradeLabel) {
                Http::json(['error' => 'الفصل المحدد لا يتبع المرحلة والصف المختارين. عدّلي النطاق أو اختاري فصلًا مطابقًا.'], 422);
            }
            $classId = $validatedClassId;
        }
        $certificateEnabled = filter_var($data['certificatePortfolioEnabled'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        $isActive = filter_var($data['isActive'] ?? ($current ? (bool)$current['is_active'] : false), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
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
         (teacher_id,game_key,lesson_name,unit_number,lesson_number,stage,grade_label,semester,class_id,time_mode,time_per_question_seconds,certificate_portfolio_enabled,is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE lesson_name=VALUES(lesson_name),unit_number=VALUES(unit_number),lesson_number=VALUES(lesson_number),stage=VALUES(stage),grade_label=VALUES(grade_label),semester=VALUES(semester),class_id=VALUES(class_id),time_mode=VALUES(time_mode),time_per_question_seconds=VALUES(time_per_question_seconds),certificate_portfolio_enabled=VALUES(certificate_portfolio_enabled),is_active=VALUES(is_active)',
        [$teacherId, $gameKey, $lessonName, $unitNumber, $lessonNumber, $stage, $gradeLabel, $semester, $classId, $timeMode, $timeSeconds, $certificateEnabled ? 1 : 0, $isActive ? 1 : 0]
    );
    Activity::log('teacher', $teacherId, 'تحديث لعبة تفاعلية', $gameKey . ' · ' . $lessonName);
    Http::json(interactive_game_json($gameKey, interactive_game_row($teacherId, $gameKey)), $current ? 200 : 201);
}
