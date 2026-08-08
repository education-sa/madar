<?php
declare(strict_types=1);

function ensure_teacher_school_settings_schema(): void
{
    static $ready = false;
    if ($ready) return;
    execute_sql(
        "CREATE TABLE IF NOT EXISTS teacher_school_settings (
          teacher_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
          school_name VARCHAR(190) NOT NULL DEFAULT '',
          education_department VARCHAR(190) NOT NULL DEFAULT '',
          education_office VARCHAR(190) NOT NULL DEFAULT '',
          teacher_name VARCHAR(190) NOT NULL DEFAULT '',
          school_leader_name VARCHAR(190) NOT NULL DEFAULT '',
          subject_name VARCHAR(190) NOT NULL DEFAULT 'الرياضيات',
          stage_label VARCHAR(80) NOT NULL DEFAULT '',
          grade_label VARCHAR(80) NOT NULL DEFAULT '',
          academic_year VARCHAR(30) NOT NULL DEFAULT '',
          current_semester ENUM('first','second') NOT NULL DEFAULT 'first',
          period_start_date DATE NULL,
          period_end_date DATE NULL,
          term1_start_date DATE NULL,
          term2_start_date DATE NULL,
          additional_logo_original_name VARCHAR(255) NULL,
          additional_logo_stored_name VARCHAR(100) NULL,
          additional_logo_mime_type VARCHAR(100) NULL,
          additional_logo_size_bytes BIGINT UNSIGNED NULL,
          game_unit_number SMALLINT UNSIGNED NULL,
          game_lesson_number SMALLINT UNSIGNED NULL,
          game_lesson_name VARCHAR(190) NULL,
          game_time_mode ENUM('open','timed') NOT NULL DEFAULT 'open',
          game_time_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 30,
          game_certificate_portfolio_enabled TINYINT(1) NOT NULL DEFAULT 1,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_school_settings_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    ensure_teacher_game_settings_columns();
    ensure_academic_year_management_schema();
    $ready = true;
}

function ensure_teacher_game_settings_columns(): void
{
    $columns = array_fill_keys(
        array_map(static fn(array $column): string => (string) $column['Field'], fetch_all('SHOW COLUMNS FROM teacher_school_settings')),
        true
    );
    $definitions = [
        'game_unit_number' => 'SMALLINT UNSIGNED NULL AFTER additional_logo_size_bytes',
        'game_lesson_number' => 'SMALLINT UNSIGNED NULL AFTER game_unit_number',
        'game_lesson_name' => 'VARCHAR(190) NULL AFTER game_lesson_number',
        'game_time_mode' => "ENUM('open','timed') NOT NULL DEFAULT 'open' AFTER game_lesson_name",
        'game_time_seconds' => 'SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER game_time_mode',
        'game_certificate_portfolio_enabled' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER game_time_seconds',
    ];
    foreach ($definitions as $name => $definition) {
        if (!isset($columns[$name])) execute_sql("ALTER TABLE teacher_school_settings ADD COLUMN {$name} {$definition}");
    }
}

function teacher_school_settings_defaults(int $teacherId): array
{
    $teacher = fetch_one('SELECT name FROM teachers WHERE id=?', [$teacherId]);
    return [
        'teacher_id' => $teacherId,
        'school_name' => '',
        'education_department' => '',
        'education_office' => '',
        'teacher_name' => (string) ($teacher['name'] ?? ''),
        'school_leader_name' => '',
        'subject_name' => 'الرياضيات',
        'stage_label' => '',
        'grade_label' => '',
        'academic_year' => '',
        'current_semester' => 'first',
        'period_start_date' => null,
        'period_end_date' => null,
        'term1_start_date' => null,
        'term2_start_date' => null,
        'additional_logo_original_name' => null,
        'additional_logo_stored_name' => null,
        'additional_logo_mime_type' => null,
        'additional_logo_size_bytes' => null,
        'game_unit_number' => null,
        'game_lesson_number' => null,
        'game_lesson_name' => null,
        'game_time_mode' => 'open',
        'game_time_seconds' => 30,
        'game_certificate_portfolio_enabled' => 1,
        '_additional_logo_scope' => 'teacher',
    ];
}

function teacher_school_settings_raw_row(int $teacherId): array
{
    ensure_teacher_school_settings_schema();
    $row = fetch_one('SELECT * FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]);
    if (!$row) return teacher_school_settings_defaults($teacherId);
    $row['_additional_logo_scope'] = 'teacher';
    return $row;
}

function teacher_school_settings_row(int $teacherId): array
{
    $teacher = teacher_school_settings_raw_row($teacherId);
    $site = site_school_settings_row();
    $hasTeacherPeriod = !empty($teacher['period_start_date']) || !empty($teacher['period_end_date'])
        || !empty($teacher['term1_start_date']) || !empty($teacher['term2_start_date']);
    $fallbackFields = [
        'school_name','education_department','education_office','school_leader_name','teacher_name',
        'subject_name','stage_label','grade_label','academic_year','period_start_date','period_end_date',
    ];
    foreach ($fallbackFields as $field) {
        $teacherValue = $teacher[$field] ?? null;
        if (($teacherValue === null || trim((string) $teacherValue) === '') && isset($site[$field])) {
            $teacher[$field] = $site[$field];
        }
    }
    if (!$hasTeacherPeriod && !empty($site['current_semester'])) {
        $teacher['current_semester'] = $site['current_semester'];
    }
    if (empty($teacher['additional_logo_stored_name']) && !empty($site['additional_logo_stored_name'])) {
        foreach (['additional_logo_original_name','additional_logo_stored_name','additional_logo_mime_type','additional_logo_size_bytes'] as $field) {
            $teacher[$field] = $site[$field] ?? null;
        }
        $teacher['updated_at'] = $site['updated_at'] ?? ($teacher['updated_at'] ?? null);
        $teacher['_additional_logo_scope'] = 'site';
    }
    return $teacher;
}

function teacher_school_settings_json(array $row): array
{
    $semester = (string) ($row['current_semester'] ?? 'first');
    $stored = $row['additional_logo_stored_name'] ?? null;
    $hasLogo = academic_logo_safe_path($stored) !== null;
    $scope = (string) ($row['_additional_logo_scope'] ?? 'teacher');
    $logoUrl = '';
    if ($hasLogo) {
        $logoUrl = $scope === 'site'
            ? '/api/teacher/school-settings/site-logo?v=' . rawurlencode((string) ($row['updated_at'] ?? ''))
            : '/api/teacher/school-settings/additional-logo?v=' . rawurlencode((string) ($row['updated_at'] ?? ''));
    }
    $start = $row['period_start_date'] ?? $row['term1_start_date'] ?? null;
    $end = $row['period_end_date'] ?? $row['term2_start_date'] ?? null;
    $gameUnitNumber = teacher_game_optional_positive_int($row['game_unit_number'] ?? null);
    $gameLessonNumber = teacher_game_optional_positive_int($row['game_lesson_number'] ?? null);
    $gameLessonName = trim((string) ($row['game_lesson_name'] ?? ''));
    $gameLessonName = $gameLessonName === '' ? null : $gameLessonName;
    return [
        'schoolName' => (string) ($row['school_name'] ?? ''),
        'educationDepartment' => (string) ($row['education_department'] ?? ''),
        'educationOffice' => (string) ($row['education_office'] ?? ''),
        'teacherName' => (string) ($row['teacher_name'] ?? ''),
        'schoolLeaderName' => (string) ($row['school_leader_name'] ?? ''),
        'subjectName' => (string) ($row['subject_name'] ?? ''),
        'stageLabel' => (string) ($row['stage_label'] ?? ''),
        'gradeLabel' => (string) ($row['grade_label'] ?? ''),
        'academicYear' => (string) ($row['academic_year'] ?? ''),
        'currentSemester' => $semester,
        'semesterLabel' => $semester === 'second' ? 'الفصل الدراسي الثاني' : 'الفصل الدراسي الأول',
        'periodStartDate' => $start ?: '',
        'periodEndDate' => $end ?: '',
        // أسماء قديمة للإبقاء على التوافق مع الأجزاء السابقة من الواجهة.
        'term1StartDate' => $start ?: '',
        'term2StartDate' => $end ?: '',
        'madarLogoUrl' => '/assets/print/madar-official-logo-transparent.png',
        'visionLogoUrl' => '/vision-2030-logo.png',
        'additionalLogoName' => (string) ($row['additional_logo_original_name'] ?? ''),
        'additionalLogoScope' => $scope,
        'additionalLogoUrl' => $logoUrl,
        'hasAdditionalLogo' => $hasLogo,
        'game' => [
            'unitNumber' => $gameUnitNumber,
            'lessonNumber' => $gameLessonNumber,
            'lessonName' => $gameLessonName,
            'timeMode' => (string) ($row['game_time_mode'] ?? 'open'),
            'timePerQuestionSeconds' => (int) ($row['game_time_seconds'] ?? 30),
            'certificatePortfolioEnabled' => (bool) ($row['game_certificate_portfolio_enabled'] ?? true),
        ],
        // أسماء مسطّحة لتكامل واجهة الألعاب مع الإعدادات الحالية.
        'gameUnitNumber' => $gameUnitNumber,
        'gameLessonNumber' => $gameLessonNumber,
        'gameLessonName' => $gameLessonName,
        'gameTimeMode' => (string) ($row['game_time_mode'] ?? 'open'),
        'gameTimePerQuestionSeconds' => (int) ($row['game_time_seconds'] ?? 30),
        'gameCertificatePortfolioEnabled' => (bool) ($row['game_certificate_portfolio_enabled'] ?? true),
        'complete' => trim((string) ($row['school_name'] ?? '')) !== ''
            && trim((string) ($row['education_department'] ?? '')) !== ''
            && trim((string) ($row['teacher_name'] ?? '')) !== ''
            && trim((string) ($row['academic_year'] ?? '')) !== ''
            && !empty($start) && !empty($end),
    ];
}

function teacher_game_optional_positive_int(mixed $value): ?int
{
    $number = filter_var($value, FILTER_VALIDATE_INT);
    return $number !== false && $number > 0 ? (int) $number : null;
}

function teacher_school_settings_routes(string $method, array $segments, int $teacherId): never
{
    ensure_teacher_school_settings_schema();
    $action = $segments[0] ?? '';
    if ($action === '' && $method === 'GET') Http::json(teacher_school_settings_json(teacher_school_settings_row($teacherId)));
    if ($action === '' && $method === 'PUT') teacher_school_settings_save_legacy($teacherId);
    if ($action === 'period' && $method === 'PUT') teacher_school_settings_save_period($teacherId);
    if ($action === 'school' && $method === 'PUT') teacher_school_settings_save_school($teacherId);
    if ($action === 'games' && $method === 'PUT') teacher_school_settings_save_games($teacherId);
    if ($action === 'additional-logo' && $method === 'GET') teacher_school_settings_send_logo($teacherId, false);
    if ($action === 'additional-logo' && $method === 'POST') teacher_school_settings_upload_logo($teacherId);
    if ($action === 'additional-logo' && $method === 'DELETE') teacher_school_settings_delete_logo($teacherId);
    if ($action === 'site-logo' && $method === 'GET') teacher_school_settings_send_logo($teacherId, true);
    Http::json(['error' => 'المسار المطلوب غير موجود.'], 404);
}

function teacher_school_settings_save_games(int $teacherId): never
{
    $data = Http::input();
    $timerOnly = filter_var($data['timerOnly'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $current = teacher_school_settings_raw_row($teacherId);
    $unitNumber = $timerOnly
        ? teacher_game_optional_positive_int($current['game_unit_number'] ?? null)
        : filter_var($data['unitNumber'] ?? null, FILTER_VALIDATE_INT);
    $lessonNumber = $timerOnly
        ? teacher_game_optional_positive_int($current['game_lesson_number'] ?? null)
        : filter_var($data['lessonNumber'] ?? null, FILTER_VALIDATE_INT);
    $lessonName = $timerOnly
        ? trim((string) ($current['game_lesson_name'] ?? ''))
        : academic_clean_text($data['lessonName'] ?? '', 190, 'اسم درس اللعبة', true);
    $timeMode = (string) ($data['timeMode'] ?? 'open');
    $timeSeconds = filter_var($data['timePerQuestionSeconds'] ?? 30, FILTER_VALIDATE_INT);
    $certificateRaw = $timerOnly
        ? ($current['game_certificate_portfolio_enabled'] ?? true)
        : ($data['certificatePortfolioEnabled'] ?? true);
    $certificateEnabled = filter_var($certificateRaw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

    if (!$timerOnly && ($unitNumber === false || $unitNumber < 1 || $unitNumber > 999)) {
        Http::json(['error' => 'رقم الوحدة يجب أن يكون بين 1 و999.'], 422);
    }
    if (!$timerOnly && ($lessonNumber === false || $lessonNumber < 1 || $lessonNumber > 999)) {
        Http::json(['error' => 'رقم الدرس يجب أن يكون بين 1 و999.'], 422);
    }
    if (!in_array($timeMode, ['open', 'timed'], true)) {
        Http::json(['error' => 'وضع وقت اللعبة غير صالح.'], 422);
    }
    if ($timeSeconds === false || $timeSeconds < 15 || $timeSeconds > 120) {
        Http::json(['error' => 'وقت السؤال المحدد يجب أن يكون بين 15 و120 ثانية.'], 422);
    }
    if ($certificateEnabled === null) {
        Http::json(['error' => 'خيار حفظ شهادة الإتقان غير صالح.'], 422);
    }

    execute_sql(
        "INSERT INTO teacher_school_settings (teacher_id,game_unit_number,game_lesson_number,game_lesson_name,game_time_mode,game_time_seconds,game_certificate_portfolio_enabled)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE game_unit_number=VALUES(game_unit_number),game_lesson_number=VALUES(game_lesson_number),game_lesson_name=VALUES(game_lesson_name),game_time_mode=VALUES(game_time_mode),game_time_seconds=VALUES(game_time_seconds),game_certificate_portfolio_enabled=VALUES(game_certificate_portfolio_enabled)",
        [$teacherId, $unitNumber, $lessonNumber, $lessonName, $timeMode, $timeSeconds, $certificateEnabled ? 1 : 0]
    );
    Activity::log('teacher', $teacherId, 'تحديث إعدادات الألعاب التفاعلية', $timerOnly ? "وضع الوقت: {$timeMode}" : "الوحدة {$unitNumber} · الدرس {$lessonNumber}");
    Http::json(teacher_school_settings_json(teacher_school_settings_row($teacherId)));
}

function teacher_school_settings_save_period(int $teacherId, ?array $provided = null): never
{
    $data = $provided ?? Http::input();
    $semester = (string) ($data['currentSemester'] ?? 'first');
    if (!in_array($semester, ['first', 'second'], true)) Http::json(['error' => 'الفصل الدراسي غير صالح.'], 422);
    $start = academic_date_value($data['periodStartDate'] ?? $data['term1StartDate'] ?? null, 'تاريخ بداية المدة الدراسية');
    $end = academic_date_value($data['periodEndDate'] ?? $data['term2StartDate'] ?? null, 'تاريخ نهاية المدة الدراسية');
    if (strtotime((string) $end) <= strtotime((string) $start)) Http::json(['error' => 'يجب أن يكون تاريخ نهاية المدة بعد تاريخ بدايتها.'], 422);
    $raw = teacher_school_settings_raw_row($teacherId);
    $merged = teacher_school_settings_row($teacherId);
    $year = trim((string) ($raw['academic_year'] ?? '')) ?: trim((string) ($merged['academic_year'] ?? ''));
    if ($year === '') Http::json(['error' => 'احفظي العام الدراسي في مربع إعدادات المدرسة أولًا.'], 422);

    ensure_test_context_columns();
    ensure_teacher_tools_schema();
    Database::transaction(function (PDO $pdo) use ($teacherId, $year, $semester, $start, $end): void {
        $pdo->prepare(
            "INSERT INTO teacher_school_settings (teacher_id,academic_year,current_semester,period_start_date,period_end_date,term1_start_date,term2_start_date)
             VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE academic_year=VALUES(academic_year),current_semester=VALUES(current_semester),period_start_date=VALUES(period_start_date),period_end_date=VALUES(period_end_date),term1_start_date=VALUES(term1_start_date),term2_start_date=VALUES(term2_start_date)"
        )->execute([$teacherId, $year, $semester, $start, $end, $start, $end]);
        $pdo->prepare("UPDATE tests SET academic_year=?,semester=? WHERE teacher_id=? AND (academic_year IS NULL OR academic_year='')")
            ->execute([$year, $semester, $teacherId]);
        $pdo->prepare("UPDATE follow_up_settings SET academic_year=?,semester=? WHERE teacher_id=? AND (academic_year IS NULL OR academic_year='')")
            ->execute([$year, $semester, $teacherId]);
        $pdo->prepare("UPDATE student_follow_up SET academic_year=?,semester=? WHERE teacher_id=? AND (academic_year IS NULL OR academic_year='')")
            ->execute([$year, $semester, $teacherId]);
    });
    Activity::log('teacher', $teacherId, 'تحديث إعدادات المدة الدراسية', "{$year} · {$start} إلى {$end}");
    Http::json(teacher_school_settings_json(teacher_school_settings_row($teacherId)));
}

function teacher_school_settings_save_school(int $teacherId, ?array $provided = null): never
{
    $data = $provided ?? Http::input();
    $schoolName = academic_clean_text($data['schoolName'] ?? '', 190, 'اسم المدرسة', true);
    $department = academic_clean_text($data['educationDepartment'] ?? '', 190, 'إدارة التعليم', true);
    $office = academic_clean_text($data['educationOffice'] ?? '', 190, 'مكتب التعليم');
    $teacherName = academic_clean_text($data['teacherName'] ?? '', 190, 'اسم المعلمة', true);
    $leader = academic_clean_text($data['schoolLeaderName'] ?? '', 190, 'اسم مديرة المدرسة');
    $subject = academic_clean_text($data['subjectName'] ?? 'الرياضيات', 190, 'اسم المادة', true);
    $year = academic_clean_text($data['academicYear'] ?? '', 30, 'العام الدراسي', true);
    execute_sql(
        "INSERT INTO teacher_school_settings (teacher_id,school_name,education_department,education_office,teacher_name,school_leader_name,subject_name,academic_year)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE school_name=VALUES(school_name),education_department=VALUES(education_department),education_office=VALUES(education_office),teacher_name=VALUES(teacher_name),school_leader_name=VALUES(school_leader_name),subject_name=VALUES(subject_name),academic_year=VALUES(academic_year)",
        [$teacherId, $schoolName, $department, $office, $teacherName, $leader, $subject, $year]
    );
    Activity::log('teacher', $teacherId, 'تحديث إعدادات المدرسة', "{$schoolName} · {$year}");
    Http::json(teacher_school_settings_json(teacher_school_settings_row($teacherId)));
}

function teacher_school_settings_save_legacy(int $teacherId): never
{
    $data = Http::input();
    // يحفظ القسمين في معاملة واحدة للمكالمات القديمة.
    $semester = (string) ($data['currentSemester'] ?? 'first');
    if (!in_array($semester, ['first', 'second'], true)) Http::json(['error' => 'الفصل الدراسي غير صالح.'], 422);
    $start = academic_date_value($data['periodStartDate'] ?? $data['term1StartDate'] ?? null, 'تاريخ بداية المدة الدراسية');
    $end = academic_date_value($data['periodEndDate'] ?? $data['term2StartDate'] ?? null, 'تاريخ نهاية المدة الدراسية');
    if (strtotime((string) $end) <= strtotime((string) $start)) Http::json(['error' => 'يجب أن يكون تاريخ نهاية المدة بعد تاريخ بدايتها.'], 422);
    $schoolName = academic_clean_text($data['schoolName'] ?? '', 190, 'اسم المدرسة', true);
    $department = academic_clean_text($data['educationDepartment'] ?? '', 190, 'إدارة التعليم', true);
    $office = academic_clean_text($data['educationOffice'] ?? '', 190, 'مكتب التعليم');
    $teacherName = academic_clean_text($data['teacherName'] ?? '', 190, 'اسم المعلمة', true);
    $leader = academic_clean_text($data['schoolLeaderName'] ?? '', 190, 'اسم مديرة المدرسة');
    $subject = academic_clean_text($data['subjectName'] ?? 'الرياضيات', 190, 'اسم المادة', true);
    $stage = academic_clean_text($data['stageLabel'] ?? 'متوسط', 80, 'المرحلة الدراسية', true);
    $grade = academic_clean_text($data['gradeLabel'] ?? 'أول متوسط', 80, 'الصف الدراسي', true);
    $year = academic_clean_text($data['academicYear'] ?? '', 30, 'العام الدراسي', true);
    Database::transaction(function (PDO $pdo) use ($teacherId,$schoolName,$department,$office,$teacherName,$leader,$subject,$stage,$grade,$year,$semester,$start,$end): void {
        $pdo->prepare(
            "INSERT INTO teacher_school_settings (teacher_id,school_name,education_department,education_office,teacher_name,school_leader_name,subject_name,stage_label,grade_label,academic_year,current_semester,period_start_date,period_end_date,term1_start_date,term2_start_date)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE school_name=VALUES(school_name),education_department=VALUES(education_department),education_office=VALUES(education_office),teacher_name=VALUES(teacher_name),school_leader_name=VALUES(school_leader_name),subject_name=VALUES(subject_name),stage_label=VALUES(stage_label),grade_label=VALUES(grade_label),academic_year=VALUES(academic_year),current_semester=VALUES(current_semester),period_start_date=VALUES(period_start_date),period_end_date=VALUES(period_end_date),term1_start_date=VALUES(term1_start_date),term2_start_date=VALUES(term2_start_date)"
        )->execute([$teacherId,$schoolName,$department,$office,$teacherName,$leader,$subject,$stage,$grade,$year,$semester,$start,$end,$start,$end]);
    });
    Activity::log('teacher', $teacherId, 'تحديث إعدادات المدرسة والمدة الدراسية', "{$schoolName} · {$year}");
    Http::json(teacher_school_settings_json(teacher_school_settings_row($teacherId)));
}

function teacher_school_settings_upload_logo(int $teacherId): never
{
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) Http::json(['error' => 'اختاري صورة للشعار الإضافي.'], 422);
    [$temporary, $size, $mime, $original, $extension] = academic_logo_validate_upload($_FILES['file']);
    $stored = bin2hex(random_bytes(20)) . '.' . $extension;
    $path = academic_logo_storage_directory() . '/' . $stored;
    if (!move_uploaded_file($temporary, $path)) Http::json(['error' => 'تعذّر حفظ الشعار.'], 500);
    @chmod($path, 0640);
    $old = teacher_school_settings_raw_row($teacherId)['additional_logo_stored_name'] ?? null;
    try {
        execute_sql(
            "INSERT INTO teacher_school_settings (teacher_id,additional_logo_original_name,additional_logo_stored_name,additional_logo_mime_type,additional_logo_size_bytes)
             VALUES (?,?,?,?,?)
             ON DUPLICATE KEY UPDATE additional_logo_original_name=VALUES(additional_logo_original_name),additional_logo_stored_name=VALUES(additional_logo_stored_name),additional_logo_mime_type=VALUES(additional_logo_mime_type),additional_logo_size_bytes=VALUES(additional_logo_size_bytes)",
            [$teacherId, $original, $stored, $mime, $size]
        );
    } catch (Throwable $error) {
        @unlink($path);
        throw $error;
    }
    academic_logo_remove($old);
    Activity::log('teacher', $teacherId, 'رفع شعار إضافي للمدرسة', $original);
    Http::json(teacher_school_settings_json(teacher_school_settings_row($teacherId)));
}

function teacher_school_settings_delete_logo(int $teacherId): never
{
    $row = teacher_school_settings_raw_row($teacherId);
    execute_sql('UPDATE teacher_school_settings SET additional_logo_original_name=NULL,additional_logo_stored_name=NULL,additional_logo_mime_type=NULL,additional_logo_size_bytes=NULL WHERE teacher_id=?', [$teacherId]);
    academic_logo_remove($row['additional_logo_stored_name'] ?? null);
    Activity::log('teacher', $teacherId, 'حذف الشعار الإضافي للمدرسة');
    Http::json(teacher_school_settings_json(teacher_school_settings_row($teacherId)));
}

function teacher_school_settings_send_logo(int $teacherId, bool $siteLogo): never
{
    $row = $siteLogo ? site_school_settings_row() : teacher_school_settings_raw_row($teacherId);
    $path = academic_logo_safe_path($row['additional_logo_stored_name'] ?? null);
    if (!$path) Http::json(['error' => 'الشعار الإضافي غير موجود.'], 404);
    header('Content-Type: ' . (string) ($row['additional_logo_mime_type'] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}
