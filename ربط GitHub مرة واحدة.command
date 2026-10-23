#!/bin/zsh
export PATH='/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin:/usr/bin:/bin:/usr/sbin:/sbin'
export GIT_EXEC_PATH='/Applications/GitHub Desktop.app/Contents/Resources/app/git/libexec/git-core'
'/Applications/GitHub Desktop.app/Contents/Resources/app/git/libexec/git-core/git-credential-manager' github login --browser
result=$?
read '?اضغطي Enter للإغلاق: '
exit $result
