(async()=>{
 try{
  const response=await fetch('/api/portal/access',{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)return;
  const data=await response.json();
  const inPortal=location.pathname.startsWith('/dhalim/')||location.pathname.startsWith('/surveys/public/');
  if(inPortal?!data.can_madar:!data.allowed)return;
  const render=()=>{
   if(document.getElementById('zulaimPortalLink'))return;
   const header=document.querySelector('#accountBar .madar-header, .dhalim-unified-header, header.site-header, header.topbar, header.student-header, header.parent-topbar, header');
   if(!header)return;
   const link=document.createElement('a');link.id='zulaimPortalLink';link.href=inPortal?'/':'/dhalim/';
   link.textContent=inPortal?'↗ الانتقال إلى مدار':'◈ بوابة ظليم';
   link.style.cssText='display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border:1px solid #d8cee9;border-radius:12px;background:linear-gradient(120deg,#f1ebfa,#e6f4f3);color:#55337d;font:700 13px inherit;text-decoration:none;max-width:100%;flex-shrink:0';
   header.appendChild(link);
  };
  render();new MutationObserver(render).observe(document.body,{childList:true,subtree:true});
 }catch{console.warn('تعذر تحميل رابط الانتقال');}
})();
