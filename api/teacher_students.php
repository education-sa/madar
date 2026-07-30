<?php
declare(strict_types=1);


function teacher_student_grade_catalog(): array
{
    return [
        'ابتدائي'=>['رابع ابتدائي','خامس ابتدائي','سادس ابتدائي'],
        'متوسط'=>['أول متوسط','ثاني متوسط','ثالث متوسط'],
        'ثانوي'=>['أول ثانوي','ثاني ثانوي','ثالث ثانوي'],
    ];
}

function teacher_student_class_number_from_name(string $name): int
{
    $digits = str_replace(['١','٢','٣','٤'], ['1','2','3','4'], trim($name));
    if (preg_match('/(?:الفصل|فصل|class)\s*(?:رقم\s*)?([1-4])/iu', $digits, $match)) return (int)$match[1];
    if (preg_match('/(?:الفصل|فصل)\s*(الأول|الاول|أول|الثاني|ثاني|الثالث|ثالث|الرابع|رابع)/u', $name, $match)) {
        $word = (string)$match[1];
        if (preg_match('/أول|الأول|الاول/u',$word)) return 1;
        if (preg_match('/ثاني|الثاني/u',$word)) return 2;
        if (preg_match('/ثالث|الثالث/u',$word)) return 3;
        if (preg_match('/رابع|الرابع/u',$word)) return 4;
    }
    if (preg_match('/^\s*([1-4])\s*$/u',$digits,$match) || preg_match('/(?:^|[-–—])\s*([1-4])\s*$/u',$digits,$match)) return (int)$match[1];
    return 0;
}

function teacher_student_validate_class_selection(string $stage, string $gradeLabel, int $classNumber): array
{
    $catalog = teacher_student_grade_catalog();
    if (!isset($catalog[$stage])) Http::json(['error'=>'المرحلة غير صالحة.'],422);
    if (!in_array($gradeLabel, $catalog[$stage], true)) Http::json(['error'=>'الصف لا يتبع المرحلة المختارة.'],422);
    if ($classNumber < 1 || $classNumber > 4) Http::json(['error'=>'الفصل يجب أن يكون من ١ إلى ٤.'],422);
    return [$stage,$gradeLabel,$classNumber];
}

function teacher_student_class_display_name(string $gradeLabel, int $classNumber): string
{
    $digits = [1=>'١',2=>'٢',3=>'٣',4=>'٤'];
    return $gradeLabel . ' - الفصل ' . $digits[$classNumber];
}

function teacher_resolve_student_class(int $teacherId, array $data): array
{
    $classId = (int)($data['classId'] ?? 0);
    if ($classId > 0) {
        $class = fetch_one('SELECT id,name,stage,grade_label,academic_year FROM classes WHERE id=? AND teacher_id=?',[$classId,$teacherId]);
        if (!$class) Http::json(['error'=>'الفصل غير صالح.'],422);
        return $class;
    }

    Http::requireFields($data,['stage','gradeLabel','classNumber']);
    [$stage,$gradeLabel,$classNumber] = teacher_student_validate_class_selection(
        trim((string)$data['stage']),
        trim((string)$data['gradeLabel']),
        (int)$data['classNumber']
    );
    $settings = teacher_school_settings_row($teacherId);
    $academicYear = trim((string)($data['academicYear'] ?? $settings['academic_year'] ?? '')) ?: date('Y');
    $candidates = fetch_all(
        'SELECT id,name,stage,grade_label,academic_year FROM classes WHERE teacher_id=? AND stage=? AND grade_label=? AND academic_year=? ORDER BY id',
        [$teacherId,$stage,$gradeLabel,$academicYear]
    );
    foreach ($candidates as $candidate) {
        if (teacher_student_class_number_from_name((string)$candidate['name']) === $classNumber) return $candidate;
    }
    $name = teacher_student_class_display_name($gradeLabel,$classNumber);
    execute_sql('INSERT INTO classes(teacher_id,name,stage,grade_label,academic_year) VALUES(?,?,?,?,?)',[$teacherId,$name,$stage,$gradeLabel,$academicYear]);
    return ['id'=>(int)Database::connection()->lastInsertId(),'name'=>$name,'stage'=>$stage,'grade_label'=>$gradeLabel,'academic_year'=>$academicYear];
}

