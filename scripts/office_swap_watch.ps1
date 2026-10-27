$p = Get-Process -Id 66728 -ErrorAction SilentlyContinue
while ($p -and -not $p.HasExited) { Start-Sleep -Seconds 60; $p = Get-Process -Id 66728 -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 30
$d = 'C:\Users\User\Desktop\AI_stock\scripts'
Copy-Item "$d\run_daily_job.bat" "$d\run_daily_job.bat.bak_office" -Force
Copy-Item "$d\run_daily_job.bat.next" "$d\run_daily_job.bat" -Force
Remove-Item "$d\run_daily_job.bat.next"
Add-Content "$d\office_swap.log" ("{0} swapped run_daily_job.bat after nightly job ended" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
