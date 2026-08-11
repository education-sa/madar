<?php
declare(strict_types=1);

const PAPER_ASSESSMENTS_MIGRATION = 'migration_20260810_paper_assessments.sql';
const PAPER_ASSESSMENT_MAX_FILES = 5;
const PAPER_ASSESSMENT_MAX_FILE_BYTES = 10485760;
const PAPER_ASSESSMENT_MAX_TOTAL_BYTES = 20971520;

function paper_assessments_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    $required = [
        'teacher_paper_assessments' => ['id','teacher_id','class_id','academic_year','semester','title','test_type','assessment_date','collection_mode','workflow_status','mastery_threshold','subject_name','unit_name','lesson_name','instructions','opens_at','closes_at','require_approval','created_at','updated_at','deleted_at'],
        'teacher_paper_assessment_skill_summaries' => ['id','assessment_id','skill_id','skill_name_snapshot','participant_count','mastered_count','sort_order'],
        'teacher_paper_assessment_questions' => ['id','assessment_id','skill_id','skill_name_snapshot','question_number','question_text','max_points','sort_order'],
        'teacher_paper_assessment_submissions' => ['id','assessment_id','student_id','student_name_snapshot','status','submitted_at','reviewed_at','return_note','created_at','updated_at'],
        'teacher_paper_assessment_answers' => ['id','submission_id','question_id','earned_points'],
        'teacher_paper_assessment_files' => ['id','submission_id','student_id','original_name','stored_name','mime_type','size_bytes','sha256','created_at','deleted_at'],
    ];
    try {
        foreach ($required as $table => $columns) {
            $rows = fetch_all('SELECT COLUMN_NAME AS schema_column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?', [$table]);
            $found = array_fill_keys(array_map(static fn(array $row): string => (string) $row['schema_column_name'], $rows), true);
            foreach ($columns as $column) if (!isset($found[$column])) return $ready = false;
        }
        return $ready = true;
    } catch (PDOException) {
        return $ready = false;
    }
}

function paper_migration_payload(): array
{
    return [
        'migrationReady' => false,
        'migrationFile' => PAPER_ASSESSMENTS_MIGRATION,
        'message' => 'يلزم تشغيل ملف ' . PAPER_ASSESSMENTS_MIGRATION . ' مرة واحدة لتفعيل الاختبارات الورقية.',
    ];
}

function paper_test_type_label(string $type): string
{
    return match ($type) {
        'periodic_1' => 'الاختبار الفتري الأول',
        'periodic_2' => 'الاختبار الفتري الثاني',
        'final' => 'الاختبار النهائي',
        'worksheet' => 'ورقة عمل',
        'other' => 'تقويم آخر',
        default => $type,
    };
}

function paper_mode_label(string $mode): string
{
    return $mode === 'student_entry' ? 'تسجيل فردي بواسطة الطالبات' : 'تسجيل مجمع بواسطة المعلمة';
}

function paper_workflow_label(string $status): string
{
    return match ($status) {
        'draft' => 'مسودة',
        'open' => 'مفتوح للطالبات',
        'closed' => 'مغلق',
        default => $status,
    };
}

function paper_submission_label(string $status): string
{
    return match ($status) {
        'draft' => 'مسودة',
        'submitted' => 'بانتظار الاعتماد',
        'approved' => 'معتمدة',
        'returned' => 'معادة للتعديل',
        'not_registered' => 'لم تسجل',
        default => $status,
    };
}

function paper_number(float|int|string|null $value): int|float|null
{
    if ($value === null || !is_numeric($value)) return null;
    $number = round((float) $value, 2);
    return abs($number - round($number)) < 0.00001 ? (int) round($number) : $number;
}

function paper_percent(float $earned, float $possible): float
{
    return $possible > 0 ? round(max(0, min(100, ($earned / $possible) * 100)), 1) : 0.0;
}

function paper_datetime(?string $value, string $field): ?string
{
    $value = trim((string) $value);
    if ($value === '') return null;
    $normalized = str_replace('T', ' ', $value);
    if (strlen($normalized) === 16) $normalized .= ':00';
    $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $normalized);
    if (!$date || $date->format('Y-m-d H:i:s') !== $normalized) Http::json(['error' => "قيمة {$field} غير صالحة."], 422);
    return $normalized;
}

function paper_date(string $value): string
{
    $value = trim($value);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) Http::json(['error' => 'تاريخ الاختبار غير صالح.'], 422);
    return $value;
}

function paper_storage_directory(): string
{
    $directory = MADAR_ROOT . '/storage/private/paper-assessment-submissions';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        Http::json(['error' => 'تعذّر تجهيز مجلد أوراق الاختبارات الخاصة.'], 500);
    }
    if (!is_writable($directory)) Http::json(['error' => 'مجلد أوراق الاختبارات غير قابل للكتابة.'], 500);
    return $directory;
}

function paper_allowed_mimes(): array
{
    return ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
}

function paper_assessment_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'teacherId' => (int) $row['teacher_id'],
        'classId' => (int) $row['class_id'],
        'className' => (string) ($row['class_name'] ?? '—'),
        'academicYear' => (string) $row['academic_year'],
        'semester' => (string) $row['semester'],
        'title' => (string) $row['title'],
        'testType' => (string) $row['test_type'],
        'testTypeLabel' => paper_test_type_label((string) $row['test_type']),
        'assessmentDate' => (string) $row['assessment_date'],
        'mode' => (string) $row['collection_mode'],
        'modeLabel' => paper_mode_label((string) $row['collection_mode']),
        'status' => (string) $row['workflow_status'],
        'statusLabel' => paper_workflow_label((string) $row['workflow_status']),
        'threshold' => (int) $row['mastery_threshold'],
        'subject' => $row['subject_name'] ?? null,
        'unit' => $row['unit_name'] ?? null,
        'lesson' => $row['lesson_name'] ?? null,
        'instructions' => $row['instructions'] ?? null,
        'opensAt' => $row['opens_at'] ?? null,
        'closesAt' => $row['closes_at'] ?? null,
        'requireApproval' => (bool) ($row['require_approval'] ?? true),
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
        'questionCount' => (int) ($row['question_count'] ?? 0),
        'skillCount' => (int) ($row['skill_count'] ?? 0),
        'submissionCount' => (int) ($row['submission_count'] ?? 0),
        'approvedCount' => (int) ($row['approved_count'] ?? 0),
        'pendingCount' => (int) ($row['pending_count'] ?? 0),
    ];
}

function paper_teacher_owned_assessment(int $teacherId, int $assessmentId, bool $lock = false): array
{
    $suffix = $lock ? ' FOR UPDATE' : '';
    $row = fetch_one(
        'SELECT p.*,c.name AS class_name,c.stage,c.grade_label FROM teacher_paper_assessments p JOIN classes c ON c.id=p.class_id AND c.teacher_id=p.teacher_id WHERE p.id=? AND p.teacher_id=? AND p.deleted_at IS NULL' . $suffix,
        [$assessmentId, $teacherId]
    );
    if (!$row) Http::json(['error' => 'الاختبار الورقي غير موجود.'], 404);
    return $row;
}

function paper_skill_map_for_class(array $class): array
{
    $map = [];
    foreach (fetch_all('SELECT id,name,stage,grade_label FROM skills WHERE stage=? ORDER BY name,id', [(string) $class['stage']]) as $skill) {
        $matches = function_exists('teacher_attachments_grade_matches')
            ? teacher_attachments_grade_matches((string) $skill['stage'], (string) $skill['grade_label'], (string) $class['grade_label'])
            : ((string) $skill['grade_label'] === (string) $class['grade_label']);
        if ($matches) $map[(int) $skill['id']] = (string) $skill['name'];
    }
    return $map;
}

function paper_teacher_context(int $teacherId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload());
    $classId = max(0, (int) ($_GET['classId'] ?? 0));
    $context = teacher_skill_assessment_context_data($teacherId);
    if ($classId > 0 && !teacher_owns_class($teacherId, $classId)) Http::json(['error' => 'الفصل المحدد غير موجود.'], 404);
    $context['migrationReady'] = true;
    $context['migrationFile'] = PAPER_ASSESSMENTS_MIGRATION;
    $context['testTypes'] = [
        ['value' => 'periodic_1', 'label' => 'الاختبار الفتري الأول'],
        ['value' => 'periodic_2', 'label' => 'الاختبار الفتري الثاني'],
        ['value' => 'final', 'label' => 'الاختبار النهائي'],
        ['value' => 'worksheet', 'label' => 'ورقة عمل'],
        ['value' => 'other', 'label' => 'تقويم آخر'],
    ];
    $context['limits'] = ['maxFiles' => PAPER_ASSESSMENT_MAX_FILES, 'maxFileBytes' => PAPER_ASSESSMENT_MAX_FILE_BYTES];
    Http::json($context);
}

