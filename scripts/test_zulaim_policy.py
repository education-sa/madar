import json,urllib.request,urllib.error,http.cookiejar,subprocess
BASE='http://127.0.0.1:18743';PHP='/Applications/MAMP/bin/php/php8.4.17/bin/php';ROOT='.'
class Client:
 def __init__(self):self.jar=http.cookiejar.CookieJar();self.op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar));self.csrf='';self.ms=''
 def req(self,path,data=None,method=None,ms=False,code=200):
  h={};b=None
  if data is not None:b=json.dumps(data).encode();h={'Content-Type':'application/json','X-CSRF-Token':self.ms if ms else self.csrf}
  req=urllib.request.Request(BASE+path,data=b,headers=h,method=method or ('POST' if data is not None else 'GET'))
  try:r=self.op.open(req);s=r.status;raw=r.read().decode()
  except urllib.error.HTTPError as e:s=e.code;raw=e.read().decode()
  assert s==code,(path,s,raw[:600]);
  try:return json.loads(raw)
  except:return raw
 def login(self,role,email):
  d=self.req('/api/'+role+'/login',{'email':email,'password':'TestOnly-Password-726!'});self.csrf=d['csrfToken'];return d
 def survey(self):d=self.req('/surveys/public/api.php?op=session');self.ms=d['csrf'];return d
 def board(self,op,data=None,**params):return self.req('/surveys/public/board-api.php?op='+op+''.join('&'+k+'='+str(v) for k,v in params.items()),data,ms=True)
owner=Client();owner.login('owner','test-owner@example.test');owner.survey()
a=Client();a.login('teacher','math@mkhg.moe.gov.sa');a.survey();b=Client();b.login('teacher','science@mkhg.moe.gov.sa');b.survey();first=Client();first.login('teacher','first@mkhg.moe.gov.sa');first.survey();st=Client();st.login('student','student@mkhg.moe.gov.sa')
def setting(kind,id,mode='both',enabled=True,ft=False):return owner.req('/api/owner/portal/'+kind+'/'+str(id),{'access_mode':mode,'portal_enabled':enabled,'first_teacher':ft,'confirmed':True},method='PUT')
# Seed after native login to avoid any implicit grants from names or email.
for id in [9001,9002,9003]:setting('teacher',id)
setting('student',9001);setting('platform',9001)
# Take a data fingerprint before exercising scopes and permissions.
def fingerprint():
 script="""<?php $p=new PDO('mysql:unix_socket=/private/tmp/madar-zulaim-test.sock;dbname=madar_zulaim_test','root','');$out=[];foreach(['owners','teachers','students','classes','ms_surveys','ms_templates','ms_responses'] as $t){$out[$t]=$p->query('SELECT * FROM '.$t.' ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);}echo hash('sha256',json_encode($out));"""
 return subprocess.run([PHP],input=script,text=True,capture_output=True,check=True).stdout
before_data=fingerprint()
# Matrices are enforced server side, including direct API requests.
for mode,allowed in [('madar_only',False),('portal_only',True),('both',True)]:
 setting('teacher',9001,mode,mode!='madar_only')
 d=a.req('/api/portal/access');assert d['allowed']==allowed
 if mode=='portal_only':a.req('/api/teacher/data/classes',code=403)
 elif mode=='both':assert isinstance(a.req('/api/teacher/data/classes'),list)
 if not allowed:a.req('/surveys/public/board-api.php?op=overview',code=403)
