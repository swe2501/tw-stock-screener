# DRAFT, out-of-repo, for Aiden. Not executed by the box. Adapted from WIN_RUNNER_MVP_BOOTSTRAP_004 (59e58b27...9e28).
# New directories only (_R18_001); the _004 directories are left untouched. -Pin must be the NEW commit that contains
# the R18 payload; 51a761365aa7ecd5e51d1f7fcb9031948412333e does not contain it (its TASKS has no resnet18_preflight -> E_TASK exit 3).
param(
    [Parameter(Mandatory = $true)]
    [string] $Pin
)
if ($Pin -cnotmatch '^[0-9a-f]{40}$') { exit 3 }
if ($Pin -eq '51a761365aa7ecd5e51d1f7fcb9031948412333e') { exit 3 }
$Git = 'C:\Program Files\Git\cmd\git.exe'
$Py = 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
$Base = 'C:\Users\User\Desktop\AI_RD_IMP'
$Stage = Join-Path $Base 'R18_PREFLIGHT_STAGE_001'
$Target = Join-Path $Base 'R18_PREFLIGHT_TARGET_001'
$Log = Join-Path $Base 'R18_PREFLIGHT_LOG_001'
Set-Location -LiteralPath $Base
foreach ($p in @($Stage, $Target, $Log)) { if (Test-Path -LiteralPath $p) { exit 3 } }
& $Git -c core.autocrlf=false -c core.eol=lf clone --no-checkout -- 'https://github.com/swe2501/tw-stock-screener.git' $Stage
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $Git -c core.autocrlf=false -c core.eol=lf -C $Stage checkout --detach $Pin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$head = & $Git -C $Stage rev-parse HEAD
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($head.Trim() -ne $Pin) { exit 3 }
$Runner = Join-Path $Stage 'tools\windows-local-runner'
Set-Location -LiteralPath $Runner
& $Py -B (Join-Path $Runner 'preflight.py') deliver --target $Target
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $Py -B (Join-Path $Runner 'preflight.py') run --root $Target --task resnet18_preflight --campaign r18pf001 --run-id r18pf001a --store r18st --log $Log
exit $LASTEXITCODE
