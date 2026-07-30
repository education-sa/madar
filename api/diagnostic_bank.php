<?php
declare(strict_types=1);

const DIAGNOSTIC_DISTRIBUTION_VERSION = 4;

function diagnostic_columns(string $table): array
{
    return array_fill_keys(array_map(static fn(array $column): string => (string)$column['Field'], fetch_all("SHOW COLUMNS FROM {$table}")), true);
}

function diagnostic_indexes(string $table): array
{
    return array_fill_keys(array_map(static fn(array $index): string => (string)$index['Key_name'], fetch_all("SHOW INDEX FROM {$table}")), true);
}

function ensure_diagnostic_bank_schema(): void
{
    static $ready = false;
    if ($ready) return;

    $bankColumns = diagnostic_columns('question_bank');
    $sourceColumn = fetch_one("SHOW COLUMNS FROM question_bank LIKE 'source'");
    if ($sourceColumn && !str_contains((string)$sourceColumn['Type'], "'imported'")) {
        execute_sql("ALTER TABLE question_bank MODIFY COLUMN source ENUM('manual','ai','imported') NOT NULL DEFAULT 'manual'");
    }
    $bankAdditions = [
        'external_question_id' => 'VARCHAR(80) NULL AFTER teacher_id',
        'source_question_id' => 'VARCHAR(120) NULL AFTER external_question_id',
        'subject_id' => 'VARCHAR(120) NULL AFTER source_question_id',
        'subject_name' => 'VARCHAR(180) NULL AFTER subject_id',
        'lesson_code' => 'VARCHAR(50) NULL AFTER skill_id',
        'external_skill_id' => 'VARCHAR(120) NULL AFTER lesson_code',
        'import_batch' => 'VARCHAR(80) NULL AFTER lesson_code',
        'class_label' => 'VARCHAR(30) NULL AFTER grade_label',
        'term_label' => 'VARCHAR(80) NULL AFTER class_label',
        'chapter_name' => 'VARCHAR(180) NULL AFTER topic',
        'unit_id' => 'VARCHAR(120) NULL AFTER chapter_name',
        'unit_name' => 'VARCHAR(180) NULL AFTER unit_id',
        'lesson_id' => 'VARCHAR(120) NULL AFTER unit_name',
        'lesson_name' => 'VARCHAR(180) NULL AFTER lesson_id',
        'question_level' => "ENUM('unclassified','applied','logical','analytical') NOT NULL DEFAULT 'unclassified' AFTER difficulty",
        'cognitive_type' => 'VARCHAR(80) NULL AFTER question_level',
        'question_category' => 'VARCHAR(120) NULL AFTER cognitive_type',
        'bloom_level' => 'VARCHAR(50) NULL AFTER cognitive_type',
        'skill_repeat_number' => 'SMALLINT UNSIGNED NULL AFTER bloom_level',
        'questions_to_display' => 'SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER skill_repeat_number',
        'question_order' => 'INT UNSIGNED NULL AFTER questions_to_display',
        'reference_page' => 'VARCHAR(80) NULL AFTER explanation',
        'content_source' => 'VARCHAR(80) NULL AFTER reference_page',
        'question_source' => 'VARCHAR(180) NULL AFTER content_source',
        'source_reference' => 'VARCHAR(500) NULL AFTER question_source',
        'status' => 'VARCHAR(80) NULL AFTER source_reference',
        'is_active' => 'TINYINT(1) NOT NULL DEFAULT 1 AFTER review_status',
    ];
    foreach ($bankAdditions as $name => $definition) {
        if (!isset($bankColumns[$name])) execute_sql("ALTER TABLE question_bank ADD COLUMN {$name} {$definition}");
    }
    $bankIndexes = diagnostic_indexes('question_bank');
    if (!isset($bankIndexes['uq_bank_external'])) {
        execute_sql('ALTER TABLE question_bank ADD UNIQUE INDEX uq_bank_external (teacher_id,external_question_id)');
    }
    if (!isset($bankIndexes['idx_bank_lesson_review'])) {
        execute_sql('ALTER TABLE question_bank ADD INDEX idx_bank_lesson_review (teacher_id,import_batch,lesson_code,review_status,is_active)');
    }


    execute_sql(
        "CREATE TABLE IF NOT EXISTS question_bank_repository_resets (
          teacher_id BIGINT UNSIGNED NOT NULL,
          reset_key VARCHAR(80) NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (teacher_id,reset_key),
          CONSTRAINT fk_question_bank_reset_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    execute_sql(
        "CREATE TABLE IF NOT EXISTS student_distribution_ordinals (
          class_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          ordinal_number INT UNSIGNED NOT NULL,
          assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (class_id,student_id),
          UNIQUE KEY uq_distribution_class_ordinal (class_id,ordinal_number),
          CONSTRAINT fk_distribution_ordinal_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          CONSTRAINT fk_distribution_ordinal_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $testColumns = diagnostic_columns('tests');
    $testAdditions = [
        'question_source' => "ENUM('static','lesson_bank') NOT NULL DEFAULT 'static' AFTER test_type",
        'bank_stage' => "ENUM('ابتدائي','متوسط','ثانوي') NULL AFTER question_source",
        'bank_grade_label' => 'VARCHAR(80) NULL AFTER bank_stage',
        'bank_term_label' => 'VARCHAR(80) NULL AFTER bank_grade_label',
        'bank_import_batch' => 'VARCHAR(80) NULL AFTER bank_term_label',
        'bank_skill_ids_json' => 'JSON NULL AFTER bank_import_batch',
        'expected_lesson_count' => 'SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER bank_import_batch',
    ];
    foreach ($testAdditions as $name => $definition) {
        if (!isset($testColumns[$name])) execute_sql("ALTER TABLE tests ADD COLUMN {$name} {$definition}");
    }

    $attemptColumns = diagnostic_columns('test_attempts');
    $attemptAdditions = [
        'distribution_version' => 'SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER attempt_no',
        'distribution_ordinal' => 'INT UNSIGNED NULL AFTER distribution_version',
    ];
    foreach ($attemptAdditions as $name => $definition) {
        if (!isset($attemptColumns[$name])) execute_sql("ALTER TABLE test_attempts ADD COLUMN {$name} {$definition}");
    }

    execute_sql(
        "CREATE TABLE IF NOT EXISTS test_attempt_questions (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          attempt_id BIGINT UNSIGNED NOT NULL,
          bank_question_id BIGINT UNSIGNED NULL,
          source_question_id BIGINT UNSIGNED NULL,
          skill_id BIGINT UNSIGNED NULL,
          lesson_code VARCHAR(50) NULL,
          skill_name VARCHAR(180) NULL,
          question_type ENUM('mcq','true_false','short_answer') NOT NULL,
          question_text TEXT NOT NULL,
          options_json JSON NULL,
          correct_answer TEXT NOT NULL,
          explanation TEXT NULL,
          points DECIMAL(6,2) NOT NULL DEFAULT 1,
          order_index SMALLINT UNSIGNED NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_attempt_question_order (attempt_id,order_index),
          CONSTRAINT fk_attempt_question_attempt FOREIGN KEY (attempt_id) REFERENCES test_attempts(id) ON DELETE CASCADE,
          CONSTRAINT fk_attempt_question_bank FOREIGN KEY (bank_question_id) REFERENCES question_bank(id) ON DELETE SET NULL,
          CONSTRAINT fk_attempt_question_source FOREIGN KEY (source_question_id) REFERENCES test_questions(id) ON DELETE SET NULL,
          CONSTRAINT fk_attempt_question_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE SET NULL,
          INDEX idx_attempt_question_attempt (attempt_id),
          INDEX idx_attempt_question_skill (skill_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $attemptQuestionColumns = diagnostic_columns('test_attempt_questions');
    $attemptQuestionAdditions = [
        'skill_repeat_number' => 'SMALLINT UNSIGNED NULL AFTER skill_name',
        'distribution_variant' => 'SMALLINT UNSIGNED NULL AFTER skill_repeat_number',
        'distribution_variant_count' => 'SMALLINT UNSIGNED NULL AFTER distribution_variant',
    ];
    foreach ($attemptQuestionAdditions as $name => $definition) {
        if (!isset($attemptQuestionColumns[$name])) execute_sql("ALTER TABLE test_attempt_questions ADD COLUMN {$name} {$definition}");
    }

    $answerColumns = diagnostic_columns('answers');
    $questionColumn = fetch_one("SHOW COLUMNS FROM answers LIKE 'question_id'");
    if ($questionColumn && strtoupper((string)$questionColumn['Null']) !== 'YES') {
        execute_sql('ALTER TABLE answers MODIFY COLUMN question_id BIGINT UNSIGNED NULL');
    }
    if (!isset($answerColumns['attempt_question_id'])) {
        execute_sql('ALTER TABLE answers ADD COLUMN attempt_question_id BIGINT UNSIGNED NULL AFTER question_id');
    }
    $answerIndexes = diagnostic_indexes('answers');
    if (!isset($answerIndexes['uq_answer_attempt_snapshot'])) {
        execute_sql('ALTER TABLE answers ADD UNIQUE INDEX uq_answer_attempt_snapshot (attempt_id,attempt_question_id)');
    }

    $ready = true;
}

function reset_question_bank_repository_once(int $teacherId): void
{
    $resetKey='20260719-empty-question-repository-v1';
    if (fetch_one('SELECT reset_key FROM question_bank_repository_resets WHERE teacher_id=? AND reset_key=?',[$teacherId,$resetKey])) return;
    Database::transaction(function(PDO $pdo) use($teacherId,$resetKey): void {
        $check=$pdo->prepare('SELECT reset_key FROM question_bank_repository_resets WHERE teacher_id=? AND reset_key=? FOR UPDATE');
        $check->execute([$teacherId,$resetKey]);
        if ($check->fetch()) return;
        $pdo->prepare('DELETE FROM question_bank WHERE teacher_id=?')->execute([$teacherId]);
        $pdo->prepare('INSERT INTO question_bank_repository_resets (teacher_id,reset_key) VALUES (?,?)')->execute([$teacherId,$resetKey]);
    });
}

function diagnostic_bank_filter(array $test, string $alias = 'q'): array
{
    $where = ["{$alias}.teacher_id=?", "{$alias}.review_status='approved'", "{$alias}.is_active=1", "{$alias}.lesson_code IS NOT NULL", "{$alias}.lesson_code<>''"];
    $params = [(int)$test['teacher_id']];
    foreach ([
        'bank_import_batch' => 'import_batch',
        'bank_stage' => 'stage',
        'bank_grade_label' => 'grade_label',
        'bank_term_label' => 'term_label',
    ] as $testField => $bankField) {
        if (!empty($test[$testField])) {
            $where[] = "{$alias}.{$bankField}=?";
            $params[] = $test[$testField];
        }
    }
    $skillIds=json_decode((string)($test['bank_skill_ids_json']??''),true);
    if (is_array($skillIds)) {
        $skillIds=array_values(array_unique(array_filter(array_map('intval',$skillIds),static fn(int $id): bool=>$id>0)));
        if ($skillIds) {
            $where[]=$alias.'.skill_id IN ('.implode(',',array_fill(0,count($skillIds),'?')).')';
            array_push($params,...$skillIds);
        }
    }
    return [implode(' AND ', $where), $params];
}

function diagnostic_approved_lesson_count(array $test): int
{
    [$where, $params] = diagnostic_bank_filter($test);
    return (int)(fetch_one("SELECT COUNT(DISTINCT COALESCE(CONCAT('S:',q.skill_id),CONCAT('L:',q.lesson_code))) AS n FROM question_bank q WHERE {$where}", $params)['n'] ?? 0);
}

function diagnostic_student_ordinal(array $test, int $studentId): int
{
    $classId = (int)($test['class_id'] ?? 0);
    if ($classId < 1 || $studentId < 1) {
        return max(0, $studentId - 1);
    }

    $existing = fetch_one(
        'SELECT ordinal_number FROM student_distribution_ordinals WHERE class_id=? AND student_id=?',
        [$classId, $studentId]
    );
    if ($existing) {
        return (int)$existing['ordinal_number'];
    }

    $assign = static function(PDO $pdo) use ($classId, $studentId): int {
        // Lock the class while assigning ordinals so two students cannot receive the same number.
        $lock = $pdo->prepare('SELECT id FROM classes WHERE id=? FOR UPDATE');
        $lock->execute([$classId]);
        if (!$lock->fetch()) {
            return max(0, $studentId - 1);
        }

        $studentCheck = $pdo->prepare('SELECT id FROM students WHERE id=? AND class_id=? LIMIT 1');
        $studentCheck->execute([$studentId, $classId]);
        if (!$studentCheck->fetch()) {
            return max(0, $studentId - 1);
        }

        $check = $pdo->prepare(
            'SELECT ordinal_number FROM student_distribution_ordinals WHERE class_id=? AND student_id=?'
        );
        $check->execute([$classId, $studentId]);
        $row = $check->fetch();
        if ($row) {
            return (int)$row['ordinal_number'];
        }

        $countStatement = $pdo->prepare(
            'SELECT COUNT(*) AS n FROM student_distribution_ordinals WHERE class_id=?'
        );
        $countStatement->execute([$classId]);
        $assignedCount = (int)($countStatement->fetch()['n'] ?? 0);

        // First use of a class: give every existing student a stable ordinal in ID order.
        if ($assignedCount === 0) {
            $studentsStatement = $pdo->prepare(
                "SELECT id FROM students WHERE class_id=? AND status='active' ORDER BY id"
            );
            $studentsStatement->execute([$classId]);
            $students = $studentsStatement->fetchAll();
            $insert = $pdo->prepare(
                'INSERT IGNORE INTO student_distribution_ordinals (class_id,student_id,ordinal_number) VALUES (?,?,?)'
            );
            foreach ($students as $index => $student) {
                $insert->execute([$classId, (int)$student['id'], $index]);
            }
        } else {
            // Students added later receive the next number without changing earlier students.
            $nextStatement = $pdo->prepare(
                'SELECT COALESCE(MAX(ordinal_number),-1)+1 AS next_ordinal FROM student_distribution_ordinals WHERE class_id=?'
            );
            $nextStatement->execute([$classId]);
            $nextOrdinal = (int)($nextStatement->fetch()['next_ordinal'] ?? 0);
            $insert = $pdo->prepare(
                'INSERT IGNORE INTO student_distribution_ordinals (class_id,student_id,ordinal_number) VALUES (?,?,?)'
            );
            $insert->execute([$classId, $studentId, $nextOrdinal]);
        }

        $check->execute([$classId, $studentId]);
        $created = $check->fetch();
        return $created ? (int)$created['ordinal_number'] : max(0, $studentId - 1);
    };

    $pdo = Database::connection();
    if ($pdo->inTransaction()) {
        return $assign($pdo);
    }
    return Database::transaction($assign);
}

function diagnostic_normalize_text(string $value): string
{
    $value = trim($value);
    $value = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
    $value = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{06D6}-\x{06ED}]/u', '', $value) ?? $value;
    $value = str_replace('ـ', '', $value);
    $value = strtr($value, [
        'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا',
        'ى' => 'ي',
    ]);
    $value = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $value) ?? $value;
    return trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
}

function diagnostic_normalized_question_key(array $question): string
{
    return diagnostic_normalize_text((string)($question['question_text'] ?? ''));
}

function diagnostic_distribution_group_key(array $row): string
{
    if (!empty($row['skill_id'])) {
        return 'S:'.(int)$row['skill_id'];
    }
    $skillName = diagnostic_normalize_text((string)($row['skill_name'] ?? ''));
    if ($skillName !== '') {
        return 'N:'.sha1($skillName);
    }
    $lessonCode = trim((string)($row['lesson_code'] ?? ''));
    if ($lessonCode !== '') {
        return 'L:'.$lessonCode;
    }
    return 'Q:'.(int)($row['bank_question_id'] ?? $row['source_question_id'] ?? 0);
}

function diagnostic_deterministic_order(array $items, string $seed, callable $identity): array
{
    usort($items, static function($a, $b) use ($seed, $identity): int {
        $left = hash('sha256', $seed.'|'.(string)$identity($a));
        $right = hash('sha256', $seed.'|'.(string)$identity($b));
        return $left <=> $right;
    });
    return $items;
}

function diagnostic_rotate(array $items, int $offset): array
{
    $count = count($items);
    if ($count < 2) {
        return array_values($items);
    }
    $offset = (($offset % $count) + $count) % $count;
    return array_values(array_merge(array_slice($items, $offset), array_slice($items, 0, $offset)));
}

function diagnostic_sort_variants(array $variants): array
{
    usort($variants, static function(array $first, array $second): int {
        $firstQuestionOrder = (int)($first['question_order'] ?? 0);
        $secondQuestionOrder = (int)($second['question_order'] ?? 0);
        $firstQuestionOrder = $firstQuestionOrder > 0 ? $firstQuestionOrder : PHP_INT_MAX;
        $secondQuestionOrder = $secondQuestionOrder > 0 ? $secondQuestionOrder : PHP_INT_MAX;
        $firstRepeat = (int)($first['skill_repeat_number'] ?? 0);
        $secondRepeat = (int)($second['skill_repeat_number'] ?? 0);
        $firstOrder = $firstRepeat > 0 ? $firstRepeat : PHP_INT_MAX;
        $secondOrder = $secondRepeat > 0 ? $secondRepeat : PHP_INT_MAX;
        return $firstQuestionOrder <=> $secondQuestionOrder
            ?: $firstOrder <=> $secondOrder
            ?: (int)($first['bank_question_id'] ?? $first['source_question_id'] ?? 0)
                <=> (int)($second['bank_question_id'] ?? $second['source_question_id'] ?? 0);
    });
    return array_values($variants);
}

function diagnostic_previous_assignments(int $testId, int $studentId, int $attemptNo): array
{
    if ($testId < 1 || $studentId < 1 || $attemptNo <= 1) {
        return [];
    }
    $rows = fetch_all(
        "SELECT aq.bank_question_id,aq.source_question_id,aq.skill_id,aq.lesson_code,aq.skill_name
         FROM test_attempt_questions aq
         JOIN test_attempts a ON a.id=aq.attempt_id
         WHERE a.test_id=? AND a.student_id=? AND a.attempt_no<?
           AND a.status IN ('submitted','graded')",
        [$testId, $studentId, $attemptNo]
    );
    $result = [];
    foreach ($rows as $row) {
        $groupKey = diagnostic_distribution_group_key($row);
        $questionId = !empty($row['bank_question_id'])
            ? 'B:'.(int)$row['bank_question_id']
            : 'S:'.(int)($row['source_question_id'] ?? 0);
        $result[$groupKey][$questionId] = true;
    }
    return $result;
}

function diagnostic_choose_variant(array $variants, int $studentOrdinal, int $attemptNo, array $previousQuestionIds = []): array
{
    $count = count($variants);
    if ($count < 1) {
        throw new RuntimeException('لا توجد بدائل صالحة لهذه المهارة.');
    }
    $preferredIndex = ($studentOrdinal + max(0, $attemptNo - 1)) % $count;
    for ($offset = 0; $offset < $count; $offset++) {
        $index = ($preferredIndex + $offset) % $count;
        $question = $variants[$index];
        $questionId = !empty($question['bank_question_id'])
            ? 'B:'.(int)$question['bank_question_id']
            : 'S:'.(int)($question['source_question_id'] ?? 0);
        if (!isset($previousQuestionIds[$questionId])) {
            return ['question' => $question, 'index' => $index];
        }
    }
    return ['question' => $variants[$preferredIndex], 'index' => $preferredIndex];
}

function diagnostic_choose_variants(
    array $variants,
    int $desiredCount,
    int $studentOrdinal,
    int $attemptNo,
    array $previousQuestionIds = []
): array {
    $variantCount = count($variants);
    if ($variantCount < 1) {
        throw new RuntimeException('لا توجد بدائل صالحة لهذه المهارة.');
    }
    $desiredCount = max(1, min($desiredCount, $variantCount));
    $start = ($studentOrdinal + max(0, $attemptNo - 1)) % $variantCount;
    $orderedIndexes = [];
    for ($offset = 0; $offset < $variantCount; $offset++) {
        $orderedIndexes[] = ($start + $offset) % $variantCount;
    }

    $selected = [];
    $selectedIndexes = [];
    foreach ([true, false] as $avoidPrevious) {
        foreach ($orderedIndexes as $index) {
            if (isset($selectedIndexes[$index])) continue;
            $question = $variants[$index];
            $questionId = !empty($question['bank_question_id'])
                ? 'B:'.(int)$question['bank_question_id']
                : 'S:'.(int)($question['source_question_id'] ?? 0);
            if ($avoidPrevious && isset($previousQuestionIds[$questionId])) continue;
            $selected[] = ['question' => $question, 'index' => $index];
            $selectedIndexes[$index] = true;
            if (count($selected) >= $desiredCount) return $selected;
        }
    }
    return $selected;
}

function build_attempt_question_rows(
    array $test,
    int $studentId = 0,
    int $attemptNo = 1,
    ?int $studentOrdinal = null
): array {
    $testId = (int)($test['id'] ?? 0);
    $studentOrdinal ??= diagnostic_student_ordinal($test, $studentId);
    $studentOrdinal = max(0, $studentOrdinal);

    if (($test['question_source'] ?? 'static') === 'lesson_bank') {
        [$where, $params] = diagnostic_bank_filter($test);
        $questions = fetch_all(
            "SELECT q.id AS bank_question_id,NULL AS source_question_id,q.skill_id,q.lesson_code,sk.name AS skill_name,
                    q.skill_repeat_number,q.questions_to_display,q.question_order,q.question_type,q.question_text,q.options_json,q.correct_answer,q.explanation,q.points
             FROM question_bank q LEFT JOIN skills sk ON sk.id=q.skill_id WHERE {$where}
             ORDER BY COALESCE(q.question_order,2147483647),COALESCE(q.skill_repeat_number,65535),q.id",
            $params
        );
        $groups = [];
        foreach ($questions as $question) {
            $groupKey = diagnostic_distribution_group_key($question);
            $groups[$groupKey][] = $question;
        }

        $expected = (int)($test['expected_lesson_count'] ?? 0);
        if ($expected > 0 && count($groups) < $expected) {
            Http::json(['error' => 'لم يكتمل اعتماد بنك الاختبار بعد. المعتمد حاليًا '.count($groups).' من '.$expected.' مهارة.'], 409);
        }
        if (!$groups) {
            Http::json(['error' => 'لا توجد أسئلة معتمدة متاحة لهذا الاختبار.'], 409);
        }

        // Preserve the exact skill order selected by the teacher.
        $selectedSkillIds = json_decode((string)($test['bank_skill_ids_json'] ?? ''), true);
        $selectedSkillIds = is_array($selectedSkillIds)
            ? array_values(array_filter(array_map('intval', $selectedSkillIds), static fn(int $id): bool => $id > 0))
            : [];
        $skillOrder = [];
        foreach ($selectedSkillIds as $index => $skillId) {
            $skillOrder['S:'.$skillId] = $index;
        }
        uksort($groups, static function(string $first, string $second) use ($skillOrder): int {
            $firstOrder = $skillOrder[$first] ?? PHP_INT_MAX;
            $secondOrder = $skillOrder[$second] ?? PHP_INT_MAX;
            return $firstOrder <=> $secondOrder ?: strnatcasecmp($first, $second);
        });

        $previousByGroup = diagnostic_previous_assignments($testId, $studentId, $attemptNo);
        $rows = [];
        foreach ($groups as $groupKey => $alternatives) {
            // Normalize Arabic wording so visually identical Excel rows are not treated as variants.
            $unique = [];
            foreach ($alternatives as $alternative) {
                $key = diagnostic_normalized_question_key($alternative);
                if ($key === '') {
                    $key = 'id:'.(int)($alternative['bank_question_id'] ?? 0);
                }
                if (!isset($unique[$key])) {
                    $unique[$key] = $alternative;
                }
            }
            $variants = diagnostic_sort_variants(array_values($unique));
            if (!$variants) {
                continue;
            }

            // كل مهارة تمثل سؤالًا واحدًا في نموذج الطالبة، مهما كان عدد بدائلها
            // أو قيمة questions_to_display في ملف الاستيراد. توزيع البدائل يعتمد على
            // ترتيب الطالبة، ويتجنب أسئلة محاولاتها السابقة قدر الإمكان.
            $choice = diagnostic_choose_variant(
                $variants,
                $studentOrdinal,
                $attemptNo,
                $previousByGroup[$groupKey] ?? []
            );
            $selected = $choice['question'];
            $selected['distribution_variant'] = (int)$choice['index'] + 1;
            $selected['distribution_variant_count'] = count($variants);
            $selected['distribution_group_key'] = $groupKey;
            $rows[] = $selected;
        }
    } else {
        $rows = fetch_all(
            'SELECT q.id AS source_question_id,q.bank_question_id,q.skill_id,NULL AS lesson_code,sk.name AS skill_name,
                    NULL AS skill_repeat_number,1 AS questions_to_display,q.order_index AS question_order,q.question_type,q.question_text,q.options_json,q.correct_answer,q.explanation,q.points
             FROM test_questions q LEFT JOIN skills sk ON sk.id=q.skill_id WHERE q.test_id=? ORDER BY q.order_index',
            [$testId]
        );
        if (!$rows) {
            Http::json(['error' => 'لا توجد أسئلة في هذا الاختبار.'], 409);
        }
    }

    $baseSeed = DIAGNOSTIC_DISTRIBUTION_VERSION.'|'.$testId.'|'.$attemptNo;
    if (!empty($test['shuffle_questions'])) {
        $rows = diagnostic_deterministic_order($rows, 'questions|'.$baseSeed, static function(array $row): string {
            return diagnostic_distribution_group_key($row).'|'.(string)($row['bank_question_id'] ?? $row['source_question_id'] ?? '');
        });
        $rows = diagnostic_rotate($rows, $studentOrdinal);
    }

    foreach ($rows as &$row) {
        $options = json_options($row['options_json'] ?? null);
        if (($row['question_type'] ?? '') === 'mcq' && $options && count($options) > 1) {
            $questionIdentity = (string)($row['bank_question_id'] ?? $row['source_question_id'] ?? $row['question_text'] ?? '');
            $options = diagnostic_deterministic_order(
                $options,
                'options|'.$baseSeed.'|'.$questionIdentity,
                static fn($option): string => (string)$option
            );
            $options = diagnostic_rotate($options, $studentOrdinal);
        }
        $row['options_json'] = $options ? json_encode($options, JSON_UNESCAPED_UNICODE) : null;
        $row['distribution_ordinal'] = $studentOrdinal;
        $row['distribution_version'] = DIAGNOSTIC_DISTRIBUTION_VERSION;
    }
    unset($row);
    return array_values($rows);
}

function persist_attempt_question_rows(PDO $pdo, int $attemptId, array $rows): float
{
    $insert = $pdo->prepare(
        'INSERT INTO test_attempt_questions (attempt_id,bank_question_id,source_question_id,skill_id,lesson_code,skill_name,skill_repeat_number,distribution_variant,distribution_variant_count,question_type,question_text,options_json,correct_answer,explanation,points,order_index)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $total = 0.0;
    foreach ($rows as $index => $row) {
        $points = (float)$row['points'];
        $total += $points;
        $insert->execute([
            $attemptId,
            $row['bank_question_id'] ?? null,
            $row['source_question_id'] ?? null,
            $row['skill_id'] ?? null,
            $row['lesson_code'] ?? null,
            $row['skill_name'] ?? null,
            $row['skill_repeat_number'] ?? null,
            $row['distribution_variant'] ?? null,
            $row['distribution_variant_count'] ?? null,
            $row['question_type'],
            $row['question_text'],
            $row['options_json'] ?? null,
            $row['correct_answer'],
            $row['explanation'] ?? null,
            $points,
            $index + 1,
        ]);
    }
    $pdo->prepare('UPDATE test_attempts SET total_points=? WHERE id=?')->execute([$total, $attemptId]);
    return $total;
}

function attempt_skill_results(int $attemptId): array
{
    $rows = fetch_all(
        "SELECT aq.skill_id,aq.lesson_code,COALESCE(aq.skill_name,'مهارة غير مسماة') AS skill_name,
                ROUND(COALESCE(SUM(an.points_earned),0),2) AS earned,ROUND(SUM(aq.points),2) AS total,
                ROUND(100*COALESCE(SUM(an.points_earned),0)/NULLIF(SUM(aq.points),0),2) AS percentage,
                MIN(aq.order_index) AS first_order
         FROM test_attempt_questions aq
         LEFT JOIN answers an ON an.attempt_question_id=aq.id AND an.attempt_id=aq.attempt_id
         WHERE aq.attempt_id=?
         GROUP BY aq.skill_id,aq.lesson_code,aq.skill_name ORDER BY first_order",
        [$attemptId]
    );
    return array_map(static fn(array $row): array => [
        'skillId' => $row['skill_id'] === null ? null : (int)$row['skill_id'],
        'lessonCode' => $row['lesson_code'],
        'skillName' => (string)$row['skill_name'],
        'earned' => (float)$row['earned'],
        'total' => (float)$row['total'],
        'percentage' => (float)$row['percentage'],
    ], $rows);
}
