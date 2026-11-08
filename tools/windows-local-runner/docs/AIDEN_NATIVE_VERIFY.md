# Native verification for Aiden

Windows has not been run. Do not treat a Linux rehearsal as a Windows result. Do not merge or deploy. `pipeline_go` stays false. Do not run a model task.

The runnable source is a new Git worktree at one commit, plus one external index file that is not inside that worktree. The delivered tar has no `.git`. `install.py` stops with `E_GIT_OBJECT` on that tree. Do not unpack the tar and call it the source.

Commit `5f5be6c` still contains an older copy of this file with a commit placeholder and `C:\path\outside`. Detach that commit, then follow the commands on this page.

## Fixed paths

Parent, must already exist, must be a directory, must not be a reparse point:

```text
C:\Users\User\Desktop\AI_RD_IMP
```

These four must have no directory entry yet, including a dangling link. If any entry exists, or the check fails, stop. Do not delete, rename, or retry on another path.

```text
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_ACCEPT_INDEX.py
```

Do not use `C:\Users\User\Desktop\AI型態判斷` or `D:\StockAI`.

## Why the previous index step was not a delivery

Telling Aiden to place an already downloaded file is not a create. CopyFromBox does not guarantee no-clobber, and a preflight listing is not an atomic create. The index is created by `deliver_external_index.py`. Its payload is the 945 index bytes. The program writes those bytes with an exclusive open and reads them back on the same handle. It does not execute the JSON.

The pipe in the withdrawn sequence is not an entry. On Linux Bash, a missing blob was `PIPE:128 0` and `BASH_LAST:0`, with stderr `bad file`, and no index. That measurement is not Windows PowerShell. Python exit 0 is not delivery.

The current writer blob is `dee84c9eba4770d81b7962fae9c5c599e8d13ff7` (5686 bytes, SHA-256 `e807cd25e3fd0d3c868d776405bafab9fe87c36fe322d281b492a31b635a836a`) in commit `a9a55afdfc0b4383d997592ca19f8ab6265be9c3`. Blob `9fa534201e61678698cdc29c8a30edbc00a0f0da` is the previous writer. Without `--dest` on Linux, the repaired writer exits 3 and prints JSON `E_DEST`, not a traceback.

## 1. Stop check, then clone

One stock Python check, using the interpreter already installed. It does not write the index. If the parent is missing, or any of the three names already has a directory entry, including a dangling link, it exits 3.

```text
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B -c "import os,stat,sys; p=r'C:\Users\User\Desktop\AI_RD_IMP'; s=os.lstat(p); assert not stat.S_ISLNK(s.st_mode) and stat.S_ISDIR(s.st_mode); names=['WIN_RUNNER_SOURCE_5f5be6c35bed','WIN_RUNNER_RELEASE_5f5be6c35bed.json','WIN_RUNNER_OPS02_v2','WIN_RUNNER_ACCEPT_INDEX.py']; assert not any(os.path.lexists(os.path.join(p,n)) for n in names); print('ABSENT')"
```

`os.path.lexists` is true for a dangling link. Any exception or a missing parent is a stop. This check is not the create.

## 2. Create the Git source

Git may create a missing parent. The check above must run first. Do not pass `--depth`. A shallow tip will not be this commit once the branch moves. If clone or checkout fails, stop. Do not delete a partial source and do not choose another directory.

Fetch commit `345a3cf160501a8938c8fc81d910172e4be7f294` before detaching runtime. That commit contains the gate blob. Writer commit `a9a55afdfc0b4383d997592ca19f8ab6265be9c3` alone does not. A clone of only `5f5be6c` does not contain the writer. Do not use `--depth`.

```text
git clone --no-checkout --no-hardlinks https://github.com/swe2501/tw-stock-screener.git C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed fetch --no-tags origin 345a3cf160501a8938c8fc81d910172e4be7f294
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed cat-file -t dee84c9eba4770d81b7962fae9c5c599e8d13ff7
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed cat-file -t e471770f12220320453de621f629713c6ff3a5cd
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed cat-file -e 5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3^{commit}
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

`git fetch` of that commit writes `FETCH_HEAD` only. `git log --all` does not read `FETCH_HEAD`, so an empty log does not mean the blob is missing. The gate checks `git rev-parse a9a55afdfc0b4383d997592ca19f8ab6265be9c3:tools/windows-local-runner/deliver_external_index.py`. On Windows it hashes `C:\Program Files\Git\cmd\git.exe` before use. That path, 46968 bytes, and SHA-256 `d90e36cafd656d52984f7546bfcb5b065d73e2e66957c952b7a4a1cd260e8f36` are MLOps-reported metadata, not a parent-run Git test. FileVersion `2.46.1.windows.1` is reported only. Do not pipe `cat-file` into Python and do not use shell `>` to create the gate. PowerShell `>` is `Out-File` and can overwrite; that behavior was read from documentation, not from a Windows run.

The current writer is commit `a9a55afdfc0b4383d997592ca19f8ab6265be9c3`, blob `dee84c9eba4770d81b7962fae9c5c599e8d13ff7`, 5686 bytes, SHA-256 `e807cd25e3fd0d3c868d776405bafab9fe87c36fe322d281b492a31b635a836a`. It records `st_dev`, `st_ino`, and `st_ctime_ns` from the create handle. Handoff is `WIN.RUNNER.INDEX_HANDOFF.v3`. `path_bound_after_close` is false: acceptance covers that open only. The previous writer blob `9fa534201e61678698cdc29c8a30edbc00a0f0da` at `d33b0a41e126cd17c24edd0dd0df10cd302eabbd` is not this writer. The current gate blob is `e471770f12220320453de621f629713c6ff3a5cd`, 11034 bytes, SHA-256 `27599100b8f138da1d3152bfff805891d29d0f576f2485c7e061e1d1e639c8e0`. Commit `a9a55afdfc0b4383d997592ca19f8ab6265be9c3` has the writer and does not have this gate blob. Fetch of `897362e7dd42ff477cb59ace5b04e81b001ea2da` does not contain it. The fixed script is `materialize_pinned_blob.py`. The short launch below is 257 bytes, SHA-256 `d5bb66361fad904fed28792aa4a9e56f1da691052740770ba4a7e1dd77482b51`. It does not contain that script. CopyFromBox is not used to place the script. Windows has not run this launch.

```powershell
Set-Location -LiteralPath 'C:\Users\User\Desktop\AI_RD_IMP'
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B -I -- 'C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed\tools\windows-local-runner\materialize_pinned_blob.py'
```

Stdout must show `transfer_ok` true, `python_starts` 1, `upstream_exit` 0, `index_size` 945, and `index_sha256` `0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19`. Exit 3 stops the sequence. Do not install. An existing index, a dangling link, or an older correct file is `E_EXISTS`: it is left in place and is not this attempt. A missing blob does not start the writer.

The archived pipe result `PIPE:128 0` and `BASH_LAST:0` is Linux Bash, not Windows PowerShell. The runtime outer-suite exit was not in the auditor export. R01 database bytes and the R02 snapshot were not exported. Those limits are not filled in here. Linux gate tests passed. Windows was not run.

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
