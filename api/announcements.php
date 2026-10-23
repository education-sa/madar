<?php
declare(strict_types=1);

const TEACHER_ANNOUNCEMENTS_MIGRATION = 'database/migration_20260918_teacher_announcements.sql';
const TEACHER_ANNOUNCEMENT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function teacher_announcements_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    try {
        $table = fetch_one(
            "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='teacher_announcements' LIMIT 1"
        );
        if (!$table) return $ready = false;
        $columns = fetch_all(
            "SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='teacher_announcements'"
        );
        $available = array_fill_keys(array_map(static fn(array $row): string => (string) $row['name'], $columns), true);
        foreach (['teacher_id','body','image_stored_name','image_mime_type','display_size','is_active','published_at'] as $column) {
            if (!isset($available[$column])) return $ready = false;
        }
        return $ready = true;
    } catch (Throwable) {
        return $ready = false;
    }
}

function teacher_announcements_require_schema(): void
{
    if (teacher_announcements_schema_ready()) return;
    Http::json([
        'error' => 'يلزم تشغيل ملف ' . TEACHER_ANNOUNCEMENTS_MIGRATION . ' مرة واحدة لتفعيل الإعلانات.',
        'code' => 'TEACHER_ANNOUNCEMENTS_MIGRATION_REQUIRED',
        'migration' => TEACHER_ANNOUNCEMENTS_MIGRATION,
    ], 503);
}

function teacher_announcement_storage_directory(): string
{
    $directory = MADAR_ROOT . '/storage/private/teacher-announcements';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        Http::json(['error' => 'تعذّر تجهيز مجلد صور الإعلانات.'], 500);
    }
    return $directory;
}

function teacher_announcement_safe_original_name(string $name, string $extension): string
{
    $name = basename(str_replace('\\', '/', $name));
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
    $name = trim($name);
    if ($name === '') $name = 'announcement.' . $extension;
    return mb_substr($name, 0, 255);
}

function teacher_announcement_validate_image(?array $upload): ?array
{
    if (!$upload || (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    $error = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        $message = match ($error) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'حجم صورة الإعلان أكبر من المسموح في الخادم.',
            UPLOAD_ERR_PARTIAL => 'لم يكتمل رفع صورة الإعلان. حاولي مرة أخرى.',
            default => 'تعذّر استقبال صورة الإعلان.',
        };
        Http::json(['error' => $message], 422);
    }
    $temporary = (string) ($upload['tmp_name'] ?? '');
    if ($temporary === '' || !is_uploaded_file($temporary)) Http::json(['error' => 'ملف صورة الإعلان غير صالح.'], 422);
    $size = (int) ($upload['size'] ?? 0);
    if ($size < 1) $size = (int) (filesize($temporary) ?: 0);
    if ($size < 1 || $size > TEACHER_ANNOUNCEMENT_MAX_IMAGE_BYTES) {
        Http::json(['error' => 'يجب ألا يتجاوز حجم صورة الإعلان 5 ميجابايت.'], 422);
    }
    if (!class_exists('finfo')) Http::json(['error' => 'الخادم يحتاج إضافة Fileinfo للتحقق من الصور.'], 500);
    $mime = (string) ((new finfo(FILEINFO_MIME_TYPE))->file($temporary) ?: '');
    $allowed = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
    $imageInfo = @getimagesize($temporary);
    if (!isset($allowed[$mime]) || $imageInfo === false || ($imageInfo['mime'] ?? '') !== $mime) {
        Http::json(['error' => 'الصيغ المسموحة لصورة الإعلان هي PNG أو JPG أو WebP.'], 422);
    }
    $width = (int) ($imageInfo[0] ?? 0);
    $height = (int) ($imageInfo[1] ?? 0);
    if ($width < 1 || $height < 1 || $width > 12000 || $height > 12000 || $width * $height > 60000000) {
        Http::json(['error' => 'أبعاد صورة الإعلان كبيرة جدًا أو غير صالحة.'], 422);
    }
    return [
        'temporary' => $temporary,
        'size' => $size,
        'mime' => $mime,
        'extension' => $allowed[$mime],
        'original' => teacher_announcement_safe_original_name((string) ($upload['name'] ?? ''), $allowed[$mime]),
    ];
}

function teacher_announcement_display_size(mixed $value): string
{
    $size = trim((string) $value);
    return in_array($size, ['auto','small','medium','large'], true) ? $size : 'auto';
}

