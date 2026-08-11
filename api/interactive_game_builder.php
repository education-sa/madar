<?php
declare(strict_types=1);

const INTERACTIVE_GAME_BUILDER_MIGRATION = 'migration_20260810_interactive_game_builder.sql';
const INTERACTIVE_GAME_PACKAGE_MAX_BYTES = 20971520;
const INTERACTIVE_GAME_PACKAGE_MAX_EXPANDED_BYTES = 52428800;
const INTERACTIVE_GAME_PACKAGE_MAX_FILE_BYTES = 10485760;
const INTERACTIVE_GAME_PACKAGE_MAX_FILES = 200;

function interactive_game_builder_schema_ready(): bool
{
    static $ready = null;
    if ($ready !== null) return $ready;
    $tables = [
        'interactive_game_versions','interactive_game_questions','interactive_game_question_skills',
        'interactive_game_version_skills','interactive_game_publications','interactive_game_attempt_answers',
        'interactive_game_attempt_skills',
    ];
    foreach ($tables as $table) {
        if (!fetch_one('SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1',[$table])) {
            return $ready = false;
        }
    }
    $columns = fetch_all(
        "SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='teacher_interactive_games'"
    );
    $available = array_fill_keys(array_map(static fn(array $row): string => (string)$row['name'],$columns),true);
    foreach (['name','source_type','lifecycle_status','current_version_id','deleted_at'] as $column) {
        if (!isset($available[$column])) return $ready = false;
    }
    $attemptColumns=fetch_all(
        "SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='game_attempts'"
    );
    $attemptAvailable=array_fill_keys(array_map(static fn(array $row):string=>(string)$row['name'],$attemptColumns),true);
    foreach(['game_id','game_version_id','publication_id','result_source','run_token_hash','run_status','run_state_json'] as $column) {
        if(!isset($attemptAvailable[$column]))return $ready=false;
    }
    return $ready = true;
}

function interactive_game_builder_require_schema(): void
{
    if (interactive_game_builder_schema_ready()) return;
    Http::json([
        'error'=>'يلزم تشغيل ملف '.INTERACTIVE_GAME_BUILDER_MIGRATION.' مرة واحدة بعد مراجعته لتفعيل إنشاء واستيراد الألعاب.',
        'code'=>'INTERACTIVE_GAME_BUILDER_MIGRATION_REQUIRED',
        'migration'=>INTERACTIVE_GAME_BUILDER_MIGRATION,
    ],503);
}

function interactive_game_builder_key(mixed $value): string
{
    $key=strtolower(trim((string)$value));
    if(!preg_match('/^[a-z0-9][a-z0-9-]{1,99}$/',$key)) {
        Http::json(['error'=>'معرّف اللعبة يجب أن يتكوّن من حروف إنجليزية صغيرة وأرقام وشرطة فقط.'],422);
    }
    return $key;
}

function interactive_game_builder_text(mixed $value,string $label,int $max,bool $required=true): string
{
    $text=trim((string)$value);
    if($required&&$text==='') Http::json(['error'=>'يرجى إدخال '.$label.'.'],422);
    if(mb_strlen($text)>$max) Http::json(['error'=>$label.' أطول من الحد المسموح.'],422);
    return $text;
}

function interactive_game_builder_bool(mixed $value,bool $default=false): bool
{
    if($value===null) return $default;
    $parsed=filter_var($value,FILTER_VALIDATE_BOOLEAN,FILTER_NULL_ON_FAILURE);
    return $parsed ?? $default;
}

function interactive_game_builder_positive_int(mixed $value,string $label,int $max,bool $required=true): ?int
{
    if($value===null||$value==='') {
        if($required) Http::json(['error'=>'يرجى إدخال '.$label.'.'],422);
        return null;
    }
    $number=filter_var($value,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>$max]]);
    if($number===false) Http::json(['error'=>$label.' غير صالح.'],422);
    return (int)$number;
}

function interactive_game_builder_json_encode(mixed $value): string
{
    try {
        return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    } catch(JsonException) {
        Http::json(['error'=>'تعذّر تجهيز بيانات اللعبة للحفظ.'],422);
    }
}

function interactive_game_builder_json_decode(mixed $value,mixed $fallback=[]): mixed
{
    if(is_array($value)) return $value;
    if($value===null||$value==='') return $fallback;
    $decoded=json_decode((string)$value,true);
    return json_last_error()===JSON_ERROR_NONE?$decoded:$fallback;
}

function interactive_game_builder_skill_ids(int $teacherId,mixed $value,string $stage,string $grade): array
{
    $ids=[];
    foreach(is_array($value)?$value:[] as $item) {
        $id=filter_var($item,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($id!==false) $ids[(int)$id]=true;
    }
    $ids=array_keys($ids);
    if(!$ids) return [];
    $placeholders=implode(',',array_fill(0,count($ids),'?'));
    $rows=fetch_all("SELECT id,stage,grade_label FROM skills WHERE id IN ($placeholders)",$ids);
    if(count($rows)!==count($ids)) Http::json(['error'=>'إحدى المهارات المختارة غير موجودة.'],422);
    foreach($rows as $row) {
        if($stage!=='all'&&(string)$row['stage']!==$stage) Http::json(['error'=>'إحدى المهارات لا تتبع المرحلة المختارة.'],422);
        if($grade!=='all'&&interactive_game_normalize_grade_label($stage,(string)$row['grade_label'])!==interactive_game_normalize_grade_label($stage,$grade)) {
            Http::json(['error'=>'إحدى المهارات لا تتبع الصف المختار.'],422);
        }
    }
    return $ids;
}

function interactive_game_builder_metadata(int $teacherId,array $data,?array $current=null): array
{
    $source=(string)($data['sourceType']??$current['source_type']??'template');
    if(!in_array($source,['template','package'],true)) Http::json(['error'=>'نوع مصدر اللعبة غير صالح.'],422);
    $template=$data['templateType']??$current['template_type']??null;
    if($source==='template'&&!in_array($template,['multiple_choice','true_false','matching','ordering'],true)) {
        Http::json(['error'=>'اختاري قالبًا صالحًا للعبة.'],422);
    }
    if($source==='package') $template=null;
    $stage=(string)($data['stage']??$current['stage']??'all');
    $grade=(string)($data['gradeLabel']??$current['grade_label']??'all');
    [$stage,$grade]=interactive_game_target($stage,$grade);
    $difficulties=[];
    foreach((array)($data['difficulties']??interactive_game_builder_json_decode($current['allowed_difficulties_json']??null,['easy','medium','hard'])) as $difficulty) {
        if(in_array($difficulty,['easy','medium','hard'],true)) $difficulties[$difficulty]=true;
    }
    if(!$difficulties) Http::json(['error'=>'اختاري مستوى صعوبة واحدًا على الأقل.'],422);
    $timeMode=(string)($data['timeMode']??$current['time_mode']??'open');
    if(!in_array($timeMode,['open','timed'],true)) Http::json(['error'=>'نوع الوقت غير صالح.'],422);
    $timeSeconds=$timeMode==='timed'
        ? interactive_game_builder_positive_int($data['timePerQuestionSeconds']??$current['time_per_question_seconds']??null,'وقت السؤال',600)
        : null;
    $questionCount=interactive_game_builder_positive_int($data['questionCount']??$current['question_count']??10,'عدد الأسئلة',200);
    $unit=interactive_game_builder_positive_int($data['unitNumber']??$current['unit_number']??null,'رقم الوحدة',999);
    $lesson=interactive_game_builder_positive_int($data['lessonNumber']??$current['lesson_number']??null,'رقم الدرس',999);
    $pointsEnabled=interactive_game_builder_bool($data['pointsEnabled']??$current['points_enabled']??false);
    $pointsValue=$pointsEnabled
        ? interactive_game_builder_positive_int($data['pointsValue']??$current['points_value']??null,'نقاط إكمال اللعبة',1000)
        : 0;
    $skills=interactive_game_builder_skill_ids($teacherId,$data['skillIds']??[],$stage,$grade);
    return [
        'gameKey'=>interactive_game_builder_key($data['gameKey']??$current['game_key']??''),
        'name'=>interactive_game_builder_text($data['name']??$current['name']??'','اسم اللعبة',190),
        'description'=>interactive_game_builder_text($data['description']??$current['description']??'','وصف اللعبة',2000,false),
        'subjectName'=>interactive_game_builder_text($data['subjectName']??$current['subject_name']??'','المادة',190),
        'lessonName'=>interactive_game_builder_text($data['lessonName']??$current['lesson_name']??'','اسم الدرس',190),
        'unitNumber'=>$unit,'lessonNumber'=>$lesson,'stage'=>$stage,'gradeLabel'=>$grade,
        'semester'=>interactive_game_semester($data['semester']??$current['semester']??''),
        'sourceType'=>$source,'templateType'=>$template,'questionCount'=>$questionCount,
        'difficulties'=>array_keys($difficulties),'timeMode'=>$timeMode,'timeSeconds'=>$timeSeconds,
        'certificateEnabled'=>interactive_game_builder_bool($data['certificateEnabled']??$current['certificate_portfolio_enabled']??true,true),
        'pointsEnabled'=>$pointsEnabled,'pointsValue'=>(int)$pointsValue,'skillIds'=>$skills,
    ];
}

function interactive_game_builder_questions(array $data,string $templateType,array $globalSkillIds): array
{
    $questions=$data['questions']??null;
    if(!is_array($questions)||count($questions)<1||count($questions)>200) {
        Http::json(['error'=>'أضيفي سؤالًا واحدًا على الأقل، والحد الأقصى 200 سؤال.'],422);
    }
    $normalized=[];
    foreach(array_values($questions) as $index=>$question) {
        if(!is_array($question)) Http::json(['error'=>'بيانات السؤال رقم '.($index+1).' غير صالحة.'],422);
        $type=(string)($question['type']??$templateType);
        if($type!==$templateType) Http::json(['error'=>'نوع السؤال رقم '.($index+1).' لا يطابق قالب اللعبة.'],422);
        $prompt=interactive_game_builder_text($question['prompt']??'','نص السؤال رقم '.($index+1),4000);
        $explanation=interactive_game_builder_text($question['explanation']??'','شرح الإجابة',4000,false);
        $points=interactive_game_builder_positive_int($question['points']??1,'درجة السؤال رقم '.($index+1),1000);
        $difficulty=(string)($question['difficulty']??'medium');
        if(!in_array($difficulty,['easy','medium','hard'],true)) Http::json(['error'=>'مستوى السؤال رقم '.($index+1).' غير صالح.'],422);
        $options=$question['options']??[];$correct=$question['correctAnswer']??null;
        if($type==='multiple_choice') {
            if(!is_array($options)||count($options)<2||count($options)>8) Http::json(['error'=>'السؤال رقم '.($index+1).' يحتاج من خيارين إلى 8 خيارات.'],422);
            $options=array_map(static fn($item):string=>trim((string)$item),array_values($options));
            if(in_array('', $options,true)) Http::json(['error'=>'لا تتركي خيارًا فارغًا في السؤال رقم '.($index+1).'.'],422);
            $correct=filter_var($correct,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>count($options)-1]]);
            if($correct===false) Http::json(['error'=>'حددي الإجابة الصحيحة للسؤال رقم '.($index+1).'.'],422);
        } elseif($type==='true_false') {
            $options=['صح','خطأ'];
            if(!is_bool($correct)) {
                $correct=filter_var($correct,FILTER_VALIDATE_BOOLEAN,FILTER_NULL_ON_FAILURE);
                if($correct===null) Http::json(['error'=>'حددي صح أو خطأ للسؤال رقم '.($index+1).'.'],422);
            }
        } elseif($type==='matching') {
            if(!is_array($options)||count($options)<2||count($options)>12) Http::json(['error'=>'سؤال المطابقة رقم '.($index+1).' يحتاج زوجين على الأقل.'],422);
            $pairs=[];
            foreach($options as $pair) {
                $left=trim((string)($pair['left']??''));$right=trim((string)($pair['right']??''));
                if($left===''||$right==='') Http::json(['error'=>'أكملي طرفي المطابقة في السؤال رقم '.($index+1).'.'],422);
                $pairs[]=['left'=>$left,'right'=>$right];
            }
            $options=$pairs;$correct=$pairs;
        } else {
            if(!is_array($options)||count($options)<2||count($options)>12) Http::json(['error'=>'سؤال الترتيب رقم '.($index+1).' يحتاج خطوتين على الأقل.'],422);
            $options=array_map(static fn($item):string=>trim((string)$item),array_values($options));
            if(in_array('', $options,true)) Http::json(['error'=>'لا تتركي خطوة فارغة في السؤال رقم '.($index+1).'.'],422);
            $correct=$options;
        }
        $skillIds=[];
        foreach((array)($question['skillIds']??$globalSkillIds) as $skillId) if(in_array((int)$skillId,$globalSkillIds,true)) $skillIds[(int)$skillId]=true;
        $normalized[]=[
            'key'=>'q'.($index+1),'type'=>$type,'prompt'=>$prompt,'options'=>$options,'correct'=>$correct,
            'explanation'=>$explanation,'points'=>$points,'difficulty'=>$difficulty,'order'=>$index+1,'skillIds'=>array_keys($skillIds),
        ];
    }
    return $normalized;
}