function paper_teacher_list(int $teacherId): never
{
    if (!paper_assessments_schema_ready()) Http::json(array_merge(paper_migration_payload(), ['assessments' => []]));
    $classId = max(0, (int) ($_GET['classId'] ?? 0));
    if ($classId > 0 && !teacher_owns_class($teacherId, $classId)) Http::json(['error' => 'الفصل المحدد غير موجود.'], 404);
    $where = ['p.teacher_id=?', 'p.deleted_at IS NULL'];
    $params = [$teacherId];
    if ($classId > 0) { $where[] = 'p.class_id=?'; $params[] = $classId; }
    $rows = fetch_all(
        "SELECT p.*,c.name AS class_name,
                (SELECT COUNT(*) FROM teacher_paper_assessment_questions q WHERE q.assessment_id=p.id) AS question_count,
                (SELECT COUNT(*) FROM teacher_paper_assessment_skill_summaries ss WHERE ss.assessment_id=p.id) AS skill_count,
                (SELECT COUNT(*) FROM teacher_paper_assessment_submissions su WHERE su.assessment_id=p.id AND su.status IN ('submitted','approved')) AS submission_count,
                (SELECT COUNT(*) FROM teacher_paper_assessment_submissions su WHERE su.assessment_id=p.id AND su.status='approved') AS approved_count,
                (SELECT COUNT(*) FROM teacher_paper_assessment_submissions su WHERE su.assessment_id=p.id AND su.status='submitted') AS pending_count
         FROM teacher_paper_assessments p JOIN classes c ON c.id=p.class_id AND c.teacher_id=p.teacher_id
         WHERE " . implode(' AND ', $where) . ' ORDER BY p.assessment_date DESC,p.id DESC LIMIT 200',
        $params
    );
    Http::json(['migrationReady' => true, 'assessments' => array_map('paper_assessment_row', $rows)]);
}

function paper_teacher_save(int $teacherId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(), 409);
    $data = Http::input();
    $assessmentId = max(0, (int) ($data['id'] ?? 0));
    $existing = $assessmentId > 0 ? paper_teacher_owned_assessment($teacherId, $assessmentId) : null;
    if ($existing && (string) $existing['workflow_status'] !== 'draft') {
        Http::json(['error' => 'لا يمكن تعديل إعدادات الاختبار بعد نشره. أغلقيه أو أنشئي نسخة جديدة.'], 409);
    }
    $classId = max(0, (int) ($data['classId'] ?? 0));
    $class = fetch_one('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE id=? AND teacher_id=?', [$classId, $teacherId]);
    if (!$class) Http::json(['error' => 'اختاري فصلًا صحيحًا.'], 422);
    $settings = fetch_one('SELECT academic_year,current_semester,subject_name FROM teacher_school_settings WHERE teacher_id=?', [$teacherId]) ?: [];
    $academicYear = mb_substr(trim((string) ($data['academicYear'] ?? '')), 0, 30);
    $allowedYears = array_values(array_unique(array_filter([(string) $class['academic_year'], (string) ($settings['academic_year'] ?? '')])));
    if ($academicYear === '' || !in_array($academicYear, $allowedYears, true)) Http::json(['error' => 'العام الدراسي لا يطابق الفصل أو إعدادات المعلمة.'], 422);
    $semester = trim((string) ($data['semester'] ?? ''));
    if (!in_array($semester, ['first','second'], true)) Http::json(['error' => 'الفصل الدراسي غير صالح.'], 422);
    $title = mb_substr(trim((string) ($data['title'] ?? '')), 0, 190);
    if ($title === '') Http::json(['error' => 'اكتبي اسم الاختبار الورقي.'], 422);
    $testType = trim((string) ($data['testType'] ?? 'periodic_1'));
    if (!in_array($testType, ['periodic_1','periodic_2','final','worksheet','other'], true)) Http::json(['error' => 'نوع الاختبار غير صالح.'], 422);
    $mode = trim((string) ($data['mode'] ?? 'teacher_aggregate'));
    if (!in_array($mode, ['teacher_aggregate','student_entry'], true)) Http::json(['error' => 'طريقة جمع النتائج غير صالحة.'], 422);
    $assessmentDate = paper_date((string) ($data['assessmentDate'] ?? ''));
    $threshold = (int) ($data['threshold'] ?? 80);
    if ($threshold < 0 || $threshold > 100) Http::json(['error' => 'عتبة الإتقان يجب أن تكون بين 0 و100.'], 422);
    $opensAt = paper_datetime(isset($data['opensAt']) ? (string) $data['opensAt'] : null, 'وقت فتح التسجيل');
    $closesAt = paper_datetime(isset($data['closesAt']) ? (string) $data['closesAt'] : null, 'وقت إغلاق التسجيل');
    if ($opensAt && $closesAt && $opensAt >= $closesAt) Http::json(['error' => 'وقت الإغلاق يجب أن يكون بعد وقت الفتح.'], 422);
    $texts = [];
    foreach (['subject' => 190, 'unit' => 190, 'lesson' => 190, 'instructions' => 2000] as $key => $limit) {
        $value = trim((string) ($data[$key] ?? ''));
        if (mb_strlen($value) > $limit) Http::json(['error' => 'أحد الحقول النصية أطول من الحد المسموح.'], 422);
        $texts[$key] = $value === '' ? null : $value;
    }
    $studentCount = (int) (fetch_one("SELECT COUNT(*) AS n FROM students WHERE class_id=? AND status='active' AND deleted_at IS NULL", [$classId])['n'] ?? 0);
    if ($studentCount < 1) Http::json(['error' => 'لا توجد طالبات نشطات في الفصل المحدد.'], 422);
    $skillMap = paper_skill_map_for_class($class);
    $summaries = [];
    $questions = [];
    if ($mode === 'teacher_aggregate') {
        $raw = is_array($data['skills'] ?? null) ? array_values($data['skills']) : [];
        if (!$raw || count($raw) > 50) Http::json(['error' => 'أضيفي من مهارة واحدة إلى 50 مهارة.'], 422);
        $seen = [];
        foreach ($raw as $index => $item) {
            $skillId = max(0, (int) ($item['skillId'] ?? 0));
            if ($skillId < 1 || !isset($skillMap[$skillId])) Http::json(['error' => 'إحدى المهارات لا تطابق صف الفصل المحدد.'], 422);
            if (isset($seen[$skillId])) Http::json(['error' => 'لا يمكن تكرار المهارة.'], 422);
            $seen[$skillId] = true;
            $participants = (int) ($item['participants'] ?? 0);
            $mastered = (int) ($item['mastered'] ?? 0);
            if ($participants < 0 || $participants > $studentCount) Http::json(['error' => 'عدد المشاركات لا يمكن أن يتجاوز عدد طالبات الفصل.'], 422);
            if ($mastered < 0 || $mastered > $participants) Http::json(['error' => 'عدد المتقنات لا يمكن أن يتجاوز عدد المشاركات.'], 422);
            $summaries[] = ['skillId' => $skillId, 'skillName' => $skillMap[$skillId], 'participants' => $participants, 'mastered' => $mastered, 'sortOrder' => $index + 1];
        }
    } else {
        $raw = is_array($data['questions'] ?? null) ? array_values($data['questions']) : [];
        if (!$raw || count($raw) > 100) Http::json(['error' => 'أضيفي من سؤال واحد إلى 100 سؤال.'], 422);
        $seenNumbers = [];
        foreach ($raw as $index => $item) {
            $skillId = max(0, (int) ($item['skillId'] ?? 0));
            if ($skillId < 1 || !isset($skillMap[$skillId])) Http::json(['error' => 'مهارة أحد الأسئلة لا تطابق صف الفصل.'], 422);
            $number = mb_substr(trim((string) ($item['number'] ?? '')), 0, 40);
            if ($number === '') Http::json(['error' => 'اكتبي رقم كل سؤال.'], 422);
            $numberKey = mb_strtolower($number);
            if (isset($seenNumbers[$numberKey])) Http::json(['error' => 'لا يمكن تكرار رقم السؤال داخل الاختبار.'], 422);
            $seenNumbers[$numberKey] = true;
            $maxPoints = round((float) ($item['maxPoints'] ?? 0), 2);
            if ($maxPoints <= 0 || $maxPoints > 1000) Http::json(['error' => 'الدرجة العظمى لكل سؤال يجب أن تكون أكبر من صفر ولا تتجاوز 1000.'], 422);
            $questionText = mb_substr(trim((string) ($item['text'] ?? '')), 0, 500);
            $questions[] = ['skillId' => $skillId, 'skillName' => $skillMap[$skillId], 'number' => $number, 'text' => $questionText ?: null, 'maxPoints' => $maxPoints, 'sortOrder' => $index + 1];
        }
    }

    $savedId = Database::transaction(function (PDO $pdo) use ($assessmentId, $teacherId, $classId, $academicYear, $semester, $title, $testType, $assessmentDate, $mode, $threshold, $texts, $opensAt, $closesAt, $summaries, $questions): int {
        if ($assessmentId > 0) {
            $stmt = $pdo->prepare("UPDATE teacher_paper_assessments SET class_id=?,academic_year=?,semester=?,title=?,test_type=?,assessment_date=?,collection_mode=?,mastery_threshold=?,subject_name=?,unit_name=?,lesson_name=?,instructions=?,opens_at=?,closes_at=?,require_approval=1 WHERE id=? AND teacher_id=? AND workflow_status='draft' AND deleted_at IS NULL");
            $stmt->execute([$classId,$academicYear,$semester,$title,$testType,$assessmentDate,$mode,$threshold,$texts['subject'],$texts['unit'],$texts['lesson'],$texts['instructions'],$opensAt,$closesAt,$assessmentId,$teacherId]);
            if ($stmt->rowCount() < 1) {
                $check = $pdo->prepare("SELECT id FROM teacher_paper_assessments WHERE id=? AND teacher_id=? AND workflow_status='draft' AND deleted_at IS NULL");
                $check->execute([$assessmentId,$teacherId]);
                if (!$check->fetch()) throw new RuntimeException('assessment_locked');
            }
            $id = $assessmentId;
            $pdo->prepare('DELETE FROM teacher_paper_assessment_skill_summaries WHERE assessment_id=?')->execute([$id]);
            $pdo->prepare('DELETE FROM teacher_paper_assessment_questions WHERE assessment_id=?')->execute([$id]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO teacher_paper_assessments (teacher_id,class_id,academic_year,semester,title,test_type,assessment_date,collection_mode,workflow_status,mastery_threshold,subject_name,unit_name,lesson_name,instructions,opens_at,closes_at,require_approval) VALUES (?,?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,1)");
            $stmt->execute([$teacherId,$classId,$academicYear,$semester,$title,$testType,$assessmentDate,$mode,$threshold,$texts['subject'],$texts['unit'],$texts['lesson'],$texts['instructions'],$opensAt,$closesAt]);
            $id = (int) $pdo->lastInsertId();
        }
        $insertSummary = $pdo->prepare('INSERT INTO teacher_paper_assessment_skill_summaries (assessment_id,skill_id,skill_name_snapshot,participant_count,mastered_count,sort_order) VALUES (?,?,?,?,?,?)');
        foreach ($summaries as $item) $insertSummary->execute([$id,$item['skillId'],$item['skillName'],$item['participants'],$item['mastered'],$item['sortOrder']]);
        $insertQuestion = $pdo->prepare('INSERT INTO teacher_paper_assessment_questions (assessment_id,skill_id,skill_name_snapshot,question_number,question_text,max_points,sort_order) VALUES (?,?,?,?,?,?,?)');
        foreach ($questions as $item) $insertQuestion->execute([$id,$item['skillId'],$item['skillName'],$item['number'],$item['text'],$item['maxPoints'],$item['sortOrder']]);
        return $id;
    });
    Activity::log('teacher', $teacherId, $assessmentId > 0 ? 'تعديل اختبار ورقي' : 'إنشاء اختبار ورقي', "الاختبار {$savedId} · {$mode}");
    Http::json(['ok' => true, 'id' => $savedId], $assessmentId > 0 ? 200 : 201);
}