function teacher_announcement_json(array $row, string $scope): array
{
    $id = (int) $row['id'];
    return [
        'id' => $id,
        'body' => (string) ($row['body'] ?? ''),
        'displaySize' => teacher_announcement_display_size($row['display_size'] ?? 'auto'),
        'isActive' => (bool) ($row['is_active'] ?? false),
        'hasImage' => trim((string) ($row['image_stored_name'] ?? '')) !== '',
        'imageName' => (string) ($row['image_original_name'] ?? ''),
        'imageUrl' => trim((string) ($row['image_stored_name'] ?? '')) !== '' ? "/api/{$scope}/announcements/{$id}/image" : null,
        'publishedAt' => $row['published_at'] ?? null,
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
    ];
}

function teacher_announcement_owned(int $teacherId, int $announcementId): array
{
    teacher_announcements_require_schema();
    $row = fetch_one('SELECT * FROM teacher_announcements WHERE id=? AND teacher_id=? LIMIT 1', [$announcementId, $teacherId]);
    if (!$row) Http::json(['error' => 'الإعلان غير موجود.'], 404);
    return $row;
}

function teacher_announcements_routes(string $method, array $segments, int $teacherId): never
{
    if (($segments[1] ?? '') === 'image' && isset($segments[0]) && $method === 'GET') {
        $row = teacher_announcement_owned($teacherId, route_id($segments, 0));
        teacher_announcement_send_image($row);
    }
    teacher_announcements_require_schema();
    if (!$segments && $method === 'GET') {
        $rows = fetch_all(
            'SELECT * FROM teacher_announcements WHERE teacher_id=? ORDER BY created_at DESC,id DESC LIMIT 100',
            [$teacherId]
        );
        Http::json([
            'migrationReady' => true,
            'announcements' => array_map(static fn(array $row): array => teacher_announcement_json($row, 'teacher'), $rows),
        ]);
    }
    if (!$segments && $method === 'POST') {
        $body = trim((string) ($_POST['body'] ?? ''));
        if (mb_strlen($body) > 4000) Http::json(['error' => 'نص الإعلان يجب ألا يتجاوز 4000 حرف.'], 422);
        $image = teacher_announcement_validate_image(isset($_FILES['image']) && is_array($_FILES['image']) ? $_FILES['image'] : null);
        if ($body === '' && $image === null) Http::json(['error' => 'اكتبي نصًا أو أرفقي صورة للإعلان.'], 422);
        $displaySize = teacher_announcement_display_size($_POST['displaySize'] ?? 'auto');
        $active = filter_var($_POST['isActive'] ?? '1', FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? false;
        $storedName = null;
        if ($image !== null) {
            $storedName = bin2hex(random_bytes(24)) . '.' . $image['extension'];
            $target = teacher_announcement_storage_directory() . '/' . $storedName;
            if (!move_uploaded_file($image['temporary'], $target)) Http::json(['error' => 'تعذّر حفظ صورة الإعلان.'], 500);
            @chmod($target, 0640);
        }
        try {
            $announcementId = Database::transaction(function (PDO $pdo) use ($teacherId, $body, $image, $storedName, $displaySize, $active): int {
                if ($active) $pdo->prepare('UPDATE teacher_announcements SET is_active=0 WHERE teacher_id=?')->execute([$teacherId]);
                $statement = $pdo->prepare(
                    'INSERT INTO teacher_announcements (teacher_id,body,image_original_name,image_stored_name,image_mime_type,image_size_bytes,display_size,is_active,published_at) VALUES (?,?,?,?,?,?,?,?,?)'
                );
                $statement->execute([
                    $teacherId,
                    $body !== '' ? $body : null,
                    $image['original'] ?? null,
                    $storedName,
                    $image['mime'] ?? null,
                    $image['size'] ?? null,
                    $displaySize,
                    $active ? 1 : 0,
                    $active ? date('Y-m-d H:i:s') : null,
                ]);
                return (int) $pdo->lastInsertId();
            });
        } catch (Throwable $error) {
            if ($storedName !== null) @unlink(teacher_announcement_storage_directory() . '/' . $storedName);
            throw $error;
        }
        Activity::log('teacher', $teacherId, $active ? 'نشر إعلان' : 'حفظ مسودة إعلان', mb_substr($body !== '' ? $body : 'إعلان بصورة', 0, 190));
        $row = teacher_announcement_owned($teacherId, $announcementId);
        Http::json(['ok' => true, 'announcement' => teacher_announcement_json($row, 'teacher')], 201);
    }
    if (isset($segments[0]) && ($segments[1] ?? '') === 'status' && $method === 'PUT') {
        $announcementId = route_id($segments, 0);
        teacher_announcement_owned($teacherId, $announcementId);
        $data = Http::input();
        $active = filter_var($data['isActive'] ?? false, FILTER_VALIDATE_BOOL);
        Database::transaction(function (PDO $pdo) use ($teacherId, $announcementId, $active): void {
            if ($active) $pdo->prepare('UPDATE teacher_announcements SET is_active=0 WHERE teacher_id=?')->execute([$teacherId]);
            $pdo->prepare('UPDATE teacher_announcements SET is_active=?,published_at=CASE WHEN ?=1 THEN NOW() ELSE published_at END WHERE id=? AND teacher_id=?')
                ->execute([$active ? 1 : 0, $active ? 1 : 0, $announcementId, $teacherId]);
        });
        Activity::log('teacher', $teacherId, $active ? 'تفعيل إعلان' : 'إيقاف إعلان', 'الإعلان رقم ' . $announcementId);
        Http::json(['ok' => true]);
    }
    if (isset($segments[0]) && count($segments) === 1 && $method === 'DELETE') {
        $announcementId = route_id($segments, 0);
        $row = teacher_announcement_owned($teacherId, $announcementId);
        execute_sql('DELETE FROM teacher_announcements WHERE id=? AND teacher_id=?', [$announcementId, $teacherId]);
        $storedName = basename((string) ($row['image_stored_name'] ?? ''));
        if ($storedName !== '') @unlink(teacher_announcement_storage_directory() . '/' . $storedName);
        Activity::log('teacher', $teacherId, 'حذف إعلان', 'الإعلان رقم ' . $announcementId);
        Http::json(['ok' => true]);
    }
    Http::json(['error' => 'مسار الإعلانات المطلوب غير موجود.'], 404);
}

function student_announcements_routes(string $method, array $segments, int $studentId): never
{
    if (($segments[1] ?? '') === 'image' && isset($segments[0]) && $method === 'GET') {
        teacher_announcements_require_schema();
        $row = fetch_one(
            'SELECT a.* FROM teacher_announcements a JOIN classes c ON c.teacher_id=a.teacher_id JOIN students s ON s.class_id=c.id WHERE a.id=? AND s.id=? AND s.deleted_at IS NULL AND a.is_active=1 LIMIT 1',
            [route_id($segments, 0), $studentId]
        );
        if (!$row) Http::json(['error' => 'صورة الإعلان غير متاحة.'], 404);
        teacher_announcement_send_image($row);
    }
    if (($segments[0] ?? '') === 'current' && $method === 'GET') {
        if (!teacher_announcements_schema_ready()) Http::json(['migrationReady' => false, 'announcement' => null]);
        $row = fetch_one(
            'SELECT a.* FROM teacher_announcements a JOIN classes c ON c.teacher_id=a.teacher_id JOIN students s ON s.class_id=c.id WHERE s.id=? AND s.deleted_at IS NULL AND a.is_active=1 AND a.published_at IS NOT NULL ORDER BY a.published_at DESC,a.id DESC LIMIT 1',
            [$studentId]
        );
        Http::json([
            'migrationReady' => true,
            'announcement' => $row ? teacher_announcement_json($row, 'student') : null,
        ]);
    }
    Http::json(['error' => 'مسار الإعلانات المطلوب غير موجود.'], 404);
}

function teacher_announcement_send_image(array $row): never
{
    $storedName = basename((string) ($row['image_stored_name'] ?? ''));
    $mime = (string) ($row['image_mime_type'] ?? '');
    if ($storedName === '' || !in_array($mime, ['image/png','image/jpeg','image/webp'], true)) {
        Http::json(['error' => 'لا توجد صورة لهذا الإعلان.'], 404);
    }
    $path = teacher_announcement_storage_directory() . '/' . $storedName;
    if (!is_file($path) || !is_readable($path)) Http::json(['error' => 'صورة الإعلان غير متاحة.'], 404);
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string) filesize($path));
    header('Cache-Control: private, max-age=300');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}
