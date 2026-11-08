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

## Why the previous index step was not a delivery

Telling Aiden to place an already downloaded file is not a create. CopyFromBox does not guarantee no-clobber, and a preflight listing is not an atomic create. The index is created by `deliver_external_index.py`. Its payload is the 945 index bytes. The program writes those bytes with an exclusive open and reads them back on the same handle. It does not execute the JSON.

Git blob of that program, which does not change when this document changes:

```text
7894bc5b84c769994a324d98a1faaf464b4b31a9
```

## 1. Stop check, then clone

One stock Python check, using the interpreter already installed. It does not write the index. If the parent is missing, or any of the three names already has a directory entry, including a dangling link, it exits 3.

```text
& 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B -c "import os,stat,sys; p=r'C:\Users\User\Desktop\AI_RD_IMP'; s=os.lstat(p); assert not stat.S_ISLNK(s.st_mode) and stat.S_ISDIR(s.st_mode); names=['WIN_RUNNER_SOURCE_5f5be6c35bed','WIN_RUNNER_RELEASE_5f5be6c35bed.json','WIN_RUNNER_OPS02_v2']; assert not any(os.path.lexists(os.path.join(p,n)) for n in names); print('ABSENT')"
```

`os.path.lexists` is true for a dangling link. Any exception or a missing parent is a stop. This check is not the create.

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

The worktree receives `tools/windows-local-runner` only. Do not copy the website tree out of Git and do not run it. Do not use `--depth`, or the deliver blob below will be absent.

Confirm the deliver program blob, then create the index. HEAD stays on `5f5be6c`. The program is data-addressed by blob id, so it does not need to be checked out into the worktree.

```text
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed cat-file -t 7894bc5b84c769994a324d98a1faaf464b4b31a9
git -C C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed cat-file blob 7894bc5b84c769994a324d98a1faaf464b4b31a9 | & 'C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe' -B -
```

`cat-file -t` must print `blob`. The Python process prints one JSON object. `size` must be 945, `sha256` must be `0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19`, and `readback` must be `SAME_HANDLE`. If the name already exists, including a dangling link, the exit is 3 and `E_EXISTS`; the existing entry is left as it was. If the write fails after the exclusive create, the partial file stays. Do not delete it and do not run the command again.

A Linux pipe of that blob created the 945-byte file and rejected an existing file, a dangling link, a one-byte payload change, and a failed read-back. Windows Python and this pipe were not run.

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
