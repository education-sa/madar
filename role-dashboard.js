const role = document.body.dataset.role;
const csrfKey = `madar-${role}-csrf`;
let csrf = sessionStorage.getItem(csrfKey) || '';
async function api(path, options={}) {
  const method=(options.method||'GET').toUpperCase();
  const response=await fetch(`/api/${role}${path}`,{...options,headers:{'Content-Type':'application/json',...(method!=='GET'&&csrf?{'X-CSRF-Token':csrf}:{}),...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(response.status===401){location.href=`/login.html?role=${role==='admin'?'staff':'parent'}`;throw new Error('unauthorized')}
  if(!response.ok)throw new Error(data.error||'حدث خطأ');
  if(data.csrfToken){csrf=data.csrfToken;sessionStorage.setItem(csrfKey,csrf)}
  return data;
}
(async()=>{try{const me=await api('/me');document.getElementById('roleUserName').textContent=me.name;const summary=await api('/summary');if(role==='admin'){document.getElementById('roleStats').innerHTML=`<div class="role-card"><strong>${summary.teachers}</strong><span>المعلمات</span></div><div class="role-card"><strong>${summary.students}</strong><span>الطالبات</span></div><div class="role-card"><strong>${summary.tests}</strong><span>الاختبارات</span></div>`;}else{document.getElementById('roleStats').innerHTML='<div class="role-card"><strong>—</strong><span>الطالبات المرتبطات</span></div>';document.getElementById('roleNotice').textContent=summary.notice||'';}}catch(e){}})();
document.getElementById('roleLogout').onclick=async()=>{const result=await api('/logout',{method:'POST',body:'{}'});sessionStorage.removeItem(csrfKey);location.href=result.previewEnded?(result.redirect||'/owner/dashboard'):`/login.html?role=${role==='admin'?'staff':'parent'}`};