function interactive_game_builder_owned_game(int $teacherId,int $gameId,bool $includeDeleted=false): array
{
    $sql='SELECT * FROM teacher_interactive_games WHERE id=? AND teacher_id=?';
    if(!$includeDeleted) $sql.=' AND deleted_at IS NULL';
    $row=fetch_one($sql.' LIMIT 1',[$gameId,$teacherId]);
    if(!$row) Http::json(['error'=>'اللعبة غير موجودة ضمن حساب المعلمة.'],404);
    return $row;
}

function interactive_game_builder_insert_version(PDO $pdo,int $teacherId,int $gameId,array $metadata,array $questions=[],?array $package=null): int
{
    $statement=$pdo->prepare('SELECT COALESCE(MAX(version_number),0)+1 FROM interactive_game_versions WHERE game_id=? FOR UPDATE');
    $statement->execute([$gameId]);$version=(int)$statement->fetchColumn();
    $settings=[
        'gameKey'=>$metadata['gameKey'],'name'=>$metadata['name'],'description'=>$metadata['description'],'subjectName'=>$metadata['subjectName'],
        'lessonName'=>$metadata['lessonName'],'unitNumber'=>$metadata['unitNumber'],'lessonNumber'=>$metadata['lessonNumber'],
        'stage'=>$metadata['stage'],'gradeLabel'=>$metadata['gradeLabel'],'semester'=>$metadata['semester'],
        'questionCount'=>$metadata['questionCount'],'difficulties'=>$metadata['difficulties'],
        'timeMode'=>$metadata['timeMode'],'timePerQuestionSeconds'=>$metadata['timeSeconds'],
        'certificateEnabled'=>$metadata['certificateEnabled'],'pointsEnabled'=>$metadata['pointsEnabled'],'pointsValue'=>$metadata['pointsValue'],
    ];
    $insert=$pdo->prepare(
        'INSERT INTO interactive_game_versions (game_id,version_number,source_type,template_type,manifest_json,settings_json,entry_file,runtime_key,storage_key,original_zip_name,package_size_bytes,content_sha256,validation_status,validation_message,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $insert->execute([
        $gameId,$version,$metadata['sourceType'],$metadata['templateType'],
        $package?interactive_game_builder_json_encode($package['manifest']):null,interactive_game_builder_json_encode($settings),
        $package['entry']??null,$package['runtime']??null,$package['storageKey']??null,$package['originalName']??null,
        $package['size']??null,$package['sha256']??null,$package['status']??'ready',$package['message']??null,$teacherId,
    ]);
    $versionId=(int)$pdo->lastInsertId();
    $versionSkill=$pdo->prepare('INSERT INTO interactive_game_version_skills (version_id,skill_id) VALUES (?,?)');
    foreach($metadata['skillIds'] as $skillId) $versionSkill->execute([$versionId,$skillId]);
    if($metadata['sourceType']==='template') {
        $questionInsert=$pdo->prepare('INSERT INTO interactive_game_questions (version_id,question_key,question_type,prompt,options_json,correct_answer_json,explanation,points,difficulty,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)');
        $questionSkill=$pdo->prepare('INSERT INTO interactive_game_question_skills (question_id,skill_id) VALUES (?,?)');
        foreach($questions as $question) {
            $questionInsert->execute([
                $versionId,$question['key'],$question['type'],$question['prompt'],interactive_game_builder_json_encode($question['options']),
                interactive_game_builder_json_encode($question['correct']),$question['explanation']!==''?$question['explanation']:null,
                $question['points'],$question['difficulty'],$question['order'],
            ]);
            $questionId=(int)$pdo->lastInsertId();
            foreach($question['skillIds'] as $skillId) $questionSkill->execute([$questionId,$skillId]);
        }
    }
    $pdo->prepare('UPDATE teacher_interactive_games SET current_version_id=? WHERE id=? AND teacher_id=?')->execute([$versionId,$gameId,$teacherId]);
    return $versionId;
}

function interactive_game_builder_insert_game(PDO $pdo,int $teacherId,array $metadata): int
{
    $insert=$pdo->prepare(
        'INSERT INTO teacher_interactive_games (teacher_id,game_key,name,description,subject_name,source_type,template_type,lifecycle_status,lesson_name,unit_number,lesson_number,stage,grade_label,semester,class_id,time_mode,time_per_question_seconds,certificate_portfolio_enabled,points_enabled,points_value,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)'
    );
    try {
        $insert->execute([
            $teacherId,$metadata['gameKey'],$metadata['name'],$metadata['description']!==''?$metadata['description']:null,$metadata['subjectName'],
            $metadata['sourceType'],$metadata['templateType'],'draft',$metadata['lessonName'],$metadata['unitNumber'],$metadata['lessonNumber'],
            $metadata['stage'],$metadata['gradeLabel'],$metadata['semester'],null,$metadata['timeMode'],$metadata['timeSeconds'],
            $metadata['certificateEnabled']?1:0,$metadata['pointsEnabled']?1:0,$metadata['pointsValue'],
        ]);
    } catch(PDOException $error) {
        if((string)$error->getCode()==='23000') Http::json(['error'=>'معرّف اللعبة مستخدم مسبقًا. اختاري معرّفًا آخر أو حدّثي اللعبة الموجودة.'],409);
        throw $error;
    }
    return (int)$pdo->lastInsertId();
}

function interactive_game_builder_update_metadata(PDO $pdo,int $teacherId,int $gameId,array $metadata): void
{
    $pdo->prepare(
        'UPDATE teacher_interactive_games SET game_key=?,name=?,description=?,subject_name=?,source_type=?,template_type=?,lesson_name=?,unit_number=?,lesson_number=?,stage=?,grade_label=?,semester=?,time_mode=?,time_per_question_seconds=?,certificate_portfolio_enabled=?,question_count=?,allowed_difficulties_json=?,points_enabled=?,points_value=? WHERE id=? AND teacher_id=?'
    )->execute([
        $metadata['gameKey'],$metadata['name'],$metadata['description']!==''?$metadata['description']:null,$metadata['subjectName'],
        $metadata['sourceType'],$metadata['templateType'],$metadata['lessonName'],$metadata['unitNumber'],$metadata['lessonNumber'],
        $metadata['stage'],$metadata['gradeLabel'],$metadata['semester'],$metadata['timeMode'],$metadata['timeSeconds'],
        $metadata['certificateEnabled']?1:0,$metadata['questionCount'],interactive_game_builder_json_encode($metadata['difficulties']),
        $metadata['pointsEnabled']?1:0,$metadata['pointsValue'],$gameId,$teacherId,
    ]);
}

