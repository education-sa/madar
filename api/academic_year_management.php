<?php
declare(strict_types=1);

/**
 * إعدادات المدرسة/المدة الدراسية وإدارة إقفال العام الدراسي.
 * جميع عمليات الحذف في هذا الملف محمية بدور owner من المسار المستدعي.
 */

function academic_db_table_exists(string $table): bool
{
    if (!preg_match('/^[a-z0-9_]+$/', $table)) return false;
    return (bool) fetch_one(
        'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1',
        [$table]
    );
}

function academic_db_column_exists(string $table, string $column): bool
{
    if (!preg_match('/^[a-z0-9_]+$/', $table) || !preg_match('/^[a-z0-9_]+$/', $column)) return false;
    return (bool) fetch_one(
        'SELECT 1 AS ok FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1',
        [$table, $column]
    );
}

function ensure_academic_year_management_schema(): void
{
    static $ready = false;
    if ($ready) return;

    execute_sql(
        "CREATE TABLE IF NOT EXISTS site_school_settings (
          id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
          school_name VARCHAR(190) NOT NULL DEFAULT '',
          education_department VARCHAR(190) NOT NULL DEFAULT '',
          education_office VARCHAR(190) NOT NULL DEFAULT '',
          school_leader_name VARCHAR(190) NOT NULL DEFAULT '',
          teacher_name VARCHAR(190) NOT NULL DEFAULT '',
          subject_name VARCHAR(190) NOT NULL DEFAULT 'الرياضيات',
          stage_label VARCHAR(80) NOT NULL DEFAULT '',
          grade_label VARCHAR(80) NOT NULL DEFAULT '',
          academic_year VARCHAR(30) NOT NULL DEFAULT '',
          current_semester ENUM('first','second') NOT NULL DEFAULT 'first',
          period_start_date DATE NULL,
          period_end_date DATE NULL,
          additional_logo_original_name VARCHAR(255) NULL,
          additional_logo_stored_name VARCHAR(100) NULL,
          additional_logo_mime_type VARCHAR(100) NULL,
          additional_logo_size_bytes BIGINT UNSIGNED NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    execute_sql("INSERT IGNORE INTO site_school_settings (id,subject_name) VALUES (1,'الرياضيات')");

    execute_sql(
        "CREATE TABLE IF NOT EXISTS academic_year_periods (
          academic_year VARCHAR(30) NOT NULL PRIMARY KEY,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          semester ENUM('first','second') NOT NULL DEFAULT 'first',
          created_by_owner BIGINT UNSIGNED NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_academic_period_owner FOREIGN KEY (created_by_owner) REFERENCES owners(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    execute_sql(
        "CREATE TABLE IF NOT EXISTS academic_year_reset_operations (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          owner_id BIGINT UNSIGNED NOT NULL,
          target_academic_year VARCHAR(30) NOT NULL,
          new_academic_year VARCHAR(30) NOT NULL,
          status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
          counts_json JSON NULL,
          error_message VARCHAR(1000) NULL,
          started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME NULL,
          CONSTRAINT fk_year_reset_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE RESTRICT,
          INDEX idx_year_reset_status_date (status,started_at),
          INDEX idx_year_reset_target (target_academic_year)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    if (academic_db_table_exists('teacher_school_settings')) {
        $teacherColumns = [
            'subject_name' => "VARCHAR(190) NOT NULL DEFAULT 'الرياضيات' AFTER school_leader_name",
            'stage_label' => "VARCHAR(80) NOT NULL DEFAULT '' AFTER subject_name",
            'grade_label' => "VARCHAR(80) NOT NULL DEFAULT '' AFTER stage_label",
            'period_start_date' => "DATE NULL AFTER current_semester",
            'period_end_date' => "DATE NULL AFTER period_start_date",
            'additional_logo_original_name' => "VARCHAR(255) NULL AFTER period_end_date",
            'additional_logo_stored_name' => "VARCHAR(100) NULL AFTER additional_logo_original_name",
            'additional_logo_mime_type' => "VARCHAR(100) NULL AFTER additional_logo_stored_name",
            'additional_logo_size_bytes' => "BIGINT UNSIGNED NULL AFTER additional_logo_mime_type",
        ];
        foreach ($teacherColumns as $name => $definition) {
            if (!academic_db_column_exists('teacher_school_settings', $name)) {
                execute_sql("ALTER TABLE teacher_school_settings ADD COLUMN {$name} {$definition}");
            }
        }
        // نقل التواريخ القديمة إلى الحقول الجديدة دون حذفها حفاظًا على التوافق.
        execute_sql(
            "UPDATE teacher_school_settings
             SET period_start_date=COALESCE(period_start_date,term1_start_date),
                 period_end_date=COALESCE(period_end_date,term2_start_date)
             WHERE period_start_date IS NULL OR period_end_date IS NULL"
        );
    }

    $yearColumns = [
        'knowledge_resources' => "VARCHAR(30) NULL AFTER teacher_id",
        'student_portfolio_files' => "VARCHAR(30) NULL AFTER student_id",
        'activity_log' => "VARCHAR(30) NULL AFTER actor_id",
    ];
    foreach ($yearColumns as $table => $definition) {
        if (academic_db_table_exists($table) && !academic_db_column_exists($table, 'academic_year')) {
            execute_sql("ALTER TABLE {$table} ADD COLUMN academic_year {$definition}");
            execute_sql("ALTER TABLE {$table} ADD INDEX idx_{$table}_academic_year (academic_year)");
            // ترحيل آمن للملفات القائمة عند إضافة العمود لأول مرة فقط.
            if ($table === 'knowledge_resources' && academic_db_table_exists('teacher_school_settings')) {
                execute_sql(
                    "UPDATE knowledge_resources r
                     JOIN teacher_school_settings s ON s.teacher_id=r.teacher_id
                     SET r.academic_year=NULLIF(TRIM(s.academic_year),'')
                     WHERE r.academic_year IS NULL AND TRIM(s.academic_year)<>''"
                );
            }
            if ($table === 'student_portfolio_files' && academic_db_table_exists('teacher_school_settings')) {
                execute_sql(
                    "UPDATE student_portfolio_files f
                     JOIN students st ON st.id=f.student_id
                     JOIN classes c ON c.id=st.class_id
                     JOIN teacher_school_settings s ON s.teacher_id=c.teacher_id
                     SET f.academic_year=NULLIF(TRIM(s.academic_year),'')
                     WHERE f.academic_year IS NULL AND TRIM(s.academic_year)<>''"
                );
            }
        }
    }

    $ready = true;
}

function academic_clean_text(mixed $value, int $maxLength, string $label, bool $required = false): string
{
    $text = trim((string) $value);
    if ($required && $text === '') Http::json(['error' => "حقل {$label} مطلوب."], 422);
    if (mb_strlen($text) > $maxLength) Http::json(['error' => "حقل {$label} أطول من الحد المسموح."], 422);
    return $text;
}

function academic_date_value(mixed $value, string $label, bool $required = true): ?string
{
    $text = trim((string) $value);
    if ($text === '') {
        if ($required) Http::json(['error' => "حقل {$label} مطلوب."], 422);
        return null;
    }
    $date = DateTime::createFromFormat('Y-m-d', $text);
    if (!$date || $date->format('Y-m-d') !== $text) Http::json(['error' => "{$label} غير صالح."], 422);
    return $text;
}

function academic_logo_storage_directory(): string
{
    $directory = MADAR_ROOT . '/storage/private/school-logos';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        Http::json(['error' => 'تعذّر تجهيز مجلد شعارات المدرسة.'], 500);
    }
    if (!is_writable($directory)) Http::json(['error' => 'مجلد شعارات المدرسة غير قابل للكتابة.'], 500);
    return $directory;
}

function academic_logo_validate_upload(array $upload): array
{
    $error = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        $message = match ($error) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'حجم الشعار أكبر من المسموح في الخادم.',
            UPLOAD_ERR_PARTIAL => 'لم يكتمل رفع الشعار. حاولي مرة أخرى.',
            UPLOAD_ERR_NO_FILE => 'اختاري صورة للشعار الإضافي.',
            default => 'تعذّر رفع الشعار. حاولي مرة أخرى.',
        };
        Http::json(['error' => $message], 422);
    }
    $temporary = (string) ($upload['tmp_name'] ?? '');
    if ($temporary === '' || !is_uploaded_file($temporary)) Http::json(['error' => 'ملف الشعار غير صالح.'], 422);
    $size = (int) (filesize($temporary) ?: 0);
    if ($size < 1 || $size > 5 * 1024 * 1024) Http::json(['error' => 'يجب ألا يتجاوز حجم الشعار 5 ميجابايت.'], 422);
    if (!class_exists('finfo')) Http::json(['error' => 'الخادم يحتاج إضافة Fileinfo للتحقق من الصور.'], 500);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($temporary) ?: '';
    $allowed = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
    if (!isset($allowed[$mime])) Http::json(['error' => 'صيغ الشعار المسموحة: PNG أو JPG أو WEBP.'], 422);
    $original = basename(str_replace('\\', '/', (string) ($upload['name'] ?? '')));
    $original = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $original) ?? '');
    if ($original === '') $original = 'شعار-إضافي.' . $allowed[$mime];
    return [$temporary, $size, $mime, mb_substr($original, 0, 255), $allowed[$mime]];
}

