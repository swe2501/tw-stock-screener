# Fixed NO_MODEL entry. Four allowlisted tasks. No dynamic command text.
param(
  [Parameter(Mandatory = $true)][ValidateSet('normal', 'failure', 'deadline', 'stoppable')][string]$Task,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$')][string]$Campaign,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$')][string]$RunId,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$')][string]$Store = 'runs'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 5.0
$Version = $PSVersionTable.PSVersion
if ($Version.Major -ne 5 -or $Version.Minor -ne 1 -or $Version.Build -ne 19041 -or $Version.Revision -ne 6456) {
  Write-Error 'E_POWERSHELL_VERSION'
  exit 3
}
$Python = 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe'
if (-not (Test-Path -LiteralPath $Python)) {
  Write-Error 'E_PYTHON_MISSING'
  exit 3
}
$Runner = Join-Path $PSScriptRoot 'runner.py'
& $Python -B $Runner run --synthetic --task $Task --campaign $Campaign --run-id $RunId --store $Store
exit $LASTEXITCODE
