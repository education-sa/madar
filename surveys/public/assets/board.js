/* لوحتي — مجمع مدارس ظليم. A separate module; survey functions remain unchanged. */
(()=>{
'use strict';
/* واجهة الجلسة الواحدة: رأس الفصل وشريط الأيقونات ثابتان، والمحتوى وحده يتغير. */
let activeClass=null,activeStudent=null,boardInfo=null,activeFolder=null,activeTab='wall',classTitle='',classMeta='',wallData=null,epoch=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number(x)||0;
const box=(body,extra='')=>`<section class="mb-box ${extra}">${body}</section>`;
const btn=(label,action,variant='')=>`<button type="button" class="mb-btn ${variant}" onclick="${action}">${label}</button>`;
const head=(title,desc,actions='')=>`<header class="mb-heading"><div><small>بوابة مجمع مدارس ظليم / لوحتي</small><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="mb-heading-actions">${actions}</div></header>`;
const numberFmt=n=>new Intl.NumberFormat('ar-SA').format(n||0);
const countLabel=(n,one,two,many)=>{const v=num(n);return numberFmt(v)+' '+(v===1?one:v===2?two:many);};
const empty=message=>`<p class="mb-empty">${esc(message)}</p>`;
const loading=()=>'<div class="mb-loading" role="status">جارٍ التحميل…</div>';
const beginView=()=>++epoch;
const isLive=t=>t===epoch;
function render(html){portal(`<div class="mb-board">${activeClass&&classTitle?`<div class="mb-class-context"><span aria-hidden="true">▦</span><strong>${esc(classTitle)}</strong><small>جدار الفصل</small></div>`:''}${html}</div>`);}
async function request(op,data=null,query={}){
 const url='board-api.php?'+new URLSearchParams({op,...query});
 const config={credentials:'same-origin',headers:{}};
 if(data!==null){config.method='POST';config.headers['X-CSRF-Token']=sessionInfo?.csrf||'';
  if(data instanceof FormData)config.body=data;else{config.headers['Content-Type']='application/json';config.body=JSON.stringify(data);}}
 const response=await fetch(url,config);let result;
 try{result=await response.json();}catch{throw new Error('لم يستجب الخادم بشكل صحيح. هل ثبّتِ جداول لوحتي؟');}
 if(!response.ok)throw new Error(result.error||'تعذر إتمام الطلب');return result;
}
function run(job){Promise.resolve().then(job).catch(err=>alert(err.message||'حدث خطأ'));}
function form(id){const f=document.getElementById(id);if(!f)throw new Error('تعذر العثور على النموذج');return f;}
function input(f,name){return f.elements.namedItem(name)?.value?.trim()||'';}
const icons={
 folder:'<path d="M3 7h6l2 2h10v10H3z"/><path d="M3 7V5h6l2 2"/>',
 post:'<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>',
 users:'<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.6 2.8-5.5 5.5-5.5s5 1.9 5.5 5.5"/><path d="M16 5.4a3 3 0 0 1 0 5.2M17.5 14.7c1.7.7 2.8 2.5 3 5.3"/>',
 teacher:'<rect x="4" y="5" width="16" height="11" rx="1.4"/><path d="M8 20h8M12 16v4M8 9h8"/>',
 gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/>',
 file:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>'
};
const icon=name=>`<svg class="mb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.post}</svg>`;

/* ============ الهيكل الثابت: رأس الفصل + شريط الأيقونات ============ */
function clearClassState(){activeClass=null;activeStudent=null;activeFolder=null;activeTab='wall';classTitle='';classMeta='';wallData=null;}
function applyClass(data,{syncHeader=true}={}){
 classTitle=data.class?.title||classTitle;
 const place=[data.class?.grade,data.class?.section_name].filter(Boolean).join(' / ');
 classMeta=[place,data.class?.academic_year].filter(Boolean).join(' · ');
 if(syncHeader){
  const title=document.querySelector('.mb-class-id strong');if(title)title.textContent=classTitle;
  const meta=document.querySelector('.mb-class-id small');if(meta)meta.textContent=classMeta;
 }
}
function tabsFor(data){
 const tabs=[{key:'wall',label:'الجدار',icon:'post'},{key:'students',label:'الطالبات',icon:'users'},{key:'files',label:'ملفات الفصل',icon:'folder'}];
 if(data?.is_admin)tabs.push({key:'teachers',label:'المعلمات',icon:'teacher'});
 return tabs;
}
function shellHtml(tabs){
 const manage=wallData?.is_admin?btn(icon('gear')+' إدارة','mbManageHome()','outline'):'';
 return `<div class="mb-class-shell">
 <div class="mb-class-sticky">
  <div class="mb-class-bar">
   <div class="mb-class-id"><span class="mb-class-badge" aria-hidden="true">▦</span><div><strong>${esc(classTitle)}</strong><small>${esc(classMeta)}</small></div></div>
   <div class="mb-class-bar-actions">${btn('جميع الفصول','mbHome()','outline')}${manage}</div>
  </div>
  <nav class="mb-class-tabs" id="mbClassTabs" role="tablist" aria-label="أقسام الفصل">
   ${tabs.map(t=>`<button type="button" class="mb-tab" role="tab" id="mbTab-${t.key}" data-mb-tab="${t.key}" aria-selected="false" aria-controls="mbClassBody">${icon(t.icon)}<span>${esc(t.label)}</span></button>`).join('')}
  </nav>
 </div>
 <div class="mb-class-body" id="mbClassBody" role="tabpanel" aria-live="polite"></div>
</div>`;
}
function markTab(tab=activeTab){
 document.querySelectorAll('[data-mb-tab]').forEach(b=>{
  const on=b.dataset.mbTab===tab;
  b.classList.toggle('is-active',on);
  b.setAttribute('aria-selected',on?'true':'false');
 });
}
function setBody(html,{focus=false}={}){
 const body=document.getElementById('mbClassBody');
 if(!body){render(html);return;}
 body.innerHTML=html;
 if(focus)requestAnimationFrame(()=>body.scrollIntoView({block:'start',behavior:'smooth'}));
}
function errorBody(err){return box(`<h2>تعذر فتح القسم</h2><p class="mb-help">${esc(err.message||'حدث خطأ غير متوقع')}</p><div class="mb-actions">${btn('إعادة المحاولة',`mbTab('${activeTab}')`,'outline')}</div>`);}
async function loadClass(force=false){
 if(!activeClass)throw new Error('لم يتم اختيار فصل.');
 if(wallData&&!force)return wallData;
 const cid=activeClass;
 const data=await request('class',null,{id:cid});
 if(num(activeClass)!==num(cid))return data;
 wallData=data;
 applyClass(data);
 return data;
}
const folderName=(data,id)=>data.folders.find(f=>num(f.id)===num(id))?.name||'المجلد';

/* ============ نظرة عامة على الفصول ============ */
window.boardStart=()=>run(showOverview);
async function showOverview(){const t=beginView();clearClassState();boardInfo=await request('overview');if(!isLive(t))return;
 const cards=boardInfo.classes.map(c=>`<button type="button" class="mb-class" onclick="mbOpenClass(${num(c.id)})"><span class="mb-class-icon">🏫</span><strong>${esc(c.title)}</strong><small>${esc(c.grade)} / ${esc(c.section_name)}</small><span>${numberFmt(c.students_count)} طالبة · ${esc(c.academic_year)}</span>${num(c.is_active)?'':'<em>مؤرشف</em>'}</button>`).join('');
 render(head('لوحتي','الفصول المشتركة بين معلمات مجمع مدارس ظليم',(boardInfo.can_manage?btn('⚙️ إدارة','mbManageHome()','outline'):boardInfo.can_create_classes?btn('إضافة فصل','mbManageClassForm()','outline'):''))+
 `<div class="mb-summary">${box(`<strong>${numberFmt(boardInfo.classes.length)}</strong><span>فصل متاح</span>`)}${box('<strong>مدار</strong><span>حسابات موحّدة</span>')}${box('<strong>مشاركة</strong><span>ملفات إنجاز وأنشطة</span>')}</div>`+
 `<div class="mb-section-title"><h2>الفصول الدراسية</h2></div><div class="mb-grid">${cards||empty('لا توجد فصول متاحة لك حاليًا. تستطيع مديرة النظام إنشاء الفصول وتحديد المعلمات المخوّلات.')}</div>`);
}
window.mbHome=()=>run(showOverview);

/* ============ دخول الفصل + التنقل بين التبويبات ============ */
window.mbOpenClass=(id,tab='wall')=>run(()=>enterClass(id,tab));
async function enterClass(id,tab='wall'){
 const token=beginView();
 activeClass=num(id);activeStudent=null;activeFolder=null;
 const data=await request('class',null,{id:activeClass});
 if(!isLive(token))return;
 wallData=data;applyClass(data);
 const tabs=tabsFor(data);
 activeTab=tabs.some(t=>t.key===tab)?tab:'wall';
 portal(`<div class="mb-board">${shellHtml(tabs)}</div>`);
 const nav=document.getElementById('mbClassTabs');
 if(nav)nav.addEventListener('click',e=>{const b=e.target.closest('[data-mb-tab]');if(!b)return;run(()=>openTab(b.dataset.mbTab));});
 markTab();
 await openTab(activeTab);
}
window.mbTab=key=>run(()=>openTab(key));
async function openTab(tab,{force=false,focus=false}={}){
 if(!activeClass)return;
 const token=beginView();
 const tabs=tabsFor(wallData);
 activeTab=tabs.some(t=>t.key===tab)?tab:'wall';
 markTab(activeTab);
 setBody(loading(),{focus});
 try{
  if(activeTab==='wall')await renderWallBody(force,token);
  else if(activeTab==='students')await renderStudentsBody(force,token);
  else if(activeTab==='files')await renderFilesBody(force,token);
  else if(activeTab==='teachers')await renderTeachersBody(force,token);
 }catch(err){if(isLive(token))setBody(errorBody(err),{focus});}
}

/* ============ تبويب الجدار: المجلدات والمنشورات ============ */
window.mbOpenFolder=id=>run(()=>{activeFolder=num(id);openTab('wall',{force:true,focus:true});});
window.mbWallHome=()=>run(()=>{activeFolder=null;openTab('wall',{force:true,focus:true});});
window.mbWallBack=()=>run(()=>openTab('wall',{force:true,focus:true}));
function folderOptions(selected=null){return `<option value="">الجدار العام</option>`+wallData.folders.map(f=>`<option value="${num(f.id)}" ${num(selected)===num(f.id)?'selected':''}>${esc(f.name)}</option>`).join('');}
function attachments(p){return (p.attachments||[]).map(f=>`<a class="mb-attachment" href="board-download.php?id=${num(f.id)}&view=1" target="_blank" rel="noopener">${f.mime.startsWith('image/')?`<img loading="lazy" src="board-download.php?id=${num(f.id)}&view=1" alt="${esc(f.file_name)}">`:`<span class="mb-file-icon" aria-hidden="true">PDF</span>`}<span>${esc(f.file_name)}</span></a>`).join('');}
function folderCard(f,data,canPost,canManage){
 const canEdit=canPost&&(data.is_admin||canManage||num(f.created_by)===num(me?.id));
 return `<article class="mb-folder" style="--folder-color:${/^#[0-9a-f]{6}$/i.test(f.color)?f.color:'#9b87c4'}"><button type="button" class="mb-folder-open" onclick="mbOpenFolder(${num(f.id)})">${icon('folder')}<strong>${esc(f.name)}</strong><p>${esc(f.description)}</p><small>${countLabel(data.posts.filter(p=>num(p.folder_id)===num(f.id)).length,'منشور','منشوران','منشورات')}</small></button>${canEdit?`<div class="mb-actions">${btn('تعديل',`mbFolderForm(${num(f.id)})`,'outline')}${btn('حذف',`mbDeleteFolder(${num(f.id)})`,'quiet')}</div>`:''}</article>`;
}
function postCard(p,data,canPost,canManage){
 const editable=canPost&&(data.is_admin||canManage||num(p.author_id)===num(me?.id));
 return `<article class="mb-box mb-wall-post"><div class="mb-post-meta">${icon('post')} ${esc(p.author_name)} · ${esc(p.created_at)}${p.status!=='published'?' · غير منشور':''}</div><button type="button" class="mb-post-open" onclick="mbOpenPost(${num(p.id)})"><h3>${esc(p.title)}</h3><p class="mb-post-content">${esc(p.content)}</p></button><div class="mb-attachments">${attachments(p)}</div><div class="mb-actions">${btn('فتح المنشور · '+countLabel(p.comments_count,'تعليق','تعليقان','تعليقات'),`mbOpenPost(${num(p.id)})`,'outline')}${editable?btn('تعديل وإرفاق',`mbCompose(${num(p.id)})`,'outline')+btn('نقل',`mbMovePost(${num(p.id)})`,'outline')+btn('حذف',`mbDeletePost(${num(p.id)})`,'quiet'):''}${canManage?btn(p.status==='published'?'إخفاء':'نشر',`mbStatusPost(${num(p.id)},'${p.status==='published'?'hidden':'published'}')`,'outline'):''}</div></article>`;
}
async function renderWallBody(force=false,token=null){
 if(token===null)token=beginView();
 const data=await loadClass(force);
 if(!isLive(token))return;
 const canPost=!!num(data.permissions.can_post),canManage=!!num(data.permissions.can_manage_posts);
 const folder=activeFolder?data.folders.find(f=>num(f.id)===num(activeFolder)):null;
 if(activeFolder&&!folder)activeFolder=null;
 const visible=data.posts.filter(p=>(num(p.folder_id)||null)===(folder?num(folder.id):null));
 const toolbar=`<div class="mb-wall-toolbar"><span>${icon(folder?'folder':'post')} ${folder?'داخل المجلد':'مساحة الفصل المشتركة'}</span><div class="mb-actions">${canPost?btn(icon('plus')+' إضافة منشور','mbCompose()')+btn(icon('folder')+' إنشاء مجلد','mbFolderForm()','outline'):''}</div></div>`;
 const crumbs=folder?`<div class="mb-breadcrumb"><button type="button" onclick="mbWallHome()">${icon('arrow')} الجدار العام</button><span class="mb-crumb-sep">›</span><strong>${esc(folder.name)}</strong></div>`:'';
 const folders=folder?'':(data.folders.length?`<div class="mb-folder-grid">${data.folders.map(f=>folderCard(f,data,canPost,canManage)).join('')}</div>`:empty('لا توجد مجلدات بعد.'));
 const cards=visible.map(p=>postCard(p,data,canPost,canManage)).join('');
 const postsBlock=cards?`<div class="mb-wall-grid">${cards}</div>`:empty(folder?'لا توجد منشورات داخل هذا المجلد بعد.':'لا توجد منشورات هنا بعد.');
 setBody(crumbs+toolbar+folders+postsBlock+
  (data.is_admin?box(btn(num(data.class.is_active)?'أرشفة الفصل':'إعادة فتح الفصل',`mbArchive(${num(activeClass)},${num(data.class.is_active)?0:1})`,'quiet')):''),{focus:force});
}

/* ============ فتح منشور + التعليقات داخل نفس الواجهة ============ */
window.mbOpenPost=id=>run(()=>openPost(id));
window.mbOpenComments=id=>run(()=>openPost(id));
async function openPost(id){
 if(!activeClass)return;
 const token=beginView();
 activeTab='wall';markTab();
 setBody(loading(),{focus:true});
 const [data,comments]=await Promise.all([loadClass(true),request('comments',null,{post_id:id})]);
 if(!isLive(token))return;
 const p=data.posts.find(x=>num(x.id)===num(id));
 if(!p){await renderWallBody();return;}
 activeFolder=num(p.folder_id)||null;
 const canPost=!!num(data.permissions.can_post),canManage=!!num(data.permissions.can_manage_posts);
 const editable=canPost&&(data.is_admin||canManage||num(p.author_id)===num(me?.id));
 const crumb=activeFolder
  ?`<div class="mb-breadcrumb"><button type="button" onclick="mbOpenFolder(${activeFolder})">${icon('arrow')} ${esc(folderName(data,activeFolder))}</button><span class="mb-crumb-sep">›</span><strong>${esc(p.title)}</strong></div>`
  :`<div class="mb-breadcrumb"><button type="button" onclick="mbWallBack()">${icon('arrow')} الجدار العام</button><span class="mb-crumb-sep">›</span><strong>${esc(p.title)}</strong></div>`;
 const rows=comments.items.map(x=>`<div class="mb-person"><div><strong>${esc(x.author)}</strong><p>${esc(x.body)}</p><small>${esc(x.created_at)}</small></div></div>`).join('');
 setBody(crumb+
  `<article class="mb-box mb-wall-post mb-post-detail"><div class="mb-post-meta">${icon('post')} ${esc(p.author_name)} · ${esc(p.created_at)}${p.status!=='published'?' · غير منشور':''}</div><h2>${esc(p.title)}</h2><p class="mb-post-content">${esc(p.content)}</p><div class="mb-attachments">${attachments(p)}</div><div class="mb-actions">${btn(activeFolder?'العودة للمجلد':'العودة للجدار','mbWallBack()','outline')}${editable?btn('تعديل وإرفاق',`mbCompose(${num(p.id)})`,'outline')+btn('حذف',`mbDeletePost(${num(p.id)})`,'quiet'):''}${canManage?btn(p.status==='published'?'إخفاء':'نشر',`mbStatusPost(${num(p.id)},'${p.status==='published'?'hidden':'published'}')`,'outline'):''}</div></article>`+
  box(`<h2>التعليقات (${numberFmt(comments.items.length)})</h2>${rows||empty('لا توجد تعليقات بعد.')}`+(p.status==='published'?`<form id="mbCommentForm" class="mb-form"><label class="mb-full">اكتبي تعليقك<textarea name="body" rows="3" maxlength="1500" required></textarea></label><div class="mb-full"><button class="mb-btn">إضافة تعليق</button></div></form>`:'')),{focus:true});
 if(p.status==='published')form('mbCommentForm').onsubmit=e=>{e.preventDefault();const f=e.target;const submit=f.querySelector('button');submit.disabled=true;run(async()=>{try{await request('comment',{post_id:num(id),body:input(f,'body')});await openPost(id);}finally{submit.disabled=false;}});};
}

/* ============ نماذج الجدار داخل المحتوى ============ */
window.mbCompose=id=>run(()=>composePost(id));
async function composePost(id){
 const token=beginView();
 activeTab='wall';markTab();setBody(loading(),{focus:true});
 const data=await loadClass(!wallData);
 if(!isLive(token))return;
 const p=num(id)?data.posts.find(x=>num(x.id)===num(id)):null;
 const upload=!!num(data.permissions.can_upload);
 const crumb=`<div class="mb-breadcrumb"><button type="button" onclick="mbWallBack()">${icon('arrow')} ${activeFolder?esc(folderName(wallData,activeFolder)):'الجدار العام'}</button><span class="mb-crumb-sep">›</span><strong>${p?'تعديل المنشور':'منشور جديد'}</strong></div>`;
 setBody(crumb+box(`<form id="mbComposeForm" class="mb-form"><label class="mb-full">العنوان<input name="title" maxlength="170" required value="${esc(p?.title||'')}"></label><label class="mb-full">تفاصيل المنشور<textarea name="content" rows="5" maxlength="7000" required>${esc(p?.content||'')}</textarea></label><label>المكان<select name="folder_id">${folderOptions(p?p.folder_id:activeFolder)}</select></label>${upload?'<label>الصور وملفات PDF<input name="attachments" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf"><small>حتى ٦ ملفات، ١٠ ميغابايت للملف.</small></label>':''}<div class="mb-full"><button class="mb-btn">${p?'حفظ التعديلات':'نشر المنشور'}</button></div></form>`+(p?`<div class="mb-attachments">${attachments(p)}</div>`:'')),{focus:true});
 form('mbComposeForm').onsubmit=e=>{e.preventDefault();const f=e.target;const files=upload?Array.from(f.elements.attachments.files):[];if(files.length>6||files.some(x=>x.size>10485760)){alert('اختاري حتى ٦ ملفات لا يتجاوز كل منها ١٠ ميغابايت.');return;}f.querySelector('button').disabled=true;run(async()=>{
  let saved=false;try{const folder=num(input(f,'folder_id'))||null;const result=await request(p?'edit_post':'new_post',{...(p?{post_id:num(p.id)}:{class_id:activeClass}),title:input(f,'title'),content:input(f,'content'),folder_id:folder});saved=true;for(const file of files){const data=new FormData();data.append('file',file);data.append('class_id',activeClass);data.append('post_id',result.id);await request('upload',data);}activeFolder=folder;await openTab('wall',{force:true,focus:true});}
  catch(error){if(saved){activeFolder=num(input(f,'folder_id'))||null;await openTab('wall',{force:true});throw new Error('حُفظ المنشور، لكن لم يكتمل رفع المرفقات. افتحي «تعديل وإرفاق» لإعادة رفع الملفات الناقصة. '+error.message);}throw error;}
  finally{f.querySelector('button').disabled=false;}
  });};
}
window.mbEditPost=id=>window.mbCompose(id);
window.mbFolderForm=id=>run(()=>folderForm(id));
async function folderForm(id){
 const token=beginView();
 activeTab='wall';markTab();setBody(loading(),{focus:true});
 await loadClass(!wallData);
 if(!isLive(token))return;
 const folder=id?wallData.folders.find(f=>num(f.id)===num(id)):null;
 setBody(`<div class="mb-breadcrumb"><button type="button" onclick="mbWallBack()">${icon('arrow')} الجدار العام</button><span class="mb-crumb-sep">›</span><strong>${folder?'تعديل المجلد':'مجلد جديد'}</strong></div>`+
  box(`<form id="mbFolderForm" class="mb-form"><label class="mb-full">اسم المجلد<input name="name" maxlength="140" required value="${esc(folder?.name||'')}"></label><label class="mb-full">الوصف<textarea name="description" rows="3" maxlength="1500">${esc(folder?.description||'')}</textarea></label><label>لون المجلد<input name="color" type="color" value="${esc(folder?.color||'#9b87c4')}"></label><div class="mb-full"><button class="mb-btn">حفظ المجلد</button></div></form>`),{focus:true});
 form('mbFolderForm').onsubmit=e=>{e.preventDefault();const f=e.target;const submit=f.querySelector('button');submit.disabled=true;run(async()=>{try{await request(folder?'edit_folder':'create_folder',{class_id:activeClass,...(folder?{folder_id:num(folder.id)}:{}),name:input(f,'name'),description:input(f,'description'),color:input(f,'color')});await openTab('wall',{force:true,focus:true});}finally{submit.disabled=false;}});};
}
window.mbDeleteFolder=id=>run(async()=>{if(!confirm('حذف المجلد ونقل منشوراته إلى الجدار العام؟ تبقى الملفات والتعليقات محفوظة.'))return;await request('delete_folder',{folder_id:id,confirmed:true});if(num(activeFolder)===num(id))activeFolder=null;await openTab('wall',{force:true});});
window.mbDeletePost=id=>run(async()=>{if(!confirm('نقل المنشور إلى المحذوفات مع الاحتفاظ بملفاته وتعليقاته؟'))return;await request('delete_post',{post_id:id,confirmed:true});await openTab('wall',{force:true,focus:true});});
window.mbMovePost=id=>run(async()=>{
 const token=beginView();
 activeTab='wall';markTab();setBody(loading(),{focus:true});
 await loadClass(!wallData);
 if(!isLive(token))return;
 const p=wallData.posts.find(x=>num(x.id)===num(id));if(!p){await renderWallBody();return;}
 setBody(`<div class="mb-breadcrumb"><button type="button" onclick="mbWallBack()">${icon('arrow')} الجدار العام</button><span class="mb-crumb-sep">›</span><strong>نقل المنشور</strong></div>`+
  box(`<form id="mbMoveForm" class="mb-form"><p class="mb-help mb-full">${esc(p.title)}</p><label class="mb-full">المجلد<select name="folder_id">${folderOptions(p.folder_id)}</select></label><button class="mb-btn">نقل المنشور</button></form>`),{focus:true});
 form('mbMoveForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{const folder=num(input(f,'folder_id'))||null;await request('move_post',{post_id:id,folder_id:folder});activeFolder=folder;await openTab('wall',{force:true,focus:true});});};
});
window.mbArchive=(id,on)=>run(async()=>{if(!confirm(on?'إعادة فتح الفصل؟':'أرشفة الفصل ومنع الوصول إليه للمعلمات؟'))return;await request('archive_class',{class_id:id,is_active:!!on,confirmed:true});await showOverview();});
window.mbStatusPost=(id,status)=>run(async()=>{await request('set_post_status',{post_id:id,status});await openTab('wall',{force:true,focus:true});});

/* ============ تبويب الطالبات ============ */
window.mbStudents=id=>run(()=>openStudents(id));
async function openStudents(id){
 const token=beginView();
 const cid=num(id)||num(activeClass);
 if(cid!==num(activeClass)||!document.getElementById('mbClassBody')){await enterClass(cid,'students');return;}
 activeTab='students';markTab();
 await renderStudentsBody(true,token);
}
async function renderStudentsBody(force=false,token=null){
 if(token===null)token=beginView();
 setBody(loading());
 const [students,data]=await Promise.all([request('students',null,{class_id:activeClass}),loadClass(force)]);
 if(!isLive(token))return;
 const admin=!!data.is_admin,abilities=data.abilities||{},canManage=!!abilities.add_students;
 const rows=students.items.map(s=>`<div class="mb-person"><div><strong>${esc(s.display_name)}</strong>${admin?`<small>رقم مدار: ${num(s.madar_student_id)} · ${s.entry_mode==='school_only'?'بوابة المجمع فقط':'مدار + المجمع'}</small>`:''}</div><div class="mb-actions">${btn('ملف الإنجاز',`mbPortfolio(${activeClass},${num(s.id)})`,'outline')}${abilities.reset_passwords?btn('إعادة تعيين كلمة المرور',`mbResetStudentPassword(${activeClass},${num(s.id)})`,'outline'):''}${canManage?btn('إخراج من الفصل',`mbRemoveStudent(${activeClass},${num(s.id)})`,'quiet'):''}</div></div>`).join('');
 const manageBtn=(abilities.add_students||abilities.edit_students||abilities.reset_passwords)?btn('إدارة الطالبات',`mbManageStudents(${activeClass})`,'outline'):'';
 setBody(`<div class="mb-subhead"><h2>طالبات الفصل</h2><div class="mb-actions">${manageBtn}</div></div>`+
  (abilities.accept_students?box(`<div class="mb-inline-cta"><div><strong>طلبات الانضمام</strong><p class="mb-help">راجعي طلبات الطالبات الجديدة واعتمدي الفصل المناسب لكل طالبة.</p></div>${btn('طلبات الطالبات',`mbManagePending(${activeClass})`,'outline')}</div>`):'')+
  box(`<h2>القائمة المشتركة (${numberFmt(students.items.length)})</h2><p class="mb-help">الطالبة التي تدرس عند أكثر من معلمة تظهر هنا مرة واحدة حسب رقم حسابها في مدار.</p>${rows||empty('لم تُربط طالبات بهذا الفصل بعد.')}`)+
  (canManage?box(`<h2>إضافة طالبة موجودة في مدار</h2><p class="mb-help">اكتبي رقم حساب الطالبة الحقيقي في مدار. لا تعتمدي على الاسم وحده، ولا تُنشئي حسابًا جديدًا للطالبة.</p><form id="mbStudentForm" class="mb-form"><label>رقم حساب الطالبة في مدار<input name="madar_student_id" inputmode="numeric" pattern="[1-9][0-9]*" required></label><div class="mb-full"><button class="mb-btn">ربط الطالبة بالفصل</button></div></form>`):'')+
  (canManage?box(`<h2>إضافة طالبة جديدة</h2><p class="mb-help">يُنشأ حساب واحد في مدار ويُربط بالفصل. الدخول المبدئي لبوابة ظليم فقط؛ توسعة وصول مدار من المالكة.</p><form id="mbNewStudentForm" class="mb-form"><label>اسم الطالبة<input name="name" required maxlength="140" autocomplete="off"></label><label>إيميل منصة مدرستي<input name="email" type="email" required placeholder="name@mkhg.moe.gov.sa" autocomplete="off"></label><label>المرحلة<select name="stage" required><option>ابتدائي</option><option>متوسط</option><option>ثانوي</option></select></label><label>كلمة مرور مؤقتة<input name="password" type="password" required minlength="10" autocomplete="new-password"></label><div class="mb-full"><button class="mb-btn">إضافة الطالبة وربط حسابها</button></div></form>`):''));
 if(canManage)form('mbNewStudentForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{await request('create_student',{class_id:activeClass,name:input(f,'name'),email:input(f,'email'),stage:input(f,'stage'),password:f.elements.password.value});await renderStudentsBody(true);});};
 if(canManage)form('mbStudentForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{await request('add_student',{class_id:activeClass,madar_student_id:input(f,'madar_student_id'),display_name:''});await renderStudentsBody(true);});};
}
window.mbResetStudentPassword=(cid,sid)=>run(async()=>{
 const token=beginView();
 activeTab='students';markTab();setBody(loading(),{focus:true});
 await loadClass(!wallData);
 if(!isLive(token))return;
 setBody(`<div class="mb-breadcrumb"><button type="button" onclick="mbStudents(${cid})">${icon('arrow')} قائمة الطالبات</button><span class="mb-crumb-sep">›</span><strong>إعادة تعيين كلمة المرور</strong></div>`+
  box(`<form id="mbResetStudentForm" class="mb-form"><p class="mb-help mb-full">لا تُعرض كلمة المرور الحالية. يخص التغيير حساب هذه الطالبة في مدار وبوابة ظليم معًا.</p><label class="mb-full">كلمة المرور المؤقتة الجديدة<input name="new_password" type="password" required minlength="10" autocomplete="new-password"></label><label class="mb-full"><input name="confirmed" type="checkbox" required> أؤكد إعادة تعيين كلمة مرور هذه الطالبة</label><div class="mb-full"><button class="mb-btn">حفظ كلمة المرور</button></div></form>`),{focus:true});
 form('mbResetStudentForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{await request('reset_student_password',{class_id:cid,student_id:sid,new_password:f.elements.new_password.value,confirmed:f.elements.confirmed.checked});await openStudents(cid);});};
});
window.mbRemoveStudent=(cid,sid)=>run(async()=>{if(!confirm('إزالة الطالبة من هذا الفصل فقط؟ لن يُحذف حسابها من مدار.'))return;await request('remove_student',{class_id:cid,student_id:sid});await renderStudentsBody(true);});

/* ============ ملف إنجاز الطالبة داخل تبويب الطالبات ============ */
window.mbPortfolio=(cid,sid)=>run(async()=>{
 if(num(cid)!==num(activeClass)||!document.getElementById('mbClassBody')){await enterClass(cid,'students');}
 else{activeTab='students';markTab();}
 await openPortfolio(cid,sid);
});
async function openPortfolio(cid,sid){
 const token=beginView();
 activeTab='students';markTab();setBody(loading(),{focus:true});
 const [d,data]=await Promise.all([request('portfolio',null,{class_id:cid,student_id:sid}),loadClass(true)]);
 if(!isLive(token))return;
 const canUpload=!!num(data.permissions.can_upload);
 const rows=d.files.map(f=>`<div class="mb-person"><div><strong>${esc(f.file_name)}</strong><small>${esc(f.subject||'عام')} · ${esc(f.author)} · ${Math.ceil(num(f.file_size)/1024)} كيلوبايت</small></div><div class="mb-actions"><a class="mb-btn mb-outline" href="board-download.php?id=${num(f.id)}">تنزيل آمن</a>${data.is_admin||num(f.uploaded_by)===num(me?.id)?btn('حذف',`mbDeleteFile(${cid},${sid},${num(f.id)})`,'quiet'):''}</div></div>`).join('');
 setBody(`<div class="mb-breadcrumb"><button type="button" onclick="mbStudents(${cid})">${icon('arrow')} قائمة الطالبات</button><span class="mb-crumb-sep">›</span><strong>ملف إنجاز ${esc(d.student.display_name)}</strong></div>`+
  box(`<div class="mb-subhead"><h2>${esc(d.student.display_name)}</h2><span class="mb-count">${countLabel(d.files.length,'ملف','ملفان','ملفات')}</span></div><p class="mb-help">مجلد واحد للطالبة تشارك فيه المعلمات حسب الصلاحيات.</p>${rows||empty('لا توجد ملفات للطالبة حتى الآن.')}`)+
  (canUpload?box(`<h2>رفع ملف إلى إنجاز الطالبة</h2><p class="mb-help">يسمح بصور PNG/JPG/WebP وPDF حتى 10 ميغابايت. تحفظ الملفات بعيدًا عن المجلد العام.</p><form id="mbFileForm" class="mb-form"><label>المادة الدراسية<input name="subject" placeholder="الرياضيات" maxlength="85"></label><label>الملف<input type="file" name="file" accept=".png,.jpg,.jpeg,.webp,.pdf" required></label><div class="mb-full"><button class="mb-btn">رفع الملف</button></div></form>`):''),{focus:true});
 if(canUpload)form('mbFileForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{const data=new FormData(f);data.append('class_id',cid);data.append('student_id',sid);await request('upload',data);await openPortfolio(cid,sid);});};
}
window.mbDeleteFile=(cid,sid,id)=>run(async()=>{if(!confirm('نقل الملف إلى المحذوفات؟'))return;await request('delete_file',{file_id:id});await openPortfolio(cid,sid);});

/* ============ تبويب ملفات الفصل ============ */
window.mbFiles=id=>run(()=>openFiles(id));
async function openFiles(id){
 const token=beginView();
 const cid=num(id)||num(activeClass);
 if(cid!==num(activeClass)||!document.getElementById('mbClassBody')){await enterClass(cid,'files');return;}
 activeTab='files';markTab();
 await renderFilesBody(true,token);
}
async function renderFilesBody(force=false,token=null){
 if(token===null)token=beginView();
 setBody(loading());
 const [files,data]=await Promise.all([request('files',null,{class_id:activeClass}),loadClass(force)]);
 if(!isLive(token))return;
 const canUpload=!!num(data.permissions.can_upload);
 const rows=files.items.map(f=>`<div class="mb-person"><div><strong>${esc(f.file_name)}</strong><small>${esc(f.subject||'عام')} · ${esc(f.author||'إدارة المدرسة')} · ${Math.ceil(num(f.file_size)/1024)} كيلوبايت</small></div><div class="mb-actions"><a class="mb-btn mb-outline" href="board-download.php?id=${num(f.id)}">تنزيل آمن</a>${data.is_admin||num(f.uploaded_by)===num(me?.id)?btn('حذف',`mbDeleteSharedFile(${activeClass},${num(f.id)})`,'quiet'):''}</div></div>`).join('');
 setBody(`<div class="mb-subhead"><h2>ملفات الفصل المشتركة</h2><span class="mb-count">${countLabel(files.items.length,'ملف','ملفان','ملفات')}</span></div><p class="mb-help">مكتبة الفصل العامة؛ ملفات الطالبات الخاصة توجد في ملف إنجاز كل طالبة.</p>`+
  box(rows||empty('لم تُضف ملفات عامة للفصل حتى الآن.'))+
  (canUpload?box(`<h2>رفع ملف عام للفصل</h2><form id="mbGeneralUpload" class="mb-form"><label>المادة<input name="subject" maxlength="85"></label><label>الملف<input name="file" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" required></label><div class="mb-full"><button class="mb-btn">رفع للفصل</button></div></form>`):''));
 if(canUpload)form('mbGeneralUpload').onsubmit=e=>{e.preventDefault();run(async()=>{const data=new FormData(e.target);data.append('class_id',activeClass);await request('upload',data);await renderFilesBody(true);});};
}
window.mbDeleteSharedFile=(cid,id)=>run(async()=>{if(!confirm('نقل الملف للمحذوفات؟'))return;await request('delete_file',{file_id:id});await renderFilesBody(true);});

/* ============ تبويب المعلمات (لإدارة الفصل) ============ */
window.mbTeachers=cid=>run(()=>openTeachers(cid));
async function openTeachers(cid){
 const token=beginView();
 const target=num(cid)||num(activeClass);
 if(target!==num(activeClass)||!document.getElementById('mbClassBody')){await enterClass(target,'teachers');return;}
 activeTab='teachers';markTab();
 await renderTeachersBody(true,token);
}
async function renderTeachersBody(force=false,token=null){
 if(token===null)token=beginView();
 setBody(loading());
 const [data,cls]=await Promise.all([request('teachers',null,{class_id:activeClass}),loadClass(force)]);
 if(!isLive(token))return;
 const rows=data.members.map(m=>`<div class="mb-person"><div><strong>${esc(m.name)}</strong><small>${esc(m.specialty||'التخصص غير محدد')} · ${esc(m.subject||'المادة غير محددة')} · ${esc(m.grade_scope||'الصف غير محدد')} · ${num(m.approved)?'معتمدة':'تحتاج اعتمادًا'}</small><small>${['can_post','can_upload','can_manage_students','can_manage_posts'].filter(k=>num(m[k])).map(k=>({can_post:'نشر',can_upload:'إدارة ملفات مادتها',can_manage_students:'طالبات',can_manage_posts:'إدارة المنشورات'}[k])).join(' · ')||'مشاهدة فقط'}</small></div><div class="mb-actions">${btn('تعديل التخصص والصلاحيات',`mbEditRights(${activeClass},${num(m.teacher_id)})`,'outline')}${btn('سحب الصلاحية',`mbRevoke(${activeClass},${num(m.teacher_id)})`,'quiet')}</div></div>`).join('');
 const options=data.teachers.map(t=>`<option value="${num(t.id)}">${esc(t.name)} (${esc(t.email)})</option>`).join('');
 setBody(`<div class="mb-subhead"><h2>إدارة صلاحيات الفصل</h2><span class="mb-count">${countLabel(data.members.length,'معلمة','معلمتان','معلمات')}</span></div><p class="mb-help">اعتماد تخصص ومادة المعلمة وصلاحياتها في هذا الفصل.</p>`+
  (data.identity_conflicts?box('تعذر ربط '+numberFmt(data.identity_conflicts)+' حساب بسبب تعارض بريد إلكتروني. راجعيه في مدار قبل منحه صلاحية.'):'')+
  box(`<h2>المعلمات المخوّلات</h2>${rows||empty('لا توجد معلمات مخوّلات بعد.')}`)+
  box(`<h2>اعتماد معلمة في الفصل</h2><p class="mb-help">تُجلب الحسابات النشطة مباشرة من مدار. حددي التخصص والمادة والصف والصلاحيات الخاصة بهذا الفصل.</p><form id="mbTeacherForm" class="mb-form"><label class="mb-full">المعلمة<select name="teacher_id" required>${options}</select></label><label>التخصص<input name="specialty" required maxlength="100" placeholder="رياضيات"></label><label>المادة في هذا الفصل<input name="subject" required maxlength="85" placeholder="رياضيات"></label><label>المرحلة / الصف<input name="grade_scope" value="${esc(cls.class.grade)}" required maxlength="100"></label><fieldset class="mb-full"><legend>الصلاحيات</legend><label><input type="checkbox" name="can_post"> نشر على الجدار</label><label><input type="checkbox" name="can_upload"> رفع وإدارة ملفات مادتها</label><label><input type="checkbox" name="can_manage_posts"> إدارة منشورات الفصل</label></fieldset><div class="mb-full"><button class="mb-btn">حفظ واعتماد المعلمة</button></div></form>`));
 form('mbTeacherForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{await request('assign_teacher',{class_id:activeClass,teacher_id:num(input(f,'teacher_id')),can_post:f.elements.can_post.checked,can_upload:f.elements.can_upload.checked,can_manage_students:false,can_manage_posts:f.elements.can_manage_posts.checked,specialty:input(f,'specialty'),subject:input(f,'subject'),grade_scope:input(f,'grade_scope')});await renderTeachersBody(true);});};
}
window.mbEditRights=(cid,tid)=>run(async()=>{const data=await request('teachers',null,{class_id:cid});const m=data.members.find(x=>num(x.teacher_id)===tid);if(!m)return;const names=[['can_post','النشر'],['can_upload','إدارة ملفات مادتها'],['can_manage_posts','إدارة المنشورات']];const changes={};for(const [key,label] of names)changes[key]=confirm('تفعيل صلاحية '+label+' لهذه المعلمة؟');changes.specialty=prompt('التخصص المهني',m.specialty||'');if(changes.specialty===null)return;changes.subject=prompt('المادة المخصصة لهذا الفصل',m.subject||'');if(changes.subject===null)return;changes.grade_scope=prompt('المرحلة / الصف',m.grade_scope||'');if(changes.grade_scope===null)return;await request('assign_teacher',{class_id:cid,teacher_id:tid,...changes});await renderTeachersBody(true);});
window.mbRevoke=(cid,tid)=>run(async()=>{if(!confirm('سحب صلاحيات هذه المعلمة من الفصل فورًا دون حذف بياناتها؟'))return;await request('revoke_teacher',{class_id:cid,teacher_id:tid,confirmed:true});await renderTeachersBody(true);});

/* ============ سجل الإدارة ============ */
window.mbAudit=()=>run(async()=>{const r=await request('audit');render(head('سجل إدارة لوحتي','أحدث 100 عملية مسجلة',btn('الرئيسية','mbHome()','outline'))+box(r.items.map(i=>`<div class="mb-person"><div><strong>${esc(i.actor)}</strong><small>${esc(i.event_type)} · ${esc(i.entity_type)} · ${esc(i.happened_at)}</small><details><summary>تفاصيل التغيير</summary><pre class="mb-post-content">${esc(i.details)}</pre></details></div></div>`).join('')||empty('لا توجد عمليات مسجلة.')));});

window.mbUI={esc,num,box,btn,head,request,run,form,input,render,home:showOverview,clearClass:clearClassState};
})();

myBoardScreen=function(){window.boardStart();};

window.mbPendingStudents=()=>window.mbManagePending();