function interactive_game_builder_game_json(array $row): array
{
    $status=(string)($row['lifecycle_status']??'');
    if($status==='') $status=(bool)($row['is_active']??false)?'published':'draft';
    return [
        'id'=>(int)$row['id'],'gameKey'=>(string)$row['game_key'],'name'=>(string)($row['name']??$row['lesson_name']??''),
        'description'=>(string)($row['description']??''),'subjectName'=>(string)($row['subject_name']??''),
        'lessonName'=>(string)($row['lesson_name']??''),'unitNumber'=>$row['unit_number']!==null?(int)$row['unit_number']:null,
        'lessonNumber'=>$row['lesson_number']!==null?(int)$row['lesson_number']:null,'stage'=>(string)$row['stage'],
        'gradeLabel'=>(string)$row['grade_label'],'semester'=>(string)($row['semester']??''),'sourceType'=>(string)($row['source_type']??'legacy'),
        'templateType'=>$row['template_type']??null,'status'=>$status,'currentVersionId'=>$row['current_version_id']!==null?(int)$row['current_version_id']:null,
        'versionNumber'=>(int)($row['version_number']??0),'validationStatus'=>(string)($row['validation_status']??''),
        'validationMessage'=>(string)($row['validation_message']??''),'questionCount'=>(int)($row['question_count']??0),
        'difficulties'=>interactive_game_builder_json_decode($row['allowed_difficulties_json']??null,[]),
        'timeMode'=>(string)$row['time_mode'],'timePerQuestionSeconds'=>$row['time_per_question_seconds']!==null?(int)$row['time_per_question_seconds']:null,
        'certificateEnabled'=>(bool)$row['certificate_portfolio_enabled'],'pointsEnabled'=>(bool)($row['points_enabled']??false),
        'pointsValue'=>(int)($row['points_value']??0),'publicationCount'=>(int)($row['publication_count']??0),
        'coverUrl'=>!empty($row['cover_stored_name'])?'/games/game-cover.php?game='.(int)$row['id']:'',
        'playUrl'=>'/games/game-player.php?game='.(int)$row['id'],'previewUrl'=>'/games/game-player.php?game='.(int)$row['id'].'&preview=1',
        'updatedAt'=>$row['updated_at']??null,
    ];
}

function interactive_game_builder_with_version(array $game,?array $version): array
{
    if(!$version) return $game;
    $settings=interactive_game_builder_json_decode($version['settings_json']??null,[]);
    $mapping=[
        'gameKey'=>'game_key','name'=>'name','description'=>'description','subjectName'=>'subject_name','lessonName'=>'lesson_name',
        'unitNumber'=>'unit_number','lessonNumber'=>'lesson_number','stage'=>'stage','gradeLabel'=>'grade_label','semester'=>'semester',
        'questionCount'=>'question_count','timeMode'=>'time_mode','timePerQuestionSeconds'=>'time_per_question_seconds',
        'certificateEnabled'=>'certificate_portfolio_enabled','pointsEnabled'=>'points_enabled','pointsValue'=>'points_value',
    ];
    foreach($mapping as $setting=>$column) if(array_key_exists($setting,$settings)) $game[$column]=$settings[$setting];
    if(array_key_exists('difficulties',$settings))$game['allowed_difficulties_json']=interactive_game_builder_json_encode($settings['difficulties']);
    foreach(['version_number','validation_status','validation_message'] as $key) $game[$key]=$version[$key]??null;
    $game['source_type']=$version['source_type']??$game['source_type']??null;
    $game['template_type']=$version['template_type']??$game['template_type']??null;
    return $game;
}

function interactive_game_builder_list(int $teacherId): array
{
    if(!interactive_game_builder_schema_ready()) return [];
    $rows=fetch_all(
        "SELECT g.*,v.version_number,v.validation_status,v.validation_message,
                (SELECT COUNT(*) FROM interactive_game_publications p WHERE p.game_id=g.id AND p.status='published') AS publication_count
         FROM teacher_interactive_games g
         LEFT JOIN interactive_game_versions v ON v.id=g.current_version_id
         WHERE g.teacher_id=? AND g.deleted_at IS NULL AND g.source_type IS NOT NULL
         ORDER BY g.updated_at DESC,g.id DESC",[$teacherId]
    );
    return array_map('interactive_game_builder_game_json',$rows);
}

function interactive_game_builder_detail(int $teacherId,int $gameId): array
{
    $game=interactive_game_builder_owned_game($teacherId,$gameId);
    $version=$game['current_version_id']?fetch_one('SELECT * FROM interactive_game_versions WHERE id=? AND game_id=?',[(int)$game['current_version_id'],$gameId]):null;
    $row=interactive_game_builder_with_version($game,$version?:null);
    $result=interactive_game_builder_game_json($row);
    $result['skillIds']=$version?array_map('intval',array_column(fetch_all('SELECT skill_id FROM interactive_game_version_skills WHERE version_id=?',[(int)$version['id']]),'skill_id')):[];
    $result['classIds']=array_map('intval',array_column(fetch_all("SELECT class_id FROM interactive_game_publications WHERE game_id=? AND semester=? AND status='published'",[$gameId,(string)$game['semester']]),'class_id'));
    $result['questions']=[];
    if($version&&(string)$version['source_type']==='template') {
        foreach(fetch_all('SELECT * FROM interactive_game_questions WHERE version_id=? ORDER BY sort_order,id',[(int)$version['id']]) as $question) {
            $result['questions'][]=[
                'id'=>(int)$question['id'],'key'=>(string)$question['question_key'],'type'=>(string)$question['question_type'],
                'prompt'=>(string)$question['prompt'],'options'=>interactive_game_builder_json_decode($question['options_json'],[]),
                'correctAnswer'=>interactive_game_builder_json_decode($question['correct_answer_json'],null),
                'explanation'=>(string)($question['explanation']??''),'points'=>(int)$question['points'],
                'difficulty'=>(string)$question['difficulty'],'skillIds'=>array_map('intval',array_column(fetch_all('SELECT skill_id FROM interactive_game_question_skills WHERE question_id=?',[(int)$question['id']]),'skill_id')),
            ];
        }
    }
    return $result;
}

function interactive_game_builder_create_template(int $teacherId): never
{
    interactive_game_builder_require_schema();$data=Http::input();$data['sourceType']='template';
    $metadata=interactive_game_builder_metadata($teacherId,$data);
    if(fetch_one('SELECT id FROM teacher_interactive_games WHERE game_key=? AND deleted_at IS NULL LIMIT 1',[$metadata['gameKey']])) {
        Http::json(['error'=>'معرّف اللعبة مستخدم مسبقًا على منصة مدار. اختاري معرّفًا مختلفًا.'],409);
    }
    $questions=interactive_game_builder_questions($data,(string)$metadata['templateType'],$metadata['skillIds']);
    $gameId=Database::transaction(function(PDO $pdo) use($teacherId,$metadata,$questions): int {
        $gameId=interactive_game_builder_insert_game($pdo,$teacherId,$metadata);
        interactive_game_builder_update_metadata($pdo,$teacherId,$gameId,$metadata);
        interactive_game_builder_insert_version($pdo,$teacherId,$gameId,$metadata,$questions);
        return $gameId;
    });
    Activity::log('teacher',$teacherId,'إنشاء لعبة من قالب',$metadata['name']);
    Http::json(['game'=>interactive_game_builder_detail($teacherId,$gameId)],201);
}

function interactive_game_builder_update_template(int $teacherId,int $gameId): never
{
    interactive_game_builder_require_schema();$current=interactive_game_builder_owned_game($teacherId,$gameId);
    if((string)$current['source_type']!=='template') Http::json(['error'=>'هذه اللعبة حزمة مبرمجة؛ استخدمي رفع إصدار ZIP جديد لتحديثها.'],422);
    $data=Http::input();$data['sourceType']='template';$data['gameKey']=$current['game_key'];$data['templateType']=$current['template_type'];$metadata=interactive_game_builder_metadata($teacherId,$data,$current);
    $questions=interactive_game_builder_questions($data,(string)$metadata['templateType'],$metadata['skillIds']);
    Database::transaction(function(PDO $pdo) use($teacherId,$gameId,$metadata,$questions): void {
        interactive_game_builder_update_metadata($pdo,$teacherId,$gameId,$metadata);
        interactive_game_builder_insert_version($pdo,$teacherId,$gameId,$metadata,$questions);
    });
    Activity::log('teacher',$teacherId,'إنشاء إصدار جديد للعبة',$metadata['name']);
    Http::json(['game'=>interactive_game_builder_detail($teacherId,$gameId)]);
}

