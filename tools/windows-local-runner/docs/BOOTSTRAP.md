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

Size of that index file: 945 bytes. Matching `source_pin.json` to itself is not this digest. The old writer blob `7894bc5b84c769994a324d98a1faaf464b4b31a9` is not this repair. The writer blob remains `9fa534201e61678698cdc29c8a30edbc00a0f0da`. Fetch of that commit updates `FETCH_HEAD` only. The gate resolves the writer with `git rev-parse` of commit `d33b0a41e126cd17c24edd0dd0df10cd302eabbd`, not `git log --all`. The first entry is installed Python in `materialize_pinned_blob.py`, not shell `>`.

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