function academic_logo_safe_path(?string $stored): ?string
{
    $stored = trim((string) $stored);
    if (!preg_match('/^[a-f0-9]{40}\.(?:png|jpg|webp)$/', $stored)) return null;
    $path = academic_logo_storage_directory() . '/' . $stored;
    return is_file($path) ? $path : null;
}

function academic_logo_remove(?string $stored): void
{
    $path = academic_logo_safe_path($stored);
    if ($path) @unlink($path);
}

function site_school_settings_row(): array
{
    ensure_academic_year_management_schema();
    return fetch_one('SELECT * FROM site_school_settings WHERE id=1') ?: ['id' => 1];
}

function site_school_settings_json(array $row): array
{
    $semester = (string) ($row['current_semester'] ?? 'first');
    $hasLogo = academic_logo_safe_path($row['additional_logo_stored_name'] ?? null) !== null;
    return [
        'schoolName' => (string) ($row['school_name'] ?? ''),
        'educationDepartment' => (string) ($row['education_department'] ?? ''),
        'educationOffice' => (string) ($row['education_office'] ?? ''),
        'schoolLeaderName' => (string) ($row['school_leader_name'] ?? ''),
        'stageLabel' => (string) ($row['stage_label'] ?? ''),
        'gradeLabel' => (string) ($row['grade_label'] ?? ''),
        'academicYear' => (string) ($row['academic_year'] ?? ''),
        'currentSemester' => $semester,
        'semesterLabel' => $semester === 'second' ? 'الفصل الدراسي الثاني' : 'الفصل الدراسي الأول',
        'periodStartDate' => $row['period_start_date'] ?: '',
        'periodEndDate' => $row['period_end_date'] ?: '',
        'madarLogoUrl' => '/assets/print/madar-logo.svg',
        'visionLogoUrl' => '/vision-2030-logo.png',
        'additionalLogoName' => (string) ($row['additional_logo_original_name'] ?? ''),
        'additionalLogoUrl' => $hasLogo ? '/api/owner/academic-year/additional-logo?v=' . rawurlencode((string) ($row['updated_at'] ?? '')) : '',
        'hasAdditionalLogo' => $hasLogo,
    ];
}

function owner_academic_year_routes(string $method, array $segments, array $owner): never
{
    ensure_academic_year_management_schema();
    $action = $segments[0] ?? '';
    if ($action === '' && $method === 'GET') {
        $settings = site_school_settings_json(site_school_settings_row());
        $settings['availableArchiveYears'] = academic_available_years($settings['academicYear']);
        $settings['defaultArchiveYear'] = academic_default_previous_year($settings['academicYear'], $settings['availableArchiveYears']);
        Http::json($settings);
    }
    if ($action === 'period' && $method === 'PUT') owner_save_site_period((int) $owner['id']);
    if ($action === 'school' && $method === 'PUT') owner_save_site_school((int) $owner['id']);
    if ($action === 'additional-logo' && $method === 'GET') owner_send_site_logo();
    if ($action === 'additional-logo' && $method === 'POST') owner_upload_site_logo((int) $owner['id']);
    if ($action === 'additional-logo' && $method === 'DELETE') owner_delete_site_logo((int) $owner['id']);
    if ($action === 'preview' && $method === 'GET') owner_academic_reset_preview();
    if ($action === 'backup' && $method === 'GET') owner_academic_backup((int) $owner['id']);
    if ($action === 'reset' && $method === 'POST') owner_academic_reset_execute((int) $owner['id']);
    Http::json(['error' => 'المسار المطلوب غير موجود.'], 404);
}