function teacher_students_routes(string $method, array $segments, int $teacherId): never
{
    if (($segments[0] ?? '') === 'classes' && $method === 'GET') {
        Http::json(fetch_all('SELECT id,name,stage AS level,grade_label,academic_year FROM classes WHERE teacher_id=? ORDER BY name', [$teacherId]));
    }
    if (($segments[0] ?? '') === 'import' && $method === 'POST') {
        teacher_import_students($teacherId);
    }
    if (($segments[0] ?? '') === 'requests' && count($segments) === 1 && $method === 'GET') {
        teacher_student_registration_requests($teacherId);
    }
    if (($segments[0] ?? '') === 'requests' && isset($segments[1]) && $method === 'PUT') {
        teacher_review_student_registration_request($teacherId, route_id($segments, 1));
    }
    if (!$segments && $method === 'GET') {
        teacher_list_students($teacherId);
    }
    if (!$segments && $method === 'POST') {
        teacher_create_student($teacherId);
    }

    $studentId = route_id($segments, 0);
    if (!teacher_owns_student($teacherId, $studentId)) {
        Http::json(['error' => 'الطالبة غير موجودة ضمن فصولك.'], 404);
    }
    if (($segments[1] ?? '') === 'profile' && $method === 'GET') {
        teacher_student_profile($studentId);
    }
    if (($segments[1] ?? '') === 'notes' && $method === 'POST') {
        $data = Http::input();
        Http::requireFields($data, ['content']);
        execute_sql('INSERT INTO notes (student_id,teacher_id,content) VALUES (?,?,?)', [$studentId,$teacherId,trim((string)$data['content'])]);
        Http::json(['id'=>(int)Database::connection()->lastInsertId(),'content'=>trim((string)$data['content']),'created_at'=>date('Y-m-d H:i:s')],201);
    }
    if (($segments[1] ?? '') === 'attendance' && $method === 'PUT') {
        $data=Http::input();
        Http::requireFields($data,['date','status']);
        $date=DateTimeImmutable::createFromFormat('Y-m-d',(string)$data['date']);
        if (!$date || $date->format('Y-m-d') !== (string)$data['date']) Http::json(['error'=>'تاريخ الحضور غير صالح.'],422);
        $status=(string)$data['status'];
        if (!in_array($status,['present','absent','late','excused'],true)) Http::json(['error'=>'حالة الحضور غير صالحة.'],422);
        execute_sql('INSERT INTO attendance (student_id,attendance_date,status,teacher_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),teacher_id=VALUES(teacher_id)',[$studentId,$data['date'],$status,$teacherId]);
        Activity::log('teacher',$teacherId,'تحديث حضور طالبة',"الطالبة رقم {$studentId}: {$data['date']} {$status}");
        Http::json(['ok'=>true]);
    }
    if (($segments[1] ?? '') === 'assignments' && $method === 'POST') {
        $data=Http::input();
        Http::requireFields($data,['title']);
        $dueDate=trim((string)($data['dueDate']??''))?:null;
        execute_sql('INSERT INTO assignments (student_id,teacher_id,title,status,due_date) VALUES (?,?,?,\'pending\',?)',[$studentId,$teacherId,trim((string)$data['title']),$dueDate]);
        Activity::log('teacher',$teacherId,'إضافة واجب لطالبة',"الطالبة رقم {$studentId}: ".trim((string)$data['title']));
        Http::json(['id'=>(int)Database::connection()->lastInsertId()],201);
    }
    if (($segments[1] ?? '') === 'assignments' && isset($segments[2]) && in_array($method,['PUT','DELETE'],true)) {
        $assignmentId=route_id($segments,2);
        if (!fetch_one('SELECT id FROM assignments WHERE id=? AND student_id=? AND teacher_id=?',[$assignmentId,$studentId,$teacherId])) Http::json(['error'=>'الواجب غير موجود.'],404);
        if ($method==='DELETE') {
            execute_sql('DELETE FROM assignments WHERE id=?',[$assignmentId]);
            Http::json(['ok'=>true]);
        }
        $data=Http::input();
        $status=(string)($data['status']??'pending');
        if (!in_array($status,['pending','completed','late'],true)) Http::json(['error'=>'حالة الواجب غير صالحة.'],422);
        execute_sql('UPDATE assignments SET status=? WHERE id=?',[$status,$assignmentId]);
        Http::json(['ok'=>true]);
    }
    if (($segments[1] ?? '') === 'learning-style' && $method === 'PUT') {
        $data = Http::input();
        $style = (string)($data['style'] ?? 'unknown');
        $valid = ['visual','auditory','reading_writing','kinesthetic','mixed','unknown'];
        if (!in_array($style,$valid,true)) Http::json(['error'=>'نمط التعلم غير صالح.'],422);
        execute_sql('UPDATE students SET learning_style=? WHERE id=?',[$style,$studentId]);
        Activity::log('teacher',$teacherId,'تحديث نمط تعلم',"الطالبة رقم {$studentId}: {$style}");
        Http::json(['ok'=>true,'learning_style'=>$style]);
    }
    if (($segments[1] ?? '') === 'reset-password' && $method === 'PUT') {
        $data=Http::input();
        Http::requireFields($data,['newPassword']);
        Auth::validatePassword((string)$data['newPassword']);
        execute_sql('UPDATE students SET password_hash=?,must_change_password=1 WHERE id=?',[password_hash((string)$data['newPassword'],PASSWORD_DEFAULT),$studentId]);
        Activity::log('teacher',$teacherId,'إعادة تعيين كلمة مرور طالبة',"الطالبة رقم {$studentId}");
        Http::json(['ok'=>true]);
    }
    if ($method === 'PUT') {
        teacher_update_student($teacherId,$studentId);
    }
    if ($method === 'DELETE') {
        Http::json(['error'=>'حذف حسابات المستخدمين متاح لمالك الموقع فقط. يمكنكِ تعديل بيانات الطالبة أو التواصل مع مالكة الموقع لتعطيل الحساب.'],403);
    }
    Http::json(['error'=>'المسار المطلوب غير موجود.'],404);
}

