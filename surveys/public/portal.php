<?php
declare(strict_types=1);
require_once dirname(__DIR__,2).'/config/bootstrap.php';
$u=Auth::realUser();if(!$u){header('Location: /dhalim/login/');exit;}
PortalAccess::requirePortal($u);
unset($_SESSION['ms_return_after_login']);
if(PortalAccess::owner($u)){header('Location: /owner/dashboard?section=teachers');exit;}
if(($u['role']??'')==='student'){header('Location: /dhalim/student/');exit;}
if(($u['role']??'')!=='parent'){header('Location: /dhalim/');exit;}
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>بوابة ظليم — ولي الأمر</title><link rel="stylesheet" href="/surveys/public/assets/board.css"><main class="mb-shell"><header class="mb-heading"><h1>بوابة مجمع مدارس ظليم للبنات</h1></header><p>متابعة الفصول المرتبطة ببناتك</p><div id="portalChildren"></div></main><script src="/surveys/public/assets/portal-parent.js"></script></html>