function paper_question_rows(int $assessmentId): array
{
    return fetch_all('SELECT id,skill_id,skill_name_snapshot,question_number,question_text,max_points,sort_order FROM teacher_paper_assessment_questions WHERE assessment_id=? ORDER BY sort_order,id', [$assessmentId]);
}

function paper_summary_rows(int $assessmentId): array
{
    return fetch_all('SELECT id,skill_id,skill_name_snapshot,participant_count,mastered_count,sort_order FROM teacher_paper_assessment_skill_summaries WHERE assessment_id=? ORDER BY sort_order,id', [$assessmentId]);
}

function paper_analysis(int $assessmentId, int $classId, int $threshold, string $mode): array
{
    if ($mode === 'teacher_aggregate') {
        $skills = [];
        foreach (paper_summary_rows($assessmentId) as $row) {
            $participants = (int) $row['participant_count'];
            $mastered = (int) $row['mastered_count'];
            $rate = $participants > 0 ? round(($mastered / $participants) * 100, 1) : null;
            $skills[] = [
                'skillId' => $row['skill_id'] === null ? null : (int) $row['skill_id'],
                'skillName' => (string) $row['skill_name_snapshot'],
                'questionCount' => null,
                'participants' => $participants,
                'mastered' => $mastered,
                'notMastered' => max(0, $participants - $mastered),
                'masteryPercent' => $rate,
                'averagePerformance' => null,
                'status' => $rate === null ? 'no_results' : ($rate >= $threshold ? 'mastered' : 'not_mastered'),
            ];
        }
        return ['skillRows' => $skills, 'studentRows' => [], 'summary' => [
            'totalStudents' => (int) (fetch_one("SELECT COUNT(*) AS n FROM students WHERE class_id=? AND status='active' AND deleted_at IS NULL", [$classId])['n'] ?? 0),
            'registered' => 0,
            'submitted' => 0,
            'approved' => 0,
            'pending' => 0,
            'returned' => 0,
            'notRegistered' => 0,
        ]];
    }

    $questions = paper_question_rows($assessmentId);
    $questionMap = [];
    foreach ($questions as $question) $questionMap[(int) $question['id']] = $question;
    $students = fetch_all("SELECT id,name FROM students WHERE class_id=? AND status='active' AND deleted_at IS NULL ORDER BY name,id", [$classId]);
    $submissionRows = fetch_all('SELECT id,student_id,student_name_snapshot,status,submitted_at,reviewed_at,return_note,updated_at FROM teacher_paper_assessment_submissions WHERE assessment_id=? ORDER BY id', [$assessmentId]);
    $submissionMap = [];
    $submissionIds = [];
    foreach ($submissionRows as $row) { $submissionMap[(int) $row['student_id']] = $row; $submissionIds[] = (int) $row['id']; }
    $answersBySubmission = [];
    if ($submissionIds) {
        $marks = implode(',', array_fill(0, count($submissionIds), '?'));
        foreach (fetch_all("SELECT submission_id,question_id,earned_points FROM teacher_paper_assessment_answers WHERE submission_id IN ({$marks})", $submissionIds) as $answer) {
            $answersBySubmission[(int) $answer['submission_id']][(int) $answer['question_id']] = (float) $answer['earned_points'];
        }
    }
    $skillGroups = [];
    $studentRows = [];
    $counts = ['registered' => 0, 'submitted' => 0, 'approved' => 0, 'pending' => 0, 'returned' => 0];
    foreach ($students as $student) {
        $submission = $submissionMap[(int) $student['id']] ?? null;
        $status = $submission ? (string) $submission['status'] : 'not_registered';
        if ($submission) $counts['registered']++;
        if ($status === 'submitted') { $counts['submitted']++; $counts['pending']++; }
        if ($status === 'approved') $counts['approved']++;
        if ($status === 'returned') $counts['returned']++;
        $earnedTotal = 0.0; $possibleTotal = 0.0; $skillTotals = [];
        if ($submission) {
            $answers = $answersBySubmission[(int) $submission['id']] ?? [];
            foreach ($questions as $question) {
                $questionId = (int) $question['id'];
                if (!array_key_exists($questionId, $answers)) continue;
                $earned = min((float) $question['max_points'], max(0, (float) $answers[$questionId]));
                $possible = (float) $question['max_points'];
                $earnedTotal += $earned; $possibleTotal += $possible;
                $skillId = (int) ($question['skill_id'] ?? 0);
                $skillKey = $skillId > 0 ? (string) $skillId : 'snapshot:' . (string) $question['skill_name_snapshot'];
                if (!isset($skillTotals[$skillKey])) $skillTotals[$skillKey] = ['skillId' => $skillId ?: null, 'skillName' => (string) $question['skill_name_snapshot'], 'earned' => 0.0, 'possible' => 0.0, 'questions' => 0];
                $skillTotals[$skillKey]['earned'] += $earned;
                $skillTotals[$skillKey]['possible'] += $possible;
                $skillTotals[$skillKey]['questions']++;
            }
        }
        $studentSkills = [];
        foreach ($skillTotals as $skillKey => $total) {
            $percent = paper_percent($total['earned'], $total['possible']);
            $studentSkills[] = $total + ['percent' => $percent, 'mastered' => $percent >= $threshold];
            if ($status === 'approved') {
                if (!isset($skillGroups[$skillKey])) $skillGroups[$skillKey] = ['skillId' => $total['skillId'], 'skillName' => $total['skillName'], 'participants' => 0, 'mastered' => 0, 'earned' => 0.0, 'possible' => 0.0, 'questionIds' => []];
                $skillGroups[$skillKey]['participants']++;
                if ($percent >= $threshold) $skillGroups[$skillKey]['mastered']++;
                $skillGroups[$skillKey]['earned'] += $total['earned'];
                $skillGroups[$skillKey]['possible'] += $total['possible'];
            }
        }
        $overall = $possibleTotal > 0 ? paper_percent($earnedTotal, $possibleTotal) : null;
        $studentRows[] = [
            'studentId' => (int) $student['id'], 'studentName' => (string) $student['name'],
            'submissionId' => $submission ? (int) $submission['id'] : null,
            'status' => $status, 'statusLabel' => paper_submission_label($status),
            'earned' => paper_number($earnedTotal), 'possible' => paper_number($possibleTotal), 'percent' => $overall,
            'masteredSkills' => count(array_filter($studentSkills, static fn(array $skill): bool => (bool) $skill['mastered'])),
            'skillCount' => count($studentSkills), 'skills' => $studentSkills,
            'submittedAt' => $submission['submitted_at'] ?? null, 'reviewedAt' => $submission['reviewed_at'] ?? null,
            'returnNote' => $submission['return_note'] ?? null,
        ];
    }
    foreach ($questions as $question) {
        $skillId = (int) ($question['skill_id'] ?? 0);
        $skillKey = $skillId > 0 ? (string) $skillId : 'snapshot:' . (string) $question['skill_name_snapshot'];
        if (!isset($skillGroups[$skillKey])) $skillGroups[$skillKey] = ['skillId' => $skillId ?: null, 'skillName' => (string) $question['skill_name_snapshot'], 'participants' => 0, 'mastered' => 0, 'earned' => 0.0, 'possible' => 0.0, 'questionIds' => []];
        $skillGroups[$skillKey]['questionIds'][(int) $question['id']] = true;
    }
    $skillRows = [];
    foreach ($skillGroups as $group) {
        $mastery = $group['participants'] > 0 ? round(($group['mastered'] / $group['participants']) * 100, 1) : null;
        $averagePerformance = $group['possible'] > 0 ? paper_percent($group['earned'], $group['possible']) : null;
        $skillRows[] = [
            'skillId' => $group['skillId'], 'skillName' => $group['skillName'], 'questionCount' => count($group['questionIds']),
            'participants' => $group['participants'], 'mastered' => $group['mastered'], 'notMastered' => max(0, $group['participants'] - $group['mastered']),
            'masteryPercent' => $mastery, 'averagePerformance' => $averagePerformance,
            'status' => $mastery === null ? 'no_results' : ($mastery >= $threshold ? 'mastered' : 'not_mastered'),
        ];
    }
    usort($skillRows, static fn(array $a, array $b): int => strcmp($a['skillName'], $b['skillName']));
    return ['skillRows' => $skillRows, 'studentRows' => $studentRows, 'summary' => [
        'totalStudents' => count($students),
        'registered' => $counts['registered'],
        'submitted' => $counts['submitted'],
        'approved' => $counts['approved'],
        'pending' => $counts['pending'],
        'returned' => $counts['returned'],
        'notRegistered' => max(0, count($students) - $counts['registered']),
    ]];
}