function teacher_list_students(int $teacherId): never
{
    [$page,$pageSize,$offset] = Http::pagination();
    $search = trim((string)($_GET['search'] ?? ''));
    $classId = (int)($_GET['classId'] ?? 0);
    $level = trim((string)($_GET['level'] ?? ''));
    $style = trim((string)($_GET['learningStyle'] ?? ''));
    $where = ['c.teacher_id = ?', 's.deleted_at IS NULL'];
    $params = [$teacherId];
    if ($search !== '') { $where[]='(s.name LIKE ? OR s.email LIKE ?)'; $params[]="%{$search}%"; $params[]="%{$search}%"; }
    if ($classId) { $where[]='s.class_id=?'; $params[]=$classId; }
    if ($level !== '') { $where[]='s.stage=?'; $params[]=$level; }
    if ($style !== '') { $where[]='s.learning_style=?'; $params[]=$style; }
    $whereSql = implode(' AND ',$where);
    $total = (int)(fetch_one("SELECT COUNT(*) AS n FROM students s JOIN classes c ON c.id=s.class_id WHERE {$whereSql}",$params)['n'] ?? 0);
    $stmt = Database::connection()->prepare(
        "SELECT s.id,s.name,s.email,s.stage,s.stage AS level,s.grade_label,s.learning_style,s.progress_percent,s.last_active,s.status,c.name AS class_name,c.id AS class_id
         FROM students s JOIN classes c ON c.id=s.class_id WHERE {$whereSql} ORDER BY s.name LIMIT ? OFFSET ?"
    );
    $index=1;
    foreach ([...$params,$pageSize,$offset] as $value) {
        $stmt->bindValue($index++,$value,is_int($value)?PDO::PARAM_INT:PDO::PARAM_STR);
    }
    $stmt->execute();
    Http::json(['items'=>$stmt->fetchAll(),'total'=>$total,'page'=>$page,'pageSize'=>$pageSize]);
}

function teacher_create_student(int $teacherId): never
{
    $data=Http::input();
    Http::requireFields($data,['name','email']);
    $class=teacher_resolve_student_class($teacherId,$data);
    $classId=(int)$class['id'];
    $email=Http::schoolEmail((string)$data['email']);
    if (fetch_one('SELECT id FROM students WHERE email=?',[$email])) Http::json(['error'=>'البريد مستخدم مسبقًا.'],409);
    $temporary=(string)($data['temporaryPassword'] ?? '');
    if ($temporary !== '') Auth::validatePassword($temporary);
    execute_sql(
        'INSERT INTO students (class_id,name,email,password_hash,stage,grade_label,status) VALUES (?,?,?,?,?,?,?)',
        [$classId,trim((string)$data['name']),$email,$temporary!==''?password_hash($temporary,PASSWORD_DEFAULT):null,$class['stage'],$class['grade_label'],'active']
    );
    $id=(int)Database::connection()->lastInsertId();
    Rbac::assignRole('student',$id,Rbac::STUDENT,null);
    Activity::log('teacher',$teacherId,'إضافة طالبة',trim((string)$data['name']));
    Http::json(['id'=>$id],201);
}

function teacher_update_student(int $teacherId,int $studentId): never
{
    $data=Http::input();
    $hasClassSelection = array_key_exists('classId',$data) || array_key_exists('stage',$data) || array_key_exists('gradeLabel',$data) || array_key_exists('classNumber',$data);
    $class = $hasClassSelection ? teacher_resolve_student_class($teacherId,$data) : null;
    $classId = $class ? (int)$class['id'] : null;
    $email=isset($data['email'])?Http::schoolEmail((string)$data['email']):null;
    if ($email && fetch_one('SELECT id FROM students WHERE email=? AND id<>?',[$email,$studentId])) Http::json(['error'=>'البريد مستخدم مسبقًا.'],409);
    execute_sql(
        'UPDATE students SET name=COALESCE(?,name),email=COALESCE(?,email),class_id=COALESCE(?,class_id),stage=COALESCE(?,stage),grade_label=COALESCE(?,grade_label) WHERE id=?',
        [$data['name']??null,$email,$classId,$class['stage']??null,$class['grade_label']??null,$studentId]
    );
    Http::json(['ok'=>true]);
}

