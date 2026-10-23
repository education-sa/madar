<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/config/bootstrap.php';
$user = Auth::user();
if (!$user || $user['role'] !== 'teacher') {
    header('Location: /teacher/login.html');
    exit;
}
if (!empty($_SESSION['ms_return_after_login'])) {
    $next=(string)$_SESSION['ms_return_after_login'];unset($_SESSION['ms_return_after_login']);
    if (str_starts_with($next,'/surveys/public/')&&!str_contains($next,"\r")&&!str_contains($next,"\n")) {header('Location: '.$next);exit;}
}
$html=file_get_contents(__DIR__.'/index.html');
echo str_replace('</body>','<script src="/surveys/public/assets/madar-link.js"></script></body>',$html);
