Set-Location -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP'
if (Test-Path -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE') { exit 3 }
& 'C:\Program Files\Git\cmd\git.exe' clone --no-checkout -- 'https://github.com/swe2501/tw-stock-screener.git' 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& 'C:\Program Files\Git\cmd\git.exe' -C 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE' checkout --detach 'PIN_COMMIT_SHA'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$head = & 'C:\Program Files\Git\cmd\git.exe' -C 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE' rev-parse HEAD
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($head.Trim() -ne 'PIN_COMMIT_SHA') { exit 3 }
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE\tools\windows-local-runner\preflight.py' test --run-id mvp001 --work 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_WORK'
