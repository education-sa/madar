<?php
declare(strict_types=1);

const TEACHER_ATTACHMENTS_MIGRATION = 'migration_20260809_teacher_analysis_attachments.sql';
const TEACHER_ATTACHMENT_MAX_FILE_BYTES = 10485760;
const TEACHER_ATTACHMENT_MAX_REQUEST_BYTES = 41943040;
const TEACHER_ATTACHMENT_MAX_FILES = 10;
const TEACHER_ATTACHMENT_MAX_IMAGE_PIXELS = 16000000;
const TEACHER_ATTACHMENT_MAX_IMAGE_SIDE = 10000;

function teacher_attachments_allowed_mime_types(): array
{
    return [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];
}

function teacher_attachments_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $requiredColumns = [
            'id', 'teacher_id', 'class_id', 'student_id', 'test_id', 'skill_id', 'academic_year', 'semester',
            'test_type', 'subject_name', 'unit_name', 'lesson_name', 'note', 'original_name', 'stored_name',
            'mime_type', 'size_bytes', 'sha256', 'created_at', 'updated_at', 'deleted_at',
        ];
        $columnRows = fetch_all(
            "SELECT COLUMN_NAME AS schema_column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='teacher_analysis_attachments'"
        );
        $columns = array_fill_keys(array_map(static fn(array $row): string => (string) $row['schema_column_name'], $columnRows), true);
        $indexRows = fetch_all(
            "SELECT DISTINCT INDEX_NAME AS schema_index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='teacher_analysis_attachments'"
        );
        $indexes = array_fill_keys(array_map(static fn(array $row): string => (string) $row['schema_index_name'], $indexRows), true);
        $ready = isset($indexes['uq_teacher_analysis_attachment_stored'], $indexes['idx_teacher_analysis_attachment_scope']);
        foreach ($requiredColumns as $column) {
            if (!isset($columns[$column])) { $ready = false; break; }
        }
    } catch (PDOException) {
        $ready = false;
    }
    return $ready;
}

function teacher_skill_assessments_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $required = [
            'teacher_skill_assessments' => ['id','teacher_id','class_id','academic_year','semester','title','assessment_date','input_mode','mastery_threshold','roster_count','subject_name','unit_name','lesson_name','deleted_at'],
            'teacher_skill_assessment_items' => ['id','assessment_id','skill_id','skill_name_snapshot','question_count','mastered_count','sort_order'],
            'teacher_skill_assessment_scores' => ['id','item_id','student_id','student_name_snapshot','correct_count'],
        ];
        foreach ($required as $table => $columns) {
            $rows = fetch_all(
                'SELECT COLUMN_NAME AS schema_column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',
                [$table]
            );
            $found = array_fill_keys(array_map(static fn(array $row): string => (string) $row['schema_column_name'], $rows), true);
            foreach ($columns as $column) {
                if (!isset($found[$column])) return $ready = false;
            }
        }
        $ready = true;
    } catch (PDOException) {
        $ready = false;
    }
    return $ready;
}

function teacher_attachments_migration_payload(): array
{
    return [
        'migrationReady' => false,
        'migrationFile' => TEACHER_ATTACHMENTS_MIGRATION,
        'message' => 'يلزم تشغيل ملف ' . TEACHER_ATTACHMENTS_MIGRATION . ' مرة واحدة لتفعيل حفظ المرفقات والتقويم اليدوي.',
    ];
}

function teacher_attachments_storage_directory(): string
{
    $directory = MADAR_ROOT . '/storage/private/teacher-analysis-attachments';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        Http::json(['error' => 'تعذّر تجهيز مجلد المرفقات الخاصة.'], 500);
    }
    if (!is_writable($directory)) Http::json(['error' => 'مجلد المرفقات الخاصة غير قابل للكتابة.'], 500);
    return $directory;
}

function teacher_attachments_query_text(string $key, int $maxLength = 190): string
{
    return mb_substr(trim((string) ($_GET[$key] ?? '')), 0, $maxLength);
}

function teacher_attachments_query_date(string $key): string
{
    $value = teacher_attachments_query_text($key, 10);
    if ($value === '') return '';
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) Http::json(['error' => 'نطاق التاريخ غير صالح. استخدمي الصيغة YYYY-MM-DD.'], 422);
    return $value;
}

function teacher_attachments_scope(int $teacherId): array
{
    $stage = teacher_attachments_query_text('stage', 30);
    if (!in_array($stage, ['', 'all', 'ابتدائي', 'متوسط', 'ثانوي'], true)) $stage = '';
    if ($stage === 'all') $stage = '';
    $gradeLabel = teacher_attachments_query_text('gradeLabel', 80);
    if ($gradeLabel === 'all') $gradeLabel = '';
    $classId = max(0, (int) ($_GET['classId'] ?? 0));
    if ($classId > 0 && !teacher_owns_class($teacherId, $classId)) Http::json(['error' => 'الفصل المحدد غير موجود.'], 404);
    $semester = teacher_attachments_query_text('semester', 20);
    if (!in_array($semester, ['', 'all', 'first', 'second'], true)) $semester = '';
    if ($semester === 'all') $semester = '';
    $testId = max(0, (int) ($_GET['testId'] ?? 0));
    $test = null;
    if ($testId > 0) {
        $test = fetch_one('SELECT id,class_id,academic_year,semester FROM tests WHERE id=? AND teacher_id=?', [$testId, $teacherId]);
        if (!$test) Http::json(['error' => 'الاختبار المحدد غير موجود.'], 404);
        $testClassId = max(0, (int) ($test['class_id'] ?? 0));
        if ($classId > 0 && $testClassId > 0 && $testClassId !== $classId) Http::json(['error' => 'الاختبار لا يتبع الفصل المحدد.'], 422);
        if ($classId === 0 && $testClassId > 0) $classId = $testClassId;
    }
    $studentId = max(0, (int) ($_GET['studentId'] ?? 0));
    if ($studentId > 0 && !teacher_owns_student($teacherId, $studentId)) Http::json(['error' => 'الطالبة المحددة غير موجودة.'], 404);
    $dateFrom = teacher_attachments_query_date('dateFrom');
    $dateTo = teacher_attachments_query_date('dateTo');
    if ($dateFrom !== '' && $dateTo !== '' && $dateFrom > $dateTo) Http::json(['error' => 'تاريخ البداية يجب أن يسبق تاريخ النهاية.'], 422);
    $academicYear = teacher_attachments_query_text('academicYear', 30);
    if ($studentId > 0 && $classId > 0) {
        $studentClass = fetch_one('SELECT id FROM students WHERE id=? AND class_id=? AND deleted_at IS NULL', [$studentId, $classId]);
        if (!$studentClass) Http::json(['error' => 'الطالبة لا تنتمي إلى الفصل المحدد.'], 422);
    }
    return [
        'stage' => $stage,
        'gradeLabel' => $gradeLabel,
        'classId' => $classId,
        'academicYear' => $academicYear,
        'semester' => $semester,
        'subject' => teacher_attachments_query_text('subject'),
        'unit' => teacher_attachments_query_text('unit'),
        'lesson' => teacher_attachments_query_text('lesson'),
        'testType' => teacher_attachments_query_text('testType', 30),
        'testId' => $testId,
        'studentId' => $studentId,
        'skillId' => max(0, (int) ($_GET['skillId'] ?? 0)),
        'fileType' => teacher_attachments_query_text('fileType', 20),
        'search' => teacher_attachments_query_text('search', 120),
        'dateFrom' => $dateFrom,
        'dateTo' => $dateTo,
    ];
}

function teacher_attachments_grade_matches(string $stage, string $rowGrade, string $filterGrade): bool
{
    if ($filterGrade === '') return true;
    return teacher_analysis_grade_key($stage, $rowGrade) === teacher_analysis_grade_key($stage, $filterGrade);
}

function teacher_attachments_test_content_rows(int $teacherId): array
{
    $sql = "SELECT DISTINCT t.id AS test_id,t.class_id,t.test_type,t.academic_year,t.semester,
                   COALESCE(c.stage,t.bank_stage,qb.stage,'') AS stage,
                   COALESCE(c.grade_label,t.bank_grade_label,qb.grade_label,'') AS grade_label,
                   COALESCE(NULLIF(qb.subject_name,''),'') AS subject_name,
                   COALESCE(NULLIF(qb.unit_name,''),NULLIF(qb.chapter_name,''),'') AS unit_name,
                   COALESCE(NULLIF(qb.lesson_name,''),NULLIF(qb.topic,''),'') AS lesson_name,
                   COALESCE(tq.skill_id,qb.skill_id,t.skill_id) AS skill_id,
                   COALESCE(NULLIF(sk.name,''),'') AS skill_name
            FROM tests t
            LEFT JOIN classes c ON c.id=t.class_id AND c.teacher_id=t.teacher_id
            LEFT JOIN test_questions tq ON tq.test_id=t.id
            LEFT JOIN question_bank qb ON qb.id=tq.bank_question_id AND qb.teacher_id=t.teacher_id
            LEFT JOIN skills sk ON sk.id=COALESCE(tq.skill_id,qb.skill_id,t.skill_id)
            WHERE t.teacher_id=?
            UNION
            SELECT DISTINCT t.id AS test_id,COALESCE(t.class_id,s.class_id) AS class_id,t.test_type,t.academic_year,t.semester,
                   COALESCE(c.stage,t.bank_stage,qb.stage,'') AS stage,
                   COALESCE(c.grade_label,t.bank_grade_label,qb.grade_label,'') AS grade_label,
                   COALESCE(NULLIF(qb.subject_name,''),'') AS subject_name,
                   COALESCE(NULLIF(qb.unit_name,''),NULLIF(qb.chapter_name,''),'') AS unit_name,
                   COALESCE(NULLIF(qb.lesson_name,''),NULLIF(qb.topic,''),'') AS lesson_name,
                   COALESCE(aq.skill_id,qb.skill_id,t.skill_id) AS skill_id,
                   COALESCE(NULLIF(aq.skill_name,''),NULLIF(sk.name,''),'') AS skill_name
            FROM tests t
            JOIN test_attempts ta ON ta.test_id=t.id AND ta.status IN ('submitted','graded')
            JOIN students s ON s.id=ta.student_id
            LEFT JOIN classes c ON c.id=COALESCE(t.class_id,s.class_id) AND c.teacher_id=t.teacher_id
            JOIN test_attempt_questions aq ON aq.attempt_id=ta.id
            LEFT JOIN question_bank qb ON qb.id=aq.bank_question_id AND qb.teacher_id=t.teacher_id
            LEFT JOIN skills sk ON sk.id=COALESCE(aq.skill_id,qb.skill_id,t.skill_id)
            WHERE t.teacher_id=?";
    return fetch_all($sql, [$teacherId, $teacherId]);
}

function teacher_attachments_content_row_matches(array $row, array $scope, string $defaultSubject): bool
{
    if ($scope['testId'] > 0 && (int) $row['test_id'] !== $scope['testId']) return false;
    if ($scope['classId'] > 0 && (int) ($row['class_id'] ?? 0) > 0 && (int) $row['class_id'] !== $scope['classId']) return false;
    if ($scope['stage'] !== '' && (string) $row['stage'] !== '' && (string) $row['stage'] !== $scope['stage']) return false;
    if ((string) $row['stage'] !== '' && !teacher_attachments_grade_matches((string) $row['stage'], (string) $row['grade_label'], $scope['gradeLabel'])) return false;
    if ($scope['academicYear'] !== '' && (string) $row['academic_year'] !== '' && (string) $row['academic_year'] !== $scope['academicYear']) return false;
    if ($scope['semester'] !== '' && (string) $row['semester'] !== $scope['semester']) return false;
    if ($scope['testType'] !== '' && (string) $row['test_type'] !== $scope['testType']) return false;
    $subject = trim((string) ($row['subject_name'] ?? '')) ?: $defaultSubject;
    $unit = trim((string) ($row['unit_name'] ?? ''));
    $lesson = trim((string) ($row['lesson_name'] ?? ''));
    if ($scope['subject'] !== '' && $subject !== $scope['subject']) return false;
    if ($scope['unit'] !== '' && $unit !== $scope['unit']) return false;
    if ($scope['lesson'] !== '' && $lesson !== $scope['lesson']) return false;
    if ($scope['skillId'] > 0 && (int) ($row['skill_id'] ?? 0) !== $scope['skillId']) return false;
    return true;
}

