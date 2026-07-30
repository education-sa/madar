<?php
declare(strict_types=1);

/**
 * نظام استبانة أنماط التعلم في مدار.
 * النتيجة إرشادية مرنة وليست تشخيصًا ثابتًا.
 */
function ensure_learning_style_schema(): void
{
    static $ready = false;
    if ($ready) return;

    execute_sql(
        "CREATE TABLE IF NOT EXISTS learning_style_campaigns (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          class_id BIGINT UNSIGNED NOT NULL,
          academic_year VARCHAR(30) NOT NULL DEFAULT '',
          publish_date DATE NOT NULL,
          status ENUM('draft','published') NOT NULL DEFAULT 'draft',
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_learning_campaign_teacher_class_year (teacher_id,class_id,academic_year),
          INDEX idx_learning_campaign_status_date (status,publish_date),
          INDEX idx_learning_campaign_year (academic_year),
          CONSTRAINT fk_learning_campaign_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_learning_campaign_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $campaignColumns = array_fill_keys(
        array_map(static fn(array $column): string => (string)$column['Field'], fetch_all('SHOW COLUMNS FROM learning_style_campaigns')),
        true
    );
    if (!isset($campaignColumns['academic_year'])) {
        execute_sql("ALTER TABLE learning_style_campaigns ADD COLUMN academic_year VARCHAR(30) NOT NULL DEFAULT '' AFTER class_id");
        execute_sql("UPDATE learning_style_campaigns campaign JOIN classes c ON c.id=campaign.class_id SET campaign.academic_year=COALESCE(NULLIF(TRIM(c.academic_year),''),'') WHERE campaign.academic_year=''");
    }
    $campaignIndexes = array_fill_keys(
        array_map(static fn(array $index): string => (string)$index['Key_name'], fetch_all('SHOW INDEX FROM learning_style_campaigns')),
        true
    );
    if (isset($campaignIndexes['uq_learning_campaign_teacher_class'])) {
        execute_sql('ALTER TABLE learning_style_campaigns DROP INDEX uq_learning_campaign_teacher_class');
        unset($campaignIndexes['uq_learning_campaign_teacher_class']);
    }
    if (!isset($campaignIndexes['uq_learning_campaign_teacher_class_year'])) {
        execute_sql('ALTER TABLE learning_style_campaigns ADD UNIQUE INDEX uq_learning_campaign_teacher_class_year (teacher_id,class_id,academic_year)');
    }
    if (!isset($campaignIndexes['idx_learning_campaign_year'])) {
        execute_sql('ALTER TABLE learning_style_campaigns ADD INDEX idx_learning_campaign_year (academic_year)');
    }

    execute_sql(
        "CREATE TABLE IF NOT EXISTS learning_style_assessments (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          student_id BIGINT UNSIGNED NOT NULL,
          campaign_id BIGINT UNSIGNED NULL,
          visual_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          auditory_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          reading_writing_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          kinesthetic_score SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          result_style ENUM('visual','auditory','reading_writing','kinesthetic','mixed') NOT NULL,
          answers_json JSON NOT NULL,
          completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_lsa_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_lsa_campaign FOREIGN KEY (campaign_id) REFERENCES learning_style_campaigns(id) ON DELETE CASCADE,
          INDEX idx_lsa_student_date (student_id,completed_at),
          INDEX idx_lsa_campaign (campaign_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $assessmentColumns = array_fill_keys(
        array_map(static fn(array $column): string => (string)$column['Field'], fetch_all('SHOW COLUMNS FROM learning_style_assessments')),
        true
    );
    if (!isset($assessmentColumns['campaign_id'])) {
        execute_sql('ALTER TABLE learning_style_assessments ADD COLUMN campaign_id BIGINT UNSIGNED NULL AFTER student_id');
    }
    $assessmentIndexes = array_fill_keys(
        array_map(static fn(array $index): string => (string)$index['Key_name'], fetch_all('SHOW INDEX FROM learning_style_assessments')),
        true
    );
    if (!isset($assessmentIndexes['idx_lsa_campaign'])) {
        execute_sql('ALTER TABLE learning_style_assessments ADD INDEX idx_lsa_campaign (campaign_id)');
    }
    $campaignForeignKey = fetch_one(
        "SELECT 1 AS ok FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND table_name='learning_style_assessments' AND constraint_name='fk_lsa_campaign' LIMIT 1"
    );
    if (!$campaignForeignKey) {
        execute_sql('ALTER TABLE learning_style_assessments ADD CONSTRAINT fk_lsa_campaign FOREIGN KEY (campaign_id) REFERENCES learning_style_campaigns(id) ON DELETE CASCADE');
    }
    $ready = true;
}

function learning_style_meta(): array
{
    return [
        'visual' => [
            'label' => 'بصري',
            'tip' => 'استخدمي الخرائط الذهنية، الألوان، الرسوم والمخططات التي توضّح خطوات الحل.',
        ],
        'auditory' => [
            'label' => 'سمعي',
            'tip' => 'اعتمدي الشرح الشفهي، الحوار، التفكير بصوت مرتفع والتسجيلات الصوتية القصيرة.',
        ],
        'reading_writing' => [
            'label' => 'قرائي/كتابي',
            'tip' => 'وفّري ملخصات مكتوبة، قوائم مرتبة، بطاقات مفاهيم ومهام تدوين قصيرة.',
        ],
        'kinesthetic' => [
            'label' => 'حركي/تطبيقي',
            'tip' => 'أضيفي النماذج والمحسوسات والأنشطة العملية والتطبيق على مواقف واقعية.',
        ],
        'mixed' => [
            'label' => 'مختلط',
            'tip' => 'نوّعي بين العرض المرئي والنقاش والكتابة والتطبيق؛ لأن التفضيلات متوازنة.',
        ],
        'unknown' => [
            'label' => 'غير محدد',
            'tip' => 'اطلبي من الطالبة إكمال الاستبانة الإرشادية.',
        ],
    ];
}

function learning_style_questions(): array
{
    return [
        [
            'id' => 1,
            'prompt' => 'عندما أتعلم درسًا جديدًا، أفضل أن…',
            'context' => 'اختاري الطريقة الأقرب لكِ.',
            'options' => [
                ['text' => 'أشاهد رسمًا أو مخطّطًا يوضّح الفكرة', 'style' => 'visual'],
                ['text' => 'أستمع إلى شرح المعلمة وأناقشه', 'style' => 'auditory'],
                ['text' => 'أقرأ التعليمات وأكتب ملخصًا', 'style' => 'reading_writing'],
                ['text' => 'أجرّب الفكرة بنفسي خطوة بخطوة', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 2,
            'prompt' => 'إذا أردت تذكّر معلومة مهمة، فإنني…',
            'context' => 'فكّري فيما تفعلينه عادةً قبل الاختبار.',
            'options' => [
                ['text' => 'أتخيّل شكل الصفحة أو لون المعلومة', 'style' => 'visual'],
                ['text' => 'أكرّرها بصوت مرتفع', 'style' => 'auditory'],
                ['text' => 'أكتبها أكثر من مرة', 'style' => 'reading_writing'],
                ['text' => 'أربطها بحركة أو تجربة قمت بها', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 3,
            'prompt' => 'في العمل الجماعي، أستمتع أكثر عندما…',
            'context' => 'لا توجد إجابة صحيحة أو خاطئة.',
            'options' => [
                ['text' => 'أصمّم العرض وأرتّب الصور', 'style' => 'visual'],
                ['text' => 'أشرح الأفكار وأقود النقاش', 'style' => 'auditory'],
                ['text' => 'أكتب الخطة وأراجع النص', 'style' => 'reading_writing'],
                ['text' => 'أصنع النموذج أو أنفّذ النشاط', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 4,
            'prompt' => 'عند استخدام جهاز جديد، أفضل أن…',
            'context' => 'تخيّلي أنكِ تستخدمينه لأول مرة.',
            'options' => [
                ['text' => 'أشاهد فيديو يوضّح طريقة الاستخدام', 'style' => 'visual'],
                ['text' => 'أطلب من شخص أن يشرح لي', 'style' => 'auditory'],
                ['text' => 'أقرأ دليل الاستخدام', 'style' => 'reading_writing'],
                ['text' => 'أبدأ بتجربته وأتعلّم من المحاولة', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 5,
            'prompt' => 'عندما أضيع في مكان جديد، فإنني…',
            'context' => 'اختاري أول تصرف يخطر في بالك.',
            'options' => [
                ['text' => 'أنظر إلى الخريطة أو المعالم', 'style' => 'visual'],
                ['text' => 'أسأل شخصًا عن الاتجاهات', 'style' => 'auditory'],
                ['text' => 'أقرأ أسماء الطرق والتعليمات', 'style' => 'reading_writing'],
                ['text' => 'أتحرّك وأجرّب أكثر من طريق', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 6,
            'prompt' => 'أكثر واجب يساعدني على الفهم هو…',
            'context' => 'اختاري نوع المهمة التي تجعلكِ أكثر تركيزًا.',
            'options' => [
                ['text' => 'تحويل الدرس إلى خريطة مفاهيم', 'style' => 'visual'],
                ['text' => 'تسجيل شرح صوتي قصير', 'style' => 'auditory'],
                ['text' => 'كتابة تقرير أو إجابة مفصّلة', 'style' => 'reading_writing'],
                ['text' => 'تنفيذ تجربة أو مشروع مصغّر', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 7,
            'prompt' => 'أثناء شرح طويل في الصف، يساعدني أن…',
            'context' => 'ما الذي يعيد انتباهكِ للدرس؟',
            'options' => [
                ['text' => 'أرى صورًا وكلمات مفتاحية على الشاشة', 'style' => 'visual'],
                ['text' => 'أشارك بالسؤال والإجابة', 'style' => 'auditory'],
                ['text' => 'أدوّن النقاط المهمة', 'style' => 'reading_writing'],
                ['text' => 'أستخدم أدوات أو أتحرّك ضمن نشاط', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 8,
            'prompt' => 'عند حل مسألة صعبة، أبدأ بـ…',
            'context' => 'اختاري البداية الطبيعية بالنسبة لكِ.',
            'options' => [
                ['text' => 'رسم المسألة وتلوين عناصرها', 'style' => 'visual'],
                ['text' => 'شرحها لنفسي أو لزميلة', 'style' => 'auditory'],
                ['text' => 'كتابة المعطيات والقواعد', 'style' => 'reading_writing'],
                ['text' => 'استخدام أدوات أو أمثلة واقعية', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 9,
            'prompt' => 'في وقت المراجعة، أفضل…',
            'context' => 'يمكن أن تحبي أكثر من طريقة؛ اختاري الأكثر استخدامًا.',
            'options' => [
                ['text' => 'البطاقات المصوّرة والجداول الملوّنة', 'style' => 'visual'],
                ['text' => 'المراجعة مع زميلة بصوت مسموع', 'style' => 'auditory'],
                ['text' => 'قراءة الملخصات وحل الأسئلة كتابةً', 'style' => 'reading_writing'],
                ['text' => 'تمثيل الفكرة أو تطبيقها عمليًا', 'style' => 'kinesthetic'],
            ],
        ],
        [
            'id' => 10,
            'prompt' => 'أشعر أن الدرس كان ممتعًا عندما…',
            'context' => 'فكّري في آخر درس بقي في ذاكرتكِ.',
            'options' => [
                ['text' => 'كان العرض واضحًا وغنيًا بالصور', 'style' => 'visual'],
                ['text' => 'تضمّن قصصًا ونقاشًا ممتعًا', 'style' => 'auditory'],
                ['text' => 'خرجت منه بملاحظات مرتّبة', 'style' => 'reading_writing'],
                ['text' => 'شاركت في نشاط وتجربة', 'style' => 'kinesthetic'],
            ],
        ],
    ];
}

function learning_style_dominant_result(array $scores): string
{
    $normalized = [
        'visual' => max(0, (int)($scores['visual'] ?? 0)),
        'auditory' => max(0, (int)($scores['auditory'] ?? 0)),
        'reading_writing' => max(0, (int)($scores['reading_writing'] ?? 0)),
        'kinesthetic' => max(0, (int)($scores['kinesthetic'] ?? 0)),
    ];
    arsort($normalized);
    $keys = array_keys($normalized);
    $values = array_values($normalized);
    return ($values[0] ?? 0) === ($values[1] ?? -1) ? 'mixed' : (string)($keys[0] ?? 'mixed');
}

function learning_style_result_payload(array $row): array
{
    $scores = [
        'visual' => (int)($row['visual_score'] ?? 0),
        'auditory' => (int)($row['auditory_score'] ?? 0),
        'reading_writing' => (int)($row['reading_writing_score'] ?? 0),
        'kinesthetic' => (int)($row['kinesthetic_score'] ?? 0),
    ];
    $total = max(1, array_sum($scores));
    $percentages = [];
    foreach ($scores as $key => $score) {
        $percentages[$key] = round(($score / $total) * 100, 1);
    }
    return [
        'resultStyle' => (string)($row['result_style'] ?? 'unknown'),
        'scores' => $scores,
        'percentages' => $percentages,
        'completedAt' => $row['completed_at'] ?? null,
    ];
}

function teacher_learning_style_routes(string $method, array $segments, int $teacherId): never
{
    ensure_learning_style_schema();
    $resource = $segments[0] ?? '';

    if ($resource === '' && $method === 'GET') {
        $classes = fetch_all(
            'SELECT id,name,stage,grade_label,academic_year FROM classes WHERE teacher_id=? ORDER BY stage,grade_label,name',
            [$teacherId]
        );
        $campaigns = fetch_all(
            'SELECT id,class_id,academic_year,publish_date,status,updated_at FROM learning_style_campaigns WHERE teacher_id=? ORDER BY updated_at DESC',
            [$teacherId]
        );
        Http::json([
            'questions' => learning_style_questions(),
            'classes' => $classes,
            'campaigns' => $campaigns,
            'styles' => learning_style_meta(),
            'notice' => 'أنماط التعلم مؤشرات إرشادية مرنة وليست تشخيصًا ثابتًا.',
        ]);
    }

    if ($resource === 'campaign' && $method === 'POST') {
        $data = Http::input();
        $classId = (int)($data['classId'] ?? 0);
        $status = (string)($data['status'] ?? 'draft');
        $publishDate = trim((string)($data['publishDate'] ?? ''));
        if (!$classId || !teacher_owns_class($teacherId, $classId)) {
            Http::json(['error' => 'الفصل المحدد غير موجود.'], 404);
        }
        if (!in_array($status, ['draft','published'], true)) {
            Http::json(['error' => 'حالة الاستبانة غير صالحة.'], 422);
        }
        $date = DateTimeImmutable::createFromFormat('Y-m-d', $publishDate);
        if (!$date || $date->format('Y-m-d') !== $publishDate) {
            Http::json(['error' => 'تاريخ الإرسال غير صالح.'], 422);
        }
        $class = fetch_one('SELECT academic_year FROM classes WHERE id=? AND teacher_id=? LIMIT 1', [$classId,$teacherId]);
        $academicYear = trim((string)($class['academic_year'] ?? ''));
        execute_sql(
            'INSERT INTO learning_style_campaigns (teacher_id,class_id,academic_year,publish_date,status) VALUES (?,?,?,?,?)
             ON DUPLICATE KEY UPDATE publish_date=VALUES(publish_date),status=VALUES(status),updated_at=NOW()',
            [$teacherId,$classId,$academicYear,$publishDate,$status]
        );
        $campaign = fetch_one('SELECT id,class_id,academic_year,publish_date,status,updated_at FROM learning_style_campaigns WHERE teacher_id=? AND class_id=? AND academic_year=?', [$teacherId,$classId,$academicYear]);
        Activity::log('teacher', $teacherId, $status === 'published' ? 'نشر استبانة أنماط التعلم' : 'حفظ استبانة أنماط التعلم كمسودة', 'الفصل رقم '.$classId.'، تاريخ الإرسال '.$publishDate);
        Http::json(['campaign' => $campaign, 'message' => $status === 'published' ? 'تم نشر الاستبانة للطالبات.' : 'تم حفظ الاستبانة كمسودة.']);
    }

    if ($resource === 'results' && $method === 'GET') {
        $classId = max(0, (int)($_GET['classId'] ?? 0));
        $stage = trim((string)($_GET['stage'] ?? ''));
        $search = trim((string)($_GET['search'] ?? ''));
        $where = ['c.teacher_id=?', 's.deleted_at IS NULL'];
        $params = [$teacherId];
        if ($classId > 0) {
            if (!teacher_owns_class($teacherId, $classId)) Http::json(['error' => 'الفصل غير موجود.'], 404);
            $where[] = 'c.id=?';
            $params[] = $classId;
        }
        if ($stage !== '') {
            $where[] = 'c.stage=?';
            $params[] = $stage;
        }
        if ($search !== '') {
            $where[] = '(s.name LIKE ? OR s.email LIKE ?)';
            $like = '%'.$search.'%';
            $params[] = $like;
            $params[] = $like;
        }
        $rows = fetch_all(
            "SELECT s.id AS student_id,s.name AS student_name,s.email,s.stage,s.grade_label,c.id AS class_id,c.name AS class_name,
                    a.id AS assessment_id,a.visual_score,a.auditory_score,a.reading_writing_score,a.kinesthetic_score,a.result_style,a.completed_at
             FROM students s
             JOIN classes c ON c.id=s.class_id
             LEFT JOIN learning_style_assessments a ON a.id=(
                 SELECT la.id
                 FROM learning_style_assessments la
                 JOIN learning_style_campaigns lc ON lc.id=la.campaign_id
                 WHERE la.student_id=s.id AND lc.teacher_id=c.teacher_id AND lc.class_id=c.id AND lc.academic_year=c.academic_year
                 ORDER BY la.completed_at DESC,la.id DESC LIMIT 1
             )
             WHERE ".implode(' AND ', $where)." ORDER BY c.name,s.name",
            $params
        );
        $meta = learning_style_meta();
        $counts = ['visual'=>0,'auditory'=>0,'reading_writing'=>0,'kinesthetic'=>0,'mixed'=>0,'unknown'=>0];
        $results = [];
        $completed = 0;
        foreach ($rows as $row) {
            $style = $row['assessment_id'] ? (string)$row['result_style'] : 'unknown';
            if (!isset($counts[$style])) $style = 'unknown';
            $counts[$style]++;
            if ($row['assessment_id']) {
                $completed++;
                $payload = learning_style_result_payload($row);
                $results[] = [
                    'studentId' => (int)$row['student_id'],
                    'studentName' => $row['student_name'],
                    'email' => $row['email'],
                    'stage' => $row['stage'],
                    'gradeLabel' => $row['grade_label'],
                    'classId' => (int)$row['class_id'],
                    'className' => $row['class_name'],
                    ...$payload,
                ];
            }
        }
        $targetCount = count($rows);
        $common = 'unknown';
        $best = 0;
        foreach (['visual','auditory','reading_writing','kinesthetic','mixed'] as $style) {
            if ($counts[$style] > $best) { $best = $counts[$style]; $common = $style; }
        }
        Http::json([
            'targetCount' => $targetCount,
            'completedCount' => $completed,
            'completionPercent' => $targetCount ? round(($completed / $targetCount) * 100, 1) : 0,
            'mostCommonStyle' => $common,
            'counts' => $counts,
            'results' => $results,
            'styles' => $meta,
            'notice' => 'النتائج إرشادية، وتساعد المعلمة على تنويع الشرح دون تصنيف الطالبة تصنيفًا ثابتًا.',
        ]);
    }

    Http::json(['error' => 'المسار المطلوب غير موجود.'], 404);
}

function student_learning_style_campaign(int $studentId): ?array
{
    return fetch_one(
        "SELECT campaign.id,campaign.class_id,campaign.academic_year,campaign.publish_date,campaign.status
         FROM learning_style_campaigns campaign
         JOIN students s ON s.class_id=campaign.class_id
         JOIN classes c ON c.id=s.class_id
         WHERE s.id=? AND campaign.academic_year=c.academic_year AND campaign.status='published' AND campaign.publish_date<=CURDATE()
         ORDER BY campaign.updated_at DESC LIMIT 1",
        [$studentId]
    );
}

function student_learning_style_latest(int $studentId, ?int $campaignId = null): ?array
{
    if ($campaignId !== null && $campaignId > 0) {
        return fetch_one(
            'SELECT visual_score,auditory_score,reading_writing_score,kinesthetic_score,result_style,completed_at FROM learning_style_assessments WHERE student_id=? AND campaign_id=? ORDER BY completed_at DESC,id DESC LIMIT 1',
            [$studentId,$campaignId]
        );
    }
    return fetch_one(
        'SELECT visual_score,auditory_score,reading_writing_score,kinesthetic_score,result_style,completed_at FROM learning_style_assessments WHERE student_id=? ORDER BY completed_at DESC,id DESC LIMIT 1',
        [$studentId]
    );
}

function student_learning_style_routes(string $method, array $segments, int $studentId): never
{
    ensure_learning_style_schema();
    $resource = $segments[0] ?? '';
    $campaign = student_learning_style_campaign($studentId);
    $latest = student_learning_style_latest($studentId, $campaign ? (int)$campaign['id'] : null);

    if ($resource === 'questions' && $method === 'GET') {
        Http::json([
            'available' => $campaign !== null,
            'campaign' => $campaign,
            'questions' => $campaign ? learning_style_questions() : [],
            'styles' => learning_style_meta(),
            'latestResult' => $latest ? learning_style_result_payload($latest) : null,
            'notice' => $campaign
                ? 'لا توجد إجابة صحيحة أو خاطئة؛ اختاري ما يعبّر عنكِ غالبًا. النتيجة إرشادية ويمكن أن تتغير مع الوقت.'
                : 'لم تنشر معلمتكِ استبانة أنماط التعلم لفصلكِ حتى الآن.',
        ]);
    }

    if ($resource === 'submit' && $method === 'POST') {
        if (!$campaign) Http::json(['error' => 'الاستبانة غير متاحة لفصلكِ حاليًا.'], 403);
        $data = Http::input();
        $answers = is_array($data['answers'] ?? null) ? $data['answers'] : [];
        $questions = learning_style_questions();
        $validIds = array_fill_keys(array_map(static fn(array $question): int => (int)$question['id'], $questions), true);
        $styles = ['visual'=>0,'auditory'=>0,'reading_writing'=>0,'kinesthetic'=>0];
        $seen = [];
        $normalized = [];
        foreach ($answers as $answer) {
            $id = (int)($answer['id'] ?? 0);
            $style = (string)($answer['style'] ?? '');
            if (!isset($validIds[$id]) || isset($seen[$id]) || !array_key_exists($style, $styles)) {
                Http::json(['error' => 'إجابات الاستبانة غير مكتملة أو غير صالحة.'], 422);
            }
            $seen[$id] = true;
            $styles[$style]++;
            $normalized[] = ['id'=>$id,'style'=>$style];
        }
        if (count($seen) !== count($questions)) Http::json(['error' => 'أكملي جميع أسئلة الاستبانة.'], 422);

        $result = learning_style_dominant_result($styles);
        Database::transaction(function(PDO $pdo) use ($studentId,$campaign,$styles,$result,$normalized): void {
            $pdo->prepare('INSERT INTO learning_style_assessments (student_id,campaign_id,visual_score,auditory_score,reading_writing_score,kinesthetic_score,result_style,answers_json) VALUES (?,?,?,?,?,?,?,?)')
                ->execute([$studentId,(int)$campaign['id'],$styles['visual'],$styles['auditory'],$styles['reading_writing'],$styles['kinesthetic'],$result,json_encode($normalized,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
            $pdo->prepare('UPDATE students SET learning_style=?,last_active=NOW() WHERE id=?')->execute([$result,$studentId]);
        });
        Activity::log('student', $studentId, 'إكمال استبانة أنماط التعلم', 'النمط الإرشادي: '.(learning_style_meta()[$result]['label'] ?? $result));
        $row = [
            'visual_score'=>$styles['visual'],
            'auditory_score'=>$styles['auditory'],
            'reading_writing_score'=>$styles['reading_writing'],
            'kinesthetic_score'=>$styles['kinesthetic'],
            'result_style'=>$result,
            'completed_at'=>date('Y-m-d H:i:s'),
        ];
        Http::json([
            ...learning_style_result_payload($row),
            'notice' => 'النتيجة إرشادية ويمكن أن تتغير مع الوقت.',
        ], 201);
    }

    Http::json(['error' => 'المسار المطلوب غير موجود.'], 404);
}
