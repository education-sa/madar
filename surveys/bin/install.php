<?php
if (PHP_SAPI!=='cli') { http_response_code(404);exit; }
require dirname(__DIR__).'/app/bootstrap.php';
// Explicit additive installation only; no DROP or alteration of Madar tables.
$schema=file_get_contents(dirname(__DIR__).'/database/schema.sql');
foreach (explode(';',$schema) as $statement) if (trim($statement)!=='') db()->exec($statement);
foreach (glob(dirname(__DIR__).'/database/migrations/*.sql') ?: [] as $migration) {
 $contents=file_get_contents($migration);
 $contents=preg_replace('/^\s*--.*$/m','',(string)$contents);
 foreach (explode(';',$contents) as $statement) if (trim($statement)!=='') db()->exec(trim($statement));
}
if (!(int)sql('SELECT COUNT(*) FROM ms_templates')->fetchColumn()) {
 $templates=json_decode(file_get_contents(dirname(__DIR__).'/database/templates.json'),true);
 foreach ($templates as $t) sql('INSERT INTO ms_templates(name,kind,definition) VALUES (?,?,?)',[$t['name'],$t['kind'],json_encode(['axes'=>$t['axes']],JSON_UNESCAPED_UNICODE)]);
}
echo "تم تجهيز جداول مدار والبوابة والترحيلات الإضافية والقوالب دون حذف بيانات قائمة.\n";