function teacher_attachments_context_options(int $teacherId, array $scope): array
{
    $settings = fetch_one('SELECT subject_name,academic_year,current_semester FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]);
    $defaultSubject = trim((string) ($settings['subject_name'] ?? ''));
    $classes = fetch_all(
        "SELECT id,name,stage,grade_label,academic_year FROM classes WHERE teacher_id=? ORDER BY FIELD(stage,'ابتدائي','متوسط','ثانوي'),grade_label,name",
        [$teacherId]
    );
    $testClassIdsForYear = [];
    if ($scope['academicYear'] !== '') {
        foreach (fetch_all('SELECT DISTINCT class_id FROM tests WHERE teacher_id=? AND academic_year=? AND class_id IS NOT NULL', [$teacherId, $scope['academicYear']]) as $row) {
            $testClassIdsForYear[(int) $row['class_id']] = true;
        }
    }
    $classOptions = [];
    foreach ($classes as $class) {
        if ($scope['classId'] > 0 && (int) $class['id'] !== $scope['classId']) continue;
        if ($scope['stage'] !== '' && (string) $class['stage'] !== $scope['stage']) continue;
        if (!teacher_attachments_grade_matches((string) $class['stage'], (string) $class['grade_label'], $scope['gradeLabel'])) continue;
        if ($scope['academicYear'] !== '' && (string) $class['academic_year'] !== $scope['academicYear'] && !isset($testClassIdsForYear[(int) $class['id']])) continue;
        $classOptions[] = teacher_analysis_option($class['id'], (string) $class['name'], [
            'stage' => $class['stage'], 'gradeLabel' => $class['grade_label'], 'academicYear' => $class['academic_year'],
        ]);
    }

    $studentWhere = ['c.teacher_id=?', "s.status='active'", 's.deleted_at IS NULL'];
    $studentParams = [$teacherId];
    if ($scope['classId'] > 0) { $studentWhere[] = 'c.id=?'; $studentParams[] = $scope['classId']; }
    if ($scope['stage'] !== '') { $studentWhere[] = 'c.stage=?'; $studentParams[] = $scope['stage']; }
    if ($scope['academicYear'] !== '') {
        $studentWhere[] = '(c.academic_year=? OR EXISTS (SELECT 1 FROM tests ty WHERE ty.teacher_id=c.teacher_id AND ty.class_id=c.id AND ty.academic_year=?))';
        $studentParams[] = $scope['academicYear'];
        $studentParams[] = $scope['academicYear'];
    }
    if ($scope['studentId'] > 0) { $studentWhere[] = 's.id=?'; $studentParams[] = $scope['studentId']; }
    $studentRows = fetch_all(
        'SELECT s.id,s.name,s.class_id,c.name AS class_name,c.stage,c.grade_label FROM students s JOIN classes c ON c.id=s.class_id WHERE ' . implode(' AND ', $studentWhere) . ' ORDER BY c.name,s.name',
        $studentParams
    );
    $studentOptions = [];
    foreach ($studentRows as $student) {
        if (!teacher_attachments_grade_matches((string) $student['stage'], (string) $student['grade_label'], $scope['gradeLabel'])) continue;
        $studentOptions[] = teacher_analysis_option($student['id'], (string) $student['name'], [
            'classId' => (int) $student['class_id'], 'className' => $student['class_name'],
        ]);
    }

    $testRows = fetch_all(
        'SELECT t.id,t.title,t.test_type,t.class_id,t.academic_year,t.semester,c.name AS class_name,c.stage,c.grade_label
         FROM tests t LEFT JOIN classes c ON c.id=t.class_id WHERE t.teacher_id=? ORDER BY t.created_at DESC,t.id DESC',
        [$teacherId]
    );
    $contextRows = teacher_attachments_test_content_rows($teacherId);
    $restrictTestsByContent = $scope['subject'] !== '' || $scope['unit'] !== '' || $scope['lesson'] !== '' || $scope['skillId'] > 0;
    $matchingTestIds = [];
    foreach ($contextRows as $row) {
        if (teacher_attachments_content_row_matches($row, $scope, $defaultSubject)) $matchingTestIds[(int) $row['test_id']] = true;
    }
    $testOptions = [];
    foreach ($testRows as $test) {
        if ($scope['testId'] > 0 && (int) $test['id'] !== $scope['testId']) continue;
        if ($scope['classId'] > 0 && $test['class_id'] !== null && (int) $test['class_id'] !== $scope['classId']) continue;
        if ($scope['stage'] !== '' && $test['stage'] !== null && (string) $test['stage'] !== $scope['stage']) continue;
        if ($test['stage'] !== null && !teacher_attachments_grade_matches((string) $test['stage'], (string) $test['grade_label'], $scope['gradeLabel'])) continue;
        if ($scope['academicYear'] !== '' && (string) $test['academic_year'] !== '' && (string) $test['academic_year'] !== $scope['academicYear']) continue;
        if ($scope['semester'] !== '' && (string) $test['semester'] !== $scope['semester']) continue;
        if ($scope['testType'] !== '' && (string) $test['test_type'] !== $scope['testType']) continue;
        if ($restrictTestsByContent && !isset($matchingTestIds[(int) $test['id']])) continue;
        $testOptions[] = teacher_analysis_option($test['id'], (string) $test['title'], [
            'type' => $test['test_type'], 'classId' => $test['class_id'] === null ? null : (int) $test['class_id'], 'className' => $test['class_name'] ?? '—',
        ]);
    }

    $subjects = [];
    $units = [];
    $lessons = [];
    $skills = [];
    foreach ($contextRows as $row) {
        $baseScope = $scope;
        $baseScope['subject'] = '';
        $baseScope['unit'] = '';
        $baseScope['lesson'] = '';
        $baseScope['skillId'] = 0;
        if (!teacher_attachments_content_row_matches($row, $baseScope, $defaultSubject)) continue;
        $subject = trim((string) ($row['subject_name'] ?? '')) ?: $defaultSubject;
        if ($subject !== '') $subjects[] = teacher_analysis_option($subject, $subject);
        if ($scope['subject'] !== '' && $subject !== $scope['subject']) continue;
        $unit = trim((string) ($row['unit_name'] ?? ''));
        if ($unit !== '') $units[] = teacher_analysis_option($unit, $unit);
        if ($scope['unit'] !== '' && $unit !== $scope['unit']) continue;
        $lesson = trim((string) ($row['lesson_name'] ?? ''));
        if ($lesson !== '') $lessons[] = teacher_analysis_option($lesson, $lesson);
        if ($scope['lesson'] !== '' && $lesson !== $scope['lesson']) continue;
        $skillId = (int) ($row['skill_id'] ?? 0);
        $skillName = trim((string) ($row['skill_name'] ?? ''));
        if ($skillId > 0 && $skillName !== '') $skills[] = teacher_analysis_option($skillId, $skillName);
    }
    $academicYears = [];
    foreach ($classes as $class) {
        $year = trim((string) ($class['academic_year'] ?? ''));
        if ($year !== '') $academicYears[] = teacher_analysis_option($year, $year);
    }
    foreach ($testRows as $test) {
        $year = trim((string) ($test['academic_year'] ?? ''));
        if ($year !== '') $academicYears[] = teacher_analysis_option($year, $year);
    }
    $settingsYear = trim((string) ($settings['academic_year'] ?? ''));
    if ($settingsYear !== '') $academicYears[] = teacher_analysis_option($settingsYear, $settingsYear);
    return [
        'academicYears' => teacher_analysis_unique_options($academicYears),
        'periods' => [teacher_analysis_option('first', 'الفصل الدراسي الأول'), teacher_analysis_option('second', 'الفصل الدراسي الثاني')],
        'classes' => teacher_analysis_unique_options($classOptions),
        'students' => teacher_analysis_unique_options($studentOptions),
        'tests' => teacher_analysis_unique_options($testOptions),
        'subjects' => teacher_analysis_unique_options($subjects),
        'units' => teacher_analysis_unique_options($units),
        'lessons' => teacher_analysis_unique_options($lessons),
        'skills' => teacher_analysis_unique_options($skills),
        'testTypes' => [
            teacher_analysis_option('pre_diagnostic', 'تشخيصي قبلي'),
            teacher_analysis_option('post_diagnostic', 'تشخيصي بعدي'),
            teacher_analysis_option('quiz', 'اختبار قصير'),
        ],
    ];
}

function teacher_attachments_analysis(int $teacherId): never
{
    $scope = teacher_attachments_scope($teacherId);
    $threshold = max(0, min(100, (int) ($_GET['threshold'] ?? 80)));
    $options = teacher_attachments_context_options($teacherId, $scope);
    $attempts = teacher_analysis_latest_attempts($teacherId, $scope['classId'], $scope['testId'], $scope['studentId'] ?: null);
    $attemptMap = [];
    foreach ($attempts as $attempt) {
        if ($scope['stage'] !== '' && (string) $attempt['class_stage'] !== $scope['stage']) continue;
        if (!teacher_attachments_grade_matches((string) $attempt['class_stage'], (string) $attempt['class_grade_label'], $scope['gradeLabel'])) continue;
        if ($scope['academicYear'] !== '' && (string) $attempt['academic_year'] !== '' && (string) $attempt['academic_year'] !== $scope['academicYear']) continue;
        if ($scope['semester'] !== '' && (string) $attempt['semester'] !== $scope['semester']) continue;
        if ($scope['testType'] !== '' && (string) $attempt['test_type'] !== $scope['testType']) continue;
        $submittedDate = substr((string) ($attempt['submitted_at'] ?? ''), 0, 10);
        if ($scope['dateFrom'] !== '' && ($submittedDate === '' || $submittedDate < $scope['dateFrom'])) continue;
        if ($scope['dateTo'] !== '' && ($submittedDate === '' || $submittedDate > $scope['dateTo'])) continue;
        $attemptMap[(int) $attempt['id']] = $attempt;
    }
    $answers = teacher_analysis_answer_rows(array_keys($attemptMap));
    $settings = fetch_one('SELECT subject_name FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]);
    $defaultSubject = trim((string) ($settings['subject_name'] ?? ''));
    $groups = [];
    $skillQuestions = [];
    $responseCount = 0;
    $unweightedResponses = 0;
    foreach ($answers as $answer) {
        $attempt = $attemptMap[(int) $answer['attempt_id']] ?? null;
        if (!$attempt) continue;
        $subject = trim((string) ($answer['subject_name'] ?? '')) ?: $defaultSubject;
        $unit = trim((string) ($answer['unit_name'] ?? ''));
        $lesson = trim((string) ($answer['lesson_name'] ?? ''));
        $skillId = (int) ($answer['skill_id'] ?? 0);
        if ($scope['subject'] !== '' && $subject !== $scope['subject']) continue;
        if ($scope['unit'] !== '' && $unit !== $scope['unit']) continue;
        if ($scope['lesson'] !== '' && $lesson !== $scope['lesson']) continue;
        if ($scope['skillId'] > 0 && $skillId !== $scope['skillId']) continue;
        if ($skillId <= 0) continue;
        $possible = max(0, (float) ($answer['question_points'] ?? 0));
        $earned = max(0, (float) ($answer['points_earned'] ?? 0));
        if ($possible <= 0) {
            $possible = 1.0;
            $earned = (int) ($answer['is_correct'] ?? 0) === 1 ? 1.0 : 0.0;
            $unweightedResponses++;
        }
        $studentId = (int) $attempt['student_id'];
        $key = $studentId . ':' . $skillId;
        if (!isset($groups[$key])) {
            $groups[$key] = [
                'studentId' => $studentId,
                'studentName' => (string) $attempt['student_name'],
                'className' => (string) ($attempt['class_name'] ?? '—'),
                'skillId' => $skillId,
                'skillName' => trim((string) ($answer['skill_name'] ?? '')),
                'earned' => 0.0,
                'possible' => 0.0,
                'responses' => 0,
            ];
        }
        $groups[$key]['earned'] += min($possible, $earned);
        $groups[$key]['possible'] += $possible;
        $groups[$key]['responses']++;
        $questionKey = (int) ($answer['bank_question_id'] ?? 0) > 0
            ? 'bank:' . (int) $answer['bank_question_id']
            : ((int) ($answer['source_question_id'] ?? 0) > 0
                ? 'source:' . (int) $answer['source_question_id']
                : ((int) ($answer['question_id'] ?? 0) > 0 ? 'question:' . (int) $answer['question_id'] : 'attempt:' . (int) $answer['attempt_id'] . ':' . (int) ($answer['order_index'] ?? 0)));
        $skillQuestions[$skillId][$questionKey] = true;
        $responseCount++;
    }

    $testedDetailed = [];
    foreach ($groups as $group) {
        $percent = teacher_analysis_percent((float) $group['earned'], (float) $group['possible']);
        $testedDetailed[] = [
            'studentId' => $group['studentId'], 'studentName' => $group['studentName'], 'className' => $group['className'],
            'skillId' => $group['skillId'], 'skillName' => $group['skillName'],
            'earned' => teacher_analysis_number((float) $group['earned']),
            'possible' => teacher_analysis_number((float) $group['possible']),
            'percent' => $percent, 'responses' => $group['responses'],
            'mastered' => $percent >= $threshold, 'status' => $percent >= $threshold ? 'mastered' : 'not_mastered',
        ];
    }

    $skillGroups = [];
    foreach ($testedDetailed as $row) {
        $key = (string) $row['skillId'];
        if (!isset($skillGroups[$key])) $skillGroups[$key] = [
            'skillId' => $row['skillId'], 'skillName' => $row['skillName'], 'participants' => 0, 'masteredStudents' => 0,
            'earned' => 0.0, 'possible' => 0.0, 'maximum' => 0.0, 'responses' => 0, 'percentages' => [],
        ];
        $skillGroups[$key]['participants']++;
        if ($row['mastered']) $skillGroups[$key]['masteredStudents']++;
        $skillGroups[$key]['earned'] += (float) $row['earned'];
        $skillGroups[$key]['possible'] += (float) $row['possible'];
        $skillGroups[$key]['maximum'] = max($skillGroups[$key]['maximum'], (float) $row['possible']);
        $skillGroups[$key]['responses'] += (int) $row['responses'];
        $skillGroups[$key]['percentages'][] = (float) $row['percent'];
    }
    $quick = [];
    foreach ($skillGroups as $group) {
        $averagePerformance = teacher_analysis_percent((float) $group['earned'], (float) $group['possible']);
        $masteryPercent = teacher_analysis_percent((float) $group['masteredStudents'], (float) $group['participants']);
        $quick[] = [
            'skillId' => $group['skillId'], 'skillName' => $group['skillName'],
            'questionCount' => count($skillQuestions[(int) $group['skillId']] ?? []),
            'maximum' => teacher_analysis_number($group['maximum']),
            'participants' => $group['participants'], 'students' => $group['participants'],
            'masteredStudents' => $group['masteredStudents'],
            'notMasteredStudents' => $group['participants'] - $group['masteredStudents'],
            'averagePerformance' => $averagePerformance,
            'masteryPercent' => $masteryPercent, 'masteredPercent' => $masteryPercent,
            'earned' => teacher_analysis_number($group['earned']), 'possible' => teacher_analysis_number($group['possible']),
            'percent' => $averagePerformance, 'responses' => $group['responses'],
            'mastered' => $masteryPercent >= $threshold, 'status' => $masteryPercent >= $threshold ? 'mastered' : 'not_mastered',
        ];
    }
    usort($quick, static fn(array $a, array $b): int => strcmp((string) $a['skillName'], (string) $b['skillName']));

    $testedKeys = array_fill_keys(array_map(static fn(array $row): string => $row['studentId'] . ':' . $row['skillId'], $testedDetailed), true);
    $detailed = $testedDetailed;
    foreach (($options['students'] ?? []) as $student) {
        foreach ($quick as $skill) {
            $key = (string) $student['value'] . ':' . (string) $skill['skillId'];
            if (isset($testedKeys[$key])) continue;
            $detailed[] = [
                'studentId' => (int) $student['value'], 'studentName' => (string) $student['label'], 'className' => (string) ($student['className'] ?? '—'),
                'skillId' => (int) $skill['skillId'], 'skillName' => (string) $skill['skillName'],
                'earned' => null, 'possible' => null, 'percent' => null, 'responses' => 0,
                'mastered' => false, 'status' => 'not_tested',
            ];
        }
    }
    usort($detailed, static fn(array $a, array $b): int => [$a['skillName'], $a['studentName']] <=> [$b['skillName'], $b['studentName']]);

    $studentTotals = [];
    foreach ($testedDetailed as $row) {
        $studentId = (int) $row['studentId'];
        $studentTotals[$studentId]['earned'] = ($studentTotals[$studentId]['earned'] ?? 0) + (float) $row['earned'];
        $studentTotals[$studentId]['possible'] = ($studentTotals[$studentId]['possible'] ?? 0) + (float) $row['possible'];
    }
    $participants = count($studentTotals);
    $masteredParticipants = 0;
    foreach ($studentTotals as $total) if (teacher_analysis_percent((float) $total['earned'], (float) $total['possible']) >= $threshold) $masteredParticipants++;
    $totalStudents = count($options['students'] ?? []);
    $overallEarned = array_sum(array_column($testedDetailed, 'earned'));
    $overallPossible = array_sum(array_column($testedDetailed, 'possible'));
    $masteredSkills = count(array_filter($quick, static fn(array $row): bool => (bool) $row['mastered']));
    Http::json([
        'status' => $quick ? 'ready' : 'empty',
        'message' => $quick ? '' : ($scope['testId'] > 0
            ? 'لا توجد مهارات مرتبطة بأسئلة هذا الاختبار، أو لا توجد محاولات مكتملة وفق الفلاتر المحددة.'
            : 'لا توجد نتائج متاحة مرتبطة بمهارات ضمن الفلاتر المحددة. اربطي أسئلة الاختبار بمهارات لظهور التحليل.'),
        'threshold' => $threshold,
        'filters' => $options,
        'summary' => [
            'students' => $totalStudents, 'totalStudents' => $totalStudents, 'participants' => $participants,
            'masteredStudents' => $masteredParticipants, 'notMasteredStudents' => $participants - $masteredParticipants,
            'notTestedStudents' => max(0, $totalStudents - $participants),
            'skills' => count($quick), 'responses' => $responseCount,
            'unweightedResponses' => $unweightedResponses,
            'masteredSkills' => $masteredSkills,
            'overallPercent' => teacher_analysis_percent((float) $overallEarned, (float) $overallPossible),
        ],
        'quickRows' => $quick,
        'detailedRows' => $detailed,
        'chart' => array_map(static fn(array $row): array => [
            'label' => $row['skillName'], 'value' => $row['masteryPercent'], 'mastered' => $row['mastered'],
            'participants' => $row['participants'], 'masteredStudents' => $row['masteredStudents'],
        ], $quick),
    ]);
}

function teacher_attachments_context(int $teacherId): never
{
    $scope = teacher_attachments_scope($teacherId);
    Http::json(array_merge([
        'migrationReady' => teacher_attachments_schema_ready(),
        'migrationFile' => TEACHER_ATTACHMENTS_MIGRATION,
        'limits' => ['maxFiles' => TEACHER_ATTACHMENT_MAX_FILES, 'maxFileBytes' => TEACHER_ATTACHMENT_MAX_FILE_BYTES, 'maxRequestBytes' => TEACHER_ATTACHMENT_MAX_REQUEST_BYTES],
    ], teacher_attachments_context_options($teacherId, $scope)));
}

function teacher_attachments_file_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'classId' => (int) $row['class_id'],
        'className' => (string) ($row['class_name'] ?? '—'),
        'stage' => (string) ($row['stage'] ?? ''),
        'gradeLabel' => (string) ($row['grade_label'] ?? ''),
        'studentId' => $row['student_id'] === null ? null : (int) $row['student_id'],
        'studentName' => $row['student_name'] ?? null,
        'testId' => $row['test_id'] === null ? null : (int) $row['test_id'],
        'testTitle' => $row['test_title'] ?? null,
        'testType' => $row['test_type'] ?? null,
        'skillId' => $row['skill_id'] === null ? null : (int) $row['skill_id'],
        'skillName' => $row['skill_name'] ?? null,
        'academicYear' => (string) $row['academic_year'],
        'semester' => (string) $row['semester'],
        'subjectName' => $row['subject_name'] ?? null,
        'unitName' => $row['unit_name'] ?? null,
        'lessonName' => $row['lesson_name'] ?? null,
        'note' => $row['note'] ?? null,
        'originalName' => (string) $row['original_name'],
        'mimeType' => (string) $row['mime_type'],
        'sizeBytes' => (int) $row['size_bytes'],
        'sha256' => (string) $row['sha256'],
        'createdAt' => (string) $row['created_at'],
    ];
}