function interactive_game_builder_copy(int $teacherId,int $gameId): never
{
    interactive_game_builder_require_schema();$current=interactive_game_builder_owned_game($teacherId,$gameId);$data=Http::input();
    $newKey=interactive_game_builder_key($data['gameKey']??'');$newName=interactive_game_builder_text($data['name']??'','اسم النسخة',190);
    $detail=interactive_game_builder_detail($teacherId,$gameId);
    $existing=fetch_one('SELECT id FROM teacher_interactive_games WHERE game_key=? AND deleted_at IS NULL LIMIT 1',[$newKey]);
    if($existing) Http::json(['error'=>'معرّف النسخة مستخدم مسبقًا على منصة مدار. اختاري معرّفًا مختلفًا.'],409);
    $metadata=interactive_game_builder_metadata($teacherId,[
        'gameKey'=>$newKey,'name'=>$newName,'description'=>$detail['description'],'subjectName'=>$detail['subjectName'],
        'lessonName'=>$detail['lessonName'],'unitNumber'=>$detail['unitNumber'],'lessonNumber'=>$detail['lessonNumber'],
        'stage'=>$detail['stage'],'gradeLabel'=>$detail['gradeLabel'],'semester'=>$detail['semester'],'sourceType'=>$detail['sourceType'],
        'templateType'=>$detail['templateType'],'questionCount'=>max(1,$detail['questionCount']),'difficulties'=>$detail['difficulties'],
        'timeMode'=>$detail['timeMode'],'timePerQuestionSeconds'=>$detail['timePerQuestionSeconds'],'certificateEnabled'=>$detail['certificateEnabled'],
        'pointsEnabled'=>$detail['pointsEnabled'],'pointsValue'=>$detail['pointsValue'],'skillIds'=>$detail['skillIds'],
    ]);
    $sourceVersion=fetch_one('SELECT * FROM interactive_game_versions WHERE id=?',[(int)$current['current_version_id']]);
    $questions=$metadata['sourceType']==='template'?interactive_game_builder_questions(['questions'=>$detail['questions']],(string)$metadata['templateType'],$metadata['skillIds']):[];
    $package=null;
    if($metadata['sourceType']==='package'&&$sourceVersion) $package=[
        'manifest'=>interactive_game_builder_json_decode($sourceVersion['manifest_json'],[]),'entry'=>$sourceVersion['entry_file'],'runtime'=>$sourceVersion['runtime_key'],
        'storageKey'=>$sourceVersion['storage_key'],'originalName'=>$sourceVersion['original_zip_name'],'size'=>$sourceVersion['package_size_bytes'],
        'sha256'=>$sourceVersion['content_sha256'],'status'=>$sourceVersion['validation_status'],'message'=>$sourceVersion['validation_message'],
    ];
    $newId=Database::transaction(function(PDO $pdo) use($teacherId,$metadata,$questions,$package): int {
        $id=interactive_game_builder_insert_game($pdo,$teacherId,$metadata);interactive_game_builder_update_metadata($pdo,$teacherId,$id,$metadata);
        interactive_game_builder_insert_version($pdo,$teacherId,$id,$metadata,$questions,$package);return $id;
    });
    Activity::log('teacher',$teacherId,'نسخ لعبة تفاعلية',$newName);
    Http::json(['game'=>interactive_game_builder_detail($teacherId,$newId)],201);
}

function interactive_game_builder_publish(int $teacherId,int $gameId): never
{
    interactive_game_builder_require_schema();$game=interactive_game_builder_owned_game($teacherId,$gameId);$data=Http::input();
    $versionId=(int)($game['current_version_id']??0);
    if($versionId<1) Http::json(['error'=>'لا يوجد إصدار صالح يمكن نشره.'],422);
    $version=fetch_one('SELECT validation_status FROM interactive_game_versions WHERE id=? AND game_id=?',[$versionId,$gameId]);
    if(!$version||(string)$version['validation_status']!=='ready') Http::json(['error'=>'هذه اللعبة تحتاج تهيئة واجهة الربط قبل نشرها.'],422);
    $semester=interactive_game_semester($data['semester']??$game['semester']??'');
    $classIds=[];
    foreach((array)($data['classIds']??[]) as $item) {
        $id=filter_var($item,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);if($id!==false)$classIds[(int)$id]=true;
    }
    if(!$classIds) Http::json(['error'=>'اختاري فصلًا واحدًا على الأقل لنشر اللعبة.'],422);
    $ids=array_keys($classIds);$placeholders=implode(',',array_fill(0,count($ids),'?'));
    $classes=fetch_all("SELECT id,academic_year FROM classes WHERE teacher_id=? AND id IN ($placeholders)",[$teacherId,...$ids]);
    if(count($classes)!==count($ids)) Http::json(['error'=>'أحد الفصول المختارة لا يتبع حساب المعلمة.'],403);
    Database::transaction(function(PDO $pdo) use($teacherId,$gameId,$versionId,$semester,$classes): void {
        $pdo->prepare("UPDATE interactive_game_publications SET status='disabled',disabled_at=NOW() WHERE game_id=? AND semester=?")->execute([$gameId,$semester]);
        $publish=$pdo->prepare(
            "INSERT INTO interactive_game_publications (game_id,version_id,class_id,academic_year,semester,status,published_at,disabled_at) VALUES (?,?,?,?,?,'published',NOW(),NULL)
             ON DUPLICATE KEY UPDATE version_id=VALUES(version_id),status='published',published_at=NOW(),disabled_at=NULL"
        );
        foreach($classes as $class) $publish->execute([$gameId,$versionId,(int)$class['id'],(string)$class['academic_year'],$semester]);
        $pdo->prepare("UPDATE teacher_interactive_games SET lifecycle_status='published',is_active=1,semester=? WHERE id=? AND teacher_id=?")->execute([$semester,$gameId,$teacherId]);
    });
    Activity::log('teacher',$teacherId,'نشر لعبة تفاعلية',(string)$game['game_key'].' · '.count($classes).' فصل');
    Http::json(['game'=>interactive_game_builder_detail($teacherId,$gameId)]);
}

function interactive_game_builder_status(int $teacherId,int $gameId): never
{
    interactive_game_builder_require_schema();$game=interactive_game_builder_owned_game($teacherId,$gameId);$data=Http::input();$status=(string)($data['status']??'');
    if(!in_array($status,['draft','disabled'],true)) Http::json(['error'=>'حالة اللعبة غير صالحة.'],422);
    Database::transaction(function(PDO $pdo) use($teacherId,$gameId,$status): void {
        if($status==='disabled') $pdo->prepare("UPDATE interactive_game_publications SET status='disabled',disabled_at=NOW() WHERE game_id=?")->execute([$gameId]);
        $pdo->prepare('UPDATE teacher_interactive_games SET lifecycle_status=?,is_active=0 WHERE id=? AND teacher_id=?')->execute([$status,$gameId,$teacherId]);
    });
    Activity::log('teacher',$teacherId,$status==='disabled'?'إيقاف لعبة تفاعلية':'إعادة لعبة إلى المسودة',(string)$game['game_key']);
    Http::json(['game'=>interactive_game_builder_detail($teacherId,$gameId)]);
}

function interactive_game_builder_soft_delete(int $teacherId,int $gameId): never
{
    interactive_game_builder_require_schema();$game=interactive_game_builder_owned_game($teacherId,$gameId);
    Database::transaction(function(PDO $pdo) use($teacherId,$gameId): void {
        $pdo->prepare("UPDATE interactive_game_publications SET status='disabled',disabled_at=NOW() WHERE game_id=?")->execute([$gameId]);
        $pdo->prepare("UPDATE teacher_interactive_games SET deleted_at=NOW(),lifecycle_status='disabled',is_active=0 WHERE id=? AND teacher_id=?")->execute([$gameId,$teacherId]);
    });
    Activity::log('teacher',$teacherId,'أرشفة لعبة تفاعلية',(string)$game['game_key']);
    Http::json(['ok'=>true,'message'=>'تمت أرشفة اللعبة مع الاحتفاظ بجميع إصداراتها ونتائجها.']);
}

