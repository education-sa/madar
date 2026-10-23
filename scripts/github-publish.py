#!/usr/bin/env python3
"""Manual GitHub-only publishing. Default is read-only inspection; --publish asks first."""
import argparse, datetime, os, pathlib, re, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
BUNDLE=pathlib.Path('/Applications/GitHub Desktop.app/Contents/Resources/app/git')
GIT=str(BUNDLE/'bin/git')
ENV=os.environ.copy();ENV['GIT_EXEC_PATH']=str(BUNDLE/'libexec/git-core');ENV['PATH']=str(BUNDLE/'bin')+':'+ENV.get('PATH','');ENV['GIT_TERMINAL_PROMPT']='0'
REMOTE='https://github.com/education-sa/madar.git'
def git(*args,ok=True,data=None):
 p=subprocess.run([GIT,*args],cwd=ROOT,env=ENV,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if ok and p.returncode:raise RuntimeError(p.stderr.decode(errors='replace').strip() or 'Git failed')
 return p

def paths(*args):return [x.decode('utf-8') for x in git(*args).stdout.split(b'\0') if x]
def denied(path):
 p=pathlib.PurePosixPath(path);name=p.name.lower();parts=[x.lower() for x in p.parts]
 if name in ('.htaccess','.gitignore','.gitkeep'):return False
 return (name.startswith('.env') and name!='.env.example' or name in ('error_log','config.php','credentials.json','id_rsa','id_ed25519') or any(x in parts for x in ('uploads','backups','node_modules','.agents','.continue')) or path.startswith(('storage/private/','surveys/storage/')) or p.suffix.lower() in ('.log','.sqlite','.sqlite3','.db','.pem','.p12','.key','.zip','.tar','.gz','.sql.gz') or name.endswith(('.bak','.sql.bak')))
PATTERNS=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'\bgh[pousr]_[A-Za-z0-9]{30,}',rb'\bgithub_pat_[A-Za-z0-9_]{40,}',rb'\bAKIA[0-9A-Z]{16}\b',rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{35,}',rb'\$2[aby]\$[0-9]{2}\$[A-Za-z0-9./]{53}',rb'(?i)\b(?:DB_PASS(?:WORD)?|FTP_PASSWORD|SMTP_PASSWORD)\s*[=:]\s*[\'\"]?(?![\'\"]?(?:$|\n|\r|\'|\"|example|change|your|placeholder|<|\$|\?))[^\s\'\"]{6,}']

def inspect(names,ref=None):
 problems=[]
 for name in names:
  if denied(name):problems.append(name+' — ملف إعدادات/بيانات محظور');continue
  p=git('show',(':'+name) if ref==':' else ref+':'+name,ok=False) if ref else None
  if p and p.returncode:continue
  file=ROOT/name
  if not ref and file.is_symlink():problems.append(name+' — رابط رمزي يحتاج مراجعة');continue
  if not ref and not file.is_file():continue
  data=p.stdout if ref else file.read_bytes()
  if len(data)>3*1024*1024:problems.append(name+' — ملف كبير يحتاج مراجعة');continue
  if any(re.search(pattern,data) for pattern in PATTERNS):problems.append(name+' — محتوى يشبه سرًا أو كلمة مرور محفوظة')
  if name.endswith('.sql') and re.search(rb'(?is)INSERT\s+INTO\s+`?(?:students|teachers|owners|ms_responses|results|platform_users)`?\s*(?:\([^;]*?\))?\s*VALUES',data):problems.append(name+' — بيانات حسابات أو نتائج داخل SQL')
 if problems:raise RuntimeError('توقف الرفع لمراجعة هذه الملفات (لم تُعرض أسرارها):\n'+'\n'.join(problems))

def baseline():
 if git('remote','get-url','origin').stdout.decode().strip().removesuffix('.git')!=REMOTE.removesuffix('.git'):raise RuntimeError('المستودع لا يطابق education-sa/madar')
 if git('branch','--show-current').stdout.strip()!=b'main':raise RuntimeError('الرفع مُعد للفرع main فقط؛ راجعي الفرع أولًا.')
 if paths('diff','--name-only','--diff-filter=U','-z'):raise RuntimeError('توجد تعارضات غير محلولة.')
 if paths('ls-files','--deleted','-z') or paths('diff','--cached','--name-only','--diff-filter=D','-z'):raise RuntimeError('توجد عمليات حذف؛ راجعيها يدويًا قبل الرفع.')

def fetch_check():
 git('fetch','--no-tags','origin','main')
 ahead,behind=map(int,git('rev-list','--left-right','--count','HEAD...origin/main').stdout.split())
 if behind:raise RuntimeError('وصلت تحديثات جديدة إلى GitHub. توقفت دون دمج أو استبدال ملفاتك. راجعي Fetch/Pull في GitHub Desktop أولًا.')
 return ahead

def history_check():
 for rev in git('rev-list','origin/main..HEAD').stdout.decode().split():
  names=paths('diff-tree','--no-commit-id','--name-only','--diff-filter=AMR','-r','-z',rev)
  inspect(names,rev)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--publish',action='store_true');ap.add_argument('--staged',action='store_true');ap.add_argument('--pre-push',action='store_true');a=ap.parse_args()
 if a.staged:
  if paths('diff','--cached','--name-only','--diff-filter=D','-z'):raise RuntimeError('عمليات الحذف تحتاج مراجعة يدوية وموافقة.')
  inspect(paths('diff','--cached','--name-only','--diff-filter=AMR','-z'),':');print('Secret checks passed.');return
 baseline()
 if a.pre_push:
  for line in sys.stdin:
   lr,ls,rr,rs=line.split()
   if rr!='refs/heads/main' or ls=='0'*40 or ls!=git('rev-parse','HEAD').stdout.decode().strip():raise RuntimeError('هذه الحماية تسمح بتحديث main فقط دون حذف فرع.')
  fetch_check();history_check();return
 ahead=fetch_check();history_check()
 names=sorted(set(paths('ls-files','--modified','--others','--exclude-standard','-z')+paths('diff','--cached','--name-only','--diff-filter=AMR','-z')))
 inspect(names)
 if names:print('الملفات الجاهزة للمراجعة:\n'+'\n'.join(names))
 print(f'الفحص نجح: {len(names)} ملفًا، و{ahead} commit محليًا بانتظار الرفع. لم يتم رفع شيء.')
 if not a.publish:return
 if not names and not ahead:print('لا توجد تحديثات للرفع.');return
 title=input('رسالة التحديث (Enter لرسالة مؤرخة واضحة): ').strip() or 'تحديث مدار وظليم — '+datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
 if input('بعد مراجعة الملفات، اكتبي «رفع» لإنشاء Commit ثم Push إلى GitHub: ').strip()!='رفع':print('تم الإلغاء دون Commit أو Push.');return
 # Recheck remote and content immediately before the explicit action.
 fetch_check();inspect(names)
 if names:
  git('add','--',*names);inspect(paths('diff','--cached','--name-only','--diff-filter=AMR','-z'),':')
  git('diff','--cached','--check');git('commit','-m',title)
 fetch_check();history_check();git('push','origin','HEAD:refs/heads/main');print('تم الرفع إلى GitHub بنجاح.')
if __name__=='__main__':
 try:main()
 except (RuntimeError,KeyboardInterrupt,EOFError) as e:
  print('\nتوقف بأمان: '+str(e),file=sys.stderr)
  print('لا يوجد Force Push أو حذف. إذا فشل توثيق GitHub بعد Commit، استخدمي Push origin في GitHub Desktop؛ الـCommit محفوظ محليًا.',file=sys.stderr);sys.exit(1)