print('PASS: three access modes and direct API enforcement')
setting('teacher',9001)
# First teacher is orthogonal to native roleCode.
setting('teacher',9003,ft=True);assert first.req('/api/teacher/me')['roleCode']=='TEACHER'
assert first.board('overview')['is_first_teacher']
a.req('/api/owner/portal/teacher',code=403)
first.req('/api/owner/portal/teacher/9002',{'access_mode':'both','portal_enabled':True,'first_teacher':True,'confirmed':True},method='PUT',code=403)
first.req('/surveys/public/board-api.php?op=set_first_teacher',{'teacher_id':9001,'enabled':True},ms=True,code=404)
print('PASS: only real owner can grant school roles; native RBAC unchanged')
c=first.board('create_class',{'title':'Test shared school class','grade':'أول متوسط','section_name':'أ','academic_year':'1448'})['id']
# IDs in mb_* are projections, never guessed from native IDs.
msids={}
for cl,name in [(a,'a'),(b,'b')]:msids[name]=cl.survey()['user']['id']
for tid,subject in [(msids['a'],'رياضيات'),(msids['b'],'علوم')]:first.board('assign_teacher',{'class_id':c,'teacher_id':tid,'specialty':subject,'subject':subject,'grade_scope':'أول متوسط','can_upload':True,'can_post':True})
first.board('add_student',{'class_id':c,'madar_student_id':9001})
first.board('add_student',{'class_id':c,'madar_student_id':9001})
rows=first.board('students',class_id=c)['items'];assert len(rows)==1;sid=rows[0]['id']
a.req('/surveys/public/board-api.php?op=assign_teacher',{'class_id':c,'teacher_id':msids['b'],'subject':'رياضيات','specialty':'رياضيات'},ms=True,code=403)
first.req('/surveys/public/board-api.php?op=create_class',{'title':'Different title, same class','grade':'أول متوسط','section_name':'أ','academic_year':'1448'},ms=True,code=409)
# Add harmless fixture files to the isolated database; test all read and delete paths.
setup="""<?php $p=new PDO('mysql:unix_socket=/private/tmp/madar-zulaim-test.sock;dbname=madar_zulaim_test','root','');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$q=$p->prepare('INSERT INTO mb_files(class_id,student_id,subject,file_name,storage_name,mime,file_size,uploaded_by_student) VALUES (?,?,?,?,?,?,?,?)');foreach(['رياضيات','علوم'] as $i=>$sub){$q->execute([%d,%d,$sub,'test-'.$i.'.pdf',str_repeat((string)($i+1),48),'application/pdf',10,%d]);} ?>"""%(c,sid,sid)
subprocess.run([PHP],input=setup,text=True,check=True,capture_output=True)
fa=a.board('portfolio',class_id=c,student_id=sid)['files'];fb=b.board('portfolio',class_id=c,student_id=sid)['files'];assert len(fa)==len(fb)==1;assert fa[0]['subject']=='رياضيات';assert fb[0]['subject']=='علوم'
a.req('/surveys/public/board-download.php?id='+str(fb[0]['id']),code=403)
a.req('/surveys/public/board-api.php?op=delete_file',{'file_id':fb[0]['id']},ms=True,code=403)
print('PASS: two subjects in one shared class; roster deduplicated; cross-subject read/download/delete denied')
d=st.req('/surveys/public/board-student-api.php?op=home');assert len(d['classes'])==1
subjects=st.req('/surveys/public/board-student-api.php?op=class&id='+str(c))['subjects'];assert set(subjects)=={'رياضيات','علوم'}
print('PASS: unified student session and approved subject folders')
# Exercise actual student multipart upload and immediate visibility in the right subject.
def upload(subject,expected=200):
 boundary='----MadarTestBoundary';parts=[]
 for key,val in [('class_id',str(c)),('subject',subject)]:parts.append('--'+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"\r\n\r\n'+val+'\r\n')
 parts.append('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="work.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\nTest-only student work\r\n--'+boundary+'--\r\n')
 req=urllib.request.Request(BASE+'/surveys/public/board-student-api.php?op=upload',data=''.join(parts).encode(),headers={'Content-Type':'multipart/form-data; boundary='+boundary,'X-CSRF-Token':d['csrf']})
 try:res=st.op.open(req);code=res.status;raw=res.read().decode()
 except urllib.error.HTTPError as e:code=e.code;raw=e.read().decode()
 assert code==expected,(code,raw)
upload('رياضيات');upload('Unapproved subject',403)
assert len(a.board('portfolio',class_id=c,student_id=sid)['files'])==2
assert len(b.board('portfolio',class_id=c,student_id=sid)['files'])==1
print('PASS: real file upload appears immediately; unapproved subject denied')
# Parents and students use all three modes without obtaining teacher administration.
for kind,id,client,basepath in [('student',9001,st,'/api/student/dashboard/summary')]:
 for mode in ['madar_only','portal_only','both']:
  setting(kind,id,mode,mode!='madar_only');assert client.req('/api/portal/access')['allowed']==(mode!='madar_only')
  if mode=='portal_only':client.req(basepath,code=403)
 setting(kind,id)
parent=Client();pd=parent.req('/api/parent/login',{'firstName':'Test','lastName':'Parent','password':'TestOnly-Password-726!'});parent.csrf=pd['csrfToken']
for mode in ['madar_only','portal_only','both']:
 setting('platform',9001,mode,mode!='madar_only');assert parent.req('/api/portal/access')['allowed']==(mode!='madar_only')
setting('platform',9001)
parent.req('/api/owner/portal/teacher',code=403)
parent.req('/surveys/public/board-api.php?op=overview',code=403)
st.req('/surveys/public/board-api.php?op=overview',code=403)
owner.req('/api/owner/portal/student/9001',{'access_mode':'both','portal_enabled':True,'first_teacher':True,'confirmed':True},method='PUT',code=422)
print('PASS: student/parent mode matrices and no teacher administrative privileges')
# Revocation requires confirmation and is effective in the existing session immediately.
owner.req('/api/owner/portal/teacher/9003',{'access_mode':'both','portal_enabled':True,'first_teacher':False},method='PUT',code=409)
setting('teacher',9003,ft=False);assert not first.board('overview')['is_admin']
first.req('/surveys/public/board-api.php?op=create_class',{'title':'Denied','grade':'x','section_name':'x','academic_year':'1448'},ms=True,code=403)
setting('teacher',9002,'both',False);b.req('/surveys/public/board-api.php?op=overview',code=403)
assert owner.req('/api/owner/portal/audit')['items']
print('PASS: confirmation, immediate role/access revocation, owner audit')
assert fingerprint()==before_data
print('PASS: original accounts, password hashes, native classes, surveys, templates and results unchanged')
print('ALL INTEGRATION TESTS PASSED')
