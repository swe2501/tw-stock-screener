# WIN-RUNNER-OPS.v2

Isolated NO-MODEL runner. It is not part of the website, not a trainer, and not a dataset check.

The runtime entry is `runner.py`. The delivery entry is `install.py`. Neither one launches a model. `train` is not a task.

## What is pinned

`source_pin.json` hashes `runner.py`, `worker.py`, and `run_config.json`. That file is the runner's sibling integrity check. It is not an external signature and it is not authority for the Git commit.

`install.py` embeds `EXPECTED_SOURCE_PIN_SHA256`. An external release index, stored outside this tree, is the commit and five-file size/SHA record. A copy of `source_pin.json` cannot be used as that index.

## Commands

From a directory that already contains the four runtime files:

```text
python -B runner.py verify --synthetic
python -B runner.py run --synthetic --task normal --campaign demo001 --run-id r001 --store runs
python -B runner.py stop --synthetic --task stoppable --campaign demo001 --store runs
```

Allowed tasks are only `normal`, `failure`, `deadline`, and `stoppable`.

The Windows landing sequence is `docs/BOOTSTRAP.md` and `docs/AIDEN_NATIVE_VERIFY.md`. It checks out commit `5f5be6c35bed7a674a91f19ee5c59fdbc8b281c3` and uses the external index file whose own SHA-256 is `0e5f07d4cfe5f554ecf92f83ce0e02941ba0ad625338ed4c9606daa80abaff19`. A directory without `.git` is not a source. That index digest is not `source_pin.json`.

## Boundaries

A successful run means the inert fixture process returned. It does not mean the dataset is usable, a model may be trained, or Windows was tested. See `docs/LIMITS.md` and `docs/AIDEN_NATIVE_VERIFY.md`.