function owner_save_site_period(int $ownerId): never
{
    $data = Http::input();
    $semester = (string) ($data['currentSemester'] ?? 'first');
    if (!in_array($semester, ['first', 'second'], true)) Http::json(['error' => 'الفصل الدراسي غير صالح.'], 422);
    $start = academic_date_value($data['periodStartDate'] ?? null, 'تاريخ بداية المدة الدراسية');
    $end = academic_date_value($data['periodEndDate'] ?? null, 'تاريخ نهاية المدة الدراسية');
    if (strtotime((string) $end) <= strtotime((string) $start)) Http::json(['error' => 'يجب أن يكون تاريخ النهاية بعد تاريخ البداية.'], 422);
    $row = site_school_settings_row();
    $year = trim((string) ($row['academic_year'] ?? ''));
    if ($year === '') Http::json(['error' => 'احفظي العام الدراسي في مربع إعدادات المدرسة أولًا.'], 422);
    Database::transaction(function (PDO $pdo) use ($ownerId, $semester, $start, $end, $year): void {
        $pdo->prepare('UPDATE site_school_settings SET current_semester=?,period_start_date=?,period_end_date=? WHERE id=1')
            ->execute([$semester, $start, $end]);
        $pdo->prepare(
            'INSERT INTO academic_year_periods (academic_year,start_date,end_date,semester,created_by_owner)
             VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE start_date=VALUES(start_date),end_date=VALUES(end_date),semester=VALUES(semester),created_by_owner=VALUES(created_by_owner)'
        )->execute([$year, $start, $end, $semester, $ownerId]);
    });
    Activity::log('owner', $ownerId, 'تحديث إعدادات المدة الدراسية', "{$year} · {$start} إلى {$end}");
    Http::json(site_school_settings_json(site_school_settings_row()));
}

function owner_save_site_school(int $ownerId): never
{
    $data = Http::input();
    $values = [
        'schoolName' => academic_clean_text($data['schoolName'] ?? '', 190, 'اسم المدرسة', true),
        'educationDepartment' => academic_clean_text($data['educationDepartment'] ?? '', 190, 'إدارة التعليم', true),
        'educationOffice' => academic_clean_text($data['educationOffice'] ?? '', 190, 'مكتب التعليم'),
        'schoolLeaderName' => academic_clean_text($data['schoolLeaderName'] ?? '', 190, 'اسم مديرة المدرسة'),
        'academicYear' => academic_clean_text($data['academicYear'] ?? '', 30, 'العام الدراسي', true),
    ];
    execute_sql(
        'UPDATE site_school_settings SET school_name=?,education_department=?,education_office=?,school_leader_name=?,academic_year=? WHERE id=1',
        array_values($values)
    );
    Activity::log('owner', $ownerId, 'تحديث إعدادات المدرسة', $values['schoolName'] . ' · ' . $values['academicYear']);
    Http::json(site_school_settings_json(site_school_settings_row()));
}

function owner_upload_site_logo(int $ownerId): never
{
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) Http::json(['error' => 'اختاري صورة للشعار الإضافي.'], 422);
    [$temporary, $size, $mime, $original, $extension] = academic_logo_validate_upload($_FILES['file']);
    $stored = bin2hex(random_bytes(20)) . '.' . $extension;
    $path = academic_logo_storage_directory() . '/' . $stored;
    if (!move_uploaded_file($temporary, $path)) Http::json(['error' => 'تعذّر حفظ الشعار.'], 500);
    @chmod($path, 0640);
    $old = site_school_settings_row()['additional_logo_stored_name'] ?? null;
    try {
        execute_sql(
            'UPDATE site_school_settings SET additional_logo_original_name=?,additional_logo_stored_name=?,additional_logo_mime_type=?,additional_logo_size_bytes=? WHERE id=1',
            [$original, $stored, $mime, $size]
        );
    } catch (Throwable $error) {
        @unlink($path);
        throw $error;
    }
    academic_logo_remove($old);
    Activity::log('owner', $ownerId, 'رفع شعار إضافي للمدرسة', $original);
    Http::json(site_school_settings_json(site_school_settings_row()));
}

function owner_delete_site_logo(int $ownerId): never
{
    $row = site_school_settings_row();
    execute_sql('UPDATE site_school_settings SET additional_logo_original_name=NULL,additional_logo_stored_name=NULL,additional_logo_mime_type=NULL,additional_logo_size_bytes=NULL WHERE id=1');
    academic_logo_remove($row['additional_logo_stored_name'] ?? null);
    Activity::log('owner', $ownerId, 'حذف الشعار الإضافي للمدرسة');
    Http::json(site_school_settings_json(site_school_settings_row()));
}

