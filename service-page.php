<?php
declare(strict_types=1);
// Protect existing static service pages with the same native account policy.
require_once __DIR__.'/config/bootstrap.php';
$path=rawurldecode((string)(parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/'));
if(!preg_match('#^/(games|planning|meetings)/.+\.html$#D',$path)||str_contains($path,"\0")){http_response_code(404);exit;}
$file=realpath(__DIR__.$path);
if(!$file||!str_starts_with($file,__DIR__.'/')||!is_file($file)){http_response_code(404);exit;}
$actor=Auth::user();if($actor)PortalAccess::pageGuard($actor);
header('Content-Type: text/html; charset=utf-8');
readfile($file);