function paper_teacher_show(int $teacherId, int $assessmentId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(), 409);
    $assessment = paper_teacher_owned_assessment($teacherId, $assessmentId);
    $questions = array_map(static fn(array $row): array => [
        'id' => (int) $row['id'], 'skillId' => $row['skill_id'] === null ? null : (int) $row['skill_id'], 'skillName' => (string) $row['skill_name_snapshot'],
        'number' => (string) $row['question_number'], 'text' => $row['question_text'] ?? null, 'maxPoints' => paper_number($row['max_points']), 'sortOrder' => (int) $row['sort_order'],
    ], paper_question_rows($assessmentId));
    $skills = array_map(static fn(array $row): array => [
        'id' => (int) $row['id'], 'skillId' => $row['skill_id'] === null ? null : (int) $row['skill_id'], 'skillName' => (string) $row['skill_name_snapshot'],
        'participants' => (int) $row['participant_count'], 'mastered' => (int) $row['mastered_count'], 'sortOrder' => (int) $row['sort_order'],
    ], paper_summary_rows($assessmentId));
    $analysis = paper_analysis($assessmentId, (int) $assessment['class_id'], (int) $assessment['mastery_threshold'], (string) $assessment['collection_mode']);
    Http::json(['migrationReady' => true, 'assessment' => paper_assessment_row($assessment), 'questions' => $questions, 'skills' => $skills, 'analysis' => $analysis]);
}

function paper_teacher_workflow(int $teacherId, int $assessmentId, string $action): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(), 409);
    $assessment = paper_teacher_owned_assessment($teacherId, $assessmentId);
    $mode = (string) $assessment['collection_mode'];
    $current = (string) $assessment['workflow_status'];
    if ($action === 'publish') {
        if ($mode !== 'student_entry' || $current !== 'draft') Http::json(['error' => 'يمكن نشر اختبارات التسجيل الفردي وهي في حالة مسودة فقط.'], 409);
        $count = (int) (fetch_one('SELECT COUNT(*) AS n FROM teacher_paper_assessment_questions WHERE assessment_id=?', [$assessmentId])['n'] ?? 0);
        if ($count < 1) Http::json(['error' => 'أضيفي سؤالًا واحدًا على الأقل قبل النشر.'], 422);
        execute_sql("UPDATE teacher_paper_assessments SET workflow_status='open',updated_at=NOW() WHERE id=? AND teacher_id=?", [$assessmentId,$teacherId]);
        Activity::log('teacher',$teacherId,'نشر اختبار ورقي',"الاختبار {$assessmentId}");
        Http::json(['ok' => true, 'status' => 'open']);
    }
    if ($action === 'close') {
        if ($mode === 'teacher_aggregate' && $current !== 'draft') Http::json(['error' => 'النتائج المجمعة معتمدة بالفعل.'], 409);
        if ($mode === 'student_entry' && $current !== 'open') Http::json(['error' => 'الاختبار غير مفتوح حاليًا.'], 409);
        execute_sql("UPDATE teacher_paper_assessments SET workflow_status='closed',updated_at=NOW() WHERE id=? AND teacher_id=?", [$assessmentId,$teacherId]);
        Activity::log('teacher',$teacherId,$mode === 'teacher_aggregate' ? 'اعتماد نتائج اختبار ورقي مجمعة' : 'إغلاق اختبار ورقي',"الاختبار {$assessmentId}");
        Http::json(['ok' => true, 'status' => 'closed']);
    }
    if ($action === 'reopen') {
        if ($mode !== 'student_entry' || $current !== 'closed') Http::json(['error' => 'يمكن إعادة فتح اختبار فردي مغلق فقط.'], 409);
        execute_sql("UPDATE teacher_paper_assessments SET workflow_status='open',updated_at=NOW() WHERE id=? AND teacher_id=?", [$assessmentId,$teacherId]);
        Activity::log('teacher',$teacherId,'إعادة فتح اختبار ورقي',"الاختبار {$assessmentId}");
        Http::json(['ok' => true, 'status' => 'open']);
    }
    if ($action === 'delete') {
        if ($current !== 'draft') Http::json(['error' => 'يمكن حذف المسودة فقط. أغلقي الاختبار المنشور للاحتفاظ بالسجل.'], 409);
        $submissions = (int) (fetch_one('SELECT COUNT(*) AS n FROM teacher_paper_assessment_submissions WHERE assessment_id=?', [$assessmentId])['n'] ?? 0);
        if ($submissions > 0) Http::json(['error' => 'لا يمكن حذف اختبار يحتوي على تسجيلات طالبات.'], 409);
        execute_sql('UPDATE teacher_paper_assessments SET deleted_at=NOW(),updated_at=NOW() WHERE id=? AND teacher_id=?', [$assessmentId,$teacherId]);
        Activity::log('teacher',$teacherId,'حذف مسودة اختبار ورقي',"الاختبار {$assessmentId}");
        Http::json(['ok' => true]);
    }
    Http::json(['error' => 'إجراء الاختبار غير معروف.'], 404);
}

