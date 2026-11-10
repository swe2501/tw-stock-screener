# Before and after

v1 bytes are preserved in `docs/v1-prototype/` and were not edited. Research Auditor WIN-RUNNER-AUD-01 rejected that v1 after reproducing R01 and R02. The archived scripts under `docs/auditor-oracles/` still describe v1. Their process exit of 0, when they reproduce both defects, is not a repair result. `known_gaps_v2` full execution was reported `NOT_RUN`; only its AST change was reported. This repository does not rerun those box paths and does not treat them as the v2 pass.

| Case | v1 behavior kept in the archive | v2 requirement |
|---|---|---|
| R01, same columns, no primary key or unique | Two real CLI runs, both exit 0, two launches | First and second calls exit non-zero, no launch, ledger bytes and SQL unchanged, file not deleted |
| R02, config replaced after the first read | `verify` returned deadline 2.0 while the pin still named deadline 1.0 | Return the deadline from the hashed bytes, here 1.0, and report the pin hash of that same snapshot. Do not rewrite the pin. Do not accept 2.0 |
| Normal, failure exit 7, duplicate run id, deadline, owned stop, two controllers | Linux-only limited behavior | Same CLI and the same result fields, still Linux-only |
| Release | No Git commit in v1 | Five-file external index checked against local Git objects before an inbox is created |

The unapplied suggestion in `docs/auditor-oracles/R02-snapshot-suggestion.NOT_APPLIED.patch` was not copied onto v1. v2 uses one snapshot for both the config object and the pin hash, and it adds the schema gate the suggestion did not contain.

The regression command is:

```text
python3 -B tools/windows-local-runner/tests/test_linux_fixture.py
```

That command's own exit 0 means the assertions passed, including the assertion that archived v1 still shows both defects. It is not Auditor acceptance and it is not a Windows result.
