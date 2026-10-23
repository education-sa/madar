<?php
declare(strict_types=1);
require_once __DIR__.'/remedial_content.php';


const PLANNING_CONTENT_MIGRATION = 'migration_20260812_teacher_planning_content.sql';
const PLANNING_CONTENT_PARENT_PUBLICATION_MIGRATION = 'migration_20260813_teacher_planning_content_parent_publications.sql';
const PLANNING_CONTENT_MAX_BYTES = 20971520;
const PLANNING_CONTENT_COVER_MAX_BYTES = 5242880;
const PLANNING_CONTENT_MAX_EXPANDED_BYTES = 52428800;
const PLANNING_CONTENT_MAX_FILE_BYTES = 10485760;
const PLANNING_CONTENT_MAX_FILES = 200;
const STRATEGY_REPORT_MIGRATION = 'migration_20260813_teacher_strategy_reports.sql';
const STRATEGY_REPORT_EVIDENCE_MAX_FILES = 10;
const STRATEGY_REPORT_EVIDENCE_MAX_BYTES = 5242880;
const STRATEGY_REPORT_EVIDENCE_TOTAL_BYTES = 31457280;

function planning_content_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    foreach (['teacher_planning_content','teacher_planning_content_publications'] as $table) {
        if (!fetch_one('SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1',[$table])) {
            return $ready = false;
        }
    }
    $columns=fetch_all("SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='teacher_planning_content'");
    $available=array_fill_keys(array_map(static fn(array $row):string=>(string)$row['name'],$columns),true);
    foreach(['teacher_id','name','stage','grade_label','source_type','storage_key','entry_file','lifecycle_status','deleted_at'] as $column) {
        if(!isset($available[$column])) return $ready=false;
    }
    return $ready=true;
}

function planning_content_require_schema(): void
{
    if(planning_content_schema_ready()) return;
    Http::json([
        'error'=>'يلزم تشغيل ملف '.PLANNING_CONTENT_MIGRATION.' مرة واحدة بعد مراجعته لتفعيل استديو محتوى التخطيط.',
        'code'=>'PLANNING_CONTENT_MIGRATION_REQUIRED',
        'migration'=>PLANNING_CONTENT_MIGRATION,
    ],503);
}

function planning_content_parent_publication_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    $table='teacher_planning_content_parent_publications';
    if(!fetch_one('SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1',[$table])) return $ready=false;
    $columns=fetch_all('SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[$table]);
    $available=array_fill_keys(array_map(static fn(array $row):string=>(string)$row['name'],$columns),true);
    foreach(['content_id','class_id','academic_year','semester','status','published_at','disabled_at'] as $column) {
        if(!isset($available[$column])) return $ready=false;
    }
    return $ready=true;
}

function planning_content_require_parent_publication_schema(): void
{
    if(planning_content_parent_publication_schema_ready()) return;
    Http::json([
        'error'=>'يلزم تشغيل ملف '.PLANNING_CONTENT_PARENT_PUBLICATION_MIGRATION.' مرة واحدة بعد مراجعته لتفعيل النشر لأولياء الأمور.',
        'code'=>'PLANNING_CONTENT_PARENT_PUBLICATION_MIGRATION_REQUIRED',
        'migration'=>PLANNING_CONTENT_PARENT_PUBLICATION_MIGRATION,
    ],503);
}

function strategy_report_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    foreach (['teacher_strategy_reports','teacher_strategy_report_evidence'] as $table) {
        if (!fetch_one('SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1',[$table])) return $ready=false;
    }
    $required=[
        'teacher_strategy_reports'=>['teacher_id','lesson_name','target_audience','implementation_date','strategy_name','primary_goal','idea','education_department','education_office','school_name','deleted_at'],
        'teacher_strategy_report_evidence'=>['report_id','stored_name','mime_type','size_bytes','sort_order'],
    ];
    foreach($required as $table=>$columns) {
        $rows=fetch_all("SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?",[$table]);
        $available=array_fill_keys(array_map(static fn(array $row):string=>(string)$row['name'],$rows),true);
        foreach($columns as $column) if(!isset($available[$column])) return $ready=false;
    }
    return $ready=true;
}

function strategy_report_require_schema(): void
{
    if(strategy_report_schema_ready()) return;
    Http::json([
        'error'=>'يلزم تشغيل ملف '.STRATEGY_REPORT_MIGRATION.' مرة واحدة بعد مراجعته لتفعيل تقارير الاستراتيجيات.',
        'code'=>'STRATEGY_REPORT_MIGRATION_REQUIRED',
        'migration'=>STRATEGY_REPORT_MIGRATION,
    ],503);
}

function strategy_report_text(mixed $value,string $label,int $max): string
{
    $text=trim((string)$value);
    if($text==='') Http::json(['error'=>'يرجى إدخال '.$label.'.'],422);
    if(mb_strlen($text)>$max) Http::json(['error'=>$label.' أطول من الحد المسموح.'],422);
    return $text;
}

function strategy_report_date(mixed $value): string
{
    $date=trim((string)$value);$parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    if(!$parsed||$parsed->format('Y-m-d')!==$date) Http::json(['error'=>'تاريخ التنفيذ غير صالح.'],422);
    return $date;
}

function strategy_report_fields(array $input): array
{
    return [
        'lessonName'=>strategy_report_text($input['lessonName']??'','اسم الدرس',190),
        'targetAudience'=>strategy_report_text($input['targetAudience']??'','الفئة المستهدفة',190),
        'implementationDate'=>strategy_report_date($input['implementationDate']??''),
        'strategyName'=>strategy_report_text($input['strategyName']??'','الاستراتيجية',190),
        'primaryGoal'=>strategy_report_text($input['primaryGoal']??'','الهدف الأساسي',2000),
        'idea'=>strategy_report_text($input['idea']??'','الفكرة',5000),
    ];
}

function strategy_report_validate_evidence(?array $upload): array
{
    if(!$upload||!isset($upload['name'])) return ['staging'=>null,'files'=>[]];
    $names=is_array($upload['name'])?$upload['name']:[$upload['name']];
    $types=is_array($upload['type']??null)?$upload['type']:[$upload['type']??''];
    $temps=is_array($upload['tmp_name']??null)?$upload['tmp_name']:[$upload['tmp_name']??''];
    $errors=is_array($upload['error']??null)?$upload['error']:[$upload['error']??UPLOAD_ERR_NO_FILE];
    $sizes=is_array($upload['size']??null)?$upload['size']:[$upload['size']??0];
    $submitted=0;foreach($errors as $error) if((int)$error!==UPLOAD_ERR_NO_FILE)$submitted++;
    if($submitted>STRATEGY_REPORT_EVIDENCE_MAX_FILES) Http::json(['error'=>'يمكن رفع 10 صور شواهد كحد أقصى.'],422);
    if($submitted===0) return ['staging'=>null,'files'=>[]];
    $staging=sys_get_temp_dir().'/madar-strategy-'.bin2hex(random_bytes(12));
    if(!mkdir($staging,0700,true)) Http::json(['error'=>'تعذّر تجهيز مساحة فحص الشواهد.'],500);
    register_shutdown_function(static function()use($staging):void{planning_content_remove_tree($staging);});
    $finfo=new finfo(FILEINFO_MIME_TYPE);$allowed=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'];$files=[];$total=0;
    foreach($names as $index=>$rawName) {
        $error=(int)($errors[$index]??UPLOAD_ERR_NO_FILE);if($error===UPLOAD_ERR_NO_FILE)continue;
        if($error!==UPLOAD_ERR_OK) Http::json(['error'=>'تعذّر استقبال إحدى صور الشواهد.'],422);
        $size=(int)($sizes[$index]??0);$total+=$size;
        if($size<1||$size>STRATEGY_REPORT_EVIDENCE_MAX_BYTES) Http::json(['error'=>'يجب ألا يتجاوز حجم كل صورة شاهد 5 ميجابايت.'],422);
        if($total>STRATEGY_REPORT_EVIDENCE_TOTAL_BYTES) Http::json(['error'=>'يجب ألا يتجاوز مجموع صور الشواهد 30 ميجابايت.'],422);
        $tmp=(string)($temps[$index]??'');
        if($tmp===''||!is_uploaded_file($tmp)) Http::json(['error'=>'إحدى صور الشواهد لم تصل بطريقة آمنة.'],422);
        $mime=(string)($finfo->file($tmp)?:'');$imageInfo=@getimagesize($tmp);
        if(!isset($allowed[$mime])||$imageInfo===false||($imageInfo['mime']??'')!==$mime) Http::json(['error'=>'الشواهد تقبل صور PNG أو JPG أو WebP حقيقية فقط.'],422);
        $width=(int)($imageInfo[0]??0);$height=(int)($imageInfo[1]??0);
        if($width<1||$height<1||$width>12000||$height>12000||$width*$height>60000000) Http::json(['error'=>'أبعاد إحدى صور الشواهد كبيرة أو غير صالحة.'],422);
        $stored=bin2hex(random_bytes(20)).'.'.$allowed[$mime];$target=$staging.'/'.$stored;
        if(!move_uploaded_file($tmp,$target)) Http::json(['error'=>'تعذّر حفظ إحدى صور الشواهد.'],500);
        @chmod($target,0640);
        $files[]=['original'=>mb_substr(basename((string)$rawName),0,255),'stored'=>$stored,'mime'=>$mime,'size'=>$size];
    }
    return ['staging'=>$staging,'files'=>$files];
}

