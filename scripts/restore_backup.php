<?php
declare(strict_types=1);

/**
 * استعادة نسخة SQL أنشأتها منصة مدار.
 *
 * الاستخدام:
 * php scripts/restore_backup.php --file=/path/to/backups/file.sql --confirm=استعادة-مدار
 *
 * لا تُتاح الاستعادة من المتصفح لحماية قاعدة البيانات من النقرات العرضية.
 */

require_once __DIR__.'/../config/bootstrap.php';
require_once __DIR__.'/../api/shared.php';
require_once __DIR__.'/../api/parent_portal.php';
require_once __DIR__.'/../api/platform_enhancements.php';

$options=getopt('', ['file:','confirm:','dry-run']);
$file=trim((string)($options['file']??''));
$confirmation=(string)($options['confirm']??'');
$dryRun=array_key_exists('dry-run',$options);

if($file===''||$confirmation!=='استعادة-مدار'){
    fwrite(STDERR,"الاستخدام:\n  php scripts/restore_backup.php --file=/المسار/للنسخة.sql --confirm=استعادة-مدار\n");
    exit(2);
}

$real=realpath($file);
$backupRoot=realpath(MADAR_ROOT.'/backups');
if(!$real||!is_file($real)||strtolower(pathinfo($real,PATHINFO_EXTENSION))!=='sql'){
    fwrite(STDERR,"ملف النسخة غير موجود أو ليس ملف SQL.\n");
    exit(2);
}
if(!$backupRoot||!str_starts_with($real,$backupRoot.DIRECTORY_SEPARATOR)){
    fwrite(STDERR,"للحماية، يجب أن يكون ملف الاستعادة داخل مجلد backups في المشروع.\n");
    exit(2);
}
if(filesize($real)===0){
    fwrite(STDERR,"ملف النسخة فارغ.\n");
    exit(2);
}

/** @return Generator<int,string> */
function madar_sql_statements(string $path): Generator
{
    $handle=fopen($path,'rb');
    if(!$handle) throw new RuntimeException('تعذر فتح ملف النسخة.');
    $statement='';
    $quote=null;
    $escaped=false;
    $lineComment=false;
    $blockComment=false;
    $previous='';
    try{
        while(!feof($handle)){
            $chunk=fread($handle,65536);
            if($chunk===false) throw new RuntimeException('تعذر قراءة ملف النسخة.');
            $length=strlen($chunk);
            for($i=0;$i<$length;$i++){
                $char=$chunk[$i];
                $next=$i+1<$length?$chunk[$i+1]:'';

                if($lineComment){
                    if($char==="\n"){$lineComment=false;$statement.=$char;}
                    continue;
                }
                if($blockComment){
                    if($previous==='*'&&$char==='/')$blockComment=false;
                    $previous=$char;
                    continue;
                }
                if($quote!==null){
                    $statement.=$char;
                    if($escaped){$escaped=false;$previous=$char;continue;}
                    if($char==='\\'&&$quote!=='`'){$escaped=true;$previous=$char;continue;}
                    if($char===$quote){
                        // SQL يدعم تكرار علامة الاقتباس للهروب: '' أو "" أو ``.
                        if($next===$quote){$statement.=$next;$i++;$previous=$next;continue;}
                        $quote=null;
                    }
                    $previous=$char;
                    continue;
                }

                if($char==='-'&&$next==='-' && ($i+2>=$length || ctype_space($chunk[$i+2]))){$lineComment=true;$i++;$previous='';continue;}
                if($char==='#'){$lineComment=true;$previous='';continue;}
                if($char==='/'&&$next==='*'){$blockComment=true;$i++;$previous='';continue;}
                if($char==="'"||$char==='"'||$char==='`'){$quote=$char;$statement.=$char;$previous=$char;continue;}
                if($char===';'){
                    $sql=trim($statement);
                    $statement='';
                    if($sql!=='') yield $sql;
                    $previous='';
                    continue;
                }
                $statement.=$char;
                $previous=$char;
            }
        }
        $tail=trim($statement);
        if($tail!=='') yield $tail;
    } finally { fclose($handle); }
}

try{
    $statementCount=0;
    foreach(madar_sql_statements($real) as $ignored)$statementCount++;
    if($statementCount<3) throw new RuntimeException('ملف النسخة لا يبدو نسخة قاعدة بيانات كاملة من مدار.');
    fwrite(STDOUT,"تم فحص النسخة: ".basename($real)." | عدد الأوامر: {$statementCount}\n");
    if($dryRun){fwrite(STDOUT,"فحص تجريبي ناجح، لم يتم تعديل قاعدة البيانات.\n");exit(0);}

    // نسخة أمان تلقائية للحالة الحالية قبل أي استعادة.
    $safety=platform_create_database_backup('manual','system',null);
    fwrite(STDOUT,"تم إنشاء نسخة أمان قبل الاستعادة: {$safety['fileName']}\n");

    $pdo=Database::connection();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    $executed=0;
    try{
        foreach(madar_sql_statements($real) as $sql){
            $pdo->exec($sql);
            $executed++;
            if($executed%100===0)fwrite(STDOUT,"تم تنفيذ {$executed} أمر...\n");
        }
    } finally {
        try{$pdo->exec('SET FOREIGN_KEY_CHECKS=1');}catch(Throwable){}
    }

    // إعادة تسجيل نسخة الأمان لأن جدول سجل النسخ قد يكون استُعيد من نسخة أقدم.
    ensure_platform_enhancement_schema();
    $existing=fetch_one('SELECT id FROM system_backup_history WHERE file_name=? LIMIT 1',[$safety['fileName']]);
    if(!$existing){
        execute_sql("INSERT INTO system_backup_history(backup_type,file_name,file_path,size_bytes,sha256,status,created_by_role,details) VALUES('manual',?,?,?,?, 'verified','system',?)",[
            $safety['fileName'],$safety['path'],$safety['sizeBytes'],$safety['sha256'],'نسخة أمان أُنشئت تلقائيًا قبل عملية الاستعادة'
        ]);
    }
    Activity::log('system',null,'استعادة نسخة احتياطية',basename($real).' | '.$executed.' أمر');
    fwrite(STDOUT,"اكتملت الاستعادة بنجاح. الأوامر المنفذة: {$executed}\n");
    fwrite(STDOUT,"احتفظي بنسخة الأمان: {$safety['fileName']}\n");
}catch(Throwable $error){
    try{
        execute_sql("INSERT INTO system_error_log(severity,source,message,context_json) VALUES('critical','restore',?,?)",[
            mb_substr($error->getMessage(),0,2000),json_encode(['file'=>$real?:$file],JSON_UNESCAPED_UNICODE)
        ]);
    }catch(Throwable){}
    fwrite(STDERR,"فشلت الاستعادة: {$error->getMessage()}\n");
    exit(1);
}
