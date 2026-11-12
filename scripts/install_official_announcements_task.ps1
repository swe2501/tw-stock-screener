param(
 [Parameter(Mandatory=$true)][string]$PythonPath,
 [Parameter(Mandatory=$true)][string]$StateDir
)
$ErrorActionPreference = 'Stop'
$name = 'AI_stock_OfficialAnnouncements'
if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
 throw 'Task already exists. Inspect it before changing; installer never overwrites an existing task.'
}
if ((Get-TimeZone).Id -ne 'Taipei Standard Time') { throw 'Expected Windows timezone Asia/Taipei equivalent.' }
$python = (Resolve-Path -LiteralPath $PythonPath).Path
$runner = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'run_official_announcements.ps1')).Path
if ($python.Contains('"') -or $runner.Contains('"') -or $StateDir.Contains('"')) { throw 'Invalid quoted path' }
$taskArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $runner + '" -PythonPath "' + $python + '" -StateDir "' + $StateDir + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArguments -WorkingDirectory (Split-Path $PSScriptRoot)
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At '07:00'
$template = New-ScheduledTaskTrigger -Once -At '07:00' -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Hours 7 -Minutes 35)
$trigger.Repetition = $template.Repetition
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Official investment-related releases: weekdays 07:00–14:30 Taipei, 5-minute polling. Local normalized cache only; no cloud writes. Computer must be on and user logged in.'
Register-ScheduledTask -TaskName $name -InputObject $task | Select-Object TaskName,State