function strategy_report_owned(int $teacherId,int $reportId): array
{
    $row=fetch_one('SELECT * FROM teacher_strategy_reports WHERE id=? AND teacher_id=? AND deleted_at IS NULL LIMIT 1',[$reportId,$teacherId]);
    if(!$row) Http::json(['error'=>'تقرير الاستراتيجية غير موجود ضمن حسابكِ.'],404);
    return $row;
}

function strategy_report_json(array $row): array
{
    $id=(int)$row['id'];
    return [
        'id'=>$id,'lessonName'=>(string)$row['lesson_name'],'targetAudience'=>(string)$row['target_audience'],
        'implementationDate'=>(string)$row['implementation_date'],'strategyName'=>(string)$row['strategy_name'],
        'primaryGoal'=>(string)$row['primary_goal'],'idea'=>(string)$row['idea'],
        'evidenceCount'=>(int)($row['evidence_count']??0),'createdAt'=>(string)$row['created_at'],'updatedAt'=>(string)$row['updated_at'],
        'reportUrl'=>'/planning/strategy-report.php?report='.$id,
    ];
}

function strategy_report_catalog(int $teacherId): never
{
    if(!strategy_report_schema_ready()) Http::json(['migrationReady'=>false,'migration'=>STRATEGY_REPORT_MIGRATION,'items'=>[]]);
    $rows=fetch_all('SELECT r.*,(SELECT COUNT(*) FROM teacher_strategy_report_evidence e WHERE e.report_id=r.id) AS evidence_count FROM teacher_strategy_reports r WHERE r.teacher_id=? AND r.deleted_at IS NULL ORDER BY r.implementation_date DESC,r.id DESC',[$teacherId]);
    Http::json(['migrationReady'=>true,'migration'=>STRATEGY_REPORT_MIGRATION,'items'=>array_map('strategy_report_json',$rows)]);
}

function strategy_report_create(int $teacherId): never
{
    strategy_report_require_schema();$fields=strategy_report_fields($_POST);$evidence=strategy_report_validate_evidence(isset($_FILES['evidence'])&&is_array($_FILES['evidence'])?$_FILES['evidence']:null);
    if(!function_exists('teacher_school_settings_row')) require_once __DIR__.'/teacher_school_settings.php';
    $school=teacher_school_settings_row($teacherId);$snapshot=[
        'department'=>trim((string)($school['education_department']??'')),
        'office'=>trim((string)($school['education_office']??'')),
        'school'=>trim((string)($school['school_name']??'')),
    ];
    $storageRoot=MADAR_ROOT.'/storage/private/strategy-reports/'.$teacherId;
    if($evidence['files']&&!is_dir($storageRoot)&&!mkdir($storageRoot,0750,true)&&!is_dir($storageRoot)){planning_content_remove_tree((string)$evidence['staging']);Http::json(['error'=>'تعذّر تجهيز تخزين الشواهد.'],500);}
    $target=null;$moved=false;
    try {
        $id=Database::transaction(function(PDO $pdo)use($teacherId,$fields,$evidence,$snapshot,$storageRoot,&$target,&$moved):int{
            $statement=$pdo->prepare('INSERT INTO teacher_strategy_reports (teacher_id,lesson_name,target_audience,implementation_date,strategy_name,primary_goal,idea,education_department,education_office,school_name) VALUES (?,?,?,?,?,?,?,?,?,?)');
            $statement->execute([$teacherId,$fields['lessonName'],$fields['targetAudience'],$fields['implementationDate'],$fields['strategyName'],$fields['primaryGoal'],$fields['idea'],$snapshot['department'],$snapshot['office'],$snapshot['school']]);
            $id=(int)$pdo->lastInsertId();
            if($evidence['files']) {
                $target=$storageRoot.'/'.$id;if(!planning_content_move_tree((string)$evidence['staging'],$target)) throw new RuntimeException('تعذّر نقل الشواهد إلى التخزين الخاص.');$moved=true;
                $insert=$pdo->prepare('INSERT INTO teacher_strategy_report_evidence (report_id,original_name,stored_name,mime_type,size_bytes,sort_order) VALUES (?,?,?,?,?,?)');
                foreach($evidence['files'] as $order=>$file)$insert->execute([$id,$file['original'],$file['stored'],$file['mime'],$file['size'],$order]);
            }
            return $id;
        });
    } catch(Throwable $error) {
        if($moved&&$target)planning_content_remove_tree($target);elseif($evidence['staging'])planning_content_remove_tree((string)$evidence['staging']);
        error_log('[strategy-report-create] '.$error->getMessage());Http::json(['error'=>'تعذّر حفظ تقرير الاستراتيجية بأمان. حاولي مرة أخرى.'],500);
    }
    if($evidence['staging'])planning_content_remove_tree((string)$evidence['staging']);
    Activity::log('teacher',$teacherId,'إنشاء تقرير استراتيجية',$fields['strategyName'].' · '.$fields['lessonName']);
    $row=fetch_one('SELECT r.*,(SELECT COUNT(*) FROM teacher_strategy_report_evidence e WHERE e.report_id=r.id) AS evidence_count FROM teacher_strategy_reports r WHERE r.id=? AND r.teacher_id=?',[$id,$teacherId]);
    Http::json(['item'=>strategy_report_json($row),'message'=>'تم إنشاء تقرير الاستراتيجية.'],201);
}

function strategy_report_delete(int $teacherId,int $reportId): never
{
    strategy_report_require_schema();$report=strategy_report_owned($teacherId,$reportId);
    $files=fetch_all('SELECT stored_name FROM teacher_strategy_report_evidence WHERE report_id=?',[$reportId]);
    execute_sql('UPDATE teacher_strategy_reports SET deleted_at=NOW(),updated_at=NOW() WHERE id=? AND teacher_id=? AND deleted_at IS NULL',[$reportId,$teacherId]);
    $directory=MADAR_ROOT.'/storage/private/strategy-reports/'.$teacherId.'/'.$reportId;
    foreach($files as $file){$stored=(string)$file['stored_name'];if(preg_match('/^[a-f0-9]{40}\.(?:png|jpg|webp)$/',$stored)){ $path=$directory.'/'.$stored;if(is_file($path)&&!is_link($path))@unlink($path); }}
    @rmdir($directory);@rmdir(dirname($directory));
    Activity::log('teacher',$teacherId,'حذف تقرير استراتيجية',(string)$report['strategy_name'].' · '.(string)$report['lesson_name']);
    Http::json(['ok'=>true,'message'=>'تم حذف تقرير الاستراتيجية.']);
}

function planning_content_text(mixed $value,string $label,int $max,bool $required=true): string
{
    $text=trim((string)$value);
    if($required&&$text==='') Http::json(['error'=>'يرجى إدخال '.$label.'.'],422);
    if(mb_strlen($text)>$max) Http::json(['error'=>$label.' أطول من الحد المسموح.'],422);
    return $text;
}

function planning_content_positive_int(mixed $value,string $label): int
{
    $number=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>999]]);
    if($number===false) Http::json(['error'=>$label.' يجب أن يكون رقمًا من 1 إلى 999.'],422);
    return (int)$number;
}

function planning_content_grade_key(string $stage,string $label): string
{
    $text=trim((string)preg_replace('/\s+/u',' ',str_replace('الصف','',$label)));
    $ordinal=str_contains($text,'الرابع')||str_contains($text,'رابع')?'رابع':(str_contains($text,'الخامس')||str_contains($text,'خامس')?'خامس':(str_contains($text,'السادس')||str_contains($text,'سادس')?'سادس':(str_contains($text,'الأول')||str_contains($text,'اول')||str_contains($text,'أول')?'أول':(str_contains($text,'الثاني')||str_contains($text,'ثاني')?'ثاني':(str_contains($text,'الثالث')||str_contains($text,'ثالث')?'ثالث':'')))));
    if($stage==='ابتدائي'&&in_array($ordinal,['رابع','خامس','سادس'],true))return $ordinal.' ابتدائي';
    if($stage==='متوسط'&&in_array($ordinal,['أول','ثاني','ثالث'],true))return $ordinal.' متوسط';
    if($stage==='ثانوي'&&in_array($ordinal,['أول','ثاني','ثالث'],true))return $ordinal.' ثانوي';
    return $text;
}

