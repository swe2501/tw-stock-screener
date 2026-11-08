# Native verification for Aiden

Windows has not been run. Do not treat a Linux rehearsal as a Windows result. Do not merge or deploy. `pipeline_go` stays false. Do not run a model task.

The runnable source is a new Git worktree at one commit, plus one external index file that is not inside that worktree. The delivered tar has no `.git`. `install.py` stops with `E_GIT_OBJECT` on that tree. Do not unpack the tar and call it the source.

Commit `5f5be6c` still contains an older copy of this file with a commit placeholder and `C:\path\outside`. Detach that commit, then follow the commands on this page.

## Fixed paths

Parent, must already exist, must be a directory, must not be a reparse point:

```text
C:\Users\User\Desktop\AI_RD_IMP
```

These three must have no directory entry yet. If any entry exists, or the listing fails, stop. Do not delete, rename, or retry on another path.

```text
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2
```

Do not use `C:\Users\User\Desktop\AI型態判斷` or `D:\StockAI`.

## 1. Stop check, then place the already delivered index

`$DeliveredIndex` is the only operator path. It must be the already delivered `release-index.json` asset, 945 bytes, SHA-256 `0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19`. Do not build that file from `source_pin.json`, from the tar, or by typing JSON.

```powershell
$ErrorActionPreference = 'Stop'
$parent = 'C:\Users\User\Desktop\AI_RD_IMP'
$source = 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed'
$index = 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json'
$leaf = 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2'
$DeliveredIndex = '<the already delivered release-index.json>'
$parentItem = Get-Item -LiteralPath $parent -Force
if (-not $parentItem.PSIsContainer -or ($parentItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { Write-Error 'E_PARENT_STOP'; exit 3 }
$names = @(Split-Path -Leaf $source), (Split-Path -Leaf $index), (Split-Path -Leaf $leaf)
$present = @(Get-ChildItem -Force -LiteralPath $parent | Where-Object { $names -contains $_.Name })
if ($present.Count -ne 0) { Write-Error 'E_EXISTS_STOP'; exit 3 }
[System.IO.File]::Copy($DeliveredIndex, $index, $false)
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $index).Hash.ToLowerInvariant()
if ($hash -ne '0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19') { Write-Error 'E_INDEX_DIGEST_STOP'; exit 3 }
```

`File.Copy` with `$false` does not overwrite. If the hash check fails, leave the file and stop. Do not delete it and do not copy again.

This PowerShell block was not executed on Windows here.

## 2. Create the Git source

Git may create a missing parent. The check above must run first. Do not pass `--depth`. A shallow tip will not be this commit once the branch moves. If clone or checkout fails, stop. Do not delete a partial source and do not choose another directory.

```text
git clone --filter=blob:none --sparse --no-checkout https://github.com/swe2501/tw-stock-screener.git C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed sparse-checkout set --cone tools/windows-local-runner
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed checkout --detach 5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD
```

`rev-parse HEAD` must print exactly `5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3`. Then these blob ids must match before any repository Python runs:

```text
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/install.py
5cdfd24bf985573febe877be82adb24ea3df3bbd
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/runner.py
079d7d832f507558f4ee585389ffc64fbfada17b
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/worker.py
e0ff01aae364236c0b77c1a03af30599af605836
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/run_config.json
d80e8e79fd50c1cf1cecc3ecacec85b74958dad1
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed rev-parse HEAD:tools/windows-local-runner/source_pin.json
7d640de56b002fecee6a465e8a694a481bd0a917
```

The worktree receives `tools/windows-local-runner` only. Do not copy the website tree out of Git and do not run it.

A Linux sparse clone of the same objects reached this commit, `verify-index` exited 0, and a second clone into the occupied path exited 128 without replacing it. That was not Windows.

## 3. Installer and one inert run

```text
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed\tools\windows-local-runner\install.py' verify-index --synthetic --release-index 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json'
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed\tools\windows-local-runner\install.py' install --synthetic --release-index 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json'
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2\runner.py' verify --synthetic
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2\runner.py' run --synthetic --task normal --campaign demo001 --run-id r001 --store runs
```

Expected exits are 0, 0, 0, 0. `result.json` must show `actual_process_exit` 0 and `pipeline_go` false. The Windows install also requires Python 3.14.5, Git 2.46.1, machine `O211102`, and a DACL read-back. Any miss stops. A failed install leaves the partial leaf. Do not delete it and do not try another leaf.

One negative control, only after that normal run exited 0. This is not a retry of a failed command:

```text
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2\runner.py' run --synthetic --task normal --campaign demo001 --run-id r002 --store runs
```

Expected exit is 3 and `E_DUPLICATE_STICKY_NO_RETRY`. There must be no second worker. Do not run `stop` in this pass. Do not run the `Invoke-Wlr*.ps1` files. They are not in the five-file index.