function interactive_game_builder_cover(int $teacherId,int $gameId): never
{
    interactive_game_builder_require_schema();interactive_game_builder_owned_game($teacherId,$gameId);
    $upload=$_FILES['cover']??null;
    if(!is_array($upload)||(int)($upload['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) Http::json(['error'=>'اختاري صورة غلاف صالحة.'],422);
    $size=(int)($upload['size']??0);if($size<1||$size>4*1024*1024) Http::json(['error'=>'حجم الغلاف يجب ألا يتجاوز 4 ميجابايت.'],422);
    if(!class_exists('finfo')) Http::json(['error'=>'إضافة Fileinfo غير متاحة على الخادم.'],500);
    $mime=(string)((new finfo(FILEINFO_MIME_TYPE))->file((string)$upload['tmp_name'])?:'');
    $allowed=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'];
    if(!isset($allowed[$mime])||@getimagesize((string)$upload['tmp_name'])===false) Http::json(['error'=>'الغلاف يجب أن يكون PNG أو JPG أو WebP حقيقيًا.'],422);
    $directory=MADAR_ROOT.'/storage/private/interactive-game-covers';if(!is_dir($directory)&&!mkdir($directory,0750,true)&&!is_dir($directory)) Http::json(['error'=>'تعذّر تجهيز مجلد الأغلفة.'],500);
    $stored=bin2hex(random_bytes(24)).'.'.$allowed[$mime];$target=$directory.'/'.$stored;
    if(!move_uploaded_file((string)$upload['tmp_name'],$target)) Http::json(['error'=>'تعذّر حفظ صورة الغلاف.'],500);
    execute_sql('UPDATE teacher_interactive_games SET cover_original_name=?,cover_stored_name=?,cover_mime_type=?,cover_size_bytes=? WHERE id=? AND teacher_id=?',[
        mb_substr(basename((string)$upload['name']),0,255),$stored,$mime,$size,$gameId,$teacherId,
    ]);
    Http::json(['coverUrl'=>'/games/game-cover.php?game='.$gameId]);
}

function interactive_game_package_safe_path(string $path): ?string
{
    if($path===''||str_contains($path,"\0")||str_contains($path,'\\')||str_starts_with($path,'/')||preg_match('/^[A-Za-z]:/',$path)) return null;
    $parts=explode('/',$path);$clean=[];
    foreach($parts as $part) {
        if($part===''||$part==='.') continue;
        if($part==='..'||str_starts_with($part,'.')||preg_match('/[\x00-\x1F\x7F]/',$part)) return null;
        $clean[]=$part;
    }
    return $clean?implode('/',$clean):null;
}

function interactive_game_package_allowed_mimes(): array
{
    return [
        'html'=>['text/html','text/plain'],'htm'=>['text/html','text/plain'],'css'=>['text/css','text/plain'],
        'js'=>['text/javascript','application/javascript','application/x-javascript','text/plain'],
        'json'=>['application/json','text/plain'],'png'=>['image/png'],'jpg'=>['image/jpeg'],'jpeg'=>['image/jpeg'],
        'webp'=>['image/webp'],'gif'=>['image/gif'],'mp3'=>['audio/mpeg','audio/mp3','application/octet-stream'],
        'ogg'=>['audio/ogg','application/ogg'],'wav'=>['audio/wav','audio/x-wav'],'m4a'=>['audio/mp4','audio/x-m4a','application/octet-stream'],
        'woff'=>['font/woff','application/font-woff','application/octet-stream'],'woff2'=>['font/woff2','application/octet-stream'],
        'ttf'=>['font/ttf','application/x-font-ttf','application/octet-stream'],'otf'=>['font/otf','application/x-font-opentype','application/octet-stream'],
    ];
}

function interactive_game_package_scan_text(string $path,string $extension): void
{
    $content=(string)file_get_contents($path);
    if(str_contains($content,'<?')) Http::json(['error'=>'الحزمة تحتوي تعليمات خادم غير مسموح بها.'],422);
    if(in_array($extension,['html','htm','css'],true)&&preg_match('/(?:src|href)\s*=\s*["\']\s*(?:[a-z][a-z0-9+.-]*:|\/\/|\/)|url\s*\(\s*["\']?\s*(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i',$content)) {
        Http::json(['error'=>'الحزمة تستخدم رابطًا خارجيًا أو مسارًا خارج ZIP. استخدمي ملفات محلية نسبية داخل الحزمة فقط.'],422);
    }
    if($extension==='css'&&preg_match('/@import\s+/i',$content)) Http::json(['error'=>'لا يسمح باستخدام @import داخل حزمة اللعبة.'],422);
    if(in_array($extension,['html','htm'],true)&&preg_match('/<(?:base|form|iframe|object|embed)\b|<meta\b[^>]*http-equiv\s*=\s*["\']?refresh/i',$content)) {
        Http::json(['error'=>'الحزمة تحتوي عنصر تنقّل أو تضمين غير مسموح.'],422);
    }
    if(in_array($extension,['html','htm'],true)&&preg_match('/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i',$content)) {
        Http::json(['error'=>'ضعي JavaScript في ملف محلي مستقل؛ تعليمات script المضمنة غير مسموحة.'],422);
    }
    if($extension==='js'&&preg_match('/(?:\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bserviceWorker\b|\bimportScripts\s*\(|\bdocument\.cookie\b|\blocalStorage\b|\bsessionStorage\b|\bwindow\.open\s*\(|\blocation\.(?:assign|replace)\s*\(|\blocation\.href\s*=|\b(?:window\.|document\.)?location\s*=)/i',$content)) {
        Http::json(['error'=>'الحزمة تحاول استخدام شبكة أو تخزين متصفح أو تنقّل مباشر. استخدمي MadarGameBridge فقط.'],422);
    }
}

function interactive_game_package_move_tree(string $source,string $target): bool
{
    if(@rename($source,$target)) return true;
    if(!is_dir($source)||(!is_dir($target)&&!mkdir($target,0750,true)&&!is_dir($target))) return false;
    try {
        $iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::SELF_FIRST);
        foreach($iterator as $item) {
            $relative=substr($item->getPathname(),strlen($source)+1);$destination=$target.'/'.$relative;
            if($item->isDir()) {
                if(!is_dir($destination)&&!mkdir($destination,0750,true)&&!is_dir($destination)) throw new RuntimeException('تعذّر إنشاء مجلد التخزين.');
            } elseif(!copy($item->getPathname(),$destination)) throw new RuntimeException('تعذّر نسخ ملف اللعبة.');
        }
        interactive_game_package_remove_tree($source);return true;
    } catch(Throwable) {
        interactive_game_package_remove_tree($target);return false;
    }
}

function interactive_game_package_issue_access(int $versionId): string
{
    $token=bin2hex(random_bytes(32));$directory=MADAR_ROOT.'/storage/private/interactive-game-access';
    if(!is_dir($directory)&&!mkdir($directory,0750,true)&&!is_dir($directory))throw new RuntimeException('تعذّر تجهيز تصريح ملفات اللعبة.');
    $payload=interactive_game_builder_json_encode(['versionId'=>$versionId,'expiresAt'=>time()+3600]);
    $path=$directory.'/'.hash('sha256',$token).'.json';
    if(file_put_contents($path,$payload,LOCK_EX)===false)throw new RuntimeException('تعذّر إصدار تصريح ملفات اللعبة.');
    @chmod($path,0640);return $token;
}

function interactive_game_package_access_valid(int $versionId,string $token): bool
{
    if($versionId<1||!preg_match('/^[a-f0-9]{64}$/',$token))return false;
    $path=MADAR_ROOT.'/storage/private/interactive-game-access/'.hash('sha256',$token).'.json';
    if(!is_file($path))return false;
    $payload=interactive_game_builder_json_decode(file_get_contents($path),[]);
    return is_array($payload)&&(int)($payload['versionId']??0)===$versionId&&(int)($payload['expiresAt']??0)>=time();
}

function interactive_game_package_remove_tree(string $directory): void
{
    if(!is_dir($directory)) return;
    $iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach($iterator as $item) $item->isDir()?@rmdir($item->getPathname()):@unlink($item->getPathname());
    @rmdir($directory);
}

function interactive_game_package_extract(string $zipPath,string $originalName): array
{
    if(!class_exists('ZipArchive')) Http::json(['error'=>'إضافة PHP Zip غير متاحة على الخادم.'],500);
    if(!class_exists('finfo')) Http::json(['error'=>'إضافة Fileinfo غير متاحة على الخادم.'],500);
    $zip=new ZipArchive();if($zip->open($zipPath)!==true) Http::json(['error'=>'ملف ZIP غير صالح أو تالف.'],422);
    if($zip->numFiles<1||$zip->numFiles>INTERACTIVE_GAME_PACKAGE_MAX_FILES){$zip->close();Http::json(['error'=>'عدد ملفات الحزمة غير صالح؛ الحد الأقصى 200 ملف.'],422);}
    $staging=sys_get_temp_dir().'/madar-game-'.bin2hex(random_bytes(12));
    if(!mkdir($staging,0700,true)){$zip->close();Http::json(['error'=>'تعذّر تجهيز مساحة آمنة لفحص الحزمة.'],500);}
    register_shutdown_function(static function() use($staging): void {
        interactive_game_package_remove_tree($staging);
    });
    $allowed=interactive_game_package_allowed_mimes();$finfo=new finfo(FILEINFO_MIME_TYPE);$expanded=0;$files=[];
    try {
        for($index=0;$index<$zip->numFiles;$index++) {
            $stat=$zip->statIndex($index);$raw=(string)($stat['name']??'');
            if(str_ends_with($raw,'/')||str_starts_with($raw,'__MACOSX/')||str_starts_with(basename($raw),'._')) continue;
            $safe=interactive_game_package_safe_path($raw);if($safe===null) Http::json(['error'=>'الحزمة تحتوي مسارًا غير آمن: '.mb_substr($raw,0,120)],422);
            $extension=strtolower(pathinfo($safe,PATHINFO_EXTENSION));if(!isset($allowed[$extension])) Http::json(['error'=>'نوع الملف .'.$extension.' غير مسموح داخل حزمة اللعبة.'],422);
            $dangerous=['php','phtml','phar','cgi','pl','py','rb','sh','bash','exe','dll','so','dylib','jar','com','bat','cmd'];
            $baseParts=array_map('strtolower',explode('.',basename($safe)));
            foreach(array_slice($baseParts,0,-1) as $part) if(in_array($part,$dangerous,true)) Http::json(['error'=>'الحزمة تحتوي امتدادًا مزدوجًا غير آمن.'],422);
            $size=(int)($stat['size']??0);$compressed=(int)($stat['comp_size']??0);$expanded+=$size;
            if($size>INTERACTIVE_GAME_PACKAGE_MAX_FILE_BYTES||$expanded>INTERACTIVE_GAME_PACKAGE_MAX_EXPANDED_BYTES||($size>1048576&&$size/max(1,$compressed)>100)) {
                Http::json(['error'=>'الحزمة كبيرة أو نسبة ضغطها غير آمنة وقد تكون Zip Bomb.'],422);
            }
            $ops=0;$attributes=0;
            if(method_exists($zip,'getExternalAttributesIndex')&&$zip->getExternalAttributesIndex($index,$ops,$attributes)) {
                $mode=($attributes>>16)&0170000;if($mode===0120000) Http::json(['error'=>'الروابط الرمزية غير مسموح بها داخل الحزمة.'],422);
            }
            $target=$staging.'/'.$safe;$parent=dirname($target);if(!is_dir($parent)&&!mkdir($parent,0700,true)&&!is_dir($parent)) Http::json(['error'=>'تعذّر تجهيز مجلدات الحزمة.'],500);
            $input=$zip->getStream($raw);$output=@fopen($target,'wb');if(!$input||!$output) Http::json(['error'=>'تعذّر فحص أحد ملفات الحزمة.'],422);
            $written=stream_copy_to_stream($input,$output,INTERACTIVE_GAME_PACKAGE_MAX_FILE_BYTES+1);fclose($input);fclose($output);
            if($written===false||$written!==$size) Http::json(['error'=>'حجم أحد ملفات الحزمة لا يطابق بيانات ZIP.'],422);
            $mime=(string)($finfo->file($target)?:'application/octet-stream');if(!in_array($mime,$allowed[$extension],true)) Http::json(['error'=>'نوع MIME الفعلي للملف '.$safe.' لا يطابق امتداده.'],422);
            if(in_array($extension,['png','jpg','jpeg','webp','gif'],true)&&@getimagesize($target)===false) Http::json(['error'=>'الحزمة تحتوي صورة غير صالحة.'],422);
            if(in_array($extension,['html','htm','css','js','json'],true)) interactive_game_package_scan_text($target,$extension);
            $files[$safe]=true;
        }
        $manifestPath=$staging.'/game.json';if(!isset($files['game.json'])||!is_file($manifestPath)) Http::json(['error'=>'الحزمة لا تحتوي ملف game.json في المستوى الرئيسي.'],422);
        try{$manifest=json_decode((string)file_get_contents($manifestPath),true,512,JSON_THROW_ON_ERROR);}catch(JsonException){Http::json(['error'=>'ملف game.json غير صالح.'],422);}
        if(!is_array($manifest)||(int)($manifest['schemaVersion']??0)!==1) Http::json(['error'=>'schemaVersion في game.json يجب أن يساوي 1.'],422);
        $key=interactive_game_builder_key($manifest['key']??'');$name=interactive_game_builder_text($manifest['name']??'','اسم اللعبة في game.json',190);
        $entry=interactive_game_package_safe_path((string)($manifest['entry']??''));
        if($entry===null||!isset($files[$entry])||!in_array(strtolower(pathinfo($entry,PATHINFO_EXTENSION)),['html','htm'],true)) Http::json(['error'=>'ملف التشغيل المحدد في entry غير موجود أو ليس HTML.'],422);
        $runtime=(string)($manifest['runtime']??'');if($runtime!=='madar-game-bridge-v1') Http::json(['error'=>'إصدار واجهة الربط غير مدعوم. استخدمي madar-game-bridge-v1.'],422);
        $bridgeFound=false;
        foreach(array_keys($files) as $file) {
            if(!in_array(strtolower(pathinfo($file,PATHINFO_EXTENSION)),['html','htm','js'],true)) continue;
            $content=(string)file_get_contents($staging.'/'.$file);
            if(str_contains($content,'MadarGameBridge')||str_contains($content,'madar:ready')){$bridgeFound=true;break;}
        }
        $status=$bridgeFound?'ready':'needs_setup';$message=$bridgeFound?'':'الحزمة صالحة، لكنها لا تستدعي واجهة MadarGameBridge بعد.';
        return ['staging'=>$staging,'manifest'=>$manifest,'key'=>$key,'name'=>$name,'entry'=>$entry,'runtime'=>$runtime,'status'=>$status,'message'=>$message,'expanded'=>$expanded,'sha256'=>hash_file('sha256',$zipPath),'originalName'=>mb_substr(basename($originalName),0,255)];
    } catch(Throwable $error) {
        interactive_game_package_remove_tree($staging);$zip->close();throw $error;
    } finally {
        $zip->close();
    }
}

function interactive_game_builder_import(int $teacherId): never
{
    interactive_game_builder_require_schema();$upload=$_FILES['package']??null;
    if(!is_array($upload)||(int)($upload['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK) Http::json(['error'=>'اختاري ملف ZIP للعبة.'],422);
    $size=(int)($upload['size']??0);if($size<1||$size>INTERACTIVE_GAME_PACKAGE_MAX_BYTES) Http::json(['error'=>'حجم ZIP يجب ألا يتجاوز 20 ميجابايت.'],422);
    if(strtolower(pathinfo((string)$upload['name'],PATHINFO_EXTENSION))!=='zip') Http::json(['error'=>'الملف المرفوع يجب أن يكون ZIP.'],422);
    $mime=(string)((new finfo(FILEINFO_MIME_TYPE))->file((string)$upload['tmp_name'])?:'');
    if(!in_array($mime,['application/zip','application/x-zip-compressed','application/octet-stream'],true)) Http::json(['error'=>'الملف المرفوع ليس ZIP حقيقيًا.'],422);
    $package=interactive_game_package_extract((string)$upload['tmp_name'],(string)$upload['name']);
    $data=$_POST;
    $updateId=filter_var($data['updateGameId']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]])?:null;
    $current=$updateId?interactive_game_builder_owned_game($teacherId,(int)$updateId):null;
    if($current&&(string)$current['game_key']!==$package['key']) {interactive_game_package_remove_tree($package['staging']);Http::json(['error'=>'مفتاح game.json لا يطابق اللعبة التي يجري تحديثها.'],422);}
    if(!$current) {
        $existing=fetch_one('SELECT id FROM teacher_interactive_games WHERE game_key=? AND deleted_at IS NULL LIMIT 1',[$package['key']]);
        if($existing) {interactive_game_package_remove_tree($package['staging']);Http::json(['error'=>'معرّف اللعبة مستخدم مسبقًا على منصة مدار. اختاري معرّفًا مختلفًا.'],409);}
    }
    $data['gameKey']=$package['key'];$data['name']=trim((string)($data['name']??''))!==''?$data['name']:$package['name'];$data['sourceType']='package';$data['templateType']=null;
    $metadata=interactive_game_builder_metadata($teacherId,$data,$current);
    $root=MADAR_ROOT.'/storage/private/interactive-games';if(!is_dir($root)&&!mkdir($root,0750,true)&&!is_dir($root)){interactive_game_package_remove_tree($package['staging']);Http::json(['error'=>'تعذّر تجهيز تخزين الألعاب.'],500);}
    $storageKey=bin2hex(random_bytes(24));$final=$root.'/'.$storageKey;
    if(!interactive_game_package_move_tree($package['staging'],$final)){interactive_game_package_remove_tree($package['staging']);Http::json(['error'=>'تعذّر نقل الحزمة إلى التخزين الآمن.'],500);}
    $packageData=[
        'manifest'=>$package['manifest'],'entry'=>$package['entry'],'runtime'=>$package['runtime'],'storageKey'=>$storageKey,
        'originalName'=>$package['originalName'],'size'=>$size,'sha256'=>$package['sha256'],'status'=>$package['status'],'message'=>$package['message'],
    ];
    try {
        $gameId=Database::transaction(function(PDO $pdo) use($teacherId,$current,$metadata,$packageData): int {
            $id=$current?(int)$current['id']:interactive_game_builder_insert_game($pdo,$teacherId,$metadata);
            interactive_game_builder_update_metadata($pdo,$teacherId,$id,$metadata);
            interactive_game_builder_insert_version($pdo,$teacherId,$id,$metadata,[],$packageData);return $id;
        });
    } catch(Throwable $error) {interactive_game_package_remove_tree($final);throw $error;}
    Activity::log('teacher',$teacherId,$current?'رفع إصدار ZIP جديد':'استيراد لعبة مبرمجة',$metadata['name']);
    Http::json(['game'=>interactive_game_builder_detail($teacherId,$gameId),'needsSetup'=>$package['status']!=='ready','message'=>$package['message']],201);
}

function teacher_interactive_game_builder_routes(string $method,array $segments,int $teacherId): never
{
    $action=$segments[0]??'';
    if($action==='status'&&$method==='GET') Http::json(['migrationReady'=>interactive_game_builder_schema_ready(),'migration'=>INTERACTIVE_GAME_BUILDER_MIGRATION]);
    if($action==='library'&&$method==='GET') Http::json(['migrationReady'=>interactive_game_builder_schema_ready(),'migration'=>INTERACTIVE_GAME_BUILDER_MIGRATION,'games'=>interactive_game_builder_list($teacherId)]);
    if($action==='create'&&$method==='POST') interactive_game_builder_create_template($teacherId);
    if($action==='import'&&$method==='POST') interactive_game_builder_import($teacherId);
    $gameId=route_id($segments,1);
    if(count($segments)===2&&$method==='GET') Http::json(['game'=>interactive_game_builder_detail($teacherId,$gameId)]);
    if(count($segments)===2&&$method==='PUT') interactive_game_builder_update_template($teacherId,$gameId);
    if(count($segments)===2&&$method==='DELETE') interactive_game_builder_soft_delete($teacherId,$gameId);
    $sub=$segments[2]??'';
    if($sub==='copy'&&$method==='POST') interactive_game_builder_copy($teacherId,$gameId);
    if($sub==='publish'&&$method==='POST') interactive_game_builder_publish($teacherId,$gameId);
    if($sub==='status'&&$method==='POST') interactive_game_builder_status($teacherId,$gameId);
    if($sub==='cover'&&$method==='POST') interactive_game_builder_cover($teacherId,$gameId);
    Http::json(['error'=>'مسار إدارة الألعاب غير موجود.'],404);
}

function interactive_game_builder_student_catalog(int $teacherId,int $classId,string $semester): array
{
    if(!interactive_game_builder_schema_ready()||$classId<1||!in_array($semester,['first','second'],true)) return [];
    $rows=fetch_all(
        "SELECT g.*,v.version_number,v.validation_status,v.validation_message,v.settings_json,v.source_type AS version_source_type,v.template_type AS version_template_type,p.id AS publication_id,p.version_id AS published_version_id
         FROM interactive_game_publications p
         JOIN teacher_interactive_games g ON g.id=p.game_id AND g.teacher_id=? AND g.deleted_at IS NULL AND g.lifecycle_status='published'
         JOIN interactive_game_versions v ON v.id=p.version_id AND v.validation_status='ready'
         JOIN classes c ON c.id=p.class_id AND c.teacher_id=g.teacher_id AND c.academic_year=p.academic_year
         WHERE p.class_id=? AND p.semester=? AND p.status='published'
         ORDER BY g.name,g.id",[$teacherId,$classId,$semester]
    );
    return array_map(static function(array $row): array {
        $row=interactive_game_builder_with_version($row,[
            'version_number'=>$row['version_number'],'validation_status'=>$row['validation_status'],'validation_message'=>$row['validation_message'],
            'settings_json'=>$row['settings_json'],'source_type'=>$row['version_source_type'],'template_type'=>$row['version_template_type'],
        ]);
        $game=interactive_game_builder_game_json($row);
        $game['currentVersionId']=(int)$row['published_version_id'];
        $game['publicationId']=(int)$row['publication_id'];
        $game['configured']=$game['unitNumber']!==null&&$game['lessonNumber']!==null&&trim($game['lessonName'])!=='';
        $game['isActive']=true;
        $game['playPath']=$game['playUrl'];
        return $game;
    },$rows);
}

function interactive_game_builder_secure_shuffle(array $items): array
{
    for($index=count($items)-1;$index>0;$index--) {
        $swap=random_int(0,$index);[$items[$index],$items[$swap]]=[$items[$swap],$items[$index]];
    }
    return $items;
}

function interactive_game_builder_public_question(array $row): array
{
    return [
        'key'=>(string)$row['question_key'],'type'=>(string)$row['question_type'],'prompt'=>(string)$row['prompt'],
        'options'=>interactive_game_builder_json_decode($row['options_json'],[]),'points'=>(int)$row['points'],
        'difficulty'=>(string)$row['difficulty'],
    ];
}

function interactive_game_builder_run_start(int $studentId): never
{
    interactive_game_builder_require_schema();$data=Http::input();
    $gameId=filter_var($data['gameId']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if($gameId===false||$gameId===null) Http::json(['error'=>'معرّف اللعبة غير صالح.'],422);
    $difficulty=(string)($data['difficulty']??'easy');if(!in_array($difficulty,['easy','medium','hard'],true)) Http::json(['error'=>'مستوى اللعبة غير صالح.'],422);
    $requested=filter_var($data['questionCount']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>200]]);
    if($requested===false||$requested===null) Http::json(['error'=>'عدد الأسئلة غير صالح.'],422);
    [$student,$settings]=student_game_context($studentId);$semester=(string)($settings['current_semester']??'');
    $row=fetch_one(
        "SELECT g.*,p.id AS publication_id,p.version_id AS published_version_id,v.version_number,v.validation_status,v.validation_message,v.settings_json,v.entry_file,v.source_type AS version_source_type,v.template_type AS version_template_type
         FROM interactive_game_publications p
         JOIN teacher_interactive_games g ON g.id=p.game_id AND g.deleted_at IS NULL AND g.lifecycle_status='published'
         JOIN interactive_game_versions v ON v.id=p.version_id AND v.validation_status='ready'
         WHERE g.id=? AND g.teacher_id=? AND p.class_id=? AND p.semester=? AND p.academic_year=? AND p.status='published' LIMIT 1",
        [(int)$gameId,(int)$student['teacher_id'],(int)$student['class_id'],$semester,(string)$student['class_academic_year']]
    );
    if(!$row) Http::json(['error'=>'هذه اللعبة غير منشورة لفصلكِ في الفصل الدراسي الحالي.'],403);
    $row=interactive_game_builder_with_version($row,[
        'version_number'=>$row['version_number'],'validation_status'=>$row['validation_status'],'validation_message'=>$row['validation_message'],
        'settings_json'=>$row['settings_json'],'source_type'=>$row['version_source_type'],'template_type'=>$row['version_template_type'],
    ]);
    $difficulties=interactive_game_builder_json_decode($row['allowed_difficulties_json']??null,['easy','medium','hard']);
    if(!in_array($difficulty,$difficulties,true)) Http::json(['error'=>'هذا المستوى غير مفعّل في اللعبة.'],422);
    $source=(string)$row['version_source_type'];$questions=[];$questionIds=[];$maxScore=0;
    if($source==='template') {
        $available=fetch_all('SELECT * FROM interactive_game_questions WHERE version_id=? AND difficulty=? ORDER BY sort_order,id',[(int)$row['published_version_id'],$difficulty]);
        if(!$available) Http::json(['error'=>'لا توجد أسئلة في المستوى المحدد. اختاري مستوى آخر.'],422);
        $available=interactive_game_builder_secure_shuffle($available);$available=array_slice($available,0,min((int)$requested,count($available)));
        foreach($available as $question){$questions[]=interactive_game_builder_public_question($question);$questionIds[]=(int)$question['id'];$maxScore+=(int)$question['points'];}
        $requested=count($questions);
    }
    $token=bin2hex(random_bytes(32));$snapshot=['student'=>$student,'settings'=>$settings,'game'=>$row,'context'=>student_game_academic_context($student,$settings)];
    $state=['questionIds'=>$questionIds,'index'=>0,'score'=>0,'correct'=>0,'streak'=>0,'bestStreak'=>0];
    execute_sql(
        'INSERT INTO game_attempts (student_id,game_key,game_id,game_version_id,publication_id,result_source,difficulty,score,max_score,question_count,correct_count,best_streak,accuracy,duration_seconds,game_snapshot_json,run_token_hash,run_status,run_state_json,started_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),DATE_ADD(NOW(),INTERVAL 2 HOUR))',
        [$studentId,(string)$row['game_key'],(int)$row['id'],(int)$row['published_version_id'],(int)$row['publication_id'],$source==='template'?'server_verified':'package_reported',$difficulty,0,$source==='template'?$maxScore:null,$requested,0,0,0,0,interactive_game_builder_json_encode($snapshot),hash('sha256',$token),'in_progress',interactive_game_builder_json_encode($state)]
    );
    $attemptId=(int)Database::connection()->lastInsertId();
    Http::json([
        'runToken'=>$token,'attemptId'=>$attemptId,'source'=>$source,'questions'=>$questions,'questionCount'=>$requested,
        'game'=>interactive_game_builder_game_json($row),'player'=>student_game_academic_context($student,$settings),
    ],201);
}

function interactive_game_builder_run_row(int $studentId,string $token): array
{
    if(!preg_match('/^[a-f0-9]{64}$/',$token)) Http::json(['error'=>'رمز جولة اللعبة غير صالح.'],422);
    $row=fetch_one(
        'SELECT a.*,g.teacher_id,g.name AS game_name,g.lesson_name,g.unit_number,g.lesson_number,g.certificate_portfolio_enabled,g.points_enabled,g.points_value,g.current_version_id,v.source_type AS version_source_type,v.validation_status FROM game_attempts a JOIN teacher_interactive_games g ON g.id=a.game_id JOIN interactive_game_versions v ON v.id=a.game_version_id WHERE a.student_id=? AND a.run_token_hash=? LIMIT 1',
        [$studentId,hash('sha256',$token)]
    );
    if(!$row) Http::json(['error'=>'جولة اللعبة غير موجودة.'],404);
    if((string)$row['run_status']!=='in_progress') Http::json(['error'=>'تم إنهاء هذه الجولة مسبقًا.'],409);
    if(!empty($row['expires_at'])&&strtotime((string)$row['expires_at'])<time()) {
        execute_sql("UPDATE game_attempts SET run_status='abandoned' WHERE id=? AND run_status='in_progress'",[(int)$row['id']]);
        Http::json(['error'=>'انتهت مهلة الجولة. ابدئي جولة جديدة.'],410);
    }
    return $row;
}

function interactive_game_builder_answers_equal(string $type,mixed $selected,mixed $correct): bool
{
    if($type==='multiple_choice') return filter_var($selected,FILTER_VALIDATE_INT)!==false&&(int)$selected===(int)$correct;
    if($type==='true_false') {
        $value=is_bool($selected)?$selected:filter_var($selected,FILTER_VALIDATE_BOOLEAN,FILTER_NULL_ON_FAILURE);
        return $value!==null&&$value===(bool)$correct;
    }
    if(!is_array($selected)||!is_array($correct)||count($selected)!==count($correct)) return false;
    if($type==='ordering') return array_values(array_map('strval',$selected))===array_values(array_map('strval',$correct));
    $normalize=static function(array $pairs): array {
        $map=[];foreach($pairs as $pair){$left=trim((string)($pair['left']??''));$right=trim((string)($pair['right']??''));if($left!=='')$map[$left]=$right;}ksort($map);return $map;
    };
    return $normalize($selected)===$normalize($correct);
}

function interactive_game_builder_run_answer(int $studentId,string $token): never
{
    interactive_game_builder_require_schema();$run=interactive_game_builder_run_row($studentId,$token);$data=Http::input();$state=interactive_game_builder_json_decode($run['run_state_json'],[]);
    $source=(string)$run['version_source_type'];$duration=filter_var($data['durationMs']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>3600000]]);$duration=$duration===false?null:$duration;
    if($source==='template') {
        $index=(int)($state['index']??0);$ids=(array)($state['questionIds']??[]);$questionId=(int)($ids[$index]??0);
        if($questionId<1) Http::json(['error'=>'اكتملت أسئلة الجولة. احفظي النتيجة الآن.'],409);
        $question=fetch_one('SELECT * FROM interactive_game_questions WHERE id=? AND version_id=? LIMIT 1',[$questionId,(int)$run['game_version_id']]);
        if(!$question||(string)($data['questionKey']??'')!==(string)$question['question_key']) Http::json(['error'=>'ترتيب الإجابة لا يطابق الجولة.'],409);
        $selected=$data['answer']??null;$correct=interactive_game_builder_json_decode($question['correct_answer_json'],null);
        $isCorrect=interactive_game_builder_answers_equal((string)$question['question_type'],$selected,$correct);$earned=$isCorrect?(int)$question['points']:0;
        $skillRow=fetch_one('SELECT skill_id FROM interactive_game_question_skills WHERE question_id=? ORDER BY skill_id LIMIT 1',[$questionId]);
        try {
            execute_sql('INSERT INTO interactive_game_attempt_answers (attempt_id,question_id,question_key,answer_json,is_correct,points_earned,duration_ms,skill_id,verification_source) VALUES (?,?,?,?,?,?,?,?,\'server_verified\')',[
                (int)$run['id'],$questionId,(string)$question['question_key'],interactive_game_builder_json_encode($selected),$isCorrect?1:0,$earned,$duration,$skillRow?(int)$skillRow['skill_id']:null,
            ]);
        } catch(PDOException $error) {if((string)$error->getCode()==='23000')Http::json(['error'=>'تم إرسال إجابة هذا السؤال مسبقًا.'],409);throw $error;}
        $state['index']=$index+1;$state['score']=(int)($state['score']??0)+$earned;
        if($isCorrect){$state['correct']=(int)($state['correct']??0)+1;$state['streak']=(int)($state['streak']??0)+1;$state['bestStreak']=max((int)($state['bestStreak']??0),(int)$state['streak']);}else{$state['streak']=0;}
        execute_sql('UPDATE game_attempts SET run_state_json=?,score=?,correct_count=?,best_streak=? WHERE id=? AND run_status=\'in_progress\'',[
            interactive_game_builder_json_encode($state),(int)$state['score'],(int)$state['correct'],(int)$state['bestStreak'],(int)$run['id'],
        ]);
        Http::json(['correct'=>$isCorrect,'explanation'=>(string)($question['explanation']??''),'score'=>(int)$state['score'],'correctCount'=>(int)$state['correct'],'streak'=>(int)$state['streak'],'bestStreak'=>(int)$state['bestStreak'],'completed'=>$state['index']>=count($ids)]);
    }
    $key=trim((string)($data['questionKey']??''));if($key===''||mb_strlen($key)>120) Http::json(['error'=>'معرّف السؤال المرسل من اللعبة غير صالح.'],422);
    $correct=filter_var($data['correct']??null,FILTER_VALIDATE_BOOLEAN,FILTER_NULL_ON_FAILURE);$points=(float)($data['points']??0);
    if($correct===null||$points<0||$points>10000) Http::json(['error'=>'بيانات نتيجة السؤال المرسلة من الحزمة غير صالحة.'],422);
    $skillId=filter_var($data['skillId']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]])?:null;
    if($skillId&&!fetch_one('SELECT 1 AS ok FROM interactive_game_version_skills WHERE version_id=? AND skill_id=?',[(int)$run['game_version_id'],$skillId])) $skillId=null;
    try {
        execute_sql('INSERT INTO interactive_game_attempt_answers (attempt_id,question_id,question_key,answer_json,is_correct,points_earned,duration_ms,skill_id,verification_source) VALUES (?,NULL,?,?,?,?,?,?,\'package_reported\')',[
            (int)$run['id'],$key,interactive_game_builder_json_encode($data['answer']??null),$correct?1:0,$points,$duration,$skillId,
        ]);
    } catch(PDOException $error) {if((string)$error->getCode()==='23000')Http::json(['error'=>'تم تسجيل هذا السؤال مسبقًا.'],409);throw $error;}
    Http::json(['accepted'=>true,'verificationSource'=>'package_reported']);
}

