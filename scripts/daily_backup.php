<?php
declare(strict_types=1);
require_once __DIR__.'/../config/bootstrap.php';
require_once __DIR__.'/../api/shared.php';
require_once __DIR__.'/../api/parent_portal.php';
require_once __DIR__.'/../api/platform_enhancements.php';

try {
    $existing=fetch_one("SELECT id,file_name,created_at FROM system_backup_history WHERE backup_type='daily' AND DATE(created_at)=CURDATE() AND status IN('created','verified') LIMIT 1");
    if($existing){fwrite(STDOUT,"Daily backup already exists: {$existing['file_name']}\n");exit(0);}

    $result=platform_create_database_backup('daily','system',null);
    fwrite(STDOUT,"Created: {$result['fileName']} ({$result['sizeBytes']} bytes)\n");

    // الاحتفاظ بالنسخ اليومية للمدة المحددة فقط، مع عدم لمس النسخ اليدوية أو نسخ بداية العام.
    $retention=max(7,min(365,(int)(env_value('BACKUP_RETENTION_DAYS','30')??'30')));
    $cutoff=(new DateTimeImmutable('now'))->modify('-'.$retention.' days')->format('Y-m-d H:i:s');
    $expired=fetch_all("SELECT id,file_name,file_path FROM system_backup_history WHERE backup_type='daily' AND status<>'deleted' AND created_at<?",[$cutoff]);
    foreach($expired as $row){
        $path=(string)$row['file_path'];
        $base=realpath(platform_backup_directory());
        $real=$path!==''?realpath($path):false;
        if($real&&$base&&str_starts_with($real,$base.DIRECTORY_SEPARATOR)&&is_file($real))@unlink($real);
        execute_sql("UPDATE system_backup_history SET status='deleted',details=? WHERE id=?",['حذف تلقائي بعد انتهاء مدة الاحتفاظ '.$retention.' يومًا',(int)$row['id']]);
    }
    if($expired)fwrite(STDOUT,"Removed expired daily backups: ".count($expired)."\n");
} catch(Throwable $error){
    fwrite(STDERR,"Backup failed: {$error->getMessage()}\n");
    exit(1);
}
