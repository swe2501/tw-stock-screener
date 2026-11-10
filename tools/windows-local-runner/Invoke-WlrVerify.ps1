# Fixed NO_MODEL entry. No dynamic command text.
# External commit index is checked by install.py verify-index, not by this process.
param()
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
& $Python -B $Runner verify --synthetic
exit $LASTEXITCODE