function paper_teacher_owned_submission(int $teacherId, int $assessmentId, int $submissionId): array
{
    $row = fetch_one(
        'SELECT su.*,p.teacher_id,p.class_id,p.title,p.mastery_threshold,p.workflow_status,
                COALESCE(s.name,su.student_name_snapshot) AS current_student_name
         FROM teacher_paper_assessment_submissions su
         JOIN teacher_paper_assessments p ON p.id=su.assessment_id AND p.deleted_at IS NULL
         LEFT JOIN students s ON s.id=su.student_id
         WHERE su.id=? AND su.assessment_id=? AND p.teacher_id=?',
        [$submissionId,$assessmentId,$teacherId]
    );
    if (!$row) Http::json(['error' => 'تسجيل الطالبة غير موجود.'], 404);
    return $row;
}

function paper_file_rows(int $submissionId): array
{
    return fetch_all('SELECT id,submission_id,student_id,original_name,mime_type,size_bytes,created_at FROM teacher_paper_assessment_files WHERE submission_id=? AND deleted_at IS NULL ORDER BY created_at,id', [$submissionId]);
}

function paper_teacher_submission_show(int $teacherId, int $assessmentId, int $submissionId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(), 409);
    $submission = paper_teacher_owned_submission($teacherId,$assessmentId,$submissionId);
    $rows = fetch_all(
        'SELECT q.id AS question_id,q.question_number,q.question_text,q.skill_id,q.skill_name_snapshot,q.max_points,a.earned_points
         FROM teacher_paper_assessment_questions q
         LEFT JOIN teacher_paper_assessment_answers a ON a.question_id=q.id AND a.submission_id=?
         WHERE q.assessment_id=? ORDER BY q.sort_order,q.id',
        [$submissionId,$assessmentId]
    );
    $answers = []; $earned = 0.0; $possible = 0.0;
    foreach ($rows as $row) {
        $hasAnswer = $row['earned_points'] !== null;
        $value = $hasAnswer ? (float) $row['earned_points'] : null;
        if ($hasAnswer) { $earned += $value; $possible += (float) $row['max_points']; }
        $answers[] = [
            'questionId' => (int) $row['question_id'], 'number' => (string) $row['question_number'], 'text' => $row['question_text'] ?? null,
            'skillId' => $row['skill_id'] === null ? null : (int) $row['skill_id'], 'skillName' => (string) $row['skill_name_snapshot'],
            'maxPoints' => paper_number($row['max_points']), 'earnedPoints' => paper_number($row['earned_points']),
        ];
    }
    $files = array_map(static fn(array $row): array => [
        'id' => (int) $row['id'], 'name' => (string) $row['original_name'], 'mimeType' => (string) $row['mime_type'],
        'sizeBytes' => (int) $row['size_bytes'], 'createdAt' => (string) $row['created_at'],
        'url' => "/api/teacher/attachments/paper/{$assessmentId}/files/" . (int) $row['id'],
    ], paper_file_rows($submissionId));
    Http::json(['submission' => [
        'id' => (int) $submission['id'], 'studentId' => $submission['student_id'] === null ? null : (int) $submission['student_id'], 'studentName' => (string) $submission['current_student_name'],
        'status' => (string) $submission['status'], 'statusLabel' => paper_submission_label((string) $submission['status']),
        'submittedAt' => $submission['submitted_at'], 'reviewedAt' => $submission['reviewed_at'], 'returnNote' => $submission['return_note'],
        'earned' => paper_number($earned), 'possible' => paper_number($possible), 'percent' => $possible > 0 ? paper_percent($earned,$possible) : null,
    ], 'answers' => $answers, 'files' => $files]);
}

function paper_teacher_submission_action(int $teacherId, int $assessmentId, int $submissionId, string $action): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(), 409);
    $submission = paper_teacher_owned_submission($teacherId,$assessmentId,$submissionId);
    $status = (string) $submission['status'];
    if ($action === 'approve') {
        if ($status !== 'submitted') Http::json(['error' => 'يمكن اعتماد نتيجة مسلّمة وبانتظار المراجعة فقط.'], 409);
        execute_sql("UPDATE teacher_paper_assessment_submissions SET status='approved',reviewed_at=NOW(),return_note=NULL,updated_at=NOW() WHERE id=?", [$submissionId]);
        Activity::log('teacher',$teacherId,'اعتماد نتيجة اختبار ورقي',"الاختبار {$assessmentId} · الطالبة " . (int) $submission['student_id']);
        Http::json(['ok' => true, 'status' => 'approved']);
    }
    if (in_array($action, ['return','reopen'], true)) {
        if (!in_array($status, ['submitted','approved'], true)) Http::json(['error' => 'لا يمكن إعادة فتح هذه النتيجة في حالتها الحالية.'], 409);
        $data = Http::input();
        $note = mb_substr(trim((string) ($data['note'] ?? '')), 0, 1000);
        if ($note === '') $note = $action === 'reopen' ? 'أعيد فتح النتيجة للتعديل بواسطة المعلمة.' : 'يرجى مراجعة الدرجات وإعادة التسليم.';
        execute_sql("UPDATE teacher_paper_assessment_submissions SET status='returned',reviewed_at=NOW(),return_note=?,updated_at=NOW() WHERE id=?", [$note,$submissionId]);
        Activity::log('teacher',$teacherId,'إعادة نتيجة اختبار ورقي للطالبة',"الاختبار {$assessmentId} · الطالبة " . (int) $submission['student_id']);
        Http::json(['ok' => true, 'status' => 'returned']);
    }
    Http::json(['error' => 'إجراء التسجيل غير معروف.'], 404);
}

function paper_teacher_bulk_approve(int $teacherId, int $assessmentId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(), 409);
    paper_teacher_owned_assessment($teacherId,$assessmentId);
    $data = Http::input();
    $ids = array_values(array_unique(array_filter(array_map('intval', is_array($data['ids'] ?? null) ? $data['ids'] : []), static fn(int $id): bool => $id > 0)));
    if (!$ids || count($ids) > 100) Http::json(['error' => 'حددي من نتيجة واحدة إلى 100 نتيجة.'], 422);
    $marks = implode(',',array_fill(0,count($ids),'?'));
    $params = array_merge([$assessmentId,$teacherId],$ids);
    $rows = fetch_all("SELECT su.id FROM teacher_paper_assessment_submissions su JOIN teacher_paper_assessments p ON p.id=su.assessment_id WHERE su.assessment_id=? AND p.teacher_id=? AND su.status='submitted' AND su.id IN ({$marks})",$params);
    if (count($rows) !== count($ids)) Http::json(['error' => 'إحدى النتائج ليست بانتظار الاعتماد أو لا تتبع هذا الاختبار.'], 409);
    execute_sql("UPDATE teacher_paper_assessment_submissions SET status='approved',reviewed_at=NOW(),return_note=NULL,updated_at=NOW() WHERE assessment_id=? AND id IN ({$marks})", array_merge([$assessmentId],$ids));
    Activity::log('teacher',$teacherId,'اعتماد نتائج اختبار ورقي دفعة واحدة',"الاختبار {$assessmentId} · العدد " . count($ids));
    Http::json(['ok' => true, 'approved' => count($ids)]);
}

function paper_student_context(int $studentId): array
{
    $student = fetch_one(
        "SELECT s.id,s.name,s.class_id,s.status,s.deleted_at,c.teacher_id,c.name AS class_name,c.stage,c.grade_label,c.academic_year
         FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=? AND s.status='active' AND s.deleted_at IS NULL",
        [$studentId]
    );
    if (!$student) Http::json(['error' => 'حساب الطالبة أو الفصل غير متاح.'], 404);
    return $student;
}

