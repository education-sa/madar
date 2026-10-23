<?php
declare(strict_types=1);
$cfg=require dirname(__DIR__).'/config.php'; // reuses Madar's bootstrap/session
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
$loginRole=in_array($_GET['role']??'', ['teacher','student'],true)?$_GET['role']:'';
$next=(string)($_GET['return_to']??'/dhalim/');
if (!(str_starts_with($next,'/surveys/public/')||preg_match('~^/dhalim/(?:\\?.*)?$~D',$next))||str_contains($next,"\r")||str_contains($next,"\n")||str_contains($next,"\\")) $next='/dhalim/';
$registerStudent=$loginRole==='student'&&($_GET['register']??'')==='1';
if(empty($_SESSION['dhalim_registration_csrf']))$_SESSION['dhalim_registration_csrf']=bin2hex(random_bytes(32));
if($loginRole==='student')$next='/surveys/public/board-student.php';
$nextQuery=[];parse_str((string)(parse_url($next,PHP_URL_QUERY)??''),$nextQuery);
$token=(string)($_GET['s']??$nextQuery['s']??'');
if (isset($_GET['s'])&&preg_match('/^[a-f0-9]{48}$/D',$token)) $next='/surveys/public/?s='.$token;
$u=Auth::realUser();
$preview=isset($_GET['preview'])&&$_GET['preview']==='1'&&$u!==null;
if ($u&&!$preview) { header('Location: '.(($u['role']??'')==='student'?'/surveys/public/board-student.php':$next));exit; }
if (!$preview) $_SESSION['ms_return_after_login']=$next;
$chooseRole=$loginRole===''&&$token==='';
if($loginRole==='')$loginRole='teacher';
function login_e(string $value): string {return htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
// Reuse the original embedded artwork byte-for-byte; no replacement drawings.
$reference=file_get_contents(__DIR__.'/assets/reference.js');
preg_match("~(?:const|let) SCHOOL_LOGO\\s*=\\s*'([^']+)'~",$reference,$schoolMatch);
preg_match("~const VISION_2030_LOGO\\s*=\\s*'([^']+)'~",$reference,$visionMatch);
$originalSchoolLogo=$schoolMatch[1]??'';$visionLogo=$visionMatch[1]??'';
$school='مدارس ظليم للبنات';$title='استمارة تقييم الدرس التطبيقي';$schoolLogo=$originalSchoolLogo;$contextNotice='';
// Public branding only for a published sharing token; never expose responses or identities.
// A signed-in author can preview their own draft's login header without publishing it.
$draftId=$preview?(int)($_GET['preview_survey']??0):0;
if ($token!==''||$draftId>0) {
 $record=null;
 try {
  $pdo=new PDO($cfg['dsn'],$cfg['db_user'],$cfg['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
  if ($draftId>0) {
   $s=$pdo->prepare('SELECT s.title,s.school_name,s.logo_key,s.use_default_logo,u.external_id FROM ms_surveys s JOIN ms_users u ON u.id=s.owner_id WHERE s.id=?');$s->execute([$draftId]);$candidate=$s->fetch();
   $identity=($u['subjectType']??$u['role']).':'.$u['id'];
   $isOwner=($u['role']??'')==='owner'&&($u['subjectType']??'')==='owner'&&($u['roleCode']??'')===Rbac::OWNER;
   if ($candidate&&($candidate['external_id']===$identity||$isOwner)) $record=$candidate;
  } elseif (preg_match('/^[a-f0-9]{48}$/D',$token)) {
   $s=$pdo->prepare("SELECT s.title,s.school_name,s.logo_key,s.use_default_logo FROM ms_surveys s JOIN ms_users u ON u.id=s.owner_id AND u.active=1 WHERE s.share_token=? AND s.status='published'");$s->execute([$token]);$record=$s->fetch();
  }
 } catch (Throwable $error) { error_log('Survey login branding unavailable: '.$error->getMessage()); }
 if ($record) {
  $school=(string)$record['school_name'];$title=(string)$record['title'];$schoolLogo=!empty($record['use_default_logo'])?$originalSchoolLogo:'';
  $key=(string)($record['logo_key']??'');
  if (preg_match('/^[a-f0-9]{32}\.png$/D',$key)) {
   $logoFile=$cfg['logo_dir'].'/'.$key;
   if (is_file($logoFile)&&filesize($logoFile)<=2097152) $schoolLogo='data:image/png;base64,'.base64_encode(file_get_contents($logoFile));
  }
 } else { $school='مدار';$title='استبيانات مدار';$schoolLogo='';$contextNotice='رابط الاستبيان غير متاح حاليًا. يمكنكِ الدخول إلى حسابك.'; }
}
?><!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>مجمع مدارس ظليم</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@500;600;700&family=Tajawal:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{color-scheme:light;--ink:#241b3c;--green:#6137c8;--muted:#766e88;--line:#eee7ff;--cream:#faf8ff}*{box-sizing:border-box}body{margin:0;min-height:100svh;background:radial-gradient(circle at 9% 10%,#cbb2ff26,transparent 24rem),radial-gradient(circle at 92% 20%,#ffddbb26,transparent 22rem),linear-gradient(180deg,#faf8ff 0%,#ffffff 44%,#fbfaff 100%);color:var(--ink);font-family:'Tajawal',Tahoma,Arial,sans-serif;-webkit-font-smoothing:antialiased}a{color:var(--green);text-underline-offset:5px}button,input{font:inherit}.school-page{max-width:1140px;margin:auto;padding:54px 44px 28px}.school-header{display:grid;grid-template-columns:144px minmax(0,1fr) 144px;gap:28px;align-items:center;padding:8px 14px 36px;position:relative}.school-header:after{content:'';position:absolute;bottom:0;inset-inline:0;height:1px;background:linear-gradient(to left,transparent,#9bbda9 15%,#9bbda9 85%,transparent)}.header-school{grid-column:1;grid-row:1}.header-copy{grid-column:2;grid-row:1;text-align:center;min-width:0}.header-vision{grid-column:3;grid-row:1}.logo-frame{display:flex;align-items:center;justify-content:center;min-height:118px}.logo-frame img{display:block;object-fit:contain;width:100%;max-width:132px;max-height:118px;mix-blend-mode:multiply}.header-vision img{max-width:126px;max-height:106px}.school-name{margin:0;font-family:'Noto Naskh Arabic','Tajawal',Tahoma,serif;font-size:clamp(29px,3.2vw,43px);font-weight:700;line-height:1.7;color:#32136f;overflow-wrap:anywhere}.survey-title{margin:5px 0 0;font-size:clamp(18px,2vw,24px);font-weight:500;line-height:1.8;color:#6137c8;overflow-wrap:anywhere}.school-wordmark{font-size:18px;font-weight:700;color:#47218c;text-align:center;line-height:1.8}.login-content{display:flex;justify-content:center;padding:42px 0 20px}.login-card{width:100%;max-width:430px;padding:30px 34px 24px;background:#fff;border:1px solid #eee7ff;border-radius:22px;box-shadow:0 18px 58px -32px #492b7f29}.welcome{font-size:22px;font-weight:700;margin:0 0 5px;color:#47218c}.welcome-note{margin:0 0 25px;line-height:1.85;font-size:15px;color:var(--muted)}.field{display:block;margin:0 0 18px}.field span{display:block;font-weight:600;font-size:15px;margin-bottom:9px}.field input{display:block;width:100%;height:49px;background:#fdfbff;border:1px solid #e5dcf5;border-radius:10px;padding:0 14px;color:#241b3c;font-size:16px;transition:border-color .2s,box-shadow .2s}.field input:focus{outline:none;border-color:#7848e8;box-shadow:0 0 0 3px #7848e81a}.field input::placeholder{color:#9990ac;font-size:14px}.field input[type=email]{direction:ltr;text-align:right}.field input[type=password]{direction:ltr;text-align:right;letter-spacing:2px}.login-submit{display:block;width:100%;height:49px;border:0;border-radius:10px;background:linear-gradient(135deg,#32136f,#6137c8);color:white;font-weight:700;font-size:17px;cursor:pointer;margin:7px 0 19px;box-shadow:0 6px 14px -9px #5328a040;transition:background .2s}.login-submit:hover{background:linear-gradient(135deg,#25104f,#47218c)}.login-submit:disabled{opacity:.6;cursor:wait}.login-links{display:flex;align-items:center;justify-content:space-between;gap:14px;font-size:14px;line-height:1.8}.login-links a{text-decoration:none}.login-links a:hover{text-decoration:underline}.owner-link{display:block;text-align:center;border-top:1px solid #eee7ff;margin-top:21px;padding-top:16px;font-size:13px;color:#766e88;text-decoration:none}.login-message{margin:0 0 16px;padding:11px 13px;background:#fff6f2;border:1px solid #f0ddd2;border-radius:9px;color:#965c48;font-size:14px;line-height:1.8}.login-message.success{color:#6137c8;background:#f0f8f1;border-color:#d9e9da}.page-footer{text-align:center;margin:13px 0 0;font-size:13px;color:#8d849d;line-height:1.8}.page-footer strong{font-weight:600;color:#6137c8}.preview-return{display:block;width:max-content;margin:22px auto 0;font-size:13px}.context-notice{font-size:14px;color:#8b6b43;margin:0 0 15px;line-height:1.8}a:focus-visible,button:focus-visible{outline:2px solid #7848e8;outline-offset:4px}[hidden]{display:none!important}
@media(max-width:640px){.school-page{padding:28px 19px 20px}.school-header{grid-template-columns:70px minmax(0,1fr) 70px;gap:10px;padding:5px 0 25px}.logo-frame{min-height:77px}.logo-frame img{max-width:70px;max-height:78px}.header-vision img{max-width:67px;max-height:67px}.school-name{font-size:26px;line-height:1.65}.survey-title{font-size:16px;margin-top:6px;line-height:1.7}.login-content{padding-top:29px}.login-card{padding:26px 24px 23px;border-radius:19px}.welcome{font-size:21px}.welcome-note{font-size:14px;margin-bottom:22px}.login-links{font-size:13px;gap:8px}.page-footer{font-size:12px}}@media(max-width:390px){.school-page{padding-inline:13px}.school-header{grid-template-columns:56px minmax(0,1fr) 56px;gap:7px}.logo-frame img{max-width:56px;max-height:65px}.header-vision img{max-width:54px}.school-name{font-size:23px}.survey-title{font-size:15px}.login-card{padding-inline:21px}}
/* Madar reference: soft lavender surfaces and teal actions. */
body{background:radial-gradient(ellipse at 10% 45%,#d9cced99,transparent 52%),radial-gradient(ellipse at 96% 48%,#bde8e9aa,transparent 48%),#f2f2f5}.login-card{max-width:480px;padding:36px;background:linear-gradient(145deg,#f7f2ffed,#ffffffef 58%,#e4f2f4e8);border:1px solid #d9cfea;border-radius:28px;box-shadow:0 0 0 7px #ffffff55,0 24px 60px #493e692b}.welcome{text-align:center;font-size:25px;margin-bottom:28px;color:#32136f}.field{margin-bottom:23px}.field input{height:56px;border-radius:17px;background:#fff;border-color:#e5dff0;box-shadow:0 10px 24px #3929570d}.field input::placeholder{color:#8b8596;font-size:14px}.login-submit{height:57px;border-radius:17px;background:linear-gradient(120deg,#2fb9b9,#168f9b);box-shadow:0 15px 28px #188e9b29;margin-top:28px}.login-submit:hover{background:linear-gradient(120deg,#28aaaa,#117e89)}.login-links{color:#6137c8}.page-footer{margin-top:22px}@media(max-width:640px){.login-card{padding:28px 24px;border-radius:24px}.welcome{font-size:23px}.field input{font-size:15px}.login-content{padding-top:32px}}
.school-header{display:grid;direction:ltr;grid-template-columns:1fr 120px 1fr;gap:18px;padding:8px 0 24px}.header-school{grid-column:1;grid-row:1;justify-self:start;min-height:70px;width:80px}.header-school img{max-height:70px}.header-copy{grid-column:1;grid-row:1;padding-left:88px;text-align:left;pointer-events:none}.school-name{font-family:'Tajawal',Tahoma,sans-serif;font-size:19px;line-height:1.7;direction:rtl}.header-vision{grid-column:2;grid-row:1;min-height:76px}.header-vision img{max-width:100px;max-height:76px}.login-content{padding-top:45px}.login-card{max-width:480px}.welcome{font-family:'Noto Naskh Arabic','Tajawal',serif;font-size:32px;margin-bottom:30px}.login-links{display:flex;flex-direction:column;gap:16px}.login-links a{display:block;width:100%;padding:12px;text-align:center;border:2px solid #ba99ff;border-radius:17px;font-weight:700;background:#ffffff80}.login-links a:last-child{order:-1}.login-links a:hover{background:#fff;box-shadow:0 0 20px #fff;text-decoration:none}.login-return{grid-column:3;grid-row:1;justify-self:end;direction:rtl;background:#ffffffd9;border:1px solid #e1d6f1;border-radius:16px;text-decoration:none;padding:10px 14px;font-size:13px;font-weight:700}@media(max-width:640px){.school-page{padding:20px 14px}.school-header{grid-template-columns:1fr 73px;gap:12px}.header-school{width:56px}.header-school img{max-width:56px}.header-copy{padding-left:61px}.school-name{font-size:15px}.header-vision img{max-width:70px}.login-return{grid-column:1/-1;grid-row:2;justify-self:end}.login-content{padding-top:28px}.welcome{font-size:30px}}
</style>
<style>.entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:28px}.entry-choice{display:flex;flex-direction:column;align-items:center;gap:18px;padding:32px 12px;border:1px solid #d9cfea;border-radius:22px;text-decoration:none;color:#43217e;background:#ffffffa8;transition:box-shadow .2s,transform .2s}.entry-choice:hover,.entry-choice:focus-visible{transform:translateY(-3px);background:#fff;box-shadow:0 0 24px #41bcb45c}.entry-choice svg{width:48px;height:48px;stroke:#239f9d;fill:none;stroke-width:1.7}.entry-choice strong{font-size:20px}.login-card:has(.entry-grid){max-width:600px}.entry-back{display:block;text-align:center;color:#6137a4;margin-top:24px}@media(max-width:420px){.entry-grid{gap:10px}.entry-choice{padding:24px 8px}.entry-choice strong{font-size:17px}}</style><style>.login-card:has(.student-name-grid){max-width:760px}.student-name-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.student-name-grid .field{min-width:0}.student-name-grid small{font-size:12px;color:#898296}.student-name-grid input{width:100%;min-width:0}.field .student-email-group{display:flex;align-items:stretch;border:1px solid #e3ddef;border-radius:20px;overflow:hidden;background:white}.student-email-group input{flex:1;min-width:0;width:0!important;border:0!important;box-shadow:none!important;margin:0!important;border-radius:0!important;text-align:left;direction:ltr}.student-email-group bdi{display:flex;align-items:center;background:#f1ecf8;border-left:1px solid #ddd3ed;padding:0 16px;color:#594080;font-size:16px;font-weight:800;white-space:nowrap}.student-email-group:focus-within{outline:2px solid #a692d7}@media(max-width:580px){.student-name-grid{grid-template-columns:1fr}.student-email-group bdi{font-size:13px;padding:0 9px}}</style></head>
<body><main class="school-page">
<header class="school-header" aria-label="ترويسة المدرسة والاستبيان">
 <div class="logo-frame header-school"><?php if ($schoolLogo!==''): ?><img id="loginSchoolLogo" src="<?=login_e($schoolLogo)?>" alt="شعار <?=login_e($school)?>"><?php else: ?><span class="school-wordmark" aria-hidden="true"></span><?php endif; ?></div>
 
 <div class="logo-frame header-vision"><img id="loginVisionLogo" src="<?=login_e($visionLogo)?>" alt="شعار رؤية 2030"></div>
<a class="login-return" href="/index.html" onclick="if(history.length>1){history.back();return false;}">عودة للخلف ↩</a></header>
<div class="login-content"><section class="login-card" aria-labelledby="welcomeTitle">
 <?php if($chooseRole): ?>
<h2 class="welcome" id="welcomeTitle">بوابة مجمع مدارس ظليم</h2><p style="text-align:center;color:#766e88">اختاري نوع الدخول بحساب مدار</p>
<div class="entry-grid"><a class="entry-choice" href="/dhalim/?role=teacher"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 14h30v22H5zM12 14V7h30v23h-7M13 22h14M13 28h9"/></svg><strong>دخول المعلم</strong></a><a class="entry-choice" href="/dhalim/?role=student"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="m3 17 21-10 21 10-21 10zM12 22v13q12 9 24 0V22M43 18v18"/></svg><strong>دخول الطالب</strong></a></div>
<?php else: ?>
<h2 class="welcome" id="welcomeTitle"><?=$registerStudent?'إنشاء حساب طالب لبوابة ظليم':($loginRole==='student'?'أهلًا بكِ طالبتنا':'أهلًا بكِ معلمتنا')?></h2>
 <?php if ($contextNotice!==''): ?><p class="context-notice"><?=login_e($contextNotice)?></p><?php endif; ?>
 <p id="loginMessage" class="login-message" role="status" aria-live="polite" hidden></p>
 <form id="schoolLoginForm" action="/api/<?=login_e($loginRole)?>/login" method="post" novalidate>
  <?php if($registerStudent): ?><div class="student-name-grid"><label class="field">الاسم الأول<input id="studentFirstName" required maxlength="45" autocomplete="given-name" placeholder="الاسم الأول"></label><label class="field">اسم الأب <small>(اختياري)</small><input id="studentFatherName" maxlength="45" autocomplete="additional-name" placeholder="اسم الأب"></label><label class="field">الاسم الأخير<input id="studentLastName" required maxlength="45" autocomplete="family-name" placeholder="الاسم الأخير"></label></div>
  <label class="field" for="schoolEmail"><span>إيميل منصة مدرستي</span><span class="student-email-group" dir="ltr"><input id="schoolEmail" name="email" type="text" required maxlength="170" autocomplete="username" inputmode="email" placeholder="اسم المستخدم" spellcheck="false" autocapitalize="none" aria-label="اسم المستخدم في منصة مدرستي"><bdi>@mkhg.moe.gov.sa</bdi></span></label>
  <?php else: ?><label class="field" for="schoolEmail"><span>إيميل منصة مدرستي</span><input id="schoolEmail" name="email" type="email" required maxlength="190" autocomplete="username" inputmode="email" placeholder="اسم المستخدم@mkhg.moe.gov.sa" spellcheck="false" autocapitalize="none" aria-describedby="schoolEmailDomain"><small id="schoolEmailDomain" style="display:block;margin-top:9px;color:#766e88;font-size:13px;line-height:1.8">بريد منصة مدرستي: <bdi dir="ltr">@mkhg.moe.gov.sa</bdi></small></label><?php endif; ?>
  <label class="field" for="schoolPassword"><span>كلمة المرور</span><input id="schoolPassword" name="password" type="password" required autocomplete="<?=$registerStudent?'new-password':'current-password'?>" placeholder="<?=$registerStudent?'10 أحرف على الأقل، منها حرف ورقم':'أدخلي كلمة المرور'?>"></label>
  <?php if($registerStudent): ?><label class="field" for="studentStage"><span>المرحلة الدراسية</span><select id="studentStage" name="stage" required style="width:100%;padding:15px;border:1px solid #e3ddef;border-radius:18px;background:white;font:inherit"><option value="">اختاري المرحلة</option><option>ابتدائي</option><option>متوسط</option><option>ثانوي</option></select></label><p style="color:#766e88;font-size:13px">الحساب خاص ببوابة ظليم، ويُتاح بعد موافقة مالكة الموقع.</p><?php endif; ?>
  <button class="login-submit" id="schoolLoginSubmit" type="submit"><?=$registerStudent?'إنشاء الحساب':'تسجيل الدخول'?></button>
 </form>
 <nav class="login-links" aria-label="مساعدة الحساب"><?php if($loginRole==='teacher'): ?><a href="/register.html?role=teacher">إنشاء حساب معلمة جديد</a><?php endif; ?><?php if($loginRole==='student'): ?><a href="<?=$registerStudent?'/dhalim/?role=student':'/dhalim/?role=student&register=1'?>"><?=$registerStudent?'لدي حساب — تسجيل الدخول':'إنشاء حساب طالب جديد'?></a><?php endif; ?><?php if(!$registerStudent): ?><a href="#password-help" id="forgotPassword">نسيت كلمة المرور؟</a><?php endif; ?></nav>
<a class="entry-back" href="/dhalim/">العودة لاختيار نوع الدخول</a><?php endif; ?></section></div>
<p class="page-footer"><strong>مدار</strong> · بيئة تعليمية تدعم التعلّم والتطوير</p>
<?php if ($preview): ?><a class="preview-return" href="/surveys/public/">العودة إلى استبياناتي</a><?php endif; ?>
</main>
<?php if(!$chooseRole): ?><script>
const loginRole=<?=json_encode($loginRole)?>;
const registerStudent=<?=json_encode($registerStudent)?>,registrationCsrf=<?=json_encode($_SESSION['dhalim_registration_csrf'])?>;
'use strict';
const surveyNext=<?=json_encode($next,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_UNESCAPED_UNICODE)?>;
const loginForm=document.getElementById('schoolLoginForm'),loginButton=document.getElementById('schoolLoginSubmit'),message=document.getElementById('loginMessage');
function normalizeLoginEmail(){const input=document.getElementById('schoolEmail');const value=input.value.trim().toLowerCase();if(registerStudent){const suffix='@mkhg.moe.gov.sa';if(value.endsWith(suffix))input.value=value.slice(0,-suffix.length);input.setCustomValidity(input.value.includes('@')?'اكتبي اسم المستخدم فقط.':'');}else if(value)input.value=value.includes('@')?value:value+'@mkhg.moe.gov.sa';return input;}
document.getElementById('schoolEmail').addEventListener('blur',normalizeLoginEmail);
function showLoginMessage(text,success=false){message.textContent=text;message.classList.toggle('success',success);message.hidden=false;}
loginForm.addEventListener('submit',async event=>{
 event.preventDefault();normalizeLoginEmail();if(!loginForm.reportValidity())return;
 message.hidden=true;loginButton.disabled=true;loginButton.textContent='جارٍ تسجيل الدخول…';
 try {
  const response=await fetch(registerStudent?'/api/student/portal-register':'/api/'+loginRole+'/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('schoolEmail').value.trim().toLowerCase()+(registerStudent?'@mkhg.moe.gov.sa':''),password:document.getElementById('schoolPassword').value,...(registerStudent?{name:['studentFirstName','studentFatherName','studentLastName'].map(id=>document.getElementById(id).value.trim()).filter(Boolean).join(' '),stage:document.getElementById('studentStage').value,csrf:registrationCsrf}:{})})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'تعذّر تسجيل الدخول.');
  if(registerStudent){showLoginMessage(data.message,true);loginForm.hidden=true;return;}
  if(data.csrfToken){try{sessionStorage.setItem('madar-csrf',data.csrfToken);}catch{}}
  window.location.assign(surveyNext);
 }catch(error){showLoginMessage(error.message||'تعذّر الاتصال بالخادم، حاولي مرة أخرى.');}
 finally{loginButton.disabled=false;loginButton.textContent=registerStudent?'إنشاء الحساب':'تسجيل الدخول';}
});
document.getElementById('forgotPassword')?.addEventListener('click',async event=>{
 event.preventDefault();const email=normalizeLoginEmail();
 if(!email.value.trim()||!email.checkValidity()){showLoginMessage('أدخلي بريد حسابك أولًا، ثم اضغطي «نسيت كلمة المرور».');email.focus();return;}
 const link=event.currentTarget;if(link.getAttribute('aria-disabled')==='true')return;link.setAttribute('aria-disabled','true');
 try{
  const response=await fetch('/api/'+loginRole+'/password-reset-request',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:email.value.trim().toLowerCase(),note:'طلب من صفحة دخول استبيانات مدار'})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'تعذّر إرسال الطلب.');showLoginMessage(data.message||'تم إرسال طلب إعادة التعيين إلى مالكة الموقع.',true);
 }catch(error){showLoginMessage(error.message||'تعذّر الاتصال بالخادم.');}finally{link.removeAttribute('aria-disabled');}
});
</script><?php endif; ?></body></html>
