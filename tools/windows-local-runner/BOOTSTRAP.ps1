param(
    [Parameter(Mandatory = $true)]
    [string] $Pin
)
if ($Pin -cnotmatch '^[0-9a-f]{40}$') { exit 3 }
Set-Location -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP'
if (Test-Path -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE_003') { exit 3 }
if (Test-Path -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_WORK_003') { exit 3 }
& 'C:\Program Files\Git\cmd\git.exe' -c core.autocrlf=false -c core.eol=lf clone --no-checkout -- 'https://github.com/swe2501/tw-stock-screener.git' 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE_003'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& 'C:\Program Files\Git\cmd\git.exe' -c core.autocrlf=false -c core.eol=lf -C 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE_003' checkout --detach $Pin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$head = & 'C:\Program Files\Git\cmd\git.exe' -C 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE_003' rev-parse HEAD
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($head.Trim() -ne $Pin) { exit 3 }
Set-Location -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE_003\tools\windows-local-runner'
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_STAGE_003\tools\windows-local-runner\preflight.py' test --run-id mvp003 --work 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_MVP_WORK_003'
