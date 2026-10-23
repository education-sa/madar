/* لوحتي — مجمع مدارس ظليم. A separate module; survey functions remain unchanged. */
(()=>{
'use strict';
let activeClass=null,activeStudent=null,boardInfo=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>Number(x)||0;
const box=(body,extra='')=>`<section class="mb-box ${extra}">${body}</section>`;
const btn=(label,action,variant='')=>`<button type="button" class="mb-btn ${variant}" onclick="${action}">${label}</button>`;
const head=(title,desc,actions='')=>`<header class="mb-heading"><div><small>بوابة مجمع مدارس ظليم / لوحتي</small><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="mb-heading-actions">${actions}</div></header>`;
const numberFmt=n=>new Intl.NumberFormat('ar-SA').format(n||0);
function render(html){portal(`<div class="mb-board">${html}</div>`);}
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
async function showOverview(){activeClass=null;activeStudent=null;boardInfo=await request('overview');
 const cards=boardInfo.classes.map(c=>`<button type="button" class="mb-class" onclick="mbOpenClass(${num(c.id)})"><span class="mb-class-icon">🏫</span><strong>${esc(c.title)}</strong><small>${esc(c.grade)} / ${esc(c.section_name)}</small><span>${numberFmt(c.students_count)} طالبة · ${esc(c.academic_year)}</span>${num(c.is_active)?'':'<em>مؤرشف</em>'}</button>`).join('');
 render(head('لوحتي','الفصول المشتركة بين معلمات مجمع مدارس ظليم',(boardInfo.is_admin?btn('سجل الإدارة','mbAudit()','outline'):''))+
 `<div class="mb-summary">${box(`<strong>${numberFmt(boardInfo.classes.length)}</strong><span>فصل متاح</span>`)}${box('<strong>مدار</strong><span>حسابات موحّدة</span>')}${box('<strong>مشاركة</strong><span>ملفات إنجاز وأنشطة</span>')}</div>`+
 `<div class="mb-section-title"><h2>الفصول الدراسية</h2></div><div class="mb-grid">${cards||empty('لا توجد فصول متاحة لك حاليًا. تستطيع مديرة النظام إنشاء الفصول وتحديد المعلمات المخوّلات.')}</div>`+
 (boardInfo.is_admin?box(`<h2>إضافة فصل مشترك</h2><form id="mbClassForm" class="mb-form"><label>اسم الفصل<input name="title" required maxlength="140" placeholder="الأول متوسط / أ"></label><label>المرحلة والصف<input name="grade" required maxlength="80" placeholder="الأول متوسط"></label><label>الشعبة<input name="section_name" required maxlength="40" placeholder="أ"></label><label>العام الدراسي<input name="academic_year" required maxlength="25" placeholder="1448" value="1448"></label><div class="mb-full"><button class="mb-btn">إنشاء الفصل</button></div></form>`,'mb-wide'):'') );
 if(boardInfo.is_admin)form('mbClassForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=e.target;await request('create_class',{title:input(f,'title'),grade:input(f,'grade'),section_name:input(f,'section_name'),academic_year:input(f,'academic_year')});await showOverview();});};
}
window.mbHome=()=>run(showOverview);
window.mbOpenClass=id=>run(()=>showClass(id));
async function showClass(id){activeClass=id;activeStudent=null;const data=await request('class',null,{id});const c=data.class,rights=data.permissions;const canPost=!!num(rights.can_post),canUpload=!!num(rights.can_upload),canStudents=!!num(rights.can_manage_students),canManage=!!num(rights.can_manage_posts);
 const posts=data.posts.map(p=>box(`<div class="mb-post-meta">${esc(p.author_name||'المدرسة')} · ${esc(p.created_at)}${p.status!=='published'?' · غير منشور':''}</div><h3>${esc(p.title)}</h3><p class="mb-post-content">${esc(p.content)}</p><div class="mb-actions">${btn('التعليقات ('+numberFmt(p.comments_count)+')',`mbOpenComments(${num(p.id)})`,'outline')}${(data.is_admin||canManage||num(p.author_id)===num(me?.id))&&canPost?btn('تعديل',`mbEditPost(${num(p.id)})`,'outline'):''}${canManage&&p.status==='published'?btn('إخفاء',`mbStatusPost(${num(p.id)},'hidden')`,'quiet'):''}${canManage&&p.status!=='published'?btn('نشر',`mbStatusPost(${num(p.id)},'published')`,'quiet'):''}</div>`,'mb-post')).join('');
 const nav=`<div class="mb-tabs">${btn('طالبات الفصل',`mbStudents(${id})`,'outline')}${btn('ملفات الفصل',`mbFiles(${id})`,'outline')}${data.is_platform_owner?btn('اعتماد المعلمات والمواد',`mbTeachers(${id})`,'outline'):' '}</div>`;
 render(head(c.title,`${c.grade} / ${c.section_name} · العام الدراسي ${c.academic_year}`,btn('جميع الفصول','mbHome()','outline'))+nav+
 (canPost?box(`<h2>منشور جديد على الجدار</h2><form id="mbPostForm" class="mb-form"><label class="mb-full">عنوان المنشور<input name="title" required maxlength="170" placeholder="نشاط اليوم"></label><label class="mb-full">التفاصيل<textarea name="content" required rows="3" maxlength="7000"></textarea></label><div class="mb-full"><button class="mb-btn">نشر على جدار الفصل</button></div></form>`):'')+
 `<div class="mb-section-title"><h2>جدار الفصل</h2><span>أحدث المنشورات</span></div>${posts||empty('لم تنشر المعلمات أي مشاركات في هذا الفصل بعد.')}`+
 (data.is_admin?box(btn(num(c.is_active)?'أرشفة الفصل':'إعادة فتح الفصل',`mbArchive(${id},${num(c.is_active)?0:1})`,'quiet')):'') );
 if(canPost)form('mbPostForm').onsubmit=e=>{e.preventDefault();run(async()=>{const f=e.target;await request('new_post',{class_id:id,title:input(f,'title'),content:input(f,'content')});await showClass(id);});};
}
window.mbArchive=(id,on)=>run(async()=>{if(!confirm(on?'إعادة فتح الفصل؟':'أرشفة الفصل ومنع الوصول إليه للمعلمات؟'))return;await request('archive_class',{class_id:id,is_active:!!on,confirmed:true});await showOverview();});
window.mbEditPost=id=>run(async()=>{const c=await request('class',null,{id:activeClass});const p=c.posts.find(x=>num(x.id)===id);if(!p)return;const title=prompt('عنوان المنشور',p.title);if(title===null)return;const content=prompt('المحتوى',p.content);if(content===null)return;await request('edit_post',{post_id:id,title,content});await showClass(activeClass);});
window.mbStatusPost=(id,status)=>run(async()=>{await request('set_post_status',{post_id:id,status});await showClass(activeClass);});
window.mbOpenComments=id=>run(async()=>{
 const [c,r]=await Promise.all([request('class',null,{id:activeClass}),request('comments',null,{post_id:id})]);
 const p=c.posts.find(x=>num(x.id)===id);if(!p)return;
 render(head('تعليقات المنشور',p.title,btn('العودة للجدار',`mbOpenClass(${activeClass})`,'outline'))+
 box(r.items.map(x=>`<div class="mb-person"><div><strong>${esc(x.author)}</strong><p>${esc(x.body)}</p><small>${esc(x.created_at)}</small></div></div>`).join('')||empty('لا توجد تعليقات بعد.'))+
 (p.status==='published'?box(`<form id="mbCommentForm" class="mb-form"><label class="mb-full">اكتبي تعليقك<textarea name="body" rows="3" maxlength="1500" required></textarea></label><div class="mb-full"><button class="mb-btn">إضافة تعليق</button></div></form>`):''));
 if(p.status==='published')form('mbCommentForm').onsubmit=e=>{e.preventDefault();run(async()=>{await request('comment',{post_id:id,body:input(e.target,'body')});window.mbOpenComments(id);});};
});
window.mbStudents=id=>run(()=>showStudents(id));
async function showStudents(id){activeClass=id;const [students,details]=await Promise.all([request('students',null,{class_id:id}),request('class',null,{id})]);const admin=details.is_admin;const canManage=!!admin;
 const rows=students.items.map(s=>`<div class="mb-person"><div><strong>${esc(s.display_name)}</strong>${admin?`<small>رقم مدار: ${num(s.madar_student_id)} · ${s.entry_mode==='school_only'?'بوابة المجمع فقط':'مدار + المجمع'}</small>`:''}</div><div class="mb-actions">${btn('ملف الإنجاز',`mbPortfolio(${id},${num(s.id)})`,'outline')}${admin?btn('إعادة تعيين كلمة المرور',`mbResetStudentPassword(${id},${num(s.id)})`,'outline'):''}${canManage?btn('إخراج من الفصل',`mbRemoveStudent(${id},${num(s.id)})`,'quiet'):''}</div></div>`).join('');
 render(head('طالبات الفصل',details.class.title,btn('العودة للفصل',`mbOpenClass(${id})`,'outline'))+
 box(`<h2>القائمة المشتركة (${numberFmt(students.items.length)})</h2><p class="mb-help">الطالبة التي تدرس عند أكثر من معلمة تظهر هنا مرة واحدة حسب رقم حسابها في مدار.</p>${rows||empty('لم تُربط طالبات بهذا الفصل بعد.')}`)+
 (canManage?box(`<h2>إضافة طالبة موجودة في مدار</h2><p class="mb-help">اكتبي رقم حساب الطالبة الحقيقي في مدار. لا تعتمدي على الاسم وحده، ولا تُنشئي حسابًا جديدًا للطالبة.</p><form id="mbStudentForm" class="mb-form"><label>رقم حساب الطالبة في مدار<input name="madar_student_id" inputmode="numeric" pattern="[1-9][0-9]*" required></label><div class="mb-full"><button class="mb-btn">ربط الطالبة بالفصل</button></div></form>`):'')+
 (admin?box(`<h2>إضافة طالبة جديدة</h2><p class="mb-help">يُنشأ حساب واحد في مدار ويُربط بالفصل. الدخول المبدئي لبوابة ظليم فقط؛ توسعة وصول مدار من المالكة.</p><form id="mbNewStudentForm" class="mb-form"><label>اسم الطالبة<input name="name" required maxlength="140" autocomplete="off"></label><label>إيميل منصة مدرستي<input name="email" type="email" required placeholder="name@mkhg.moe.gov.sa" autocomplete="off"></label><label>المرحلة<select name="stage" required><option>ابتدائي</option><option>متوسط</option><option>ثانوي</option></select></label><label>كلمة مرور مؤقتة<input name="password" type="password" required minlength="10" autocomplete="new-password"></label><div class="mb-full"><button class="mb-btn">إضافة الطالبة وربط حسابها</button></div></form>`):''));
 if(admin)form('mbNewStudentForm').onsubmit=e=>{e.preventDefault();const f=e.target;run(async()=>{await request('create_student',{class_id:id,name:input(f,'name'),email:input(f,'email'),stage:input(f,'stage'),password:f.elements.password.value});await showStudents(id);});};
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
})();

myBoardScreen=function(){window.boardStart();};
