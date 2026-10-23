(()=>{
 const mount=()=>{
 if(document.getElementById('madarSurveyLink'))return;
 const link=document.createElement('a');link.id='madarSurveyLink';link.href='/surveys/public/';link.textContent='🏫 بوابة ظليم: لوحتي والاستبيانات';
 link.style.cssText='display:block;margin:10px 12px;padding:12px 16px;border-radius:10px;background:#e7f5f0;color:#116558;font-weight:700;text-decoration:none;text-align:right';
 const sidebar=document.getElementById('sidebar')||document.querySelector('.sidebar');
 if(sidebar)sidebar.append(link);else{link.style.cssText+=';position:fixed;bottom:20px;left:20px;z-index:1000;box-shadow:0 4px 14px #0002;background:white';document.body.append(link);}
 };if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
