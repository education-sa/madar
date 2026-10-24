/* لوحتي — مجمع مدارس ظليم. A separate module; survey functions remain unchanged. */
(()=>{
'use strict';
let activeClass=null,activeStudent=null,boardInfo=null,activeFolder=null,classTitle='',wallData=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number(x)||0;
const box=(body,extra='')=>`<section class="mb-box ${extra}">${body}</section>`;
const btn=(label,action,variant='')=>`<button type="button" class="mb-btn ${variant}" onclick="${action}">${label}</button>`;
const head=(title,desc,actions='')=>`<header class="mb-heading"><div><small>بوابة مجمع مدارس ظليم / لوحتي</small><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="mb-heading-actions">${actions}</div></header>`;
const numberFmt=n=>new Intl.NumberFormat('ar-SA').format(n||0);
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
function empty(message){return `<p class="mb-empty">${esc(message)}</p>`;}
window.boardStart=()=>run(showOverview);
async function showOverview(){activeClass=null;activeStudent=null;classTitle='';activeFolder=null;boardInfo=await request('overview');
 const cards=boardInfo.classes.map(c=>`<button type="button" class="mb-class" onclick="mbOpenClass(${num(c.id)})"><span class="mb-class-icon">🏫</span><strong>${esc(c.title)}</strong><small>${esc(c.grade)} / ${esc(c.section_name)}</small><span>${numberFmt(c.students_count)} طالبة · ${esc(c.academic_year)}</span>${num(c.is_active)?'':'<em>مؤرشف</em>'}</button>`).join('');
 render(head('لوحتي','الفصول المشتركة بين معلمات مجمع مدارس ظليم',(boardInfo.can_manage?btn('⚙️ إدارة','mbManageHome()','outline'):boardInfo.can_create_classes?btn('إضافة فصل','mbManageClassForm()','outline'):''))+
 `<div class="mb-summary">${box(`<strong>${numberFmt(boardInfo.classes.length)}</strong><span>فصل متاح</span>`)}${box('<strong>مدار</strong><span>حسابات موحّدة</span>')}${box('<strong>مشاركة</strong><span>ملفات إنجاز وأنشطة</span>')}</div>`+
 `<div class="mb-section-title"><h2>الفصول الدراسية</h2></div><div class="mb-grid">${cards||empty('لا توجد فصول متاحة لك حاليًا. تستطيع مديرة النظام إنشاء الفصول وتحديد المعلمات المخوّلات.')}</div>`+
 '' );
}

window.mbHome=()=>run(showOverview);
window.mbOpenClass=id=>run(()=>showClass(id));
const icons={folder:'<path d="M3 7h6l2 2h10v10H3z"/><path d="M3 7V5h6l2 2"/>',post:'<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M5 12h14M14 7l5 5-5 5"/>'};
const icon=name=>`<svg class="mb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.post}</svg>`;
const wallBack=()=>showClass(activeClass,activeFolder);
function folderOptions(selected=null){return `<option value="">الجدار العام</option>`+wallData.folders.map(f=>`<option value="${num(f.id)}" ${num(selected)===num(f.id)?'selected':''}>${esc(f.name)}</option>`).join('');}
function attachments(p){return (p.attachments||[]).map(f=>`<a class="mb-attachment" href="board-download.php?id=${num(f.id)}&view=1" target="_blank" rel="noopener">${f.mime.startsWith('image/')?`<img loading="lazy" src="board-download.php?id=${num(f.id)}&view=1" alt="${esc(f.file_name)}">`:`<span class="mb-file-icon" aria-hidden="true">PDF</span>`}<span>${esc(f.file_name)}</span></a>`).join('');}
async function showClass(id,folderId=null){
 activeClass=id;activeStudent=null;const data=await request('class',null,{id});wallData=data;classTitle=data.class.title;
 activeFolder=folderId===null?null:num(folderId);const folder=data.folders.find(f=>num(f.id)===activeFolder);if(activeFolder&&!folder)activeFolder=null;
 const rights=data.permissions,canPost=!!num(rights.can_post),canManage=!!num(rights.can_manage_posts);
 const visible=data.posts.filter(p=>(num(p.folder_id)||null)===activeFolder);
 const cards=visible.map(p=>{const editable=canPost&&(data.is_admin||canManage||num(p.author_id)===num(me?.id));return box(`<div class="mb-post-meta">${icon('post')} ${esc(p.author_name)} · ${esc(p.created_at)}${p.status!=='published'?' · غير منشور':''}</div><h3>${esc(p.title)}</h3><p class="mb-post-content">${esc(p.content)}</p><div class="mb-attachments">${attachments(p)}</div><div class="mb-actions">${btn('التعليقات · '+numberFmt(p.comments_count),`mbOpenComments(${num(p.id)})`,'outline')}${editable?btn('تعديل وإرفاق',`mbEditPost(${num(p.id)})`,'outline')+btn('نقل',`mbMovePost(${num(p.id)})`,'outline')+btn('حذف',`mbDeletePost(${num(p.id)})`,'quiet'):''}${canManage?btn(p.status==='published'?'إخفاء':'نشر',`mbStatusPost(${num(p.id)},'${p.status==='published'?'hidden':'published'}')`,'outline'):''}</div>`,'mb-wall-post');}).join('');
 const folders=activeFolder?'':data.folders.map(f=>`<article class="mb-folder" style="--folder-color:${/^#[0-9a-f]{6}$/i.test(f.color)?f.color:'#9b87c4'}"><button class="mb-folder-open" onclick="mbOpenFolder(${num(f.id)})">${icon('folder')}<strong>${esc(f.name)}</strong><p>${esc(f.description)}</p><small>${numberFmt(data.posts.filter(p=>num(p.folder_id)===num(f.id)).length)} منشورات</small></button>${canPost&&(data.is_admin||canManage||num(f.created_by)===num(me?.id))?`<div class="mb-actions">${btn('تعديل',`mbFolderForm(${num(f.id)})`,'outline')}${btn('حذف',`mbDeleteFolder(${num(f.id)})`,'quiet')}</div>`:''}</article>`).join('');
 const nav=`<nav class="mb-tabs" aria-label="أقسام الفصل">${btn('الجدار العام',`mbOpenClass(${id})`,'outline')}${btn('طالبات الفصل',`mbStudents(${id})`,'outline')}${btn('ملفات الفصل',`mbFiles(${id})`,'outline')}${data.is_admin?btn('⚙️ إدارة','mbManageHome()','outline'):''}</nav>`;
 render(head(folder?folder.name:'جدار الفصل',folder?folder.description:`${data.class.grade} / ${data.class.section_name} · ${data.class.academic_year}`,btn(activeFolder?'الجدار العام':'جميع الفصول',activeFolder?`mbOpenClass(${id})`:'mbHome()','outline'))+nav+
 `<div class="mb-wall-toolbar"><span>${icon(activeFolder?'folder':'post')} ${activeFolder?'داخل المجلد':'مساحة الفصل المشتركة'}</span><div class="mb-actions">${canPost?btn(icon('plus')+' إضافة منشور','mbCompose()')+btn(icon('folder')+' إنشاء مجلد','mbFolderForm()','outline'):''}</div></div>`+
 (folders?`<div class="mb-folder-grid">${folders}</div>`:'')+`<div class="mb-wall-grid">${cards}</div>`+(cards?'':empty('لا توجد منشورات هنا بعد.'))+
 (data.is_admin?box(btn(num(data.class.is_active)?'أرشفة الفصل':'إعادة فتح الفصل',`mbArchive(${id},${num(data.class.is_active)?0:1})`,'quiet')):''));
}
window.mbOpenFolder=id=>run(()=>showClass(activeClass,id));
window.mbWallBack=()=>run(wallBack);
window.mbFolderForm=id=>run(async()=>{
 const folder=wallData.folders.find(f=>num(f.id)===num(id));
 render(head(folder?'تعديل المجلد':'مجلد جديد','اجمعي منشورات الفصل في مساحة مرتبة.',btn('عودة','mbWallBack()','outline'))+box(`<form id="mbFolderForm" class="mb-form"><label class="mb-full">اسم المجلد<input name="name" maxlength="140" required value="${esc(folder?.name||'')}"></label><label class="mb-full">الوصف<textarea name="description" rows="3" maxlength="1500">${esc(folder?.description||'')}</textarea></label><label>لون المجلد<input name="color" type="color" value="${esc(folder?.color||'#9b87c4')}"></label><div class="mb-full"><button class="mb-btn">حفظ المجلد</button></div></form>`));
 form('mbFolderForm').onsubmit=e=>{e.preventDefault();const f=e.target;f.querySelector('button').disabled=true;run(async()=>{try{await request(folder?'edit_folder':'create_folder',{class_id:activeClass,...(folder?{folder_id:num(folder.id)}:{}),name:input(f,'name'),description:input(f,'description'),color:input(f,'color')});await wallBack();}finally{f.querySelector('button').disabled=false;}});};
});
window.mbDeleteFolder=id=>run(async()=>{if(!confirm('حذف المجلد ونقل منشوراته إلى الجدار العام؟ تبقى الملفات والتعليقات محفوظة.'))return;await request('delete_folder',{folder_id:id,confirmed:true});await showClass(activeClass);});
window.mbDeletePost=id=>run(async()=>{if(!confirm('نقل المنشور إلى المحذوفات مع الاحتفاظ بملفاته وتعليقاته؟'))return;await request('delete_post',{post_id:id,confirmed:true});await wallBack();});
window.mbCompose=id=>run(async()=>{
 const p=wallData.posts.find(x=>num(x.id)===num(id));const upload=!!num(wallData.permissions.can_upload);
 render(head(p?'تعديل المنشور':'منشور جديد','اختاري المجلد أو انشري مباشرة على الجدار العام.',btn('عودة','mbWallBack()','outline'))+box(`<form id="mbComposeForm" class="mb-form"><label class="mb-full">العنوان<input name="title" maxlength="170" required value="${esc(p?.title||'')}"></label><label class="mb-full">تفاصيل المنشور<textarea name="content" rows="5" maxlength="7000" required>${esc(p?.content||'')}</textarea></label><label>المكان<select name="folder_id">${folderOptions(p?p.folder_id:activeFolder)}</select></label>${upload?'<label>الصور وملفات PDF<input name="attachments" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf"><small>حتى ٦ ملفات، ١٠ ميغابايت للملف.</small></label>':''}<div class="mb-full"><button class="mb-btn">${p?'حفظ التعديلات':'نشر المنشور'}</button></div></form>`+(p?`<div class="mb-attachments">${attachments(p)}</div>`:'')));
 form('mbComposeForm').onsubmit=e=>{e.preventDefault();const f=e.target;const files=upload?Array.from(f.elements.attachments.files):[];if(files.length>6||files.some(x=>x.size>10485760)){alert('اختاري حتى ٦ ملفات لا يتجاوز كل منها ١٠ ميغابايت.');return;}f.querySelector('button').disabled=true;run(async()=>{
 let saved=false;try{const result=await request(p?'edit_post':'new_post',{...(p?{post_id:num(p.id)}:{class_id:activeClass}),title:input(f,'title'),content:input(f,'content'),folder_id:num(input(f,'folder_id'))||null});saved=true;for(const file of files){const data=new FormData();data.append('file',file);data.append('class_id',activeClass);data.append('post_id',result.id);await request('upload',data);}await showClass(activeClass,num(input(f,'folder_id'))||null);}
 catch(error){if(saved){await wallBack();throw new Error('حُفظ المنشور، لكن لم يكتمل رفع المرفقات. افتحي «تعديل وإرفاق» لإعادة رفع الملفات الناقصة. '+error.message);}throw error;}
 finally{f.querySelector('button').disabled=false;}
 });};
});
window.mbEditPost=id=>window.mbCompose(id);
window.mbMovePost=id=>run(async()=>{
 const p=wallData.posts.find(x=>num(x.id)===id);if(!p)return;
 render(head('نقل المنشور',p.title,btn('عودة','mbWallBack()','outline'))+box(`<form id="mbMoveForm" class="mb-form"><label class="mb-full">المجلد<select name="folder_id">${folderOptions(p.folder_id)}</select></label><button class="mb-btn">نقل المنشور</button></form>`));
 form('mbMoveForm').onsubmit=e=>{e.preventDefault();run(async()=>{const folder=num(input(e.target,'folder_id'))||null;await request('move_post',{post_id:id,folder_id:folder});await showClass(activeClass,folder);});};
});
window.mbArchive=(id,on)=>run(async()=>{if(!confirm(on?'إعادة فتح الفصل؟':'أرشفة الفصل ومنع الوصول إليه للمعلمات؟'))return;await request('archive_class',{class_id:id,is_active:!!on,confirmed:true});await showOverview();});
window.mbStatusPost=(id,status)=>run(async()=>{await request('set_post_status',{post_id:id,status});await wallBack();});
window.mbOpenComments=id=>run(async()=>{
 const [c,r]=await Promise.all([request('class',null,{id:activeClass}),request('comments',null,{post_id:id})]);
 const p=c.posts.find(x=>num(x.id)===id);if(!p)return;
 render(head('تعليقات المنشور',p.title,btn('العودة للجدار','mbWallBack()','outline'))+
 box(`<h2>${esc(p.title)}</h2><p class="mb-post-content">${esc(p.content)}</p><div class="mb-attachments">${attachments(p)}</div>`)+box(r.items.map(x=>`<div class="mb-person"><div><strong>${esc(x.author)}</strong><p>${esc(x.body)}</p><small>${esc(x.created_at)}</small></div></div>`).join('')||empty('لا توجد تعليقات بعد.'))+
 (p.status==='published'?box(`<form id="mbCommentForm" class="mb-form"><label class="mb-full">اكتبي تعليقك<textarea name="body" rows="3" maxlength="1500" required></textarea></label><div class="mb-full"><button class="mb-btn">إضافة تعليق</button></div></form>`):''));
 if(p.status==='published')form('mbCommentForm').onsubmit=e=>{e.preventDefault();run(async()=>{await request('comment',{post_id:id,body:input(e.target,'body')});window.mbOpenComments(id);});};
});
window.mbStudents=id=>run(()=>showStudents(id));
async function showStudents(id){activeClass=id;const [students,details]=await Promise.all([request('students',null,{class_id:id}),request('class',null,{id})]);const admin=details.is_admin;const abilities=details.abilities||{};const canManage=!!abilities.add_students;
 const rows=students.items.map(s=>`<div class="mb-person"><div><strong>${esc(s.display_name)}</strong>${admin?`<small>رقم مدار: ${num(s.madar_student_id)} · ${s.entry_mode==='school_only'?'بوابة المجمع فقط':'مدار + المجمع'}</small>`:''}</div><div class="mb-actions">${btn('ملف الإنجاز',`mbPortfolio(${id},${num(s.id)})`,'outline')}${abilities.reset_passwords?btn('إعادة تعيين كلمة المرور',`mbResetStudentPassword(${id},${num(s.id)})`,'outline'):''}${canManage?btn('إخراج من الفصل',`mbRemoveStudent(${id},${num(s.id)})`,'quiet'):''}</div></div>`).join('');
 render(head('طالبات الفصل',details.class.title,btn('العودة للفصل',`mbOpenClass(${id})`,'outline')+((abilities.add_students||abilities.edit_students||abilities.reset_passwords)?btn('إدارة الطالبات',`mbManageStudents(${id})`,'outline'):''))+
 (abilities.accept_students?box(btn('طلبات الطالبات',`mbManagePending(${id})`,'outline')):'')+box(`<h2>القائمة المشتركة (${numberFmt(students.items.length)})</h2><p class="mb-help">الطالبة التي تدرس عند أكثر من معلمة تظهر هنا مرة واحدة حسب رقم حسابها في مدار.</p>${rows||empty('لم تُربط طالبات بهذا الفصل بعد.')}`)+
 (canManage?box(`<h2>إضافة طالبة موجودة في مدار</h2><p class="mb-help">اكتبي رقم حساب الطالبة الحقيقي في مدار. لا تعتمدي على الاسم وحده، ولا تُنشئي حسابًا جديدًا للطالبة.</p><form id="mbStudentForm" class="mb-form"><label>رقم حساب الطالبة في مدار<input name="madar_student_id" inputmode="numeric" pattern="[1-9][0-9]*" required></label><div class="mb-full"><button class="mb-btn">ربط الطالبة بالفصل</button></div></form>`):'')+
 (canManage?box(`<h2>إضافة طالبة جديدة</h2><p class="mb-help">يُنشأ حساب واحد في مدار ويُربط بالفصل. الدخول المبدئي لبوابة ظليم فقط؛ توسعة وصول مدار من المالكة.</p><form id="mbNewStudentForm" class="mb-form"><label>اسم الطالبة<input name="name" required maxlength="140" autocomplete="off"></label><label>إيميل منصة مدرستي<input name="email" type="email" required placeholder="name@mkhg.moe.gov.sa" autocomplete="off"></label><label>المرحلة<select name="stage" required><option>ابتدائي</option><option>متوسط</option><option>ثانوي</option></select></label><label>كلمة مرور مؤقتة<input name="password" type="password" required minlength="10" autocomplete="new-password"></label><div class="mb-full"><button class="mb-btn">إضافة الطالبة وربط حسابها</button></div></form>`):''));
 if(canManage)form('mbNewStudentForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{await request('create_student',{class_id:id,name:input(f,'name'),email:input(f,'email'),stage:input(f,'stage'),password:f.elements.password.value});await showStudents(id);});};
 if(canManage)form('mbStudentForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=e.target;await request('add_student',{class_id:id,madar_student_id:input(f,'madar_student_id'),display_name:''});await showStudents(id);});};
}

window.mbResetStudentPassword=(cid,sid)=>run(async()=>{
 render(head('إعادة تعيين كلمة مرور الطالبة','لا تُعرض كلمة المرور الحالية. يخص التغيير حساب هذه الطالبة في مدار وبوابة ظليم معًا.',btn('العودة للطالبات',`mbStudents(${cid})`,'outline'))+box(`<form id="mbResetStudentForm" class="mb-form"><label>كلمة المرور المؤقتة الجديدة<input name="new_password" type="password" required minlength="10" autocomplete="new-password"></label><label><input name="confirmed" type="checkbox" required> أؤكد إعادة تعيين كلمة مرور هذه الطالبة</label><button class="mb-btn">حفظ كلمة المرور</button></form>`));
 form('mbResetStudentForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{await request('reset_student_password',{class_id:cid,student_id:sid,new_password:f.elements.new_password.value,confirmed:f.elements.confirmed.checked});await showStudents(cid);});};
});
window.mbRemoveStudent=(cid,sid)=>run(async()=>{if(!confirm('إزالة الطالبة من هذا الفصل فقط؟ لن يُحذف حسابها من مدار.'))return;await request('remove_student',{class_id:cid,student_id:sid});await showStudents(cid);});
window.mbPortfolio=(cid,sid)=>run(()=>showPortfolio(cid,sid));
async function showPortfolio(cid,sid){activeClass=cid;activeStudent=sid;const [d,details]=await Promise.all([request('portfolio',null,{class_id:cid,student_id:sid}),request('class',null,{id:cid})]);const canUpload=!!num(details.permissions.can_upload);
 const rows=d.files.map(f=>`<div class="mb-person"><div><strong>${esc(f.file_name)}</strong><small>${esc(f.subject||'عام')} · ${esc(f.author)} · ${Math.ceil(num(f.file_size)/1024)} كيلوبايت</small></div><div class="mb-actions"><a class="mb-btn mb-outline" href="board-download.php?id=${num(f.id)}">تنزيل آمن</a>${details.is_admin||num(f.uploaded_by)===num(me?.id)?btn('حذف',`mbDeleteFile(${cid},${sid},${num(f.id)})`,'quiet'):''}</div></div>`).join('');
 render(head('ملف إنجاز '+d.student.display_name,'مجلد واحد للطالبة تشارك فيه المعلمات حسب الصلاحيات',btn('قائمة الطالبات',`mbStudents(${cid})`,'outline'))+
 box(`<h2>الأعمال والملفات</h2>${rows||empty('لا توجد ملفات للطالبة حتى الآن.')}`)+
 (canUpload?box(`<h2>رفع ملف إلى إنجاز الطالبة</h2><p class="mb-help">يسمح بصور PNG/JPG/WebP وPDF حتى 10 ميغابايت. تحفظ الملفات بعيدًا عن المجلد العام.</p><form id="mbFileForm" class="mb-form"><label>المادة الدراسية<input name="subject" placeholder="الرياضيات" maxlength="85"></label><label>الملف<input type="file" name="file" accept=".png,.jpg,.jpeg,.webp,.pdf" required></label><div class="mb-full"><button class="mb-btn">رفع الملف</button></div></form>`):''));
 if(canUpload)form('mbFileForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=e.target;const data=new FormData(f);data.append('class_id',cid);data.append('student_id',sid);await request('upload',data);await showPortfolio(cid,sid);});};
}
window.mbDeleteFile=(cid,sid,id)=>run(async()=>{if(!confirm('نقل الملف إلى المحذوفات؟'))return;await request('delete_file',{file_id:id});await showPortfolio(cid,sid);});
window.mbFiles=cid=>run(()=>showClassFiles(cid));
async function showClassFiles(cid){activeClass=cid;const [details,files]=await Promise.all([request('class',null,{id:cid}),request('files',null,{class_id:cid})]);const canUpload=!!num(details.permissions.can_upload);
 const rows=files.items.map(f=>`<div class="mb-person"><div><strong>${esc(f.file_name)}</strong><small>${esc(f.subject||'عام')} · ${esc(f.author||'إدارة المدرسة')} · ${Math.ceil(num(f.file_size)/1024)} كيلوبايت</small></div><div class="mb-actions"><a class="mb-btn mb-outline" href="board-download.php?id=${num(f.id)}">تنزيل آمن</a>${details.is_admin||num(f.uploaded_by)===num(me?.id)?btn('حذف',`mbDeleteSharedFile(${cid},${num(f.id)})`,'quiet'):''}</div></div>`).join('');
 render(head('ملفات الفصل المشتركة','مكتبة الفصل العامة؛ ملفات الطالبات الخاصة توجد في ملف إنجاز كل طالبة',btn('العودة للفصل',`mbOpenClass(${cid})`,'outline'))+
 box(`<h2>ملفات الفصل</h2>${rows||empty('لم تُضف ملفات عامة للفصل حتى الآن.')}`)+
 (canUpload?box(`<h2>رفع ملف عام للفصل</h2><form id="mbGeneralUpload" class="mb-form"><label>المادة<input name="subject" maxlength="85"></label><label>الملف<input name="file" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" required></label><div class="mb-full"><button class="mb-btn">رفع للفصل</button></div></form>`):''));
 if(canUpload)form('mbGeneralUpload').onsubmit=e=>{e.preventDefault();run(async()=>{const data=new FormData(e.target);data.append('class_id',cid);await request('upload',data);await showClassFiles(cid);});};
}
window.mbDeleteSharedFile=(cid,id)=>run(async()=>{if(!confirm('نقل الملف للمحذوفات؟'))return;await request('delete_file',{file_id:id});await showClassFiles(cid);});
window.mbTeachers=cid=>run(()=>showTeachers(cid));
async function showTeachers(cid){activeClass=cid;const data=await request('teachers',null,{class_id:cid});const rows=data.members.map(m=>`<div class="mb-person"><div><strong>${esc(m.name)}</strong><small>${esc(m.specialty||'التخصص غير محدد')} · ${esc(m.subject||'المادة غير محددة')} · ${esc(m.grade_scope||'الصف غير محدد')} · ${num(m.approved)?'معتمدة':'تحتاج اعتمادًا'}</small><small>${['can_post','can_upload','can_manage_students','can_manage_posts'].filter(k=>num(m[k])).map(k=>({can_post:'نشر',can_upload:'إدارة ملفات مادتها',can_manage_students:'طالبات',can_manage_posts:'إدارة المنشورات'}[k])).join(' · ')||'مشاهدة فقط'}</small></div><div class="mb-actions">${btn('تعديل التخصص والصلاحيات',`mbEditRights(${cid},${num(m.teacher_id)})`,'outline')}${btn('سحب الصلاحية',`mbRevoke(${cid},${num(m.teacher_id)})`,'quiet')}</div></div>`).join('');
 const options=data.teachers.map(t=>`<option value="${num(t.id)}">${esc(t.name)} (${esc(t.email)})</option>`).join('');
 render(head('إدارة صلاحيات الفصل','اعتماد تخصص ومادة المعلمة وصلاحياتها في هذا الفصل',btn('العودة للفصل',`mbOpenClass(${cid})`,'outline'))+(data.identity_conflicts?box('تعذر ربط '+numberFmt(data.identity_conflicts)+' حساب بسبب تعارض بريد إلكتروني. راجعيه في مدار قبل منحه صلاحية.'):'')+
 box(`<h2>المعلمات المخوّلات</h2>${rows||empty('لا توجد معلمات مخوّلات بعد.')}`)+
 box(`<h2>اعتماد معلمة في الفصل</h2><p class="mb-help">تُجلب الحسابات النشطة مباشرة من مدار. حددي التخصص والمادة والصف والصلاحيات الخاصة بهذا الفصل.</p><form id="mbTeacherForm" class="mb-form"><label class="mb-full">المعلمة<select name="teacher_id" required>${options}</select></label><label>التخصص<input name="specialty" required maxlength="100" placeholder="رياضيات"></label><label>المادة في هذا الفصل<input name="subject" required maxlength="85" placeholder="رياضيات"></label><label>المرحلة / الصف<input name="grade_scope" value="${esc((await request('class',null,{id:cid})).class.grade)}" required maxlength="100"></label><fieldset class="mb-full"><legend>الصلاحيات</legend><label><input type="checkbox" name="can_post"> نشر على الجدار</label><label><input type="checkbox" name="can_upload"> رفع وإدارة ملفات مادتها</label><label><input type="checkbox" name="can_manage_posts"> إدارة منشورات الفصل</label></fieldset><div class="mb-full"><button class="mb-btn">حفظ واعتماد المعلمة</button></div></form>`));
 form('mbTeacherForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=e.target;await request('assign_teacher',{class_id:cid,teacher_id:num(input(f,'teacher_id')),can_post:f.elements.can_post.checked,can_upload:f.elements.can_upload.checked,can_manage_students:false,can_manage_posts:f.elements.can_manage_posts.checked,specialty:input(f,'specialty'),subject:input(f,'subject'),grade_scope:input(f,'grade_scope')});await showTeachers(cid);});};
}
window.mbEditRights=(cid,tid)=>run(async()=>{const data=await request('teachers',null,{class_id:cid});const m=data.members.find(x=>num(x.teacher_id)===tid);if(!m)return;const names=[['can_post','النشر'],['can_upload','إدارة ملفات مادتها'],['can_manage_posts','إدارة المنشورات']];const changes={};for(const [key,label] of names)changes[key]=confirm('تفعيل صلاحية '+label+' لهذه المعلمة؟');changes.specialty=prompt('التخصص المهني',m.specialty||'');if(changes.specialty===null)return;changes.subject=prompt('المادة المخصصة لهذا الفصل',m.subject||'');if(changes.subject===null)return;changes.grade_scope=prompt('المرحلة / الصف',m.grade_scope||'');if(changes.grade_scope===null)return;await request('assign_teacher',{class_id:cid,teacher_id:tid,...changes});await showTeachers(cid);});
window.mbRevoke=(cid,tid)=>run(async()=>{if(!confirm('سحب صلاحيات هذه المعلمة من الفصل فورًا دون حذف بياناتها؟'))return;await request('revoke_teacher',{class_id:cid,teacher_id:tid,confirmed:true});await showTeachers(cid);});
window.mbAudit=()=>run(async()=>{const r=await request('audit');render(head('سجل إدارة لوحتي','أحدث 100 عملية مسجلة',btn('الرئيسية','mbHome()','outline'))+box(r.items.map(i=>`<div class="mb-person"><div><strong>${esc(i.actor)}</strong><small>${esc(i.event_type)} · ${esc(i.entity_type)} · ${esc(i.happened_at)}</small></div></div>`).join('')||empty('لا توجد عمليات مسجلة.')));});
window.mbUI={esc,num,box,btn,head,request,run,form,input,render,home:showOverview,clearClass:()=>{activeClass=null;classTitle='';activeFolder=null;}};
})();

myBoardScreen=function(){window.boardStart();};

window.mbPendingStudents=()=>window.mbManagePending();