function paper_student_owned_assessment(int $studentId, int $assessmentId): array
{
    $student = paper_student_context($studentId);
    $row = fetch_one(
        "SELECT p.*,c.name AS class_name FROM teacher_paper_assessments p JOIN classes c ON c.id=p.class_id
         WHERE p.id=? AND p.class_id=? AND p.collection_mode='student_entry' AND p.deleted_at IS NULL",
        [$assessmentId,(int) $student['class_id']]
    );
    if (!$row) Http::json(['error' => 'الاختبار الورقي غير متاح لحسابكِ.'], 404);
    return [$student,$row];
}

function paper_student_window(array $assessment): array
{
    $now = date('Y-m-d H:i:s');
    $workflow = (string) $assessment['workflow_status'];
    if ($workflow === 'draft') return ['state' => 'draft', 'canEdit' => false, 'message' => 'لم تنشر المعلمة الاختبار بعد.'];
    if ($workflow === 'closed') return ['state' => 'closed', 'canEdit' => false, 'message' => 'أغلقت المعلمة تسجيل هذا الاختبار.'];
    if (!empty($assessment['opens_at']) && $now < (string) $assessment['opens_at']) return ['state' => 'upcoming', 'canEdit' => false, 'message' => 'لم يبدأ وقت التسجيل بعد.'];
    if (!empty($assessment['closes_at']) && $now > (string) $assessment['closes_at']) return ['state' => 'closed', 'canEdit' => false, 'message' => 'انتهى وقت التسجيل.'];
    return ['state' => 'open', 'canEdit' => true, 'message' => 'التسجيل متاح.'];
}

function paper_student_list(int $studentId): never
{
    if (!paper_assessments_schema_ready()) Http::json(array_merge(paper_migration_payload(), ['assessments' => []]));
    $student = paper_student_context($studentId);
    $rows = fetch_all(
        "SELECT p.*,c.name AS class_name,su.id AS submission_id,su.status AS submission_status,su.submitted_at,su.reviewed_at,su.return_note,
                (SELECT COUNT(*) FROM teacher_paper_assessment_questions q WHERE q.assessment_id=p.id) AS question_count
         FROM teacher_paper_assessments p JOIN classes c ON c.id=p.class_id
         LEFT JOIN teacher_paper_assessment_submissions su ON su.assessment_id=p.id AND su.student_id=?
         WHERE p.class_id=? AND p.collection_mode='student_entry' AND p.deleted_at IS NULL
           AND (p.workflow_status IN ('open','closed') OR su.id IS NOT NULL)
         ORDER BY p.assessment_date DESC,p.id DESC",
        [$studentId,(int) $student['class_id']]
    );
    $assessments = [];
    foreach ($rows as $row) {
        $window = paper_student_window($row);
        $submissionStatus = $row['submission_status'] ?? 'not_registered';
        $returnedByTeacher = $submissionStatus === 'returned';
        $canEdit = ($window['canEdit'] || $returnedByTeacher) && in_array($submissionStatus, ['not_registered','draft','returned'], true);
        $assessments[] = array_merge(paper_assessment_row($row), [
            'windowState' => $returnedByTeacher ? 'returned' : $window['state'],
            'windowMessage' => $returnedByTeacher ? 'أعادت المعلمة النتيجة وسمحت بتعديلها وإعادة تسليمها.' : $window['message'],
            'submissionId' => $row['submission_id'] === null ? null : (int) $row['submission_id'],
            'submissionStatus' => $submissionStatus, 'submissionStatusLabel' => paper_submission_label((string) $submissionStatus),
            'submittedAt' => $row['submitted_at'] ?? null, 'reviewedAt' => $row['reviewed_at'] ?? null, 'returnNote' => $row['return_note'] ?? null,
            'canEdit' => $canEdit,
        ]);
    }
    Http::json(['migrationReady' => true, 'assessments' => $assessments]);
}

function paper_student_submission(int $assessmentId, int $studentId): ?array
{
    return fetch_one('SELECT * FROM teacher_paper_assessment_submissions WHERE assessment_id=? AND student_id=?', [$assessmentId,$studentId]);
}

function paper_student_show(int $studentId, int $assessmentId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(), 409);
    [$student,$assessment] = paper_student_owned_assessment($studentId,$assessmentId);
    if ((string) $assessment['workflow_status'] === 'draft') Http::json(['error' => 'لم تنشر المعلمة هذا الاختبار بعد.'], 404);
    $window = paper_student_window($assessment);
    $submission = paper_student_submission($assessmentId,$studentId);
    $questions = array_map(static fn(array $row): array => [
        'id' => (int) $row['id'], 'number' => (string) $row['question_number'], 'text' => $row['question_text'] ?? null,
        'skillId' => $row['skill_id'] === null ? null : (int) $row['skill_id'], 'skillName' => (string) $row['skill_name_snapshot'],
        'maxPoints' => paper_number($row['max_points']), 'sortOrder' => (int) $row['sort_order'],
    ], paper_question_rows($assessmentId));
    $answers = [];
    $files = [];
    if ($submission) {
        foreach (fetch_all('SELECT question_id,earned_points FROM teacher_paper_assessment_answers WHERE submission_id=?', [(int) $submission['id']]) as $answer) {
            $answers[(string) $answer['question_id']] = paper_number($answer['earned_points']);
        }
        $files = array_map(static fn(array $row): array => [
            'id' => (int) $row['id'], 'name' => (string) $row['original_name'], 'mimeType' => (string) $row['mime_type'], 'sizeBytes' => (int) $row['size_bytes'],
            'createdAt' => (string) $row['created_at'], 'url' => "/api/student/paper-assessments/{$assessmentId}/files/" . (int) $row['id'],
        ], paper_file_rows((int) $submission['id']));
    }
    $status = $submission['status'] ?? 'not_registered';
    $returnedByTeacher = $status === 'returned';
    $canEdit = ($window['canEdit'] || $returnedByTeacher) && in_array($status, ['not_registered','draft','returned'], true);
    $skillResults = [];
    if ($submission && $status === 'approved') {
        $totals = [];
        foreach ($questions as $question) {
            if (!array_key_exists((string) $question['id'], $answers)) continue;
            $key = (string) ($question['skillId'] ?? $question['skillName']);
            if (!isset($totals[$key])) $totals[$key] = ['skillId' => $question['skillId'], 'skillName' => $question['skillName'], 'earned' => 0.0, 'possible' => 0.0];
            $totals[$key]['earned'] += (float) $answers[(string) $question['id']];
            $totals[$key]['possible'] += (float) $question['maxPoints'];
        }
        foreach ($totals as $total) {
            $percent = paper_percent($total['earned'],$total['possible']);
            $skillResults[] = $total + ['earned' => paper_number($total['earned']), 'possible' => paper_number($total['possible']), 'percent' => $percent, 'mastered' => $percent >= (int) $assessment['mastery_threshold']];
        }
    }
    Http::json([
        'migrationReady' => true,
        'assessment' => paper_assessment_row($assessment),
        'student' => ['id' => (int) $student['id'], 'name' => (string) $student['name'], 'className' => (string) $student['class_name']],
        'window' => $returnedByTeacher ? ['state' => 'returned', 'canEdit' => true, 'message' => 'أعادت المعلمة النتيجة وسمحت بتعديلها وإعادة تسليمها.'] : $window,
        'submission' => $submission ? [
            'id' => (int) $submission['id'], 'status' => (string) $submission['status'], 'statusLabel' => paper_submission_label((string) $submission['status']),
            'submittedAt' => $submission['submitted_at'], 'reviewedAt' => $submission['reviewed_at'], 'returnNote' => $submission['return_note'],
        ] : null,
        'questions' => $questions, 'answers' => $answers, 'files' => $files, 'skillResults' => $skillResults,
        'canEdit' => $canEdit,
        'limits' => ['maxFiles' => PAPER_ASSESSMENT_MAX_FILES, 'maxFileBytes' => PAPER_ASSESSMENT_MAX_FILE_BYTES, 'maxTotalBytes' => PAPER_ASSESSMENT_MAX_TOTAL_BYTES],
    ]);
}