function planning_content_safe_path(string $path): ?string
{
    if($path===''||str_contains($path,"\0")||str_contains($path,'\\')||str_starts_with($path,'/')||preg_match('/^[A-Za-z]:/',$path)) return null;
    $clean=[];
    foreach(explode('/',$path) as $part) {
        if($part===''||$part==='.') continue;
        if($part==='..'||str_starts_with($part,'.')||preg_match('/[\x00-\x1F\x7F]/',$part)) return null;
        $clean[]=$part;
    }
    return $clean?implode('/',$clean):null;
}

function planning_content_allowed_package_mimes(): array
{
    return [
        'html'=>['text/html','text/plain'],'htm'=>['text/html','text/plain'],'css'=>['text/css','text/plain'],
        'js'=>['text/javascript','application/javascript','application/x-javascript','application/ecmascript','text/plain'],
        'json'=>['application/json','text/plain'],'png'=>['image/png'],'jpg'=>['image/jpeg'],'jpeg'=>['image/jpeg'],
        'webp'=>['image/webp'],'gif'=>['image/gif'],'mp3'=>['audio/mpeg','audio/mp3','application/octet-stream'],
        'ogg'=>['audio/ogg','application/ogg'],'wav'=>['audio/wav','audio/x-wav'],'m4a'=>['audio/mp4','audio/x-m4a','application/octet-stream'],
        'woff'=>['font/woff','application/font-woff','application/octet-stream'],'woff2'=>['font/woff2','application/octet-stream'],
        'ttf'=>['font/ttf','application/x-font-ttf','application/octet-stream'],'otf'=>['font/otf','application/x-font-opentype','application/octet-stream'],
    ];
}

function planning_content_mime_matches(string $path,string $extension,string $mime,array $allowed): bool
{
    if(in_array($mime,$allowed[$extension]??[],true)) return true;
    if(!in_array($extension,['html','htm','css','js','json'],true)||!str_starts_with($mime,'text/')) return false;
    $content=file_get_contents($path);
    return is_string($content)&&!str_contains($content,"\0")&&mb_check_encoding($content,'UTF-8');
}

function planning_content_scan_text(string $path,string $extension): void
{
    $content=file_get_contents($path);
    if(!is_string($content)||str_contains($content,"\0")||!mb_check_encoding($content,'UTF-8')) Http::json(['error'=>'أحد ملفات الويب النصية غير صالح.'],422);
    if(str_contains($content,'<?')) Http::json(['error'=>'المحتوى يحتوي تعليمات خادم غير مسموح بها.'],422);
    if(in_array($extension,['html','htm','css'],true)&&preg_match('/(?:src|href)\s*=\s*["\']\s*(?:(?:http|ftp|file|javascript):)|url\s*\(\s*["\']?\s*(?:(?:http|ftp|file|javascript):)/i',$content)) {
        Http::json(['error'=>'المحتوى يستخدم رابطًا غير آمن. استخدمي HTTPS للمصادر الخارجية أو ضعي الملفات داخل الحزمة.'],422);
    }
    if($extension==='css'&&preg_match('/@import\s+(?:url\s*\()?\s*["\']?\s*(?:(?:http|ftp|file|javascript):)/i',$content)) {
        Http::json(['error'=>'استخدمي HTTPS فقط لاستيراد التنسيقات الخارجية.'],422);
    }
    if(in_array($extension,['html','htm'],true)&&preg_match('/<(?:base|form|iframe|object|embed)\b|<meta\b[^>]*http-equiv\s*=\s*["\']?refresh/i',$content)) {
        Http::json(['error'=>'صفحة HTML تحتوي نموذجًا أو تضمينًا أو تنقّلًا غير مسموح.'],422);
    }
}

function planning_content_remove_tree(string $directory): void
{
    if(!is_dir($directory)) return;
    $iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach($iterator as $item) $item->isDir()?@rmdir($item->getPathname()):@unlink($item->getPathname());
    @rmdir($directory);
}

function planning_content_move_tree(string $source,string $target): bool
{
    if(@rename($source,$target)) return true;
    if(!is_dir($source)||(!is_dir($target)&&!mkdir($target,0750,true)&&!is_dir($target))) return false;
    try {
        $iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::SELF_FIRST);
        foreach($iterator as $item) {
            $relative=substr($item->getPathname(),strlen($source)+1);$destination=$target.'/'.$relative;
            if($item->isDir()) {
                if(!is_dir($destination)&&!mkdir($destination,0750,true)&&!is_dir($destination)) throw new RuntimeException('تعذّر إنشاء مجلد التخزين.');
            } elseif(!copy($item->getPathname(),$destination)) throw new RuntimeException('تعذّر نسخ ملف المحتوى.');
        }
        planning_content_remove_tree($source);return true;
    } catch(Throwable) {
        planning_content_remove_tree($target);return false;
    }
}

function planning_content_extract_zip(string $zipPath): array
{
    if(!class_exists('ZipArchive')) Http::json(['error'=>'إضافة PHP Zip غير متاحة على الخادم.'],500);
    if(!class_exists('finfo')) Http::json(['error'=>'إضافة Fileinfo غير متاحة على الخادم.'],500);
    $zip=new ZipArchive();if($zip->open($zipPath)!==true) Http::json(['error'=>'ملف ZIP غير صالح أو تالف.'],422);
    if($zip->numFiles<1||$zip->numFiles>PLANNING_CONTENT_MAX_FILES){$zip->close();Http::json(['error'=>'الحد الأقصى للحزمة 200 ملف.'],422);}
    $staging=sys_get_temp_dir().'/madar-planning-'.bin2hex(random_bytes(12));
    if(!mkdir($staging,0700,true)){$zip->close();Http::json(['error'=>'تعذّر تجهيز مساحة فحص آمنة.'],500);}
    register_shutdown_function(static function()use($staging):void{planning_content_remove_tree($staging);});
    $allowed=planning_content_allowed_package_mimes();$finfo=new finfo(FILEINFO_MIME_TYPE);$expanded=0;$files=[];
    try {
        for($index=0;$index<$zip->numFiles;$index++) {
            $stat=$zip->statIndex($index);$raw=(string)($stat['name']??'');
            if(str_ends_with($raw,'/')||str_starts_with($raw,'__MACOSX/')||str_starts_with(basename($raw),'._')) continue;
            $safe=planning_content_safe_path($raw);if($safe===null) Http::json(['error'=>'الحزمة تحتوي مسارًا غير آمن.'],422);
            $extension=strtolower(pathinfo($safe,PATHINFO_EXTENSION));if(!isset($allowed[$extension])) Http::json(['error'=>'نوع الملف .'.$extension.' غير مسموح داخل حزمة الويب.'],422);
            $dangerous=['php','phtml','phar','cgi','pl','py','rb','sh','bash','exe','dll','so','dylib','jar','com','bat','cmd'];
            foreach(array_slice(array_map('strtolower',explode('.',basename($safe))),0,-1) as $part) if(in_array($part,$dangerous,true)) Http::json(['error'=>'الحزمة تحتوي امتدادًا مزدوجًا غير آمن.'],422);
            $size=(int)($stat['size']??0);$compressed=(int)($stat['comp_size']??0);$expanded+=$size;
            if($size>PLANNING_CONTENT_MAX_FILE_BYTES||$expanded>PLANNING_CONTENT_MAX_EXPANDED_BYTES||($size>1048576&&$size/max(1,$compressed)>100)) Http::json(['error'=>'الحزمة كبيرة أو نسبة ضغطها غير آمنة.'],422);
            $ops=0;$attributes=0;
            if(method_exists($zip,'getExternalAttributesIndex')&&$zip->getExternalAttributesIndex($index,$ops,$attributes)&&((($attributes>>16)&0170000)===0120000)) Http::json(['error'=>'الروابط الرمزية غير مسموح بها.'],422);
            $target=$staging.'/'.$safe;$parent=dirname($target);if(!is_dir($parent)&&!mkdir($parent,0700,true)&&!is_dir($parent)) Http::json(['error'=>'تعذّر تجهيز الحزمة.'],500);
            $input=$zip->getStream($raw);$output=@fopen($target,'wb');if(!$input||!$output) Http::json(['error'=>'تعذّر فحص أحد ملفات الحزمة.'],422);
            $written=stream_copy_to_stream($input,$output,PLANNING_CONTENT_MAX_FILE_BYTES+1);fclose($input);fclose($output);
            if($written===false||$written!==$size) Http::json(['error'=>'حجم أحد ملفات ZIP غير متطابق.'],422);
            $mime=(string)($finfo->file($target)?:'application/octet-stream');if(!planning_content_mime_matches($target,$extension,$mime,$allowed)) Http::json(['error'=>'نوع MIME الفعلي للملف '.$safe.' لا يطابق امتداده.'],422);
            if(in_array($extension,['png','jpg','jpeg','webp','gif'],true)&&@getimagesize($target)===false) Http::json(['error'=>'الحزمة تحتوي صورة غير صالحة.'],422);
            if(in_array($extension,['html','htm','css','js','json'],true)) planning_content_scan_text($target,$extension);
            $files[$safe]=true;
        }
        $html=array_values(array_filter(array_keys($files),static fn(string $file):bool=>in_array(strtolower(pathinfo($file,PATHINFO_EXTENSION)),['html','htm'],true)));
        if(!$html) Http::json(['error'=>'حزمة ZIP يجب أن تحتوي صفحة HTML واحدة على الأقل.'],422);
        usort($html,static function(string $left,string $right):int{
            $score=static fn(string $file):int=>(in_array(strtolower(basename($file)),['index.html','index.htm'],true)?100:(in_array(strtolower(basename($file)),['main.html','main.htm','presentation.html','presentation.htm'],true)?80:0))-substr_count($file,'/')*5;
            return $score($right)<=>$score($left)?:strlen($left)<=>strlen($right)?:strcmp($left,$right);
        });
        return ['staging'=>$staging,'entry'=>$html[0],'expanded'=>$expanded];
    } catch(Throwable $error) {
        planning_content_remove_tree($staging);throw $error;
    } finally {$zip->close();}
}