function teacher_attachments_fetch_rows(int $teacherId, array $scope, ?array $ids = null, int $limit = 500): array
{
    if (!teacher_attachments_schema_ready()) return [];
    $where = ['a.teacher_id=?', 'a.deleted_at IS NULL'];
    $params = [$teacherId];
    if ($ids !== null) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn(int $id): bool => $id > 0)));
        if (!$ids) return [];
        $where[] = 'a.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        array_push($params, ...$ids);
    }
    if ($scope['classId'] > 0) { $where[] = 'a.class_id=?'; $params[] = $scope['classId']; }
    if ($scope['stage'] !== '') { $where[] = 'c.stage=?'; $params[] = $scope['stage']; }
    if ($scope['academicYear'] !== '') { $where[] = 'a.academic_year=?'; $params[] = $scope['academicYear']; }
    if ($scope['semester'] !== '') { $where[] = 'a.semester=?'; $params[] = $scope['semester']; }
    if ($scope['studentId'] > 0) { $where[] = 'a.student_id=?'; $params[] = $scope['studentId']; }
    if ($scope['testId'] > 0) { $where[] = 'a.test_id=?'; $params[] = $scope['testId']; }
    if ($scope['skillId'] > 0) { $where[] = 'a.skill_id=?'; $params[] = $scope['skillId']; }
    if ($scope['subject'] !== '') { $where[] = 'a.subject_name=?'; $params[] = $scope['subject']; }
    if ($scope['unit'] !== '') { $where[] = 'a.unit_name=?'; $params[] = $scope['unit']; }
    if ($scope['lesson'] !== '') { $where[] = 'a.lesson_name=?'; $params[] = $scope['lesson']; }
    if ($scope['testType'] !== '') { $where[] = 'a.test_type=?'; $params[] = $scope['testType']; }
    if ($scope['dateFrom'] !== '') { $where[] = 'a.created_at>=?'; $params[] = $scope['dateFrom'] . ' 00:00:00'; }
    if ($scope['dateTo'] !== '') { $where[] = 'a.created_at<?'; $params[] = (new DateTimeImmutable($scope['dateTo']))->modify('+1 day')->format('Y-m-d') . ' 00:00:00'; }
    if ($scope['fileType'] === 'image') $where[] = "a.mime_type LIKE 'image/%'";
    elseif ($scope['fileType'] === 'pdf') $where[] = "a.mime_type='application/pdf'";
    if ($scope['search'] !== '') {
        $where[] = '(a.original_name LIKE ? OR a.note LIKE ?)';
        $like = '%' . $scope['search'] . '%';
        $params[] = $like; $params[] = $like;
    }
    $rows = fetch_all(
        'SELECT a.*,c.name AS class_name,c.stage,c.grade_label,s.name AS student_name,t.title AS test_title,sk.name AS skill_name
         FROM teacher_analysis_attachments a
         JOIN classes c ON c.id=a.class_id AND c.teacher_id=a.teacher_id
         LEFT JOIN students s ON s.id=a.student_id
         LEFT JOIN tests t ON t.id=a.test_id
         LEFT JOIN skills sk ON sk.id=a.skill_id
         WHERE ' . implode(' AND ', $where) . ' ORDER BY a.created_at DESC,a.id DESC LIMIT ' . max(1, min(500, $limit)),
        $params
    );
    if ($scope['gradeLabel'] === '') return $rows;
    return array_values(array_filter($rows, static fn(array $row): bool => teacher_attachments_grade_matches((string) $row['stage'], (string) $row['grade_label'], $scope['gradeLabel'])));
}

function teacher_attachments_list(int $teacherId): never
{
    if (!teacher_attachments_schema_ready()) Http::json(array_merge(teacher_attachments_migration_payload(), ['files' => [], 'count' => 0]));
    $rows = teacher_attachments_fetch_rows($teacherId, teacher_attachments_scope($teacherId));
    Http::json(['migrationReady' => true, 'count' => count($rows), 'files' => array_map('teacher_attachments_file_row', $rows)]);
}