function paper_uploaded_files(): array
{
    if (!isset($_FILES['files'])) return [];
    $files = $_FILES['files'];
    if (!is_array($files['name'] ?? null)) return [[
        'name' => (string) ($files['name'] ?? ''), 'type' => (string) ($files['type'] ?? ''), 'tmp_name' => (string) ($files['tmp_name'] ?? ''),
        'error' => (int) ($files['error'] ?? UPLOAD_ERR_NO_FILE), 'size' => (int) ($files['size'] ?? 0),
    ]];
    $rows = [];
    foreach ($files['name'] as $index => $name) $rows[] = [
        'name' => (string) $name, 'type' => (string) ($files['type'][$index] ?? ''), 'tmp_name' => (string) ($files['tmp_name'][$index] ?? ''),
        'error' => (int) ($files['error'][$index] ?? UPLOAD_ERR_NO_FILE), 'size' => (int) ($files['size'][$index] ?? 0),
    ];
    return array_values(array_filter($rows, static fn(array $row): bool => $row['error'] !== UPLOAD_ERR_NO_FILE));
}

function paper_prepare_files(array $files): array
{
    if (!$files) return [];
    if (count($files) > PAPER_ASSESSMENT_MAX_FILES) Http::json(['error' => 'الحد الأقصى خمسة ملفات.'], 422);
    if (!class_exists('finfo')) Http::json(['error' => 'الخادم يحتاج إضافة Fileinfo للتحقق من الملفات.'], 500);
    $allowed = paper_allowed_mimes();
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $prepared = [];
    foreach ($files as $file) {
        if ($file['error'] !== UPLOAD_ERR_OK) Http::json(['error' => 'تعذّر رفع أحد الملفات.'], 422);
        if ($file['size'] < 1 || $file['size'] > PAPER_ASSESSMENT_MAX_FILE_BYTES) Http::json(['error' => 'حجم كل ملف يجب ألا يتجاوز 10 ميجابايت.'], 422);
        if ($file['tmp_name'] === '' || !is_uploaded_file($file['tmp_name'])) Http::json(['error' => 'أحد الملفات المرفوعة غير صالح.'], 422);
        $mime = (string) ($finfo->file($file['tmp_name']) ?: '');
        if (!isset($allowed[$mime])) Http::json(['error' => 'المسموح PDF وJPG وPNG وWEBP فقط.'], 422);
        if (str_starts_with($mime,'image/')) {
            $dimensions = @getimagesize($file['tmp_name']);
            if (!$dimensions || (int) $dimensions[0] < 1 || (int) $dimensions[1] < 1 || ((int) $dimensions[0] * (int) $dimensions[1]) > 16000000) {
                Http::json(['error' => 'إحدى الصور تالفة أو تتجاوز 16 مليون بكسل.'], 422);
            }
        }
        $raw = trim(basename(str_replace('\\','/',(string) $file['name'])));
        $stem = trim((string) pathinfo($raw,PATHINFO_FILENAME));
        if ($stem === '') $stem = 'ورقة-اختبار';
        $original = mb_substr($stem,0,230) . '.' . $allowed[$mime];
        $prepared[] = $file + [
            'mime' => $mime, 'original' => $original, 'stored' => bin2hex(random_bytes(24)) . '.' . $allowed[$mime],
            'sha256' => hash_file('sha256',$file['tmp_name']) ?: '',
        ];
    }
    if (array_sum(array_column($prepared,'size')) > PAPER_ASSESSMENT_MAX_TOTAL_BYTES) Http::json(['error' => 'إجمالي الملفات الجديدة يجب ألا يتجاوز 20 ميجابايت.'], 422);
    return $prepared;
}

function paper_student_save(int $studentId, int $assessmentId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(), 409);
    [$student,$assessment] = paper_student_owned_assessment($studentId,$assessmentId);
    $window = paper_student_window($assessment);
    $submission = paper_student_submission($assessmentId,$studentId);
    $returnedByTeacher = $submission && (string) $submission['status'] === 'returned';
    if (!$window['canEdit'] && !$returnedByTeacher) Http::json(['error' => $window['message']], 409);
    if ($submission && !in_array((string) $submission['status'], ['draft','returned'], true)) Http::json(['error' => 'النتيجة مقفلة بعد التسليم. تطلب الطالبة من المعلمة إعادة فتحها للتعديل.'], 409);
    $questions = paper_question_rows($assessmentId);
    $questionMap = [];
    foreach ($questions as $question) $questionMap[(int) $question['id']] = (float) $question['max_points'];
    if (!$questionMap) Http::json(['error' => 'لا توجد أسئلة في هذا الاختبار.'], 409);
    $decoded = json_decode((string) ($_POST['answers'] ?? '[]'), true);
    if (!is_array($decoded)) Http::json(['error' => 'بيانات الدرجات غير صالحة.'], 422);
    $answers = [];
    foreach ($decoded as $answer) {
        if (!is_array($answer)) continue;
        $questionId = max(0,(int)($answer['questionId']??0));
        if ($questionId < 1 || !isset($questionMap[$questionId])) Http::json(['error' => 'أحد الأسئلة لا يتبع هذا الاختبار.'], 422);
        if (($answer['earnedPoints'] ?? '') === '') continue;
        if (!is_numeric($answer['earnedPoints'])) Http::json(['error' => 'إحدى الدرجات ليست قيمة رقمية صالحة.'], 422);
        $earned = round((float) $answer['earnedPoints'],2);
        if ($earned < 0 || $earned > $questionMap[$questionId]) Http::json(['error' => 'إحدى الدرجات أقل من صفر أو تتجاوز الدرجة العظمى.'], 422);
        $answers[$questionId] = $earned;
    }
    $prepared = paper_prepare_files(paper_uploaded_files());
    $existingFiles = $submission
        ? (fetch_one('SELECT COUNT(*) AS n,COALESCE(SUM(size_bytes),0) AS total_bytes FROM teacher_paper_assessment_files WHERE submission_id=? AND deleted_at IS NULL', [(int)$submission['id']]) ?: [])
        : [];
    $existingFileCount = (int) ($existingFiles['n'] ?? 0);
    $existingFileBytes = (int) ($existingFiles['total_bytes'] ?? 0);
    if ($existingFileCount + count($prepared) > PAPER_ASSESSMENT_MAX_FILES) Http::json(['error' => 'لا يمكن أن يتجاوز مجموع المرفقات خمسة ملفات.'], 422);
    if ($existingFileBytes + array_sum(array_column($prepared,'size')) > PAPER_ASSESSMENT_MAX_TOTAL_BYTES) Http::json(['error' => 'لا يمكن أن يتجاوز مجموع المرفقات 20 ميجابايت.'], 422);
    $moved = [];
    try {
        $savedId = Database::transaction(function (PDO $pdo) use ($submission,$assessmentId,$studentId,$student,$answers,$prepared,&$moved): int {
            if ($submission) {
                $submissionId = (int) $submission['id'];
                $stmt = $pdo->prepare("UPDATE teacher_paper_assessment_submissions SET submitted_at=NULL,reviewed_at=NULL,updated_at=NOW() WHERE id=? AND student_id=? AND status IN ('draft','returned')");
                $stmt->execute([$submissionId,$studentId]);
                if ($stmt->rowCount() < 1) throw new RuntimeException('submission_locked');
            } else {
                $stmt = $pdo->prepare("INSERT INTO teacher_paper_assessment_submissions (assessment_id,student_id,student_name_snapshot,status) VALUES (?, ?, ?, 'draft')");
                $stmt->execute([$assessmentId,$studentId,(string)$student['name']]);
                $submissionId = (int) $pdo->lastInsertId();
            }
            $pdo->prepare('DELETE FROM teacher_paper_assessment_answers WHERE submission_id=?')->execute([$submissionId]);
            $insertAnswer = $pdo->prepare('INSERT INTO teacher_paper_assessment_answers (submission_id,question_id,earned_points) VALUES (?,?,?)');
            foreach ($answers as $questionId => $earned) $insertAnswer->execute([$submissionId,$questionId,$earned]);
            if ($prepared) {
                $directory = paper_storage_directory();
                $insertFile = $pdo->prepare('INSERT INTO teacher_paper_assessment_files (submission_id,student_id,original_name,stored_name,mime_type,size_bytes,sha256) VALUES (?,?,?,?,?,?,?)');
                foreach ($prepared as $file) {
                    $path = $directory . '/' . $file['stored'];
                    if (!move_uploaded_file($file['tmp_name'],$path)) throw new RuntimeException('move_failed');
                    $moved[] = $path;
                    $insertFile->execute([$submissionId,$studentId,$file['original'],$file['stored'],$file['mime'],$file['size'],$file['sha256']]);
                }
            }
            return $submissionId;
        });
    } catch (Throwable $error) {
        foreach ($moved as $path) if (is_file($path)) @unlink($path);
        if ($error instanceof RuntimeException && $error->getMessage()==='submission_locked') Http::json(['error' => 'النتيجة مقفلة ولا يمكن تعديلها.'],409);
        if ($error instanceof RuntimeException && $error->getMessage()==='move_failed') Http::json(['error' => 'تعذّر حفظ أحد المرفقات.'],500);
        throw $error;
    }
    Activity::log('student',$studentId,'حفظ مسودة اختبار ورقي',"الاختبار {$assessmentId}");
    Http::json(['ok'=>true,'submissionId'=>$savedId,'savedAnswers'=>count($answers),'uploaded'=>count($prepared)]);
}

