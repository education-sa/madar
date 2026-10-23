<?php
declare(strict_types=1);
require dirname(__DIR__).'/app/bootstrap.php';
$native=Auth::realUser();if(!$native||($native['role']??'')!=='student'){header('Location: /login.html?role=student');exit;}
PortalAccess::requirePortal($native);
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مجمع مدارس ظليم – بوابتي</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="assets/board.css"><style>body{font-family:Cairo,Tahoma,sans-serif;background:radial-gradient(at top right,#e9e2fa,transparent 65%),radial-gradient(at bottom left,#dbf6f3,transparent 70%),#f8f6fc;min-height:100vh;margin:0;padding:30px 20px}.mb-board{max-width:960px}.mb-box p{line-height:1.9}.mb-top{max-width:960px;margin:0 auto 25px;color:#502984}</style></head><body><header class="mb-top"><h2>بوابة مجمع مدارس ظليم</h2><p>لوحتي المدرسية – ملف الإنجاز وجدار الفصل</p></header><main id="studentBoard" class="mb-board" aria-live="polite">جاري تحميل بياناتك...</main><script src="assets/board-student.js?v=20261023-unified"></script></body></html>