function interactive_game_builder_store_template_skills(int $attemptId,int $studentId): void
{
    $rows=fetch_all(
        "SELECT qs.skill_id,COUNT(DISTINCT a.id) AS question_count,SUM(a.is_correct=1) AS correct_count,SUM(a.points_earned) AS points_earned,SUM(q.points) AS max_points
         FROM interactive_game_attempt_answers a
         JOIN interactive_game_questions q ON q.id=a.question_id
         JOIN interactive_game_question_skills qs ON qs.question_id=q.id
         WHERE a.attempt_id=? GROUP BY qs.skill_id",[$attemptId]
    );
    foreach($rows as $row) {
        $questions=max(1,(int)$row['question_count']);$percent=round(((int)$row['correct_count']/$questions)*100,2);
        execute_sql('INSERT INTO interactive_game_attempt_skills (attempt_id,skill_id,question_count,correct_count,points_earned,max_points,verification_source) VALUES (?,?,?,?,?,?,\'server_verified\')',[
            $attemptId,(int)$row['skill_id'],$questions,(int)$row['correct_count'],(float)$row['points_earned'],(float)$row['max_points'],
        ]);
        execute_sql(
            'INSERT INTO student_skills (student_id,skill_id,mastery_percent,evidence_count) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE mastery_percent=((mastery_percent*evidence_count)+(VALUES(mastery_percent)*VALUES(evidence_count)))/GREATEST(1,evidence_count+VALUES(evidence_count)),evidence_count=evidence_count+VALUES(evidence_count)',
            [$studentId,(int)$row['skill_id'],$percent,$questions]
        );
    }
}