function owner_send_site_logo(): never
{
    $row = site_school_settings_row();
    $path = academic_logo_safe_path($row['additional_logo_stored_name'] ?? null);
    if (!$path) Http::json(['error' => 'الشعار الإضافي غير موجود.'], 404);
    header('Content-Type: ' . (string) ($row['additional_logo_mime_type'] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

function academic_available_years(string $currentYear = ''): array
{
    ensure_academic_year_management_schema();
    $years = [];
    $sources = [
        ['academic_year_periods', 'academic_year'],
        ['tests', 'academic_year'],
        ['follow_up_settings', 'academic_year'],
        ['student_follow_up', 'academic_year'],
        ['weekly_attendance', 'academic_year'],
        ['weekly_participation', 'academic_year'],
        ['weekly_follow_up_items', 'academic_year'],
        ['knowledge_resources', 'academic_year'],
        ['student_portfolio_files', 'academic_year'],
        ['activity_log', 'academic_year'],
    ];
    foreach ($sources as [$table, $column]) {
        if (!academic_db_table_exists($table) || !academic_db_column_exists($table, $column)) continue;
        foreach (fetch_all("SELECT DISTINCT {$column} AS academic_year FROM {$table} WHERE {$column} IS NOT NULL AND TRIM({$column})<>''") as $row) {
            $year = trim((string) ($row['academic_year'] ?? ''));
            if ($year !== '') $years[$year] = true;
        }
    }
    if ($currentYear !== '') $years[$currentYear] = true;
    $result = array_keys($years);
    usort($result, static function (string $a, string $b): int {
        $na = (int) preg_replace('/\D+/', '', $a);
        $nb = (int) preg_replace('/\D+/', '', $b);
        return $nb <=> $na ?: strcmp($b, $a);
    });
    return $result;
}

function academic_default_previous_year(string $currentYear, array $available): string
{
    foreach ($available as $year) if ($year !== '' && $year !== $currentYear) return $year;
    return '';
}

function academic_target_year_from_request(): string
{
    $target = trim((string) ($_GET['year'] ?? ''));
    if ($target === '') {
        $input = Http::input();
        $target = trim((string) ($input['targetAcademicYear'] ?? ''));
    }
    if ($target === '' || mb_strlen($target) > 30) Http::json(['error' => 'حددي العام الدراسي السابق المراد حذفه.'], 422);
    $current = trim((string) (site_school_settings_row()['academic_year'] ?? ''));
    if ($current === '') Http::json(['error' => 'حددي العام الدراسي الجديد في إعدادات المدرسة أولًا.'], 422);
    if ($target === $current) Http::json(['error' => 'يُمنع حذف بيانات العام الدراسي الحالي. اختاري عامًا سابقًا فقط.'], 422);
    return $target;
}

function academic_count_query(string $sql, array $params = []): int
{
    return (int) (fetch_one($sql, $params)['n'] ?? 0);
}

function academic_normalize_reset_selection(array $selectedItems): array
{
    $selection = [];
    $allowed = [
        'tests' => true,
        'followUp' => true,
        'weekly' => true,
        'documents' => true,
        'learningStyle' => true,
        'motivation' => true,
        'notifications' => true,
        'remedial' => true,
    ];
    foreach ($selectedItems as $item) {
        $key = trim((string) $item);
        if ($key === '') continue;
        if (isset($allowed[$key])) $selection[$key] = true;
    }
    return array_keys($selection);
}

function academic_reset_counts(string $targetYear): array
{
    $counts = [
        'tests' => 0,
        'testModels' => 0,
        'questionDistributions' => 0,
        'attempts' => 0,
        'answers' => 0,
        'gradesAndResults' => 0,
        'studentAnalyses' => 0,
        'questionAnalyses' => 0,
        'skillAnalyses' => 0,
        'followUpRecords' => 0,
        'weeklyAcademicRecords' => 0,
        'documents' => 0,
        'studentFiles' => 0,
        'parentFiles' => 0,
        'activityRecords' => 0,
        'learningStyleCampaigns' => 0,
        'learningStyleResults' => 0,
        'physicalFiles' => 0,
        'motivationPoints' => 0,
        'notifications' => 0,
        'remedialPlans' => 0,
    ];
    if (academic_db_table_exists('tests')) {
        $counts['tests'] = academic_count_query('SELECT COUNT(*) AS n FROM tests WHERE academic_year=?', [$targetYear]);
        $counts['testModels'] = academic_count_query('SELECT COUNT(*) AS n FROM test_questions q JOIN tests t ON t.id=q.test_id WHERE t.academic_year=?', [$targetYear]);
        $counts['questionDistributions'] = academic_count_query('SELECT COUNT(*) AS n FROM test_attempt_questions q JOIN test_attempts a ON a.id=q.attempt_id JOIN tests t ON t.id=a.test_id WHERE t.academic_year=?', [$targetYear]);
        $counts['attempts'] = academic_count_query('SELECT COUNT(*) AS n FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE t.academic_year=?', [$targetYear]);
        $counts['answers'] = academic_count_query('SELECT COUNT(*) AS n FROM answers x JOIN test_attempts a ON a.id=x.attempt_id JOIN tests t ON t.id=a.test_id WHERE t.academic_year=?', [$targetYear]);
        $counts['gradesAndResults'] = academic_count_query("SELECT COUNT(*) AS n FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE t.academic_year=? AND a.status IN ('submitted','graded')", [$targetYear]);
        $counts['studentAnalyses'] = academic_count_query("SELECT COUNT(DISTINCT a.student_id) AS n FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE t.academic_year=? AND a.status IN ('submitted','graded')", [$targetYear]);
        $counts['questionAnalyses'] = $counts['answers'];
        $counts['skillAnalyses'] = academic_count_query('SELECT COUNT(DISTINCT COALESCE(aq.skill_id,tq.skill_id)) AS n FROM answers x JOIN test_attempts a ON a.id=x.attempt_id JOIN tests t ON t.id=a.test_id LEFT JOIN test_attempt_questions aq ON aq.id=x.attempt_question_id LEFT JOIN test_questions tq ON tq.id=x.question_id WHERE t.academic_year=? AND COALESCE(aq.skill_id,tq.skill_id) IS NOT NULL', [$targetYear]);
    }
    if (academic_db_table_exists('student_follow_up')) $counts['followUpRecords'] += academic_count_query('SELECT COUNT(*) AS n FROM student_follow_up WHERE academic_year=?', [$targetYear]);
    if (academic_db_table_exists('follow_up_settings')) $counts['followUpRecords'] += academic_count_query('SELECT COUNT(*) AS n FROM follow_up_settings WHERE academic_year=?', [$targetYear]);
    foreach (['weekly_attendance', 'weekly_participation', 'weekly_follow_up_items'] as $table) {
        if (academic_db_table_exists($table) && academic_db_column_exists($table, 'academic_year')) {
            $counts['weeklyAcademicRecords'] += academic_count_query("SELECT COUNT(*) AS n FROM {$table} WHERE academic_year=?", [$targetYear]);
        }
    }
    if (academic_db_table_exists('knowledge_resources') && academic_db_column_exists('knowledge_resources', 'academic_year')) {
        $counts['documents'] = academic_count_query('SELECT COUNT(*) AS n FROM knowledge_resources WHERE academic_year=?', [$targetYear]);
        $counts['physicalFiles'] += academic_count_query("SELECT COUNT(*) AS n FROM knowledge_resources WHERE academic_year=? AND resource_type='file' AND stored_name IS NOT NULL", [$targetYear]);
    }
    if (academic_db_table_exists('student_portfolio_files') && academic_db_column_exists('student_portfolio_files', 'academic_year')) {
        $counts['studentFiles'] = academic_count_query('SELECT COUNT(*) AS n FROM student_portfolio_files WHERE academic_year=?', [$targetYear]);
        $counts['physicalFiles'] += academic_count_query('SELECT COUNT(*) AS n FROM student_portfolio_files WHERE academic_year=? AND stored_name IS NOT NULL', [$targetYear]);
    }
    // لا يوجد في النسخة الحالية جدول مستقل لملفات أولياء الأمور؛ يبقى العدد صفرًا ولا تُمس حساباتهم.
    if (academic_db_table_exists('activity_log') && academic_db_column_exists('activity_log', 'academic_year')) {
        $counts['activityRecords'] = academic_count_query('SELECT COUNT(*) AS n FROM activity_log WHERE academic_year=?', [$targetYear]);
    }
    if (academic_db_table_exists('learning_style_campaigns') && academic_db_column_exists('learning_style_campaigns', 'academic_year')) {
        $counts['learningStyleCampaigns'] = academic_count_query('SELECT COUNT(*) AS n FROM learning_style_campaigns WHERE academic_year=?', [$targetYear]);
        if (academic_db_table_exists('learning_style_assessments')) {
            $counts['learningStyleResults'] = academic_count_query('SELECT COUNT(*) AS n FROM learning_style_assessments a JOIN learning_style_campaigns c ON c.id=a.campaign_id WHERE c.academic_year=?', [$targetYear]);
        }
    }
    if (academic_db_table_exists('motivational_points') && academic_db_table_exists('students') && academic_db_table_exists('classes')) {
        $counts['motivationPoints'] = academic_count_query(
            'SELECT COUNT(*) AS n FROM motivational_points mp JOIN students s ON s.id=mp.student_id JOIN classes c ON c.id=s.class_id WHERE c.academic_year=?',
            [$targetYear]
        );
    }
    if (academic_db_table_exists('notifications') && academic_db_table_exists('students') && academic_db_table_exists('classes')) {
        $counts['notifications'] = academic_count_query(
            'SELECT COUNT(*) AS n FROM notifications n JOIN students s ON s.id=n.student_id JOIN classes c ON c.id=s.class_id WHERE c.academic_year=?',
            [$targetYear]
        );
    }
    if (academic_db_table_exists('remedial_plans') && academic_db_table_exists('students') && academic_db_table_exists('classes')) {
        $counts['remedialPlans'] = academic_count_query(
            'SELECT COUNT(*) AS n FROM remedial_plans rp JOIN students s ON s.id=rp.student_id JOIN classes c ON c.id=s.class_id WHERE c.academic_year=?',
            [$targetYear]
        );
    }
    $counts['totalDatabaseRecords'] = array_sum(array_intersect_key($counts, array_flip([
        'tests','testModels','questionDistributions','attempts','answers','followUpRecords','weeklyAcademicRecords','documents','studentFiles','activityRecords','learningStyleCampaigns','learningStyleResults','motivationPoints','notifications','remedialPlans'
    ])));
    return $counts;
}

function owner_academic_reset_preview(): never
{
    $target = academic_target_year_from_request();
    $current = trim((string) (site_school_settings_row()['academic_year'] ?? ''));
    $counts = academic_reset_counts($target);
    $hash = hash('sha256', json_encode([$target, $current, $counts], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    Http::json([
        'targetAcademicYear' => $target,
        'currentAcademicYear' => $current,
        'counts' => $counts,
        'previewHash' => $hash,
        'preserved' => [
            'حسابات المستخدمين وكلمات المرور والبريد الإلكتروني',
            'حسابات الطالبات وأولياء الأمور والمعلمات والإدارة والصلاحيات',
            'إعدادات المدرسة والشعارات والبيانات الشخصية',
            'المواد والمراحل والصفوف والفصول',
            'بنك الأسئلة والمهارات وبنك الأسئلة الذكي وأسئلة استبانة أنماط التعلم',
            'بيانات العام الدراسي الحالي والجديد',
        ],
    ]);
}

function academic_backup_sql_dump(PDO $pdo): string
{
    $lines = [
        '-- نسخة احتياطية كاملة لقاعدة بيانات منصة مدار',
        '-- تم الإنشاء: ' . date(DATE_ATOM),
        'SET NAMES utf8mb4;',
        'SET FOREIGN_KEY_CHECKS=0;',
        '',
    ];
    $tables = $pdo->query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'")->fetchAll(PDO::FETCH_NUM);
    foreach ($tables as $tableRow) {
        $table = (string) $tableRow[0];
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) continue;
        $createRow = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch(PDO::FETCH_NUM);
        $createSql = (string) ($createRow[1] ?? '');
        $lines[] = "DROP TABLE IF EXISTS `{$table}`;";
        $lines[] = $createSql . ';';
        $statement = $pdo->query("SELECT * FROM `{$table}`");
        $batch = [];
        $columns = null;
        while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
            if ($columns === null) $columns = array_keys($row);
            $values = [];
            foreach ($row as $value) {
                if ($value === null) $values[] = 'NULL';
                else $values[] = $pdo->quote((string) $value);
            }
            $batch[] = '(' . implode(',', $values) . ')';
            if (count($batch) >= 100) {
                $columnSql = implode(',', array_map(static fn(string $column): string => "`{$column}`", $columns));
                $lines[] = "INSERT INTO `{$table}` ({$columnSql}) VALUES\n" . implode(",\n", $batch) . ';';
                $batch = [];
            }
        }
        if ($batch && $columns) {
            $columnSql = implode(',', array_map(static fn(string $column): string => "`{$column}`", $columns));
            $lines[] = "INSERT INTO `{$table}` ({$columnSql}) VALUES\n" . implode(",\n", $batch) . ';';
        }
        $lines[] = '';
    }
    $lines[] = 'SET FOREIGN_KEY_CHECKS=1;';
    return implode("\n", $lines) . "\n";
}

function academic_archive_file_list(string $base, string $prefix): array
{
    $files = [];
    if (!is_dir($base)) return $files;
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    foreach ($iterator as $fileInfo) {
        if (!$fileInfo->isFile() || $fileInfo->isLink()) continue;
        $path = $fileInfo->getPathname();
        $relative = ltrim(str_replace('\\', '/', substr($path, strlen($base))), '/');
        $files[] = ['path' => $path, 'archive' => trim($prefix, '/') . '/' . $relative];
    }
    return $files;
}

function academic_release_reset_lock(PDO $pdo): void
{
    try { $pdo->query("SELECT RELEASE_LOCK('madar_academic_year_reset')"); } catch (Throwable $ignored) {}
}

function owner_academic_backup(int $ownerId): never
{
    ensure_academic_year_management_schema();
    $target = trim((string) ($_GET['year'] ?? ''));
    $current = trim((string) (site_school_settings_row()['academic_year'] ?? ''));
    $pdo = Database::connection();
    $lock = $pdo->query("SELECT GET_LOCK('madar_academic_year_reset',3) AS acquired")->fetch();
    if ((int) ($lock['acquired'] ?? 0) !== 1) {
        Http::json(['error' => 'تعذّر إنشاء النسخة الآن لأن عملية بدء عام جديد قيد التنفيذ. حاولي بعد اكتمالها.'], 409);
    }

    $temporary = tempnam(sys_get_temp_dir(), 'madar_backup_');
    if ($temporary === false) {
        academic_release_reset_lock($pdo);
        Http::json(['error' => 'تعذّر تجهيز ملف النسخة الاحتياطية.'], 500);
    }
    @unlink($temporary);
    $archivePath = '';
    $extension = '';
    $contentType = '';
    $zip = null;
    $tar = null;

    try {
        // لقطة متسقة لقاعدة البيانات، مع منع الحذف بالتزامن معها.
        $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $pdo->beginTransaction();
        $databaseDump = academic_backup_sql_dump($pdo);
        $pdo->commit();

        $manifest = [
            'platform' => 'مدار',
            'createdAt' => date(DATE_ATOM),
            'createdByOwnerId' => $ownerId,
            'currentAcademicYear' => $current,
            'intendedArchiveYear' => $target,
            'contents' => ['قاعدة البيانات كاملة', 'الملفات الخاصة المرفوعة كاملة'],
        ];
        $manifestJson = json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $storedFiles = academic_archive_file_list(MADAR_ROOT . '/storage/private', 'storage/private');

        if (class_exists('ZipArchive')) {
            $extension = 'zip';
            $contentType = 'application/zip';
            $archivePath = $temporary . '.zip';
            $zip = new ZipArchive();
            if ($zip->open($archivePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new RuntimeException('تعذّر إنشاء ملف النسخة الاحتياطية.');
            }
            $zip->addFromString('database.sql', $databaseDump);
            $zip->addFromString('manifest.json', (string) $manifestJson);
            foreach ($storedFiles as $file) $zip->addFile($file['path'], $file['archive']);
            if (!$zip->close()) throw new RuntimeException('تعذّر إغلاق ملف النسخة الاحتياطية بصورة سليمة.');
            $zip = null;
        } elseif (class_exists('PharData')) {
            // بديل آمن للخوادم التي لا تحتوي إضافة ZIP.
            $extension = 'tar';
            $contentType = 'application/x-tar';
            $archivePath = $temporary . '.tar';
            $tar = new PharData($archivePath);
            $tar->addFromString('database.sql', $databaseDump);
            $tar->addFromString('manifest.json', (string) $manifestJson);
            foreach ($storedFiles as $file) $tar->addFile($file['path'], $file['archive']);
            unset($tar);
        } else {
            throw new RuntimeException('الخادم يحتاج إضافة ZIP أو Phar لإنشاء النسخة الاحتياطية.');
        }

        academic_release_reset_lock($pdo);
        try { Activity::log('owner', $ownerId, 'تحميل نسخة احتياطية كاملة قبل بدء عام جديد', $target !== '' ? "العام السابق: {$target}" : null); } catch (Throwable $ignored) {}
        $safeYear = preg_replace('/[^0-9A-Za-z_-]+/u', '-', $target !== '' ? $target : date('Ymd')) ?: date('Ymd');
        $filename = "madar-full-backup-{$safeYear}-" . date('Ymd-His') . '.' . $extension;
        header('Content-Type: ' . $contentType);
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($archivePath));
        header('Cache-Control: no-store');
        readfile($archivePath);
        @unlink($archivePath);
        exit;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($zip instanceof ZipArchive) @$zip->close();
        unset($tar);
        if ($archivePath !== '') @unlink($archivePath);
        academic_release_reset_lock($pdo);
        error_log('[academic-year-backup] ' . $error->getMessage());
        Http::json(['error' => 'تعذّر إنشاء النسخة الاحتياطية الكاملة. لم يتم تنفيذ أي حذف.'], 500);
    }
}

function academic_target_files(string $targetYear): array
{
    $files = [];
    if (academic_db_table_exists('knowledge_resources') && academic_db_column_exists('knowledge_resources', 'academic_year')) {
        foreach (fetch_all("SELECT stored_name FROM knowledge_resources WHERE academic_year=? AND resource_type='file' AND stored_name IS NOT NULL", [$targetYear]) as $row) {
            $stored = (string) ($row['stored_name'] ?? '');
            if (preg_match('/^[a-f0-9]{40}\.(?:pdf|jpg|png|webp|gif|avif|heic|heif)$/', $stored)) {
                $files[] = ['path' => MADAR_ROOT . '/storage/private/knowledge-exchange/' . $stored, 'relative' => 'knowledge-exchange/' . $stored];
            }
        }
    }
    if (academic_db_table_exists('student_portfolio_files') && academic_db_column_exists('student_portfolio_files', 'academic_year')) {
        foreach (fetch_all('SELECT stored_name FROM student_portfolio_files WHERE academic_year=? AND stored_name IS NOT NULL', [$targetYear]) as $row) {
            $stored = (string) ($row['stored_name'] ?? '');
            if (preg_match('/^[a-f0-9]{40}\.(?:pdf|jpg|png|webp|gif|avif|heic|heif)$/', $stored)) {
                $files[] = ['path' => MADAR_ROOT . '/storage/private/student-portfolios/' . $stored, 'relative' => 'student-portfolios/' . $stored];
            }
        }
    }
    return $files;
}

function academic_remove_directory(string $directory): void
{
    if (!is_dir($directory)) return;
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($iterator as $fileInfo) {
        if ($fileInfo->isDir()) @rmdir($fileInfo->getPathname()); else @unlink($fileInfo->getPathname());
    }
    @rmdir($directory);
}

function academic_restore_quarantine(string $quarantine, array $moved): void
{
    foreach (array_reverse($moved) as $item) {
        $source = $quarantine . '/' . $item['relative'];
        $destination = $item['path'];
        if (!is_file($source)) continue;
        $directory = dirname($destination);
        if (!is_dir($directory)) @mkdir($directory, 0750, true);
        @rename($source, $destination);
    }
    academic_remove_directory($quarantine);
}

function academic_rebuild_derived_results(PDO $pdo): void
{
    if (academic_db_table_exists('student_skills')) {
        $pdo->exec('DELETE FROM student_skills');
        $pdo->exec(
            "INSERT INTO student_skills (student_id,skill_id,mastery_percent,evidence_count)
             SELECT a.student_id,COALESCE(aq.skill_id,tq.skill_id) AS skill_id,
                    ROUND(100*SUM(CASE WHEN x.is_correct=1 THEN 1 ELSE 0 END)/COUNT(*),2),COUNT(*)
             FROM answers x
             JOIN test_attempts a ON a.id=x.attempt_id AND a.status IN ('submitted','graded')
             LEFT JOIN test_attempt_questions aq ON aq.id=x.attempt_question_id
             LEFT JOIN test_questions tq ON tq.id=x.question_id
             WHERE x.is_correct IS NOT NULL AND COALESCE(aq.skill_id,tq.skill_id) IS NOT NULL
             GROUP BY a.student_id,COALESCE(aq.skill_id,tq.skill_id)"
        );
    }
    if (academic_db_table_exists('students') && academic_db_column_exists('students', 'progress_percent')) {
        $pdo->exec(
            "UPDATE students s
             LEFT JOIN (
               SELECT student_id,ROUND(AVG(percentage),2) AS progress
               FROM test_attempts WHERE status IN ('submitted','graded') GROUP BY student_id
             ) p ON p.student_id=s.id
             SET s.progress_percent=COALESCE(p.progress,0)"
        );
    }
}

function owner_academic_reset_execute(int $ownerId): never
{
    $data = Http::input();
    $target = trim((string) ($data['targetAcademicYear'] ?? ''));
    $phrase = trim((string) ($data['confirmationPhrase'] ?? ''));
    $previewHash = trim((string) ($data['previewHash'] ?? ''));
    $selectedItems = academic_normalize_reset_selection((array) ($data['selectedItems'] ?? []));
    if ($phrase !== 'بدء عام جديد') Http::json(['error' => 'اكتبي عبارة «بدء عام جديد» بصورة صحيحة لتأكيد العملية.'], 422);
    $_GET['year'] = $target;
    $target = academic_target_year_from_request();
    $site = site_school_settings_row();
    $current = trim((string) ($site['academic_year'] ?? ''));
    $counts = academic_reset_counts($target);
    $freshHash = hash('sha256', json_encode([$target, $current, $counts], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    if ($previewHash === '' || !hash_equals($freshHash, $previewHash)) {
        Http::json(['error' => 'تغيّرت البيانات منذ عرض المعاينة. أعيدي تحميل الأعداد ثم أكدي من جديد.'], 409);
    }

    $pdo = Database::connection();
    $lock = $pdo->query("SELECT GET_LOCK('madar_academic_year_reset',0) AS acquired")->fetch();
    if ((int) ($lock['acquired'] ?? 0) !== 1) Http::json(['error' => 'هناك عملية بدء عام جديد قيد التنفيذ بالفعل. انتظري حتى تكتمل.'], 409);

    $operationId = 0;
    $quarantine = MADAR_ROOT . '/storage/private/.year-reset-' . bin2hex(random_bytes(12));
    $moved = [];
    try {
        // يسجل بدء العملية خارج معاملة الحذف حتى يبقى سجل الفشل محفوظًا عند التراجع.
        $statement = $pdo->prepare(
            "INSERT INTO academic_year_reset_operations (owner_id,target_academic_year,new_academic_year,status,counts_json)
             VALUES (?,?,?,'running',?)"
        );
        $statement->execute([$ownerId, $target, $current, json_encode($counts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        $operationId = (int) $pdo->lastInsertId();

        if (!mkdir($quarantine, 0750, true) && !is_dir($quarantine)) throw new RuntimeException('تعذّر تجهيز مساحة الحذف المؤقتة.');
        foreach (academic_target_files($target) as $item) {
            if (!is_file($item['path'])) continue;
            $destination = $quarantine . '/' . $item['relative'];
            $directory = dirname($destination);
            if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) throw new RuntimeException('تعذّر تجهيز مجلد الملفات المؤقت.');
            if (!rename($item['path'], $destination)) throw new RuntimeException('تعذّر نقل أحد الملفات إلى مساحة الحذف الآمنة.');
            $moved[] = $item;
        }

        $result = Database::transaction(function (PDO $transaction) use ($ownerId, $target, $current, $operationId, $selectedItems): array {
            $selectedSet = array_fill_keys($selectedItems, true);
            if (academic_db_table_exists('activity_log') && academic_db_column_exists('activity_log', 'academic_year')) {
                $transaction->prepare('DELETE FROM activity_log WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['weekly']) && academic_db_table_exists('weekly_attendance')) {
                $transaction->prepare('DELETE FROM weekly_attendance WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['weekly']) && academic_db_table_exists('weekly_participation')) {
                $transaction->prepare('DELETE FROM weekly_participation WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['weekly']) && academic_db_table_exists('weekly_follow_up_items')) {
                $transaction->prepare('DELETE FROM weekly_follow_up_items WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['followUp']) && academic_db_table_exists('student_follow_up')) {
                $transaction->prepare('DELETE FROM student_follow_up WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['followUp']) && academic_db_table_exists('follow_up_settings')) {
                $transaction->prepare('DELETE FROM follow_up_settings WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['documents']) && academic_db_table_exists('knowledge_resources') && academic_db_column_exists('knowledge_resources', 'academic_year')) {
                $transaction->prepare('DELETE FROM knowledge_resources WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['documents']) && academic_db_table_exists('student_portfolio_files') && academic_db_column_exists('student_portfolio_files', 'academic_year')) {
                $transaction->prepare('DELETE FROM student_portfolio_files WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['learningStyle']) && academic_db_table_exists('learning_style_campaigns') && academic_db_column_exists('learning_style_campaigns', 'academic_year')) {
                if (academic_db_table_exists('learning_style_assessments')) {
                    $transaction->prepare('DELETE a FROM learning_style_assessments a JOIN learning_style_campaigns c ON c.id=a.campaign_id WHERE c.academic_year=?')->execute([$target]);
                }
                $transaction->prepare('DELETE FROM learning_style_campaigns WHERE academic_year=?')->execute([$target]);
            }
            if (isset($selectedSet['motivation']) && academic_db_table_exists('motivational_points') && academic_db_table_exists('students') && academic_db_table_exists('classes')) {
                $transaction->prepare(
                    'DELETE mp FROM motivational_points mp JOIN students s ON s.id=mp.student_id JOIN classes c ON c.id=s.class_id WHERE c.academic_year=?'
                )->execute([$target]);
            }
            if (isset($selectedSet['notifications']) && academic_db_table_exists('notifications') && academic_db_table_exists('students') && academic_db_table_exists('classes')) {
                $transaction->prepare(
                    'DELETE n FROM notifications n JOIN students s ON s.id=n.student_id JOIN classes c ON c.id=s.class_id WHERE c.academic_year=?'
                )->execute([$target]);
            }
            if (isset($selectedSet['remedial']) && academic_db_table_exists('remedial_plans') && academic_db_table_exists('students') && academic_db_table_exists('classes')) {
                $transaction->prepare(
                    'DELETE rp FROM remedial_plans rp JOIN students s ON s.id=rp.student_id JOIN classes c ON c.id=s.class_id WHERE c.academic_year=?'
                )->execute([$target]);
            }

            if (isset($selectedSet['tests']) && academic_db_table_exists('answers') && academic_db_table_exists('test_attempts') && academic_db_table_exists('tests')) {
                $transaction->prepare(
                    'DELETE FROM answers WHERE attempt_id IN (
                        SELECT a.id FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE t.academic_year=?
                    )'
                )->execute([$target]);
            }
            if (isset($selectedSet['tests']) && academic_db_table_exists('test_attempt_questions') && academic_db_table_exists('test_attempts') && academic_db_table_exists('tests')) {
                $transaction->prepare(
                    'DELETE FROM test_attempt_questions WHERE attempt_id IN (
                        SELECT a.id FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE t.academic_year=?
                    )'
                )->execute([$target]);
            }
            if (isset($selectedSet['tests']) && academic_db_table_exists('test_attempts') && academic_db_table_exists('tests')) {
                $transaction->prepare(
                    'DELETE FROM test_attempts WHERE test_id IN (
                        SELECT id FROM tests WHERE academic_year=?
                    )'
                )->execute([$target]);
            }
            if (isset($selectedSet['tests']) && academic_db_table_exists('test_questions') && academic_db_table_exists('tests')) {
                $transaction->prepare(
                    'DELETE FROM test_questions WHERE test_id IN (
                        SELECT id FROM tests WHERE academic_year=?
                    )'
                )->execute([$target]);
            }
            if (isset($selectedSet['tests']) && academic_db_table_exists('tests')) {
                $transaction->prepare('DELETE FROM tests WHERE academic_year=?')->execute([$target]);
            }

            if (isset($selectedSet['tests'])) {
                academic_rebuild_derived_results($transaction);
            }
            $transaction->prepare("UPDATE academic_year_reset_operations SET status='completed',completed_at=NOW() WHERE id=?")
                ->execute([$operationId]);
            $transaction->prepare(
                "INSERT INTO activity_log (actor_role,actor_id,academic_year,action,details,ip_address)
                 VALUES ('owner',?,?,?, ?, ?)"
            )->execute([
                $ownerId,
                $current !== '' ? $current : null,
                'بدء عام دراسي جديد وحذف بيانات العام السابق',
                "حذف بيانات العام {$target} مع بقاء الحسابات والإيميلات وبنوك الأسئلة. العملية رقم {$operationId}",
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
            return ['operationId' => $operationId];
        });

        academic_remove_directory($quarantine);
        academic_release_reset_lock($pdo);
        Http::json([
            'ok' => true,
            'operationId' => $result['operationId'],
            'deletedAcademicYear' => $target,
            'currentAcademicYear' => $current,
            'counts' => $counts,
            'message' => 'تم حذف بيانات العام السابق بنجاح، وبقيت الحسابات والإيميلات وإعدادات المدرسة وبنوك الأسئلة دون تغيير.',
        ]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        academic_restore_quarantine($quarantine, $moved);
        if ($operationId > 0) {
            try {
                execute_sql("UPDATE academic_year_reset_operations SET status='failed',error_message=?,completed_at=NOW() WHERE id=?", [mb_substr($error->getMessage(), 0, 1000), $operationId]);
            } catch (Throwable $ignored) {}
        }
        academic_release_reset_lock($pdo);
        error_log('[academic-year-reset] ' . $error->getMessage());
        Http::json(['error' => 'تعذّر إكمال حذف بيانات العام السابق. لم تُحذف الحسابات، وتم التراجع عن العملية.'], 500);
    }
}
