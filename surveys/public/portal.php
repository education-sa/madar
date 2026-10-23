<?php
declare(strict_types=1);
require_once dirname(__DIR__,2).'/config/bootstrap.php';
$u=Auth::realUser();if(!$u){header('Location: /login.html?role=teacher');exit;}
PortalAccess::requirePortal($u);
if(PortalAccess::owner($u)){header('Location: /owner/dashboard?section=teachers');exit;}
if(($u['role']??'')==='student'){header('Location: board-student.php');exit;}
if(($u['role']??'')!=='parent'){header('Location: ./');exit;}
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>بوابة ظليم — ولي الأمر</title><link rel="stylesheet" href="assets/board.css"><main class="mb-shell"><h1>بوابة مجمع مدارس ظليم للبنات</h1><p>متابعة الفصول المرتبطة ببناتك</p><div id="portalChildren"></div><a href="/parent/">العودة إلى مدار</a></main><script src="assets/portal-parent.js"></script></html>
