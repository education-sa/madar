<?php
declare(strict_types=1);

function knowledge_categories(): array
{
    return [
        'worksheet'=>'أوراق عمل',
        'summary'=>'ملخصات',
        'video'=>'فيديوهات',
    ];
}

function knowledge_allowed_mime_types(): array
{
    return [
        'application/pdf'=>'pdf',
        'image/jpeg'=>'jpg',
        'image/png'=>'png',
        'image/webp'=>'webp',
        'image/gif'=>'gif',
        'image/avif'=>'avif',
        'image/heic'=>'heic',
        'image/heif'=>'heif',
    ];
}

function ensure_knowledge_exchange_schema(): void
{
    static $ready=false;
    if ($ready) return;
    execute_sql(
        "CREATE TABLE IF NOT EXISTS knowledge_resources (
          id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          teacher_id BIGINT UNSIGNED NOT NULL,
          category ENUM('worksheet','summary','video') NOT NULL,
          title VARCHAR(190) NOT NULL,
          description VARCHAR(1000) NULL,
          resource_type ENUM('file','link') NOT NULL,
          original_name VARCHAR(255) NULL,
          stored_name VARCHAR(80) NULL UNIQUE,
          mime_type VARCHAR(100) NULL,
          size_bytes BIGINT UNSIGNED NULL,
          resource_url VARCHAR(2048) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_knowledge_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          INDEX idx_knowledge_teacher_category_date (teacher_id,category,created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $ready=true;
}

function knowledge_storage_directory(): string
{
    $directory=MADAR_ROOT.'/storage/private/knowledge-exchange';
    if (!is_dir($directory) && !mkdir($directory,0750,true) && !is_dir($directory)) {
        Http::json(['error'=>'تعذّر تجهيز مجلد تبادل المعرفة.'],500);
    }
    if (!is_writable($directory)) Http::json(['error'=>'مجلد تبادل المعرفة غير قابل للكتابة.'],500);
    return $directory;
}

function knowledge_json_row(array $row): array
{
    return [
        'id'=>(int)$row['id'],
        'category'=>(string)$row['category'],
        'title'=>(string)$row['title'],
        'description'=>$row['description']===null?'':(string)$row['description'],
        'resourceType'=>(string)$row['resource_type'],
        'originalName'=>$row['original_name']===null?'':(string)$row['original_name'],
        'mimeType'=>$row['mime_type']===null?'':(string)$row['mime_type'],
        'sizeBytes'=>(int)($row['size_bytes']??0),
        'url'=>$row['resource_url']===null?'':(string)$row['resource_url'],
        'createdAt'=>$row['created_at'],
    ];
}

function teacher_knowledge_exchange_routes(string $method,array $segments,int $teacherId): never
{
    ensure_knowledge_exchange_schema();
    if (!$segments && $method==='GET') {
        $rows=fetch_all('SELECT id,category,title,description,resource_type,original_name,mime_type,size_bytes,resource_url,created_at FROM knowledge_resources WHERE teacher_id=? ORDER BY created_at DESC,id DESC',[$teacherId]);
        Http::json(['categories'=>knowledge_categories(),'resources'=>array_map('knowledge_json_row',$rows)]);
    }
    if (!$segments && $method==='POST') teacher_knowledge_exchange_create($teacherId);
    if (isset($segments[0]) && ($segments[1]??'')==='file' && $method==='GET') {
        $resourceId=route_id($segments,0);
        $row=fetch_one('SELECT id,original_name,stored_name,mime_type,size_bytes FROM knowledge_resources WHERE id=? AND teacher_id=? AND resource_type=\'file\'',[$resourceId,$teacherId]);
        if (!$row) Http::json(['error'=>'المورد غير موجود.'],404);
        knowledge_send_file($row);
    }
    if (isset($segments[0]) && count($segments)===1 && $method==='DELETE') {
        $resourceId=route_id($segments,0);
        $row=fetch_one('SELECT id,title,stored_name FROM knowledge_resources WHERE id=? AND teacher_id=?',[$resourceId,$teacherId]);
        if (!$row) Http::json(['error'=>'المورد غير موجود.'],404);
        execute_sql('DELETE FROM knowledge_resources WHERE id=? AND teacher_id=?',[$resourceId,$teacherId]);
        knowledge_remove_stored_file((string)($row['stored_name']??''));
        Activity::log('teacher',$teacherId,'حذف مورد من تبادل المعرفة',(string)$row['title']);
        Http::json(['ok'=>true]);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function student_knowledge_exchange_routes(string $method,array $segments,int $studentId): never
{
    ensure_knowledge_exchange_schema();
    if (!$segments && $method==='GET') {
        $rows=fetch_all(
            'SELECT r.id,r.category,r.title,r.description,r.resource_type,r.original_name,r.mime_type,r.size_bytes,r.resource_url,r.created_at
             FROM knowledge_resources r
             JOIN classes c ON c.teacher_id=r.teacher_id
             JOIN students s ON s.class_id=c.id
             WHERE s.id=? ORDER BY r.created_at DESC,r.id DESC',
            [$studentId]
        );
        Http::json(['categories'=>knowledge_categories(),'resources'=>array_map('knowledge_json_row',$rows)]);
    }
    if (isset($segments[0]) && ($segments[1]??'')==='file' && $method==='GET') {
        $resourceId=route_id($segments,0);
        $row=fetch_one(
            "SELECT r.id,r.original_name,r.stored_name,r.mime_type,r.size_bytes
             FROM knowledge_resources r
             JOIN classes c ON c.teacher_id=r.teacher_id
             JOIN students s ON s.class_id=c.id
             WHERE r.id=? AND s.id=? AND r.resource_type='file'",
            [$resourceId,$studentId]
        );
        if (!$row) Http::json(['error'=>'المورد غير موجود ضمن موادكِ.'],404);
        knowledge_send_file($row);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function teacher_knowledge_exchange_create(int $teacherId): never
{
    ensure_academic_year_management_schema();
    $academicYear=(string)(teacher_school_settings_row($teacherId)['academic_year']??'');
    $categories=knowledge_categories();
    $category=trim((string)($_POST['category']??''));
    $title=trim((string)($_POST['title']??''));
    $description=trim((string)($_POST['description']??''));
    if (!isset($categories[$category])) Http::json(['error'=>'اختاري قسمًا صالحًا.'],422);
    if ($title==='' || mb_strlen($title)>190) Http::json(['error'=>'اكتبي عنوانًا لا يتجاوز 190 حرفًا.'],422);
    if (mb_strlen($description)>1000) Http::json(['error'=>'الوصف طويل جدًا.'],422);

    if ($category==='video') {
        $url=trim((string)($_POST['url']??''));
        $parts=parse_url($url);
        if (!filter_var($url,FILTER_VALIDATE_URL) || !in_array(strtolower((string)($parts['scheme']??'')),['http','https'],true)) {
            Http::json(['error'=>'أضيفي رابط فيديو صحيحًا يبدأ بـ http أو https.'],422);
        }
        execute_sql('INSERT INTO knowledge_resources (teacher_id,academic_year,category,title,description,resource_type,resource_url) VALUES (?,?,?,?,?,\'link\',?)',[$teacherId,$academicYear!==''?$academicYear:null,$category,$title,$description!==''?$description:null,$url]);
    } else {
        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) Http::json(['error'=>'اختاري ملف PDF أو صورة.'],422);
        $upload=$_FILES['file'];
        $error=(int)($upload['error']??UPLOAD_ERR_NO_FILE);
        if ($error!==UPLOAD_ERR_OK) {
            $message=match($error) {
                UPLOAD_ERR_INI_SIZE,UPLOAD_ERR_FORM_SIZE=>'حجم الملف أكبر من المسموح في الخادم.',
                UPLOAD_ERR_PARTIAL=>'لم يكتمل رفع الملف. حاولي مرة أخرى.',
                UPLOAD_ERR_NO_FILE=>'اختاري ملف PDF أو صورة.',
                default=>'تعذّر رفع الملف. حاولي مرة أخرى.',
            };
            Http::json(['error'=>$message],422);
        }
        $temporary=(string)($upload['tmp_name']??'');
        if ($temporary==='' || !is_uploaded_file($temporary)) Http::json(['error'=>'ملف الرفع غير صالح.'],422);
        $size=(int)(filesize($temporary)?:0);
        if ($size<1 || $size>15*1024*1024) Http::json(['error'=>'يجب ألا يتجاوز حجم الملف 15 ميجابايت.'],422);
        if (!class_exists('finfo')) Http::json(['error'=>'الخادم يحتاج إضافة Fileinfo للتحقق من الملفات.'],500);
        $mime=(new finfo(FILEINFO_MIME_TYPE))->file($temporary)?:'';
        $allowed=knowledge_allowed_mime_types();
        if (!isset($allowed[$mime])) Http::json(['error'=>'الصيغ المسموحة هي PDF أو صورة فقط.'],422);
        $original=knowledge_safe_original_name((string)($upload['name']??''),$allowed[$mime]);
        $stored=bin2hex(random_bytes(20)).'.'.$allowed[$mime];
        $path=knowledge_storage_directory().'/'.$stored;
        if (!move_uploaded_file($temporary,$path)) Http::json(['error'=>'تعذّر حفظ الملف المرفوع.'],500);
        @chmod($path,0640);
        try {
            execute_sql('INSERT INTO knowledge_resources (teacher_id,academic_year,category,title,description,resource_type,original_name,stored_name,mime_type,size_bytes) VALUES (?,?,?,?,?,\'file\',?,?,?,?)',[$teacherId,$academicYear!==''?$academicYear:null,$category,$title,$description!==''?$description:null,$original,$stored,$mime,$size]);
        } catch (Throwable $error) {
            @unlink($path);
            throw $error;
        }
    }
    $id=(int)Database::connection()->lastInsertId();
    Activity::log('teacher',$teacherId,'إضافة مورد إلى تبادل المعرفة',$categories[$category].' — '.$title);
    $row=fetch_one('SELECT id,category,title,description,resource_type,original_name,mime_type,size_bytes,resource_url,created_at FROM knowledge_resources WHERE id=? AND teacher_id=?',[$id,$teacherId]);
    if (!$row) Http::json(['error'=>'تم حفظ المورد لكن تعذّر قراءة بياناته.'],500);
    Http::json(['ok'=>true,'resource'=>knowledge_json_row($row)],201);
}

function knowledge_safe_original_name(string $name,string $extension): string
{
    $name=basename(str_replace('\\','/',$name));
    $name=preg_replace('/[\x00-\x1F\x7F]/u','',$name)??'';
    $name=trim($name);
    if ($name==='') $name='مورد-تعليمي.'.$extension;
    return mb_substr($name,0,255);
}

function knowledge_send_file(array $row): never
{
    $stored=(string)($row['stored_name']??'');
    if (!preg_match('/^[a-f0-9]{40}\.(?:pdf|jpg|png|webp|gif|avif|heic|heif)$/',$stored)) Http::json(['error'=>'مسار الملف غير صالح.'],404);
    $path=knowledge_storage_directory().'/'.$stored;
    if (!is_file($path)) Http::json(['error'=>'الملف غير موجود في التخزين.'],404);
    $original=knowledge_safe_original_name((string)($row['original_name']??''),pathinfo($stored,PATHINFO_EXTENSION));
    $fallback='madar-resource.'.pathinfo($stored,PATHINFO_EXTENSION);
    header('Content-Type: '.(string)$row['mime_type']);
    header('Content-Length: '.filesize($path));
    header("Content-Disposition: inline; filename=\"{$fallback}\"; filename*=UTF-8''".rawurlencode($original));
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

function knowledge_remove_stored_file(string $stored): void
{
    if (!preg_match('/^[a-f0-9]{40}\.(?:pdf|jpg|png|webp|gif|avif|heic|heif)$/',$stored)) return;
    $path=MADAR_ROOT.'/storage/private/knowledge-exchange/'.$stored;
    if (is_file($path)) @unlink($path);
}