function teacher_student_profile(int $studentId): never
{
    $student=fetch_one('SELECT s.*,s.stage AS level,c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?',[$studentId]);
    $results=fetch_all(
        "SELECT a.id,t.title,t.test_type AS type,IF(a.status IN ('submitted','graded'),'completed',a.status) AS status,a.score,a.total_points,a.percentage,a.submitted_at FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE a.student_id=? ORDER BY a.submitted_at DESC",[$studentId]
    );
    $skills=fetch_all('SELECT sk.name,ss.mastery_percent FROM student_skills ss JOIN skills sk ON sk.id=ss.skill_id WHERE ss.student_id=? ORDER BY ss.mastery_percent DESC',[$studentId]);
    $notes=fetch_all('SELECT n.id,n.content,n.created_at,t.name AS teacher_name FROM notes n JOIN teachers t ON t.id=n.teacher_id WHERE n.student_id=? ORDER BY n.created_at DESC',[$studentId]);
    $attendance=fetch_all('SELECT attendance_date AS date,status FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 30',[$studentId]);
    $assignments=fetch_all('SELECT id,title,status,due_date FROM assignments WHERE student_id=? ORDER BY due_date DESC',[$studentId]);
    $assessments=fetch_all('SELECT result_style,visual_score,auditory_score,reading_writing_score,kinesthetic_score,completed_at FROM learning_style_assessments WHERE student_id=? ORDER BY completed_at DESC LIMIT 5',[$studentId]);
    Http::json(compact('student','results','skills','notes','attendance','assignments','assessments'));
}

function teacher_import_students(int $teacherId): never
{
    if (!isset($_FILES['file']) || ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) Http::json(['error'=>'اختاري ملف Excel أو CSV صالحًا.'],422);
    if (($_FILES['file']['size']??0)>5*1024*1024) Http::json(['error'=>'حجم الملف يتجاوز 5MB.'],422);
    $fileName=(string)($_FILES['file']['name']??'students.csv');
    $extension=mb_strtolower(pathinfo($fileName,PATHINFO_EXTENSION));
    if (!in_array($extension,['xlsx','csv','txt'],true)) Http::json(['error'=>'الصيغ المدعومة هي XLSX وCSV. احفظي ملف Excel القديم بصيغة XLSX ثم أعيدي المحاولة.'],422);

    $table=$extension==='xlsx'
        ? teacher_read_xlsx_table((string)$_FILES['file']['tmp_name'])
        : teacher_read_delimited_table((string)$_FILES['file']['tmp_name']);
    $table=teacher_expand_single_column_table($table);
    [$headerRow,$headerMap]=teacher_find_import_headers($table);
    if ($headerRow<0 || !isset($headerMap['name'],$headerMap['email'])) {
        Http::json(['error'=>'لم أتعرف على أعمدة الاسم والبريد الإلكتروني. تأكدي من وجود عناوين واضحة في أول 30 سطرًا.'],422);
    }

    $classes=fetch_all('SELECT id,name,stage,grade_label FROM classes WHERE teacher_id=? ORDER BY name',[$teacherId]);
    if (!$classes) Http::json(['error'=>'أنشئي فصلًا واحدًا على الأقل قبل استيراد الطالبات.'],422);
    $created=0;$updated=0;$errors=[];
    for ($index=$headerRow+1,$count=count($table);$index<$count;$index++) {
        $row=$table[$index]??[];
        if (!array_filter($row,static fn($value)=>trim((string)$value)!=='')) continue;
        $data=[];
        foreach($headerMap as $key=>$column) $data[$key]=trim((string)($row[$column]??''));
        $rowNo=$index+1;
        $name=trim((string)($data['name']??''));
        $email=Http::schoolEmailOrNull((string)($data['email']??''));
        $temporary=trim((string)($data['temporaryPassword']??''));
        if ($name==='' || $email===null) {
            $errors[]="السطر {$rowNo}: الاسم غير مكتمل أو البريد لا يتبع النطاق @".Http::SCHOOL_EMAIL_DOMAIN.".";
            continue;
        }
        if ($temporary!=='' && (strlen($temporary)<10 || !preg_match('/[A-Za-z]/',$temporary) || !preg_match('/\d/',$temporary))) {
            $errors[]="السطر {$rowNo}: كلمة المرور المؤقتة يجب أن تكون 10 أحرف على الأقل وتحتوي حرفًا ورقمًا.";
            continue;
        }
        $class=teacher_match_import_class($classes,(string)($data['className']??''),(string)($data['stage']??''),(string)($data['gradeLabel']??''));
        if (!$class) {
            $label=trim((string)($data['className']??'')) ?: trim((string)($data['gradeLabel']??'')) ?: 'غير محدد';
            $errors[]="السطر {$rowNo}: لم أجد فصلًا مطابقًا لـ «{$label}».";
            continue;
        }
        try {
            $existing=fetch_one('SELECT s.id,c.teacher_id FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.email=?',[$email]);
            if ($existing && (int)($existing['teacher_id']??0)!==$teacherId) {
                $errors[]="السطر {$rowNo}: البريد مستخدم لطالبة تتبع معلمة أخرى.";
                continue;
            }
            if ($existing) {
                $params=[$class['id'],$name,$class['stage'],$class['grade_label']];
                $sql='UPDATE students SET class_id=?,name=?,stage=?,grade_label=?';
                if ($temporary!=='') {$sql.=',password_hash=?,must_change_password=1';$params[]=password_hash($temporary,PASSWORD_DEFAULT);}
                $sql.=' WHERE id=?';$params[]=(int)$existing['id'];
                execute_sql($sql,$params);
                $updated++;
            } else {
                execute_sql('INSERT INTO students (class_id,name,email,password_hash,stage,grade_label,status) VALUES (?,?,?,?,?,?,\'active\')',[$class['id'],$name,$email,$temporary!==''?password_hash($temporary,PASSWORD_DEFAULT):null,$class['stage'],$class['grade_label']]);
                $created++;
            }
        } catch (PDOException) {
            $errors[]="السطر {$rowNo}: تعذّر حفظ بيانات الطالبة.";
        }
    }
    Activity::log('teacher',$teacherId,'استيراد طالبات',"إضافة {$created} وتحديث {$updated} طالبة من {$fileName}");
    Http::json(compact('created','updated','errors'));
}

