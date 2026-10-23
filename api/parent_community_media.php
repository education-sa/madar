<?php
declare(strict_types=1);

const PARENT_COMMUNITY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PARENT_COMMUNITY_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

function ensure_parent_community_media_schema(): void
{
    static $ready = false;
    if ($ready) return;
    $pdo = Database::connection();
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS parent_community_media_posts (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          parent_id BIGINT UNSIGNED NOT NULL,
          student_id BIGINT UNSIGNED NOT NULL,
          teacher_id BIGINT UNSIGNED NOT NULL,
          class_id BIGINT UNSIGNED NOT NULL,
          title VARCHAR(190) NOT NULL,
          description TEXT NULL,
          media_kind ENUM('image','video') NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          stored_name VARCHAR(120) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          size_bytes BIGINT UNSIGNED NOT NULL,
          sha256 CHAR(64) NOT NULL,
          status ENUM('pending','published','rejected','archived') NOT NULL DEFAULT 'pending',
          reviewed_by_teacher BIGINT UNSIGNED NULL,
          reviewed_at DATETIME NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_parent_community_stored (stored_name),
          INDEX idx_parent_community_media_parent (parent_id,class_id,created_at),
          INDEX idx_parent_community_media_teacher (teacher_id,status,created_at),
          INDEX idx_parent_community_media_class (class_id,status,created_at),
          CONSTRAINT fk_pcm_parent FOREIGN KEY (parent_id) REFERENCES platform_users(id) ON DELETE CASCADE,
          CONSTRAINT fk_pcm_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_pcm_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT fk_pcm_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          CONSTRAINT fk_pcm_reviewer FOREIGN KEY (reviewed_by_teacher) REFERENCES teachers(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS parent_community_media_upload_attempts (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          parent_id BIGINT UNSIGNED NOT NULL,
          attempted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX idx_pcm_upload_attempt_parent_time (parent_id,attempted_at),
          CONSTRAINT fk_pcm_upload_attempt_parent FOREIGN KEY (parent_id) REFERENCES platform_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready = true;
}

function parent_community_media_directory(): string
{
    $directory = MADAR_ROOT . '/storage/private/parent-community';
    if (is_link($directory)) Http::json(['error'=>'مسار تخزين مشاركات المجتمع غير آمن.'],500);
    if (!is_dir($directory) && !mkdir($directory,0750,true) && !is_dir($directory)) {
        Http::json(['error'=>'تعذّر تجهيز تخزين مشاركات مجمع مدار.'],500);
    }
    @chmod($directory,0750);
    return $directory;
}

function parent_community_media_path(string $storedName): ?string
{
    if (!preg_match('/^[a-f0-9]{48}\.(jpg|png|webp|mp4|webm|mov|m4v|3gp|3g2|mpg)$/', $storedName)) return null;
    $directory = MADAR_ROOT . '/storage/private/parent-community';
    if (!is_dir($directory) || is_link($directory)) return null;
    $path = $directory . '/' . $storedName;
    return is_file($path) && !is_link($path) ? $path : null;
}

function parent_community_safe_original_name(string $name, string $extension): string
{
    $name = basename(str_replace('\\','/',$name));
    $name = trim(preg_replace('/[\x00-\x1F\x7F]/u','',$name) ?? '');
    if ($name === '') $name = 'madar-media.' . $extension;
    return mb_substr($name,0,255);
}

function parent_community_validate_upload(?array $upload): array
{
    if (!is_array($upload)) Http::json(['error'=>'اختاري صورة أو فيديو للمشاركة.'],422);
    $error = (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        $message = match ($error) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'حجم الملف أكبر من الحد المسموح في الخادم.',
            UPLOAD_ERR_PARTIAL => 'لم يكتمل رفع الملف. حاولي مرة أخرى.',
            UPLOAD_ERR_NO_FILE => 'اختاري صورة أو فيديو للمشاركة.',
            default => 'تعذّر استقبال الملف المرفوع.',
        };
        Http::json(['error'=>$message],422);
    }
    $temporary = (string)($upload['tmp_name'] ?? '');
    if ($temporary === '' || !is_uploaded_file($temporary)) Http::json(['error'=>'ملف الرفع غير صالح.'],422);
    if (!class_exists('finfo')) Http::json(['error'=>'الخادم يحتاج إضافة Fileinfo للتحقق من الملفات.'],500);
    $mime = (string)((new finfo(FILEINFO_MIME_TYPE))->file($temporary) ?: '');
    $types = [
        'image/jpeg'=>['kind'=>'image','extension'=>'jpg','max'=>PARENT_COMMUNITY_IMAGE_MAX_BYTES],
        'image/png'=>['kind'=>'image','extension'=>'png','max'=>PARENT_COMMUNITY_IMAGE_MAX_BYTES],
        'image/webp'=>['kind'=>'image','extension'=>'webp','max'=>PARENT_COMMUNITY_IMAGE_MAX_BYTES],
        'video/mp4'=>['kind'=>'video','extension'=>'mp4','max'=>PARENT_COMMUNITY_VIDEO_MAX_BYTES],
        'application/mp4'=>['kind'=>'video','extension'=>'mp4','max'=>PARENT_COMMUNITY_VIDEO_MAX_BYTES],
        'video/webm'=>['kind'=>'video','extension'=>'webm','max'=>PARENT_COMMUNITY_VIDEO_MAX_BYTES],
        'video/quicktime'=>['kind'=>'video','extension'=>'mov','max'=>PARENT_COMMUNITY_VIDEO_MAX_BYTES],
        'video/x-m4v'=>['kind'=>'video','extension'=>'m4v','max'=>PARENT_COMMUNITY_VIDEO_MAX_BYTES],
        'video/3gpp'=>['kind'=>'video','extension'=>'3gp','max'=>PARENT_COMMUNITY_VIDEO_MAX_BYTES],
        'video/3gpp2'=>['kind'=>'video','extension'=>'3g2','max'=>PARENT_COMMUNITY_VIDEO_MAX_BYTES],
        'video/mpeg'=>['kind'=>'video','extension'=>'mpg','max'=>PARENT_COMMUNITY_VIDEO_MAX_BYTES],
    ];
    if (!isset($types[$mime])) Http::json(['error'=>'الصيغ المسموحة للصور: JPEG وPNG وWebP، وللفيديو: MP4 وMOV وM4V وWebM و3GP و3G2 وMPEG.'],422);
    $size = (int)($upload['size'] ?? 0);
    if ($size < 1) $size = (int)(filesize($temporary) ?: 0);
    if ($size < 1 || $size > $types[$mime]['max']) {
        Http::json(['error'=>$types[$mime]['kind']==='image'?'حجم الصورة يجب ألا يتجاوز 10 ميجابايت.':'حجم الفيديو يجب ألا يتجاوز 100 ميجابايت.'],422);
    }
    if ($types[$mime]['kind'] === 'image') {
        $image = @getimagesize($temporary);
        if ($image === false || (string)($image['mime'] ?? '') !== $mime) Http::json(['error'=>'ملف الصورة غير صالح.'],422);
        $width = (int)($image[0] ?? 0);
        $height = (int)($image[1] ?? 0);
        if ($width < 1 || $height < 1 || $width > 12000 || $height > 12000 || $width * $height > 60000000) {
            Http::json(['error'=>'أبعاد الصورة كبيرة جدًا أو غير صالحة.'],422);
        }
    }
    $extension = (string)$types[$mime]['extension'];
    $sha256 = hash_file('sha256',$temporary);
    if (!is_string($sha256) || !preg_match('/^[a-f0-9]{64}$/',$sha256)) Http::json(['error'=>'تعذّر التحقق من سلامة الملف المرفوع.'],500);
    return [
        'temporary'=>$temporary,
        'mime'=>$mime,
        'kind'=>(string)$types[$mime]['kind'],
        'extension'=>$extension,
        'size'=>$size,
        'original'=>parent_community_safe_original_name((string)($upload['name'] ?? ''),$extension),
        'sha256'=>$sha256,
    ];
}

function parent_community_media_json(array $row, string $scope): array
{
    $id = (int)$row['id'];
    return [
        'id'=>$id,
        'source'=>'parent',
        'title'=>(string)$row['title'],
        'description'=>(string)($row['description'] ?? ''),
        'mediaKind'=>(string)$row['media_kind'],
        'originalName'=>(string)$row['original_name'],
        'sizeBytes'=>(int)$row['size_bytes'],
        'status'=>(string)$row['status'],
        'senderName'=>(string)($row['sender_name'] ?? 'ولي أمر'),
        'className'=>(string)($row['class_name'] ?? ''),
        'studentName'=>(string)($row['student_name'] ?? ''),
        'createdAt'=>$row['created_at'],
        'reviewedAt'=>$row['reviewed_at'] ?? null,
        'mediaUrl'=>$scope === 'teacher'
            ? '/api/teacher/parent-community/media/' . $id
            : '/api/parent/community/media/' . $id,
    ];
}

function parent_community_reserve_upload_attempt(int $parentId): int
{
    try {
        return Database::transaction(function(PDO $pdo) use($parentId): int {
            // قفل صف ولي الأمر ثابت لكل الحساب، فيتسلسل الفحص والحجز حتى مع الطلبات المتزامنة.
            $lock = $pdo->prepare("SELECT id FROM platform_users WHERE id=? AND role_code='PARENT' AND status='active' AND deleted_at IS NULL FOR UPDATE");
            $lock->execute([$parentId]);
            if (!$lock->fetchColumn()) throw new DomainException('parent_not_active');
            $quota = $pdo->prepare(
                "SELECT SUM(attempted_at>=DATE_SUB(NOW(6),INTERVAL 1 HOUR)) AS hourly,COUNT(*) AS daily
                 FROM parent_community_media_upload_attempts
                 WHERE parent_id=? AND attempted_at>=DATE_SUB(NOW(6),INTERVAL 1 DAY)"
            );
            $quota->execute([$parentId]);
            $limits = $quota->fetch() ?: [];
            if ((int)($limits['hourly'] ?? 0) >= 5 || (int)($limits['daily'] ?? 0) >= 20) {
                throw new DomainException('upload_quota_reached');
            }
            $pdo->prepare('INSERT INTO parent_community_media_upload_attempts(parent_id) VALUES(?)')->execute([$parentId]);
            return (int)$pdo->lastInsertId();
        });
    } catch (DomainException $error) {
        if ($error->getMessage() === 'upload_quota_reached') {
            Http::json(['error'=>'وصلتِ إلى حد الرفع المؤقت. حاولي لاحقًا (5 في الساعة و20 في اليوم).'],429);
        }
        Http::json(['error'=>'حساب ولي الأمر غير نشط.'],403);
    }
}

function parent_community_media_parent_create(int $parentId): never
{
    Auth::requirePermission('parent.community.post',false);
    ensure_parent_community_media_schema();
    $studentId = filter_var($_POST['studentId'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if (!$studentId) Http::json(['error'=>'اختاري الابنة المرتبطة بالمشاركة.'],422);
    $student = parent_portal_linked_student($parentId,(int)$studentId);
    if (!$student || !(int)($student['teacher_id'] ?? 0) || !(int)($student['class_id'] ?? 0)) {
        Http::json(['error'=>'الطالبة غير مرتبطة بحسابك أو بفصل نشط.'],403);
    }
    $title = trim((string)($_POST['title'] ?? ''));
    $description = trim((string)($_POST['description'] ?? ''));
    if ($title === '' || mb_strlen($title) > 190) Http::json(['error'=>'اكتبي عنوانًا لا يتجاوز 190 حرفًا.'],422);
    if (mb_strlen($description) > 2000) Http::json(['error'=>'الوصف الاختياري يجب ألا يتجاوز 2000 حرف.'],422);
    parent_community_reserve_upload_attempt($parentId);
    $file = parent_community_validate_upload($_FILES['media'] ?? null);
    $storedName = bin2hex(random_bytes(24)) . '.' . $file['extension'];
    $path = parent_community_media_directory() . '/' . $storedName;
    if (!move_uploaded_file($file['temporary'],$path)) Http::json(['error'=>'تعذّر حفظ الملف في التخزين الخاص.'],500);
    @chmod($path,0640);
    try {
        execute_sql(
            "INSERT INTO parent_community_media_posts(parent_id,student_id,teacher_id,class_id,title,description,media_kind,original_name,stored_name,mime_type,size_bytes,sha256)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            [$parentId,(int)$studentId,(int)$student['teacher_id'],(int)$student['class_id'],$title,$description?:null,$file['kind'],$file['original'],$storedName,$file['mime'],$file['size'],$file['sha256']]
        );
    } catch (Throwable $error) {
        @unlink($path);
        throw $error;
    }
    $id = (int)Database::connection()->lastInsertId();
    Activity::log('parent',$parentId,'إنشاء مشاركة في مجمع مدار','المشاركة رقم '.$id.' · بانتظار الاعتماد');
    Http::json(['ok'=>true,'id'=>$id,'status'=>'pending','message'=>'تم إرسال المشاركة وهي الآن بانتظار اعتماد المعلمة.'],201);
}

function parent_community_media_parent_feed(int $parentId): never
{
    Auth::requirePermission('parent.community.view',false);
    ensure_parent_community_media_schema();
    $studentId = filter_var($_GET['studentId'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if (!$studentId) Http::json(['error'=>'اختاري الابنة لعرض مجمع فصلها.'],422);
    $student = parent_portal_linked_student($parentId,(int)$studentId);
    if (!$student || !(int)($student['teacher_id'] ?? 0) || !(int)($student['class_id'] ?? 0)) Http::json(['error'=>'الطالبة غير مرتبطة بحسابك.'],403);
    $teacherId = (int)$student['teacher_id'];
    $classId = (int)$student['class_id'];
    $teacherPosts = fetch_all(
        "SELECT p.id,p.title,p.body,p.created_at,p.class_id,c.name AS class_name,t.name AS teacher_name
         FROM parent_community_posts p JOIN teachers t ON t.id=p.teacher_id LEFT JOIN classes c ON c.id=p.class_id
         WHERE p.teacher_id=? AND p.status='published' AND (p.class_id IS NULL OR p.class_id=?) ORDER BY p.created_at DESC LIMIT 150",
        [$teacherId,$classId]
    );
    $community = fetch_all(
        "SELECT m.*,u.name AS sender_name,c.name AS class_name,s.name AS student_name
         FROM parent_community_media_posts m JOIN platform_users u ON u.id=m.parent_id JOIN classes c ON c.id=m.class_id JOIN students s ON s.id=m.student_id
         WHERE m.class_id=? AND m.teacher_id=? AND m.status='published' ORDER BY m.created_at DESC LIMIT 200",
        [$classId,$teacherId]
    );
    $mine = fetch_all(
        "SELECT m.*,u.name AS sender_name,c.name AS class_name,s.name AS student_name
         FROM parent_community_media_posts m JOIN platform_users u ON u.id=m.parent_id JOIN classes c ON c.id=m.class_id JOIN students s ON s.id=m.student_id
         WHERE m.parent_id=? AND m.class_id=? AND m.status<>'archived' ORDER BY m.created_at DESC LIMIT 100",
        [$parentId,$classId]
    );
    Http::json([
        'student'=>['id'=>(int)$studentId,'name'=>$student['name'],'className'=>$student['class_name'] ?? ''],
        'teacherPosts'=>array_map(static fn(array $row):array=>[
            'id'=>(int)$row['id'],'source'=>'teacher','title'=>(string)$row['title'],'description'=>(string)$row['body'],
            'senderName'=>(string)$row['teacher_name'],'className'=>(string)($row['class_name'] ?? 'جميع الفصول'),
            'status'=>'published','createdAt'=>$row['created_at'],
        ],$teacherPosts),
        'communityPosts'=>array_map(static fn(array $row):array=>parent_community_media_json($row,'parent'),$community),
        'myPosts'=>array_map(static fn(array $row):array=>parent_community_media_json($row,'parent'),$mine),
    ]);
}

function parent_community_media_parent_archive(int $parentId, int $postId): never
{
    Auth::requirePermission('parent.community.post',false);
    ensure_parent_community_media_schema();
    $row = fetch_one('SELECT id,status FROM parent_community_media_posts WHERE id=? AND parent_id=?',[$postId,$parentId]);
    if (!$row) Http::json(['error'=>'المشاركة غير موجودة.'],404);
    if ((string)$row['status'] === 'archived') Http::json(['error'=>'المشاركة محذوفة بالفعل.'],409);
    execute_sql("UPDATE parent_community_media_posts SET status='archived' WHERE id=? AND parent_id=?",[$postId,$parentId]);
    Activity::log('parent',$parentId,'حذف مشاركة من مجمع مدار','المشاركة رقم '.$postId);
    Http::json(['ok'=>true]);
}

function teacher_parent_community_media_list(int $teacherId): never
{
    ensure_parent_community_media_schema();
    $status = trim((string)($_GET['status'] ?? 'all'));
    if (!in_array($status,['all','pending','published','rejected','archived'],true)) $status = 'all';
    $where = 'm.teacher_id=?';
    $params = [$teacherId];
    if ($status !== 'all') {$where .= ' AND m.status=?';$params[]=$status;}
    $posts = fetch_all(
        "SELECT m.*,u.name AS sender_name,c.name AS class_name,s.name AS student_name
         FROM parent_community_media_posts m JOIN platform_users u ON u.id=m.parent_id JOIN classes c ON c.id=m.class_id JOIN students s ON s.id=m.student_id
         WHERE {$where} ORDER BY FIELD(m.status,'pending','published','rejected','archived'),m.created_at DESC LIMIT 300",
        $params
    );
    $counts = fetch_one(
        "SELECT SUM(status='pending') AS pending_count,SUM(status='published') AS published_count,
                SUM(status='rejected') AS rejected_count,COUNT(*) AS total_count
         FROM parent_community_media_posts WHERE teacher_id=? AND status<>'archived'",
        [$teacherId]
    ) ?: [];
    Http::json([
        'posts'=>array_map(static fn(array $row):array=>parent_community_media_json($row,'teacher'),$posts),
        'counts'=>[
            'pending'=>(int)($counts['pending_count'] ?? 0),'published'=>(int)($counts['published_count'] ?? 0),
            'rejected'=>(int)($counts['rejected_count'] ?? 0),'total'=>(int)($counts['total_count'] ?? 0),
        ],
    ]);
}

function teacher_parent_community_media_review(int $teacherId, int $postId, string $action): never
{
    ensure_parent_community_media_schema();
    $next = ['approve'=>'published','reject'=>'rejected','archive'=>'archived'][$action] ?? null;
    if (!$next) Http::json(['error'=>'إجراء المراجعة غير صالح.'],422);
    $row = fetch_one('SELECT id,status FROM parent_community_media_posts WHERE id=? AND teacher_id=?',[$postId,$teacherId]);
    if (!$row) Http::json(['error'=>'المشاركة غير موجودة.'],404);
    $allowedFrom = ['approve'=>['pending','rejected'],'reject'=>['pending'],'archive'=>['published','rejected']][$action];
    if (!in_array((string)$row['status'],$allowedFrom,true)) Http::json(['error'=>'لا يمكن تنفيذ هذا الإجراء في حالة المشاركة الحالية.'],409);
    $changed = execute_sql(
        'UPDATE parent_community_media_posts SET status=?,reviewed_by_teacher=?,reviewed_at=NOW() WHERE id=? AND teacher_id=? AND status=?',
        [$next,$teacherId,$postId,$teacherId,(string)$row['status']]
    );
    if ($changed->rowCount() !== 1) Http::json(['error'=>'تغيّرت حالة المشاركة أثناء المراجعة. حدّثي القائمة ثم حاولي مجددًا.'],409);
    $label = ['approve'=>'اعتماد','reject'=>'رفض','archive'=>'أرشفة'][$action];
    Activity::log('teacher',$teacherId,$label.' مشاركة في مجمع مدار','المشاركة رقم '.$postId);
    Http::json(['ok'=>true,'status'=>$next]);
}

function parent_community_media_stream(int $postId, string $scope, int $actorId): never
{
    ensure_parent_community_media_schema();
    $row = fetch_one('SELECT * FROM parent_community_media_posts WHERE id=?',[$postId]);
    if (!$row) Http::json(['error'=>'الوسائط غير موجودة.'],404);
    $allowed = false;
    if ($scope === 'teacher') {
        $allowed = (int)$row['teacher_id'] === $actorId;
    } else {
        $allowed = (int)$row['parent_id'] === $actorId;
        if (!$allowed && (string)$row['status'] === 'published') {
            $allowed = (bool)fetch_one(
                "SELECT 1 FROM parent_student_links l JOIN students s ON s.id=l.student_id
                 WHERE l.parent_id=? AND l.status='active' AND s.deleted_at IS NULL AND s.class_id=? LIMIT 1",
                [$actorId,(int)$row['class_id']]
            );
        }
    }
    if (!$allowed) Http::json(['error'=>'لا تملكين صلاحية عرض هذه الوسائط.'],403);
    $path = parent_community_media_path((string)$row['stored_name']);
    if (!$path || !is_readable($path)) Http::json(['error'=>'ملف الوسائط غير متاح.'],404);
    $size = filesize($path);
    if ($size === false) Http::json(['error'=>'تعذّرت قراءة ملف الوسائط.'],500);
    while (ob_get_level() > 0) ob_end_clean();
    $start = 0;$end = $size - 1;$status = 200;
    if ((string)$row['media_kind'] === 'video') {
        $range = (string)($_SERVER['HTTP_RANGE'] ?? '');
        if ($range !== '' && preg_match('/^bytes=(\d*)-(\d*)$/',$range,$matches)) {
            if ($matches[1] === '' && $matches[2] !== '') {$suffix=min($size,max(1,(int)$matches[2]));$start=$size-$suffix;}
            else {$start=$matches[1] === '' ? 0 : (int)$matches[1];$end=$matches[2] === '' ? $end : min($end,(int)$matches[2]);}
            if ($start > $end || $start >= $size) {header("Content-Range: bytes */{$size}");http_response_code(416);exit;}
            $status = 206;
        }
        header('Accept-Ranges: bytes');
    }
    http_response_code($status);
    header('Content-Type: '.(string)$row['mime_type']);
    header('Content-Length: '.(string)($end-$start+1));
    header('Content-Disposition: inline; filename="media.'.pathinfo($path,PATHINFO_EXTENSION).'"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=300');
    if ($status === 206) header("Content-Range: bytes {$start}-{$end}/{$size}");
    $handle = fopen($path,'rb');
    if (!$handle) exit;
    fseek($handle,$start);$remaining=$end-$start+1;
    while ($remaining > 0 && !feof($handle)) {
        $chunk = fread($handle,min(1048576,$remaining));
        if ($chunk === false || $chunk === '') break;
        echo $chunk;$remaining -= strlen($chunk);
        if (connection_aborted()) break;
    }
    fclose($handle);exit;
}

function teacher_parent_community_media_routes(string $method, array $segments, int $teacherId): never
{
    if (!$segments && $method === 'GET') teacher_parent_community_media_list($teacherId);
    if (isset($segments[0]) && count($segments) === 1 && $method === 'GET') parent_community_media_stream(route_id($segments,0),'teacher',$teacherId);
    if (isset($segments[0],$segments[1]) && $method === 'POST') teacher_parent_community_media_review($teacherId,route_id($segments,0),(string)$segments[1]);
    Http::json(['error'=>'مسار وسائط مجمع مدار غير موجود.'],404);
}
