<?php
require dirname(__DIR__).'/app/bootstrap.php';
if(($_GET['view']??'')==='admin'){header('Location: /owner/dashboard');exit;}
$native=Auth::realUser();
if(!isset($_GET['s'])&&!isset($_GET['reset'])){
 if(!$native){require __DIR__.'/login.php';exit;}
 PortalAccess::requirePortal($native);
unset($_SESSION['ms_return_after_login']);
 if(in_array($native['role']??'',['student','parent'],true)){header('Location: '.PortalAccess::destination($native));exit;}
}
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__.'/shell.html');
