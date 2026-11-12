param(
 [Parameter(Mandatory=$true)][string]$PythonPath,
 [Parameter(Mandatory=$true)][string]$StateDir
)
$ErrorActionPreference = 'Stop'
$collector = Join-Path $PSScriptRoot 'official_announcements.py'
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
$env:PYTHONIOENCODING = 'utf-8'
$log = Join-Path $StateDir ('collector-' + (Get-Date -Format 'yyyy-MM-dd') + '.log')
try {
  "START $(Get-Date -Format o)" | Out-File -LiteralPath $log -Append -Encoding utf8
  & $PythonPath $collector --state-dir $StateDir 2>&1 | Out-File -LiteralPath $log -Append -Encoding utf8
  $result = $LASTEXITCODE
  # Created only after explicit shared-DB approval. Absent marker means local-only.
  $cloudConfig = Join-Path $StateDir 'cloud-sync-approved.json'
  if (Test-Path -LiteralPath $cloudConfig) {
    $config = Get-Content -LiteralPath $cloudConfig -Raw | ConvertFrom-Json
    $publisher = Join-Path $PSScriptRoot 'publish_official_announcements.py'
    & $PythonPath $publisher --state-dir $StateDir --env-file $config.env_file --apply 2>&1 | Out-File -LiteralPath $log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { $result = $LASTEXITCODE }
  }
  "END $(Get-Date -Format o) exit=$result" | Out-File -LiteralPath $log -Append -Encoding utf8
  # Only our own dated log files; no recursive file removal.
  Get-ChildItem -LiteralPath $StateDir -Filter 'collector-????-??-??.log' -File |
    Where-Object LastWriteTime -LT (Get-Date).AddDays(-30) |
    Remove-Item
  exit $result
} catch {
  "FAILED $(Get-Date -Format o) type=$($_.Exception.GetType().Name)" | Out-File -LiteralPath $log -Append -Encoding utf8
  exit 2
}
