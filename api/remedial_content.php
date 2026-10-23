<?php
declare(strict_types=1);

function remedial_content_ready(): bool {
    return (bool)fetch_one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='remedial_content_items'");
}
function remedial_content_schema(): void {
    execute_sql("CREATE TABLE IF NOT EXISTS remedial_content_bundles (
        plan_id BIGINT UNSIGNED PRIMARY KEY, teacher_id BIGINT UNSIGNED NOT NULL,
        request_key VARCHAR(64) NOT NULL, academic_year VARCHAR(30) NOT NULL, semester VARCHAR(10) NOT NULL,
        UNIQUE KEY remedial_request(teacher_id,request_key),
        FOREIGN KEY(plan_id) REFERENCES remedial_plans(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    execute_sql("CREATE TABLE IF NOT EXISTS remedial_content_items (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, plan_id BIGINT UNSIGNED NOT NULL,
        kind VARCHAR(20) NOT NULL, source_id BIGINT UNSIGNED NOT NULL, copy_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(190) NOT NULL, sort_order INT NOT NULL,
        UNIQUE KEY remedial_copy(kind,copy_id), KEY remedial_plan(plan_id),
        FOREIGN KEY(plan_id) REFERENCES remedial_plans(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}
function remedial_content_allowed(string $kind,int $copyId,int $studentId): bool {
    if(!remedial_content_ready()) return false;
    return (bool)fetch_one("SELECT 1 FROM remedial_content_items i
        JOIN remedial_plans r ON r.id=i.plan_id JOIN remedial_content_bundles b ON b.plan_id=r.id
        JOIN students s ON s.id=r.student_id AND s.deleted_at IS NULL
        JOIN classes c ON c.id=s.class_id AND c.teacher_id=r.teacher_id
        JOIN teacher_school_settings ss ON ss.teacher_id=r.teacher_id
        WHERE i.kind=? AND i.copy_id=? AND s.id=? AND r.status<>'cancelled'
        AND b.academic_year=c.academic_year AND b.semester=ss.current_semester LIMIT 1",[$kind,$copyId,$studentId]);
}
function remedial_content_hidden_sql(string $alias,string $kind): string {
    if(!remedial_content_ready()) return '';
    // Only internal, fixed identifiers reach this helper.
    return " AND NOT EXISTS (SELECT 1 FROM remedial_content_items ri WHERE ri.kind='".$kind."' AND ri.copy_id=".$alias.".id)";
}
function remedial_content_attach(array $plans): array {
    if(!$plans||!remedial_content_ready()) return $plans;
    $ids=array_map(static fn(array $p):int=>(int)$p['id'],$plans);
    $rows=fetch_all('SELECT plan_id,kind,copy_id,title FROM remedial_content_items WHERE plan_id IN ('.implode(',',array_fill(0,count($ids),'?')).') ORDER BY sort_order,id',$ids);
    $map=[];foreach($rows as $row)$map[(int)$row['plan_id']][]=$row;
    foreach($plans as &$plan)$plan['attachments']=$map[(int)$plan['id']]??[];
    unset($plan);return $plans;
}
function remedial_content_catalog(int $teacherId): never {
    $items=[];
    $types=['library-worksheets'=>'worksheet','library-training'=>'training','library-videos'=>'video'];
    if(Rbac::allows((string)Auth::user()['roleCode'],'content.manage')&&function_exists('planning_content_schema_ready')&&planning_content_schema_ready()) {
        foreach(fetch_all("SELECT p.id,p.name,p.destination,p.stage,p.grade_label FROM teacher_planning_content p WHERE p.teacher_id=? AND p.deleted_at IS NULL".remedial_content_hidden_sql('p','content')." ORDER BY p.name",[$teacherId]) as $r) {
            if(isset($types[$r['destination']]))$items[]=['kind'=>'content','id'=>(int)$r['id'],'category'=>$types[$r['destination']],'title'=>$r['name'],'stage'=>$r['stage'],'grade'=>$r['grade_label']];
        }
    }
    if(Rbac::allows((string)Auth::user()['roleCode'],'school_settings.manage')&&function_exists('interactive_game_builder_schema_ready')&&interactive_game_builder_schema_ready()) {
        foreach(fetch_all("SELECT g.id,g.name,g.stage,g.grade_label FROM teacher_interactive_games g JOIN interactive_game_versions v ON v.id=g.current_version_id AND v.validation_status='ready' WHERE g.teacher_id=? AND g.deleted_at IS NULL AND g.source_type IN ('template','package')".remedial_content_hidden_sql('g','game')." ORDER BY g.name",[$teacherId]) as $r)
            $items[]=['kind'=>'game','id'=>(int)$r['id'],'category'=>'game','title'=>$r['name'],'stage'=>$r['stage'],'grade'=>$r['grade_label']];
    }
    if(Rbac::allows((string)Auth::user()['roleCode'],'tests.view'))foreach(fetch_all('SELECT t.id,t.title,c.stage,c.grade_label FROM tests t LEFT JOIN classes c ON c.id=t.class_id WHERE t.teacher_id=?'.remedial_content_hidden_sql('t','test').' ORDER BY t.id DESC',[$teacherId]) as $r)
        $items[]=['kind'=>'test','id'=>(int)$r['id'],'category'=>'test','title'=>$r['title'],'stage'=>$r['stage'],'grade'=>$r['grade_label']];
    Http::json(['items'=>$items]);
}
function remedial_content_insert(PDO $pdo,string $table,array $row,array $overrides=[]): int {
    $allowed=['teacher_planning_content','tests','test_questions','teacher_interactive_games','interactive_game_versions','interactive_game_questions','interactive_game_version_skills','interactive_game_question_skills'];
    if(!in_array($table,$allowed,true))throw new LogicException('Invalid copy table');
    unset($row['id'],$row['created_at'],$row['updated_at']);$row=array_replace($row,$overrides);
    $columns=array_keys($row);
    foreach($columns as $column)if(!preg_match('/^[a-z_]+$/D',$column))throw new LogicException('Invalid column');
    $statement=$pdo->prepare('INSERT INTO `'.$table.'` (`'.implode('`,`',$columns).'`) VALUES ('.implode(',',array_fill(0,count($columns),'?')).')');
    $statement->execute(array_values($row));return (int)$pdo->lastInsertId();
}
function remedial_content_copy_files(string $folder,string $key,array &$createdDirs): string {
    if(!in_array($folder,['planning-content','interactive-games'],true)||!preg_match('/^[a-zA-Z0-9_-]+$/D',$key))throw new RuntimeException('مسار المحتوى غير صالح.');
    $root=MADAR_ROOT.'/storage/private/'.$folder;
    $source=realpath($root.'/'.$key);$base=realpath($root);
    if(!$source||!$base||!str_starts_with($source,$base.DIRECTORY_SEPARATOR))throw new RuntimeException('ملفات المحتوى غير موجودة.');
    $newKey=bin2hex(random_bytes(24));$target=$root.'/'.$newKey;
    if(!mkdir($target,0750))throw new RuntimeException('تعذّر إنشاء نسخة الملف.');
    $createdDirs[]=$target;
    foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::SELF_FIRST) as $file) {
        if($file->isLink())throw new RuntimeException('ملف المحتوى غير صالح للنسخ.');
        $dest=$target.'/'.substr($file->getPathname(),strlen($source)+1);
        if($file->isDir()){if(!mkdir($dest,0750))throw new RuntimeException('تعذّر نسخ مجلد المحتوى.');}
        elseif(!copy($file->getPathname(),$dest))throw new RuntimeException('تعذّر نسخ المحتوى.');
        else chmod($dest,0640);
    }
    return $newKey;
}
function remedial_content_create(int $teacherId): never {
    $data=Http::input();$sid=(int)($data['studentId']??0);$title=trim((string)($data['title']??''));
    $activity=trim((string)($data['activity']??''));$due=trim((string)($data['dueDate']??''));$request=(string)($data['requestKey']??'');
    $selections=$data['items']??[];
    if(!$sid||!teacher_owns_student($teacherId,$sid))Http::json(['error'=>'اختاري طالبة من فصولك.'],422);
    if($title===''||mb_strlen($title)>190||mb_strlen($activity)>1000||!preg_match('/^[a-f0-9-]{32,64}$/D',$request))Http::json(['error'=>'تحققي من عنوان الخطة والتعليمات.'],422);
    if($due!==''&&(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$due)||date('Y-m-d',strtotime($due))!==$due))Http::json(['error'=>'الموعد غير صالح.'],422);
    if(!is_array($selections)||count($selections)<1||count($selections)>20)Http::json(['error'=>'اختاري من محتوى واحد إلى ٢٠ محتوى.'],422);
    remedial_content_schema();
    $existing=fetch_one('SELECT plan_id FROM remedial_content_bundles WHERE teacher_id=? AND request_key=?',[$teacherId,$request]);
    if($existing)Http::json(['id'=>(int)$existing['plan_id'],'ok'=>true]);
    $student=fetch_one('SELECT c.academic_year FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=? AND c.teacher_id=?',[$sid,$teacherId]);
    $settings=teacher_school_settings_row($teacherId);$semester=(string)($settings['current_semester']??'first');
    $sources=[];$seen=[];
    // Resolve and validate all sources before starting a database transaction or copying files.
    foreach($selections as $item) {
        $kind=(string)($item['kind']??'');$id=(int)($item['id']??0);$key=$kind.':'.$id;
        if(isset($seen[$key]))continue;$seen[$key]=true;
        $table=['content'=>'teacher_planning_content','game'=>'teacher_interactive_games','test'=>'tests'][$kind]??null;
        if(!$table||$id<1)Http::json(['error'=>'أحد العناصر غير صالح.'],422);
        $row=fetch_one('SELECT * FROM '.$table.' WHERE id=? AND teacher_id=?',[$id,$teacherId]);
        if(!$row||!empty($row['deleted_at']))Http::json(['error'=>'أحد العناصر لم يعد متاحًا في حسابك.'],422);
        if(fetch_one('SELECT 1 FROM remedial_content_items WHERE kind=? AND copy_id=?',[$kind,$id]))Http::json(['error'=>'اختاري المحتوى الأصلي من القسم.'],422);
        $source=['kind'=>$kind,'id'=>$id,'row'=>$row];
        if($kind==='content'&&!in_array($row['destination'],['library-worksheets','library-training','library-videos'],true))Http::json(['error'=>'اختاري المحتوى من الموارد المكتبية.'],422);
        if($kind==='test') {
            $source['questions']=build_attempt_question_rows($row,$sid,1,0);
            if(!$source['questions'])Http::json(['error'=>'الاختبار لا يحتوي أسئلة جاهزة.'],422);
        }
        if($kind==='game') {
            $source['version']=fetch_one("SELECT * FROM interactive_game_versions WHERE id=? AND game_id=? AND validation_status='ready'",[(int)($row['current_version_id']??0),$id]);
            if(!$source['version']||!in_array($row['source_type'],['template','package'],true))Http::json(['error'=>'اللعبة ليست جاهزة للنسخ.'],422);
        }
        Auth::requirePermission(['content'=>'content.manage','game'=>'school_settings.manage','test'=>'tests.manage'][$kind],false);
        $sources[]=$source;
    }
    $createdDirs=[];
    try {
        $planId=Database::transaction(function(PDO $pdo)use($teacherId,$sid,$title,$activity,$due,$request,$student,$semester,$sources,&$createdDirs):int {
            $stmt=$pdo->prepare("INSERT INTO remedial_plans(teacher_id,student_id,title,recommended_activity,due_date,status) VALUES(?,?,?,?,?,'planned')");
            $stmt->execute([$teacherId,$sid,$title,$activity,$due?:null]);$planId=(int)$pdo->lastInsertId();
            $pdo->prepare('INSERT INTO remedial_content_bundles(plan_id,teacher_id,request_key,academic_year,semester) VALUES(?,?,?,?,?)')->execute([$planId,$teacherId,$request,$student['academic_year'],$semester]);
            foreach($sources as $order=>$source) {
                $row=$source['row'];$kind=$source['kind'];$name=(string)($row['name']??$row['title']);
                if($kind==='content') {
                    $storage=remedial_content_copy_files('planning-content',(string)$row['storage_key'],$createdDirs);
                    $copyId=remedial_content_insert($pdo,'teacher_planning_content',$row,['storage_key'=>$storage,'name'=>mb_substr($name.' — خطة علاجية',0,190),'lifecycle_status'=>'draft']);
                } elseif($kind==='test') {
                    $total=array_sum(array_column($source['questions'],'points'));
                    $copyId=remedial_content_insert($pdo,'tests',$row,['title'=>mb_substr($name.' — خطة علاجية',0,190),'class_id'=>null,'status'=>'published','question_source'=>'static','start_at'=>null,'end_at'=>null,'academic_year'=>$student['academic_year'],'semester'=>$semester,'total_points'=>$total]);
                    foreach($source['questions'] as $index=>$q) {
                        $values=[];foreach(['bank_question_id','skill_id','question_type','question_text','options_json','correct_answer','explanation','points'] as $column)$values[$column]=$q[$column]??null;
                        remedial_content_insert($pdo,'test_questions',$values,['test_id'=>$copyId,'order_index'=>$index+1]);
                    }
                } else {
                    $copyId=remedial_content_insert($pdo,'teacher_interactive_games',$row,['game_key'=>'remedial-'.bin2hex(random_bytes(12)),'name'=>mb_substr($name.' — خطة علاجية',0,190),'class_id'=>null,'lifecycle_status'=>'draft','current_version_id'=>null,'is_active'=>0]);
                    $version=$source['version'];$oldVersion=(int)$version['id'];
                    if($version['source_type']==='package')$version['storage_key']=remedial_content_copy_files('interactive-games',(string)$version['storage_key'],$createdDirs);
                    $settings=json_decode((string)$version['settings_json'],true)?:[];
                    $settings['gameKey']=(string)fetch_one('SELECT game_key FROM teacher_interactive_games WHERE id=?',[$copyId])['game_key'];
                    $version['settings_json']=json_encode($settings,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
                    $newVersion=remedial_content_insert($pdo,'interactive_game_versions',$version,['game_id'=>$copyId,'version_number'=>1]);
                    foreach(fetch_all('SELECT * FROM interactive_game_version_skills WHERE version_id=?',[$oldVersion]) as $link)remedial_content_insert($pdo,'interactive_game_version_skills',$link,['version_id'=>$newVersion]);
                    foreach(fetch_all('SELECT * FROM interactive_game_questions WHERE version_id=?',[$oldVersion]) as $question) {
                        $qid=remedial_content_insert($pdo,'interactive_game_questions',$question,['version_id'=>$newVersion]);
                        foreach(fetch_all('SELECT * FROM interactive_game_question_skills WHERE question_id=?',[$question['id']]) as $link)remedial_content_insert($pdo,'interactive_game_question_skills',$link,['question_id'=>$qid]);
                    }
                    $pdo->prepare('UPDATE teacher_interactive_games SET current_version_id=? WHERE id=?')->execute([$newVersion,$copyId]);
                }
                $pdo->prepare('INSERT INTO remedial_content_items(plan_id,kind,source_id,copy_id,title,sort_order) VALUES(?,?,?,?,?,?)')->execute([$planId,$kind,$source['id'],$copyId,$name,$order]);
            }
            return $planId;
        });
    } catch(Throwable $error) {
        foreach($createdDirs as $directory) {
            foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST) as $file)$file->isDir()?rmdir($file->getPathname()):unlink($file->getPathname());
            rmdir($directory);
        }
        $existing=fetch_one('SELECT plan_id FROM remedial_content_bundles WHERE teacher_id=? AND request_key=?',[$teacherId,$request]);
        if($existing)Http::json(['id'=>(int)$existing['plan_id'],'ok'=>true]);
        error_log('[remedial-content] '.$error->getMessage());
        Http::json(['error'=>'تعذّر نسخ المحتوى. لم يتم إرسال خطة جزئية. تحققي من ملفات المحتوى ثم أعيدي المحاولة.'],500);
    }
    Activity::log('teacher',$teacherId,'إرسال خطة علاجية بمحتوى منسوخ','الخطة رقم '.$planId);
    Http::json(['id'=>$planId,'ok'=>true],201);
}
function remedial_content_game_row(int $gameId,int $studentId): ?array {
    if(!remedial_content_allowed('game',$gameId,$studentId))return null;
    return fetch_one("SELECT g.*,NULL AS publication_id,v.id AS published_version_id,v.version_number,v.validation_status,v.validation_message,v.settings_json,v.entry_file,v.source_type AS version_source_type,v.template_type AS version_template_type FROM teacher_interactive_games g JOIN interactive_game_versions v ON v.id=g.current_version_id AND v.validation_status='ready' WHERE g.id=? AND g.deleted_at IS NULL",[$gameId]);
}

// Read stored evidence only; opening content is not a completion or a grade.
function remedial_content_results(int $teacherId): never {
    $id=(int)($_GET['planId']??0);
    $plan=fetch_one('SELECT r.* FROM remedial_plans r JOIN students s ON s.id=r.student_id JOIN classes c ON c.id=s.class_id WHERE r.id=? AND r.teacher_id=? AND c.teacher_id=? AND s.deleted_at IS NULL',[$id,$teacherId,$teacherId]);
    if(!$plan) Http::json(['error'=>'الخطة غير موجودة ضمن طالباتك.'],404);
    $items=remedial_content_attach([$plan])[0]['attachments']??[];
    if(!empty($plan['reassessment_test_id'])) $items[]=['kind'=>'test','copy_id'=>$plan['reassessment_test_id'],'title'=>'اختبار إعادة القياس'];
    $hasPortfolio=(bool)fetch_one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='student_portfolio_files'");
    $sid=(int)$plan['student_id'];$out=[];
    foreach($items as $item){
        $copy=(int)$item['copy_id'];$result=['title'=>$item['title'],'message'=>'لا توجد نتيجة مسجلة لهذا المحتوى.','records'=>[]];
        if($item['kind']==='test'){
            $result['records']=fetch_all("SELECT a.status,a.score,a.total_points,a.percentage,a.submitted_at AS date FROM test_attempts a JOIN tests t ON t.id=a.test_id WHERE a.test_id=? AND a.student_id=? AND t.teacher_id=? ORDER BY a.id DESC LIMIT 20",[$copy,$sid,$teacherId]);
            $result['type']='test';$result['message']='لم تُسلّم الطالبة الاختبار بعد.';
        }elseif($item['kind']==='game'){
            $result['records']=fetch_all("SELECT a.run_status AS status,a.score,a.max_score AS total_points,a.accuracy AS percentage,a.played_at AS date FROM game_attempts a JOIN teacher_interactive_games g ON g.id=a.game_id WHERE a.game_id=? AND a.student_id=? AND g.teacher_id=? ORDER BY a.id DESC LIMIT 20",[$copy,$sid,$teacherId]);
            $result['type']='game';$result['message']='لا توجد محاولة لعبة مسجلة بعد.';
        }elseif($item['kind']==='content'){
            $content=fetch_one('SELECT source_type,destination FROM teacher_planning_content WHERE id=? AND teacher_id=?',[$copy,$teacherId]);
            $result['type']='content';
            if($content&&$content['source_type']==='pdf'&&$content['destination']==='library-worksheets'){
                $result['type']='worksheet';$result['message']='لم تُرسل الطالبة حل ورقة العمل بعد.';
                if($hasPortfolio)$result['records']=fetch_all("SELECT id,review_status AS status,teacher_comment,created_at AS date FROM student_portfolio_files WHERE student_id=? AND category='worksheet' AND original_name LIKE ? ORDER BY id DESC LIMIT 20",[$sid,'worksheet-'.$copy.'-%']);
            }elseif($content&&in_array($content['source_type'],['html','zip'],true)){
                $result['type']='html_game';$result['message']='لم تصل نتيجة مرحلة من اللعبة بعد.';
                $ready=fetch_one("SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='remedial_html_results'");
                if($ready)$result['records']=fetch_all("SELECT 'completed' AS status,correct_count AS score,total_count AS total_points,ROUND(100*correct_count/total_count,1) AS percentage,phase,created_at AS date FROM remedial_html_results WHERE plan_id=? AND student_id=? AND content_id=? ORDER BY id DESC LIMIT 50",[$id,$sid,$copy]);
            }else{$result['message']='هذا المحتوى لا يرسل نتيجة تلقائية؛ عرضه لا يعني إكماله.';}
        }
        $out[]=$result;
    }
    Http::json(['items'=>$out,'afterPercent'=>$plan['after_percent']]);
}
