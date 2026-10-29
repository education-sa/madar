(async()=>{
 try{
  const response=await fetch('/api/portal/access',{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)return;
  const data=await response.json();
  const inPortal=location.pathname.startsWith('/dhalim/')||location.pathname.startsWith('/surveys/public/');
  if(inPortal&&!data.can_madar)return;
  const renderMadarAccount=()=>{
   if(inPortal||!['/','/index.html'].includes(location.pathname)||!data.can_madar||!data.madar_url)return;
   const target=new URL(data.madar_url,location.origin);
   if(target.origin!==location.origin)return;
   const accountLink=(className,id)=>{
    const link=document.createElement('a');link.className=className;link.id=id;link.href=target.pathname;
    link.textContent='حسابي في مدار';link.title=data.account_name?'أهلًا بكِ '+data.account_name:'حسابك مسجل الدخول';
    link.style.textDecoration='none';return link;
   };
   const wrap=document.querySelector('.site-header .login-menu-wrap');
   if(wrap&&!document.getElementById('madarAccountLink')){
    // Replace the guest controls together with their hover/click handlers.
    const signedInWrap=wrap.cloneNode(false);
    signedInWrap.appendChild(accountLink('login-button','madarAccountLink'));
    wrap.replaceWith(signedInWrap);
   }
   const mobile=document.querySelector('.site-header #menuToggle');
   if(mobile&&!document.getElementById('madarMobileAccountLink')){
    const link=accountLink('menu-toggle','madarMobileAccountLink');
    const label=document.createElement('span');label.className='mobile-login-text';label.textContent=link.textContent;
    link.replaceChildren(label);link.setAttribute('aria-label','حسابي في مدار');mobile.replaceWith(link);
   }
  };
  const render=()=>{
   renderMadarAccount();
   if(!inPortal&&!data.allowed)return;
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
