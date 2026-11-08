# Native verification for Aiden

This agent did not log in to the Windows machine, did not create a clone there, and did not install the inbox. Windows execution remains `NOT_RUN` until Aiden runs the steps below and keeps the raw stdout, stderr, and exit code.

Do not run `D:\StockAI\runner\run_train.ps1`. Do not point the inbox at `C:\Users\User\Desktop\AI型態判斷`. Do not set ExecutionPolicy. The managed leaf, and only that leaf, is:

```text
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2
```

Its parent `C:\Users\User\Desktop\AI_RD_IMP` must already be a real directory. The installer does not create the parent. If the leaf exists, stop.

## Trust before any script from this tree runs

1. Read the commit SHA from the pull request, not from a file inside the commit.
2. Fetch objects only. Do not run repository Python yet.

```text
git fetch origin cursor/windows-local-runner-7055
git checkout --detach <40-hex delivery commit from the pull request>
git rev-parse HEAD
```

3. Compare `git rev-parse HEAD` to the pull-request SHA. Then compare `git ls-tree -r HEAD tools/windows-local-runner` and, separately, SHA-256 of these five files to the external release index attached outside the repository:

```text
tools/windows-local-runner/install.py
tools/windows-local-runner/runner.py
tools/windows-local-runner/worker.py
tools/windows-local-runner/run_config.json
tools/windows-local-runner/source_pin.json
```

PowerShell can hash a file with `Get-FileHash -Algorithm SHA256`. Stop if any size or hash differs. `source_pin.json` matching itself is not this check.

4. Only after that comparison:

```text
C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe -B tools\windows-local-runner\install.py verify-index --synthetic --release-index C:\path\outside\release-index.json
C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe -B tools\windows-local-runner\install.py install --synthetic --release-index C:\path\outside\release-index.json
```

The index path must be outside the clone. `verify-index` does not fetch and does not start a worker. `install` creates only the managed leaf and writes the four runtime files. It does not claim a Windows ACL unless the DACL read-back succeeds. Linux mode bits from the fixture are not that proof.

5. One inert run, still not a training run:

```text
C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe -B C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2\runner.py verify --synthetic
C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe -B C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2\runner.py run --synthetic --task normal --campaign demo001 --run-id r001 --store runs
```

Expected on success: runner exit `0`, `result.json` `actual_process_exit` `0`, `pipeline_go` false. Failure of the machine gate, the ACL read-back, the commit, or any hash is a stop, not a prompt to retry with another directory.

The PowerShell files `Invoke-Wlr*.ps1` are fixed entries in Git. They were not executed here. They are not copied into the inbox and they are not part of the five-file release index. Use the Python commands above for the first native check.
