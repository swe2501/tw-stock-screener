# Source bootstrap

Current entry is `tools/windows-local-runner/BOOTSTRAP.ps1`. It clones `https://github.com/swe2501/tw-stock-screener.git` into a directory that must not already exist, detaches `bf63410bd013f9980ca8c4cbc274c233c428d078`, checks `git rev-parse HEAD`, then runs `preflight.py` from that checkout with the absolute Python. The pin is that full SHA. It is not a branch name, a short SHA, or `FETCH_HEAD`. The repository is public. No token is embedded. Child stdout and stderr are raw pipe bytes. Windows execution of these lines is `NOT_RUN`. `FIRST_ENTRY.ps1` and `ACQUIRE_FIRST.ps1` are earlier attempts and are not this entry.

# Source bootstrap for commit 5f5be6c

The installer reads local Git objects. A tar archive has no `.git` and cannot be the installer source. This page is the fixed landing sequence for that existing commit. It does not change the five runtime files.

Execution commit, exact:

```text
5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3
```

External index digest, SHA-256 of the index file itself, not of `source_pin.json`:

```text
0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19
```

Size of that index file: 945 bytes. Matching `source_pin.json` to itself is not this digest. Writer blob `9fa534201e61678698cdc29c8a30edbc00a0f0da` is the previous writer. The current writer blob is `7b42097dc3bff8196e686721e255bf4e26c5a741` in commit `4cc6358efbd14f79dc3b21db89b14e8aabd05b02`. It sends the create handle. A copied xattr is not identity. The path is not bound after that handle closes. The gate resolves that commit with `git rev-parse`, not `git log --all`. The short launch is `FIRST_ENTRY.ps1`. It names `materialize_pinned_blob.py` and does not inline it. CopyFromBox is not the placement method.

Paths. The parent must already be a real directory. These three names must not exist yet:

```text
C:\Users\User\Desktop\AI_RD_IMP
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_SOURCE_5f5be6c35bed
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_RELEASE_5f5be6c35bed.json
C:\Users\User\Desktop\AI_RD_IMP\WIN_RUNNER_OPS02_v2
```

Python, absolute:

```text
C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe
```

Linux rehearsal of the Git and installer steps is recorded with the tests. Windows Git, PowerShell, ACL, and this Python path are `NOT_RUN`.

The copy of `AIDEN_NATIVE_VERIFY.md` inside commit `5f5be6c` still contains placeholders. After `checkout --detach` of that commit, follow this page and the pull request, not that older copy. Do not install at a later branch tip with this index: `verify-index` returns `E_COMMIT_MISMATCH` and does not create the leaf.