function teacher_attachments_uploaded_files(): array
{
    $files = $_FILES['files'] ?? null;
    if (!$files || !is_array($files) || !isset($files['name'])) return [];
    $names = is_array($files['name']) ? $files['name'] : [$files['name']];
    $normalized = [];
    foreach (array_keys($names) as $index) {
        $normalized[] = [
            'name' => (string) (is_array($files['name']) ? $files['name'][$index] : $files['name']),
            'type' => (string) (is_array($files['type']) ? $files['type'][$index] : $files['type']),
            'tmp_name' => (string) (is_array($files['tmp_name']) ? $files['tmp_name'][$index] : $files['tmp_name']),
            'error' => (int) (is_array($files['error']) ? $files['error'][$index] : $files['error']),
            'size' => (int) (is_array($files['size']) ? $files['size'][$index] : $files['size']),
        ];
    }
    return $normalized;
}

function teacher_attachments_validate_upload_context(int $teacherId, array $data): array
{
    $classId = max(0, (int) ($data['classId'] ?? 0));
    $class = fetch_one('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE id=? AND teacher_id=?', [$classId, $teacherId]);
    if (!$class) Http::json(['error' => 'اختاري فصلًا صحيحًا قبل رفع المرفقات.'], 422);
    $academicYear = mb_substr(trim((string) ($data['academicYear'] ?? '')), 0, 30);
    if ($academicYear === '') Http::json(['error' => 'العام الدراسي غير صالح.'], 422);
    $semester = trim((string) ($data['semester'] ?? ''));
    if (!in_array($semester, ['first', 'second'], true)) Http::json(['error' => 'الفصل الدراسي غير صالح.'], 422);
    $studentId = max(0, (int) ($data['studentId'] ?? 0));
    if ($studentId > 0) {
        $student = fetch_one("SELECT id FROM students WHERE id=? AND class_id=? AND status='active' AND deleted_at IS NULL", [$studentId, $classId]);
        if (!$student) Http::json(['error' => 'الطالبة لا تنتمي إلى الفصل المحدد.'], 422);
    }
    $testId = max(0, (int) ($data['testId'] ?? 0));
    $testType = null;
    if ($testId > 0) {
        $test = fetch_one('SELECT id,class_id,test_type,academic_year,semester FROM tests WHERE id=? AND teacher_id=?', [$testId, $teacherId]);
        if (!$test || ($test['class_id'] !== null && (int) $test['class_id'] !== $classId)) Http::json(['error' => 'الاختبار لا يطابق الفصل المحدد.'], 422);
        if (trim((string) $test['academic_year']) !== '' && trim((string) $test['academic_year']) !== $academicYear) Http::json(['error' => 'عام الاختبار لا يطابق العام الدراسي المحدد للمرفق.'], 422);
        if ((string) $test['semester'] !== $semester) Http::json(['error' => 'الفصل الدراسي للاختبار لا يطابق سياق المرفق.'], 422);
        $testType = (string) $test['test_type'];
    } else {
        $settings = fetch_one('SELECT academic_year FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]);
        $allowedYears = array_filter([(string) $class['academic_year'], (string) ($settings['academic_year'] ?? '')]);
        if (!in_array($academicYear, $allowedYears, true)) Http::json(['error' => 'العام الدراسي لا يطابق الفصل أو إعدادات المعلمة الحالية.'], 422);
    }
    $skillId = max(0, (int) ($data['skillId'] ?? 0));
    if ($skillId > 0) {
        $skill = fetch_one('SELECT id,stage,grade_label FROM skills WHERE id=?', [$skillId]);
        if (!$skill || (string) $skill['stage'] !== (string) $class['stage'] || !teacher_attachments_grade_matches((string) $class['stage'], (string) $skill['grade_label'], (string) $class['grade_label'])) {
            Http::json(['error' => 'المهارة لا تطابق مرحلة وصف الفصل المحدد.'], 422);
        }
    }
    $textFields = ['subjectName' => 190, 'unitName' => 190, 'lessonName' => 190, 'note' => 1000];
    $values = [];
    foreach ($textFields as $key => $limit) {
        $value = trim((string) ($data[$key] ?? ''));
        if (mb_strlen($value) > $limit) Http::json(['error' => 'أحد حقول وصف المرفق أطول من الحد المسموح.'], 422);
        $values[$key] = $value === '' ? null : $value;
    }
    $validationScope = [
        'stage' => (string) $class['stage'], 'gradeLabel' => (string) $class['grade_label'], 'classId' => $classId,
        'academicYear' => $academicYear, 'semester' => $semester,
        'subject' => '', 'unit' => '', 'lesson' => '', 'testType' => $testType ?? '', 'testId' => $testId,
        'studentId' => 0, 'skillId' => 0, 'fileType' => '', 'search' => '', 'dateFrom' => '', 'dateTo' => '',
    ];
    $assertOption = static function (array $options, string|int $value, string $message): void {
        foreach ($options as $option) if ((string) ($option['value'] ?? '') === (string) $value) return;
        Http::json(['error' => $message], 422);
    };
    if ($values['subjectName'] !== null) {
        $available = teacher_attachments_context_options($teacherId, $validationScope);
        $assertOption($available['subjects'] ?? [], $values['subjectName'], 'المادة المحددة لا ترتبط بالفصل أو الاختبار المحدد.');
        $validationScope['subject'] = $values['subjectName'];
    }
    if ($values['unitName'] !== null) {
        $available = teacher_attachments_context_options($teacherId, $validationScope);
        $assertOption($available['units'] ?? [], $values['unitName'], 'الوحدة المحددة لا ترتبط بالمادة أو الاختبار المحدد.');
        $validationScope['unit'] = $values['unitName'];
    }
    if ($values['lessonName'] !== null) {
        $available = teacher_attachments_context_options($teacherId, $validationScope);
        $assertOption($available['lessons'] ?? [], $values['lessonName'], 'الدرس المحدد لا يرتبط بالوحدة أو الاختبار المحدد.');
        $validationScope['lesson'] = $values['lessonName'];
    }
    if ($skillId > 0) {
        $available = teacher_attachments_context_options($teacherId, $validationScope);
        $assertOption($available['skills'] ?? [], $skillId, 'المهارة المحددة غير مرتبطة بمحتوى الفصل أو الاختبار المحدد.');
    }
    return [
        'classId' => $classId, 'studentId' => $studentId ?: null, 'testId' => $testId ?: null, 'skillId' => $skillId ?: null,
        'academicYear' => $academicYear, 'semester' => $semester, 'testType' => $testType,
        ...$values,
    ];
}

function teacher_attachments_upload(int $teacherId): never
{
    if (!teacher_attachments_schema_ready()) Http::json(teacher_attachments_migration_payload(), 409);
    $context = teacher_attachments_validate_upload_context($teacherId, $_POST);
    $files = teacher_attachments_uploaded_files();
    if (!$files) Http::json(['error' => 'اختاري ملفًا واحدًا على الأقل.'], 422);
    if (count($files) > TEACHER_ATTACHMENT_MAX_FILES) Http::json(['error' => 'الحد الأقصى 10 ملفات في كل عملية رفع.'], 422);
    $totalBytes = array_sum(array_map(static fn(array $file): int => (int) $file['size'], $files));
    if ($totalBytes > TEACHER_ATTACHMENT_MAX_REQUEST_BYTES) Http::json(['error' => 'إجمالي الملفات يجب ألا يتجاوز 40 ميجابايت.'], 422);
    if (!class_exists('finfo')) Http::json(['error' => 'الخادم يحتاج إضافة Fileinfo للتحقق من الملفات.'], 500);
    $allowed = teacher_attachments_allowed_mime_types();
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $prepared = [];
    foreach ($files as $file) {
        if ($file['error'] !== UPLOAD_ERR_OK) Http::json(['error' => 'تعذّر رفع أحد الملفات. تحققي من حجمه ثم حاولي مجددًا.'], 422);
        if ($file['size'] < 1 || $file['size'] > TEACHER_ATTACHMENT_MAX_FILE_BYTES) Http::json(['error' => 'حجم كل ملف يجب ألا يتجاوز 10 ميجابايت.'], 422);
        if ($file['tmp_name'] === '' || !is_uploaded_file($file['tmp_name'])) Http::json(['error' => 'أحد ملفات الرفع غير صالح.'], 422);
        $mime = (string) ($finfo->file($file['tmp_name']) ?: '');
        if (!isset($allowed[$mime])) Http::json(['error' => 'الأنواع المسموحة: PDF وJPG وPNG وWEBP وGIF فقط.'], 422);
        if (str_starts_with($mime, 'image/')) {
            $dimensions = @getimagesize($file['tmp_name']);
            $width = (int) ($dimensions[0] ?? 0);
            $height = (int) ($dimensions[1] ?? 0);
            if ($width < 1 || $height < 1) Http::json(['error' => 'أحد ملفات الصور تالف أو لا يطابق نوعه الحقيقي.'], 422);
            if ($width > TEACHER_ATTACHMENT_MAX_IMAGE_SIDE || $height > TEACHER_ATTACHMENT_MAX_IMAGE_SIDE || $width * $height > TEACHER_ATTACHMENT_MAX_IMAGE_PIXELS) {
                Http::json(['error' => 'أبعاد إحدى الصور كبيرة جدًا. الحد الأقصى 16 مليون بكسل و10000 بكسل لكل ضلع.'], 422);
            }
        }
        $rawOriginal = trim(str_replace(["\0", "\r", "\n"], '', basename(str_replace('\\', '/', $file['name']))));
        $rawOriginal = preg_replace('/[\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', $rawOriginal) ?? $rawOriginal;
        if ($rawOriginal === '' || mb_strlen($rawOriginal) > 255) Http::json(['error' => 'اسم أحد الملفات غير صالح أو طويل جدًا.'], 422);
        $stem = trim((string) pathinfo($rawOriginal, PATHINFO_FILENAME), ". \t\n\r\0\x0B");
        $stem = preg_replace('/[.]+/u', '-', $stem) ?? $stem;
        $stem = preg_replace('/[\x00-\x1F\x7F]/u', '', $stem) ?? $stem;
        if ($stem === '') $stem = 'madar-attachment';
        $original = mb_substr($stem, 0, 240) . '.' . $allowed[$mime];
        $stored = bin2hex(random_bytes(24)) . '.' . $allowed[$mime];
        $prepared[] = $file + ['mime' => $mime, 'original' => $original, 'stored' => $stored, 'sha256' => hash_file('sha256', $file['tmp_name']) ?: ''];
    }
    $directory = teacher_attachments_storage_directory();
    $moved = [];
    try {
        $inserted = Database::transaction(function (PDO $pdo) use ($prepared, $context, $teacherId, $directory, &$moved): array {
            $statement = $pdo->prepare(
                'INSERT INTO teacher_analysis_attachments
                 (teacher_id,class_id,student_id,test_id,skill_id,academic_year,semester,test_type,subject_name,unit_name,lesson_name,note,original_name,stored_name,mime_type,size_bytes,sha256)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            );
            $ids = [];
            foreach ($prepared as $file) {
                $path = $directory . '/' . $file['stored'];
                if (!move_uploaded_file($file['tmp_name'], $path)) throw new RuntimeException('move_failed');
                chmod($path, 0640);
                $moved[] = $path;
                $statement->execute([
                    $teacherId, $context['classId'], $context['studentId'], $context['testId'], $context['skillId'],
                    $context['academicYear'], $context['semester'], $context['testType'], $context['subjectName'], $context['unitName'],
                    $context['lessonName'], $context['note'], $file['original'], $file['stored'], $file['mime'], $file['size'], $file['sha256'],
                ]);
                $ids[] = (int) $pdo->lastInsertId();
            }
            return $ids;
        });
    } catch (Throwable $error) {
        foreach ($moved as $path) if (is_file($path)) @unlink($path);
        if ($error instanceof RuntimeException && $error->getMessage() === 'move_failed') Http::json(['error' => 'تعذّر حفظ أحد الملفات المرفوعة.'], 500);
        throw $error;
    }
    Activity::log('teacher', $teacherId, 'رفع مرفقات تحليل المهارات', count($inserted) . ' مرفق · الفصل رقم ' . $context['classId']);
    Http::json(['ok' => true, 'uploaded' => count($inserted), 'ids' => $inserted], 201);
}

function teacher_attachments_send_file(int $teacherId, int $fileId, bool $download): never
{
    if (!teacher_attachments_schema_ready()) Http::json(teacher_attachments_migration_payload(), 409);
    $row = fetch_one('SELECT id,original_name,stored_name,mime_type,size_bytes FROM teacher_analysis_attachments WHERE id=? AND teacher_id=? AND deleted_at IS NULL', [$fileId, $teacherId]);
    if (!$row) Http::json(['error' => 'المرفق غير موجود.'], 404);
    $path = teacher_attachments_storage_directory() . '/' . basename((string) $row['stored_name']);
    if (!is_file($path)) Http::json(['error' => 'ملف المرفق غير متاح على الخادم.'], 404);
    $inlineAllowed = str_starts_with((string) $row['mime_type'], 'image/') || (string) $row['mime_type'] === 'application/pdf';
    $disposition = $download || !$inlineAllowed ? 'attachment' : 'inline';
    $original = str_replace(["\r", "\n", '"'], '', (string) $row['original_name']);
    $fallback = preg_replace('/[^A-Za-z0-9._-]/', '_', $original) ?: 'madar-attachment';
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: ' . (string) $row['mime_type']);
    header('Content-Length: ' . filesize($path));
    header("Content-Disposition: {$disposition}; filename=\"{$fallback}\"; filename*=UTF-8''" . rawurlencode($original));
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

function teacher_attachments_delete(int $teacherId): never
{
    if (!teacher_attachments_schema_ready()) Http::json(teacher_attachments_migration_payload(), 409);
    $data = Http::input();
    $ids = array_values(array_unique(array_filter(array_map('intval', is_array($data['ids'] ?? null) ? $data['ids'] : []), static fn(int $id): bool => $id > 0)));
    if (!$ids || count($ids) > 100) Http::json(['error' => 'حددي من 1 إلى 100 مرفق للحذف.'], 422);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    try {
        $paths = Database::transaction(function (PDO $pdo) use ($teacherId, $ids, $placeholders): array {
            $statement = $pdo->prepare("SELECT id,stored_name FROM teacher_analysis_attachments WHERE teacher_id=? AND deleted_at IS NULL AND id IN ({$placeholders}) FOR UPDATE");
            $statement->execute([$teacherId, ...$ids]);
            $rows = $statement->fetchAll();
            if (count($rows) !== count($ids)) throw new DomainException('invalid_selection');
            $update = $pdo->prepare("UPDATE teacher_analysis_attachments SET deleted_at=NOW(),updated_at=NOW() WHERE teacher_id=? AND id IN ({$placeholders})");
            $update->execute([$teacherId, ...$ids]);
            return array_column($rows, 'stored_name');
        });
    } catch (DomainException $error) {
        if ($error->getMessage() === 'invalid_selection') Http::json(['error' => 'أحد المرفقات المحددة غير موجود أو لا يتبع حسابك.'], 404);
        throw $error;
    }
    $directory = teacher_attachments_storage_directory();
    foreach ($paths as $stored) {
        $path = $directory . '/' . basename((string) $stored);
        if (is_file($path)) @unlink($path);
    }
    Activity::log('teacher', $teacherId, 'حذف مرفقات تحليل المهارات', count($paths) . ' مرفق');
    Http::json(['ok' => true, 'deleted' => count($paths)]);
}

function teacher_attachments_export_rows(int $teacherId): array
{
    if (!teacher_attachments_schema_ready()) Http::json(teacher_attachments_migration_payload(), 409);
    $rawIds = teacher_attachments_query_text('ids', 1800);
    $ids = $rawIds === '' ? null : array_values(array_unique(array_filter(array_map('intval', explode(',', $rawIds)), static fn(int $id): bool => $id > 0)));
    if ($ids !== null && (!$ids || count($ids) > 100)) Http::json(['error' => 'حددي من 1 إلى 100 مرفق للتصدير.'], 422);
    $rows = teacher_attachments_fetch_rows($teacherId, teacher_attachments_scope($teacherId), $ids, $ids === null ? 500 : 100);
    if ($ids !== null && count($rows) !== count($ids)) Http::json(['error' => 'أحد المرفقات المحددة غير موجود أو لا يتبع حسابك أو لا يطابق الفلاتر الحالية.'], 404);
    if (!$rows) Http::json(['error' => 'لا توجد مرفقات مطابقة للتصدير.'], 404);
    if (count($rows) > 100 || array_sum(array_map(static fn(array $row): int => (int) $row['size_bytes'], $rows)) > 209715200) {
        Http::json(['error' => 'حد التصدير 100 ملف وبحجم إجمالي 200 ميجابايت.'], 422);
    }
    return $rows;
}

function teacher_attachments_unique_export_name(string $original, array &$used): string
{
    $safe = trim(str_replace(["\0", "\r", "\n", '/', '\\'], '_', $original));
    if ($safe === '') $safe = 'attachment';
    $base = pathinfo($safe, PATHINFO_FILENAME) ?: 'attachment';
    $extension = pathinfo($safe, PATHINFO_EXTENSION);
    $candidate = $safe;
    $number = 2;
    while (isset($used[mb_strtolower($candidate)])) {
        $candidate = $base . '-' . $number . ($extension !== '' ? '.' . $extension : '');
        $number++;
    }
    $used[mb_strtolower($candidate)] = true;
    return $candidate;
}

function teacher_attachments_export_zip(int $teacherId): never
{
    if (!class_exists('ZipArchive')) Http::json(['error' => 'إضافة ZIP غير متاحة على الخادم.'], 500);
    $rows = teacher_attachments_export_rows($teacherId);
    $temporary = tempnam(sys_get_temp_dir(), 'madar-zip-');
    if ($temporary === false) Http::json(['error' => 'تعذّر تجهيز ملف ZIP مؤقت.'], 500);
    register_shutdown_function(static function () use ($temporary): void {
        if (is_file($temporary)) @unlink($temporary);
    });
    $zip = new ZipArchive();
    if ($zip->open($temporary, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) { @unlink($temporary); Http::json(['error' => 'تعذّر إنشاء ملف ZIP.'], 500); }
    $directory = teacher_attachments_storage_directory();
    $used = [];
    foreach ($rows as $row) {
        $path = $directory . '/' . basename((string) $row['stored_name']);
        if (is_file($path)) $zip->addFile($path, teacher_attachments_unique_export_name((string) $row['original_name'], $used));
    }
    $zip->close();
    if (!is_file($temporary) || filesize($temporary) < 1) { @unlink($temporary); Http::json(['error' => 'لا توجد ملفات متاحة داخل التصدير.'], 404); }
    Activity::log('teacher', $teacherId, 'تصدير مرفقات تحليل المهارات ZIP', count($rows) . ' مرفق');
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/zip');
    header('Content-Length: ' . filesize($temporary));
    header("Content-Disposition: attachment; filename=\"madar-attachments.zip\"; filename*=UTF-8''" . rawurlencode('مرفقات-مدار.zip'));
    header('Cache-Control: private, no-store');
    readfile($temporary);
    @unlink($temporary);
    exit;
}

function teacher_attachments_image_jpeg(string $path): ?array
{
    $dimensions = @getimagesize($path);
    $sourceWidth = (int) ($dimensions[0] ?? 0);
    $sourceHeight = (int) ($dimensions[1] ?? 0);
    if ($sourceWidth < 1 || $sourceHeight < 1 || $sourceWidth > 12000 || $sourceHeight > 12000 || $sourceWidth * $sourceHeight > 40000000) return null;
    $binary = @file_get_contents($path);
    if ($binary === false) return null;
    $source = @imagecreatefromstring($binary);
    if (!$source) return null;
    $width = imagesx($source); $height = imagesy($source);
    if ($width < 1 || $height < 1) { imagedestroy($source); return null; }
    $scale = min(1, 1800 / $width, 2400 / $height);
    $targetWidth = max(1, (int) round($width * $scale));
    $targetHeight = max(1, (int) round($height * $scale));
    $target = imagecreatetruecolor($targetWidth, $targetHeight);
    $white = imagecolorallocate($target, 255, 255, 255);
    imagefill($target, 0, 0, $white);
    imagealphablending($target, true);
    imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);
    ob_start();
    imagejpeg($target, null, 88);
    $jpeg = (string) ob_get_clean();
    imagedestroy($source); imagedestroy($target);
    return ['data' => $jpeg, 'width' => $targetWidth, 'height' => $targetHeight];
}

function teacher_attachments_build_pdf(array $images): string
{
    $pageWidth = 595.0; $pageHeight = 842.0; $margin = 28.0;
    $objects = [];
    $kids = [];
    foreach ($images as $index => $image) $kids[] = (3 + $index * 3) . ' 0 R';
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . '] /Count ' . count($images) . ' >>';
    foreach ($images as $index => $image) {
        $pageId = 3 + $index * 3; $contentId = $pageId + 1; $imageId = $pageId + 2;
        $scale = min(($pageWidth - 2 * $margin) / $image['width'], ($pageHeight - 2 * $margin) / $image['height']);
        $drawWidth = $image['width'] * $scale; $drawHeight = $image['height'] * $scale;
        $x = ($pageWidth - $drawWidth) / 2; $y = ($pageHeight - $drawHeight) / 2;
        $content = sprintf("q %.3F 0 0 %.3F %.3F %.3F cm /Im0 Do Q", $drawWidth, $drawHeight, $x, $y);
        $objects[$pageId] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {$pageWidth} {$pageHeight}] /Resources << /XObject << /Im0 {$imageId} 0 R >> >> /Contents {$contentId} 0 R >>";
        $objects[$contentId] = '<< /Length ' . strlen($content) . ">>\nstream\n" . $content . "\nendstream";
        $objects[$imageId] = '<< /Type /XObject /Subtype /Image /Width ' . $image['width'] . ' /Height ' . $image['height'] . ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' . strlen($image['data']) . ">>\nstream\n" . $image['data'] . "\nendstream";
    }
    ksort($objects);
    $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    $offsets = [0 => 0];
    foreach ($objects as $id => $object) {
        $offsets[$id] = strlen($pdf);
        $pdf .= $id . " 0 obj\n" . $object . "\nendobj\n";
    }
    $xref = strlen($pdf); $count = max(array_keys($objects)) + 1;
    $pdf .= "xref\n0 {$count}\n0000000000 65535 f \n";
    for ($id = 1; $id < $count; $id++) $pdf .= sprintf("%010d 00000 n \n", $offsets[$id] ?? 0);
    $pdf .= "trailer\n<< /Size {$count} /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    return $pdf;
}

function teacher_attachments_arabic_visual_text(string $text): string
{
    $forms = [
        'ء'=>['ﺀ',null,null,null], 'آ'=>['ﺁ','ﺂ',null,null], 'أ'=>['ﺃ','ﺄ',null,null],
        'ؤ'=>['ﺅ','ﺆ',null,null], 'إ'=>['ﺇ','ﺈ',null,null], 'ئ'=>['ﺉ','ﺊ','ﺋ','ﺌ'],
        'ا'=>['ﺍ','ﺎ',null,null], 'ب'=>['ﺏ','ﺐ','ﺑ','ﺒ'], 'ة'=>['ﺓ','ﺔ',null,null],
        'ت'=>['ﺕ','ﺖ','ﺗ','ﺘ'], 'ث'=>['ﺙ','ﺚ','ﺛ','ﺜ'], 'ج'=>['ﺝ','ﺞ','ﺟ','ﺠ'],
        'ح'=>['ﺡ','ﺢ','ﺣ','ﺤ'], 'خ'=>['ﺥ','ﺦ','ﺧ','ﺨ'], 'د'=>['ﺩ','ﺪ',null,null],
        'ذ'=>['ﺫ','ﺬ',null,null], 'ر'=>['ﺭ','ﺮ',null,null], 'ز'=>['ﺯ','ﺰ',null,null],
        'س'=>['ﺱ','ﺲ','ﺳ','ﺴ'], 'ش'=>['ﺵ','ﺶ','ﺷ','ﺸ'], 'ص'=>['ﺹ','ﺺ','ﺻ','ﺼ'],
        'ض'=>['ﺽ','ﺾ','ﺿ','ﻀ'], 'ط'=>['ﻁ','ﻂ','ﻃ','ﻄ'], 'ظ'=>['ﻅ','ﻆ','ﻇ','ﻈ'],
        'ع'=>['ﻉ','ﻊ','ﻋ','ﻌ'], 'غ'=>['ﻍ','ﻎ','ﻏ','ﻐ'], 'ف'=>['ﻑ','ﻒ','ﻓ','ﻔ'],
        'ق'=>['ﻕ','ﻖ','ﻗ','ﻘ'], 'ك'=>['ﻙ','ﻚ','ﻛ','ﻜ'], 'ل'=>['ﻝ','ﻞ','ﻟ','ﻠ'],
        'م'=>['ﻡ','ﻢ','ﻣ','ﻤ'], 'ن'=>['ﻥ','ﻦ','ﻧ','ﻨ'], 'ه'=>['ﻩ','ﻪ','ﻫ','ﻬ'],
        'و'=>['ﻭ','ﻮ',null,null], 'ى'=>['ﻯ','ﻰ',null,null], 'ي'=>['ﻱ','ﻲ','ﻳ','ﻴ'],
        'پ'=>['ﭖ','ﭗ','ﭘ','ﭙ'], 'چ'=>['ﭺ','ﭻ','ﭼ','ﭽ'], 'گ'=>['ﮒ','ﮓ','ﮔ','ﮕ'],
    ];
    $text = preg_replace('/[\x{064B}-\x{065F}\x{0670}]/u', '', $text) ?? $text;
    $characters = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $shaped = [];
    $count = count($characters);
    for ($index = 0; $index < $count; $index++) {
        $character = $characters[$index];
        if (!isset($forms[$character])) { $shaped[] = $character; continue; }
        $previous = $characters[$index - 1] ?? '';
        $next = $characters[$index + 1] ?? '';
        $joinsPrevious = isset($forms[$previous]) && $forms[$previous][2] !== null && $forms[$character][1] !== null;
        $joinsNext = isset($forms[$next]) && $forms[$character][2] !== null && $forms[$next][1] !== null;
        $formIndex = $joinsPrevious && $joinsNext ? 3 : ($joinsPrevious ? 1 : ($joinsNext ? 2 : 0));
        $shaped[] = $forms[$character][$formIndex] ?? $forms[$character][0];
    }
    $visual = implode('', array_reverse($shaped));
    $reverseRun = static function (array $match): string {
        return implode('', array_reverse(preg_split('//u', $match[0], -1, PREG_SPLIT_NO_EMPTY) ?: []));
    };
    $visual = preg_replace_callback('/[0-9٠-٩]+/u', $reverseRun, $visual) ?? $visual;
    $visual = preg_replace_callback('/[0-9٠-٩]+(?:[-\/][0-9٠-٩]+){2}/u', static function (array $match): string {
        return implode('-', array_reverse(preg_split('/[-\/]/u', $match[0]) ?: []));
    }, $visual) ?? $visual;
    return preg_replace_callback('/[A-Za-z]+/u', $reverseRun, $visual) ?? $visual;
}

function teacher_attachments_draw_rtl_text(GdImage $canvas, string $text, int $right, int $baseline, int $size, int $color, string $font): void
{
    $visual = teacher_attachments_arabic_visual_text(mb_substr($text, 0, 150));
    $box = imagettfbbox($size, 0, $font, $visual);
    if ($box === false) return;
    $width = abs((int) $box[2] - (int) $box[0]);
    imagettftext($canvas, $size, 0, max(24, $right - $width), $baseline, $color, $font, $visual);
}

function teacher_attachments_compose_pdf_page(array $image, array $meta, string $caption, string $font): ?array
{
    $source = @imagecreatefromstring((string) $image['data']);
    if (!$source) return null;
    $pageWidth = 1240;
    $pageHeight = 1754;
    $canvas = imagecreatetruecolor($pageWidth, $pageHeight);
    $white = imagecolorallocate($canvas, 255, 255, 255);
    $purple = imagecolorallocate($canvas, 74, 38, 140);
    $ink = imagecolorallocate($canvas, 48, 38, 62);
    $muted = imagecolorallocate($canvas, 101, 93, 114);
    imagefill($canvas, 0, 0, $white);
    imagefilledrectangle($canvas, 0, 0, $pageWidth, 12, $purple);
    teacher_attachments_draw_rtl_text($canvas, 'مرفقات تحليل المهارات', 1180, 70, 30, $purple, $font);
    $lines = [
        'المدرسة: ' . $meta['school'] . '   |   المعلمة: ' . $meta['teacher'],
        'العام الدراسي: ' . $meta['year'] . '   |   الفصل الدراسي: ' . $meta['semester'],
        'المرحلة: ' . $meta['stage'] . '   |   الصف: ' . $meta['grade'] . '   |   الفصل: ' . $meta['class'],
        'المادة: ' . $meta['subject'] . '   |   الاختبار: ' . $meta['test'] . '   |   الطالبة: ' . $meta['student'],
        'تاريخ التصدير: ' . $meta['date'],
    ];
    foreach ($lines as $index => $line) teacher_attachments_draw_rtl_text($canvas, $line, 1180, 112 + $index * 34, 17, $index === 4 ? $muted : $ink, $font);
    imageline($canvas, 60, 295, 1180, 295, $purple);
    $areaX = 60; $areaY = 330; $areaWidth = 1120; $areaHeight = 1300;
    $sourceWidth = imagesx($source); $sourceHeight = imagesy($source);
    $scale = min($areaWidth / $sourceWidth, $areaHeight / $sourceHeight);
    $targetWidth = max(1, (int) round($sourceWidth * $scale));
    $targetHeight = max(1, (int) round($sourceHeight * $scale));
    $targetX = $areaX + (int) (($areaWidth - $targetWidth) / 2);
    $targetY = $areaY + (int) (($areaHeight - $targetHeight) / 2);
    imagecopyresampled($canvas, $source, $targetX, $targetY, 0, 0, $targetWidth, $targetHeight, $sourceWidth, $sourceHeight);
    teacher_attachments_draw_rtl_text($canvas, $caption, 1180, 1705, 15, $muted, $font);
    ob_start();
    imagejpeg($canvas, null, 88);
    $jpeg = (string) ob_get_clean();
    imagedestroy($source);
    imagedestroy($canvas);
    return ['data' => $jpeg, 'width' => $pageWidth, 'height' => $pageHeight];
}

function teacher_attachments_export_pdf(int $teacherId): never
{
    if (!extension_loaded('gd')) Http::json(['error' => 'إضافة معالجة الصور GD غير متاحة على الخادم.'], 500);
    $rows = teacher_attachments_export_rows($teacherId);
    $directory = teacher_attachments_storage_directory();
    $font = MADAR_ROOT . '/assets/fonts/NotoNaskhArabic-Regular.ttf';
    if (!is_file($font) || !function_exists('imagettftext')) Http::json(['error' => 'خط العربية المطلوب لتقرير PDF غير متاح على الخادم.'], 500);
    $settings = fetch_one('SELECT school_name,teacher_name FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]) ?: [];
    $semester = teacher_attachments_export_label($rows, 'semester');
    $meta = [
        'school' => trim((string) ($settings['school_name'] ?? '')) ?: '—',
        'teacher' => trim((string) ($settings['teacher_name'] ?? '')) ?: '—',
        'year' => teacher_attachments_export_label($rows, 'academic_year'),
        'semester' => $semester === 'first' ? 'الفصل الدراسي الأول' : ($semester === 'second' ? 'الفصل الدراسي الثاني' : $semester),
        'stage' => teacher_attachments_export_label($rows, 'stage'),
        'grade' => teacher_attachments_export_label($rows, 'grade_label'),
        'class' => teacher_attachments_export_label($rows, 'class_name'),
        'subject' => teacher_attachments_export_label($rows, 'subject_name'),
        'test' => teacher_attachments_export_label($rows, 'test_title'),
        'student' => teacher_attachments_export_label($rows, 'student_name', 'مرفق عام للفصل'),
        'date' => date('Y-m-d'),
    ];
    $images = []; $skipped = 0;
    foreach ($rows as $row) {
        if (!str_starts_with((string) $row['mime_type'], 'image/')) { $skipped++; continue; }
        if (count($images) >= 30) { $skipped++; continue; }
        $image = teacher_attachments_image_jpeg($directory . '/' . basename((string) $row['stored_name']));
        $caption = (string) $row['original_name'] . ' · ' . (trim((string) ($row['student_name'] ?? '')) ?: 'مرفق عام للفصل') . ' · ' . substr((string) $row['created_at'], 0, 10);
        $page = $image ? teacher_attachments_compose_pdf_page($image, $meta, $caption, $font) : null;
        if ($page) $images[] = $page; else $skipped++;
    }
    if (!$images) Http::json(['error' => 'اختاري صورة واحدة على الأقل لإنشاء ملف PDF. ملفات PDF الأصلية لا تُدمج مع الصور في هذا الإجراء.'], 422);
    $pdf = teacher_attachments_build_pdf($images);
    Activity::log('teacher', $teacherId, 'تصدير صور مرفقات تحليل المهارات PDF', count($images) . ' صورة' . ($skipped > 0 ? ' · تم تجاهل ' . $skipped . ' ملف غير صوري أو زائد' : ''));
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: application/pdf');
    header('Content-Length: ' . strlen($pdf));
    header("Content-Disposition: attachment; filename=\"madar-images.pdf\"; filename*=UTF-8''" . rawurlencode('صور-مرفقات-مدار.pdf'));
    header('Cache-Control: private, no-store');
    if ($skipped > 0) header('X-Madar-Skipped-Files: ' . $skipped);
    echo $pdf;
    exit;
}

function teacher_attachments_export_label(array $rows, string $key, string $empty = '—'): string
{
    $values = [];
    foreach ($rows as $row) {
        $value = trim((string) ($row[$key] ?? ''));
        if ($value !== '') $values[$value] = true;
    }
    if (!$values) return $empty;
    if (count($values) > 1) return 'متعدد';
    return (string) array_key_first($values);
}

function teacher_attachments_export_print(int $teacherId): never
{
    $rows = teacher_attachments_export_rows($teacherId);
    $directory = teacher_attachments_storage_directory();
    $images = [];
    $totalBytes = 0;
    foreach ($rows as $row) {
        if (!str_starts_with((string) $row['mime_type'], 'image/')) continue;
        if (count($images) >= 30) Http::json(['error' => 'الحد الأقصى لتقرير الصور 30 صورة. قلّصي التحديد ثم حاولي مجددًا.'], 422);
        $path = $directory . '/' . basename((string) $row['stored_name']);
        if (!is_file($path)) continue;
        $bytes = (int) filesize($path);
        $totalBytes += $bytes;
        if ($totalBytes > 62914560) Http::json(['error' => 'إجمالي صور تقرير PDF يجب ألا يتجاوز 60 ميجابايت.'], 422);
        $binary = file_get_contents($path);
        if ($binary === false) continue;
        $images[] = [
            'source' => 'data:' . (string) $row['mime_type'] . ';base64,' . base64_encode($binary),
            'name' => (string) $row['original_name'],
            'student' => trim((string) ($row['student_name'] ?? '')) ?: 'مرفق عام للفصل',
            'date' => substr((string) $row['created_at'], 0, 10),
        ];
    }
    if (!$images) Http::json(['error' => 'لا توجد صور ضمن المرفقات المحددة أو الفلاتر الحالية.'], 422);
    $settings = fetch_one('SELECT school_name,teacher_name FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]) ?: [];
    $semester = teacher_attachments_export_label($rows, 'semester');
    $semesterLabel = $semester === 'first' ? 'الفصل الدراسي الأول' : ($semester === 'second' ? 'الفصل الدراسي الثاني' : $semester);
    $meta = [
        'المدرسة' => trim((string) ($settings['school_name'] ?? '')) ?: '—',
        'المعلمة' => trim((string) ($settings['teacher_name'] ?? '')) ?: '—',
        'العام الدراسي' => teacher_attachments_export_label($rows, 'academic_year'),
        'الفصل الدراسي' => $semesterLabel,
        'المرحلة' => teacher_attachments_export_label($rows, 'stage'),
        'الصف' => teacher_attachments_export_label($rows, 'grade_label'),
        'الفصل' => teacher_attachments_export_label($rows, 'class_name'),
        'المادة' => teacher_attachments_export_label($rows, 'subject_name'),
        'الاختبار' => teacher_attachments_export_label($rows, 'test_title'),
        'الطالبة' => teacher_attachments_export_label($rows, 'student_name', 'مرفق عام للفصل'),
        'تاريخ التصدير' => date('Y-m-d'),
    ];
    $escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $metaHtml = '';
    foreach ($meta as $label => $value) $metaHtml .= '<span><b>' . $escape($label) . ':</b> ' . $escape($value) . '</span>';
    $pages = '';
    foreach ($images as $image) {
        $pages .= '<figure class="page"><div class="report-head"><h1>مرفقات تحليل المهارات</h1><div class="meta">' . $metaHtml . '</div></div>'
            . '<div class="image-wrap"><img src="' . $image['source'] . '" alt="' . $escape($image['name']) . '"></div>'
            . '<figcaption>' . $escape($image['name']) . ' · ' . $escape($image['student']) . ' · ' . $escape($image['date']) . '</figcaption></figure>';
    }
    Activity::log('teacher', $teacherId, 'فتح تقرير صور مرفقات تحليل المهارات', count($images) . ' صورة');
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: text/html; charset=UTF-8');
    header('Cache-Control: private, no-store, max-age=0');
    header("Content-Security-Policy: default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
    header('X-Content-Type-Options: nosniff');
    echo '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مرفقات تحليل المهارات</title><style>
      *{box-sizing:border-box}body{margin:0;background:#eee9f7;color:#25183c;font-family:Tahoma,Arial,sans-serif}.actions{position:sticky;top:0;z-index:3;display:flex;gap:10px;justify-content:center;padding:12px;background:#fff;border-bottom:1px solid #ddd}.actions button{padding:10px 18px;border:0;border-radius:9px;background:#5d35a5;color:#fff;font:700 14px Tahoma;cursor:pointer}.actions button:last-child{background:#696170}.page{width:210mm;min-height:297mm;margin:14px auto;padding:14mm;background:#fff;display:flex;flex-direction:column;page-break-after:always}.report-head{padding-bottom:8mm;border-bottom:2px solid #5d35a5}.report-head h1{margin:0 0 5mm;color:#4a268c;font-size:22px}.meta{display:flex;flex-wrap:wrap;gap:3mm 7mm;font-size:11px;line-height:1.7}.image-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:8mm 0}.image-wrap img{display:block;max-width:100%;max-height:215mm;object-fit:contain}figcaption{padding-top:4mm;border-top:1px solid #ddd;color:#655d72;font-size:11px;text-align:center}@page{size:A4 portrait;margin:0}@media(max-width:800px){.page{width:100%;min-height:auto;margin:0;padding:18px}.image-wrap img{max-height:70vh}}@media print{body{background:#fff}.actions{display:none}.page{margin:0;box-shadow:none}.page:last-child{page-break-after:auto}}</style></head><body><div class="actions"><button type="button" onclick="window.print()">طباعة / حفظ PDF</button><button type="button" onclick="window.close()">إغلاق</button></div>' . $pages . '</body></html>';
    exit;
}

function teacher_skill_assessment_context_data(int $teacherId): array
{
    $scope = teacher_attachments_scope($teacherId);
    $settings = fetch_one('SELECT subject_name,academic_year,current_semester FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]);
    $defaultSubject = trim((string) ($settings['subject_name'] ?? ''));
    $classRows = fetch_all(
        "SELECT id,name,stage,grade_label,academic_year FROM classes WHERE teacher_id=? ORDER BY FIELD(stage,'ابتدائي','متوسط','ثانوي'),grade_label,name",
        [$teacherId]
    );
    $classes = [];
    foreach ($classRows as $class) {
        if ($scope['stage'] !== '' && (string) $class['stage'] !== $scope['stage']) continue;
        if (!teacher_attachments_grade_matches((string) $class['stage'], (string) $class['grade_label'], $scope['gradeLabel'])) continue;
        if ($scope['academicYear'] !== '' && (string) $class['academic_year'] !== $scope['academicYear'] && (string) ($settings['academic_year'] ?? '') !== $scope['academicYear']) continue;
        $classes[] = teacher_analysis_option($class['id'], (string) $class['name'], [
            'stage' => (string) $class['stage'],
            'gradeLabel' => (string) $class['grade_label'],
            'academicYear' => (string) $class['academic_year'],
        ]);
    }

    $class = null;
    if ($scope['classId'] > 0) {
        $class = fetch_one('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE id=? AND teacher_id=?', [$scope['classId'], $teacherId]);
    }
    $students = [];
    $skills = [];
    $subjects = [];
    $units = [];
    $lessons = [];
    if ($class) {
        foreach (fetch_all(
            "SELECT id,name FROM students WHERE class_id=? AND status='active' AND deleted_at IS NULL ORDER BY name,id",
            [(int) $class['id']]
        ) as $student) {
            $students[] = teacher_analysis_option($student['id'], (string) $student['name']);
        }
        foreach (fetch_all('SELECT id,name,stage,grade_label FROM skills WHERE stage=? ORDER BY name,id', [(string) $class['stage']]) as $skill) {
            if (!teacher_attachments_grade_matches((string) $skill['stage'], (string) $skill['grade_label'], (string) $class['grade_label'])) continue;
            $skills[] = teacher_analysis_option($skill['id'], (string) $skill['name']);
        }
        if ($defaultSubject !== '') $subjects[] = teacher_analysis_option($defaultSubject, $defaultSubject);
        $contentRows = fetch_all(
            "SELECT subject_name,unit_name,chapter_name,lesson_name,topic,stage,grade_label
             FROM question_bank WHERE teacher_id=? AND stage=? AND is_active=1",
            [$teacherId, (string) $class['stage']]
        );
        foreach ($contentRows as $row) {
            if (!teacher_attachments_grade_matches((string) $row['stage'], (string) $row['grade_label'], (string) $class['grade_label'])) continue;
            $subject = trim((string) ($row['subject_name'] ?? '')) ?: $defaultSubject;
            $unit = trim((string) ($row['unit_name'] ?? '')) ?: trim((string) ($row['chapter_name'] ?? ''));
            $lesson = trim((string) ($row['lesson_name'] ?? '')) ?: trim((string) ($row['topic'] ?? ''));
            if ($subject !== '') $subjects[] = teacher_analysis_option($subject, $subject);
            if ($scope['subject'] !== '' && $subject !== $scope['subject']) continue;
            if ($unit !== '') $units[] = teacher_analysis_option($unit, $unit);
            if ($scope['unit'] !== '' && $unit !== $scope['unit']) continue;
            if ($lesson !== '') $lessons[] = teacher_analysis_option($lesson, $lesson);
        }
    }
    return [
        'manualReady' => teacher_skill_assessments_schema_ready(),
        'migrationFile' => TEACHER_ATTACHMENTS_MIGRATION,
        'classes' => teacher_analysis_unique_options($classes),
        'students' => teacher_analysis_unique_options($students),
        'skills' => teacher_analysis_unique_options($skills),
        'subjects' => teacher_analysis_unique_options($subjects),
        'units' => teacher_analysis_unique_options($units),
        'lessons' => teacher_analysis_unique_options($lessons),
        'selectedClass' => $class ? [
            'id' => (int) $class['id'], 'name' => (string) $class['name'], 'stage' => (string) $class['stage'],
            'gradeLabel' => (string) $class['grade_label'], 'academicYear' => (string) $class['academic_year'],
        ] : null,
        'defaults' => [
            'academicYear' => $scope['academicYear'] ?: (string) ($settings['academic_year'] ?? ($class['academic_year'] ?? '')),
            'semester' => $scope['semester'] ?: (string) ($settings['current_semester'] ?? 'first'),
            'subject' => $scope['subject'] ?: $defaultSubject,
        ],
    ];
}

function teacher_skill_assessment_context(int $teacherId): never
{
    Http::json(teacher_skill_assessment_context_data($teacherId));
}

function teacher_skill_assessment_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'classId' => (int) $row['class_id'],
        'className' => (string) ($row['class_name'] ?? '—'),
        'academicYear' => (string) $row['academic_year'],
        'semester' => (string) $row['semester'],
        'title' => (string) $row['title'],
        'assessmentDate' => (string) $row['assessment_date'],
        'mode' => (string) $row['input_mode'],
        'threshold' => (int) $row['mastery_threshold'],
        'rosterCount' => (int) $row['roster_count'],
        'subject' => $row['subject_name'] ?? null,
        'unit' => $row['unit_name'] ?? null,
        'lesson' => $row['lesson_name'] ?? null,
        'skillCount' => (int) ($row['skill_count'] ?? 0),
        'scoreCount' => (int) ($row['score_count'] ?? 0),
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}

function teacher_skill_assessment_list(int $teacherId): never
{
    if (!teacher_skill_assessments_schema_ready()) Http::json(array_merge(teacher_attachments_migration_payload(), ['manualReady' => false, 'assessments' => []]), 409);
    $scope = teacher_attachments_scope($teacherId);
    $where = ['a.teacher_id=?', 'a.deleted_at IS NULL'];
    $params = [$teacherId];
    if ($scope['classId'] > 0) { $where[] = 'a.class_id=?'; $params[] = $scope['classId']; }
    if ($scope['academicYear'] !== '') { $where[] = 'a.academic_year=?'; $params[] = $scope['academicYear']; }
    if ($scope['semester'] !== '') { $where[] = 'a.semester=?'; $params[] = $scope['semester']; }
    if ($scope['subject'] !== '') { $where[] = 'a.subject_name=?'; $params[] = $scope['subject']; }
    if ($scope['unit'] !== '') { $where[] = 'a.unit_name=?'; $params[] = $scope['unit']; }
    if ($scope['lesson'] !== '') { $where[] = 'a.lesson_name=?'; $params[] = $scope['lesson']; }
    if ($scope['dateFrom'] !== '') { $where[] = 'a.assessment_date>=?'; $params[] = $scope['dateFrom']; }
    if ($scope['dateTo'] !== '') { $where[] = 'a.assessment_date<=?'; $params[] = $scope['dateTo']; }
    $rows = fetch_all(
        'SELECT a.*,c.name AS class_name,COUNT(DISTINCT i.id) AS skill_count,COUNT(DISTINCT sc.id) AS score_count
         FROM teacher_skill_assessments a
         JOIN classes c ON c.id=a.class_id AND c.teacher_id=a.teacher_id
         LEFT JOIN teacher_skill_assessment_items i ON i.assessment_id=a.id
         LEFT JOIN teacher_skill_assessment_scores sc ON sc.item_id=i.id
         WHERE ' . implode(' AND ', $where) . '
         GROUP BY a.id,c.name ORDER BY a.assessment_date DESC,a.id DESC LIMIT 100',
        $params
    );
    Http::json(['manualReady' => true, 'assessments' => array_map('teacher_skill_assessment_row', $rows)]);
}

function teacher_skill_assessment_owned(int $teacherId, int $assessmentId): array
{
    $row = fetch_one(
        'SELECT a.*,c.name AS class_name FROM teacher_skill_assessments a JOIN classes c ON c.id=a.class_id AND c.teacher_id=a.teacher_id WHERE a.id=? AND a.teacher_id=? AND a.deleted_at IS NULL',
        [$assessmentId, $teacherId]
    );
    if (!$row) Http::json(['error' => 'التقويم اليدوي غير موجود.'], 404);
    return $row;
}

function teacher_skill_assessment_show(int $teacherId, int $assessmentId): never
{
    if (!teacher_skill_assessments_schema_ready()) Http::json(teacher_attachments_migration_payload(), 409);
    $assessment = teacher_skill_assessment_owned($teacherId, $assessmentId);
    $items = fetch_all(
        'SELECT i.id,i.skill_id,i.skill_name_snapshot,i.question_count,i.mastered_count,i.sort_order,COALESCE(sk.name,i.skill_name_snapshot) AS skill_name
         FROM teacher_skill_assessment_items i LEFT JOIN skills sk ON sk.id=i.skill_id WHERE i.assessment_id=? ORDER BY i.sort_order,i.id',
        [$assessmentId]
    );
    $scores = fetch_all(
        'SELECT sc.item_id,sc.student_id,sc.student_name_snapshot,sc.correct_count
         FROM teacher_skill_assessment_scores sc JOIN teacher_skill_assessment_items i ON i.id=sc.item_id WHERE i.assessment_id=? ORDER BY sc.id',
        [$assessmentId]
    );
    $scoresByItem = [];
    foreach ($scores as $score) {
        $scoresByItem[(int) $score['item_id']][] = [
            'studentId' => $score['student_id'] === null ? null : (int) $score['student_id'],
            'studentName' => (string) $score['student_name_snapshot'],
            'correctCount' => (int) $score['correct_count'],
        ];
    }
    $payloadItems = [];
    foreach ($items as $item) {
        $payloadItems[] = [
            'skillId' => $item['skill_id'] === null ? null : (int) $item['skill_id'],
            'skillName' => (string) $item['skill_name'],
            'questionCount' => (int) $item['question_count'],
            'masteredCount' => $item['mastered_count'] === null ? null : (int) $item['mastered_count'],
            'scores' => $scoresByItem[(int) $item['id']] ?? [],
        ];
    }
    $assessment['skill_count'] = count($payloadItems);
    $assessment['score_count'] = count($scores);
    Http::json(['manualReady' => true, 'assessment' => teacher_skill_assessment_row($assessment), 'items' => $payloadItems]);
}

function teacher_skill_assessment_date(string $value): string
{
    $value = trim($value);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) Http::json(['error' => 'تاريخ التقويم غير صالح.'], 422);
    return $value;
}

function teacher_skill_assessment_save(int $teacherId): never
{
    if (!teacher_skill_assessments_schema_ready()) Http::json(teacher_attachments_migration_payload(), 409);
    $data = Http::input();
    $assessmentId = max(0, (int) ($data['id'] ?? 0));
    if ($assessmentId > 0) teacher_skill_assessment_owned($teacherId, $assessmentId);
    $classId = max(0, (int) ($data['classId'] ?? 0));
    $class = fetch_one('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE id=? AND teacher_id=?', [$classId, $teacherId]);
    if (!$class) Http::json(['error' => 'اختاري فصلًا صحيحًا للتقويم.'], 422);
    $settings = fetch_one('SELECT academic_year,current_semester,subject_name FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]);
    $academicYear = mb_substr(trim((string) ($data['academicYear'] ?? '')), 0, 30);
    $allowedYears = array_values(array_unique(array_filter([(string) $class['academic_year'], (string) ($settings['academic_year'] ?? '')])));
    if ($academicYear === '' || !in_array($academicYear, $allowedYears, true)) Http::json(['error' => 'العام الدراسي لا يطابق الفصل أو إعدادات المعلمة.'], 422);
    $semester = trim((string) ($data['semester'] ?? ''));
    if (!in_array($semester, ['first','second'], true)) Http::json(['error' => 'الفصل الدراسي غير صالح.'], 422);
    $mode = trim((string) ($data['mode'] ?? 'quick'));
    if (!in_array($mode, ['quick','detailed'], true)) Http::json(['error' => 'طريقة إدخال التقويم غير صالحة.'], 422);
    $threshold = (int) ($data['threshold'] ?? 80);
    if ($threshold < 0 || $threshold > 100) Http::json(['error' => 'عتبة الإتقان يجب أن تكون بين 0 و100.'], 422);
    $assessmentDate = teacher_skill_assessment_date((string) ($data['assessmentDate'] ?? ''));
    $title = mb_substr(trim((string) ($data['title'] ?? '')), 0, 190);
    if ($title === '') $title = 'تقويم مهارات - ' . $assessmentDate;
    $textValues = [];
    foreach (['subject' => 190, 'unit' => 190, 'lesson' => 190] as $key => $limit) {
        $value = trim((string) ($data[$key] ?? ''));
        if (mb_strlen($value) > $limit) Http::json(['error' => 'أحد حقول سياق التقويم أطول من الحد المسموح.'], 422);
        $textValues[$key] = $value === '' ? null : $value;
    }
    $studentRows = fetch_all("SELECT id,name FROM students WHERE class_id=? AND status='active' AND deleted_at IS NULL ORDER BY name,id", [$classId]);
    if (!$studentRows) Http::json(['error' => 'لا توجد طالبات نشطات في الفصل المحدد.'], 422);
    $studentMap = [];
    foreach ($studentRows as $student) $studentMap[(int) $student['id']] = (string) $student['name'];
    $skillMap = [];
    foreach (fetch_all('SELECT id,name,stage,grade_label FROM skills WHERE stage=?', [(string) $class['stage']]) as $skill) {
        if (!teacher_attachments_grade_matches((string) $skill['stage'], (string) $skill['grade_label'], (string) $class['grade_label'])) continue;
        $skillMap[(int) $skill['id']] = (string) $skill['name'];
    }
    $rawItems = is_array($data['items'] ?? null) ? array_values($data['items']) : [];
    if (!$rawItems || count($rawItems) > 50) Http::json(['error' => 'أضيفي من مهارة واحدة إلى 50 مهارة في التقويم.'], 422);
    $seenSkills = [];
    $items = [];
    foreach ($rawItems as $index => $rawItem) {
        if (!is_array($rawItem)) Http::json(['error' => 'بيانات إحدى المهارات غير صالحة.'], 422);
        $skillId = max(0, (int) ($rawItem['skillId'] ?? 0));
        if ($skillId < 1 || !isset($skillMap[$skillId])) Http::json(['error' => 'إحدى المهارات لا تطابق صف الفصل المحدد.'], 422);
        if (isset($seenSkills[$skillId])) Http::json(['error' => 'لا يمكن تكرار المهارة داخل التقويم نفسه.'], 422);
        $seenSkills[$skillId] = true;
        $questionCount = (int) ($rawItem['questionCount'] ?? 0);
        if ($questionCount < 1 || $questionCount > 1000) Http::json(['error' => 'عدد أسئلة المهارة يجب أن يكون بين 1 و1000.'], 422);
        $item = [
            'skillId' => $skillId, 'skillName' => $skillMap[$skillId], 'questionCount' => $questionCount,
            'masteredCount' => null, 'scores' => [], 'sortOrder' => $index + 1,
        ];
        if ($mode === 'quick') {
            $masteredCount = (int) ($rawItem['masteredCount'] ?? 0);
            if ($masteredCount < 0 || $masteredCount > count($studentMap)) Http::json(['error' => 'عدد المتقنات لا يمكن أن يتجاوز عدد طالبات الفصل.'], 422);
            $item['masteredCount'] = $masteredCount;
        } else {
            $provided = [];
            foreach ((is_array($rawItem['scores'] ?? null) ? $rawItem['scores'] : []) as $score) {
                if (!is_array($score)) continue;
                $studentId = max(0, (int) ($score['studentId'] ?? 0));
                if ($studentId < 1 || !isset($studentMap[$studentId])) Http::json(['error' => 'إحدى الطالبات لا تنتمي إلى الفصل المحدد.'], 422);
                $correctCount = (int) ($score['correctCount'] ?? 0);
                if ($correctCount < 0 || $correctCount > $questionCount) Http::json(['error' => 'إحدى الدرجات خارج عدد أسئلة المهارة.'], 422);
                $provided[$studentId] = $correctCount;
            }
            foreach ($studentMap as $studentId => $studentName) {
                $item['scores'][] = ['studentId' => $studentId, 'studentName' => $studentName, 'correctCount' => (int) ($provided[$studentId] ?? 0)];
            }
        }
        $items[] = $item;
    }

    $savedId = Database::transaction(function (PDO $pdo) use ($assessmentId, $teacherId, $classId, $academicYear, $semester, $title, $assessmentDate, $mode, $threshold, $studentMap, $textValues, $items): int {
        if ($assessmentId > 0) {
            $owned = $pdo->prepare('SELECT id FROM teacher_skill_assessments WHERE id=? AND teacher_id=? AND deleted_at IS NULL FOR UPDATE');
            $owned->execute([$assessmentId, $teacherId]);
            if (!$owned->fetch()) throw new RuntimeException('assessment_not_found');
            $update = $pdo->prepare('UPDATE teacher_skill_assessments SET class_id=?,academic_year=?,semester=?,title=?,assessment_date=?,input_mode=?,mastery_threshold=?,roster_count=?,subject_name=?,unit_name=?,lesson_name=? WHERE id=? AND teacher_id=?');
            $update->execute([$classId,$academicYear,$semester,$title,$assessmentDate,$mode,$threshold,count($studentMap),$textValues['subject'],$textValues['unit'],$textValues['lesson'],$assessmentId,$teacherId]);
            $pdo->prepare('DELETE FROM teacher_skill_assessment_items WHERE assessment_id=?')->execute([$assessmentId]);
            $id = $assessmentId;
        } else {
            $insert = $pdo->prepare('INSERT INTO teacher_skill_assessments (teacher_id,class_id,academic_year,semester,title,assessment_date,input_mode,mastery_threshold,roster_count,subject_name,unit_name,lesson_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
            $insert->execute([$teacherId,$classId,$academicYear,$semester,$title,$assessmentDate,$mode,$threshold,count($studentMap),$textValues['subject'],$textValues['unit'],$textValues['lesson']]);
            $id = (int) $pdo->lastInsertId();
        }
        $insertItem = $pdo->prepare('INSERT INTO teacher_skill_assessment_items (assessment_id,skill_id,skill_name_snapshot,question_count,mastered_count,sort_order) VALUES (?,?,?,?,?,?)');
        $insertScore = $pdo->prepare('INSERT INTO teacher_skill_assessment_scores (item_id,student_id,student_name_snapshot,correct_count) VALUES (?,?,?,?)');
        foreach ($items as $item) {
            $insertItem->execute([$id,$item['skillId'],$item['skillName'],$item['questionCount'],$item['masteredCount'],$item['sortOrder']]);
            $itemId = (int) $pdo->lastInsertId();
            foreach ($item['scores'] as $score) $insertScore->execute([$itemId,$score['studentId'],$score['studentName'],$score['correctCount']]);
        }
        return $id;
    });
    Activity::log('teacher', $teacherId, $assessmentId > 0 ? 'تعديل تقويم مهارات يدوي' : 'إنشاء تقويم مهارات يدوي', "التقويم {$savedId} · الفصل {$classId} · {$mode}");
    Http::json(['ok' => true, 'id' => $savedId], $assessmentId > 0 ? 200 : 201);
}

function teacher_skill_assessment_delete(int $teacherId): never
{
    if (!teacher_skill_assessments_schema_ready()) Http::json(teacher_attachments_migration_payload(), 409);
    $data = Http::input();
    $assessmentId = max(0, (int) ($data['id'] ?? 0));
    teacher_skill_assessment_owned($teacherId, $assessmentId);
    execute_sql('UPDATE teacher_skill_assessments SET deleted_at=NOW(),updated_at=NOW() WHERE id=? AND teacher_id=? AND deleted_at IS NULL', [$assessmentId, $teacherId]);
    Activity::log('teacher', $teacherId, 'حذف تقويم مهارات يدوي', "التقويم {$assessmentId}");
    Http::json(['ok' => true]);
}

function teacher_attachments_routes(string $method, array $segments, int $teacherId): never
{
    $resource = $segments[0] ?? '';
    if ($resource === 'analysis' && $method === 'GET') teacher_attachments_analysis($teacherId);
    if ($resource === 'context' && $method === 'GET') teacher_attachments_context($teacherId);
    if ($resource === 'manual') {
        $action = $segments[1] ?? '';
        if ($action === 'context' && $method === 'GET') teacher_skill_assessment_context($teacherId);
        if ($action === 'delete' && $method === 'POST') teacher_skill_assessment_delete($teacherId);
        if ($action !== '' && ctype_digit((string) $action) && $method === 'GET') teacher_skill_assessment_show($teacherId, (int) $action);
        if ($action === '' && $method === 'GET') teacher_skill_assessment_list($teacherId);
        if ($action === '' && $method === 'POST') teacher_skill_assessment_save($teacherId);
    }
    if ($resource === 'delete' && $method === 'POST') teacher_attachments_delete($teacherId);
    if ($resource === 'export.zip' && $method === 'GET') teacher_attachments_export_zip($teacherId);
    if ($resource === 'export.pdf' && $method === 'GET') teacher_attachments_export_pdf($teacherId);
    if ($resource === 'export.print' && $method === 'GET') teacher_attachments_export_print($teacherId);
    if (isset($segments[0]) && ($segments[1] ?? '') === 'file' && $method === 'GET') {
        teacher_attachments_send_file($teacherId, route_id($segments, 0), isset($_GET['download']));
    }
    if (!$segments && $method === 'GET') teacher_attachments_list($teacherId);
    if (!$segments && $method === 'POST') teacher_attachments_upload($teacherId);
    Http::json(['error' => 'المسار المطلوب غير موجود.'], 404);
}
