#!/bin/zsh
cd -- "${0:A:h}" || exit 1
PYTHON='/Users/abeer/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
if [[ ! -x "$PYTHON" ]]; then
  print 'تعذر العثور على Python الخاص بـCodex. استخدمي GitHub Desktop: Commit ثم Push origin.'
  read '?اضغطي Enter للإغلاق: '; exit 1
fi
"$PYTHON" scripts/github-publish.py --publish
result=$?
read '?اضغطي Enter للإغلاق: '
exit $result