function interactive_game_builder_store_package_skills(int $attemptId,int $versionId,array $items): void
{
    foreach(array_slice($items,0,50) as $item) {
        if(!is_array($item)) continue;$skillId=filter_var($item['skillId']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($skillId===false||!fetch_one('SELECT 1 AS ok FROM interactive_game_version_skills WHERE version_id=? AND skill_id=?',[$versionId,(int)$skillId])) continue;
        $questions=max(0,min(1000,(int)($item['questionCount']??0)));$correct=max(0,min($questions,(int)($item['correctCount']??0)));
        $points=max(0,min(100000,(float)($item['points']??0)));$maxPoints=max($points,min(100000,(float)($item['maxPoints']??$points)));
        execute_sql('INSERT INTO interactive_game_attempt_skills (attempt_id,skill_id,question_count,correct_count,points_earned,max_points,verification_source) VALUES (?,?,?,?,?,?,\'package_reported\') ON DUPLICATE KEY UPDATE question_count=VALUES(question_count),correct_count=VALUES(correct_count),points_earned=VALUES(points_earned),max_points=VALUES(max_points)',[
            $attemptId,(int)$skillId,$questions,$correct,$points,$maxPoints,
        ]);
    }
}

function interactive_game_builder_run_complete(int $studentId,string $token): never
{
    interactive_game_builder_require_schema();$run=interactive_game_builder_run_row($studentId,$token);$data=Http::input();$source=(string)$run['version_source_type'];$state=interactive_game_builder_json_decode($run['run_state_json'],[]);
    if($source==='template') {
        $questionCount=count((array)($state['questionIds']??[]));if((int)($state['index']??0)!==$questionCount) Http::json(['error'=>'لم تكتمل جميع أسئلة الجولة بعد.'],409);
        $score=(int)($state['score']??0);$correct=(int)($state['correct']??0);$best=(int)($state['bestStreak']??0);$maxScore=(float)($run['max_score']??0);
    } else {
        $questionCount=filter_var($data['questionCount']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>2000]]);
        $correct=filter_var($data['correctCount']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>$questionCount?:0]]);
        $score=filter_var($data['score']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>1000000]]);
        $best=filter_var($data['bestStreak']??0,FILTER_VALIDATE_INT,['options'=>['min_range'=>0,'max_range'=>2000]]);
        $maxScore=(float)($data['maxScore']??0);
        if($questionCount===false||$correct===false||$score===false||$best===false||$maxScore<0||$maxScore>1000000) Http::json(['error'=>'ملخص النتيجة المرسل من الحزمة غير صالح.'],422);
    }
    $duration=filter_var($data['durationSeconds']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>86400]]);
    if($duration===false||$duration===null) $duration=max(1,min(86400,time()-strtotime((string)$run['started_at'])));
    $accuracy=round(($correct/max(1,$questionCount))*100,2);
    $updated=execute_sql("UPDATE game_attempts SET score=?,max_score=?,question_count=?,correct_count=?,best_streak=?,accuracy=?,duration_seconds=?,run_status='completed',expires_at=NULL,played_at=NOW() WHERE id=? AND run_status='in_progress'",[
        $score,$maxScore?:null,$questionCount,$correct,$best,$accuracy,$duration,(int)$run['id'],
    ]);
    if($updated->rowCount()!==1) Http::json(['error'=>'تم حفظ هذه الجولة مسبقًا.'],409);
    if($source==='template') interactive_game_builder_store_template_skills((int)$run['id'],$studentId);
    else interactive_game_builder_store_package_skills((int)$run['id'],(int)$run['game_version_id'],(array)($data['skills']??[]));
    $motivationPointId=null;
    if((bool)$run['points_enabled']&&(int)$run['points_value']>0) {
        execute_sql('INSERT INTO motivational_points (teacher_id,student_id,points,reason_type,reason,details) VALUES (?,?,?,\'other\',?,?)',[
            (int)$run['teacher_id'],$studentId,(int)$run['points_value'],'إكمال لعبة تفاعلية',(string)$run['game_name'].' · محاولة رقم '.(int)$run['id'],
        ]);
        $motivationPointId=(int)Database::connection()->lastInsertId();
        execute_sql('UPDATE game_attempts SET motivation_point_id=? WHERE id=? AND motivation_point_id IS NULL',[$motivationPointId,(int)$run['id']]);
    }
    $snapshot=interactive_game_builder_json_decode($run['game_snapshot_json'],[]);
    $certificate=student_game_certificate_after_attempt($studentId,(int)$run['id'],(string)$run['game_key'],(string)$run['difficulty'],$score,$accuracy,$correct,$questionCount,$duration,$snapshot);
    execute_sql('UPDATE students SET last_active=NOW() WHERE id=?',[$studentId]);
    Activity::log('student',$studentId,'إكمال لعبة',(string)$run['game_name'].' - '.$accuracy.'%');
    Http::json([
        'id'=>(int)$run['id'],'saved'=>true,'accuracy'=>$accuracy,'score'=>$score,'correctCount'=>$correct,'questionCount'=>$questionCount,
        'verificationSource'=>$source==='template'?'server_verified':'package_reported','awardedPoints'=>$motivationPointId?(int)$run['points_value']:0,
        'certificate'=>$certificate,'certificateSaved'=>(bool)($certificate['saved']??false),
        'message'=>$certificate===null?'لن تصدر الشهادة قبل اكتمال رقم الوحدة ورقم الدرس واسم الدرس.':null,
    ],201);
}

function student_interactive_game_builder_routes(string $method,array $segments,int $studentId): never
{
    $action=$segments[0]??'';
    if($action!=='runs') Http::json(['error'=>'مسار تشغيل اللعبة غير موجود.'],404);
    if($method==='POST'&&count($segments)===1) interactive_game_builder_run_start($studentId);
    $token=(string)($segments[1]??'');$sub=$segments[2]??'';
    if($method==='POST'&&$sub==='answers') interactive_game_builder_run_answer($studentId,$token);
    if($method==='POST'&&$sub==='complete') interactive_game_builder_run_complete($studentId,$token);
    Http::json(['error'=>'مسار جولة اللعبة غير موجود.'],404);
}
