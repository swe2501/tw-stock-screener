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

Delivery, after the external index has been compared to the published commit:

```text
python -B install.py verify-index --synthetic --release-index C:\path\outside\release-index.json
python -B install.py install --synthetic --release-index C:\path\outside\release-index.json
```

On this Linux tree, install also requires `--fixture-linux` and `--target`. That flag is not Windows acceptance.

## Boundaries

A successful run means the inert fixture process returned. It does not mean the dataset is usable, a model may be trained, or Windows was tested. See `docs/LIMITS.md` and `docs/AIDEN_NATIVE_VERIFY.md`.