function teacher_read_delimited_table(string $path): array
{
    $content=file_get_contents($path);
    if ($content===false) Http::json(['error'=>'تعذّر قراءة الملف المرفوع.'],422);
    if (!mb_check_encoding($content,'UTF-8')) {
        $encoding=mb_detect_encoding($content,['Windows-1256','ISO-8859-6','Windows-1252'],true)?:'Windows-1256';
        $content=mb_convert_encoding($content,'UTF-8',$encoding);
    }
    $content=preg_replace('/^\xEF\xBB\xBF/','',$content)??$content;
    $delimiter=teacher_detect_csv_delimiter($content);
    $stream=fopen('php://temp','w+b');
    fwrite($stream,$content);rewind($stream);
    $rows=[];
    while(($row=fgetcsv($stream,0,$delimiter))!==false) $rows[]=array_map(static fn($value)=>trim((string)$value),$row);
    fclose($stream);
    return $rows;
}

function teacher_detect_csv_delimiter(string $content): string
{
    $lines=preg_split('/\r\n|\r|\n/',$content)?:[];
    foreach(array_slice($lines,0,5) as $line) {
        if (preg_match('/^\s*sep=(.)\s*$/i',trim((string)$line),$match)) return $match[1];
    }
    $candidates=[",",";","\t"];$best=",";$bestScore=1;
    foreach($candidates as $candidate) {
        $counts=[];
        foreach(array_slice($lines,0,20) as $line) {
            if (trim((string)$line)==='') continue;
            $counts[]=count(str_getcsv((string)$line,$candidate));
        }
        $score=$counts?max($counts):1;
        if ($score>$bestScore) {$best=$candidate;$bestScore=$score;}
    }
    return $best;
}

function teacher_read_xlsx_table(string $path): array
{
    if (!class_exists('ZipArchive')) {
        Http::json(['error'=>'الخادم يحتاج إضافة PHP Zip لقراءة ملفات XLSX. يمكنكِ استخدام CSV مؤقتًا.'],500);
    }
    $zip=new ZipArchive();
    if ($zip->open($path)!==true) Http::json(['error'=>'ملف XLSX غير صالح أو تالف.'],422);

    $shared=teacher_xlsx_shared_strings($zip);
    $sheetPath=teacher_xlsx_first_sheet_path($zip);
    if ($sheetPath==='') {
        $zip->close();
        Http::json(['error'=>'لم أجد ورقة بيانات داخل ملف Excel.'],422);
    }
    $sheetXml=$zip->getFromName($sheetPath);
    if ($sheetXml===false) {
        $zip->close();
        Http::json(['error'=>'تعذّر فتح ورقة البيانات داخل ملف Excel.'],422);
    }
    $rows=teacher_xlsx_rows_from_xml($sheetXml,$shared);
    $zip->close();
    if ($rows===null) {
        Http::json(['error'=>'تعذّر قراءة ورقة Excel. أعيدي حفظ الملف بصيغة XLSX أو استخدمي نموذج مدار، ثم حاولي مرة أخرى.'],422);
    }
    return $rows;
}

/**
 * Read one or more worksheets while preserving their visible Excel names.
 * This is used by the question-bank importer because curriculum workbooks
 * often place instructions on the first sheet and the real questions on
 * later sheets such as "اختيار من متعدد" and "صح وخطأ".
 *
 * @return array<string,array<int,array<int,string>>>
 */
function teacher_read_xlsx_sheets(string $path,array $preferredNames=[]): array
{
    if (!class_exists('ZipArchive')) {
        Http::json(['error'=>'الخادم يحتاج إضافة PHP Zip لقراءة ملفات XLSX.'],500);
    }
    $zip=new ZipArchive();
    if ($zip->open($path)!==true) Http::json(['error'=>'ملف XLSX غير صالح أو تالف.'],422);
    $shared=teacher_xlsx_shared_strings($zip);
    $paths=teacher_xlsx_sheet_paths($zip);
    if (!$paths) {
        $zip->close();
        Http::json(['error'=>'لم أجد أوراق بيانات داخل ملف Excel.'],422);
    }

    $wanted=[];
    if ($preferredNames) {
        $normalizedPreferred=array_map('teacher_question_bank_normalize_header',$preferredNames);
        foreach($paths as $name=>$sheetPath) {
            if (in_array(teacher_question_bank_normalize_header($name),$normalizedPreferred,true)) $wanted[$name]=$sheetPath;
        }
    }
    if (!$wanted) $wanted=$paths;

    $tables=[];
    foreach($wanted as $name=>$sheetPath) {
        $sheetXml=$zip->getFromName($sheetPath);
        if ($sheetXml===false) continue;
        $rows=teacher_xlsx_rows_from_xml($sheetXml,$shared);
        if ($rows!==null) $tables[$name]=$rows;
    }
    $zip->close();
    if (!$tables) Http::json(['error'=>'تعذّر قراءة أوراق Excel الموجودة في الملف.'],422);
    return $tables;
}