function paper_student_submit(int $studentId, int $assessmentId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(),409);
    [, $assessment] = paper_student_owned_assessment($studentId,$assessmentId);
    $window = paper_student_window($assessment);
    $submission = paper_student_submission($assessmentId,$studentId);
    $returnedByTeacher = $submission && (string) $submission['status'] === 'returned';
    if (!$window['canEdit'] && !$returnedByTeacher) Http::json(['error'=>$window['message']],409);
    if (!$submission || !in_array((string)$submission['status'],['draft','returned'],true)) Http::json(['error'=>'احفظي الدرجات أولًا، أو اطلبي من المعلمة إعادة فتح النتيجة.'],409);
    $questionCount = (int)(fetch_one('SELECT COUNT(*) AS n FROM teacher_paper_assessment_questions WHERE assessment_id=?',[$assessmentId])['n']??0);
    $answerCount = (int)(fetch_one('SELECT COUNT(*) AS n FROM teacher_paper_assessment_answers WHERE submission_id=?',[(int)$submission['id']])['n']??0);
    if ($questionCount < 1 || $answerCount !== $questionCount) Http::json(['error'=>'أدخلي درجة لكل سؤال، ويمكن أن تكون الدرجة صفرًا.'],422);
    execute_sql("UPDATE teacher_paper_assessment_submissions SET status='submitted',submitted_at=NOW(),reviewed_at=NULL,return_note=NULL,updated_at=NOW() WHERE id=? AND student_id=? AND status IN ('draft','returned')",[(int)$submission['id'],$studentId]);
    Activity::log('student',$studentId,'تسليم نتيجة اختبار ورقي',"الاختبار {$assessmentId}");
    Http::json(['ok'=>true,'status'=>'submitted','message'=>'تم تسليم النتيجة وأصبحت بانتظار اعتماد المعلمة.']);
}

function paper_send_file(array $row, bool $download): never
{
    $path = paper_storage_directory() . '/' . basename((string)$row['stored_name']);
    if (!is_file($path)) Http::json(['error'=>'الملف غير متاح على الخادم.'],404);
    $name = str_replace(["\r","\n",'"'], '', (string)$row['original_name']);
    header('Content-Type: ' . (string)$row['mime_type']);
    header('Content-Length: ' . filesize($path));
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename*=UTF-8\'\'' . rawurlencode($name));
    readfile($path);
    exit;
}

function paper_student_file(int $studentId,int $assessmentId,int $fileId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(),409);
    [, $assessment] = paper_student_owned_assessment($studentId,$assessmentId);
    $row = fetch_one('SELECT f.* FROM teacher_paper_assessment_files f JOIN teacher_paper_assessment_submissions su ON su.id=f.submission_id WHERE f.id=? AND f.student_id=? AND su.assessment_id=? AND f.deleted_at IS NULL',[$fileId,$studentId,$assessmentId]);
    if (!$row) Http::json(['error'=>'المرفق غير موجود.'],404);
    paper_send_file($row,isset($_GET['download']));
}

function paper_student_delete_file(int $studentId,int $assessmentId,int $fileId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(),409);
    [, $assessment] = paper_student_owned_assessment($studentId,$assessmentId);
    $window = paper_student_window($assessment);
    $row = fetch_one("SELECT f.*,su.status FROM teacher_paper_assessment_files f JOIN teacher_paper_assessment_submissions su ON su.id=f.submission_id WHERE f.id=? AND f.student_id=? AND su.assessment_id=? AND f.deleted_at IS NULL",[$fileId,$studentId,$assessmentId]);
    if (!$window['canEdit'] && (!$row || (string)$row['status'] !== 'returned')) Http::json(['error'=>$window['message']],409);
    if (!$row || !in_array((string)$row['status'],['draft','returned'],true)) Http::json(['error'=>'لا يمكن حذف هذا المرفق بعد تسليم النتيجة.'],409);
    execute_sql('UPDATE teacher_paper_assessment_files SET deleted_at=NOW() WHERE id=? AND student_id=?',[$fileId,$studentId]);
    $path = paper_storage_directory() . '/' . basename((string)$row['stored_name']);
    if (is_file($path)) @unlink($path);
    Http::json(['ok'=>true]);
}

function paper_teacher_file(int $teacherId,int $assessmentId,int $fileId): never
{
    if (!paper_assessments_schema_ready()) Http::json(paper_migration_payload(),409);
    paper_teacher_owned_assessment($teacherId,$assessmentId);
    $row = fetch_one('SELECT f.* FROM teacher_paper_assessment_files f JOIN teacher_paper_assessment_submissions su ON su.id=f.submission_id WHERE f.id=? AND su.assessment_id=? AND f.deleted_at IS NULL',[$fileId,$assessmentId]);
    if (!$row) Http::json(['error'=>'المرفق غير موجود.'],404);
    paper_send_file($row,isset($_GET['download']));
}

function teacher_paper_assessment_routes(string $method,array $segments,int $teacherId): never
{
    $first = $segments[0] ?? '';
    if ($first === 'context' && $method === 'GET') paper_teacher_context($teacherId);
    if ($first === '' && $method === 'GET') paper_teacher_list($teacherId);
    if ($first === '' && $method === 'POST') paper_teacher_save($teacherId);
    if ($first !== '' && ctype_digit((string)$first)) {
        $assessmentId = (int)$first;
        $second = $segments[1] ?? '';
        if ($second === '' && $method === 'GET') paper_teacher_show($teacherId,$assessmentId);
        if (in_array($second,['publish','close','reopen','delete'],true) && $method === 'POST') paper_teacher_workflow($teacherId,$assessmentId,$second);
        if ($second === 'approve-bulk' && $method === 'POST') paper_teacher_bulk_approve($teacherId,$assessmentId);
        if ($second === 'submissions' && isset($segments[2]) && ctype_digit((string)$segments[2])) {
            $submissionId = (int)$segments[2];
            $action = $segments[3] ?? '';
            if ($action === '' && $method === 'GET') paper_teacher_submission_show($teacherId,$assessmentId,$submissionId);
            if (in_array($action,['approve','return','reopen'],true) && $method === 'POST') paper_teacher_submission_action($teacherId,$assessmentId,$submissionId,$action);
        }
        if ($second === 'files' && isset($segments[2]) && ctype_digit((string)$segments[2]) && $method === 'GET') paper_teacher_file($teacherId,$assessmentId,(int)$segments[2]);
    }
    Http::json(['error'=>'مسار الاختبارات الورقية غير موجود.'],404);
}

function student_paper_assessment_routes(string $method,array $segments,int $studentId): never
{
    $first = $segments[0] ?? '';
    if ($first === '' && $method === 'GET') paper_student_list($studentId);
    if ($first !== '' && ctype_digit((string)$first)) {
        $assessmentId = (int)$first;
        $second = $segments[1] ?? '';
        if ($second === '' && $method === 'GET') paper_student_show($studentId,$assessmentId);
        if ($second === 'save' && $method === 'POST') paper_student_save($studentId,$assessmentId);
        if ($second === 'submit' && $method === 'POST') paper_student_submit($studentId,$assessmentId);
        if ($second === 'files' && isset($segments[2]) && ctype_digit((string)$segments[2])) {
            $fileId = (int)$segments[2];
            if (($segments[3] ?? '') === 'delete' && $method === 'POST') paper_student_delete_file($studentId,$assessmentId,$fileId);
            if (($segments[3] ?? '') === '' && $method === 'GET') paper_student_file($studentId,$assessmentId,$fileId);
        }
    }
    Http::json(['error'=>'مسار الاختبارات الورقية غير موجود.'],404);
}
