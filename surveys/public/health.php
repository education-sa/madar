<?php
declare(strict_types=1);
// Read-only readiness check: no credentials, identifiers or personal data.
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
try {
 $root=dirname(__DIR__);$checks=[];
 $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS));
 foreach ($it as $file) if ($file->isFile()&&$file->getExtension()==='php') token_get_all(file_get_contents($file->getPathname()),TOKEN_PARSE);
 $checks['php_syntax']=true;require $root.'/app/bootstrap.php';
 $checks['required_extensions']=extension_loaded('pdo_mysql')&&extension_loaded('mbstring')&&extension_loaded('fileinfo')&&extension_loaded('gd');
 foreach (['ms_users','ms_tokens','ms_surveys','ms_responses','ms_templates','ms_settings','ms_limits'] as $table) sql('SELECT 1 FROM '.$table.' LIMIT 1');
 $checks['database_tables']=true;
 $checks['original_templates']=(int)sql("SELECT COUNT(*) FROM ms_templates WHERE kind IN ('applied','workshop') AND active=1")->fetchColumn()>=2;
 $checks['unique_response_constraint']=(bool)sql("SHOW INDEX FROM ms_responses WHERE Key_name='ms_one_response' AND Non_unique=0")->fetch();
 $def=['axes'=>[['name'=>'محور','qs'=>[['text'=>'سؤال','type'=>'rating3','options'=>['لا','نوعاً ما','نعم'],'reverse'=>true]]]]];
 $checks['definition_validation']=definition($def)['axes'][0]['qs'][0]['reverse']===true;
 $rejected=false;try { definition(['axes'=>[]]); } catch (DomainException $e) {$rejected=true;}
 $checks['reject_invalid_definition']=$rejected;
 $ok=!in_array(false,$checks,true);http_response_code($ok?200:503);echo json_encode(['ok'=>$ok,'checks'=>$checks]);
} catch (Throwable $e) { error_log('Surveys readiness: '.$e->getMessage());http_response_code(503);echo '{"ok":false}'; }