function teacher_xlsx_sanitize_xml(string $xml,bool $repairAmpersands=false): string
{
    $xml=preg_replace('/^\xEF\xBB\xBF/','',$xml)??$xml;
    $xml=preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/','',$xml)??$xml;
    if ($repairAmpersands) {
        $xml=preg_replace('/&(?!#\d+;|#x[0-9A-Fa-f]+;|[A-Za-z_][A-Za-z0-9_.:-]*;)/','&amp;',$xml)??$xml;
    }
    return $xml;
}

function teacher_xlsx_load_xml(string $xml)
{
    if (!function_exists('simplexml_load_string')) return false;
    $previous=libxml_use_internal_errors(true);
    $flags=LIBXML_NONET|LIBXML_NOCDATA;
    if (defined('LIBXML_PARSEHUGE')) $flags|=LIBXML_PARSEHUGE;
    $clean=teacher_xlsx_sanitize_xml($xml,false);
    $document=simplexml_load_string($clean,'SimpleXMLElement',$flags);
    if ($document===false) {
        libxml_clear_errors();
        $document=simplexml_load_string(teacher_xlsx_sanitize_xml($xml,true),'SimpleXMLElement',$flags);
    }
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    return $document;
}

function teacher_xlsx_shared_strings(ZipArchive $zip): array
{
    $xml=$zip->getFromName('xl/sharedStrings.xml');
    if ($xml===false) return [];
    $shared=[];
    $document=teacher_xlsx_load_xml($xml);
    if ($document!==false) {
        foreach($document->xpath('//*[local-name()="si"]')?:[] as $item) {
            $parts=$item->xpath('.//*[local-name()="t"]')?:[];
            $shared[]=implode('',array_map(static fn($part)=>(string)$part,$parts));
        }
        return $shared;
    }
    $clean=teacher_xlsx_sanitize_xml($xml,true);
    if (preg_match_all('/<si\b[^>]*>(.*?)<\/si>/si',$clean,$items)) {
        foreach($items[1] as $itemXml) {
            $parts=[];
            if (preg_match_all('/<t\b[^>]*>(.*?)<\/t>/si',(string)$itemXml,$texts)) {
                foreach($texts[1] as $value) $parts[]=html_entity_decode(strip_tags((string)$value),ENT_QUOTES|ENT_XML1,'UTF-8');
            }
            $shared[]=implode('',$parts);
        }
    }
    return $shared;
}

function teacher_xlsx_first_sheet_path(ZipArchive $zip): string
{
    $paths=teacher_xlsx_sheet_paths($zip);
    return (string)(array_values($paths)[0]??'');
}

/** @return array<string,string> worksheet name => archive path */
function teacher_xlsx_sheet_paths(ZipArchive $zip): array
{
    $workbook=$zip->getFromName('xl/workbook.xml');
    $relationships=$zip->getFromName('xl/_rels/workbook.xml.rels');
    $sheetRefs=[];$relationshipTargets=[];
    if ($workbook!==false) {
        $document=teacher_xlsx_load_xml($workbook);
        if ($document!==false) {
            foreach($document->xpath('//*[local-name()="sheets"]/*[local-name()="sheet"]')?:[] as $sheet) {
                $attributes=$sheet->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships');
                $rid=(string)($attributes['id']??'');
                $name=trim((string)($sheet['name']??''));
                if ($rid!=='') $sheetRefs[]=['name'=>$name?:('ورقة '.(count($sheetRefs)+1)),'rid'=>$rid];
            }
        }
        if (!$sheetRefs&&preg_match_all('/<sheet\b[^>]*\bname=["\']([^"\']+)["\'][^>]*(?:r:id|id)=["\']([^"\']+)["\']/i',teacher_xlsx_sanitize_xml($workbook,true),$matches,PREG_SET_ORDER)) {
            foreach($matches as $match) $sheetRefs[]=['name'=>html_entity_decode((string)$match[1],ENT_QUOTES|ENT_XML1,'UTF-8'),'rid'=>(string)$match[2]];
        }
    }
    if ($relationships!==false) {
        $document=teacher_xlsx_load_xml($relationships);
        if ($document!==false) {
            foreach($document->xpath('//*[local-name()="Relationship"]')?:[] as $relationship) {
                $relationshipTargets[(string)$relationship['Id']]=(string)$relationship['Target'];
            }
        }
        if (!$relationshipTargets&&preg_match_all('/<Relationship\b([^>]*)\/?>/i',teacher_xlsx_sanitize_xml($relationships,true),$matches,PREG_SET_ORDER)) {
            foreach($matches as $match) {
                $attributes=(string)$match[1];$id='';$target='';
                if (preg_match('/\bId=["\']([^"\']+)["\']/i',$attributes,$idMatch)) $id=(string)$idMatch[1];
                if (preg_match('/\bTarget=["\']([^"\']+)["\']/i',$attributes,$targetMatch)) $target=(string)$targetMatch[1];
                if ($id!==''&&$target!=='') $relationshipTargets[$id]=$target;
            }
        }
    }
    $resolved=[];
    foreach($sheetRefs as $sheet) {
        $target=(string)($relationshipTargets[$sheet['rid']]??'');
        if ($target==='') continue;
        $target=str_replace('\\','/',$target);
        $path=str_starts_with($target,'/')?ltrim($target,'/'):'xl/'.ltrim($target,'/');
        $parts=[];
        foreach(explode('/',$path) as $part) {
            if ($part===''||$part==='.') continue;
            if ($part==='..') array_pop($parts); else $parts[]=$part;
        }
        $path=implode('/',$parts);
        if ($zip->locateName($path)!==false) $resolved[(string)$sheet['name']]=$path;
    }
    if ($resolved) return $resolved;
    $candidates=[];
    for($i=0;$i<$zip->numFiles;$i++) {
        $name=(string)($zip->statIndex($i)['name']??'');
        if (preg_match('#^xl/worksheets/[^/]+\.xml$#i',$name)) $candidates[]=$name;
    }
    natsort($candidates);
    $fallback=[];
    foreach(array_values($candidates) as $index=>$path) $fallback['ورقة '.($index+1)]=$path;
    return $fallback;
}