function planning_content_validate_cover(?array $upload,string $staging,string $basename='cover'): array
{
    if(!$upload||(int)($upload['error']??UPLOAD_ERR_NO_FILE)===UPLOAD_ERR_NO_FILE) return ['entry'=>null,'mime'=>null,'size'=>null,'original'=>null];
    if((int)($upload['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) Http::json(['error'=>'تعذّر استقبال صورة الغلاف.'],422);
    $size=(int)($upload['size']??0);if($size<1||$size>PLANNING_CONTENT_COVER_MAX_BYTES) Http::json(['error'=>'حجم صورة الغلاف يجب ألا يتجاوز 5 ميجابايت.'],422);
    $mime=(string)((new finfo(FILEINFO_MIME_TYPE))->file((string)$upload['tmp_name'])?:'');$allowed=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'];
    if(!isset($allowed[$mime])||@getimagesize((string)$upload['tmp_name'])===false) Http::json(['error'=>'الغلاف يجب أن يكون PNG أو JPG أو WebP حقيقيًا.'],422);
    if(!preg_match('/^[a-z0-9-]+$/',$basename)) Http::json(['error'=>'تعذّر تجهيز اسم صورة الغلاف.'],500);
    $entry=$basename.'.'.$allowed[$mime];$target=$staging.'/'.$entry;
    if(!move_uploaded_file((string)$upload['tmp_name'],$target)) Http::json(['error'=>'تعذّر حفظ صورة الغلاف.'],500);
    @chmod($target,0640);
    return ['entry'=>$entry,'mime'=>$mime,'size'=>$size,'original'=>mb_substr(basename((string)$upload['name']),0,255)];
}

function planning_content_validated_fields(array $input): array
{
    $name=planning_content_text($input['name']??'','اسم المحتوى',190);$stage=(string)($input['stage']??'');
    if(!in_array($stage,['ابتدائي','متوسط','ثانوي'],true)) Http::json(['error'=>'اختاري مرحلة دراسية صالحة.'],422);
    $grades=['ابتدائي'=>['رابع ابتدائي','خامس ابتدائي','سادس ابتدائي'],'متوسط'=>['أول متوسط','ثاني متوسط','ثالث متوسط'],'ثانوي'=>['أول ثانوي','ثاني ثانوي','ثالث ثانوي']];
    $grade=planning_content_grade_key($stage,planning_content_text($input['gradeLabel']??'','الصف',100));if(!in_array($grade,$grades[$stage],true)) Http::json(['error'=>'الصف لا يتبع المرحلة المختارة.'],422);
    $unit=planning_content_positive_int($input['unitNumber']??null,'رقم الوحدة');$lesson=planning_content_positive_int($input['lessonNumber']??null,'رقم الدرس');$lessonName=planning_content_text($input['lessonName']??'','اسم الدرس',190);
    $contentType=(string)($input['contentType']??'');if(!in_array($contentType,['presentation','activity','explanation','game'],true)) Http::json(['error'=>'نوع المحتوى غير صالح.'],422);
    $destination=(string)($input['destination']??'');if(!in_array($destination,['semester-plans','curriculum-distribution','strategies','interactive-presentations','professional-community','library-worksheets','library-training','library-videos'],true)) Http::json(['error'=>'وجهة المحتوى غير صالحة.'],422);
    return compact('name','stage','grade','unit','lesson','lessonName','contentType','destination');
}

function planning_content_source_upload(array $upload): array
{
    if((int)($upload['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) Http::json(['error'=>'اختاري ملف المحتوى ثم حاولي مرة أخرى.'],422);
    $size=(int)($upload['size']??0);if($size<1||$size>PLANNING_CONTENT_MAX_BYTES) Http::json(['error'=>'حجم ملف المحتوى يجب ألا يتجاوز 20 ميجابايت.'],422);
    $original=mb_substr(basename((string)($upload['name']??'content')),0,255);$extension=strtolower(pathinfo($original,PATHINFO_EXTENSION));
    if(!in_array($extension,['html','htm','zip','pdf','png','jpg','jpeg','webp','gif','mp4','webm'],true)) Http::json(['error'=>'نوع الملف غير مدعوم. ارفعي HTML أو ZIP أو PDF أو صورة أو فيديو MP4 أو WebM.'],422);
    $dangerous=['php','phtml','phar','cgi','pl','py','rb','sh','exe','dll','so','jar','bat','cmd'];
    foreach(array_slice(array_map('strtolower',explode('.',$original)),0,-1) as $part) if(in_array($part,$dangerous,true)) Http::json(['error'=>'اسم الملف يحتوي امتدادًا مزدوجًا غير آمن.'],422);
    $tmp=(string)$upload['tmp_name'];$finfo=new finfo(FILEINFO_MIME_TYPE);$mime=(string)($finfo->file($tmp)?:'application/octet-stream');
    if($extension==='zip') {
        if(!in_array($mime,['application/zip','application/x-zip-compressed','application/octet-stream'],true)) Http::json(['error'=>'ملف ZIP لا يطابق نوعه الفعلي.'],422);
        $package=planning_content_extract_zip($tmp);
        return [...$package,'source'=>'zip','mime'=>'application/zip','size'=>$size,'original'=>$original];
    }
    $staging=sys_get_temp_dir().'/madar-planning-'.bin2hex(random_bytes(12));if(!mkdir($staging,0700,true)) Http::json(['error'=>'تعذّر تجهيز مساحة الرفع.'],500);
    register_shutdown_function(static function()use($staging):void{planning_content_remove_tree($staging);});
    if(in_array($extension,['html','htm'],true)) {
        if(!in_array($mime,['text/html','text/plain'],true)) Http::json(['error'=>'ملف HTML لا يطابق نوعه الفعلي.'],422);
        $entry='index.html';if(!move_uploaded_file($tmp,$staging.'/'.$entry)) Http::json(['error'=>'تعذّر حفظ ملف HTML.'],500);
        planning_content_scan_text($staging.'/'.$entry,'html');$source='html';$storedMime='text/html';
    } elseif($extension==='pdf') {
        $head=(string)file_get_contents($tmp,false,null,0,5);
        if($mime!=='application/pdf'||$head!=='%PDF-') Http::json(['error'=>'ملف PDF غير صالح أو لا يطابق امتداده.'],422);
        $entry='content.pdf';if(!move_uploaded_file($tmp,$staging.'/'.$entry)) Http::json(['error'=>'تعذّر حفظ ملف PDF.'],500);
        $source='pdf';$storedMime='application/pdf';
    } elseif(in_array($extension,['mp4','webm'],true)) {
        $videoMimes=['mp4'=>['video/mp4','application/mp4'],'webm'=>['video/webm']];
        if(!in_array($mime,$videoMimes[$extension],true)) Http::json(['error'=>'نوع الفيديو الفعلي لا يطابق امتداده.'],422);
        $entry='content.'.$extension;
        if(!move_uploaded_file($tmp,$staging.'/'.$entry)) Http::json(['error'=>'تعذّر حفظ الفيديو.'],500);
        $source='video';$storedMime=$videoMimes[$extension][0];
    } else {
        $allowed=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp','image/gif'=>'gif'];
        if(!isset($allowed[$mime])||@getimagesize($tmp)===false) Http::json(['error'=>'ملف الصورة غير صالح. الأنواع المدعومة PNG وJPG وWebP وGIF.'],422);
        $entry='content.'.$allowed[$mime];if(!move_uploaded_file($tmp,$staging.'/'.$entry)) Http::json(['error'=>'تعذّر حفظ الصورة.'],500);
        $source='image';$storedMime=$mime;
    }
    @chmod($staging.'/'.$entry,0640);
    return ['staging'=>$staging,'entry'=>$entry,'source'=>$source,'mime'=>$storedMime,'size'=>$size,'original'=>$original,'expanded'=>$size];
}

function planning_content_owned(int $teacherId,int $contentId,bool $includeDeleted=false): array
{
    $sql='SELECT * FROM teacher_planning_content WHERE id=? AND teacher_id=?';if(!$includeDeleted)$sql.=' AND deleted_at IS NULL';
    $row=fetch_one($sql.' LIMIT 1',[$contentId,$teacherId]);if(!$row) Http::json(['error'=>'المحتوى غير موجود ضمن حسابكِ.'],404);
    return $row;
}

function planning_content_json(array $row,array $targets=[],array $parentTargets=[]): array
{
    $id=(int)$row['id'];
    return [
        'id'=>$id,'name'=>(string)$row['name'],'stage'=>(string)$row['stage'],'gradeLabel'=>(string)$row['grade_label'],
        'unitNumber'=>(int)$row['unit_number'],'lessonNumber'=>(int)$row['lesson_number'],'lessonName'=>(string)$row['lesson_name'],
        'contentType'=>(string)$row['content_type'],'destination'=>(string)$row['destination'],'sourceType'=>(string)$row['source_type'],
        'originalName'=>(string)$row['original_name'],'mimeType'=>(string)$row['mime_type'],'sizeBytes'=>(int)$row['size_bytes'],
        'status'=>(string)$row['lifecycle_status'],'hasCover'=>!empty($row['cover_entry_file']),'createdAt'=>(string)$row['created_at'],'updatedAt'=>(string)$row['updated_at'],
        'publicationTargets'=>$targets,'publishedClassCount'=>count($targets),
        'parentPublicationTargets'=>$parentTargets,'publishedParentClassCount'=>count($parentTargets),
        'coverUrl'=>!empty($row['cover_entry_file'])?'/planning/content-cover.php?content='.$id.'&v='.rawurlencode((string)$row['updated_at']):'',
        'previewUrl'=>'/planning/content-player.php?content='.$id.'&preview=1',
        'playerUrl'=>'/planning/content-player.php?content='.$id,
    ];
}

function planning_content_teacher_catalog(int $teacherId): never
{
    if(!planning_content_schema_ready()) Http::json(['migrationReady'=>false,'migration'=>PLANNING_CONTENT_MIGRATION,'items'=>[],'classes'=>[]]);
    $rows=fetch_all('SELECT * FROM teacher_planning_content WHERE teacher_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC',[$teacherId]);
    $publications=fetch_all("SELECT p.content_id,p.class_id,p.academic_year,p.semester,c.name AS class_name,c.stage,c.grade_label FROM teacher_planning_content_publications p JOIN classes c ON c.id=p.class_id WHERE p.status='published' AND c.teacher_id=? ORDER BY c.name",[$teacherId]);
    $targets=[];foreach($publications as $row)$targets[(int)$row['content_id']][]=['classId'=>(int)$row['class_id'],'className'=>(string)$row['class_name'],'academicYear'=>(string)$row['academic_year'],'semester'=>(string)$row['semester']];
    $parentReady=planning_content_parent_publication_schema_ready();$parentTargets=[];
    if($parentReady) {
        $parentPublications=fetch_all("SELECT p.content_id,p.class_id,p.academic_year,p.semester,c.name AS class_name,c.stage,c.grade_label FROM teacher_planning_content_parent_publications p JOIN classes c ON c.id=p.class_id WHERE p.status='published' AND c.teacher_id=? ORDER BY c.name",[$teacherId]);
        foreach($parentPublications as $row)$parentTargets[(int)$row['content_id']][]=['classId'=>(int)$row['class_id'],'className'=>(string)$row['class_name'],'academicYear'=>(string)$row['academic_year'],'semester'=>(string)$row['semester']];
    }
    $classes=fetch_all('SELECT id,name,stage AS level,grade_label,academic_year FROM classes WHERE teacher_id=? ORDER BY stage,grade_label,name',[$teacherId]);
    Http::json([
        'migrationReady'=>true,'migration'=>PLANNING_CONTENT_MIGRATION,
        'parentPublicationReady'=>$parentReady,'parentPublicationMigration'=>PLANNING_CONTENT_PARENT_PUBLICATION_MIGRATION,
        'items'=>array_map(static fn(array $row):array=>planning_content_json($row,$targets[(int)$row['id']]??[],$parentTargets[(int)$row['id']]??[]),$rows),
        'classes'=>$classes,
    ]);
}

function planning_content_library_schema(): void
{
    $pdo=Database::connection();
    foreach(['destination'=>['library-worksheets','library-training','library-videos'],'source_type'=>['video']] as $column=>$members) {
        $row=fetch_one("SELECT COLUMN_TYPE AS column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='teacher_planning_content' AND COLUMN_NAME=?",[$column]);
        $type=(string)($row['column_type']??'');
        if(!str_starts_with($type,'enum(')) continue;
        $missing=array_filter($members,static fn(string $value):bool=>!str_contains($type,"'".$value."'"));
        if(!$missing) continue;
        if(!preg_match("/^enum\('[a-z-]+'(?:,'[a-z-]+')*\)$/D",$type)) throw new RuntimeException('Unsupported content schema');
        $expanded=substr($type,0,-1).",'".implode("','",$missing)."')";
        $pdo->exec("ALTER TABLE teacher_planning_content MODIFY COLUMN `".$column."` ".$expanded." NOT NULL");
    }
}

function planning_content_upload(int $teacherId): never
{
    planning_content_require_schema();
    $fields=planning_content_validated_fields($_POST);
    $upload=$_FILES['file']??null;if(!is_array($upload)) Http::json(['error'=>'اختاري ملف المحتوى.'],422);
    if(str_starts_with($fields['destination'],'library-')||in_array(strtolower(pathinfo((string)($upload['name']??''),PATHINFO_EXTENSION)),['mp4','webm'],true)) planning_content_library_schema();
    $package=planning_content_source_upload($upload);$cover=planning_content_validate_cover(isset($_FILES['cover'])&&is_array($_FILES['cover'])?$_FILES['cover']:null,$package['staging']);
    $storageRoot=MADAR_ROOT.'/storage/private/planning-content';if(!is_dir($storageRoot)&&!mkdir($storageRoot,0750,true)&&!is_dir($storageRoot)){planning_content_remove_tree($package['staging']);Http::json(['error'=>'تعذّر تجهيز تخزين المحتوى.'],500);}
    $storageKey=bin2hex(random_bytes(24));$target=$storageRoot.'/'.$storageKey;$moved=false;
    try {
        $id=Database::transaction(function(PDO $pdo)use($teacherId,$fields,$package,$cover,$storageKey,$target,&$moved):int{
            $statement=$pdo->prepare('INSERT INTO teacher_planning_content (teacher_id,name,stage,grade_label,unit_number,lesson_number,lesson_name,content_type,destination,source_type,original_name,mime_type,size_bytes,storage_key,entry_file,cover_original_name,cover_entry_file,cover_mime_type,cover_size_bytes,lifecycle_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,\'draft\')');
            $statement->execute([$teacherId,$fields['name'],$fields['stage'],$fields['grade'],$fields['unit'],$fields['lesson'],$fields['lessonName'],$fields['contentType'],$fields['destination'],$package['source'],$package['original'],$package['mime'],$package['size'],$storageKey,$package['entry'],$cover['original'],$cover['entry'],$cover['mime'],$cover['size']]);
            $id=(int)$pdo->lastInsertId();if(!planning_content_move_tree($package['staging'],$target)) throw new RuntimeException('تعذّر نقل المحتوى إلى التخزين الخاص.');$moved=true;return $id;
        });
    } catch(Throwable $error) {
        if($moved) planning_content_remove_tree($target);else planning_content_remove_tree($package['staging']);
        error_log('[planning-content-upload] '.$error->getMessage());Http::json(['error'=>'تعذّر حفظ المحتوى بأمان. حاولي مرة أخرى.'],500);
    }
    Activity::log('teacher',$teacherId,'رفع محتوى تخطيط',$fields['name']);
    $row=planning_content_owned($teacherId,$id);Http::json(['item'=>planning_content_json($row),'message'=>'تم رفع المحتوى وحفظه كمسودة.'],201);
}

function planning_content_update_settings(int $teacherId,int $contentId): never
{
    planning_content_require_schema();$content=planning_content_owned($teacherId,$contentId);$fields=planning_content_validated_fields($_POST);
    if(str_starts_with($fields['destination'],'library-')) planning_content_library_schema();
    $removeCover=filter_var($_POST['removeCover']??false,FILTER_VALIDATE_BOOLEAN);
    $coverUpload=isset($_FILES['cover'])&&is_array($_FILES['cover'])?$_FILES['cover']:null;
    $hasNewCover=$coverUpload&&(int)($coverUpload['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_NO_FILE;
    $staging=null;$newCover=null;$newCoverPath=null;$disabledCount=0;$disabledParentCount=0;
    if($hasNewCover) {
        $staging=sys_get_temp_dir().'/madar-planning-cover-'.bin2hex(random_bytes(12));
        if(!mkdir($staging,0700,true)) Http::json(['error'=>'تعذّر تجهيز مساحة فحص الغلاف.'],500);
        register_shutdown_function(static function()use($staging):void{planning_content_remove_tree($staging);});
        $newCover=planning_content_validate_cover($coverUpload,$staging,'cover-'.bin2hex(random_bytes(8)));
        $storageKey=(string)$content['storage_key'];
        if(!preg_match('/^[a-f0-9]{24,100}$/',$storageKey)) {planning_content_remove_tree($staging);Http::json(['error'=>'مسار تخزين المحتوى غير صالح.'],500);}
        $storageDirectory=MADAR_ROOT.'/storage/private/planning-content/'.$storageKey;
        if(!is_dir($storageDirectory)) {planning_content_remove_tree($staging);Http::json(['error'=>'تعذّر العثور على مجلد المحتوى.'],500);}
        $source=$staging.'/'.$newCover['entry'];$newCoverPath=$storageDirectory.'/'.$newCover['entry'];
        if(!@rename($source,$newCoverPath)&&(!@copy($source,$newCoverPath)||!@unlink($source))) {planning_content_remove_tree($staging);Http::json(['error'=>'تعذّر استبدال صورة الغلاف بأمان.'],500);}
        @chmod($newCoverPath,0640);
    }
    $scopeChanged=$fields['stage']!==(string)$content['stage']||planning_content_grade_key($fields['stage'],$fields['grade'])!==planning_content_grade_key((string)$content['stage'],(string)$content['grade_label']);
    try {
        $parentPublicationReady=planning_content_parent_publication_schema_ready();
        Database::transaction(function(PDO $pdo)use($teacherId,$contentId,$content,$fields,$newCover,$removeCover,$scopeChanged,$parentPublicationReady,&$disabledCount,&$disabledParentCount):void{
            if($newCover) {
                $sql='UPDATE teacher_planning_content SET name=?,stage=?,grade_label=?,unit_number=?,lesson_number=?,lesson_name=?,content_type=?,destination=?,cover_original_name=?,cover_entry_file=?,cover_mime_type=?,cover_size_bytes=?,updated_at=NOW() WHERE id=? AND teacher_id=? AND deleted_at IS NULL';
                $values=[$fields['name'],$fields['stage'],$fields['grade'],$fields['unit'],$fields['lesson'],$fields['lessonName'],$fields['contentType'],$fields['destination'],$newCover['original'],$newCover['entry'],$newCover['mime'],$newCover['size'],$contentId,$teacherId];
            } elseif($removeCover) {
                $sql='UPDATE teacher_planning_content SET name=?,stage=?,grade_label=?,unit_number=?,lesson_number=?,lesson_name=?,content_type=?,destination=?,cover_original_name=NULL,cover_entry_file=NULL,cover_mime_type=NULL,cover_size_bytes=NULL,updated_at=NOW() WHERE id=? AND teacher_id=? AND deleted_at IS NULL';
                $values=[$fields['name'],$fields['stage'],$fields['grade'],$fields['unit'],$fields['lesson'],$fields['lessonName'],$fields['contentType'],$fields['destination'],$contentId,$teacherId];
            } else {
                $sql='UPDATE teacher_planning_content SET name=?,stage=?,grade_label=?,unit_number=?,lesson_number=?,lesson_name=?,content_type=?,destination=?,updated_at=NOW() WHERE id=? AND teacher_id=? AND deleted_at IS NULL';
                $values=[$fields['name'],$fields['stage'],$fields['grade'],$fields['unit'],$fields['lesson'],$fields['lessonName'],$fields['contentType'],$fields['destination'],$contentId,$teacherId];
            }
            $statement=$pdo->prepare($sql);$statement->execute($values);
            if($scopeChanged) {
                $statement=$pdo->prepare("SELECT p.id,c.stage,c.grade_label FROM teacher_planning_content_publications p JOIN classes c ON c.id=p.class_id WHERE p.content_id=? AND p.status='published'");$statement->execute([$contentId]);$invalid=[];
                foreach($statement->fetchAll(PDO::FETCH_ASSOC) as $publication) {
                    if((string)$publication['stage']!==$fields['stage']||planning_content_grade_key((string)$publication['stage'],(string)$publication['grade_label'])!==planning_content_grade_key($fields['stage'],$fields['grade']))$invalid[]=(int)$publication['id'];
                }
                if($invalid) {
                    $placeholders=implode(',',array_fill(0,count($invalid),'?'));$pdo->prepare("UPDATE teacher_planning_content_publications SET status='disabled',disabled_at=NOW() WHERE id IN ($placeholders)")->execute($invalid);$disabledCount=count($invalid);
                }
                $remaining=$pdo->prepare("SELECT COUNT(*) FROM teacher_planning_content_publications WHERE content_id=? AND status='published'");$remaining->execute([$contentId]);
                if((int)$remaining->fetchColumn()===0&&(string)$content['lifecycle_status']==='published')$pdo->prepare("UPDATE teacher_planning_content SET lifecycle_status='draft',updated_at=NOW() WHERE id=? AND teacher_id=?")->execute([$contentId,$teacherId]);
            }
            if(!$parentPublicationReady||(!$scopeChanged&&$fields['destination']==='semester-plans')) return;
            $statement=$pdo->prepare("SELECT p.id,c.stage,c.grade_label FROM teacher_planning_content_parent_publications p JOIN classes c ON c.id=p.class_id WHERE p.content_id=? AND p.status='published'");$statement->execute([$contentId]);$invalid=[];
            foreach($statement->fetchAll(PDO::FETCH_ASSOC) as $publication) {
                if($fields['destination']!=='semester-plans'||(string)$publication['stage']!==$fields['stage']||planning_content_grade_key((string)$publication['stage'],(string)$publication['grade_label'])!==planning_content_grade_key($fields['stage'],$fields['grade']))$invalid[]=(int)$publication['id'];
            }
            if($invalid) {
                $placeholders=implode(',',array_fill(0,count($invalid),'?'));$pdo->prepare("UPDATE teacher_planning_content_parent_publications SET status='disabled',disabled_at=NOW() WHERE id IN ($placeholders)")->execute($invalid);$disabledParentCount=count($invalid);
            }
        });
    } catch(Throwable $error) {
        if($newCoverPath&&is_file($newCoverPath))@unlink($newCoverPath);if($staging)planning_content_remove_tree($staging);
        error_log('[planning-content-settings] '.$error->getMessage());Http::json(['error'=>'تعذّر حفظ إعدادات المحتوى بأمان. حاولي مرة أخرى.'],500);
    }
    if($staging)planning_content_remove_tree($staging);
    if(($newCover||$removeCover)&&!empty($content['cover_entry_file'])) {
        $oldEntry=planning_content_safe_path((string)$content['cover_entry_file']);$oldPath=$oldEntry?MADAR_ROOT.'/storage/private/planning-content/'.(string)$content['storage_key'].'/'.$oldEntry:null;
        if($oldPath&&$oldPath!==$newCoverPath&&is_file($oldPath)&&!is_link($oldPath))@unlink($oldPath);
    }
    Activity::log('teacher',$teacherId,'تعديل إعدادات محتوى تخطيط',$fields['name']);
    $row=planning_content_owned($teacherId,$contentId);$targets=fetch_all("SELECT p.class_id,p.academic_year,p.semester,c.name AS class_name FROM teacher_planning_content_publications p JOIN classes c ON c.id=p.class_id WHERE p.content_id=? AND p.status='published' AND c.teacher_id=? ORDER BY c.name",[$contentId,$teacherId]);
    $normalizedTargets=array_map(static fn(array $target):array=>['classId'=>(int)$target['class_id'],'className'=>(string)$target['class_name'],'academicYear'=>(string)$target['academic_year'],'semester'=>(string)$target['semester']],$targets);
    $normalizedParentTargets=[];
    if(planning_content_parent_publication_schema_ready()) {
        $parentTargets=fetch_all("SELECT p.class_id,p.academic_year,p.semester,c.name AS class_name FROM teacher_planning_content_parent_publications p JOIN classes c ON c.id=p.class_id WHERE p.content_id=? AND p.status='published' AND c.teacher_id=? ORDER BY c.name",[$contentId,$teacherId]);
        $normalizedParentTargets=array_map(static fn(array $target):array=>['classId'=>(int)$target['class_id'],'className'=>(string)$target['class_name'],'academicYear'=>(string)$target['academic_year'],'semester'=>(string)$target['semester']],$parentTargets);
    }
    $message=($disabledCount+$disabledParentCount)>0?'تم حفظ الإعدادات وإيقاف النشر عن الفصول غير المطابقة.':'تم حفظ إعدادات المحتوى.';
    Http::json(['item'=>planning_content_json($row,$normalizedTargets,$normalizedParentTargets),'message'=>$message,'disabledPublicationCount'=>$disabledCount,'disabledParentPublicationCount'=>$disabledParentCount]);
}

function planning_content_publish(int $teacherId,int $contentId): never
{
    planning_content_require_schema();$content=planning_content_owned($teacherId,$contentId);$data=Http::input();$semester=(string)($data['semester']??'');
    if(!in_array($semester,['first','second'],true)) Http::json(['error'=>'اختاري الفصل الدراسي.'],422);
    $ids=[];foreach((array)($data['classIds']??[]) as $value){$id=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if($id!==false)$ids[(int)$id]=true;}
    if(!$ids) Http::json(['error'=>'اختاري فصلًا واحدًا على الأقل للنشر.'],422);
    $idList=array_keys($ids);$placeholders=implode(',',array_fill(0,count($idList),'?'));
    $classes=fetch_all("SELECT id,name,stage,grade_label,academic_year FROM classes WHERE teacher_id=? AND id IN ($placeholders)",[$teacherId,...$idList]);
    if(count($classes)!==count($idList)) Http::json(['error'=>'أحد الفصول المختارة غير موجود ضمن حسابكِ.'],422);
    $settings=fetch_one('SELECT academic_year FROM teacher_school_settings WHERE teacher_id=? LIMIT 1',[$teacherId])?:[];$settingsYear=trim((string)($settings['academic_year']??''));
    foreach($classes as $class) {
        if((string)$class['stage']!==(string)$content['stage']||planning_content_grade_key((string)$class['stage'],(string)$class['grade_label'])!==planning_content_grade_key((string)$content['stage'],(string)$content['grade_label'])) Http::json(['error'=>'يمكن النشر فقط لفصول المرحلة والصف المحددين في المحتوى.'],422);
        if($settingsYear!==''&&(string)$class['academic_year']!==$settingsYear) Http::json(['error'=>'أحد الفصول لا يتبع العام الدراسي الحالي.'],422);
    }
    Database::transaction(function(PDO $pdo)use($contentId,$teacherId,$semester,$classes,$settingsYear):void{
        $pdo->prepare("UPDATE teacher_planning_content_publications SET status='disabled',disabled_at=NOW() WHERE content_id=?")->execute([$contentId]);
        $statement=$pdo->prepare("INSERT INTO teacher_planning_content_publications (content_id,class_id,academic_year,semester,status,published_at,disabled_at) VALUES (?,?,?,?,'published',NOW(),NULL) ON DUPLICATE KEY UPDATE status='published',published_at=NOW(),disabled_at=NULL");
        foreach($classes as $class)$statement->execute([$contentId,(int)$class['id'],$settingsYear!==''?$settingsYear:(string)$class['academic_year'],$semester]);
        $pdo->prepare("UPDATE teacher_planning_content SET lifecycle_status='published' WHERE id=? AND teacher_id=?")->execute([$contentId,$teacherId]);
    });
    Activity::log('teacher',$teacherId,'نشر محتوى تخطيط',(string)$content['name'].' · '.count($classes).' فصل');
    planning_content_teacher_catalog($teacherId);
}

function planning_content_unpublish(int $teacherId,int $contentId): never
{
    planning_content_require_schema();$content=planning_content_owned($teacherId,$contentId);
    Database::transaction(function(PDO $pdo)use($teacherId,$contentId):void{
        $pdo->prepare("UPDATE teacher_planning_content_publications SET status='disabled',disabled_at=NOW() WHERE content_id=?")->execute([$contentId]);
        $pdo->prepare("UPDATE teacher_planning_content SET lifecycle_status='draft' WHERE id=? AND teacher_id=?")->execute([$contentId,$teacherId]);
    });
    Activity::log('teacher',$teacherId,'إيقاف نشر محتوى تخطيط',(string)$content['name']);Http::json(['ok'=>true,'message'=>'تم إيقاف النشر عن جميع الفصول.']);
}

function planning_content_publish_parents(int $teacherId,int $contentId): never
{
    planning_content_require_schema();planning_content_require_parent_publication_schema();
    $content=planning_content_owned($teacherId,$contentId);
    if((string)$content['destination']!=='semester-plans') Http::json(['error'=>'يمكن نشر الخطط الفصلية فقط لأولياء الأمور.'],422);
    $data=Http::input();$semester=(string)($data['semester']??'');
    if(!in_array($semester,['first','second'],true)) Http::json(['error'=>'اختاري الفصل الدراسي.'],422);
    $ids=[];foreach((array)($data['classIds']??[]) as $value){$id=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if($id!==false)$ids[(int)$id]=true;}
    if(!$ids) Http::json(['error'=>'اختاري فصلًا واحدًا على الأقل للنشر لأولياء الأمور.'],422);
    $idList=array_keys($ids);$placeholders=implode(',',array_fill(0,count($idList),'?'));
    $classes=fetch_all("SELECT id,name,stage,grade_label,academic_year FROM classes WHERE teacher_id=? AND id IN ($placeholders)",[$teacherId,...$idList]);
    if(count($classes)!==count($idList)) Http::json(['error'=>'أحد الفصول المختارة غير موجود ضمن حسابكِ.'],422);
    $settings=fetch_one('SELECT academic_year FROM teacher_school_settings WHERE teacher_id=? LIMIT 1',[$teacherId])?:[];$settingsYear=trim((string)($settings['academic_year']??''));
    foreach($classes as $class) {
        if((string)$class['stage']!==(string)$content['stage']||planning_content_grade_key((string)$class['stage'],(string)$class['grade_label'])!==planning_content_grade_key((string)$content['stage'],(string)$content['grade_label'])) Http::json(['error'=>'يمكن النشر فقط لأولياء أمور فصول المرحلة والصف المحددين في الخطة.'],422);
        if($settingsYear!==''&&(string)$class['academic_year']!==$settingsYear) Http::json(['error'=>'أحد الفصول لا يتبع العام الدراسي الحالي.'],422);
    }
    Database::transaction(function(PDO $pdo)use($contentId,$semester,$classes,$settingsYear):void{
        $pdo->prepare("UPDATE teacher_planning_content_parent_publications SET status='disabled',disabled_at=NOW() WHERE content_id=?")->execute([$contentId]);
        $statement=$pdo->prepare("INSERT INTO teacher_planning_content_parent_publications (content_id,class_id,academic_year,semester,status,published_at,disabled_at) VALUES (?,?,?,?,'published',NOW(),NULL) ON DUPLICATE KEY UPDATE status='published',published_at=NOW(),disabled_at=NULL");
        foreach($classes as $class)$statement->execute([$contentId,(int)$class['id'],$settingsYear!==''?$settingsYear:(string)$class['academic_year'],$semester]);
    });
    Activity::log('teacher',$teacherId,'نشر خطة لأولياء الأمور',(string)$content['name'].' · '.count($classes).' فصل');
    planning_content_teacher_catalog($teacherId);
}

function planning_content_unpublish_parents(int $teacherId,int $contentId): never
{
    planning_content_require_schema();planning_content_require_parent_publication_schema();$content=planning_content_owned($teacherId,$contentId);
    execute_sql("UPDATE teacher_planning_content_parent_publications SET status='disabled',disabled_at=NOW() WHERE content_id=?",[$contentId]);
    Activity::log('teacher',$teacherId,'إيقاف نشر خطة لأولياء الأمور',(string)$content['name']);
    Http::json(['ok'=>true,'message'=>'تم إيقاف نشر الخطة لأولياء الأمور.']);
}

function planning_content_delete(int $teacherId,int $contentId): never
{
    planning_content_require_schema();$content=planning_content_owned($teacherId,$contentId);
    $parentPublicationReady=planning_content_parent_publication_schema_ready();
    Database::transaction(function(PDO $pdo)use($teacherId,$contentId,$parentPublicationReady):void{
        $pdo->prepare("UPDATE teacher_planning_content_publications SET status='disabled',disabled_at=NOW() WHERE content_id=?")->execute([$contentId]);
        if($parentPublicationReady)$pdo->prepare("UPDATE teacher_planning_content_parent_publications SET status='disabled',disabled_at=NOW() WHERE content_id=?")->execute([$contentId]);
        $pdo->prepare("UPDATE teacher_planning_content SET lifecycle_status='disabled',deleted_at=NOW() WHERE id=? AND teacher_id=?")->execute([$contentId,$teacherId]);
    });
    Activity::log('teacher',$teacherId,'حذف محتوى تخطيط',(string)$content['name']);
    Http::json(['ok'=>true,'message'=>'تم حذف المحتوى وإيقاف نشره.']);
}

function planning_content_student_catalog(int $studentId): never
{
    if(!planning_content_schema_ready()) Http::json(['migrationReady'=>false,'migration'=>PLANNING_CONTENT_MIGRATION,'items'=>[]]);
    $rows=fetch_all("SELECT pc.* FROM students s JOIN classes c ON c.id=s.class_id JOIN teacher_school_settings ss ON ss.teacher_id=c.teacher_id JOIN teacher_planning_content_publications p ON p.class_id=c.id AND p.academic_year=c.academic_year AND p.semester=ss.current_semester AND p.status='published' JOIN teacher_planning_content pc ON pc.id=p.content_id AND pc.teacher_id=c.teacher_id AND pc.lifecycle_status='published' AND pc.deleted_at IS NULL WHERE s.id=? AND s.deleted_at IS NULL ORDER BY p.published_at DESC,pc.id DESC",[$studentId]);
    Http::json(['migrationReady'=>true,'migration'=>PLANNING_CONTENT_MIGRATION,'items'=>array_map(static fn(array $row):array=>planning_content_json($row),$rows)]);
}

function planning_content_teacher_routes(string $method,array $segments,int $teacherId): never
{
    if(($segments[0]??'')==='strategies') {
        $strategySegments=array_slice($segments,1);
        if($method==='GET'&&!$strategySegments) strategy_report_catalog($teacherId);
        if($method==='POST'&&!$strategySegments) strategy_report_create($teacherId);
        $reportId=route_id($strategySegments,0);
        if($method==='DELETE'&&count($strategySegments)===1) strategy_report_delete($teacherId,$reportId);
        Http::json(['error'=>'مسار تقارير الاستراتيجيات غير موجود.'],404);
    }
    if(!$segments&&$method==='GET') planning_content_teacher_catalog($teacherId);
    if(!$segments&&$method==='POST') planning_content_upload($teacherId);
    $contentId=route_id($segments,0);$action=$segments[1]??'';
    if($method==='POST'&&$action==='settings') planning_content_update_settings($teacherId,$contentId);
    if($method==='POST'&&$action==='publish') planning_content_publish($teacherId,$contentId);
    if($method==='POST'&&$action==='unpublish') planning_content_unpublish($teacherId,$contentId);
    if($method==='POST'&&$action==='publish-parents') planning_content_publish_parents($teacherId,$contentId);
    if($method==='POST'&&$action==='unpublish-parents') planning_content_unpublish_parents($teacherId,$contentId);
    if($method==='DELETE'&&$action==='') planning_content_delete($teacherId,$contentId);
    Http::json(['error'=>'مسار محتوى التخطيط غير موجود.'],404);
}

function planning_content_student_routes(string $method,array $segments,int $studentId): never
{
    if($method==='GET'&&!$segments) planning_content_student_catalog($studentId);
    Http::json(['error'=>'مسار محتوى التخطيط غير موجود.'],404);
}

function planning_content_parent_allowed(int $contentId,int $parentId,int $teacherId): bool
{
    if(!planning_content_parent_publication_schema_ready()) return false;
    return (bool)fetch_one(
        "SELECT 1 AS ok
         FROM parent_student_links l
         JOIN students s ON s.id=l.student_id AND s.deleted_at IS NULL
         JOIN classes c ON c.id=s.class_id
         JOIN teacher_school_settings ss ON ss.teacher_id=c.teacher_id
         JOIN teacher_planning_content_parent_publications p ON p.content_id=? AND p.class_id=c.id AND p.academic_year=c.academic_year AND p.semester=ss.current_semester AND p.status='published'
         JOIN teacher_planning_content pc ON pc.id=p.content_id AND pc.teacher_id=c.teacher_id AND pc.destination='semester-plans' AND pc.deleted_at IS NULL
         WHERE l.parent_id=? AND l.status='active' AND c.teacher_id=? AND (ss.academic_year='' OR ss.academic_year=p.academic_year)
         LIMIT 1",
        [$contentId,$parentId,$teacherId]
    );
}

function planning_content_authorized_row(int $contentId,bool $preview): array
{
    planning_content_require_schema();$user=Auth::user();if(!$user) throw new RuntimeException('AUTH_REQUIRED');
    $content=fetch_one('SELECT * FROM teacher_planning_content WHERE id=? AND deleted_at IS NULL LIMIT 1',[$contentId]);if(!$content) throw new RuntimeException('NOT_FOUND');
    if(($user['role']??'')==='teacher') {
        if(!$preview||(int)$content['teacher_id']!==(int)$user['id']||!Rbac::allows((string)$user['roleCode'],'content.manage')) throw new RuntimeException('FORBIDDEN');
        return $content;
    }
    if($preview) throw new RuntimeException('FORBIDDEN');
    if(($user['role']??'')==='parent') {
        if(!Rbac::allows((string)$user['roleCode'],'parent.files.view')||!planning_content_parent_allowed($contentId,(int)$user['id'],(int)$content['teacher_id'])) throw new RuntimeException('FORBIDDEN');
        return $content;
    }
    if(($user['role']??'')!=='student') throw new RuntimeException('FORBIDDEN');
    if(remedial_content_allowed('content',$contentId,(int)$user['id'])) return $content;
    $allowed=fetch_one("SELECT 1 AS ok FROM students s JOIN classes c ON c.id=s.class_id JOIN teacher_school_settings ss ON ss.teacher_id=c.teacher_id JOIN teacher_planning_content_publications p ON p.content_id=? AND p.class_id=c.id AND p.academic_year=c.academic_year AND p.semester=ss.current_semester AND p.status='published' WHERE s.id=? AND s.deleted_at IS NULL AND c.teacher_id=? LIMIT 1",[$contentId,(int)$user['id'],(int)$content['teacher_id']]);
    if(!$allowed||(string)$content['lifecycle_status']!=='published') throw new RuntimeException('FORBIDDEN');
    return $content;
}

function planning_content_issue_access(array $content): string
{
    $user=Auth::user();if(!$user||!in_array((string)($user['role']??''),['teacher','student','parent'],true)) throw new RuntimeException('TOKEN_ACTOR');
    $token=bin2hex(random_bytes(32));$directory=MADAR_ROOT.'/storage/private/planning-content-access';
    if(!is_dir($directory)&&!mkdir($directory,0750,true)&&!is_dir($directory)) throw new RuntimeException('TOKEN_STORAGE');
    $payload=json_encode(['contentId'=>(int)$content['id'],'storageKey'=>(string)$content['storage_key'],'role'=>(string)$user['role'],'roleCode'=>(string)($user['roleCode']??''),'userId'=>(int)$user['id'],'expiresAt'=>time()+1800],JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    $path=$directory.'/'.hash('sha256',$token).'.json';if(file_put_contents($path,$payload,LOCK_EX)===false) throw new RuntimeException('TOKEN_WRITE');@chmod($path,0640);return $token;
}

function planning_content_access_row(int $contentId,string $token): ?array
{
    if($contentId<1||!preg_match('/^[a-f0-9]{64}$/',$token)) return null;
    $file=MADAR_ROOT.'/storage/private/planning-content-access/'.hash('sha256',$token).'.json';if(!is_file($file)) return null;
    $payload=json_decode((string)file_get_contents($file),true);if(!is_array($payload)||(int)($payload['contentId']??0)!==$contentId||(int)($payload['expiresAt']??0)<time()) return null;
    $content=fetch_one('SELECT * FROM teacher_planning_content WHERE id=? AND storage_key=? AND deleted_at IS NULL LIMIT 1',[$contentId,(string)($payload['storageKey']??'')]);if(!$content)return null;
    $role=(string)($payload['role']??'');$userId=(int)($payload['userId']??0);
    if($role==='teacher') return (int)$content['teacher_id']===$userId?$content:null;
    if($role==='parent') {
        $roleCode=(string)($payload['roleCode']??Rbac::PARENT);
        return Rbac::allows($roleCode,'parent.files.view')&&planning_content_parent_allowed($contentId,$userId,(int)$content['teacher_id'])?$content:null;
    }
    if($role==='student'&&remedial_content_allowed('content',$contentId,$userId))return $content;
    if($role!=='student'||(string)$content['lifecycle_status']!=='published')return null;
    $allowed=fetch_one("SELECT 1 AS ok FROM students s JOIN classes c ON c.id=s.class_id JOIN teacher_school_settings ss ON ss.teacher_id=c.teacher_id JOIN teacher_planning_content_publications p ON p.content_id=? AND p.class_id=c.id AND p.academic_year=c.academic_year AND p.semester=ss.current_semester AND p.status='published' WHERE s.id=? AND s.deleted_at IS NULL AND c.teacher_id=? LIMIT 1",[$contentId,$userId,(int)$content['teacher_id']]);
    return $allowed?$content:null;
}