function teacher_xlsx_rows_from_xml(string $sheetXml,array $shared): ?array
{
    $document=teacher_xlsx_load_xml($sheetXml);
    if ($document!==false) {
        $rows=[];
        foreach($document->xpath('//*[local-name()="sheetData"]/*[local-name()="row"]')?:[] as $rowNode) {
            $row=[];$nextColumn=0;
            foreach($rowNode->xpath('./*[local-name()="c"]')?:[] as $cell) {
                $reference=(string)$cell['r'];
                $column=$reference!==''?teacher_xlsx_column_index($reference):$nextColumn;
                $nextColumn=$column+1;
                $type=(string)$cell['t'];
                if ($type==='inlineStr') {
                    $parts=$cell->xpath('.//*[local-name()="t"]')?:[];
                    $value=implode('',array_map(static fn($part)=>(string)$part,$parts));
                } else {
                    $valueNode=$cell->xpath('./*[local-name()="v"]');
                    $value=(string)($valueNode[0]??'');
                    if ($type==='s') $value=(string)($shared[(int)$value]??'');
                    elseif ($type==='b') $value=$value==='1'?'صح':'خطأ';
                }
                $row[$column]=trim($value);
            }
            if ($row) {
                ksort($row);$last=max(array_keys($row));$filled=[];
                for($column=0;$column<=$last;$column++) $filled[]=$row[$column]??'';
                $rows[]=$filled;
            }
        }
        return $rows;
    }

    $clean=teacher_xlsx_sanitize_xml($sheetXml,true);
    if (!preg_match('/<sheetData\b[^>]*>(.*?)<\/sheetData>/si',$clean,$sheetData)) return null;
    $rows=[];
    if (!preg_match_all('/<row\b[^>]*>(.*?)<\/row>/si',(string)$sheetData[1],$rowMatches)) return [];
    foreach($rowMatches[1] as $rowXml) {
        $row=[];$nextColumn=0;
        if (!preg_match_all('/<c\b([^>]*)>(.*?)<\/c>/si',(string)$rowXml,$cellMatches,PREG_SET_ORDER)) continue;
        foreach($cellMatches as $cellMatch) {
            $attributes=(string)$cellMatch[1];$content=(string)$cellMatch[2];
            $reference='';$type='';
            if (preg_match('/\br=["\']([^"\']+)["\']/i',$attributes,$match)) $reference=(string)$match[1];
            if (preg_match('/\bt=["\']([^"\']+)["\']/i',$attributes,$match)) $type=(string)$match[1];
            $column=$reference!==''?teacher_xlsx_column_index($reference):$nextColumn;$nextColumn=$column+1;
            $value='';
            if ($type==='inlineStr') {
                if (preg_match_all('/<t\b[^>]*>(.*?)<\/t>/si',$content,$texts)) {
                    $value=implode('',array_map(static fn($item)=>html_entity_decode(strip_tags((string)$item),ENT_QUOTES|ENT_XML1,'UTF-8'),$texts[1]));
                }
            } elseif (preg_match('/<v\b[^>]*>(.*?)<\/v>/si',$content,$valueMatch)) {
                $value=html_entity_decode(strip_tags((string)$valueMatch[1]),ENT_QUOTES|ENT_XML1,'UTF-8');
                if ($type==='s') $value=(string)($shared[(int)$value]??'');
                elseif ($type==='b') $value=$value==='1'?'صح':'خطأ';
            }
            $row[$column]=trim($value);
        }
        if ($row) {
            ksort($row);$last=max(array_keys($row));$filled=[];
            for($column=0;$column<=$last;$column++) $filled[]=$row[$column]??'';
            $rows[]=$filled;
        }
    }
    return $rows;
}

function teacher_xlsx_column_index(string $reference): int
{
    preg_match('/^[A-Z]+/i',$reference,$match);$letters=mb_strtoupper($match[0]??'A');$index=0;
    for($i=0,$length=strlen($letters);$i<$length;$i++) $index=$index*26+(ord($letters[$i])-64);
    return max(0,$index-1);
}

function teacher_expand_single_column_table(array $table): array
{
    $maxColumns=0;$sample=[];
    foreach(array_slice($table,0,30) as $row) {
        $nonEmpty=array_values(array_filter($row,static fn($value)=>trim((string)$value)!==''));
        $maxColumns=max($maxColumns,count($nonEmpty));
        if (isset($nonEmpty[0])) $sample[]=$nonEmpty[0];
    }
    if ($maxColumns>1) return $table;
    $delimiter=teacher_detect_csv_delimiter(implode("\n",$sample));
    if (!array_filter($sample,static fn($line)=>count(str_getcsv((string)$line,$delimiter))>1)) return $table;
    return array_map(static fn($row)=>str_getcsv((string)($row[0]??''),$delimiter),$table);
}

function teacher_normalize_import_text(string $value): string
{
    $value=trim(mb_strtolower(str_replace("\xEF\xBB\xBF",'', $value),'UTF-8'));
    $value=str_replace(['أ','إ','آ','ى','ة','ـ'],['ا','ا','ا','ي','ه',''],$value);
    $value=preg_replace('/[ًٌٍَُِّْ]/u','',$value)??$value;
    $value=preg_replace('/[^\p{L}\p{N}]+/u',' ',$value)??$value;
    return trim(preg_replace('/\s+/u',' ',$value)??$value);
}

function teacher_import_header_key(string $header): ?string
{
    $value=teacher_normalize_import_text($header);
    if ($value==='') return null;
    if (in_array($value,['email','e mail','البريد','البريد الالكتروني','اسم المستخدم','username','user name'],true) || str_contains($value,'بريد')) return 'email';
    if (in_array($value,['class','class name','الفصل','اسم الفصل','الشعبه','اسم الشعبه'],true) || str_contains($value,'فصل') || str_contains($value,'شعبه')) return 'className';
    if (in_array($value,['stage','level','المرحله','المرحله الدراسيه','المستوي'],true) || str_contains($value,'مرحله')) return 'stage';
    if (in_array($value,['grade','grade label','الصف','الصف الدراسي'],true)) return 'gradeLabel';
    if (str_contains($value,'كلمه المرور') || in_array($value,['temporary password','password'],true)) return 'temporaryPassword';
    if (in_array($value,['name','full name','الاسم','الاسم الكامل','اسم الطالبه','اسم الطالب'],true) || str_contains($value,'اسم الطال')) return 'name';
    return null;
}

function teacher_find_import_headers(array $table): array
{
    $bestRow=-1;$bestMap=[];$bestScore=0;
    foreach(array_slice($table,0,30,true) as $rowIndex=>$row) {
        $map=[];
        foreach($row as $column=>$header) {
            $key=teacher_import_header_key((string)$header);
            if ($key!==null && !isset($map[$key])) $map[$key]=(int)$column;
        }
        $score=count($map)+(isset($map['name'])?2:0)+(isset($map['email'])?2:0)+(isset($map['className'])?1:0);
        if ($score>$bestScore) {$bestScore=$score;$bestRow=(int)$rowIndex;$bestMap=$map;}
    }
    return [$bestRow,$bestMap];
}

function teacher_match_import_class(array $classes,string $className,string $stage,string $gradeLabel): ?array
{
    $classKey=teacher_normalize_import_text($className);
    $stageKey=teacher_normalize_import_text($stage);
    $gradeKey=teacher_normalize_import_text($gradeLabel);
    $matches=[];
    foreach($classes as $class) {
        $nameKey=teacher_normalize_import_text((string)$class['name']);
        $classStage=teacher_normalize_import_text((string)$class['stage']);
        $classGrade=teacher_normalize_import_text((string)$class['grade_label']);
        if ($classKey!=='' && $nameKey===$classKey) return $class;
        $nameMatches=$classKey!=='' && (str_contains($nameKey,$classKey) || str_contains($classKey,$nameKey));
        $gradeMatches=$gradeKey!=='' && $classGrade===$gradeKey;
        $stageMatches=$stageKey==='' || $classStage===$stageKey;
        if (($nameMatches || ($classKey==='' && $gradeMatches)) && $stageMatches) $matches[]=$class;
    }
    if (count($matches)===1) return $matches[0];
    if ($classKey==='' && $gradeKey==='' && count($classes)===1) return $classes[0];
    return null;
}
